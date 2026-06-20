import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import { TopNav } from './components/TopNav'
import { useDocusignWatcher } from './data/store'
import { Dashboard } from './pages/Dashboard'
import { Catalog } from './pages/Catalog'
import { Estimator } from './pages/Estimator'
import { Projects } from './pages/Projects'
import { ClientProfile } from './pages/ClientProfile'
import { Proposal } from './pages/Proposal'
import { Sign } from './pages/Sign'

// Old CRM client deep-links (/crm/:id) now live under /clients/:id.
function CrmClientRedirect() {
  const { clientId } = useParams()
  return <Navigate to={`/clients/${clientId}`} replace />
}

// The proposal/print and public signing pages render standalone (no app chrome).
export default function App() {
  const { pathname } = useLocation()
  if (pathname.startsWith('/proposal/') || pathname.startsWith('/sign/')) {
    return (
      <Routes>
        <Route path="/proposal/:id" element={<Proposal />} />
        <Route path="/sign/:token" element={<Sign />} />
      </Routes>
    )
  }
  return <Shell />
}

// Phase 1: every page renders inside the same shell with the same header.
function Shell() {
  useDocusignWatcher()
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <main className="flex-1 pb-16">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/estimator" element={<Estimator />} />
          <Route path="/estimator/:id" element={<Estimator />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/clients/:clientId" element={<ClientProfile />} />
          {/* Back-compat: CRM merged into Dashboard; keep old links alive. */}
          <Route path="/crm" element={<Navigate to="/" replace />} />
          <Route path="/crm/:clientId" element={<CrmClientRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-content px-4 py-6 text-sm text-slate-500 sm:px-6 lg:px-8">
          © {new Date().getFullYear()} New Standard Restoration LLC — Window Catalog
        </div>
      </footer>
    </div>
  )
}
