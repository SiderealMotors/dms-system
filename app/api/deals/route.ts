import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  
  const stage = searchParams.get("stage")
  const salespersonId = searchParams.get("salesperson_id")
  const limit = parseInt(searchParams.get("limit") || "50")
  const offset = parseInt(searchParams.get("offset") || "0")

  let query = supabase
    .from("deals")
    .select(`
      *,
      vehicle:vehicles(*),
      lead:leads(*, customer:customers(*)),
      salesperson:users!deals_salesperson_id_fkey(*)
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (stage) {
    query = query.eq("stage", stage)
  }

  if (salespersonId) {
    query = query.eq("salesperson_id", salespersonId)
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data, count })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()

  // Generate deal number if not provided
  if (!body.deal_number) {
    const { count } = await supabase
      .from("deals")
      .select("*", { count: "exact", head: true })
    body.deal_number = `DL${String((count || 0) + 1).padStart(5, "0")}`
  }

  const { data, error } = await supabase
    .from("deals")
    .insert(body)
    .select(`
      *,
      vehicle:vehicles(*),
      lead:leads(*, customer:customers(*)),
      salesperson:users!deals_salesperson_id_fkey(*)
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
