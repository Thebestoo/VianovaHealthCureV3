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
