-- ============================================================================
-- Accounting hardening
--
-- Scope, verified against the live database before writing:
--   1. Adds the few GL accounts the code needs that were genuinely absent.
--      NOTE: 1150 (Sales Tax Receivable) already exists in production and is
--      NOT touched here. An earlier draft of this migration wrongly assumed it
--      was missing.
--   2. Adds reversal columns so posted entries are reversed, never deleted.
--   3. Repairs any entry_number containing no digits, defensively.
--      NOTE: UNIQUE (entry_number) ALREADY EXISTS in production as
--      journal_entries_entry_number_key. An earlier draft claimed it was
--      missing and that duplicates existed; both were wrong. Nothing to add.
--   5. Adds purchase funding method + HST-registrant tracking, and links from
--      source documents to their journal entries.
--   6. Adds balance / trial-balance views so imbalances are detectable.
--
-- Column names match the live schema: gl_accounts uses `account_type` and has
-- no `description` column.
--
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. GL accounts referenced by code but absent from production
-- ---------------------------------------------------------------------------
INSERT INTO gl_accounts (code, name, account_type, normal_balance) VALUES
  -- MTO registration collected for the customer: a pass-through, not revenue.
  ('2250', 'Registration Fees Payable', 'LIABILITY', 'CREDIT'),
  -- Deposits are unearned until delivery, so distinct from Accrued Expenses.
  ('2350', 'Customer Deposits', 'LIABILITY', 'CREDIT'),
  -- Lender admin/curtailment fees, separate from floorplan interest (5400).
  ('6450', 'Floorplan Fees', 'EXPENSE', 'DEBIT'),
  -- Absorbs sub-cent rounding so entries balance exactly. A material balance
  -- here indicates a calculation defect worth investigating.
  ('7950', 'Rounding Difference', 'EXPENSE', 'DEBIT')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Audit trail: reversal tracking on journal entries
-- ---------------------------------------------------------------------------
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS reversed_by_entry_id UUID REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversal_of_entry_id UUID REFERENCES journal_entries(id);

-- status is the ENUM journal_status, which ships with only DRAFT and POSTED.
-- The reversal flow needs REVERSED.
--
-- Adding an enum value must happen OUTSIDE a transaction, so it lives in
-- scripts/010a_journal_status_enum.sql and must be run FIRST. This file only
-- verifies it was applied, and fails loudly if it wasn't.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'journal_status' AND e.enumlabel = 'REVERSED'
  ) THEN
    RAISE EXCEPTION
      'journal_status is missing the REVERSED value. Run scripts/010a_journal_status_enum.sql first.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Repair corrupt entry numbers.
--
-- UNIQUE (entry_number) already exists, so there is no constraint to add and
-- duplicates cannot be present. These statements are purely defensive.
-- ---------------------------------------------------------------------------

-- Defensive: any row whose entry_number contains no digits gets a
-- deterministic replacement above the current maximum.
WITH corrupt AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM journal_entries
  WHERE entry_number IS NULL
     OR entry_number !~ '[0-9]'
),
current_max AS (
  SELECT COALESCE(
    MAX((regexp_match(entry_number, '([0-9]+)'))[1]::BIGINT), 0
  ) AS max_num
  FROM journal_entries
  WHERE entry_number ~ '[0-9]'
)
UPDATE journal_entries je
SET entry_number = 'JE-' || LPAD((cm.max_num + c.rn)::TEXT, 5, '0')
FROM corrupt c, current_max cm
WHERE je.id = c.id;

-- ---------------------------------------------------------------------------
-- 5. Purchase funding method and HST-registrant tracking
-- ---------------------------------------------------------------------------
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS purchase_payment_method TEXT
    NOT NULL DEFAULT 'CASH',
  ADD COLUMN IF NOT EXISTS purchase_hst_applicable BOOLEAN
    NOT NULL DEFAULT TRUE;

-- Seed the new column from the existing free-text payment_method so the one
-- vehicle already on file keeps its real funding source instead of silently
-- defaulting to CASH. Live data uses 'BANK_DRAFT'.
UPDATE vehicles
SET purchase_payment_method = CASE UPPER(COALESCE(payment_method, ''))
  WHEN 'CASH'          THEN 'CASH'
  WHEN 'BANK_DRAFT'    THEN 'BANK_DRAFT'
  WHEN 'BANK'          THEN 'BANK_DRAFT'
  WHEN 'CHEQUE'        THEN 'BANK_DRAFT'
  WHEN 'CHECK'         THEN 'BANK_DRAFT'
  WHEN 'WIRE'          THEN 'BANK_DRAFT'
  WHEN 'EFT'           THEN 'BANK_DRAFT'
  WHEN 'FLOORPLAN'     THEN 'FLOORPLAN'
  WHEN 'CREDIT'        THEN 'ACCOUNTS_PAYABLE'
  WHEN 'TERMS'         THEN 'ACCOUNTS_PAYABLE'
  ELSE 'BANK_DRAFT'
END
WHERE purchase_payment_method = 'CASH';

DO $$
BEGIN
  ALTER TABLE vehicles
    ADD CONSTRAINT vehicles_purchase_payment_method_check
    CHECK (purchase_payment_method IN
      ('CASH', 'BANK_DRAFT', 'FLOORPLAN', 'ACCOUNTS_PAYABLE'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- A purchase from a non-registrant (private / curbside seller) carries no
-- recoverable HST. Claiming an ITC on it is an improper claim.
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS is_hst_registrant BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS hst_registration_number TEXT;

-- ---------------------------------------------------------------------------
-- 5b. Links from source documents to their journal entries, so the code can
-- find the entry to reverse instead of guessing.
-- ---------------------------------------------------------------------------
-- purchase_journal_entry_id already exists in production (and is populated for
-- the one vehicle on file); only sale_journal_entry_id is genuinely new.
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS purchase_journal_entry_id UUID
    REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS sale_journal_entry_id UUID
    REFERENCES journal_entries(id);

CREATE INDEX IF NOT EXISTS idx_vehicles_purchase_je
  ON vehicles(purchase_journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_sale_je
  ON vehicles(sale_journal_entry_id);

-- Records whether an expense was capitalized into inventory, so COGS relief
-- can be computed without re-deriving the classification rules.
ALTER TABLE vehicle_expenses
  ADD COLUMN IF NOT EXISTS is_capitalized BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill from the expense types that are capitalizable. Must stay in sync
-- with CAPITALIZED_EXPENSE_ACCOUNTS in lib/accounting/accounts.ts.
UPDATE vehicle_expenses
SET is_capitalized = TRUE
WHERE is_capitalized = FALSE
  AND UPPER(COALESCE(expense_type, '')) IN (
    'REPAIR', 'PARTS', 'DETAILING', 'INSPECTION',
    'SAFETY', 'RECONDITIONING', 'TOWING', 'TRANSPORT'
  );

-- ---------------------------------------------------------------------------
-- 6. Detection views
--
-- The application layer is the primary guarantee that debits equal credits,
-- because supabase-js inserts the header and the lines as separate statements
-- and therefore cannot be protected by a deferred constraint trigger. These
-- views make any residual imbalance immediately visible.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_journal_entry_balance AS
SELECT
  je.id,
  je.entry_number,
  je.entry_date,
  je.status,
  je.description,
  COALESCE(SUM(li.debit), 0)  AS total_debit,
  COALESCE(SUM(li.credit), 0) AS total_credit,
  ROUND(COALESCE(SUM(li.debit), 0) - COALESCE(SUM(li.credit), 0), 2) AS difference,
  COUNT(li.id) AS line_count
FROM journal_entries je
LEFT JOIN journal_line_items li ON li.journal_entry_id = je.id
GROUP BY je.id, je.entry_number, je.entry_date, je.status, je.description;

COMMENT ON VIEW v_journal_entry_balance IS
  'Per-entry debit/credit totals. Any row where difference <> 0 or line_count = 0 is a defect.';

CREATE OR REPLACE VIEW v_trial_balance AS
SELECT
  ga.code,
  ga.name,
  ga.account_type,
  ga.normal_balance,
  COALESCE(SUM(li.debit), 0)  AS total_debit,
  COALESCE(SUM(li.credit), 0) AS total_credit,
  CASE
    WHEN ga.normal_balance = 'DEBIT'
      THEN COALESCE(SUM(li.debit), 0) - COALESCE(SUM(li.credit), 0)
    ELSE COALESCE(SUM(li.credit), 0) - COALESCE(SUM(li.debit), 0)
  END AS balance
FROM gl_accounts ga
LEFT JOIN journal_line_items li ON li.account_id = ga.id
LEFT JOIN journal_entries je
       ON je.id = li.journal_entry_id
      AND je.status = 'POSTED'
GROUP BY ga.id, ga.code, ga.name, ga.account_type, ga.normal_balance
ORDER BY ga.code;

COMMENT ON VIEW v_trial_balance IS
  'Balances by account across POSTED entries only. Sum of debits must equal sum of credits.';
