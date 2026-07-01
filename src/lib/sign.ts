import type { Client, Estimate } from '../types'
import { COMPANY } from '../data/company'
import { clientProposal, currency, shortDate } from './format'

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

/**
 * Public config only (feature flags / project keys), never secrets. The signing
 * backend URL and Supabase publishable key are public by design, so they ship as
 * defaults; env vars override them per-environment if needed.
 */
const SIGN_API_URL =
  (import.meta.env.VITE_SIGN_API_URL as string | undefined) ??
  'https://qpjswujpidkirshwirfw.supabase.co/functions/v1/docusign-sign'
const SUPABASE_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  'sb_publishable_qIVoBbkgL9YO7MYnDjH5cQ_BaRtg7tD'
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
  // Client-facing build-up: the global margin is folded into every line so the
  // table foots to the Total without exposing cost or margin.
  const view = clientProposal(estimate)
  const windowLines: ProposalLine[] = view.windows.map(({ item, unitPrice, lineTotal }) => ({
    location: item.location || '—',
    product: item.productName || 'Custom',
    size: `${item.width}" × ${item.height}"`,
    qty: item.quantity,
    unitPrice: currency(unitPrice),
    lineTotal: currency(lineTotal),
  }))
  const laborLines: ProposalLine[] = view.labor.map((l) => ({
    location: l.label,
    product: 'Labor',
    size: '—',
    qty: 1,
    unitPrice: currency(l.amount),
    lineTotal: currency(l.amount),
  }))
  return {
    estimateId: estimate.id,
    estimateName: estimate.name,
    clientName: client?.name ?? '',
    address: estimate.address || client?.address || '',
    date: shortDate(estimate.updatedAt),
    companyName: COMPANY.name,
    companyAddress: COMPANY.address,
    companyPhone: COMPANY.phone,
    lines: [...windowLines, ...laborLines],
    materials: currency(view.materials),
    labor: currency(view.laborTotal),
    subtotal: currency(view.subtotal),
    tax: currency(view.tax),
    total: currency(view.total),
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

export interface SignedDocument {
  name: string
  kind: 'signed' | 'certificate' | 'other'
  mime: string
  base64: string
}
export interface SignedDocumentsResult {
  envelopeId: string
  signerName?: string
  signedAt?: string
  documents: SignedDocument[]
}

/** Fetch the completed PDF + certificate of completion for a signed estimate. */
export async function fetchSignedDocuments(estimateId: string): Promise<SignedDocumentsResult> {
  if (!SIGN_API_URL) throw new Error('Signing backend not configured')
  const res = await fetch(`${SIGN_API_URL}/documents?estimateId=${encodeURIComponent(estimateId)}`, {
    headers: headers(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Document fetch failed: ${res.status}`)
  return data as SignedDocumentsResult
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
