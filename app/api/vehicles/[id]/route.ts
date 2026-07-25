import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { ACCOUNTS } from "@/lib/accounting/accounts"
import { calculateTax, sumMoney, toAmount } from "@/lib/accounting/money"
import {
  PostingError,
  postJournalEntry,
  resolveActingUserId,
  reverseJournalEntry,
  type PostingLine,
} from "@/lib/accounting/posting"
import { getTaxRate } from "@/lib/accounting/tax"
import { postVehiclePurchaseEntry } from "@/lib/accounting/vehicle-entries"

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

  const actingUserId = await resolveActingUserId(supabase)

  // Re-post the acquisition entry when any cost or funding input changed.
  const costFields = [
    "purchase_price",
    "miscellaneous_cost",
    "safety_cost",
    "gas",
    "warranty_cost",
    "floorplan_interest_cost",
    "floorplan_fees",
    "purchase_payment_method",
    "purchase_hst_applicable",
    "date_acquired",
  ]
  const hasCostFieldUpdate = costFields.some((field) => body[field] !== undefined)

  const warnings: string[] = []

  if (hasCostFieldUpdate) {
    try {
      await postVehiclePurchaseEntry(supabase, data, {
        createdBy: actingUserId,
        reason: "Vehicle acquisition costs revised",
      })
    } catch (err) {
      if (err instanceof PostingError) {
        // Surface the failure instead of returning 200 with no entry written.
        return NextResponse.json(
          { error: `Vehicle saved, but the acquisition entry could not be posted: ${err.message}`, data },
          { status: 422 },
        )
      }
      throw err
    }
  }

  // Keep any linked receivable/invoice in step with the vehicle's sale terms.
  const saleFields = [
    "selling_price",
    "safety_charge",
    "warranty_charge",
    "omvic_fee",
    "registration_fee",
    "referral_amount",
  ]
  const hasSaleFieldUpdate = saleFields.some((field) => body[field] !== undefined)

  if (hasSaleFieldUpdate) {
    try {
      const result = await syncLinkedReceivable(supabase, data, actingUserId)
      warnings.push(...result.warnings)
    } catch (err) {
      if (err instanceof PostingError) {
        return NextResponse.json(
          { error: `Vehicle saved, but the sale entry could not be re-posted: ${err.message}`, data },
          { status: 422 },
        )
      }
      throw err
    }
  }

  return NextResponse.json({ data, warnings: warnings.length ? warnings : undefined })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("purchase_journal_entry_id, stock_number")
    .eq("id", id)
    .single()

  const actingUserId = await resolveActingUserId(supabase)

  // Posted entries are immutable: reverse rather than delete, so the audit
  // trail survives the vehicle record.
  if (vehicle?.purchase_journal_entry_id) {
    await reverseJournalEntry(supabase, vehicle.purchase_journal_entry_id as string, {
      reason: `Vehicle ${vehicle.stock_number ?? id} deleted`,
      createdBy: actingUserId,
    })
    await supabase
      .from("vehicles")
      .update({ purchase_journal_entry_id: null })
      .eq("id", id)
  }

  const { error } = await supabase.from("vehicles").delete().eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

/**
 * Recompute a vehicle's invoice totals and re-post its sale entry.
 *
 * Corrections are made by reversing the prior entry and posting a replacement,
 * so the general ledger keeps a complete history.
 */
async function syncLinkedReceivable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vehicle: Record<string, unknown>,
  actingUserId: string | null,
): Promise<{ warnings: string[] }> {
  const warnings: string[] = []

  // Look at every receivable for the unit, not just UNPAID ones -- restricting
  // to UNPAID let a partially-paid invoice silently diverge from the vehicle.
  const { data: linkedAR } = await supabase
    .from("accounts_receivable")
    .select("id, journal_entry_id, status, amount_paid")
    .eq("vehicle_id", vehicle.id as string)

  if (!linkedAR || linkedAR.length === 0) return { warnings }

  const taxRate = getTaxRate(vehicle.date_sold as string | null)

  const sellingPrice = toAmount(vehicle.selling_price)
  const safetyCharge = toAmount(vehicle.safety_charge)
  const warrantyCharge = toAmount(vehicle.warranty_charge)
  const omvicFee = toAmount(vehicle.omvic_fee)
  // MTO registration is collected as agent for the ministry: a pass-through
  // liability, not revenue, and not taxable.
  const registrationFee = toAmount(vehicle.registration_fee)
  const referralAmount = toAmount(vehicle.referral_amount)

  const taxableSubtotal = sumMoney([sellingPrice, safetyCharge, warrantyCharge, omvicFee])
  const taxAmount = calculateTax(taxableSubtotal, taxRate)
  const totalAmount = sumMoney([taxableSubtotal, taxAmount, registrationFee])

  const description = `Vehicle sale: ${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""} (${vehicle.stock_number ?? ""})`.trim()

  for (const ar of linkedAR) {
    const amountPaid = toAmount(ar.amount_paid)

    if (amountPaid > totalAmount) {
      warnings.push(
        `Receivable is already paid ${amountPaid.toFixed(2)} but the revised invoice total is ` +
          `${totalAmount.toFixed(2)}. Issue a refund or credit note rather than reducing the invoice.`,
      )
      continue
    }

    await supabase
      .from("accounts_receivable")
      .update({
        subtotal: sumMoney([taxableSubtotal, registrationFee]),
        tax_amount: taxAmount,
        total_amount: totalAmount,
        description,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ar.id)

    if (!ar.journal_entry_id) continue

    await reverseJournalEntry(supabase, ar.journal_entry_id as string, {
      reason: "Sale terms revised",
      createdBy: actingUserId,
    })

    const lines: PostingLine[] = [
      {
        code: ACCOUNTS.ACCOUNTS_RECEIVABLE,
        debit: totalAmount,
        memo: "Accounts receivable - customer",
      },
    ]

    if (sellingPrice > 0) {
      lines.push({ code: ACCOUNTS.VEHICLE_SALES, credit: sellingPrice, memo: "Vehicle sales revenue" })
    }
    if (safetyCharge > 0) {
      lines.push({ code: ACCOUNTS.SAFETY_REVENUE, credit: safetyCharge, memo: "Safety certification revenue" })
    }
    if (warrantyCharge > 0) {
      lines.push({ code: ACCOUNTS.WARRANTY_REVENUE, credit: warrantyCharge, memo: "Warranty revenue" })
    }
    if (omvicFee > 0) {
      lines.push({ code: ACCOUNTS.OMVIC_REVENUE, credit: omvicFee, memo: "OMVIC fee recovered" })
    }
    if (registrationFee > 0) {
      lines.push({
        code: ACCOUNTS.REGISTRATION_PAYABLE,
        credit: registrationFee,
        memo: "Registration collected on behalf of MTO (pass-through)",
      })
    }
    if (taxAmount > 0) {
      lines.push({ code: ACCOUNTS.HST_PAYABLE, credit: taxAmount, memo: "HST collected on sale" })
    }

    const entry = await postJournalEntry(supabase, {
      entryDate: new Date().toISOString().split("T")[0],
      description,
      lines,
      createdBy: actingUserId,
    })

    await supabase
      .from("accounts_receivable")
      .update({ journal_entry_id: entry.id })
      .eq("id", ar.id)

    // Referral paid to a third party is an expense, not a reduction of revenue.
    if (referralAmount > 0) {
      await postJournalEntry(supabase, {
        entryDate: new Date().toISOString().split("T")[0],
        description: `Referral fee - ${vehicle.stock_number ?? ""}`.trim(),
        lines: [
          { code: ACCOUNTS.REFERRAL_FEES, debit: referralAmount, memo: "Referral fee expense" },
          { code: ACCOUNTS.ACCOUNTS_PAYABLE, credit: referralAmount, memo: "Referral fee payable" },
        ],
        createdBy: actingUserId,
      })
    }
  }

  return { warnings }
}
