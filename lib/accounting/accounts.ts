/**
 * Canonical chart of accounts.
 *
 * These codes are the single source of truth and MUST match
 * scripts/002_seed_gl_accounts.sql and scripts/010_accounting_compliance.sql.
 *
 * Never inline a bare GL code string in a route. Import from here so that a
 * mismapped or missing account is a compile-time/lookup error rather than a
 * silently dropped journal line.
 */
export const ACCOUNTS = {
  // Assets (1000s)
  CASH: "1000",
  ACCOUNTS_RECEIVABLE: "1010",
  VEHICLE_INVENTORY: "1100",
  HST_RECEIVABLE: "1150",
  PARTS_INVENTORY: "1200",

  // Liabilities (2000s)
  ACCOUNTS_PAYABLE: "2000",
  FLOORPLAN_PAYABLE: "2100",
  HST_PAYABLE: "2200",
  REGISTRATION_PAYABLE: "2250",

  // Revenue (4000s)
  VEHICLE_SALES: "4000",
  SAFETY_REVENUE: "4100",
  WARRANTY_REVENUE: "4200",
  OMVIC_REVENUE: "4300",
  OTHER_INCOME: "4900",

  // Expenses (5000s-7000s)
  COGS: "5000",
  SAFETY_COST: "5100",
  WARRANTY_COST: "5200",
  RECONDITIONING_COST: "5300",
  PARTS_COST: "5400",
  BANK_CHARGES: "6100",
  FLOORPLAN_INTEREST: "6400",
  FLOORPLAN_FEES: "6450",
  FUEL_EXPENSE: "6500",
  REPAIRS_MAINTENANCE: "7000",
  REFERRAL_FEES: "7100",
  MISC_EXPENSE: "7900",
  ROUNDING_DIFFERENCE: "7950",
} as const

export type AccountCode = (typeof ACCOUNTS)[keyof typeof ACCOUNTS]

/**
 * How a vehicle purchase was funded. Determines which account is credited.
 */
export const PURCHASE_PAYMENT_METHODS = {
  CASH: "CASH",
  FLOORPLAN: "FLOORPLAN",
  ACCOUNTS_PAYABLE: "ACCOUNTS_PAYABLE",
} as const

export type PurchasePaymentMethod =
  (typeof PURCHASE_PAYMENT_METHODS)[keyof typeof PURCHASE_PAYMENT_METHODS]

/**
 * Credit account for each funding method. A dealer buying on floorplan must
 * credit the floorplan liability, not cash -- otherwise cash is understated
 * and the floorplan payable never appears on the balance sheet.
 */
export function creditAccountForPaymentMethod(
  method: string | null | undefined,
): AccountCode {
  switch (method) {
    case PURCHASE_PAYMENT_METHODS.FLOORPLAN:
      return ACCOUNTS.FLOORPLAN_PAYABLE
    case PURCHASE_PAYMENT_METHODS.ACCOUNTS_PAYABLE:
      return ACCOUNTS.ACCOUNTS_PAYABLE
    default:
      return ACCOUNTS.CASH
  }
}

export const PAYMENT_METHOD_LABELS: Record<PurchasePaymentMethod, string> = {
  CASH: "Cash / Bank",
  FLOORPLAN: "Floorplan financing",
  ACCOUNTS_PAYABLE: "On account (payable)",
}

/**
 * Expense types whose cost is capitalized into vehicle inventory because they
 * bring the unit to sellable condition (IAS 2.10 / ASPE 3031.06). Everything
 * else is a period cost expensed when incurred.
 */
const CAPITALIZED_EXPENSE_TYPES = new Set([
  "REPAIR",
  "PARTS",
  "DETAILING",
  "INSPECTION",
  "SAFETY",
  "RECONDITIONING",
  "TOWING",
  "TRANSPORT",
])

/**
 * Period-cost expense types mapped to their proper expense account.
 * Financing costs are never capitalized into inventory (IAS 23.4).
 */
const PERIOD_EXPENSE_ACCOUNTS: Record<string, AccountCode> = {
  FLOORPLAN_INTEREST: ACCOUNTS.FLOORPLAN_INTEREST,
  FLOORPLAN_FEE: ACCOUNTS.FLOORPLAN_FEES,
  INTEREST: ACCOUNTS.FLOORPLAN_INTEREST,
  FUEL: ACCOUNTS.FUEL_EXPENSE,
  GAS: ACCOUNTS.FUEL_EXPENSE,
  REGISTRATION: ACCOUNTS.MISC_EXPENSE,
  REFERRAL: ACCOUNTS.REFERRAL_FEES,
  BANK_FEE: ACCOUNTS.BANK_CHARGES,
}

export function isCapitalizedExpenseType(expenseType: string | null | undefined) {
  if (!expenseType) return false
  return CAPITALIZED_EXPENSE_TYPES.has(expenseType.toUpperCase())
}

/**
 * Resolve the debit account for a vehicle expense. Capitalizable costs land in
 * Vehicle Inventory so they are relieved through COGS on sale; period costs go
 * to their specific expense account.
 */
export function debitAccountForExpenseType(
  expenseType: string | null | undefined,
): AccountCode {
  if (isCapitalizedExpenseType(expenseType)) {
    return ACCOUNTS.VEHICLE_INVENTORY
  }
  const key = (expenseType || "").toUpperCase()
  return PERIOD_EXPENSE_ACCOUNTS[key] ?? ACCOUNTS.MISC_EXPENSE
}
