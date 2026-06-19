import { useMemo, useState } from 'react'
import { Container } from '../components/Container'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { CATALOG, CATALOG_MATERIALS } from '../data/catalog'
import { formatPrice } from '../lib/format'

const MATERIALS = ['All', ...CATALOG_MATERIALS] as const

const fmt = (n: number | null, digits = 2) => (n == null ? 'Pending' : n.toFixed(digits))

export function Catalog() {
  const [material, setMaterial] = useState<string>('All')

  const products = useMemo(
    () => (material === 'All' ? CATALOG : CATALOG.filter((p) => p.material === material)),
    [material],
  )

  const anyPending = CATALOG.some((p) => p.pending)

  return (
    <>
      <PageHeader
        title="Window Catalog"
        subtitle="Compare brands, price tiers, and energy performance across the NSR product line."
      />

      <Container className="py-8">
        {anyPending && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
            <span>
              <strong>Pricing &amp; energy specs pending.</strong> Product lines and configurations
              are in place; unit prices and energy numbers show “Pending” until the exact figures
              from the supplier quotes (ABC Supply / Andersen / ProVia / Pella) are entered.
            </span>
          </div>
        )}

        {/* Filter */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-medium text-slate-500">Material:</span>
          {MATERIALS.map((m) => (
            <button
              key={m}
              onClick={() => setMaterial(m)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                material === m
                  ? 'bg-brand-700 text-white'
                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Brand cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <div
              key={p.id}
              className="nsr-card flex flex-col p-6 transition-shadow hover:shadow-card-hover"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">{p.brand}</div>
                  <div className="text-sm text-slate-500">{p.series}</div>
                </div>
                <StatusBadge status={p.tier} />
              </div>

              <p className="mt-3 flex-1 text-base text-slate-600">{p.highlight}</p>

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
                <div>
                  <dt className="text-slate-400">Material</dt>
                  <dd className="font-semibold text-slate-700">{p.material}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Type</dt>
                  <dd className="font-semibold text-slate-700">{p.type}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-400">Configuration</dt>
                  <dd className="font-semibold text-slate-700">{p.configuration}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Grilles</dt>
                  <dd className="font-semibold text-slate-700">{p.grilles}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">U-Factor</dt>
                  <dd className="font-semibold text-slate-700">{fmt(p.energy.uFactor)}</dd>
                </div>
              </dl>

              <div className="mt-4 text-xs text-slate-400">{p.source}</div>

              <div className="mt-3 flex items-baseline justify-between">
                {p.unitPrice == null ? (
                  <span className="rounded bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-700">
                    Pricing pending
                  </span>
                ) : (
                  <span className="text-2xl font-bold text-brand-700">{formatPrice(p.unitPrice)}</span>
                )}
                <span className="text-sm text-slate-500">installed / unit</span>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Price Comparison */}
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-bold text-slate-900">Quick Price Comparison</h2>
          <div className="nsr-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-base">
                <thead className="bg-slate-50 text-sm uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Brand / Series</th>
                    <th className="px-5 py-3 font-semibold">Type</th>
                    <th className="px-5 py-3 font-semibold">Configuration</th>
                    <th className="px-5 py-3 font-semibold">Grilles</th>
                    <th className="px-5 py-3 font-semibold">Source</th>
                    <th className="px-5 py-3 text-right font-semibold">Installed / Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {CATALOG.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{p.brand}</div>
                        <div className="text-sm text-slate-500">{p.series}</div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-700">{p.type}</td>
                      <td className="px-5 py-3.5 text-sm text-slate-600">{p.configuration}</td>
                      <td className="px-5 py-3.5 text-slate-700">{p.grilles}</td>
                      <td className="px-5 py-3.5 text-sm text-slate-500">{p.source}</td>
                      <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-slate-900">
                        {p.unitPrice == null ? (
                          <span className="text-amber-600">Pending</span>
                        ) : (
                          formatPrice(p.unitPrice)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Energy Performance Summary */}
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-bold text-slate-900">Energy Performance Summary</h2>
          <div className="nsr-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-base">
                <thead className="bg-slate-50 text-sm uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Brand / Series</th>
                    <th className="px-5 py-3 text-right font-semibold">U-Factor</th>
                    <th className="px-5 py-3 text-right font-semibold">SHGC</th>
                    <th className="px-5 py-3 text-right font-semibold">Visible Light</th>
                    <th className="px-5 py-3 font-semibold">Clear Opening</th>
                    <th className="px-5 py-3 font-semibold">Energy Star</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {CATALOG.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{p.brand}</div>
                        <div className="text-sm text-slate-500">{p.series}</div>
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-slate-700">
                        {fmt(p.energy.uFactor)}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-slate-700">
                        {fmt(p.energy.shgc)}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-slate-700">
                        {fmt(p.energy.visibleLight)}
                      </td>
                      <td className="px-5 py-3.5 text-slate-700">{p.energy.clearOpening ?? 'Pending'}</td>
                      <td className="px-5 py-3.5">
                        {p.energy.energyStar == null ? (
                          <span className="text-sm text-slate-400">Pending</span>
                        ) : p.energy.energyStar ? (
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" /> ENERGY STAR
                          </span>
                        ) : (
                          <span className="text-sm text-slate-500">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Lower U-Factor means better insulation. SHGC measures solar heat gain — lower values
            reduce cooling load in sun-exposed elevations. Numbers marked “Pending” are awaiting the
            exact figures from each supplier’s spec sheet.
          </p>
        </section>
      </Container>
    </>
  )
}
