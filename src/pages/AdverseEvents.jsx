import React, { useState, useEffect, useCallback } from 'react'
import {
  AlertOctagon, Plus, Shield, Loader2, X, ChevronDown, ChevronUp,
  Trash2, CheckCircle2, Copy, Check, Zap, BarChart2, FileText, Activity
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function Badge({ label, color, bg }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color, background: bg }}>{label}</span>
  )
}

function severityStyle(severity) {
  const map = {
    high:             { color: '#b91c1c', bg: '#fee2e2', border: '#dc2626' },
    life_threatening: { color: '#9f1239', bg: '#fff1f2', border: '#e11d48' },
    'life-threatening': { color: '#9f1239', bg: '#fff1f2', border: '#e11d48' },
    moderate:         { color: '#92400e', bg: '#fef3c7', border: '#d97706' },
    low:              { color: '#047857', bg: '#d1fae5', border: '#10b981' },
    mild:             { color: '#047857', bg: '#d1fae5', border: '#10b981' },
    severe:           { color: '#b91c1c', bg: '#fee2e2', border: '#dc2626' },
  }
  return map[severity] || { color: '#6b7280', bg: '#f3f4f6', border: '#9ca3af' }
}

function statusStyle(status) {
  if (status === 'open') return { color: '#1d4ed8', bg: '#eff6ff', label: 'Open' }
  if (status === 'under_review') return { color: '#92400e', bg: '#fef3c7', label: 'Under Review' }
  if (status === 'resolved' || status === 'closed') return { color: '#374151', bg: '#f3f4f6', label: 'Closed' }
  if (status === 'monitoring') return { color: '#2563eb', bg: '#dbeafe', label: 'Monitoring' }
  return { color: '#6b7280', bg: '#f3f4f6', label: status }
}

function signalStrengthStyle(s) {
  if (s === 'strong') return { color: '#b91c1c', bg: '#fee2e2' }
  if (s === 'moderate') return { color: '#92400e', bg: '#fef3c7' }
  return { color: '#6b7280', bg: '#f3f4f6' }
}

function StatCard({ label, value, color, bg, border }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  )
}

function FL({ children }) {
  return <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{children}</label>
}

const inputStyle = { width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }

/* ─── EventCard ──────────────────────────────────────────────────────────── */
function EventCard({ ev, apiKey, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(null)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)

  const sv = severityStyle(ev.severity)
  const st = statusStyle(ev.status)

  let medwatch = null
  try { medwatch = ev.medwatch_sections ? (typeof ev.medwatch_sections === 'string' ? JSON.parse(ev.medwatch_sections) : ev.medwatch_sections) : null } catch {}
  if (!medwatch && ev.medwatch_draft) medwatch = { narrative: ev.medwatch_draft }

  let fhir = null
  try { fhir = ev.fhir_adverse_event ? (typeof ev.fhir_adverse_event === 'string' ? JSON.parse(ev.fhir_adverse_event) : ev.fhir_adverse_event) : null } catch {}

  function copyText(text, id) {
    navigator.clipboard.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(null), 2000) })
  }

  async function setStatus(status) {
    setLoading(true)
    await fetch(`/api/adverse-events/${ev.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ status })
    })
    onRefresh()
    setLoading(false)
  }

  async function reportFDA() {
    if (!window.confirm('Mark this event as reported to FDA MedWatch?')) return
    setLoading(true)
    const r = await fetch(`/api/adverse-events/${ev.id}/report-fda`, { method: 'POST', headers: { 'x-api-key': apiKey } })
    if (r.ok) { setToast('Reported to FDA'); setTimeout(() => setToast(null), 3000) }
    onRefresh()
    setLoading(false)
  }

  async function deleteEv() {
    if (!window.confirm('Delete this adverse event?')) return
    setLoading(true)
    await fetch(`/api/adverse-events/${ev.id}`, { method: 'DELETE', headers: { 'x-api-key': apiKey } })
    onRefresh()
    setLoading(false)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', borderLeft: `4px solid ${sv.border}` }}>
      {toast && (
        <div style={{ background: '#d1fae5', color: '#047857', padding: '6px 14px', fontSize: 12, fontWeight: 600 }}>{toast}</div>
      )}
      <div style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
        onClick={() => setOpen(o => !o)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{ev.event_type?.replace(/_/g, ' ')}</span>
            <Badge label={ev.severity} color={sv.color} bg={sv.bg} />
            <Badge label={st.label} color={st.color} bg={st.bg} />
            {ev.near_miss == 1 && <Badge label="Near Miss" color="#c2410c" bg="#fff7ed" />}
            {ev.reported_to_fda == 1 && <Badge label="FDA Reported" color="#047857" bg="#d1fae5" />}
            {ev.detection_method === 'automated_lab_scan' && <Badge label="Auto-Detected" color="#7c3aed" bg="#f5f3ff" />}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {ev.patient_name && <span style={{ fontWeight: 600, color: '#374151' }}>{ev.patient_name}</span>}
            {ev.suspected_medication && <span style={{ fontStyle: 'italic' }}>{ev.suspected_medication}{ev.suspected_medication_dose ? ` (${ev.suspected_medication_dose})` : ''}</span>}
            <span>{new Date(ev.detected_at || ev.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={e => { e.stopPropagation(); deleteEv() }} disabled={loading}
            style={{ padding: '4px 8px', border: '1px solid #fecaca', borderRadius: 7, background: '#fff', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            {loading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={12} />}
          </button>
          {open ? <ChevronUp size={15} color="#9ca3af" /> : <ChevronDown size={15} color="#9ca3af" />}
        </div>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid #f3f4f6', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Detection */}
          <Section title="Detection">
            <div style={{ fontSize: 13, color: '#374151', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <span><strong>Method:</strong> {ev.detection_method?.replace(/_/g, ' ') || 'manual'}</span>
              <span><strong>Detected:</strong> {ev.detected_at ? new Date(ev.detected_at).toLocaleString() : '—'}</span>
            </div>
            {ev.lab_trigger && (
              <div style={{ marginTop: 6, fontSize: 13, color: '#374151' }}>
                <strong>Lab Trigger:</strong> {ev.lab_trigger} = {ev.lab_value} (threshold: {ev.lab_threshold})
              </div>
            )}
          </Section>

          {/* Clinical Details */}
          <Section title="Clinical Details">
            <div style={{ fontSize: 13, color: '#374151', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', flexWrap: 'wrap' }}>
              {ev.suspected_medication && <span><strong>Suspected Med:</strong> {ev.suspected_medication}{ev.suspected_medication_dose ? ` — ${ev.suspected_medication_dose}` : ''}</span>}
              {ev.onset_date && <span><strong>Onset:</strong> {ev.onset_date}</span>}
              {ev.causality && <span><strong>Causality:</strong> {ev.causality}</span>}
              {ev.outcome && <span><strong>Outcome:</strong> {ev.outcome}</span>}
            </div>
            {ev.description && <p style={{ margin: '8px 0 0', fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{ev.description}</p>}
            {ev.actions_taken && <p style={{ margin: '6px 0 0', fontSize: 13, color: '#374151' }}><strong>Actions Taken:</strong> {ev.actions_taken}</p>}
          </Section>

          {/* Root Cause */}
          <Section title="Root Cause">
            <p style={{ margin: 0, fontSize: 13, color: ev.root_cause ? '#374151' : '#9ca3af', lineHeight: 1.6 }}>
              {ev.root_cause || '(pending analysis)'}
            </p>
          </Section>

          {/* FHIR */}
          {fhir && (
            <Section title="FHIR AdverseEvent">
              <div style={{ background: '#1e293b', borderRadius: 8, padding: '12px 14px', position: 'relative' }}>
                <button onClick={() => copyText(JSON.stringify(fhir, null, 2), ev.id + '_fhir')}
                  style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', border: '1px solid #334155', borderRadius: 6, background: '#334155', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}>
                  {copied === ev.id + '_fhir' ? <><Check size={11} color="#10b981" /> Copied</> : <><Copy size={11} /> Copy</>}
                </button>
                <pre style={{ margin: 0, fontSize: 11, color: '#e2e8f0', overflowX: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{JSON.stringify(fhir, null, 2)}</pre>
              </div>
            </Section>
          )}

          {/* MedWatch Draft */}
          {medwatch && (
            <Section title="MedWatch Draft">
              <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                  <button onClick={() => copyText(JSON.stringify(medwatch, null, 2), ev.id + '_mw')}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 11, cursor: 'pointer' }}>
                    {copied === ev.id + '_mw' ? <><Check size={11} color="#059669" /> Copied</> : <><Copy size={11} /> Copy</>}
                  </button>
                </div>
                {typeof medwatch === 'object' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {Object.entries(medwatch).map(([k, v]) => (
                      <div key={k}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: '#374151', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}: </span>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 12, color: '#374151', lineHeight: 1.6 }}>{medwatch}</p>
                )}
              </div>
            </Section>
          )}

          {/* Actions Row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid #f3f4f6' }}>
            {ev.status !== 'under_review' && ev.status !== 'resolved' && ev.status !== 'closed' && (
              <button onClick={() => setStatus('under_review')} disabled={loading}
                style={{ padding: '5px 12px', border: '1px solid #fde68a', borderRadius: 7, background: '#fffbeb', color: '#92400e', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                Mark Under Review
              </button>
            )}
            {ev.status !== 'closed' && ev.status !== 'resolved' && (
              <button onClick={() => setStatus('closed')} disabled={loading}
                style={{ padding: '5px 12px', border: '1px solid #e5e7eb', borderRadius: 7, background: '#f9fafb', color: '#374151', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                Close Event
              </button>
            )}
            <button onClick={reportFDA} disabled={loading || ev.reported_to_fda == 1}
              style={{ padding: '5px 12px', border: '1px solid #fecaca', borderRadius: 7, background: ev.reported_to_fda == 1 ? '#f3f4f6' : '#fef2f2', color: ev.reported_to_fda == 1 ? '#9ca3af' : '#dc2626', fontSize: 12, cursor: ev.reported_to_fda == 1 ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
              {ev.reported_to_fda == 1 ? `Reported ${ev.reported_to_fda_at ? new Date(ev.reported_to_fda_at).toLocaleDateString() : ''}` : 'Report to FDA'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── main component ─────────────────────────────────────────────────────── */
export default function AdverseEvents() {
  const { key } = useKey()

  const [tab, setTab] = useState('events')
  const [events, setEvents] = useState([])
  const [patients, setPatients] = useState([])
  const [signals, setSignals] = useState([])
  const [stats, setStats] = useState({ total: 0, open: 0, serious: 0, near_miss: 0, fda_reported: 0, signals: 0 })
  const [loading, setLoading] = useState(true)
  const [signalsLoading, setSignalsLoading] = useState(false)
  const [aggLoading, setAggLoading] = useState(false)
  const [toast, setToast] = useState(null)

  // New event modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    patient_id: '', event_type: 'medication_error', severity: 'moderate', suspected_medication: '',
    suspected_medication_dose: '', onset_date: '', description: '', causality: 'possible',
    outcome: 'unknown', actions_taken: '', near_miss: false
  })
  const [saving, setSaving] = useState(false)

  // Scan
  const [scanPatient, setScanPatient] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch('/api/adverse-events/stats', { headers: { 'x-api-key': key } })
      if (r.ok) setStats(await r.json())
    } catch {}
  }, [key])

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/adverse-events', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setEvents(Array.isArray(d) ? d : (d.events || []))
    } catch { setEvents([]) }
    setLoading(false)
  }, [key])

  const loadSignals = useCallback(async () => {
    setSignalsLoading(true)
    try {
      const r = await fetch('/api/adverse-events/signals', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setSignals(d.signals || [])
    } catch { setSignals([]) }
    setSignalsLoading(false)
  }, [key])

  const loadPatients = useCallback(async () => {
    try {
      const r = await fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPatients(d.patients || [])
    } catch {}
  }, [key])

  function refresh() { loadEvents(); loadStats() }

  useEffect(() => {
    if (!key) return
    loadEvents(); loadStats(); loadPatients()
  }, [key])

  useEffect(() => {
    if (key && tab === 'signals') loadSignals()
  }, [key, tab])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await fetch('/api/adverse-events', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ ...form, near_miss: form.near_miss ? 1 : 0 })
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Save failed')
      showToast('Adverse event reported successfully')
      setShowModal(false)
      resetForm()
      refresh()
    } catch (err) { alert(err.message) }
    setSaving(false)
  }

  function resetForm() {
    setForm({ patient_id: '', event_type: 'medication_error', severity: 'moderate', suspected_medication: '', suspected_medication_dose: '', onset_date: '', description: '', causality: 'possible', outcome: 'unknown', actions_taken: '', near_miss: false })
  }

  async function handleScan() {
    if (!scanPatient) return
    setScanning(true); setScanResult(null)
    try {
      const r = await fetch(`/api/adverse-events/scan/${scanPatient}`, { method: 'POST', headers: { 'x-api-key': key } })
      const d = await r.json()
      setScanResult(d)
      if (d.events_created?.length) { showToast(`${d.events_created.length} signal(s) detected and logged`); refresh() }
      else showToast('Scan complete — no new signals found')
    } catch (err) { alert(err.message) }
    setScanning(false)
  }

  async function runAggregate() {
    setAggLoading(true)
    try {
      const r = await fetch('/api/adverse-events/aggregate', { method: 'POST', headers: { 'x-api-key': key } })
      const d = await r.json()
      setSignals(d.signals || [])
      showToast(`Analysis complete — ${d.signals?.length || 0} signal(s) identified`)
      loadStats()
    } catch (err) { alert(err.message) }
    setAggLoading(false)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  const nearMissEvents = events.filter(e => e.near_miss == 1)
  const medwatchEvents = events.filter(e => e.medwatch_draft || e.medwatch_sections)

  const tabs = [
    { id: 'events', label: 'Events', icon: <AlertOctagon size={14} /> },
    { id: 'near_miss', label: 'Near Misses', icon: <Shield size={14} /> },
    { id: 'signals', label: 'Signal Dashboard', icon: <BarChart2 size={14} /> },
    { id: 'medwatch', label: 'MedWatch Reports', icon: <FileText size={14} /> },
  ]

  return (
    <div>
      {/* topbar */}
      <div className="topbar">
        <span className="topbar-title">Adverse Event Detection & Pharmacovigilance</span>
        <div className="topbar-right" style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setScanResult(null); setScanPatient('') }}>
            <Zap size={14} /> ADE Scan
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowModal(true); resetForm() }}>
            <Plus size={14} /> Report Event
          </button>
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 2000, background: '#111827', color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,.3)' }}>
          {toast}
        </div>
      )}

      <div style={{ padding: '24px 32px' }}>

        {/* subtitle */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#dc2626,#ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AlertOctagon size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 20, color: '#111827' }}>Adverse Event Detection & Pharmacovigilance</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Automated ADE detection · FHIR AdverseEvent · MedWatch reporting · Signal analysis</div>
            </div>
          </div>

          {/* stats strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
            <StatCard label="Total Events" value={stats.total} color="#374151" bg="#f9fafb" border="#e5e7eb" />
            <StatCard label="Open" value={stats.open} color="#1d4ed8" bg="#eff6ff" border="#bfdbfe" />
            <StatCard label="Serious" value={stats.serious} color="#b91c1c" bg="#fee2e2" border="#fecaca" />
            <StatCard label="Near Misses" value={stats.near_miss} color="#c2410c" bg="#fff7ed" border="#fed7aa" />
            <StatCard label="FDA Reported" value={stats.fda_reported} color="#047857" bg="#d1fae5" border="#6ee7b7" />
            <StatCard label="Active Signals" value={stats.signals} color="#7c3aed" bg="#f5f3ff" border="#ddd6fe" />
          </div>
        </div>

        {/* scan bar */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <Activity size={16} color="#7c3aed" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Automated Lab Scan:</span>
          <select value={scanPatient} onChange={e => setScanPatient(e.target.value)}
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', flex: 1, minWidth: 180 }}>
            <option value="">— Select patient —</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={handleScan} disabled={scanning || !scanPatient} className="btn btn-primary btn-sm">
            {scanning ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Scanning…</> : <><Zap size={13} /> Run ADE Scan</>}
          </button>
          {scanResult && (
            <span style={{ fontSize: 12, color: scanResult.events_created?.length ? '#b91c1c' : '#047857', fontWeight: 600 }}>
              {scanResult.events_created?.length ? `${scanResult.events_created.length} signal(s) detected` : 'No new signals found'}
            </span>
          )}
        </div>

        {/* tabs */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '2px solid #f3f4f6' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 'none', borderBottom: tab === t.id ? '2px solid #dc2626' : '2px solid transparent', background: 'none', color: tab === t.id ? '#dc2626' : '#6b7280', fontSize: 13, fontWeight: tab === t.id ? 700 : 500, cursor: 'pointer', marginBottom: -2 }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* EVENTS TAB */}
        {tab === 'events' && (
          loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#9ca3af', display: 'block', margin: '0 auto 10px' }} />
            </div>
          ) : events.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '72px 20px', color: '#9ca3af' }}>
              <Shield size={44} style={{ display: 'block', margin: '0 auto 14px', opacity: .3 }} />
              <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 6 }}>No adverse events reported</div>
              <div style={{ fontSize: 13 }}>Click "Report Event" to log a new event, or run an automated scan.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {events.map(ev => <EventCard key={ev.id} ev={ev} apiKey={key} onRefresh={refresh} />)}
            </div>
          )
        )}

        {/* NEAR MISSES TAB */}
        {tab === 'near_miss' && (
          nearMissEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '72px 20px', color: '#9ca3af' }}>
              <Shield size={44} style={{ display: 'block', margin: '0 auto 14px', opacity: .3 }} />
              <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 6 }}>No near-miss events</div>
              <div style={{ fontSize: 13 }}>Near-miss events are flagged when you report an event with the "Near Miss" checkbox.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {nearMissEvents.map(ev => <EventCard key={ev.id} ev={ev} apiKey={key} onRefresh={refresh} />)}
            </div>
          )
        )}

        {/* SIGNAL DASHBOARD TAB */}
        {tab === 'signals' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <button onClick={runAggregate} disabled={aggLoading} className="btn btn-primary btn-sm">
                {aggLoading ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Running…</> : <><BarChart2 size={13} /> Run Population Analysis</>}
              </button>
            </div>
            {signalsLoading ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#9ca3af' }} />
              </div>
            ) : signals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
                <BarChart2 size={44} style={{ display: 'block', margin: '0 auto 14px', opacity: .3 }} />
                <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 6 }}>No population signals yet</div>
                <div style={{ fontSize: 13 }}>Run Population Analysis to detect disproportionality signals across your patient population.</div>
              </div>
            ) : (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      {['Medication', 'Event Type', 'Cases', 'ROR', 'Signal Strength', 'First Seen', 'Last Seen', 'Status'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {signals.map((s, i) => {
                      const ss = signalStrengthStyle(s.signal_strength)
                      return (
                        <tr key={s.id || i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: '#111827' }}>{s.medication}</td>
                          <td style={{ padding: '10px 14px', color: '#374151' }}>{s.event_type?.replace(/_/g, ' ')}</td>
                          <td style={{ padding: '10px 14px', color: '#374151', fontWeight: 700 }}>{s.case_count}</td>
                          <td style={{ padding: '10px 14px', color: '#374151' }}>{s.ror ? s.ror.toFixed(2) : '—'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {s.signal_strength ? <Badge label={s.signal_strength} color={ss.color} bg={ss.bg} /> : '—'}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#6b7280' }}>{s.first_seen ? new Date(s.first_seen).toLocaleDateString() : '—'}</td>
                          <td style={{ padding: '10px 14px', color: '#6b7280' }}>{s.last_seen ? new Date(s.last_seen).toLocaleDateString() : '—'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <Badge label={s.status || 'active'} color={s.status === 'active' ? '#1d4ed8' : '#6b7280'} bg={s.status === 'active' ? '#eff6ff' : '#f3f4f6'} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* MEDWATCH TAB */}
        {tab === 'medwatch' && (
          medwatchEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '72px 20px', color: '#9ca3af' }}>
              <FileText size={44} style={{ display: 'block', margin: '0 auto 14px', opacity: .3 }} />
              <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 6 }}>No MedWatch drafts yet</div>
              <div style={{ fontSize: 13 }}>MedWatch drafts are generated automatically when you report an adverse event.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {medwatchEvents.map(ev => {
                let mw = null
                try { mw = ev.medwatch_sections ? (typeof ev.medwatch_sections === 'string' ? JSON.parse(ev.medwatch_sections) : ev.medwatch_sections) : { narrative: ev.medwatch_draft } } catch { mw = { narrative: ev.medwatch_draft } }
                return (
                  <div key={ev.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Patient</span>
                          <Badge label={ev.event_type?.replace(/_/g, ' ')} color="#1d4ed8" bg="#eff6ff" />
                          {ev.reported_to_fda == 1 && <Badge label={`Reported to FDA ${ev.reported_to_fda_at ? new Date(ev.reported_to_fda_at).toLocaleDateString() : ''}`} color="#047857" bg="#d1fae5" />}
                        </div>
                        {ev.suspected_medication && <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>Suspect product: {ev.suspected_medication}</div>}
                      </div>
                      <button onClick={async () => {
                        if (!window.confirm('Mark as reported to FDA MedWatch?')) return
                        const r = await fetch(`/api/adverse-events/${ev.id}/report-fda`, { method: 'POST', headers: { 'x-api-key': key } })
                        if (r.ok) { showToast('Reported to FDA'); refresh() }
                      }} disabled={ev.reported_to_fda == 1}
                        style={{ padding: '6px 14px', border: '1px solid #fecaca', borderRadius: 8, background: ev.reported_to_fda == 1 ? '#f3f4f6' : '#fef2f2', color: ev.reported_to_fda == 1 ? '#9ca3af' : '#dc2626', fontSize: 12, cursor: ev.reported_to_fda == 1 ? 'not-allowed' : 'pointer', fontWeight: 600, flexShrink: 0 }}>
                        {ev.reported_to_fda == 1 ? 'Already Reported' : 'Report to FDA'}
                      </button>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px' }}>
                      {mw && typeof mw === 'object' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {mw.narrative && <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6 }}><strong>Narrative:</strong> {mw.narrative}</p>}
                          {mw.event_description && <p style={{ margin: 0, fontSize: 13, color: '#374151' }}><strong>Event:</strong> {mw.event_description}</p>}
                          {mw.reporter_comments && <p style={{ margin: 0, fontSize: 13, color: '#374151' }}><strong>Comments:</strong> {mw.reporter_comments}</p>}
                        </div>
                      ) : (
                        <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{String(mw || '')}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* ── New Event Modal ───────────────────────────────────────────────────── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '28px 16px', overflowY: 'auto' }}
          onClick={e => e.target === e.currentTarget && !saving && setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 600, boxShadow: '0 24px 64px rgba(0,0,0,.22)', marginBottom: 28 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>Report Adverse Event</div>
              <button onClick={() => { setShowModal(false); resetForm() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <FL>Patient *</FL>
                <select value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))} required style={inputStyle}>
                  <option value="">— Select patient —</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <FL>Event Type *</FL>
                  <select value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))} required style={inputStyle}>
                    <option value="medication_error">Medication Error</option>
                    <option value="allergic_reaction">Allergic Reaction</option>
                    <option value="drug_toxicity">Drug Toxicity</option>
                    <option value="fall">Fall</option>
                    <option value="pressure_injury">Pressure Injury</option>
                    <option value="surgical_site_infection">Surgical Site Infection</option>
                    <option value="near_miss_medication">Near Miss — Medication</option>
                    <option value="near_miss_fall">Near Miss — Fall</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <FL>Severity *</FL>
                  <select value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))} style={inputStyle}>
                    <option value="low">Low</option>
                    <option value="moderate">Moderate</option>
                    <option value="high">High</option>
                    <option value="life_threatening">Life-Threatening</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="near_miss" checked={form.near_miss} onChange={e => setForm(f => ({ ...f, near_miss: e.target.checked }))} />
                <label htmlFor="near_miss" style={{ fontSize: 13, color: '#374151', cursor: 'pointer', fontWeight: 600 }}>Near Miss (no harm occurred, but potential for harm existed)</label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <FL>Suspected Medication</FL>
                  <input value={form.suspected_medication} onChange={e => setForm(f => ({ ...f, suspected_medication: e.target.value }))}
                    placeholder="e.g. Warfarin" style={inputStyle} />
                </div>
                <div>
                  <FL>Dose</FL>
                  <input value={form.suspected_medication_dose} onChange={e => setForm(f => ({ ...f, suspected_medication_dose: e.target.value }))}
                    placeholder="e.g. 5mg daily" style={inputStyle} />
                </div>
              </div>
              <div>
                <FL>Onset Date</FL>
                <input type="date" value={form.onset_date} onChange={e => setForm(f => ({ ...f, onset_date: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <FL>Description *</FL>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required rows={3}
                  placeholder="Describe the adverse event in clinical detail…" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <FL>Causality</FL>
                  <select value={form.causality} onChange={e => setForm(f => ({ ...f, causality: e.target.value }))} style={inputStyle}>
                    <option value="certain">Certain</option>
                    <option value="probable">Probable</option>
                    <option value="possible">Possible</option>
                    <option value="unlikely">Unlikely</option>
                    <option value="unassessable">Unassessable</option>
                  </select>
                </div>
                <div>
                  <FL>Outcome</FL>
                  <select value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))} style={inputStyle}>
                    <option value="recovering">Recovering</option>
                    <option value="recovered">Recovered</option>
                    <option value="not_recovered">Not Recovered</option>
                    <option value="fatal">Fatal</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>
              </div>
              <div>
                <FL>Actions Taken</FL>
                <textarea value={form.actions_taken} onChange={e => setForm(f => ({ ...f, actions_taken: e.target.value }))} rows={2}
                  placeholder="e.g. Medication discontinued, patient monitored, physician notified…" style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowModal(false); resetForm() }}>Cancel</button>
                <button type="submit" disabled={saving || !form.patient_id || !form.event_type || !form.description} className="btn btn-primary btn-sm">
                  {saving ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : 'Report & Analyze'}
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
