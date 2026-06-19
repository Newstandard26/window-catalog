import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Container } from '../components/Container'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useStore } from '../data/store'
import { CATALOG, getProduct } from '../data/catalog'
import {
  autoEstimateName,
  currency,
  estimateSubtotal,
  estimateTax,
  estimateTotal,
  totalWindowCount,
} from '../lib/format'
import { PIPELINE, type Estimate, type EstimateStatus, type WindowItem } from '../types'

export function Estimator() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { clients, getClient, getEstimate, addEstimate, updateEstimate } = useStore()
  const createdRef = useRef(false)

  // Create a fresh estimate when arriving without one (optionally pre-filled
  // from a CRM client via ?clientId=). Phase 5 auto-naming applies.
  useEffect(() => {
    if (id || createdRef.current) return
    createdRef.current = true
    const clientId = params.get('clientId') ?? ''
    const client = clientId ? getClient(clientId) : undefined
    const created = addEstimate({
      name: autoEstimateName(client?.name ?? 'New Client', client?.address ?? ''),
      clientId,
      address: client?.address ?? '',
      status: 'Draft',
      taxRate: 0.0825,
      items: [],
    })
    navigate(`/estimator/${created.id}`, { replace: true })
  }, [id, params, addEstimate, getClient, navigate])

  const estimate = id ? getEstimate(id) : undefined

  if (!estimate) {
    return (
      <Container className="py-20 text-center text-slate-500">Preparing estimate…</Container>
    )
  }

  return <EstimatorEditor key={estimate.id} estimate={estimate} clients={clients} update={updateEstimate} />
}

function EstimatorEditor({
  estimate,
  clients,
  update,
}: {
  estimate: Estimate
  clients: ReturnType<typeof useStore>['clients']
  update: ReturnType<typeof useStore>['updateEstimate']
}) {
  const { addWindowItem, removeWindowItem, updateWindowItem } = useStore()
  // Collapsed by default once at least one item exists (Phase 4).
  const [toolsOpen, setToolsOpen] = useState(estimate.items.length === 0)

  const client = clients.find((c) => c.id === estimate.clientId)

  const onClientChange = (clientId: string) => {
    const c = clients.find((x) => x.id === clientId)
    update(estimate.id, {
      clientId,
      address: c?.address ?? estimate.address,
      name: autoEstimateName(c?.name ?? 'New Client', c?.address ?? estimate.address, new Date(estimate.createdAt)),
    })
  }

  return (
    <>
      <PageHeader
        title="Estimator"
        subtitle="Build a window schedule with live pricing."
        actions={<StatusBadge status={estimate.status} className="text-base" />}
      />

      <Container className="py-8">
        {/* Estimate meta */}
        <div className="nsr-card mb-6 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="md:col-span-6">
              <label className="field-label">Estimate name</label>
              <input
                className="field text-lg font-semibold"
                value={estimate.name}
                onChange={(e) => update(estimate.id, { name: e.target.value })}
              />
            </div>
            <div className="md:col-span-3">
              <label className="field-label">Client</label>
              <select className="field" value={estimate.clientId} onChange={(e) => onClientChange(e.target.value)}>
                <option value="">Unassigned</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="field-label">Status</label>
              <select
                className="field"
                value={estimate.status}
                onChange={(e) => update(estimate.id, { status: e.target.value as EstimateStatus })}
              >
                {PIPELINE.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {client && (
            <p className="mt-3 text-sm text-slate-500">
              {client.email} · {client.phone} · {estimate.address}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT: product builder + collapsible Add items tools */}
          <div className="space-y-6 lg:col-span-4">
            <ProductBuilder onAdd={(item) => addWindowItem(estimate.id, item)} />
            <AddItemsTools
              open={toolsOpen}
              onToggle={() => setToolsOpen((v) => !v)}
              onImportSample={() => {
                addWindowItem(estimate.id, {
                  location: 'Imported — Front Elevation',
                  width: 36,
                  height: 60,
                  productId: 'pella-250',
                  quantity: 3,
                  unitPrice: 845,
                })
                setToolsOpen(false)
              }}
            />
          </div>

          {/* CENTER: Window Schedule — the visual focus */}
          <div className="lg:col-span-5">
            <WindowSchedule
              estimate={estimate}
              onUpdateItem={(itemId, patch) => updateWindowItem(estimate.id, itemId, patch)}
              onRemove={(itemId) => removeWindowItem(estimate.id, itemId)}
            />
          </div>

          {/* RIGHT: live Estimate Summary */}
          <div className="lg:col-span-3">
            <EstimateSummary
              estimate={estimate}
              onTaxChange={(taxRate) => update(estimate.id, { taxRate })}
            />
          </div>
        </div>
      </Container>
    </>
  )
}

function ProductBuilder({ onAdd }: { onAdd: (item: Omit<WindowItem, 'id'>) => void }) {
  const [form, setForm] = useState({
    location: '',
    width: 36,
    height: 60,
    productId: CATALOG[0].id,
    quantity: 1,
    unitPrice: CATALOG[0].basePrice,
  })

  const onProduct = (productId: string) => {
    const p = getProduct(productId)
    setForm((f) => ({ ...f, productId, unitPrice: p?.basePrice ?? f.unitPrice }))
  }

  const submit = () => {
    onAdd({ ...form })
    setForm((f) => ({ ...f, location: '', quantity: 1 }))
  }

  return (
    <div className="nsr-card p-6">
      <h2 className="text-lg font-bold text-slate-900">Build a window</h2>
      <p className="mt-1 text-sm text-slate-500">Add a line to the schedule.</p>

      <div className="mt-5 space-y-4">
        <div>
          <label className="field-label">Location / label</label>
          <input
            className="field"
            placeholder="e.g. Living Room"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Width (in)</label>
            <input
              type="number"
              className="field"
              value={form.width}
              onChange={(e) => setForm((f) => ({ ...f, width: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="field-label">Height (in)</label>
            <input
              type="number"
              className="field"
              value={form.height}
              onChange={(e) => setForm((f) => ({ ...f, height: Number(e.target.value) }))}
            />
          </div>
        </div>
        <div>
          <label className="field-label">Product</label>
          <select className="field" value={form.productId} onChange={(e) => onProduct(e.target.value)}>
            {CATALOG.map((p) => (
              <option key={p.id} value={p.id}>
                {p.brand} {p.series} — {currency(p.basePrice)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Quantity</label>
            <input
              type="number"
              min={1}
              className="field"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: Math.max(1, Number(e.target.value)) }))}
            />
          </div>
          <div>
            <label className="field-label">Unit price</label>
            <input
              type="number"
              className="field"
              value={form.unitPrice}
              onChange={(e) => setForm((f) => ({ ...f, unitPrice: Number(e.target.value) }))}
            />
          </div>
        </div>
        <button className="btn-primary w-full" onClick={submit} disabled={!form.location.trim()}>
          + Add to schedule
        </button>
      </div>
    </div>
  )
}

function AddItemsTools({
  open,
  onToggle,
  onImportSample,
}: {
  open: boolean
  onToggle: () => void
  onImportSample: () => void
}) {
  const tools = [
    { label: 'Import Vendor Quote', desc: 'Parse a PDF/photo quote into line items' },
    { label: 'Web Clipper', desc: 'Pull a product from a manufacturer page' },
    { label: 'CompanyCam', desc: 'Import measured openings from site photos' },
  ]
  return (
    <div className="nsr-card overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between p-5 text-left hover:bg-slate-50"
      >
        <div>
          <div className="text-lg font-bold text-slate-900">Add items with AI</div>
          <div className="text-sm text-slate-500">Import, clip, or capture windows automatically</div>
        </div>
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 p-5">
          {tools.map((t) => (
            <button
              key={t.label}
              onClick={onImportSample}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              <span>
                <span className="block font-semibold text-slate-900">{t.label}</span>
                <span className="block text-sm text-slate-500">{t.desc}</span>
              </span>
            </button>
          ))}
          <p className="text-xs text-slate-400">
            Demo: each tool adds a sample captured window to the schedule.
          </p>
        </div>
      )}
    </div>
  )
}

function WindowSchedule({
  estimate,
  onUpdateItem,
  onRemove,
}: {
  estimate: Estimate
  onUpdateItem: (itemId: string, patch: Partial<WindowItem>) => void
  onRemove: (itemId: string) => void
}) {
  if (estimate.items.length === 0) {
    return (
      <div className="nsr-card flex min-h-[24rem] flex-col items-center justify-center p-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="1" />
            <path d="M12 3v18M3 12h18" />
          </svg>
        </div>
        <h3 className="mt-5 text-xl font-bold text-slate-900">Add your first window</h3>
        <p className="mt-2 max-w-sm text-base text-slate-500">
          Use the <span className="font-semibold text-slate-700">Build a window</span> panel on the
          left, or import items with AI. Your window schedule and live totals will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="nsr-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 p-5">
        <h2 className="text-lg font-bold text-slate-900">Window Schedule</h2>
        <span className="text-sm text-slate-500">{totalWindowCount(estimate)} windows</span>
      </div>
      <div className="divide-y divide-slate-100">
        {estimate.items.map((item) => {
          const product = getProduct(item.productId)
          return (
            <div key={item.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{item.location}</div>
                  <div className="text-sm text-slate-500">
                    {product ? `${product.brand} ${product.series}` : 'Custom'} · {item.width}" × {item.height}"
                  </div>
                </div>
                <button
                  className="text-sm font-medium text-slate-400 hover:text-rose-600"
                  onClick={() => onRemove(item.id)}
                >
                  Remove
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-4">
                <div>
                  <label className="field-label">Qty</label>
                  <input
                    type="number"
                    min={1}
                    className="field w-20"
                    value={item.quantity}
                    onChange={(e) => onUpdateItem(item.id, { quantity: Math.max(1, Number(e.target.value)) })}
                  />
                </div>
                <div>
                  <label className="field-label">Unit price</label>
                  <input
                    type="number"
                    className="field w-32"
                    value={item.unitPrice}
                    onChange={(e) => onUpdateItem(item.id, { unitPrice: Number(e.target.value) })}
                  />
                </div>
                <div className="ml-auto text-right">
                  <div className="text-sm text-slate-400">Line total</div>
                  <div className="text-lg font-bold text-slate-900">
                    {currency(item.unitPrice * item.quantity)}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EstimateSummary({
  estimate,
  onTaxChange,
}: {
  estimate: Estimate
  onTaxChange: (rate: number) => void
}) {
  const subtotal = useMemo(() => estimateSubtotal(estimate), [estimate])
  const tax = useMemo(() => estimateTax(estimate), [estimate])
  const total = useMemo(() => estimateTotal(estimate), [estimate])

  return (
    <div className="nsr-card sticky top-20 p-6">
      <h2 className="text-lg font-bold text-slate-900">Estimate Summary</h2>

      <dl className="mt-5 space-y-4 text-base">
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Windows</dt>
          <dd className="font-semibold text-slate-900">{totalWindowCount(estimate)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Subtotal</dt>
          <dd className="font-semibold text-slate-900">{currency(subtotal)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">
            Tax
            <input
              type="number"
              step={0.0025}
              className="ml-2 w-20 rounded border border-slate-300 px-2 py-1 text-sm"
              value={estimate.taxRate}
              onChange={(e) => onTaxChange(Number(e.target.value))}
            />
          </dt>
          <dd className="font-semibold text-slate-900">{currency(tax)}</dd>
        </div>
      </dl>

      <div className="mt-5 border-t border-slate-200 pt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-base font-medium text-slate-500">Total</span>
          <span className="text-3xl font-bold text-brand-700">{currency(total)}</span>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between rounded-lg bg-slate-50 p-3.5">
        <span className="text-sm text-slate-500">Status</span>
        <StatusBadge status={estimate.status} />
      </div>
    </div>
  )
}
