import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '../data/store'
import { ProposalDocument } from '../components/ProposalDocument'
import { SignaturePad } from '../components/SignaturePad'
import { COMPANY } from '../data/company'
import { activeProvider, notifyNsrSigned } from '../lib/sign'
import { shortDate } from '../lib/format'
import type { SignatureRecord } from '../types'

/**
 * Public, tokenized signing page (no login). Renders the read-only proposal and
 * captures a typed name + drawn signature + acceptance. On submit the estimate
 * is locked and advanced to Won.
 *
 * NOTE: with the current localStorage-only data layer this resolves on the same
 * browser that created the estimate. A real cross-device public link needs the
 * signing backend (see lib/sign.ts).
 */
export function Sign() {
  const { token = '' } = useParams()
  const { getEstimateByToken, getClient, recordSignature } = useStore()
  const [name, setName] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [signatureImage, setSignatureImage] = useState('')
  const [done, setDone] = useState(false)

  const estimate = getEstimateByToken(token)

  if (!estimate) {
    return (
      <Centered>
        <h1 className="text-xl font-bold text-slate-900">Proposal link not found</h1>
        <p className="mt-2 text-slate-600">
          This signing link is invalid or has expired. Please contact {COMPANY.name} at{' '}
          {COMPANY.phone}.
        </p>
      </Centered>
    )
  }

  const client = getClient(estimate.clientId)
  const alreadySigned = Boolean(estimate.signature)
  const canSubmit = name.trim().length > 1 && accepted && !!signatureImage

  const submit = () => {
    const record: SignatureRecord = {
      signerName: name.trim(),
      signedAt: new Date().toISOString(),
      method: activeProvider(),
      signatureImage,
      accepted: true,
    }
    recordSignature(token, record)
    notifyNsrSigned(estimate, record.signerName)
    setDone(true)
  }

  return (
    <div className="paper min-h-screen bg-slate-100 py-8">
      <div className="mx-auto max-w-[8.5in] px-4">
        <ProposalDocument estimate={estimate} client={client} />

        {/* Signature panel */}
        <div className="nsr-card mx-auto mt-6 max-w-[8.5in] p-6">
          {done || alreadySigned ? (
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Proposal signed — thank you</h2>
                <p className="mt-1 text-slate-600">
                  Signed by <span className="font-semibold">{estimate.signature?.signerName ?? name}</span>
                  {estimate.signature?.signedAt && <> on {shortDate(estimate.signature.signedAt)}</>}.
                  {COMPANY.name} has been notified and will follow up.
                </p>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-slate-900">Review &amp; sign</h2>
              <p className="mt-1 text-sm text-slate-500">
                By signing you accept this proposal from {COMPANY.name}.
              </p>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="field-label">Full legal name</label>
                  <input
                    className="field"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Signature</label>
                  <SignaturePad onChange={setSignatureImage} />
                </div>
                <label className="flex items-start gap-2.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  <span>
                    I have reviewed and accept this proposal and authorize {COMPANY.name} to proceed.
                  </span>
                </label>
                <button className="btn-primary w-full" disabled={!canSubmit} onClick={submit}>
                  Sign &amp; accept
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="nsr-card max-w-md p-8 text-center">{children}</div>
    </div>
  )
}
