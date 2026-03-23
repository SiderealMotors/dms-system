"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Receipt,
  FileText,
  Plus,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
} from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { GLAccount, JournalEntry, AccountsPayable, AccountsReceivable, Vendor } from "@/lib/types"
import { JournalEntryDialog } from "@/components/journal-entry-dialog"
import { BillDialog } from "@/components/bill-dialog"
import { InvoiceDialog } from "@/components/invoice-dialog"
import { PaymentDialog } from "@/components/payment-dialog"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function AccountingPage() {
  const { data: summaryData, mutate: mutateSummary } = useSWR("/api/accounting/summary", fetcher)
  const { data: accountsData } = useSWR("/api/accounting/accounts", fetcher)
  const { data: entriesData, mutate: mutateEntries } = useSWR("/api/accounting/journal-entries", fetcher)
  const { data: payablesData, mutate: mutatePayables } = useSWR("/api/accounting/payables", fetcher)
  const { data: receivablesData, mutate: mutateReceivables } = useSWR("/api/accounting/receivables", fetcher)
  const { data: vendorsData } = useSWR("/api/vendors?active=true", fetcher)
  
  const accounts: GLAccount[] = accountsData?.data || []
  const entries: JournalEntry[] = entriesData?.data || []
  const payables: AccountsPayable[] = payablesData?.data || []
  const receivables: AccountsReceivable[] = receivablesData?.data || []
  const vendors: Vendor[] = vendorsData?.data || []

  const [isJournalDialogOpen, setIsJournalDialogOpen] = useState(false)
  const [isBillDialogOpen, setIsBillDialogOpen] = useState(false)
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false)
  const [paymentTarget, setPaymentTarget] = useState<{ type: "payable" | "receivable", item: AccountsPayable | AccountsReceivable } | null>(null)

  const refreshAll = () => {
    mutateSummary()
    mutateEntries()
    mutatePayables()
    mutateReceivables()
  }

  // Get financials from summary
  const financials = summaryData?.financials || {
    totalAssets: 0,
    totalLiabilities: 0,
    totalEquity: 0,
    totalRevenue: 0,
    totalExpenses: 0,
    netIncome: 0,
    cashBalance: 0,
  }
  const apSummary = summaryData?.apSummary || { total: 0, paid: 0, outstanding: 0, unpaidCount: 0 }
  const arSummary = summaryData?.arSummary || { total: 0, collected: 0, outstanding: 0, unpaidCount: 0 }
  const accountBalances = summaryData?.accountBalances || []

  // Group accounts by type for reports
  type AccountBalance = typeof accountBalances[0]
  const assetAccounts = accountBalances.filter((a: AccountBalance) => a.type === "ASSET")
  const liabilityAccounts = accountBalances.filter((a: AccountBalance) => a.type === "LIABILITY")
  const equityAccounts = accountBalances.filter((a: AccountBalance) => a.type === "EQUITY")
  const revenueAccounts = accountBalances.filter((a: AccountBalance) => a.type === "REVENUE")
  const expenseAccounts = accountBalances.filter((a: AccountBalance) => a.type === "EXPENSE")

  // Export functions
  const exportTrialBalance = () => {
    const headers = ["Account Code", "Account Name", "Debit", "Credit"]
    const rows = accountBalances.map((a) => [
      a.code,
      a.name,
      a.balance > 0 && a.normalBalance === "DEBIT" ? a.balance.toFixed(2) : "",
      a.balance > 0 && a.normalBalance === "CREDIT" ? a.balance.toFixed(2) : "",
    ])
    
    const csv = [headers, ...rows].map(row => row.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `trial-balance-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
  }

  const exportJournalEntries = () => {
    const headers = ["Entry #", "Date", "Description", "Account", "Debit", "Credit", "Status"]
    const rows: string[][] = []
    
    entries.forEach(entry => {
      entry.line_items?.forEach((line, idx) => {
        rows.push([
          idx === 0 ? entry.entry_number : "",
          idx === 0 ? entry.entry_date : "",
          idx === 0 ? entry.description : "",
          `${line.account?.code} - ${line.account?.name}`,
          line.debit > 0 ? line.debit.toFixed(2) : "",
          line.credit > 0 ? line.credit.toFixed(2) : "",
          idx === 0 ? entry.status : "",
        ])
      })
    })
    
    const csv = [headers, ...rows].map(row => row.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `journal-entries-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Accounting</h1>
          <p className="text-muted-foreground">Full double-entry accounting system</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsBillDialogOpen(true)}>
            <Receipt className="mr-2 h-4 w-4" />
            Record Bill
          </Button>
          <Button variant="outline" onClick={() => setIsInvoiceDialogOpen(true)}>
            <FileText className="mr-2 h-4 w-4" />
            Create Invoice
          </Button>
          <Button onClick={() => setIsJournalDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Journal Entry
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="journal">General Ledger</TabsTrigger>
          <TabsTrigger value="payables">Payables</TabsTrigger>
          <TabsTrigger value="receivables">Receivables</TabsTrigger>
        </TabsList>

        {/* ========== DASHBOARD TAB ========== */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Cash Balance</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(financials.cashBalance)}
                </div>
                <p className="text-xs text-muted-foreground">Available cash</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Accounts Receivable</CardTitle>
                <ArrowUpRight className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(arSummary.outstanding)}</div>
                <p className="text-xs text-muted-foreground">
                  {arSummary.unpaidCount} unpaid invoice{arSummary.unpaidCount !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Accounts Payable</CardTitle>
                <ArrowDownRight className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{formatCurrency(apSummary.outstanding)}</div>
                <p className="text-xs text-muted-foreground">
                  {apSummary.unpaidCount} unpaid bill{apSummary.unpaidCount !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Net Income</CardTitle>
                {financials.netIncome >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-500" />
                )}
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${financials.netIncome >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatCurrency(financials.netIncome)}
                </div>
                <p className="text-xs text-muted-foreground">Revenue - Expenses</p>
              </CardContent>
            </Card>
          </div>

          {/* Financial Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Assets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {assetAccounts.filter((a: AccountBalance) => a.balance !== 0).map((account) => (
                  <div key={account.code} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{account.code} - {account.name}</span>
                    <span>{formatCurrency(account.balance)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-2 border-t">
                  <span>Total Assets</span>
                  <span>{formatCurrency(financials.totalAssets)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Liabilities</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {liabilityAccounts.filter((a: AccountBalance) => a.balance !== 0).map((account) => (
                  <div key={account.code} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{account.code} - {account.name}</span>
                    <span>{formatCurrency(account.balance)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-2 border-t">
                  <span>Total Liabilities</span>
                  <span>{formatCurrency(financials.totalLiabilities)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Income Statement</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Revenue</span>
                  <span className="text-green-600">{formatCurrency(financials.totalRevenue)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Expenses</span>
                  <span className="text-red-600">({formatCurrency(financials.totalExpenses)})</span>
                </div>
                <div className="flex justify-between font-bold pt-2 border-t">
                  <span>Net Income</span>
                  <span className={financials.netIncome >= 0 ? "text-green-600" : "text-red-600"}>
                    {formatCurrency(financials.netIncome)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Journal Entries</CardTitle>
              <CardDescription>Last 10 transactions</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entry #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(summaryData?.recentEntries || []).slice(0, 10).map((entry: JournalEntry) => {
                    const totalDebit = entry.line_items?.reduce((sum, li) => sum + Number(li.debit), 0) || 0
                    const totalCredit = entry.line_items?.reduce((sum, li) => sum + Number(li.credit), 0) || 0
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono">{entry.entry_number}</TableCell>
                        <TableCell>{formatDate(entry.entry_date)}</TableCell>
                        <TableCell>{entry.description}</TableCell>
                        <TableCell className="text-right">{formatCurrency(totalDebit)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(totalCredit)}</TableCell>
                        <TableCell>
                          <Badge variant={entry.status === "POSTED" ? "success" : "secondary"}>
                            {entry.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== TRANSACTIONS TAB ========== */}
        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>All Journal Entries</CardTitle>
                <CardDescription>Complete transaction history</CardDescription>
              </div>
              <Button variant="outline" onClick={exportJournalEntries}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entry #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Accounts</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const totalDebit = entry.line_items?.reduce((sum, li) => sum + Number(li.debit), 0) || 0
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono">{entry.entry_number}</TableCell>
                        <TableCell>{formatDate(entry.entry_date)}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{entry.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {entry.line_items?.slice(0, 2).map(li => li.account?.code).join(", ")}
                          {(entry.line_items?.length || 0) > 2 && "..."}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(totalDebit)}</TableCell>
                        <TableCell>
                          <Badge variant={entry.status === "POSTED" ? "success" : "secondary"}>
                            {entry.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== GENERAL LEDGER TAB ========== */}
        <TabsContent value="journal" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Trial Balance</CardTitle>
                <CardDescription>Account balances as of today</CardDescription>
              </div>
              <Button variant="outline" onClick={exportTrialBalance}>
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Debits</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accountBalances.map((account: AccountBalance) => (
                    <TableRow key={account.code}>
                      <TableCell className="font-mono">{account.code}</TableCell>
                      <TableCell>{account.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{account.type}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(account.debits)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(account.credits)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(account.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3}>Total</TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(accountBalances.reduce((sum: number, a: AccountBalance) => sum + a.debits, 0))}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(accountBalances.reduce((sum: number, a: AccountBalance) => sum + a.credits, 0))}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>

          {/* Chart of Accounts */}
          <Card>
            <CardHeader>
              <CardTitle>Chart of Accounts</CardTitle>
              <CardDescription>All GL accounts organized by type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"].map(type => (
                  <div key={type} className="space-y-2">
                    <h4 className="font-semibold text-sm text-muted-foreground">{type}</h4>
                    {accounts
                      .filter(a => a.account_type === type)
                      .map(account => (
                        <div key={account.id} className="text-sm flex justify-between">
                          <span>{account.code} - {account.name}</span>
                          {!account.is_active && <Badge variant="secondary">Inactive</Badge>}
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== PAYABLES TAB ========== */}
        <TabsContent value="payables" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Payables</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(apSummary.total)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Amount Paid</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(apSummary.paid)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{formatCurrency(apSummary.outstanding)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Bills & Payables</CardTitle>
              <CardDescription>Amounts owed to vendors</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill #</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payables.map((bill) => (
                    <TableRow key={bill.id}>
                      <TableCell className="font-mono">{bill.bill_number || "-"}</TableCell>
                      <TableCell>{bill.vendor?.name || "Unknown"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{bill.description}</TableCell>
                      <TableCell>{formatDate(bill.bill_date)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(bill.total_amount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(bill.amount_paid)}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            bill.status === "PAID" ? "success" : 
                            bill.status === "PARTIAL" ? "warning" : "destructive"
                          }
                        >
                          {bill.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {bill.status !== "PAID" && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setPaymentTarget({ type: "payable", item: bill })}
                          >
                            Pay
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== RECEIVABLES TAB ========== */}
        <TabsContent value="receivables" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Receivables</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(arSummary.total)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Collected</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(arSummary.collected)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600">{formatCurrency(arSummary.outstanding)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Customer Invoices</CardTitle>
              <CardDescription>Amounts due from customers</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivables.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-mono">{invoice.invoice_number}</TableCell>
                      <TableCell>
                        {invoice.customer 
                          ? `${invoice.customer.first_name} ${invoice.customer.last_name}`
                          : "Walk-in"
                        }
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{invoice.description}</TableCell>
                      <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(invoice.total_amount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(invoice.amount_paid)}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            invoice.status === "PAID" ? "success" : 
                            invoice.status === "PARTIAL" ? "warning" : "outline"
                          }
                        >
                          {invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {invoice.status !== "PAID" && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setPaymentTarget({ type: "receivable", item: invoice })}
                          >
                            Record Payment
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <JournalEntryDialog
        open={isJournalDialogOpen}
        onOpenChange={setIsJournalDialogOpen}
        onSuccess={refreshAll}
      />

      <BillDialog
        open={isBillDialogOpen}
        onOpenChange={setIsBillDialogOpen}
        vendors={vendors}
        onSuccess={refreshAll}
      />

      <InvoiceDialog
        open={isInvoiceDialogOpen}
        onOpenChange={setIsInvoiceDialogOpen}
        onSuccess={refreshAll}
      />

      {paymentTarget && (
        <PaymentDialog
          open={!!paymentTarget}
          onOpenChange={() => setPaymentTarget(null)}
          type={paymentTarget.type}
          item={paymentTarget.item}
          onSuccess={refreshAll}
        />
      )}
    </div>
  )
}
