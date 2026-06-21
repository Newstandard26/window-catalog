import type { ClientStatus, EstimateStatus } from '../types'

// One status-badge style reused everywhere (Phase 2).
// Dark chips: translucent colored fill + bright colored text per status, so
// they read on black. Uses non-remapped color scales (emerald/sky/amber/…).
const STYLES: Record<string, string> = {
  Active: 'bg-emerald-500/15 text-emerald-300',
  Prospect: 'bg-amber-500/15 text-amber-300',
  Draft: 'bg-white/10 text-slate-400',
  Sent: 'bg-sky-500/15 text-sky-300',
  Pending: 'bg-violet-500/15 text-violet-300',
  Won: 'bg-emerald-500/15 text-emerald-300',
  Lost: 'bg-rose-500/15 text-rose-300',
}

export function StatusBadge({
  status,
  className = '',
}: {
  status: EstimateStatus | ClientStatus | string
  className?: string
}) {
  const style = STYLES[status] ?? 'bg-white/10 text-slate-400'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold ${style} ${className}`}
    >
      {status}
    </span>
  )
}
