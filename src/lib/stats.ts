import type { Client } from '../types'

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
