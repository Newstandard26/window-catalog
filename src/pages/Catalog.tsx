import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Container } from '../components/Container'
import { PageHeader } from '../components/PageHeader'
import { useStore } from '../data/store'
import { catalogMaterials } from '../data/catalog'
import { currency } from '../lib/format'
import type { CatalogItem } from '../types'

const sizeLabel = (i: CatalogItem) =>
  i.widthIn && i.heightIn ? `${i.widthIn}" × ${i.heightIn}"` : '—'

const spec = (label: string, value?: string | number | null) =>
  value == null || value === '' ? null : { label, value: String(value) }

export function Catalog() {
  const { catalogItems } = useStore()
  const [material, setMaterial] = useState('All')

  const materials = useMemo(() => ['All', ...catalogMaterials(catalogItems)], [catalogItems])

  const filtered = useMemo(
    () => (material === 'All' ? catalogItems : catalogItems.filter((i) => i.material === material)),
    [catalogItems, material],
  )

  // Group by brand → series so the catalog reads like a product line.
  const grouped = useMemo(() => {
    const byBrand = new Map<string, Map<string, CatalogItem[]>>()
    for (const i of filtered) {
      const brand = i.brand || 'Unknown'
      const series = i.series || '—'
      if (!byBrand.has(brand)) byBrand.set(brand, new Map())
      const seriesMap = byBrand.get(brand)!
      if (!seriesMap.has(series)) seriesMap.set(series, [])
      seriesMap.get(series)!.push(i)
    }
    return [...byBrand.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([brand, seriesMap]) => ({
        brand,
        series: [...seriesMap.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      }))
  }, [filtered])

  return (
    <>
      <PageHeader
        title="Window Catalog"
        subtitle="Every window product NSR has quoted — built automatically from imported vendor quotes."
      />

      <Container className="py-8">
        {catalogItems.length === 0 ? (
          <div className="nsr-card flex min-h-[20rem] flex-col items-center justify-center p-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="1" />
                <path d="M12 3v18M3 12h18" />
              </svg>
            </div>
            <h3 className="mt-5 text-xl font-bold text-slate-900">No catalog items yet</h3>
            <p className="mt-2 max-w-md text-base text-slate-500">
              Import a vendor quote in the{' '}
              <Link to="/estimator" className="font-semibold text-brand-700 hover:text-brand-800">
                Estimator
              </Link>{' '}
              to start building your catalog. Every quote you drop in adds its windows here with the
              vendor cost and source.
            </p>
          </div>
        ) : (
          <>
            {/* Material filter (only when materials are known) */}
            {materials.length > 1 && (
              <div className="mb-6 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-sm font-medium text-slate-500">Material:</span>
                {materials.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMaterial(m)}
                    className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                      material === m
                        ? 'bg-brand-500 text-black'
                        : 'border border-slate-300 bg-transparent text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}

            <p className="mb-6 text-sm text-slate-500">
              {catalogItems.length} catalog {catalogItems.length === 1 ? 'item' : 'items'} · prices
              are vendor cost (what NSR pays).
            </p>

            <div className="space-y-10">
              {grouped.map(({ brand, series }) => (
                <section key={brand}>
                  <h2 className="mb-3 text-xl font-bold text-slate-900">{brand}</h2>
                  <div className="space-y-6">
                    {series.map(([seriesName, items]) => (
                      <div key={seriesName}>
                        <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
                          {seriesName}
                        </div>
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                          {items.map((i) => (
                            <CatalogCard key={i.id} item={i} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </Container>
    </>
  )
}

function CatalogCard({ item }: { item: CatalogItem }) {
  const specs = [
    spec('Style', item.style),
    spec('Size', sizeLabel(item)),
    spec('Size basis', item.sizeBasis),
    spec('Type', item.type),
    spec('Exterior', item.exteriorColor),
    spec('Interior', item.interiorColor),
    spec('Glass', item.glass),
    spec('Grille', item.grille),
    spec('U-Factor', item.uFactor),
    spec('SHGC', item.shgc),
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <div className="nsr-card flex flex-col p-6 transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold text-slate-900">{item.style || 'Window'}</div>
          <div className="text-sm text-slate-500">{sizeLabel(item)}</div>
        </div>
        {item.timesSeen > 1 && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
            seen ×{item.timesSeen}
          </span>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
        {specs.map((s) => (
          <div key={s.label}>
            <dt className="text-slate-400">{s.label}</dt>
            <dd className="font-semibold text-slate-700">{s.value}</dd>
          </div>
        ))}
      </dl>

      {item.sections && item.sections.length > 1 && (
        <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
          <div className="text-slate-400">
            Configuration
            {item.mullType ? ` · ${item.mullType} mull` : ''}
          </div>
          <ul className="mt-1 space-y-0.5">
            {item.sections.map((s, idx) => (
              <li key={idx} className="text-slate-700">
                <span className="font-semibold">{s.operation || 'Section'}</span>
                {s.handing ? ` (${s.handing})` : ''}
                {s.widthIn && s.heightIn ? ` · ${s.widthIn}" × ${s.heightIn}"` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 text-xs text-slate-400">{item.source}</div>

      <div className="mt-3 flex items-baseline justify-between">
        <span className="text-2xl font-bold text-brand-700">{currency(item.unitCost)}</span>
        <span className="text-sm text-slate-500">vendor cost / unit</span>
      </div>
    </div>
  )
}
