import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  
  const status = searchParams.get("status")
  const limit = parseInt(searchParams.get("limit") || "50")
  const offset = parseInt(searchParams.get("offset") || "0")

  let query = supabase
    .from("journal_entries")
    .select(`
      *,
      line_items:journal_line_items(*, account:gl_accounts(*)),
      created_by_user:users!journal_entries_created_by_fkey(*)
    `, { count: "exact" })
    .order("entry_date", { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) {
    query = query.eq("status", status)
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
  const { line_items, ...entryData } = body

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Generate entry number if not provided
  if (!entryData.entry_number) {
    const { count } = await supabase
      .from("journal_entries")
      .select("*", { count: "exact", head: true })
    entryData.entry_number = `JE${String((count || 0) + 1).padStart(5, "0")}`
  }

  entryData.created_by = user.id
  entryData.status = entryData.status || "POSTED"
  if (entryData.status === "POSTED" && !entryData.posted_at) {
    entryData.posted_at = new Date().toISOString()
  }

  // Create the journal entry
  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .insert(entryData)
    .select()
    .single()

  if (entryError) {
    return NextResponse.json({ error: entryError.message }, { status: 500 })
  }

  // Create line items if provided
  if (line_items && line_items.length > 0) {
    const lineItemsWithEntryId = line_items.map((item: Record<string, unknown>) => ({
      ...item,
      journal_entry_id: entry.id,
    }))

    const { error: lineItemsError } = await supabase
      .from("journal_line_items")
      .insert(lineItemsWithEntryId)

    if (lineItemsError) {
      // Rollback - delete the entry
      await supabase.from("journal_entries").delete().eq("id", entry.id)
      return NextResponse.json({ error: lineItemsError.message }, { status: 500 })
    }
  }

  // Fetch the complete entry with line items
  const { data: completeEntry } = await supabase
    .from("journal_entries")
    .select(`
      *,
      line_items:journal_line_items(*, account:gl_accounts(*)),
      created_by_user:users!journal_entries_created_by_fkey(*)
    `)
    .eq("id", entry.id)
    .single()

  return NextResponse.json({ data: completeEntry }, { status: 201 })
}
