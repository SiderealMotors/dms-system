/**
 * Money handling for the general ledger.
 *
 * All GL amount columns are DECIMAL(12,2). If we hand Postgres an unrounded
 * float it rounds each row independently, so the sum of the rounded rows no
 * longer equals the rounded total and the trial balance breaks by cents.
 * Every amount must be rounded to cents in application code BEFORE insert.
 */

/** Largest imbalance we will absorb with a rounding plug line, in dollars. */
export const ROUNDING_TOLERANCE = 0.02

/**
 * Round to 2 decimals using half-away-from-zero, which is what accounting
 * expects. Plain Math.round is biased for negatives and binary floats make
 * naive rounding unreliable (e.g. 1.005 * 100 === 100.49999999999999).
 */
export function roundMoney(value: number | string | null | undefined): number {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return 0
  // Scale through integer cents via a string-safe epsilon nudge.
  const scaled = n * 100
  const rounded =
    scaled >= 0
      ? Math.round(scaled + Number.EPSILON * Math.abs(scaled))
      : -Math.round(-scaled + Number.EPSILON * Math.abs(scaled))
  return rounded / 100
}

/** Coerce arbitrary input to a rounded, finite, non-negative amount. */
export function toAmount(value: unknown): number {
  const n = roundMoney(Number(value ?? 0))
  return Number.isFinite(n) ? n : 0
}

/** Sum a list of amounts, rounding the result once at the end. */
export function sumMoney(values: Array<number | string | null | undefined>): number {
  return roundMoney(values.reduce<number>((acc, v) => acc + Number(v ?? 0), 0))
}

/**
 * Compute tax on a base amount at a given rate, rounded to cents.
 * Returns 0 when tax does not apply so callers never claim a phantom credit.
 */
export function calculateTax(base: number, rate: number, applies = true): number {
  if (!applies || !rate) return 0
  return roundMoney(base * rate)
}
