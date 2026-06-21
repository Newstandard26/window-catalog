import type { ReactNode } from 'react'
import { Container } from './Container'

/**
 * Dark slate page header (Phase 2), matching the Catalog hero. Used at the top
 * of every page so headers feel like one product.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="bg-ink-800 text-white">
      <Container className="py-8 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-1.5 text-base text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
      </Container>
    </div>
  )
}
