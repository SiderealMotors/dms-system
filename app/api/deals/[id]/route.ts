import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data, error } = await supabase
    .from("deals")
    .select(`
      *,
      vehicle:vehicles(*),
      lead:leads(*, customer:customers(*)),
      salesperson:users!deals_salesperson_id_fkey(*)
    `)
    .eq("id", id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  return NextResponse.json({ data })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params
  const body = await request.json()

  // If deal is closed won, update the vehicle status
  if (body.stage === "CLOSED_WON" && body.vehicle_id) {
    await supabase
      .from("vehicles")
      .update({ status: "SOLD", date_sold: new Date().toISOString().split("T")[0] })
      .eq("id", body.vehicle_id)
  }

  const { data, error } = await supabase
    .from("deals")
    .update(body)
    .eq("id", id)
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

  return NextResponse.json({ data })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { error } = await supabase.from("deals").delete().eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
