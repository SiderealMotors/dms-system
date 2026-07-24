import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()

  // Fetch all data in parallel
  const [
    vehiclesResult,
    availableVehiclesResult,
    dealsResult,
    closedDealsResult,
    leadsResult,
  ] = await Promise.all([
    supabase.from("vehicles").select("*", { count: "exact", head: true }),
    supabase.from("vehicles").select("*", { count: "exact", head: true }).eq("status", "AVAILABLE"),
    supabase.from("deals").select("*", { count: "exact", head: true }),
    supabase.from("deals").select("sale_price, gross_profit").eq("stage", "CLOSED_WON"),
    supabase.from("leads").select("*", { count: "exact", head: true }).neq("status", "CLOSED"),
  ])

  // Calculate totals
  const totalVehicles = vehiclesResult.count || 0
  const availableVehicles = availableVehiclesResult.count || 0
  const totalDeals = dealsResult.count || 0
  const closedDeals = closedDealsResult.data?.length || 0
  const activeLeads = leadsResult.count || 0

  const totalRevenue = closedDealsResult.data?.reduce(
    (sum, deal) => sum + (Number(deal.sale_price) || 0),
    0
  ) || 0

  const totalProfit = closedDealsResult.data?.reduce(
    (sum, deal) => sum + (Number(deal.gross_profit) || 0),
    0
  ) || 0

  const conversionRate = totalDeals > 0 
    ? Math.round((closedDeals / totalDeals) * 100) 
    : 0

  // Get recent deals for trend data
  const { data: recentDeals } = await supabase
    .from("deals")
    .select("sale_price, gross_profit, deal_date")
    .eq("stage", "CLOSED_WON")
    .not("deal_date", "is", null)
    .order("deal_date", { ascending: true })
    .limit(100)

  // Group deals by month for trend chart
  const salesTrend: { month: string; sales: number; profit: number }[] = []
  const monthMap = new Map<string, { sales: number; profit: number }>()

  recentDeals?.forEach((deal) => {
    if (deal.deal_date) {
      const date = new Date(deal.deal_date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      const current = monthMap.get(monthKey) || { sales: 0, profit: 0 }
      monthMap.set(monthKey, {
        sales: current.sales + (Number(deal.sale_price) || 0),
        profit: current.profit + (Number(deal.gross_profit) || 0),
      })
    }
  })

  monthMap.forEach((value, key) => {
    salesTrend.push({
      month: key,
      sales: value.sales,
      profit: value.profit,
    })
  })

  // Sort by month
  salesTrend.sort((a, b) => a.month.localeCompare(b.month))

  return NextResponse.json({
    stats: {
      totalVehicles,
      availableVehicles,
      totalDeals,
      closedDeals,
      totalRevenue,
      totalProfit,
      activeLeads,
      conversionRate,
    },
    salesTrend,
  })
}
