"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { GLAccount, JournalEntry, JournalStatus } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const statusColors: Record<JournalStatus, "default" | "success"> = {
  DRAFT: "default",
  POSTED: "success",
}

export default function AccountingPage() {
  const [activeTab, setActiveTab] = useState("journal")

  const { data: accountsData, isLoading: accountsLoading } = useSWR(
    "/api/accounting/accounts",
    fetcher
  )
  const { data: entriesData, isLoading: entriesLoading } = useSWR(
    "/api/accounting/journal-entries",
    fetcher
  )

  const accounts: GLAccount[] = accountsData?.data || []
  const entries: JournalEntry[] = entriesData?.data || []

  // Group accounts by type
  const accountsByType = accounts.reduce(
    (acc, account) => {
      if (!acc[account.account_type]) {
        acc[account.account_type] = []
      }
      acc[account.account_type].push(account)
      return acc
    },
    {} as Record<string, GLAccount[]>
  )

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Accounting</h1>
          <p className="text-muted-foreground">
            Manage GL accounts and journal entries
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="journal">Journal Entries</TabsTrigger>
          <TabsTrigger value="accounts">Chart of Accounts</TabsTrigger>
        </TabsList>

        <TabsContent value="journal" className="mt-6">
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Debits</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entriesLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">
                      No journal entries found
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry) => {
                    const totalDebits =
                      entry.line_items?.reduce(
                        (sum, item) => sum + Number(item.debit || 0),
                        0
                      ) || 0
                    const totalCredits =
                      entry.line_items?.reduce(
                        (sum, item) => sum + Number(item.credit || 0),
                        0
                      ) || 0

                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="font-medium">
                          {entry.entry_number}
                        </TableCell>
                        <TableCell>{formatDate(entry.entry_date)}</TableCell>
                        <TableCell>{entry.description}</TableCell>
                        <TableCell>
                          <Badge variant={statusColors[entry.status]}>
                            {entry.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(totalDebits)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(totalCredits)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="accounts" className="mt-6">
          <div className="space-y-6">
            {["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"].map(
              (type) => (
                <div key={type}>
                  <h3 className="mb-3 text-lg font-semibold">{type}</h3>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Normal Balance</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {accountsLoading ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center">
                              Loading...
                            </TableCell>
                          </TableRow>
                        ) : (accountsByType[type] || []).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center">
                              No accounts
                            </TableCell>
                          </TableRow>
                        ) : (
                          (accountsByType[type] || []).map((account) => (
                            <TableRow key={account.id}>
                              <TableCell className="font-mono">
                                {account.code}
                              </TableCell>
                              <TableCell>{account.name}</TableCell>
                              <TableCell>{account.normal_balance}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    account.is_active ? "success" : "secondary"
                                  }
                                >
                                  {account.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
