/**
 * Reconstructs the operating bank account (1010) from the parsed, reconciled
 * Scotiabank statements (.v0/bank/parsed.json).
 *
 * Policy (user-directed):
 *   - Bank statements are the SOLE source of truth for 1010.
 *   - Opening: a single equity entry for the first BALANCE FORWARD (770.00 on
 *     2024-09-27), DR 1010 / CR 3000 Owners Equity.
 *   - Each bank transaction becomes one journal entry: 1010 on the bank side,
 *     a categorized account on the other side.
 *   - Auction / vehicle-vendor payments (ADESA, "600-370 King St W") ->
 *     1250 Vehicle Purchases - Unallocated.
 *   - Bank service charges / overdraft interest -> 6350 Bank Charges.
 *   - Insurance-loan payments (Baird MacGregor) -> 6400 Insurance.
 *   - Everything else economically ambiguous -> 1900 Suspense, to be
 *     reclassified later.
 *
 * Idempotency: every entry is tagged with RECON_TAG in its description. The
 * script refuses to run if any tagged entry already exists, unless --force is
 * given (which first reverses/voids nothing -- use the dedicated undo path).
 *
 * Dry run by default. Pass --commit to write.
 *
 *   npx tsx scripts/post-bank-reconstruction.ts
 *   npx tsx scripts/post-bank-reconstruction.ts --commit
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"
import { ACCOUNTS, type AccountCode } from "../lib/accounting/accounts"
import { roundMoney, toAmount } from "../lib/accounting/money"
import { postJournalEntry, type PostingLine } from "../lib/accounting/posting"

const COMMIT = process.argv.includes("--commit")
const RECON_TAG = "[BANK-RECON]"

type Txn = { date: string; description: string; amount: number; balance: number }
type Statement = {
  from: string
  to: string
  page: number
  balanceForward: number
  closingBalance: number
  txns: Txn[]
}

type AnyClient = Parameters<typeof postJournalEntry>[0]

/**
 * Ordered classification. First match wins. Only the categories that have a
 * confident economic home are pulled out; everything else is parked in
 * suspense for later reclassification, per the reconstruction policy.
 */
type Dir = "in" | "out" | "any"
const RULES: { test: RegExp; dir: Dir; account: AccountCode; label: string }[] = [
  // Vehicle-vendor rules are OUT-only: an outflow buys a vehicle (capitalize to
  // 1250), but an INFLOW from the same payee is a different event -- sale
  // proceeds, a refund, or a financing draw -- that is economically ambiguous
  // and must fall through to Suspense rather than credit (and misstate) the
  // vehicle-purchases asset.
  { test: /600-?\s*370\s+KING/i, dir: "out", account: ACCOUNTS.VEHICLE_PURCHASES_UNALLOCATED, label: "Vehicle vendor (600-370 King)" },
  { test: /ADESA|AUCTION|MANHEIM|\bIAA\b|COPART|EDEALER/i, dir: "out", account: ACCOUNTS.VEHICLE_PURCHASES_UNALLOCATED, label: "Auction purchase" },
  // NSF needs word boundaries: bare "NSF" matches the letters in "traNSFer".
  { test: /SBAP FEE|SERVICE CHARGE|MONTHLY FEE|OVERDRAFT INTEREST|\bODI\b|SBAP MONTHLY|\bNSF\b/i, dir: "out", account: ACCOUNTS.BANK_CHARGES, label: "Bank charges" },
  { test: /BAIRD|MAC\s?GREGOR/i, dir: "out", account: ACCOUNTS.INSURANCE, label: "Insurance (Baird MacGregor)" },
]

function classify(t: Txn): { account: AccountCode; label: string } {
  const dir: Dir = t.amount >= 0 ? "in" : "out"
  for (const r of RULES) {
    if (r.dir !== "any" && r.dir !== dir) continue
    if (r.test.test(t.description)) return { account: r.account, label: r.label }
  }
  return { account: ACCOUNTS.SUSPENSE_BANK_RECON, label: "Suspense (to reclassify)" }
}

/**
 * Bank line + contra line for one transaction. 1010 is an asset (debit-normal):
 * money IN debits the bank, money OUT credits it; the contra takes the opposite.
 */
function linesFor(t: Txn): PostingLine[] {
  const amt = roundMoney(Math.abs(t.amount))
  const { account } = classify(t)
  const moneyIn = t.amount >= 0
  return moneyIn
    ? [
        { code: ACCOUNTS.BANK_OPERATING, debit: amt, memo: "Deposit to bank" },
        { code: account, credit: amt, memo: t.description.slice(0, 120) },
      ]
    : [
        { code: account, debit: amt, memo: t.description.slice(0, 120) },
        { code: ACCOUNTS.BANK_OPERATING, credit: amt, memo: "Paid from bank" },
      ]
}

function fmt(n: number) {
  return n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error("Supabase env vars are not set")
    process.exit(1)
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } }) as unknown as AnyClient

  const statements: Statement[] = JSON.parse(readFileSync(resolve(".v0/bank/parsed.json"), "utf8"))
  const txns = statements.flatMap((s) => s.txns)
  const opening = statements[0]
  const openingDate = "2024-09-27"
  const openingBalance = roundMoney(toAmount(opening.balanceForward))

  console.log(COMMIT ? "=== COMMIT ===" : "=== DRY RUN (pass --commit to write) ===")
  console.log(`Opening balance forward: ${fmt(openingBalance)} on ${openingDate}`)
  console.log(`Transactions to post: ${txns.length}`)

  // Guard against a double run.
  const { data: existingTagged } = await supabase
    .from("journal_entries")
    .select("id")
    .ilike("description", `%${RECON_TAG}%`)
    .limit(1)
  if (existingTagged && existingTagged.length > 0) {
    console.error(`\nReconstruction entries already exist (found ${RECON_TAG}). Aborting to avoid duplicates.`)
    process.exit(1)
  }

  // Category tally for the dry-run review.
  const tally = new Map<string, { count: number; net: number }>()
  for (const t of txns) {
    const { label } = classify(t)
    const b = tally.get(label) ?? { count: 0, net: 0 }
    b.count += 1
    b.net += t.amount
    tally.set(label, b)
  }
  console.log("\nCategory summary (net = signed effect on bank):")
  for (const [label, b] of [...tally.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${label.padEnd(32)} ${String(b.count).padStart(3)}  net ${fmt(b.net).padStart(14)}`)
  }

  // Expected ending 1010 balance = opening + sum of all txn amounts. Must equal
  // the last statement's closing balance, or the source data is inconsistent.
  const expectedClose = roundMoney(openingBalance + txns.reduce((s, t) => s + t.amount, 0))
  const declaredClose = roundMoney(toAmount(statements[statements.length - 1].closingBalance))
  console.log(
    `\nExpected 1010 close ${fmt(expectedClose)} vs statement close ${fmt(declaredClose)} -> ${
      expectedClose === declaredClose ? "OK" : "MISMATCH"
    }`,
  )
  if (expectedClose !== declaredClose) {
    console.error("Refusing to post: reconstructed close does not match the statements.")
    process.exit(1)
  }

  if (!COMMIT) {
    console.log("\nDry run complete. Re-run with --commit to post.")
    return
  }

  // ---- opening equity entry ----
  const openingLines: PostingLine[] = [
    { code: ACCOUNTS.BANK_OPERATING, debit: openingBalance, memo: "Opening bank balance forward" },
    { code: ACCOUNTS.OWNER_EQUITY, credit: openingBalance, memo: "Owner's equity - opening balance" },
  ]
  const openEntry = await postJournalEntry(supabase, {
    entryDate: openingDate,
    description: `${RECON_TAG} Opening balance forward`,
    lines: openingLines,
  })
  console.log(`\nposted ${openEntry.entryNumber} (opening balance)`)

  // ---- one entry per transaction ----
  let posted = 0
  for (const t of txns) {
    const entry = await postJournalEntry(supabase, {
      entryDate: t.date,
      description: `${RECON_TAG} ${t.description}`.slice(0, 200),
      lines: linesFor(t),
    })
    posted += 1
    if (posted % 50 === 0) console.log(`  ...${posted}/${txns.length} (${entry.entryNumber})`)
  }
  console.log(`\nposted ${posted} transaction entries. Done.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
