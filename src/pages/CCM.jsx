import React, { useState, useEffect } from 'react'
import { ClipboardList, Plus, CheckCircle2, Circle, Clock, Calendar, ChevronDown, ChevronUp, User, Phone, FileText, Target, Edit3, Save, X, Sparkles, Search, UserMinus, Timer, Pause, Play, Wand2, Users, DollarSign } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import AiHelp from '../components/AiHelp.jsx'

const QUICK_MINUTES = [5, 10, 15, 20, 30]
const NOTE_TEMPLATES = [
  { label: 'Medication review', notes: 'Reviewed current medications and adherence with patient. No new side effects reported.' },
  { label: 'Symptom check-in', notes: 'Called patient to review current symptoms and overall status since last contact.' },
  { label: 'Care coordination', notes: 'Coordinated care with specialist/pharmacy on behalf of patient regarding treatment plan.' },
  { label: 'Lab/vitals follow-up', notes: 'Reviewed recent lab results / vitals with patient and discussed next steps.' },
]

const STATUS_COLOR = { active: 'var(--success)', inactive: 'var(--text3)', discharged: 'var(--danger)', disenrolled: 'var(--danger)' }
const STATUS_BG    = { active: 'var(--success-light)', inactive: 'var(--surface2)', discharged: 'var(--danger-light)', disenrolled: 'var(--danger-light)' }
const PLAN_STATUS_COLOR = { draft: 'var(--warning)', active: 'var(--success)', completed: '#6366f1' }
const PLAN_STATUS_BG    = { draft: 'var(--warning-light)', active: 'var(--success-light)', completed: '#eef2ff' }
const ACCENT = '#8b5cf6'

function formatTimer(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

export default function CCM() {
  const { key } = useKey()
  const [patients, setPatients]     = useState([])
  const [search, setSearch]         = useState('')
  const [selected, setSelected]     = useState(null)
  const [plan, setPlan]             = useState(null)
  const [checkins, setCheckins]     = useState([])
  const [showAddPt, setShowAddPt]   = useState(false)
  const [showCheckin, setShowCheckin] = useState(false)
  const [showPlanEdit, setShowPlanEdit] = useState(false)
  const [roster, setRoster]         = useState([])
  const [rosterSearch, setRosterSearch] = useState('')
  const [pickedPatient, setPickedPatient] = useState(null)
  const [newPt, setNewPt]           = useState({ conditions: [], conditionInput: '', insurance: '', care_manager: '', consent_date: new Date().toISOString().slice(0, 10), consent_method: 'verbal' })
  const [enrolling, setEnrolling]   = useState(false)
  const [enrollError, setEnrollError] = useState('')
  const [checkinForm, setCheckinForm] = useState({ minutes: '', notes: '', barriers: '', plan_update: '' })
  const [planTasks, setPlanTasks]   = useState([])
  const [planGoals, setPlanGoals]   = useState([])
  const [careTeam, setCareTeam]     = useState([])
  const [planStatus, setPlanStatus] = useState('active')
  const [saving, setSaving]         = useState(false)
  const [expanded, setExpanded]     = useState({})
  const [showDisenroll, setShowDisenroll] = useState(false)
  const [disenrolling, setDisenrolling] = useState(false)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [aiSuggesting, setAiSuggesting] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [planHistory, setPlanHistory] = useState([])
  const [historyExpanded, setHistoryExpanded] = useState({})
  const [aiDrafting, setAiDrafting] = useState(false)

  useEffect(() => { if (key) loadPatients() }, [key])
  useEffect(() => { if (key && showAddPt) loadRoster() }, [key, showAddPt])
  useEffect(() => {
    if (selected) {
      loadPlan(selected.id)
      loadCheckins(selected.id)
      setTimerRunning(false)
      setTimerSeconds(0)
    }
  }, [selected])

  // Auto-tracks live time-on-task per patient so CCM minutes are captured
  // automatically instead of being estimated and typed in after the fact.
  useEffect(() => {
    if (!timerRunning) return
    const id = setInterval(() => setTimerSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [timerRunning])

  function openCheckinFromTimer() {
    setTimerRunning(false)
    const mins = Math.max(1, Math.round(timerSeconds / 60))
    setCheckinForm(f => ({ ...f, minutes: String(mins) }))
    setShowCheckin(true)
    aiSuggestCheckin()
  }

  async function loadPatients() {
    try {
      const r = await fetch('/api/ccm/patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPatients(d.patients || [])
    } catch {}
  }

  async function loadPlan(pid) {
    try {
      const r = await fetch(`/api/ccm/patients/${pid}/plan`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPlan(d.plan || null)
      setPlanTasks(d.plan?.tasks ? JSON.parse(d.plan.tasks) : [])
      try { setPlanGoals(d.plan?.goals ? JSON.parse(d.plan.goals) : []) } catch { setPlanGoals([]) }
      try { setCareTeam(d.plan?.care_team ? JSON.parse(d.plan.care_team) : []) } catch { setCareTeam([]) }
      setPlanStatus(d.plan?.status || 'active')
    } catch {}
  }

  async function loadPlanHistory(pid) {
    try {
      const r = await fetch(`/api/ccm/patients/${pid}/plan/history`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPlanHistory(d.versions || [])
    } catch {}
  }

  async function loadCheckins(pid) {
    try {
      const r = await fetch(`/api/ccm/patients/${pid}/checkins`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setCheckins(d.checkins || [])
    } catch {}
  }

  // Enrollment now pulls demographics straight from the existing Patients
  // roster (gen_patients) instead of retyping name/DOB/phone by hand —
  // only the CCM-specific fields (condition, insurance, care manager) are entered here.
  async function loadRoster() {
    try {
      const r = await fetch('/api/patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setRoster(Array.isArray(d) ? d : [])
    } catch {}
  }

  function resetEnrollForm() {
    setShowAddPt(false)
    setPickedPatient(null)
    setRosterSearch('')
    setEnrollError('')
    setNewPt({ conditions: [], conditionInput: '', insurance: '', care_manager: '', consent_date: new Date().toISOString().slice(0, 10), consent_method: 'verbal' })
  }

  function addCondition(raw) {
    const value = raw.trim()
    if (!value) return
    setNewPt(p => (p.conditions.some(c => c.toLowerCase() === value.toLowerCase()) ? p : { ...p, conditions: [...p.conditions, value], conditionInput: '' }))
  }

  function removeCondition(idx) {
    setNewPt(p => ({ ...p, conditions: p.conditions.filter((_, i) => i !== idx) }))
  }

  async function savePatient(e) {
    e.preventDefault()
    if (!pickedPatient || enrolling) return
    if (newPt.conditions.length === 0) { setEnrollError('Add at least one chronic condition.'); return }
    if (!newPt.consent_date || !newPt.consent_method) { setEnrollError('Consent date and method are required.'); return }
    setEnrolling(true)
    setEnrollError('')
    try {
      const r = await fetch('/api/ccm/patients', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({
          name: pickedPatient.name,
          dob: pickedPatient.dob,
          phone: pickedPatient.phone,
          condition: newPt.conditions.join(', '),
          conditions: newPt.conditions.join(', '),
          medications: pickedPatient.medications,
          allergies: pickedPatient.allergies,
          insurance: newPt.insurance,
          care_manager: newPt.care_manager,
          consent_date: newPt.consent_date,
          consent_method: newPt.consent_method,
        })
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `Enrollment failed (${r.status})`)
      }
      resetEnrollForm()
      loadPatients()
    } catch (err) {
      setEnrollError(err.message || 'Something went wrong enrolling this patient. Please try again.')
    } finally {
      setEnrolling(false)
    }
  }

  async function saveCheckin(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await fetch(`/api/ccm/patients/${selected.id}/checkins`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(checkinForm)
      })
      setShowCheckin(false)
      setCheckinForm({ minutes: '', notes: '', barriers: '', plan_update: '' })
      setTimerSeconds(0)
      loadCheckins(selected.id)
    } finally { setSaving(false) }
  }

  // Drafts a note + minutes estimate from the patient's own info (condition,
  // care plan, recent check-in history) so staff who aren't sure what to write
  // aren't starting the form from a blank page.
  async function aiSuggestCheckin() {
    if (!selected || aiSuggesting) return
    setAiSuggesting(true)
    try {
      const r = await fetch(`/api/ccm/patients/${selected.id}/checkins/ai-suggest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({}),
      })
      const d = await r.json()
      setCheckinForm(f => ({
        ...f,
        minutes: f.minutes || String(d.minutes ?? 15),
        notes: d.notes || f.notes,
        plan_update: d.plan_update || f.plan_update,
      }))
    } catch {} finally { setAiSuggesting(false) }
  }

  // Opens the check-in form pre-filled by AI using the patient's own record —
  // covers staff who don't know what to enter and would otherwise leave it blank.
  function openCheckin() {
    setShowCheckin(true)
    aiSuggestCheckin()
  }

  async function savePlan(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await fetch(`/api/ccm/patients/${selected.id}/plan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ tasks: JSON.stringify(planTasks), goals: JSON.stringify(planGoals), care_team: JSON.stringify(careTeam), status: planStatus })
      })
      setShowPlanEdit(false)
      loadPlan(selected.id)
      if (showHistory) loadPlanHistory(selected.id)
    } finally { setSaving(false) }
  }

  async function toggleTask(idx) {
    const updated = planTasks.map((t, i) => i === idx ? { ...t, done: !t.done } : t)
    setPlanTasks(updated)
    await fetch(`/api/ccm/patients/${selected.id}/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ tasks: JSON.stringify(updated) })
    })
    loadPlan(selected.id)
  }

  async function disenrollPatient() {
    setDisenrolling(true)
    try {
      await fetch(`/api/ccm/patients/${selected.id}`, { method: 'DELETE', headers: { 'x-api-key': key } })
      setShowDisenroll(false)
      setSelected(null)
      loadPatients()
    } finally { setDisenrolling(false) }
  }

  // Drafts goals/tasks/care_team from the patient's clinical picture (conditions,
  // vitals, labs, care gaps, check-in barriers) for the clinician to review and edit —
  // never persisted until the clinician explicitly saves the plan.
  async function aiDraftPlan() {
    if (!selected || aiDrafting) return
    setAiDrafting(true)
    try {
      const r = await fetch(`/api/ccm/patients/${selected.id}/plan/ai-draft`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({}),
      })
      const d = await r.json()
      if (d.tasks) setPlanTasks(d.tasks)
      if (d.goals) setPlanGoals(d.goals)
      if (d.care_team) setCareTeam(d.care_team)
      setShowPlanEdit(true)
    } catch {} finally { setAiDrafting(false) }
  }

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthlyMinutes = checkins.filter(c => c.created_at >= monthStart).reduce((s, c) => s + (c.minutes || 0), 0)
  const ccmEligible = monthlyMinutes >= 20
  const minutesPct = Math.min(100, (monthlyMinutes / 20) * 100)

  const doneTasks = planTasks.filter(t => t.done).length
  const totalTasks = planTasks.length
  const progressPct = totalTasks ? (doneTasks / totalTasks) * 100 : 0

  const filteredPatients = patients.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()))
  const activeCount = patients.filter(p => (p.status || 'active') === 'active').length
  const billableEstimate = patients.length ? Math.round(patients.length * 0.62) : 0
  // Distinct chronic conditions across the enrolled roster — purely a display metric,
  // doesn't touch enrollment/business logic.
  const conditionsTracked = new Set(
    patients.flatMap(p => (p.condition || '').split(',').map(c => c.trim().toLowerCase()).filter(Boolean))
  ).size

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">Chronic Care Management</span>
        <div className="topbar-right">
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddPt(true)}>
            <Plus size={14} /> Enroll Patient
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="card stat-card">
          <div className="stat-icon" style={{ background: '#ede9fe' }}>
            <Users size={20} color="#7c3aed" />
          </div>
          <div className="stat-val">{patients.length}</div>
          <div className="stat-label">Enrolled Patients</div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon" style={{ background: 'var(--success-light)' }}>
            <CheckCircle2 size={20} color="var(--success)" />
          </div>
          <div className="stat-val">{activeCount}</div>
          <div className="stat-label">Active</div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon" style={{ background: '#f5f3ff' }}>
            <DollarSign size={20} color="#8b5cf6" />
          </div>
          <div className="stat-val">{billableEstimate}</div>
          <div className="stat-label">Est. Billable (99490)</div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon" style={{ background: 'var(--primary-light)' }}>
            <ClipboardList size={20} color="var(--primary)" />
          </div>
          <div className="stat-val">{conditionsTracked}</div>
          <div className="stat-label">Conditions Tracked</div>
        </div>
      </div>

      <div style={{ padding: '20px 32px 40px', maxWidth: 1280, margin: '0 auto' }}>

        {!key && (
          <div style={{ marginBottom: 20, background: 'var(--warning-light)', border: '1px solid var(--warning-light)', borderRadius: 'var(--radius)', padding: '16px 20px', color: 'var(--warning)' }}>
            Connect with your doctor key (Logs page) to access CCM features.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20 }}>
          {/* Patient list */}
          <div>
            <div className="card">
              <div className="card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                <span className="card-title">CCM Patients <span style={{ color: '#a78bfa' }}>({patients.length})</span></span>
                <div style={{ position: 'relative' }}>
                  <Search size={13} color="var(--text3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patients…"
                    style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px 7px 28px', fontSize: 12.5, boxSizing: 'border-box', outline: 'none' }} />
                </div>
              </div>
              <div style={{ maxHeight: 560, overflowY: 'auto' }}>
                {filteredPatients.length === 0 && (
                  <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                    No patients found.
                  </div>
                )}
                {filteredPatients.map(p => (
                  <button key={p.id} onClick={() => setSelected(p)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--border)',
                      background: selected?.id === p.id ? 'linear-gradient(90deg, #f5f3ff, #fff)' : '#fff', cursor: 'pointer',
                      borderLeft: selected?.id === p.id ? '3px solid #8b5cf6' : '3px solid transparent', transition: 'background .15s',
                    }}
                    onMouseEnter={e => { if (selected?.id !== p.id) e.currentTarget.style.background = 'var(--surface2)' }}
                    onMouseLeave={e => { if (selected?.id !== p.id) e.currentTarget.style.background = '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#8b5cf6,#c084fc)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 12, fontWeight: 700 }}>
                        {initials(p.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>{p.condition}</div>
                      </div>
                      <div style={{ width: 7, height: 7, borderRadius: 99, background: STATUS_COLOR[p.status || 'active'], flexShrink: 0 }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div>
            {!selected ? (
              <div className="card" style={{ padding: '70px 32px', textAlign: 'center', color: 'var(--text3)' }}>
                <div style={{ width: 68, height: 68, borderRadius: '50%', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <ClipboardList size={28} color="#a78bfa" />
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: 'var(--text2)' }}>Select a patient</div>
                <div style={{ fontSize: 13.5 }}>Choose a patient to view their care plan and check-in history.</div>
              </div>
            ) : (
              <>
                {/* Patient header */}
                <div className="card" style={{ padding: '22px 26px', marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,#8b5cf6,#c084fc)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
                        {initials(selected.name)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 19, color: 'var(--text)' }}>{selected.name}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                          {selected.dob && <span><User size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />DOB: {selected.dob}</span>}
                          {selected.phone && <span><Phone size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />{selected.phone}</span>}
                          <span style={{ background: '#f5f3ff', color: '#7c3aed', padding: '1px 8px', borderRadius: 99, fontWeight: 600 }}>{selected.condition}</span>
                          {selected.consent_date && (
                            <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                              ✓ Consent {selected.consent_date}{selected.consent_method ? ` (${selected.consent_method})` : ''}
                            </span>
                          )}
                        </div>
                        {careTeam.length > 0 && (
                          <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {careTeam.map((m, i) => (
                              <span key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 99, padding: '2px 9px' }}>
                                <strong style={{ color: 'var(--text2)' }}>{m.name}</strong>{m.role ? ` · ${m.role}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ textAlign: 'center', background: ccmEligible ? 'var(--success-light)' : 'var(--warning-light)', border: `1px solid ${ccmEligible ? 'var(--success-light)' : 'var(--warning-light)'}`, borderRadius: 14, padding: '10px 18px', minWidth: 108 }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: ccmEligible ? 'var(--success)' : 'var(--warning)' }}>{monthlyMinutes}<span style={{ fontSize: 12, fontWeight: 500 }}>/20</span></div>
                        <div style={{ height: 4, borderRadius: 4, background: 'var(--border)', marginTop: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${minutesPct}%`, background: ccmEligible ? 'var(--success)' : 'var(--warning)', transition: 'width .4s' }} />
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: ccmEligible ? 'var(--success)' : 'var(--warning)', marginTop: 4 }}>
                          {ccmEligible ? '✓ Billable' : 'min this month'}
                        </div>
                      </div>

                      {/* Live time-on-task tracker — auto-captures minutes instead of guessing them */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: timerRunning ? '#f5f3ff' : 'var(--surface2)', border: `1px solid ${timerRunning ? '#ddd6fe' : 'var(--border)'}`, borderRadius: 14, padding: '10px 14px' }}>
                        <Timer size={15} color={timerRunning ? '#7c3aed' : 'var(--text3)'} />
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 15, color: timerRunning ? '#7c3aed' : 'var(--text2)', minWidth: 46 }}>{formatTimer(timerSeconds)}</span>
                        <button type="button" onClick={() => setTimerRunning(r => !r)} title={timerRunning ? 'Pause timer' : 'Start timer'}
                          style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: timerRunning ? '#ede9fe' : '#8b5cf6', color: timerRunning ? '#7c3aed' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {timerRunning ? <Pause size={13} /> : <Play size={13} />}
                        </button>
                        {timerSeconds > 0 && (
                          <button type="button" onClick={openCheckinFromTimer} title="Log this time as a check-in"
                            style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                            Log time
                          </button>
                        )}
                      </div>

                      <button className="btn btn-primary btn-sm" onClick={openCheckin}>
                        <Clock size={14} /> Log Check-in
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowDisenroll(true)} title="Disenroll from CCM" style={{ color: 'var(--danger)' }}>
                        <UserMinus size={14} /> Disenroll
                      </button>
                    </div>
                  </div>
                </div>

                {/* Care plan */}
                <div className="card" style={{ padding: '22px 26px', marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 15.5, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 9, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Target size={15} color="#8b5cf6" />
                      </div>
                      Care Plan
                      {totalTasks > 0 && <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 500 }}>({doneTasks}/{totalTasks} completed)</span>}
                      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', padding: '2px 9px', borderRadius: 99, color: PLAN_STATUS_COLOR[planStatus] || 'var(--text2)', background: PLAN_STATUS_BG[planStatus] || 'var(--surface2)' }}>
                        {planStatus}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setShowHistory(h => !h); if (!showHistory) loadPlanHistory(selected.id) }}>
                        <Clock size={12} /> History
                      </button>
                      <button className="btn btn-sm" disabled={aiDrafting} onClick={aiDraftPlan}
                        style={{ background: '#faf9ff', border: '1px solid #ddd6fe', color: '#7c3aed' }}>
                        <Wand2 size={12} /> {aiDrafting ? 'Drafting…' : 'AI Draft Care Plan'}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setShowPlanEdit(true)}>
                        <Edit3 size={12} /> Edit Plan
                      </button>
                    </div>
                  </div>

                  {showHistory && (
                    <div style={{ marginBottom: 18, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ padding: '10px 14px', background: 'var(--surface2)', fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>
                        Plan Version History {planHistory.length > 0 && `(${planHistory.length})`}
                      </div>
                      {planHistory.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text3)', fontSize: 12.5 }}>No prior versions saved yet.</div>
                      ) : (
                        planHistory.map(v => {
                          let vt = []; let vg = []; let vc = []
                          try { vt = JSON.parse(v.tasks || '[]') } catch {}
                          try { vg = JSON.parse(v.goals || '[]') } catch {}
                          try { vc = JSON.parse(v.care_team || '[]') } catch {}
                          return (
                            <div key={v.id} style={{ borderTop: '1px solid var(--border)' }}>
                              <button onClick={() => setHistoryExpanded(ex => ({ ...ex, [v.id]: !ex[v.id] }))}
                                style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{new Date(v.saved_at).toLocaleString()}</span>
                                {historyExpanded[v.id] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              </button>
                              {historyExpanded[v.id] && (
                                <div style={{ padding: '0 14px 14px', fontSize: 12.5, color: 'var(--text2)' }}>
                                  <div><strong>Tasks:</strong> {vt.length ? vt.map(t => t.text).join('; ') : 'none'}</div>
                                  <div><strong>Goals:</strong> {vg.length ? vg.map(g => g.description).join('; ') : 'none'}</div>
                                  <div><strong>Care team:</strong> {vc.length ? vc.map(m => `${m.name} (${m.role})`).join('; ') : 'none'}</div>
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}

                  {planTasks.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 13, padding: '26px 0' }}>
                      No care plan yet. Click "Edit Plan" to create one.
                    </div>
                  ) : (
                    <>
                      <div style={{ background: 'var(--surface2)', borderRadius: 8, height: 8, marginBottom: 16, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'linear-gradient(90deg,#8b5cf6,#c084fc)', width: `${progressPct}%`, transition: 'width .4s', borderRadius: 8 }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {planTasks.map((t, i) => (
                          <div key={i} onClick={() => toggleTask(i)}
                            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '9px 10px', borderRadius: 9, background: t.done ? 'var(--success-light)' : 'transparent', transition: 'background .2s' }}
                            onMouseEnter={e => { if (!t.done) e.currentTarget.style.background = 'var(--surface2)' }}
                            onMouseLeave={e => { if (!t.done) e.currentTarget.style.background = 'transparent' }}>
                            {t.done
                              ? <CheckCircle2 size={17} color="var(--success)" style={{ flexShrink: 0, marginTop: 1 }} />
                              : <Circle size={17} color="var(--border-strong)" style={{ flexShrink: 0, marginTop: 1 }} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 13.5, color: t.done ? 'var(--success)' : 'var(--text2)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.text}</span>
                              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
                                {t.frequency || 'as needed'}{t.due ? ` · due ${t.due}` : ''}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {planGoals.length > 0 && (
                    <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.03em' }}>Goals</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {planGoals.map((g, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 9, background: 'var(--surface2)' }}>
                            <span style={{
                              fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 99, flexShrink: 0,
                              color: g.status === 'met' ? 'var(--success)' : g.status === 'in-progress' ? 'var(--warning)' : 'var(--text2)',
                              background: g.status === 'met' ? 'var(--success-light)' : g.status === 'in-progress' ? 'var(--warning-light)' : 'var(--surface2)',
                            }}>
                              {g.status === 'met' ? 'Met' : g.status === 'in-progress' ? 'In progress' : 'Not started'}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>{g.description}</div>
                              {g.target && <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Target: {g.target}</div>}
                            </div>
                            {g.due && <span style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 600, flexShrink: 0 }}>Due {g.due}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Check-in history */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Check-in History <span style={{ color: '#a78bfa' }}>({checkins.length})</span></span>
                  </div>
                  {checkins.length === 0 ? (
                    <div style={{ padding: '26px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No check-ins logged yet.</div>
                  ) : (
                    checkins.map(c => (
                      <div key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <button
                          onClick={() => setExpanded(ex => ({ ...ex, [c.id]: !ex[c.id] }))}
                          style={{ width: '100%', textAlign: 'left', padding: '13px 22px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Calendar size={13} color="#8b5cf6" />
                            <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>
                              {new Date(c.created_at).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}
                            </span>
                            <span style={{ background: '#ede9fe', color: '#7c3aed', fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99 }}>{c.minutes} min</span>
                          </div>
                          {expanded[c.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {expanded[c.id] && (
                          <div style={{ padding: '0 22px 16px', fontSize: 13, color: 'var(--text2)' }}>
                            {c.notes && <div style={{ marginBottom: 8 }}><strong>Notes:</strong> {c.notes}</div>}
                            {c.barriers && <div style={{ marginBottom: 8 }}><strong>Barriers:</strong> {c.barriers}</div>}
                            {c.plan_update && <div><strong>Plan Update:</strong> {c.plan_update}</div>}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Enroll Patient Modal — picks from the existing Patients roster instead of manual entry */}
      {showAddPt && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => e.target === e.currentTarget && resetEnrollForm()}>
          <form onSubmit={savePatient} className="animate-fade-up" style={{ background: 'var(--surface)', borderRadius: 14, width: 460, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.24)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Plus size={17} color="#8b5cf6" />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Enroll in CCM</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>Demographics are pulled in from the Patients list automatically.</div>
                </div>
              </div>
              <button type="button" onClick={resetEnrollForm} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)' }}><X size={18} /></button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {!pickedPatient ? (
                <>
                  <div style={{ position: 'relative', marginBottom: 10 }}>
                    <Search size={13} color="var(--text3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                    <input value={rosterSearch} onChange={e => setRosterSearch(e.target.value)} placeholder="Search patients by name…" autoFocus
                      style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 7, padding: '9px 11px 9px 30px', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, maxHeight: 260, overflowY: 'auto', marginBottom: 16 }}>
                    {roster.filter(p => p.name?.toLowerCase().includes(rosterSearch.toLowerCase()) && !patients.some(cp => cp.name === p.name && cp.dob === p.dob)).length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: 12.5 }}>
                        {roster.length === 0 ? 'No patients found — add one in the Patients page first.' : 'No matches (or already enrolled).'}
                      </div>
                    ) : (
                      roster
                        .filter(p => p.name?.toLowerCase().includes(rosterSearch.toLowerCase()) && !patients.some(cp => cp.name === p.name && cp.dob === p.dob))
                        .slice(0, 30)
                        .map(p => (
                          <button key={p.id} type="button" onClick={() => {
                            setPickedPatient(p)
                            const conditions = (p.conditions || '').split(',').map(c => c.trim()).filter(Boolean)
                            setNewPt(np => ({ ...np, conditions }))
                          }}
                            style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                            onMouseEnter={e => e.currentTarget.style.background = '#faf9ff'}
                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                            <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,#8b5cf6,#c084fc)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#faf9ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#8b5cf6,#c084fc)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {initials(pickedPatient.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>{pickedPatient.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{pickedPatient.dob || 'DOB unknown'}{pickedPatient.phone ? ` · ${pickedPatient.phone}` : ''}</div>
                  </div>
                  <button type="button" onClick={() => setPickedPatient(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontSize: 11.5, fontWeight: 700 }}>Change</button>
                </div>
              )}

              <div style={{ marginBottom: 13 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 5 }}>Insurance / Payer</label>
                <input type="text" value={newPt.insurance}
                  onChange={e => setNewPt(p => ({ ...p, insurance: e.target.value }))}
                  style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 13 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 5 }}>Care Manager</label>
                <input type="text" value={newPt.care_manager}
                  onChange={e => setNewPt(p => ({ ...p, care_manager: e.target.value }))}
                  style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 5 }}>
                  Chronic Conditions <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(add as many as apply — CCM requires 2+)</span>
                </label>
                {newPt.conditions.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {newPt.conditions.map((c, i) => (
                      <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f5f3ff', color: '#7c3aed', borderRadius: 99, padding: '4px 6px 4px 11px', fontSize: 12, fontWeight: 600 }}>
                        {c}
                        <button type="button" onClick={() => removeCondition(i)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', display: 'flex', alignItems: 'center', padding: 2 }}>
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" value={newPt.conditionInput}
                    onChange={e => setNewPt(p => ({ ...p, conditionInput: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCondition(newPt.conditionInput) } }}
                    placeholder="e.g. Diabetes Type 2 — press Enter to add"
                    style={{ flex: 1, border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
                  <button type="button" onClick={() => addCondition(newPt.conditionInput)}
                    style={{ padding: '0 14px', border: '1px solid #ddd6fe', borderRadius: 8, background: '#faf9ff', color: '#7c3aed', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Add</button>
                </div>
                {pickedPatient?.conditions && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>From patient record: {pickedPatient.conditions}</div>
                )}
              </div>
              <div style={{ marginBottom: 20, background: '#faf9ff', border: '1px solid #ede9fe', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 10 }}>CCM Consent (required)</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Consent Date *</label>
                    <input type="date" required value={newPt.consent_date}
                      onChange={e => setNewPt(p => ({ ...p, consent_date: e.target.value }))}
                      style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Consent Method *</label>
                    <select required value={newPt.consent_method} onChange={e => setNewPt(p => ({ ...p, consent_method: e.target.value }))}
                      style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13 }}>
                      <option value="verbal">Verbal</option>
                      <option value="written">Written</option>
                      <option value="portal">Portal</option>
                    </select>
                  </div>
                </div>
              </div>
              {enrollError && (
                <div style={{ marginBottom: 14, background: 'var(--danger-light)', border: '1px solid var(--danger-light)', borderRadius: 8, padding: '9px 13px', color: 'var(--danger)', fontSize: 12.5, fontWeight: 600 }}>
                  {enrollError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={resetEnrollForm} className="btn btn-secondary btn-sm">Cancel</button>
                {(() => {
                  const ready = pickedPatient && newPt.conditions.length > 0 && newPt.consent_date && newPt.consent_method && !enrolling
                  return (
                    <button type="submit" disabled={!ready} className="btn btn-primary btn-sm">
                      {enrolling ? 'Enrolling…' : 'Enroll'}
                    </button>
                  )
                })()}
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Log Check-in Modal */}
      {showCheckin && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowCheckin(false)}>
          <form onSubmit={saveCheckin} className="animate-fade-up" style={{ background: 'var(--surface)', borderRadius: 14, width: 460, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.24)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Clock size={17} color="#8b5cf6" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Log CCM Check-in</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" onClick={aiSuggestCheckin} disabled={aiSuggesting}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 99, border: '1px solid #ddd6fe', background: '#faf9ff', color: '#7c3aed', fontSize: 12, fontWeight: 700, cursor: aiSuggesting ? 'default' : 'pointer', flexShrink: 0, opacity: aiSuggesting ? .6 : 1 }}>
                  <Wand2 size={13} /> {aiSuggesting ? 'Drafting…' : 'AI Suggest'}
                </button>
                <button type="button" onClick={() => setShowCheckin(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)' }}><X size={18} /></button>
              </div>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ marginBottom: 13 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 5 }}>Time Spent (minutes) *</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  {QUICK_MINUTES.map(m => (
                    <button key={m} type="button" onClick={() => setCheckinForm(f => ({ ...f, minutes: String(m) }))}
                      style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${String(m) === String(checkinForm.minutes) ? '#8b5cf6' : 'var(--border)'}`, background: String(m) === String(checkinForm.minutes) ? '#f5f3ff' : '#fff', color: String(m) === String(checkinForm.minutes) ? '#7c3aed' : 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {m}m
                    </button>
                  ))}
                </div>
                <input type="number" min="1" required value={checkinForm.minutes} onChange={e => setCheckinForm(f => ({ ...f, minutes: e.target.value }))}
                  style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>Need ≥ 20 min/month for CPT 99490 billing</div>
              </div>
              <div style={{ marginBottom: 13 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 5 }}>Quick-fill Clinical Notes</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {NOTE_TEMPLATES.map(t => (
                    <button key={t.label} type="button" onClick={() => setCheckinForm(f => ({ ...f, notes: t.notes }))}
                      style={{ padding: '5px 11px', borderRadius: 8, border: '1px dashed #ddd6fe', background: '#faf9ff', color: '#7c3aed', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {[
                { label: 'Clinical Notes', key: 'notes' },
                { label: 'Barriers to Care', key: 'barriers' },
                { label: 'Plan Update', key: 'plan_update' },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 13 }}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 5 }}>{f.label}</label>
                  <textarea rows={2} value={checkinForm[f.key]} onChange={e => setCheckinForm(cf => ({ ...cf, [f.key]: e.target.value }))}
                    style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" onClick={() => setShowCheckin(false)} className="btn btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
                  {saving ? 'Saving…' : 'Save Check-in'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Edit Care Plan Modal */}
      {showPlanEdit && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowPlanEdit(false)}>
          <form onSubmit={savePlan} className="animate-fade-up" style={{ background: 'var(--surface)', borderRadius: 14, width: 560, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.24)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Edit3 size={17} color="#8b5cf6" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Edit Care Plan</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <select value={planStatus} onChange={e => setPlanStatus(e.target.value)}
                  style={{ border: '1.5px solid var(--border)', borderRadius: 7, padding: '6px 10px', fontSize: 12.5, fontWeight: 600, color: PLAN_STATUS_COLOR[planStatus] }}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
                <button type="button" onClick={() => setShowPlanEdit(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)' }}><X size={18} /></button>
              </div>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 6 }}>Tasks</label>
                {planTasks.map((t, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, padding: 8, border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input placeholder="Task" value={t.text} onChange={e => setPlanTasks(tasks => tasks.map((tk, j) => j === i ? { ...tk, text: e.target.value } : tk))}
                        style={{ flex: 1, border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13 }} />
                      <button type="button" onClick={() => setPlanTasks(tasks => tasks.filter((_, j) => j !== i))}
                        style={{ background: 'var(--danger-light)', border: 'none', borderRadius: 7, width: 30, height: 30, cursor: 'pointer', color: 'var(--danger)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <X size={14} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input placeholder="Frequency (e.g. daily)" value={t.frequency || ''}
                        onChange={e => setPlanTasks(tasks => tasks.map((tk, j) => j === i ? { ...tk, frequency: e.target.value } : tk))}
                        style={{ flex: 1, border: '1.5px solid var(--border)', borderRadius: 7, padding: '7px 10px', fontSize: 12.5 }} />
                      <input type="date" value={t.due || ''}
                        onChange={e => setPlanTasks(tasks => tasks.map((tk, j) => j === i ? { ...tk, due: e.target.value } : tk))}
                        style={{ border: '1.5px solid var(--border)', borderRadius: 7, padding: '7px 10px', fontSize: 12.5 }} />
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setPlanTasks(tasks => [...tasks, { text: '', done: false, frequency: 'as needed', due: null }])}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: '#faf9ff', border: '1.5px dashed #ddd6fe', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', fontSize: 13, color: '#7c3aed', width: '100%', fontWeight: 600 }}>
                  <Plus size={13} /> Add task
                </button>
              </div>

              <div style={{ marginBottom: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 6 }}>Goals</label>
                {planGoals.map((g, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input placeholder="Description" value={g.description || ''}
                        onChange={e => setPlanGoals(gs => gs.map((gg, j) => j === i ? { ...gg, description: e.target.value } : gg))}
                        style={{ flex: 1, border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13 }} />
                      <button type="button" onClick={() => setPlanGoals(gs => gs.filter((_, j) => j !== i))}
                        style={{ background: 'var(--danger-light)', border: 'none', borderRadius: 7, width: 30, height: 30, cursor: 'pointer', color: 'var(--danger)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <X size={14} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input placeholder="Target" value={g.target || ''}
                        onChange={e => setPlanGoals(gs => gs.map((gg, j) => j === i ? { ...gg, target: e.target.value } : gg))}
                        style={{ flex: 1, border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13 }} />
                      <input type="date" value={g.due || ''}
                        onChange={e => setPlanGoals(gs => gs.map((gg, j) => j === i ? { ...gg, due: e.target.value } : gg))}
                        style={{ border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13 }} />
                      <select value={g.status || 'not-started'}
                        onChange={e => setPlanGoals(gs => gs.map((gg, j) => j === i ? { ...gg, status: e.target.value } : gg))}
                        style={{ border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13 }}>
                        <option value="not-started">Not started</option>
                        <option value="in-progress">In progress</option>
                        <option value="met">Met</option>
                      </select>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setPlanGoals(gs => [...gs, { description: '', target: '', due: '', status: 'not-started' }])}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: '#faf9ff', border: '1.5px dashed #ddd6fe', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', fontSize: 13, color: '#7c3aed', width: '100%', fontWeight: 600 }}>
                  <Plus size={13} /> Add goal
                </button>
              </div>

              <div style={{ marginBottom: 18, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 6 }}>Care Team</label>
                {careTeam.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <input placeholder="Name" value={m.name || ''}
                      onChange={e => setCareTeam(ct => ct.map((cm, j) => j === i ? { ...cm, name: e.target.value } : cm))}
                      style={{ flex: 1, border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13 }} />
                    <input placeholder="Role" value={m.role || ''}
                      onChange={e => setCareTeam(ct => ct.map((cm, j) => j === i ? { ...cm, role: e.target.value } : cm))}
                      style={{ flex: 1, border: '1.5px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13 }} />
                    <button type="button" onClick={() => setCareTeam(ct => ct.filter((_, j) => j !== i))}
                      style={{ background: 'var(--danger-light)', border: 'none', borderRadius: 7, width: 30, height: 30, cursor: 'pointer', color: 'var(--danger)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setCareTeam(ct => [...ct, { name: '', role: '' }])}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: '#faf9ff', border: '1.5px dashed #ddd6fe', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', fontSize: 13, color: '#7c3aed', width: '100%', fontWeight: 600 }}>
                  <Plus size={13} /> Add team member
                </button>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <button type="button" onClick={() => setShowPlanEdit(false)} className="btn btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
                  <Save size={13} /> {saving ? 'Saving…' : 'Save Plan'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Disenroll Confirm Modal */}
      {showDisenroll && selected && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowDisenroll(false)}>
          <div className="animate-fade-up" style={{ background: 'var(--surface)', borderRadius: 14, width: 420, maxWidth: '95vw', boxShadow: '0 24px 64px rgba(0,0,0,.24)', padding: '24px 24px 20px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--danger-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <UserMinus size={24} color="var(--danger)" />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Disenroll {selected.name}?</div>
            <p style={{ fontSize: 13.5, color: 'var(--text2)', margin: '0 0 24px', lineHeight: 1.5 }}>
              This removes the patient from CCM along with their care plan and check-in history. This cannot be undone.
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

      <AiHelp module="ccm" accent={ACCENT} />
    </div>
  )
}
