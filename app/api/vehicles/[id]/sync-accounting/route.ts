import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { PostingError, resolveActingUserId } from "@/lib/accounting/posting"
import { postVehiclePurchaseEntry } from "@/lib/accounting/vehicle-entries"

/**
 * Re-post the acquisition entry for a vehicle.
 *
 * Delegates to the shared posting engine, which reverses any existing entry
 * rather than deleting it. This route previously held a third copy of the
 * purchase logic -- with its own account mapping and its own tax rate -- so the
 * books differed depending on which endpoint happened to run.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: vehicle, error: vehicleError } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", id)
    .single()

  if (vehicleError || !vehicle) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 })
  }

  const actingUserId = await resolveActingUserId(supabase)

  try {
    const { entryId, entryNumber, totals } = await postVehiclePurchaseEntry(
      supabase,
      vehicle,
      { createdBy: actingUserId, reason: "Acquisition entry re-synced" },
    )

    if (!entryId) {
      return NextResponse.json({ message: "No costs to record", journalEntryId: null })
    }

    return NextResponse.json({
      message: "Accounting entries created successfully",
      journalEntryId: entryId,
      entryNumber,
      capitalizedCost: totals.capitalizedCost,
      periodCost: totals.periodCost,
      taxAmount: totals.taxAmount,
      totalAmount: totals.grandTotal,
    })
  } catch (err) {
    if (err instanceof PostingError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    throw err
  }
}
