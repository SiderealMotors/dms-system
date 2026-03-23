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
import { Plus, DollarSign, TrendingUp, TrendingDown } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { JournalEntryDialog } from "@/components/journal-entry-dialog"
import type { GLAccount, JournalEntry } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function AccountingPage() {
  const { data: accountsData } = useSWR("/api/accounting/accounts", fetcher)
  const { data: entriesData, mutate: mutateEntries } = useSWR("/api/accounting/journal-entries", fetcher)
  
  const accounts: GLAccount[] = accountsData?.data || []
  const entries: JournalEntry[] = entriesData?.data || []

  const [isJournalDialogOpen, setIsJournalDialogOpen] = useState(false)

  // Calculate account balances from posted entries
  const accountBalances = accounts.reduce((acc, account) => {
    const balance = entries
      .filter((e) => e.status === "POSTED")
      .flatMap((e) => e.line_items || [])
      .filter((li) => li.account_id === account.id)
      .reduce((sum, li) => {
        const debit = Number(li.debit) || 0
        const credit = Number(li.credit) || 0
        return account.normal_balance === "DEBIT"
          ? sum + debit - credit
          : sum + credit - debit
      }, 0)
    acc[account.id] = balance
    return acc
  }, {} as Record<string, number>)

  // Group accounts by type
  const assetAccounts = accounts.filter((a) => a.account_type === "ASSET")
  const liabilityAccounts = accounts.filter((a) => a.account_type === "LIABILITY")
  const equityAccounts = accounts.filter((a) => a.account_type === "EQUITY")
  const revenueAccounts = accounts.filter((a) => a.account_type === "REVENUE")
  const expenseAccounts = accounts.filter((a) => a.account_type === "EXPENSE")

  // Calculate totals
  const totalAssets = assetAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0)
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0)
  const totalEquity = equityAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0)
  const totalRevenue = revenueAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0)
  const totalExpenses = expenseAccounts.reduce((sum, a) => sum + (accountBalances[a.id] || 0), 0)
  const netIncome = totalRevenue - totalExpenses

  const handleCloseDialog = () => {
    setIsJournalDialogOpen(false)
    mutateEntries()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounting</h1>
          <p className="text-muted-foreground">General ledger, journal entries, and financial statements</p>
        </div>
        <Button onClick={() => setIsJournalDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Journal Entry
        </Button>
      </div>

      {/* Journal Entry Dialog */}
      <JournalEntryDialog 
        open={isJournalDialogOpen} 
        onClose={handleCloseDialog}
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalAssets)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Liabilities</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalLiabilities)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalRevenue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net Income</CardTitle>
            {netIncome >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netIncome >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatCurrency(netIncome)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="chart-of-accounts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="chart-of-accounts">Chart of Accounts</TabsTrigger>
          <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
          <TabsTrigger value="income-statement">Income Statement</TabsTrigger>
          <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
          <TabsTrigger value="journal-entries">Journal Entries</TabsTrigger>
        </TabsList>

        <TabsContent value="chart-of-accounts">
          <Card>
            <CardHeader>
              <CardTitle>Chart of Accounts</CardTitle>
              <CardDescription>All general ledger accounts organized by type</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Normal Balance</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-mono">{account.code}</TableCell>
                      <TableCell className="font-medium">{account.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{account.account_type}</Badge>
                      </TableCell>
                      <TableCell>{account.normal_balance}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(accountBalances[account.id] || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trial-balance">
          <Card>
            <CardHeader>
              <CardTitle>Trial Balance</CardTitle>
              <CardDescription>Summary of all account balances</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts
                    .filter((a) => (accountBalances[a.id] || 0) !== 0)
                    .map((account) => {
                      const balance = accountBalances[account.id] || 0
                      const isDebitNormal = account.normal_balance === "DEBIT"
                      return (
                        <TableRow key={account.id}>
                          <TableCell className="font-mono">{account.code}</TableCell>
                          <TableCell>{account.name}</TableCell>
                          <TableCell className="text-right font-mono">
                            {(isDebitNormal && balance > 0) || (!isDebitNormal && balance < 0)
                              ? formatCurrency(Math.abs(balance))
                              : ""}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {(!isDebitNormal && balance > 0) || (isDebitNormal && balance < 0)
                              ? formatCurrency(Math.abs(balance))
                              : ""}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="font-bold">Totals</TableCell>
                    <TableCell className="text-right font-bold font-mono">
                      {formatCurrency(
                        accounts.reduce((sum, a) => {
                          const bal = accountBalances[a.id] || 0
                          const isDebitNormal = a.normal_balance === "DEBIT"
                          if ((isDebitNormal && bal > 0) || (!isDebitNormal && bal < 0)) {
                            return sum + Math.abs(bal)
                          }
                          return sum
                        }, 0)
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold font-mono">
                      {formatCurrency(
                        accounts.reduce((sum, a) => {
                          const bal = accountBalances[a.id] || 0
                          const isDebitNormal = a.normal_balance === "DEBIT"
                          if ((!isDebitNormal && bal > 0) || (isDebitNormal && bal < 0)) {
                            return sum + Math.abs(bal)
                          }
                          return sum
                        }, 0)
                      )}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="income-statement">
          <Card>
            <CardHeader>
              <CardTitle>Income Statement</CardTitle>
              <CardDescription>Revenue and expenses for the period</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold text-lg mb-2">Revenue</h3>
                <Table>
                  <TableBody>
                    {revenueAccounts.filter(a => (accountBalances[a.id] || 0) !== 0).map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-mono text-muted-foreground w-20">{account.code}</TableCell>
                        <TableCell>{account.name}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(accountBalances[account.id] || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="font-bold">Total Revenue</TableCell>
                      <TableCell className="text-right font-bold font-mono text-green-600">{formatCurrency(totalRevenue)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">Expenses</h3>
                <Table>
                  <TableBody>
                    {expenseAccounts.filter(a => (accountBalances[a.id] || 0) !== 0).map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-mono text-muted-foreground w-20">{account.code}</TableCell>
                        <TableCell>{account.name}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(accountBalances[account.id] || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="font-bold">Total Expenses</TableCell>
                      <TableCell className="text-right font-bold font-mono text-red-600">{formatCurrency(totalExpenses)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-xl font-bold">Net Income</span>
                  <span className={`text-2xl font-bold ${netIncome >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(netIncome)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balance-sheet">
          <Card>
            <CardHeader>
              <CardTitle>Balance Sheet</CardTitle>
              <CardDescription>Assets, liabilities, and equity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold text-lg mb-2">Assets</h3>
                <Table>
                  <TableBody>
                    {assetAccounts.filter(a => (accountBalances[a.id] || 0) !== 0).map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-mono text-muted-foreground w-20">{account.code}</TableCell>
                        <TableCell>{account.name}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(accountBalances[account.id] || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="font-bold">Total Assets</TableCell>
                      <TableCell className="text-right font-bold font-mono">{formatCurrency(totalAssets)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">Liabilities</h3>
                <Table>
                  <TableBody>
                    {liabilityAccounts.filter(a => (accountBalances[a.id] || 0) !== 0).map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-mono text-muted-foreground w-20">{account.code}</TableCell>
                        <TableCell>{account.name}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(accountBalances[account.id] || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="font-bold">Total Liabilities</TableCell>
                      <TableCell className="text-right font-bold font-mono">{formatCurrency(totalLiabilities)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">Equity</h3>
                <Table>
                  <TableBody>
                    {equityAccounts.filter(a => (accountBalances[a.id] || 0) !== 0).map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-mono text-muted-foreground w-20">{account.code}</TableCell>
                        <TableCell>{account.name}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(accountBalances[account.id] || 0)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="font-mono text-muted-foreground w-20"></TableCell>
                      <TableCell className="italic">Net Income (Current Period)</TableCell>
                      <TableCell className="text-right font-mono italic">{formatCurrency(netIncome)}</TableCell>
                    </TableRow>
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2} className="font-bold">Total Equity</TableCell>
                      <TableCell className="text-right font-bold font-mono">{formatCurrency(totalEquity + netIncome)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-xl font-bold">Total Liabilities + Equity</span>
                  <span className="text-2xl font-bold">
                    {formatCurrency(totalLiabilities + totalEquity + netIncome)}
                  </span>
                </div>
                {Math.abs(totalAssets - (totalLiabilities + totalEquity + netIncome)) < 0.01 ? (
                  <Badge variant="success" className="mt-2">Balance Sheet is Balanced</Badge>
                ) : (
                  <Badge variant="destructive" className="mt-2">
                    Out of Balance by {formatCurrency(Math.abs(totalAssets - (totalLiabilities + totalEquity + netIncome)))}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="journal-entries">
          <Card>
            <CardHeader>
              <CardTitle>Journal Entries</CardTitle>
              <CardDescription>All recorded journal entries</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Entry #</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{formatDate(entry.entry_date)}</TableCell>
                      <TableCell className="font-mono">{entry.entry_number}</TableCell>
                      <TableCell>{entry.description}</TableCell>
                      <TableCell>
                        <Badge variant={entry.status === "POSTED" ? "success" : "warning"}>
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(
                          (entry.line_items || []).reduce((sum, li) => sum + (Number(li.debit) || 0), 0)
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
    </div>
  )
}
