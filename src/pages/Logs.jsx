import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, AlertCircle, FolderOpen, Lock, ArrowRight, Stethoscope, ShieldCheck } from 'lucide-react'
import UpdatesPanel from './logs/UpdatesPanel.jsx'
import ErrorsPanel from './logs/ErrorsPanel.jsx'
import CasesPanel from './logs/CasesPanel.jsx'
import { useKey } from '../context/KeyContext.jsx'

export default function Logs() {
  const { key: apiKey, role, label, disconnect } = useKey()
  const navigate = useNavigate()
  const [tab, setTab]         = useState('overview')
  const [summary, setSummary] = useState(null)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!apiKey) navigate('/login', { replace: true })
  }, [apiKey, navigate])

  useEffect(() => {
    if (!apiKey) return
    fetch('/api/logs/summary', { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(setSummary)
      .catch(() => {})
  }, [apiKey])

  const isSuperAdmin = role === 'superadmin'

  function handleSignOut() {
    disconnect()
    navigate('/login', { replace: true })
  }

  if (!apiKey) return null

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">Logs & Analytics</span>
        <div className="topbar-right">
          {role && (
            <span className={`badge ${isSuperAdmin ? 'badge-info' : 'badge-warning'}`} style={{ marginRight: 8 }}>
              <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                {isSuperAdmin ? <ShieldCheck size={12} /> : <Stethoscope size={12} />}
                {isSuperAdmin ? 'Super Admin' : 'Doctor'}
              </span>
            </span>
          )}
          <button className="btn btn-secondary btn-sm" onClick={handleSignOut}>Sign Out</button>
        </div>
      </div>

      <>
        {/* ── Summary boxes ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, padding: '24px 32px 0' }}>
          <SummaryBox
            icon={<Activity size={20} color={isSuperAdmin ? '#0e7490' : '#94a3b8'} />}
            iconBg={isSuperAdmin ? '#e0f2fe' : '#f1f5f9'}
            label="Total Updates"
            value={isSuperAdmin ? (summary?.updates ?? '…') : null}
            locked={!isSuperAdmin}
            active={tab === 'updates'}
            onClick={() => isSuperAdmin && setTab('updates')}
          />
          <SummaryBox
            icon={<AlertCircle size={20} color={isSuperAdmin ? '#dc2626' : '#94a3b8'} />}
            iconBg={isSuperAdmin ? '#fee2e2' : '#f1f5f9'}
            label="Total Errors"
            value={isSuperAdmin ? (summary?.errors ?? '…') : null}
            locked={!isSuperAdmin}
            active={tab === 'errors'}
            onClick={() => isSuperAdmin && setTab('errors')}
          />
          <SummaryBox
            icon={<FolderOpen size={20} color="#0e7490" />}
            iconBg="#e0f2fe"
            label="Log Cases"
            value={summary?.cases ?? '…'}
            locked={false}
            active={tab === 'cases'}
            onClick={() => setTab('cases')}
            cta="Review →"
          />
        </div>

        {/* ── Tab bar ── */}
        <div style={{ padding: '20px 32px 0', display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginTop: 24 }}>
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'updates',  label: 'Updates',  adminOnly: true },
            { id: 'errors',   label: 'Errors',   adminOnly: true },
            { id: 'cases',    label: 'Cases' },
          ].map(t => {
            const locked = t.adminOnly && !isSuperAdmin
            return (
              <button key={t.id}
                onClick={() => !locked && setTab(t.id)}
                style={{
                  padding: '8px 18px', border: 'none', background: 'none', cursor: locked ? 'default' : 'pointer',
                  borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
                  color: locked ? 'var(--text3)' : tab === t.id ? 'var(--primary)' : 'var(--text2)',
                  fontWeight: tab === t.id ? 600 : 500, fontSize: 13.5,
                  display: 'flex', alignItems: 'center', gap: 5, marginBottom: -1
                }}>
                {locked && <Lock size={12} />}
                {t.label}
              </button>
            )
          })}
        </div>

        {/* ── Tab content ── */}
        <div style={{ padding: '24px 32px' }}>
          {tab === 'overview' && <OverviewTab summary={summary} isSuperAdmin={isSuperAdmin} setTab={setTab} />}
          {tab === 'updates' && isSuperAdmin  && <UpdatesPanel apiKey={apiKey} />}
          {tab === 'updates' && !isSuperAdmin && <LockedSection />}
          {tab === 'errors'  && isSuperAdmin  && <ErrorsPanel apiKey={apiKey} />}
          {tab === 'errors'  && !isSuperAdmin && <LockedSection />}
          {tab === 'cases' && <CasesPanel apiKey={apiKey} />}
        </div>
      </>
    </div>
  )
}

function SummaryBox({ icon, iconBg, label, value, locked, active, onClick, cta }) {
  return (
    <div className="card stat-card" style={{
      cursor: locked ? 'default' : 'pointer',
      border: active ? '1.5px solid var(--primary)' : '',
      transition: 'all .15s',
      position: 'relative', overflow: 'hidden'
    }} onClick={onClick}>
      {locked && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(248,250,252,.85)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(2px)', zIndex: 2, gap: 6
        }}>
          <Lock size={22} color="#94a3b8" />
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>Super Admin Only</span>
        </div>
      )}
      <div className="stat-icon" style={{ background: iconBg }}>{icon}</div>
      <div className="stat-val">{locked ? '—' : (value ?? '…')}</div>
      <div className="stat-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {label}
        {cta && !locked && <span style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 600 }}>{cta}</span>}
      </div>
    </div>
  )
}

function OverviewTab({ summary, isSuperAdmin, setTab }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isSuperAdmin ? '1fr 1fr' : '1fr', gap: 20 }}>
      {isSuperAdmin && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">System Activity</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setTab('updates')}>
              View All <ArrowRight size={13} />
            </button>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Stat label="Updates Logged" value={summary?.updates ?? '…'} color="var(--primary)" />
              <Stat label="Errors Logged"  value={summary?.errors  ?? '…'} color="var(--danger)"  />
            </div>
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Cases Summary</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setTab('cases')}>
            View All <ArrowRight size={13} />
          </button>
        </div>
        <div className="card-body">
          <Stat label="Total Cases" value={summary?.cases ?? '…'} color="var(--primary)" />
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ padding: '14px 16px', background: 'var(--surface2)', borderRadius: 8, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>{label}</div>
    </div>
  )
}

function LockedSection() {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <Lock size={36} color="#cbd5e1" style={{ margin: '0 auto 14px' }} />
      <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>Super Admin Access Only</div>
      <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 6 }}>
        This section requires a Super Admin account.
      </div>
    </div>
  )
}
