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
    .eq("id", user.id)
    .single()

  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const { createJournalEntry, ...billData } = body

  // Create the bill
  const { data: bill, error: billError } = await supabase
    .from("accounts_payable")
    .insert(billData)
    .select()
    .single()

  if (billError) {
    return NextResponse.json({ error: billError.message }, { status: 500 })
  }

  // If requested, create automated journal entry
  if (createJournalEntry && bill) {
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
      .in("code", ["2000", "1200", "2200"]) // AP, Inventory, HST Payable

    const apAccount = accounts?.find(a => a.code === "2000")
    const inventoryAccount = accounts?.find(a => a.code === "1200")
    const hstAccount = accounts?.find(a => a.code === "2200")

    if (apAccount && inventoryAccount) {
      // Create journal entry
      const { data: journalEntry, error: jeError } = await supabase
        .from("journal_entries")
        .insert({
          entry_number: entryNumber,
          entry_date: bill.bill_date,
          description: `Bill: ${bill.description}`,
          status: "POSTED",
          posted_at: new Date().toISOString(),
          created_by: dbUser.id,
        })
        .select()
        .single()

      if (journalEntry) {
        // Create line items
        const lineItems = [
          {
            journal_entry_id: journalEntry.id,
            account_id: inventoryAccount.id,
            debit: bill.amount,
            credit: 0,
            memo: "Vehicle cost / expense",
          },
        ]

        // Add HST line if applicable
        if (bill.tax_amount > 0 && hstAccount) {
          lineItems.push({
            journal_entry_id: journalEntry.id,
            account_id: hstAccount.id,
            debit: bill.tax_amount,
            credit: 0,
            memo: "HST on purchase",
          })
        }

        // Credit AP
        lineItems.push({
          journal_entry_id: journalEntry.id,
          account_id: apAccount.id,
          debit: 0,
          credit: bill.total_amount,
          memo: "Amount owed to vendor",
        })

        await supabase.from("journal_line_items").insert(lineItems)

        // Link journal entry to bill
        await supabase
          .from("accounts_payable")
          .update({ journal_entry_id: journalEntry.id })
          .eq("id", bill.id)
      }
    }
  }

  return NextResponse.json({ data: bill })
}
