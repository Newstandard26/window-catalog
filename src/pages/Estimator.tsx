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
  deriveSellPrice,
  estimateLabor,
  estimateMaterialCost,
  estimateMaterialPrice,
  estimateProfit,
  estimateSubtotal,
  estimateTax,
  estimateTotal,
  totalWindowCount,
} from '../lib/format'
import {
  PIPELINE,
  type Estimate,
  type EstimateStatus,
  type LineKind,
  type MarginMode,
  type WindowItem,
} from '../types'

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
  // Task 0b / Fix 1: a fresh estimate lives in local state only — nothing is
  // persisted until the first window is added or the user clicks Save.
  return <DraftEstimator />
}

/** Build a line item, deriving the sell price from cost + margin. */
function makeItem(
  partial: Pick<WindowItem, 'kind' | 'location' | 'width' | 'height' | 'productId' | 'quantity' | 'unitCost'>,
  mode: MarginMode,
  pct: number,
): Omit<WindowItem, 'id'> {
  return {
    ...partial,
    unitPrice: deriveSellPrice(partial.unitCost, mode, pct),
    priceOverridden: false,
  }
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
    marginMode: 'margin' as MarginMode,
    marginPct: 35,
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
    marginMode: draft.marginMode,
    marginPct: draft.marginPct,
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
      marginMode: draft.marginMode,
      marginPct: draft.marginPct,
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
        subtitle="Build a window schedule with live pricing & margin."
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
          onAddItem={(item) => persist([item])}
          onUpdateItem={() => {}}
          onRemoveItem={() => {}}
          onTaxChange={(taxRate) => setDraft((d) => ({ ...d, taxRate }))}
          onMarginChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
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
    setEstimateMargin,
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

  const onDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (window.confirm("Delete this estimate? This can't be undone.")) {
      navigate('/projects')
      removeEstimate(estimate.id)
    }
  }

  return (
    <>
      <PageHeader
        title="Estimator"
        subtitle="Build a window schedule with live pricing & margin."
        actions={
          <>
            <StatusBadge status={estimate.status} className="text-base" />
            <Link to={`/proposal/${estimate.id}`} className="btn-secondary">
              Export PDF
            </Link>
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
          onAddItem={(item) => addWindowItem(estimate.id, item)}
          onUpdateItem={(itemId, patch) => updateWindowItem(estimate.id, itemId, patch)}
          onRemoveItem={(itemId) => removeWindowItem(estimate.id, itemId)}
          onTaxChange={(taxRate) => updateEstimate(estimate.id, { taxRate })}
          onMarginChange={(patch) => setEstimateMargin(estimate.id, patch)}
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
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onTaxChange,
  onMarginChange,
}: {
  estimate: Estimate
  onAddItem: (item: Omit<WindowItem, 'id'>) => void
  onUpdateItem: (itemId: string, patch: Partial<WindowItem>) => void
  onRemoveItem: (itemId: string) => void
  onTaxChange: (rate: number) => void
  onMarginChange: (patch: { marginMode?: MarginMode; marginPct?: number }) => void
}) {
  const [toolsOpen, setToolsOpen] = useState(estimate.items.length === 0)

  const importSample = () => {
    const p = CATALOG[0]
    onAddItem(
      makeItem(
        {
          kind: 'material',
          location: 'Imported — Front Elevation',
          width: 36,
          height: 60,
          productId: p.id,
          quantity: 3,
          unitCost: p.unitCost ?? 0,
        },
        estimate.marginMode,
        estimate.marginPct,
      ),
    )
    setToolsOpen(false)
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-4">
        <ProductBuilder
          marginMode={estimate.marginMode}
          marginPct={estimate.marginPct}
          onAdd={(item) => {
            onAddItem(item)
            setToolsOpen(false)
          }}
        />
        <AddItemsTools open={toolsOpen} onToggle={() => setToolsOpen((v) => !v)} onImportSample={importSample} />
      </div>

      <div className="lg:col-span-5">
        <WindowSchedule estimate={estimate} onUpdateItem={onUpdateItem} onRemove={onRemoveItem} />
      </div>

      <div className="lg:col-span-3">
        <EstimateSummary estimate={estimate} onTaxChange={onTaxChange} onMarginChange={onMarginChange} />
      </div>
    </div>
  )
}

function ProductBuilder({
  marginMode,
  marginPct,
  onAdd,
}: {
  marginMode: MarginMode
  marginPct: number
  onAdd: (item: Omit<WindowItem, 'id'>) => void
}) {
  const [form, setForm] = useState({
    kind: 'material' as LineKind,
    location: '',
    width: 36,
    height: 60,
    productId: CATALOG[0].id,
    quantity: 1,
    unitCost: CATALOG[0].unitCost ?? 0,
  })

  const isLabor = form.kind === 'labor'

  // Task 0b: selecting a product auto-fills its cost from the catalog.
  const onProduct = (productId: string) => {
    const p = getProduct(productId)
    setForm((f) => ({ ...f, productId, unitCost: p?.unitCost ?? 0 }))
  }

  const setKind = (kind: LineKind) =>
    setForm((f) => ({ ...f, kind, location: kind === 'labor' && !f.location ? 'Installation labor' : f.location }))

  const sell = deriveSellPrice(form.unitCost, marginMode, marginPct)

  const submit = () => {
    onAdd(
      makeItem(
        {
          ...form,
          location: form.location.trim() || (isLabor ? 'Labor' : 'New Window'),
          productId: isLabor ? '' : form.productId,
          width: isLabor ? 0 : form.width,
          height: isLabor ? 0 : form.height,
        },
        marginMode,
        marginPct,
      ),
    )
    setForm((f) => ({ ...f, location: '', quantity: 1 }))
  }

  return (
    <div className="nsr-card p-6">
      <h2 className="text-lg font-bold text-slate-900">Build a line</h2>
      <p className="mt-1 text-sm text-slate-500">Sell price is derived from cost + margin.</p>

      {/* Material vs Labor */}
      <div className="mt-4 flex gap-2">
        {(['material', 'labor'] as LineKind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-semibold capitalize ${
              form.kind === k ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label className="field-label">{isLabor ? 'Labor description' : 'Location / label'}</label>
          <input
            className="field"
            placeholder={isLabor ? 'e.g. Installation labor' : 'e.g. Living Room'}
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
        </div>

        {!isLabor && (
          <>
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
                    {p.brand} {p.series}
                    {p.unitCost == null ? ' — cost TBD' : ` — cost ${currency(p.unitCost)}`}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">{isLabor ? 'Hours / units' : 'Quantity'}</label>
            <input
              type="number"
              min={1}
              className="field"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: Math.max(1, Number(e.target.value)) }))}
            />
          </div>
          <div>
            <label className="field-label">{isLabor ? 'Cost / unit' : 'Unit cost'}</label>
            <input
              type="number"
              className="field"
              value={form.unitCost}
              onChange={(e) => setForm((f) => ({ ...f, unitCost: Number(e.target.value) }))}
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5 text-sm">
          <span className="text-slate-500">
            Sell @ {marginPct}% {marginMode}
            {isLabor && ' · not taxed'}
          </span>
          <span className="font-bold tabular-nums text-brand-700">{currency(sell)}</span>
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

  const setCost = (item: WindowItem, unitCost: number) => {
    // Recompute the sell price unless this line was hand-overridden.
    const patch: Partial<WindowItem> = { unitCost }
    if (!item.priceOverridden) {
      patch.unitPrice = deriveSellPrice(unitCost, estimate.marginMode, estimate.marginPct)
    }
    onUpdateItem(item.id, patch)
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
          const lineMargin = (item.unitPrice - item.unitCost) * item.quantity
          return (
            <div key={item.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{item.location}</span>
                    {item.kind === 'labor' && (
                      <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs font-semibold text-sky-700">
                        Labor · no tax
                      </span>
                    )}
                    {item.priceOverridden && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                        Custom price
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-500">
                    {item.kind === 'labor'
                      ? 'Labor line'
                      : `${product ? `${product.brand} ${product.series}` : 'Custom'} · ${item.width}" × ${item.height}"`}
                  </div>
                </div>
                <button
                  className="text-sm font-medium text-slate-400 hover:text-rose-600"
                  onClick={() => onRemove(item.id)}
                >
                  Remove
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="field-label">Qty</label>
                  <input
                    type="number"
                    min={1}
                    className="field"
                    value={item.quantity}
                    onChange={(e) => onUpdateItem(item.id, { quantity: Math.max(1, Number(e.target.value)) })}
                  />
                </div>
                <div>
                  <label className="field-label">Unit cost</label>
                  <input
                    type="number"
                    className="field"
                    value={item.unitCost}
                    onChange={(e) => setCost(item, Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="field-label">Sell price</label>
                  <input
                    type="number"
                    className="field"
                    value={item.unitPrice}
                    onChange={(e) =>
                      onUpdateItem(item.id, { unitPrice: Number(e.target.value), priceOverridden: true })
                    }
                  />
                </div>
                <div className="flex flex-col justify-end text-right">
                  <span className="text-sm text-slate-400">Line total</span>
                  <span className="text-lg font-bold tabular-nums text-slate-900">
                    {currency(item.unitPrice * item.quantity)}
                  </span>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
                <span>Line margin: <span className="font-semibold text-emerald-700">{currency(lineMargin)}</span></span>
                {item.priceOverridden && (
                  <button
                    className="font-medium text-brand-700 hover:text-brand-800"
                    onClick={() =>
                      onUpdateItem(item.id, {
                        priceOverridden: false,
                        unitPrice: deriveSellPrice(item.unitCost, estimate.marginMode, estimate.marginPct),
                      })
                    }
                  >
                    Reset to margin
                  </button>
                )}
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
  onMarginChange,
}: {
  estimate: Estimate
  onTaxChange: (rate: number) => void
  onMarginChange: (patch: { marginMode?: MarginMode; marginPct?: number }) => void
}) {
  const materialCost = estimateMaterialCost(estimate)
  const materialPrice = estimateMaterialPrice(estimate)
  const margin = estimateProfit(estimate)
  const labor = estimateLabor(estimate)
  const subtotal = estimateSubtotal(estimate)
  const tax = estimateTax(estimate)
  const total = estimateTotal(estimate)
  const taxPercent = Number((estimate.taxRate * 100).toFixed(3))

  return (
    <div className="nsr-card sticky top-20 p-6">
      <h2 className="text-lg font-bold text-slate-900">Estimate Summary</h2>

      {/* Margin controls */}
      <div className="mt-4 rounded-lg border border-slate-200 p-3.5">
        <div className="flex items-center gap-2">
          <button
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-semibold ${
              estimate.marginMode === 'margin' ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'
            }`}
            onClick={() => onMarginChange({ marginMode: 'margin' })}
          >
            Margin
          </button>
          <button
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-semibold ${
              estimate.marginMode === 'markup' ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'
            }`}
            onClick={() => onMarginChange({ marginMode: 'markup' })}
          >
            Markup
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-slate-500">{estimate.marginMode === 'margin' ? 'Margin' : 'Markup'} %</span>
          <div className="relative">
            <input
              type="number"
              step={1}
              min={0}
              className="w-24 rounded border border-slate-300 py-1 pl-2 pr-6 text-sm"
              value={estimate.marginPct}
              onChange={(e) => onMarginChange({ marginPct: Number(e.target.value) })}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
          </div>
        </div>
      </div>

      {/* Build-up */}
      <dl className="mt-5 space-y-3 text-base">
        <Row label="Material cost" value={currency(materialCost)} muted />
        <Row label={`Margin (${estimate.marginPct}%)`} value={currency(margin)} className="text-emerald-700" />
        <Row label="Material price (sell)" value={currency(materialPrice)} />
        <Row label="Labor (untaxed)" value={currency(labor)} />
        <div className="border-t border-slate-100 pt-3">
          <Row label="Subtotal" value={currency(subtotal)} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2 text-slate-500">
            Tax<span className="text-xs text-slate-400">(material)</span>
            <span className="relative">
              <input
                type="number"
                step={0.125}
                min={0}
                className="w-20 rounded border border-slate-300 py-1 pl-2 pr-6 text-sm"
                value={taxPercent}
                onChange={(e) => onTaxChange(Number(e.target.value) / 100)}
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
            </span>
          </dt>
          <dd className="font-semibold tabular-nums text-slate-900">{currency(tax)}</dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-base font-medium text-slate-500">Total</span>
          <span className="text-3xl font-bold tabular-nums text-brand-700">{currency(total)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-3.5 py-2.5">
          <span className="text-sm font-medium text-emerald-700">Est. profit</span>
          <span className="text-lg font-bold tabular-nums text-emerald-700">{currency(margin)}</span>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Add labor with the Labor toggle in “Build a line.” Labor is included in the subtotal but
          not taxed.
        </p>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  muted,
  className = '',
}: {
  label: string
  value: string
  muted?: boolean
  className?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? 'text-slate-400' : 'text-slate-500'}>{label}</dt>
      <dd className={`font-semibold tabular-nums ${className || 'text-slate-900'}`}>{value}</dd>
    </div>
  )
}
