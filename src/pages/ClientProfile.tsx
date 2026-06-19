import { Link, useNavigate, useParams } from 'react-router-dom'
import { Container } from '../components/Container'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useStore } from '../data/store'
import { currency, estimateTotal, shortDate, totalWindowCount } from '../lib/format'

export function ClientProfile() {
  const { clientId = '' } = useParams()
  const { getClient, estimatesForClient } = useStore()
  const navigate = useNavigate()

  const client = getClient(clientId)
  if (!client) {
    return (
      <Container className="py-16 text-center">
        <p className="text-lg text-slate-600">Client not found.</p>
        <Link to="/crm" className="btn-secondary mt-4 inline-flex">
          Back to CRM
        </Link>
      </Container>
    )
  }

  const ests = estimatesForClient(client.id)
  const wonTotal = ests
    .filter((e) => e.status === 'Won')
    .reduce((s, e) => s + estimateTotal(e), 0)

  return (
    <>
      <PageHeader
        title={client.name}
        subtitle={client.address}
        actions={
          <>
            <Link to="/crm" className="btn-secondary">
              ← All Clients
            </Link>
            {/* Phase 5: opens the Estimator with client name, address & contact pre-filled */}
            <button
              className="btn-primary"
              onClick={() => navigate(`/estimator?clientId=${client.id}`)}
            >
              + New Estimate
            </button>
          </>
        }
      />

      <Container className="py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Contact card */}
          <div className="nsr-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Contact</h2>
              <StatusBadge status={client.status} />
            </div>
            <dl className="mt-4 space-y-3 text-base">
              <div>
                <dt className="text-sm text-slate-400">Email</dt>
                <dd className="text-slate-800">{client.email || '—'}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-400">Phone</dt>
                <dd className="text-slate-800">{client.phone || '—'}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-400">Address</dt>
                <dd className="text-slate-800">{client.address || '—'}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-400">Client since</dt>
                <dd className="text-slate-800">{shortDate(client.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-sm text-slate-400">Won revenue</dt>
                <dd className="text-lg font-bold text-emerald-700">{currency(wonTotal)}</dd>
              </div>
            </dl>
          </div>

          {/* Estimates */}
          <div className="lg:col-span-2">
            <h2 className="mb-3 text-lg font-bold text-slate-900">
              Estimates ({ests.length})
            </h2>
            <div className="space-y-3">
              {ests.length === 0 && (
                <div className="nsr-card p-8 text-center text-slate-500">
                  No estimates yet for this client.
                </div>
              )}
              {ests.map((e) => (
                <Link
                  key={e.id}
                  to={`/estimator/${e.id}`}
                  className="nsr-card flex items-center justify-between p-5 transition-shadow hover:shadow-card-hover"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{e.name}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {totalWindowCount(e)} windows · created {shortDate(e.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-lg font-bold text-slate-900">
                      {currency(estimateTotal(e))}
                    </span>
                    <StatusBadge status={e.status} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </>
  )
}
