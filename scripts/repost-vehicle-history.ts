/**
 * Reverses and reposts the existing vehicle purchase/sale entries under the
 * corrected posting rules.
 *
 * Defects in the existing entries, confirmed against the live ledger:
 *   - JE-00001 (sale) is dated 2026-03-31 while date_sold is 2025-07-07. The
 *     old code used `new Date()` instead of the transaction date, pushing the
 *     sale into the wrong fiscal year.
 *   - JE-00001 records no COGS and no inventory relief, so 13,442.54 of cost
 *     for a sold car still sits in Vehicle Inventory and gross profit is
 *     overstated by that amount.
 *   - JE-00001 omits the 300.00 referral and the 1,000.00 deposit.
 *   - JE-00002 posts floorplan interest to 5300 Reconditioning Costs and gas
 *     to 5100 Cost of Parts Sold; neither belongs there.
 *   - JE-00002 credits Cash for the whole purchase though payment_method is
 *     BANK_DRAFT, leaving Cash at -16,741.79.
 *
 * Nothing is deleted. Each original is marked REVERSED and offset by a dated
 * mirror entry, then a corrected entry is posted.
 *
 * Dry run by default. Pass --commit to write.
 *
 *   npx tsx scripts/repost-vehicle-history.ts
 *   npx tsx scripts/repost-vehicle-history.ts --commit
 */
import { createClient } from "@supabase/supabase-js"
import { ACCOUNTS } from "../lib/accounting/accounts"
import { roundMoney, sumMoney, toAmount, calculateTax } from "../lib/accounting/money"
import { getTaxRate } from "../lib/accounting/tax"
import {
  balanceLines,
  postJournalEntry,
  reverseJournalEntry,
  type PostingLine,
} from "../lib/accounting/posting"
import {
  buildVehiclePurchaseLines,
  buildInventoryReliefLines,
  getCapitalizedInventoryCost,
} from "../lib/accounting/vehicle-entries"

const COMMIT = process.argv.includes("--commit")

// The posting helpers are typed against the app's server client. The service
// client exposes the same query surface for what they use.
type AnyClient = Parameters<typeof postJournalEntry>[0]

function money(n: number) {
  return n.toFixed(2).padStart(12)
}

function printLines(title: string, lines: PostingLine[]) {
  console.log(`\n  ${title}`)
  const { totalDebit, totalCredit } = balanceLines(lines)
  for (const l of lines) {
    console.log(
      `    ${l.code.padEnd(6)} D${money(toAmount(l.debit))} C${money(toAmount(l.credit))}  ${l.memo}`,
    )
  }
  console.log(`    ${"".padEnd(6)}  ${money(totalDebit)}  ${money(totalCredit)}  <- must be equal`)
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("Supabase env vars are not set")
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  }) as unknown as AnyClient

  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("*")
    .not("date_sold", "is", null)

  if (!vehicles?.length) {
    console.log("No sold vehicles found.")
    return
  }

  console.log(COMMIT ? "=== COMMIT ===" : "=== DRY RUN (pass --commit to write) ===")

  for (const vehicle of vehicles as Record<string, unknown>[]) {
    const id = vehicle.id as string
    const label = `${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.stock_number})`
    console.log(`\n${"=".repeat(72)}\n${label}`)

    const purchaseDate = String(vehicle.date_acquired).slice(0, 10)
    const saleDate = String(vehicle.date_sold).slice(0, 10)
    const rate = getTaxRate(saleDate)

    // ---- corrected purchase entry -------------------------------------
    const { lines: purchaseLines } = buildVehiclePurchaseLines(
      vehicle as never,
    )
    printLines(`Corrected purchase, dated ${purchaseDate}`, purchaseLines)

    // ---- deposit receipt ---------------------------------------------
    // The deposit was never journalled at all, so Customer Deposits has no
    // credit for the sale entry to draw down. Record the receipt first.
    //
    // NOTE: there is no deposit_date column, so this is dated the sale date.
    // If the deposit was taken in an earlier period, adjust the date.
    const depositAmount = roundMoney(toAmount(vehicle.deposit_amount))
    let depositLines: PostingLine[] = []
    if (depositAmount > 0) {
      depositLines = [
        {
          code: ACCOUNTS.BANK_OPERATING,
          debit: depositAmount,
          memo: "Customer deposit received",
        },
        {
          code: ACCOUNTS.CUSTOMER_DEPOSITS,
          credit: depositAmount,
          memo: "Deposit held - unearned until delivery",
        },
      ]
      printLines(`Deposit receipt, dated ${saleDate}`, depositLines)
    }

    // ---- corrected sale entry ----------------------------------------
    const sellingPrice = roundMoney(toAmount(vehicle.selling_price))
    const safetyCharge = roundMoney(toAmount(vehicle.safety_charge))
    const warrantyCharge = roundMoney(toAmount(vehicle.warranty_charge))
    const omvicFee = roundMoney(toAmount(vehicle.omvic_fee))
    const registrationFee = roundMoney(toAmount(vehicle.registration_fee))
    const referral = roundMoney(toAmount(vehicle.referral_amount))
    const deposit = depositAmount

    // Registration is collected on the customer's behalf: a pass-through
    // liability, not revenue, and not taxable to us.
    const taxableRevenue = sumMoney([sellingPrice, safetyCharge, warrantyCharge, omvicFee])
    const hst = calculateTax(taxableRevenue, rate)
    const total = sumMoney([taxableRevenue, registrationFee, hst])

    const saleLines: PostingLine[] = []

    // Deposit already collected is applied; the remainder is receivable.
    if (deposit > 0) {
      saleLines.push({
        code: ACCOUNTS.CUSTOMER_DEPOSITS,
        debit: deposit,
        memo: "Apply customer deposit held on account",
      })
    }
    const receivable = roundMoney(total - deposit)
    if (receivable > 0) {
      saleLines.push({
        code: ACCOUNTS.ACCOUNTS_RECEIVABLE,
        debit: receivable,
        memo: "Balance due from customer",
      })
    }

    saleLines.push({
      code: ACCOUNTS.VEHICLE_SALES,
      credit: sellingPrice,
      memo: "Vehicle sale price",
    })
    if (safetyCharge > 0) {
      saleLines.push({
        code: ACCOUNTS.SERVICE_REVENUE,
        credit: safetyCharge,
        memo: "Safety charge to customer",
      })
    }
    if (warrantyCharge > 0) {
      saleLines.push({
        code: ACCOUNTS.OTHER_REVENUE,
        credit: warrantyCharge,
        memo: "Warranty charge to customer",
      })
    }
    if (omvicFee > 0) {
      saleLines.push({
        code: ACCOUNTS.OMVIC_PAYABLE,
        credit: omvicFee,
        memo: "OMVIC fee collected",
      })
    }
    if (registrationFee > 0) {
      saleLines.push({
        code: ACCOUNTS.REGISTRATION_PAYABLE,
        credit: registrationFee,
        memo: "Registration collected for remittance",
      })
    }
    if (hst > 0) {
      saleLines.push({
        code: ACCOUNTS.HST_PAYABLE,
        credit: hst,
        memo: `HST collected at ${(rate * 100).toFixed(2)}%`,
      })
    }

    // COGS and inventory relief: the piece missing from JE-00001 entirely.
    const { total: capitalized, byAccount } = await getCapitalizedInventoryCost(
      supabase,
      id,
    )
    if (capitalized > 0) {
      saleLines.push({
        code: ACCOUNTS.COGS,
        debit: capitalized,
        memo: "Cost of vehicle sold",
      })
      saleLines.push(...buildInventoryReliefLines(byAccount))
    }

    // Referral is a selling expense settled in cash, not inventory cost.
    if (referral > 0) {
      saleLines.push({
        code: ACCOUNTS.REFERRAL_FEES,
        debit: referral,
        memo: "Referral fee expense",
      })
      saleLines.push({
        code: ACCOUNTS.BANK_OPERATING,
        credit: referral,
        memo: "Referral fee paid",
      })
    }

    printLines(`Corrected sale, dated ${saleDate} (was 2026-03-31)`, saleLines)

    const grossProfit = roundMoney(taxableRevenue - capitalized - referral)
    console.log(
      `\n  revenue ${taxableRevenue.toFixed(2)} - cost ${capitalized.toFixed(2)} - referral ${referral.toFixed(2)} = gross profit ${grossProfit.toFixed(2)}`,
    )

    if (!COMMIT) continue

    // ---- write ------------------------------------------------------
    const { data: existing } = await supabase
      .from("journal_entries")
      .select("id, entry_number, status, description")
      .eq("status", "POSTED")

    for (const entry of existing ?? []) {
      const desc = String((entry as { description?: string }).description ?? "")
      if (!desc.includes(String(vehicle.stock_number))) continue
      const reversal = await reverseJournalEntry(
        supabase,
        (entry as { id: string }).id,
        {
          reason: "Corrected posting: COGS relief, account mapping, entry date",
          // Reverse on the original date so each period nets to zero rather
          // than dumping the correction into today's period.
          reversalDate: desc.toLowerCase().includes("purchase") ? purchaseDate : saleDate,
        },
      )
      console.log(
        `  reversed ${(entry as { entry_number: string }).entry_number} -> ${reversal?.entryNumber ?? "(no lines; voided)"}`,
      )
    }

    const purchase = await postJournalEntry(supabase, {
      entryDate: purchaseDate,
      description: `Vehicle Purchase: ${label}`,
      lines: purchaseLines,
    })
    console.log(`  posted ${purchase.entryNumber} (purchase)`)

    // Must precede the sale so Customer Deposits carries a credit before the
    // sale draws it down.
    if (depositLines.length > 0) {
      const dep = await postJournalEntry(supabase, {
        entryDate: saleDate,
        description: `Customer Deposit: ${label}`,
        lines: depositLines,
      })
      console.log(`  posted ${dep.entryNumber} (deposit receipt)`)
    }

    const sale = await postJournalEntry(supabase, {
      entryDate: saleDate,
      description: `Vehicle Sale: ${label}`,
      lines: saleLines,
    })
    console.log(`  posted ${sale.entryNumber} (sale)`)

    await supabase
      .from("vehicles")
      .update({
        purchase_journal_entry_id: purchase.id,
        sale_journal_entry_id: sale.id,
        // A sold car should not read AVAILABLE.
        status: "SOLD",
      })
      .eq("id", id)
    console.log(`  linked entries and set status=SOLD`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
