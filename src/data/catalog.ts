import type { CatalogItem } from '../types'
import type { ParseResult, ParsedLine } from '../lib/quote'

/**
 * The NSR catalog is a persisted, self-growing store (see the store provider):
 * every vendor quote dropped into the Estimator upserts its windows here. This
 * module holds the pure helpers — dedup key, material list, and the mapping from
 * a parsed quote line to a catalog upsert input.
 */

export const CATALOG_PRICE_BASIS = 'vendor cost'

/** What an import contributes per window before the store assigns id/createdAt. */
export type CatalogUpsertInput = Omit<CatalogItem, 'id' | 'createdAt' | 'timesSeen'>

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase()

/**
 * Dedup key: brand + series + style + size + exterior color + size basis.
 * Handing is intentionally excluded so L/R of the same size + price collapse
 * into one catalog item.
 */
export function catalogKey(
  i: Pick<CatalogItem, 'brand' | 'series' | 'style' | 'widthIn' | 'heightIn' | 'exteriorColor' | 'sizeBasis'>,
): string {
  return [
    norm(i.brand),
    norm(i.series),
    norm(i.style),
    i.widthIn ?? '',
    i.heightIn ?? '',
    norm(i.exteriorColor),
    norm(i.sizeBasis),
  ].join('|')
}

/** Distinct, non-empty materials present in the catalog (for filter chips). */
export const catalogMaterials = (items: CatalogItem[]): string[] =>
  Array.from(new Set(items.map((i) => i.material).filter(Boolean)))

/** Display label for a catalog item, e.g. "Pella Lifestyle Casement". */
export const catalogLabel = (i: CatalogItem): string =>
  [i.brand, i.series, i.style].filter(Boolean).join(' ').trim() || 'Catalog item'

/** Map a parsed quote line + its quote meta onto a catalog upsert input. */
export function lineToCatalogInput(line: ParsedLine, meta: ParseResult): CatalogUpsertInput {
  const vendor = meta.vendor ?? line.brand ?? null
  const quote = meta.quoteNumber ?? null
  const source = [vendor, quote ? `quote #${quote}` : line.source ?? null]
    .filter(Boolean)
    .join(' · ') || 'Imported quote'
  return {
    brand: line.brand ?? vendor ?? 'Unknown',
    series: line.series ?? '',
    style: line.style ?? '',
    material: '',
    widthIn: line.widthIn ?? null,
    heightIn: line.heightIn ?? null,
    sizeBasis: line.sizeBasis ?? null,
    type: line.type ?? null,
    exteriorColor: line.exteriorColor ?? null,
    interiorColor: line.interiorColor ?? null,
    glass: line.glass ?? null,
    grille: line.grille ?? null,
    sections:
      line.sections && line.sections.length > 0
        ? line.sections.map((s) => ({
            operation: (s.operation ?? s.style ?? '').trim(),
            widthIn: s.widthIn ?? null,
            heightIn: s.heightIn ?? null,
            handing: s.handing ?? null,
          }))
        : null,
    mullType: line.mullType ?? null,
    unitCost: Number(line.unitCost) || 0,
    priceBasis: CATALOG_PRICE_BASIS,
    source,
    vendor,
    lastSeenQuote: quote,
  }
}
