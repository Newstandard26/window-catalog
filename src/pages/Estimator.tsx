import { useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
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
  formatPrice,
  totalWindowCount,
} from '../lib/format'
import { PIPELINE, type Estimate, type EstimateStatus, type WindowItem } from '../types'

// A representative "captured" window the AI import tools add (demo).
const SAMPLE_IMPORT: Omit<WindowItem, 'id'> = {
  location: 'Imported — Front Elevation',
  width: 36,
  height: 60,
  productId: CATALOG[0].id,
  quantity: 3,
  unitPrice: CATALOG[0].unitPrice ?? 0,
}

export function Estimator() {
  const { id } = useParams()
  const { getEstimate } = useStore()
  const existing = id ? getEstimate(id) : undefined

  if (id && existing) return <PersistedEstimator key={existing.id} estimate={existing} />
  if (id && !existing) {
    return (
      <Container className="py-20 text-center">
        <p className="text-lg text-slate-600">This estimate no longer exists.</p>
        <Link to="/projects" className="btn-secondary mt-4 inline-flex">
          Back to Projects
        </Link>
      </Container>
    )
  }
  // Fix 1: a fresh estimate is held in local state only — nothing is persisted
  // until the first window is added or the user clicks Save.
  return <DraftEstimator />
}

/* ----------------------------- New (unsaved) draft ----------------------------- */

function DraftEstimator() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { clients, getClient, addEstimate, newId } = useStore()

  const initialClientId = params.get('clientId') ?? ''
  const initialClient = initialClientId ? getClient(initialClientId) : undefined

  const [draft, setDraft] = useState(() => ({
    name: autoEstimateName(initialClient?.name ?? 'New Client', initialClient?.address ?? ''),
    clientId: initialClientId,
    address: initialClient?.address ?? '',
    status: 'Draft' as EstimateStatus,
    taxRate: 0.0825,
    nameEdited: false,
  }))

  const view: Estimate = {
    id: 'draft',
    name: draft.name,
    clientId: draft.clientId,
    address: draft.address,
    status: draft.status,
    items: [],
    taxRate: draft.taxRate,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const persist = (items: Omit<WindowItem, 'id'>[]) => {
    const created = addEstimate({
      name: draft.name,
      clientId: draft.clientId,
      address: draft.address,
      status: draft.status,
      taxRate: draft.taxRate,
      items: items.map((it) => ({ ...it, id: newId('w') })),
    })
    navigate(`/estimator/${created.id}`, { replace: true })
  }

  const onClientChange = (clientId: string) => {
    const c = clients.find((x) => x.id === clientId)
    setDraft((d) => ({
      ...d,
      clientId,
      address: c?.address ?? d.address,
      name: d.nameEdited ? d.name : autoEstimateName(c?.name ?? 'New Client', c?.address ?? ''),
    }))
  }

  return (
    <>
      <PageHeader
        title="Estimator"
        subtitle="Build a window schedule with live pricing."
        actions={
          <>
            <button className="btn-secondary" onClick={() => navigate('/projects')}>
              Discard
            </button>
            <button className="btn-primary" onClick={() => persist([])}>
              Save draft
            </button>
          </>
        }
      />
      <Container className="py-8">
        <MetaBar
          estimate={view}
          clients={clients}
          onName={(name) => setDraft((d) => ({ ...d, name, nameEdited: true }))}
          onClient={onClientChange}
          onStatus={(status) => setDraft((d) => ({ ...d, status }))}
        />
        <p className="-mt-3 mb-6 text-sm text-slate-500">
          This draft isn’t saved yet — it’s added to Projects when you add a window or click{' '}
          <span className="font-semibold text-slate-600">Save draft</span>.
        </p>
        <EstimatorBody
          estimate={view}
          toolsOpenDefault
          onAddItem={(item) => persist([item])}
          onImportSample={() => persist([SAMPLE_IMPORT])}
          onUpdateItem={() => {}}
          onRemoveItem={() => {}}
          onTaxChange={(taxRate) => setDraft((d) => ({ ...d, taxRate }))}
        />
      </Container>
    </>
  )
}

/* ------------------------------ Saved estimate ------------------------------ */

function PersistedEstimator({ estimate }: { estimate: Estimate }) {
  const navigate = useNavigate()
  const {
    clients,
    updateEstimate,
    removeEstimate,
    addWindowItem,
    updateWindowItem,
    removeWindowItem,
  } = useStore()

  const onClientChange = (clientId: string) => {
    const c = clients.find((x) => x.id === clientId)
    updateEstimate(estimate.id, {
      clientId,
      address: c?.address ?? estimate.address,
      name: autoEstimateName(
        c?.name ?? 'New Client',
        c?.address ?? estimate.address,
        new Date(estimate.createdAt),
      ),
    })
  }

  const onDelete = () => {
    if (window.confirm("Delete this estimate? This can't be undone.")) {
      removeEstimate(estimate.id)
      navigate('/projects')
    }
  }

  return (
    <>
      <PageHeader
        title="Estimator"
        subtitle="Build a window schedule with live pricing."
        actions={
          <>
            <StatusBadge status={estimate.status} className="text-base" />
            <button className="btn-secondary" onClick={onDelete}>
              Delete
            </button>
          </>
        }
      />
      <Container className="py-8">
        <MetaBar
          estimate={estimate}
          clients={clients}
          onName={(name) => updateEstimate(estimate.id, { name })}
          onClient={onClientChange}
          onStatus={(status) => updateEstimate(estimate.id, { status })}
        />
        <EstimatorBody
          estimate={estimate}
          toolsOpenDefault={estimate.items.length === 0}
          onAddItem={(item) => addWindowItem(estimate.id, item)}
          onImportSample={() => addWindowItem(estimate.id, SAMPLE_IMPORT)}
          onUpdateItem={(itemId, patch) => updateWindowItem(estimate.id, itemId, patch)}
          onRemoveItem={(itemId) => removeWindowItem(estimate.id, itemId)}
          onTaxChange={(taxRate) => updateEstimate(estimate.id, { taxRate })}
        />
      </Container>
    </>
  )
}

/* -------------------------------- Shared UI -------------------------------- */

function MetaBar({
  estimate,
  clients,
  onName,
  onClient,
  onStatus,
}: {
  estimate: Estimate
  clients: ReturnType<typeof useStore>['clients']
  onName: (name: string) => void
  onClient: (clientId: string) => void
  onStatus: (status: EstimateStatus) => void
}) {
  const client = clients.find((c) => c.id === estimate.clientId)
  return (
    <div className="nsr-card mb-6 p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        <div className="md:col-span-6">
          <label className="field-label">Estimate name</label>
          <input
            className="field text-lg font-semibold"
            value={estimate.name}
            onChange={(e) => onName(e.target.value)}
          />
        </div>
        <div className="md:col-span-3">
          <label className="field-label">Client</label>
          <select className="field" value={estimate.clientId} onChange={(e) => onClient(e.target.value)}>
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
            onChange={(e) => onStatus(e.target.value as EstimateStatus)}
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
  )
}

function EstimatorBody({
  estimate,
  toolsOpenDefault,
  onAddItem,
  onImportSample,
  onUpdateItem,
  onRemoveItem,
  onTaxChange,
}: {
  estimate: Estimate
  toolsOpenDefault: boolean
  onAddItem: (item: Omit<WindowItem, 'id'>) => void
  onImportSample: () => void
  onUpdateItem: (itemId: string, patch: Partial<WindowItem>) => void
  onRemoveItem: (itemId: string) => void
  onTaxChange: (rate: number) => void
}) {
  const [toolsOpen, setToolsOpen] = useState(toolsOpenDefault)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-4">
        <ProductBuilder
          onAdd={(item) => {
            onAddItem(item)
            setToolsOpen(false)
          }}
        />
        <AddItemsTools
          open={toolsOpen}
          onToggle={() => setToolsOpen((v) => !v)}
          onImportSample={() => {
            onImportSample()
            setToolsOpen(false)
          }}
        />
      </div>

      <div className="lg:col-span-5">
        <WindowSchedule estimate={estimate} onUpdateItem={onUpdateItem} onRemove={onRemoveItem} />
      </div>

      <div className="lg:col-span-3">
        <EstimateSummary estimate={estimate} onTaxChange={onTaxChange} />
      </div>
    </div>
  )
}

function ProductBuilder({ onAdd }: { onAdd: (item: Omit<WindowItem, 'id'>) => void }) {
  const [form, setForm] = useState({
    location: '',
    width: 36,
    height: 60,
    productId: CATALOG[0].id,
    quantity: 1,
    unitPrice: CATALOG[0].unitPrice ?? 0,
  })

  const onProduct = (productId: string) => {
    const p = getProduct(productId)
    // Pending products have no sourced price yet — default to 0 so the rep
    // enters the quoted price for this job.
    setForm((f) => ({ ...f, productId, unitPrice: p?.unitPrice ?? 0 }))
  }

  const submit = () => {
    // Fix 6: location is optional now — the button stays fully active rather
    // than reading as faded/disabled. Fall back to a sensible default label.
    onAdd({ ...form, location: form.location.trim() || 'New Window' })
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
                {p.brand} {p.series} — {formatPrice(p.unitPrice)}
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
        <button className="btn-primary w-full" onClick={submit}>
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
  const subtotal = estimateSubtotal(estimate)
  const tax = estimateTax(estimate)
  const total = estimateTotal(estimate)
  // Fix 6: show the tax rate as a percentage while storing the decimal.
  const taxPercent = Number((estimate.taxRate * 100).toFixed(3))

  return (
    <div className="nsr-card sticky top-20 p-6">
      <h2 className="text-lg font-bold text-slate-900">Estimate Summary</h2>

      <dl className="mt-5 space-y-4 text-base">
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Windows</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{totalWindowCount(estimate)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Subtotal</dt>
          <dd className="font-semibold tabular-nums text-slate-900">{currency(subtotal)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2 text-slate-500">
            Tax
            <span className="relative">
              <input
                type="number"
                step={0.125}
                min={0}
                className="w-20 rounded border border-slate-300 py-1 pl-2 pr-6 text-sm"
                value={taxPercent}
                onChange={(e) => onTaxChange(Number(e.target.value) / 100)}
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                %
              </span>
            </span>
          </dt>
          <dd className="font-semibold tabular-nums text-slate-900">{currency(tax)}</dd>
        </div>
      </dl>

      <div className="mt-5 border-t border-slate-200 pt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-base font-medium text-slate-500">Total</span>
          <span className="text-3xl font-bold tabular-nums text-brand-700">{currency(total)}</span>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between rounded-lg bg-slate-50 p-3.5">
        <span className="text-sm text-slate-500">Status</span>
        <StatusBadge status={estimate.status} />
      </div>
    </div>
  )
}
