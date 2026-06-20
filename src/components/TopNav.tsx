import { useState } from 'react'
import { NavLink } from 'react-router-dom'

// Phase 1: one persistent top navigation bar used on every screen.
const TABS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/catalog', label: 'Catalog' },
  { to: '/estimator', label: 'Estimator' },
  { to: '/projects', label: 'Projects' },
]

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 font-bold text-white shadow-sm">
        NS
      </div>
      <span className="text-lg font-semibold tracking-tight text-white">
        NSR <span className="font-normal text-slate-300">Window Catalog</span>
      </span>
    </div>
  )
}

export function TopNav() {
  const [open, setOpen] = useState(false)

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
      isActive
        ? 'bg-white/10 text-white ring-1 ring-inset ring-white/15'
        : 'text-slate-300 hover:bg-white/5 hover:text-white',
    ].join(' ')

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink-900">
      <div className="mx-auto flex h-16 w-full max-w-content items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo />

        {/* Center tabs — same four links, same order, on every page */}
        <nav className="hidden items-center gap-1 md:flex">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={linkClass}>
              {t.label}
            </NavLink>
          ))}
        </nav>

        {/* Far right: company name */}
        <div className="hidden text-right text-sm font-medium text-slate-300 lg:block">
          New Standard Restoration LLC
        </div>

        {/* Mobile toggle (Phase 7) */}
        <button
          className="inline-flex items-center rounded-lg p-2 text-slate-300 hover:bg-white/10 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav className="flex flex-col gap-1 border-t border-white/10 px-4 pb-4 pt-2 md:hidden">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={linkClass}
              onClick={() => setOpen(false)}
            >
              {t.label}
            </NavLink>
          ))}
          <div className="px-3.5 pt-2 text-sm text-slate-400">New Standard Restoration LLC</div>
        </nav>
      )}
    </header>
  )
}
