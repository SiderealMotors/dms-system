-- Accounts required to reconstruct the operating bank account from the
-- Scotiabank statements (2024-09-27 .. 2026-08-31).
--
-- Decision (user-directed): the bank statements are the SOLE source of truth
-- for 1010. Economically ambiguous flows land in a suspense account for later
-- reclassification; auction / vehicle-vendor payments land in a vehicle
-- purchases clearing account; bank charges get their own expense account.

INSERT INTO gl_accounts (code, name, account_type, normal_balance, is_active)
VALUES
  -- Auction / vehicle-vendor cash out (ADESA, "600-370 KING STREET WEST").
  -- A clearing/in-transit asset: money spent acquiring vehicles that has not
  -- yet been allocated to a specific tracked unit in inventory.
  ('1250', 'Vehicle Purchases - Unallocated', 'ASSET', 'DEBIT', true),
  -- Holding account for flows whose economic nature is not yet determined
  -- (generic deposits, e-transfers, card/LOC payments, POS purchases, cash
  -- withdrawals). Must be worked down to zero as items are reclassified.
  ('1900', 'Suspense - Bank Reconstruction', 'ASSET', 'DEBIT', true),
  -- Bank service charges, monthly fees, overdraft interest.
  ('6350', 'Bank Charges & Interest', 'EXPENSE', 'DEBIT', true)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      account_type = EXCLUDED.account_type,
      normal_balance = EXCLUDED.normal_balance,
      is_active = true;
