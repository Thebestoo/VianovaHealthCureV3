import React, { useState, useEffect } from 'react'
import { Activity, Loader2, Zap, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

function statusBadge(status) {
  if (!status) return null
  const s = status.toLowerCase()
  let color, bg
  if (s === 'stable') { color = 'var(--success)'; bg = 'var(--success-light)' }
  else if (s === 'improving') { color = 'var(--primary)'; bg = 'var(--primary-light)' }
  else if (s === 'worsening') { color = 'var(--warning)'; bg = 'var(--warning-light)' }
  else if (s === 'critical') { color = 'var(--danger)'; bg = 'var(--danger-light)' }
  else { color = 'var(--text2)'; bg = 'var(--surface2)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
      borderRadius: 99, fontSize: 11, fontWeight: 700, color, background: bg,
      textTransform: 'capitalize', letterSpacing: '.02em'
    }}>
      {status}
    </span>
  )
}

function metricDot(status) {
  const s = (status || '').toLowerCase()
  if (s === 'critical') return 'var(--danger)'
  if (s === 'warning') return 'var(--warning)'
  return 'var(--success)'
}

function alertBorderColor(severity) {
  const s = (severity || '').toLowerCase()
  if (s === 'critical') return 'var(--danger)'
  if (s === 'warning') return 'var(--warning)'
  return 'var(--primary)'
}

function ProgramCard({ program }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: '14px 18px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', cursor: 'pointer',
          borderBottom: open ? '1px solid var(--border)' : 'none'
        }}
        onClick={() => setOpen(o => !o)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
            {program.condition}
          </span>
          {statusBadge(program.status)}
        </div>
        <div style={{ color: 'var(--text3)' }}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {open && (
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Key metrics */}
          {program.key_metrics && program.key_metrics.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Key Metrics</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {program.key_metrics.map((m, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', background: 'var(--surface2)',
                    border: '1px solid var(--border)', borderRadius: 8, fontSize: 12.5
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: 99,
                      background: metricDot(m.status), flexShrink: 0
                    }} />
                    <span style={{ color: 'var(--text2)', fontWeight: 500 }}>{m.name || m.metric}:</span>
                    <span style={{ color: 'var(--text)', fontWeight: 700 }}>{m.value}</span>
                    {m.unit && <span style={{ color: 'var(--text3)', fontSize: 11 }}>{m.unit}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alerts */}
          {program.alerts && program.alerts.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Alerts</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {program.alerts.map((a, i) => (
                  <div key={i} style={{
                    padding: '8px 12px',
                    borderLeft: `3px solid ${alertBorderColor(a.severity)}`,
                    background: 'var(--surface2)', borderRadius: '0 6px 6px 0',
                    fontSize: 13, color: 'var(--text)'
                  }}>
                    {typeof a === 'string' ? a : a.message || a.description || JSON.stringify(a)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {program.recommendations && program.recommendations.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Recommendations</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {program.recommendations.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text)' }}>
                    <Check size={14} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Goals */}
          {program.goals && program.goals.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Goals</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Goal', 'Target', 'Current', 'Met'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text2)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {program.goals.map((g, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 10px', color: 'var(--text)' }}>{g.goal || g.name}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text2)' }}>{g.target}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text)' }}>{g.current}</td>
                        <td style={{ padding: '8px 10px' }}>
                          {g.met
                            ? <Check size={15} color="var(--success)" />
                            : <X size={15} color="var(--danger)" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Next actions */}
          {program.next_actions && program.next_actions.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Next Actions</div>
              <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {program.next_actions.map((a, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{a}</li>
                ))}
              </ol>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

export default function ChronicDisease() {
  const { key } = useKey()
  const [patients, setPatients] = useState([])
  const [selectedPatient, setSelectedPatient] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])
  const [activeTab, setActiveTab] = useState('analyze')

  useEffect(() => {
    if (key) loadPatients()
  }, [key])

  async function loadPatients() {
    try {
      const r = await fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPatients(d.patients || [])
    } catch {}
  }

  async function analyze() {
    if (!selectedPatient) return
    setLoading(true)
    setResult(null)
    try {
      const r = await fetch(`/api/chronic-disease/analyze/${selectedPatient}`, {
        method: 'POST',
        headers: { 'x-api-key': key }
      })
      const d = await r.json()
      setResult(d)
      const patient = patients.find(p => String(p.id) === String(selectedPatient))
      setHistory(prev => [
        { patientName: patient?.name || selectedPatient, timestamp: new Date().toISOString(), data: d },
        ...prev
      ].slice(0, 3))
    } catch {}
    setLoading(false)
  }

  const inputStyle = {
    padding: '9px 13px', border: '1.5px solid var(--border)', borderRadius: 8,
    fontSize: 13.5, color: 'var(--text)', background: 'var(--surface)',
    outline: 'none', fontFamily: 'inherit'
  }

  const tabStyle = (active) => ({
    padding: '8px 18px', border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 13.5, fontWeight: active ? 700 : 500,
    background: active ? 'var(--primary)' : 'transparent',
    color: active ? 'var(--surface)' : 'var(--text2)',
    transition: 'all .15s'
  })

  return (
    <div>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={18} color="var(--primary)" />
          <span className="topbar-title">Chronic Disease Management</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={tabStyle(activeTab === 'analyze')} onClick={() => setActiveTab('analyze')}>Analyze</button>
          <button style={tabStyle(activeTab === 'history')} onClick={() => setActiveTab('history')}>
            Recent ({history.length})
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 32px 32px' }}>

        {activeTab === 'analyze' && (
          <>
            {/* Patient selector */}
            <div className="card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>Patient</label>
              <select
                value={selectedPatient}
                onChange={e => setSelectedPatient(e.target.value)}
                style={{ ...inputStyle, flex: '1 1 220px', minWidth: 0 }}
              >
                <option value="">— Select patient —</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button
                className="btn btn-primary btn-sm"
                onClick={analyze}
                disabled={!selectedPatient || loading}
              >
                {loading
                  ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing…</>
                  : <><Activity size={13} /> Analyze</>}
              </button>
            </div>

            {/* Loading */}
            {loading && (
              <div style={{ textAlign: 'center', padding: 80 }}>
                <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)', display: 'block', margin: '0 auto 12px' }} />
                <div style={{ fontSize: 14, color: 'var(--text2)' }}>Analyzing chronic disease status…</div>
              </div>
            )}

            {/* Results */}
            {!loading && result && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{result.patient_name}</div>
                  {statusBadge(result.overall_status)}
                  {result.generated_at && (
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 'auto' }}>
                      {new Date(result.generated_at).toLocaleString()}
                    </div>
                  )}
                </div>

                {/* Priority action banner */}
                {result.priority_action && (
                  <div style={{
                    background: 'var(--warning-light)', border: '1px solid var(--warning)', borderRadius: 10,
                    padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10
                  }}>
                    <Zap size={18} color="var(--warning)" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Priority Action</div>
                      <div style={{ fontSize: 13.5, color: 'var(--warning)', fontWeight: 500 }}>{result.priority_action}</div>
                    </div>
                  </div>
                )}

                {/* Programs grid */}
                {result.programs && result.programs.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))', gap: 16 }}>
                    {result.programs.map((program, i) => (
                      <ProgramCard key={i} program={program} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {!loading && !result && (
              <div style={{
                textAlign: 'center', padding: '80px 20px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, boxShadow: 'var(--shadow)'
              }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Activity size={28} color="var(--primary)" />
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>No analysis yet</div>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>Select a patient to analyze their chronic disease status</div>
              </div>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 16 }}>Recent Analyses</div>
            {history.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '60px 20px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, boxShadow: 'var(--shadow)'
              }}>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>No analyses run yet in this session.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {history.map((h, i) => (
                  <div key={i} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Activity size={18} color="var(--primary)" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{h.patientName}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{new Date(h.timestamp).toLocaleString()}</div>
                    </div>
                    {statusBadge(h.data?.overall_status)}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => { setResult(h.data); setActiveTab('analyze') }}
                    >
                      View
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
