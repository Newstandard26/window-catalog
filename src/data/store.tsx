import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Client, Estimate, EstimateStatus, MarginMode, WindowItem } from '../types'
import { SEED_CLIENTS, SEED_ESTIMATES } from './seed'
import { deriveSellPrice, estimateSubtotal, estimateTotal } from '../lib/format'
import { getClientStats } from '../lib/stats'

const STORAGE_KEY = 'nsr-window-catalog:v1'

interface PersistShape {
  clients: Client[]
  estimates: Estimate[]
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
 * Task 1: backfill the cost/margin/labor fields on estimates saved before the
 * margin engine existed. Legacy line items get unitCost = unitPrice (0 margin)
 * and priceOverridden = true, so a later global margin change won't clobber the
 * price the user originally entered.
 */
function migrateEstimate(e: Estimate): Estimate {
  return {
    ...e,
    marginMode: e.marginMode ?? 'margin',
    marginPct: e.marginPct ?? 35,
    items: (e.items ?? []).map((it) => ({
      ...it,
      kind: it.kind ?? 'material',
      unitCost: it.unitCost ?? it.unitPrice,
      priceOverridden: it.priceOverridden ?? true,
    })),
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
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return { clients: SEED_CLIENTS, estimates: SEED_ESTIMATES }
}

const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

interface StoreValue {
  clients: Client[]
  estimates: Estimate[]
  getClient: (id: string) => Client | undefined
  getEstimate: (id: string) => Estimate | undefined
  estimatesForClient: (clientId: string) => Estimate[]
  addClient: (data: Omit<Client, 'id' | 'createdAt'>) => Client
  updateClient: (id: string, patch: Partial<Client>) => void
  addEstimate: (data: Omit<Estimate, 'id' | 'createdAt' | 'updatedAt'>) => Estimate
  updateEstimate: (id: string, patch: Partial<Estimate>) => void
  removeEstimate: (id: string) => void
  setEstimateStatus: (id: string, status: EstimateStatus) => void
  /** Update margin mode/pct and recompute every non-overridden line's sell price. */
  setEstimateMargin: (id: string, patch: { marginMode?: MarginMode; marginPct?: number }) => void
  addWindowItem: (estimateId: string, item: Omit<WindowItem, 'id'>) => void
  updateWindowItem: (estimateId: string, itemId: string, patch: Partial<WindowItem>) => void
  removeWindowItem: (estimateId: string, itemId: string) => void
  newId: (prefix: string) => string
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(load, [])
  const [clients, setClients] = useState<Client[]>(initial.clients)
  const [estimates, setEstimates] = useState<Estimate[]>(initial.estimates)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ clients, estimates }))
  }, [clients, estimates])

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

  const setEstimateMargin: StoreValue['setEstimateMargin'] = useCallback((id, patch) => {
    setEstimates((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e
        const marginMode: MarginMode = patch.marginMode ?? e.marginMode
        const marginPct = patch.marginPct ?? e.marginPct
        // Recompute sell prices for every line that hasn't been hand-overridden.
        const items = e.items.map((it) =>
          it.priceOverridden
            ? it
            : { ...it, unitPrice: deriveSellPrice(it.unitCost ?? 0, marginMode, marginPct) },
        )
        return { ...e, marginMode, marginPct, items, updatedAt: new Date().toISOString() }
      }),
    )
  }, [])

  const addWindowItem: StoreValue['addWindowItem'] = useCallback((estimateId, item) => {
    const withId: WindowItem = { ...item, id: uid('w') }
    setEstimates((prev) =>
      prev.map((e) => touch(estimateId, e.id === estimateId ? { ...e, items: [...e.items, withId] } : e)),
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
    getClient,
    getEstimate,
    estimatesForClient,
    addClient,
    updateClient,
    addEstimate,
    updateEstimate,
    removeEstimate,
    setEstimateStatus,
    setEstimateMargin,
    addWindowItem,
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
 * Phase 5 + Phase 6 derived metrics, computed from live estimate/client data.
 * Won Revenue rolls up the totals of every estimate set to "Won".
 */
export function useMetrics() {
  const { clients, estimates } = useStore()

  return useMemo(() => {
    const won = estimates.filter((e) => e.status === 'Won')
    const wonRevenue = won.reduce((s, e) => s + estimateTotal(e), 0)

    const now = new Date()
    const wonThisMonth = won
      .filter((e) => {
        const d = new Date(e.updatedAt)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })
      .reduce((s, e) => s + estimateTotal(e), 0)

    // Pipeline value = everything still in play (not Lost).
    const pipelineValue = estimates
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
      pendingCount: estimates.filter((e) => e.status === 'Pending' || e.status === 'Sent').length,
    }
  }, [clients, estimates])
}
