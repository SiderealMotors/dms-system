import type { createClient } from "@/lib/supabase/server"
import { ACCOUNTS, type AccountCode } from "./accounts"
import { ROUNDING_TOLERANCE, roundMoney, sumMoney, toAmount } from "./money"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export class PostingError extends Error {
  constructor(
    message: string,
    public readonly detail?: Record<string, unknown>,
  ) {
    super(message)
    this.name = "PostingError"
  }
}

/** A requested journal line, expressed by account CODE rather than uuid. */
export type PostingLine = {
  code: AccountCode
  debit?: number
  credit?: number
  memo: string
}

export type PostJournalEntryInput = {
  entryDate: string
  description: string
  lines: PostingLine[]
  createdBy?: string | null
  /** Skip the rounding plug and fail hard instead. Used by tests/tools. */
  strict?: boolean
}

/**
 * Resolve GL account codes to ids.
 *
 * Throws when a code is missing instead of returning undefined. The previous
 * behaviour -- looking up a nonexistent account and skipping the line -- is
 * exactly how entries silently went out of balance.
 */
export async function loadAccountIds(
  supabase: SupabaseServerClient,
  codes: readonly string[],
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(codes))
  if (unique.length === 0) return {}

  const { data, error } = await supabase
    .from("gl_accounts")
    .select("id, code")
    .in("code", unique)

  if (error) {
    throw new PostingError(`Failed to load GL accounts: ${error.message}`)
  }

  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    map[row.code as string] = row.id as string
  }

  const missing = unique.filter((code) => !map[code])
  if (missing.length > 0) {
    throw new PostingError(
      `Chart of accounts is missing required account(s): ${missing.join(", ")}. ` +
        `Run scripts/010_accounting_compliance.sql to add them.`,
      { missing },
    )
  }

  return map
}

/**
 * Verify debits equal credits. Returns a rounding plug line when the residual
 * is within tolerance, otherwise throws -- an out-of-balance entry must never
 * reach the database.
 */
export function balanceLines(
  lines: PostingLine[],
  strict = false,
): { lines: PostingLine[]; totalDebit: number; totalCredit: number } {
  const normalized = lines
    .map((line) => ({
      ...line,
      debit: toAmount(line.debit),
      credit: toAmount(line.credit),
    }))
    .filter((line) => line.debit !== 0 || line.credit !== 0)

  for (const line of normalized) {
    if (line.debit !== 0 && line.credit !== 0) {
      throw new PostingError(
        `Journal line "${line.memo}" has both a debit and a credit. ` +
          `Split it into two lines.`,
        { line },
      )
    }
  }

  const totalDebit = sumMoney(normalized.map((l) => l.debit))
  const totalCredit = sumMoney(normalized.map((l) => l.credit))
  const diff = roundMoney(totalDebit - totalCredit)

  if (diff === 0) {
    return { lines: normalized, totalDebit, totalCredit }
  }

  if (strict || Math.abs(diff) > ROUNDING_TOLERANCE) {
    throw new PostingError(
      `Entry is out of balance by ${diff.toFixed(2)} ` +
        `(debits ${totalDebit.toFixed(2)} vs credits ${totalCredit.toFixed(2)}). ` +
        `Refusing to post.`,
      { totalDebit, totalCredit, diff, lines: normalized },
    )
  }

  // Within a cent or two: absorb with an explicit, visible plug line.
  normalized.push({
    code: ACCOUNTS.ROUNDING_DIFFERENCE,
    debit: diff < 0 ? Math.abs(diff) : 0,
    credit: diff > 0 ? diff : 0,
    memo: "Rounding difference",
  })

  return {
    lines: normalized,
    totalDebit: sumMoney(normalized.map((l) => l.debit)),
    totalCredit: sumMoney(normalized.map((l) => l.credit)),
  }
}

/**
 * Extract the sequence number from a stored entry number.
 *
 * Accepts only the two well-formed legacy shapes ("JE-00001" and "JE00001").
 * Anything else -- including the "JE-00NaN" rows produced by the old parseInt
 * bug -- returns null so it can never contribute to the sequence. A loose
 * digit scan is deliberately avoided: "JE-2NaN5" would yield 2 and hand out a
 * number that is already taken.
 */
export function parseEntrySequence(value: unknown): number | null {
  const match = String(value ?? "").match(/^JE-?(\d{1,9})$/)
  if (!match) return null
  const n = Number.parseInt(match[1], 10)
  return Number.isSafeInteger(n) ? n : null
}

/**
 * Allocate the next entry number.
 */
async function nextEntryNumber(supabase: SupabaseServerClient): Promise<string> {
  const { data, error } = await supabase
    .from("journal_entries")
    .select("entry_number")
    .order("created_at", { ascending: false })
    .limit(1000)

  if (error) {
    throw new PostingError(`Failed to read entry numbers: ${error.message}`)
  }

  let max = 0
  for (const row of data ?? []) {
    const n = parseEntrySequence(row.entry_number)
    if (n !== null && n > max) max = n
  }

  return `JE-${String(max + 1).padStart(5, "0")}`
}

/**
 * Post a balanced journal entry with its lines.
 *
 * Guarantees:
 *  - every account code resolves, or nothing is written
 *  - debits equal credits, or nothing is written
 *  - a header is never left behind without lines (rollback on line failure)
 *  - entry numbers are collision-retried
 */
export async function postJournalEntry(
  supabase: SupabaseServerClient,
  input: PostJournalEntryInput,
): Promise<{ id: string; entryNumber: string; totalDebit: number; totalCredit: number }> {
  const { lines, totalDebit, totalCredit } = balanceLines(input.lines, input.strict)

  if (lines.length === 0) {
    throw new PostingError("Refusing to post an entry with no lines.")
  }

  const accountIds = await loadAccountIds(
    supabase,
    lines.map((l) => l.code),
  )

  const MAX_ATTEMPTS = 5
  let lastError: string | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const entryNumber = await nextEntryNumber(supabase)

    const { data: entry, error: entryError } = await supabase
      .from("journal_entries")
      .insert({
        entry_number: entryNumber,
        entry_date: input.entryDate,
        description: input.description,
        status: "POSTED",
        posted_at: new Date().toISOString(),
        created_by: input.createdBy ?? null,
      })
      .select("id, entry_number")
      .single()

    if (entryError) {
      // 23505 = unique_violation: another request took this number. Retry.
      if (entryError.code === "23505") {
        lastError = entryError.message
        continue
      }
      throw new PostingError(`Failed to create journal entry: ${entryError.message}`)
    }

    const { error: linesError } = await supabase.from("journal_line_items").insert(
      lines.map((line) => ({
        journal_entry_id: entry.id,
        account_id: accountIds[line.code],
        debit: line.debit ?? 0,
        credit: line.credit ?? 0,
        memo: line.memo,
      })),
    )

    if (linesError) {
      // Never leave a POSTED header with no lines.
      await supabase.from("journal_entries").delete().eq("id", entry.id)
      throw new PostingError(`Failed to create journal lines: ${linesError.message}`)
    }

    return {
      id: entry.id as string,
      entryNumber: entry.entry_number as string,
      totalDebit,
      totalCredit,
    }
  }

  throw new PostingError(
    `Could not allocate a unique entry number after ${MAX_ATTEMPTS} attempts. ${lastError ?? ""}`,
  )
}

/**
 * Reverse a posted entry by writing a mirror-image entry.
 *
 * Posted entries are immutable. Corrections are made by reversal, never by
 * mutating or deleting history -- required for GAAP/ASPE audit trail and
 * CRA's six-year retention rule.
 */
export async function reverseJournalEntry(
  supabase: SupabaseServerClient,
  journalEntryId: string,
  options: { reason: string; reversalDate?: string; createdBy?: string | null },
): Promise<{ id: string; entryNumber: string } | null> {
  const { data: original, error } = await supabase
    .from("journal_entries")
    .select("id, entry_number, entry_date, description, status")
    .eq("id", journalEntryId)
    .single()

  if (error || !original) return null

  // Already reversed or void: nothing to do.
  if (original.status === "REVERSED" || original.status === "VOID") return null

  const { data: originalLines, error: linesError } = await supabase
    .from("journal_line_items")
    .select("debit, credit, memo, account:gl_accounts(code)")
    .eq("journal_entry_id", journalEntryId)

  if (linesError) {
    throw new PostingError(`Failed to read lines to reverse: ${linesError.message}`)
  }

  if (!originalLines || originalLines.length === 0) {
    // Orphaned header from the old non-atomic path -- mark it void.
    await supabase
      .from("journal_entries")
      .update({ status: "VOID", description: `${original.description} [VOID: no lines]` })
      .eq("id", journalEntryId)
    return null
  }

  const reversalLines: PostingLine[] = originalLines.map((line) => {
    const account = line.account as { code?: string } | null
    if (!account?.code) {
      throw new PostingError("Cannot reverse a line whose account cannot be resolved.")
    }
    return {
      code: account.code as AccountCode,
      // Swap sides.
      debit: toAmount(line.credit),
      credit: toAmount(line.debit),
      memo: `Reversal: ${line.memo ?? ""}`.trim(),
    }
  })

  const reversal = await postJournalEntry(supabase, {
    // Reverse in the current period, not the original one, so closed periods
    // are never rewritten.
    entryDate: options.reversalDate ?? new Date().toISOString().split("T")[0],
    description: `Reversal of ${original.entry_number} - ${options.reason}`,
    lines: reversalLines,
    createdBy: options.createdBy,
  })

  await supabase
    .from("journal_entries")
    .update({
      status: "REVERSED",
      reversed_by_entry_id: reversal.id,
      reversed_at: new Date().toISOString(),
    })
    .eq("id", journalEntryId)

  return { id: reversal.id, entryNumber: reversal.entryNumber }
}

/** Resolve the acting user's public.users id for created_by attribution. */
export async function resolveActingUserId(
  supabase: SupabaseServerClient,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("auth_id", user.id)
    .single()

  return (data?.id as string) ?? null
}
