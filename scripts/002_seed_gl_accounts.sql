-- Seed GL Accounts for the Dealer Management System
-- These are the standard chart of accounts for a car dealership

-- Asset Accounts (1000s)
INSERT INTO gl_accounts (code, name, type, normal_balance, description) VALUES
('1000', 'Cash', 'ASSET', 'DEBIT', 'Cash on hand and in bank accounts'),
('1010', 'Accounts Receivable', 'ASSET', 'DEBIT', 'Money owed by customers'),
('1100', 'Vehicle Inventory', 'ASSET', 'DEBIT', 'Vehicles held for sale'),
('1200', 'Parts Inventory', 'ASSET', 'DEBIT', 'Parts and accessories inventory'),
('1500', 'Equipment', 'ASSET', 'DEBIT', 'Office and shop equipment'),
('1600', 'Accumulated Depreciation', 'ASSET', 'CREDIT', 'Accumulated depreciation on equipment');

-- Liability Accounts (2000s)
INSERT INTO gl_accounts (code, name, type, normal_balance, description) VALUES
('2000', 'Accounts Payable', 'LIABILITY', 'CREDIT', 'Money owed to vendors'),
('2100', 'Floorplan Payable', 'LIABILITY', 'CREDIT', 'Vehicle floorplan financing'),
('2200', 'Sales Tax Payable', 'LIABILITY', 'CREDIT', 'HST/GST collected'),
('2300', 'Accrued Expenses', 'LIABILITY', 'CREDIT', 'Expenses incurred but not yet paid'),
('2500', 'Notes Payable', 'LIABILITY', 'CREDIT', 'Bank loans and notes');

-- Equity Accounts (3000s)
INSERT INTO gl_accounts (code, name, type, normal_balance, description) VALUES
('3000', 'Owner Capital', 'EQUITY', 'CREDIT', 'Owner investment in the business'),
('3100', 'Retained Earnings', 'EQUITY', 'CREDIT', 'Accumulated profits'),
('3200', 'Owner Draws', 'EQUITY', 'DEBIT', 'Owner withdrawals');

-- Revenue Accounts (4000s)
INSERT INTO gl_accounts (code, name, type, normal_balance, description) VALUES
('4000', 'Vehicle Sales', 'REVENUE', 'CREDIT', 'Revenue from vehicle sales'),
('4100', 'Safety Certification Revenue', 'REVENUE', 'CREDIT', 'Revenue from safety certifications'),
('4200', 'Warranty Revenue', 'REVENUE', 'CREDIT', 'Revenue from warranties sold'),
('4300', 'OMVIC Fee Revenue', 'REVENUE', 'CREDIT', 'OMVIC fees collected from customers'),
('4400', 'Parts Sales', 'REVENUE', 'CREDIT', 'Revenue from parts sales'),
('4500', 'Service Revenue', 'REVENUE', 'CREDIT', 'Revenue from service work'),
('4900', 'Other Income', 'REVENUE', 'CREDIT', 'Miscellaneous income');

-- Expense Accounts (5000s and 6000s)
INSERT INTO gl_accounts (code, name, type, normal_balance, description) VALUES
('5000', 'Cost of Goods Sold', 'EXPENSE', 'DEBIT', 'Cost of vehicles sold'),
('5100', 'Safety Costs', 'EXPENSE', 'DEBIT', 'Safety certification costs'),
('5200', 'Warranty Costs', 'EXPENSE', 'DEBIT', 'Warranty claim costs'),
('5300', 'Reconditioning Costs', 'EXPENSE', 'DEBIT', 'Vehicle reconditioning expenses'),
('5400', 'Parts Cost', 'EXPENSE', 'DEBIT', 'Cost of parts sold'),
('6000', 'Advertising', 'EXPENSE', 'DEBIT', 'Marketing and advertising expenses'),
('6100', 'Bank Charges', 'EXPENSE', 'DEBIT', 'Bank fees and charges'),
('6200', 'Commissions', 'EXPENSE', 'DEBIT', 'Sales commissions paid'),
('6300', 'Depreciation', 'EXPENSE', 'DEBIT', 'Depreciation expense'),
('6400', 'Floorplan Interest', 'EXPENSE', 'DEBIT', 'Interest on floorplan financing'),
('6500', 'Fuel Expense', 'EXPENSE', 'DEBIT', 'Gasoline for inventory vehicles'),
('6600', 'Insurance', 'EXPENSE', 'DEBIT', 'Business insurance'),
('6700', 'Office Expense', 'EXPENSE', 'DEBIT', 'Office supplies and expenses'),
('6800', 'Professional Fees', 'EXPENSE', 'DEBIT', 'Legal, accounting, consulting'),
('6900', 'Rent', 'EXPENSE', 'DEBIT', 'Facility rent'),
('7000', 'Repairs & Maintenance', 'EXPENSE', 'DEBIT', 'Facility maintenance'),
('7100', 'Referral Fees', 'EXPENSE', 'DEBIT', 'Referral payments'),
('7200', 'Salaries & Wages', 'EXPENSE', 'DEBIT', 'Employee compensation'),
('7300', 'Telephone & Internet', 'EXPENSE', 'DEBIT', 'Communication expenses'),
('7400', 'Utilities', 'EXPENSE', 'DEBIT', 'Electricity, water, etc.'),
('7500', 'OMVIC Fees', 'EXPENSE', 'DEBIT', 'OMVIC licensing fees paid'),
('7900', 'Miscellaneous Expense', 'EXPENSE', 'DEBIT', 'Other expenses')
ON CONFLICT (code) DO NOTHING;
