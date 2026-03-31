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
    .eq("auth_id", user.id)
    .single()

  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const { createJournalEntry, markAsPaid, ...invoiceData } = body

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
  const invoiceNumber = invoiceData.invoice_number || `INV-${String(nextNum).padStart(5, "0")}`
  invoiceData.invoice_number = invoiceNumber

  // If marked as paid, skip AR and record as direct cash receipt
  if (markAsPaid) {
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

    // Get GL account IDs for direct cash receipt
    const { data: accounts } = await supabase
      .from("gl_accounts")
      .select("id, code")
      .in("code", ["1000", "4000", "2200"]) // Cash, Sales Revenue, HST Payable

    const cashAccount = accounts?.find(a => a.code === "1000")
    const revenueAccount = accounts?.find(a => a.code === "4000")
    const hstAccount = accounts?.find(a => a.code === "2200")

    if (cashAccount && revenueAccount) {
      // Create journal entry directly (no AR involved)
      const { data: journalEntry, error: jeError } = await supabase
        .from("journal_entries")
        .insert({
          entry_number: entryNumber,
          entry_date: invoiceData.invoice_date,
          description: `Paid Sale: ${invoiceData.description}`,
          status: "POSTED",
          posted_at: new Date().toISOString(),
          created_by: dbUser.id,
        })
        .select()
        .single()

      if (jeError) {
        return NextResponse.json({ error: jeError.message }, { status: 500 })
      }

      if (journalEntry) {
        // Create line items - Debit cash, Credit revenue and HST
        const lineItems = [
          {
            journal_entry_id: journalEntry.id,
            account_id: cashAccount.id,
            debit: invoiceData.total_amount,
            credit: 0,
            memo: "Cash received",
          },
          {
            journal_entry_id: journalEntry.id,
            account_id: revenueAccount.id,
            debit: 0,
            credit: invoiceData.subtotal,
            memo: invoiceData.description,
          },
        ]

        // Add HST line if applicable
        if (invoiceData.tax_amount > 0 && hstAccount) {
          lineItems.push({
            journal_entry_id: journalEntry.id,
            account_id: hstAccount.id,
            debit: 0,
            credit: invoiceData.tax_amount,
            memo: "HST collected",
          })
        }

        await supabase.from("journal_line_items").insert(lineItems)

        return NextResponse.json({ 
          data: { 
            journalEntry,
            message: "Sale recorded directly (paid, no AR created)" 
          } 
        })
      }
    }

    return NextResponse.json({ error: "Failed to create direct sale entry" }, { status: 500 })
  }

  // Standard flow: Always create journal entry first, then link AR to it
  // This ensures AR records are never orphaned without journal entries
  
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

  if (!arAccount || !revenueAccount) {
    return NextResponse.json({ error: "Required GL accounts not found" }, { status: 500 })
  }

  // Create journal entry first
  const { data: journalEntry, error: jeError } = await supabase
    .from("journal_entries")
    .insert({
      entry_number: entryNumber,
      entry_date: invoiceData.invoice_date,
      description: `Sale: ${invoiceData.description}`,
      status: "POSTED",
      posted_at: new Date().toISOString(),
      created_by: dbUser.id,
    })
    .select()
    .single()

  if (jeError || !journalEntry) {
    return NextResponse.json({ error: jeError?.message || "Failed to create journal entry" }, { status: 500 })
  }

  // Create line items
  const lineItems = [
    {
      journal_entry_id: journalEntry.id,
      account_id: arAccount.id,
      debit: invoiceData.total_amount,
      credit: 0,
      memo: "Amount due from customer",
    },
    {
      journal_entry_id: journalEntry.id,
      account_id: revenueAccount.id,
      debit: 0,
      credit: invoiceData.subtotal,
      memo: "Vehicle sale revenue",
    },
  ]

  // Add HST line if applicable
  if (invoiceData.tax_amount > 0 && hstAccount) {
    lineItems.push({
      journal_entry_id: journalEntry.id,
      account_id: hstAccount.id,
      debit: 0,
      credit: invoiceData.tax_amount,
      memo: "HST collected",
    })
  }

  await supabase.from("journal_line_items").insert(lineItems)

  // Now create the invoice in AR with the journal entry linked
  const { data: invoice, error: invError } = await supabase
    .from("accounts_receivable")
    .insert({
      ...invoiceData,
      journal_entry_id: journalEntry.id,
    })
    .select()
    .single()

  if (invError) {
    // Rollback: delete the journal entry if invoice creation fails
    await supabase.from("journal_line_items").delete().eq("journal_entry_id", journalEntry.id)
    await supabase.from("journal_entries").delete().eq("id", journalEntry.id)
    return NextResponse.json({ error: invError.message }, { status: 500 })
  }

  return NextResponse.json({ data: invoice })
}
