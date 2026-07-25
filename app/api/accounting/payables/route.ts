import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import {
  ACCOUNTS,
  debitAccountForExpenseType,
  type AccountCode,
} from "@/lib/accounting/accounts"
import { sumMoney, toAmount } from "@/lib/accounting/money"
import {
  PostingError,
  postJournalEntry,
  resolveActingUserId,
  reverseJournalEntry,
  type PostingLine,
} from "@/lib/accounting/posting"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const status = searchParams.get("status")
  const vehicleId = searchParams.get("vehicle_id")

  let query = supabase
    .from("accounts_payable")
    .select(`
      *,
      vendor:vendors(id, name),
      vehicle:vehicles(id, stock_number, year, make, model),
      journal_entry:journal_entries(id, entry_number)
    `)
    .order("bill_date", { ascending: false })

  if (status) {
    query = query.eq("status", status)
  }

  if (vehicleId) {
    query = query.eq("vehicle_id", vehicleId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

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
  if (!actingUserId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const { createJournalEntry, markAsPaid, ...billData } = body

  const amount = toAmount(billData.amount)
  if (amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than zero" }, { status: 400 })
  }

  // Only claim an input tax credit when the vendor actually charged HST.
  let taxAmount = toAmount(billData.tax_amount)
  if (taxAmount > 0 && billData.vendor_id) {
    const { data: vendor } = await supabase
      .from("vendors")
      .select("is_hst_registrant")
      .eq("id", billData.vendor_id)
      .single()
    if (vendor && vendor.is_hst_registrant === false) {
      return NextResponse.json(
        {
          error:
            "This vendor is not registered for HST, so no input tax credit may be claimed. " +
            "Clear the tax amount or correct the vendor's registration status.",
        },
        { status: 422 },
      )
    }
  }

  // Recompute the total rather than trusting the client's arithmetic.
  const totalAmount = sumMoney([amount, taxAmount])

  // Route the debit by expense type instead of dumping everything into a
  // single account. Falls back to Vehicle Inventory for vehicle-linked bills.
  const debitCode: AccountCode = billData.expense_type
    ? debitAccountForExpenseType(billData.expense_type)
    : billData.vehicle_id
      ? ACCOUNTS.VEHICLE_INVENTORY
      : ACCOUNTS.MISC_EXPENSE

  const lines: PostingLine[] = [
    { code: debitCode, debit: amount, memo: billData.description || "Vendor bill" },
  ]

  if (taxAmount > 0) {
    lines.push({
      code: ACCOUNTS.HST_RECEIVABLE,
      debit: taxAmount,
      memo: "HST on purchase (input tax credit)",
    })
  }

  // Paid immediately settles in cash; otherwise it sits in accounts payable.
  lines.push(
    markAsPaid
      ? { code: ACCOUNTS.CASH, credit: totalAmount, memo: "Cash payment" }
      : { code: ACCOUNTS.ACCOUNTS_PAYABLE, credit: totalAmount, memo: "Amount owed to vendor" },
  )

  const billDate = billData.bill_date || new Date().toISOString().split("T")[0]

  let entry
  try {
    entry = await postJournalEntry(supabase, {
      entryDate: billDate,
      description: markAsPaid
        ? `Paid: ${billData.description ?? ""}`.trim()
        : `Bill: ${billData.description ?? ""}`.trim(),
      lines,
      createdBy: actingUserId,
    })
  } catch (err) {
    if (err instanceof PostingError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    throw err
  }

  // A bill paid on the spot never enters the AP subledger, but it is still
  // recorded so the expense and the ITC are on the books.
  if (markAsPaid) {
    return NextResponse.json({
      data: {
        journalEntry: { id: entry.id, entry_number: entry.entryNumber },
        message: "Expense recorded as paid; no payable created.",
      },
    })
  }

  const { data: bill, error: billError } = await supabase
    .from("accounts_payable")
    .insert({
      ...billData,
      bill_date: billDate,
      amount,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      journal_entry_id: entry.id,
    })
    .select()
    .single()

  if (billError) {
    await reverseJournalEntry(supabase, entry.id, {
      reason: "Payable record could not be saved",
      createdBy: actingUserId,
    })
    return NextResponse.json({ error: billError.message }, { status: 500 })
  }

  return NextResponse.json({ data: bill })
}
