"use client"

import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { Car, Users, FileText, DollarSign, TrendingUp, Percent } from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function DashboardPage() {
  const { data, isLoading } = useSWR("/api/dashboard", fetcher)

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    )
  }

  const stats = data?.stats || {}
  const salesTrend = data?.salesTrend || []

  const statCards = [
    {
      title: "Total Vehicles",
      value: stats.totalVehicles || 0,
      description: `${stats.availableVehicles || 0} available`,
      icon: Car,
    },
    {
      title: "Active Leads",
      value: stats.activeLeads || 0,
      description: "In pipeline",
      icon: Users,
    },
    {
      title: "Total Deals",
      value: stats.totalDeals || 0,
      description: `${stats.closedDeals || 0} closed`,
      icon: FileText,
    },
    {
      title: "Total Revenue",
      value: formatCurrency(stats.totalRevenue || 0),
      description: "From closed deals",
      icon: DollarSign,
    },
    {
      title: "Gross Profit",
      value: formatCurrency(stats.totalProfit || 0),
      description: "From closed deals",
      icon: TrendingUp,
    },
    {
      title: "Conversion Rate",
      value: `${stats.conversionRate || 0}%`,
      description: "Deals closed",
      icon: Percent,
    },
  ]

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your dealership performance
        </p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {salesTrend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sales Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={salesTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Line
                    type="monotone"
                    dataKey="sales"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    name="Sales"
                  />
                  <Line
                    type="monotone"
                    dataKey="profit"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    name="Profit"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
