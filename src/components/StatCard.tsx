import type { ReactNode } from 'react'

export function StatCard({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string
  value: ReactNode
  hint?: string
  accent?: boolean
}) {
  return (
    <div className="nsr-card p-5 sm:p-6">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div
        className={`mt-2 text-3xl font-bold tracking-tight ${
          accent ? 'text-brand-700' : 'text-slate-900'
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-sm text-slate-500">{hint}</div>}
    </div>
  )
}
