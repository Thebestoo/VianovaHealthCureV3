import React, { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { KeyProvider, useKey } from './context/KeyContext.jsx'
import Layout from './components/Layout.jsx'

// Eagerly load Login and SharedCase (no auth, instant nav)
import Login from './pages/Login.jsx'
import SharedCase from './pages/SharedCase.jsx'

// Lazy-load all protected pages → each becomes its own chunk
const Dashboard        = lazy(() => import('./pages/Dashboard.jsx'))
const NewCase          = lazy(() => import('./pages/NewCase.jsx'))
const CaseReview       = lazy(() => import('./pages/CaseReview.jsx'))
const Cases            = lazy(() => import('./pages/Cases.jsx'))
const Logs             = lazy(() => import('./pages/Logs.jsx'))
const Patients         = lazy(() => import('./pages/Patients.jsx'))
const Admin            = lazy(() => import('./pages/Admin.jsx'))
const CareGaps         = lazy(() => import('./pages/CareGaps.jsx'))
const Labs             = lazy(() => import('./pages/Labs.jsx'))
const Appointments     = lazy(() => import('./pages/Appointments.jsx'))
const Discharge        = lazy(() => import('./pages/Discharge.jsx'))
const Consent          = lazy(() => import('./pages/Consent.jsx'))
const AdverseEvents    = lazy(() => import('./pages/AdverseEvents.jsx'))
const PopulationHealth = lazy(() => import('./pages/PopulationHealth.jsx'))
const NLPNotes         = lazy(() => import('./pages/NLPNotes.jsx'))
const ClinicalDecisions= lazy(() => import('./pages/ClinicalDecisions.jsx'))
const SDOH             = lazy(() => import('./pages/SDOH.jsx'))
const ChronicDisease   = lazy(() => import('./pages/ChronicDisease.jsx'))
const Interoperability = lazy(() => import('./pages/Interoperability.jsx'))
const AuditCompliance  = lazy(() => import('./pages/AuditCompliance.jsx'))
const Billing          = lazy(() => import('./pages/Billing.jsx'))

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#9ca3af', fontSize: 14, gap: 10 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      Loading…
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { key } = useKey()
  const location = useLocation()
  if (!key) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function P({ component: C }) {
  return <ProtectedRoute><C /></ProtectedRoute>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/share/:token" element={<SharedCase />} />
      <Route path="/login" element={<Login />} />
      <Route path="*" element={
        <Layout>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard"        element={<P component={Dashboard} />} />
              <Route path="/cases"            element={<P component={Cases} />} />
              <Route path="/cases/new"        element={<P component={NewCase} />} />
              <Route path="/cases/:id"        element={<P component={CaseReview} />} />
              <Route path="/logs"             element={<P component={Logs} />} />
              <Route path="/patients"         element={<P component={Patients} />} />
              <Route path="/care-gaps"        element={<P component={CareGaps} />} />
              <Route path="/labs"             element={<P component={Labs} />} />
              <Route path="/appointments"     element={<P component={Appointments} />} />
              <Route path="/discharge"        element={<P component={Discharge} />} />
              <Route path="/consent"          element={<P component={Consent} />} />
              <Route path="/adverse-events"   element={<P component={AdverseEvents} />} />
              <Route path="/population-health" element={<P component={PopulationHealth} />} />
              <Route path="/nlp-notes"        element={<P component={NLPNotes} />} />
              <Route path="/clinical-decisions" element={<P component={ClinicalDecisions} />} />
              <Route path="/sdoh"             element={<P component={SDOH} />} />
              <Route path="/chronic-disease"  element={<P component={ChronicDisease} />} />
              <Route path="/interoperability" element={<P component={Interoperability} />} />
              <Route path="/audit-compliance" element={<P component={AuditCompliance} />} />
              <Route path="/billing"          element={<P component={Billing} />} />
              <Route path="/admin"            element={<P component={Admin} />} />
            </Routes>
          </Suspense>
        </Layout>
      } />
    </Routes>
  )
}

export default function App() {
  return (
    <KeyProvider>
      <Toaster position="top-right" />
      <AppRoutes />
    </KeyProvider>
  )
}
