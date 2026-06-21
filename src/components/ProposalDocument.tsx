import type { Client, Estimate } from '../types'
import { COMPANY } from '../data/company'
import { WindowDiagram, inferWindowStyle } from './WindowDiagram'
import { clientProposal, currency, shortDate } from '../lib/format'

/**
 * The client-facing proposal document (letterhead + schedule + totals). Shared
 * by the printable proposal and the public signing page.
 *
 * IMPORTANT: client prices and totals only — never cost, margin, or profit. The
 * global job margin is folded uniformly into every line so the breakdown foots
 * to the Total without exposing the markup.
 */
export function ProposalDocument({
  estimate,
  client,
}: {
  estimate: Estimate
  client?: Client
}) {
  const view = clientProposal(estimate)
  const { windows, labor, materials, laborTotal, subtotal, tax, total } = view

  return (
    <article className="mx-auto max-w-[8.5in] bg-white p-[0.75in] shadow-card print:shadow-none">
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

      <section className="mt-6">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-2 font-semibold">Diagram</th>
              <th className="py-2 pr-2 font-semibold">Location</th>
              <th className="py-2 pr-2 font-semibold">Product</th>
              <th className="py-2 pr-2 font-semibold">Size</th>
              <th className="py-2 pr-2 text-right font-semibold">Qty</th>
              <th className="py-2 pr-2 text-right font-semibold">Unit Price</th>
              <th className="py-2 text-right font-semibold">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {windows.map(({ item, unitPrice, lineTotal }) => {
              const style =
                item.style ??
                inferWindowStyle([item.productName, item.location].filter(Boolean).join(' '))
              const grille = item.grille
              return (
                <tr key={item.id} className="border-b border-slate-100 align-top">
                  <td className="py-2.5 pr-2">
                    <WindowDiagram
                      style={style}
                      widthIn={item.width}
                      heightIn={item.height}
                      sizeBasis={item.sizeBasis}
                      grille={grille}
                      handing={item.handing}
                      sections={item.sections}
                      maxFrame={54}
                    />
                  </td>
                  <td className="py-2.5 pr-2 text-slate-800">{item.location}</td>
                  <td className="py-2.5 pr-2 text-slate-600">{item.productName || 'Custom'}</td>
                  <td className="py-2.5 pr-2 text-slate-600">{`${item.width}" × ${item.height}"`}</td>
                  <td className="py-2.5 pr-2 text-right tabular-nums text-slate-700">{item.quantity}</td>
                  <td className="py-2.5 pr-2 text-right tabular-nums text-slate-700">{currency(unitPrice)}</td>
                  <td className="py-2.5 text-right tabular-nums font-semibold text-slate-900">
                    {currency(lineTotal)}
                  </td>
                </tr>
              )
            })}
            {labor.map((l, i) => (
              <tr key={`labor-${i}`} className="border-b border-slate-100 align-top">
                <td className="py-2.5 pr-2 text-slate-300">—</td>
                <td className="py-2.5 pr-2 text-slate-800">{l.label}</td>
                <td className="py-2.5 pr-2 text-slate-600">Labor</td>
                <td className="py-2.5 pr-2 text-slate-600">—</td>
                <td className="py-2.5 pr-2 text-right tabular-nums text-slate-700">1</td>
                <td className="py-2.5 pr-2 text-right tabular-nums text-slate-700">{currency(l.amount)}</td>
                <td className="py-2.5 text-right tabular-nums font-semibold text-slate-900">
                  {currency(l.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-5 flex justify-end">
        <dl className="w-72 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Materials</dt>
            <dd className="tabular-nums text-slate-800">{currency(materials)}</dd>
          </div>
          {laborTotal > 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-500">Labor</dt>
              <dd className="tabular-nums text-slate-800">{currency(laborTotal)}</dd>
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
        This is a preliminary estimate prepared by {COMPANY.name}. Pricing valid for 30 days. Final
        pricing subject to field measurement and product availability.
      </footer>
    </article>
  )
}
