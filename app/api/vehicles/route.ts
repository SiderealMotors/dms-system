import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  
  const status = searchParams.get("status")
  const search = searchParams.get("search")
  const includeDeleted = searchParams.get("includeDeleted") === "true"
  const limit = parseInt(searchParams.get("limit") || "100")
  const offset = parseInt(searchParams.get("offset") || "0")

  let query = supabase
    .from("vehicles")
    .select("*, salesperson:users!vehicles_salesperson_id_fkey(id, name, email)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  // Exclude soft-deleted unless requested
  if (!includeDeleted) {
    query = query.is("deleted_at", null)
  }

  if (status) {
    query = query.eq("status", status)
  }

  if (search) {
    query = query.or(
      `stock_number.ilike.%${search}%,vin.ilike.%${search}%,make.ilike.%${search}%,model.ilike.%${search}%,buyer_name.ilike.%${search}%`
    )
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

  // Generate stock number if not provided
  if (!body.stock_number) {
    const { count } = await supabase
      .from("vehicles")
      .select("*", { count: "exact", head: true })
    body.stock_number = `STK${String((count || 0) + 1).padStart(5, "0")}`
  }

  const { data, error } = await supabase
    .from("vehicles")
    .insert(body)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
