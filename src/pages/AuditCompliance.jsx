import React, { useState, useEffect } from 'react'
import { ClipboardCheck, RefreshCw, AlertTriangle, CheckCircle, XCircle, Loader2, ShieldCheck, Eye, ChevronDown, ChevronUp } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const ACTION_COLORS = {
  read: '#2563eb', write: '#059669', delete: '#dc2626',
  consent: '#7c3aed', export: '#d97706', login: '#0891b2'
}

function actionColor(action = '') {
  const a = action.toLowerCase()
  for (const [k, v] of Object.entries(ACTION_COLORS)) {
    if (a.includes(k)) return v
  }
  return '#6b7280'
}

function StatusIcon({ status }) {
  if (status === 'pass') return <CheckCircle size={16} color="#059669" />
  if (status === 'fail') return <XCircle size={16} color="#dc2626" />
  return <AlertTriangle size={16} color="#d97706" />
}

export default function AuditCompliance() {
  const { key } = useKey()
  const [tab, setTab] = useState('report')
  const [report, setReport] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [auditEvents, setAuditEvents] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [days, setDays] = useState('30')
  const [showAiPanel, setShowAiPanel] = useState(false)

  useEffect(() => { if (key) { loadReport(); loadAuditLog() } }, [key])
  useEffect(() => { if (key) loadAuditLog() }, [days])

  async function loadReport() {
    setReportLoading(true)
    try {
      const r = await fetch('/api/compliance/report', { headers: { 'x-api-key': key } })
      setReport(await r.json())
    } catch {}
    setReportLoading(false)
  }

  async function loadAuditLog() {
    setAuditLoading(true)
    try {
      const r = await fetch(`/api/compliance/audit-log?days=${days}`, { headers: { 'x-api-key': key } })
      setAuditEvents(await r.json())
    } catch {}
    setAuditLoading(false)
  }

  async function runAiAnalysis() {
    setAiLoading(true)
    try {
      const r = await fetch('/api/compliance/analyze-audit', { method: 'POST', headers: { 'x-api-key': key } })
      setAiAnalysis(await r.json())
      setShowAiPanel(true)
    } catch {}
    setAiLoading(false)
  }

  const score = report?.metrics ? (() => {
    const checks = report.compliance_checks || []
    const passed = checks.filter(c => c.status === 'pass').length
    return checks.length ? Math.round((passed / checks.length) * 100) : 0
  })() : null

  const scoreColor = score === null ? '#9ca3af' : score >= 80 ? '#059669' : score >= 60 ? '#d97706' : '#dc2626'

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">Audit & Compliance</span>
        <button className="btn btn-secondary btn-sm" onClick={() => { loadReport(); loadAuditLog() }}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: '0 32px', display: 'flex', gap: 0 }}>
        {[['report', 'Compliance Report'], ['audit', 'Audit Log']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            padding: '12px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: tab === id ? 700 : 500,
            color: tab === id ? 'var(--primary)' : 'var(--text2)',
            borderBottom: tab === id ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: -1
          }}>{label}</button>
        ))}
      </div>

      <div style={{ padding: '24px 32px' }}>

        {/* COMPLIANCE REPORT TAB */}
        {tab === 'report' && (
          reportLoading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Loader2 size={28} color="var(--primary)" style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 12px' }} />
            </div>
          ) : report ? (
            <>
              {/* Score + Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, marginBottom: 28, alignItems: 'start' }}>
                {/* Score circle */}
                <div style={{ textAlign: 'center', padding: '24px 32px', background: '#fff', border: '1px solid var(--border)', borderRadius: 14 }}>
                  <div style={{ fontSize: 56, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{score}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>Compliance Score</div>
                  <div style={{ marginTop: 10, padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: score >= 80 ? '#d1fae5' : score >= 60 ? '#fef3c7' : '#fee2e2', color: scoreColor, display: 'inline-block' }}>
                    {score >= 80 ? 'GOOD' : score >= 60 ? 'REVIEW NEEDED' : 'ACTION REQUIRED'}
                  </div>
                </div>
                {/* Metrics grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                  {[
                    { label: 'Patients', value: report.metrics.patients, color: '#2563eb' },
                    { label: 'Active Consents', value: report.metrics.active_consents, color: '#059669' },
                    { label: 'Expired Consents', value: report.metrics.expired_consents, color: report.metrics.expired_consents > 0 ? '#dc2626' : '#9ca3af' },
                    { label: 'Audit Events (7d)', value: report.metrics.audit_events_7d, color: '#7c3aed' },
                    { label: 'Open Adverse Events', value: report.metrics.open_adverse_events, color: report.metrics.open_adverse_events > 0 ? '#d97706' : '#9ca3af' },
                    { label: 'Open Care Gaps', value: report.metrics.open_care_gaps, color: '#0891b2' },
                  ].map(m => (
                    <div key={m.label} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px' }}>
                      <div style={{ fontSize: 34, fontWeight: 800, color: m.color, lineHeight: 1.1 }}>{m.value}</div>
                      <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600, marginTop: 5 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Compliance checks */}
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>Compliance Checklist</div>
                {(report.compliance_checks || []).map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: i < report.compliance_checks.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <StatusIcon status={c.status} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.check}</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{c.detail}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: c.status === 'pass' ? '#d1fae5' : c.status === 'fail' ? '#fee2e2' : '#fef3c7', color: c.status === 'pass' ? '#059669' : c.status === 'fail' ? '#dc2626' : '#d97706' }}>
                      {c.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)' }}>
              <ShieldCheck size={40} style={{ display: 'block', margin: '0 auto 12px', opacity: .3 }} />
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>No report loaded</div>
              <button className="btn btn-primary btn-sm" onClick={loadReport}>Load Report</button>
            </div>
          )
        )}

        {/* AUDIT LOG TAB */}
        {tab === 'audit' && (
          <>
            {/* Controls */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={days} onChange={e => setDays(e.target.value)} style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, outline: 'none' }}>
                {[['7','Last 7 days'],['14','Last 14 days'],['30','Last 30 days'],['90','Last 90 days']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" onClick={runAiAnalysis} disabled={aiLoading}>
                {aiLoading ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing…</> : <><Eye size={13} /> AI Analysis</>}
              </button>
              <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 'auto' }}>{auditEvents.length} events</span>
            </div>

            {/* AI Analysis panel */}
            {aiAnalysis && (
              <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <button onClick={() => setShowAiPanel(o => !o)} style={{ width: '100%', padding: '12px 16px', background: '#f8fafc', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={15} color="var(--primary)" />
                    <span style={{ fontWeight: 700, fontSize: 13 }}>AI Analysis — {aiAnalysis.event_count} events, {aiAnalysis.period_days} days</span>
                    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: aiAnalysis.risk_level === 'low' ? '#d1fae5' : aiAnalysis.risk_level === 'medium' ? '#fef3c7' : '#fee2e2', color: aiAnalysis.risk_level === 'low' ? '#059669' : aiAnalysis.risk_level === 'medium' ? '#d97706' : '#dc2626' }}>
                      {aiAnalysis.risk_level?.toUpperCase()} RISK
                    </span>
                  </div>
                  {showAiPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showAiPanel && (
                  <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 13, color: '#374151', marginBottom: 12 }}>{aiAnalysis.summary}</div>
                    {aiAnalysis.anomalies?.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 8 }}>Anomalies</div>
                        {aiAnalysis.anomalies.map((a, i) => (
                          <div key={i} style={{ padding: '8px 12px', borderRadius: 8, background: a.severity === 'high' ? '#fee2e2' : a.severity === 'medium' ? '#fef3c7' : '#f3f4f6', marginBottom: 6, fontSize: 13 }}>
                            <span style={{ fontWeight: 700 }}>{a.type}</span>: {a.description}
                          </div>
                        ))}
                      </div>
                    )}
                    {aiAnalysis.recommendations?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: 6 }}>Recommendations</div>
                        {aiAnalysis.recommendations.map((r, i) => <div key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>• {r}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Events table */}
            {auditLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto' }} color="var(--primary)" />
              </div>
            ) : auditEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text2)' }}>
                <ClipboardCheck size={36} style={{ display: 'block', margin: '0 auto 10px', opacity: .3 }} />
                <div style={{ fontWeight: 600 }}>No audit events in this period</div>
              </div>
            ) : (
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface)' }}>
                        {['Time', 'Action', 'Resource', 'Patient', 'Details'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--border)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {auditEvents.slice(0, 100).map((e, i) => (
                        <tr key={e.id || i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{new Date(e.created_at).toLocaleString()}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 99, background: actionColor(e.action), flexShrink: 0 }} />
                              {e.action}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text2)' }}>{e.resource_type || '—'}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--text2)' }}>{e.patient_id ? e.patient_id.slice(0, 8) + '…' : '—'}</td>
                          <td style={{ padding: '10px 14px', color: 'var(--text2)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.details || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
