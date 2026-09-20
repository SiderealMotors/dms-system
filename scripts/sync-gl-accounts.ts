/**
 * Ensure every GL account referenced by the code exists in the database.
 *
 * The posting engine now throws if an account code cannot be resolved, which
 * is deliberate: silently dropping a line is what put the ledger out of
 * balance in the first place. This script closes the gap between the canonical
 * ACCOUNTS map and the live chart of accounts.
 *
 * Run: npx tsx scripts/sync-gl-accounts.ts
 */

import { createClient } from "@supabase/supabase-js"
import { ACCOUNTS } from "../lib/accounting/accounts"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY

if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.")
  process.exit(1)
}

/**
 * Accounts the code depends on that were missing from the original seed.
 * Codes not listed here are expected to already exist.
 *
 * Note the live column is `account_type` (not `type`), and there is no
 * `description` column -- the rationale for each account is documented here
 * in comments instead.
 */
const REQUIRED = [
  // Recoverable input tax credits on purchases from HST registrants, claimed
  // against HST Payable on the return. Its absence is what silently dropped
  // the ITC line and left every purchase entry out of balance.
  {
    code: ACCOUNTS.HST_RECEIVABLE,
    name: "HST Receivable (ITC)",
    account_type: "ASSET",
    normal_balance: "DEBIT",
  },
  // MTO registration collected on the customer's behalf: an agency
  // pass-through, not revenue.
  {
    code: ACCOUNTS.REGISTRATION_PAYABLE,
    name: "Registration Fees Payable",
    account_type: "LIABILITY",
    normal_balance: "CREDIT",
  },
  // Deposits taken before delivery are unearned until the sale closes, so this
  // is distinct from Accrued Expenses (2300), where they were being posted.
  {
    code: ACCOUNTS.CUSTOMER_DEPOSITS,
    name: "Customer Deposits",
    account_type: "LIABILITY",
    normal_balance: "CREDIT",
  },
  // Lender administration fees on floorplan financing, separate from interest.
  {
    code: ACCOUNTS.FLOORPLAN_FEES,
    name: "Floorplan Fees",
    account_type: "EXPENSE",
    normal_balance: "DEBIT",
  },
  // Absorbs sub-cent rounding so entries balance exactly. A material balance
  // here indicates a calculation defect worth investigating.
  {
    code: ACCOUNTS.ROUNDING_DIFFERENCE,
    name: "Rounding Difference",
    account_type: "EXPENSE",
    normal_balance: "DEBIT",
  },
]

async function main() {
  const supabase = createClient(url!, serviceKey!, {
    auth: { persistSession: false },
  })

  const { error: insertError } = await supabase
    .from("gl_accounts")
    .upsert(REQUIRED, { onConflict: "code", ignoreDuplicates: true })

  if (insertError) {
    console.error("Failed to upsert accounts:", insertError.message)
    process.exit(1)
  }

  // Verify every code the application relies on now resolves.
  const wanted = Object.values(ACCOUNTS)
  const { data, error } = await supabase.from("gl_accounts").select("code, name").in("code", wanted)

  if (error) {
    console.error("Failed to read accounts:", error.message)
    process.exit(1)
  }

  const found = new Set((data ?? []).map((r) => r.code as string))
  const missing = wanted.filter((c) => !found.has(c))

  console.log(`Resolved ${found.size} of ${wanted.length} referenced GL accounts.`)

  if (missing.length > 0) {
    console.error("\nStill missing (posting will throw for these):")
    for (const code of missing) console.error(`  ${code}`)
    process.exit(1)
  }

  console.log("Every account code referenced by the code exists in the database.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
