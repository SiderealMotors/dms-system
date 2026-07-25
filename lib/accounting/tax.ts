/**
 * Tax rates.
 *
 * Centralized so a rate change is a one-line edit rather than a hunt through
 * five route files. This still needs to become an effective-dated table before
 * any real rate change, so that historical entries keep the rate that was in
 * force on their transaction date instead of being retroactively restated.
 */
export const DEFAULT_TAX_RATE = 0.13

/** Ontario HST. Placeholder until an effective-dated rate table exists. */
export function getTaxRate(_transactionDate?: string | null): number {
  return DEFAULT_TAX_RATE
}
