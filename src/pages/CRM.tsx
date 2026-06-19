import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Container } from '../components/Container'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { StatCard } from '../components/StatCard'
import { useMetrics, useStore } from '../data/store'
import { currency, estimateTotal } from '../lib/format'
import type { ClientStatus } from '../types'

export function CRM() {
  const { clients, estimatesForClient, addClient } = useStore()
  const metrics = useMetrics()
  const navigate = useNavigate()
  const [showNew, setShowNew] = useState(false)

  return (
    <>
      <PageHeader
        title="CRM"
        subtitle="Clients, prospects, and the revenue tied to each relationship."
        actions={
          <button className="btn-primary" onClick={() => setShowNew(true)}>
            + New Client
          </button>
        }
      />

      <Container className="py-8">
        {/* Phase 5: Won Revenue rolls up from estimates marked "Won" */}
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Active Clients" value={metrics.activeClients} />
          <StatCard label="Prospects" value={metrics.prospects} />
          <StatCard label="Pipeline Value" value={currency(metrics.pipelineValue)} />
          <StatCard label="Won Revenue" value={currency(metrics.wonRevenue)} accent />
        </div>

        <h2 className="mb-3 text-xl font-bold text-slate-900">Clients</h2>
        <div className="space-y-4">
          {clients.map((client) => {
            const ests = estimatesForClient(client.id)
            const won = ests.filter((e) => e.status === 'Won')
            const wonTotal = won.reduce((s, e) => s + estimateTotal(e), 0)
            const openTotal = ests
              .filter((e) => e.status !== 'Lost' && e.status !== 'Won')
              .reduce((s, e) => s + estimateTotal(e), 0)

            return (
              <div
                key={client.id}
                className="nsr-card p-6 transition-shadow hover:shadow-card-hover"
              >
                {/* Phase 3: client info laid out across the full width in columns */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:items-center">
                  {/* Name + status */}
                  <div className="md:col-span-4">
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/crm/${client.id}`}
                        className="text-lg font-bold text-slate-900 hover:text-brand-700"
                      >
                        {client.name}
                      </Link>
                      <StatusBadge status={client.status} />
                    </div>
                    <div className="mt-1 text-sm text-slate-500">{client.address}</div>
                  </div>

                  {/* Contact */}
                  <div className="text-sm md:col-span-3">
                    <div className="text-slate-700">{client.email}</div>
                    <div className="text-slate-500">{client.phone}</div>
                  </div>

                  {/* Estimate totals */}
                  <div className="grid grid-cols-3 gap-4 md:col-span-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Estimates</div>
                      <div className="text-lg font-semibold text-slate-900">{ests.length}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Open</div>
                      <div className="text-lg font-semibold text-slate-900">{currency(openTotal)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Won</div>
                      <div className="text-lg font-semibold text-emerald-700">{currency(wonTotal)}</div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 md:col-span-2 md:justify-end">
                    <Link to={`/crm/${client.id}`} className="btn-secondary btn-sm">
                      Profile
                    </Link>
                    <button
                      className="btn-primary btn-sm"
                      onClick={() =>
                        navigate(
                          `/estimator?clientId=${client.id}`,
                        )
                      }
                    >
                      New Estimate
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
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

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
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
          <button
            className="btn-primary"
            disabled={!form.name.trim()}
            onClick={() => onCreate(form)}
          >
            Create Client
          </button>
        </div>
      </div>
    </div>
  )
}
