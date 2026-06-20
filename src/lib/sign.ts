import type { Client, Estimate } from '../types'
import { getProduct } from '../data/catalog'
import { COMPANY } from '../data/company'
import {
  currency,
  estimateLabor,
  estimateMaterialPrice,
  estimateSubtotal,
  estimateTax,
  estimateTotal,
  shortDate,
} from './format'

/**
 * E-signature provider seam.
 *
 * Default flow is the built-in signature pad (free, works in-app). DocuSign is
 * activated by pointing VITE_SIGN_API_URL at the deployed signing backend
 * (Supabase Edge Function `docusign-sign`). The backend owns the DocuSign
 * Integration Key + RSA key as secrets — no credentials ever reach the browser.
 */

export type SignProvider = 'builtin' | 'docusign'
export type SignMode = 'email' | 'embedded'

/** Public config only (feature flags / project keys), never secrets. */
const SIGN_API_URL = import.meta.env.VITE_SIGN_API_URL as string | undefined
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''
const APP_SECRET = (import.meta.env.VITE_SIGN_APP_SECRET as string | undefined) ?? ''

export function isDocusignConfigured(): boolean {
  return Boolean(SIGN_API_URL)
}

export function activeProvider(): SignProvider {
  return isDocusignConfigured() ? 'docusign' : 'builtin'
}

/* ------------------------------ payload shape ------------------------------ */

interface ProposalLine {
  location: string
  product: string
  size: string
  qty: number
  unitPrice: string
  lineTotal: string
}
export interface ProposalPayload {
  estimateId: string
  estimateName: string
  clientName: string
  address: string
  date: string
  companyName: string
  companyAddress: string
  companyPhone: string
  lines: ProposalLine[]
  materials: string
  labor: string
  subtotal: string
  tax: string
  total: string
  signer: { name: string; email: string }
  mode: SignMode
  returnUrl?: string
}

/** Build the server payload from an estimate (mirrors the on-screen proposal). */
export function buildProposalPayload(
  estimate: Estimate,
  client: Client | undefined,
  signer: { name: string; email: string },
  mode: SignMode,
  returnUrl?: string,
): ProposalPayload {
  return {
    estimateId: estimate.id,
    estimateName: estimate.name,
    clientName: client?.name ?? '',
    address: estimate.address || client?.address || '',
    date: shortDate(estimate.updatedAt),
    companyName: COMPANY.name,
    companyAddress: COMPANY.address,
    companyPhone: COMPANY.phone,
    lines: estimate.items.map((item) => {
      const product = getProduct(item.productId)
      return {
        location: item.location || '—',
        product:
          item.kind === 'labor'
            ? 'Labor'
            : product
              ? `${product.brand} ${product.series}`
              : 'Custom',
        size: item.kind === 'labor' ? '—' : `${item.width}" × ${item.height}"`,
        qty: item.quantity,
        unitPrice: currency(item.unitPrice),
        lineTotal: currency(item.unitPrice * item.quantity),
      }
    }),
    materials: currency(estimateMaterialPrice(estimate)),
    labor: currency(estimateLabor(estimate)),
    subtotal: currency(estimateSubtotal(estimate)),
    tax: currency(estimateTax(estimate)),
    total: currency(estimateTotal(estimate)),
    signer,
    mode,
    returnUrl,
  }
}

/* -------------------------------- transport -------------------------------- */

function headers(): HeadersInit {
  const h: Record<string, string> = { 'content-type': 'application/json' }
  if (SUPABASE_KEY) {
    h.apikey = SUPABASE_KEY
    h.authorization = `Bearer ${SUPABASE_KEY}`
  }
  if (APP_SECRET) h['x-app-secret'] = APP_SECRET
  return h
}

export interface SendResult {
  envelopeId: string
  status: string
  /** Present for embedded mode: DocuSign recipient view URL to open in-app. */
  signingUrl?: string
}

/**
 * Send an estimate for signature via DocuSign. Requires the signing backend
 * (VITE_SIGN_API_URL) that owns the DocuSign credentials.
 */
export async function sendViaDocusign(payload: ProposalPayload): Promise<SendResult> {
  if (!SIGN_API_URL) {
    throw new Error('DocuSign is not configured. Set VITE_SIGN_API_URL and deploy the signing backend.')
  }
  const res = await fetch(`${SIGN_API_URL}/send`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Signing backend error: ${res.status}`)
  return data as SendResult
}

export interface SigningStatus {
  status: 'none' | 'sent' | 'delivered' | 'completed' | 'declined' | 'voided' | string
  envelopeId?: string
  signerName?: string
  completedAt?: string
}

/** Poll the latest envelope status for an estimate (used to lock once signed). */
export async function getSigningStatus(estimateId: string): Promise<SigningStatus> {
  if (!SIGN_API_URL) return { status: 'none' }
  const res = await fetch(`${SIGN_API_URL}/status?estimateId=${encodeURIComponent(estimateId)}`, {
    headers: headers(),
  })
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`)
  return (await res.json()) as SigningStatus
}

/**
 * Notify NSR that a proposal was signed. With DocuSign, the account owner is
 * the envelope sender and receives DocuSign's own completion email, so this is
 * a no-op breadcrumb for the built-in flow / local logging.
 */
export function notifyNsrSigned(estimate: Estimate, signerName: string): void {
  // eslint-disable-next-line no-console
  console.info(`[notifyNsrSigned] ${signerName} signed "${estimate.name}" (${estimate.id})`)
}
