import React, { useState, useEffect } from 'react'
import {
  Lightbulb, Loader2, X, AlertCircle, Stethoscope, FlaskConical,
  Pill, Check, ChevronRight, ShieldCheck, Activity, Brain
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

function indicatorColor(indicator) {
  if (!indicator) return '#64748b'
  const i = indicator.toLowerCase()
  if (i === 'critical') return '#dc2626'
  if (i === 'warning')  return '#d97706'
  return '#2563eb'
}

function riskStyle(label) {
  if (!label) return { color: '#64748b', bg: '#f1f5f9' }
  const l = label.toLowerCase()
  if (l === 'critical')                  return { color: '#dc2626', bg: '#fee2e2' }
  if (l === 'high')                      return { color: '#ea580c', bg: '#ffedd5' }
  if (l === 'moderate' || l === 'medium') return { color: '#d97706', bg: '#fef3c7' }
  return { color: '#059669', bg: '#dcfce7' }
}

const SEVERITY_STYLES = {
  critical: { color: '#dc2626', bg: '#fee2e2' },
  high:     { color: '#ea580c', bg: '#ffedd5' },
  moderate: { color: '#d97706', bg: '#fef3c7' },
  low:      { color: '#2563eb', bg: '#dbeafe' },
}

function SeverityBadge({ severity }) {
  if (!severity) return null
  const st = SEVERITY_STYLES[severity.toLowerCase()] || { color: '#64748b', bg: '#f1f5f9' }
  return (
    <span style={{
      padding: '2px 9px', borderRadius: 99, fontSize: 10, fontWeight: 800,
      textTransform: 'uppercase', letterSpacing: '.06em', ...st,
    }}>
      {severity}
    </span>
  )
}

function categoryIcon(category) {
  if (!category) return <AlertCircle size={15} />
  const c = category.toLowerCase()
  if (c.includes('med') || c.includes('drug')) return <Pill size={15} />
  if (c.includes('lab') || c.includes('test')) return <FlaskConical size={15} />
  if (c.includes('risk') || c.includes('score')) return <Activity size={15} />
  return <Brain size={15} />
}

function RiskGauge({ score, label }) {
  const pct   = Math.min(100, Math.max(0, score || 0))
  const { color, bg } = riskStyle(label)
  const r     = 38
  const circ  = 2 * Math.PI * r
  const dash  = (pct / 100) * circ
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minWidth: 120 }}>
      <div style={{ position: 'relative', width: 108, height: 108 }}>
        <svg width={108} height={108} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={54} cy={54} r={r} fill="none" stroke="#e2e8f0" strokeWidth={10} />
          <circle
            cx={54} cy={54} r={r} fill="none" stroke={color} strokeWidth={10}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray .6s ease' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>{pct}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>/ 100</div>
        </div>
      </div>
      <span style={{
        fontSize: 11, fontWeight: 800, padding: '3px 12px',
        borderRadius: 99, color, background: bg,
        textTransform: 'uppercase', letterSpacing: '.06em',
      }}>
        {label || 'Unknown'}
      </span>
    </div>
  )
}

export default function ClinicalDecisions() {
  const { key } = useKey()
  const [patients,       setPatients]       = useState([])
  const [activeTab,      setActiveTab]      = useState('cds')

  // CDS
  const [cdsPatient,     setCdsPatient]     = useState('')
  const [cdsLoading,     setCdsLoading]     = useState(false)
  const [cdsResult,      setCdsResult]      = useState(null)
  const [dismissed,      setDismissed]      = useState(new Set())
  const [actionCopied,   setActionCopied]   = useState(null)

  // Med check
  const [medPatient,     setMedPatient]     = useState('')
  const [medName,        setMedName]        = useState('')
  const [medDose,        setMedDose]        = useState('')
  const [medLoading,     setMedLoading]     = useState(false)
  const [medResult,      setMedResult]      = useState(null)

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
    setCdsLoading(true); setCdsResult(null); setDismissed(new Set())
    try {
      const r = await fetch(`/api/cds/patient/${cdsPatient}`, { method: 'POST', headers: { 'x-api-key': key } })
      setCdsResult(await r.json())
    } catch {}
    setCdsLoading(false)
  }

  async function runMedCheck() {
    if (!medPatient || !medName) return
    setMedLoading(true); setMedResult(null)
    try {
      const r = await fetch('/api/cds/medication-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ patient_id: medPatient, new_medication: medName, ...(medDose && { new_dose: medDose }) }),
      })
      setMedResult(await r.json())
    } catch {}
    setMedLoading(false)
  }

  const visibleCards = (cdsResult?.cards || []).filter(c => !dismissed.has(c.id))

  const sel = { padding: '11px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text)', background: 'var(--surface)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', width: '100%' }
  const inp = { ...sel }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Topbar */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lightbulb size={16} color="var(--primary)" />
          </div>
          <span className="topbar-title">Clinical Decisions</span>
        </div>
      </div>

      <div style={{ padding: '28px 32px 40px' }}>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 3, background: '#e2e8f0', borderRadius: 12, padding: 4, width: 'fit-content', marginBottom: 28 }}>
          {[
            { id: 'cds', label: 'Patient Risk & CDS',  icon: Brain },
            { id: 'med', label: 'Medication Safety',   icon: Pill  },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 20px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, transition: 'all .15s',
              background: activeTab === id ? '#fff' : 'transparent',
              color:      activeTab === id ? 'var(--primary)' : 'var(--text2)',
              boxShadow:  activeTab === id ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
            }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* ── PATIENT CDS TAB ── */}
        {activeTab === 'cds' && (
          <div>
            {/* Controls card */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 24, boxShadow: 'var(--shadow)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 16 }}>
                Select Patient
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 280px' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
                    Patient
                  </label>
                  <select value={cdsPatient} onChange={e => setCdsPatient(e.target.value)} style={sel}>
                    <option value="">— Choose a patient —</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={runCDS}
                  disabled={cdsLoading || !cdsPatient}
                  style={{ flexShrink: 0 }}
                >
                  {cdsLoading
                    ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing…</>
                    : <><Lightbulb size={13} /> Run CDS Analysis</>}
                </button>
              </div>
            </div>

            {/* Loading */}
            {cdsLoading && (
              <div style={{ textAlign: 'center', padding: '72px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)' }}>
                <Loader2 size={34} color="var(--primary)" style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 14px' }} />
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>Running clinical analysis…</div>
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>Evaluating patient data, risk factors, and guidelines</div>
              </div>
            )}

            {/* Result */}
            {cdsResult && !cdsLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Risk summary card */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px 28px', boxShadow: 'var(--shadow)', display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <RiskGauge score={cdsResult.risk_score} label={cdsResult.risk_label} />
                  <div style={{ flex: 1, minWidth: 220 }}>
                    {cdsResult.patient_name && (
                      <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)', marginBottom: 12, letterSpacing: '-.01em' }}>
                        {cdsResult.patient_name}
                      </div>
                    )}
                    {cdsResult.summary && (
                      <div style={{
                        fontSize: 13.5, color: 'var(--text)', lineHeight: 1.75,
                        padding: '14px 18px', background: 'var(--surface2)',
                        borderRadius: 10, border: '1px solid var(--border)',
                      }}>
                        {cdsResult.summary}
                      </div>
                    )}
                  </div>
                </div>

                {/* Recommendation cards */}
                {visibleCards.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                        Recommendations
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: 'var(--primary-light)', color: 'var(--primary)' }}>
                        {visibleCards.length}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {visibleCards.map(card => {
                        const clr = indicatorColor(card.indicator)
                        return (
                          <div key={card.id} style={{
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderLeft: `4px solid ${clr}`,
                            borderRadius: 12,
                            padding: '16px 18px',
                            boxShadow: 'var(--shadow)',
                            display: 'flex', gap: 14, alignItems: 'flex-start',
                          }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                              background: `${clr}15`, border: `1px solid ${clr}30`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: clr,
                            }}>
                              {categoryIcon(card.category)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{card.title}</span>
                                {card.category && (
                                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', background: 'var(--surface2)', padding: '2px 8px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                                    {card.category}
                                  </span>
                                )}
                              </div>
                              {card.detail && (
                                <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }}>{card.detail}</div>
                              )}
                              {card.action && (
                                <button
                                  className="btn btn-secondary btn-sm"
                                  style={{ marginTop: 10 }}
                                  onClick={() => {
                                    navigator.clipboard.writeText(card.action)
                                    setActionCopied(card.id)
                                    setTimeout(() => setActionCopied(null), 1600)
                                  }}
                                >
                                  {actionCopied === card.id
                                    ? <><Check size={12} /> Copied!</>
                                    : <><ChevronRight size={12} /> Take Action</>}
                                </button>
                              )}
                            </div>
                            <button
                              onClick={() => setDismissed(s => new Set([...s, card.id]))}
                              title="Dismiss"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 4, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center' }}
                            >
                              <X size={15} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {visibleCards.length === 0 && cdsResult.cards?.length > 0 && (
                  <div style={{ textAlign: 'center', padding: '28px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text3)' }}>
                    All recommendations dismissed.
                  </div>
                )}
              </div>
            )}

            {/* Empty state */}
            {!cdsResult && !cdsLoading && (
              <div style={{ textAlign: 'center', padding: '72px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)' }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Brain size={26} color="var(--primary)" />
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>Patient Risk Analysis</div>
                <div style={{ fontSize: 13, color: 'var(--text3)', maxWidth: 320, margin: '0 auto' }}>
                  Select a patient and run a CDS check to get AI-powered risk scores and clinical recommendations.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MEDICATION CHECK TAB ── */}
        {activeTab === 'med' && (
          <div>
            {/* Input card */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 24, boxShadow: 'var(--shadow)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 16 }}>
                Medication Safety Check
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Patient *</label>
                  <select value={medPatient} onChange={e => setMedPatient(e.target.value)} style={sel}>
                    <option value="">— Choose patient —</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Medication *</label>
                  <input value={medName} onChange={e => setMedName(e.target.value)} placeholder="e.g. Metformin" style={inp} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Dose <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opt.)</span></label>
                  <input value={medDose} onChange={e => setMedDose(e.target.value)} placeholder="500mg" style={inp} />
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={runMedCheck}
                disabled={medLoading || !medPatient || !medName}
              >
                {medLoading
                  ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Checking…</>
                  : <><ShieldCheck size={13} /> Check Medication Safety</>}
              </button>
            </div>

            {/* Loading */}
            {medLoading && (
              <div style={{ textAlign: 'center', padding: '72px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)' }}>
                <Loader2 size={34} color="var(--primary)" style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 14px' }} />
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>Checking medication safety…</div>
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>Analyzing interactions, contraindications and allergies</div>
              </div>
            )}

            {/* Empty state */}
            {!medResult && !medLoading && (
              <div style={{ textAlign: 'center', padding: '72px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)' }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Pill size={26} color="var(--primary)" />
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>Medication Safety Check</div>
                <div style={{ fontSize: 13, color: 'var(--text3)', maxWidth: 320, margin: '0 auto' }}>
                  Select a patient and enter a medication to check for drug interactions, contraindications and allergy conflicts.
                </div>
              </div>
            )}

            {/* Result */}
            {medResult && !medLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Status banner */}
                {(() => {
                  const safe = medResult.safe
                  const cfg = safe === true
                    ? { bg: '#f0fdf4', border: '#86efac', color: '#15803d', label: 'Safe to Prescribe', icon: <Check size={22} /> }
                    : safe === false
                    ? { bg: '#fff1f2', border: '#fca5a5', color: '#dc2626', label: 'Do Not Prescribe', icon: <X size={22} /> }
                    : { bg: '#fefce8', border: '#fde047', color: '#a16207', label: 'Use With Caution', icon: <AlertCircle size={22} /> }
                  return (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '18px 24px', borderRadius: 14,
                      background: cfg.bg, border: `1.5px solid ${cfg.border}`,
                      boxShadow: 'var(--shadow)',
                    }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: cfg.border, display: 'flex', alignItems: 'center', justifyContent: 'center', color: cfg.color, flexShrink: 0 }}>
                        {cfg.icon}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 18, color: cfg.color, letterSpacing: '-.01em' }}>{cfg.label}</div>
                        {medResult.overall_recommendation && (
                          <div style={{ fontSize: 13, color: cfg.color, opacity: .8, marginTop: 3, lineHeight: 1.5 }}>{medResult.overall_recommendation}</div>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* Alerts */}
                {medResult.alerts?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
                      Alerts
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {medResult.alerts.map((alert, i) => (
                        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', boxShadow: 'var(--shadow)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                            <SeverityBadge severity={alert.severity} />
                            {alert.type && (
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{alert.type}</span>
                            )}
                          </div>
                          {alert.message && (
                            <div style={{ fontSize: 13.5, color: 'var(--text)', marginBottom: 5, fontWeight: 600, lineHeight: 1.5 }}>{alert.message}</div>
                          )}
                          {alert.recommendation && (
                            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }}>{alert.recommendation}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Alternatives */}
                {medResult.formulary_alternatives?.length > 0 && (
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', boxShadow: 'var(--shadow)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
                      Formulary Alternatives
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {medResult.formulary_alternatives.map((alt, i) => (
                        <span key={i} style={{
                          padding: '6px 14px', background: 'var(--primary-light)',
                          color: 'var(--primary)', borderRadius: 99,
                          fontSize: 13, fontWeight: 600,
                          border: '1px solid rgba(14,116,144,.2)',
                        }}>
                          {alt}
                        </span>
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
