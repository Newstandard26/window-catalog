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

export type WindowConstruction = 'New Construction' | 'Replacement'

export type MarginMode = 'margin' | 'markup'

/**
 * A persisted catalog product, grown automatically from imported vendor quotes.
 * One row per distinct window product (L/R hands of the same size + price are
 * collapsed). `unitCost` is the latest vendor cost seen; `timesSeen` and
 * `lastSeenQuote` track how often / where it has appeared.
 */
export interface CatalogItem {
  id: string
  brand: string
  series: string
  style: string
  /** Frame material when known (often blank from a quote). */
  material: string
  widthIn: number | null
  heightIn: number | null
  sizeBasis: string | null
  type: string | null
  exteriorColor: string | null
  interiorColor: string | null
  glass: string | null
  grille: string | null
  /** Section breakdown for mulled/combo units (each sub-unit, in order). */
  sections?: CatalogSection[] | null
  /** How the sections are joined (vertical mullion / horizontal transom). */
  mullType?: MullType | null
  /** Latest vendor per-unit cost. */
  unitCost: number
  /** Always "vendor cost" — these are NSR's costs, not sell prices. */
  priceBasis: string
  /** Human-readable origin, e.g. "Pella · quote #20469629". */
  source: string
  vendor: string | null
  uFactor?: number | null
  shgc?: number | null
  stc?: number | null
  createdAt: string
  /** Quote/order number it was most recently seen on. */
  lastSeenQuote: string | null
  /** How many quote lines have mapped to this item. */
  timesSeen: number
}
export type LineKind = 'material' | 'labor'

/** Window/door operation styles a diagram can render. */
export type WindowStyle =
  | 'single-hung'
  | 'double-hung'
  | 'casement'
  | 'awning'
  | 'picture'
  | 'slider'
  | 'octagon'
  | 'half-circle'
  | 'bow'
  | 'garden'
  | 'patio-door'
  | 'hinged-door'
  | 'storm-door'
  | 'unknown'

/**
 * Per-estimate labor settings (NSR / Base44 defaults). The crew rate is derived
 * (crewSize × hourlyRate); default hours auto-fill HRS/WIN by install type.
 */
export interface LaborSettings {
  /** Carpenters on the crew (default 2). */
  crewSize: number
  /** Hourly rate per carpenter (default 75 → combined $150/hr). */
  hourlyRate: number
  /** Default install hours per New Construction window (default 2.0). */
  newConstructionHrs: number
  /** Default install hours per Replacement window (default 1.5). */
  replacementHrs: number
  /** Optional manual override of the TOTAL install hours. null = use calc. */
  overrideHours: number | null
}

/** An ad-hoc labor line beyond the per-window install calc (always untaxed). */
export interface CustomLaborItem {
  id: string
  description: string
  /** 'flat' = a fixed dollar amount; 'hours' = hours × rate. */
  mode: 'flat' | 'hours'
  /** Dollar amount when mode = 'flat'. */
  amount: number
  /** Hours when mode = 'hours'. */
  hours: number
  /** $/hr when mode = 'hours' (defaults to the crew labor rate). */
  rate: number
}

/** One sub-unit of a mulled/multi-wide window (drawn side-by-side). */
export interface WindowSection {
  style: WindowStyle
  grille?: string | null
  handing?: 'L' | 'R' | null
  /** Relative width weight across a side-by-side mulled unit (defaults to equal). */
  width?: number
  /** Relative height weight across a stacked (horizontal-mull) unit. */
  height?: number
  label?: string
}

/** How a mulled/combo unit's sections are joined. */
export type MullType = 'vertical' | 'horizontal'

/** A catalog item's serialized section (kept as plain strings for storage). */
export interface CatalogSection {
  operation: string
  widthIn: number | null
  heightIn: number | null
  handing: 'L' | 'R' | null
}

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
  /** Display name when the line isn't tied to a catalog product (e.g. imported). */
  productName?: string
  quantity: number
  /** Legacy internal cost. Kept in sync with unitPrice in the global-margin
   * model (cost no longer drives a per-line sell price). */
  unitCost: number
  /** Per-unit material price that feeds the Materials subtotal. The single
   * global job margin (not a per-line markup) provides the profit. */
  unitPrice: number
  /** Legacy per-line override flag (unused in the global-margin model). */
  priceOverridden: boolean
  /** Install type — sets the default install hours for this window line. */
  installType?: WindowConstruction
  /** Install hours for ONE of this window (HRS/WIN). Falls back to the
   * install-type default when unset. */
  hrsPerWin?: number
  /** Diagram spec (optional; drives the exported proposal's window diagram).
   * Populated from catalog selection / quote import; falls back to inference. */
  style?: WindowStyle
  sizeBasis?: string | null
  grille?: string | null
  handing?: 'L' | 'R' | null
  /** Section breakdown for mulled/multi-wide units. */
  sections?: WindowSection[]
  /** How sections are joined (vertical mullion / horizontal transom). */
  mullType?: MullType
}

export interface Estimate {
  id: string
  name: string
  clientId: string
  address: string
  status: EstimateStatus
  items: WindowItem[]
  /** Tax rate (decimal). Applies to materials only — labor is never taxed. */
  taxRate: number
  /** Margin vs markup, and the single global percentage applied to the whole
   * pre-profit subtotal (materials + labor + tax). */
  marginMode: MarginMode
  marginPct: number
  /** Labor settings (crew rate + default hours + optional total override). */
  labor?: LaborSettings
  /** Ad-hoc labor lines added on top of the per-window install calc. */
  customLabor?: CustomLaborItem[]
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
