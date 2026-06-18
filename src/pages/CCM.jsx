import React, { useState, useEffect } from 'react'
import { ClipboardList, Plus, CheckCircle2, Circle, Clock, Calendar, ChevronDown, ChevronUp, User, Phone, FileText, Target, Edit3, Save, X } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

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

const STATUS_COLOR = { active: '#10b981', inactive: '#6b7280', discharged: '#ef4444' }

export default function CCM() {
  const { key } = useKey()
  const [patients, setPatients]     = useState([])
  const [selected, setSelected]     = useState(null)
  const [plan, setPlan]             = useState(null)
  const [checkins, setCheckins]     = useState([])
  const [showAddPt, setShowAddPt]   = useState(false)
  const [showCheckin, setShowCheckin] = useState(false)
  const [showPlanEdit, setShowPlanEdit] = useState(false)
  const [newPt, setNewPt]           = useState({ name: '', dob: '', phone: '', condition: 'Diabetes Type 2', insurance: '', care_manager: '' })
  const [checkinForm, setCheckinForm] = useState({ minutes: '', notes: '', barriers: '', plan_update: '' })
  const [planTasks, setPlanTasks]   = useState([])
  const [planTemplate, setPlanTemplate] = useState('Diabetes Type 2')
  const [saving, setSaving]         = useState(false)
  const [expanded, setExpanded]     = useState({})

  useEffect(() => { if (key) loadPatients() }, [key])
  useEffect(() => {
    if (selected) {
      loadPlan(selected.id)
      loadCheckins(selected.id)
    }
  }, [selected])

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

  async function savePatient(e) {
    e.preventDefault()
    try {
      await fetch('/api/ccm/patients', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(newPt)
      })
      setShowAddPt(false)
      setNewPt({ name: '', dob: '', phone: '', condition: 'Diabetes Type 2', insurance: '', care_manager: '' })
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
      loadCheckins(selected.id)
    } finally { setSaving(false) }
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

  function applyTemplate(tpl) {
    setPlanTemplate(tpl)
    const tasks = (CARE_PLAN_TEMPLATES[tpl] || []).map(t => ({ text: t, done: false }))
    setPlanTasks(tasks)
  }

  // Monthly time total
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const monthlyMinutes = checkins.filter(c => c.created_at >= monthStart).reduce((s, c) => s + (c.minutes || 0), 0)
  const ccmEligible = monthlyMinutes >= 20

  const doneTasks = planTasks.filter(t => t.done).length
  const totalTasks = planTasks.length

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: 0 }}>Chronic Care Management</h1>
          <p style={{ color: '#6b7280', margin: '4px 0 0', fontSize: 14 }}>Care plans, monthly check-ins & adherence tracking</p>
        </div>
        <button onClick={() => setShowAddPt(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          <Plus size={15} /> Enroll Patient
        </button>
      </div>

      {!key && (
        <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '16px 20px', color: '#92400e', marginBottom: 24 }}>
          Connect with your doctor key (Logs page) to access CCM features.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
        {/* Patient list */}
        <div>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', fontWeight: 600, fontSize: 13, color: '#374151' }}>
              CCM Patients ({patients.length})
            </div>
            {patients.length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                No patients enrolled yet.
              </div>
            )}
            {patients.map(p => (
              <button key={p.id} onClick={() => setSelected(p)}
                style={{ width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid #f3f4f6', background: selected?.id === p.id ? '#f5f3ff' : '#fff', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 99, background: STATUS_COLOR[p.status || 'active'], flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{p.condition}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div>
          {!selected ? (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '60px 32px', textAlign: 'center', color: '#9ca3af' }}>
              <ClipboardList size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: .4 }} />
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Select a patient</div>
              <div style={{ fontSize: 13 }}>Choose a patient to view their care plan and check-in history.</div>
            </div>
          ) : (
            <>
              {/* Patient header */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px 24px', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 18, color: '#111827' }}>{selected.name}</div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {selected.dob && <span><User size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />DOB: {selected.dob}</span>}
                      {selected.phone && <span><Phone size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />{selected.phone}</span>}
                      <span><FileText size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />{selected.condition}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'center', background: ccmEligible ? '#f0fdf4' : '#fef3c7', border: `1px solid ${ccmEligible ? '#bbf7d0' : '#fde68a'}`, borderRadius: 10, padding: '10px 16px' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: ccmEligible ? '#16a34a' : '#92400e' }}>{monthlyMinutes}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>min this month</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: ccmEligible ? '#16a34a' : '#92400e', marginTop: 2 }}>
                        {ccmEligible ? '✓ CCM Billable' : 'Need 20+ min'}
                      </div>
                    </div>
                    <button onClick={() => { setShowCheckin(true) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start' }}>
                      <Clock size={14} /> Log Check-in
                    </button>
                  </div>
                </div>
              </div>

              {/* Care plan */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '20px 24px', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Target size={16} color="#8b5cf6" />
                    Care Plan
                    {totalTasks > 0 && <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>({doneTasks}/{totalTasks} completed)</span>}
                  </div>
                  <button onClick={() => setShowPlanEdit(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#f3f4f6', border: 'none', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151' }}>
                    <Edit3 size={12} /> Edit Plan
                  </button>
                </div>

                {planTasks.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: '20px 0' }}>
                    No care plan yet. Click "Edit Plan" to create one.
                  </div>
                ) : (
                  <>
                    <div style={{ background: '#f9fafb', borderRadius: 8, height: 6, marginBottom: 12, overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: '#8b5cf6', width: `${totalTasks ? (doneTasks / totalTasks) * 100 : 0}%`, transition: 'width .4s' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {planTasks.map((t, i) => (
                        <div key={i} onClick={() => toggleTask(i)}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '6px 8px', borderRadius: 7, background: t.done ? '#f0fdf4' : 'transparent', transition: 'background .2s' }}>
                          {t.done
                            ? <CheckCircle2 size={16} color="#22c55e" style={{ flexShrink: 0, marginTop: 1 }} />
                            : <Circle size={16} color="#d1d5db" style={{ flexShrink: 0, marginTop: 1 }} />}
                          <span style={{ fontSize: 13, color: t.done ? '#16a34a' : '#374151', textDecoration: t.done ? 'line-through' : 'none' }}>{t.text}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Check-in history */}
              <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', fontWeight: 600, fontSize: 13, color: '#374151' }}>
                  Check-in History ({checkins.length})
                </div>
                {checkins.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No check-ins logged yet.</div>
                ) : (
                  checkins.map(c => (
                    <div key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <button
                        onClick={() => setExpanded(ex => ({ ...ex, [c.id]: !ex[c.id] }))}
                        style={{ width: '100%', textAlign: 'left', padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Calendar size={13} color="#8b5cf6" />
                          <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>
                            {new Date(c.created_at).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}
                          </span>
                          <span style={{ background: '#ede9fe', color: '#7c3aed', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99 }}>{c.minutes} min</span>
                        </div>
                        {expanded[c.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      {expanded[c.id] && (
                        <div style={{ padding: '0 20px 14px', fontSize: 13, color: '#4b5563' }}>
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

      {/* Enroll Patient Modal */}
      {showAddPt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <form onSubmit={savePatient} style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', width: 460, maxWidth: '95vw' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Enroll in CCM</h2>
            {[
              { label: 'Full Name *', key: 'name', type: 'text', req: true },
              { label: 'Date of Birth', key: 'dob', type: 'date', req: false },
              { label: 'Phone', key: 'phone', type: 'tel', req: false },
              { label: 'Insurance / Payer', key: 'insurance', type: 'text', req: false },
              { label: 'Care Manager', key: 'care_manager', type: 'text', req: false },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input type={f.type} required={f.req} value={newPt[f.key]}
                  onChange={e => setNewPt(p => ({ ...p, [f.key]: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 7, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Primary Condition</label>
              <select value={newPt.condition} onChange={e => setNewPt(p => ({ ...p, condition: e.target.value }))}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 7, padding: '8px 10px', fontSize: 13 }}>
                {Object.keys(CARE_PLAN_TEMPLATES).map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowAddPt(false)} style={{ padding: '9px 18px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button type="submit" style={{ padding: '9px 18px', border: 'none', borderRadius: 8, background: '#8b5cf6', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Enroll</button>
            </div>
          </form>
        </div>
      )}

      {/* Log Check-in Modal */}
      {showCheckin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <form onSubmit={saveCheckin} style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', width: 460, maxWidth: '95vw' }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>Log CCM Check-in</h2>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>Time Spent (minutes) *</label>
              <input type="number" min="1" required value={checkinForm.minutes} onChange={e => setCheckinForm(f => ({ ...f, minutes: e.target.value }))}
                style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 7, padding: '8px 10px', fontSize: 13, boxSizing: 'border-box' }} />
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>Need ≥ 20 min/month for CPT 99490 billing</div>
            </div>
            {[
              { label: 'Clinical Notes', key: 'notes' },
              { label: 'Barriers to Care', key: 'barriers' },
              { label: 'Plan Update', key: 'plan_update' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <textarea rows={2} value={checkinForm[f.key]} onChange={e => setCheckinForm(cf => ({ ...cf, [f.key]: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 7, padding: '7px 10px', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" onClick={() => setShowCheckin(false)} style={{ padding: '9px 18px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ padding: '9px 18px', border: 'none', borderRadius: 8, background: '#8b5cf6', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                {saving ? 'Saving…' : 'Save Check-in'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Care Plan Modal */}
      {showPlanEdit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <form onSubmit={savePlan} style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', width: 560, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>Edit Care Plan</h2>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 5 }}>Load Template</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.keys(CARE_PLAN_TEMPLATES).map(t => (
                  <button key={t} type="button" onClick={() => applyTemplate(t)}
                    style={{ padding: '5px 12px', borderRadius: 99, border: `1px solid ${planTemplate === t ? '#8b5cf6' : '#d1d5db'}`, background: planTemplate === t ? '#f5f3ff' : '#fff', color: planTemplate === t ? '#7c3aed' : '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              {planTasks.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                  <input value={t.text} onChange={e => setPlanTasks(tasks => tasks.map((tk, j) => j === i ? { ...tk, text: e.target.value } : tk))}
                    style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 7, padding: '7px 10px', fontSize: 13 }} />
                  <button type="button" onClick={() => setPlanTasks(tasks => tasks.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', flexShrink: 0 }}>
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setPlanTasks(tasks => [...tasks, { text: '', done: false }])}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1px dashed #d1d5db', borderRadius: 7, padding: '7px 12px', cursor: 'pointer', fontSize: 13, color: '#6b7280', width: '100%' }}>
                <Plus size={13} /> Add task
              </button>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowPlanEdit(false)} style={{ padding: '9px 18px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', border: 'none', borderRadius: 8, background: '#8b5cf6', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                <Save size={13} /> {saving ? 'Saving…' : 'Save Plan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
