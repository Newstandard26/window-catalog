// Shared domain types for the NSR Window Catalog app.

export type EstimateStatus = 'Draft' | 'Sent' | 'Pending' | 'Won' | 'Lost'
export type ClientStatus = 'Active' | 'Prospect'

/** The Projects pipeline stages, in order. */
export const PIPELINE: EstimateStatus[] = [
  'Draft',
  'Sent',
  'Pending',
  'Won',
  'Lost',
]

export type CatalogTier = 'Good' | 'Better' | 'Best'
export type WindowConstruction = 'New Construction' | 'Replacement'

/**
 * Energy performance per product line. Numeric values are nullable so a line can
 * be scaffolded before the exact sourced numbers are entered (`null` = pending).
 */
export interface CatalogEnergy {
  uFactor: number | null
  shgc: number | null
  /** Visible transmittance (visible light). */
  visibleLight: number | null
  /** Clear opening dimensions, e.g. `20.5" × 36"`. */
  clearOpening: string | null
  energyStar: boolean | null
}

export interface CatalogProduct {
  id: string
  brand: string
  series: string
  material: 'Vinyl' | 'Fiberglass' | 'Fibrex' | 'Wood-Clad'
  tier: CatalogTier
  /** New Construction vs Replacement. */
  type: WindowConstruction
  /** e.g. "Nail Fin · IN Setback · Sill Extender". */
  configuration: string
  /** Grille option, e.g. "Colonial 1H+2V" or "None". */
  grilles: string
  /** Installed unit price. `null` = real pricing pending from supplier. */
  unitPrice: number | null
  /** Supplier + order/quote reference. */
  source: string
  energy: CatalogEnergy
  highlight: string
  /** True while exact pricing / energy numbers are still TBD. */
  pending: boolean
}

export interface WindowItem {
  id: string
  location: string
  width: number
  height: number
  productId: string
  quantity: number
  unitPrice: number
}

export interface Estimate {
  id: string
  name: string
  clientId: string
  address: string
  status: EstimateStatus
  items: WindowItem[]
  taxRate: number
  createdAt: string
  updatedAt: string
}

export interface Client {
  id: string
  name: string
  status: ClientStatus
  email: string
  phone: string
  address: string
  createdAt: string
}
