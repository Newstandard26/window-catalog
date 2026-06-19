import type { CatalogProduct } from '../types'

/**
 * The NSR window catalog — real product lines.
 *
 * ⚠️ PRICING & ENERGY NUMBERS ARE PENDING. Per the data-restore task, exact unit
 * prices and energy specs must come from the supplier source documents (ABC
 * Supply / Andersen / ProVia / Pella quotes) — they are intentionally left as
 * `null` (rendered as "Pending") rather than approximated. Fill these in from
 * the source spreadsheet and set `pending: false` once verified.
 *
 * Configuration / type / grilles reflect the standard NSR spec for each line and
 * can be adjusted per the source docs.
 */
export const CATALOG: CatalogProduct[] = [
  {
    id: 'harvey-windgate',
    brand: 'Harvey Building Products',
    series: 'Windgate',
    material: 'Vinyl',
    tier: 'Good',
    type: 'New Construction',
    configuration: 'Nail Fin · IN Setback · Sill Extender',
    grilles: 'Colonial 1H+2V',
    unitPrice: null, // TODO: ABC Supply pricing
    source: 'Pricing pending — ABC Supply (order # TBD)',
    energy: {
      uFactor: null,
      shgc: null,
      visibleLight: null,
      clearOpening: null,
      energyStar: true,
    },
    highlight: 'Double-hung vinyl, value tier sourced via ABC Supply',
    pending: true,
  },
  {
    id: 'harvey-belmont',
    brand: 'Harvey Building Products',
    series: 'Belmont',
    material: 'Vinyl',
    tier: 'Better',
    type: 'Replacement',
    configuration: 'Exact Size · IN Setback',
    grilles: 'Colonial 1H+2V',
    unitPrice: null, // TODO: ABC Supply pricing
    source: 'Pricing pending — ABC Supply (order # TBD)',
    energy: {
      uFactor: null,
      shgc: null,
      visibleLight: null,
      clearOpening: null,
      energyStar: true,
    },
    highlight: 'Double-hung vinyl replacement, upgraded glass package',
    pending: true,
  },
  {
    id: 'andersen-100',
    brand: 'Andersen',
    series: '100 Series',
    material: 'Fibrex',
    tier: 'Best',
    type: 'Replacement',
    configuration: 'Exact Size · IN Setback',
    grilles: 'Colonial 1H+2V',
    unitPrice: null, // TODO: Andersen quote
    source: 'Pricing pending — Andersen (quote # TBD)',
    energy: {
      uFactor: null,
      shgc: null,
      visibleLight: null,
      clearOpening: null,
      energyStar: true,
    },
    highlight: 'Fibrex composite frame — strong, low-maintenance',
    pending: true,
  },
  {
    id: 'provia-en600',
    brand: 'ProVia',
    series: 'Endure EN600',
    material: 'Vinyl',
    tier: 'Best',
    type: 'Replacement',
    configuration: 'Exact Size · IN Setback · Sill Extender',
    grilles: 'Colonial 1H+2V',
    unitPrice: null, // TODO: ProVia order
    source: 'Pricing pending — ProVia (order # TBD)',
    energy: {
      uFactor: null,
      shgc: null,
      visibleLight: null,
      clearOpening: null,
      energyStar: true,
    },
    highlight: 'Premium double-hung vinyl, foam-insulated frame & sash',
    pending: true,
  },
  {
    id: 'pella-lifestyle',
    brand: 'Pella',
    series: 'Lifestyle Series',
    material: 'Wood-Clad',
    tier: 'Best',
    type: 'New Construction',
    configuration: 'Nail Fin · IN Setback',
    grilles: 'Colonial 1H+2V',
    unitPrice: null, // TODO: Pella quote
    source: 'Pricing pending — Pella (quote # TBD)',
    energy: {
      uFactor: null,
      shgc: null,
      visibleLight: null,
      clearOpening: null,
      energyStar: true,
    },
    highlight: 'Wood-clad, customizable performance glass packages',
    pending: true,
  },
  {
    id: 'pella-casement',
    brand: 'Pella',
    series: 'Lifestyle Casement',
    material: 'Wood-Clad',
    tier: 'Best',
    type: 'New Construction',
    configuration: 'Nail Fin · IN Setback',
    grilles: 'None',
    unitPrice: null, // TODO: Pella quote
    source: 'Pricing pending — Pella (quote # TBD)',
    energy: {
      uFactor: null,
      shgc: null,
      visibleLight: null,
      clearOpening: null,
      energyStar: true,
    },
    highlight: 'Casement configuration, tight seal for high efficiency',
    pending: true,
  },
]

export function getProduct(id: string): CatalogProduct | undefined {
  return CATALOG.find((p) => p.id === id)
}

/** Unique materials present in the catalog, for filter chips. */
export const CATALOG_MATERIALS = Array.from(new Set(CATALOG.map((p) => p.material)))
