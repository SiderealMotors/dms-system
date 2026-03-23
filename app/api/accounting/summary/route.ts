import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

interface LineItem {
  debit: number | null
  credit: number | null
  account: {
    id: string
    code: string
    name: string
    account_type: string
    normal_balance: string
  } | null
  journal_entry: {
    status: string
  }
}

interface AccountBalance {
  code: string
  name: string
  type: string
  normalBalance: string
  debits: number
  credits: number
  balance: number
}

export async function GET(request: NextRequest) {
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

  (lineItems as LineItem[] | null)?.forEach((item) => {
    if (!item.account) return
    const accountId = item.account.id
    if (!accountBalances[accountId]) {
      accountBalances[accountId] = {
        code: item.account.code,
        name: item.account.name,
        type: item.account.account_type,
        normalBalance: item.account.normal_balance,
        debits: 0,
        credits: 0,
        balance: 0,
      }
    }
    accountBalances[accountId].debits += Number(item.debit) || 0
    accountBalances[accountId].credits += Number(item.credit) || 0
  })

  // Calculate final balances based on normal balance
  Object.values(accountBalances).forEach(account => {
    if (account.normalBalance === "DEBIT") {
      account.balance = account.debits - account.credits
    } else {
      account.balance = account.credits - account.debits
    }
  })

  // Get AP/AR summaries
  const { data: apData } = await supabase
    .from("accounts_payable")
    .select("total_amount, amount_paid, status")

  const { data: arData } = await supabase
    .from("accounts_receivable")
    .select("total_amount, amount_paid, status")

  // Calculate totals
  const apSummary = {
    total: apData?.reduce((sum, ap) => sum + Number(ap.total_amount), 0) || 0,
    paid: apData?.reduce((sum, ap) => sum + Number(ap.amount_paid), 0) || 0,
    outstanding: 0,
    unpaidCount: apData?.filter(ap => ap.status !== "PAID").length || 0,
  }
  apSummary.outstanding = apSummary.total - apSummary.paid

  const arSummary = {
    total: arData?.reduce((sum, ar) => sum + Number(ar.total_amount), 0) || 0,
    collected: arData?.reduce((sum, ar) => sum + Number(ar.amount_paid), 0) || 0,
    outstanding: 0,
    unpaidCount: arData?.filter(ar => ar.status !== "PAID").length || 0,
  }
  arSummary.outstanding = arSummary.total - arSummary.collected

  // Calculate financial summaries
  const accounts = Object.values(accountBalances)
  
  const totalAssets = accounts
    .filter(a => a.type === "ASSET")
    .reduce((sum, a) => sum + a.balance, 0)

  const totalLiabilities = accounts
    .filter(a => a.type === "LIABILITY")
    .reduce((sum, a) => sum + a.balance, 0)

  const totalEquity = accounts
    .filter(a => a.type === "EQUITY")
    .reduce((sum, a) => sum + a.balance, 0)

  const totalRevenue = accounts
    .filter(a => a.type === "REVENUE")
    .reduce((sum, a) => sum + a.balance, 0)

  const totalExpenses = accounts
    .filter(a => a.type === "EXPENSE")
    .reduce((sum, a) => sum + a.balance, 0)

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

  // Get cash balance
  const cashAccount = accounts.find(a => a.code === "1000")
  const cashBalance = cashAccount?.balance || 0

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
    recentEntries,
  })
}
