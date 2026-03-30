import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data, error } = await supabase
    .from("journal_entries")
    .select(`
      *,
      line_items:journal_line_items(*, account:gl_accounts(*)),
      created_by_user:users!journal_entries_created_by_fkey(*)
    `)
    .eq("id", id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { line_items, ...entryData } = body

  // Update the journal entry
  const { data: entry, error: entryError } = await supabase
    .from("journal_entries")
    .update({
      description: entryData.description,
      entry_date: entryData.entry_date,
      status: entryData.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single()

  if (entryError) {
    return NextResponse.json({ error: entryError.message }, { status: 500 })
  }

  // If line items are provided, replace them
  if (line_items && line_items.length > 0) {
    // Delete existing line items
    const { error: deleteError } = await supabase
      .from("journal_line_items")
      .delete()
      .eq("journal_entry_id", id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // Insert new line items
    const lineItemsWithEntryId = line_items.map((item: Record<string, unknown>) => ({
      ...item,
      journal_entry_id: id,
    }))

    const { error: insertError } = await supabase
      .from("journal_line_items")
      .insert(lineItemsWithEntryId)

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  // Fetch the complete updated entry
  const { data: completeEntry } = await supabase
    .from("journal_entries")
    .select(`
      *,
      line_items:journal_line_items(*, account:gl_accounts(*)),
      created_by_user:users!journal_entries_created_by_fkey(*)
    `)
    .eq("id", id)
    .single()

  return NextResponse.json({ data: completeEntry })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Check if this journal entry is linked to any AP/AR records
  const { data: apLinks } = await supabase
    .from("accounts_payable")
    .select("id")
    .eq("journal_entry_id", id)

  const { data: arLinks } = await supabase
    .from("accounts_receivable")
    .select("id")
    .eq("journal_entry_id", id)

  // Unlink from AP/AR if linked
  if (apLinks && apLinks.length > 0) {
    await supabase
      .from("accounts_payable")
      .update({ journal_entry_id: null })
      .eq("journal_entry_id", id)
  }

  if (arLinks && arLinks.length > 0) {
    await supabase
      .from("accounts_receivable")
      .update({ journal_entry_id: null })
      .eq("journal_entry_id", id)
  }

  // Delete line items first (due to foreign key constraint)
  const { error: lineItemsError } = await supabase
    .from("journal_line_items")
    .delete()
    .eq("journal_entry_id", id)

  if (lineItemsError) {
    return NextResponse.json({ error: lineItemsError.message }, { status: 500 })
  }

  // Delete the journal entry
  const { error: entryError } = await supabase
    .from("journal_entries")
    .delete()
    .eq("id", id)

  if (entryError) {
    return NextResponse.json({ error: entryError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
