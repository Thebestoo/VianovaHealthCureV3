import React, { useState, useEffect } from 'react'
import {
  Users2, Plus, Trash2, Loader2, X, ChevronDown, ChevronUp,
  UserCheck, Activity, AlertTriangle, Copy, Check
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const PROGRAM_TYPES = ['Diabetes', 'Heart Failure', 'COPD', 'CKD', 'Hypertension', 'Other']

const EMPTY_FORM = {
  name: '', description: '', program_type: 'Diabetes',
  condition_keywords: '', medication_keywords: ''
}

function Badge({ label, color, bg }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 9px',
      borderRadius: 99, fontSize: 11, fontWeight: 700, color, background: bg,
      letterSpacing: '.02em'
    }}>
      {label}
    </span>
  )
}

function riskBadge(level) {
  if (!level) return null
  const l = level.toLowerCase()
  if (l === 'high') return <Badge label="High" color="var(--danger)" bg="var(--danger-light)" />
  if (l === 'medium') return <Badge label="Medium" color="var(--warning)" bg="var(--warning-light)" />
  return <Badge label="Low" color="var(--success)" bg="var(--success-light)" />
}

function outreachBadge(status) {
  if (!status) return null
  const s = status.toLowerCase()
  if (s === 'contacted') return <Badge label="Contacted" color="var(--primary)" bg="var(--primary-light)" />
  if (s === 'pending') return <Badge label="Pending" color="#7c3aed" bg="#ede9fe" />
  return <Badge label={status} color="var(--text2)" bg="var(--surface2)" />
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

export default function PopulationHealth() {
  const { key } = useKey()
  const [cohorts, setCohorts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // per-cohort state
  const [enrolling, setEnrolling] = useState({})
  const [enrollResult, setEnrollResult] = useState({})
  const [stratifying, setStratifying] = useState({})
  const [stratifyResult, setStratifyResult] = useState({})
  const [membersOpen, setMembersOpen] = useState({})
  const [members, setMembers] = useState({})
  const [membersLoading, setMembersLoading] = useState({})
  const [deleting, setDeleting] = useState({})

  // outreach modal
  const [outreachMsg, setOutreachMsg] = useState(null)
  const [outreachLoading, setOutreachLoading] = useState({})
  const [copied, setCopied] = useState(false)

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { if (key) loadCohorts() }, [key])

  async function loadCohorts() {
    setLoading(true)
    try {
      const r = await fetch('/api/cohorts', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setCohorts(Array.isArray(d) ? d : [])
    } catch {}
    setLoading(false)
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this cohort?')) return
    setDeleting(p => ({ ...p, [id]: true }))
    try {
      await fetch(`/api/cohorts/${id}`, { method: 'DELETE', headers: { 'x-api-key': key } })
      setCohorts(prev => prev.filter(c => c.id !== id))
    } catch {}
    setDeleting(p => ({ ...p, [id]: false }))
  }

  async function handleEnroll(id) {
    setEnrolling(p => ({ ...p, [id]: true }))
    setEnrollResult(p => ({ ...p, [id]: null }))
    try {
      const r = await fetch(`/api/cohorts/${id}/enroll`, { method: 'POST', headers: { 'x-api-key': key } })
      const d = await r.json()
      setEnrollResult(p => ({ ...p, [id]: d }))
      // refresh member_count
      loadCohorts()
    } catch {}
    setEnrolling(p => ({ ...p, [id]: false }))
  }

  async function handleStratify(id) {
    setStratifying(p => ({ ...p, [id]: true }))
    setStratifyResult(p => ({ ...p, [id]: null }))
    try {
      const r = await fetch(`/api/cohorts/${id}/stratify`, { method: 'POST', headers: { 'x-api-key': key } })
      const d = await r.json()
      setStratifyResult(p => ({ ...p, [id]: d }))
    } catch {}
    setStratifying(p => ({ ...p, [id]: false }))
  }

  async function toggleMembers(id) {
    if (membersOpen[id]) {
      setMembersOpen(p => ({ ...p, [id]: false }))
      return
    }
    setMembersOpen(p => ({ ...p, [id]: true }))
    if (members[id]) return
    setMembersLoading(p => ({ ...p, [id]: true }))
    try {
      const r = await fetch(`/api/cohorts/${id}/members`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setMembers(p => ({ ...p, [id]: Array.isArray(d) ? d : [] }))
    } catch {}
    setMembersLoading(p => ({ ...p, [id]: false }))
  }

  async function handleOutreach(cohortId, patientId) {
    const oKey = `${cohortId}:${patientId}`
    setOutreachLoading(p => ({ ...p, [oKey]: true }))
    try {
      const r = await fetch(`/api/cohorts/${cohortId}/members/${patientId}/outreach`, {
        method: 'POST', headers: { 'x-api-key': key }
      })
      const d = await r.json()
      setOutreachMsg(d)
    } catch {}
    setOutreachLoading(p => ({ ...p, [oKey]: false }))
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.name) return
    setSaving(true)
    try {
      const body = {
        name: form.name,
        description: form.description,
        program_type: form.program_type,
        criteria: {
          condition_keywords: form.condition_keywords.split(',').map(s => s.trim()).filter(Boolean),
          medication_keywords: form.medication_keywords.split(',').map(s => s.trim()).filter(Boolean),
          program_type: form.program_type
        }
      }
      await fetch('/api/cohorts', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(body)
      })
      setShowModal(false)
      setForm(EMPTY_FORM)
      loadCohorts()
    } catch {}
    setSaving(false)
  }

  const totalEnrolled = cohorts.reduce((sum, c) => sum + (c.member_count || 0), 0)
  const highRiskCount = Object.values(members).flat().filter(m => m.risk_level?.toLowerCase() === 'high').length

  return (
    <div>
      {/* Topbar */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Users2 size={18} color="var(--primary)" />
          <span className="topbar-title">Population Health</span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setForm(EMPTY_FORM); setShowModal(true) }}>
          <Plus size={14} /> New Cohort
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, padding: '24px 32px 0' }}>
        <div className="card" style={{ padding: '22px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, borderRadius: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users2 size={22} color="var(--primary)" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{cohorts.length}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Total Cohorts</div>
        </div>
        <div className="card" style={{ padding: '22px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, borderRadius: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--success-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <UserCheck size={22} color="var(--success)" />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{totalEnrolled}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>Total Enrolled</div>
        </div>
        <div className="card" style={{ padding: '22px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, borderRadius: 14, borderTop: highRiskCount ? '3px solid var(--danger)' : undefined }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: highRiskCount ? 'var(--danger-light)' : 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={22} color={highRiskCount ? 'var(--danger)' : 'var(--text3)'} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: highRiskCount ? 'var(--danger)' : 'var(--text)', lineHeight: 1.1 }}>{highRiskCount}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>High Risk</div>
        </div>
      </div>

      <div style={{ padding: '24px 32px 32px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--text3)' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block', color: 'var(--primary)' }} />
            <div style={{ fontSize: 13 }}>Loading cohorts…</div>
          </div>
        ) : cohorts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)' }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Users2 size={28} color="var(--primary)" />
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>No cohorts yet</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24 }}>Create your first cohort to start managing populations.</div>
            <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setShowModal(true) }}>
              <Plus size={15} /> New Cohort
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 16 }}>
            {cohorts.map(cohort => {
              let criteria = {}
              try { criteria = typeof cohort.criteria === 'string' ? JSON.parse(cohort.criteria) : (cohort.criteria || {}) } catch {}
              const condKw = criteria.condition_keywords || []
              const medKw = criteria.medication_keywords || []
              const enrRes = enrollResult[cohort.id]
              const strRes = stratifyResult[cohort.id]
              const isOpen = membersOpen[cohort.id]
              const cohortMembers = members[cohort.id] || []

              return (
                <div key={cohort.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
                  {/* Card header */}
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{cohort.name}</span>
                          <Badge label={cohort.program_type || 'General'} color="var(--primary)" bg="var(--primary-light)" />
                          <Badge label={`${cohort.member_count || 0} members`} color="var(--text2)" bg="var(--surface2)" />
                        </div>
                        {cohort.description && (
                          <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 5 }}>{cohort.description}</div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDelete(cohort.id)}
                        disabled={deleting[cohort.id]}
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', color: 'var(--danger)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                        title="Delete cohort"
                      >
                        {deleting[cohort.id] ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                      </button>
                    </div>

                    {/* Criteria chips */}
                    {(condKw.length > 0 || medKw.length > 0) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                        {condKw.map(kw => (
                          <span key={kw} style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: 'var(--warning-light)', color: 'var(--warning)', border: '1px solid var(--warning)' }}>{kw}</span>
                        ))}
                        {medKw.map(kw => (
                          <span key={kw} style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary)' }}>{kw}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: isOpen ? '1px solid var(--border)' : 'none' }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleEnroll(cohort.id)}
                      disabled={enrolling[cohort.id]}
                    >
                      {enrolling[cohort.id] ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <UserCheck size={13} />}
                      Enroll Patients
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleStratify(cohort.id)}
                      disabled={stratifying[cohort.id]}
                    >
                      {stratifying[cohort.id] ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Activity size={13} />}
                      Stratify
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => toggleMembers(cohort.id)}
                    >
                      {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      View Members
                    </button>

                    {/* Enroll result toast */}
                    {enrRes && (
                      <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 600, color: 'var(--success)', background: 'var(--success-light)', padding: '3px 10px', borderRadius: 99 }}>
                        Enrolled {enrRes.enrolled} patients
                      </span>
                    )}

                    {/* Stratify result */}
                    {strRes && strRes.breakdown && (
                      <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 600, color: 'var(--text)', background: 'var(--surface2)', padding: '3px 10px', borderRadius: 99, border: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--danger)' }}>{strRes.breakdown.high}H</span>
                        {' / '}
                        <span style={{ color: 'var(--warning)' }}>{strRes.breakdown.medium}M</span>
                        {' / '}
                        <span style={{ color: 'var(--success)' }}>{strRes.breakdown.low}L</span>
                      </span>
                    )}
                  </div>

                  {/* Members panel */}
                  {isOpen && (
                    <div style={{ background: 'var(--surface2)', padding: '14px 20px' }}>
                      {membersLoading[cohort.id] ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', fontSize: 13, padding: '8px 0' }}>
                          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading members…
                        </div>
                      ) : cohortMembers.length === 0 ? (
                        <div style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0' }}>No members enrolled yet.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {cohortMembers.map(m => {
                            const oKey = `${cohort.id}:${m.patient_id}`
                            return (
                              <div key={m.patient_id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 140 }}>
                                  <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>{m.name}</div>
                                  {m.dob && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>DOB: {m.dob}</div>}
                                </div>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                  {riskBadge(m.risk_level)}
                                  {outreachBadge(m.outreach_status)}
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleOutreach(cohort.id, m.patient_id)}
                                    disabled={outreachLoading[oKey]}
                                  >
                                    {outreachLoading[oKey] ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                                    Send Outreach
                                  </button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create Cohort Modal */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '32px 16px', overflowY: 'auto', backdropFilter: 'blur(2px)' }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: '0 24px 64px rgba(0,0,0,.22)', marginBottom: 32 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users2 size={16} color="var(--primary)" />
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>New Cohort</div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 6, borderRadius: 7, display: 'flex', alignItems: 'center' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreate} style={{ padding: '22px 24px' }}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="e.g. Diabetic Patients Q3" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Description</label>
                <textarea value={form.description} onChange={e => setField('description', e.target.value)} rows={2} placeholder="Optional description…" style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Program Type</label>
                <select value={form.program_type} onChange={e => setField('program_type', e.target.value)} style={inputStyle}>
                  {PROGRAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Condition Keywords <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(comma-separated)</span></label>
                <input value={form.condition_keywords} onChange={e => setField('condition_keywords', e.target.value)} placeholder="e.g. diabetes, type 2, insulin" style={inputStyle} />
              </div>
              <div style={{ marginBottom: 22 }}>
                <label style={labelStyle}>Medication Keywords <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(comma-separated)</span></label>
                <input value={form.medication_keywords} onChange={e => setField('medication_keywords', e.target.value)} placeholder="e.g. metformin, insulin, glipizide" style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={saving || !form.name} className="btn btn-primary btn-sm">
                  {saving ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Creating…</> : <><Plus size={13} /> Create Cohort</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Outreach Message Modal */}
      {outreachMsg && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '24px 16px', backdropFilter: 'blur(2px)' }}
          onClick={e => e.target === e.currentTarget && setOutreachMsg(null)}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 480, boxShadow: '0 24px 64px rgba(0,0,0,.22)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                Outreach Message{outreachMsg.patient_name ? ` — ${outreachMsg.patient_name}` : ''}
              </div>
              <button onClick={() => setOutreachMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 6, borderRadius: 7, display: 'flex', alignItems: 'center' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <textarea
                readOnly
                value={outreachMsg.message || ''}
                rows={6}
                style={{ ...inputStyle, resize: 'vertical', background: 'var(--surface2)', fontSize: 13 }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, gap: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(outreachMsg.message || '')
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1800)
                  }}
                >
                  {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy</>}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setOutreachMsg(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
