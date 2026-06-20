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
  shortDate,
  totalWindowCount,
} from '../lib/format'
import {
  buildProposalPayload,
  fetchSignedDocuments,
  isDocusignConfigured,
  sendViaDocusign,
  type SignMode,
} from '../lib/sign'
import {
  PIPELINE,
  type Client,
  type Estimate,
  type EstimateStatus,
  type LineKind,
  type MarginMode,
  type SignedFile,
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
    sendForSignature,
    addWindowItem,
    updateWindowItem,
    removeWindowItem,
  } = useStore()
  const client = clients.find((c) => c.id === estimate.clientId)
  const [signOpen, setSignOpen] = useState(false)
  const [token, setToken] = useState<string | null>(estimate.signatureToken ?? null)

  // Once signed, the estimate is locked from edits (Task 3).
  if (estimate.signature) return <LockedEstimate estimate={estimate} />

  const openSend = () => {
    const t = estimate.signatureToken ?? sendForSignature(estimate.id)
    setToken(t)
    setSignOpen(true)
  }

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
            <button className="btn-primary" onClick={openSend}>
              Send for signature
            </button>
            <button className="btn-secondary" onClick={onDelete}>
              Delete
            </button>
          </>
        }
      />
      {signOpen && token && (
        <SignLinkModal
          estimate={estimate}
          client={client}
          token={token}
          onClose={() => setSignOpen(false)}
        />
      )}
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

/* ------------------------------ Signature flow ------------------------------ */

function SignLinkModal({
  estimate,
  client,
  token,
  onClose,
}: {
  estimate: Estimate
  client?: Client
  token: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="nsr-card w-full max-w-lg p-6">
        {isDocusignConfigured() ? (
          <DocusignPanel estimate={estimate} client={client} onClose={onClose} />
        ) : (
          <BuiltinLinkPanel estimate={estimate} token={token} onClose={onClose} />
        )}
      </div>
    </div>
  )
}

function DocusignPanel({
  estimate,
  client,
  onClose,
}: {
  estimate: Estimate
  client?: Client
  onClose: () => void
}) {
  const { finalizeDocusign } = useStore()
  const [name, setName] = useState(client?.name ?? '')
  const [email, setEmail] = useState(client?.email ?? '')
  const [mode, setMode] = useState<SignMode>('email')
  const [phase, setPhase] = useState<'form' | 'sending' | 'sent' | 'checking'>('form')
  const [error, setError] = useState('')
  const [signingUrl, setSigningUrl] = useState<string | undefined>()
  const [statusText, setStatusText] = useState('')

  const canSend = name.trim().length > 1 && /.+@.+\..+/.test(email)

  const send = async () => {
    setError('')
    setPhase('sending')
    try {
      const payload = buildProposalPayload(
        estimate,
        client,
        { name: name.trim(), email: email.trim() },
        mode,
        window.location.href,
      )
      const res = await sendViaDocusign(payload)
      setSigningUrl(res.signingUrl)
      setPhase('sent')
      if (mode === 'embedded' && res.signingUrl) window.open(res.signingUrl, '_blank', 'noopener')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send envelope')
      setPhase('form')
    }
  }

  const checkStatus = async () => {
    setError('')
    setPhase('checking')
    try {
      const status = await finalizeDocusign(estimate.id)
      if (status === 'completed') return // estimate locks + files attach; modal unmounts
      setStatusText(
        status === 'none' ? 'No envelope found yet.' : `Status: ${status} — not signed yet.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status check failed')
    } finally {
      setPhase('sent')
    }
  }

  return (
    <>
      <h3 className="text-xl font-bold text-slate-900">Send via DocuSign</h3>
      <p className="mt-1 text-sm text-slate-500">
        A branded proposal PDF is generated and sent to the client for a legally binding e-signature.
      </p>

      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Signer name</label>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" />
          </div>
          <div>
            <label className="field-label">Signer email</label>
            <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@email.com" />
          </div>
        </div>

        <div>
          <label className="field-label">Delivery</label>
          <div className="grid grid-cols-2 gap-2">
            <ModeOption active={mode === 'email'} onClick={() => setMode('email')} title="Email the client" desc="DocuSign emails a signing link" />
            <ModeOption active={mode === 'embedded'} onClick={() => setMode('embedded')} title="Sign in person" desc="Opens the signing window now" />
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
      )}

      {phase === 'sent' && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800">
          {mode === 'email' ? (
            <>Envelope sent — {email} will receive a DocuSign email to sign.</>
          ) : (
            <>Signing window opened. Complete the signature, then check status to lock the estimate.</>
          )}
          {signingUrl && mode === 'embedded' && (
            <>
              {' '}
              <a className="font-semibold underline" href={signingUrl} target="_blank" rel="noreferrer">
                Re-open signing window
              </a>
            </>
          )}
          {statusText && <div className="mt-1 font-medium">{statusText}</div>}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <button className="btn-secondary" onClick={onClose}>
          Close
        </button>
        {phase === 'sent' ? (
          <button className="btn-primary" onClick={checkStatus}>
            Check signature status
          </button>
        ) : (
          <button className="btn-primary" disabled={!canSend || phase !== 'form'} onClick={send}>
            {phase === 'sending' ? 'Sending…' : 'Send via DocuSign'}
          </button>
        )}
      </div>
    </>
  )
}

function ModeOption({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean
  onClick: () => void
  title: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-3 text-left text-sm transition ${
        active ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="font-semibold text-slate-900">{title}</div>
      <div className="mt-0.5 text-xs text-slate-500">{desc}</div>
    </button>
  )
}

function BuiltinLinkPanel({
  estimate,
  token,
  onClose,
}: {
  estimate: Estimate
  token: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/sign/${token}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <>
      <h3 className="text-xl font-bold text-slate-900">Send for signature</h3>
      <p className="mt-1 text-sm text-slate-500">
        Share this secure link with {estimate.name.split(' — ')[0] || 'the client'} to review and
        e-sign the proposal.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <input className="field text-sm" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
        <button className="btn-primary btn-sm shrink-0" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
        <strong>Built-in signing (demo).</strong> DocuSign isn’t configured yet, and this
        localStorage build resolves the link on this device only. Set <code>VITE_SIGN_API_URL</code>{' '}
        to enable real DocuSign email delivery and cross-device signing.
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button className="btn-secondary" onClick={onClose}>
          Close
        </button>
        <a className="btn-primary" href={link} target="_blank" rel="noreferrer">
          Open signing page
        </a>
      </div>
    </>
  )
}

function LockedEstimate({ estimate }: { estimate: Estimate }) {
  const sig = estimate.signature!
  return (
    <>
      <PageHeader
        title="Estimator"
        subtitle="This proposal has been signed and is locked."
        actions={
          <>
            <StatusBadge status={estimate.status} className="text-base" />
            <Link to={`/proposal/${estimate.id}`} className="btn-secondary">
              Export PDF
            </Link>
          </>
        }
      />
      <Container className="py-8">
        <div className="nsr-card mb-6 flex items-start gap-3 border-emerald-200 bg-emerald-50 p-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Signed &amp; locked</h2>
            <p className="mt-1 text-slate-700">
              Signed by <span className="font-semibold">{sig.signerName}</span> on{' '}
              {shortDate(sig.signedAt)} via {sig.method === 'docusign' ? 'DocuSign' : 'in-app signature'}.
              {sig.ip && <> · IP {sig.ip}</>}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="nsr-card p-6 lg:col-span-2">
            <h3 className="text-lg font-bold text-slate-900">{estimate.name}</h3>
            <p className="mt-1 text-sm text-slate-500">{estimate.address}</p>
            {sig.signatureImage && (
              <div className="mt-4">
                <div className="text-xs uppercase tracking-wide text-slate-400">Signature</div>
                <img
                  src={sig.signatureImage}
                  alt="Client signature"
                  className="mt-1 h-24 rounded border border-slate-200 bg-white"
                />
              </div>
            )}
          </div>
          <div className="nsr-card p-6">
            <Row label="Subtotal" value={currency(estimateSubtotal(estimate))} />
            <div className="mt-2">
              <Row label="Total" value={currency(estimateTotal(estimate))} className="text-brand-700" />
            </div>
            <div className="mt-2">
              <Row label="Est. profit" value={currency(estimateProfit(estimate))} className="text-emerald-700" />
            </div>
          </div>
        </div>

        <ProjectFiles estimate={estimate} />
      </Container>
    </>
  )
}

/** Project files: the signed PDF + certificate of completion pulled from DocuSign. */
function ProjectFiles({ estimate }: { estimate: Estimate }) {
  const { updateEstimate } = useStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const files = estimate.files ?? []

  const fetchFiles = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await fetchSignedDocuments(estimate.id)
      const mapped: SignedFile[] = res.documents.map((d) => ({
        id: `file-${d.kind}-${Date.now()}`,
        name: d.name,
        kind: d.kind,
        mime: d.mime,
        dataUrl: `data:${d.mime};base64,${d.base64}`,
        addedAt: new Date().toISOString(),
      }))
      if (mapped.length) updateEstimate(estimate.id, { files: mapped })
      else setError('No documents available yet.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not fetch documents')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="nsr-card mt-6 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900">Files</h3>
        {isDocusignConfigured() && (
          <button className="btn-secondary btn-sm" onClick={fetchFiles} disabled={loading}>
            {loading ? 'Fetching…' : files.length ? 'Refresh' : 'Fetch signed documents'}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

      {files.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          The signed proposal and certificate of completion appear here once the client signs.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">{f.name}</div>
                  <div className="text-xs text-slate-400">
                    {f.kind === 'certificate' ? 'Signature receipt' : f.kind === 'signed' ? 'Signed contract' : 'Document'}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <a className="btn-secondary btn-sm" href={f.dataUrl} target="_blank" rel="noreferrer">
                  View
                </a>
                <a className="btn-primary btn-sm" href={f.dataUrl} download={f.name}>
                  Download
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
