import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

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
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get user from public.users table
  const { data: dbUser } = await supabase
    .from("users")
    .select("id, role")
    .eq("auth_id", user.id)
    .single()

  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const { createJournalEntry, markAsPaid, ...billData } = body

  // If marked as paid, skip AP entirely and just record as direct expense
  if (markAsPaid) {
    // Generate entry number
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

    // Get GL account IDs for direct expense
    const { data: accounts } = await supabase
      .from("gl_accounts")
      .select("id, code")
      .in("code", ["1000", "1200", "1150", "5100"]) // Cash, Inventory, HST Receivable, Safety/Expense

    const cashAccount = accounts?.find(a => a.code === "1000")
    const inventoryAccount = accounts?.find(a => a.code === "1200")
    const hstReceivableAccount = accounts?.find(a => a.code === "1150") // Sales Tax Receivable (Input Tax Credits)
    const expenseAccount = accounts?.find(a => a.code === "5100") || inventoryAccount

    if (cashAccount && expenseAccount) {
      // Create journal entry directly (no AP involved)
      const { data: journalEntry, error: jeError } = await supabase
        .from("journal_entries")
        .insert({
          entry_number: entryNumber,
          entry_date: billData.bill_date,
          description: `Paid: ${billData.description}`,
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
        // Create line items - Debit expense/inventory, Credit cash
        const lineItems = [
          {
            journal_entry_id: journalEntry.id,
            account_id: expenseAccount.id,
            debit: billData.amount,
            credit: 0,
            memo: billData.description,
          },
        ]

        // Add HST line if applicable (debit HST receivable for input tax credit)
        if (billData.tax_amount > 0 && hstReceivableAccount) {
          lineItems.push({
            journal_entry_id: journalEntry.id,
            account_id: hstReceivableAccount.id,
            debit: billData.tax_amount,
            credit: 0,
            memo: "HST on purchase (input tax credit)",
          })
        }

        // Credit Cash
        lineItems.push({
          journal_entry_id: journalEntry.id,
          account_id: cashAccount.id,
          debit: 0,
          credit: billData.total_amount,
          memo: "Cash payment",
        })

        await supabase.from("journal_line_items").insert(lineItems)

        return NextResponse.json({ 
          data: { 
            journalEntry,
            message: "Expense recorded directly (paid, no AP created)" 
          } 
        })
      }
    }

    return NextResponse.json({ error: "Failed to create direct expense entry" }, { status: 500 })
  }

  // Standard flow: Always create journal entry first, then link AP to it
  // This ensures AP records are never orphaned without journal entries
  
  // Generate entry number
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

  // Get GL account IDs
  const { data: accounts } = await supabase
    .from("gl_accounts")
    .select("id, code")
    .in("code", ["2000", "1200", "1150"]) // AP, Inventory, HST Receivable

  const apAccount = accounts?.find(a => a.code === "2000")
  const inventoryAccount = accounts?.find(a => a.code === "1200")
  const hstReceivableAccount = accounts?.find(a => a.code === "1150")

  if (!apAccount || !inventoryAccount) {
    return NextResponse.json({ error: "Required GL accounts not found" }, { status: 500 })
  }

  // Create journal entry first
  const { data: journalEntry, error: jeError } = await supabase
    .from("journal_entries")
    .insert({
      entry_number: entryNumber,
      entry_date: billData.bill_date,
      description: `Bill: ${billData.description}`,
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
      account_id: inventoryAccount.id,
      debit: billData.amount,
      credit: 0,
      memo: "Vehicle cost / expense",
    },
  ]

  // Add HST line if applicable
  if (billData.tax_amount > 0 && hstReceivableAccount) {
    lineItems.push({
      journal_entry_id: journalEntry.id,
      account_id: hstReceivableAccount.id,
      debit: billData.tax_amount,
      credit: 0,
      memo: "HST on purchase (input tax credit)",
    })
  }

  // Credit AP
  lineItems.push({
    journal_entry_id: journalEntry.id,
    account_id: apAccount.id,
    debit: 0,
    credit: billData.total_amount,
    memo: "Amount owed to vendor",
  })

  await supabase.from("journal_line_items").insert(lineItems)

  // Now create the bill in AP with the journal entry linked
  const { data: bill, error: billError } = await supabase
    .from("accounts_payable")
    .insert({
      ...billData,
      journal_entry_id: journalEntry.id,
    })
    .select()
    .single()

  if (billError) {
    // Rollback: delete the journal entry if bill creation fails
    await supabase.from("journal_line_items").delete().eq("journal_entry_id", journalEntry.id)
    await supabase.from("journal_entries").delete().eq("id", journalEntry.id)
    return NextResponse.json({ error: billError.message }, { status: 500 })
  }

  return NextResponse.json({ data: bill })
}
