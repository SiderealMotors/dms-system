-- ============================================================================
-- Adds REVERSED to the journal_status enum.
--
-- Run this BEFORE scripts/010_accounting_compliance.sql.
--
-- This is a separate file because ALTER TYPE ... ADD VALUE cannot run inside a
-- transaction block, and the main migration is deliberately transactional.
-- Apply with:  npx tsx scripts/run-sql.ts --no-transaction scripts/010a_journal_status_enum.sql
--
-- Posted entries are never deleted or silently mutated; they are marked
-- REVERSED and offset by a dated reversing entry, which is what an audit trail
-- requires. DRAFT and POSTED alone cannot express that.
--
-- Safe to run more than once.
-- ============================================================================

ALTER TYPE journal_status ADD VALUE IF NOT EXISTS 'REVERSED';
