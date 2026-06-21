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

const PROMPT = `You are extracting window and door line items from a building-products vendor quote (Pella, ProVia, ABC Supply / Harvey, Andersen, etc.). Read the WHOLE document. Return ONLY a single JSON object — no prose, no markdown fences.

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

GENERAL RULES
- One entry per distinct product line item.
- unitCost = the PER-UNIT cost (what the buyer pays for ONE unit). NEVER the extended/line total (price × qty), and NEVER an order-level Subtotal, Tax, or grand Total.
- unitCost numeric only — strip "$" and commas.
- widthIn/heightIn in inches; convert fractions ("36 1/2" -> 36.5, "29 - 3/4\\"" -> 29.75). Use the WHOLE-unit size, not a single sub-lite's size.
- style is free text mapped later — use readable words: "Single Hung", "Double Hung", "Casement", "Awning", "Picture", "Slider", "Octagon", "Half-Circle", "Bow", "Bay", "Garden", "Sliding Patio Door", "French Door", "Hinged Door", "Storm Door".
- handing: "L" for any Left / Left-Hinge / Hinged Left / Left Casement; "R" for Right. null if none.
- grille: when a grid pattern like "Traditional (2W5H)" / "2 Wide 5 High" is given, output the lite grid as "<cols>W<rows>H" (e.g. "2W5H"). For "No Grille"/"None"/clear glass output null.
- sections: for any mulled / multi-lite / multi-wide unit, list each sub-lite IN ORDER with its own style and a short label (e.g. [{"style":"Casement","label":"L"},{"style":"Picture","label":"Fixed"},{"style":"Casement","label":"R"}]). Leave null for a single-lite unit.
- category "accessory" for non-window/door items: installation tape, spray foam, caulk/sealant, casing/trim/moulding, screws, shims, parts, head expanders sold as a separate line. Include them but mark accessory. Windows = "window", doors (patio/French/hinged/storm) = "door".
- IGNORE non-product pages: warranty, terms & conditions, project-review checklists, signature pages, and any "Order Totals" / "Taxable Subtotal" / "Sales Tax" / "Total" / "Amount Due" summary block.
- confidence 0..1 for the row (low when a value was guessed).

PELLA — "Proposal - Detailed"
- Each item block has a Line # (10,15,20,…) and three columns: "Item Price | Qty | Ext'd Price". unitCost = Item Price (already per-unit). qty = Qty.
- The bold heading names the unit, e.g. "Replacement: Sash Only. Lifestyle, Casement Left, 29 X 59, …" -> style Casement, handing L. "Awning, Vent" -> Awning. "Double Sliding Door … Fixed / Vent Left" -> Sliding Patio Door (category door). "Fixed Frame Octagon" -> Octagon. "Direct Set Fixed Frame Half Circle" -> Half-Circle. "2-Wide Casement" -> two Casement sections.
- Size: use the nominal whole-unit size from the heading / unit "Frame Size" (e.g. "29 X 59" -> 29×59). For a mulled unit use the OVERALL size in the heading (e.g. "58 X 46.5"), NOT each sub-unit's Frame Size. (Rough Opening is ~3/4" larger — prefer the unit/frame size.) sizeBasis "Frame".
- A single Line # may contain numbered sub-units ("1: … Left Casement", "2: … Fixed Frame Half Circle") joined by "Vertical Mull" (side-by-side) or "Horizontal Mull" (stacked/transom) -> put each in sections.
- Grille line "Grille: GBG, …, Traditional (2W5H), …" -> "2W5H"; "Grille: No Grille" -> null.
- location = the Location text ("FRONT", "RIGHT BATH (T)", "MASTER CLOSET"). Accessories: TAPE, FOAM, CAULK, CASING, "Installation Tape", "Great Stuff … Foam", "Installation Sealant", "Wood Products … Colonial" -> category accessory (unitCost = Item Price). vendor "Pella"; quoteNumber from "Quote Number:".

PROVIA — "Your Professional-Class Product" spec sheets
- Each product is a spec sheet identified by "Order #<order>-<n>" and "Qty: N". One line per distinct order-line suffix (-1, -2, …). A single unit can span two pages ("Page 1 of 2" / "Page 2 of 2", same Order #) — treat as ONE line.
- Pricing: "Sell Price: $X ($Y per one)" -> unitCost = the "($Y per one)" value. If only "Sell Price: $X" appears (no "per one"), unitCost = $X. CRITICAL: on the last spec sheet a "Tax - 8.75%: $…" and "Total: $…" may appear directly under Sell Price — those are the ORDER tax and grand total; do NOT use them as the line price.
- Size: use "Unit Size" / "Exact Size" / "Window Size" (the actual unit). For bow/bay use the "Overall Unit … Unit Size". Do NOT use "Opening Size"/"Opening Width Range".
- Style from the model code + label: "601SH / Single Hung"; "609 / Picture Window" -> Picture; "626 / 2-Lite Casement" -> two Casement sections; "629 / 3-Lite Casement" -> three Casement sections; "3-Lite Bow Window" -> Bow (sections: Casement, Picture, Casement); "GW / Garden Window" -> Garden; "Legacy French Entry Door" -> French Door (category door); "Spectrum … Storm Door" / "Full View" -> Storm Door (category door).
- Mulled units list "Window A1 …/A2 …" or "Window 625/628/624 …" sub-sections ("Factory Mulled", "Two Across", "N-Lite") -> one section each, in order. handing from "Hinged Left/Right (OLI)", "Left Hand Inswing", "Primary Active: Right". brand "ProVia", series from "Endure EN600 Series" (or stated line). vendor "ProVia"; quoteNumber = the order number (e.g. "15384773").

ABC SUPPLY / HARVEY — "QUOTE" table (ITEM | DESCRIPTION | QTY | SIZE | PRICE | TOTAL)
- Each numbered item has a base row (e.g. "Belmont Single Casement … PRICE 329.09") plus option rows (color, glazing, glass, screen) each with its own upcharge (usually $0.00; glass upgrades cost more). "ITEM SUBTOTAL" = base + all option upcharges for that line.
- unitCost = ITEM SUBTOTAL ÷ QTY (per-unit, including glass/option upcharges). If no ITEM SUBTOTAL, use PRICE plus the per-unit option upcharges.
- Size "TTT: 22 W x 33 H" -> width 22, height 33 (ignore the "TTT:" code). sizeBasis "Exact" when "Exact Size" is listed.
- Style from description: "Single Casement"->Casement, "Single Vent Slider"/"Slider"->Slider, "Single Hung"/"Double Hung"/"Picture"/"Awning" accordingly. brand from the product line ("Belmont"). handing "Left Hinge - Outside Looking In"->L, "Right Hinge"->R. glass from "Glass IG{…}".
- IGNORE the bottom "SUBTOTAL / TAX / TOTAL" row. vendor "ABC Supply" (or "Harvey" if shown); quoteNumber from "ORDER:".

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
        max_tokens: 16000,
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
