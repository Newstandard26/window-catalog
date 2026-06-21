// Vendor-quote extraction backend for the NSR Window Catalog.
//
// POST /parse-quote  body: { fileBase64, mimeType, filename }
//   -> feeds the quote (PDF or image) to Claude and returns structured line items.
//
// Requires the ANTHROPIC_API_KEY Supabase secret. Without it, returns a clear
// "extraction_not_configured" so the UI can explain what's missing.

const envv = (k: string, d = '') => Deno.env.get(k) ?? d
const ANTHROPIC_API_KEY = envv('ANTHROPIC_API_KEY')
const APP_SECRET = envv('APP_SHARED_SECRET')
const MODEL = envv('ANTHROPIC_MODEL', 'claude-opus-4-8')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })

const PROMPT = `You are extracting window and door line items from a building-products vendor quote (Pella, ProVia, ABC Supply / Harvey, Andersen, etc.). Return ONLY a single JSON object — no prose, no markdown fences.

Schema:
{
  "vendor": string|null,
  "quoteNumber": string|null,
  "lines": [{
    "brand": string|null, "series": string|null, "style": string|null,
    "widthIn": number|null, "heightIn": number|null,
    "sizeBasis": "RO"|"Unit"|"Frame"|"Exact"|null,
    "type": "New Construction"|"Replacement"|null,
    "exteriorColor": string|null, "interiorColor": string|null,
    "glass": string|null, "grille": string|null, "handing": "L"|"R"|null,
    "qty": number, "unitCost": number,
    "category": "window"|"door"|"accessory", "location": string|null,
    "sections": [{ "style": string, "label": string }]|null,
    "source": string|null, "confidence": number
  }]
}

Rules:
- One entry per distinct product line. unitCost = the PER-UNIT price, never the extended/line total.
  - Pella "Proposal - Detailed": use the per-unit "Item Price".
  - ProVia spec sheets: use the "$X per one" (per-one) sell price.
  - ABC Supply / Harvey: use the per-item subtotal, including any glass upgrade.
- widthIn/heightIn in inches; convert fractions (e.g. "36 1/2" -> 36.5).
- style: Single Hung, Double Hung, Casement, Awning, Picture/Fixed, Slider, Octagon, Half-Circle, Bow, Bay, Garden, Sliding Patio Door, Hinged/French Door, Storm Door.
- For mulled / multi-wide units, fill "sections" with each sub-unit's style in order (e.g. [{"style":"Single Hung","label":"SH"},{"style":"Picture","label":"Picture"},{"style":"Single Hung","label":"SH"}]).
- category "accessory" for non-window/door items (install tape, foam, caulk, casing, sealant, screws, parts, trim). Include them but mark accessory.
- unitCost numeric only (strip "$" and commas). confidence 0..1 for the row.
Return the JSON object only.`

function extractJson(text: string): unknown {
  const a = text.indexOf('{')
  const b = text.lastIndexOf('}')
  if (a === -1 || b === -1 || b < a) throw new Error('No JSON found in model response')
  return JSON.parse(text.slice(a, b + 1))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    if (APP_SECRET && req.headers.get('x-app-secret') !== APP_SECRET) {
      return json({ error: 'unauthorized' }, 401)
    }
    const { fileBase64, mimeType, filename } = (await req.json()) as {
      fileBase64?: string
      mimeType?: string
      filename?: string
    }
    if (!fileBase64 || !mimeType) return json({ error: 'fileBase64 and mimeType are required' }, 400)

    const isPdf = mimeType === 'application/pdf'
    const isImage = /^image\/(png|jpe?g|webp|gif)$/.test(mimeType)
    if (!isPdf && !isImage) {
      return json({ error: `Unsupported file type: ${mimeType}. Upload a PDF, PNG, JPG, or WEBP.` }, 400)
    }

    if (!ANTHROPIC_API_KEY) {
      return json({
        error: 'extraction_not_configured',
        message:
          'Quote parsing is not configured yet. Set the ANTHROPIC_API_KEY secret on the parse-quote function to enable extraction.',
      }, 503)
    }

    const docBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType, data: fileBase64 } }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        messages: [{ role: 'user', content: [docBlock, { type: 'text', text: PROMPT }] }],
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      return json({ error: `Extraction model error (${res.status}): ${text}` }, 502)
    }
    const data = await res.json()
    const text: string = (data.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')

    let parsed: { vendor?: string; quoteNumber?: string; lines?: unknown[] }
    try {
      parsed = extractJson(text) as typeof parsed
    } catch (e) {
      return json({ error: `Could not parse extraction output: ${e instanceof Error ? e.message : e}` }, 502)
    }

    const lines = Array.isArray(parsed.lines) ? parsed.lines : []
    return json({ vendor: parsed.vendor ?? null, quoteNumber: parsed.quoteNumber ?? null, filename, lines })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
