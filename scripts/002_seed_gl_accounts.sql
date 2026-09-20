-- Chart of accounts.
--
-- GENERATED FROM THE LIVE gl_accounts TABLE, which is authoritative.
-- The previous version of this file had drifted from production: it used the
-- same codes for different accounts (e.g. 1100 as Vehicle Inventory when live
-- 1100 is Accounts Receivable), so a fresh clone built a chart that silently
-- misfiled every entry. Keep this file in sync with lib/accounting/accounts.ts.
--
-- 46 accounts.

INSERT INTO gl_accounts (code, name, account_type, normal_balance) VALUES
  ('1000', 'Cash', 'ASSET', 'DEBIT'),
  ('1010', 'Bank Account - Operating', 'ASSET', 'DEBIT'),
  ('1020', 'Bank Account - Reserve', 'ASSET', 'DEBIT'),
  ('1100', 'Accounts Receivable', 'ASSET', 'DEBIT'),
  ('1150', 'Sales Tax Receivable', 'ASSET', 'DEBIT'),
  ('1200', 'Vehicle Inventory', 'ASSET', 'DEBIT'),
  ('1210', 'Vehicle Inventory - Safety Costs', 'ASSET', 'DEBIT'),
  ('1220', 'Vehicle Inventory - Reconditioning', 'ASSET', 'DEBIT'),
  ('1300', 'Parts Inventory', 'ASSET', 'DEBIT'),
  ('1400', 'Prepaid Expenses', 'ASSET', 'DEBIT'),
  ('1500', 'Prepaid Expenses', 'ASSET', 'DEBIT'),
  ('2000', 'Accounts Payable', 'LIABILITY', 'CREDIT'),
  ('2100', 'Floor Plan Payable', 'LIABILITY', 'CREDIT'),
  ('2200', 'Sales Tax Payable', 'LIABILITY', 'CREDIT'),
  ('2250', 'Registration Fees Payable', 'LIABILITY', 'CREDIT'),
  ('2300', 'Accrued Expenses', 'LIABILITY', 'CREDIT'),
  ('2350', 'Customer Deposits', 'LIABILITY', 'CREDIT'),
  ('2400', 'OMVIC Fees Payable', 'LIABILITY', 'CREDIT'),
  ('3000', 'Owners Equity', 'EQUITY', 'CREDIT'),
  ('3100', 'Retained Earnings', 'EQUITY', 'CREDIT'),
  ('3200', 'Owner Draws', 'EQUITY', 'DEBIT'),
  ('4000', 'Vehicle Sales Revenue', 'REVENUE', 'CREDIT'),
  ('4100', 'Parts Sales Revenue', 'REVENUE', 'CREDIT'),
  ('4200', 'Service Revenue', 'REVENUE', 'CREDIT'),
  ('4300', 'Finance Income', 'REVENUE', 'CREDIT'),
  ('4400', 'Trade-In Revenue', 'REVENUE', 'CREDIT'),
  ('4500', 'Other Revenue', 'REVENUE', 'CREDIT'),
  ('5000', 'Cost of Vehicles Sold', 'EXPENSE', 'DEBIT'),
  ('5100', 'Cost of Parts Sold', 'EXPENSE', 'DEBIT'),
  ('5200', 'Warranty Costs', 'EXPENSE', 'DEBIT'),
  ('5300', 'Reconditioning Costs', 'EXPENSE', 'DEBIT'),
  ('5400', 'Floorplan Interest', 'EXPENSE', 'DEBIT'),
  ('6000', 'Salaries and Wages', 'EXPENSE', 'DEBIT'),
  ('6100', 'Rent Expense', 'EXPENSE', 'DEBIT'),
  ('6200', 'Utilities Expense', 'EXPENSE', 'DEBIT'),
  ('6300', 'Advertising Expense', 'EXPENSE', 'DEBIT'),
  ('6400', 'Insurance Expense', 'EXPENSE', 'DEBIT'),
  ('6450', 'Floorplan Fees', 'EXPENSE', 'DEBIT'),
  ('6500', 'Depreciation Expense', 'EXPENSE', 'DEBIT'),
  ('6600', 'Office Supplies', 'EXPENSE', 'DEBIT'),
  ('6700', 'Professional Fees', 'EXPENSE', 'DEBIT'),
  ('6800', 'OMVIC Fees', 'EXPENSE', 'DEBIT'),
  ('6900', 'Other Operating Expenses', 'EXPENSE', 'DEBIT'),
  ('7000', 'Referral Fees', 'EXPENSE', 'DEBIT'),
  ('7100', 'Miscellaneous Expense', 'EXPENSE', 'DEBIT'),
  ('7950', 'Rounding Difference', 'EXPENSE', 'DEBIT')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  account_type = EXCLUDED.account_type,
  normal_balance = EXCLUDED.normal_balance;
