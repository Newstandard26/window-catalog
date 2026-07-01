import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  CatalogItem,
  Client,
  CustomLaborItem,
  Estimate,
  EstimateStatus,
  LaborSettings,
  MarginMode,
  SignatureRecord,
  SignedFile,
  WindowItem,
} from '../types'
import { SEED_CLIENTS, SEED_ESTIMATES } from './seed'
import { catalogKey, type CatalogUpsertInput } from './catalog'
import { DEFAULT_LABOR, estimateSubtotal, estimateTotal } from '../lib/format'
import { activeEstimates, getClientStats } from '../lib/stats'
import { fetchSignedDocuments, getSigningStatus, isDocusignConfigured } from '../lib/sign'
import { cloudDelete, cloudEnabled, cloudLoad, cloudUpsert } from './cloud'

const STORAGE_KEY = 'nsr-window-catalog:v1'

interface PersistShape {
  clients: Client[]
  estimates: Estimate[]
  catalogItems: CatalogItem[]
}

/**
 * Fix 1: a "junk" estimate is one with no windows, a $0 total, and no client —
 * the empty drafts the old Estimator created on open. Prune them on load so
 * existing data is cleaned up.
 */
export function isJunkEstimate(e: Estimate): boolean {
  return e.items.length === 0 && estimateSubtotal(e) === 0 && !e.clientId
}

/**
 * Backfill the labor + global-margin fields on estimates saved before this
 * model existed. Window lines gain an install type + HRS/WIN (so the labor
 * calc has inputs); any legacy per-line "labor" item is converted into a flat
 * custom-labor line; and the estimate gets default labor settings.
 */
function migrateEstimate(e: Estimate): Estimate {
  const items: WindowItem[] = []
  const customLabor: CustomLaborItem[] = [...(e.customLabor ?? [])]
  for (const raw of e.items ?? []) {
    const it: WindowItem = {
      ...raw,
      kind: raw.kind ?? 'material',
      unitCost: raw.unitCost ?? raw.unitPrice,
      unitPrice: raw.unitPrice ?? raw.unitCost ?? 0,
      priceOverridden: raw.priceOverridden ?? true,
    }
    if (it.kind === 'labor') {
      // Legacy per-line labor → a flat custom-labor line.
      customLabor.push({
        id: it.id,
        description: it.location || 'Labor',
        mode: 'flat',
        amount: (it.unitPrice ?? 0) * (it.quantity ?? 1),
        hours: 0,
        rate: DEFAULT_LABOR.crewSize * DEFAULT_LABOR.hourlyRate,
      })
      continue
    }
    const installType = it.installType ?? 'Replacement'
    items.push({
      ...it,
      installType,
      hrsPerWin:
        it.hrsPerWin ??
        (installType === 'New Construction'
          ? DEFAULT_LABOR.newConstructionHrs
          : DEFAULT_LABOR.replacementHrs),
    })
  }
  return {
    ...e,
    marginMode: e.marginMode ?? 'margin',
    marginPct: e.marginPct ?? 35,
    taxRate: e.taxRate ?? 0.0825,
    labor: { ...DEFAULT_LABOR, ...(e.labor ?? {}) },
    customLabor,
    items,
  }
}

function load(): PersistShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PersistShape
      return {
        clients: parsed.clients ?? [],
        estimates: (parsed.estimates ?? [])
          .map(migrateEstimate)
          .filter((e) => !isJunkEstimate(e)),
        catalogItems: parsed.catalogItems ?? [],
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  // The catalog starts empty — it grows from imported vendor quotes.
  return { clients: SEED_CLIENTS, estimates: SEED_ESTIMATES, catalogItems: [] }
}

const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

interface StoreValue {
  clients: Client[]
  estimates: Estimate[]
  catalogItems: CatalogItem[]
  /**
   * Upsert imported windows into the catalog (dedup by catalogKey). New ones are
   * created; existing ones update their unitCost/source and bump timesSeen.
   * Returns how many were created vs updated for the import summary.
   */
  upsertCatalogItems: (inputs: CatalogUpsertInput[]) => { created: number; updated: number }
  getClient: (id: string) => Client | undefined
  getEstimate: (id: string) => Estimate | undefined
  getEstimateByToken: (token: string) => Estimate | undefined
  estimatesForClient: (clientId: string) => Estimate[]
  addClient: (data: Omit<Client, 'id' | 'createdAt'>) => Client
  updateClient: (id: string, patch: Partial<Client>) => void
  addEstimate: (data: Omit<Estimate, 'id' | 'createdAt' | 'updatedAt'>) => Estimate
  updateEstimate: (id: string, patch: Partial<Estimate>) => void
  removeEstimate: (id: string) => void
  setEstimateStatus: (id: string, status: EstimateStatus) => void
  /** Generate a signing token + mark the estimate sent. Returns the token. */
  sendForSignature: (id: string) => string
  /** Record a completed signature, lock the estimate, advance status to Won. */
  recordSignature: (token: string, record: SignatureRecord) => void
  /**
   * Check DocuSign for an estimate; if completed, pull the signed PDF +
   * certificate, lock the estimate, attach the files, and advance to Won.
   * Returns the live status. Safe to call repeatedly (no-op once signed).
   */
  finalizeDocusign: (estimateId: string) => Promise<string>
  /** Update the single global margin mode/pct for the whole job. */
  setEstimateMargin: (id: string, patch: { marginMode?: MarginMode; marginPct?: number }) => void
  /** Patch the estimate's labor settings (crew rate, default hours, override). */
  setLaborSettings: (id: string, patch: Partial<LaborSettings>) => void
  addCustomLabor: (estimateId: string, item: Omit<CustomLaborItem, 'id'>) => void
  updateCustomLabor: (estimateId: string, laborId: string, patch: Partial<CustomLaborItem>) => void
  removeCustomLabor: (estimateId: string, laborId: string) => void
  addWindowItem: (estimateId: string, item: Omit<WindowItem, 'id'>) => void
  /** Add many window items to ONE estimate at once (used by quote import). */
  addWindowItems: (estimateId: string, items: Omit<WindowItem, 'id'>[]) => void
  updateWindowItem: (estimateId: string, itemId: string, patch: Partial<WindowItem>) => void
  removeWindowItem: (estimateId: string, itemId: string) => void
  newId: (prefix: string) => string
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  // Seed instantly from the localStorage cache so the UI never flashes empty,
  // then reconcile against Supabase (the durable source of truth) on mount.
  const initial = useMemo(load, [])
  const [clients, setClients] = useState<Client[]>(initial.clients)
  const [estimates, setEstimates] = useState<Estimate[]>(initial.estimates)
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>(initial.catalogItems)
  const [hydrated, setHydrated] = useState(false)

  // Last-synced snapshots (by object identity) so we only push what changed.
  const syncedClients = useRef(new Map<string, Client>())
  const syncedEstimates = useRef(new Map<string, Estimate>())
  const syncedCatalog = useRef(new Map<string, CatalogItem>())

  // localStorage mirror — an offline cache + backup, kept alongside the cloud.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ clients, estimates, catalogItems }))
  }, [clients, estimates, catalogItems])

  // Hydrate from Supabase once. If the cloud already has data it wins; if it's
  // empty, the current local/seed data is migrated up on the first sync.
  useEffect(() => {
    if (!cloudEnabled) {
      setHydrated(true)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const [cloudClients, cloudEstimates, cloudCatalog] = await Promise.all([
          cloudLoad<Client>('clients'),
          cloudLoad<Estimate>('estimates'),
          cloudLoad<CatalogItem>('catalog_items'),
        ])
        if (cancelled) return
        if (cloudClients.length || cloudEstimates.length || cloudCatalog.length) {
          const migrated = cloudEstimates.map(migrateEstimate).filter((e) => !isJunkEstimate(e))
          setClients(cloudClients)
          setEstimates(migrated)
          setCatalogItems(cloudCatalog)
          // Mark these as already-synced so the sync effect won't echo them back.
          syncedClients.current = new Map(cloudClients.map((c) => [c.id, c]))
          syncedEstimates.current = new Map(migrated.map((e) => [e.id, e]))
          syncedCatalog.current = new Map(cloudCatalog.map((c) => [c.id, c]))
        }
        // If the cloud is empty, leave the snapshots empty so the first sync
        // pushes the existing local/seed data up.
      } catch {
        /* offline / unreachable — keep running on the localStorage cache */
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Push client changes to the cloud (upsert changed, delete removed).
  useEffect(() => {
    if (!hydrated || !cloudEnabled) return
    const changed = clients.filter((c) => syncedClients.current.get(c.id) !== c)
    const removed = [...syncedClients.current.keys()].filter((id) => !clients.some((c) => c.id === id))
    syncedClients.current = new Map(clients.map((c) => [c.id, c]))
    if (changed.length) cloudUpsert('clients', changed.map((c) => ({ id: c.id, data: c }))).catch(() => {})
    if (removed.length) cloudDelete('clients', removed).catch(() => {})
  }, [clients, hydrated])

  // Push estimate changes to the cloud.
  useEffect(() => {
    if (!hydrated || !cloudEnabled) return
    const changed = estimates.filter((e) => syncedEstimates.current.get(e.id) !== e)
    const removed = [...syncedEstimates.current.keys()].filter((id) => !estimates.some((e) => e.id === id))
    syncedEstimates.current = new Map(estimates.map((e) => [e.id, e]))
    if (changed.length) cloudUpsert('estimates', changed.map((e) => ({ id: e.id, data: e }))).catch(() => {})
    if (removed.length) cloudDelete('estimates', removed).catch(() => {})
  }, [estimates, hydrated])

  // Push catalog changes to the cloud.
  useEffect(() => {
    if (!hydrated || !cloudEnabled) return
    const changed = catalogItems.filter((c) => syncedCatalog.current.get(c.id) !== c)
    const removed = [...syncedCatalog.current.keys()].filter((id) => !catalogItems.some((c) => c.id === id))
    syncedCatalog.current = new Map(catalogItems.map((c) => [c.id, c]))
    if (changed.length) cloudUpsert('catalog_items', changed.map((c) => ({ id: c.id, data: c }))).catch(() => {})
    if (removed.length) cloudDelete('catalog_items', removed).catch(() => {})
  }, [catalogItems, hydrated])

  const touch = (id: string, e: Estimate): Estimate =>
    e.id === id ? { ...e, updatedAt: new Date().toISOString() } : e

  const getClient = useCallback(
    (id: string) => clients.find((c) => c.id === id),
    [clients],
  )
  const getEstimate = useCallback(
    (id: string) => estimates.find((e) => e.id === id),
    [estimates],
  )
  const getEstimateByToken = useCallback(
    (token: string) => estimates.find((e) => e.signatureToken && e.signatureToken === token),
    [estimates],
  )
  const estimatesForClient = useCallback(
    (clientId: string) => estimates.filter((e) => e.clientId === clientId),
    [estimates],
  )

  const addClient: StoreValue['addClient'] = useCallback((data) => {
    const client: Client = { ...data, id: uid('c'), createdAt: new Date().toISOString() }
    setClients((prev) => [client, ...prev])
    return client
  }, [])

  const updateClient: StoreValue['updateClient'] = useCallback((id, patch) => {
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  const addEstimate: StoreValue['addEstimate'] = useCallback((data) => {
    const now = new Date().toISOString()
    const estimate: Estimate = { ...data, id: uid('e'), createdAt: now, updatedAt: now }
    setEstimates((prev) => [estimate, ...prev])
    return estimate
  }, [])

  const updateEstimate: StoreValue['updateEstimate'] = useCallback((id, patch) => {
    setEstimates((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e)),
    )
  }, [])

  const removeEstimate: StoreValue['removeEstimate'] = useCallback((id) => {
    setEstimates((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const setEstimateStatus: StoreValue['setEstimateStatus'] = useCallback((id, status) => {
    setEstimates((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status, updatedAt: new Date().toISOString() } : e)),
    )
  }, [])

  const upsertCatalogItems: StoreValue['upsertCatalogItems'] = useCallback(
    (inputs) => {
      const byKey = new Map(catalogItems.map((it) => [catalogKey(it), it]))
      const next = [...catalogItems]
      let created = 0
      let updated = 0
      for (const inp of inputs) {
        const key = catalogKey(inp)
        const existing = byKey.get(key)
        if (existing) {
          const merged: CatalogItem = {
            ...existing,
            // Latest quote wins on price + provenance; fill gaps from new data.
            unitCost: inp.unitCost,
            source: inp.source || existing.source,
            vendor: inp.vendor ?? existing.vendor,
            lastSeenQuote: inp.lastSeenQuote ?? existing.lastSeenQuote,
            material: existing.material || inp.material,
            type: existing.type ?? inp.type,
            glass: existing.glass ?? inp.glass,
            grille: existing.grille ?? inp.grille,
            sections: inp.sections ?? existing.sections,
            mullType: inp.mullType ?? existing.mullType,
            interiorColor: existing.interiorColor ?? inp.interiorColor,
            uFactor: existing.uFactor ?? inp.uFactor,
            shgc: existing.shgc ?? inp.shgc,
            stc: existing.stc ?? inp.stc,
            timesSeen: existing.timesSeen + 1,
          }
          const idx = next.findIndex((x) => x.id === existing.id)
          next[idx] = merged
          byKey.set(key, merged)
          updated++
        } else {
          const item: CatalogItem = {
            ...inp,
            id: uid('cat'),
            createdAt: new Date().toISOString(),
            timesSeen: 1,
          }
          next.unshift(item)
          byKey.set(key, item)
          created++
        }
      }
      setCatalogItems(next)
      return { created, updated }
    },
    [catalogItems],
  )

  const setEstimateMargin: StoreValue['setEstimateMargin'] = useCallback((id, patch) => {
    // Global margin: just store mode/pct — it's applied to the whole subtotal at
    // calc time, so there's nothing per-line to recompute.
    setEstimates((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              marginMode: patch.marginMode ?? e.marginMode,
              marginPct: patch.marginPct ?? e.marginPct,
              updatedAt: new Date().toISOString(),
            }
          : e,
      ),
    )
  }, [])

  const setLaborSettings: StoreValue['setLaborSettings'] = useCallback((id, patch) => {
    setEstimates((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              labor: { ...DEFAULT_LABOR, ...(e.labor ?? {}), ...patch },
              updatedAt: new Date().toISOString(),
            }
          : e,
      ),
    )
  }, [])

  const addCustomLabor: StoreValue['addCustomLabor'] = useCallback((estimateId, item) => {
    const withId: CustomLaborItem = { ...item, id: uid('lab') }
    setEstimates((prev) =>
      prev.map((e) =>
        touch(estimateId, e.id === estimateId ? { ...e, customLabor: [...(e.customLabor ?? []), withId] } : e),
      ),
    )
  }, [])

  const updateCustomLabor: StoreValue['updateCustomLabor'] = useCallback((estimateId, laborId, patch) => {
    setEstimates((prev) =>
      prev.map((e) =>
        touch(
          estimateId,
          e.id === estimateId
            ? {
                ...e,
                customLabor: (e.customLabor ?? []).map((l) => (l.id === laborId ? { ...l, ...patch } : l)),
              }
            : e,
        ),
      ),
    )
  }, [])

  const removeCustomLabor: StoreValue['removeCustomLabor'] = useCallback((estimateId, laborId) => {
    setEstimates((prev) =>
      prev.map((e) =>
        touch(
          estimateId,
          e.id === estimateId
            ? { ...e, customLabor: (e.customLabor ?? []).filter((l) => l.id !== laborId) }
            : e,
        ),
      ),
    )
  }, [])

  const sendForSignature: StoreValue['sendForSignature'] = useCallback((id) => {
    // Unguessable, scoped to one estimate.
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
    const now = new Date().toISOString()
    setEstimates((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              signatureToken: token,
              sentForSignatureAt: now,
              status: e.status === 'Draft' ? 'Sent' : e.status,
              updatedAt: now,
            }
          : e,
      ),
    )
    return token
  }, [])

  const recordSignature: StoreValue['recordSignature'] = useCallback((token, record) => {
    setEstimates((prev) =>
      prev.map((e) =>
        e.signatureToken === token && !e.signature
          ? { ...e, signature: record, status: 'Won', updatedAt: new Date().toISOString() }
          : e,
      ),
    )
  }, [])

  const finalizeDocusign: StoreValue['finalizeDocusign'] = useCallback(async (estimateId) => {
    const status = await getSigningStatus(estimateId)
    if (status.status !== 'completed') return status.status

    let signerName = status.signerName || 'Client'
    let signedAt = status.completedAt || new Date().toISOString()
    let files: SignedFile[] = []
    try {
      const res = await fetchSignedDocuments(estimateId)
      if (res.signerName) signerName = res.signerName
      if (res.signedAt) signedAt = res.signedAt
      files = res.documents.map((d) => ({
        id: uid('file'),
        name: d.name,
        kind: d.kind,
        mime: d.mime,
        dataUrl: `data:${d.mime};base64,${d.base64}`,
        addedAt: new Date().toISOString(),
      }))
    } catch {
      /* lock even if the document pull fails; files can be re-fetched later */
    }

    setEstimates((prev) =>
      prev.map((e) =>
        e.id === estimateId && !e.signature
          ? {
              ...e,
              signature: { signerName, signedAt, method: 'docusign', accepted: true },
              files: files.length ? files : e.files,
              status: 'Won',
              updatedAt: new Date().toISOString(),
            }
          : e,
      ),
    )
    return 'completed'
  }, [])

  const addWindowItem: StoreValue['addWindowItem'] = useCallback((estimateId, item) => {
    const withId: WindowItem = { ...item, id: uid('w') }
    setEstimates((prev) =>
      prev.map((e) => touch(estimateId, e.id === estimateId ? { ...e, items: [...e.items, withId] } : e)),
    )
  }, [])

  const addWindowItems: StoreValue['addWindowItems'] = useCallback((estimateId, items) => {
    if (!items.length) return
    const withIds: WindowItem[] = items.map((it) => ({ ...it, id: uid('w') }))
    setEstimates((prev) =>
      prev.map((e) => touch(estimateId, e.id === estimateId ? { ...e, items: [...e.items, ...withIds] } : e)),
    )
  }, [])

  const updateWindowItem: StoreValue['updateWindowItem'] = useCallback(
    (estimateId, itemId, patch) => {
      setEstimates((prev) =>
        prev.map((e) =>
          touch(
            estimateId,
            e.id === estimateId
              ? { ...e, items: e.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }
              : e,
          ),
        ),
      )
    },
    [],
  )

  const removeWindowItem: StoreValue['removeWindowItem'] = useCallback((estimateId, itemId) => {
    setEstimates((prev) =>
      prev.map((e) =>
        touch(estimateId, e.id === estimateId ? { ...e, items: e.items.filter((it) => it.id !== itemId) } : e),
      ),
    )
  }, [])

  const value: StoreValue = {
    clients,
    estimates,
    catalogItems,
    upsertCatalogItems,
    getClient,
    getEstimate,
    getEstimateByToken,
    estimatesForClient,
    addClient,
    updateClient,
    addEstimate,
    updateEstimate,
    removeEstimate,
    setEstimateStatus,
    sendForSignature,
    recordSignature,
    finalizeDocusign,
    setEstimateMargin,
    setLaborSettings,
    addCustomLabor,
    updateCustomLabor,
    removeCustomLabor,
    addWindowItem,
    addWindowItems,
    updateWindowItem,
    removeWindowItem,
    newId: uid,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

/**
 * Background watcher: for any estimate sent to DocuSign but not yet signed,
 * poll for completion (on mount, on a timer, and on window focus). When signed,
 * the estimate auto-locks, files attach, and it moves to Won — no manual step.
 */
export function useDocusignWatcher() {
  const { estimates, finalizeDocusign } = useStore()
  const pendingKey = estimates
    .filter((e) => e.sentForSignatureAt && !e.signature)
    .map((e) => e.id)
    .join(',')

  useEffect(() => {
    if (!isDocusignConfigured() || !pendingKey) return
    const ids = pendingKey.split(',')
    let stopped = false
    const tick = async () => {
      for (const id of ids) {
        if (stopped) break
        try {
          await finalizeDocusign(id)
        } catch {
          /* transient; retry next tick */
        }
      }
    }
    tick()
    const timer = window.setInterval(tick, 15_000)
    const onFocus = () => tick()
    window.addEventListener('focus', onFocus)
    return () => {
      stopped = true
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [pendingKey, finalizeDocusign])
}

/**
 * Phase 5 + Phase 6 derived metrics, computed from live estimate/client data.
 * Won Revenue rolls up the totals of every estimate set to "Won".
 */
export function useMetrics() {
  const { clients, estimates } = useStore()

  return useMemo(() => {
    // Estimates of archived (lost) clients drop out of every rollup, same as
    // they leave the client counts.
    const live = activeEstimates(estimates, clients)
    const won = live.filter((e) => e.status === 'Won')
    const wonRevenue = won.reduce((s, e) => s + estimateTotal(e), 0)

    const now = new Date()
    const wonThisMonth = won
      .filter((e) => {
        const d = new Date(e.updatedAt)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })
      .reduce((s, e) => s + estimateTotal(e), 0)

    // Pipeline value = everything still in play (not Lost).
    const pipelineValue = live
      .filter((e) => e.status !== 'Lost')
      .reduce((s, e) => s + estimateTotal(e), 0)

    // Task 4: client counts come from one shared selector.
    const clientStats = getClientStats(clients)

    return {
      wonRevenue,
      wonThisMonth,
      pipelineValue,
      activeClients: clientStats.active,
      prospects: clientStats.prospects,
      pendingCount: live.filter((e) => e.status === 'Pending' || e.status === 'Sent').length,
    }
  }, [clients, estimates])
}
