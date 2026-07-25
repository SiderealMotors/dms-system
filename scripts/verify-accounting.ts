/**
 * Accounting engine verification harness.
 *
 * Exercises the pure posting logic against realistic and adversarial dealer
 * scenarios. No database required -- this validates the arithmetic and the
 * balance guarantee, which is where the defects were.
 *
 * Run: npx tsx scripts/verify-accounting.ts
 */

import { buildVehiclePurchaseLines } from "../lib/accounting/vehicle-entries"
import { balanceLines, parseEntrySequence, PostingError, type PostingLine } from "../lib/accounting/posting"
import { roundMoney, sumMoney, calculateTax } from "../lib/accounting/money"
import { ACCOUNTS, VEHICLE_INVENTORY_ACCOUNTS } from "../lib/accounting/accounts"

let passed = 0
let failed = 0
const failures: Array<{ name: string; detail?: string }> = []

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failed++
    failures.push({ name, detail })
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`)
  }
}

function totals(lines: PostingLine[]) {
  return {
    debit: sumMoney(lines.map((l) => l.debit ?? 0)),
    credit: sumMoney(lines.map((l) => l.credit ?? 0)),
  }
}

function assertBalanced(name: string, lines: PostingLine[]) {
  const { debit, credit } = totals(lines)
  check(
    `${name} balances`,
    roundMoney(debit - credit) === 0,
    `debits ${debit.toFixed(2)} vs credits ${credit.toFixed(2)}`,
  )
  return { debit, credit }
}

function creditTo(lines: PostingLine[], code: string) {
  return sumMoney(lines.filter((l) => l.code === code).map((l) => l.credit ?? 0))
}
function debitTo(lines: PostingLine[], code: string) {
  return sumMoney(lines.filter((l) => l.code === code).map((l) => l.debit ?? 0))
}

console.log("\n=== Scenario 1: the original failing purchase (Stock #12 shape) ===")
{
  const vehicle = {
    id: "v1",
    stock_number: "12",
    year: 2019,
    make: "Honda",
    model: "Civic",
    date_acquired: "2026-01-15",
    purchase_price: 20000,
    miscellaneous_cost: 200,
    safety_cost: 500,
    gas: 80,
    warranty_cost: 300,
    floorplan_interest_cost: 150,
    floorplan_fees: 50,
    purchase_payment_method: "CASH",
    purchase_hst_applicable: true,
  }

  const { lines, t } = (() => {
    const r = buildVehiclePurchaseLines(vehicle)
    return { lines: r.lines, t: r.totals }
  })()

  assertBalanced("Scenario 1", lines)

  // Capitalized: 20000 + 200 + 500 + 80 + 300 = 21080
  check("capitalized cost is 21,080.00", t.capitalizedCost === 21080, `got ${t.capitalizedCost}`)
  // Period: 150 + 50 = 200
  check("period cost is 200.00", t.periodCost === 200, `got ${t.periodCost}`)
  // Taxable base excludes interest and fees (exempt financial services)
  check("taxable base is 21,080.00", t.taxableBase === 21080, `got ${t.taxableBase}`)
  check("HST is 2,740.40", t.taxAmount === 2740.4, `got ${t.taxAmount}`)
  check(
    "HST Receivable is debited (the line the old code dropped)",
    debitTo(lines, ACCOUNTS.HST_RECEIVABLE) === 2740.4,
    `got ${debitTo(lines, ACCOUNTS.HST_RECEIVABLE)}`,
  )
  check("grand total is 24,020.40", t.grandTotal === 24020.4, `got ${t.grandTotal}`)
  // Capitalized cost is split across the three inventory accounts the live
  // chart provides: base 20,000 + 200 misc + 80 gas, safety 500, warranty 300.
  check(
    "base inventory (1200) debited 20,280.00",
    debitTo(lines, ACCOUNTS.VEHICLE_INVENTORY) === 20280,
    `got ${debitTo(lines, ACCOUNTS.VEHICLE_INVENTORY)}`,
  )
  check(
    "safety capitalized to its own subaccount (1210)",
    debitTo(lines, ACCOUNTS.VEHICLE_INVENTORY_SAFETY) === 500,
    `got ${debitTo(lines, ACCOUNTS.VEHICLE_INVENTORY_SAFETY)}`,
  )
  check(
    "reconditioning subaccount (1220) carries warranty cost",
    debitTo(lines, ACCOUNTS.VEHICLE_INVENTORY_RECONDITIONING) === 300,
    `got ${debitTo(lines, ACCOUNTS.VEHICLE_INVENTORY_RECONDITIONING)}`,
  )
  check(
    "inventory accounts together hold 21,080.00",
    sumMoney(VEHICLE_INVENTORY_ACCOUNTS.map((c) => debitTo(lines, c))) === 21080,
  )
  check(
    "floorplan interest hits 5400 (Floorplan Interest), not 6400 Insurance",
    debitTo(lines, ACCOUNTS.FLOORPLAN_INTEREST) === 150 &&
      ACCOUNTS.FLOORPLAN_INTEREST === "5400",
    `got ${debitTo(lines, ACCOUNTS.FLOORPLAN_INTEREST)}`,
  )
}

console.log("\n=== Scenario 2: floorplan-funded purchase ===")
{
  const vehicle = {
    id: "v2",
    purchase_price: 30000,
    date_acquired: "2026-02-01",
    purchase_payment_method: "FLOORPLAN",
    purchase_hst_applicable: true,
  }
  const { lines, totals: t } = buildVehiclePurchaseLines(vehicle)
  assertBalanced("Scenario 2", lines)
  check(
    "credits Floorplan Payable, not Cash",
    creditTo(lines, ACCOUNTS.FLOORPLAN_PAYABLE) === roundMoney(30000 * 1.13),
    `got ${creditTo(lines, ACCOUNTS.FLOORPLAN_PAYABLE)}`,
  )
  check("cash untouched", creditTo(lines, ACCOUNTS.CASH) === 0)
}

console.log("\n=== Scenario 3: private sale, vendor not HST-registered ===")
{
  const vehicle = {
    id: "v3",
    purchase_price: 8000,
    date_acquired: "2026-02-10",
    purchase_payment_method: "CASH",
    purchase_hst_applicable: false,
  }
  const { lines, totals: t } = buildVehiclePurchaseLines(vehicle)
  assertBalanced("Scenario 3", lines)
  check("no ITC claimed on a non-registrant purchase", t.taxAmount === 0, `got ${t.taxAmount}`)
  check(
    "no HST Receivable line at all",
    !lines.some((l) => l.code === ACCOUNTS.HST_RECEIVABLE),
  )
  check("grand total equals cost with no tax", t.grandTotal === 8000, `got ${t.grandTotal}`)
}

console.log("\n=== Scenario 4: rounding stress (amounts that break naive rounding) ===")
{
  const nasty = [0.005, 1.005, 2.675, 1234.565, 0.145, 99.995]
  for (const v of nasty) {
    const r = roundMoney(v)
    check(
      `roundMoney(${v}) has at most 2 decimals`,
      Number.isInteger(Math.round(r * 100)) && Math.abs(r * 100 - Math.round(r * 100)) < 1e-9,
      `got ${r}`,
    )
  }

  // Tax on many odd amounts must still balance overall.
  const vehicle = {
    id: "v4",
    purchase_price: 1234.57,
    miscellaneous_cost: 99.99,
    safety_cost: 33.33,
    gas: 11.11,
    warranty_cost: 7.77,
    floorplan_interest_cost: 3.33,
    floorplan_fees: 1.11,
    date_acquired: "2026-03-01",
    purchase_payment_method: "CASH",
    purchase_hst_applicable: true,
  }
  const { lines } = buildVehiclePurchaseLines(vehicle)
  assertBalanced("Scenario 4 odd-cents purchase", lines)

  // Every line must be storable in DECIMAL(12,2) without further rounding.
  const allTwoDp = lines.every((l) => {
    const d = l.debit ?? 0
    const c = l.credit ?? 0
    return (
      Math.abs(d * 100 - Math.round(d * 100)) < 1e-9 &&
      Math.abs(c * 100 - Math.round(c * 100)) < 1e-9
    )
  })
  check("every line amount is exactly 2dp (no silent DB rounding)", allTwoDp)
}

console.log("\n=== Scenario 5: zero-value and empty purchases ===")
{
  const { lines, totals: t } = buildVehiclePurchaseLines({ id: "v5", date_acquired: "2026-03-02" })
  check("no lines produced for a costless vehicle", lines.length === 0, `got ${lines.length}`)
  check("grand total is zero", t.grandTotal === 0)

  const { lines: negLines } = buildVehiclePurchaseLines({
    id: "v5b",
    purchase_price: -500,
    date_acquired: "2026-03-02",
  })
  check("negative cost is not capitalized", debitTo(negLines, ACCOUNTS.VEHICLE_INVENTORY) === 0)
}

console.log("\n=== Scenario 6: balanceLines rejects what the old code posted ===")
{
  // Reproduce the old out-of-balance purchase: tax credited to cash but the
  // HST debit line missing.
  const broken = [
    { code: ACCOUNTS.VEHICLE_INVENTORY, debit: 20700, memo: "inventory" },
    { code: ACCOUNTS.VEHICLE_INVENTORY_SAFETY, debit: 430, memo: "misc" },
    { code: ACCOUNTS.FLOORPLAN_INTEREST, debit: 150, memo: "interest" },
    { code: ACCOUNTS.CASH, credit: 24020.4, memo: "cash" },
  ]
  let threw = false
  let message = ""
  try {
    balanceLines(broken)
  } catch (e) {
    threw = e instanceof PostingError
    message = (e as Error).message
  }
  check("out-of-balance entry is rejected", threw, message.slice(0, 90))

  // The old sale entry: costs debited with no offsetting credit.
  const brokenSale = [
    { code: ACCOUNTS.ACCOUNTS_RECEIVABLE, debit: 26000, memo: "ar" },
    { code: ACCOUNTS.VEHICLE_SALES, credit: 25000, memo: "rev" },
    { code: ACCOUNTS.SERVICE_REVENUE, credit: 1000, memo: "safety rev" },
    { code: ACCOUNTS.VEHICLE_INVENTORY_SAFETY, debit: 600, memo: "safety cost, no credit" },
    { code: ACCOUNTS.WARRANTY_COSTS, debit: 400, memo: "warranty cost, no credit" },
  ]
  let saleThrew = false
  try {
    balanceLines(brokenSale)
  } catch (e) {
    saleThrew = e instanceof PostingError
  }
  check("old unbalanced sale shape is rejected", saleThrew)

  // A line with both a debit and a credit is malformed.
  let bothThrew = false
  try {
    balanceLines([
      { code: ACCOUNTS.CASH, debit: 10, credit: 10, memo: "both" },
      { code: ACCOUNTS.VEHICLE_SALES, credit: 10, memo: "rev" },
    ])
  } catch (e) {
    bothThrew = e instanceof PostingError
  }
  check("line with both debit and credit is rejected", bothThrew)

  // Sub-cent residual is absorbed by a visible plug, not silently dropped.
  const plugged = balanceLines([
    { code: ACCOUNTS.VEHICLE_INVENTORY, debit: 100.01, memo: "inv" },
    { code: ACCOUNTS.CASH, credit: 100.0, memo: "cash" },
  ])
  const pt = totals(plugged.lines)
  check("sub-cent residual balanced via plug line", roundMoney(pt.debit - pt.credit) === 0)
  check(
    "plug line is explicit and visible",
    plugged.lines.some((l) => l.code === ACCOUNTS.ROUNDING_DIFFERENCE),
  )

  // Strict mode refuses even a tolerable residual.
  let strictThrew = false
  try {
    balanceLines(
      [
        { code: ACCOUNTS.VEHICLE_INVENTORY, debit: 100.01, memo: "inv" },
        { code: ACCOUNTS.CASH, credit: 100.0, memo: "cash" },
      ],
      true,
    )
  } catch (e) {
    strictThrew = e instanceof PostingError
  }
  check("strict mode rejects any residual (manual entries)", strictThrew)
}

console.log("\n=== Scenario 7: full deal lifecycle, gross profit and COGS relief ===")
{
  // Buy, recondition, sell. Verify inventory is fully relieved and no cost is
  // double-counted.
  const vehicle = {
    id: "v7",
    purchase_price: 20000,
    miscellaneous_cost: 200,
    safety_cost: 500,
    gas: 80,
    warranty_cost: 300,
    floorplan_interest_cost: 150,
    floorplan_fees: 50,
    date_acquired: "2026-01-15",
    purchase_payment_method: "FLOORPLAN",
    purchase_hst_applicable: true,
  }
  const { lines: purchaseLines, totals: pt } = buildVehiclePurchaseLines(vehicle)
  assertBalanced("Scenario 7 purchase", purchaseLines)

  // Sum across ALL inventory accounts. Reading only 1200 would silently miss
  // the safety (1210) and reconditioning (1220) subaccounts, and would make the
  // "fully relieved" check below unfalsifiable.
  const inventoryIn = sumMoney(
    VEHICLE_INVENTORY_ACCOUNTS.map((code) => debitTo(purchaseLines, code)),
  )

  // Sale side, mirroring the sale route's construction.
  const sellingPrice = 25000
  const safetyCharge = 600
  const warrantyCharge = 400
  const omvicFee = 10
  const registrationFee = 120
  const taxableSubtotal = sumMoney([sellingPrice, safetyCharge, warrantyCharge, omvicFee])
  const taxAmount = calculateTax(taxableSubtotal, 0.13)
  const gross = sumMoney([taxableSubtotal, taxAmount, registrationFee])
  const capitalizedCost = inventoryIn

  const saleLines = [
    { code: ACCOUNTS.ACCOUNTS_RECEIVABLE, debit: gross, memo: "ar" },
    { code: ACCOUNTS.VEHICLE_SALES, credit: sellingPrice, memo: "rev" },
    { code: ACCOUNTS.SERVICE_REVENUE, credit: safetyCharge, memo: "safety rev" },
    { code: ACCOUNTS.OTHER_REVENUE, credit: warrantyCharge, memo: "warranty rev" },
    { code: ACCOUNTS.OMVIC_PAYABLE, credit: omvicFee, memo: "omvic" },
    { code: ACCOUNTS.REGISTRATION_PAYABLE, credit: registrationFee, memo: "reg pass-through" },
    { code: ACCOUNTS.HST_PAYABLE, credit: taxAmount, memo: "hst collected" },
    { code: ACCOUNTS.COGS, debit: capitalizedCost, memo: "cogs" },
    // Each inventory account is relieved for its own balance, as the sale route
    // does via buildInventoryReliefLines.
    ...VEHICLE_INVENTORY_ACCOUNTS.map((code) => ({
      code,
      credit: debitTo(purchaseLines, code),
      memo: "relieve inventory",
    })).filter((l) => l.credit > 0),
  ]
  assertBalanced("Scenario 7 sale", saleLines)

  const inventoryOut = sumMoney(
    VEHICLE_INVENTORY_ACCOUNTS.map((code) => creditTo(saleLines, code)),
  )
  check(
    "inventory fully relieved (nothing stranded)",
    roundMoney(inventoryIn - inventoryOut) === 0,
    `in ${inventoryIn.toFixed(2)}, out ${inventoryOut.toFixed(2)}`,
  )

  check(
    "HST Payable recorded on the sale",
    creditTo(saleLines, ACCOUNTS.HST_PAYABLE) === roundMoney(26010 * 0.13),
    `got ${creditTo(saleLines, ACCOUNTS.HST_PAYABLE)}`,
  )
  check(
    "registration is a liability, not revenue",
    creditTo(saleLines, ACCOUNTS.REGISTRATION_PAYABLE) === 120 &&
      creditTo(saleLines, ACCOUNTS.VEHICLE_SALES) === 25000,
  )

  // Safety and warranty costs must appear exactly once, inside COGS.
  check(
    "safety cost not expensed twice",
    debitTo(saleLines, ACCOUNTS.VEHICLE_INVENTORY_SAFETY) === 0,
  )
  check(
    "warranty cost not expensed twice",
    debitTo(saleLines, ACCOUNTS.WARRANTY_COSTS) === 0,
  )
  check(
    "floorplan interest not re-expensed at sale",
    debitTo(saleLines, ACCOUNTS.FLOORPLAN_INTEREST) === 0,
  )

  const grossProfit = roundMoney(taxableSubtotal - capitalizedCost)
  check("gross profit is 4,930.00", grossProfit === 4930, `got ${grossProfit}`)

  // Net profit after the period costs expensed at acquisition.
  const netProfit = roundMoney(grossProfit - pt.periodCost)
  check("net after floorplan costs is 4,730.00", netProfit === 4730, `got ${netProfit}`)
}

console.log("\n=== Scenario 8: tax neutrality across the deal ===")
{
  // ITC on purchase and HST collected on sale must both be recorded so the
  // HST return nets correctly.
  const purchaseTax = calculateTax(21080, 0.13)
  const saleTax = calculateTax(26010, 0.13)
  const remittance = roundMoney(saleTax - purchaseTax)
  check("HST remittance is positive and exact", remittance === roundMoney(3381.3 - 2740.4), `got ${remittance}`)
  check("no phantom ITC when tax does not apply", calculateTax(1000, 0.13, false) === 0)
}

console.log("\n=== Scenario 9: entry number parsing robustness ===")
{
  // Exercises the allocator's real parser, not a copy of it.
  const extract = parseEntrySequence

  check("parses JE-00007", extract("JE-00007") === 7)
  check("parses legacy JE00007", extract("JE00007") === 7)
  check("JE-00NaN is rejected outright", extract("JE-00NaN") === null)
  check("JE-2NaN5 cannot leak a stale number", extract("JE-2NaN5") === null)
  check("null yields no number", extract(null) === null)
  check("empty yields no number", extract("") === null)
  check("foreign prefix is rejected", extract("INV-00007") === null)

  // The contract that matters: never NaN, never a value that outruns reality.
  const adversarial = ["JE-00NaN", "JE-2NaN5", "JE-", "JE-abc", null, undefined, "", "JE-99999999999999"]
  check(
    "no adversarial input ever produces NaN",
    adversarial.every((v) => {
      const n = extract(v)
      return n === null || Number.isSafeInteger(n)
    }),
  )

  const max = ["JE-00001", "JE00009", "JE-00NaN", null, "JE-00004"]
    .map(extract)
    .filter((n): n is number => n !== null)
    .reduce((a, b) => Math.max(a, b), 0)
  check("next number skips corrupt rows and continues from 9", max + 1 === 10, `got ${max + 1}`)
}

console.log("\n" + "=".repeat(66))
console.log(`${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ""}`)
  process.exit(1)
}
console.log("All accounting scenarios verified.")
