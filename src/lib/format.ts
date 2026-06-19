import type { Estimate } from '../types'

export const currency = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

/** Subtotal across all window line items (qty × unit price). */
export const estimateSubtotal = (e: Estimate) =>
  e.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)

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
