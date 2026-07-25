import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  ACCOUNTS,
  creditAccountForPaymentMethod,
  debitAccountForExpenseType,
  isCapitalizedExpenseType,
} from "@/lib/accounting/accounts"
import { calculateTax, sumMoney, toAmount } from "@/lib/accounting/money"
import {
  PostingError,
  postJournalEntry,
  resolveActingUserId,
  type PostingLine,
} from "@/lib/accounting/posting"
import { getTaxRate } from "@/lib/accounting/tax"

// GET - Fetch all expenses for a vehicle
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data, error } = await supabase
    .from("vehicle_expenses")
    .select(`
      *,
      vendor:vendors(id, name),
      journal_entry:journal_entries(id, entry_number)
    `)
    .eq("vehicle_id", id)
    .order("expense_date", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// POST - Create a new expense for a vehicle
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: vehicleId } = await params
  const body = await request.json()

  const actingUserId = await resolveActingUserId(supabase)

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("year, make, model, stock_number")
    .eq("id", vehicleId)
    .single()

  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 })
  }

  const expenseDate = body.expense_date || new Date().toISOString().split("T")[0]
  const amount = toAmount(body.amount)

  if (amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 })
  }

  // An input tax credit is only claimable when the supplier charged HST. A
  // non-registrant supplier means there is no recoverable tax.
  let hstClaimable = body.is_taxable !== false
  if (hstClaimable && body.vendor_id) {
    const { data: vendor } = await supabase
      .from("vendors")
      .select("is_hst_registrant")
      .eq("id", body.vendor_id)
      .single()
    if (vendor && vendor.is_hst_registrant === false) {
      hstClaimable = false
    }
  }

  const taxRate = getTaxRate(expenseDate)
  const taxAmount = calculateTax(amount, taxRate, hstClaimable)
  const totalAmount = sumMoney([amount, taxAmount])

  // Capitalizable costs bring the unit to sellable condition and belong in
  // inventory; everything else is a period cost in its own expense account.
  const debitCode = debitAccountForExpenseType(body.expense_type)
  const creditCode = creditAccountForPaymentMethod(body.payment_method)

  const lines: PostingLine[] = [
    {
      code: debitCode,
      debit: amount,
      memo: `${body.expense_type}: ${body.description ?? ""}`.trim(),
    },
  ]

  if (taxAmount > 0) {
    lines.push({
      code: ACCOUNTS.HST_RECEIVABLE,
      debit: taxAmount,
      memo: "HST on expense (input tax credit)",
    })
  }

  lines.push({
    code: creditCode,
    credit: totalAmount,
    memo:
      creditCode === ACCOUNTS.ACCOUNTS_PAYABLE
        ? "Payable to vendor"
        : creditCode === ACCOUNTS.FLOORPLAN_PAYABLE
          ? "Charged to floorplan"
          : "Payment for vehicle expense",
  })

  const describeVehicle = `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""} (${vehicle.stock_number ?? ""})`.trim()

  let journalEntryId: string | null = null
  try {
    const entry = await postJournalEntry(supabase, {
      entryDate: expenseDate,
      description: `Vehicle expense (${body.expense_type}): ${describeVehicle} - ${body.description ?? ""}`.trim(),
      lines,
      createdBy: actingUserId,
    })
    journalEntryId = entry.id
  } catch (err) {
    if (err instanceof PostingError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    throw err
  }

  const { data: expense, error: expenseError } = await supabase
    .from("vehicle_expenses")
    .insert({
      vehicle_id: vehicleId,
      expense_date: expenseDate,
      expense_type: body.expense_type,
      description: body.description,
      notes: body.notes || null,
      amount,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      is_taxable: hstClaimable,
      is_capitalized: isCapitalizedExpenseType(body.expense_type),
      vendor_id: body.vendor_id || null,
      journal_entry_id: journalEntryId,
      created_by: actingUserId,
    })
    .select()
    .single()

  if (expenseError) {
    // The expense record failed, so the entry it justified must not stand.
    // Reverse rather than delete to preserve the audit trail.
    const { reverseJournalEntry } = await import("@/lib/accounting/posting")
    if (journalEntryId) {
      await reverseJournalEntry(supabase, journalEntryId, {
        reason: "Expense record could not be saved",
        createdBy: actingUserId,
      })
    }
    return NextResponse.json({ error: expenseError.message }, { status: 500 })
  }

  return NextResponse.json({ data: expense }, { status: 201 })
}
