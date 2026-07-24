import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// Record payment on AP or AR
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: dbUser } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", user.id)
    .single()

  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const { type, id, amount, payment_date, payment_method } = body

  if (!type || !id || !amount) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const table = type === "payable" ? "accounts_payable" : "accounts_receivable"
  
  // Get current record
  const { data: record, error: fetchError } = await supabase
    .from(table)
    .select("*")
    .eq("id", id)
    .single()

  if (fetchError || !record) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 })
  }

  const newAmountPaid = (record.amount_paid || 0) + amount
  const newStatus = newAmountPaid >= record.total_amount ? "PAID" : "PARTIAL"

  // Generate journal entry
  const { data: lastEntry } = await supabase
    .from("journal_entries")
    .select("entry_number")
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  const nextNum = lastEntry 
    ? parseInt(lastEntry.entry_number.replace("JE-", "")) + 1 
    : 1
  const entryNumber = `JE-${String(nextNum).padStart(5, "0")}`

  // Get GL accounts
  const accountCodes = type === "payable" 
    ? ["1000", "2000"] // Cash, AP
    : ["1000", "1100"] // Cash, AR

  const { data: accounts } = await supabase
    .from("gl_accounts")
    .select("id, code")
    .in("code", accountCodes)

  const cashAccount = accounts?.find(a => a.code === "1000")
  const balanceAccount = accounts?.find(a => a.code === (type === "payable" ? "2000" : "1100"))

  if (!cashAccount || !balanceAccount) {
    return NextResponse.json({ error: "GL accounts not found" }, { status: 500 })
  }

  // Create journal entry
  const description = type === "payable" 
    ? `Payment: ${record.description}`
    : `Receipt: ${record.description}`

  const { data: journalEntry, error: jeError } = await supabase
    .from("journal_entries")
    .insert({
      entry_number: entryNumber,
      entry_date: payment_date || new Date().toISOString().split("T")[0],
      description,
      status: "POSTED",
      posted_at: new Date().toISOString(),
      created_by: dbUser.id,
    })
    .select()
    .single()

  if (jeError) {
    return NextResponse.json({ error: jeError.message }, { status: 500 })
  }

  // Create line items based on payment type
  const lineItems = type === "payable"
    ? [
        // Paying a bill: Debit AP, Credit Cash
        { journal_entry_id: journalEntry.id, account_id: balanceAccount.id, debit: amount, credit: 0, memo: "Reduce AP" },
        { journal_entry_id: journalEntry.id, account_id: cashAccount.id, debit: 0, credit: amount, memo: `Payment via ${payment_method || "check"}` },
      ]
    : [
        // Receiving payment: Debit Cash, Credit AR
        { journal_entry_id: journalEntry.id, account_id: cashAccount.id, debit: amount, credit: 0, memo: `Received via ${payment_method || "check"}` },
        { journal_entry_id: journalEntry.id, account_id: balanceAccount.id, debit: 0, credit: amount, memo: "Reduce AR" },
      ]

  await supabase.from("journal_line_items").insert(lineItems)

  // Update the record
  const { data: updated, error: updateError } = await supabase
    .from(table)
    .update({
      amount_paid: newAmountPaid,
      status: newStatus,
      payment_journal_entry_id: journalEntry.id,
    })
    .eq("id", id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ data: updated, journalEntry })
}
