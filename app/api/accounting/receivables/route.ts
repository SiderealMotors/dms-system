import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

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

  // Generate invoice number
  const { data: lastInvoice } = await supabase
    .from("accounts_receivable")
    .select("invoice_number")
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  const nextNum = lastInvoice 
    ? parseInt(lastInvoice.invoice_number.replace("INV-", "")) + 1 
    : 1
  const invoiceNumber = body.invoice_number || `INV-${String(nextNum).padStart(5, "0")}`

  const { createJournalEntry, ...invoiceData } = body
  invoiceData.invoice_number = invoiceNumber

  // Create the invoice
  const { data: invoice, error: invError } = await supabase
    .from("accounts_receivable")
    .insert(invoiceData)
    .select()
    .single()

  if (invError) {
    return NextResponse.json({ error: invError.message }, { status: 500 })
  }

  // If requested, create automated journal entry for the sale
  if (createJournalEntry && invoice) {
    // Generate entry number
    const { data: lastEntry } = await supabase
      .from("journal_entries")
      .select("entry_number")
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    const nextJENum = lastEntry 
      ? parseInt(lastEntry.entry_number.replace("JE-", "")) + 1 
      : 1
    const entryNumber = `JE-${String(nextJENum).padStart(5, "0")}`

    // Get GL account IDs
    const { data: accounts } = await supabase
      .from("gl_accounts")
      .select("id, code")
      .in("code", ["1100", "4000", "2200"]) // AR, Sales Revenue, HST Payable

    const arAccount = accounts?.find(a => a.code === "1100")
    const revenueAccount = accounts?.find(a => a.code === "4000")
    const hstAccount = accounts?.find(a => a.code === "2200")

    if (arAccount && revenueAccount) {
      const { data: journalEntry } = await supabase
        .from("journal_entries")
        .insert({
          entry_number: entryNumber,
          entry_date: invoice.invoice_date,
          description: `Sale: ${invoice.description}`,
          status: "POSTED",
          posted_at: new Date().toISOString(),
          created_by: dbUser.id,
        })
        .select()
        .single()

      if (journalEntry) {
        const lineItems = [
          {
            journal_entry_id: journalEntry.id,
            account_id: arAccount.id,
            debit: invoice.total_amount,
            credit: 0,
            memo: "Amount due from customer",
          },
          {
            journal_entry_id: journalEntry.id,
            account_id: revenueAccount.id,
            debit: 0,
            credit: invoice.subtotal,
            memo: "Vehicle sale revenue",
          },
        ]

        if (invoice.tax_amount > 0 && hstAccount) {
          lineItems.push({
            journal_entry_id: journalEntry.id,
            account_id: hstAccount.id,
            debit: 0,
            credit: invoice.tax_amount,
            memo: "HST collected",
          })
        }

        await supabase.from("journal_line_items").insert(lineItems)

        await supabase
          .from("accounts_receivable")
          .update({ journal_entry_id: journalEntry.id })
          .eq("id", invoice.id)
      }
    }
  }

  return NextResponse.json({ data: invoice })
}
