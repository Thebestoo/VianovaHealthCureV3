import React, { useState, useEffect } from 'react'
import {
  Calendar, Plus, X, Loader2, Check, CheckCircle2, XCircle,
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Bell, BellOff, Clock, MapPin,
  User, Stethoscope, Sparkles, Send
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

/* ── helpers ── */
function FL({ children }) {
  return <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{children}</label>
}
function FI({ value, onChange, placeholder, type = 'text', style: extra }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box', ...extra }} />
  )
}

function statusBadge(status) {
  const map = {
    scheduled:  { bg: '#dbeafe', color: '#1d4ed8', label: 'Scheduled' },
    completed:  { bg: '#d1fae5', color: '#047857', label: 'Completed' },
    cancelled:  { bg: '#f3f4f6', color: '#6b7280', label: 'Cancelled' },
    'no-show':  { bg: '#fee2e2', color: '#b91c1c', label: 'No-Show' },
  }
  const s = map[status] || { bg: '#f3f4f6', color: '#6b7280', label: status }
  return (
    <span style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: s.color, background: s.bg }}>{s.label}</span>
  )
}

function riskBadge(risk) {
  if (risk == null) return null
  const pct = typeof risk === 'string' ? parseFloat(risk) : risk
  const display = isNaN(pct) ? risk : `${Math.round(pct)}%`
  let color = '#047857', bg = '#d1fae5', label = 'Low Risk'
  if (pct >= 50)      { color = '#b91c1c'; bg = '#fee2e2'; label = 'High Risk' }
  else if (pct >= 25) { color = '#92400e'; bg = '#fef3c7'; label = 'Mod Risk' }
  return (
    <span title={`No-show risk: ${display}`} style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, color, background: bg }}>{display} {label}</span>
  )
}

function fmtDate(str) {
  if (!str) return ''
  try {
    return new Date(str).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return str }
}

const STATUS_DOT = { scheduled: '#2563eb', completed: '#059669', cancelled: '#9ca3af', 'no-show': '#dc2626' }
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// Superadmin-only month calendar. Groups appointments (already fetched for
// the whole account) by day so a whole month's schedule is scannable at a
// glance, instead of scrolling a flat chronological list.
function AppointmentCalendar({
  appts, loading, month, setMonth, selectedDay, setSelectedDay,
  onNotifyAll, notifyingAll, actionLoading, onRemind, onComplete, onNoShow, onCancel
}) {
  const year = month.getFullYear()
  const monthIdx = month.getMonth()
  const firstOfMonth = new Date(year, monthIdx, 1)
  const startWeekday = firstOfMonth.getDay()
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
  const today = new Date()

  const byDay = {}
  for (const a of appts) {
    if (!a.appointment_date) continue
    const d = new Date(a.appointment_date)
    if (d.getFullYear() !== year || d.getMonth() !== monthIdx) continue
    const key = d.getDate()
    ;(byDay[key] = byDay[key] || []).push(a)
  }
  Object.values(byDay).forEach(list => list.sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date)))

  const monthAppts = Object.values(byDay).flat()
  const dueForNotify = monthAppts.filter(a => a.status === 'scheduled' && !a.reminder_sent).length

  const cells = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(day)

  const selectedList = selectedDay ? (byDay[selectedDay] || []) : []

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', background: 'linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)', color: '#fff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => { const d = new Date(year, monthIdx - 1, 1); setMonth(d); setSelectedDay(null) }}
            style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
            <ChevronLeft size={16} />
          </button>
          <div style={{ fontWeight: 700, fontSize: 16, minWidth: 150, textAlign: 'center' }}>
            {month.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          <button onClick={() => { const d = new Date(year, monthIdx + 1, 1); setMonth(d); setSelectedDay(null) }}
            style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
            <ChevronRight size={16} />
          </button>
          <button onClick={() => { const d = new Date(); d.setDate(1); setMonth(d); setSelectedDay(null) }}
            style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#fff' }}>
            Today
          </button>
        </div>

        <button
          onClick={() => onNotifyAll(monthAppts)}
          disabled={notifyingAll || dueForNotify === 0}
          title="Email a reminder to every scheduled patient shown this month"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
            border: 'none', fontSize: 12.5, fontWeight: 700, cursor: dueForNotify ? 'pointer' : 'default',
            background: dueForNotify ? '#fff' : 'rgba(255,255,255,.15)',
            color: dueForNotify ? '#1d4ed8' : 'rgba(255,255,255,.6)'
          }}
        >
          {notifyingAll ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
          Notify Patients{dueForNotify ? ` (${dueForNotify})` : ''}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
          <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }} />
        </div>
      ) : (
        <>
          {/* Weekday header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #e5e7eb' }}>
            {WEEKDAYS.map(w => (
              <div key={w} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {cells.map((day, i) => {
              if (day === null) return <div key={i} style={{ minHeight: 92, background: '#fafafa', borderRight: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6' }} />
              const dayDate = new Date(year, monthIdx, day)
              const isToday = sameDay(dayDate, today)
              const isSelected = selectedDay === day
              const list = byDay[day] || []
              const visible = list.slice(0, 3)
              const overflow = list.length - visible.length

              return (
                <div
                  key={i}
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  style={{
                    minHeight: 92, padding: '6px 6px 8px', borderRight: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6',
                    cursor: list.length ? 'pointer' : 'default', background: isSelected ? '#eff6ff' : '#fff',
                    transition: 'background .1s'
                  }}
                >
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 22, height: 22, borderRadius: 99, fontSize: 12, fontWeight: isToday ? 700 : 500,
                    color: isToday ? '#fff' : '#374151', background: isToday ? '#1d4ed8' : 'transparent', marginBottom: 4
                  }}>
                    {day}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {visible.map(a => (
                      <div key={a.id} title={`${a.patient_name} — ${a.appointment_type}`} style={{
                        display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, padding: '1.5px 5px',
                        borderRadius: 5, background: '#f3f4f6', color: '#374151', overflow: 'hidden', whiteSpace: 'nowrap'
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: 99, background: STATUS_DOT[a.status] || '#9ca3af', flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.patient_name}</span>
                      </div>
                    ))}
                    {overflow > 0 && <div style={{ fontSize: 10, color: '#9ca3af', paddingLeft: 5 }}>+{overflow} more</div>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Selected day detail */}
          {selectedDay && (
            <div style={{ padding: '16px 20px', borderTop: '1px solid #e5e7eb', background: '#fafbff' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginBottom: 10 }}>
                {new Date(year, monthIdx, selectedDay).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
              {selectedList.length === 0 ? (
                <div style={{ fontSize: 12.5, color: '#9ca3af' }}>No appointments on this day.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedList.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', flexWrap: 'wrap' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: STATUS_DOT[a.status] || '#9ca3af', flexShrink: 0 }} />
                      <div style={{ minWidth: 130 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{a.patient_name}</div>
                        <div style={{ fontSize: 11.5, color: '#6b7280' }}>{a.appointment_type}</div>
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} /> {new Date(a.appointment_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {a.duration_minutes} min
                      </div>
                      {statusBadge(a.status)}
                      {a.reminder_sent && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 600, color: '#059669', background: '#d1fae5' }}>
                          <Check size={9} strokeWidth={3} /> Reminded
                        </span>
                      )}
                      {a.status === 'scheduled' && (
                        <div style={{ display: 'flex', gap: 5, marginLeft: 'auto' }}>
                          <button onClick={() => onComplete(a.id)} disabled={!!actionLoading[`${a.id}_status`]}
                            style={{ padding: '4px 9px', border: '1px solid #bbf7d0', borderRadius: 6, background: '#f0fdf4', cursor: 'pointer', fontSize: 11, color: '#047857' }}>
                            Complete
                          </button>
                          <button onClick={() => onNoShow(a.id)} disabled={!!actionLoading[`${a.id}_status`]}
                            style={{ padding: '4px 9px', border: '1px solid #fecaca', borderRadius: 6, background: '#fef2f2', cursor: 'pointer', fontSize: 11, color: '#b91c1c' }}>
                            No-Show
                          </button>
                          <button onClick={() => onCancel(a.id)} disabled={!!actionLoading[`${a.id}_status`]}
                            style={{ padding: '4px 9px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#f9fafb', cursor: 'pointer', fontSize: 11, color: '#6b7280' }}>
                            Cancel
                          </button>
                          <button onClick={() => onRemind(a.id)} disabled={a.reminder_sent || !!actionLoading[`${a.id}_remind`]}
                            style={{ padding: '4px 9px', border: '1px solid #ddd6fe', borderRadius: 6, background: '#fff', cursor: a.reminder_sent ? 'not-allowed' : 'pointer', fontSize: 11, color: '#7c3aed', opacity: a.reminder_sent ? .6 : 1, display: 'flex', alignItems: 'center', gap: 3 }}>
                            {actionLoading[`${a.id}_remind`] ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <Bell size={10} />}
                            {a.reminder_sent ? 'Sent' : 'Remind'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const EMPTY_FORM = { patient_id: '', appointment_type: '', appointment_date: '', duration_minutes: '30', provider: '', location: '', notes: '' }

export default function Appointments() {
  const { key, role } = useKey()
  const isSuperadmin = role === 'superadmin'
  const [appts, setAppts]         = useState([])
  const [patients, setPatients]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [view, setView]           = useState('upcoming')
  const [patientFilter, setPatientFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestion, setSuggestion] = useState(null)
  const [actionLoading, setActionLoading] = useState({}) // { [id_action]: true }
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [selectedDay, setSelectedDay] = useState(null)
  const [notifyingAll, setNotifyingAll] = useState(false)

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { if (key) { load(); loadPatients() } }, [key])
  useEffect(() => { if (key) load() }, [view, patientFilter, key])

  async function load() {
    setLoading(true)
    try {
      // Calendar view needs the full set of appointments (it does its own
      // month-based filtering client-side) rather than just upcoming/past.
      const params = new URLSearchParams({ view: view === 'calendar' ? 'all' : view })
      if (patientFilter) params.set('patient_id', patientFilter)
      const r = await fetch(`/api/appointments?${params}`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setAppts(Array.isArray(d) ? d : [])
    } catch { setAppts([]) }
    setLoading(false)
  }

  async function loadPatients() {
    try {
      const r = await fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPatients(d.patients || [])
    } catch {}
  }

  async function updateStatus(id, status) {
    const akey = `${id}_status`
    setActionLoading(a => ({ ...a, [akey]: true }))
    try {
      await fetch(`/api/appointments/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ status })
      })
      setAppts(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    } catch {}
    setActionLoading(a => ({ ...a, [akey]: false }))
  }

  async function deleteAppt(id) {
    if (!window.confirm('Delete this appointment?')) return
    setActionLoading(a => ({ ...a, [`${id}_del`]: true }))
    try {
      await fetch(`/api/appointments/${id}`, { method: 'DELETE', headers: { 'x-api-key': key } })
      setAppts(prev => prev.filter(a => a.id !== id))
    } catch {}
    setActionLoading(a => ({ ...a, [`${id}_del`]: false }))
  }

  async function sendReminder(id) {
    const akey = `${id}_remind`
    setActionLoading(a => ({ ...a, [akey]: true }))
    try {
      await fetch(`/api/appointments/${id}/remind`, { method: 'POST', headers: { 'x-api-key': key } })
      setAppts(prev => prev.map(a => a.id === id ? { ...a, reminder_sent: true } : a))
    } catch {}
    setActionLoading(a => ({ ...a, [akey]: false }))
  }

  // Sends the reminder email to every scheduled, not-yet-reminded appointment
  // visible in the current calendar month — a one-click way to notify a
  // whole month's patients instead of clicking "Remind" one by one.
  async function notifyAllInMonth(monthAppts) {
    const targets = monthAppts.filter(a => a.status === 'scheduled' && !a.reminder_sent)
    if (!targets.length) return
    setNotifyingAll(true)
    for (const a of targets) {
      try { await sendReminder(a.id) } catch {}
    }
    setNotifyingAll(false)
  }

  async function aiSuggest() {
    if (!form.patient_id) return
    setSuggesting(true)
    setSuggestion(null)
    try {
      const r = await fetch(`/api/appointments/suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ patient_id: form.patient_id })
      })
      const d = await r.json()
      setSuggestion(d)
      setField('appointment_type', d.appointment_type || form.appointment_type)
      setField('duration_minutes', d.duration_minutes ? String(d.duration_minutes) : form.duration_minutes)
    } catch {}
    setSuggesting(false)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.patient_id || !form.appointment_type || !form.appointment_date) return
    setSaving(true)
    try {
      const r = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ ...form, duration_minutes: Number(form.duration_minutes) || 30 })
      })
      if (r.ok) { setShowModal(false); setForm(EMPTY_FORM); setSuggestion(null); load() }
    } catch {}
    setSaving(false)
  }

  // Lead-time risk hint for modal
  const leadTimeDays = form.appointment_date
    ? Math.round((new Date(form.appointment_date) - Date.now()) / 86400000)
    : null

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">Appointments</span>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowModal(true); setForm(EMPTY_FORM); setSuggestion(null) }}>
          <Plus size={14} /> New Appointment
        </button>
      </div>

      <div style={{ padding: '24px 32px' }}>
        {/* Filters row */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            {['upcoming', 'past', 'all', ...(isSuperadmin ? ['calendar'] : [])].map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding: '7px 16px', fontSize: 13, fontWeight: view === v ? 700 : 400, background: view === v ? '#2563eb' : '#fff', color: view === v ? '#fff' : '#374151', border: 'none', cursor: 'pointer', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 5 }}>
                {v === 'calendar' && <Calendar size={12} />}
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {/* Patient filter */}
          <select value={patientFilter} onChange={e => setPatientFilter(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', color: '#374151', background: '#fff', cursor: 'pointer' }}>
            <option value="">All Patients</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Calendar view — superadmin only */}
        {view === 'calendar' && isSuperadmin ? (
          <AppointmentCalendar
            appts={appts}
            loading={loading}
            month={calendarMonth}
            setMonth={setCalendarMonth}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            onNotifyAll={notifyAllInMonth}
            notifyingAll={notifyingAll}
            actionLoading={actionLoading}
            onRemind={sendReminder}
            onComplete={id => updateStatus(id, 'completed')}
            onNoShow={id => updateStatus(id, 'no-show')}
            onCancel={id => updateStatus(id, 'cancelled')}
          />
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }} />
          </div>
        ) : appts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
            <Calendar size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: .35 }} />
            <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 6 }}>No appointments found</div>
            <div style={{ fontSize: 13 }}>Click "New Appointment" to schedule one.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {appts.map(a => (
              <div key={a.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  {/* Icon */}
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Calendar size={18} color="#2563eb" />
                  </div>

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{a.patient_name}</span>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#2563eb' }}>{a.appointment_type}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#6b7280', flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Calendar size={11} />{fmtDate(a.appointment_date)}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={11} />{a.duration_minutes} min</span>
                      {a.provider && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Stethoscope size={11} />{a.provider}</span>}
                      {a.location && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><MapPin size={11} />{a.location}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {statusBadge(a.status)}
                      {riskBadge(a.no_show_risk)}
                      {a.reminder_sent && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: '#059669', background: '#d1fae5' }}>
                          <Check size={10} strokeWidth={3} /> Reminder Sent
                        </span>
                      )}
                    </div>
                    {a.notes && <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>{a.notes}</div>}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0, alignItems: 'flex-start' }}>
                    {a.status === 'scheduled' && <>
                      <button onClick={() => updateStatus(a.id, 'completed')} disabled={!!actionLoading[`${a.id}_status`]}
                        style={{ padding: '5px 10px', border: '1px solid #bbf7d0', borderRadius: 7, background: '#f0fdf4', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#047857' }}>
                        {actionLoading[`${a.id}_status`] ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={12} />} Complete
                      </button>
                      <button onClick={() => updateStatus(a.id, 'no-show')} disabled={!!actionLoading[`${a.id}_status`]}
                        style={{ padding: '5px 10px', border: '1px solid #fecaca', borderRadius: 7, background: '#fef2f2', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#b91c1c' }}>
                        <XCircle size={12} /> No-Show
                      </button>
                      <button onClick={() => updateStatus(a.id, 'cancelled')} disabled={!!actionLoading[`${a.id}_status`]}
                        style={{ padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: 7, background: '#f9fafb', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#6b7280' }}>
                        <X size={12} /> Cancel
                      </button>
                      <button onClick={() => sendReminder(a.id)} disabled={a.reminder_sent || !!actionLoading[`${a.id}_remind`]}
                        style={{ padding: '5px 10px', border: '1px solid #ddd6fe', borderRadius: 7, background: a.reminder_sent ? '#f5f3ff' : '#fff', cursor: a.reminder_sent ? 'not-allowed' : 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: a.reminder_sent ? '#7c3aed' : '#374151', opacity: a.reminder_sent ? .65 : 1 }}>
                        {actionLoading[`${a.id}_remind`] ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : (a.reminder_sent ? <BellOff size={12} /> : <Bell size={12} />)}
                        {a.reminder_sent ? 'Sent' : 'Remind'}
                      </button>
                    </>}
                    <button onClick={() => deleteAppt(a.id)} disabled={!!actionLoading[`${a.id}_del`]}
                      style={{ padding: '5px 8px', border: '1px solid #fecaca', borderRadius: 7, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#dc2626' }}>
                      {actionLoading[`${a.id}_del`] ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <X size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── New Appointment Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '28px 16px', overflowY: 'auto' }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, boxShadow: '0 24px 64px rgba(0,0,0,.22)', marginBottom: 28 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>New Appointment</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}><X size={18} /></button>
            </div>

            <form onSubmit={handleSave} noValidate style={{ padding: '20px 24px' }}>
              {/* Patient + AI Suggest row */}
              <div style={{ marginBottom: 14 }}>
                <FL>Patient *</FL>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={form.patient_id} onChange={e => { setField('patient_id', e.target.value); setSuggestion(null) }}
                    style={{ flex: 1, padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none' }}>
                    <option value="">— Select patient —</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button type="button" onClick={aiSuggest} disabled={!form.patient_id || suggesting}
                    style={{ padding: '8px 14px', border: '1.5px solid #ddd6fe', borderRadius: 7, background: '#f5f3ff', color: '#7c3aed', fontSize: 12, fontWeight: 600, cursor: form.patient_id ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', opacity: form.patient_id ? 1 : .5 }}>
                    {suggesting ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={13} />}
                    AI Suggest
                  </button>
                </div>
              </div>

              {/* AI suggestion box */}
              {suggestion && (
                <div style={{ marginBottom: 14, padding: '12px 14px', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 9 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>
                    <Sparkles size={13} /> AI Recommendation
                  </div>
                  <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>
                    <strong>{suggestion.appointment_type}</strong> — {suggestion.duration_minutes} min
                  </div>
                  {suggestion.reason && <div style={{ fontSize: 12, color: '#6b7280' }}>{suggestion.reason}</div>}
                  {suggestion.urgency && (
                    <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                      color: suggestion.urgency === 'high' ? '#b91c1c' : suggestion.urgency === 'medium' ? '#92400e' : '#047857',
                      background: suggestion.urgency === 'high' ? '#fee2e2' : suggestion.urgency === 'medium' ? '#fef3c7' : '#d1fae5' }}>
                      {suggestion.urgency.charAt(0).toUpperCase() + suggestion.urgency.slice(1)} Urgency
                    </div>
                  )}
                </div>
              )}

              {/* Lead-time hint */}
              {leadTimeDays !== null && leadTimeDays > 14 && (
                <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, fontSize: 12, color: '#92400e', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <AlertTriangle size={13} /> Lead time is {leadTimeDays} days — moderate no-show risk. Consider sending a reminder closer to the date.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <FL>Appointment Type *</FL>
                  <FI value={form.appointment_type} onChange={v => setField('appointment_type', v)} placeholder="e.g. Follow-up, Lab Review" />
                </div>
                <div>
                  <FL>Date & Time *</FL>
                  <FI type="datetime-local" value={form.appointment_date} onChange={v => setField('appointment_date', v)} />
                </div>
                <div>
                  <FL>Duration (minutes)</FL>
                  <FI type="number" value={form.duration_minutes} onChange={v => setField('duration_minutes', v)} placeholder="30" />
                </div>
                <div>
                  <FL>Provider</FL>
                  <FI value={form.provider} onChange={v => setField('provider', v)} placeholder="Dr. Smith" />
                </div>
                <div>
                  <FL>Location</FL>
                  <FI value={form.location} onChange={v => setField('location', v)} placeholder="Room 3A / Telehealth" />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <FL>Notes</FL>
                  <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} placeholder="Any additional notes…"
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={saving || !form.patient_id || !form.appointment_type || !form.appointment_date} className="btn btn-primary btn-sm">
                  {saving ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : 'Schedule Appointment'}
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
