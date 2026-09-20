-- ============================================================================
-- Net reversal pairs out of reporting
--
-- A reversal writes a mirror-image entry and marks the original REVERSED. The
-- original then drops out of POSTED reports, but its POSTED mirror does not --
-- so a raw trial balance double-subtracts: it removes the mirror's amounts
-- without the original they were meant to cancel. The result looks like
-- accounts running negative when the books are in fact fine.
--
-- Fix: give every mirror a reversal_of_entry_id back-link, then teach the
-- reporting views to exclude mirrors. Reversed originals are already excluded
-- because they are no longer POSTED. Both stay in the ledger for audit; they
-- are only omitted from aggregate reporting.
--
-- Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Backfill reversal_of_entry_id on mirrors created before posting.ts set it.
--
-- The original carries reversed_by_entry_id -> mirror, so the inverse link is
-- a straightforward join. Only fills rows that are still null.
-- ---------------------------------------------------------------------------
UPDATE journal_entries mirror
SET reversal_of_entry_id = orig.id
FROM journal_entries orig
WHERE orig.reversed_by_entry_id = mirror.id
  AND mirror.reversal_of_entry_id IS NULL;

-- ---------------------------------------------------------------------------
-- Per-entry balance view. Unchanged in shape, but now exposes the reversal
-- linkage so a reader can tell reversed originals and mirrors apart. It still
-- lists EVERY entry (imbalance detection must see reversals too).
--
-- These views are dropped and recreated (not CREATE OR REPLACE) because we are
-- adding/reordering columns, which REPLACE cannot do. v_reporting_line_items
-- is dropped first in case anything depends on the others.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS v_reporting_line_items;
DROP VIEW IF EXISTS v_trial_balance;
DROP VIEW IF EXISTS v_journal_entry_balance;

CREATE VIEW v_journal_entry_balance AS
SELECT
  je.id,
  je.entry_number,
  je.entry_date,
  je.status,
  je.description,
  je.reversed_by_entry_id,
  je.reversal_of_entry_id,
  (je.reversal_of_entry_id IS NOT NULL) AS is_reversal_mirror,
  COALESCE(SUM(li.debit), 0)  AS total_debit,
  COALESCE(SUM(li.credit), 0) AS total_credit,
  ROUND(COALESCE(SUM(li.debit), 0) - COALESCE(SUM(li.credit), 0), 2) AS difference,
  COUNT(li.id) AS line_count
FROM journal_entries je
LEFT JOIN journal_line_items li ON li.journal_entry_id = je.id
GROUP BY je.id, je.entry_number, je.entry_date, je.status, je.description,
         je.reversed_by_entry_id, je.reversal_of_entry_id;

COMMENT ON VIEW v_journal_entry_balance IS
  'Per-entry debit/credit totals for ALL entries. difference <> 0 or line_count = 0 is a defect. is_reversal_mirror flags the offsetting half of a reversal.';

-- ---------------------------------------------------------------------------
-- Trial balance: POSTED activity that is NOT a reversal mirror. Because the
-- reversed original is already non-POSTED, dropping the mirror nets the pair
-- to zero -- exactly as if the reversed entry had never been posted.
-- ---------------------------------------------------------------------------
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
      AND je.reversal_of_entry_id IS NULL
GROUP BY ga.id, ga.code, ga.name, ga.account_type, ga.normal_balance
ORDER BY ga.code;

COMMENT ON VIEW v_trial_balance IS
  'Balances across POSTED, non-reversal-mirror entries. Reversed pairs net out. Sum of debits must equal sum of credits.';

-- ---------------------------------------------------------------------------
-- Reporting helper: the set of line items that count toward live balances.
-- Application code should aggregate from here rather than re-deriving the
-- "POSTED and not a mirror" rule in every query.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_reporting_line_items AS
SELECT
  li.id,
  li.journal_entry_id,
  li.account_id,
  li.debit,
  li.credit,
  li.memo,
  je.entry_date,
  je.entry_number
FROM journal_line_items li
JOIN journal_entries je ON je.id = li.journal_entry_id
WHERE je.status = 'POSTED'
  AND je.reversal_of_entry_id IS NULL;

COMMENT ON VIEW v_reporting_line_items IS
  'Line items that count toward live balances: POSTED and not a reversal mirror. Reversed originals are excluded because they are not POSTED.';
