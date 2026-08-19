import React, { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { Activity, Heart, Thermometer, Wind, Droplets, AlertTriangle, AlertCircle, Plus, RefreshCw, Users, Search, UserMinus, Wand2, X, Clock, Wifi, WifiOff } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import AiHelp from '../components/AiHelp.jsx'
import PatientSnapshot from '../components/PatientSnapshot.jsx'
import EmptyState from '../components/EmptyState.jsx'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { VITALS_REF, vitalStatus, worstVitalStatus } from '../utils/vitalsRef.js'

// Icon/color are presentational and RPM-specific, so they stay local — the
// normal/critical ranges themselves come from VITALS_REF, shared with the CCM
// Care Plan Panel's Vitals section so the two pages can't silently disagree on
// what counts as abnormal.
const VITAL_ICON  = { heart_rate: Heart, spo2: Droplets, systolic_bp: Activity, diastolic_bp: Activity, temperature: Thermometer, resp_rate: Wind }
const VITAL_COLOR = { heart_rate: 'var(--danger)', spo2: 'var(--primary)', systolic_bp: '#8b5cf6', diastolic_bp: '#7c3aed', temperature: '#f97316', resp_rate: '#06b6d4' }
const VITALS_CONFIG = VITALS_REF.map(v => ({ ...v, icon: VITAL_ICON[v.key], color: VITAL_COLOR[v.key] }))

const statusFor = vitalStatus
// Worst status across every tracked vital in a single reading — drives the
// roster-wide triage dot/sort so a patient shows red the moment ANY vital
// (not just the one currently in view) goes critical.
const worstStatusFor = worstVitalStatus

const STATUS_RANK = { critical: 0, warning: 1, normal: 2, none: 3 }

// A device counts as "online" if it has reported a reading within the last 48h —
// generous enough to tolerate a missed daily sync without flagging every patient
// offline, but tight enough to surface a device that's actually stopped transmitting.
// This is also what CPT 99454 (16+ of 30 days) needs the data for; the badge here is
// just the at-a-glance version of the same signal.
const DEVICE_ONLINE_WINDOW_MS = 48 * 60 * 60 * 1000
function deviceOnlineFor(reading) {
  if (!reading?.recorded_at) return false
  return Date.now() - new Date(reading.recorded_at).getTime() < DEVICE_ONLINE_WINDOW_MS
}

function timeAgo(iso) {
  if (!iso) return null
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days}d ago`
}

const STATUS_COLORS = { normal: 'var(--success)', warning: 'var(--warning)', critical: 'var(--danger)' }
const STATUS_BG     = { normal: 'var(--success-light)', warning: 'var(--warning-light)', critical: 'var(--danger-light)' }
const STATUS_BORDER = { normal: 'rgba(5,150,105,.25)', warning: 'rgba(217,119,6,.25)', critical: 'rgba(220,38,38,.25)' }
// Kept as a literal hex (not a CSS var) because AiHelp concatenates alpha-suffixes onto it (e.g. `${accent}cc`).
// Matches the app's real --primary color instead of RPM's old standalone cyan.
const ACCENT = '#0e7490'

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

// Includes the date whenever the visible readings span more than one calendar
// day, so trend points stay unambiguous instead of showing bare "HH:MM" for
// readings logged a day apart.
function formatReadingTime(iso, includeDate) {
  const d = new Date(iso)
  return includeDate
    ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function VitalsTrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 13px', boxShadow: 'var(--shadow-md)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, marginTop: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--text2)' }}>{p.name}</span>
          <span style={{ fontWeight: 700, color: 'var(--text)', marginLeft: 'auto' }}>
            {p.value ?? '—'}{p.value != null ? (p.dataKey === 'hr' ? ' bpm' : ' %') : ''}
          </span>
        </div>
      ))}
    </div>
  )
}


export default function RPM() {
  const { key } = useKey()
  const [patients, setPatients] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [readings, setReadings] = useState([])
  const [readingSearch, setReadingSearch] = useState('')
  const [patientLatest, setPatientLatest] = useState({}) // { [patientId]: latestReading } — roster-wide vitals awareness
  const [form, setForm] = useState({ patient_id: '', heart_rate: '', spo2: '', systolic_bp: '', diastolic_bp: '', temperature: '', resp_rate: '', note: '', minutes: '', call_id: '' })
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [relatedCalls, setRelatedCalls] = useState([])
  const [showAddPatient, setShowAddPatient] = useState(false)
  const [newPatient, setNewPatient] = useState({ condition: '', call_id: '' })
  // Calls tied to the picked roster patient, offered as a "Related Call" at
  // enrollment time — mirrors CCM's enrollCalls, looked up by gen_patients id
  // before an RPM enrollment row exists.
  const [enrollCalls, setEnrollCalls] = useState([])
  const [roster, setRoster] = useState([])
  const [rosterSearch, setRosterSearch] = useState('')
  const [pickedPatient, setPickedPatient] = useState(null)
  const [showDisenroll, setShowDisenroll] = useState(false)
  const [disenrolling, setDisenrolling] = useState(false)
  const [aiSuggesting, setAiSuggesting] = useState(false)

  useEffect(() => { if (key) loadPatients() }, [key])
  useEffect(() => { if (selected) { loadReadings(selected.id); loadRelatedCalls(selected.id) } }, [selected])
  useEffect(() => { if (key && showAddPatient) loadRoster() }, [key, showAddPatient])

  // Enrollment pulls demographics from the existing Patients roster
  // (gen_patients) instead of retyping name/DOB by hand.
  async function loadRoster() {
    try {
      const r = await fetch('/api/patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setRoster(Array.isArray(d) ? d : [])
    } catch {}
  }

  async function loadPatients() {
    try {
      const r = await fetch('/api/rpm/patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      const list = d.patients || []
      setPatients(list)
      loadLatestVitals(list)
    } catch {}
  }

  // The patient list endpoint only returns demographics — it has no idea which
  // patients currently have critical/abnormal vitals. Without this, "Critical
  // Vitals Now" / "Out of Range Now" only ever reflected the ONE currently
  // selected patient (showing 0 for everyone else, even mid-crisis). Pulling
  // each patient's latest reading once up front makes the roster stats and
  // the sidebar's triage dots reflect reality instead of whoever's open.
  async function loadLatestVitals(list) {
    const entries = await Promise.all(list.map(async p => {
      try {
        const r = await fetch(`/api/rpm/patients/${p.id}/readings`, { headers: { 'x-api-key': key } })
        const d = await r.json()
        return [p.id, (d.readings || [])[0] || null]
      } catch { return [p.id, null] }
    }))
    setPatientLatest(Object.fromEntries(entries))
  }

  async function loadReadings(pid) {
    try {
      const r = await fetch(`/api/rpm/patients/${pid}/readings`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      const list = d.readings || []
      setReadings(list)
      setPatientLatest(pl => ({ ...pl, [pid]: list[0] || null }))
    } catch {}
  }

  // Calls (patient<->doctor or family<->doctor) tied to this patient, so
  // monitoring time logged right after a call can be linked to it — mirrors CCM.
  async function loadRelatedCalls(pid) {
    try {
      const r = await fetch(`/api/rpm/patients/${pid}/calls`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setRelatedCalls(d.calls || [])
    } catch { setRelatedCalls([]) }
  }

  // Calls already logged for this roster patient before RPM enrollment exists —
  // e.g. the setup/education call itself — so it can be linked right at
  // enrollment instead of requiring a separate reading afterward.
  async function loadEnrollCalls(genPatientId) {
    try {
      const r = await fetch(`/api/patients/${genPatientId}/calls`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setEnrollCalls(d.calls || [])
    } catch { setEnrollCalls([]) }
  }

  async function saveReading(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const r = await fetch(`/api/rpm/patients/${form.patient_id}/readings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(form)
      })
      const d = await r.json().catch(() => ({}))
      if (d.auto_billed) toast.success('20+ min of monitoring time this month — CPT 99457 auto-drafted in Billing')
      setAdding(false)
      setForm({ patient_id: '', heart_rate: '', spo2: '', systolic_bp: '', diastolic_bp: '', temperature: '', resp_rate: '', note: '', minutes: '', call_id: '' })
      if (selected) loadReadings(selected.id)
    } finally { setSaving(false) }
  }

  async function addPatient(e) {
    e.preventDefault()
    if (!pickedPatient) return
    try {
      await fetch('/api/rpm/patients', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({
          name: pickedPatient.name,
          dob: pickedPatient.dob,
          condition: newPatient.condition || pickedPatient.conditions || '',
          gen_patient_id: pickedPatient.id,
          call_id: newPatient.call_id || undefined,
        })
      })
      setShowAddPatient(false)
      setPickedPatient(null)
      setRosterSearch('')
      setEnrollCalls([])
      setNewPatient({ condition: '', call_id: '' })
      loadPatients()
    } catch {}
  }

  // Cuts data-entry time for routine readings — pulls the patient's last
  // recorded vitals or a clinically-normal baseline into the form instead
  // of requiring every field to be typed by hand.
  function autofillFromLast() {
    if (!latest || !readings.length) return
    setForm(f => ({
      ...f,
      heart_rate: latest.heart_rate ?? f.heart_rate,
      spo2: latest.spo2 ?? f.spo2,
      systolic_bp: latest.systolic_bp ?? f.systolic_bp,
      diastolic_bp: latest.diastolic_bp ?? f.diastolic_bp,
      temperature: latest.temperature ?? f.temperature,
      resp_rate: latest.resp_rate ?? f.resp_rate,
    }))
  }

  function autofillNormalRange() {
    setForm(f => {
      const next = { ...f }
      VITALS_CONFIG.forEach(cfg => { next[cfg.key] = String(Math.round((cfg.normal[0] + cfg.normal[1]) / 2)) })
      return next
    })
  }

  // Drafts a short clinical note interpreting the entered vitals so staff
  // don't have to eyeball each value against normal ranges by hand. Accepts
  // explicit patientId/formOverride so it can be fired right after a patient
  // is picked, before React has committed the corresponding setForm update.
  async function aiSuggestNote(patientId = form.patient_id, formOverride = form) {
    if (!patientId || aiSuggesting) return
    setAiSuggesting(true)
    try {
      const r = await fetch(`/api/rpm/patients/${patientId}/readings/ai-suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ ...formOverride, patient_id: patientId }),
      })
      const d = await r.json()
      if (d.note) setForm(f => ({ ...f, note: d.note }))
    } catch {} finally { setAiSuggesting(false) }
  }

  // Removes manual data entry from the Log Reading flow entirely: the moment
  // a patient is picked, vitals seed from their last recorded reading (or a
  // clinically-normal baseline if they have no history yet) and a note drafts
  // automatically — everything stays editable, nothing starts blank.
  function autofillPatientReading(patientId) {
    if (!patientId) { setForm(f => ({ ...f, patient_id: '' })); return }
    const last = patientLatest[patientId]
    const vitals = {}
    VITALS_CONFIG.forEach(cfg => {
      vitals[cfg.key] = last?.[cfg.key] != null ? String(last[cfg.key]) : String(Math.round((cfg.normal[0] + cfg.normal[1]) / 2))
    })
    setForm(f => ({ ...f, patient_id: patientId, ...vitals }))
    aiSuggestNote(patientId, vitals)
  }

  function closeAddPatient() {
    setShowAddPatient(false)
    setPickedPatient(null)
    setRosterSearch('')
    setEnrollCalls([])
    setNewPatient({ condition: '', call_id: '' })
  }

  async function disenrollPatient() {
    setDisenrolling(true)
    try {
      await fetch(`/api/rpm/patients/${selected.id}`, { method: 'DELETE', headers: { 'x-api-key': key } })
      setShowDisenroll(false)
      setSelected(null)
      loadPatients()
    } finally { setDisenrolling(false) }
  }

  const recentReadings = readings.slice().reverse().slice(-7)
  const chartSpansMultipleDays = recentReadings.length > 0 &&
    new Date(recentReadings[0].recorded_at).toDateString() !== new Date(recentReadings[recentReadings.length - 1].recorded_at).toDateString()
  const chartData = recentReadings.map(r => ({
    time: formatReadingTime(r.recorded_at, chartSpansMultipleDays),
    hr:   r.heart_rate != null ? Number(r.heart_rate) : null,
    spo2: r.spo2 != null ? Number(r.spo2) : null,
  }))

  const latest = readings[0] || {}

  // Roster-wide vital status — computed once from the latest-reading map so the
  // sidebar dots, sort order and top stat cards all agree with each other and
  // stay accurate no matter which patient (if any) is currently open. Memoized
  // on [patients, patientLatest] so it doesn't re-run on every keystroke in the
  // roster search box below.
  const rosterStatus = useMemo(
    () => Object.fromEntries(patients.map(p => [p.id, worstStatusFor(patientLatest[p.id])])),
    [patients, patientLatest]
  )
  const rosterOnline = useMemo(
    () => Object.fromEntries(patients.map(p => [p.id, deviceOnlineFor(patientLatest[p.id])])),
    [patients, patientLatest]
  )
  const statusCounts = useMemo(() => patients.reduce((acc, p) => {
    const s = rosterStatus[p.id]
    if (s === 'critical' || s === 'warning') acc[s]++
    return acc
  }, { critical: 0, warning: 0 }), [patients, rosterStatus])

  const filteredPatients = useMemo(() => patients
    .filter(p => p.name?.toLowerCase().includes(search.toLowerCase()) || p.condition?.toLowerCase().includes(search.toLowerCase()))
    .filter(p => statusFilter === 'all' || rosterStatus[p.id] === statusFilter)
    .sort((a, b) => STATUS_RANK[rosterStatus[a.id]] - STATUS_RANK[rosterStatus[b.id]] || a.name.localeCompare(b.name)),
    [patients, rosterStatus, search, statusFilter]
  )

  const filteredReadings = useMemo(() => readings.filter(r => {
    if (!readingSearch.trim()) return true
    const q = readingSearch.toLowerCase()
    return r.note?.toLowerCase().includes(q) ||
      formatReadingTime(r.recorded_at, true).toLowerCase().includes(q)
  }), [readings, readingSearch])

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">Remote Patient Monitoring</span>
        <div className="topbar-right">
          <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddPatient(true) }}>
            <Plus size={14} /> Add Patient
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { setAdding(true); if (selected?.id) autofillPatientReading(selected.id) }}>
            <Activity size={14} /> Log Reading
          </button>
        </div>
      </div>

      <div className="stats-grid">
        {[
          { label: 'Enrolled Patients', value: patients.length, icon: Users, bg: 'var(--primary-light)', color: 'var(--primary)' },
          { label: 'Critical Vitals Now', value: statusCounts.critical, icon: AlertTriangle, bg: 'var(--danger-light)', color: 'var(--danger)' },
          { label: 'Out of Range Now', value: statusCounts.warning, icon: AlertCircle, bg: 'var(--warning-light)', color: 'var(--warning)' },
          { label: 'Readings (Selected)', value: readings.length, icon: Activity, bg: 'var(--primary-light)', color: 'var(--primary)' },
        ].map(s => (
          <div key={s.label} className="card stat-card">
            <div className="stat-icon" style={{ background: s.bg }}><s.icon size={19} color={s.color} /></div>
            <div className="stat-val">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '24px 32px 40px', maxWidth: 1280, margin: '0 auto' }}>

        {!key && (
          <div style={{ marginBottom: 20, background: 'var(--warning-light)', border: '1px solid var(--warning-light)', borderRadius: 'var(--radius)', padding: '14px 20px', color: 'var(--warning)', fontSize: 13, fontWeight: 600 }}>
            Connect with your doctor key (Logs page) to access RPM features.
          </div>
        )}

        <div className="list-detail-layout">
        {/* Patient List */}
        <div>
          <div className="card">
            <div className="card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
              <span className="card-title">
                Enrolled Patients <span style={{ color: 'var(--text3)', fontWeight: 500 }}>({patients.length})</span>
              </span>
              <div style={{ position: 'relative' }}>
                <Search size={13} color="var(--text3)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patients or condition…"
                  className="form-input" style={{ paddingLeft: 30, padding: '8px 12px 8px 30px', fontSize: 13 }} />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { key: 'all', label: 'All', color: 'var(--text2)' },
                  { key: 'critical', label: `Critical (${statusCounts.critical})`, color: 'var(--danger)' },
                  { key: 'warning', label: `Out of range (${statusCounts.warning})`, color: 'var(--warning)' },
                ].map(f => (
                  <button key={f.key} type="button" onClick={() => setStatusFilter(s => s === f.key ? 'all' : f.key)}
                    style={{
                      padding: '5px 12px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                      border: `1px solid ${statusFilter === f.key ? f.color : 'var(--border)'}`,
                      background: statusFilter === f.key ? f.color : '#fff',
                      color: statusFilter === f.key ? '#fff' : f.color, whiteSpace: 'nowrap',
                    }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              {filteredPatients.length === 0 && (
                <EmptyState icon={Users} title="No patients found"
                  hint={patients.length === 0 ? 'Click "Add Patient" to enroll someone in RPM.' : 'Try a different search term or status filter.'} />
              )}
              {filteredPatients.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '13px 16px', border: 'none', borderBottom: '1px solid var(--border)',
                    background: selected?.id === p.id ? 'linear-gradient(90deg, var(--primary-light), var(--surface))' : 'var(--surface)',
                    borderLeft: selected?.id === p.id ? '3px solid var(--primary)' : '3px solid transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'background .15s'
                  }}
                  onMouseEnter={e => { if (selected?.id !== p.id) e.currentTarget.style.background = 'var(--surface2)' }}
                  onMouseLeave={e => { if (selected?.id !== p.id) e.currentTarget.style.background = 'var(--surface)' }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,var(--primary),var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 12.5, fontWeight: 700 }}>
                    {initials(p.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.condition || 'No condition set'}</div>
                  </div>
                  {rosterStatus[p.id] !== 'none' && (
                    rosterOnline[p.id]
                      ? <Wifi size={12} title="Device online — reading within 48h" color="var(--success)" style={{ flexShrink: 0 }} />
                      : <WifiOff size={12} title="Device offline — no reading in 48h+" color="var(--text3)" style={{ flexShrink: 0 }} />
                  )}
                  {rosterStatus[p.id] !== 'none' && (
                    <span title={rosterStatus[p.id] === 'critical' ? 'Critical vitals' : rosterStatus[p.id] === 'warning' ? 'Out of range' : 'Vitals normal'}
                      style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, background: STATUS_COLORS[rosterStatus[p.id]] }} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div>
          {!selected ? (
            <div className="card" style={{ padding: '64px 28px', textAlign: 'center', color: 'var(--text3)' }}>
              <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Activity size={28} color="var(--primary)" />
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: 'var(--text)' }}>Select a patient</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>Choose a patient from the list to view their vitals and trends.</div>
            </div>
          ) : (
            <>
              {/* Patient header */}
              <div className="card" style={{ padding: '24px 28px', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg,var(--primary),var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 19, fontWeight: 800, flexShrink: 0 }}>
                      {initials(selected.name)}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--text)', letterSpacing: '-.01em' }}>{selected.name}</div>
                        <span title={deviceOnlineFor(latest) ? 'Device online — reading within 48h' : 'Device offline — no reading in 48h+'}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: deviceOnlineFor(latest) ? 'var(--success-light)' : 'var(--surface2)', color: deviceOnlineFor(latest) ? 'var(--success)' : 'var(--text3)' }}>
                          {deviceOnlineFor(latest) ? <Wifi size={11} /> : <WifiOff size={11} />}
                          {deviceOnlineFor(latest) ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      {readings.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
                          <Clock size={11} /> Vitals updated {timeAgo(latest.recorded_at)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => loadReadings(selected.id)}>
                      <RefreshCw size={14} /> Refresh
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowDisenroll(true)} title="Disenroll from RPM"
                      style={{ color: 'var(--danger)' }}>
                      <UserMinus size={14} /> Disenroll
                    </button>
                  </div>
                </div>
              </div>

              <PatientSnapshot patient={selected} compact />

              {/* Vitals cards */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Activity size={16} color="var(--primary)" />
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', letterSpacing: '-.01em' }}>Latest Vitals</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
                  {VITALS_CONFIG.map(cfg => {
                    const val = latest[cfg.key]
                    const st  = statusFor(cfg.key, val)
                    const Icon = cfg.icon
                    return (
                      <div key={cfg.key} className="card" style={{ background: STATUS_BG[st], border: `1px solid ${STATUS_BORDER[st]}`, borderRadius: 16, padding: '22px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', transition: 'transform .15s', cursor: 'default', boxShadow: 'none' }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                          <Icon size={16} color={cfg.color} />
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{cfg.label}</span>
                        </div>
                        <div style={{ fontSize: 32, fontWeight: 800, color: STATUS_COLORS[st], lineHeight: 1.1 }}>
                          {val ?? '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{cfg.unit} · normal {cfg.normal[0]}–{cfg.normal[1]}</div>
                        {st === 'critical' && <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--danger)', fontWeight: 700 }}><AlertTriangle size={12} /> CRITICAL</div>}
                        {st === 'warning'  && <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--warning)', fontWeight: 700 }}><AlertTriangle size={12} /> Out of range</div>}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Trend chart */}
              {chartData.length > 1 && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="card-header">
                    <div>
                      <span className="card-title">Vital Trends</span>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                        Last {chartData.length} reading{chartData.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text2)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)' }} /> Heart Rate
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} /> SpO2
                      </span>
                    </div>
                  </div>
                  <div className="card-body">
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={chartData} margin={{ top: 6, right: 6, left: -6, bottom: 0 }}>
                      <defs>
                        <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--danger)" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="var(--danger)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="spo2Grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="time" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                      <YAxis yAxisId="hr" tick={{ fontSize: 11, fill: 'var(--danger)' }} axisLine={false} tickLine={false} width={32}
                        domain={['dataMin - 10', 'dataMax + 10']} allowDecimals={false} allowDataOverflow />
                      <YAxis yAxisId="spo2" orientation="right" tick={{ fontSize: 11, fill: 'var(--primary)' }} axisLine={false} tickLine={false} width={36}
                        domain={[85, 100]} allowDecimals={false} allowDataOverflow />
                      <Tooltip content={<VitalsTrendTooltip />} cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '3 3' }} />
                      <ReferenceLine yAxisId="hr" y={100} stroke="var(--text3)" strokeDasharray="4 3" strokeOpacity={0.6} />
                      <ReferenceLine yAxisId="hr" y={60} stroke="var(--text3)" strokeDasharray="4 3" strokeOpacity={0.6}
                        label={{ value: 'HR normal range', position: 'insideBottomLeft', fontSize: 10, fill: 'var(--text3)' }} />
                      <Area yAxisId="hr" type="monotone" dataKey="hr" stroke="var(--danger)" strokeWidth={2.5} fill="url(#hrGrad)" name="Heart Rate"
                        dot={{ r: 3.5, fill: 'var(--danger)', stroke: 'var(--surface)', strokeWidth: 2 }} activeDot={{ r: 5.5 }} connectNulls />
                      <Area yAxisId="spo2" type="monotone" dataKey="spo2" stroke="var(--primary)" strokeWidth={2.5} fill="url(#spo2Grad)" name="SpO2"
                        dot={{ r: 3.5, fill: 'var(--primary)', stroke: 'var(--surface)', strokeWidth: 2 }} activeDot={{ r: 5.5 }} connectNulls />
                    </AreaChart>
                  </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Readings history */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Reading History <span style={{ color: 'var(--text3)', fontWeight: 500 }}>({filteredReadings.length}{filteredReadings.length !== readings.length ? ` of ${readings.length}` : ''})</span></span>
                  {readings.length > 0 && (
                    <div style={{ position: 'relative', width: 200, maxWidth: '45%' }}>
                      <Search size={12} color="var(--text3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                      <input value={readingSearch} onChange={e => setReadingSearch(e.target.value)} placeholder="Search date or note…"
                        className="form-input" style={{ paddingLeft: 28, padding: '6px 10px 6px 28px', fontSize: 12.5 }} />
                    </div>
                  )}
                </div>
                {readings.length === 0 ? (
                  <EmptyState icon={Activity} title="No readings logged yet" hint="Log a reading to start tracking this patient's vitals." />
                ) : filteredReadings.length === 0 ? (
                  <EmptyState icon={Search} title="No readings match your search" hint={`No results for "${readingSearch}".`} />
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {['Time', 'HR', 'SpO2', 'BP', 'Temp', 'RR', 'Note'].map(h => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredReadings.map(r => (
                          <tr key={r.id}>
                            <td style={{ color: 'var(--text2)', whiteSpace: 'nowrap' }}>{new Date(r.recorded_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                            <td style={{ color: STATUS_COLORS[statusFor('heart_rate', r.heart_rate)], fontWeight: 700 }}>{r.heart_rate ?? '—'}</td>
                            <td style={{ color: STATUS_COLORS[statusFor('spo2', r.spo2)], fontWeight: 700 }}>{r.spo2 ? `${r.spo2}%` : '—'}</td>
                            <td style={{ color: 'var(--text)' }}>{r.systolic_bp && r.diastolic_bp ? `${r.systolic_bp}/${r.diastolic_bp}` : '—'}</td>
                            <td style={{ color: STATUS_COLORS[statusFor('temperature', r.temperature)] }}>{r.temperature ?? '—'}</td>
                            <td style={{ color: STATUS_COLORS[statusFor('resp_rate', r.resp_rate)] }}>{r.resp_rate ?? '—'}</td>
                            <td style={{ color: 'var(--text2)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        </div>
      </div>

      {/* Add Reading Modal */}
      {adding && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setAdding(false)}>
          <form onSubmit={saveReading} className="animate-fade-up" style={{ background: 'var(--surface)', borderRadius: 16, width: 560, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.24)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Activity size={18} color="var(--primary)" />
                </div>
                <div>
                  <div style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.01em' }}>Log Vital Reading</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>Record a new set of vitals for this patient.</div>
                </div>
              </div>
              <button type="button" onClick={() => setAdding(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)', flexShrink: 0 }}><X size={18} /></button>
            </div>
            <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" onClick={autofillFromLast} disabled={!readings.length}
                  style={{ padding: '5px 11px', borderRadius: 8, border: '1px dashed var(--primary-light)', background: readings.length ? 'var(--primary-light)' : 'var(--surface2)', color: readings.length ? 'var(--primary-dark)' : 'var(--text3)', fontSize: 11.5, fontWeight: 600, cursor: readings.length ? 'pointer' : 'default' }}>
                  Copy Last Reading
                </button>
                <button type="button" onClick={autofillNormalRange}
                  style={{ padding: '5px 11px', borderRadius: 8, border: '1px dashed var(--primary-light)', background: 'var(--primary-light)', color: 'var(--primary-dark)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                  Use Normal Range
                </button>
                <button type="button" onClick={() => aiSuggestNote()} disabled={!form.patient_id || aiSuggesting}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, border: '1px dashed var(--primary-light)', background: form.patient_id ? 'var(--primary-light)' : 'var(--surface2)', color: form.patient_id ? 'var(--primary-dark)' : 'var(--text3)', fontSize: 11.5, fontWeight: 600, cursor: form.patient_id ? 'pointer' : 'default' }}>
                  <Wand2 size={12} /> {aiSuggesting ? 'Drafting…' : 'AI Suggest Note'}
                </button>
              </div>
              <div>
                <label className="form-label">Patient</label>
                <select value={form.patient_id} onChange={e => autofillPatientReading(e.target.value)} required
                  className="form-select">
                  <option value="">— select —</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Interactive Communication Time (minutes, optional)</label>
                <input type="number" min="0" value={form.minutes} onChange={e => setForm(f => ({ ...f, minutes: e.target.value }))}
                  placeholder="e.g. 20"
                  className="form-input" />
                <div className="form-hint">Need ≥ 20 min/month for CPT 99457 billing</div>
              </div>
              {relatedCalls.length > 0 && (
                <div>
                  <label className="form-label">Related Call <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span></label>
                  <select value={form.call_id} onChange={e => {
                    const callId = e.target.value
                    // Real captured call duration auto-fills minutes instead of retyping
                    // a guess — still fully editable afterward.
                    const call = relatedCalls.find(c => String(c.id) === callId)
                    setForm(f => ({ ...f, call_id: callId, minutes: call?.duration_minutes != null ? String(call.duration_minutes) : f.minutes }))
                  }}
                    className="form-select">
                    <option value="">Not tied to a call</option>
                    {relatedCalls.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.caller_role === 'family' ? `Family (${c.family_member_name || 'unnamed'})` : c.caller_role === 'doctor' ? 'Outbound' : 'Patient'} call · {new Date(c.created_at).toLocaleDateString()} · {c.duration_minutes != null ? `${c.duration_minutes} min` : c.status}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.04em' }}>Vitals</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {VITALS_CONFIG.map(cfg => (
                    <div key={cfg.key}>
                      <label className="form-label" style={{ fontSize: 12 }}>{cfg.label} ({cfg.unit})</label>
                      <input type="number" step="any" value={form[cfg.key]} onChange={e => setForm(f => ({ ...f, [cfg.key]: e.target.value }))}
                        placeholder={`${cfg.normal[0]}–${cfg.normal[1]}`}
                        className="form-input" />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label">Note (optional)</label>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2}
                  className="form-textarea" style={{ minHeight: 60 }} />
              </div>
            </div>
            <div style={{ padding: '16px 28px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
              <button type="button" onClick={() => setAdding(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
                {saving ? 'Saving…' : 'Save Reading'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Enroll Patient Modal — picks from the existing Patients roster instead of manual entry */}
      {showAddPatient && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) closeAddPatient() }}>
          <form onSubmit={addPatient} className="animate-fade-up" style={{ background: 'var(--surface)', borderRadius: 16, width: 480, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.24)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Users size={18} color="var(--primary)" />
                </div>
                <div>
                  <div style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.01em' }}>Enroll in RPM</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>Demographics are pulled in from the Patients list automatically.</div>
                </div>
              </div>
              <button type="button" onClick={closeAddPatient} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)', flexShrink: 0 }}><X size={18} /></button>
            </div>
            <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label className="form-label" style={{ marginBottom: 8 }}>Patient</label>
                {!pickedPatient ? (
                  <>
                    <div style={{ position: 'relative', marginBottom: 10 }}>
                      <Search size={13} color="var(--text3)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                      <input value={rosterSearch} onChange={e => setRosterSearch(e.target.value)} placeholder="Search patients by name…" autoFocus
                        className="form-input" style={{ paddingLeft: 30 }} />
                    </div>
                    <div style={{ border: '1px solid var(--border)', borderRadius: 10, maxHeight: 240, overflowY: 'auto' }}>
                      {roster.filter(p => p.name?.toLowerCase().includes(rosterSearch.toLowerCase()) && !patients.some(rp => rp.name === p.name && rp.dob === p.dob)).length === 0 ? (
                        <EmptyState icon={Search}
                          title={roster.length === 0 ? 'No patients found' : 'No matches'}
                          hint={roster.length === 0 ? 'Add a patient in the Patients page first.' : 'Try a different name, or this patient may already be enrolled.'}
                          compact />
                      ) : (
                        roster
                          .filter(p => p.name?.toLowerCase().includes(rosterSearch.toLowerCase()) && !patients.some(rp => rp.name === p.name && rp.dob === p.dob))
                          .slice(0, 30)
                          .map(p => (
                            <button key={p.id} type="button" onClick={() => { setPickedPatient(p); loadEnrollCalls(p.id) }}
                              style={{ width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-light)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
                              <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,var(--primary),var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                                {initials(p.name)}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{p.name}</div>
                                <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 1 }}>{p.dob || 'DOB unknown'}{p.conditions ? ` · ${p.conditions}` : ''}</div>
                              </div>
                            </button>
                          ))
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--primary-light)', border: '1px solid var(--primary)', borderRadius: 10, padding: '11px 14px' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,var(--primary),var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>
                      {initials(pickedPatient.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>{pickedPatient.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 1 }}>{pickedPatient.dob || 'DOB unknown'}</div>
                    </div>
                    <button type="button" onClick={() => { setPickedPatient(null); setEnrollCalls([]); setNewPatient(p => ({ ...p, call_id: '' })) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-dark)', fontSize: 11.5, fontWeight: 700, flexShrink: 0 }}>Change</button>
                  </div>
                )}
              </div>

              <div>
                <label className="form-label">Primary Condition</label>
                <input type="text" value={newPatient.condition}
                  placeholder={pickedPatient?.conditions || 'e.g. Hypertension'}
                  onChange={e => setNewPatient(p => ({ ...p, condition: e.target.value }))}
                  className="form-input" />
              </div>

              {pickedPatient && enrollCalls.length > 0 && (
                <div>
                  <label className="form-label">
                    Related Call <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional — links a completed setup/education call for billing)</span>
                  </label>
                  <select value={newPatient.call_id} onChange={e => setNewPatient(p => ({ ...p, call_id: e.target.value }))}
                    className="form-select">
                    <option value="">None</option>
                    {enrollCalls.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.caller_role === 'family' ? `Family (${c.family_member_name || 'unnamed'})` : c.caller_role === 'doctor' ? 'Outbound' : 'Patient'} call · {new Date(c.created_at).toLocaleDateString()} · {c.duration_minutes != null ? `${c.duration_minutes} min` : c.status}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div style={{ padding: '16px 28px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
              <button type="button" onClick={closeAddPatient} className="btn btn-secondary btn-sm">Cancel</button>
              <button type="submit" disabled={!pickedPatient} className="btn btn-primary btn-sm">Enroll</button>
            </div>
          </form>
        </div>
      )}

      {/* Disenroll Confirm Modal */}
      {showDisenroll && selected && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowDisenroll(false)}>
          <div className="animate-fade-up" style={{ background: 'var(--surface)', borderRadius: 16, width: 420, maxWidth: '95vw', boxShadow: '0 24px 64px rgba(0,0,0,.24)', padding: '28px 28px 24px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--danger-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <UserMinus size={24} color="var(--danger)" />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8, letterSpacing: '-.01em' }}>Disenroll {selected.name}?</div>
            <p style={{ fontSize: 13.5, color: 'var(--text2)', margin: '0 0 24px', lineHeight: 1.6 }}>
              This removes the patient from RPM along with their vitals reading history. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button type="button" onClick={() => setShowDisenroll(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button type="button" disabled={disenrolling} onClick={disenrollPatient} className="btn btn-danger btn-sm">
                {disenrolling ? 'Disenrolling…' : 'Disenroll'}
              </button>
            </div>
          </div>
        </div>
      )}
      <AiHelp module="rpm" accent={ACCENT} />
    </div>
  )
}
