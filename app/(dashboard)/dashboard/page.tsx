"use client"

import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { formatCurrency, calculateVehicleTotalCost, calculateLotDays, calculateNetProfit } from "@/lib/utils"
import { Car, Users, FileText, DollarSign, TrendingUp, Percent, Clock, AlertTriangle, ArrowUpRight, ArrowDownRight } from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import type { Vehicle, Lead, Deal } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"]

export default function DashboardPage() {
  const { data, isLoading } = useSWR("/api/dashboard", fetcher)
  const { data: vehiclesData } = useSWR("/api/vehicles", fetcher)
  const { data: leadsData } = useSWR("/api/leads", fetcher)
  const { data: dealsData } = useSWR("/api/deals", fetcher)

  const vehicles: Vehicle[] = vehiclesData?.data || []
  const leads: Lead[] = leadsData?.data || []
  const deals: Deal[] = dealsData?.data || []

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    )
  }

  const stats = data?.stats || {}
  const salesTrend = data?.salesTrend || []

  // Calculate inventory financials
  const availableVehicles = vehicles.filter(v => v.status === "AVAILABLE")
  const pendingVehicles = vehicles.filter(v => v.status === "PENDING")
  const soldVehicles = vehicles.filter(v => v.status === "SOLD")
  
  const inventoryInvestment = availableVehicles.reduce((sum, v) => sum + calculateVehicleTotalCost(v), 0)
  const potentialRevenue = availableVehicles.reduce((sum, v) => sum + (Number(v.asking_price) || 0), 0)
  const potentialProfit = potentialRevenue - inventoryInvestment
  const avgDaysOnLot = availableVehicles.length > 0
    ? availableVehicles.reduce((sum, v) => sum + calculateLotDays(v.date_acquired), 0) / availableVehicles.length
    : 0

  // Aged inventory alert
  const agedVehicles = availableVehicles.filter(v => calculateLotDays(v.date_acquired) > 60)

  // Lead pipeline data
  const leadsByStage = {
    NEW: leads.filter(l => l.stage === "NEW").length,
    CONTACTED: leads.filter(l => l.stage === "CONTACTED").length,
    QUALIFIED: leads.filter(l => l.stage === "QUALIFIED").length,
    NEGOTIATING: leads.filter(l => l.stage === "NEGOTIATING").length,
  }
  const totalLeads = Object.values(leadsByStage).reduce((a, b) => a + b, 0)

  // Deal stats
  const closedDeals = deals.filter(d => d.stage === "CLOSED_WON")
  const lostDeals = deals.filter(d => d.stage === "CLOSED_LOST")
  const winRate = closedDeals.length + lostDeals.length > 0
    ? (closedDeals.length / (closedDeals.length + lostDeals.length)) * 100
    : 0

  // Sold vehicle profit
  const totalNetProfit = soldVehicles.reduce((sum, v) => sum + calculateNetProfit(v), 0)
  const avgProfitPerVehicle = soldVehicles.length > 0 ? totalNetProfit / soldVehicles.length : 0

  // Inventory status pie chart data
  const inventoryStatusData = [
    { name: "Available", value: availableVehicles.length },
    { name: "Pending", value: pendingVehicles.length },
    { name: "Sold", value: soldVehicles.length },
  ].filter(d => d.value > 0)

  // Lead pipeline chart data
  const pipelineData = [
    { stage: "New", count: leadsByStage.NEW },
    { stage: "Contacted", count: leadsByStage.CONTACTED },
    { stage: "Qualified", count: leadsByStage.QUALIFIED },
    { stage: "Negotiating", count: leadsByStage.NEGOTIATING },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your dealership performance
        </p>
      </div>

      {/* Alert Banner */}
      {agedVehicles.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center gap-4 py-4">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div className="flex-1">
              <p className="font-medium text-amber-800 dark:text-amber-200">
                {agedVehicles.length} vehicle{agedVehicles.length > 1 ? "s" : ""} over 60 days on lot
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {formatCurrency(agedVehicles.reduce((s, v) => s + calculateVehicleTotalCost(v), 0))} tied up in aged inventory
              </p>
            </div>
            <Badge variant="outline" className="border-amber-600 text-amber-600">
              Action Needed
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Primary KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(inventoryInvestment)}</div>
            <p className="text-xs text-muted-foreground">
              {availableVehicles.length} vehicles in stock
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Potential Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(potentialProfit)}</div>
            <p className="text-xs text-muted-foreground">
              At current asking prices
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Days on Lot</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${avgDaysOnLot > 45 ? "text-amber-600" : ""}`}>
              {Math.round(avgDaysOnLot)} days
            </div>
            <p className="text-xs text-muted-foreground">
              Target: under 45 days
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeads}</div>
            <p className="text-xs text-muted-foreground">
              {leadsByStage.NEGOTIATING} in negotiation
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vehicles Sold</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{soldVehicles.length}</div>
            <div className="flex items-center text-xs text-green-600">
              <ArrowUpRight className="mr-1 h-3 w-3" />
              {formatCurrency(totalNetProfit)} total profit
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Profit/Vehicle</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(avgProfitPerVehicle)}</div>
            <p className="text-xs text-muted-foreground">
              Per sold vehicle
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deal Win Rate</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{winRate.toFixed(0)}%</div>
            <Progress value={winRate} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Closed Deals</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{closedDeals.length}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(closedDeals.reduce((s, d) => s + (Number(d.sale_price) || 0), 0))} revenue
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Sales Trend */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales Trend</CardTitle>
            <CardDescription>Monthly sales and profit overview</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {salesTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salesTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis className="text-xs" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{ 
                        backgroundColor: "hsl(var(--background))", 
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="sales"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      name="Sales"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2}
                      name="Profit"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  No sales data yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Inventory Status Pie */}
        <Card>
          <CardHeader>
            <CardTitle>Inventory Status</CardTitle>
            <CardDescription>Vehicle distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {inventoryStatusData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={inventoryStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {inventoryStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  No inventory data
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lead Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle>Lead Pipeline</CardTitle>
          <CardDescription>Leads by stage in the sales process</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                <XAxis type="number" className="text-xs" />
                <YAxis dataKey="stage" type="category" className="text-xs" width={80} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--background))", 
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inventory Financials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total Purchase Cost</span>
              <span className="font-medium">{formatCurrency(availableVehicles.reduce((s, v) => s + v.purchase_price, 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Safety & Repairs</span>
              <span className="font-medium">{formatCurrency(availableVehicles.reduce((s, v) => s + (Number(v.safety_cost) || 0), 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total Investment</span>
              <span className="font-bold">{formatCurrency(inventoryInvestment)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-sm text-muted-foreground">Total Asking</span>
              <span className="font-bold text-green-600">{formatCurrency(potentialRevenue)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales Performance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Vehicles Sold</span>
              <span className="font-medium">{soldVehicles.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total Revenue</span>
              <span className="font-medium">{formatCurrency(soldVehicles.reduce((s, v) => s + (Number(v.selling_price) || 0), 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Total Net Profit</span>
              <span className="font-bold text-green-600">{formatCurrency(totalNetProfit)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-sm text-muted-foreground">Avg Days to Sell</span>
              <span className="font-medium">
                {soldVehicles.length > 0 
                  ? Math.round(soldVehicles.reduce((s, v) => s + calculateLotDays(v.date_acquired, v.date_sold || undefined), 0) / soldVehicles.length)
                  : 0} days
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">CRM Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">New Leads</span>
              <Badge variant="outline">{leadsByStage.NEW}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Contacted</span>
              <Badge variant="outline">{leadsByStage.CONTACTED}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Qualified</span>
              <Badge variant="outline">{leadsByStage.QUALIFIED}</Badge>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-sm text-muted-foreground">Negotiating</span>
              <Badge variant="success">{leadsByStage.NEGOTIATING}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
