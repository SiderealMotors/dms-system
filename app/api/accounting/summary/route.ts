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

  // Read balances from v_trial_balance, which aggregates POSTED entries and
  // excludes reversal mirrors, so a reversed entry and its mirror net to zero.
  // Aggregating journal_line_items directly here would double-subtract the
  // mirror (whose reversed original is already non-POSTED) and show accounts
  // running falsely negative.
  const { data: trialBalance } = await supabase
    .from("v_trial_balance")
    .select("code, name, account_type, normal_balance, total_debit, total_credit, balance")

  const accountBalances: Record<string, AccountBalance> = {}

  if (trialBalance) {
    for (const row of trialBalance) {
      accountBalances[row.code as string] = {
        code: row.code as string,
        name: row.name as string,
        type: row.account_type as string,
        normalBalance: row.normal_balance as string,
        debits: Number(row.total_debit) || 0,
        credits: Number(row.total_credit) || 0,
        balance: Number(row.balance) || 0,
      }
    }
  }

  // Get AP/AR summaries - only count records with valid journal entries
  const { data: apData } = await supabase
    .from("accounts_payable")
    .select("total_amount, amount_paid, status")
    .not("journal_entry_id", "is", null)

  const { data: arData } = await supabase
    .from("accounts_receivable")
    .select("total_amount, amount_paid, status")
    .not("journal_entry_id", "is", null)

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
    // "Available cash" means liquid funds: petty cash (1000) plus the operating
    // bank account (1010), which is where bank-draft/EFT activity now lands.
    if (a.code === "1000" || a.code === "1010") cashBalance += a.balance
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
