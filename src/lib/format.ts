import type { Estimate, MarginMode } from '../types'

export const percent = (n: number) => `${Number(n.toFixed(3))}%`

/**
 * Task 1: derive a sell price from cost using the estimate's margin/markup.
 *   markup: price = cost * (1 + pct/100)
 *   margin: price = cost / (1 - pct/100)
 * Margin pct is clamped below 100 to avoid divide-by-zero / negatives.
 */
export function deriveSellPrice(cost: number, mode: MarginMode, pct: number): number {
  const c = Number.isFinite(cost) ? cost : 0
  if (mode === 'markup') return round2(c * (1 + pct / 100))
  const safe = Math.min(Math.max(pct, 0), 99.99)
  return round2(c / (1 - safe / 100))
}

const round2 = (n: number) => Math.round(n * 100) / 100

export const currency = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** Currency, or "Pending" when the price hasn't been sourced yet. */
export const formatPrice = (n: number | null | undefined) =>
  n == null ? 'Pending' : currency(n)

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

/** Internal material cost (qty × unit cost). Never shown to clients. */
export const estimateMaterialCost = (e: Estimate) =>
  e.items.reduce((sum, item) => sum + (item.unitCost ?? 0) * item.quantity, 0)

/** Material sell price (qty × unit price). */
export const estimateMaterialPrice = (e: Estimate) =>
  e.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)

/** Gross profit on materials (sell − cost). */
export const estimateProfit = (e: Estimate) =>
  estimateMaterialPrice(e) - estimateMaterialCost(e)

/** Labor total = crew × hours × hourly rate. */
export const estimateLabor = (e: Estimate) =>
  (e.crewSize ?? 0) * (e.hours ?? 0) * (e.hourlyRate ?? 0)

/** Subtotal = material sell price + labor (the taxable base). */
export const estimateSubtotal = (e: Estimate) =>
  estimateMaterialPrice(e) + estimateLabor(e)

export const estimateTax = (e: Estimate) =>
  estimateSubtotal(e) * (e.taxRate ?? 0)

export const estimateTotal = (e: Estimate) =>
  estimateSubtotal(e) + estimateTax(e)

export const totalWindowCount = (e: Estimate) =>
  e.items.reduce((sum, item) => sum + item.quantity, 0)

/**
 * Phase 5: auto-name estimates as "{Client Name} — {Address} — {Date}" so they
 * are never left as "Untitled Project".
 */
export function autoEstimateName(
  clientName: string,
  address: string,
  date = new Date(),
): string {
  const name = clientName?.trim() || 'New Client'
  const addr = address?.trim() || 'Address TBD'
  const when = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${name} — ${addr} — ${when}`
}
