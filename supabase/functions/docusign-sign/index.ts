// DocuSign signing backend for the NSR Window Catalog.
//
// Routes (all under /functions/v1/docusign-sign):
//   POST  /send     -> build proposal PDF, create a DocuSign envelope (email or
//                      embedded), persist a tracking row. Returns { envelopeId,
//                      status, signingUrl? }.
//   GET   /status   -> latest envelope status for ?estimateId=... .
//   POST  /webhook  -> DocuSign Connect callback; updates envelope status.
//
// Auth model: DocuSign credentials live ONLY here (Supabase secrets), never in
// the front-end. The browser calls /send with an optional shared-secret header.
//
// Required secrets:
//   DOCUSIGN_INTEGRATION_KEY   integration (client) key from DocuSign admin
//   DOCUSIGN_PRIVATE_KEY       RSA private key (PKCS#1 or PKCS#8 PEM)
// Optional (sensible defaults baked in from the connected account):
//   DOCUSIGN_USER_ID           impersonated user GUID
//   DOCUSIGN_ACCOUNT_ID        API account id
//   DOCUSIGN_BASE_URI          REST base, e.g. https://na4.docusign.net
//   DOCUSIGN_OAUTH_BASE        account.docusign.com (prod) | account-d.docusign.com (demo)
//   DOCUSIGN_CONNECT_HMAC_KEY  enables webhook signature verification
//   APP_SHARED_SECRET          required X-App-Secret header on /send

import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const envv = (k: string, d = '') => Deno.env.get(k) ?? d

const INTEGRATION_KEY = envv('DOCUSIGN_INTEGRATION_KEY')
const PRIVATE_KEY = envv('DOCUSIGN_PRIVATE_KEY')
const USER_ID = envv('DOCUSIGN_USER_ID', '283c379e-3ab9-40b8-9285-da658d14cd6a')
const ACCOUNT_ID = envv('DOCUSIGN_ACCOUNT_ID', '6f617c2a-b6fb-435d-ad70-79c433b2447f')
const BASE_URI = envv('DOCUSIGN_BASE_URI', 'https://na4.docusign.net')
const OAUTH_BASE = envv('DOCUSIGN_OAUTH_BASE', 'account.docusign.com')
const HMAC_KEY = envv('DOCUSIGN_CONNECT_HMAC_KEY')
const APP_SECRET = envv('APP_SHARED_SECRET')

const db = createClient(envv('SUPABASE_URL'), envv('SUPABASE_SERVICE_ROLE_KEY'))

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-app-secret',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })

/* ------------------------------- payload types ------------------------------ */

interface Line {
  location: string
  product: string
  size: string
  qty: number
  unitPrice: string
  lineTotal: string
}
interface Proposal {
  estimateId: string
  estimateName: string
  clientName: string
  address: string
  date: string
  companyName: string
  companyAddress: string
  companyPhone: string
  lines: Line[]
  materials: string
  labor: string
  subtotal: string
  tax: string
  total: string
  signer: { name: string; email: string }
  mode: 'email' | 'embedded'
  returnUrl?: string
}

/* --------------------------------- base64 ---------------------------------- */

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function bytesToB64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

/* --------------------------- RSA key + JWT grant ---------------------------- */

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '')
  const bin = atob(body)
  const der = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i)
  return der
}
function derLen(n: number): number[] {
  if (n < 0x80) return [n]
  const out: number[] = []
  let x = n
  while (x > 0) {
    out.unshift(x & 0xff)
    x >>= 8
  }
  return [0x80 | out.length, ...out]
}
function der(tag: number, content: number[]): number[] {
  return [tag, ...derLen(content.length), ...content]
}
// Wrap a PKCS#1 RSAPrivateKey in a PKCS#8 PrivateKeyInfo so Web Crypto can import it.
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const version = [0x02, 0x01, 0x00]
  const rsaOid = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]
  const algo = der(0x30, [...rsaOid, 0x05, 0x00])
  const octet = der(0x04, [...pkcs1])
  return new Uint8Array(der(0x30, [...version, ...algo, ...octet]))
}
async function importKey(pem: string): Promise<CryptoKey> {
  let d = pemToDer(pem)
  if (/BEGIN RSA PRIVATE KEY/.test(pem)) d = pkcs1ToPkcs8(d)
  return await crypto.subtle.importKey(
    'pkcs8',
    d.buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

let cachedToken: { token: string; exp: number } | null = null
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token
  if (!INTEGRATION_KEY || !PRIVATE_KEY) {
    throw new Error('DocuSign is not configured: set DOCUSIGN_INTEGRATION_KEY and DOCUSIGN_PRIVATE_KEY')
  }
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({
      iss: INTEGRATION_KEY,
      sub: USER_ID,
      aud: OAUTH_BASE,
      iat: now,
      exp: now + 3600,
      scope: 'signature impersonation',
    }),
  )
  const input = `${header}.${claims}`
  const key = await importKey(PRIVATE_KEY)
  const sig = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input)),
  )
  const assertion = `${input}.${b64url(sig)}`
  const res = await fetch(`https://${OAUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    // consent_required means the impersonated user hasn't granted JWT consent yet.
    throw new Error(`DocuSign auth failed (${res.status}): ${text}`)
  }
  const data = await res.json()
  cachedToken = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 }
  return cachedToken.token
}

/* ------------------------------ proposal PDF ------------------------------- */

async function buildPdf(p: Proposal): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const W = 612, H = 792, M = 54
  const page = doc.addPage([W, H])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.11, 0.15, 0.21)
  const muted = rgb(0.46, 0.51, 0.57)
  const hair = rgb(0.85, 0.87, 0.9)
  const brand = rgb(0.15, 0.39, 0.92)
  const L = M, R = W - M
  let y = H - 56

  const text = (s: string, x: number, yy: number, size: number, f = font, c = ink) =>
    page.drawText(s, { x, y: yy, size, font: f, color: c })
  const right = (s: string, xR: number, yy: number, size: number, f = font, c = ink) =>
    page.drawText(s, { x: xR - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color: c })
  const hr = (yy: number, x0 = L, x1 = R, t = 0.75, c = hair) =>
    page.drawLine({ start: { x: x0, y: yy }, end: { x: x1, y: yy }, thickness: t, color: c })

  // Top accent bar
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: brand })

  // Letterhead
  page.drawRectangle({ x: L, y: y - 20, width: 30, height: 30, color: brand })
  text('NS', L + 7, y - 11, 14, bold, rgb(1, 1, 1))
  text(p.companyName, L + 40, y - 3, 15, bold)
  text(`${p.companyAddress}     ${p.companyPhone}`, L + 40, y - 17, 9, font, muted)
  right('PROPOSAL', R, y - 1, 13, bold, rgb(0.32, 0.36, 0.42))
  right(p.date, R, y - 16, 9, font, muted)
  y -= 42
  hr(y, L, R, 1.5, ink)
  y -= 24

  // Parties
  const col2 = 322
  text('PREPARED FOR', L, y, 8, bold, muted)
  text('PROJECT ADDRESS', col2, y, 8, bold, muted)
  y -= 15
  text(p.clientName || '—', L, y, 11, bold)
  text(trunc(p.address || '—', font, 10, R - col2), col2, y, 10)
  y -= 24
  text('ESTIMATE', L, y, 8, bold, muted)
  y -= 14
  text(trunc(p.estimateName, font, 10, R - L), L, y, 10)
  y -= 28

  // Table header
  const cLoc = L + 4, cProd = 178, cSize = 320, cQty = 418, cUnit = 498, cAmt = R - 4
  page.drawRectangle({ x: L, y: y - 6, width: R - L, height: 20, color: rgb(0.96, 0.97, 0.985) })
  text('LOCATION', cLoc, y, 8, bold, muted)
  text('PRODUCT', cProd, y, 8, bold, muted)
  text('SIZE', cSize, y, 8, bold, muted)
  right('QTY', cQty, y, 8, bold, muted)
  right('UNIT PRICE', cUnit, y, 8, bold, muted)
  right('AMOUNT', cAmt, y, 8, bold, muted)
  y -= 23

  // Rows
  for (const ln of p.lines) {
    text(trunc(ln.location, font, 9, cProd - cLoc - 8), cLoc, y, 9)
    text(trunc(ln.product, font, 9, cSize - cProd - 8), cProd, y, 9, font, rgb(0.3, 0.34, 0.4))
    text(trunc(ln.size, font, 9, cQty - 32 - cSize), cSize, y, 9, font, muted)
    right(String(ln.qty), cQty, y, 9)
    right(ln.unitPrice, cUnit, y, 9)
    right(ln.lineTotal, cAmt, y, 9, bold)
    y -= 10
    hr(y)
    y -= 13
    if (y < 300) break // single-page safeguard
  }
  y -= 12

  // Totals (right column)
  const tLabel = 396
  const totalRow = (label: string, val: string, b = false) => {
    text(label, tLabel, y, b ? 11 : 9.5, b ? bold : font, b ? ink : muted)
    right(val, cAmt, y, b ? 11 : 9.5, b ? bold : font)
    y -= 17
  }
  totalRow('Materials', p.materials)
  if (p.labor !== '$0.00') totalRow('Labor', p.labor)
  totalRow('Subtotal', p.subtotal)
  totalRow('Tax', p.tax)
  hr(y + 9, tLabel, cAmt, 1, ink)
  totalRow('Total', p.total, true)

  // Acceptance / signature — a comfortable gap under the totals (no mid-page void).
  y -= 24
  hr(y, L, R)
  y -= 22
  text('ACCEPTANCE', L, y, 8, bold, muted)
  y -= 36
  hr(y, L, L + 232, 1, rgb(0.55, 0.6, 0.66))
  hr(y, 330, 330 + 168, 1, rgb(0.55, 0.6, 0.66))
  // White anchor text drives DocuSign tab placement (invisible to the reader).
  text('/sig_nsr/', L + 2, y + 6, 8, font, rgb(1, 1, 1))
  text('/date_nsr/', 332, y + 6, 8, font, rgb(1, 1, 1))
  y -= 12
  text('Client signature', L, y, 8, font, muted)
  text('Date', 330, y, 8, font, muted)
  y -= 24
  text(
    `By signing, you accept this proposal from ${p.companyName}. Pricing is valid for 30 days and is`,
    L, y, 8, font, muted,
  )
  text('subject to final field measurement and product availability.', L, y - 11, 8, font, muted)

  // Footer pinned to the bottom margin
  hr(62, L, R)
  text(p.companyName, L, 50, 8, font, muted)
  right(`${p.companyAddress}     ${p.companyPhone}`, R, 50, 8, font, muted)

  return await doc.save()
}
function trunc(
  s: string,
  f: { widthOfTextAtSize: (t: string, n: number) => number },
  size: number,
  maxW: number,
): string {
  if (f.widthOfTextAtSize(s, size) <= maxW) return s
  let out = s
  while (out.length > 1 && f.widthOfTextAtSize(out + '…', size) > maxW) out = out.slice(0, -1)
  return out + '…'
}

/* ------------------------------- DocuSign API ------------------------------ */

async function createEnvelope(p: Proposal, pdfB64: string): Promise<string> {
  const token = await getAccessToken()
  const signer: Record<string, unknown> = {
    email: p.signer.email,
    name: p.signer.name,
    recipientId: '1',
    routingOrder: '1',
    tabs: {
      signHereTabs: [
        { anchorString: '/sig_nsr/', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-6' },
      ],
      dateSignedTabs: [
        { anchorString: '/date_nsr/', anchorUnits: 'pixels', anchorXOffset: '0', anchorYOffset: '-6' },
      ],
    },
  }
  if (p.mode === 'embedded') signer.clientUserId = p.estimateId
  const body = {
    emailSubject: `Please sign your proposal — ${p.companyName}`,
    documents: [{ documentBase64: pdfB64, name: 'Proposal.pdf', fileExtension: 'pdf', documentId: '1' }],
    recipients: { signers: [signer] },
    status: 'sent',
  }
  const res = await fetch(`${BASE_URI}/restapi/v2.1/accounts/${ACCOUNT_ID}/envelopes`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Envelope create failed (${res.status}): ${await res.text()}`)
  return (await res.json()).envelopeId
}

async function recipientView(envelopeId: string, p: Proposal, returnUrl: string): Promise<string> {
  const token = await getAccessToken()
  const res = await fetch(
    `${BASE_URI}/restapi/v2.1/accounts/${ACCOUNT_ID}/envelopes/${envelopeId}/views/recipient`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        returnUrl,
        authenticationMethod: 'none',
        email: p.signer.email,
        userName: p.signer.name,
        clientUserId: p.estimateId,
      }),
    },
  )
  if (!res.ok) throw new Error(`Recipient view failed (${res.status}): ${await res.text()}`)
  return (await res.json()).url
}

/* -------------------------------- webhook ---------------------------------- */

async function verifyHmac(body: string, signature: string, key: string): Promise<boolean> {
  if (!signature) return false
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(body)))
  return bytesToB64(mac) === signature
}

/* --------------------------------- router ---------------------------------- */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = new URL(req.url)
  const route = url.pathname.split('/').filter(Boolean).pop()

  try {
    if (route === 'send' && req.method === 'POST') {
      if (APP_SECRET && req.headers.get('x-app-secret') !== APP_SECRET) {
        return json({ error: 'unauthorized' }, 401)
      }
      const p = (await req.json()) as Proposal
      if (!p?.signer?.email || !p?.signer?.name) {
        return json({ error: 'signer name and email are required' }, 400)
      }
      const pdf = await buildPdf(p)
      const envelopeId = await createEnvelope(p, bytesToB64(pdf))
      let signingUrl: string | undefined
      if (p.mode === 'embedded') {
        signingUrl = await recipientView(envelopeId, p, p.returnUrl || url.origin)
      }
      await db.from('signing_envelopes').upsert(
        {
          envelope_id: envelopeId,
          estimate_id: p.estimateId,
          estimate_name: p.estimateName,
          client_email: p.signer.email,
          client_name: p.signer.name,
          mode: p.mode,
          status: 'sent',
        },
        { onConflict: 'envelope_id' },
      )
      return json({ envelopeId, status: 'sent', signingUrl })
    }

    if (route === 'status' && req.method === 'GET') {
      const estimateId = url.searchParams.get('estimateId')
      if (!estimateId) return json({ error: 'estimateId required' }, 400)
      const { data } = await db
        .from('signing_envelopes')
        .select('envelope_id,status,signer_name,completed_at')
        .eq('estimate_id', estimateId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!data) return json({ status: 'none' })
      // Query DocuSign live so status works without a Connect webhook configured.
      try {
        const token = await getAccessToken()
        const r = await fetch(
          `${BASE_URI}/restapi/v2.1/accounts/${ACCOUNT_ID}/envelopes/${data.envelope_id}`,
          { headers: { authorization: `Bearer ${token}` } },
        )
        if (r.ok) {
          const env = await r.json()
          const live = String(env.status ?? '').toLowerCase()
          const done = live === 'completed'
          if (live && live !== data.status) {
            await db
              .from('signing_envelopes')
              .update({ status: live, completed_at: done ? new Date().toISOString() : data.completed_at })
              .eq('envelope_id', data.envelope_id)
          }
          return json({
            status: live || data.status,
            envelopeId: data.envelope_id,
            signerName: data.signer_name,
            completedAt: done ? data.completed_at ?? new Date().toISOString() : data.completed_at,
          })
        }
      } catch {
        /* fall back to stored status */
      }
      return json({
        status: data.status,
        envelopeId: data.envelope_id,
        signerName: data.signer_name,
        completedAt: data.completed_at,
      })
    }

    if (route === 'webhook' && req.method === 'POST') {
      const raw = await req.text()
      if (HMAC_KEY) {
        const sig = req.headers.get('x-docusign-signature-1') || ''
        if (!(await verifyHmac(raw, sig, HMAC_KEY))) return json({ error: 'bad signature' }, 401)
      }
      const payload = JSON.parse(raw)
      const summary = payload?.data?.envelopeSummary ?? payload
      const envelopeId = payload?.data?.envelopeId ?? summary?.envelopeId
      const rawStatus = String(summary?.status ?? payload?.event ?? '').toLowerCase()
      const completed = rawStatus.includes('complete')
      const signerName = summary?.recipients?.signers?.[0]?.name ?? null
      if (envelopeId) {
        await db
          .from('signing_envelopes')
          .update({
            status: completed ? 'completed' : rawStatus || 'sent',
            signer_name: signerName,
            completed_at: completed ? new Date().toISOString() : null,
          })
          .eq('envelope_id', envelopeId)
      }
      return json({ ok: true })
    }

    if (route === 'documents' && req.method === 'GET') {
      const estimateId = url.searchParams.get('estimateId')
      if (!estimateId) return json({ error: 'estimateId required' }, 400)
      const { data } = await db
        .from('signing_envelopes')
        .select('envelope_id')
        .eq('estimate_id', estimateId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!data) return json({ error: 'no envelope for estimate' }, 404)
      const token = await getAccessToken()
      const envId = data.envelope_id
      const base = `${BASE_URI}/restapi/v2.1/accounts/${ACCOUNT_ID}/envelopes/${envId}`

      // Signer name + signed timestamp from the recipient record.
      let signerName: string | undefined
      let signedAt: string | undefined
      try {
        const rr = await fetch(`${base}/recipients`, { headers: { authorization: `Bearer ${token}` } })
        if (rr.ok) {
          const j = await rr.json()
          const s = j.signers?.[0]
          signerName = s?.name
          signedAt = s?.signedDateTime
        }
      } catch {
        /* best effort */
      }

      const getDoc = async (docId: string): Promise<string | null> => {
        const r = await fetch(`${base}/documents/${docId}`, {
          headers: { authorization: `Bearer ${token}`, accept: 'application/pdf' },
        })
        if (!r.ok) return null
        return bytesToB64(new Uint8Array(await r.arrayBuffer()))
      }
      // Document "1" is the (now signed) proposal; "certificate" is the audit receipt.
      const [signed, cert] = await Promise.all([getDoc('1'), getDoc('certificate')])
      const documents: { name: string; kind: string; mime: string; base64: string }[] = []
      if (signed) documents.push({ name: 'Signed Proposal.pdf', kind: 'signed', mime: 'application/pdf', base64: signed })
      if (cert) documents.push({ name: 'Certificate of Completion.pdf', kind: 'certificate', mime: 'application/pdf', base64: cert })
      return json({ envelopeId: envId, signerName, signedAt, documents })
    }

    return json({ error: 'not found', route }, 404)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
