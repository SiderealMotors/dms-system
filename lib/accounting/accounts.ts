/**
 * Canonical chart of accounts.
 *
 * IMPORTANT: These codes are transcribed from the LIVE `gl_accounts` table,
 * which is the authoritative chart. `scripts/002_seed_gl_accounts.sql` had
 * drifted badly from production (different names on the same codes), so it is
 * regenerated from this file rather than the other way around.
 *
 * Verified against the live chart of 46 accounts. Never inline a bare GL code
 * string in a route -- import from here so a mismapped account is a lookup
 * error rather than a silently misfiled journal line.
 */
export const ACCOUNTS = {
  // ---- Assets (1000s) ----
  CASH: "1000",
  BANK_OPERATING: "1010",
  BANK_RESERVE: "1020",
  ACCOUNTS_RECEIVABLE: "1100",
  /** "Sales Tax Receivable" -- recoverable HST / input tax credits. */
  HST_RECEIVABLE: "1150",
  VEHICLE_INVENTORY: "1200",
  /** Purpose-built subaccount for capitalized safety work. */
  VEHICLE_INVENTORY_SAFETY: "1210",
  /** Purpose-built subaccount for capitalized reconditioning. */
  VEHICLE_INVENTORY_RECONDITIONING: "1220",
  PARTS_INVENTORY: "1300",
  PREPAID_EXPENSES: "1400",

  // ---- Liabilities (2000s) ----
  ACCOUNTS_PAYABLE: "2000",
  FLOORPLAN_PAYABLE: "2100",
  /** "Sales Tax Payable" -- HST collected and owed to CRA. */
  HST_PAYABLE: "2200",
  REGISTRATION_PAYABLE: "2250",
  ACCRUED_EXPENSES: "2300",
  CUSTOMER_DEPOSITS: "2350",
  /** OMVIC fees collected from the customer are a pass-through, not revenue. */
  OMVIC_PAYABLE: "2400",

  // ---- Equity (3000s) ----
  OWNER_EQUITY: "3000",
  RETAINED_EARNINGS: "3100",
  OWNER_DRAWS: "3200",

  // ---- Revenue (4000s) ----
  VEHICLE_SALES: "4000",
  PARTS_SALES: "4100",
  /** Safety / inspection work billed to the customer. */
  SERVICE_REVENUE: "4200",
  FINANCE_INCOME: "4300",
  TRADE_IN_REVENUE: "4400",
  /** Warranty charges and anything else without a dedicated account. */
  OTHER_REVENUE: "4500",

  // ---- Cost of sales (5000s) ----
  COGS: "5000",
  COST_OF_PARTS_SOLD: "5100",
  WARRANTY_COSTS: "5200",
  RECONDITIONING_COSTS: "5300",
  FLOORPLAN_INTEREST: "5400",

  // ---- Operating expenses (6000s-7000s) ----
  SALARIES_WAGES: "6000",
  RENT: "6100",
  UTILITIES: "6200",
  ADVERTISING: "6300",
  INSURANCE: "6400",
  FLOORPLAN_FEES: "6450",
  DEPRECIATION: "6500",
  OFFICE_SUPPLIES: "6600",
  PROFESSIONAL_FEES: "6700",
  /** OMVIC fees the dealer actually pays out. */
  OMVIC_FEES_EXPENSE: "6800",
  OTHER_OPERATING: "6900",
  REFERRAL_FEES: "7000",
  MISC_EXPENSE: "7100",
  ROUNDING_DIFFERENCE: "7950",
} as const

export type AccountCode = (typeof ACCOUNTS)[keyof typeof ACCOUNTS]

/**
 * Inventory accounts that together hold a vehicle's capitalized cost. COGS
 * relief on sale must clear all three, not just the base account.
 */
export const VEHICLE_INVENTORY_ACCOUNTS = [
  ACCOUNTS.VEHICLE_INVENTORY,
  ACCOUNTS.VEHICLE_INVENTORY_SAFETY,
  ACCOUNTS.VEHICLE_INVENTORY_RECONDITIONING,
] as const

/**
 * How a vehicle purchase was funded. Determines which account is credited.
 */
export const PURCHASE_PAYMENT_METHODS = {
  CASH: "CASH",
  BANK: "BANK",
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
    case PURCHASE_PAYMENT_METHODS.BANK:
      return ACCOUNTS.BANK_OPERATING
    default:
      return ACCOUNTS.CASH
  }
}

export const PAYMENT_METHOD_LABELS: Record<PurchasePaymentMethod, string> = {
  CASH: "Cash",
  BANK: "Bank account",
  FLOORPLAN: "Floorplan financing",
  ACCOUNTS_PAYABLE: "On account (payable)",
}

/**
 * Expense types whose cost is capitalized into vehicle inventory because they
 * bring the unit to sellable condition (IAS 2.10 / ASPE 3031.06). Each maps to
 * the inventory account that best describes the work, so the balance sheet
 * shows where money went instead of one opaque total.
 */
const CAPITALIZED_EXPENSE_ACCOUNTS: Record<string, AccountCode> = {
  SAFETY: ACCOUNTS.VEHICLE_INVENTORY_SAFETY,
  INSPECTION: ACCOUNTS.VEHICLE_INVENTORY_SAFETY,
  RECONDITIONING: ACCOUNTS.VEHICLE_INVENTORY_RECONDITIONING,
  DETAILING: ACCOUNTS.VEHICLE_INVENTORY_RECONDITIONING,
  REPAIR: ACCOUNTS.VEHICLE_INVENTORY_RECONDITIONING,
  PARTS: ACCOUNTS.VEHICLE_INVENTORY_RECONDITIONING,
  TOWING: ACCOUNTS.VEHICLE_INVENTORY,
  TRANSPORT: ACCOUNTS.VEHICLE_INVENTORY,
}

/**
 * Period-cost expense types mapped to their proper expense account.
 * Financing costs are never capitalized into inventory (IAS 23.4).
 */
const PERIOD_EXPENSE_ACCOUNTS: Record<string, AccountCode> = {
  FLOORPLAN_INTEREST: ACCOUNTS.FLOORPLAN_INTEREST,
  INTEREST: ACCOUNTS.FLOORPLAN_INTEREST,
  FLOORPLAN_FEE: ACCOUNTS.FLOORPLAN_FEES,
  REFERRAL: ACCOUNTS.REFERRAL_FEES,
  ADVERTISING: ACCOUNTS.ADVERTISING,
  INSURANCE: ACCOUNTS.INSURANCE,
  OMVIC: ACCOUNTS.OMVIC_FEES_EXPENSE,
  PROFESSIONAL: ACCOUNTS.PROFESSIONAL_FEES,
  OFFICE: ACCOUNTS.OFFICE_SUPPLIES,
  RENT: ACCOUNTS.RENT,
  UTILITIES: ACCOUNTS.UTILITIES,
  WARRANTY: ACCOUNTS.WARRANTY_COSTS,
  // No dedicated fuel or bank-charge account exists in the live chart.
  FUEL: ACCOUNTS.OTHER_OPERATING,
  GAS: ACCOUNTS.OTHER_OPERATING,
  BANK_FEE: ACCOUNTS.OTHER_OPERATING,
  REGISTRATION: ACCOUNTS.MISC_EXPENSE,
}

export function isCapitalizedExpenseType(expenseType: string | null | undefined) {
  if (!expenseType) return false
  return Object.hasOwn(CAPITALIZED_EXPENSE_ACCOUNTS, expenseType.toUpperCase())
}

/**
 * Resolve the debit account for a vehicle expense. Capitalizable costs land in
 * a vehicle inventory account so they are relieved through COGS on sale;
 * period costs go to their specific expense account.
 */
export function debitAccountForExpenseType(
  expenseType: string | null | undefined,
): AccountCode {
  const key = (expenseType || "").toUpperCase()
  return (
    CAPITALIZED_EXPENSE_ACCOUNTS[key] ??
    PERIOD_EXPENSE_ACCOUNTS[key] ??
    ACCOUNTS.MISC_EXPENSE
  )
}
