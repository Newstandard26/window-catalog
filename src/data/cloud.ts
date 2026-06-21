/**
 * Durable persistence via Supabase (PostgREST), replacing localStorage as the
 * source of truth. Clients and estimates are stored as JSONB documents keyed by
 * id, so the app's domain objects round-trip unchanged.
 *
 * Talks to the REST API directly with `fetch` (no SDK dependency). The URL and
 * publishable key are public config — never secrets.
 *
 * SECURITY: the table policies are permissive (no auth yet), so anyone with the
 * public key can read/write. Acceptable for a single-tenant internal tool;
 * add Supabase Auth to scope per-user before this holds sensitive data.
 */

const URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? 'https://qpjswujpidkirshwirfw.supabase.co'
const KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  'sb_publishable_qIVoBbkgL9YO7MYnDjH5cQ_BaRtg7tD'

export const cloudEnabled = Boolean(URL && KEY)

const REST = `${URL}/rest/v1`
const baseHeaders: Record<string, string> = {
  apikey: KEY,
  authorization: `Bearer ${KEY}`,
  'content-type': 'application/json',
}

export type CloudTable = 'clients' | 'estimates' | 'catalog_items'

/** Load every row's `data` document from a table. */
export async function cloudLoad<T>(table: CloudTable): Promise<T[]> {
  const res = await fetch(`${REST}/${table}?select=data`, { headers: baseHeaders })
  if (!res.ok) throw new Error(`cloud load ${table}: ${res.status}`)
  const rows = (await res.json()) as { data: T }[]
  return rows.map((r) => r.data)
}

/** Insert-or-update documents (keyed by id). Fire-and-forget friendly. */
export async function cloudUpsert(
  table: CloudTable,
  rows: { id: string; data: unknown }[],
): Promise<void> {
  if (!rows.length) return
  const res = await fetch(`${REST}/${table}`, {
    method: 'POST',
    headers: { ...baseHeaders, prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows.map((r) => ({ id: r.id, data: r.data, updated_at: new Date().toISOString() }))),
  })
  if (!res.ok) throw new Error(`cloud upsert ${table}: ${res.status}`)
}

/** Delete documents by id. */
export async function cloudDelete(table: CloudTable, ids: string[]): Promise<void> {
  if (!ids.length) return
  const list = ids.map((id) => `"${id}"`).join(',')
  const res = await fetch(`${REST}/${table}?id=in.(${encodeURIComponent(list)})`, {
    method: 'DELETE',
    headers: { ...baseHeaders, prefer: 'return=minimal' },
  })
  if (!res.ok) throw new Error(`cloud delete ${table}: ${res.status}`)
}
