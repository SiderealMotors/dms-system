import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const TAX_RATE = 0.13

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

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  const { data: dbUser } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", user?.id)
    .single()

  // Get vehicle info for journal entry description
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("year, make, model, stock_number")
    .eq("id", vehicleId)
    .single()

  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 })
  }

  // Calculate amounts
  const amount = Number(body.amount) || 0
  const isTaxable = body.is_taxable !== false
  const taxAmount = isTaxable ? amount * TAX_RATE : 0
  const totalAmount = amount + taxAmount

  // Create journal entry first (assume paid in cash)
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
    .in("code", ["1000", "1200", "1150", "5100"]) // Cash, Inventory, HST Receivable, Operating Expenses

  const cashAccount = accounts?.find(a => a.code === "1000")
  const inventoryAccount = accounts?.find(a => a.code === "1200")
  const hstReceivableAccount = accounts?.find(a => a.code === "1150")
  const expenseAccount = accounts?.find(a => a.code === "5100")

  if (!cashAccount || !inventoryAccount) {
    return NextResponse.json({ error: "Required GL accounts not found" }, { status: 500 })
  }

  // Determine which account to debit based on expense type
  // Inventory-related expenses go to Inventory, others go to Operating Expenses
  const inventoryExpenseTypes = ['REPAIR', 'PARTS', 'DETAILING', 'INSPECTION']
  const debitAccount = inventoryExpenseTypes.includes(body.expense_type) 
    ? inventoryAccount 
    : (expenseAccount || inventoryAccount)

  // Create journal entry
  const { data: journalEntry, error: jeError } = await supabase
    .from("journal_entries")
    .insert({
      entry_number: entryNumber,
      entry_date: body.expense_date || new Date().toISOString().split("T")[0],
      description: `Vehicle Expense (${body.expense_type}): ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.stock_number}) - ${body.description}`,
      status: "POSTED",
      posted_at: new Date().toISOString(),
      created_by: dbUser?.id || null,
    })
    .select()
    .single()

  if (jeError || !journalEntry) {
    return NextResponse.json({ error: jeError?.message || "Failed to create journal entry" }, { status: 500 })
  }

  // Create line items
  const lineItems: Array<{
    journal_entry_id: string
    account_id: string
    debit: number
    credit: number
    memo: string
  }> = []

  // Debit expense/inventory account
  lineItems.push({
    journal_entry_id: journalEntry.id,
    account_id: debitAccount.id,
    debit: amount,
    credit: 0,
    memo: `${body.expense_type}: ${body.description}`,
  })

  // Debit HST Receivable if taxable
  if (taxAmount > 0 && hstReceivableAccount) {
    lineItems.push({
      journal_entry_id: journalEntry.id,
      account_id: hstReceivableAccount.id,
      debit: taxAmount,
      credit: 0,
      memo: "HST on expense (input tax credit)",
    })
  }

  // Credit Cash
  lineItems.push({
    journal_entry_id: journalEntry.id,
    account_id: cashAccount.id,
    debit: 0,
    credit: totalAmount,
    memo: "Cash payment for vehicle expense",
  })

  await supabase.from("journal_line_items").insert(lineItems)

  // Create the expense record
  const { data: expense, error: expenseError } = await supabase
    .from("vehicle_expenses")
    .insert({
      vehicle_id: vehicleId,
      expense_date: body.expense_date || new Date().toISOString().split("T")[0],
      expense_type: body.expense_type,
      description: body.description,
      notes: body.notes || null,
      amount: amount,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      is_taxable: isTaxable,
      vendor_id: body.vendor_id || null,
      journal_entry_id: journalEntry.id,
      created_by: dbUser?.id || null,
    })
    .select()
    .single()

  if (expenseError) {
    // Rollback journal entry if expense creation fails
    await supabase.from("journal_line_items").delete().eq("journal_entry_id", journalEntry.id)
    await supabase.from("journal_entries").delete().eq("id", journalEntry.id)
    return NextResponse.json({ error: expenseError.message }, { status: 500 })
  }

  return NextResponse.json({ data: expense }, { status: 201 })
}
