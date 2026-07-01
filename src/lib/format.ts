import type {
  CustomLaborItem,
  Estimate,
  LaborSettings,
  MarginMode,
  WindowConstruction,
  WindowItem,
} from '../types'

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

// Window lines only (labor is never a window item in the global-margin model).
const windowLines = (e: Estimate) => e.items.filter((it) => it.kind !== 'labor')

/* ----------------------------- Labor settings ----------------------------- */

/** NSR / Base44 defaults: 2 carpenters × $75 = $150/hr, 2.0/1.5 default hours. */
export const DEFAULT_LABOR: LaborSettings = {
  crewSize: 2,
  hourlyRate: 75,
  newConstructionHrs: 2,
  replacementHrs: 1.5,
  sashHrs: 1,
  overrideHours: null,
}

/** An estimate's labor settings with defaults filled in. */
export const laborSettings = (e: Estimate): LaborSettings => ({ ...DEFAULT_LABOR, ...(e.labor ?? {}) })

/** Combined crew rate, e.g. 2 carpenters × $75 = $150/hr. */
export const laborRate = (e: Estimate): number => {
  const s = laborSettings(e)
  return s.crewSize * s.hourlyRate
}

/** Default install hours for an install type. */
export const defaultHoursForType = (e: Estimate, type: WindowConstruction): number => {
  const s = laborSettings(e)
  if (type === 'New Construction') return s.newConstructionHrs
  if (type === 'Sash') return s.sashHrs
  return s.replacementHrs
}

/** HRS/WIN for a line — its explicit value, else the install-type default. */
export const lineHours = (
  e: Estimate,
  item: Pick<WindowItem, 'installType' | 'hrsPerWin'>,
): number =>
  item.hrsPerWin != null ? item.hrsPerWin : defaultHoursForType(e, item.installType ?? 'Replacement')

/* -------------------------------- Materials ------------------------------- */

/** Legacy internal material cost (qty × unit cost). */
export const estimateMaterialCost = (e: Estimate) =>
  windowLines(e).reduce((s, it) => s + (it.unitCost ?? 0) * it.quantity, 0)

/** Materials subtotal (qty × unit price across window lines) — the taxable base. */
export const estimateMaterialPrice = (e: Estimate) =>
  windowLines(e).reduce((s, it) => s + (it.unitPrice ?? 0) * it.quantity, 0)

/* ---------------------------------- Labor --------------------------------- */

/** Σ (HRS/WIN × qty) across window lines. */
export const estimateCalcHours = (e: Estimate): number =>
  windowLines(e).reduce((s, it) => s + lineHours(e, it) * it.quantity, 0)

/** Override hours when set (> 0), else the calculated hours. */
export const estimateEffectiveHours = (e: Estimate): number => {
  const o = laborSettings(e).overrideHours
  return o != null && o > 0 ? o : estimateCalcHours(e)
}

/** Window-install labor = effective hours × crew rate. */
export const estimateWindowLabor = (e: Estimate): number =>
  estimateEffectiveHours(e) * laborRate(e)

/** Dollar amount of one custom labor item (flat, or hours × rate). */
export const customLaborAmount = (it: CustomLaborItem): number =>
  it.mode === 'flat' ? it.amount || 0 : (it.hours || 0) * (it.rate || 0)

/** Σ custom labor items. */
export const estimateCustomLabor = (e: Estimate): number =>
  (e.customLabor ?? []).reduce((s, it) => s + customLaborAmount(it), 0)

/** Labor subtotal = window-install labor + custom labor. Always untaxed. */
export const estimateLaborTotal = (e: Estimate): number =>
  estimateWindowLabor(e) + estimateCustomLabor(e)

/* ----------------------------- Build-up totals ---------------------------- */

/**
 * Pre-profit subtotal = materials + labor — the global-margin base.
 * Tax is deliberately NOT in this base: marking up sales tax is illegal.
 */
export const estimatePreProfit = (e: Estimate) =>
  estimateMaterialPrice(e) + estimateLaborTotal(e)

/** Back-compat alias: "subtotal" means the pre-profit (materials + labor). */
export const estimateSubtotal = (e: Estimate) => estimatePreProfit(e)

/**
 * Global margin/markup multiplier applied to the pre-profit subtotal.
 *   margin:  sell = subtotal / (1 − pct)   → factor 1 / (1 − pct)
 *   markup:  sell = subtotal × (1 + pct)   → factor (1 + pct)
 * Margin pct is clamped below 100 to avoid divide-by-zero / negatives.
 */
export const marginFactor = (mode: MarginMode, pct: number): number => {
  if (mode === 'markup') return 1 + (pct || 0) / 100
  const safe = Math.min(Math.max(pct || 0, 0), 99.99)
  return 1 / (1 - safe / 100)
}

/** Marked-up (selling) price of materials — the taxable base. */
export const estimateMaterialSell = (e: Estimate) =>
  estimateMaterialPrice(e) * marginFactor(e.marginMode, e.marginPct)

/**
 * Sales tax = taxRate × the materials SELLING price (what the customer is
 * charged). Labor is never taxed, and tax is never marked up.
 */
export const estimateTax = (e: Estimate) => estimateMaterialSell(e) * (e.taxRate ?? 0)

/** Job total = (materials + labor) × margin factor, plus tax on the sell price. */
export const estimateTotal = (e: Estimate) =>
  estimatePreProfit(e) * marginFactor(e.marginMode, e.marginPct) + estimateTax(e)

/** Profit = margin dollars on materials + labor (tax passes through untouched). */
export const estimateProfit = (e: Estimate) =>
  estimatePreProfit(e) * (marginFactor(e.marginMode, e.marginPct) - 1)

export const totalWindowCount = (e: Estimate) =>
  windowLines(e).reduce((sum, item) => sum + item.quantity, 0)

/* --------------------------- Client proposal view ------------------------- */

export interface ProposalWindowView {
  item: WindowItem
  unitPrice: number
  lineTotal: number
}
export interface ProposalLaborView {
  label: string
  amount: number
}
export interface ClientProposal {
  windows: ProposalWindowView[]
  labor: ProposalLaborView[]
  materials: number
  laborTotal: number
  subtotal: number
  tax: number
  total: number
}

/**
 * Client-facing build-up. The global margin is folded uniformly into the
 * displayed window and labor prices so the breakdown foots to the job Total
 * without ever exposing cost, margin, or profit. Tax is calculated on the
 * displayed (marked-up) materials — the actual selling price — so it is never
 * marked up, and the columns always sum to Total.
 */
export function clientProposal(e: Estimate): ClientProposal {
  const f = marginFactor(e.marginMode, e.marginPct)
  const windows: ProposalWindowView[] = windowLines(e).map((item) => {
    const unitPrice = round2(item.unitPrice * f)
    return { item, unitPrice, lineTotal: round2(unitPrice * item.quantity) }
  })

  const labor: ProposalLaborView[] = []
  const winLabor = estimateWindowLabor(e)
  if (winLabor > 0) labor.push({ label: 'Installation labor', amount: round2(winLabor * f) })
  for (const c of e.customLabor ?? []) {
    const amt = customLaborAmount(c)
    if (amt > 0) labor.push({ label: c.description || 'Labor', amount: round2(amt * f) })
  }

  const materials = round2(windows.reduce((s, w) => s + w.lineTotal, 0))
  const laborTotal = round2(labor.reduce((s, l) => s + l.amount, 0))
  const subtotal = round2(materials + laborTotal)
  const tax = round2(materials * (e.taxRate ?? 0))
  const total = round2(subtotal + tax)
  return { windows, labor, materials, laborTotal, subtotal, tax, total }
}

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
