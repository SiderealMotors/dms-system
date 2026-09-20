/**
 * Reads the reconciled parse (.v0/bank/parsed.json) and buckets every
 * transaction into a proposed GL category by matching its description against
 * an ordered rule list. Prints per-category counts/totals and, crucially, an
 * "UNCATEGORIZED" bucket plus a per-rule sample so the mapping can be reviewed
 * before anything is posted.
 *
 * Usage:
 *   tsx scripts/categorize-bank-txns.ts            # category summary
 *   tsx scripts/categorize-bank-txns.ts --detail   # every txn with its bucket
 *   tsx scripts/categorize-bank-txns.ts --uncat    # only uncategorized txns
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

type Txn = { date: string; description: string; amount: number; balance: number }
type Statement = { from: string; to: string; page: number; txns: Txn[] }

const statements: Statement[] = JSON.parse(
  readFileSync(resolve(".v0/bank/parsed.json"), "utf8"),
)

/**
 * Ordered rules. `dir` optionally restricts a rule to debits ("out") or
 * credits ("in") so the same wording can map differently by direction.
 * First match wins.
 */
type Dir = "in" | "out" | "any"
type Rule = { key: string; dir: Dir; test: RegExp }

const RULES: Rule[] = [
  { key: "Bank service charges", dir: "out", test: /SBAP FEE|SERVICE CHARGE|MONTHLY FEE|OVERDRAFT INTEREST|ODI|SBAP MONTHLY/i },
  { key: "Credit card / LOC payment", dir: "out", test: /CR\.? CARD|CREDIT CARD\/LOC|LOC PAY/i },
  { key: "Insurance loan (Baird MacGregor)", dir: "any", test: /BAIRD|MACGREGOR|MAC GREGOR/i },
  { key: "Auction purchase (ADESA)", dir: "out", test: /ADESA/i },
  { key: "Auction purchase (other)", dir: "out", test: /AUCTION|MANHEIM|IAA|COPART|EDEALER/i },
  { key: "Interac e-transfer received", dir: "in", test: /INTERAC E-TRANSFER|E-TRANSFER|EMAIL MONEY|CREDIT MEMO/i },
  { key: "Interac e-transfer sent", dir: "out", test: /INTERAC E-TRANSFER|E-TRANSFER|EMAIL MONEY|SEND E-TFR/i },
  { key: "Point-of-sale purchase", dir: "out", test: /POINT OF SALE|OPOS|POS PURCHASE|PURCHASE/i },
  { key: "Bill payment (TELPAY)", dir: "out", test: /TELPAY/i },
  { key: "Bill payment / vendor", dir: "out", test: /BILL PAYMENT|PAYMENT TO|PAC|PRE-AUTH|PREAUTH/i },
  { key: "Deposit / incoming", dir: "in", test: /DEPOSIT|TRANSFER FROM|MB-TRANSFER/i },
  { key: "Transfer out", dir: "out", test: /TRANSFER TO|MB-TRANSFER/i },
]

function classify(t: Txn): string {
  const dir: Dir = t.amount >= 0 ? "in" : "out"
  for (const r of RULES) {
    if (r.dir !== "any" && r.dir !== dir) continue
    if (r.test.test(t.description)) return r.key
  }
  return "UNCATEGORIZED"
}

function fmt(n: number): string {
  return n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const all: Txn[] = statements.flatMap((s) => s.txns)

if (process.argv[2] === "--detail") {
  for (const t of all) {
    console.log(
      `${t.date}  ${(t.amount >= 0 ? "+" : "-") + fmt(Math.abs(t.amount)).padStart(12)}  ${classify(t).padEnd(34)}  ${t.description}`,
    )
  }
} else if (process.argv[2] === "--uncat") {
  const u = all.filter((t) => classify(t) === "UNCATEGORIZED")
  console.log(`${u.length} uncategorized transactions:\n`)
  for (const t of u) {
    console.log(`${t.date}  ${(t.amount >= 0 ? "+" : "-") + fmt(Math.abs(t.amount))}  ${t.description}`)
  }
} else {
  const buckets = new Map<string, { count: number; inTotal: number; outTotal: number; samples: Set<string> }>()
  for (const t of all) {
    const key = classify(t)
    const b = buckets.get(key) ?? { count: 0, inTotal: 0, outTotal: 0, samples: new Set<string>() }
    b.count += 1
    if (t.amount >= 0) b.inTotal += t.amount
    else b.outTotal += -t.amount
    if (b.samples.size < 3) b.samples.add(t.description.slice(0, 70))
    buckets.set(key, b)
  }
  const rows = [...buckets.entries()].sort((a, b) => b[1].count - a[1].count)
  console.log(`${all.length} transactions across ${statements.length} statements\n`)
  console.log("category                                cnt        in (+)        out (-)")
  console.log("-".repeat(82))
  for (const [key, b] of rows) {
    console.log(
      `${key.padEnd(38)} ${String(b.count).padStart(3)}  ${fmt(b.inTotal).padStart(13)}  ${fmt(b.outTotal).padStart(13)}`,
    )
  }
  console.log("\nSamples per category:")
  for (const [key, b] of rows) {
    console.log(`\n[${key}]`)
    for (const s of b.samples) console.log(`  - ${s}`)
  }
}
