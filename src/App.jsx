import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { KeyProvider } from './context/KeyContext.jsx'
import Layout from './components/Layout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import NewCase from './pages/NewCase.jsx'
import CaseReview from './pages/CaseReview.jsx'
import Cases from './pages/Cases.jsx'
import Logs from './pages/Logs.jsx'
import SharedCase from './pages/SharedCase.jsx'

export default function App() {
  return (
    <KeyProvider>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/share/:token" element={<SharedCase />} />
        <Route path="*" element={
          <Layout>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/cases" element={<Cases />} />
              <Route path="/cases/new" element={<NewCase />} />
              <Route path="/cases/:id" element={<CaseReview />} />
              <Route path="/logs" element={<Logs />} />
            </Routes>
          </Layout>
        } />
      </Routes>
    </KeyProvider>
  )
}
