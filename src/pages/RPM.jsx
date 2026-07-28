import React, { useState, useEffect } from 'react'
import { Activity, Heart, Thermometer, Wind, Droplets, AlertTriangle, AlertCircle, Plus, RefreshCw, Users, Search, UserMinus, Wand2, X, Clock } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import AiHelp from '../components/AiHelp.jsx'
import PatientSnapshot from '../components/PatientSnapshot.jsx'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'

const VITALS_CONFIG = [
  { key: 'heart_rate',     label: 'Heart Rate',     unit: 'bpm',   icon: Heart,        normal: [60, 100],  critical: [40, 130], color: 'var(--danger)' },
  { key: 'spo2',           label: 'SpO2',            unit: '%',     icon: Droplets,     normal: [95, 100],  critical: [90, 100], color: 'var(--primary)' },
  { key: 'systolic_bp',   label: 'Systolic BP',     unit: 'mmHg',  icon: Activity,     normal: [90, 140],  critical: [70, 180], color: '#8b5cf6' },
  { key: 'diastolic_bp',  label: 'Diastolic BP',    unit: 'mmHg',  icon: Activity,     normal: [60, 90],   critical: [40, 120], color: '#7c3aed' },
  { key: 'temperature',   label: 'Temperature',     unit: '°C',    icon: Thermometer,  normal: [36.1, 37.5], critical: [35, 39], color: '#f97316' },
  { key: 'resp_rate',     label: 'Resp. Rate',      unit: '/min',  icon: Wind,         normal: [12, 20],   critical: [8, 30],  color: '#06b6d4' },
]

function statusFor(key, val) {
  const cfg = VITALS_CONFIG.find(v => v.key === key)
  if (!cfg || val === '' || val === null) return 'normal'
  const n = parseFloat(val)
  if (n < cfg.critical[0] || n > cfg.critical[1]) return 'critical'
  if (n < cfg.normal[0]   || n > cfg.normal[1])   return 'warning'
  return 'normal'
}

// Worst status across every tracked vital in a single reading — drives the
// roster-wide triage dot/sort so a patient shows red the moment ANY vital
// (not just the one currently in view) goes critical.
function worstStatusFor(reading) {
  if (!reading) return 'none'
  let worst = 'normal'
  for (const cfg of VITALS_CONFIG) {
    const s = statusFor(cfg.key, reading[cfg.key])
    if (s === 'critical') return 'critical'
    if (s === 'warning') worst = 'warning'
  }
  return worst
}

const STATUS_RANK = { critical: 0, warning: 1, normal: 2, none: 3 }

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
  const [form, setForm] = useState({ patient_id: '', heart_rate: '', spo2: '', systolic_bp: '', diastolic_bp: '', temperature: '', resp_rate: '', note: '' })
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAddPatient, setShowAddPatient] = useState(false)
  const [newPatient, setNewPatient] = useState({ condition: '' })
  const [roster, setRoster] = useState([])
  const [rosterSearch, setRosterSearch] = useState('')
  const [pickedPatient, setPickedPatient] = useState(null)
  const [showDisenroll, setShowDisenroll] = useState(false)
  const [disenrolling, setDisenrolling] = useState(false)
  const [aiSuggesting, setAiSuggesting] = useState(false)

  useEffect(() => { if (key) loadPatients() }, [key])
  useEffect(() => { if (selected) loadReadings(selected.id) }, [selected])
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

  async function saveReading(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await fetch(`/api/rpm/patients/${form.patient_id}/readings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(form)
      })
      setAdding(false)
      setForm({ patient_id: '', heart_rate: '', spo2: '', systolic_bp: '', diastolic_bp: '', temperature: '', resp_rate: '', note: '' })
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
        })
      })
      setShowAddPatient(false)
      setPickedPatient(null)
      setRosterSearch('')
      setNewPatient({ condition: '' })
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
  // don't have to eyeball each value against normal ranges by hand.
  async function aiSuggestNote() {
    if (!form.patient_id || aiSuggesting) return
    setAiSuggesting(true)
    try {
      const r = await fetch(`/api/rpm/patients/${form.patient_id}/readings/ai-suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(form),
      })
      const d = await r.json()
      if (d.note) setForm(f => ({ ...f, note: d.note }))
    } catch {} finally { setAiSuggesting(false) }
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
  // stay accurate no matter which patient (if any) is currently open.
  const rosterStatus = Object.fromEntries(patients.map(p => [p.id, worstStatusFor(patientLatest[p.id])]))
  const statusCounts = patients.reduce((acc, p) => {
    const s = rosterStatus[p.id]
    if (s === 'critical' || s === 'warning') acc[s]++
    return acc
  }, { critical: 0, warning: 0 })

  const filteredPatients = patients
    .filter(p => p.name?.toLowerCase().includes(search.toLowerCase()) || p.condition?.toLowerCase().includes(search.toLowerCase()))
    .filter(p => statusFilter === 'all' || rosterStatus[p.id] === statusFilter)
    .sort((a, b) => STATUS_RANK[rosterStatus[a.id]] - STATUS_RANK[rosterStatus[b.id]] || a.name.localeCompare(b.name))

  const filteredReadings = readings.filter(r => {
    if (!readingSearch.trim()) return true
    const q = readingSearch.toLowerCase()
    return r.note?.toLowerCase().includes(q) ||
      formatReadingTime(r.recorded_at, true).toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">Remote Patient Monitoring</span>
        <div className="topbar-right">
          <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddPatient(true) }}>
            <Plus size={14} /> Add Patient
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => { setAdding(true); setForm(f => ({ ...f, patient_id: selected?.id || '' })) }}>
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

      {!key && (
        <div style={{ margin: '20px 32px 0', background: 'var(--warning-light)', border: '1px solid var(--warning-light)', borderRadius: 'var(--radius)', padding: '16px 20px', color: 'var(--warning)' }}>
          Connect with your doctor key (Logs page) to access RPM features.
        </div>
      )}

      <div className="list-detail-layout">
        {/* Patient List */}
        <div>
          <div className="card">
            <div className="card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
              <span className="card-title">
                Enrolled Patients <span style={{ color: 'var(--primary)' }}>({patients.length})</span>
              </span>
              <div style={{ position: 'relative' }}>
                <Search size={13} color="var(--text3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patients or condition…"
                  style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px 7px 28px', fontSize: 12.5, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { key: 'all', label: 'All', color: 'var(--text2)' },
                  { key: 'critical', label: `Critical (${statusCounts.critical})`, color: 'var(--danger)' },
                  { key: 'warning', label: `Out of range (${statusCounts.warning})`, color: 'var(--warning)' },
                ].map(f => (
                  <button key={f.key} type="button" onClick={() => setStatusFilter(s => s === f.key ? 'all' : f.key)}
                    style={{
                      padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      border: `1px solid ${statusFilter === f.key ? f.color : 'var(--border)'}`,
                      background: statusFilter === f.key ? f.color : 'var(--surface)',
                      color: statusFilter === f.key ? '#fff' : f.color,
                    }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              {filteredPatients.length === 0 && (
                <div className="empty-state" style={{ padding: '24px 16px' }}>
                  <p>{patients.length === 0 ? <>No patients found.<br />Click "Add Patient" to start.</> : 'No patients match this filter.'}</p>
                </div>
              )}
              {filteredPatients.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--border)',
                    background: selected?.id === p.id ? 'linear-gradient(90deg, var(--primary-light), var(--surface))' : 'var(--surface)',
                    borderLeft: selected?.id === p.id ? '3px solid var(--primary)' : '3px solid transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'background .15s'
                  }}
                  onMouseEnter={e => { if (selected?.id !== p.id) e.currentTarget.style.background = 'var(--surface2)' }}
                  onMouseLeave={e => { if (selected?.id !== p.id) e.currentTarget.style.background = 'var(--surface)' }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,var(--primary),var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 12, fontWeight: 700 }}>
                    {initials(p.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>{p.condition || 'No condition set'}</div>
                  </div>
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
            <div className="card empty-state" style={{ padding: '56px 28px' }}>
              <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Activity size={28} color="var(--primary)" />
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: 'var(--text)' }}>Select a patient</div>
              <p style={{ fontSize: 13.5 }}>Choose a patient from the list to view their vitals and trends.</p>
            </div>
          ) : (
            <>
              {/* Vitals cards */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg,var(--primary),var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800 }}>
                      {initials(selected.name)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>{selected.name}</div>
                      {readings.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--text3)', marginTop: 1 }}>
                          <Clock size={11} /> Vitals updated {timeAgo(latest.recorded_at)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => loadReadings(selected.id)}>
                      <RefreshCw size={12} /> Refresh
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowDisenroll(true)} title="Disenroll from RPM"
                      style={{ color: 'var(--danger)' }}>
                      <UserMinus size={12} /> Disenroll
                    </button>
                  </div>
                </div>
                <PatientSnapshot patient={selected} compact />
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
                      <Search size={12} color="var(--text3)" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }} />
                      <input value={readingSearch} onChange={e => setReadingSearch(e.target.value)} placeholder="Search date or note…"
                        style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 9px 6px 26px', fontSize: 12, boxSizing: 'border-box', outline: 'none' }} />
                    </div>
                  )}
                </div>
                {readings.length === 0 ? (
                  <div className="empty-state"><p>No readings logged yet.</p></div>
                ) : filteredReadings.length === 0 ? (
                  <div className="empty-state"><p>No readings match "{readingSearch}".</p></div>
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

      {/* Add Reading Modal */}
      {adding && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setAdding(false)}>
          <form onSubmit={saveReading} className="animate-fade-up" style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.24)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Activity size={17} color="var(--primary)" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Log Vital Reading</div>
              </div>
              <button type="button" onClick={() => setAdding(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                <button type="button" onClick={autofillFromLast} disabled={!readings.length}
                  style={{ padding: '5px 11px', borderRadius: 8, border: '1px dashed var(--primary-light)', background: readings.length ? 'var(--primary-light)' : 'var(--surface2)', color: readings.length ? 'var(--primary-dark)' : 'var(--text3)', fontSize: 11.5, fontWeight: 600, cursor: readings.length ? 'pointer' : 'default' }}>
                  Copy Last Reading
                </button>
                <button type="button" onClick={autofillNormalRange}
                  style={{ padding: '5px 11px', borderRadius: 8, border: '1px dashed var(--primary-light)', background: 'var(--primary-light)', color: 'var(--primary-dark)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                  Use Normal Range
                </button>
                <button type="button" onClick={aiSuggestNote} disabled={!form.patient_id || aiSuggesting}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, border: '1px dashed var(--primary-light)', background: form.patient_id ? 'var(--primary-light)' : 'var(--surface2)', color: form.patient_id ? 'var(--primary-dark)' : 'var(--text3)', fontSize: 11.5, fontWeight: 600, cursor: form.patient_id ? 'pointer' : 'default' }}>
                  <Wand2 size={12} /> {aiSuggesting ? 'Drafting…' : 'AI Suggest Note'}
                </button>
              </div>
              <div style={{ marginBottom: 15 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 5 }}>Patient</label>
                <select value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))} required
                  style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }}>
                  <option value="">— select —</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 15 }}>
                {VITALS_CONFIG.map(cfg => (
                  <div key={cfg.key}>
                    <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 4 }}>{cfg.label} ({cfg.unit})</label>
                    <input type="number" step="any" value={form[cfg.key]} onChange={e => setForm(f => ({ ...f, [cfg.key]: e.target.value }))}
                      placeholder={`${cfg.normal[0]}–${cfg.normal[1]}`}
                      style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 4 }}>Note (optional)</label>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2}
                  style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
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
          onClick={e => { if (e.target === e.currentTarget) { setShowAddPatient(false); setPickedPatient(null); setRosterSearch('') } }}>
          <form onSubmit={addPatient} className="animate-fade-up" style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.24)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Users size={17} color="var(--primary)" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Enroll in RPM</div>
              </div>
              <button type="button" onClick={() => { setShowAddPatient(false); setPickedPatient(null); setRosterSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--text2)' }}>Select an existing patient from your Patients list — demographics are pulled in automatically.</p>

              {!pickedPatient ? (
                <>
                  <div style={{ position: 'relative', marginBottom: 10 }}>
                    <Search size={13} color="var(--text3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                    <input value={rosterSearch} onChange={e => setRosterSearch(e.target.value)} placeholder="Search patients by name…" autoFocus
                      style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px 8px 30px', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, maxHeight: 260, overflowY: 'auto', marginBottom: 16 }}>
                    {roster.filter(p => p.name?.toLowerCase().includes(rosterSearch.toLowerCase()) && !patients.some(rp => rp.name === p.name && rp.dob === p.dob)).length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: 12.5 }}>
                        {roster.length === 0 ? 'No patients found — add one in the Patients page first.' : 'No matches (or already enrolled).'}
                      </div>
                    ) : (
                      roster
                        .filter(p => p.name?.toLowerCase().includes(rosterSearch.toLowerCase()) && !patients.some(rp => rp.name === p.name && rp.dob === p.dob))
                        .slice(0, 30)
                        .map(p => (
                          <button key={p.id} type="button" onClick={() => setPickedPatient(p)}
                            style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
                            <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,var(--primary),var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                              {initials(p.name)}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{p.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{p.dob || 'DOB unknown'}{p.conditions ? ` · ${p.conditions}` : ''}</div>
                            </div>
                          </button>
                        ))
                    )}
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--primary-light)', border: '1px solid var(--primary-light)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,var(--primary),var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {initials(pickedPatient.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>{pickedPatient.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{pickedPatient.dob || 'DOB unknown'}</div>
                  </div>
                  <button type="button" onClick={() => setPickedPatient(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 11.5, fontWeight: 700 }}>Change</button>
                </div>
              )}

              <div style={{ marginBottom: 4 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 5 }}>Primary Condition</label>
                <input type="text" value={newPatient.condition}
                  placeholder={pickedPatient?.conditions || 'e.g. Hypertension'}
                  onChange={e => setNewPatient(p => ({ ...p, condition: e.target.value }))}
                  style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setShowAddPatient(false); setPickedPatient(null); setRosterSearch('') }} className="btn btn-secondary btn-sm">Cancel</button>
              <button type="submit" disabled={!pickedPatient} className="btn btn-primary btn-sm">Enroll</button>
            </div>
          </form>
        </div>
      )}

      {/* Disenroll Confirm Modal */}
      {showDisenroll && selected && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowDisenroll(false)}>
          <div className="animate-fade-up" style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 400, boxShadow: '0 24px 64px rgba(0,0,0,.24)', padding: '24px 24px 20px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--danger-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <UserMinus size={24} color="var(--danger)" />
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Disenroll {selected.name}?</h2>
            <p style={{ fontSize: 13.5, color: 'var(--text2)', margin: '0 0 24px', lineHeight: 1.5 }}>
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
