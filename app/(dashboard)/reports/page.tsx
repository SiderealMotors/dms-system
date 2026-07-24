"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatCurrency, formatDate, calculateVehicleTotalCost, calculateLotDays, calculateNetProfit } from "@/lib/utils"
import type { Vehicle, Deal, GLAccount, JournalEntry, User } from "@/lib/types"
import { Download, TrendingUp, TrendingDown, Car, DollarSign, Clock, Users } from "lucide-react"

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function ReportsPage() {
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  
  const { data: vehiclesData } = useSWR("/api/vehicles?includeDeleted=false", fetcher)
  const { data: soldVehiclesData } = useSWR("/api/vehicles?status=SOLD", fetcher)
  const { data: dealsData } = useSWR("/api/deals", fetcher)
  const { data: accountsData } = useSWR("/api/accounting/accounts", fetcher)
  const { data: entriesData } = useSWR("/api/accounting/journal-entries", fetcher)
  const { data: usersData } = useSWR("/api/users", fetcher)

  const vehicles: Vehicle[] = vehiclesData?.data || []
  const soldVehicles: Vehicle[] = soldVehiclesData?.data || []
  const deals: Deal[] = dealsData?.data || []
  const accounts: GLAccount[] = accountsData?.data || []
  const journalEntries: JournalEntry[] = entriesData?.data || []
  const users: User[] = usersData?.data || []

  // Calculate inventory stats
  const availableVehicles = vehicles.filter(v => v.status === "AVAILABLE")
  const pendingVehicles = vehicles.filter(v => v.status === "PENDING")
  
  const inventoryStats = {
    totalVehicles: vehicles.length,
    available: availableVehicles.length,
    pending: pendingVehicles.length,
    sold: soldVehicles.length,
    totalInvestment: availableVehicles.reduce((sum, v) => sum + calculateVehicleTotalCost(v), 0),
    totalAskingPrice: availableVehicles.reduce((sum, v) => sum + (Number(v.asking_price) || 0), 0),
    avgDaysOnLot: availableVehicles.length > 0 
      ? availableVehicles.reduce((sum, v) => sum + calculateLotDays(v.date_acquired), 0) / availableVehicles.length
      : 0,
    potentialProfit: availableVehicles.reduce((sum, v) => {
      const askingPrice = Number(v.asking_price) || 0
      const totalCost = calculateVehicleTotalCost(v)
      return sum + (askingPrice - totalCost)
    }, 0),
  }

  // Vehicle aging report
  const vehicleAging = {
    under30: availableVehicles.filter(v => calculateLotDays(v.date_acquired) < 30),
    days30to60: availableVehicles.filter(v => {
      const days = calculateLotDays(v.date_acquired)
      return days >= 30 && days < 60
    }),
    days60to90: availableVehicles.filter(v => {
      const days = calculateLotDays(v.date_acquired)
      return days >= 60 && days < 90
    }),
    over90: availableVehicles.filter(v => calculateLotDays(v.date_acquired) >= 90),
  }

  // Per-vehicle profit analysis for sold vehicles
  const vehicleProfitAnalysis = soldVehicles.map(v => ({
    ...v,
    totalCost: calculateVehicleTotalCost(v),
    lotDays: calculateLotDays(v.date_acquired, v.date_sold || undefined),
    netProfit: calculateNetProfit(v),
    profitMargin: v.selling_price && v.selling_price > 0 
      ? (calculateNetProfit(v) / v.selling_price) * 100 
      : 0
  })).sort((a, b) => b.netProfit - a.netProfit)

  // Sales stats
  const closedDeals = deals.filter(d => d.stage === "CLOSED_WON")
  const salesStats = {
    totalDeals: closedDeals.length,
    totalRevenue: closedDeals.reduce((sum, d) => sum + (Number(d.sale_price) || 0), 0),
    totalGrossProfit: closedDeals.reduce((sum, d) => sum + (Number(d.gross_profit) || 0), 0),
    avgDealValue: closedDeals.length > 0
      ? closedDeals.reduce((sum, d) => sum + (Number(d.sale_price) || 0), 0) / closedDeals.length
      : 0,
  }

  // Salesperson performance
  const salespersonStats = users
    .filter(u => u.role === "SALES" || u.role === "ADMIN")
    .map(user => {
      const userDeals = closedDeals.filter(d => d.salesperson_id === user.id)
      const userVehicles = soldVehicles.filter(v => v.salesperson_id === user.id)
      return {
        id: user.id,
        name: user.name,
        dealsCount: userDeals.length,
        vehiclesSold: userVehicles.length,
        totalRevenue: userDeals.reduce((sum, d) => sum + (Number(d.sale_price) || 0), 0),
        totalProfit: userVehicles.reduce((sum, v) => sum + calculateNetProfit(v), 0),
        avgProfit: userVehicles.length > 0 
          ? userVehicles.reduce((sum, v) => sum + calculateNetProfit(v), 0) / userVehicles.length
          : 0,
      }
    })
    .sort((a, b) => b.totalProfit - a.totalProfit)

  // Export to CSV function
  const exportToCSV = (data: Record<string, unknown>[], filename: string) => {
    if (data.length === 0) return
    const headers = Object.keys(data[0])
    const csvContent = [
      headers.join(","),
      ...data.map(row => headers.map(h => {
        const val = row[h]
        return typeof val === "string" && val.includes(",") ? `"${val}"` : val
      }).join(","))
    ].join("\n")
    
    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${filename}.csv`
    a.click()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">Comprehensive dealership analytics and reporting</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm">From:</Label>
            <Input 
              type="date" 
              value={dateFrom} 
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-auto"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm">To:</Label>
            <Input 
              type="date" 
              value={dateTo} 
              onChange={(e) => setDateTo(e.target.value)}
              className="w-auto"
            />
          </div>
        </div>
      </div>

      <Tabs defaultValue="inventory" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="vehicle-profit">Per-Vehicle Profit</TabsTrigger>
          <TabsTrigger value="aging">Aging Report</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="salesperson">Salesperson</TabsTrigger>
        </TabsList>

        {/* Inventory Report */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Available Inventory</CardTitle>
                <Car className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{inventoryStats.available}</div>
                <p className="text-xs text-muted-foreground">
                  {inventoryStats.pending} pending sale
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Investment</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(inventoryStats.totalInvestment)}</div>
                <p className="text-xs text-muted-foreground">
                  All costs included
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Potential Profit</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(inventoryStats.potentialProfit)}
                </div>
                <p className="text-xs text-muted-foreground">
                  At asking prices
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Days on Lot</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{Math.round(inventoryStats.avgDaysOnLot)}</div>
                <p className="text-xs text-muted-foreground">
                  days average
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Current Inventory</CardTitle>
                <CardDescription>Detailed breakdown of available vehicles</CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => exportToCSV(
                  availableVehicles.map(v => ({
                    StockNumber: v.stock_number,
                    Year: v.year,
                    Make: v.make,
                    Model: v.model,
                    VIN: v.vin,
                    PurchasePrice: v.purchase_price,
                    TotalCost: calculateVehicleTotalCost(v),
                    AskingPrice: v.asking_price || 0,
                    DaysOnLot: calculateLotDays(v.date_acquired),
                    PotentialProfit: (v.asking_price || 0) - calculateVehicleTotalCost(v),
                  })),
                  "inventory-report"
                )}
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stock #</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead className="text-right">Purchase</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                    <TableHead className="text-right">Asking</TableHead>
                    <TableHead className="text-right">Potential Profit</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availableVehicles.map((vehicle) => {
                    const totalCost = calculateVehicleTotalCost(vehicle)
                    const askingPrice = Number(vehicle.asking_price) || 0
                    const potentialProfit = askingPrice - totalCost
                    const lotDays = calculateLotDays(vehicle.date_acquired)
                    return (
                      <TableRow key={vehicle.id}>
                        <TableCell className="font-mono">{vehicle.stock_number}</TableCell>
                        <TableCell>{vehicle.year} {vehicle.make} {vehicle.model}</TableCell>
                        <TableCell className="text-right">{formatCurrency(vehicle.purchase_price)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(totalCost)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(askingPrice)}</TableCell>
                        <TableCell className={`text-right font-medium ${potentialProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(potentialProfit)}
                        </TableCell>
                        <TableCell className={`text-right ${lotDays > 60 ? "text-red-600" : ""}`}>
                          {lotDays}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="font-bold">Totals</TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(availableVehicles.reduce((s, v) => s + v.purchase_price, 0))}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(inventoryStats.totalInvestment)}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(inventoryStats.totalAskingPrice)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-green-600">
                      {formatCurrency(inventoryStats.potentialProfit)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Per-Vehicle Profit Report */}
        <TabsContent value="vehicle-profit" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Vehicles Sold</CardTitle>
                <Car className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{soldVehicles.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(soldVehicles.reduce((s, v) => s + (Number(v.selling_price) || 0), 0))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Net Profit</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(vehicleProfitAnalysis.reduce((s, v) => s + v.netProfit, 0))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Profit/Vehicle</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(
                    vehicleProfitAnalysis.length > 0
                      ? vehicleProfitAnalysis.reduce((s, v) => s + v.netProfit, 0) / vehicleProfitAnalysis.length
                      : 0
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Per-Vehicle Profit Analysis</CardTitle>
                <CardDescription>Detailed profit breakdown for each sold vehicle</CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => exportToCSV(
                  vehicleProfitAnalysis.map(v => ({
                    StockNumber: v.stock_number,
                    Vehicle: `${v.year} ${v.make} ${v.model}`,
                    BuyerName: v.buyer_name || "",
                    DateSold: v.date_sold || "",
                    PurchasePrice: v.purchase_price,
                    SafetyCost: v.safety_cost || 0,
                    WarrantyCost: v.warranty_cost || 0,
                    FloorplanCost: v.floorplan_interest_cost || 0,
                    GasCost: v.gas || 0,
                    ReferralCost: v.referral_amount || 0,
                    TotalCost: v.totalCost,
                    SellingPrice: v.selling_price || 0,
                    SafetyCharge: v.safety_charge || 0,
                    WarrantyCharge: v.warranty_charge || 0,
                    NetProfit: v.netProfit,
                    ProfitMargin: v.profitMargin.toFixed(1) + "%",
                    DaysOnLot: v.lotDays,
                  })),
                  "vehicle-profit-report"
                )}
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stock #</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                    <TableHead className="text-right">Selling Price</TableHead>
                    <TableHead className="text-right">Net Profit</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicleProfitAnalysis.map((vehicle) => (
                    <TableRow key={vehicle.id}>
                      <TableCell className="font-mono">{vehicle.stock_number}</TableCell>
                      <TableCell>{vehicle.year} {vehicle.make} {vehicle.model}</TableCell>
                      <TableCell>{vehicle.buyer_name || "-"}</TableCell>
                      <TableCell className="text-right">{formatCurrency(vehicle.totalCost)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(vehicle.selling_price || 0)}</TableCell>
                      <TableCell className={`text-right font-bold ${vehicle.netProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(vehicle.netProfit)}
                      </TableCell>
                      <TableCell className={`text-right ${vehicle.profitMargin >= 10 ? "text-green-600" : vehicle.profitMargin < 0 ? "text-red-600" : ""}`}>
                        {vehicle.profitMargin.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">{vehicle.lotDays}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aging Report */}
        <TabsContent value="aging" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Under 30 Days</CardTitle>
                <Badge variant="success">{vehicleAging.under30.length}</Badge>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{vehicleAging.under30.length}</div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(vehicleAging.under30.reduce((s, v) => s + calculateVehicleTotalCost(v), 0))} invested
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">30-60 Days</CardTitle>
                <Badge variant="secondary">{vehicleAging.days30to60.length}</Badge>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{vehicleAging.days30to60.length}</div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(vehicleAging.days30to60.reduce((s, v) => s + calculateVehicleTotalCost(v), 0))} invested
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">60-90 Days</CardTitle>
                <Badge variant="warning">{vehicleAging.days60to90.length}</Badge>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{vehicleAging.days60to90.length}</div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(vehicleAging.days60to90.reduce((s, v) => s + calculateVehicleTotalCost(v), 0))} invested
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Over 90 Days</CardTitle>
                <Badge variant="destructive">{vehicleAging.over90.length}</Badge>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{vehicleAging.over90.length}</div>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(vehicleAging.over90.reduce((s, v) => s + calculateVehicleTotalCost(v), 0))} invested
                </p>
              </CardContent>
            </Card>
          </div>

          {vehicleAging.over90.length > 0 && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-600">Aged Inventory Alert</CardTitle>
                <CardDescription>Vehicles over 90 days - consider price adjustments</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stock #</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                      <TableHead className="text-right">Asking Price</TableHead>
                      <TableHead className="text-right">Days on Lot</TableHead>
                      <TableHead className="text-right">Est. Floorplan Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vehicleAging.over90.map((vehicle) => {
                      const days = calculateLotDays(vehicle.date_acquired)
                      const totalCost = calculateVehicleTotalCost(vehicle)
                      // Estimate floorplan at 0.5% per month
                      const estFloorplan = (vehicle.purchase_price * 0.005 * (days / 30))
                      return (
                        <TableRow key={vehicle.id}>
                          <TableCell className="font-mono">{vehicle.stock_number}</TableCell>
                          <TableCell>{vehicle.year} {vehicle.make} {vehicle.model}</TableCell>
                          <TableCell className="text-right">{formatCurrency(totalCost)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(vehicle.asking_price || 0)}</TableCell>
                          <TableCell className="text-right text-red-600 font-bold">{days}</TableCell>
                          <TableCell className="text-right text-red-600">{formatCurrency(estFloorplan)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Sales Report */}
        <TabsContent value="sales" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Closed Deals</CardTitle>
                <Car className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{salesStats.totalDeals}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(salesStats.totalRevenue)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(salesStats.totalGrossProfit)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Deal Value</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(salesStats.avgDealValue)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Closed Deals</CardTitle>
              <CardDescription>Successfully completed vehicle sales</CardDescription>
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
                  {closedDeals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No closed deals found
                      </TableCell>
                    </TableRow>
                  ) : (
                    closedDeals.map((deal) => (
                      <TableRow key={deal.id}>
                        <TableCell className="font-mono">{deal.deal_number}</TableCell>
                        <TableCell>
                          {deal.vehicle ? `${deal.vehicle.year} ${deal.vehicle.make} ${deal.vehicle.model}` : "N/A"}
                        </TableCell>
                        <TableCell>{formatCurrency(deal.sale_price || 0)}</TableCell>
                        <TableCell className="text-green-600">{formatCurrency(deal.gross_profit || 0)}</TableCell>
                        <TableCell>{deal.deal_date ? formatDate(deal.deal_date) : "N/A"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Salesperson Performance */}
        <TabsContent value="salesperson" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Salesperson Performance</CardTitle>
              <CardDescription>Sales performance by team member</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Salesperson</TableHead>
                    <TableHead className="text-right">Vehicles Sold</TableHead>
                    <TableHead className="text-right">Total Revenue</TableHead>
                    <TableHead className="text-right">Total Profit</TableHead>
                    <TableHead className="text-right">Avg Profit/Vehicle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salespersonStats.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No sales data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    salespersonStats.map((person) => (
                      <TableRow key={person.id}>
                        <TableCell className="font-medium">{person.name}</TableCell>
                        <TableCell className="text-right">{person.vehiclesSold}</TableCell>
                        <TableCell className="text-right">{formatCurrency(person.totalRevenue)}</TableCell>
                        <TableCell className={`text-right font-bold ${person.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(person.totalProfit)}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(person.avgProfit)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-bold">Team Total</TableCell>
                    <TableCell className="text-right font-bold">
                      {salespersonStats.reduce((s, p) => s + p.vehiclesSold, 0)}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(salespersonStats.reduce((s, p) => s + p.totalRevenue, 0))}
                    </TableCell>
                    <TableCell className="text-right font-bold text-green-600">
                      {formatCurrency(salespersonStats.reduce((s, p) => s + p.totalProfit, 0))}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
