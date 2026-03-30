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

  const { data, error } = await supabase
    .from("vehicles")
    .update(body)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
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

  const { error } = await supabase.from("vehicles").delete().eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
