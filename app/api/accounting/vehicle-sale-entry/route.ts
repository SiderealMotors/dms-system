import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { ACCOUNTS } from "@/lib/accounting/accounts"
import { calculateTax, sumMoney, toAmount } from "@/lib/accounting/money"
import {
  PostingError,
  postJournalEntry,
  resolveActingUserId,
  type PostingLine,
} from "@/lib/accounting/posting"
import { getTaxRate } from "@/lib/accounting/tax"
import {
  buildInventoryReliefLines,
  getCapitalizedInventoryCost,
} from "@/lib/accounting/vehicle-entries"

/**
 * Post the sale of a vehicle.
 *
 * Sale amounts come from the request; cost amounts are read from the database
 * rather than trusted from the client, so COGS cannot be misstated by a caller.
 *
 * The entry has two balanced halves:
 *
 *   Revenue    Dr Accounts Receivable (gross incl. tax)
 *              Cr Vehicle / Safety / Warranty / OMVIC revenue
 *              Cr Registration Payable   (agency pass-through, not revenue)
 *              Cr HST Payable            (tax collected, a liability)
 *
 *   Cost       Dr Cost of Vehicles Sold  (full capitalized cost)
 *              Cr Vehicle Inventory      (same amount -- fully relieved)
 *
 * Period costs already expensed at acquisition -- floorplan interest, floorplan
 * fees, fuel -- are deliberately NOT repeated here. The previous version
 * re-debited them with no offsetting credit, which both double-counted the
 * expense and left the entry permanently out of balance.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const actingUserId = await resolveActingUserId(supabase)

  const vehicleId: string | undefined = body.vehicleId
  if (!vehicleId) {
    return NextResponse.json({ error: "vehicleId is required" }, { status: 400 })
  }

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, year, make, model, stock_number, date_sold, sale_journal_entry_id")
    .eq("id", vehicleId)
    .single()

  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 })
  }

  // Guard against posting the same sale twice.
  if (vehicle.sale_journal_entry_id) {
    return NextResponse.json(
      {
        error:
          "This vehicle already has a posted sale entry. Reverse the existing entry before re-posting.",
      },
      { status: 409 },
    )
  }

  const saleDate = body.saleDate || vehicle.date_sold || new Date().toISOString().split("T")[0]
  const taxRate = getTaxRate(saleDate)

  const sellingPrice = toAmount(body.sellingPrice)
  const safetyCharge = toAmount(body.safetyCharge)
  const warrantyCharge = toAmount(body.warrantyCharge)
  const omvicFee = toAmount(body.omvicFee)
  const registrationFee = toAmount(body.registrationFee)
  const referralAmount = toAmount(body.referralAmount)

  const taxableSubtotal = sumMoney([sellingPrice, safetyCharge, warrantyCharge, omvicFee])

  if (taxableSubtotal <= 0 && registrationFee <= 0) {
    return NextResponse.json({ error: "Sale has no billable amounts" }, { status: 400 })
  }

  const taxAmount = calculateTax(taxableSubtotal, taxRate)
  const grossReceivable = sumMoney([taxableSubtotal, taxAmount, registrationFee])

  // Full capitalized cost, read from the database. Relieving only
  // purchase_price -- as the old code did -- stranded every other capitalized
  // cost in inventory forever and understated COGS on every deal.
  const { total: capitalizedCost, byAccount: inventoryByAccount } =
    await getCapitalizedInventoryCost(supabase, vehicleId)

  const describeVehicle = `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""} (${vehicle.stock_number ?? ""})`.trim()
  const description = `Vehicle sale: ${describeVehicle}${body.buyerName ? ` to ${body.buyerName}` : ""}`

  const lines: PostingLine[] = []

  // --- Revenue half -------------------------------------------------------
  lines.push({
    code: ACCOUNTS.ACCOUNTS_RECEIVABLE,
    debit: grossReceivable,
    memo: "Accounts receivable - customer",
  })

  if (sellingPrice > 0) {
    lines.push({ code: ACCOUNTS.VEHICLE_SALES, credit: sellingPrice, memo: "Vehicle sales revenue" })
  }
  if (safetyCharge > 0) {
    lines.push({ code: ACCOUNTS.SERVICE_REVENUE, credit: safetyCharge, memo: "Safety certification revenue" })
  }
  if (warrantyCharge > 0) {
    lines.push({ code: ACCOUNTS.OTHER_REVENUE, credit: warrantyCharge, memo: "Warranty revenue" })
  }
  if (omvicFee > 0) {
    lines.push({ code: ACCOUNTS.OMVIC_PAYABLE, credit: omvicFee, memo: "OMVIC fee recovered" })
  }
  if (registrationFee > 0) {
    lines.push({
      code: ACCOUNTS.REGISTRATION_PAYABLE,
      credit: registrationFee,
      memo: "Registration collected on behalf of MTO (pass-through)",
    })
  }
  if (taxAmount > 0) {
    lines.push({ code: ACCOUNTS.HST_PAYABLE, credit: taxAmount, memo: "HST collected on sale" })
  }

  // --- Cost half ----------------------------------------------------------
  if (capitalizedCost > 0) {
    lines.push({
      code: ACCOUNTS.COGS,
      debit: capitalizedCost,
      memo: "Cost of vehicle sold (full capitalized cost)",
    })
    // Credit each inventory subaccount for its own balance, so 1210/1220 are
    // cleared rather than left overstated.
    lines.push(...buildInventoryReliefLines(inventoryByAccount))
  }

  let entry
  try {
    entry = await postJournalEntry(supabase, {
      entryDate: saleDate,
      description,
      lines,
      createdBy: actingUserId,
    })
  } catch (err) {
    if (err instanceof PostingError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    throw err
  }

  await supabase
    .from("vehicles")
    .update({ sale_journal_entry_id: entry.id })
    .eq("id", vehicleId)

  // A referral paid to a third party is an expense with its own liability,
  // not a reduction of sale revenue.
  let referralEntryId: string | null = null
  if (referralAmount > 0) {
    const referralEntry = await postJournalEntry(supabase, {
      entryDate: saleDate,
      description: `Referral fee - ${vehicle.stock_number ?? describeVehicle}`,
      lines: [
        { code: ACCOUNTS.REFERRAL_FEES, debit: referralAmount, memo: "Referral fee expense" },
        { code: ACCOUNTS.ACCOUNTS_PAYABLE, credit: referralAmount, memo: "Referral fee payable" },
      ],
      createdBy: actingUserId,
    })
    referralEntryId = referralEntry.id
  }

  const { data: completeEntry } = await supabase
    .from("journal_entries")
    .select(`
      *,
      line_items:journal_line_items(*, account:gl_accounts(*))
    `)
    .eq("id", entry.id)
    .single()

  return NextResponse.json(
    {
      data: completeEntry,
      summary: {
        grossReceivable,
        taxableSubtotal,
        taxAmount,
        registrationFee,
        capitalizedCost,
        grossProfit: sumMoney([taxableSubtotal, -capitalizedCost]),
        referralEntryId,
      },
    },
    { status: 201 },
  )
}
