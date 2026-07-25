-- ============================================================================
-- Accounting compliance remediation
--
-- Fixes, in order:
--   1. Adds the GL accounts the application code references but that were
--      never seeded. The missing 1150 HST Receivable is why every purchase
--      entry was out of balance by exactly the tax amount: the code looked it
--      up, got undefined, skipped the debit line, but still credited cash for
--      the tax-inclusive total.
--   2. Adds audit-trail columns so posted entries can be reversed instead of
--      deleted and recreated.
--   3. Adds a UNIQUE constraint on entry_number so concurrent posts cannot
--      produce duplicates (this is what caused the duplicate JE-00002).
--   4. Repairs "JE-00NaN" entry numbers left by the old parseInt bug.
--   5. Adds purchase funding method + HST-registrant tracking.
--   6. Adds balance / trial-balance views so imbalances are detectable.
--
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Missing GL accounts
-- ---------------------------------------------------------------------------
INSERT INTO gl_accounts (code, name, type, normal_balance, description) VALUES
  ('1150', 'HST Receivable (ITC)', 'ASSET', 'DEBIT',
   'Input tax credits on purchases, recoverable from CRA'),
  ('2250', 'Registration Fees Payable', 'LIABILITY', 'CREDIT',
   'MTO registration collected on the customer''s behalf - agency pass-through, not revenue'),
  ('6450', 'Floorplan Fees', 'EXPENSE', 'DEBIT',
   'Floorplan administration and curtailment fees'),
  ('7950', 'Rounding Difference', 'EXPENSE', 'DEBIT',
   'Sub-cent rounding residuals absorbed to keep entries balanced')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Audit trail: reversal tracking on journal entries
-- ---------------------------------------------------------------------------
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS reversed_by_entry_id UUID REFERENCES journal_entries(id),
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

-- Allow the REVERSED / VOID states used by the reversal flow.
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'journal_entries'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE journal_entries DROP CONSTRAINT %I', con_name);
  END IF;

  ALTER TABLE journal_entries
    ADD CONSTRAINT journal_entries_status_check
    CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED', 'VOID'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 3 & 4. Repair corrupt entry numbers, then enforce uniqueness
-- ---------------------------------------------------------------------------

-- Any row whose entry_number contains no digits (e.g. 'JE-00NaN') gets a
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

-- De-duplicate any repeated entry numbers before adding the constraint,
-- keeping the earliest row unchanged.
WITH dupes AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY entry_number ORDER BY created_at) AS rn
  FROM journal_entries
),
current_max AS (
  SELECT COALESCE(
    MAX((regexp_match(entry_number, '([0-9]+)'))[1]::BIGINT), 0
  ) AS max_num
  FROM journal_entries
  WHERE entry_number ~ '[0-9]'
)
UPDATE journal_entries je
SET entry_number = 'JE-' || LPAD((cm.max_num + d.rn)::TEXT, 5, '0')
FROM dupes d, current_max cm
WHERE je.id = d.id
  AND d.rn > 1;

DO $$
BEGIN
  ALTER TABLE journal_entries
    ADD CONSTRAINT journal_entries_entry_number_key UNIQUE (entry_number);
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Purchase funding method and HST-registrant tracking
-- ---------------------------------------------------------------------------
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS purchase_payment_method TEXT
    NOT NULL DEFAULT 'CASH',
  ADD COLUMN IF NOT EXISTS purchase_hst_applicable BOOLEAN
    NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  ALTER TABLE vehicles
    ADD CONSTRAINT vehicles_purchase_payment_method_check
    CHECK (purchase_payment_method IN ('CASH', 'FLOORPLAN', 'ACCOUNTS_PAYABLE'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- A purchase from a non-registrant (private / curbside seller) carries no
-- recoverable HST. Claiming an ITC on it is an improper claim.
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS is_hst_registrant BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS hst_registration_number TEXT;

-- ---------------------------------------------------------------------------
-- 5b. Links from source documents to their journal entries
--
-- Without these the code cannot find the entry to reverse, so it fell back to
-- deleting and recreating history.
-- ---------------------------------------------------------------------------
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

-- Backfill from the expense types that are capitalizable.
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
  ga.type,
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
GROUP BY ga.id, ga.code, ga.name, ga.type, ga.normal_balance
ORDER BY ga.code;

COMMENT ON VIEW v_trial_balance IS
  'Balances by account across POSTED entries only. Sum of debits must equal sum of credits.';
