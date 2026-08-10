import React, { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { ClipboardList, Plus, CheckCircle2, Circle, Clock, Calendar, ChevronDown, ChevronUp, Phone, Target, Edit3, Save, X, Search, UserMinus, Timer, Pause, Play, Wand2, Users, DollarSign, History } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import AiHelp from '../components/AiHelp.jsx'
import PatientSnapshot from '../components/PatientSnapshot.jsx'
import EmptyState from '../components/EmptyState.jsx'

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
// Kept as a literal hex (not a CSS var) because AiHelp concatenates alpha-suffixes
// onto it (e.g. `${accent}cc`). Matches the app's real --primary color instead of
// CCM's old standalone purple/violet branding, which didn't match the rest of the
// clinical platform (RPM, Billing, etc. all use this same teal).
const ACCENT = '#0e7490'

function formatTimer(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase()
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

// CPT 99490 billing eligibility is based on minutes logged in the current
// calendar month — shared by the roster aggregation, the per-patient sync,
// and the selected-patient detail header so all three agree.
function currentMonthStart() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}
function sumMinutesThisMonth(checkins) {
  const monthStart = currentMonthStart()
  return checkins.filter(c => c.created_at >= monthStart).reduce((s, c) => s + (c.minutes || 0), 0)
}

export default function CCM() {
  const { key, label } = useKey()
  const [patients, setPatients]     = useState([])
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [rosterMinutes, setRosterMinutes] = useState({}) // { [patientId]: minutesThisMonth } — real billing eligibility, not a guess
  const [selected, setSelected]     = useState(null)
  const [checkins, setCheckins]     = useState([])
  const [showAddPt, setShowAddPt]   = useState(false)
  const [showCheckin, setShowCheckin] = useState(false)
  const [showPlanEdit, setShowPlanEdit] = useState(false)
  const [roster, setRoster]         = useState([])
  const [rosterSearch, setRosterSearch] = useState('')
  const [pickedPatient, setPickedPatient] = useState(null)
  const [newPt, setNewPt]           = useState({ conditions: [], conditionInput: '', insurance: '', care_manager: label || '', consent_date: new Date().toISOString().slice(0, 10), consent_method: 'verbal', call_id: '' })
  const [enrolling, setEnrolling]   = useState(false)
  const [enrollError, setEnrollError] = useState('')
  const [checkinForm, setCheckinForm] = useState({ minutes: '', notes: '', barriers: '', plan_update: '', call_id: '' })
  const [relatedCalls, setRelatedCalls] = useState([])
  // Calls tied to the picked roster patient, offered as a "Related Call" at
  // enrollment time — separate from relatedCalls (which is for an already-enrolled
  // patient's check-ins) since this looks up by gen_patients id, before a CCM
  // enrollment row even exists.
  const [enrollCalls, setEnrollCalls] = useState([])
  // Committed care plan — reflects what's actually saved on the server, driving the
  // read-only view and toggleTask()'s direct saves. Never written to by the Edit
  // modal or the AI draft — see editTasks/editGoals/editCareTeam/editStatus below.
  const [planTasks, setPlanTasks]   = useState([])
  const [planGoals, setPlanGoals]   = useState([])
  const [careTeam, setCareTeam]     = useState([])
  const [planStatus, setPlanStatus] = useState('active')
  // Edit-buffer state for the Edit Care Plan modal (and AI Draft, which populates
  // it for review). Kept fully separate from the committed state above so a
  // still-in-flight toggleTask() save can never pick up an unsaved edit/AI draft,
  // and so closing the modal without saving needs no reset logic at all — the
  // committed state was simply never touched.
  const [editTasks, setEditTasks]   = useState([])
  const [editGoals, setEditGoals]   = useState([])
  const [editCareTeam, setEditCareTeam] = useState([])
  const [editStatus, setEditStatus] = useState('active')
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
  const [doctorDirectory, setDoctorDirectory] = useState([]) // platform doctors, for the Care Team "select a doctor" picker
  // Backing refs for toggleTask()'s race-proof save queue — see toggleTask below.
  const planTasksRef = useRef(planTasks)
  const toggleQueueRef = useRef(Promise.resolve())
  useEffect(() => { planTasksRef.current = planTasks }, [planTasks])

  useEffect(() => { if (key) loadPatients() }, [key])
  useEffect(() => { if (key) loadDoctorDirectory() }, [key])
  useEffect(() => { if (key && showAddPt) loadRoster() }, [key, showAddPt])
  useEffect(() => {
    if (selected) {
      loadPlan(selected.id)
      loadCheckins(selected.id)
      loadRelatedCalls(selected.id)
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
      const list = d.patients || []
      setPatients(list)
      loadRosterMinutes(list)
    } catch {}
  }

  // The patient list has no billing data on it — "Est. Billable" used to be a
  // flat 62% guess with no basis in real check-ins. This pulls each patient's
  // check-ins once up front so the stat (and the per-patient minutes badge in
  // the sidebar) reflect actual logged minutes for the current calendar month.
  async function loadRosterMinutes(list) {
    const since = currentMonthStart()
    const entries = await Promise.all(list.map(async p => {
      try {
        const r = await fetch(`/api/ccm/patients/${p.id}/checkins?since=${encodeURIComponent(since)}`, { headers: { 'x-api-key': key } })
        const d = await r.json()
        return [p.id, sumMinutesThisMonth(d.checkins || [])]
      } catch { return [p.id, 0] }
    }))
    setRosterMinutes(Object.fromEntries(entries))
  }

  async function loadDoctorDirectory() {
    try {
      const r = await fetch('/api/doctors', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setDoctorDirectory((d.doctors || []).filter(u => u.role === 'doctor'))
    } catch {}
  }

  async function loadPlan(pid) {
    try {
      const r = await fetch(`/api/ccm/patients/${pid}/plan`, { headers: { 'x-api-key': key } })
      const d = await r.json()
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
      const list = d.checkins || []
      setCheckins(list)
      setRosterMinutes(rm => ({ ...rm, [pid]: sumMinutesThisMonth(list) }))
    } catch {}
  }

  // Calls (patient<->doctor or family<->doctor) tied to this patient, so a check-in
  // logged right after a call can be linked to exactly which conversation it came from.
  async function loadRelatedCalls(pid) {
    try {
      const r = await fetch(`/api/ccm/patients/${pid}/calls`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setRelatedCalls(d.calls || [])
    } catch { setRelatedCalls([]) }
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
    setEnrollCalls([])
    setNewPt({ conditions: [], conditionInput: '', insurance: '', care_manager: label || '', consent_date: new Date().toISOString().slice(0, 10), consent_method: 'verbal', call_id: '' })
  }

  // Calls already logged for this roster patient before CCM enrollment exists —
  // e.g. the consent/intake call itself — so it can be linked right at enrollment
  // instead of requiring a separate check-in afterward.
  async function loadEnrollCalls(genPatientId) {
    try {
      const r = await fetch(`/api/patients/${genPatientId}/calls`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setEnrollCalls(d.calls || [])
    } catch { setEnrollCalls([]) }
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
          gen_patient_id: pickedPatient.id,
          call_id: newPt.call_id || undefined,
        })
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error || `Enrollment failed (${r.status})`)
      }
      const d = await r.json().catch(() => ({}))
      if (d.care_plan_drafted && d.g0506_billed) toast.success('Enrolled — care plan drafted and CPT G0506 auto-billed for review')
      else if (d.care_plan_drafted) toast.success('Enrolled — AI drafted a starting care plan for review')
      else if (d.g0506_billed) toast.success('Enrolled — CPT G0506 auto-billed for review')
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
      const r = await fetch(`/api/ccm/patients/${selected.id}/checkins`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(checkinForm)
      })
      const d = await r.json().catch(() => ({}))
      if (d.auto_billed) toast.success('20+ min this month — CPT 99490 auto-drafted in Billing')
      setShowCheckin(false)
      setCheckinForm({ minutes: '', notes: '', barriers: '', plan_update: '', call_id: '' })
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

  // Opens the Edit Care Plan modal seeded from the committed plan — the modal
  // only ever edits the editTasks/editGoals/editCareTeam/editStatus buffer below.
  function openPlanEdit() {
    setEditTasks(planTasks)
    setEditGoals(planGoals)
    setEditCareTeam(careTeam)
    setEditStatus(planStatus)
    setShowPlanEdit(true)
  }

  async function savePlan(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await fetch(`/api/ccm/patients/${selected.id}/plan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ tasks: JSON.stringify(editTasks), goals: JSON.stringify(editGoals), care_team: JSON.stringify(editCareTeam), status: editStatus })
      })
      setShowPlanEdit(false)
      loadPlan(selected.id)
      if (showHistory) loadPlanHistory(selected.id)
    } finally { setSaving(false) }
  }

  // Cancel/X/backdrop just hide the modal — nothing to reset, since the edit
  // buffer (editTasks/editGoals/editCareTeam/editStatus) is fully separate from
  // the committed planTasks/planGoals/careTeam/planStatus the read-only view and
  // toggleTask() use. An abandoned edit or rejected AI draft was never written
  // to committed state in the first place, so it's discarded simply by not saving.
  function closePlanEdit() {
    setShowPlanEdit(false)
  }

  // Optimistic + serialized: planTasksRef always holds the latest committed tasks,
  // and each save is queued behind any still-in-flight one. Without this, checking
  // off several tasks in quick succession could race — a later click's save could
  // start from a stale pre-toggle snapshot and silently overwrite/revert an earlier
  // click's change once both requests landed out of order.
  function toggleTask(idx) {
    const updated = planTasksRef.current.map((t, i) => i === idx ? { ...t, done: !t.done } : t)
    planTasksRef.current = updated
    setPlanTasks(updated)
    toggleQueueRef.current = toggleQueueRef.current.then(() =>
      fetch(`/api/ccm/patients/${selected.id}/plan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ tasks: JSON.stringify(planTasksRef.current) }),
      }).catch(() => {})
    )
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

  // Complex CCM (99487/99489) bills against a higher minute threshold and requires
  // CMS's moderate/high medical-decision-making criteria — a clinical judgment call,
  // so this stays a manual toggle rather than something inferred from time logged.
  async function toggleComplexCcm() {
    const next = !selected.complex_ccm
    setSelected(s => ({ ...s, complex_ccm: next ? 1 : 0 }))
    setPatients(ps => ps.map(p => p.id === selected.id ? { ...p, complex_ccm: next ? 1 : 0 } : p))
    try {
      await fetch(`/api/ccm/patients/${selected.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ complex_ccm: next }),
      })
    } catch {}
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
      // Seeds the edit buffer only — never the committed planTasks/planGoals/careTeam
      // — so this un-reviewed draft can't leak into a toggleTask() save or the
      // read-only view before the clinician explicitly clicks Save Plan.
      setEditTasks(d.tasks || planTasks)
      setEditGoals(d.goals || planGoals)
      setEditCareTeam(d.care_team || careTeam)
      setEditStatus(planStatus)
      setShowPlanEdit(true)
    } catch {} finally { setAiDrafting(false) }
  }

  const monthlyMinutes = sumMinutesThisMonth(checkins)
  const ccmThreshold = selected?.complex_ccm ? 60 : 20
  const ccmEligible = monthlyMinutes >= ccmThreshold
  const minutesPct = Math.min(100, (monthlyMinutes / ccmThreshold) * 100)

  const doneTasks = planTasks.filter(t => t.done).length
  const totalTasks = planTasks.length
  const progressPct = totalTasks ? (doneTasks / totalTasks) * 100 : 0

  const filteredPatients = patients
    .filter(p => p.name?.toLowerCase().includes(search.toLowerCase()) || p.condition?.toLowerCase().includes(search.toLowerCase()))
    .filter(p => statusFilter === 'all' || (p.status || 'active') === statusFilter)
  const activeCount = patients.filter(p => (p.status || 'active') === 'active').length
  const inactiveCount = patients.filter(p => (p.status || 'active') === 'inactive').length
  // Real count of patients who've hit the 20-min/month CPT 99490 threshold —
  // derived from each patient's actual logged check-in minutes (loadRosterMinutes),
  // not a flat percentage guess.
  const billableCount = patients.filter(p => (rosterMinutes[p.id] || 0) >= 20).length
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
          <div className="stat-icon" style={{ background: 'var(--primary-light)' }}>
            <Users size={20} color="var(--primary-dark)" />
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
          <div className="stat-icon" style={{ background: 'var(--primary-light)' }}>
            <DollarSign size={20} color="var(--primary)" />
          </div>
          <div className="stat-val">{billableCount}</div>
          <div className="stat-label">Billable This Month (99490)</div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon" style={{ background: 'var(--primary-light)' }}>
            <ClipboardList size={20} color="var(--primary)" />
          </div>
          <div className="stat-val">{conditionsTracked}</div>
          <div className="stat-label">Conditions Tracked</div>
        </div>
      </div>

      <div style={{ padding: '24px 32px 40px', maxWidth: 1280, margin: '0 auto' }}>

        {!key && (
          <div style={{ marginBottom: 20, background: 'var(--warning-light)', border: '1px solid var(--warning-light)', borderRadius: 'var(--radius)', padding: '14px 20px', color: 'var(--warning)', fontSize: 13, fontWeight: 600 }}>
            Connect with your doctor key (Logs page) to access CCM features.
          </div>
        )}

        <div className="list-detail-layout">
          {/* Patient list */}
          <div>
            <div className="card">
              <div className="card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
                <span className="card-title">CCM Patients <span style={{ color: 'var(--text3)', fontWeight: 500 }}>({patients.length})</span></span>
                <div style={{ position: 'relative' }}>
                  <Search size={13} color="var(--text3)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patients…"
                    style={{ width: '100%', border: '1.5px solid var(--border)', borderRadius: 8, padding: '8px 12px 8px 30px', fontSize: 13, boxSizing: 'border-box', outline: 'none', color: 'var(--text)' }} />
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { key: 'all', label: 'All' },
                    { key: 'active', label: `Active (${activeCount})` },
                    { key: 'inactive', label: `Inactive (${inactiveCount})` },
                  ].map(f => (
                    <button key={f.key} onClick={() => setStatusFilter(f.key)}
                      style={{
                        border: '1px solid ' + (statusFilter === f.key ? 'var(--primary)' : 'var(--border)'),
                        background: statusFilter === f.key ? 'var(--primary-light)' : '#fff',
                        color: statusFilter === f.key ? 'var(--primary-dark)' : 'var(--text2)',
                        borderRadius: 99, padding: '5px 12px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ maxHeight: 560, overflowY: 'auto' }}>
                {filteredPatients.length === 0 && (
                  <EmptyState icon={Users} title="No patients found"
                    hint={patients.length === 0 ? 'Enroll a patient to start tracking CCM check-ins and care plans.' : 'Try a different search term or status filter.'} />
                )}
                {filteredPatients.map(p => {
                  const mins = rosterMinutes[p.id] || 0
                  const billable = mins >= 20
                  return (
                  <button key={p.id} onClick={() => setSelected(p)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '13px 16px', border: 'none', borderBottom: '1px solid var(--border)',
                      background: selected?.id === p.id ? 'linear-gradient(90deg, var(--primary-light), #fff)' : '#fff', cursor: 'pointer',
                      borderLeft: selected?.id === p.id ? '3px solid var(--primary)' : '3px solid transparent', transition: 'background .15s',
                    }}
                    onMouseEnter={e => { if (selected?.id !== p.id) e.currentTarget.style.background = 'var(--surface2)' }}
                    onMouseLeave={e => { if (selected?.id !== p.id) e.currentTarget.style.background = '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,var(--primary),var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 12.5, fontWeight: 700 }}>
                        {initials(p.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.condition}</span>
                          <span style={{ color: billable ? 'var(--success)' : 'var(--text3)', fontWeight: 700, flexShrink: 0 }}>· {mins}m</span>
                        </div>
                      </div>
                      <div style={{ width: 7, height: 7, borderRadius: 99, background: STATUS_COLOR[p.status || 'active'], flexShrink: 0 }} />
                    </div>
                  </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div>
            {!selected ? (
              <div className="card" style={{ padding: '64px 28px', textAlign: 'center', color: 'var(--text3)' }}>
                <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <ClipboardList size={28} color="var(--primary)" />
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: 'var(--text)' }}>Select a patient</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>Choose a patient from the list to view their care plan and check-in history.</div>
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
                        <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--text)', letterSpacing: '-.01em' }}>{selected.name}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                          {/* DOB/phone shown once, in the PatientSnapshot card below — not repeated here */}
                          <span style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)', padding: '3px 10px', borderRadius: 99, fontWeight: 700, fontSize: 11.5 }}>{selected.condition}</span>
                          <button type="button" onClick={toggleComplexCcm} title="Toggle complex CCM billing (99487/99489 vs 99490/99439)"
                            style={{ display: 'flex', alignItems: 'center', gap: 4, background: selected.complex_ccm ? 'var(--warning-light)' : 'var(--surface2)', color: selected.complex_ccm ? 'var(--warning)' : 'var(--text3)', border: '1px solid ' + (selected.complex_ccm ? 'var(--warning-light)' : 'var(--border)'), padding: '3px 10px', borderRadius: 99, fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}>
                            {selected.complex_ccm ? '● Complex CCM' : 'Standard CCM'}
                          </button>
                          {selected.consent_date && (
                            <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: 12 }}>
                              ✓ Consent {selected.consent_date}{selected.consent_method ? ` (${selected.consent_method})` : ''}
                            </span>
                          )}
                        </div>
                        {checkins[0]?.created_at && (
                          <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <Clock size={11} /> Last check-in {timeAgo(checkins[0].created_at)}
                          </div>
                        )}
                        {careTeam.length > 0 && (
                          <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {careTeam.map((m, i) => (
                              <span key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 99, padding: '3px 10px' }}>
                                <strong style={{ color: 'var(--text2)' }}>{m.name}</strong>{m.role ? ` · ${m.role}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ textAlign: 'center', background: ccmEligible ? 'var(--success-light)' : 'var(--warning-light)', border: `1px solid ${ccmEligible ? 'var(--success-light)' : 'var(--warning-light)'}`, borderRadius: 14, padding: '12px 20px', minWidth: 112 }}>
                        <div style={{ fontSize: 24, fontWeight: 800, color: ccmEligible ? 'var(--success)' : 'var(--warning)', letterSpacing: '-.01em' }}>{monthlyMinutes}<span style={{ fontSize: 12.5, fontWeight: 600 }}>/{ccmThreshold}</span></div>
                        <div style={{ height: 4, borderRadius: 4, background: 'var(--border)', marginTop: 6, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${minutesPct}%`, background: ccmEligible ? 'var(--success)' : 'var(--warning)', transition: 'width .4s' }} />
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: ccmEligible ? 'var(--success)' : 'var(--warning)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          {ccmEligible ? '✓ Billable' : 'min this month'}
                        </div>
                      </div>

                      {/* Live time-on-task tracker — auto-captures minutes instead of guessing them */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: timerRunning ? 'var(--primary-light)' : 'var(--surface2)', border: `1px solid ${timerRunning ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 14, padding: '10px 16px' }}>
                        <Timer size={15} color={timerRunning ? 'var(--primary-dark)' : 'var(--text3)'} />
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 15, color: timerRunning ? 'var(--primary-dark)' : 'var(--text2)', minWidth: 46 }}>{formatTimer(timerSeconds)}</span>
                        <button type="button" onClick={() => setTimerRunning(r => !r)} title={timerRunning ? 'Pause timer' : 'Start timer'}
                          style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: timerRunning ? 'var(--primary-light)' : 'var(--primary)', color: timerRunning ? 'var(--primary-dark)' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {timerRunning ? <Pause size={13} /> : <Play size={13} />}
                        </button>
                        {timerSeconds > 0 && (
                          <button type="button" onClick={openCheckinFromTimer} title="Log this time as a check-in"
                            style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary-dark)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
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

                <PatientSnapshot patient={selected} compact />

                {/* Care plan */}
                <div className="card" style={{ padding: '24px 28px', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 10, letterSpacing: '-.01em' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Target size={16} color="var(--primary)" />
                      </div>
                      Care Plan
                      {totalTasks > 0 && <span style={{ fontSize: 12.5, color: 'var(--text2)', fontWeight: 600 }}>({doneTasks}/{totalTasks} completed)</span>}
                      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', padding: '3px 10px', borderRadius: 99, color: PLAN_STATUS_COLOR[planStatus] || 'var(--text2)', background: PLAN_STATUS_BG[planStatus] || 'var(--surface2)' }}>
                        {planStatus}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setShowHistory(h => !h); if (!showHistory) loadPlanHistory(selected.id) }}>
                        <Clock size={12} /> History
                      </button>
                      <button className="btn btn-sm" disabled={aiDrafting} onClick={aiDraftPlan}
                        style={{ background: 'var(--primary-light)', border: '1px solid var(--primary)', color: 'var(--primary-dark)' }}>
                        <Wand2 size={12} /> {aiDrafting ? 'Drafting…' : 'AI Draft Care Plan'}
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={openPlanEdit}>
                        <Edit3 size={12} /> Edit Plan
                      </button>
                    </div>
                  </div>

                  {showHistory && (
                    <div style={{ marginBottom: 20, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ padding: '12px 16px', background: 'var(--surface2)', fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.03em' }}>
                        Plan Version History {planHistory.length > 0 && `(${planHistory.length})`}
                      </div>
                      {planHistory.length === 0 ? (
                        <EmptyState icon={History} title="No prior versions saved yet" compact />
                      ) : (
                        planHistory.map(v => {
                          let vt = []; let vg = []; let vc = []
                          try { vt = JSON.parse(v.tasks || '[]') } catch {}
                          try { vg = JSON.parse(v.goals || '[]') } catch {}
                          try { vc = JSON.parse(v.care_team || '[]') } catch {}
                          return (
                            <div key={v.id} style={{ borderTop: '1px solid var(--border)' }}>
                              <button onClick={() => setHistoryExpanded(ex => ({ ...ex, [v.id]: !ex[v.id] }))}
                                style={{ width: '100%', textAlign: 'left', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 12.5, color: 'var(--text2)', fontWeight: 500 }}>{new Date(v.saved_at).toLocaleString()}</span>
                                {historyExpanded[v.id] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              </button>
                              {historyExpanded[v.id] && (
                                <div style={{ padding: '0 16px 16px', fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6 }}>
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
                    <EmptyState icon={Target} title="No care plan yet" hint='Click "Edit Plan" or "AI Draft Care Plan" to create one.' compact />
                  ) : (
                    <>
                      <div style={{ background: 'var(--surface2)', borderRadius: 8, height: 8, marginBottom: 16, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: 'linear-gradient(90deg,var(--primary),var(--accent))', width: `${progressPct}%`, transition: 'width .4s', borderRadius: 8 }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {planTasks.map((t, i) => (
                          <div key={i} onClick={() => toggleTask(i)}
                            style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', padding: '10px 12px', borderRadius: 10, background: t.done ? 'var(--success-light)' : 'transparent', transition: 'background .2s' }}
                            onMouseEnter={e => { if (!t.done) e.currentTarget.style.background = 'var(--surface2)' }}
                            onMouseLeave={e => { if (!t.done) e.currentTarget.style.background = 'transparent' }}>
                            {t.done
                              ? <CheckCircle2 size={17} color="var(--success)" style={{ flexShrink: 0, marginTop: 1 }} />
                              : <Circle size={17} color="var(--border-strong)" style={{ flexShrink: 0, marginTop: 1 }} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 13.5, fontWeight: 500, color: t.done ? 'var(--success)' : 'var(--text)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.text}</span>
                              <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>
                                {t.frequency || 'as needed'}{t.due ? ` · due ${t.due}` : ''}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {planGoals.length > 0 && (
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.04em' }}>Goals</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {planGoals.map((g, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--surface2)' }}>
                            <span style={{
                              fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 99, flexShrink: 0,
                              color: g.status === 'met' ? 'var(--success)' : g.status === 'in-progress' ? 'var(--warning)' : 'var(--text2)',
                              background: g.status === 'met' ? 'var(--success-light)' : g.status === 'in-progress' ? 'var(--warning-light)' : '#fff',
                            }}>
                              {g.status === 'met' ? 'Met' : g.status === 'in-progress' ? 'In progress' : 'Not started'}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{g.description}</div>
                              {g.target && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 1 }}>Target: {g.target}</div>}
                            </div>
                            {g.due && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, flexShrink: 0 }}>Due {g.due}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Check-in history */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Check-in History <span style={{ color: 'var(--text3)', fontWeight: 500 }}>({checkins.length})</span></span>
                  </div>
                  {checkins.length === 0 ? (
                    <EmptyState icon={Calendar} title="No check-ins logged yet" hint="Log a check-in to start tracking CCM minutes for this patient." />
                  ) : (
                    checkins.map(c => (
                      <div key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <button
                          onClick={() => setExpanded(ex => ({ ...ex, [c.id]: !ex[c.id] }))}
                          style={{ width: '100%', textAlign: 'left', padding: '14px 24px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <Calendar size={13} color="var(--primary)" />
                            <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
                              {new Date(c.created_at).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}
                            </span>
                            <span style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99 }}>{c.minutes} min</span>
                            {c.call_id && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99 }}>
                                <Phone size={10} /> From call
                              </span>
                            )}
                          </div>
                          {expanded[c.id] ? <ChevronUp size={14} color="var(--text3)" /> : <ChevronDown size={14} color="var(--text3)" />}
                        </button>
                        {expanded[c.id] && (
                          <div style={{ padding: '0 24px 18px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {c.notes && <div><strong style={{ color: 'var(--text)' }}>Notes:</strong> {c.notes}</div>}
                            {c.barriers && <div><strong style={{ color: 'var(--text)' }}>Barriers:</strong> {c.barriers}</div>}
                            {c.plan_update && <div><strong style={{ color: 'var(--text)' }}>Plan Update:</strong> {c.plan_update}</div>}
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
          <form onSubmit={savePatient} className="animate-fade-up" style={{ background: 'var(--surface)', borderRadius: 16, width: 480, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.24)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Plus size={18} color="var(--primary)" />
                </div>
                <div>
                  <div style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.01em' }}>Enroll in CCM</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>Demographics are pulled in from the Patients list automatically.</div>
                </div>
              </div>
              <button type="button" onClick={resetEnrollForm} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)', flexShrink: 0 }}><X size={18} /></button>
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
                      {roster.filter(p => p.name?.toLowerCase().includes(rosterSearch.toLowerCase()) && !patients.some(cp => cp.name === p.name && cp.dob === p.dob)).length === 0 ? (
                        <EmptyState icon={Search}
                          title={roster.length === 0 ? 'No patients found' : 'No matches'}
                          hint={roster.length === 0 ? 'Add a patient in the Patients page first.' : 'Try a different name, or this patient may already be enrolled.'}
                          compact />
                      ) : (
                        roster
                          .filter(p => p.name?.toLowerCase().includes(rosterSearch.toLowerCase()) && !patients.some(cp => cp.name === p.name && cp.dob === p.dob))
                          .slice(0, 30)
                          .map(p => (
                            <button key={p.id} type="button" onClick={() => {
                              setPickedPatient(p)
                              const conditions = (p.conditions || '').split(',').map(c => c.trim()).filter(Boolean)
                              setNewPt(np => ({ ...np, conditions }))
                              loadEnrollCalls(p.id)
                            }}
                              style={{ width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-light)'}
                              onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
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
                      <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 1 }}>{pickedPatient.dob || 'DOB unknown'}{pickedPatient.phone ? ` · ${pickedPatient.phone}` : ''}</div>
                    </div>
                    <button type="button" onClick={() => { setPickedPatient(null); setEnrollCalls([]); setNewPt(p => ({ ...p, call_id: '' })) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-dark)', fontSize: 11.5, fontWeight: 700, flexShrink: 0 }}>Change</button>
                  </div>
                )}
              </div>

              {pickedPatient && enrollCalls.length > 0 && (
                <div>
                  <label className="form-label">
                    Related Call <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional — links a completed consent/intake call for billing)</span>
                  </label>
                  <select value={newPt.call_id} onChange={e => setNewPt(p => ({ ...p, call_id: e.target.value }))} className="form-select">
                    <option value="">None</option>
                    {enrollCalls.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.caller_role === 'family' ? `Family (${c.family_member_name || 'unnamed'})` : c.caller_role === 'doctor' ? 'Outbound' : 'Patient'} call · {new Date(c.created_at).toLocaleDateString()} · {c.duration_minutes != null ? `${c.duration_minutes} min` : c.status}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label className="form-label">Insurance / Payer</label>
                  <input type="text" value={newPt.insurance}
                    onChange={e => setNewPt(p => ({ ...p, insurance: e.target.value }))}
                    className="form-input" />
                </div>
                <div>
                  <label className="form-label">Care Manager</label>
                  <input type="text" value={newPt.care_manager}
                    onChange={e => setNewPt(p => ({ ...p, care_manager: e.target.value }))}
                    className="form-input" />
                </div>
              </div>

              <div>
                <label className="form-label">
                  Chronic Conditions <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(add as many as apply — CCM requires 2+)</span>
                </label>
                {newPt.conditions.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {newPt.conditions.map((c, i) => (
                      <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--primary-light)', color: 'var(--primary-dark)', borderRadius: 99, padding: '4px 6px 4px 11px', fontSize: 12, fontWeight: 600 }}>
                        {c}
                        <button type="button" onClick={() => removeCondition(i)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-dark)', display: 'flex', alignItems: 'center', padding: 2 }}>
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
                    className="form-input" style={{ flex: 1 }} />
                  <button type="button" onClick={() => addCondition(newPt.conditionInput)}
                    style={{ padding: '0 16px', border: '1px solid var(--primary)', borderRadius: 9, background: 'var(--primary-light)', color: 'var(--primary-dark)', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>Add</button>
                </div>
                {pickedPatient?.conditions && (
                  <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 6 }}>From patient record: {pickedPatient.conditions}</div>
                )}
              </div>

              <div style={{ background: 'var(--primary-light)', border: '1px solid var(--primary-light)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-dark)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.03em' }}>CCM Consent (required)</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Consent Date *</label>
                    <input type="date" required value={newPt.consent_date}
                      onChange={e => setNewPt(p => ({ ...p, consent_date: e.target.value }))}
                      className="form-input" style={{ background: '#fff' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 5 }}>Consent Method *</label>
                    <select required value={newPt.consent_method} onChange={e => setNewPt(p => ({ ...p, consent_method: e.target.value }))}
                      className="form-select" style={{ background: '#fff' }}>
                      <option value="verbal">Verbal</option>
                      <option value="written">Written</option>
                      <option value="portal">Portal</option>
                    </select>
                  </div>
                </div>
              </div>
              {enrollError && (
                <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger-light)', borderRadius: 8, padding: '10px 14px', color: 'var(--danger)', fontSize: 12.5, fontWeight: 600 }}>
                  {enrollError}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 28px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
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
          </form>
        </div>
      )}

      {/* Log Check-in Modal */}
      {showCheckin && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowCheckin(false)}>
          <form onSubmit={saveCheckin} className="animate-fade-up" style={{ background: 'var(--surface)', borderRadius: 16, width: 480, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.24)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Clock size={18} color="var(--primary)" />
                </div>
                <div style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.01em' }}>Log CCM Check-in</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button type="button" onClick={aiSuggestCheckin} disabled={aiSuggesting}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 99, border: '1px solid var(--primary)', background: 'var(--primary-light)', color: 'var(--primary-dark)', fontSize: 12, fontWeight: 700, cursor: aiSuggesting ? 'default' : 'pointer', flexShrink: 0, opacity: aiSuggesting ? .6 : 1 }}>
                  <Wand2 size={13} /> {aiSuggesting ? 'Drafting…' : 'AI Suggest'}
                </button>
                <button type="button" onClick={() => setShowCheckin(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)' }}><X size={18} /></button>
              </div>
            </div>
            <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label className="form-label">Time Spent (minutes) *</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                  {QUICK_MINUTES.map(m => (
                    <button key={m} type="button" onClick={() => setCheckinForm(f => ({ ...f, minutes: String(m) }))}
                      style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${String(m) === String(checkinForm.minutes) ? 'var(--primary)' : 'var(--border)'}`, background: String(m) === String(checkinForm.minutes) ? 'var(--primary-light)' : '#fff', color: String(m) === String(checkinForm.minutes) ? 'var(--primary-dark)' : 'var(--text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {m}m
                    </button>
                  ))}
                </div>
                <input type="number" min="1" required value={checkinForm.minutes} onChange={e => setCheckinForm(f => ({ ...f, minutes: e.target.value }))}
                  className="form-input" />
                <div className="form-hint">Need ≥ 20 min/month for CPT 99490 billing</div>
              </div>
              {relatedCalls.length > 0 && (
                <div>
                  <label className="form-label">Related Call <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(optional)</span></label>
                  <select value={checkinForm.call_id} onChange={e => {
                    const callId = e.target.value
                    // Real captured call duration auto-fills minutes instead of the care
                    // manager retyping a guess — still fully editable afterward.
                    const call = relatedCalls.find(c => String(c.id) === callId)
                    setCheckinForm(f => ({ ...f, call_id: callId, minutes: call?.duration_minutes != null ? String(call.duration_minutes) : f.minutes }))
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
                <label className="form-label">Quick-fill Clinical Notes</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {NOTE_TEMPLATES.map(t => (
                    <button key={t.label} type="button" onClick={() => setCheckinForm(f => ({ ...f, notes: t.notes }))}
                      style={{ padding: '5px 11px', borderRadius: 8, border: '1px dashed var(--primary)', background: 'var(--primary-light)', color: 'var(--primary-dark)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                {[
                  { label: 'Clinical Notes', key: 'notes' },
                  { label: 'Barriers to Care', key: 'barriers' },
                  { label: 'Plan Update', key: 'plan_update' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="form-label">{f.label}</label>
                    <textarea rows={2} value={checkinForm[f.key]} onChange={e => setCheckinForm(cf => ({ ...cf, [f.key]: e.target.value }))}
                      className="form-textarea" style={{ minHeight: 60 }} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 28px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button type="button" onClick={() => setShowCheckin(false)} className="btn btn-secondary btn-sm">Cancel</button>
              <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
                {saving ? 'Saving…' : 'Save Check-in'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Care Plan Modal */}
      {showPlanEdit && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => e.target === e.currentTarget && closePlanEdit()}>
          <form onSubmit={savePlan} className="animate-fade-up" style={{ background: 'var(--surface)', borderRadius: 16, width: 580, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,.24)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Edit3 size={18} color="var(--primary)" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--text)', letterSpacing: '-.01em' }}>Edit Care Plan</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>Update tasks, goals, and care team members.</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                  style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5, fontWeight: 700, color: PLAN_STATUS_COLOR[editStatus], background: PLAN_STATUS_BG[editStatus] }}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
                <button type="button" onClick={closePlanEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)' }}><X size={18} /></button>
              </div>
            </div>
            <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Tasks</span>
                  {editTasks.length > 0 && <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{editTasks.length} task{editTasks.length === 1 ? '' : 's'}</span>}
                </div>
                {editTasks.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10, fontStyle: 'italic' }}>No tasks yet — add one below.</div>
                )}
                {editTasks.map((t, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10, padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface2)' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input placeholder="Task" value={t.text} onChange={e => setEditTasks(tasks => tasks.map((tk, j) => j === i ? { ...tk, text: e.target.value } : tk))}
                        className="form-input" style={{ flex: 1 }} />
                      <button type="button" onClick={() => setEditTasks(tasks => tasks.filter((_, j) => j !== i))}
                        style={{ background: 'var(--danger-light)', border: 'none', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', color: 'var(--danger)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <X size={14} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input placeholder="Frequency (e.g. daily)" value={t.frequency || ''}
                        onChange={e => setEditTasks(tasks => tasks.map((tk, j) => j === i ? { ...tk, frequency: e.target.value } : tk))}
                        className="form-input" style={{ flex: 1, fontSize: 12.5, padding: '7px 10px', background: '#fff' }} />
                      <input type="date" value={t.due || ''}
                        onChange={e => setEditTasks(tasks => tasks.map((tk, j) => j === i ? { ...tk, due: e.target.value } : tk))}
                        className="form-input" style={{ width: 'auto', fontSize: 12.5, padding: '7px 10px', background: '#fff' }} />
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setEditTasks(tasks => [...tasks, { text: '', done: false, frequency: 'as needed', due: null }])}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--primary-light)', border: '1.5px dashed var(--primary)', borderRadius: 9, padding: '10px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--primary-dark)', width: '100%', fontWeight: 600 }}>
                  <Plus size={13} /> Add task
                </button>
              </div>

              <div style={{ paddingTop: 24, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Goals</span>
                  {editGoals.length > 0 && <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{editGoals.length} goal{editGoals.length === 1 ? '' : 's'}</span>}
                </div>
                {editGoals.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10, fontStyle: 'italic' }}>No goals yet — add one below.</div>
                )}
                {editGoals.map((g, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10, padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface2)' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input placeholder="Description" value={g.description || ''}
                        onChange={e => setEditGoals(gs => gs.map((gg, j) => j === i ? { ...gg, description: e.target.value } : gg))}
                        className="form-input" style={{ flex: 1, background: '#fff' }} />
                      <button type="button" onClick={() => setEditGoals(gs => gs.filter((_, j) => j !== i))}
                        style={{ background: 'var(--danger-light)', border: 'none', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', color: 'var(--danger)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <X size={14} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input placeholder="Target" value={g.target || ''}
                        onChange={e => setEditGoals(gs => gs.map((gg, j) => j === i ? { ...gg, target: e.target.value } : gg))}
                        className="form-input" style={{ flex: 1, background: '#fff' }} />
                      <input type="date" value={g.due || ''}
                        onChange={e => setEditGoals(gs => gs.map((gg, j) => j === i ? { ...gg, due: e.target.value } : gg))}
                        className="form-input" style={{ width: 'auto', background: '#fff' }} />
                      <select value={g.status || 'not-started'}
                        onChange={e => setEditGoals(gs => gs.map((gg, j) => j === i ? { ...gg, status: e.target.value } : gg))}
                        className="form-select" style={{ width: 'auto', background: '#fff' }}>
                        <option value="not-started">Not started</option>
                        <option value="in-progress">In progress</option>
                        <option value="met">Met</option>
                      </select>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setEditGoals(gs => [...gs, { description: '', target: '', due: '', status: 'not-started' }])}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--primary-light)', border: '1.5px dashed var(--primary)', borderRadius: 9, padding: '10px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--primary-dark)', width: '100%', fontWeight: 600 }}>
                  <Plus size={13} /> Add goal
                </button>
              </div>

              <div style={{ paddingTop: 24, borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Care Team</span>
                  {editCareTeam.length > 0 && <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{editCareTeam.length} member{editCareTeam.length === 1 ? '' : 's'}</span>}
                </div>
                {editCareTeam.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10, fontStyle: 'italic' }}>No care team members yet — add one below.</div>
                )}
                {editCareTeam.map((m, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <select value={m.type === 'doctor' ? 'doctor' : 'other'}
                      onChange={e => {
                        const type = e.target.value
                        setEditCareTeam(ct => ct.map((cm, j) => j === i
                          ? (type === 'doctor' ? { type, doctor_email: '', name: '', role: '' } : { type, name: cm.name || '', role: cm.role || '' })
                          : cm))
                      }}
                      style={{ width: 110, flexShrink: 0, border: '1.5px solid var(--border)', borderRadius: 8, padding: '9px 8px', fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}>
                      <option value="other">Care Team</option>
                      <option value="doctor">Doctor</option>
                    </select>
                    {m.type === 'doctor' ? (
                      <select value={m.doctor_email || ''}
                        onChange={e => {
                          const doc = doctorDirectory.find(d => d.email === e.target.value)
                          setEditCareTeam(ct => ct.map((cm, j) => j === i ? {
                            ...cm, doctor_email: doc?.email || '', name: doc?.name || '', role: doc?.specialty || 'Doctor',
                          } : cm))
                        }}
                        className="form-select" style={{ flex: 1 }}>
                        <option value="">Select a doctor…</option>
                        {doctorDirectory.map(d => (
                          <option key={d.email} value={d.email}>{d.name}{d.specialty ? ` — ${d.specialty}` : ''}</option>
                        ))}
                      </select>
                    ) : (
                      <input placeholder="Name" value={m.name || ''}
                        onChange={e => setEditCareTeam(ct => ct.map((cm, j) => j === i ? { ...cm, name: e.target.value } : cm))}
                        className="form-input" style={{ flex: 1 }} />
                    )}
                    <input placeholder="Role" value={m.role || ''} disabled={m.type === 'doctor'}
                      onChange={e => setEditCareTeam(ct => ct.map((cm, j) => j === i ? { ...cm, role: e.target.value } : cm))}
                      className="form-input" style={{ flex: 1, background: m.type === 'doctor' ? 'var(--surface2)' : 'var(--surface)' }} />
                    <button type="button" onClick={() => setEditCareTeam(ct => ct.filter((_, j) => j !== i))}
                      style={{ background: 'var(--danger-light)', border: 'none', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', color: 'var(--danger)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setEditCareTeam(ct => [...ct, { type: 'other', name: '', role: '' }])}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--primary-light)', border: '1.5px dashed var(--primary)', borderRadius: 9, padding: '10px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--primary-dark)', width: '100%', fontWeight: 600 }}>
                  <Plus size={13} /> Add team member
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '16px 28px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <button type="button" onClick={closePlanEdit} className="btn btn-secondary btn-sm">Cancel</button>
              <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
                <Save size={13} /> {saving ? 'Saving…' : 'Save Plan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Disenroll Confirm Modal */}
      {showDisenroll && selected && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowDisenroll(false)}>
          <div className="animate-fade-up" style={{ background: 'var(--surface)', borderRadius: 16, width: 420, maxWidth: '95vw', boxShadow: '0 24px 64px rgba(0,0,0,.24)', padding: '28px 28px 24px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--danger-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <UserMinus size={24} color="var(--danger)" />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8, letterSpacing: '-.01em' }}>Disenroll {selected.name}?</div>
            <p style={{ fontSize: 13.5, color: 'var(--text2)', margin: '0 0 24px', lineHeight: 1.6 }}>
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
