import type { ClientStatus, EstimateStatus } from '../types'

// One status-badge style reused everywhere (Phase 2).
const STYLES: Record<string, string> = {
  Active: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  Prospect: 'bg-amber-100 text-amber-700 ring-amber-200',
  Draft: 'bg-slate-100 text-slate-600 ring-slate-200',
  Sent: 'bg-sky-100 text-sky-700 ring-sky-200',
  Pending: 'bg-violet-100 text-violet-700 ring-violet-200',
  Won: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  Lost: 'bg-rose-100 text-rose-700 ring-rose-200',
}

export function StatusBadge({
  status,
  className = '',
}: {
  status: EstimateStatus | ClientStatus | string
  className?: string
}) {
  const style = STYLES[status] ?? 'bg-slate-100 text-slate-600 ring-slate-200'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ring-inset ${style} ${className}`}
    >
      {status}
    </span>
  )
}
