import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { ProposalDocument } from '../components/ProposalDocument'

/**
 * Client-ready proposal. Print / "Save as PDF" produces the branded document.
 * Shows sell prices and totals only — never cost or margin.
 */
export function Proposal() {
  const { id = '' } = useParams()
  const { getEstimate, getClient } = useStore()
  const [copied, setCopied] = useState(false)

  const estimate = getEstimate(id)
  if (!estimate) {
    return (
      <div className="mx-auto max-w-content px-6 py-20 text-center">
        <p className="text-lg text-slate-600">Proposal not found.</p>
        <Link to="/projects" className="btn-secondary mt-4 inline-flex">
          Back to Projects
        </Link>
      </div>
    )
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-6 flex max-w-[8.5in] items-center justify-between px-4">
        <Link to={`/estimator/${estimate.id}`} className="btn-secondary btn-sm">
          ← Back to estimate
        </Link>
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm" onClick={copyLink}>
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <button className="btn-primary btn-sm" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
        </div>
      </div>

      <ProposalDocument estimate={estimate} client={getClient(estimate.clientId)} />
    </div>
  )
}
