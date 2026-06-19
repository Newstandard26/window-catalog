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

export interface CatalogProduct {
  id: string
  brand: string
  series: string
  material: 'Vinyl' | 'Fiberglass' | 'Wood-Clad'
  tier: 'Good' | 'Better' | 'Best'
  /** Baseline installed price per standard window unit. */
  basePrice: number
  /** Energy performance. */
  uFactor: number
  shgc: number
  warranty: string
  highlight: string
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
