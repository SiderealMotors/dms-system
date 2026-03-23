"use client"

import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { Vehicle, Deal, GLAccount, JournalEntry } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function ReportsPage() {
  const { data: vehiclesData } = useSWR("/api/vehicles", fetcher)
  const { data: dealsData } = useSWR("/api/deals", fetcher)
  const { data: accountsData } = useSWR("/api/accounting/accounts", fetcher)
  const { data: entriesData } = useSWR("/api/accounting/journal-entries", fetcher)

  const vehicles: Vehicle[] = vehiclesData?.data || []
  const deals: Deal[] = dealsData?.data || []
  const accounts: GLAccount[] = accountsData?.data || []
  const journalEntries: JournalEntry[] = entriesData?.data || []

  // Calculate inventory stats
  const inventoryStats = {
    totalVehicles: vehicles?.length ?? 0,
    available: vehicles?.filter(v => v.status === "AVAILABLE").length ?? 0,
    pending: vehicles?.filter(v => v.status === "PENDING").length ?? 0,
    sold: vehicles?.filter(v => v.status === "SOLD").length ?? 0,
    totalValue: vehicles?.reduce((sum, v) => sum + Number(v.purchase_price), 0) ?? 0,
    avgAskingPrice: vehicles?.length 
      ? vehicles.reduce((sum, v) => sum + (Number(v.asking_price) || 0), 0) / vehicles.length 
      : 0,
  }

  // Calculate sales stats
  const closedDeals = deals?.filter(d => d.stage === "CLOSED_WON") ?? []
  const salesStats = {
    totalDeals: closedDeals.length,
    totalRevenue: closedDeals.reduce((sum, d) => sum + (Number(d.sale_price) || 0), 0),
    totalGrossProfit: closedDeals.reduce((sum, d) => sum + (Number(d.gross_profit) || 0), 0),
    avgDealValue: closedDeals.length 
      ? closedDeals.reduce((sum, d) => sum + (Number(d.sale_price) || 0), 0) / closedDeals.length 
      : 0,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">View and analyze your dealership data</p>
        </div>
      </div>

      <Tabs defaultValue="inventory" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inventory">Inventory Report</TabsTrigger>
          <TabsTrigger value="sales">Sales Report</TabsTrigger>
          <TabsTrigger value="accounting">Accounting Report</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Vehicles</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{inventoryStats.totalVehicles}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Available</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{inventoryStats.available}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Sale</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{inventoryStats.pending}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Sold</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{inventoryStats.sold}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Inventory Value Summary</CardTitle>
              <CardDescription>Total inventory cost and average asking price</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Total Inventory Cost</p>
                  <p className="text-2xl font-bold">{formatCurrency(inventoryStats.totalValue)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Average Asking Price</p>
                  <p className="text-2xl font-bold">{formatCurrency(inventoryStats.avgAskingPrice)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vehicle List</CardTitle>
              <CardDescription>All vehicles in inventory</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stock #</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Purchase Price</TableHead>
                    <TableHead>Asking Price</TableHead>
                    <TableHead>Days in Stock</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicles?.map((vehicle) => {
                    const daysInStock = Math.floor(
                      (new Date().getTime() - new Date(vehicle.date_acquired).getTime()) / (1000 * 60 * 60 * 24)
                    )
                    return (
                      <TableRow key={vehicle.id}>
                        <TableCell className="font-medium">{vehicle.stock_number}</TableCell>
                        <TableCell>
                          {vehicle.year} {vehicle.make} {vehicle.model}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              vehicle.status === "AVAILABLE"
                                ? "default"
                                : vehicle.status === "PENDING"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {vehicle.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatCurrency(vehicle.purchase_price)}</TableCell>
                        <TableCell>{formatCurrency(vehicle.asking_price || 0)}</TableCell>
                        <TableCell>{daysInStock} days</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Closed Deals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{salesStats.totalDeals}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(salesStats.totalRevenue)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(salesStats.totalGrossProfit)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Deal Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(salesStats.avgDealValue)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Closed Deals</CardTitle>
              <CardDescription>Successfully closed vehicle sales</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deal #</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Sale Price</TableHead>
                    <TableHead>Gross Profit</TableHead>
                    <TableHead>Deal Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedDeals.map((deal) => (
                    <TableRow key={deal.id}>
                      <TableCell className="font-medium">{deal.deal_number}</TableCell>
                      <TableCell>
                        {deal.vehicle ? `${deal.vehicle.year} ${deal.vehicle.make} ${deal.vehicle.model}` : "N/A"}
                      </TableCell>
                      <TableCell>{formatCurrency(deal.sale_price || 0)}</TableCell>
                      <TableCell className="text-green-600">{formatCurrency(deal.gross_profit || 0)}</TableCell>
                      <TableCell>{deal.deal_date ? formatDate(deal.deal_date) : "N/A"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounting" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Chart of Accounts</CardTitle>
              <CardDescription>General ledger accounts</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Normal Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts?.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-medium">{account.code}</TableCell>
                      <TableCell>{account.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{account.account_type}</Badge>
                      </TableCell>
                      <TableCell>{account.normal_balance}</TableCell>
                      <TableCell>
                        <Badge variant={account.is_active ? "default" : "secondary"}>
                          {account.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Journal Entries</CardTitle>
              <CardDescription>Latest accounting entries</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entry #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journalEntries?.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{entry.entry_number}</TableCell>
                      <TableCell>{formatDate(entry.entry_date)}</TableCell>
                      <TableCell>{entry.description}</TableCell>
                      <TableCell>
                        <Badge variant={entry.status === "POSTED" ? "default" : "secondary"}>
                          {entry.status}
                        </Badge>
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
