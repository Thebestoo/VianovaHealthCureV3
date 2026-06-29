import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { KeyProvider, useKey } from './context/KeyContext.jsx'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import NewCase from './pages/NewCase.jsx'
import CaseReview from './pages/CaseReview.jsx'
import Cases from './pages/Cases.jsx'
import Logs from './pages/Logs.jsx'
import SharedCase from './pages/SharedCase.jsx'
import Login from './pages/Login.jsx'
import Patients from './pages/Patients.jsx'
import Admin from './pages/Admin.jsx'
import CareGaps from './pages/CareGaps.jsx'
import Labs from './pages/Labs.jsx'
import Appointments from './pages/Appointments.jsx'
import Discharge from './pages/Discharge.jsx'
import Consent from './pages/Consent.jsx'
import AdverseEvents from './pages/AdverseEvents.jsx'
import PopulationHealth from './pages/PopulationHealth.jsx'
import NLPNotes from './pages/NLPNotes.jsx'
import ClinicalDecisions from './pages/ClinicalDecisions.jsx'
import SDOH from './pages/SDOH.jsx'
import ChronicDisease from './pages/ChronicDisease.jsx'
import PatientPortal from './pages/PatientPortal.jsx'
import Interoperability from './pages/Interoperability.jsx'
import AuditCompliance from './pages/AuditCompliance.jsx'
import Billing from './pages/Billing.jsx'

function ProtectedRoute({ children }) {
  const { key } = useKey()
  const location = useLocation()
  if (!key) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/share/:token" element={<SharedCase />} />
      <Route path="/login" element={<Login />} />
      <Route path="*" element={
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/cases" element={<ProtectedRoute><Cases /></ProtectedRoute>} />
            <Route path="/cases/new" element={<ProtectedRoute><NewCase /></ProtectedRoute>} />
            <Route path="/cases/:id" element={<ProtectedRoute><CaseReview /></ProtectedRoute>} />
            <Route path="/logs" element={<ProtectedRoute><Logs /></ProtectedRoute>} />
            <Route path="/patients" element={<ProtectedRoute><Patients /></ProtectedRoute>} />
            <Route path="/care-gaps" element={<ProtectedRoute><CareGaps /></ProtectedRoute>} />
            <Route path="/labs" element={<ProtectedRoute><Labs /></ProtectedRoute>} />
            <Route path="/appointments" element={<ProtectedRoute><Appointments /></ProtectedRoute>} />
            <Route path="/discharge" element={<ProtectedRoute><Discharge /></ProtectedRoute>} />
            <Route path="/consent" element={<ProtectedRoute><Consent /></ProtectedRoute>} />
            <Route path="/adverse-events" element={<ProtectedRoute><AdverseEvents /></ProtectedRoute>} />
            <Route path="/population-health" element={<ProtectedRoute><PopulationHealth /></ProtectedRoute>} />
            <Route path="/nlp-notes" element={<ProtectedRoute><NLPNotes /></ProtectedRoute>} />
            <Route path="/clinical-decisions" element={<ProtectedRoute><ClinicalDecisions /></ProtectedRoute>} />
            <Route path="/sdoh" element={<ProtectedRoute><SDOH /></ProtectedRoute>} />
            <Route path="/chronic-disease" element={<ProtectedRoute><ChronicDisease /></ProtectedRoute>} />
            <Route path="/patient-portal" element={<ProtectedRoute><PatientPortal /></ProtectedRoute>} />
            <Route path="/interoperability" element={<ProtectedRoute><Interoperability /></ProtectedRoute>} />
            <Route path="/audit-compliance" element={<ProtectedRoute><AuditCompliance /></ProtectedRoute>} />
            <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
          </Routes>
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
