import type { WindowItem, WindowSection, WindowStyle } from '../types'
import { inferWindowStyle } from '../components/WindowDiagram'
import { deriveSellPrice } from './format'
import type { MarginMode } from '../types'

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
  type?: string | null
  exteriorColor?: string | null
  interiorColor?: string | null
  glass?: string | null
  grille?: string | null
  handing?: 'L' | 'R' | null
  qty?: number
  unitCost?: number
  category?: 'window' | 'door' | 'accessory'
  location?: string | null
  sections?: { style: string; label?: string }[] | null
  source?: string | null
  confidence?: number
}

export interface ParseResult {
  vendor: string | null
  quoteNumber: string | null
  filename?: string
  lines: ParsedLine[]
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

/** Map a reviewed parsed line onto an estimate WindowItem (cost drives margin). */
export function parsedLineToItem(
  line: ParsedLine,
  mode: MarginMode,
  pct: number,
): Omit<WindowItem, 'id'> {
  const unitCost = Number(line.unitCost) || 0
  const sections: WindowSection[] | undefined =
    line.sections && line.sections.length > 0
      ? line.sections.map((s) => ({ style: normStyle(s.style), label: s.label }))
      : undefined
  const name = [line.brand, line.series, line.style].filter(Boolean).join(' ').trim()
  return {
    kind: 'material',
    location: line.location || name || 'Imported window',
    width: Number(line.widthIn) || 0,
    height: Number(line.heightIn) || 0,
    productId: '',
    productName: name || undefined,
    quantity: Math.max(1, Number(line.qty) || 1),
    unitCost,
    unitPrice: deriveSellPrice(unitCost, mode, pct),
    priceOverridden: false,
    style: normStyle(line.style),
    sizeBasis: line.sizeBasis ?? null,
    grille: line.grille ?? null,
    handing: line.handing ?? null,
    sections,
  }
}
