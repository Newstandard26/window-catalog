import type { Estimate } from '../types'

/**
 * E-signature provider seam.
 *
 * Default flow is the built-in signature pad (free, works in-app). DocuSign is
 * left as a clean integration point: when the backend + credentials are wired,
 * `isDocusignConfigured()` flips true and `sendViaDocusign()` is implemented to
 * call a server endpoint that creates the envelope.
 *
 * SECURITY: no API keys live in the front-end. DocuSign requires a backend
 * (Supabase Edge Function / Vercel Function) holding the Integration Key + JWT
 * RSA key as secrets. The values below are only feature flags / public config.
 */

export type SignProvider = 'builtin' | 'docusign'

export function isDocusignConfigured(): boolean {
  // Becomes true once a signing backend URL is configured via env.
  return Boolean(import.meta.env.VITE_SIGN_API_URL)
}

export function activeProvider(): SignProvider {
  return isDocusignConfigured() ? 'docusign' : 'builtin'
}

/**
 * Send an estimate for signature via DocuSign. Requires the backend endpoint
 * (VITE_SIGN_API_URL) that owns the DocuSign credentials. Throws until wired.
 */
export async function sendViaDocusign(_estimate: Estimate): Promise<{ envelopeId: string }> {
  const base = import.meta.env.VITE_SIGN_API_URL
  if (!base) {
    throw new Error(
      'DocuSign is not configured. Set VITE_SIGN_API_URL and deploy the signing backend.',
    )
  }
  // TODO(backend): POST the proposal to the signing function, which creates the
  // DocuSign envelope server-side and returns the envelope id.
  const res = await fetch(`${base}/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ estimateId: _estimate.id }),
  })
  if (!res.ok) throw new Error(`Signing backend error: ${res.status}`)
  return res.json()
}

/**
 * Notify NSR that a proposal was signed. Stub: there is no front-end mail
 * integration. Wire this to the signing backend (which can email via the
 * connected mail provider) when the backend lands.
 */
export function notifyNsrSigned(estimate: Estimate, signerName: string): void {
  // eslint-disable-next-line no-console
  console.info(`[notifyNsrSigned] ${signerName} signed "${estimate.name}" (${estimate.id})`)
}
