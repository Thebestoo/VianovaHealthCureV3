import React, { useState, useEffect } from 'react'
import { Activity, Heart, Thermometer, Wind, Droplets, AlertTriangle, Plus, RefreshCw, Sparkles, Search, UserMinus, Wand2 } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'

const VITALS_CONFIG = [
  { key: 'heart_rate',     label: 'Heart Rate',     unit: 'bpm',   icon: Heart,        normal: [60, 100],  critical: [40, 130], color: '#ef4444' },
  { key: 'spo2',           label: 'SpO2',            unit: '%',     icon: Droplets,     normal: [95, 100],  critical: [90, 100], color: '#0ea5e9' },
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

const STATUS_COLORS = { normal: '#22c55e', warning: '#f59e0b', critical: '#ef4444' }
const STATUS_BG     = { normal: '#f0fdf4', warning: '#fffbeb', critical: '#fef2f2' }
const ACCENT = '#0ea5e9'

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

export default function RPM() {
  const { key } = useKey()
  const [patients, setPatients] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [readings, setReadings] = useState([])
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
      setPatients(d.patients || [])
    } catch {}
  }

  async function loadReadings(pid) {
    try {
      const r = await fetch(`/api/rpm/patients/${pid}/readings`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setReadings(d.readings || [])
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

  const chartData = readings.slice().reverse().slice(-20).map(r => ({
    time: new Date(r.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    hr:   r.heart_rate,
    spo2: r.spo2,
    sys:  r.systolic_bp,
    temp: r.temperature ? parseFloat(r.temperature) : null,
  }))

  const latest = readings[0] || {}
  const filteredPatients = patients.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()))
  const criticalCount = readings.length && selected ? VITALS_CONFIG.filter(cfg => statusFor(cfg.key, latest[cfg.key]) === 'critical').length : 0

  return (
    <div style={{ padding: '0 0 40px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Hero header */}
      <div style={{
        position: 'relative', overflow: 'hidden', borderRadius: 20, margin: '24px 24px 24px', padding: '30px 32px',
        background: 'linear-gradient(135deg, #0369a1 0%, #0ea5e9 55%, #38bdf8 100%)',
        boxShadow: '0 20px 50px -18px rgba(3,105,161,.5)',
      }}>
        <div style={{ position: 'absolute', top: -60, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
        <div style={{ position: 'absolute', bottom: -80, right: 120, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,.06)' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 18 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.18)', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 99, marginBottom: 12 }}>
              <Sparkles size={12} /> Beta Module
            </div>
            <h1 style={{ fontSize: 27, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-.02em' }}>Remote Patient Monitoring</h1>
            <p style={{ color: 'rgba(255,255,255,.85)', margin: '6px 0 0', fontSize: 14 }}>Real-time vitals tracking & threshold alerts</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setShowAddPatient(true) }} style={{
              display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,.16)', color: '#fff', border: '1px solid rgba(255,255,255,.35)',
              borderRadius: 11, padding: '11px 18px', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', backdropFilter: 'blur(6px)',
            }}>
              <Plus size={16} /> Add Patient
            </button>
            <button onClick={() => { setAdding(true); setForm(f => ({ ...f, patient_id: selected?.id || '' })) }} style={{
              display: 'flex', alignItems: 'center', gap: 7, background: '#fff', color: '#0369a1', border: 'none',
              borderRadius: 11, padding: '11px 18px', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
              boxShadow: '0 10px 24px -8px rgba(0,0,0,.35)', transition: 'transform .15s',
            }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
              <Activity size={16} /> Log Reading
            </button>
          </div>
        </div>

        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 26 }}>
          {[
            { label: 'Enrolled Patients', value: patients.length },
            { label: 'Readings (selected)', value: readings.length },
            { label: 'Critical Vitals Now', value: criticalCount },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 14, padding: '14px 16px', backdropFilter: 'blur(6px)' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.8)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {!key && (
        <div style={{ margin: '0 24px 24px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 14, padding: '16px 20px', color: '#92400e' }}>
          Connect with your doctor key (Logs page) to access RPM features.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, padding: '0 24px' }}>
        {/* Patient List */}
        <div>
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e0f2fe', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.03)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: '#111827', marginBottom: 10 }}>
                Enrolled Patients <span style={{ color: '#38bdf8' }}>({patients.length})</span>
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={13} color="#a0aec0" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patients…"
                  style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 10px 7px 28px', fontSize: 12.5, boxSizing: 'border-box', outline: 'none' }} />
              </div>
            </div>
            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              {filteredPatients.length === 0 && (
                <div style={{ padding: '28px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                  No patients found.<br />Click "Add Patient" to start.
                </div>
              )}
              {filteredPatients.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid #f0f9ff',
                    background: selected?.id === p.id ? 'linear-gradient(90deg, #eff6ff, #fff)' : '#fff',
                    borderLeft: selected?.id === p.id ? '3px solid #0ea5e9' : '3px solid transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'background .15s'
                  }}
                  onMouseEnter={e => { if (selected?.id !== p.id) e.currentTarget.style.background = '#fafafa' }}
                  onMouseLeave={e => { if (selected?.id !== p.id) e.currentTarget.style.background = '#fff' }}
                >
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#0ea5e9,#38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 12, fontWeight: 700 }}>
                    {initials(p.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{p.condition || 'No condition set'}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div>
          {!selected ? (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e0f2fe', padding: '70px 32px', textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ width: 68, height: 68, borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Activity size={28} color="#38bdf8" />
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: '#374151' }}>Select a patient</div>
              <div style={{ fontSize: 13.5 }}>Choose a patient from the list to view their vitals and trends.</div>
            </div>
          ) : (
            <>
              {/* Vitals cards */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg,#0ea5e9,#38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800 }}>
                      {initials(selected.name)}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 17, color: '#111827' }}>{selected.name}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => loadReadings(selected.id)} style={{ background: '#fff', border: '1px solid #e0f2fe', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#0369a1', fontWeight: 600 }}>
                      <RefreshCw size={12} /> Refresh
                    </button>
                    <button onClick={() => setShowDisenroll(true)} title="Disenroll from RPM"
                      style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#ef4444', fontWeight: 600 }}>
                      <UserMinus size={12} /> Disenroll
                    </button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  {VITALS_CONFIG.map(cfg => {
                    const val = latest[cfg.key]
                    const st  = statusFor(cfg.key, val)
                    const Icon = cfg.icon
                    return (
                      <div key={cfg.key} style={{ background: STATUS_BG[st], border: `1px solid ${STATUS_COLORS[st]}33`, borderRadius: 16, padding: '22px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', transition: 'transform .15s', cursor: 'default' }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                          <Icon size={16} color={cfg.color} />
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em' }}>{cfg.label}</span>
                        </div>
                        <div style={{ fontSize: 32, fontWeight: 800, color: STATUS_COLORS[st], lineHeight: 1.1 }}>
                          {val ?? '—'}
                        </div>
                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{cfg.unit} · normal {cfg.normal[0]}–{cfg.normal[1]}</div>
                        {st === 'critical' && <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#ef4444', fontWeight: 700 }}><AlertTriangle size={12} /> CRITICAL</div>}
                        {st === 'warning'  && <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#f59e0b', fontWeight: 700 }}><AlertTriangle size={12} /> Out of range</div>}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Trend chart */}
              {chartData.length > 1 && (
                <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e0f2fe', padding: '22px 26px', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,.03)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, color: '#374151', marginBottom: 16 }}>Vital Trends (last 20 readings)</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="spo2Grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e0f2fe' }} />
                      <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1} />
                      <ReferenceLine y={60}  stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1} />
                      <Area type="monotone" dataKey="hr"   stroke="#ef4444" strokeWidth={2} fill="url(#hrGrad)"   name="Heart Rate" />
                      <Area type="monotone" dataKey="spo2" stroke="#0ea5e9" strokeWidth={2} fill="url(#spo2Grad)" name="SpO2" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Readings history */}
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e0f2fe', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.03)' }}>
                <div style={{ padding: '16px 22px', borderBottom: '1px solid #f3f4f6', fontWeight: 700, fontSize: 13.5, color: '#374151' }}>
                  Reading History
                </div>
                {readings.length === 0 ? (
                  <div style={{ padding: '26px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No readings logged yet.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f8fbff' }}>
                          {['Time', 'HR', 'SpO2', 'BP', 'Temp', 'RR', 'Note'].map(h => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {readings.map(r => (
                          <tr key={r.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '10px 14px', color: '#6b7280', whiteSpace: 'nowrap' }}>{new Date(r.recorded_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                            <td style={{ padding: '10px 14px', color: STATUS_COLORS[statusFor('heart_rate', r.heart_rate)], fontWeight: 700 }}>{r.heart_rate ?? '—'}</td>
                            <td style={{ padding: '10px 14px', color: STATUS_COLORS[statusFor('spo2', r.spo2)], fontWeight: 700 }}>{r.spo2 ? `${r.spo2}%` : '—'}</td>
                            <td style={{ padding: '10px 14px', color: '#374151' }}>{r.systolic_bp && r.diastolic_bp ? `${r.systolic_bp}/${r.diastolic_bp}` : '—'}</td>
                            <td style={{ padding: '10px 14px', color: STATUS_COLORS[statusFor('temperature', r.temperature)] }}>{r.temperature ?? '—'}</td>
                            <td style={{ padding: '10px 14px', color: STATUS_COLORS[statusFor('resp_rate', r.resp_rate)] }}>{r.resp_rate ?? '—'}</td>
                            <td style={{ padding: '10px 14px', color: '#6b7280', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note || '—'}</td>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,20,35,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, animation: 'rpmFade .18s ease' }}>
          <form onSubmit={saveReading} style={{ background: '#fff', borderRadius: 18, padding: '30px 32px', width: 520, maxWidth: '95vw', boxShadow: '0 30px 80px -20px rgba(0,0,0,.4)', animation: 'rpmIn .22s cubic-bezier(.16,1,.3,1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#111827' }}>Log Vital Reading</h2>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={autofillFromLast} disabled={!readings.length}
                  style={{ padding: '5px 11px', borderRadius: 8, border: '1px dashed #bae6fd', background: readings.length ? '#f0f9ff' : '#f9fafb', color: readings.length ? '#0369a1' : '#c0c8d0', fontSize: 11.5, fontWeight: 600, cursor: readings.length ? 'pointer' : 'default' }}>
                  Copy Last Reading
                </button>
                <button type="button" onClick={autofillNormalRange}
                  style={{ padding: '5px 11px', borderRadius: 8, border: '1px dashed #bae6fd', background: '#f0f9ff', color: '#0369a1', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                  Use Normal Range
                </button>
                <button type="button" onClick={aiSuggestNote} disabled={!form.patient_id || aiSuggesting}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, border: '1px dashed #bae6fd', background: form.patient_id ? '#f0f9ff' : '#f9fafb', color: form.patient_id ? '#0369a1' : '#c0c8d0', fontSize: 11.5, fontWeight: 600, cursor: form.patient_id ? 'pointer' : 'default' }}>
                  <Wand2 size={12} /> {aiSuggesting ? 'Drafting…' : 'AI Suggest Note'}
                </button>
              </div>
            </div>
            <div style={{ marginBottom: 15 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 5 }}>Patient</label>
              <select value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))} required
                className="rpm-input"
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 11px', fontSize: 13 }}>
                <option value="">— select —</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 15 }}>
              {VITALS_CONFIG.map(cfg => (
                <div key={cfg.key}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>{cfg.label} ({cfg.unit})</label>
                  <input type="number" step="any" value={form[cfg.key]} onChange={e => setForm(f => ({ ...f, [cfg.key]: e.target.value }))}
                    placeholder={`${cfg.normal[0]}–${cfg.normal[1]}`}
                    className="rpm-input"
                    style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 11px', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Note (optional)</label>
              <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2}
                className="rpm-input"
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 11px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setAdding(false)} style={{ padding: '10px 18px', border: '1px solid #d1d5db', borderRadius: 9, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ padding: '10px 20px', border: 'none', borderRadius: 9, background: 'linear-gradient(135deg,#0ea5e9,#38bdf8)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, boxShadow: '0 8px 18px -6px rgba(14,165,233,.55)' }}>
                {saving ? 'Saving…' : 'Save Reading'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Enroll Patient Modal — picks from the existing Patients roster instead of manual entry */}
      {showAddPatient && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,20,35,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, animation: 'rpmFade .18s ease' }}>
          <form onSubmit={addPatient} style={{ background: '#fff', borderRadius: 18, padding: '30px 32px', width: 460, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 30px 80px -20px rgba(0,0,0,.4)', animation: 'rpmIn .22s cubic-bezier(.16,1,.3,1)' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 800, color: '#111827' }}>Enroll in RPM</h2>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#6b7280' }}>Select an existing patient from your Patients list — demographics are pulled in automatically.</p>

            {!pickedPatient ? (
              <>
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <Search size={13} color="#a0aec0" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                  <input value={rosterSearch} onChange={e => setRosterSearch(e.target.value)} placeholder="Search patients by name…" autoFocus
                    className="rpm-input"
                    style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 11px 9px 30px', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, maxHeight: 260, overflowY: 'auto', marginBottom: 16 }}>
                  {roster.filter(p => p.name?.toLowerCase().includes(rosterSearch.toLowerCase()) && !patients.some(rp => rp.name === p.name && rp.dob === p.dob)).length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: 12.5 }}>
                      {roster.length === 0 ? 'No patients found — add one in the Patients page first.' : 'No matches (or already enrolled).'}
                    </div>
                  ) : (
                    roster
                      .filter(p => p.name?.toLowerCase().includes(rosterSearch.toLowerCase()) && !patients.some(rp => rp.name === p.name && rp.dob === p.dob))
                      .slice(0, 30)
                      .map(p => (
                        <button key={p.id} type="button" onClick={() => setPickedPatient(p)}
                          style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderBottom: '1px solid #f3f4f6', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                          <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,#0ea5e9,#38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            {initials(p.name)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: '#6b7280' }}>{p.dob || 'DOB unknown'}{p.conditions ? ` · ${p.conditions}` : ''}</div>
                          </div>
                        </button>
                      ))
                  )}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#0ea5e9,#38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {initials(pickedPatient.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: '#111827' }}>{pickedPatient.name}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{pickedPatient.dob || 'DOB unknown'}</div>
                </div>
                <button type="button" onClick={() => setPickedPatient(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0284c7', fontSize: 11.5, fontWeight: 700 }}>Change</button>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Primary Condition</label>
              <input type="text" value={newPatient.condition}
                className="rpm-input"
                placeholder={pickedPatient?.conditions || 'e.g. Hypertension'}
                onChange={e => setNewPatient(p => ({ ...p, condition: e.target.value }))}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 11px', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setShowAddPatient(false); setPickedPatient(null); setRosterSearch('') }} style={{ padding: '10px 18px', border: '1px solid #d1d5db', borderRadius: 9, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Cancel</button>
              <button type="submit" disabled={!pickedPatient} style={{ padding: '10px 20px', border: 'none', borderRadius: 9, background: pickedPatient ? 'linear-gradient(135deg,#0ea5e9,#38bdf8)' : '#d1d5db', color: '#fff', fontWeight: 700, cursor: pickedPatient ? 'pointer' : 'default', fontSize: 13, boxShadow: pickedPatient ? '0 8px 18px -6px rgba(14,165,233,.55)' : 'none' }}>Enroll</button>
            </div>
          </form>
        </div>
      )}

      {/* Disenroll Confirm Modal */}
      {showDisenroll && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,20,35,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, animation: 'rpmFade .18s ease' }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: '30px 32px', width: 420, maxWidth: '95vw', boxShadow: '0 30px 80px -20px rgba(0,0,0,.4)', animation: 'rpmIn .22s cubic-bezier(.16,1,.3,1)', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <UserMinus size={24} color="#ef4444" />
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: '#111827' }}>Disenroll {selected.name}?</h2>
            <p style={{ fontSize: 13.5, color: '#6b7280', margin: '0 0 24px', lineHeight: 1.5 }}>
              This removes the patient from RPM along with their vitals reading history. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button type="button" onClick={() => setShowDisenroll(false)} style={{ padding: '10px 18px', border: '1px solid #d1d5db', borderRadius: 9, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Cancel</button>
              <button type="button" disabled={disenrolling} onClick={disenrollPatient} style={{ padding: '10px 20px', border: 'none', borderRadius: 9, background: '#ef4444', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, boxShadow: '0 8px 18px -6px rgba(239,68,68,.5)' }}>
                {disenrolling ? 'Disenrolling…' : 'Disenroll'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes rpmFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rpmIn { from { opacity: 0; transform: translateY(10px) scale(.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
        .rpm-input:focus { outline: none; border-color: ${ACCENT} !important; box-shadow: 0 0 0 3px ${ACCENT}22; }
      `}</style>
    </div>
  )
}
