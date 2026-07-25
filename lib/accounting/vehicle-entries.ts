import type { createClient } from "@/lib/supabase/server"
import { ACCOUNTS, creditAccountForPaymentMethod } from "./accounts"
import { calculateTax, sumMoney, toAmount } from "./money"
import {
  postJournalEntry,
  reverseJournalEntry,
  type PostingLine,
} from "./posting"
import { getTaxRate } from "./tax"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>
type VehicleRow = Record<string, unknown>

/**
 * Cost components of a vehicle purchase.
 *
 * Capitalized costs are those required to bring the unit to sellable condition
 * (IAS 2.10 / ASPE 3031.06); they sit in Vehicle Inventory until the sale
 * relieves them through COGS. Financing costs are period costs and are never
 * capitalized into inventory (IAS 23.4).
 */
const CAPITALIZED_COMPONENTS = [
  { field: "purchase_price", memo: "Vehicle purchase price", taxable: true },
  { field: "miscellaneous_cost", memo: "Miscellaneous acquisition cost", taxable: true },
  { field: "safety_cost", memo: "Safety inspection", taxable: true },
  { field: "gas", memo: "Fuel for lot prep", taxable: true },
  { field: "warranty_cost", memo: "Warranty cost", taxable: true },
] as const

const PERIOD_COMPONENTS = [
  {
    field: "floorplan_interest_cost",
    memo: "Floorplan interest",
    account: ACCOUNTS.FLOORPLAN_INTEREST,
    // Interest is an exempt financial service - no HST, so no ITC.
    taxable: false,
  },
  {
    field: "floorplan_fees",
    memo: "Floorplan fees",
    account: ACCOUNTS.FLOORPLAN_FEES,
    taxable: false,
  },
] as const

export type VehiclePurchaseTotals = {
  capitalizedCost: number
  periodCost: number
  taxableBase: number
  taxAmount: number
  grandTotal: number
}

/**
 * Build the balanced line set for a vehicle purchase.
 *
 * Debits: Vehicle Inventory (capitalized), specific expense accounts (period),
 *         HST Receivable (only when the input tax credit is actually claimable)
 * Credit: Cash, Floorplan Payable, or Accounts Payable per funding method
 */
export function buildVehiclePurchaseLines(vehicle: VehicleRow): {
  lines: PostingLine[]
  totals: VehiclePurchaseTotals
} {
  const taxRate = getTaxRate(vehicle.date_acquired as string | null)

  // An ITC may only be claimed when the seller is an HST registrant. Private
  // and curbside purchases carry no recoverable tax.
  const hstApplicable = vehicle.purchase_hst_applicable !== false

  const lines: PostingLine[] = []

  const capitalized = CAPITALIZED_COMPONENTS.map((c) => ({
    ...c,
    amount: toAmount(vehicle[c.field]),
  })).filter((c) => c.amount > 0)

  const period = PERIOD_COMPONENTS.map((c) => ({
    ...c,
    amount: toAmount(vehicle[c.field]),
  })).filter((c) => c.amount > 0)

  for (const component of capitalized) {
    lines.push({
      code: ACCOUNTS.VEHICLE_INVENTORY,
      debit: component.amount,
      memo: component.memo,
    })
  }

  for (const component of period) {
    lines.push({
      code: component.account,
      debit: component.amount,
      memo: component.memo,
    })
  }

  const capitalizedCost = sumMoney(capitalized.map((c) => c.amount))
  const periodCost = sumMoney(period.map((c) => c.amount))

  const taxableBase = sumMoney(
    [...capitalized, ...period].filter((c) => c.taxable).map((c) => c.amount),
  )
  const taxAmount = calculateTax(taxableBase, taxRate, hstApplicable)

  if (taxAmount > 0) {
    lines.push({
      code: ACCOUNTS.HST_RECEIVABLE,
      debit: taxAmount,
      memo: "HST on purchase (input tax credit)",
    })
  }

  const grandTotal = sumMoney([capitalizedCost, periodCost, taxAmount])

  if (grandTotal > 0) {
    const creditCode = creditAccountForPaymentMethod(
      vehicle.purchase_payment_method as string | null,
    )
    lines.push({
      code: creditCode,
      credit: grandTotal,
      memo:
        creditCode === ACCOUNTS.FLOORPLAN_PAYABLE
          ? "Funded on floorplan"
          : creditCode === ACCOUNTS.ACCOUNTS_PAYABLE
            ? "Payable to vendor"
            : "Payment for vehicle acquisition",
    })
  }

  return {
    lines,
    totals: { capitalizedCost, periodCost, taxableBase, taxAmount, grandTotal },
  }
}

function describeVehicle(vehicle: VehicleRow) {
  return `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""} (${vehicle.stock_number ?? "no stock #"})`.trim()
}

/**
 * Post (or re-post) the acquisition entry for a vehicle.
 *
 * An existing entry is REVERSED rather than deleted, and the replacement is
 * dated today rather than backdated to date_acquired, so a cost correction made
 * now cannot rewrite a period whose HST return has already been filed.
 */
export async function postVehiclePurchaseEntry(
  supabase: SupabaseServerClient,
  vehicle: VehicleRow,
  options: { createdBy?: string | null; reason?: string } = {},
): Promise<{ entryId: string | null; entryNumber: string | null; totals: VehiclePurchaseTotals }> {
  const vehicleId = vehicle.id as string

  // Read the current link from the database: the caller's vehicle object is
  // the result of an update and may not carry this column.
  const { data: linked } = await supabase
    .from("vehicles")
    .select("purchase_journal_entry_id")
    .eq("id", vehicleId)
    .single()

  const existingEntryId = linked?.purchase_journal_entry_id as string | null

  if (existingEntryId) {
    await reverseJournalEntry(supabase, existingEntryId, {
      reason: options.reason ?? "Vehicle acquisition costs revised",
      createdBy: options.createdBy,
    })
  }

  const { lines, totals } = buildVehiclePurchaseLines(vehicle)

  if (lines.length === 0) {
    await supabase
      .from("vehicles")
      .update({ purchase_journal_entry_id: null })
      .eq("id", vehicleId)
    return { entryId: null, entryNumber: null, totals }
  }

  const isRepost = Boolean(existingEntryId)
  const entry = await postJournalEntry(supabase, {
    // Original acquisitions carry the acquisition date; corrections are dated
    // today so closed periods stay closed.
    entryDate: isRepost
      ? new Date().toISOString().split("T")[0]
      : ((vehicle.date_acquired as string) || new Date().toISOString().split("T")[0]),
    description: `Vehicle acquisition: ${describeVehicle(vehicle)}`,
    lines,
    createdBy: options.createdBy,
  })

  await supabase
    .from("vehicles")
    .update({ purchase_journal_entry_id: entry.id })
    .eq("id", vehicleId)

  return { entryId: entry.id, entryNumber: entry.entryNumber, totals }
}

/**
 * Total cost capitalized into inventory for a vehicle, including capitalizable
 * additional expenses. This is the amount COGS must relieve on sale -- the old
 * code credited only purchase_price, permanently stranding every other
 * capitalized cost in inventory and understating COGS on every deal.
 */
export async function getCapitalizedInventoryCost(
  supabase: SupabaseServerClient,
  vehicleId: string,
): Promise<number> {
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select(
      "purchase_price, miscellaneous_cost, safety_cost, gas, warranty_cost",
    )
    .eq("id", vehicleId)
    .single()

  if (!vehicle) return 0

  const base = sumMoney(
    CAPITALIZED_COMPONENTS.map((c) => toAmount((vehicle as VehicleRow)[c.field])),
  )

  // Capitalizable additional expenses recorded against the unit.
  const { data: expenses } = await supabase
    .from("vehicle_expenses")
    .select("amount, expense_type")
    .eq("vehicle_id", vehicleId)

  const capitalizedExpenses = sumMoney(
    (expenses ?? [])
      .filter((e) => {
        const type = String(e.expense_type ?? "").toUpperCase()
        return ["REPAIR", "PARTS", "DETAILING", "INSPECTION", "SAFETY", "RECONDITIONING", "TOWING", "TRANSPORT"].includes(
          type,
        )
      })
      .map((e) => toAmount(e.amount)),
  )

  return sumMoney([base, capitalizedExpenses])
}
