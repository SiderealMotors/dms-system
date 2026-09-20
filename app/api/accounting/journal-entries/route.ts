import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import type { AccountCode } from "@/lib/accounting/accounts"
import { toAmount } from "@/lib/accounting/money"
import {
  PostingError,
  postJournalEntry,
  resolveActingUserId,
  type PostingLine,
} from "@/lib/accounting/posting"

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

/**
 * Create a manual journal entry.
 *
 * Routed through the shared posting engine so a hand-keyed entry is held to the
 * same standard as a system-generated one: debits must equal credits, every
 * account must resolve, and the entry number comes from a single allocator.
 *
 * Line items may identify their account by `code` or by `account_id`.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()
  const { line_items, ...entryData } = body

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Attribute to the public.users row, not the auth uuid.
  const actingUserId = await resolveActingUserId(supabase)

  if (!Array.isArray(line_items) || line_items.length === 0) {
    return NextResponse.json(
      { error: "A journal entry requires at least two line items." },
      { status: 400 },
    )
  }

  // Resolve any account_id references to their codes.
  const { data: allAccounts, error: accountsError } = await supabase
    .from("gl_accounts")
    .select("id, code")

  if (accountsError) {
    return NextResponse.json({ error: accountsError.message }, { status: 500 })
  }

  const codeById = new Map((allAccounts ?? []).map((a) => [a.id as string, a.code as string]))

  const lines: PostingLine[] = []
  for (const item of line_items as Array<Record<string, unknown>>) {
    const code = (item.code as string) ?? codeById.get(item.account_id as string)
    if (!code) {
      return NextResponse.json(
        { error: `Line item does not reference a valid GL account.` },
        { status: 400 },
      )
    }
    lines.push({
      code: code as AccountCode,
      debit: toAmount(item.debit),
      credit: toAmount(item.credit),
      memo: (item.memo as string) ?? "",
    })
  }

  let entry
  try {
    entry = await postJournalEntry(supabase, {
      entryDate: entryData.entry_date || new Date().toISOString().split("T")[0],
      description: entryData.description || "Manual journal entry",
      lines,
      createdBy: actingUserId,
      // Hand-keyed entries must balance exactly; no rounding plug.
      strict: true,
    })
  } catch (err) {
    if (err instanceof PostingError) {
      return NextResponse.json({ error: err.message }, { status: 422 })
    }
    throw err
  }

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
