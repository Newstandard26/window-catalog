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
  /** NSR's internal cost per unit (vendor cost). `null` = pending. */
  unitCost: number | null
  /** Installed unit price (sell). `null` = real pricing pending from supplier. */
  unitPrice: number | null
  /** Supplier + order/quote reference. */
  source: string
  energy: CatalogEnergy
  highlight: string
  /** True while exact pricing / energy numbers are still TBD. */
  pending: boolean
}

export type MarginMode = 'margin' | 'markup'
export type LineKind = 'material' | 'labor'

/** Captured when a client e-signs a proposal. */
export interface SignatureRecord {
  signerName: string
  signedAt: string
  /** 'builtin' = in-app signature pad; 'docusign' = provider envelope. */
  method: 'builtin' | 'docusign'
  /** Best-effort, when available (needs a backend to capture reliably). */
  ip?: string
  /** Data-URL of the drawn signature (built-in pad only). */
  signatureImage?: string
  accepted: boolean
}

/** A document stored on a project (signed proposal, certificate, etc.). */
export interface SignedFile {
  id: string
  name: string
  kind: 'signed' | 'certificate' | 'other'
  mime: string
  /** Inline data URL so files persist with the estimate (no external storage). */
  dataUrl: string
  addedAt: string
}

export interface WindowItem {
  id: string
  /** Material windows are taxable; labor lines are not. */
  kind: LineKind
  location: string
  width: number
  height: number
  productId: string
  quantity: number
  /** What NSR pays per unit (internal — never shown to the client). */
  unitCost: number
  /** What the client is charged per unit (sell price). */
  unitPrice: number
  /** True when the sell price was set by hand, so a global margin change
   * won't silently overwrite it. */
  priceOverridden: boolean
}

export interface Estimate {
  id: string
  name: string
  clientId: string
  address: string
  status: EstimateStatus
  items: WindowItem[]
  taxRate: number
  /** Margin vs markup, and the single percentage used to derive sell prices. */
  marginMode: MarginMode
  marginPct: number
  /** Unguessable token for the public signing link (set when sent). */
  signatureToken?: string | null
  sentForSignatureAt?: string | null
  /** Present once signed; locks the estimate from further edits. */
  signature?: SignatureRecord | null
  /** Documents attached to the project (signed PDF + certificate after signing). */
  files?: SignedFile[]
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
  /** Archived (e.g. a lost customer): hidden from the default list & counts. */
  archived?: boolean
}
