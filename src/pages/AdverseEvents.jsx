import React, { useState, useEffect } from 'react'
import {
  AlertOctagon, Plus, Shield, Loader2, X, ChevronDown, ChevronUp,
  Trash2, CheckCircle2, Copy, Check, Search, Zap
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

/* ─── small helpers ──────────────────────────────────────────────────────── */
function Badge({ label, color, bg }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color, background: bg }}>{label}</span>
  )
}

function severityBorder(severity) {
  const map = { 'life-threatening': '#dc2626', severe: '#ea580c', moderate: '#ca8a04', mild: '#16a34a' }
  return map[severity] || '#9ca3af'
}

function severityBadge(severity) {
  const map = {
    'life-threatening': { color: '#dc2626', bg: '#fee2e2' },
    severe:             { color: '#ea580c', bg: '#ffedd5' },
    moderate:           { color: '#ca8a04', bg: '#fef9c3' },
    mild:               { color: '#16a34a', bg: '#dcfce7' },
  }
  return map[severity] || { color: '#6b7280', bg: '#f3f4f6' }
}

function causalityBadge(causality) {
  const map = {
    certain:       { color: '#dc2626', bg: '#fee2e2' },
    probable:      { color: '#ea580c', bg: '#ffedd5' },
    possible:      { color: '#ca8a04', bg: '#fef9c3' },
    unlikely:      { color: '#6b7280', bg: '#f3f4f6' },
    unclassified:  { color: '#6b7280', bg: '#f3f4f6' },
  }
  return map[causality] || { color: '#6b7280', bg: '#f3f4f6' }
}

function statusBadge(status) {
  if (status === 'resolved')   return { color: '#059669', bg: '#d1fae5', label: 'Resolved' }
  if (status === 'monitoring') return { color: '#2563eb', bg: '#dbeafe', label: 'Monitoring' }
  return { color: '#d97706', bg: '#fef3c7', label: 'Open' }
}

function FL({ children }) {
  return <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{children}</label>
}

const EVENT_SUGGESTIONS = ['Drug Reaction', 'Lab Abnormality', 'Allergic Response', 'Toxicity', 'Near Miss', 'Fall', 'Other']

/* ─── main component ─────────────────────────────────────────────────────── */
export default function AdverseEvents() {
  const { key } = useKey()

  const [events, setEvents]       = useState([])
  const [patients, setPatients]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [expanded, setExpanded]   = useState(null)

  // filters
  const [filterPatient, setFilterPatient] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [filterStatus, setFilterStatus]   = useState('')

  // report modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ patient_id: '', event_type: '', severity: 'moderate', suspected_medication: '', description: '', detected_at: '' })
  const [saving, setSaving]       = useState(false)
  const [saveResult, setSaveResult] = useState(null)   // { causality, causality_reasoning, recommended_action }

  // scan modal
  const [showScan, setShowScan]   = useState(false)
  const [scanPatient, setScanPatient] = useState('')
  const [scanning, setScanning]   = useState(false)
  const [scanResult, setScanResult] = useState(null)  // { signals, auto_created, patient_name }

  // copy-to-clipboard
  const [copied, setCopied]       = useState(null)

  // deleting
  const [deleting, setDeleting]   = useState(null)

  useEffect(() => { if (key) { load(); loadPatients() } }, [key])

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterPatient) params.set('patient_id', filterPatient)
      if (filterSeverity) params.set('severity', filterSeverity)
      if (filterStatus) params.set('status', filterStatus)
      const r = await fetch(`/api/adverse-events?${params}`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setEvents(Array.isArray(d) ? d : [])
    } catch { setEvents([]) }
    setLoading(false)
  }

  async function loadPatients() {
    try {
      const r = await fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPatients(d.patients || [])
    } catch {}
  }

  useEffect(() => { if (key) load() }, [filterPatient, filterSeverity, filterStatus])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true); setSaveResult(null)
    try {
      const r = await fetch('/api/adverse-events', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(form)
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Save failed')
      // show AI result if available
      let ai = null
      try { ai = typeof d.ai_assessment === 'string' ? JSON.parse(d.ai_assessment) : d.ai_assessment } catch {}
      if (ai) setSaveResult(ai)
      else { setShowModal(false); resetForm() }
      load()
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  function resetForm() {
    setForm({ patient_id: '', event_type: '', severity: 'moderate', suspected_medication: '', description: '', detected_at: '' })
    setSaveResult(null)
  }

  async function handleResolve(id) {
    await fetch(`/api/adverse-events/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ status: 'resolved' })
    })
    load()
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this adverse event report?')) return
    setDeleting(id)
    await fetch(`/api/adverse-events/${id}`, { method: 'DELETE', headers: { 'x-api-key': key } })
    setEvents(ev => ev.filter(e => e.id !== id))
    setDeleting(null)
  }

  async function handleScan(e) {
    e.preventDefault()
    if (!scanPatient) return
    setScanning(true); setScanResult(null)
    try {
      const r = await fetch(`/api/adverse-events/detect/${scanPatient}`, {
        method: 'POST',
        headers: { 'x-api-key': key }
      })
      const d = await r.json()
      setScanResult(d)
      load()
    } catch (err) { alert(err.message) }
    setScanning(false)
  }

  function copyText(text, id) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  // stats
  const total     = events.length
  const openCount = events.filter(e => e.status === 'open').length
  const severeCount = events.filter(e => e.severity === 'severe' || e.severity === 'life-threatening').length
  const resolvedCount = events.filter(e => e.status === 'resolved').length

  return (
    <div>
      {/* topbar */}
      <div className="topbar">
        <span className="topbar-title">Adverse Events</span>
        <div className="topbar-right" style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setShowScan(true); setScanResult(null); setScanPatient('') }}>
            <Zap size={14} /> Scan Patient
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowModal(true); resetForm() }}>
            <Plus size={14} /> Report Event
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 32px' }}>

        {/* stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Total Events',          value: total,        color: '#374151', bg: '#f9fafb', border: '#e5e7eb' },
            { label: 'Open',                  value: openCount,    color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
            { label: 'Severe / Life-threat.', value: severeCount,  color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
            { label: 'Resolved',              value: resolvedCount, color: '#059669', bg: '#f0fdf4', border: '#bbf7d0' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filterPatient} onChange={e => setFilterPatient(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', minWidth: 180 }}>
            <option value="">All Patients</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none' }}>
            <option value="">All Severities</option>
            <option value="mild">Mild</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
            <option value="life-threatening">Life-threatening</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none' }}>
            <option value="">All Statuses</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="monitoring">Monitoring</option>
          </select>
        </div>

        {/* list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 10px' }} />
          </div>
        ) : events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '72px 20px', color: '#9ca3af' }}>
            <Shield size={44} style={{ display: 'block', margin: '0 auto 14px', opacity: .3 }} />
            <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 6 }}>No adverse events reported</div>
            <div style={{ fontSize: 13 }}>Click "Report Event" to log a new adverse event, or "Scan Patient" to run an AI scan.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {events.map(ev => {
              const isOpen = expanded === ev.id
              const sb = severityBadge(ev.severity)
              const stb = statusBadge(ev.status)
              const cb = ev.causality ? causalityBadge(ev.causality) : null
              let ai = null
              try { ai = ev.ai_assessment ? (typeof ev.ai_assessment === 'string' ? JSON.parse(ev.ai_assessment) : ev.ai_assessment) : null } catch {}

              return (
                <div key={ev.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', borderLeft: `4px solid ${severityBorder(ev.severity)}` }}>
                  <div style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
                    onClick={() => setExpanded(isOpen ? null : ev.id)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{ev.event_type}</span>
                        <Badge label={ev.severity} color={sb.color} bg={sb.bg} />
                        {cb && <Badge label={ev.causality} color={cb.color} bg={cb.bg} />}
                        <Badge label={stb.label} color={stb.color} bg={stb.bg} />
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {ev.patient_name && <span style={{ fontWeight: 600, color: '#374151' }}>{ev.patient_name}</span>}
                        {ev.suspected_medication && <span style={{ fontStyle: 'italic' }}>{ev.suspected_medication}</span>}
                        <span>{new Date(ev.detected_at || ev.created_at).toLocaleDateString()}</span>
                        {ev.detection_method === 'ai_detected' && <Badge label="AI Detected" color="#7c3aed" bg="#f5f3ff" />}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {ev.status !== 'resolved' && (
                        <button onClick={e => { e.stopPropagation(); handleResolve(ev.id) }}
                          style={{ padding: '4px 10px', border: '1px solid #bbf7d0', borderRadius: 7, background: '#f0fdf4', color: '#059669', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle2 size={12} /> Resolve
                        </button>
                      )}
                      <button onClick={e => { e.stopPropagation(); handleDelete(ev.id) }} disabled={deleting === ev.id}
                        style={{ padding: '4px 8px', border: '1px solid #fecaca', borderRadius: 7, background: '#fff', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        {deleting === ev.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={12} />}
                      </button>
                      {isOpen ? <ChevronUp size={15} color="#9ca3af" /> : <ChevronDown size={15} color="#9ca3af" />}
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ borderTop: '1px solid #f3f4f6', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Description</div>
                        <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{ev.description}</p>
                      </div>

                      {ai && (
                        <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '14px 16px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>AI Assessment</div>
                          {ai.causality_reasoning && (
                            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
                              <strong>Causality reasoning:</strong> {ai.causality_reasoning}
                            </p>
                          )}
                          {ai.recommended_action && (
                            <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
                              <strong>Recommended action:</strong> {ai.recommended_action}
                            </p>
                          )}
                          {ai.signal_strength && (
                            <div style={{ marginTop: 8 }}>
                              <Badge label={`Signal: ${ai.signal_strength}`} color="#7c3aed" bg="#ede9fe" />
                            </div>
                          )}
                        </div>
                      )}

                      {ev.medwatch_draft && (
                        <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em' }}>MedWatch Draft</span>
                            <button onClick={() => copyText(ev.medwatch_draft, ev.id + '_mw')}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 11, cursor: 'pointer' }}>
                              {copied === ev.id + '_mw' ? <><Check size={11} color="#059669" /> Copied</> : <><Copy size={11} /> Copy</>}
                            </button>
                          </div>
                          <textarea readOnly value={ev.medwatch_draft} rows={4}
                            style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 12, color: '#374151', resize: 'vertical', background: '#fff', boxSizing: 'border-box', lineHeight: 1.6 }} />
                        </div>
                      )}

                      {ev.notes && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Notes</div>
                          <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{ev.notes}</p>
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

      {/* ── Report Event Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '28px 16px', overflowY: 'auto' }}
          onClick={e => e.target === e.currentTarget && !saving && setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 540, boxShadow: '0 24px 64px rgba(0,0,0,.22)', marginBottom: 28 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>Report Adverse Event</div>
              <button onClick={() => { setShowModal(false); resetForm() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}><X size={18} /></button>
            </div>

            {saveResult ? (
              <div style={{ padding: '24px' }}>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <CheckCircle2 size={36} color="#059669" style={{ display: 'block', margin: '0 auto 10px' }} />
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#111827', marginBottom: 4 }}>Event Reported</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>AI causality assessment complete</div>
                </div>
                <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '16px' }}>
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>Causality: </span>
                    <Badge label={saveResult.causality || 'unclassified'} {...causalityBadge(saveResult.causality)} />
                  </div>
                  {saveResult.causality_reasoning && (
                    <p style={{ margin: '0 0 8px', fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{saveResult.causality_reasoning}</p>
                  )}
                  {saveResult.recommended_action && (
                    <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
                      <strong>Action:</strong> {saveResult.recommended_action}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => { setShowModal(false); resetForm() }}>Done</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSave} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <FL>Patient *</FL>
                  <select value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))} required
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                    <option value="">— Select patient —</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <FL>Event Type *</FL>
                  <input list="event-suggestions" value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))} required
                    placeholder="e.g. Drug Reaction, Lab Abnormality…"
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  <datalist id="event-suggestions">
                    {EVENT_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                  </datalist>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <FL>Severity</FL>
                    <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                      <option value="mild">Mild</option>
                      <option value="moderate">Moderate</option>
                      <option value="severe">Severe</option>
                      <option value="life-threatening">Life-threatening</option>
                    </select>
                  </div>
                  <div>
                    <FL>Date of Event</FL>
                    <input type="date" value={form.detected_at} onChange={e => setForm(f => ({ ...f, detected_at: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div>
                  <FL>Suspected Medication</FL>
                  <input value={form.suspected_medication} onChange={e => setForm(f => ({ ...f, suspected_medication: e.target.value }))}
                    placeholder="e.g. Metformin 500mg"
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <FL>Description *</FL>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required rows={4}
                    placeholder="Describe the adverse event in detail…"
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowModal(false); resetForm() }}>Cancel</button>
                  <button type="submit" disabled={saving || !form.patient_id || !form.event_type || !form.description} className="btn btn-primary btn-sm">
                    {saving ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : 'Report & Analyze'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── AI Scan Modal ──────────────────────────────────────────────────── */}
      {showScan && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '28px 16px', overflowY: 'auto' }}
          onClick={e => e.target === e.currentTarget && !scanning && setShowScan(false)}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, boxShadow: '0 24px 64px rgba(0,0,0,.22)', marginBottom: 28 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>AI Adverse Event Scan</div>
              <button onClick={() => setShowScan(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              {!scanResult ? (
                <form onSubmit={handleScan} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ padding: '12px 16px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 9, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
                    The AI will analyze the patient's medications, conditions, lab results, and existing events to detect potential adverse drug event signals.
                  </div>
                  <div>
                    <FL>Select Patient *</FL>
                    <select value={scanPatient} onChange={e => setScanPatient(e.target.value)} required
                      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                      <option value="">— Select patient —</option>
                      {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowScan(false)}>Cancel</button>
                    <button type="submit" disabled={scanning || !scanPatient} className="btn btn-primary btn-sm">
                      {scanning ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Scanning…</> : <><Zap size={13} /> Run AI Scan</>}
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CheckCircle2 size={20} color="#059669" />
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>Scan complete for {scanResult.patient_name}</span>
                  </div>
                  {scanResult.auto_created > 0 && (
                    <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 14 }}>
                      Auto-created {scanResult.auto_created} strong signal{scanResult.auto_created !== 1 ? 's' : ''} as open events
                    </div>
                  )}
                  {scanResult.signals?.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af' }}>
                      <Shield size={32} style={{ display: 'block', margin: '0 auto 10px', opacity: .4 }} />
                      <div style={{ fontSize: 13 }}>No adverse event signals detected</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {scanResult.signals.map((s, i) => {
                        const strengthColor = s.signal_strength === 'strong' ? '#dc2626' : s.signal_strength === 'moderate' ? '#d97706' : '#6b7280'
                        const strengthBg    = s.signal_strength === 'strong' ? '#fee2e2' : s.signal_strength === 'moderate' ? '#fef3c7' : '#f3f4f6'
                        return (
                          <div key={i} style={{ border: `1px solid #e5e7eb`, borderLeft: `4px solid ${severityBorder(s.severity)}`, borderRadius: 9, padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 5 }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{s.event_type}</span>
                              <Badge label={s.severity} {...severityBadge(s.severity)} />
                              <Badge label={`Signal: ${s.signal_strength}`} color={strengthColor} bg={strengthBg} />
                            </div>
                            {s.suspected_medication && (
                              <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', marginBottom: 5 }}>{s.suspected_medication}</div>
                            )}
                            <p style={{ margin: '0 0 6px', fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{s.description}</p>
                            {s.recommended_action && (
                              <p style={{ margin: 0, fontSize: 12, color: '#2563eb', fontWeight: 600 }}>Action: {s.recommended_action}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => { setShowScan(false); setScanResult(null); setScanPatient('') }}>Done</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
