import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// DELETE - Delete an expense and its journal entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  const supabase = await createClient()
  const { expenseId } = await params

  // Get the expense to find its journal entry
  const { data: expense } = await supabase
    .from("vehicle_expenses")
    .select("journal_entry_id")
    .eq("id", expenseId)
    .single()

  if (!expense) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 })
  }

  // Delete the journal entry (this will cascade to line items)
  if (expense.journal_entry_id) {
    await supabase.from("journal_line_items").delete().eq("journal_entry_id", expense.journal_entry_id)
    await supabase.from("journal_entries").delete().eq("id", expense.journal_entry_id)
  }

  // Delete the expense
  const { error } = await supabase
    .from("vehicle_expenses")
    .delete()
    .eq("id", expenseId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
