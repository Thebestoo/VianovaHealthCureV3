import React, { useState, useEffect } from 'react'
import { ClipboardList, Plus, CheckCircle2, Circle, Clock, Calendar, ChevronDown, ChevronUp, User, Phone, FileText, Target, Edit3, Save, X, Sparkles, Search, UserMinus, Timer, Pause, Play, Wand2 } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import AiHelp from '../components/AiHelp.jsx'

const CARE_PLAN_TEMPLATES = {
  'Diabetes Type 2': [
    'Monitor blood glucose daily (fasting & post-meal)',
    'HbA1c check every 3 months',
    'Foot examination monthly',
    'Eye exam annually',
    'Blood pressure monitoring weekly',
    'Kidney function labs (eGFR, urine microalbumin) every 6 months',
    'Medication adherence review',
    'Dietary counseling — low-carb, low-sugar diet',
    'Physical activity: 150 min/week moderate exercise',
    'Smoking cessation support (if applicable)',
  ],
  'Hypertension': [
    'Daily blood pressure log (morning & evening)',
    'Low-sodium diet counseling (< 2g/day)',
    'Medication adherence — do not miss doses',
    'Limit alcohol to ≤ 1 drink/day',
    'Regular aerobic exercise 30 min/day',
    'Stress management techniques',
    'Annual kidney function panel',
    'Annual lipid panel',
    'BMI & weight tracking monthly',
    'Ophthalmology referral (hypertensive retinopathy)',
  ],
  'COPD': [
    'Inhaler technique check at each visit',
    'Pulmonary function test (spirometry) annually',
    'Oxygen saturation monitoring (SpO2 target ≥ 92%)',
    'Flu vaccine annually; pneumococcal vaccine per guidelines',
    'Smoking cessation — highest priority',
    'Pulmonary rehabilitation referral',
    'Nutritional assessment (COPD can cause weight loss)',
    'Exacerbation action plan in writing',
    'Activity pacing — energy conservation strategies',
    '6-minute walk test every 3 months',
  ],
  'Heart Failure': [
    'Daily weight monitoring (alert if +2 kg in 2 days)',
    'Fluid restriction: 1.5–2 L/day',
    'Low-sodium diet (< 2g/day)',
    'BNP/NT-proBNP labs every 3–6 months',
    'Echocardiogram annually',
    'Medication adherence (ACE/ARB, beta-blocker, diuretic)',
    'Daily pedal edema assessment',
    'Symptom diary — dyspnea, fatigue, orthopnea',
    'ICD/pacemaker check if applicable',
    'Cardiac rehab referral',
  ],
  'Custom': [],
}

const QUICK_MINUTES = [5, 10, 15, 20, 30]
const NOTE_TEMPLATES = [
  { label: 'Medication review', notes: 'Reviewed current medications and adherence with patient. No new side effects reported.' },
  { label: 'Symptom check-in', notes: 'Called patient to review current symptoms and overall status since last contact.' },
  { label: 'Care coordination', notes: 'Coordinated care with specialist/pharmacy on behalf of patient regarding treatment plan.' },
  { label: 'Lab/vitals follow-up', notes: 'Reviewed recent lab results / vitals with patient and discussed next steps.' },
]

const STATUS_COLOR = { active: '#10b981', inactive: '#94a3b8', discharged: '#ef4444' }
const STATUS_BG    = { active: '#ecfdf5', inactive: '#f1f5f9', discharged: '#fef2f2' }
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
  const [newPt, setNewPt]           = useState({ condition: 'Diabetes Type 2', insurance: '', care_manager: '' })
  const [checkinForm, setCheckinForm] = useState({ minutes: '', notes: '', barriers: '', plan_update: '' })
  const [planTasks, setPlanTasks]   = useState([])
  const [planTemplate, setPlanTemplate] = useState('Diabetes Type 2')
  const [saving, setSaving]         = useState(false)
  const [expanded, setExpanded]     = useState({})
  const [showDisenroll, setShowDisenroll] = useState(false)
  const [disenrolling, setDisenrolling] = useState(false)
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [aiSuggesting, setAiSuggesting] = useState(false)

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

  async function savePatient(e) {
    e.preventDefault()
    if (!pickedPatient) return
    try {
      await fetch('/api/ccm/patients', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({
          name: pickedPatient.name,
          dob: pickedPatient.dob,
          phone: pickedPatient.phone,
          conditions: pickedPatient.conditions,
          medications: pickedPatient.medications,
          allergies: pickedPatient.allergies,
          ...newPt,
        })
      })
      setShowAddPt(false)
      setPickedPatient(null)
      setRosterSearch('')
      setNewPt({ condition: 'Diabetes Type 2', insurance: '', care_manager: '' })
      loadPatients()
    } catch {}
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
        body: JSON.stringify({ tasks: JSON.stringify(planTasks) })
      })
      setShowPlanEdit(false)
      loadPlan(selected.id)
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

  function applyTemplate(tpl) {
    setPlanTemplate(tpl)
    const tasks = (CARE_PLAN_TEMPLATES[tpl] || []).map(t => ({ text: t, done: false }))
    setPlanTasks(tasks)
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

  return (
    <div style={{ padding: '0 0 40px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Hero header */}
      <div style={{
        position: 'relative', overflow: 'hidden', borderRadius: 20, margin: '24px 24px 24px', padding: '30px 32px',
        background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 55%, #c084fc 100%)',
        boxShadow: '0 20px 50px -18px rgba(124,58,237,.5)',
      }}>
        <div style={{ position: 'absolute', top: -60, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
        <div style={{ position: 'absolute', bottom: -80, right: 120, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,.06)' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 18 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.18)', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 99, marginBottom: 12 }}>
              <Sparkles size={12} /> Beta Module
            </div>
            <h1 style={{ fontSize: 27, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-.02em' }}>Chronic Care Management</h1>
            <p style={{ color: 'rgba(255,255,255,.82)', margin: '6px 0 0', fontSize: 14 }}>Care plans, monthly check-ins & CPT 99490 adherence tracking</p>
          </div>
          <button onClick={() => setShowAddPt(true)} style={{
            display: 'flex', alignItems: 'center', gap: 7, background: '#fff', color: '#7c3aed', border: 'none',
            borderRadius: 11, padding: '11px 20px', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
            boxShadow: '0 10px 24px -8px rgba(0,0,0,.35)', transition: 'transform .15s',
          }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
            <Plus size={16} /> Enroll Patient
          </button>
        </div>

        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 26 }}>
          {[
            { label: 'Enrolled Patients', value: patients.length },
            { label: 'Active', value: activeCount },
            { label: 'Est. Billable (99490)', value: billableEstimate },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 14, padding: '14px 16px', backdropFilter: 'blur(6px)' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.78)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {!key && (
        <div style={{ margin: '0 24px 24px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 14, padding: '16px 20px', color: '#92400e' }}>
          Connect with your doctor key (Logs page) to access CCM features.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, padding: '0 24px' }}>
        {/* Patient list */}
        <div>
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ece9fb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.03)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: '#111827', marginBottom: 10 }}>
                CCM Patients <span style={{ color: '#a78bfa' }}>({patients.length})</span>
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
                  No patients found.
                </div>
              )}
              {filteredPatients.map(p => (
                <button key={p.id} onClick={() => setSelected(p)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid #f7f5fe',
                    background: selected?.id === p.id ? 'linear-gradient(90deg, #f5f3ff, #fff)' : '#fff', cursor: 'pointer',
                    borderLeft: selected?.id === p.id ? '3px solid #8b5cf6' : '3px solid transparent', transition: 'background .15s',
                  }}
                  onMouseEnter={e => { if (selected?.id !== p.id) e.currentTarget.style.background = '#fafafa' }}
                  onMouseLeave={e => { if (selected?.id !== p.id) e.currentTarget.style.background = '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#8b5cf6,#c084fc)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontSize: 12, fontWeight: 700 }}>
                      {initials(p.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{p.condition}</div>
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
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ece9fb', padding: '70px 32px', textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ width: 68, height: 68, borderRadius: '50%', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <ClipboardList size={28} color="#a78bfa" />
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: '#374151' }}>Select a patient</div>
              <div style={{ fontSize: 13.5 }}>Choose a patient to view their care plan and check-in history.</div>
            </div>
          ) : (
            <>
              {/* Patient header */}
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ece9fb', padding: '22px 26px', marginBottom: 18, boxShadow: '0 1px 3px rgba(0,0,0,.03)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,#8b5cf6,#c084fc)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
                      {initials(selected.name)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 19, color: '#111827' }}>{selected.name}</div>
                      <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                        {selected.dob && <span><User size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />DOB: {selected.dob}</span>}
                        {selected.phone && <span><Phone size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />{selected.phone}</span>}
                        <span style={{ background: '#f5f3ff', color: '#7c3aed', padding: '1px 8px', borderRadius: 99, fontWeight: 600 }}>{selected.condition}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ textAlign: 'center', background: ccmEligible ? '#f0fdf4' : '#fffbeb', border: `1px solid ${ccmEligible ? '#bbf7d0' : '#fde68a'}`, borderRadius: 14, padding: '10px 18px', minWidth: 108 }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: ccmEligible ? '#16a34a' : '#b45309' }}>{monthlyMinutes}<span style={{ fontSize: 12, fontWeight: 500 }}>/20</span></div>
                      <div style={{ height: 4, borderRadius: 4, background: '#e5e7eb', marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${minutesPct}%`, background: ccmEligible ? '#22c55e' : '#f59e0b', transition: 'width .4s' }} />
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: ccmEligible ? '#16a34a' : '#b45309', marginTop: 4 }}>
                        {ccmEligible ? '✓ Billable' : 'min this month'}
                      </div>
                    </div>

                    {/* Live time-on-task tracker — auto-captures minutes instead of guessing them */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: timerRunning ? '#f5f3ff' : '#fafafa', border: `1px solid ${timerRunning ? '#ddd6fe' : '#e5e7eb'}`, borderRadius: 14, padding: '10px 14px' }}>
                      <Timer size={15} color={timerRunning ? '#7c3aed' : '#9ca3af'} />
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 15, color: timerRunning ? '#7c3aed' : '#6b7280', minWidth: 46 }}>{formatTimer(timerSeconds)}</span>
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

                    <button onClick={openCheckin}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#8b5cf6,#a855f7)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 8px 18px -6px rgba(139,92,246,.55)' }}>
                      <Clock size={14} /> Log Check-in
                    </button>
                    <button onClick={() => setShowDisenroll(true)} title="Disenroll from CCM"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 10, padding: '11px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                      <UserMinus size={14} /> Disenroll
                    </button>
                  </div>
                </div>
              </div>

              {/* Care plan */}
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ece9fb', padding: '22px 26px', marginBottom: 18, boxShadow: '0 1px 3px rgba(0,0,0,.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: 15.5, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 9, background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Target size={15} color="#8b5cf6" />
                    </div>
                    Care Plan
                    {totalTasks > 0 && <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>({doneTasks}/{totalTasks} completed)</span>}
                  </div>
                  <button onClick={() => setShowPlanEdit(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 13px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#374151' }}>
                    <Edit3 size={12} /> Edit Plan
                  </button>
                </div>

                {planTasks.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '26px 0' }}>
                    No care plan yet. Click "Edit Plan" to create one.
                  </div>
                ) : (
                  <>
                    <div style={{ background: '#f9fafb', borderRadius: 8, height: 8, marginBottom: 16, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: 'linear-gradient(90deg,#8b5cf6,#c084fc)', width: `${progressPct}%`, transition: 'width .4s', borderRadius: 8 }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {planTasks.map((t, i) => (
                        <div key={i} onClick={() => toggleTask(i)}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '9px 10px', borderRadius: 9, background: t.done ? '#f0fdf4' : 'transparent', transition: 'background .2s' }}
                          onMouseEnter={e => { if (!t.done) e.currentTarget.style.background = '#f9fafb' }}
                          onMouseLeave={e => { if (!t.done) e.currentTarget.style.background = 'transparent' }}>
                          {t.done
                            ? <CheckCircle2 size={17} color="#22c55e" style={{ flexShrink: 0, marginTop: 1 }} />
                            : <Circle size={17} color="#d1d5db" style={{ flexShrink: 0, marginTop: 1 }} />}
                          <span style={{ fontSize: 13.5, color: t.done ? '#16a34a' : '#374151', textDecoration: t.done ? 'line-through' : 'none' }}>{t.text}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Check-in history */}
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #ece9fb', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.03)' }}>
                <div style={{ padding: '16px 22px', borderBottom: '1px solid #f3f4f6', fontWeight: 700, fontSize: 13.5, color: '#374151' }}>
                  Check-in History <span style={{ color: '#a78bfa' }}>({checkins.length})</span>
                </div>
                {checkins.length === 0 ? (
                  <div style={{ padding: '26px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No check-ins logged yet.</div>
                ) : (
                  checkins.map(c => (
                    <div key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <button
                        onClick={() => setExpanded(ex => ({ ...ex, [c.id]: !ex[c.id] }))}
                        style={{ width: '100%', textAlign: 'left', padding: '13px 22px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Calendar size={13} color="#8b5cf6" />
                          <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>
                            {new Date(c.created_at).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}
                          </span>
                          <span style={{ background: '#ede9fe', color: '#7c3aed', fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99 }}>{c.minutes} min</span>
                        </div>
                        {expanded[c.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      {expanded[c.id] && (
                        <div style={{ padding: '0 22px 16px', fontSize: 13, color: '#4b5563' }}>
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

      {/* Enroll Patient Modal — picks from the existing Patients roster instead of manual entry */}
      {showAddPt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,10,30,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, animation: 'ccmFade .18s ease' }}>
          <form onSubmit={savePatient} style={{ background: '#fff', borderRadius: 18, padding: '30px 32px', width: 460, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 30px 80px -20px rgba(0,0,0,.4)', animation: 'ccmIn .22s cubic-bezier(.16,1,.3,1)' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 800, color: '#111827' }}>Enroll in CCM</h2>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#6b7280' }}>Select an existing patient from your Patients list — demographics are pulled in automatically.</p>

            {!pickedPatient ? (
              <>
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <Search size={13} color="#a0aec0" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                  <input value={rosterSearch} onChange={e => setRosterSearch(e.target.value)} placeholder="Search patients by name…" autoFocus
                    className="ccm-input"
                    style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 11px 9px 30px', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, maxHeight: 260, overflowY: 'auto', marginBottom: 16 }}>
                  {roster.filter(p => p.name?.toLowerCase().includes(rosterSearch.toLowerCase()) && !patients.some(cp => cp.name === p.name && cp.dob === p.dob)).length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: 12.5 }}>
                      {roster.length === 0 ? 'No patients found — add one in the Patients page first.' : 'No matches (or already enrolled).'}
                    </div>
                  ) : (
                    roster
                      .filter(p => p.name?.toLowerCase().includes(rosterSearch.toLowerCase()) && !patients.some(cp => cp.name === p.name && cp.dob === p.dob))
                      .slice(0, 30)
                      .map(p => (
                        <button key={p.id} type="button" onClick={() => setPickedPatient(p)}
                          style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderBottom: '1px solid #f3f4f6', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#faf9ff'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                          <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,#8b5cf6,#c084fc)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#faf9ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#8b5cf6,#c084fc)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {initials(pickedPatient.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: '#111827' }}>{pickedPatient.name}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{pickedPatient.dob || 'DOB unknown'}{pickedPatient.phone ? ` · ${pickedPatient.phone}` : ''}</div>
                </div>
                <button type="button" onClick={() => setPickedPatient(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontSize: 11.5, fontWeight: 700 }}>Change</button>
              </div>
            )}

            <div style={{ marginBottom: 13 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Insurance / Payer</label>
              <input type="text" value={newPt.insurance}
                className="ccm-input"
                onChange={e => setNewPt(p => ({ ...p, insurance: e.target.value }))}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 11px', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 13 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Care Manager</label>
              <input type="text" value={newPt.care_manager}
                className="ccm-input"
                onChange={e => setNewPt(p => ({ ...p, care_manager: e.target.value }))}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 11px', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Primary Condition</label>
              <select value={newPt.condition} onChange={e => setNewPt(p => ({ ...p, condition: e.target.value }))}
                className="ccm-input"
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 11px', fontSize: 13 }}>
                {Object.keys(CARE_PLAN_TEMPLATES).map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setShowAddPt(false); setPickedPatient(null); setRosterSearch('') }} style={{ padding: '10px 18px', border: '1px solid #d1d5db', borderRadius: 9, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Cancel</button>
              <button type="submit" disabled={!pickedPatient} style={{ padding: '10px 20px', border: 'none', borderRadius: 9, background: pickedPatient ? 'linear-gradient(135deg,#8b5cf6,#a855f7)' : '#d1d5db', color: '#fff', fontWeight: 700, cursor: pickedPatient ? 'pointer' : 'default', fontSize: 13, boxShadow: pickedPatient ? '0 8px 18px -6px rgba(139,92,246,.55)' : 'none' }}>Enroll</button>
            </div>
          </form>
        </div>
      )}

      {/* Log Check-in Modal */}
      {showCheckin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,10,30,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, animation: 'ccmFade .18s ease' }}>
          <form onSubmit={saveCheckin} style={{ background: '#fff', borderRadius: 18, padding: '30px 32px', width: 460, maxWidth: '95vw', boxShadow: '0 30px 80px -20px rgba(0,0,0,.4)', animation: 'ccmIn .22s cubic-bezier(.16,1,.3,1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#111827' }}>Log CCM Check-in</h2>
              <button type="button" onClick={aiSuggestCheckin} disabled={aiSuggesting}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 99, border: '1px solid #ddd6fe', background: '#faf9ff', color: '#7c3aed', fontSize: 12, fontWeight: 700, cursor: aiSuggesting ? 'default' : 'pointer', flexShrink: 0, opacity: aiSuggesting ? .6 : 1 }}>
                <Wand2 size={13} /> {aiSuggesting ? 'Drafting…' : 'AI Suggest'}
              </button>
            </div>
            <div style={{ marginBottom: 13 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Time Spent (minutes) *</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {QUICK_MINUTES.map(m => (
                  <button key={m} type="button" onClick={() => setCheckinForm(f => ({ ...f, minutes: String(m) }))}
                    style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${String(m) === String(checkinForm.minutes) ? '#8b5cf6' : '#e5e7eb'}`, background: String(m) === String(checkinForm.minutes) ? '#f5f3ff' : '#fff', color: String(m) === String(checkinForm.minutes) ? '#7c3aed' : '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {m}m
                  </button>
                ))}
              </div>
              <input type="number" min="1" required value={checkinForm.minutes} onChange={e => setCheckinForm(f => ({ ...f, minutes: e.target.value }))}
                className="ccm-input"
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '9px 11px', fontSize: 13, boxSizing: 'border-box' }} />
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Need ≥ 20 min/month for CPT 99490 billing</div>
            </div>
            <div style={{ marginBottom: 13 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Quick-fill Clinical Notes</label>
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
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <textarea rows={2} value={checkinForm[f.key]} onChange={e => setCheckinForm(cf => ({ ...cf, [f.key]: e.target.value }))}
                  className="ccm-input"
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 11px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" onClick={() => setShowCheckin(false)} style={{ padding: '10px 18px', border: '1px solid #d1d5db', borderRadius: 9, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ padding: '10px 20px', border: 'none', borderRadius: 9, background: 'linear-gradient(135deg,#8b5cf6,#a855f7)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, boxShadow: '0 8px 18px -6px rgba(139,92,246,.55)' }}>
                {saving ? 'Saving…' : 'Save Check-in'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Care Plan Modal */}
      {showPlanEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,10,30,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, animation: 'ccmFade .18s ease' }}>
          <form onSubmit={savePlan} style={{ background: '#fff', borderRadius: 18, padding: '30px 32px', width: 560, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 30px 80px -20px rgba(0,0,0,.4)', animation: 'ccmIn .22s cubic-bezier(.16,1,.3,1)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 19, fontWeight: 800, color: '#111827' }}>Edit Care Plan</h2>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6 }}>Load Template</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.keys(CARE_PLAN_TEMPLATES).map(t => (
                  <button key={t} type="button" onClick={() => applyTemplate(t)}
                    style={{ padding: '6px 13px', borderRadius: 99, border: `1px solid ${planTemplate === t ? '#8b5cf6' : '#d1d5db'}`, background: planTemplate === t ? 'linear-gradient(135deg,#8b5cf6,#a855f7)' : '#fff', color: planTemplate === t ? '#fff' : '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 18 }}>
              {planTasks.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input value={t.text} onChange={e => setPlanTasks(tasks => tasks.map((tk, j) => j === i ? { ...tk, text: e.target.value } : tk))}
                    className="ccm-input"
                    style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 11px', fontSize: 13 }} />
                  <button type="button" onClick={() => setPlanTasks(tasks => tasks.filter((_, j) => j !== i))}
                    style={{ background: '#fef2f2', border: 'none', borderRadius: 7, width: 30, height: 30, cursor: 'pointer', color: '#ef4444', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setPlanTasks(tasks => [...tasks, { text: '', done: false }])}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: '#faf9ff', border: '1.5px dashed #ddd6fe', borderRadius: 8, padding: '9px 12px', cursor: 'pointer', fontSize: 13, color: '#7c3aed', width: '100%', fontWeight: 600 }}>
                <Plus size={13} /> Add task
              </button>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowPlanEdit(false)} style={{ padding: '10px 18px', border: '1px solid #d1d5db', borderRadius: 9, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', border: 'none', borderRadius: 9, background: 'linear-gradient(135deg,#8b5cf6,#a855f7)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, boxShadow: '0 8px 18px -6px rgba(139,92,246,.55)' }}>
                <Save size={13} /> {saving ? 'Saving…' : 'Save Plan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Disenroll Confirm Modal */}
      {showDisenroll && selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,10,30,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, animation: 'ccmFade .18s ease' }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: '30px 32px', width: 420, maxWidth: '95vw', boxShadow: '0 30px 80px -20px rgba(0,0,0,.4)', animation: 'ccmIn .22s cubic-bezier(.16,1,.3,1)', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <UserMinus size={24} color="#ef4444" />
            </div>
            <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: '#111827' }}>Disenroll {selected.name}?</h2>
            <p style={{ fontSize: 13.5, color: '#6b7280', margin: '0 0 24px', lineHeight: 1.5 }}>
              This removes the patient from CCM along with their care plan and check-in history. This cannot be undone.
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
        @keyframes ccmFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ccmIn { from { opacity: 0; transform: translateY(10px) scale(.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
        .ccm-input:focus { outline: none; border-color: ${ACCENT} !important; box-shadow: 0 0 0 3px ${ACCENT}22; }
      `}</style>
      <AiHelp module="ccm" accent={ACCENT} />
    </div>
  )
}
