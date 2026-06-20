import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Container } from '../components/Container'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { StatusBadge } from '../components/StatusBadge'
import { useMetrics, useStore } from '../data/store'
import { currency, estimateTotal, shortDate } from '../lib/format'
import type { ClientStatus } from '../types'

type ClientFilter = 'All' | 'Active' | 'Prospect' | 'Archived'

/**
 * Combined home view: pipeline/client stats, the full client list (search +
 * filter, Profile, New Estimate, New Client), and a recent-activity feed.
 * Merges what used to be the separate Dashboard and CRM tabs into one screen.
 */
export function Dashboard() {
  const { clients, estimates, estimatesForClient, getClient, addClient, updateClient } = useStore()
  const metrics = useMetrics()
  const navigate = useNavigate()
  const [showNew, setShowNew] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ClientFilter>('All')

  const recent = useMemo(
    () =>
      [...estimates]
        // skip empty estimates with no client and no windows.
        .filter((e) => e.clientId || e.items.length > 0)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 6),
    [estimates],
  )

  const archivedCount = useMemo(() => clients.filter((c) => c.archived).length, [clients])

  const visibleClients = useMemo(() => {
    const q = query.trim().toLowerCase()
    return clients.filter((c) => {
      // Archived filter shows only archived; every other view hides them.
      if (filter === 'Archived') {
        if (!c.archived) return false
      } else {
        if (c.archived) return false
        if (filter !== 'All' && c.status !== filter) return false
      }
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      )
    })
  }, [clients, query, filter])

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Overview — pipeline, clients, and recent activity."
        actions={
          <>
            <button className="btn-secondary" onClick={() => setShowNew(true)}>
              + New Client
            </button>
            <button className="btn-primary" onClick={() => navigate('/estimator')}>
              + New Estimate
            </button>
          </>
        }
      />

      <Container className="py-8">
        {/* Deduped stat row — each metric once, from the shared selectors. */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Pipeline Value" value={currency(metrics.pipelineValue)} accent />
          <StatCard label="Won This Month" value={currency(metrics.wonThisMonth)} />
          <StatCard label="Total Won Revenue" value={currency(metrics.wonRevenue)} accent />
          <StatCard label="Awaiting Signature" value={metrics.pendingCount} />
          <StatCard label="Active Clients" value={metrics.activeClients} />
          <StatCard label="Prospects" value={metrics.prospects} />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Clients (main column) */}
          <div className="lg:col-span-2">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-bold text-slate-900">Clients</h2>
              <div className="flex gap-2">
                <div className="w-44 sm:w-56">
                  <input
                    className="field text-sm"
                    placeholder="Search clients…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="w-32">
                  <select
                    className="field text-sm"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as ClientFilter)}
                  >
                    <option value="All">All</option>
                    <option value="Active">Active</option>
                    <option value="Prospect">Prospect</option>
                    <option value="Archived">Archived{archivedCount ? ` (${archivedCount})` : ''}</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {visibleClients.length === 0 && (
                <div className="nsr-card p-8 text-center text-slate-500">
                  {clients.length === 0 ? 'No clients yet.' : 'No clients match your search.'}
                </div>
              )}
              {visibleClients.map((client) => {
                const ests = estimatesForClient(client.id)
                const wonTotal = ests
                  .filter((e) => e.status === 'Won')
                  .reduce((s, e) => s + estimateTotal(e), 0)
                const openTotal = ests
                  .filter((e) => e.status !== 'Lost' && e.status !== 'Won')
                  .reduce((s, e) => s + estimateTotal(e), 0)

                return (
                  <div key={client.id} className="nsr-card p-5 transition-shadow hover:shadow-card-hover">
                    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
                      {/* Name + contact */}
                      <div className="min-w-[12rem] flex-1">
                        <div className="flex items-center gap-3">
                          <Link
                            to={`/clients/${client.id}`}
                            className="text-lg font-bold text-slate-900 hover:text-brand-700"
                          >
                            {client.name}
                          </Link>
                          <StatusBadge status={client.status} />
                          {client.archived && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                              Archived
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">{client.address}</div>
                        <div className="truncate text-sm text-slate-500">
                          {client.email}
                          {client.phone ? ` · ${client.phone}` : ''}
                        </div>
                      </div>

                      {/* Totals */}
                      <div className="flex items-center gap-6">
                        <Metric label="Est." value={String(ests.length)} />
                        <Metric label="Open" value={currency(openTotal)} />
                        <Metric label="Won" value={currency(wonTotal)} accent />
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Link to={`/clients/${client.id}`} className="btn-secondary btn-sm">
                          Profile
                        </Link>
                        {client.archived ? (
                          <button
                            className="btn-primary btn-sm"
                            onClick={() => updateClient(client.id, { archived: false })}
                          >
                            Restore
                          </button>
                        ) : (
                          <>
                            <button
                              className="btn-primary btn-sm"
                              onClick={() => navigate(`/estimator?clientId=${client.id}`)}
                            >
                              New Estimate
                            </button>
                            <button
                              className="btn-ghost btn-sm"
                              title="Archive this client (hides them from the list)"
                              onClick={() => updateClient(client.id, { archived: true })}
                            >
                              Archive
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent activity (sidebar) */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Recent Activity</h2>
              <Link to="/projects" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
                View all →
              </Link>
            </div>
            <div className="nsr-card divide-y divide-slate-100">
              {recent.length === 0 && (
                <div className="p-5 text-sm text-slate-500">No activity yet.</div>
              )}
              {recent.map((e) => {
                const client = getClient(e.clientId)
                return (
                  <Link
                    key={e.id}
                    to={`/estimator/${e.id}`}
                    className="block p-4 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate font-semibold text-slate-900">{e.name}</div>
                      <StatusBadge status={e.status} />
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-3 text-sm text-slate-500">
                      <span className="truncate">
                        {client?.name ?? 'Unassigned'} · {shortDate(e.updatedAt)}
                      </span>
                      <span className="shrink-0 font-semibold text-slate-700">
                        {currency(estimateTotal(e))}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </Container>

      {showNew && (
        <NewClientModal
          onClose={() => setShowNew(false)}
          onCreate={(data) => {
            addClient(data)
            setShowNew(false)
          }}
        />
      )}
    </>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div
        className={`whitespace-nowrap text-base font-semibold tabular-nums ${
          accent ? 'text-emerald-700' : 'text-slate-900'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function NewClientModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (data: {
    name: string
    status: ClientStatus
    email: string
    phone: string
    address: string
  }) => void
}) {
  const [form, setForm] = useState({
    name: '',
    status: 'Prospect' as ClientStatus,
    email: '',
    phone: '',
    address: '',
  })

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="nsr-card w-full max-w-lg p-6">
        <h3 className="text-xl font-bold text-slate-900">New Client</h3>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="field-label">Name</label>
            <input className="field" value={form.name} onChange={set('name')} placeholder="Client or property name" />
          </div>
          <div>
            <label className="field-label">Status</label>
            <select className="field" value={form.status} onChange={set('status')}>
              <option value="Prospect">Prospect</option>
              <option value="Active">Active</option>
            </select>
          </div>
          <div>
            <label className="field-label">Phone</label>
            <input className="field" value={form.phone} onChange={set('phone')} placeholder="(555) 555-0100" />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">Email</label>
            <input className="field" value={form.email} onChange={set('email')} placeholder="name@email.com" />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">Address</label>
            <input className="field" value={form.address} onChange={set('address')} placeholder="Street, City, State" />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!form.name.trim()} onClick={() => onCreate(form)}>
            Create Client
          </button>
        </div>
      </div>
    </div>
  )
}
