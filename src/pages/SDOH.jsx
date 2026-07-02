import React, { useState, useEffect } from 'react'
import {
  Home, Plus, Loader2, X, ChevronDown, ChevronUp, Check
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const DOMAIN_OPTIONS = {
  housing: [
    { value: 'stable', label: 'Stable', ok: true },
    { value: 'at_risk', label: 'At Risk', ok: false },
    { value: 'unstable', label: 'Unstable', ok: false },
    { value: 'homeless', label: 'Homeless', ok: false },
  ],
  food_security: [
    { value: 'secure', label: 'Secure', ok: true },
    { value: 'at_risk', label: 'At Risk', ok: false },
    { value: 'insecure', label: 'Insecure', ok: false },
  ],
  transportation: [
    { value: 'reliable', label: 'Reliable', ok: true },
    { value: 'limited', label: 'Limited', ok: false },
    { value: 'none', label: 'None', ok: false },
  ],
  financial_strain: [
    { value: 'none', label: 'None', ok: true },
    { value: 'mild', label: 'Mild', ok: false },
    { value: 'moderate', label: 'Moderate', ok: false },
    { value: 'severe', label: 'Severe', ok: false },
  ],
  social_isolation: [
    { value: 'connected', label: 'Connected', ok: true },
    { value: 'some_isolation', label: 'Some Isolation', ok: false },
    { value: 'isolated', label: 'Isolated', ok: false },
  ],
  education: [
    { value: 'high_school_plus', label: 'High School+', ok: true },
    { value: 'some_high_school', label: 'Some High School', ok: false },
    { value: 'none', label: 'None', ok: false },
  ],
  employment: [
    { value: 'employed', label: 'Employed', ok: true },
    { value: 'unemployed', label: 'Unemployed', ok: false },
    { value: 'disabled', label: 'Disabled', ok: false },
    { value: 'retired', label: 'Retired', ok: true },
  ],
  safety: [
    { value: 'safe', label: 'Safe', ok: true },
    { value: 'concerned', label: 'Concerned', ok: false },
    { value: 'unsafe', label: 'Unsafe', ok: false },
  ],
}

const DOMAIN_LABELS = {
  housing: 'Housing',
  food_security: 'Food Security',
  transportation: 'Transportation',
  financial_strain: 'Financial Strain',
  social_isolation: 'Social Isolation',
  education: 'Education',
  employment: 'Employment',
  safety: 'Safety',
}

const DOMAIN_KEYS = Object.keys(DOMAIN_OPTIONS)

const EMPTY_FORM = DOMAIN_KEYS.reduce((acc, k) => ({ ...acc, [k]: DOMAIN_OPTIONS[k][0].value }), { patient_id: '' })

function domainDotColor(domain, value) {
  if (!value) return '#e2e8f0'
  const opts = DOMAIN_OPTIONS[domain] || []
  const opt = opts.find(o => o.value === value)
  if (!opt) return '#e2e8f0'
  if (opt.ok) return 'var(--success)'
  if (opt.value.includes('at_risk') || opt.value === 'mild' || opt.value === 'some_isolation' || opt.value === 'limited' || opt.value === 'concerned') return '#f59e0b'
  return 'var(--danger)'
}

function isAdverse(domain, value) {
  if (!value) return false
  const opts = DOMAIN_OPTIONS[domain] || []
  const opt = opts.find(o => o.value === value)
  return opt ? !opt.ok : false
}

function highNeed(assessment) {
  let count = 0
  DOMAIN_KEYS.forEach(k => { if (isAdverse(k, assessment[k])) count++ })
  return count >= 3
}

const inputStyle = {
  width: '100%', padding: '9px 13px', border: '1.5px solid var(--border)',
  borderRadius: 8, fontSize: 13.5, color: 'var(--text)', background: 'var(--surface)',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit'
}
const labelStyle = {
  display: 'block', fontSize: 12.5, fontWeight: 600,
  color: 'var(--text)', marginBottom: 5
}

export default function SDOH() {
  const { key } = useKey()
  const [patients, setPatients] = useState([])
  const [assessments, setAssessments] = useState([])
  const [loading, setLoading] = useState(true)
  const [patientFilter, setPatientFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [expandedSummary, setExpandedSummary] = useState({})
  const [expandedResources, setExpandedResources] = useState({})
  const [resolving, setResolving] = useState({})
  const [apiError, setApiError] = useState(null)
  const [saveError, setSaveError] = useState(null)

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { if (key) { loadPatients(); loadAssessments() } }, [key])

  async function loadPatients() {
    try {
      const r = await fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPatients(d.patients || [])
    } catch {}
  }

  async function loadAssessments() {
    setLoading(true)
    setApiError(null)
    try {
      const qs = patientFilter ? `?patient_id=${patientFilter}` : ''
      const r = await fetch(`/api/sdoh${qs}`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      if (!r.ok) { setApiError(d.error || 'Failed to load assessments'); setAssessments([]) }
      else setAssessments(Array.isArray(d) ? d : [])
    } catch (e) { setApiError(e.message) }
    setLoading(false)
  }

  useEffect(() => { if (key) loadAssessments() }, [patientFilter, key])

  async function handleResolve(id) {
    setResolving(p => ({ ...p, [id]: true }))
    try {
      await fetch(`/api/sdoh/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ status: 'resolved' })
      })
      setAssessments(prev => prev.map(a => a.id === id ? { ...a, status: 'resolved' } : a))
    } catch {}
    setResolving(p => ({ ...p, [id]: false }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.patient_id) return
    setSaving(true)
    setSaveError(null)
    try {
      const { patient_id, ...domains } = form
      const r = await fetch('/api/sdoh', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ patient_id, ...domains })
      })
      const d = await r.json()
      if (!r.ok) { setSaveError(d.error || 'Save failed'); setSaving(false); return }
      setShowModal(false)
      setForm(EMPTY_FORM)
      loadAssessments()
    } catch (e) { setSaveError(e.message) }
    setSaving(false)
  }

  const totalActive = assessments.filter(a => (a.status || '').toLowerCase() !== 'resolved').length
  const totalHighNeed = assessments.filter(highNeed).length

  const displayed = assessments.filter(a => {
    if (patientFilter && a.patient_id !== patientFilter) return false
    return true
  })

  return (
    <div>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Home size={18} color="var(--primary)" />
          <span className="topbar-title">SDOH Screening</span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setForm(EMPTY_FORM); setShowModal(true) }}>
          <Plus size={14} /> New Screening
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, padding: '24px 32px 0' }}>
        <div className="card" style={{ padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 18, borderRadius: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Home size={24} color="var(--primary)" />
          </div>
          <div>
            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{assessments.length}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginTop: 4 }}>Total Assessments</div>
          </div>
        </div>
        <div className="card" style={{ padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 18, borderRadius: 14, borderLeft: totalActive ? '3px solid #f59e0b' : undefined }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 22 }}>⚡</span>
          </div>
          <div>
            <div style={{ fontSize: 32, fontWeight: 800, color: totalActive ? '#d97706' : 'var(--text)', lineHeight: 1.1 }}>{totalActive}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginTop: 4 }}>Active</div>
          </div>
        </div>
        <div className="card" style={{ padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 18, borderRadius: 14, borderLeft: totalHighNeed ? '3px solid var(--danger)' : undefined }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: totalHighNeed ? 'var(--danger-light)' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 22 }}>🔴</span>
          </div>
          <div>
            <div style={{ fontSize: 32, fontWeight: 800, color: totalHighNeed ? 'var(--danger)' : 'var(--text)', lineHeight: 1.1 }}>{totalHighNeed}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginTop: 4 }}>High Need</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 32px 32px' }}>
        {/* Filter */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, boxShadow: 'var(--shadow)', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap' }}>Patient</label>
          <select
            value={patientFilter}
            onChange={e => setPatientFilter(e.target.value)}
            style={{ ...inputStyle, padding: '7px 11px', fontSize: 13, maxWidth: 280 }}
          >
            <option value="">All patients</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {patientFilter && (
            <button className="btn btn-secondary btn-sm" onClick={() => setPatientFilter('')}>
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {apiError && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, fontSize: 13, color: '#b91c1c', display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontWeight: 700 }}>API Error:</span> {apiError}
            <button onClick={loadAssessments} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #fca5a5', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: '#b91c1c' }}>Retry</button>
          </div>
        )}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--text3)' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block', color: 'var(--primary)' }} />
            <div style={{ fontSize: 13 }}>Loading assessments…</div>
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)' }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Home size={28} color="var(--primary)" />
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>No assessments found</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24 }}>Create your first SDOH screening to identify social needs.</div>
            <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setShowModal(true) }}>
              <Plus size={15} /> New Screening
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {displayed.map(a => {
              const isResolved = (a.status || '').toLowerCase() === 'resolved'
              const isHighNeed = highNeed(a)
              const summaryOpen = expandedSummary[a.id]
              const resourcesOpen = expandedResources[a.id]
              let zCodes = []
              try { zCodes = typeof a.z_codes === 'string' ? JSON.parse(a.z_codes) : (a.z_codes || []) } catch {}
              let resources = []
              try { resources = typeof a.resources_suggested === 'string' ? JSON.parse(a.resources_suggested) : (a.resources_suggested || []) } catch {}

              return (
                <div key={a.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: isHighNeed ? '4px solid var(--danger)' : '4px solid var(--success)', borderRadius: 12, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{a.patient_name || 'Unknown Patient'}</span>
                          {isHighNeed && <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: 'var(--danger-light)', color: 'var(--danger)' }}>High Need</span>}
                          <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: isResolved ? '#d1fae5' : '#fef3c7', color: isResolved ? '#059669' : '#d97706' }}>
                            {isResolved ? 'Resolved' : 'Active'}
                          </span>
                        </div>
                        {a.assessed_at && (
                          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>
                            Assessed: {a.assessed_at?.slice(0, 10)}
                          </div>
                        )}
                      </div>
                      {!isResolved && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleResolve(a.id)}
                          disabled={resolving[a.id]}
                        >
                          {resolving[a.id] ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
                          Mark Resolved
                        </button>
                      )}
                    </div>

                    {/* Domain dots */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                      {DOMAIN_KEYS.map(dk => {
                        const dotColor = domainDotColor(dk, a[dk])
                        return (
                          <div key={dk} title={`${DOMAIN_LABELS[dk]}: ${a[dk] || 'N/A'}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: dotColor, border: '2px solid #fff', boxShadow: `0 0 0 1px ${dotColor}40` }} />
                            <span style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 500 }}>{DOMAIN_LABELS[dk].slice(0, 6)}</span>
                          </div>
                        )
                      })}
                    </div>

                    {/* Z-codes */}
                    {zCodes.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                        {zCodes.map((z, i) => (
                          <span key={i} style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: '#dbeafe', color: '#1d4ed8' }}>{z}</span>
                        ))}
                      </div>
                    )}

                    {/* AI Summary */}
                    {a.ai_summary && (
                      <div style={{ marginBottom: 10 }}>
                        <div
                          style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, cursor: summaryOpen ? 'default' : 'pointer' }}
                          onClick={() => !summaryOpen && setExpandedSummary(p => ({ ...p, [a.id]: true }))}
                        >
                          {summaryOpen ? a.ai_summary : (a.ai_summary.length > 120 ? a.ai_summary.slice(0, 120) + '…' : a.ai_summary)}
                        </div>
                        {a.ai_summary.length > 120 && (
                          <button
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--primary)', fontWeight: 600, padding: '2px 0', marginTop: 2 }}
                            onClick={() => setExpandedSummary(p => ({ ...p, [a.id]: !summaryOpen }))}
                          >
                            {summaryOpen ? 'Show less' : 'Read more'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Resources toggle */}
                    {resources.length > 0 && (
                      <div>
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--primary)', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 4 }}
                          onClick={() => setExpandedResources(p => ({ ...p, [a.id]: !resourcesOpen }))}
                        >
                          {resourcesOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          {resources.length} Suggested Resources
                        </button>
                        {resourcesOpen && (
                          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {resources.map((res, i) => (
                              <div key={i} style={{ padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                {res.category && (
                                  <span style={{ flexShrink: 0, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: '#f0fdf4', color: '#166534' }}>{res.category}</span>
                                )}
                                <div>
                                  {res.name && <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{res.name}</div>}
                                  {res.description && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{res.description}</div>}
                                  {typeof res === 'string' && <div style={{ fontSize: 13, color: 'var(--text)' }}>{res}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* New Screening Modal */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '24px 16px', overflowY: 'auto', backdropFilter: 'blur(2px)' }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 640, boxShadow: '0 24px 64px rgba(0,0,0,.22)', marginBottom: 32 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Home size={16} color="var(--primary)" />
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>New SDOH Screening</div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 6, borderRadius: 7, display: 'flex', alignItems: 'center' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: '22px 24px' }}>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Patient <span style={{ color: 'var(--danger)' }}>*</span></label>
                <select value={form.patient_id} onChange={e => setField('patient_id', e.target.value)} style={inputStyle}>
                  <option value="">— Select patient —</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 22 }}>
                {DOMAIN_KEYS.map(dk => (
                  <div key={dk}>
                    <label style={labelStyle}>{DOMAIN_LABELS[dk]}</label>
                    <select value={form[dk]} onChange={e => setField(dk, e.target.value)} style={inputStyle}>
                      {DOMAIN_OPTIONS[dk].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {saveError && (
                <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, color: '#b91c1c' }}>
                  {saveError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={saving || !form.patient_id} className="btn btn-primary btn-sm">
                  {saving ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><Plus size={13} /> Submit Screening</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
