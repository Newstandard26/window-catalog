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
    "sections": [{ "operation": string, "widthIn": number|null, "heightIn": number|null, "handing": "L"|"R"|null }]|null,
    "mullType": "vertical"|"horizontal"|null,
    "source": string|null, "confidence": number
  }]
}

GENERAL RULES
- One entry per distinct product line item.
- COMPLETENESS IS CRITICAL. Return EVERY line item in the document, in order — do NOT merge, summarize, sample, or skip lines just because many look similar or repeated. An 18-page quote with 30 numbered Line #s must yield 30 line entries (plus any accessories). Never stop early or truncate the list.
- "Sash Only" / "Replacement: Sash Only" items ARE windows — a sash replacement for that opening. Include every one as a "window" entry. Do NOT drop them.
- unitCost = the PER-UNIT cost (what the buyer pays for ONE unit). NEVER the extended/line total (price × qty), and NEVER an order-level Subtotal, Tax, or grand Total.
- unitCost numeric only — strip "$" and commas.
- widthIn/heightIn in inches; convert fractions ("36 1/2" -> 36.5, "29 - 3/4\\"" -> 29.75). Use the WHOLE-unit size, not a single sub-lite's size.
- style = the SPECIFIC assembled descriptor from the headline, NOT just the base operation. KEEP the configuration modifiers: "2-Wide Casement", "3-Wide Casement", "Casement + Half-Circle", "Mulled Three Across", "Direct Set Octagon", "Double Sliding Patio Door", "Awning", "Picture", "Single Hung", etc. Only use a bare base operation ("Casement", "Single Hung") for a plain single-section unit. Two units that differ only in configuration (a 2-Wide Casement vs a single Casement of the same overall size) MUST get different style strings.
- handing: "L" for any Left / Left-Hinge / Hinged Left / Left Casement; "R" for Right. null if none.
- grille: when a grid pattern like "Traditional (2W5H)" / "2 Wide 5 High" is given, output the lite grid as "<cols>W<rows>H" (e.g. "2W5H"). For "No Grille"/"None"/clear glass output null.
- sections + mullType: for any mulled / multi-section / combo unit, list each section IN ORDER as { operation, widthIn, heightIn, handing } using each SUB-UNIT's own frame size + operation + handing (e.g. [{"operation":"Casement","widthIn":29,"heightIn":46.5,"handing":"L"},{"operation":"Casement","widthIn":29,"heightIn":46.5,"handing":"R"}]). Set mullType "vertical" when the sections sit side-by-side (a vertical mullion between columns) or "horizontal" when stacked (a horizontal mullion / transom on top). For a single-section unit, sections null and mullType null. The line's own widthIn/heightIn and unitCost ALWAYS stay the OVERALL assembled unit (e.g. 58 × 46.5 @ the whole-unit price), never a single section's.
- category "accessory" for non-window/door items: installation tape, spray foam, caulk/sealant, casing/trim/moulding, screws, shims, parts, head expanders sold as a separate line. Include them but mark accessory. Windows = "window", doors (patio/French/hinged/storm) = "door".
- IGNORE non-product pages: warranty, terms & conditions, project-review checklists, signature pages, and any "Order Totals" / "Taxable Subtotal" / "Sales Tax" / "Total" / "Amount Due" summary block.
- confidence 0..1 for the row (low when a value was guessed).

PELLA — "Proposal - Detailed"
- EVERY numbered Line # (10, 15, 20, 25, … through the last) is its own entry — a large quote has dozens; return them ALL, including every "Sash Only" casement. Each item block has a Line # and three columns: "Item Price | Qty | Ext'd Price". unitCost = Item Price (already per-unit). qty = Qty.
- The bold heading names the assembled unit; use it VERBATIM (minus boilerplate) as style: "Lifestyle, Casement Left, 29 X 59" -> "Casement" (handing L); "Awning, Vent" -> "Awning"; "Double Sliding Door … Fixed / Vent Left" -> "Double Sliding Patio Door" (category door); "Fixed Frame Octagon" -> "Direct Set Octagon"; "2-Wide Casement, 58 X 46.5" -> "2-Wide Casement"; "Casement, Lifestyle, Direct Set Fixed Frame Half Circle, 35 X 53" -> "Casement + Half-Circle".
- Size: use the nominal whole-unit size from the heading / unit "Frame Size" (e.g. "29 X 59" -> 29×59). For a mulled/combo unit use the OVERALL size in the heading (e.g. "58 X 46.5"), NOT each sub-unit's Frame Size. (Rough Opening is ~3/4" larger — prefer the unit/frame size.) sizeBasis "Frame".
- A single Line # may contain numbered sub-units, each with its own "Frame Size" + operation + handing ("1: 2959 Left Casement, Frame Size 29 X 46 1/2", "2: 3517.5 Fixed Frame Direct Set Half Circle, Frame Size 35 X 17 1/2"), plus a "Vertical Mull" or "Horizontal Mull" line. Put EACH sub-unit in sections with its own widthIn/heightIn/operation/handing, and set mullType from "Vertical Mull" -> vertical (side-by-side) or "Horizontal Mull" -> horizontal (stacked/transom). Example — "2-Wide Casement, 58 X 46.5" with two 29 X 46 1/2 casements + Vertical Mull: style "2-Wide Casement", widthIn 58, heightIn 46.5, sections [{"operation":"Casement","widthIn":29,"heightIn":46.5,"handing":"L"},{"operation":"Casement","widthIn":29,"heightIn":46.5,"handing":"R"}], mullType "vertical". Example — casement 35 X 35.5 with a Half-Circle 35 X 17.5 above + Horizontal Mull: style "Casement + Half-Circle", widthIn 35, heightIn 53, sections [{"operation":"Casement","widthIn":35,"heightIn":35.5,"handing":"L"},{"operation":"Half-Circle","widthIn":35,"heightIn":17.5,"handing":null}], mullType "horizontal".
- Grille line "Grille: GBG, …, Traditional (2W5H), …" -> "2W5H"; "Grille: No Grille" -> null.
- location = the Location text ("FRONT", "RIGHT BATH (T)", "MASTER CLOSET"). Accessories: TAPE, FOAM, CAULK, CASING, "Installation Tape", "Great Stuff … Foam", "Installation Sealant", "Wood Products … Colonial" -> category accessory (unitCost = Item Price). vendor "Pella"; quoteNumber from "Quote Number:".

PROVIA — "Your Professional-Class Product" spec sheets
- Each product is a spec sheet identified by "Order #<order>-<n>" and "Qty: N". One line per distinct order-line suffix (-1, -2, …). A single unit can span two pages ("Page 1 of 2" / "Page 2 of 2", same Order #) — treat as ONE line.
- Pricing: "Sell Price: $X ($Y per one)" -> unitCost = the "($Y per one)" value. If only "Sell Price: $X" appears (no "per one"), unitCost = $X. CRITICAL: on the last spec sheet a "Tax - 8.75%: $…" and "Total: $…" may appear directly under Sell Price — those are the ORDER tax and grand total; do NOT use them as the line price.
- Size: use "Unit Size" / "Exact Size" / "Window Size" (the actual unit). For bow/bay use the "Overall Unit … Unit Size". Do NOT use "Opening Size"/"Opening Width Range".
- Style from the model code + label, keeping the configuration: "601SH / Single Hung" -> "Single Hung"; "609 / Picture Window" -> "Picture"; "626 / 2-Lite Casement" -> "2-Wide Casement"; "629 / 3-Lite Casement" -> "3-Wide Casement"; "3-Lite Bow Window" -> "3-Lite Bow"; "GW / Garden Window" -> "Garden"; "Legacy French Entry Door" -> "French Door" (category door); "Spectrum … Storm Door" / "Full View" -> "Storm Door" (category door). A single mulled SH/SH unit ("Two Across", 2 sections) -> "2-Wide Single Hung".
- Mulled units list "Window A1 …/A2 …" or "Window 625/628/624 …" sub-sections ("Factory Mulled", "Two Across", "N-Lite") -> one section each, in order, as { operation, widthIn, heightIn, handing } from each sub-window's Unit Size; these sit side-by-side so mullType "vertical". handing from "Hinged Left/Right (OLI)", "Left Hand Inswing", "Primary Active: Right". brand "ProVia", series from "Endure EN600 Series" (or stated line). vendor "ProVia"; quoteNumber = the order number (e.g. "15384773").

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

/**
 * Salvage line objects from a possibly-truncated response. Walks the `lines`
 * array brace-by-brace and JSON-parses each COMPLETE `{...}` object, so a
 * response cut off mid-array still yields every complete line instead of 0.
 */
function salvageLines(text: string): { vendor: string | null; quoteNumber: string | null; lines: unknown[] } {
  const vendor = text.match(/"vendor"\s*:\s*"([^"]*)"/)?.[1] ?? null
  const quoteNumber = text.match(/"quoteNumber"\s*:\s*"([^"]*)"/)?.[1] ?? null
  const li = text.indexOf('"lines"')
  const arrStart = text.indexOf('[', li >= 0 ? li : 0)
  const lines: unknown[] = []
  if (arrStart >= 0) {
    let depth = 0
    let inStr = false
    let esc = false
    let objStart = -1
    for (let i = arrStart + 1; i < text.length; i++) {
      const ch = text[i]
      if (inStr) {
        if (esc) esc = false
        else if (ch === '\\') esc = true
        else if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') inStr = true
      else if (ch === '{') {
        if (depth === 0) objStart = i
        depth++
      } else if (ch === '}') {
        depth--
        if (depth === 0 && objStart >= 0) {
          try {
            lines.push(JSON.parse(text.slice(objStart, i + 1)))
          } catch {
            /* skip a malformed / incomplete object */
          }
          objStart = -1
        }
      } else if (ch === ']' && depth === 0) {
        break
      }
    }
  }
  return { vendor, quoteNumber, lines }
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
        max_tokens: 32000,
        messages: [{ role: 'user', content: [docBlock, { type: 'text', text: PROMPT }] }],
      }),
    })
    if (!res.ok) {
      const text = await res.text()
      return json({ error: `Extraction model error (${res.status}): ${text}` }, 502)
    }
    const data = await res.json()
    const stopReason: string | null = data.stop_reason ?? null
    const text: string = (data.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')

    // Prefer a clean whole-object parse; fall back to salvaging complete line
    // objects when the model truncated the array (large multi-page quotes).
    let vendor: string | null = null
    let quoteNumber: string | null = null
    let lines: unknown[] = []
    let parsedCleanly = false
    try {
      const parsed = extractJson(text) as { vendor?: string; quoteNumber?: string; lines?: unknown[] }
      if (Array.isArray(parsed.lines)) {
        vendor = parsed.vendor ?? null
        quoteNumber = parsed.quoteNumber ?? null
        lines = parsed.lines
        parsedCleanly = true
      }
    } catch {
      /* fall through to salvage */
    }
    if (!parsedCleanly) {
      const salvaged = salvageLines(text)
      vendor = salvaged.vendor
      quoteNumber = salvaged.quoteNumber
      lines = salvaged.lines
    }

    const truncated = stopReason === 'max_tokens'
    console.log(`parse-quote: ${lines.length} lines, stop=${stopReason}, clean=${parsedCleanly}, file=${filename ?? ''}`)
    if (!lines.length) {
      return json({ error: `Could not parse any line items from the response (stop=${stopReason}).` }, 502)
    }
    return json({ vendor, quoteNumber, filename, lines, truncated })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
