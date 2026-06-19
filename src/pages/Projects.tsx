import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Container } from '../components/Container'
import { PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { useStore } from '../data/store'
import { currency, estimateTotal, shortDate, totalWindowCount } from '../lib/format'
import { PIPELINE, type EstimateStatus } from '../types'

export function Projects() {
  const { estimates, getClient, setEstimateStatus } = useStore()

  // Phase 5: the pipeline counts/totals come straight from each estimate's status.
  const byStage = useMemo(() => {
    const map: Record<EstimateStatus, number> = {
      Draft: 0,
      Sent: 0,
      Pending: 0,
      Won: 0,
      Lost: 0,
    }
    for (const e of estimates) map[e.status] += estimateTotal(e)
    return map
  }, [estimates])

  const ordered = useMemo(
    () =>
      [...estimates].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [estimates],
  )

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Every estimate, tracked through the pipeline from draft to won."
      />

      <Container className="py-8">
        {/* Pipeline summary */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {PIPELINE.map((stage) => {
            const count = estimates.filter((e) => e.status === stage).length
            return (
              <div key={stage} className="nsr-card p-5">
                <StatusBadge status={stage} />
                <div className="mt-3 text-2xl font-bold text-slate-900">{count}</div>
                <div className="text-sm text-slate-500">{currency(byStage[stage])}</div>
              </div>
            )
          })}
        </div>

        {/* Project rows */}
        <h2 className="mb-3 text-xl font-bold text-slate-900">All Estimates</h2>
        <div className="space-y-3">
          {ordered.map((e) => {
            const client = getClient(e.clientId)
            return (
              <div
                key={e.id}
                className="nsr-card p-5 transition-shadow hover:shadow-card-hover"
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-center">
                  <div className="md:col-span-5">
                    <Link
                      to={`/estimator/${e.id}`}
                      className="font-semibold text-slate-900 hover:text-brand-700"
                    >
                      {e.name}
                    </Link>
                    <div className="mt-1 text-sm text-slate-500">
                      {client ? (
                        <Link to={`/crm/${client.id}`} className="hover:text-brand-700">
                          {client.name}
                        </Link>
                      ) : (
                        'Unassigned'
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-slate-600 md:col-span-2">
                    {totalWindowCount(e)} windows
                    <div className="text-slate-400">updated {shortDate(e.updatedAt)}</div>
                  </div>
                  <div className="text-lg font-bold text-slate-900 md:col-span-2">
                    {currency(estimateTotal(e))}
                  </div>
                  <div className="md:col-span-3 md:flex md:justify-end">
                    {/* Set the real status — drives Projects + CRM Won Revenue */}
                    <select
                      className="field max-w-[10rem]"
                      value={e.status}
                      onChange={(ev) =>
                        setEstimateStatus(e.id, ev.target.value as EstimateStatus)
                      }
                    >
                      {PIPELINE.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Container>
    </>
  )
}
