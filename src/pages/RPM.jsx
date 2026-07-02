import React, { useState, useEffect } from 'react'
import { Activity, Heart, Thermometer, Wind, Droplets, AlertTriangle, Plus, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'

const VITALS_CONFIG = [
  { key: 'heart_rate',     label: 'Heart Rate',     unit: 'bpm',   icon: Heart,        normal: [60, 100],  critical: [40, 130], color: '#ef4444' },
  { key: 'spo2',           label: 'SpO2',            unit: '%',     icon: Droplets,     normal: [95, 100],  critical: [90, 100], color: '#3b82f6' },
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

export default function RPM() {
  const { key } = useKey()
  const [patients, setPatients] = useState([])
  const [selected, setSelected] = useState(null)
  const [readings, setReadings] = useState([])
  const [form, setForm] = useState({ patient_id: '', heart_rate: '', spo2: '', systolic_bp: '', diastolic_bp: '', temperature: '', resp_rate: '', note: '' })
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAddPatient, setShowAddPatient] = useState(false)
  const [newPatient, setNewPatient] = useState({ name: '', dob: '', condition: '' })

  useEffect(() => { if (key) loadPatients() }, [key])
  useEffect(() => { if (selected) loadReadings(selected.id) }, [selected])

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
    try {
      await fetch('/api/rpm/patients', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(newPatient)
      })
      setShowAddPatient(false)
      setNewPatient({ name: '', dob: '', condition: '' })
      loadPatients()
    } catch {}
  }

  // latest reading for each patient
  const latestByPatient = {}
  // build from readings only for selected; for list use separate
  const allAlerts = []

  patients.forEach(p => {
    // we'll fetch lazily; show alert badge from stored data
  })

  const chartData = readings.slice().reverse().slice(-20).map(r => ({
    time: new Date(r.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    hr:   r.heart_rate,
    spo2: r.spo2,
    sys:  r.systolic_bp,
    temp: r.temperature ? parseFloat(r.temperature) : null,
  }))

  const latest = readings[0] || {}

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>Remote Patient Monitoring</h1>
          <p style={{ color: '#6b7280', margin: '4px 0 0', fontSize: 14 }}>Real-time vitals tracking & threshold alerts</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { setShowAddPatient(true) }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            <Plus size={15} /> Add Patient
          </button>
          <button onClick={() => { setAdding(true); setForm(f => ({ ...f, patient_id: selected?.id || '' })) }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            <Activity size={15} /> Log Reading
          </button>
        </div>
      </div>

      {!key && (
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '16px 20px', color: '#92400e', marginBottom: 24 }}>
          Connect with your doctor key (Logs page) to access RPM features.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
        {/* Patient List */}
        <div>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', fontWeight: 600, fontSize: 13, color: '#374151' }}>
              Enrolled Patients ({patients.length})
            </div>
            {patients.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                No patients enrolled yet.<br />Click "Add Patient" to start.
              </div>
            )}
            {patients.map(p => (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                style={{
                  width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid #f3f4f6',
                  background: selected?.id === p.id ? '#eff6ff' : '#fff',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10
                }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 99, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Heart size={15} color="#3b82f6" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{p.condition || 'No condition set'}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div>
          {!selected ? (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '60px 32px', textAlign: 'center', color: '#9ca3af' }}>
              <Activity size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: .4 }} />
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Select a patient</div>
              <div style={{ fontSize: 13 }}>Choose a patient from the list to view their vitals and trends.</div>
            </div>
          ) : (
            <>
              {/* Vitals cards */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>{selected.name}</div>
                  <button onClick={() => loadReadings(selected.id)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 7, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#6b7280' }}>
                    <RefreshCw size={12} /> Refresh
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                  {VITALS_CONFIG.map(cfg => {
                    const val = latest[cfg.key]
                    const st  = statusFor(cfg.key, val)
                    const Icon = cfg.icon
                    return (
                      <div key={cfg.key} style={{ background: STATUS_BG[st], border: `1px solid ${STATUS_COLORS[st]}33`, borderRadius: 14, padding: '22px 24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          <Icon size={16} color={cfg.color} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em' }}>{cfg.label}</span>
                        </div>
                        <div style={{ fontSize: 32, fontWeight: 800, color: STATUS_COLORS[st], lineHeight: 1.1 }}>
                          {val ?? '—'}
                        </div>
                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{cfg.unit} · normal {cfg.normal[0]}–{cfg.normal[1]}</div>
                        {st === 'critical' && <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#ef4444', fontWeight: 600 }}><AlertTriangle size={12} /> CRITICAL</div>}
                        {st === 'warning'  && <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#f59e0b', fontWeight: 600 }}><AlertTriangle size={12} /> Out of range</div>}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Trend chart */}
              {chartData.length > 1 && (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px 24px', marginBottom: 20 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#374151', marginBottom: 16 }}>Vital Trends (last 20 readings)</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 10, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="spo2Grad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1} />
                      <ReferenceLine y={60}  stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1} />
                      <Area type="monotone" dataKey="hr"   stroke="#ef4444" fill="url(#hrGrad)"   name="Heart Rate" />
                      <Area type="monotone" dataKey="spo2" stroke="#3b82f6" fill="url(#spo2Grad)" name="SpO2" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Readings history */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', fontWeight: 600, fontSize: 13, color: '#374151' }}>
                  Reading History
                </div>
                {readings.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No readings logged yet.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f9fafb' }}>
                          {['Time', 'HR', 'SpO2', 'BP', 'Temp', 'RR', 'Note'].map(h => (
                            <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {readings.map(r => (
                          <tr key={r.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '9px 14px', color: '#6b7280', whiteSpace: 'nowrap' }}>{new Date(r.recorded_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                            <td style={{ padding: '9px 14px', color: STATUS_COLORS[statusFor('heart_rate', r.heart_rate)], fontWeight: 600 }}>{r.heart_rate ?? '—'}</td>
                            <td style={{ padding: '9px 14px', color: STATUS_COLORS[statusFor('spo2', r.spo2)], fontWeight: 600 }}>{r.spo2 ? `${r.spo2}%` : '—'}</td>
                            <td style={{ padding: '9px 14px', color: '#374151' }}>{r.systolic_bp && r.diastolic_bp ? `${r.systolic_bp}/${r.diastolic_bp}` : '—'}</td>
                            <td style={{ padding: '9px 14px', color: STATUS_COLORS[statusFor('temperature', r.temperature)] }}>{r.temperature ?? '—'}</td>
                            <td style={{ padding: '9px 14px', color: STATUS_COLORS[statusFor('resp_rate', r.resp_rate)] }}>{r.resp_rate ?? '—'}</td>
                            <td style={{ padding: '9px 14px', color: '#6b7280', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note || '—'}</td>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <form onSubmit={saveReading} style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', width: 520, maxWidth: '95vw' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Log Vital Reading</h2>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 5 }}>Patient</label>
              <select value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))} required
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 7, padding: '8px 10px', fontSize: 13 }}>
                <option value="">— select —</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              {VITALS_CONFIG.map(cfg => (
                <div key={cfg.key}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>{cfg.label} ({cfg.unit})</label>
                  <input type="number" step="any" value={form[cfg.key]} onChange={e => setForm(f => ({ ...f, [cfg.key]: e.target.value }))}
                    placeholder={`${cfg.normal[0]}–${cfg.normal[1]}`}
                    style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 7, padding: '7px 10px', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Note (optional)</label>
              <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 7, padding: '7px 10px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setAdding(false)} style={{ padding: '9px 18px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ padding: '9px 18px', border: 'none', borderRadius: 8, background: '#10b981', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                {saving ? 'Saving…' : 'Save Reading'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Patient Modal */}
      {showAddPatient && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <form onSubmit={addPatient} style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', width: 400, maxWidth: '95vw' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Enroll Patient in RPM</h2>
            {[
              { label: 'Full Name', key: 'name', type: 'text', required: true },
              { label: 'Date of Birth', key: 'dob', type: 'date', required: false },
              { label: 'Primary Condition', key: 'condition', type: 'text', required: false },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input type={f.type} required={f.required} value={newPatient[f.key]}
                  onChange={e => setNewPatient(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 7, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" onClick={() => setShowAddPatient(false)} style={{ padding: '9px 18px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button type="submit" style={{ padding: '9px 18px', border: 'none', borderRadius: 8, background: '#0ea5e9', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Enroll</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
