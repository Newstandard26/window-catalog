import { useMemo, useState } from 'react'
import { Container } from '../components/Container'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { CATALOG } from '../data/catalog'
import { currency } from '../lib/format'

const MATERIALS = ['All', 'Vinyl', 'Fiberglass', 'Wood-Clad'] as const

export function Catalog() {
  const [material, setMaterial] = useState<(typeof MATERIALS)[number]>('All')

  const products = useMemo(
    () => (material === 'All' ? CATALOG : CATALOG.filter((p) => p.material === material)),
    [material],
  )

  const cheapest = Math.min(...CATALOG.map((p) => p.basePrice))
  const bestUFactor = Math.min(...CATALOG.map((p) => p.uFactor))

  return (
    <>
      <PageHeader
        title="Window Catalog"
        subtitle="Compare brands, price tiers, and energy performance across the NSR product line."
      />

      <Container className="py-8">
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
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-bold text-slate-900">{p.brand}</div>
                  <div className="text-sm text-slate-500">{p.series}</div>
                </div>
                <StatusBadge status={p.tier} />
              </div>
              <p className="mt-3 flex-1 text-base text-slate-600">{p.highlight}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
                <div>
                  <div className="text-slate-400">Material</div>
                  <div className="font-semibold text-slate-700">{p.material}</div>
                </div>
                <div>
                  <div className="text-slate-400">U-Factor</div>
                  <div className="font-semibold text-slate-700">{p.uFactor.toFixed(2)}</div>
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-2xl font-bold text-brand-700">{currency(p.basePrice)}</span>
                <span className="text-sm text-slate-500">installed / unit</span>
              </div>
            </div>
          ))}
        </div>

        {/* Phase 3: price comparison table spans the full content width */}
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-bold text-slate-900">Price Comparison</h2>
          <div className="nsr-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-base">
                <thead className="bg-slate-50 text-sm uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Brand / Series</th>
                    <th className="px-5 py-3 font-semibold">Material</th>
                    <th className="px-5 py-3 font-semibold">Tier</th>
                    <th className="px-5 py-3 font-semibold">Warranty</th>
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
                      <td className="px-5 py-3.5 text-slate-700">{p.material}</td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={p.tier} />
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{p.warranty}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-slate-900">
                        {currency(p.basePrice)}
                        {p.basePrice === cheapest && (
                          <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                            Best price
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Energy performance table */}
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-bold text-slate-900">Energy Performance</h2>
          <div className="nsr-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-base">
                <thead className="bg-slate-50 text-sm uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Brand / Series</th>
                    <th className="px-5 py-3 text-right font-semibold">U-Factor</th>
                    <th className="px-5 py-3 text-right font-semibold">SHGC</th>
                    <th className="px-5 py-3 font-semibold">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {CATALOG.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{p.brand}</div>
                        <div className="text-sm text-slate-500">{p.series}</div>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-slate-900">
                        {p.uFactor.toFixed(2)}
                        {p.uFactor === bestUFactor && (
                          <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                            Most efficient
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right text-slate-700">{p.shgc.toFixed(2)}</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" /> ENERGY STAR
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Lower U-Factor means better insulation. SHGC measures solar heat gain — lower values
            reduce cooling load in sun-exposed elevations.
          </p>
        </section>
      </Container>
    </>
  )
}
