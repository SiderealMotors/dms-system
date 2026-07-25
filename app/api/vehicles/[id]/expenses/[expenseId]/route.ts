import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveActingUserId, reverseJournalEntry } from "@/lib/accounting/posting"

// DELETE - Remove an expense and reverse its journal entry
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
) {
  const supabase = await createClient()
  const { expenseId } = await params

  // Get the expense to find its journal entry
  const { data: expense } = await supabase
    .from("vehicle_expenses")
    .select("journal_entry_id, description")
    .eq("id", expenseId)
    .single()

  if (!expense) {
    return NextResponse.json({ error: "Expense not found" }, { status: 404 })
  }

  // Posted entries are immutable. Reverse with a dated mirror entry rather
  // than deleting, so the ledger retains a complete history.
  if (expense.journal_entry_id) {
    const actingUserId = await resolveActingUserId(supabase)
    await reverseJournalEntry(supabase, expense.journal_entry_id as string, {
      reason: `Expense removed: ${expense.description ?? expenseId}`,
      createdBy: actingUserId,
    })
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
