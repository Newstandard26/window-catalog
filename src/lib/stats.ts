import type { Client } from '../types'

export interface ClientStats {
  active: number
  prospects: number
  total: number
}

/**
 * Task 4: the single source of truth for client/prospect counts. Both the
 * Dashboard tiles and the CRM header derive from this, so they can never drift.
 * Status is normalized (trim + lowercase) so a stray "prospect"/"Active "
 * casing/whitespace can't mis-bucket a record.
 */
export function getClientStats(clients: Client[]): ClientStats {
  let active = 0
  let prospects = 0
  for (const c of clients) {
    const status = (c.status ?? '').trim().toLowerCase()
    if (status === 'active') active++
    else if (status === 'prospect') prospects++
  }
  return { active, prospects, total: clients.length }
}
