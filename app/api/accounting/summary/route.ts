import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

interface AccountBalance {
  code: string
  name: string
  type: string
  normalBalance: string
  debits: number
  credits: number
  balance: number
}

export async function GET() {
  const supabase = await createClient()

  // Get all account balances from posted journal entries
  const { data: lineItems } = await supabase
    .from("journal_line_items")
    .select(`
      debit,
      credit,
      account:gl_accounts(id, code, name, account_type, normal_balance),
      journal_entry:journal_entries!inner(status)
    `)
    .eq("journal_entry.status", "POSTED")

  // Calculate account balances
  const accountBalances: Record<string, AccountBalance> = {}

  if (lineItems) {
    for (const item of lineItems) {
      // Supabase returns joined single records as objects, not arrays
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = item.account as any
      if (!account) continue
      
      const accountId = account.id as string
      if (!accountBalances[accountId]) {
        accountBalances[accountId] = {
          code: account.code as string,
          name: account.name as string,
          type: account.account_type as string,
          normalBalance: account.normal_balance as string,
          debits: 0,
          credits: 0,
          balance: 0,
        }
      }
      accountBalances[accountId].debits += Number(item.debit) || 0
      accountBalances[accountId].credits += Number(item.credit) || 0
    }
  }

  // Calculate final balances based on normal balance
  for (const account of Object.values(accountBalances)) {
    if (account.normalBalance === "DEBIT") {
      account.balance = account.debits - account.credits
    } else {
      account.balance = account.credits - account.debits
    }
  }

  // Get AP/AR summaries
  const { data: apData } = await supabase
    .from("accounts_payable")
    .select("total_amount, amount_paid, status")

  const { data: arData } = await supabase
    .from("accounts_receivable")
    .select("total_amount, amount_paid, status")

  // Calculate AP totals
  let apTotal = 0
  let apPaid = 0
  let apUnpaidCount = 0
  if (apData) {
    for (const ap of apData) {
      apTotal += Number(ap.total_amount) || 0
      apPaid += Number(ap.amount_paid) || 0
      if (ap.status !== "PAID") apUnpaidCount++
    }
  }
  const apSummary = {
    total: apTotal,
    paid: apPaid,
    outstanding: apTotal - apPaid,
    unpaidCount: apUnpaidCount,
  }

  // Calculate AR totals
  let arTotal = 0
  let arCollected = 0
  let arUnpaidCount = 0
  if (arData) {
    for (const ar of arData) {
      arTotal += Number(ar.total_amount) || 0
      arCollected += Number(ar.amount_paid) || 0
      if (ar.status !== "PAID") arUnpaidCount++
    }
  }
  const arSummary = {
    total: arTotal,
    collected: arCollected,
    outstanding: arTotal - arCollected,
    unpaidCount: arUnpaidCount,
  }

  // Calculate financial summaries
  const accounts = Object.values(accountBalances)
  
  let totalAssets = 0
  let totalLiabilities = 0
  let totalEquity = 0
  let totalRevenue = 0
  let totalExpenses = 0
  let cashBalance = 0

  for (const a of accounts) {
    if (a.type === "ASSET") totalAssets += a.balance
    if (a.type === "LIABILITY") totalLiabilities += a.balance
    if (a.type === "EQUITY") totalEquity += a.balance
    if (a.type === "REVENUE") totalRevenue += a.balance
    if (a.type === "EXPENSE") totalExpenses += a.balance
    if (a.code === "1000") cashBalance = a.balance
  }

  const netIncome = totalRevenue - totalExpenses

  // Get recent journal entries
  const { data: recentEntries } = await supabase
    .from("journal_entries")
    .select(`
      *,
      line_items:journal_line_items(
        id,
        debit,
        credit,
        memo,
        account:gl_accounts(code, name)
      )
    `)
    .order("entry_date", { ascending: false })
    .limit(10)

  return NextResponse.json({
    accountBalances: accounts,
    apSummary,
    arSummary,
    financials: {
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalRevenue,
      totalExpenses,
      netIncome,
      cashBalance,
    },
    recentEntries: recentEntries || [],
  })
}
