import type { ReactNode } from 'react'

/**
 * Phase 3: centered max-width container (~1200px) so content uses the available
 * width instead of a narrow left-aligned column.
 */
export function Container({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`mx-auto w-full max-w-content px-4 sm:px-6 lg:px-8 ${className}`}>
      {children}
    </div>
  )
}
