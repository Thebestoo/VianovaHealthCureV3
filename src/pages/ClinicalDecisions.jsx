import React, { useState, useEffect } from 'react'
import {
  Lightbulb, Loader2, X, AlertCircle, Stethoscope, FlaskConical,
  Pill, Check, ChevronRight
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const inputStyle = {
  width: '100%', padding: '9px 13px', border: '1.5px solid var(--border)',
  borderRadius: 8, fontSize: 13.5, color: 'var(--text)', background: 'var(--surface)',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit'
}
const labelStyle = {
  display: 'block', fontSize: 12.5, fontWeight: 600,
  color: 'var(--text)', marginBottom: 5
}

function indicatorColor(indicator) {
  if (!indicator) return '#64748b'
  const i = indicator.toLowerCase()
  if (i === 'critical') return '#b91c1c'
  if (i === 'warning') return '#d97706'
  return '#2563eb'
}

function riskStyle(label) {
  if (!label) return { color: '#64748b', bg: '#f1f5f9' }
  const l = label.toLowerCase()
  if (l === 'critical') return { color: '#b91c1c', bg: '#fee2e2' }
  if (l === 'high') return { color: '#ea580c', bg: '#ffedd5' }
  if (l === 'moderate' || l === 'medium') return { color: '#d97706', bg: '#fef3c7' }
  return { color: '#059669', bg: '#d1fae5' }
}

function severityBadge(severity) {
  if (!severity) return null
  const s = severity.toLowerCase()
  const map = {
    critical: { color: '#b91c1c', bg: '#fee2e2' },
    high: { color: '#ea580c', bg: '#ffedd5' },
    moderate: { color: '#d97706', bg: '#fef3c7' },
    low: { color: '#2563eb', bg: '#dbeafe' },
  }
  const st = map[s] || { color: '#64748b', bg: '#f1f5f9' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, ...st }}>
      {severity}
    </span>
  )
}

function categoryIcon(category) {
  if (!category) return <AlertCircle size={16} />
  const c = category.toLowerCase()
  if (c.includes('med') || c.includes('drug')) return <Stethoscope size={16} />
  if (c.includes('lab') || c.includes('test')) return <FlaskConical size={16} />
  return <AlertCircle size={16} />
}

function RiskGauge({ score, label }) {
  const pct = Math.min(100, Math.max(0, score || 0))
  const { color } = riskStyle(label)
  const circumference = 2 * Math.PI * 36
  const dash = (pct / 100) * circumference
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width={100} height={100} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={50} cy={50} r={36} fill="none" stroke="#e2e8f0" strokeWidth={10} />
        <circle
          cx={50} cy={50} r={36} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray .5s' }}
        />
      </svg>
      <div style={{ marginTop: -84, width: 100, textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1, paddingTop: 32 }}>{pct}</div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>/ 100</div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 99, color, background: riskStyle(label).bg }}>
        {label || 'Unknown'}
      </div>
    </div>
  )
}

export default function ClinicalDecisions() {
  const { key } = useKey()
  const [patients, setPatients] = useState([])
  const [activeTab, setActiveTab] = useState('cds')

  // CDS tab
  const [cdsPatient, setCdsPatient] = useState('')
  const [cdsLoading, setCdsLoading] = useState(false)
  const [cdsResult, setCdsResult] = useState(null)
  const [dismissedCards, setDismissedCards] = useState(new Set())
  const [actionCopied, setActionCopied] = useState(null)

  // Med check tab
  const [medPatient, setMedPatient] = useState('')
  const [medName, setMedName] = useState('')
  const [medDose, setMedDose] = useState('')
  const [medLoading, setMedLoading] = useState(false)
  const [medResult, setMedResult] = useState(null)

  useEffect(() => { if (key) loadPatients() }, [key])

  async function loadPatients() {
    try {
      const r = await fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPatients(d.patients || [])
    } catch {}
  }

  async function runCDS() {
    if (!cdsPatient) return
    setCdsLoading(true)
    setCdsResult(null)
    setDismissedCards(new Set())
    try {
      const r = await fetch(`/api/cds/patient/${cdsPatient}`, {
        method: 'POST', headers: { 'x-api-key': key }
      })
      const d = await r.json()
      setCdsResult(d)
    } catch {}
    setCdsLoading(false)
  }

  async function runMedCheck() {
    if (!medPatient || !medName) return
    setMedLoading(true)
    setMedResult(null)
    try {
      const body = { patient_id: medPatient, new_medication: medName, ...(medDose && { new_dose: medDose }) }
      const r = await fetch('/api/cds/medication-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(body)
      })
      const d = await r.json()
      setMedResult(d)
    } catch {}
    setMedLoading(false)
  }

  const visibleCards = (cdsResult?.cards || []).filter(c => !dismissedCards.has(c.id))

  return (
    <div>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Lightbulb size={18} color="var(--primary)" />
          <span className="topbar-title">Clinical Decisions</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '20px 32px 0' }}>
        <div style={{ display: 'flex', gap: 0, background: 'var(--surface2)', borderRadius: 10, padding: 4, border: '1px solid var(--border)', width: 'fit-content' }}>
          {[{ id: 'cds', label: 'Patient CDS' }, { id: 'med', label: 'Medication Check' }].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: activeTab === t.id ? 'var(--surface)' : 'transparent',
                color: activeTab === t.id ? 'var(--primary)' : 'var(--text2)',
                boxShadow: activeTab === t.id ? 'var(--shadow)' : 'none'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 32px 32px' }}>
        {/* Patient CDS tab */}
        {activeTab === 'cds' && (
          <div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                <label style={labelStyle}>Patient <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select value={cdsPatient} onChange={e => setCdsPatient(e.target.value)} style={inputStyle}>
                  <option value="">— Select patient —</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <button className="btn btn-primary" onClick={runCDS} disabled={cdsLoading || !cdsPatient}>
                {cdsLoading ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Running…</> : <><Lightbulb size={13} /> Run CDS Check</>}
              </button>
            </div>

            {cdsLoading && (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
                <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 12px', color: 'var(--primary)' }} />
                <div style={{ fontSize: 13 }}>Analyzing patient data…</div>
              </div>
            )}

            {cdsResult && !cdsLoading && (
              <div>
                {/* Risk + summary */}
                <div className="card" style={{ padding: '24px', display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap' }}>
                  <RiskGauge score={cdsResult.risk_score} label={cdsResult.risk_label} />
                  <div style={{ flex: 1, minWidth: 200 }}>
                    {cdsResult.patient_name && (
                      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>{cdsResult.patient_name}</div>
                    )}
                    {cdsResult.summary && (
                      <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.7, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        {cdsResult.summary}
                      </div>
                    )}
                  </div>
                </div>

                {/* Cards */}
                {visibleCards.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
                      Recommendations ({visibleCards.length})
                    </div>
                    {visibleCards.map(card => {
                      const borderColor = indicatorColor(card.indicator)
                      return (
                        <div key={card.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${borderColor}`, borderRadius: 10, padding: '14px 16px', boxShadow: 'var(--shadow)', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                          <div style={{ width: 34, height: 34, borderRadius: 9, background: `${borderColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: borderColor }}>
                            {categoryIcon(card.category)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{card.title}</span>
                              {card.category && (
                                <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, background: '#f1f5f9', padding: '1px 7px', borderRadius: 99 }}>{card.category}</span>
                              )}
                            </div>
                            {card.detail && <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{card.detail}</div>}
                            {card.action && (
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ marginTop: 10 }}
                                onClick={() => {
                                  navigator.clipboard.writeText(card.action)
                                  setActionCopied(card.id)
                                  setTimeout(() => setActionCopied(null), 1500)
                                }}
                              >
                                {actionCopied === card.id ? <><Check size={12} /> Copied</> : <><ChevronRight size={12} /> Take Action</>}
                              </button>
                            )}
                          </div>
                          <button
                            onClick={() => setDismissedCards(s => new Set([...s, card.id]))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                            title="Dismiss"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Medication Check tab */}
        {activeTab === 'med' && (
          <div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <label style={labelStyle}>Patient <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select value={medPatient} onChange={e => setMedPatient(e.target.value)} style={inputStyle}>
                  <option value="">— Select patient —</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <label style={labelStyle}>Medication Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input value={medName} onChange={e => setMedName(e.target.value)} placeholder="e.g. Metformin" style={inputStyle} />
              </div>
              <div style={{ flex: '0 0 140px', minWidth: 0 }}>
                <label style={labelStyle}>Dose <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span></label>
                <input value={medDose} onChange={e => setMedDose(e.target.value)} placeholder="e.g. 500mg" style={inputStyle} />
              </div>
              <button className="btn btn-primary" onClick={runMedCheck} disabled={medLoading || !medPatient || !medName}>
                {medLoading ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Checking…</> : <><Pill size={13} /> Check Safety</>}
              </button>
            </div>

            {!medResult && !medLoading && (
              <div style={{ textAlign: 'center', padding: '70px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)' }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <Pill size={24} color="var(--primary)" />
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 5 }}>Medication Safety Check</div>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>Select a patient and enter a medication to check for interactions.</div>
              </div>
            )}

            {medLoading && (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>
                <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 12px', color: 'var(--primary)' }} />
                <div style={{ fontSize: 13 }}>Checking medication safety…</div>
              </div>
            )}

            {medResult && !medLoading && (
              <div>
                {/* Status banner */}
                <div style={{
                  padding: '18px 24px', borderRadius: 12, marginBottom: 20, textAlign: 'center',
                  fontWeight: 800, fontSize: 18, letterSpacing: '.03em',
                  background: medResult.safe === true ? '#dcfce7' : medResult.safe === false ? '#fee2e2' : '#fef9c3',
                  color: medResult.safe === true ? '#166534' : medResult.safe === false ? '#991b1b' : '#854d0e',
                  border: `2px solid ${medResult.safe === true ? '#86efac' : medResult.safe === false ? '#fca5a5' : '#fde047'}`
                }}>
                  {medResult.safe === true ? 'SAFE TO PRESCRIBE' : medResult.safe === false ? 'DO NOT PRESCRIBE' : 'USE WITH CAUTION'}
                </div>

                {medResult.overall_recommendation && (
                  <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.7, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16 }}>
                    {medResult.overall_recommendation}
                  </div>
                )}

                {/* Alerts */}
                {medResult.alerts?.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Alerts</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {medResult.alerts.map((alert, i) => (
                        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', boxShadow: 'var(--shadow)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                            {severityBadge(alert.severity)}
                            {alert.type && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{alert.type}</span>}
                          </div>
                          {alert.message && <div style={{ fontSize: 13.5, color: 'var(--text)', marginBottom: 5, fontWeight: 500 }}>{alert.message}</div>}
                          {alert.recommendation && <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{alert.recommendation}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Formulary alternatives */}
                {medResult.formulary_alternatives?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Formulary Alternatives</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {medResult.formulary_alternatives.map((alt, i) => (
                        <span key={i} style={{ padding: '5px 13px', background: '#dbeafe', color: '#1d4ed8', borderRadius: 99, fontSize: 13, fontWeight: 600 }}>{alt}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
