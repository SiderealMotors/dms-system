import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// POST - Generate accounting entries for a vehicle that doesn't have them
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  // Get the vehicle
  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", id)
    .single()

  if (vehicleError || !vehicle) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 })
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  const { data: dbUser } = await supabase.from("users").select("id").eq("auth_id", user?.id).single()

  const TAX_RATE = 0.13

  // Get GL account IDs
  const { data: accounts } = await supabase
    .from("gl_accounts")
    .select("id, code")
    .in("code", ["1000", "1200", "1150", "5100", "5300"])

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ error: "GL accounts not found" }, { status: 500 })
  }

  const cashAccount = accounts.find(a => a.code === "1000")
  const inventoryAccount = accounts.find(a => a.code === "1200")
  const hstReceivableAccount = accounts.find(a => a.code === "1150")
  const expenseAccount = accounts.find(a => a.code === "5100")
  const interestExpenseAccount = accounts.find(a => a.code === "5300") || expenseAccount

  if (!cashAccount || !inventoryAccount) {
    return NextResponse.json({ error: "Required GL accounts not found" }, { status: 500 })
  }

  // Delete existing journal entry if it exists
  if (vehicle.purchase_journal_entry_id) {
    await supabase.from("journal_line_items").delete().eq("journal_entry_id", vehicle.purchase_journal_entry_id)
    await supabase.from("journal_entries").delete().eq("id", vehicle.purchase_journal_entry_id)
  }

  // Cost items that need journal entries (taxable costs)
  const taxableCosts = [
    { field: 'purchase_price', amount: Number(vehicle.purchase_price) || 0, memo: 'Vehicle Purchase', account: inventoryAccount },
    { field: 'miscellaneous_cost', amount: Number(vehicle.miscellaneous_cost) || 0, memo: 'Miscellaneous Cost', account: inventoryAccount },
    { field: 'safety_cost', amount: Number(vehicle.safety_cost) || 0, memo: 'Safety Inspection', account: inventoryAccount },
    { field: 'gas', amount: Number(vehicle.gas) || 0, memo: 'Gas/Fuel', account: expenseAccount },
    { field: 'warranty_cost', amount: Number(vehicle.warranty_cost) || 0, memo: 'Warranty Cost', account: expenseAccount },
  ]

  // Non-taxable costs (interest/fees)
  const nonTaxableCosts = [
    { field: 'floorplan_interest_cost', amount: Number(vehicle.floorplan_interest_cost) || 0, memo: 'Floorplan Interest', account: interestExpenseAccount },
    { field: 'floorplan_fees', amount: Number(vehicle.floorplan_fees) || 0, memo: 'Floorplan Fees', account: expenseAccount },
  ]

  // Calculate totals
  const totalTaxableAmount = taxableCosts.reduce((sum, c) => sum + c.amount, 0)
  const totalNonTaxableAmount = nonTaxableCosts.reduce((sum, c) => sum + c.amount, 0)

  if (totalTaxableAmount === 0 && totalNonTaxableAmount === 0) {
    // Clear the journal entry link since there are no costs
    await supabase.from("vehicles").update({ purchase_journal_entry_id: null }).eq("id", vehicle.id)
    return NextResponse.json({ message: "No costs to record", journalEntryId: null })
  }

  const totalTax = totalTaxableAmount * TAX_RATE
  const grandTotal = totalTaxableAmount + totalTax + totalNonTaxableAmount

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

  // Create journal entry
  const { data: journalEntry, error: jeError } = await supabase
    .from("journal_entries")
    .insert({
      entry_number: entryNumber,
      entry_date: vehicle.date_acquired || new Date().toISOString().split("T")[0],
      description: `Vehicle Purchase: ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.stock_number})`,
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

  // Add taxable cost items (debit to appropriate accounts)
  for (const cost of taxableCosts) {
    if (cost.amount > 0 && cost.account) {
      lineItems.push({
        journal_entry_id: journalEntry.id,
        account_id: cost.account.id,
        debit: cost.amount,
        credit: 0,
        memo: cost.memo,
      })
    }
  }

  // Add non-taxable cost items
  for (const cost of nonTaxableCosts) {
    if (cost.amount > 0 && cost.account) {
      lineItems.push({
        journal_entry_id: journalEntry.id,
        account_id: cost.account.id,
        debit: cost.amount,
        credit: 0,
        memo: cost.memo,
      })
    }
  }

  // Add HST (Sales Tax Receivable) for input tax credits
  if (totalTax > 0 && hstReceivableAccount) {
    lineItems.push({
      journal_entry_id: journalEntry.id,
      account_id: hstReceivableAccount.id,
      debit: totalTax,
      credit: 0,
      memo: "HST on purchases (input tax credit)",
    })
  }

  // Credit Cash for total paid
  lineItems.push({
    journal_entry_id: journalEntry.id,
    account_id: cashAccount.id,
    debit: 0,
    credit: grandTotal,
    memo: "Cash payment for vehicle purchase",
  })

  await supabase.from("journal_line_items").insert(lineItems)

  // Link the journal entry to the vehicle
  await supabase
    .from("vehicles")
    .update({ purchase_journal_entry_id: journalEntry.id })
    .eq("id", vehicle.id)

  return NextResponse.json({ 
    message: "Accounting entries created successfully",
    journalEntryId: journalEntry.id,
    entryNumber: journalEntry.entry_number,
    totalAmount: grandTotal,
    lineItemsCount: lineItems.length
  })
}
