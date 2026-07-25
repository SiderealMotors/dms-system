import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { ACCOUNTS } from "@/lib/accounting/accounts"
import { roundMoney, sumMoney, toAmount } from "@/lib/accounting/money"
import {
  PostingError,
  postJournalEntry,
  resolveActingUserId,
  type PostingLine,
} from "@/lib/accounting/posting"

/**
 * Record a payment against a payable or a receivable.
 *
 * Settling a bill:     Dr Accounts Payable    / Cr Cash
 * Receiving a payment: Dr Cash                / Cr Accounts Receivable
 *
 * The previous version used account 1100 for "AR", but 1100 is Vehicle
 * Inventory in the chart of accounts -- so every customer receipt was credited
 * against inventory, understating inventory and leaving AR uncleared.
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

  // Resolve the public.users row by auth_id. The old lookup matched on
  // users.id = auth uuid, which does not hold and produced a bad created_by.
  const actingUserId = await resolveActingUserId(supabase)

  const { type, id, amount, payment_date, payment_method } = body

  if (!type || !id || amount === undefined || amount === null) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  if (type !== "payable" && type !== "receivable") {
    return NextResponse.json({ error: "type must be 'payable' or 'receivable'" }, { status: 400 })
  }

  const paymentAmount = toAmount(amount)
  if (paymentAmount <= 0) {
    return NextResponse.json({ error: "Payment amount must be greater than zero" }, { status: 400 })
  }

  const table = type === "payable" ? "accounts_payable" : "accounts_receivable"

  const { data: record, error: fetchError } = await supabase
    .from(table)
    .select("*")
    .eq("id", id)
    .single()

  if (fetchError || !record) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 })
  }

  const alreadyPaid = toAmount(record.amount_paid)
  const totalAmount = toAmount(record.total_amount)
  const outstanding = roundMoney(totalAmount - alreadyPaid)

  if (outstanding <= 0) {
    return NextResponse.json(
      { error: "This document is already fully settled." },
      { status: 409 },
    )
  }

  // Never let a payment exceed the balance owing: that silently creates an
  // unrecorded customer deposit or vendor prepayment.
  if (paymentAmount > outstanding) {
    return NextResponse.json(
      {
        error:
          `Payment of ${paymentAmount.toFixed(2)} exceeds the outstanding balance of ` +
          `${outstanding.toFixed(2)}. Record the balance owing, or post the excess ` +
          `separately as a deposit or prepayment.`,
      },
      { status: 422 },
    )
  }

  const newAmountPaid = sumMoney([alreadyPaid, paymentAmount])
  const newStatus = newAmountPaid >= totalAmount ? "PAID" : "PARTIAL"

  const description =
    type === "payable"
      ? `Payment: ${record.description ?? ""}`.trim()
      : `Receipt: ${record.description ?? ""}`.trim()

  const method = payment_method || "cheque"

  const lines: PostingLine[] =
    type === "payable"
      ? [
          { code: ACCOUNTS.ACCOUNTS_PAYABLE, debit: paymentAmount, memo: "Settle vendor payable" },
          { code: ACCOUNTS.CASH, credit: paymentAmount, memo: `Payment via ${method}` },
        ]
      : [
          { code: ACCOUNTS.CASH, debit: paymentAmount, memo: `Received via ${method}` },
          {
            code: ACCOUNTS.ACCOUNTS_RECEIVABLE,
            credit: paymentAmount,
            memo: "Clear customer receivable",
          },
        ]

  let entry
  try {
    entry = await postJournalEntry(supabase, {
      entryDate: payment_date || new Date().toISOString().split("T")[0],
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

  const { data: updated, error: updateError } = await supabase
    .from(table)
    .update({
      amount_paid: newAmountPaid,
      status: newStatus,
      payment_journal_entry_id: entry.id,
    })
    .eq("id", id)
    .select()
    .single()

  if (updateError) {
    const { reverseJournalEntry } = await import("@/lib/accounting/posting")
    await reverseJournalEntry(supabase, entry.id, {
      reason: "Payment record could not be updated",
      createdBy: actingUserId,
    })
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    data: updated,
    journalEntry: { id: entry.id, entry_number: entry.entryNumber },
    outstanding: roundMoney(totalAmount - newAmountPaid),
  })
}
