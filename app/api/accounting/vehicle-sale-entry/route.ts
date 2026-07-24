import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

interface VehicleSaleData {
  vehicleId: string
  sellingPrice: number
  purchasePrice: number
  safetyCost: number
  safetyCharge: number
  warrantyCost: number
  warrantyCharge: number
  floorplanInterest: number
  gas: number
  referralAmount: number
  buyerName: string
  stockNumber: string
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const body: VehicleSaleData = await request.json()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get GL account IDs
  const { data: accounts } = await supabase
    .from("gl_accounts")
    .select("id, code")
  
  if (!accounts) {
    return NextResponse.json({ error: "Could not fetch GL accounts" }, { status: 500 })
  }

  const getAccountId = (code: string) => accounts.find(a => a.code === code)?.id

  // Generate entry number
  const { count } = await supabase
    .from("journal_entries")
    .select("*", { count: "exact", head: true })
  const entryNumber = `JE${String((count || 0) + 1).padStart(5, "0")}`

  // Calculate totals
  const totalRevenue = body.sellingPrice + body.safetyCharge + body.warrantyCharge
  const totalCost = body.purchasePrice + body.safetyCost + body.warrantyCost + 
                   body.floorplanInterest + body.gas + body.referralAmount

  // Create journal entry for vehicle sale
  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .insert({
      entry_number: entryNumber,
      entry_date: new Date().toISOString().split("T")[0],
      description: `Vehicle Sale - ${body.stockNumber} to ${body.buyerName}`,
      status: "POSTED",
      created_by: user.id,
      posted_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (entryError) {
    return NextResponse.json({ error: entryError.message }, { status: 500 })
  }

  // Create line items
  const lineItems = []

  // Debit: Cash/AR for total received
  if (totalRevenue > 0) {
    lineItems.push({
      journal_entry_id: entry.id,
      account_id: getAccountId("1010"), // Bank Account - Operating
      debit: totalRevenue,
      credit: 0,
      memo: "Cash received from vehicle sale",
    })
  }

  // Credit: Vehicle Sales Revenue
  if (body.sellingPrice > 0) {
    lineItems.push({
      journal_entry_id: entry.id,
      account_id: getAccountId("4000"), // Vehicle Sales Revenue
      debit: 0,
      credit: body.sellingPrice,
      memo: "Vehicle selling price",
    })
  }

  // Credit: Safety Charge Revenue
  if (body.safetyCharge > 0) {
    lineItems.push({
      journal_entry_id: entry.id,
      account_id: getAccountId("4100"), // Safety Charge Revenue
      debit: 0,
      credit: body.safetyCharge,
      memo: "Safety charge to customer",
    })
  }

  // Credit: Warranty Revenue
  if (body.warrantyCharge > 0) {
    lineItems.push({
      journal_entry_id: entry.id,
      account_id: getAccountId("4200"), // Warranty Revenue
      debit: 0,
      credit: body.warrantyCharge,
      memo: "Warranty charge to customer",
    })
  }

  // Debit: Cost of Vehicles Sold
  if (body.purchasePrice > 0) {
    lineItems.push({
      journal_entry_id: entry.id,
      account_id: getAccountId("5000"), // Cost of Vehicles Sold
      debit: body.purchasePrice,
      credit: 0,
      memo: "Vehicle purchase cost",
    })
  }

  // Credit: Vehicle Inventory (reduce inventory)
  if (body.purchasePrice > 0) {
    lineItems.push({
      journal_entry_id: entry.id,
      account_id: getAccountId("1200"), // Vehicle Inventory
      debit: 0,
      credit: body.purchasePrice,
      memo: "Remove vehicle from inventory",
    })
  }

  // Debit: Safety Costs
  if (body.safetyCost > 0) {
    lineItems.push({
      journal_entry_id: entry.id,
      account_id: getAccountId("5100"), // Safety Costs
      debit: body.safetyCost,
      credit: 0,
      memo: "Safety inspection cost",
    })
  }

  // Debit: Warranty Costs
  if (body.warrantyCost > 0) {
    lineItems.push({
      journal_entry_id: entry.id,
      account_id: getAccountId("5200"), // Warranty Costs
      debit: body.warrantyCost,
      credit: 0,
      memo: "Warranty cost",
    })
  }

  // Debit: Floorplan Interest
  if (body.floorplanInterest > 0) {
    lineItems.push({
      journal_entry_id: entry.id,
      account_id: getAccountId("5400"), // Floorplan Interest
      debit: body.floorplanInterest,
      credit: 0,
      memo: "Floorplan interest expense",
    })
  }

  // Debit: Gas
  if (body.gas > 0) {
    lineItems.push({
      journal_entry_id: entry.id,
      account_id: getAccountId("6900"), // Fuel & Gas
      debit: body.gas,
      credit: 0,
      memo: "Gas expense",
    })
  }

  // Debit: Referral Fee
  if (body.referralAmount > 0) {
    lineItems.push({
      journal_entry_id: entry.id,
      account_id: getAccountId("7000"), // Referral Fees
      debit: body.referralAmount,
      credit: 0,
      memo: "Referral fee",
    })
  }

  // Insert all line items
  const { error: lineItemsError } = await supabase
    .from("journal_line_items")
    .insert(lineItems.filter(item => item.account_id))

  if (lineItemsError) {
    // Rollback
    await supabase.from("journal_entries").delete().eq("id", entry.id)
    return NextResponse.json({ error: lineItemsError.message }, { status: 500 })
  }

  // Fetch complete entry
  const { data: completeEntry } = await supabase
    .from("journal_entries")
    .select(`
      *,
      line_items:journal_line_items(*, account:gl_accounts(*))
    `)
    .eq("id", entry.id)
    .single()

  return NextResponse.json({ data: completeEntry }, { status: 201 })
}
