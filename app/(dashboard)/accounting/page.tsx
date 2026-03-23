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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, DollarSign, TrendingUp, TrendingDown, X } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { GLAccount, JournalEntry } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type JournalLineForm = {
  account_id: string
  debit: string
  credit: string
  memo: string
}

export default function AccountingPage() {
  const { data: accountsData, mutate: mutateAccounts } = useSWR("/api/accounting/accounts", fetcher)
  const { data: entriesData, mutate: mutateEntries } = useSWR("/api/accounting/journal-entries", fetcher)
  
  const accounts: GLAccount[] = accountsData?.data || []
  const entries: JournalEntry[] = entriesData?.data || []

  const [isJournalDialogOpen, setIsJournalDialogOpen] = useState(false)
  const [journalForm, setJournalForm] = useState({
    entry_date: new Date().toISOString().split("T")[0],
    description: "",
  })
  const [journalLines, setJournalLines] = useState<JournalLineForm[]>([
    { account_id: "", debit: "", credit: "", memo: "" },
    { account_id: "", debit: "", credit: "", memo: "" },
  ])

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

  const addJournalLine = () => {
    setJournalLines([...journalLines, { account_id: "", debit: "", credit: "", memo: "" }])
  }

  const updateJournalLine = (index: number, field: keyof JournalLineForm, value: string) => {
    const newLines = [...journalLines]
    newLines[index][field] = value
    setJournalLines(newLines)
  }

  const removeJournalLine = (index: number) => {
    if (journalLines.length > 2) {
      setJournalLines(journalLines.filter((_, i) => i !== index))
    }
  }

  const submitJournalEntry = async () => {
    const totalDebit = journalLines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0)
    const totalCredit = journalLines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0)
    
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      alert("Debits must equal credits")
      return
    }

    const res = await fetch("/api/accounting/journal-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...journalForm,
        status: "POSTED",
        line_items: journalLines
          .filter((l) => l.account_id && (l.debit || l.credit))
          .map((l) => ({
            account_id: l.account_id,
            debit: parseFloat(l.debit) || 0,
            credit: parseFloat(l.credit) || 0,
            memo: l.memo,
          })),
      }),
    })

    if (res.ok) {
      setIsJournalDialogOpen(false)
      setJournalForm({ entry_date: new Date().toISOString().split("T")[0], description: "" })
      setJournalLines([
        { account_id: "", debit: "", credit: "", memo: "" },
        { account_id: "", debit: "", credit: "", memo: "" },
      ])
      mutateEntries()
    }
  }

  const lineTotalDebit = journalLines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0)
  const lineTotalCredit = journalLines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0)
  const isBalanced = Math.abs(lineTotalDebit - lineTotalCredit) < 0.01

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounting</h1>
          <p className="text-muted-foreground">General ledger, journal entries, and financial statements</p>
        </div>
        <Dialog open={isJournalDialogOpen} onOpenChange={setIsJournalDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Journal Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Journal Entry</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={journalForm.entry_date}
                    onChange={(e) => setJournalForm({ ...journalForm, entry_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={journalForm.description}
                    onChange={(e) => setJournalForm({ ...journalForm, description: e.target.value })}
                    placeholder="Description of the transaction"
                  />
                </div>
              </div>

              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">Account</TableHead>
                      <TableHead className="w-[150px]">Debit</TableHead>
                      <TableHead className="w-[150px]">Credit</TableHead>
                      <TableHead>Memo</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {journalLines.map((line, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Select
                            value={line.account_id}
                            onValueChange={(v) => updateJournalLine(index, "account_id", v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select account" />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                  {account.code} - {account.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={line.debit}
                            onChange={(e) => updateJournalLine(index, "debit", e.target.value)}
                            placeholder="0.00"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={line.credit}
                            onChange={(e) => updateJournalLine(index, "credit", e.target.value)}
                            placeholder="0.00"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={line.memo}
                            onChange={(e) => updateJournalLine(index, "memo", e.target.value)}
                            placeholder="Memo"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeJournalLine(index)}
                            disabled={journalLines.length <= 2}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={addJournalLine}>
                          Add Line
                        </Button>
                      </TableCell>
                      <TableCell className="font-bold">{formatCurrency(lineTotalDebit)}</TableCell>
                      <TableCell className="font-bold">{formatCurrency(lineTotalCredit)}</TableCell>
                      <TableCell colSpan={2}>
                        {isBalanced ? (
                          <Badge variant="success">Balanced</Badge>
                        ) : (
                          <Badge variant="destructive">
                            Out of balance: {formatCurrency(Math.abs(lineTotalDebit - lineTotalCredit))}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsJournalDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={submitJournalEntry} disabled={!isBalanced || !journalForm.description}>
                  Post Entry
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

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
                        <TableCell className="text-right font-mono text-green-600 w-32">
                          {formatCurrency(accountBalances[account.id] || 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={2} className="font-bold">Total Revenue</TableCell>
                      <TableCell className="text-right font-bold font-mono text-green-600">
                        {formatCurrency(totalRevenue)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
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
                        <TableCell className="text-right font-mono text-red-600 w-32">
                          {formatCurrency(accountBalances[account.id] || 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={2} className="font-bold">Total Expenses</TableCell>
                      <TableCell className="text-right font-bold font-mono text-red-600">
                        {formatCurrency(totalExpenses)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="border-t-2 pt-4">
                <Table>
                  <TableBody>
                    <TableRow className="bg-primary/10">
                      <TableCell colSpan={2} className="font-bold text-lg">Net Income</TableCell>
                      <TableCell className={`text-right font-bold text-lg font-mono w-32 ${netIncome >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(netIncome)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balance-sheet">
          <Card>
            <CardHeader>
              <CardTitle>Balance Sheet</CardTitle>
              <CardDescription>Assets, liabilities, and equity as of today</CardDescription>
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
                        <TableCell className="text-right font-mono w-32">
                          {formatCurrency(accountBalances[account.id] || 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={2} className="font-bold">Total Assets</TableCell>
                      <TableCell className="text-right font-bold font-mono">
                        {formatCurrency(totalAssets)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
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
                        <TableCell className="text-right font-mono w-32">
                          {formatCurrency(accountBalances[account.id] || 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={2} className="font-bold">Total Liabilities</TableCell>
                      <TableCell className="text-right font-bold font-mono">
                        {formatCurrency(totalLiabilities)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
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
                        <TableCell className="text-right font-mono w-32">
                          {formatCurrency(accountBalances[account.id] || 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="font-mono text-muted-foreground w-20"></TableCell>
                      <TableCell className="italic">Retained Earnings (Net Income)</TableCell>
                      <TableCell className="text-right font-mono italic w-32">
                        {formatCurrency(netIncome)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="bg-muted/50">
                      <TableCell colSpan={2} className="font-bold">Total Equity</TableCell>
                      <TableCell className="text-right font-bold font-mono">
                        {formatCurrency(totalEquity + netIncome)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="border-t-2 pt-4">
                <Table>
                  <TableBody>
                    <TableRow className="bg-primary/10">
                      <TableCell colSpan={2} className="font-bold text-lg">Total Liabilities & Equity</TableCell>
                      <TableCell className="text-right font-bold text-lg font-mono w-32">
                        {formatCurrency(totalLiabilities + totalEquity + netIncome)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="journal-entries">
          <Card>
            <CardHeader>
              <CardTitle>Journal Entries</CardTitle>
              <CardDescription>All recorded transactions</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entry #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No journal entries found
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map((entry) => {
                      const total = (entry.line_items || []).reduce(
                        (sum, li) => sum + (Number(li.debit) || 0),
                        0
                      )
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono">{entry.entry_number}</TableCell>
                          <TableCell>{formatDate(entry.entry_date)}</TableCell>
                          <TableCell>{entry.description}</TableCell>
                          <TableCell>
                            <Badge variant={entry.status === "POSTED" ? "success" : "secondary"}>
                              {entry.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(total)}</TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
