import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  return NextResponse.json({ data })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const body = await request.json()

  // Get the current vehicle data first to compare changes
  const { data: currentVehicle } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", id)
    .single()

  const { data, error } = await supabase
    .from("vehicles")
    .update(body)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Check if purchase & cost fields were updated
  const costFields = ['purchase_price', 'miscellaneous_cost', 'safety_cost', 'gas', 'warranty_cost', 'floorplan_interest_cost', 'floorplan_fees']
  const hasCostFieldUpdate = costFields.some(field => body[field] !== undefined)

  console.log("[v0] PUT vehicle - body keys:", Object.keys(body))
  console.log("[v0] PUT vehicle - hasCostFieldUpdate:", hasCostFieldUpdate)
  console.log("[v0] PUT vehicle - costFields in body:", costFields.filter(f => body[f] !== undefined))

  if (hasCostFieldUpdate) {
    console.log("[v0] Calling updateVehiclePurchaseEntries for vehicle:", data.id)
    await updateVehiclePurchaseEntries(supabase, data, currentVehicle)
    console.log("[v0] Completed updateVehiclePurchaseEntries")
  }

  // If vehicle has sale-related fields updated, sync with linked AR/invoice
  const saleFields = ['selling_price', 'safety_charge', 'warranty_charge', 'omvic_fee', 'registration_fee', 'referral_amount']
  const hasSaleFieldUpdate = saleFields.some(field => body[field] !== undefined)

  if (hasSaleFieldUpdate) {
    // Find any linked accounts receivable for this vehicle
    const { data: linkedAR } = await supabase
      .from("accounts_receivable")
      .select("id, journal_entry_id")
      .eq("vehicle_id", id)
      .eq("status", "UNPAID")

    if (linkedAR && linkedAR.length > 0) {
      const TAX_RATE = 0.13
      
      // Calculate new invoice totals from vehicle data
      const sellingPrice = Number(data.selling_price) || 0
      const safetyCharge = Number(data.safety_charge) || 0
      const warrantyCharge = Number(data.warranty_charge) || 0
      const omvicFee = Number(data.omvic_fee) || 0
      const registrationFee = Number(data.registration_fee) || 0 // Not taxable
      const referralAmount = Number(data.referral_amount) || 0 // Not taxable, income
      
      // Taxable items
      const taxableSubtotal = sellingPrice + safetyCharge + warrantyCharge + omvicFee
      const taxAmount = taxableSubtotal * TAX_RATE
      const totalAmount = taxableSubtotal + taxAmount + registrationFee

      // Update AR record
      for (const ar of linkedAR) {
        await supabase
          .from("accounts_receivable")
          .update({
            subtotal: taxableSubtotal + registrationFee,
            tax_amount: taxAmount,
            total_amount: totalAmount,
            description: `Vehicle Sale: ${data.year} ${data.make} ${data.model} (${data.stock_number})`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", ar.id)

        // If there's a linked journal entry, update it too
        if (ar.journal_entry_id) {
          // Get GL account IDs
          const { data: accounts } = await supabase
            .from("gl_accounts")
            .select("id, code")
            .in("code", ["1100", "4000", "2200"])

          const arAccountId = accounts?.find(a => a.code === "1100")?.id
          const salesRevenueId = accounts?.find(a => a.code === "4000")?.id
          const hstPayableId = accounts?.find(a => a.code === "2200")?.id

          if (arAccountId && salesRevenueId && hstPayableId) {
            // Delete old line items
            await supabase
              .from("journal_line_items")
              .delete()
              .eq("journal_entry_id", ar.journal_entry_id)

            // Insert updated line items
            await supabase
              .from("journal_line_items")
              .insert([
                {
                  journal_entry_id: ar.journal_entry_id,
                  account_id: arAccountId,
                  debit: totalAmount,
                  credit: 0,
                  memo: "Accounts Receivable",
                },
                {
                  journal_entry_id: ar.journal_entry_id,
                  account_id: salesRevenueId,
                  debit: 0,
                  credit: taxableSubtotal + registrationFee,
                  memo: "Vehicle Sale Revenue",
                },
                {
                  journal_entry_id: ar.journal_entry_id,
                  account_id: hstPayableId,
                  debit: 0,
                  credit: taxAmount,
                  memo: "HST Collected",
                },
              ])

            // Update journal entry description
            await supabase
              .from("journal_entries")
              .update({
                description: `Vehicle Sale: ${data.year} ${data.make} ${data.model} (${data.stock_number})`,
                updated_at: new Date().toISOString(),
              })
              .eq("id", ar.journal_entry_id)
          }
        }
      }
    }
  }

  return NextResponse.json({ data })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  // Get the vehicle to find its linked journal entry
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("purchase_journal_entry_id")
    .eq("id", id)
    .single()

  // Delete the linked purchase journal entry if it exists
  if (vehicle?.purchase_journal_entry_id) {
    await supabase.from("journal_line_items").delete().eq("journal_entry_id", vehicle.purchase_journal_entry_id)
    await supabase.from("journal_entries").delete().eq("id", vehicle.purchase_journal_entry_id)
  }

  const { error } = await supabase.from("vehicles").delete().eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// Helper function to update/recreate journal entries for vehicle purchase & costs
async function updateVehiclePurchaseEntries(
  supabase: Awaited<ReturnType<typeof createClient>>, 
  vehicle: Record<string, unknown>,
  previousVehicle: Record<string, unknown> | null
) {
  console.log("[v0] updateVehiclePurchaseEntries called")
  console.log("[v0] Vehicle:", vehicle.id, vehicle.stock_number)
  console.log("[v0] Vehicle costs - purchase_price:", vehicle.purchase_price, "floorplan_interest_cost:", vehicle.floorplan_interest_cost)
  
  const TAX_RATE = 0.13
  
  // Get GL account IDs
  const { data: accounts, error: accountsError } = await supabase
    .from("gl_accounts")
    .select("id, code")
    .in("code", ["1000", "1200", "1150", "5100", "5300"]) // Cash, Inventory, HST Receivable, Operating Exp, Interest Exp

  console.log("[v0] GL accounts found:", accounts?.length, "error:", accountsError?.message)

  if (!accounts || accounts.length === 0) {
    console.log("[v0] No GL accounts found, returning early")
    return
  }

  const cashAccount = accounts.find(a => a.code === "1000")
  const inventoryAccount = accounts.find(a => a.code === "1200")
  const hstReceivableAccount = accounts.find(a => a.code === "1150")
  const expenseAccount = accounts.find(a => a.code === "5100")
  const interestExpenseAccount = accounts.find(a => a.code === "5300") || expenseAccount

  if (!cashAccount || !inventoryAccount) return

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  const { data: dbUser } = await supabase.from("users").select("id").eq("auth_id", user?.id).single()

  // If there's an existing purchase journal entry, delete it first
  const existingJEId = vehicle.purchase_journal_entry_id as string | null
  if (existingJEId) {
    await supabase.from("journal_line_items").delete().eq("journal_entry_id", existingJEId)
    await supabase.from("journal_entries").delete().eq("id", existingJEId)
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

  // Calculate total taxable costs
  const totalTaxableAmount = taxableCosts.reduce((sum, c) => sum + c.amount, 0)
  const totalNonTaxableAmount = nonTaxableCosts.reduce((sum, c) => sum + c.amount, 0)
  
  console.log("[v0] totalTaxableAmount:", totalTaxableAmount, "totalNonTaxableAmount:", totalNonTaxableAmount)
  
  if (totalTaxableAmount === 0 && totalNonTaxableAmount === 0) {
    // Clear the journal entry link since there are no costs
    console.log("[v0] No costs - clearing journal entry link")
    await supabase.from("vehicles").update({ purchase_journal_entry_id: null }).eq("id", vehicle.id)
    return
  }

  const totalTax = totalTaxableAmount * TAX_RATE
  const grandTotal = totalTaxableAmount + totalTax + totalNonTaxableAmount
  
  console.log("[v0] Creating journal entry - totalTax:", totalTax, "grandTotal:", grandTotal)

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

  // Create new journal entry
  const { data: journalEntry, error: jeError } = await supabase
    .from("journal_entries")
    .insert({
      entry_number: entryNumber,
      entry_date: (vehicle.date_acquired as string) || new Date().toISOString().split("T")[0],
      description: `Vehicle Purchase: ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.stock_number})`,
      status: "POSTED",
      posted_at: new Date().toISOString(),
      created_by: dbUser?.id || null,
    })
    .select()
    .single()

  if (jeError || !journalEntry) {
    console.log("[v0] Failed to create journal entry:", jeError?.message)
    return
  }
  console.log("[v0] Created journal entry:", journalEntry.id, journalEntry.entry_number)

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
    memo: "Cash payment for vehicle costs",
  })

  await supabase.from("journal_line_items").insert(lineItems)

  // Link the journal entry to the vehicle
  await supabase
    .from("vehicles")
    .update({ purchase_journal_entry_id: journalEntry.id })
    .eq("id", vehicle.id)
}
