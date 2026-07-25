import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { ACCOUNTS } from "@/lib/accounting/accounts"
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
    .from("accounts_receivable")
    .select(`
      *,
      customer:customers(id, first_name, last_name),
      vehicle:vehicles(id, stock_number, year, make, model),
      journal_entry:journal_entries(id, entry_number)
    `)
    .order("invoice_date", { ascending: false })

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

/**
 * Raise a customer invoice.
 *
 * Unpaid:  Dr Accounts Receivable / Cr Revenue + Cr HST Payable
 * Paid:    Dr Cash                / Cr Revenue + Cr HST Payable
 *
 * The previous version debited account 1100 as "AR", but 1100 is Vehicle
 * Inventory -- so raising an invoice inflated inventory and never created a
 * receivable.
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
  if (!actingUserId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const { createJournalEntry, markAsPaid, ...invoiceData } = body

  // Generate the invoice number by extracting digits rather than trusting a
  // fixed prefix, so a stray format cannot yield NaN and poison the sequence.
  const { data: lastInvoice } = await supabase
    .from("accounts_receivable")
    .select("invoice_number")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastDigits = String(lastInvoice?.invoice_number ?? "").match(/(\d+)/)
  const parsed = lastDigits ? Number.parseInt(lastDigits[1], 10) : 0
  const nextNum = (Number.isFinite(parsed) ? parsed : 0) + 1

  invoiceData.invoice_number =
    invoiceData.invoice_number || `INV-${String(nextNum).padStart(5, "0")}`

  const subtotal = toAmount(invoiceData.subtotal)
  const taxAmount = toAmount(invoiceData.tax_amount)
  // Recompute the total rather than trusting the client's arithmetic.
  const totalAmount = sumMoney([subtotal, taxAmount])

  if (totalAmount <= 0) {
    return NextResponse.json({ error: "Invoice total must be greater than zero" }, { status: 400 })
  }

  const invoiceDate = invoiceData.invoice_date || new Date().toISOString().split("T")[0]

  invoiceData.subtotal = subtotal
  invoiceData.tax_amount = taxAmount
  invoiceData.total_amount = totalAmount
  invoiceData.invoice_date = invoiceDate

  const lines: PostingLine[] = [
    {
      code: markAsPaid ? ACCOUNTS.CASH : ACCOUNTS.ACCOUNTS_RECEIVABLE,
      debit: totalAmount,
      memo: markAsPaid ? "Cash received" : "Amount due from customer",
    },
    {
      code: ACCOUNTS.VEHICLE_SALES,
      credit: subtotal,
      memo: invoiceData.description || "Sale revenue",
    },
  ]

  if (taxAmount > 0) {
    lines.push({ code: ACCOUNTS.HST_PAYABLE, credit: taxAmount, memo: "HST collected" })
  }

  let entry
  try {
    entry = await postJournalEntry(supabase, {
      entryDate: invoiceDate,
      description: markAsPaid
        ? `Paid sale: ${invoiceData.description ?? ""}`.trim()
        : `Sale: ${invoiceData.description ?? ""}`.trim(),
      lines,
      createdBy: actingUserId,
    })
  } catch (err) {
    if (err instanceof PostingError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    throw err
  }

  // A sale paid on the spot never enters the AR subledger, but revenue and the
  // HST liability are still recorded.
  if (markAsPaid) {
    return NextResponse.json({
      data: {
        journalEntry: { id: entry.id, entry_number: entry.entryNumber },
        message: "Sale recorded as paid; no receivable created.",
      },
    })
  }

  const { data: invoice, error: invError } = await supabase
    .from("accounts_receivable")
    .insert({
      ...invoiceData,
      journal_entry_id: entry.id,
    })
    .select()
    .single()

  if (invError) {
    await reverseJournalEntry(supabase, entry.id, {
      reason: "Invoice record could not be saved",
      createdBy: actingUserId,
    })
    return NextResponse.json({ error: invError.message }, { status: 500 })
  }

  return NextResponse.json({ data: invoice })
}
