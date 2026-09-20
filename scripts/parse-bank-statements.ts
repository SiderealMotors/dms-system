/**
 * Parses the Scotiabank business-account statements (exported as text) into a
 * structured, reconciled transaction list.
 *
 * Robustness strategy: the raw text glues each transaction's amount directly
 * onto its running balance (e.g. "500.00270.00" = 500.00 debit, 270.00
 * balance). Rather than guess the split, we rely on the fact that EVERY line
 * prints a running balance. We take the LAST money token on each transaction
 * block as the running balance and derive the amount as the signed delta from
 * the previous balance. The glued amount is only used as a cross-check.
 *
 * Each monthly statement also prints its own debit/credit counts and totals;
 * we reconcile our parse against those and against the closing balance.
 *
 * Usage:
 *   tsx scripts/parse-bank-statements.ts            # summary + reconciliation
 *   tsx scripts/parse-bank-statements.ts --json     # full structured dump
 *   tsx scripts/parse-bank-statements.ts --txns     # flat transaction list
 */
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

const SOURCE = resolve(".v0/bank/statements.txt")
const OUT = resolve(".v0/bank/parsed.json")

const MONEY = /\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2}/g
const DATE_LINE = /^(\d{2})\/(\d{2})\/(\d{4})(.*)$/

type Txn = {
  date: string // YYYY-MM-DD
  description: string
  amount: number // signed: positive = credit/deposit, negative = debit/withdrawal
  balance: number
  raw: string[]
}

type Statement = {
  from: string
  to: string
  page: number // 1-based statement index, used as the "page" reference
  balanceForward: number | null
  closingBalance: number | null
  txns: Txn[]
  declared: {
    debitCount: number | null
    debitTotal: number | null
    creditCount: number | null
    creditTotal: number | null
  }
}

function money(s: string): number {
  return Number(s.replace(/,/g, ""))
}

function parse(): Statement[] {
  const raw = readFileSync(SOURCE, "utf8")
  const lines = raw.split("\n")

  // Single pass. A monthly period can span several pages, and every page
  // repeats "Business Account<from><to>". We group by the (from,to) pair:
  // a header whose dates match the current period is a continuation page, so
  // we keep appending and DO NOT reset the running balance. BALANCE FORWARD
  // (page 1 only) is the sole balance-chain reset point.
  const statements: Statement[] = []
  let stmt: Statement | null = null
  let prevBalance: number | null = null
  let pendingSummary = false
  let i = 0

  const periodKey = (from: string, to: string) => `${from}|${to}`

  while (i < lines.length) {
    const l = lines[i]

    if (/Business Account/.test(l) && /\d{4}/.test(l)) {
      const dates = l.match(/[A-Z][a-z]{2} \d{1,2} \d{4}/g) ?? []
      const from = dates[0] ?? ""
      const to = dates[1] ?? ""

      if (!stmt || periodKey(stmt.from, stmt.to) !== periodKey(from, to)) {
        // New period.
        stmt = {
          from,
          to,
          page: statements.length + 1,
          balanceForward: null,
          closingBalance: null,
          txns: [],
          declared: {
            debitCount: null,
            debitTotal: null,
            creditCount: null,
            creditTotal: null,
          },
        }
        statements.push(stmt)
      }
      // else: continuation page of the same period — keep prevBalance.
      pendingSummary = false
      i += 1
      continue
    }

    if (!stmt) {
      i += 1
      continue
    }

    if (/No\. of Debits/.test(l)) {
      pendingSummary = true
      i += 1
      continue
    }
    if (pendingSummary) {
      const m = l.match(/^(\d+)\$([\d,]+\.\d{2})(\d+)\$([\d,]+\.\d{2})$/)
      if (m && stmt.declared.debitCount === null) {
        stmt.declared.debitCount = Number(m[1])
        stmt.declared.debitTotal = money(m[2])
        stmt.declared.creditCount = Number(m[3])
        stmt.declared.creditTotal = money(m[4])
      }
      pendingSummary = false
      i += 1
      continue
    }

    const dm = l.match(DATE_LINE)
    if (dm) {
      const [, mm, dd, yyyy, rest] = dm
      const date = `${yyyy}-${mm}-${dd}`

      const block: string[] = [rest]
      let k = i + 1
      while (k < lines.length) {
        const nx = lines[k]
        if (
          DATE_LINE.test(nx) ||
          /No\. of Debits/.test(nx) ||
          /Business Account/.test(nx) ||
          /Uncollected fees/.test(nx) ||
          /Please examine/.test(nx)
        ) {
          break
        }
        block.push(nx)
        k += 1
      }

      const blockText = block.join(" ")
      const tokens = blockText.match(MONEY) ?? []
      const isBalanceForward = /BALANCE FORWARD/.test(blockText)

      if (tokens.length === 0) {
        i = k
        continue
      }

      const balance = money(tokens[tokens.length - 1])
      const description = blockText
        .replace(MONEY, " ")
        .replace(/\s+/g, " ")
        .trim()

      if (isBalanceForward) {
        stmt.balanceForward = balance
        prevBalance = balance
      } else {
        const amount = prevBalance === null ? 0 : round(balance - prevBalance)
        stmt.txns.push({
          date,
          description,
          amount,
          balance,
          raw: block.map((s) => s.trim()).filter(Boolean),
        })
        prevBalance = balance
      }
      stmt.closingBalance = balance
      i = k
      continue
    }

    i += 1
  }

  return statements
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function reconcile(statements: Statement[]) {
  let ok = true
  console.log("Statement reconciliation (derived vs declared):\n")
  for (const s of statements) {
    const debits = s.txns.filter((t) => t.amount < 0)
    const credits = s.txns.filter((t) => t.amount > 0)
    const debitTotal = round(-debits.reduce((a, t) => a + t.amount, 0))
    const creditTotal = round(credits.reduce((a, t) => a + t.amount, 0))

    const dCountOk = s.declared.debitCount === debits.length
    const dTotalOk =
      s.declared.debitTotal === null ||
      Math.abs((s.declared.debitTotal ?? 0) - debitTotal) < 0.005
    const cCountOk = s.declared.creditCount === credits.length
    const cTotalOk =
      s.declared.creditTotal === null ||
      Math.abs((s.declared.creditTotal ?? 0) - creditTotal) < 0.005

    // Balance chain: balanceForward + sum(amounts) == closingBalance
    const chain = round(
      (s.balanceForward ?? 0) + s.txns.reduce((a, t) => a + t.amount, 0),
    )
    const chainOk = Math.abs(chain - (s.closingBalance ?? 0)) < 0.005

    const allOk = dCountOk && dTotalOk && cCountOk && cTotalOk && chainOk
    if (!allOk) ok = false

    console.log(
      `${allOk ? "OK " : "!! "} #${String(s.page).padStart(2)} ${s.from} -> ${s.to} | ` +
        `bf ${fmt(s.balanceForward)} close ${fmt(s.closingBalance)} | ` +
        `D ${debits.length}/${fmt(debitTotal)} (decl ${s.declared.debitCount}/${fmt(s.declared.debitTotal)}) ` +
        `C ${credits.length}/${fmt(creditTotal)} (decl ${s.declared.creditCount}/${fmt(s.declared.creditTotal)})`,
    )
    if (!allOk) {
      if (!dCountOk || !cCountOk)
        console.log(`      count mismatch`)
      if (!dTotalOk || !cTotalOk)
        console.log(`      total mismatch`)
      if (!chainOk)
        console.log(`      balance chain: ${fmt(chain)} != ${fmt(s.closingBalance)}`)
    }
  }
  console.log(`\n${ok ? "ALL STATEMENTS RECONCILE" : "SOME STATEMENTS FAILED"}`)
  return ok
}

function fmt(n: number | null): string {
  if (n === null) return "—"
  return n.toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function main() {
  const statements = parse()
  writeFileSync(OUT, JSON.stringify(statements, null, 2))

  const arg = process.argv[2]
  if (arg === "--json") {
    console.log(JSON.stringify(statements, null, 2))
    return
  }
  if (arg === "--txns") {
    for (const s of statements) {
      for (const t of s.txns) {
        console.log(
          `${t.date}  ${t.amount >= 0 ? "+" : "-"}${fmt(Math.abs(t.amount)).padStart(12)}  bal ${fmt(t.balance).padStart(12)}  ${t.description}`,
        )
      }
    }
    return
  }

  const total = statements.reduce((a, s) => a + s.txns.length, 0)
  console.log(
    `Parsed ${statements.length} statements, ${total} transactions.`,
  )
  console.log(
    `First: ${statements[0]?.from}  balanceForward ${fmt(statements[0]?.balanceForward ?? null)}`,
  )
  console.log(
    `Last:  ${statements.at(-1)?.to}  closingBalance ${fmt(statements.at(-1)?.closingBalance ?? null)}\n`,
  )
  reconcile(statements)
  console.log(`\nStructured output written to ${OUT}`)
}

main()
