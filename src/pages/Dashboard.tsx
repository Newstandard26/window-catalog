import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Container } from '../components/Container'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { StatusBadge } from '../components/StatusBadge'
import { useMetrics, useStore } from '../data/store'
import { currency, estimateTotal, shortDate } from '../lib/format'

export function Dashboard() {
  const { estimates, getClient } = useStore()
  const metrics = useMetrics()
  const navigate = useNavigate()

  const recent = useMemo(
    () =>
      [...estimates]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 6),
    [estimates],
  )

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="At-a-glance overview of pipeline, clients, and recent activity."
        actions={
          <button className="btn-primary" onClick={() => navigate('/estimator')}>
            + New Estimate
          </button>
        }
      />

      <Container className="py-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Pipeline Value"
            value={currency(metrics.pipelineValue)}
            hint="All open + won estimates"
            accent
          />
          <StatCard
            label="Won Revenue This Month"
            value={currency(metrics.wonThisMonth)}
            hint="Estimates marked Won this month"
          />
          <StatCard
            label="Awaiting Signature"
            value={metrics.pendingCount}
            hint="Sent / Pending estimates"
          />
          <StatCard label="Active Clients" value={metrics.activeClients} />
          <StatCard label="Prospects" value={metrics.prospects} />
          <StatCard
            label="Total Won Revenue"
            value={currency(metrics.wonRevenue)}
            accent
          />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recent activity */}
          <div className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Recent Activity</h2>
              <Link to="/projects" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
                View all projects →
              </Link>
            </div>
            <div className="nsr-card divide-y divide-slate-100">
              {recent.map((e) => {
                const client = getClient(e.clientId)
                return (
                  <Link
                    key={e.id}
                    to={`/estimator/${e.id}`}
                    className="flex items-center justify-between gap-4 p-5 transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">{e.name}</div>
                      <div className="mt-0.5 text-sm text-slate-500">
                        {client?.name ?? 'Unassigned'} · updated {shortDate(e.updatedAt)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <span className="font-semibold text-slate-900">
                        {currency(estimateTotal(e))}
                      </span>
                      <StatusBadge status={e.status} />
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h2 className="mb-3 text-xl font-bold text-slate-900">Jump In</h2>
            <div className="nsr-card space-y-1 p-3">
              {[
                { to: '/catalog', label: 'Browse Window Catalog', desc: 'Compare brands & energy specs' },
                { to: '/estimator', label: 'Build an Estimate', desc: 'Window schedule & live totals' },
                { to: '/crm', label: 'Open CRM', desc: 'Clients, prospects & revenue' },
                { to: '/projects', label: 'View Pipeline', desc: 'Track estimates to won' },
              ].map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="block rounded-lg p-3 transition-colors hover:bg-slate-50"
                >
                  <div className="font-semibold text-slate-900">{l.label}</div>
                  <div className="text-sm text-slate-500">{l.desc}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </>
  )
}
