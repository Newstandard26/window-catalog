import { useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { Container } from '../components/Container'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useStore } from '../data/store'
import { catalogLabel, lineToCatalogInput } from '../data/catalog'
import { inferWindowStyle } from '../components/WindowDiagram'
import {
  autoEstimateName,
  currency,
  customLaborAmount,
  DEFAULT_LABOR,
  defaultHoursForType,
  estimateCalcHours,
  estimateCustomLabor,
  estimateEffectiveHours,
  estimateLaborTotal,
  estimateMaterialPrice,
  estimatePreProfit,
  estimateProfit,
  estimateSubtotal,
  estimateTax,
  estimateTotal,
  estimateWindowLabor,
  laborRate,
  laborSettings,
  lineHours,
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
import { getActiveClients } from '../lib/stats'
import {
  parseQuote,
  parsedLineToItem,
  ACCEPTED_QUOTE_TYPES,
  MAX_QUOTE_BYTES,
  type ParseResult,
  type ParsedLine,
} from '../lib/quote'
import {
  PIPELINE,
  type Client,
  type CustomLaborItem,
  type Estimate,
  type EstimateStatus,
  type LaborSettings,
  type LineKind,
  type MarginMode,
  type SignedFile,
  type WindowConstruction,
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

/** Build a window line. In the global-margin model the unit price is the
 * material price; the single job margin (applied to the whole subtotal)
 * provides the profit, so cost mirrors price. */
function makeWindowItem(
  partial: Pick<
    WindowItem,
    | 'location'
    | 'width'
    | 'height'
    | 'productId'
    | 'quantity'
    | 'unitPrice'
    | 'installType'
    | 'hrsPerWin'
  > &
    Partial<Pick<WindowItem, 'productName' | 'style' | 'grille' | 'sizeBasis' | 'sections' | 'mullType'>>,
): Omit<WindowItem, 'id'> {
  return {
    kind: 'material',
    ...partial,
    unitCost: partial.unitPrice,
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
    proposalTitle: '',
    labor: { ...DEFAULT_LABOR } as LaborSettings,
    customLabor: [] as CustomLaborItem[],
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
    proposalTitle: draft.proposalTitle,
    labor: draft.labor,
    customLabor: draft.customLabor,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const persist = (items: Omit<WindowItem, 'id'>[], customLabor = draft.customLabor) => {
    const created = addEstimate({
      name: draft.name,
      clientId: draft.clientId,
      address: draft.address,
      status: draft.status,
      taxRate: draft.taxRate,
      marginMode: draft.marginMode,
      marginPct: draft.marginPct,
      proposalTitle: draft.proposalTitle,
      labor: draft.labor,
      customLabor,
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
          onProposalTitle={(proposalTitle) => setDraft((d) => ({ ...d, proposalTitle }))}
        />
        <p className="-mt-3 mb-6 text-sm text-slate-500">
          This draft isn’t saved yet — it’s added to Projects when you add a window or click{' '}
          <span className="font-semibold text-slate-600">Save draft</span>.
        </p>
        <EstimatorBody
          estimate={view}
          onAddItem={(item) => persist([item])}
          onAddItems={(items) => persist(items)}
          onUpdateItem={() => {}}
          onRemoveItem={() => {}}
          onTaxChange={(taxRate) => setDraft((d) => ({ ...d, taxRate }))}
          onMarginChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          onLaborChange={(patch) => setDraft((d) => ({ ...d, labor: { ...d.labor, ...patch } }))}
          onAddCustomLabor={(item) =>
            persist([], [...draft.customLabor, { ...item, id: newId('lab') }])
          }
          onUpdateCustomLabor={(laborId, patch) =>
            setDraft((d) => ({
              ...d,
              customLabor: d.customLabor.map((l) => (l.id === laborId ? { ...l, ...patch } : l)),
            }))
          }
          onRemoveCustomLabor={(laborId) =>
            setDraft((d) => ({ ...d, customLabor: d.customLabor.filter((l) => l.id !== laborId) }))
          }
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
    setLaborSettings,
    addCustomLabor,
    updateCustomLabor,
    removeCustomLabor,
    sendForSignature,
    addWindowItem,
    addWindowItems,
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
          onProposalTitle={(proposalTitle) => updateEstimate(estimate.id, { proposalTitle })}
        />
        <EstimatorBody
          estimate={estimate}
          onAddItem={(item) => addWindowItem(estimate.id, item)}
          onAddItems={(items) => addWindowItems(estimate.id, items)}
          onUpdateItem={(itemId, patch) => updateWindowItem(estimate.id, itemId, patch)}
          onRemoveItem={(itemId) => removeWindowItem(estimate.id, itemId)}
          onTaxChange={(taxRate) => updateEstimate(estimate.id, { taxRate })}
          onMarginChange={(patch) => setEstimateMargin(estimate.id, patch)}
          onLaborChange={(patch) => setLaborSettings(estimate.id, patch)}
          onAddCustomLabor={(item) => addCustomLabor(estimate.id, item)}
          onUpdateCustomLabor={(laborId, patch) => updateCustomLabor(estimate.id, laborId, patch)}
          onRemoveCustomLabor={(laborId) => removeCustomLabor(estimate.id, laborId)}
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
  onProposalTitle,
}: {
  estimate: Estimate
  clients: ReturnType<typeof useStore>['clients']
  onName: (name: string) => void
  onClient: (clientId: string) => void
  onStatus: (status: EstimateStatus) => void
  onProposalTitle: (title: string) => void
}) {
  const client = clients.find((c) => c.id === estimate.clientId)
  // Only non-archived clients are selectable. If this estimate is already tied to
  // a client who was later archived, keep showing that client so its name doesn't
  // blank out — but don't offer other archived clients as new selections.
  const selectable = getActiveClients(clients)
  const pickerClients =
    client && client.archived ? [client, ...selectable] : selectable
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
            {pickerClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.archived ? ' (archived)' : ''}
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
        <div className="md:col-span-6">
          <label className="field-label">Proposal heading (shown on the exported PDF)</label>
          <input
            className="field"
            value={estimate.proposalTitle ?? ''}
            placeholder="Preliminary Window Estimate"
            onChange={(e) => onProposalTitle(e.target.value)}
          />
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

interface LaborHandlers {
  onLaborChange: (patch: Partial<LaborSettings>) => void
  onAddCustomLabor: (item: Omit<CustomLaborItem, 'id'>) => void
  onUpdateCustomLabor: (laborId: string, patch: Partial<CustomLaborItem>) => void
  onRemoveCustomLabor: (laborId: string) => void
}

function EstimatorBody({
  estimate,
  onAddItem,
  onAddItems,
  onUpdateItem,
  onRemoveItem,
  onTaxChange,
  onMarginChange,
  onLaborChange,
  onAddCustomLabor,
  onUpdateCustomLabor,
  onRemoveCustomLabor,
}: {
  estimate: Estimate
  onAddItem: (item: Omit<WindowItem, 'id'>) => void
  onAddItems: (items: Omit<WindowItem, 'id'>[]) => void
  onUpdateItem: (itemId: string, patch: Partial<WindowItem>) => void
  onRemoveItem: (itemId: string) => void
  onTaxChange: (rate: number) => void
  onMarginChange: (patch: { marginMode?: MarginMode; marginPct?: number }) => void
} & LaborHandlers) {
  const [toolsOpen, setToolsOpen] = useState(estimate.items.length === 0)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-4">
        <ProductBuilder
          estimate={estimate}
          onAdd={(item) => {
            onAddItem(item)
            setToolsOpen(false)
          }}
          onAddCustomLabor={onAddCustomLabor}
        />
        <AddItemsTools
          open={toolsOpen}
          onToggle={() => setToolsOpen((v) => !v)}
          onAddItems={(items) => {
            onAddItems(items)
            setToolsOpen(false)
          }}
        />
      </div>

      <div className="space-y-6 lg:col-span-5">
        <WindowSchedule estimate={estimate} onUpdateItem={onUpdateItem} onRemove={onRemoveItem} />
        <CustomLaborList
          estimate={estimate}
          onUpdate={onUpdateCustomLabor}
          onRemove={onRemoveCustomLabor}
        />
      </div>

      <div className="lg:col-span-3">
        <EstimateSummary
          estimate={estimate}
          onTaxChange={onTaxChange}
          onMarginChange={onMarginChange}
          onLaborChange={onLaborChange}
        />
      </div>
    </div>
  )
}

function ProductBuilder({
  estimate,
  onAdd,
  onAddCustomLabor,
}: {
  estimate: Estimate
  onAdd: (item: Omit<WindowItem, 'id'>) => void
  onAddCustomLabor: (item: Omit<CustomLaborItem, 'id'>) => void
}) {
  const [tab, setTab] = useState<LineKind>('material')

  return (
    <div className="nsr-card p-6">
      <h2 className="text-lg font-bold text-slate-900">Build a line</h2>
      <p className="mt-1 text-sm text-slate-500">
        Add windows (with install hours) or custom labor. One global margin is applied to the whole job.
      </p>

      {/* Window vs Labor */}
      <div className="mt-4 flex gap-2">
        {(['material', 'labor'] as LineKind[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-semibold ${
              tab === k ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {k === 'material' ? 'Window' : 'Custom labor'}
          </button>
        ))}
      </div>

      {tab === 'material' ? (
        <WindowForm estimate={estimate} onAdd={onAdd} />
      ) : (
        <CustomLaborForm estimate={estimate} onAdd={onAddCustomLabor} />
      )}
    </div>
  )
}

function WindowForm({
  estimate,
  onAdd,
}: {
  estimate: Estimate
  onAdd: (item: Omit<WindowItem, 'id'>) => void
}) {
  const { catalogItems } = useStore()
  const [form, setForm] = useState(() => ({
    location: '',
    width: 36,
    height: 60,
    productId: 'custom',
    productName: '' as string | undefined,
    style: undefined as WindowItem['style'],
    grille: undefined as string | null | undefined,
    sizeBasis: undefined as string | null | undefined,
    sections: undefined as WindowItem['sections'],
    mullType: undefined as WindowItem['mullType'],
    quantity: 1,
    unitPrice: 0,
    installType: 'Replacement' as WindowConstruction,
    hrsPerWin: defaultHoursForType(estimate, 'Replacement'),
  }))

  // Selecting a catalog item auto-fills cost + size + diagram spec (incl. sections).
  const onProduct = (productId: string) => {
    if (productId === 'custom') {
      setForm((f) => ({
        ...f,
        productId,
        productName: '',
        style: undefined,
        grille: undefined,
        sizeBasis: undefined,
        sections: undefined,
        mullType: undefined,
      }))
      return
    }
    const p = catalogItems.find((c) => c.id === productId)
    if (!p) return
    setForm((f) => ({
      ...f,
      productId,
      productName: catalogLabel(p),
      unitPrice: p.unitCost,
      width: p.widthIn ?? f.width,
      height: p.heightIn ?? f.height,
      style: inferWindowStyle(p.style),
      grille: p.grille,
      sizeBasis: p.sizeBasis,
      sections:
        p.sections && p.sections.length > 0
          ? p.sections.map((s) => ({
              style: inferWindowStyle(s.operation),
              handing: s.handing ?? undefined,
              width: s.widthIn ?? undefined,
              height: s.heightIn ?? undefined,
              label: s.handing ?? undefined,
            }))
          : undefined,
      mullType: p.mullType ?? undefined,
    }))
  }

  // Switching install type auto-fills the default HRS/WIN (still overridable).
  const onInstallType = (installType: WindowConstruction) =>
    setForm((f) => ({ ...f, installType, hrsPerWin: defaultHoursForType(estimate, installType) }))

  const submit = () => {
    onAdd(
      makeWindowItem({
        location: form.location.trim() || form.productName || 'New Window',
        width: form.width,
        height: form.height,
        productId: form.productId === 'custom' ? '' : form.productId,
        productName: form.productName || undefined,
        style: form.style,
        grille: form.grille,
        sizeBasis: form.sizeBasis,
        sections: form.sections,
        mullType: form.mullType,
        quantity: Math.max(1, form.quantity),
        unitPrice: form.unitPrice,
        installType: form.installType,
        hrsPerWin: form.hrsPerWin,
      }),
    )
    setForm((f) => ({ ...f, location: '', quantity: 1 }))
  }

  return (
    <div className="mt-4 space-y-4">
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
          <option value="custom">Custom / one-off</option>
          {catalogItems.map((p) => (
            <option key={p.id} value={p.id}>
              {catalogLabel(p)}
              {p.widthIn && p.heightIn ? ` · ${p.widthIn}"×${p.heightIn}"` : ''} — {currency(p.unitCost)}
            </option>
          ))}
        </select>
        {catalogItems.length === 0 && (
          <p className="mt-1 text-xs text-slate-400">
            Catalog is empty — import a vendor quote below to start filling it.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">Install type</label>
          <select
            className="field"
            value={form.installType}
            onChange={(e) => onInstallType(e.target.value as WindowConstruction)}
          >
            <option value="Replacement">Replacement</option>
            <option value="New Construction">New Construction</option>
            <option value="Sash">Sash</option>
          </select>
        </div>
        <div>
          <label className="field-label">Hrs / window</label>
          <input
            type="number"
            min={0}
            step={0.25}
            className="field"
            value={form.hrsPerWin}
            onChange={(e) => setForm((f) => ({ ...f, hrsPerWin: Math.max(0, Number(e.target.value)) }))}
          />
        </div>
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

      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5 text-sm">
        <span className="text-slate-500">
          {form.hrsPerWin}h × {form.quantity} install
        </span>
        <span className="font-bold tabular-nums text-brand-700">
          {currency(form.unitPrice * form.quantity)}
        </span>
      </div>
      <button className="btn-primary w-full" onClick={submit}>
        + Add window to schedule
      </button>
    </div>
  )
}

function CustomLaborForm({
  estimate,
  onAdd,
}: {
  estimate: Estimate
  onAdd: (item: Omit<CustomLaborItem, 'id'>) => void
}) {
  const rate = laborRate(estimate)
  const [form, setForm] = useState<Omit<CustomLaborItem, 'id'>>({
    description: '',
    mode: 'flat',
    amount: 0,
    hours: 0,
    rate,
  })
  const amount = customLaborAmount({ id: '', ...form })

  const submit = () => {
    onAdd({ ...form, description: form.description.trim() || 'Custom labor' })
    setForm((f) => ({ ...f, description: '', amount: 0, hours: 0 }))
  }

  return (
    <div className="mt-4 space-y-4">
      <div>
        <label className="field-label">Description</label>
        <input
          className="field"
          placeholder="e.g. Trim carpentry, haul-away"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>

      <div className="flex gap-2">
        {(['flat', 'hours'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setForm((f) => ({ ...f, mode: m }))}
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-semibold ${
              form.mode === m ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {m === 'flat' ? 'Flat price' : 'Hours × rate'}
          </button>
        ))}
      </div>

      {form.mode === 'flat' ? (
        <div>
          <label className="field-label">Amount</label>
          <input
            type="number"
            min={0}
            className="field"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: Math.max(0, Number(e.target.value)) }))}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Hours</label>
            <input
              type="number"
              min={0}
              step={0.25}
              className="field"
              value={form.hours}
              onChange={(e) => setForm((f) => ({ ...f, hours: Math.max(0, Number(e.target.value)) }))}
            />
          </div>
          <div>
            <label className="field-label">Rate ($/hr)</label>
            <input
              type="number"
              min={0}
              className="field"
              value={form.rate}
              onChange={(e) => setForm((f) => ({ ...f, rate: Math.max(0, Number(e.target.value)) }))}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5 text-sm">
        <span className="text-slate-500">Labor total · not taxed</span>
        <span className="font-bold tabular-nums text-brand-700">{currency(amount)}</span>
      </div>
      <button className="btn-primary w-full" onClick={submit}>
        + Add labor item
      </button>
    </div>
  )
}

function AddItemsTools({
  open,
  onToggle,
  onAddItems,
}: {
  open: boolean
  onToggle: () => void
  onAddItems: (items: Omit<WindowItem, 'id'>[]) => void
}) {
  const [importOpen, setImportOpen] = useState(false)
  const soon = [
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
          <div className="text-sm text-slate-500">Import a vendor quote to add windows automatically</div>
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
          <button
            onClick={() => setImportOpen(true)}
            className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3.5 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-500">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 16V4m0 0L8 8m4-4l4 4M5 16v2a2 2 0 002 2h10a2 2 0 002-2v-2" />
              </svg>
            </span>
            <span>
              <span className="block font-semibold text-slate-900">Import Vendor Quote</span>
              <span className="block text-sm text-slate-500">
                Drop or select a PDF/photo quote → review → add lines
              </span>
            </span>
          </button>

          {soon.map((t) => (
            <div
              key={t.label}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3.5 opacity-60"
              title="Coming soon"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-slate-500">{t.label}</span>
                <span className="block text-sm text-slate-400">{t.desc}</span>
              </span>
              <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-400">
                Coming soon
              </span>
            </div>
          ))}
        </div>
      )}
      {importOpen && (
        <ImportQuoteModal onClose={() => setImportOpen(false)} onAdd={onAddItems} />
      )}
    </div>
  )
}

interface ReviewRow {
  include: boolean
  line: ParsedLine
}

function ImportQuoteModal({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (items: Omit<WindowItem, 'id'>[]) => void
}) {
  const { upsertCatalogItems } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<'pick' | 'parsing' | 'review' | 'done'>('pick')
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<ParseResult | null>(null)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [summary, setSummary] = useState<{ windows: number; created: number; updated: number } | null>(null)

  const handleFile = async (file: File) => {
    setError('')
    if (!ACCEPTED_QUOTE_TYPES.includes(file.type)) {
      setError('Unsupported file. Upload a PDF, PNG, JPG, or WEBP.')
      return
    }
    if (file.size > MAX_QUOTE_BYTES) {
      setError('File is too large (max 20 MB).')
      return
    }
    setFileName(file.name)
    setPhase('parsing')
    try {
      const res = await parseQuote(file)
      setResult(res)
      setRows(res.lines.map((line) => ({ include: line.category !== 'accessory', line })))
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not parse the quote.')
      setPhase('pick')
    }
  }

  const patch = (i: number, p: Partial<ParsedLine>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, line: { ...r.line, ...p } } : r)))
  const toggle = (i: number) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, include: !r.include } : r)))

  const chosen = rows.filter((r) => r.include)
  const confirm = () => {
    // Add every chosen line to the estimate.
    onAdd(chosen.map((r) => parsedLineToItem(r.line)))
    // Persist windows (not accessories) into the catalog store.
    const windows = result ? chosen.filter((r) => r.line.category !== 'accessory') : []
    const counts = windows.length
      ? upsertCatalogItems(windows.map((r) => lineToCatalogInput(r.line, result!)))
      : { created: 0, updated: 0 }
    setSummary({ windows: chosen.length, created: counts.created, updated: counts.updated })
    setPhase('done')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="nsr-card flex max-h-[88vh] w-full max-w-3xl flex-col p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Import Vendor Quote</h3>
            <p className="mt-1 text-sm text-slate-500">
              Drop a PDF or photo of a vendor quote. We extract the windows and per-unit costs for review.
            </p>
          </div>
          <button className="btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {(phase === 'pick' || phase === 'parsing') && (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files?.[0]
              if (f) handleFile(f)
            }}
            className={`mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
              dragOver ? 'border-brand-500 bg-brand-500/10' : 'border-slate-300'
            }`}
          >
            {phase === 'parsing' ? (
              <>
                <div className="text-base font-semibold text-slate-900">Parsing {fileName}…</div>
                <div className="mt-1 text-sm text-slate-500">Extracting line items — this can take a few seconds.</div>
              </>
            ) : (
              <>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-slate-400">
                  <path d="M12 16V4m0 0L8 8m4-4l4 4M5 16v2a2 2 0 002 2h10a2 2 0 002-2v-2" />
                </svg>
                <div className="mt-3 text-base font-semibold text-slate-900">Drop a vendor quote PDF here</div>
                <div className="mt-1 text-sm text-slate-500">PDF, PNG, JPG, or WEBP · up to 20 MB</div>
                <button className="btn-primary btn-sm mt-4" onClick={() => fileRef.current?.click()}>
                  or browse your computer
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                    e.target.value = ''
                  }}
                />
              </>
            )}
          </div>
        )}

        {phase === 'review' && result && (
          <>
            <div className="mt-4 text-sm text-slate-500">
              {result.vendor ? `${result.vendor} ` : ''}
              {result.quoteNumber ? `quote #${result.quoteNumber} · ` : ''}
              {rows.length} line{rows.length === 1 ? '' : 's'} found — review, then add.
            </div>
            {result.truncated && (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                This quote was long enough that the extraction may have been cut off — double-check that
                every line came through, and re-import if any are missing.
              </div>
            )}
            <div className="mt-3 flex-1 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="p-2"> </th>
                    <th className="p-2">Product</th>
                    <th className="p-2">Size</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">Unit cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r, i) => {
                    const low = (r.line.confidence ?? 1) < 0.6
                    const accessory = r.line.category === 'accessory'
                    return (
                      <tr key={i} className={r.include ? '' : 'opacity-50'}>
                        <td className="p-2 align-top">
                          <input type="checkbox" checked={r.include} onChange={() => toggle(i)} />
                        </td>
                        <td className="p-2 align-top">
                          <input
                            className="field text-sm"
                            value={[r.line.brand, r.line.series, r.line.style].filter(Boolean).join(' ')}
                            onChange={(e) => patch(i, { brand: e.target.value, series: '', style: r.line.style })}
                          />
                          <div className="mt-1 flex flex-wrap gap-1 text-xs">
                            {accessory && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-400">accessory</span>
                            )}
                            {low && (
                              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-300">
                                check
                              </span>
                            )}
                            {r.line.grille && <span className="text-slate-400">{r.line.grille}</span>}
                          </div>
                        </td>
                        <td className="p-2 align-top whitespace-nowrap text-slate-600">
                          {(r.line.widthIn ?? '—') + '" × ' + (r.line.heightIn ?? '—') + '"'}
                        </td>
                        <td className="p-2 align-top">
                          <input
                            type="number"
                            min={1}
                            className="field w-16 text-right text-sm"
                            value={r.line.qty ?? 1}
                            onChange={(e) => patch(i, { qty: Number(e.target.value) })}
                          />
                        </td>
                        <td className="p-2 align-top">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="field w-24 text-right text-sm"
                            value={r.line.unitCost ?? 0}
                            onChange={(e) => patch(i, { unitCost: Number(e.target.value) })}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex items-center justify-between">
              <button className="btn-secondary" onClick={() => setPhase('pick')}>
                ← Choose another file
              </button>
              <button className="btn-primary" disabled={chosen.length === 0} onClick={confirm}>
                Add {chosen.length} line{chosen.length === 1 ? '' : 's'} to estimate
              </button>
            </div>
          </>
        )}

        {phase === 'done' && summary && (
          <div className="mt-4 flex flex-1 flex-col items-center justify-center py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <h4 className="mt-4 text-lg font-bold text-slate-900">
              Imported {summary.windows} line{summary.windows === 1 ? '' : 's'}
            </h4>
            <p className="mt-1 text-sm text-slate-500">
              {summary.created} new catalog item{summary.created === 1 ? '' : 's'}, {summary.updated} updated.
            </p>
            <div className="mt-5 flex gap-3">
              <Link to="/catalog" className="btn-secondary">
                View catalog
              </Link>
              <button className="btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
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

  const setPrice = (item: WindowItem, unitPrice: number) =>
    // Cost mirrors price in the global-margin model.
    onUpdateItem(item.id, { unitPrice, unitCost: unitPrice })

  return (
    <div className="nsr-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 p-5">
        <h2 className="text-lg font-bold text-slate-900">Window Schedule</h2>
        <span className="text-sm text-slate-500">{totalWindowCount(estimate)} windows</span>
      </div>
      <div className="divide-y divide-slate-100">
        {estimate.items.map((item) => {
          const hrs = lineHours(estimate, item)
          return (
            <div key={item.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* Header = the product descriptor; location is an editable subheader. */}
                  <div className="font-semibold text-slate-900">
                    {item.productName || 'Custom window'}
                    <span className="ml-2 text-sm font-normal text-slate-400">
                      {item.width}" × {item.height}"
                    </span>
                  </div>
                  <input
                    className="mt-1 w-full max-w-xs rounded border border-slate-300 bg-transparent px-2 py-1 text-sm text-slate-700 placeholder:text-slate-400"
                    value={item.location}
                    placeholder="Add a location (e.g. Kitchen)"
                    onChange={(e) => onUpdateItem(item.id, { location: e.target.value })}
                  />
                </div>
                <button
                  className="shrink-0 text-sm font-medium text-slate-400 hover:text-rose-600"
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
                  <label className="field-label">Unit price</label>
                  <input
                    type="number"
                    className="field"
                    value={item.unitPrice}
                    onChange={(e) => setPrice(item, Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="field-label">Install type</label>
                  <select
                    className="field"
                    value={item.installType ?? 'Replacement'}
                    onChange={(e) =>
                      onUpdateItem(item.id, {
                        installType: e.target.value as WindowConstruction,
                        hrsPerWin: defaultHoursForType(estimate, e.target.value as WindowConstruction),
                      })
                    }
                  >
                    <option value="Replacement">Replacement</option>
                    <option value="New Construction">New Construction</option>
                    <option value="Sash">Sash</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Hrs / win</label>
                  <input
                    type="number"
                    min={0}
                    step={0.25}
                    className="field"
                    value={hrs}
                    onChange={(e) => onUpdateItem(item.id, { hrsPerWin: Math.max(0, Number(e.target.value)) })}
                  />
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
                <span>
                  Install: <span className="font-semibold text-slate-700">{hrs * item.quantity}h</span>
                </span>
                <span>
                  Line total:{' '}
                  <span className="font-semibold tabular-nums text-slate-900">
                    {currency(item.unitPrice * item.quantity)}
                  </span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CustomLaborList({
  estimate,
  onUpdate,
  onRemove,
}: {
  estimate: Estimate
  onUpdate: (laborId: string, patch: Partial<CustomLaborItem>) => void
  onRemove: (laborId: string) => void
}) {
  const items = estimate.customLabor ?? []
  if (items.length === 0) return null

  return (
    <div className="nsr-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 p-5">
        <h2 className="text-lg font-bold text-slate-900">Custom Labor</h2>
        <span className="text-sm text-slate-500">{currency(estimateCustomLabor(estimate))} · untaxed</span>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((l) => (
          <div key={l.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <input
                className="field font-semibold"
                value={l.description}
                onChange={(e) => onUpdate(l.id, { description: e.target.value })}
              />
              <button
                className="shrink-0 text-sm font-medium text-slate-400 hover:text-rose-600"
                onClick={() => onRemove(l.id)}
              >
                Remove
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="flex gap-2">
                {(['flat', 'hours'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => onUpdate(l.id, { mode: m })}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                      l.mode === m ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {m === 'flat' ? 'Flat' : 'Hrs × rate'}
                  </button>
                ))}
              </div>
              {l.mode === 'flat' ? (
                <div>
                  <label className="field-label">Amount</label>
                  <input
                    type="number"
                    min={0}
                    className="field w-32"
                    value={l.amount}
                    onChange={(e) => onUpdate(l.id, { amount: Math.max(0, Number(e.target.value)) })}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="field-label">Hours</label>
                    <input
                      type="number"
                      min={0}
                      step={0.25}
                      className="field w-24"
                      value={l.hours}
                      onChange={(e) => onUpdate(l.id, { hours: Math.max(0, Number(e.target.value)) })}
                    />
                  </div>
                  <div>
                    <label className="field-label">Rate</label>
                    <input
                      type="number"
                      min={0}
                      className="field w-24"
                      value={l.rate}
                      onChange={(e) => onUpdate(l.id, { rate: Math.max(0, Number(e.target.value)) })}
                    />
                  </div>
                </>
              )}
              <div className="ml-auto text-right">
                <div className="text-sm text-slate-400">Total</div>
                <div className="text-lg font-bold tabular-nums text-slate-900">
                  {currency(customLaborAmount(l))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EstimateSummary({
  estimate,
  onTaxChange,
  onMarginChange,
  onLaborChange,
}: {
  estimate: Estimate
  onTaxChange: (rate: number) => void
  onMarginChange: (patch: { marginMode?: MarginMode; marginPct?: number }) => void
  onLaborChange: (patch: Partial<LaborSettings>) => void
}) {
  const s = laborSettings(estimate)
  const rate = laborRate(estimate)
  const materials = estimateMaterialPrice(estimate)
  const calcHrs = estimateCalcHours(estimate)
  const effHrs = estimateEffectiveHours(estimate)
  const winLabor = estimateWindowLabor(estimate)
  const customLabor = estimateCustomLabor(estimate)
  const labor = estimateLaborTotal(estimate)
  const tax = estimateTax(estimate)
  const subtotal = estimatePreProfit(estimate)
  const profit = estimateProfit(estimate)
  const total = estimateTotal(estimate)
  const taxPercent = Number((estimate.taxRate * 100).toFixed(3))
  const isMargin = estimate.marginMode === 'margin'

  return (
    <div className="nsr-card sticky top-20 p-6">
      <h2 className="text-lg font-bold text-slate-900">Estimate Summary</h2>

      {/* Labor settings */}
      <div className="mt-4 rounded-lg border border-slate-200 p-3.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">Labor settings</span>
          <span className="text-sm font-bold tabular-nums text-brand-700">{currency(rate)}/hr</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <label className="block">
            <span className="field-label">Crew size</span>
            <input
              type="number"
              min={1}
              className="field"
              value={s.crewSize}
              onChange={(e) => onLaborChange({ crewSize: Math.max(1, Number(e.target.value)) })}
            />
          </label>
          <label className="block">
            <span className="field-label">$/carpenter·hr</span>
            <input
              type="number"
              min={0}
              className="field"
              value={s.hourlyRate}
              onChange={(e) => onLaborChange({ hourlyRate: Math.max(0, Number(e.target.value)) })}
            />
          </label>
          <label className="block">
            <span className="field-label">New const. hrs</span>
            <input
              type="number"
              min={0}
              step={0.25}
              className="field"
              value={s.newConstructionHrs}
              onChange={(e) => onLaborChange({ newConstructionHrs: Math.max(0, Number(e.target.value)) })}
            />
          </label>
          <label className="block">
            <span className="field-label">Replacement hrs</span>
            <input
              type="number"
              min={0}
              step={0.25}
              className="field"
              value={s.replacementHrs}
              onChange={(e) => onLaborChange({ replacementHrs: Math.max(0, Number(e.target.value)) })}
            />
          </label>
          <label className="block">
            <span className="field-label">Sash hrs</span>
            <input
              type="number"
              min={0}
              step={0.25}
              className="field"
              value={s.sashHrs}
              onChange={(e) => onLaborChange({ sashHrs: Math.max(0, Number(e.target.value)) })}
            />
          </label>
          <label className="col-span-2 block">
            <span className="field-label">Override total hrs (optional)</span>
            <input
              type="number"
              min={0}
              step={0.25}
              placeholder={`Calc: ${calcHrs}h`}
              className="field"
              value={s.overrideHours ?? ''}
              onChange={(e) =>
                onLaborChange({ overrideHours: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })
              }
            />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded bg-slate-50 px-2.5 py-1.5">
            <span className="text-slate-500">Calc hrs</span>
            <span className="float-right font-semibold tabular-nums text-slate-700">{calcHrs}</span>
          </div>
          <div className="rounded bg-slate-50 px-2.5 py-1.5">
            <span className="text-slate-500">Effective hrs</span>
            <span className="float-right font-semibold tabular-nums text-slate-900">{effHrs}</span>
          </div>
        </div>
      </div>

      {/* Margin controls */}
      <div className="mt-4 rounded-lg border border-slate-200 p-3.5">
        <div className="flex items-center gap-2">
          <button
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-semibold ${
              isMargin ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'
            }`}
            onClick={() => onMarginChange({ marginMode: 'margin' })}
          >
            Margin
          </button>
          <button
            className={`flex-1 rounded-md px-2 py-1.5 text-sm font-semibold ${
              !isMargin ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600'
            }`}
            onClick={() => onMarginChange({ marginMode: 'markup' })}
          >
            Markup
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-slate-500">{isMargin ? 'Margin' : 'Markup'} %</span>
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

      {/* Global-margin build-up */}
      <dl className="mt-5 space-y-3 text-base">
        <Row label="Materials" value={currency(materials)} />
        <div>
          <Row label="Labor (untaxed)" value={currency(labor)} />
          <div className="mt-0.5 text-xs text-slate-400">
            {effHrs} effective hrs × {currency(rate)}/hr = {currency(winLabor)}
            {customLabor > 0 && ` + ${currency(customLabor)} custom`}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2 text-slate-500">
            Tax<span className="text-xs text-slate-400">(material)</span>
            <span className="relative">
              <input
                type="number"
                step={0.125}
                min={0}
                className="w-20 rounded border border-slate-300 bg-transparent py-1 pl-2 pr-6 text-sm text-slate-900"
                value={taxPercent}
                onChange={(e) => onTaxChange(Number(e.target.value) / 100)}
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
            </span>
          </dt>
          <dd className="font-semibold tabular-nums text-slate-900">{currency(tax)}</dd>
        </div>
        <div className="border-t border-slate-100 pt-3">
          <Row label="Subtotal" value={currency(subtotal)} />
        </div>
        <Row
          label={`${isMargin ? 'Margin' : 'Markup'} (${estimate.marginPct}%)`}
          value={currency(profit)}
          className="text-emerald-300"
        />
      </dl>

      <div className="mt-4 border-t border-slate-200 pt-4">
        <div className="flex items-baseline justify-between">
          <span className="text-base font-medium text-slate-500">Total</span>
          <span className="text-3xl font-bold tabular-nums text-brand-700">{currency(total)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-lg bg-brand-500/10 px-3.5 py-2.5">
          <span className="text-sm font-medium text-brand-500">Est. profit</span>
          <span className="text-lg font-bold tabular-nums text-brand-500">{currency(profit)}</span>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          One global {isMargin ? 'margin' : 'markup'} is applied to materials + labor + tax. Labor is
          included in the subtotal but never taxed.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
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
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</div>
      )}

      {phase === 'sent' && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm text-emerald-200">
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

      <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-200">
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
        <div className="nsr-card mb-6 flex items-start gap-3 border-emerald-500/30 bg-emerald-500/10 p-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
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
              <Row label="Est. profit" value={currency(estimateProfit(estimate))} className="text-brand-500" />
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
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/15 text-rose-300">
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
