import type { WindowConstruction, WindowItem, WindowSection, WindowStyle } from '../types'
import { inferWindowStyle } from '../components/WindowDiagram'
import { DEFAULT_LABOR } from './format'

/**
 * Vendor-quote import client. Uploads a PDF/image to the parse-quote backend
 * (which runs Claude extraction) and maps the result onto estimate line items.
 */

const PARSE_API_URL =
  (import.meta.env.VITE_PARSE_API_URL as string | undefined) ??
  'https://qpjswujpidkirshwirfw.supabase.co/functions/v1/parse-quote'
const SUPABASE_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  'sb_publishable_qIVoBbkgL9YO7MYnDjH5cQ_BaRtg7tD'
const APP_SECRET = (import.meta.env.VITE_SIGN_APP_SECRET as string | undefined) ?? ''

export const MAX_QUOTE_BYTES = 20 * 1024 * 1024 // 20 MB
export const ACCEPTED_QUOTE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

export interface ParsedLine {
  brand?: string | null
  series?: string | null
  style?: string | null
  widthIn?: number | null
  heightIn?: number | null
  sizeBasis?: string | null
  type?: 'New Construction' | 'Replacement' | 'Sash' | null
  exteriorColor?: string | null
  interiorColor?: string | null
  glass?: string | null
  grille?: string | null
  handing?: 'L' | 'R' | null
  qty?: number
  unitCost?: number
  category?: 'window' | 'door' | 'accessory'
  location?: string | null
  /** Per-section breakdown for mulled/combo units (each sub-unit, in order). */
  sections?: ParsedSection[] | null
  /** How the sections are joined: vertical mullion (side-by-side) or horizontal (stacked). */
  mullType?: 'vertical' | 'horizontal' | null
  source?: string | null
  confidence?: number
}

export interface ParsedSection {
  /** Sub-unit operation, e.g. "Casement", "Half-Circle", "Picture". */
  operation?: string | null
  /** Legacy alias the model may emit instead of `operation`. */
  style?: string | null
  widthIn?: number | null
  heightIn?: number | null
  handing?: 'L' | 'R' | null
}

export interface ParseResult {
  vendor: string | null
  quoteNumber: string | null
  filename?: string
  lines: ParsedLine[]
  /** True when the model response was cut off (some lines may be missing). */
  truncated?: boolean
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

export async function parseQuote(file: File): Promise<ParseResult> {
  if (file.size > MAX_QUOTE_BYTES) {
    throw new Error(`File is too large (max ${Math.round(MAX_QUOTE_BYTES / 1024 / 1024)} MB).`)
  }
  const fileBase64 = await fileToBase64(file)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (SUPABASE_KEY) {
    headers.apikey = SUPABASE_KEY
    headers.authorization = `Bearer ${SUPABASE_KEY}`
  }
  if (APP_SECRET) headers['x-app-secret'] = APP_SECRET

  const res = await fetch(`${PARSE_API_URL}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fileBase64, mimeType: file.type || 'application/pdf', filename: file.name }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (data?.error === 'extraction_not_configured') {
      throw new Error(
        data.message ||
          'Quote parsing isn’t configured yet — set the ANTHROPIC_API_KEY secret on the parse-quote function.',
      )
    }
    throw new Error(data?.error || `Parse failed: ${res.status}`)
  }
  return data as ParseResult
}

const normStyle = (s?: string | null): WindowStyle => inferWindowStyle(s ?? '')

/**
 * Map a reviewed parsed line onto an estimate window item. In the global-margin
 * model the vendor per-unit cost becomes the line's material price (the single
 * job margin adds the profit). Imported windows default to Replacement hours.
 */
export function parsedLineToItem(line: ParsedLine): Omit<WindowItem, 'id'> {
  const unitCost = Number(line.unitCost) || 0
  const sections: WindowSection[] | undefined =
    line.sections && line.sections.length > 0
      ? line.sections.map((s) => ({
          style: normStyle(s.operation ?? s.style),
          handing: s.handing ?? null,
          width: s.widthIn ?? undefined,
          height: s.heightIn ?? undefined,
          label: s.handing ?? undefined,
        }))
      : undefined
  const name = [line.brand, line.series, line.style].filter(Boolean).join(' ').trim()
  const installType: WindowConstruction =
    line.type === 'New Construction' ? 'New Construction' : line.type === 'Sash' ? 'Sash' : 'Replacement'
  const hrsByType =
    installType === 'New Construction'
      ? DEFAULT_LABOR.newConstructionHrs
      : installType === 'Sash'
        ? DEFAULT_LABOR.sashHrs
        : DEFAULT_LABOR.replacementHrs
  // A blank / "None Assigned" location isn't a real location — leave it empty
  // so the user can fill one in (the product descriptor is the line header).
  const rawLoc = (line.location ?? '').trim()
  const location = /none assigned/i.test(rawLoc) ? '' : rawLoc
  return {
    kind: 'material',
    location,
    width: Number(line.widthIn) || 0,
    height: Number(line.heightIn) || 0,
    productId: '',
    productName: name || undefined,
    quantity: Math.max(1, Number(line.qty) || 1),
    unitCost,
    unitPrice: unitCost,
    priceOverridden: false,
    installType,
    hrsPerWin: hrsByType,
    style: normStyle(line.style),
    sizeBasis: line.sizeBasis ?? null,
    grille: line.grille ?? null,
    handing: line.handing ?? null,
    sections,
    mullType: line.mullType ?? undefined,
  }
}
