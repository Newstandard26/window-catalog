import type { Client, Estimate } from '../types'

export interface ClientStats {
  active: number
  prospects: number
  total: number
}

/**
 * The single source of truth for "active" (non-archived) clients. Every place
 * that offers clients for selection (Estimator picker) or lists them by default
 * (Dashboard) filters through this, so archived clients can't leak back in.
 */
export function getActiveClients(clients: Client[]): Client[] {
  return clients.filter((c) => !c.archived)
}

/**
 * Estimates that belong to a non-archived client (or to no client). Archiving a
 * client treats it as lost, so its estimates drop out of the pipeline value,
 * won revenue, and the Projects list — mirroring how archived clients leave the
 * client counts. Their estimates are still visible on the client's own profile.
 */
export function activeEstimates(estimates: Estimate[], clients: Client[]): Estimate[] {
  const archived = new Set(clients.filter((c) => c.archived).map((c) => c.id))
  return estimates.filter((e) => !e.clientId || !archived.has(e.clientId))
}

/**
 * Task 4: the single source of truth for client/prospect counts. The Dashboard
 * stat tiles derive from this, so the numbers can never drift.
 * Status is normalized (trim + lowercase) so a stray "prospect"/"Active "
 * casing/whitespace can't mis-bucket a record.
 */
export function getClientStats(clients: Client[]): ClientStats {
  let active = 0
  let prospects = 0
  let total = 0
  for (const c of clients) {
    // Archived (lost) clients don't count toward active/prospect totals.
    if (c.archived) continue
    total++
    const status = (c.status ?? '').trim().toLowerCase()
    if (status === 'active') active++
    else if (status === 'prospect') prospects++
  }
  return { active, prospects, total }
}
