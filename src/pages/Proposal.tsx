import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { getProduct } from '../data/catalog'
import { COMPANY } from '../data/company'
import {
  currency,
  estimateLabor,
  estimateMaterialPrice,
  estimateSubtotal,
  estimateTax,
  estimateTotal,
  shortDate,
} from '../lib/format'

/**
 * Client-ready proposal. Print / "Save as PDF" produces the branded document.
 * IMPORTANT: this page shows sell prices and totals only — never cost or margin.
 */
export function Proposal() {
  const { id = '' } = useParams()
  const { getEstimate, getClient } = useStore()
  const [copied, setCopied] = useState(false)

  const estimate = getEstimate(id)
  if (!estimate) {
    return (
      <div className="mx-auto max-w-content px-6 py-20 text-center">
        <p className="text-lg text-slate-600">Proposal not found.</p>
        <Link to="/projects" className="btn-secondary mt-4 inline-flex">
          Back to Projects
        </Link>
      </div>
    )
  }

  const client = getClient(estimate.clientId)
  const materialPrice = estimateMaterialPrice(estimate)
  const labor = estimateLabor(estimate)
  const subtotal = estimateSubtotal(estimate)
  const tax = estimateTax(estimate)
  const total = estimateTotal(estimate)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      {/* Toolbar — hidden when printing */}
      <div className="no-print mx-auto mb-6 flex max-w-[8.5in] items-center justify-between px-4">
        <Link to={`/estimator/${estimate.id}`} className="btn-secondary btn-sm">
          ← Back to estimate
        </Link>
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm" onClick={copyLink}>
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <button className="btn-primary btn-sm" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
        </div>
      </div>

      {/* Page */}
      <article className="mx-auto max-w-[8.5in] bg-white p-[0.75in] shadow-card print:shadow-none">
        {/* Letterhead */}
        <header className="flex items-start justify-between border-b-2 border-ink-800 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 font-bold text-white">
                NS
              </div>
              <div className="text-xl font-bold text-ink-800">{COMPANY.name}</div>
            </div>
            <div className="mt-2 text-sm text-slate-500">
              {COMPANY.address} · {COMPANY.phone}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold uppercase tracking-wide text-slate-700">
              Preliminary Window Estimate
            </div>
            <div className="mt-1 text-sm text-slate-500">{shortDate(estimate.updatedAt)}</div>
          </div>
        </header>

        {/* Client / project */}
        <section className="mt-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="font-semibold uppercase tracking-wide text-slate-400">Prepared for</div>
            <div className="mt-1 text-base font-semibold text-slate-900">{client?.name ?? '—'}</div>
            {client?.email && <div className="text-slate-600">{client.email}</div>}
            {client?.phone && <div className="text-slate-600">{client.phone}</div>}
          </div>
          <div>
            <div className="font-semibold uppercase tracking-wide text-slate-400">Project address</div>
            <div className="mt-1 text-slate-700">{estimate.address || client?.address || '—'}</div>
            <div className="mt-2 font-semibold uppercase tracking-wide text-slate-400">Estimate</div>
            <div className="text-slate-700">{estimate.name}</div>
          </div>
        </section>

        {/* Schedule */}
        <section className="mt-6">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-2 font-semibold">Location</th>
                <th className="py-2 pr-2 font-semibold">Product</th>
                <th className="py-2 pr-2 font-semibold">Size</th>
                <th className="py-2 pr-2 text-right font-semibold">Qty</th>
                <th className="py-2 pr-2 text-right font-semibold">Unit Price</th>
                <th className="py-2 text-right font-semibold">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {estimate.items.map((item) => {
                const product = getProduct(item.productId)
                return (
                  <tr key={item.id} className="border-b border-slate-100 align-top">
                    <td className="py-2.5 pr-2 text-slate-800">{item.location}</td>
                    <td className="py-2.5 pr-2 text-slate-600">
                      {item.kind === 'labor'
                        ? 'Labor'
                        : product
                          ? `${product.brand} ${product.series}`
                          : 'Custom'}
                    </td>
                    <td className="py-2.5 pr-2 text-slate-600">
                      {item.kind === 'labor' ? '—' : `${item.width}" × ${item.height}"`}
                    </td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-slate-700">{item.quantity}</td>
                    <td className="py-2.5 pr-2 text-right tabular-nums text-slate-700">
                      {currency(item.unitPrice)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-semibold text-slate-900">
                      {currency(item.unitPrice * item.quantity)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>

        {/* Totals */}
        <section className="mt-5 flex justify-end">
          <dl className="w-72 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Materials</dt>
              <dd className="tabular-nums text-slate-800">{currency(materialPrice)}</dd>
            </div>
            {labor > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Labor</dt>
                <dd className="tabular-nums text-slate-800">{currency(labor)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="tabular-nums text-slate-800">{currency(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Tax</dt>
              <dd className="tabular-nums text-slate-800">{currency(tax)}</dd>
            </div>
            <div className="flex justify-between border-t-2 border-ink-800 pt-2 text-base font-bold text-ink-800">
              <dt>Total</dt>
              <dd className="tabular-nums">{currency(total)}</dd>
            </div>
          </dl>
        </section>

        <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400">
          This is a preliminary estimate prepared by {COMPANY.name}. Pricing valid for 30 days.
          Final pricing subject to field measurement and product availability.
        </footer>
      </article>
    </div>
  )
}
