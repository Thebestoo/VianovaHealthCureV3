import React, { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ChevronRight, ChevronLeft, Send, Check, AlertTriangle,
  FileJson, Upload, X, User, Activity
} from 'lucide-react'
import { parseFhirBundle } from '../utils/parseFhir.js'
import FhirPreview from '../components/FhirPreview.jsx'
import { useKey } from '../context/KeyContext.jsx'

const STEPS = ['Import FHIR', 'Patient Info', 'Medical History', 'Intake Questions', 'Review & Submit']

export default function NewCase() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { key } = useKey()
  const fileRef  = useRef()
  const [step, setStep]             = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')
  const [linkedPatientId, setLinkedPatientId] = useState(null)
  const [linkedPatientName, setLinkedPatientName] = useState('')

  // Pre-fill from linked patient if patient_id query param present
  useEffect(() => {
    const pid = searchParams.get('patient_id')
    if (!pid || !key) return
    setLinkedPatientId(pid)
    fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      .then(r => r.json())
      .then(d => {
        const patient = (d.patients || []).find(p => p.id === pid)
        if (!patient) return
        setLinkedPatientName(patient.name || '')
        let conds = []; let meds = []; let allgs = []
        try { conds = JSON.parse(patient.conditions || '[]') } catch {}
        try { meds  = JSON.parse(patient.medications || '[]') } catch {}
        try { allgs = JSON.parse(patient.allergies   || '[]') } catch { allgs = patient.allergies ? [patient.allergies] : [] }
        if (patient.dob) {
          const born = new Date(patient.dob)
          const age  = Math.floor((Date.now() - born) / (365.25 * 86400000))
          if (!isNaN(age) && age > 0) setInfo(i => ({ ...i, age: String(age) }))
        }
        if (patient.sex) setInfo(i => ({ ...i, sex: patient.sex }))
        setHistory({ known_conditions: conds, allergies: allgs, current_medications: meds })
        setStep(1) // skip straight to Patient Info
      })
      .catch(() => {})
  }, [key])

  // FHIR
  const [fhirData, setFhirData]   = useState(null)
  const [fhirFile, setFhirFile]   = useState(null)
  const [fhirError, setFhirError] = useState('')
  const [dragging, setDragging]   = useState(false)

  // Form state
  const [info, setInfo]       = useState({ age: '', sex: '', free_text: '' })
  const [history, setHistory] = useState({ known_conditions: [], allergies: [], current_medications: [] })
  const [answers, setAnswers] = useState({
    q1: '', q2: '', q3: '5', q4: '', q5: '',
    q6_toggle: '', q6_detail: '',
    q7_toggle: '', q7_detail: '',
    q8: ''
  })

  function setInfoField(k, v) { setInfo(p => ({ ...p, [k]: v })) }

  /* ── FHIR handlers ── */
  function handleFile(file) {
    if (!file) return
    setFhirError('')
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const json   = JSON.parse(e.target.result)
        const parsed = parseFhirBundle(json)
        if (!parsed) throw new Error('Could not parse this FHIR bundle. Check the file is a valid FHIR R4 Bundle.')
        setFhirData({ ...parsed, _fileName: file.name })
        setFhirFile(file.name)
        setStep(3) // skip manual entry — FHIR fills patient info & medical history
        const id = parsed.intakeData
        setInfo({
          age:       id.age != null ? String(id.age) : '',
          sex:       id.sex || '',
          free_text: id.free_text || ''
        })
        setHistory({
          known_conditions:    id.known_conditions    || [],
          allergies:           id.allergies           || [],
          current_medications: id.current_medications || [],
        })
      } catch (err) {
        setFhirError(err.message)
        setFhirData(null); setFhirFile(null)
      }
    }
    reader.readAsText(file)
  }

  function clearFhir() {
    setFhirData(null); setFhirFile(null); setFhirError('')
    setInfo({ age: '', sex: '', free_text: '' })
    setHistory({ known_conditions: [], allergies: [], current_medications: [] })
    setStep(0)
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  /* ── submit ── */
  async function submit() {
    setSubmitting(true); setError('')
    const allAnswers = [
      { question: 'What is your main complaint or symptom today?',                         answer: answers.q1 },
      { question: 'When did this symptom start and how has it changed over time?',         answer: answers.q2 },
      { question: 'Severity on a scale of 1–10',                                           answer: answers.q3 },
      { question: 'Does anything make your symptoms better or worse?',                    answer: answers.q4 },
      { question: 'Do you have any other symptoms, even if they seem unrelated?',         answer: answers.q5 },
      { question: 'Have you had any recent illnesses, injuries, or surgeries?',           answer: [answers.q6_toggle, answers.q6_detail].filter(Boolean).join(' — ') },
      { question: 'Have you traveled recently or been exposed to anyone who is sick?',   answer: [answers.q7_toggle, answers.q7_detail].filter(Boolean).join(' — ') },
      { question: 'Any additional information for the doctor?',                           answer: answers.q8 },
    ].filter(a => a.answer.trim())

    const payload = {
      age:                 info.age  ? Number(info.age) : undefined,
      sex:                 info.sex  || undefined,
      known_conditions:    history.known_conditions,
      allergies:           history.allergies,
      current_medications: history.current_medications,
      answers:             allAnswers,
      free_text:           info.free_text || undefined,
      // Link to gen_patient record if coming from patient profile
      ...(linkedPatientId ? { patient_id: linkedPatientId } : {}),
      // FHIR import data (stored for logs & vitals panel)
      ...(fhirData ? {
        vitals:       fhirData.vitals || [],
        patient_name: fhirData.patient?.fullName || undefined,
        mrn:          fhirData.patient?.mrn      || undefined,
        fhir_source:  fhirFile || undefined,
      } : {}),
    }
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (key) headers['x-api-key'] = key
      const res  = await fetch('/api/analyze', {
        method: 'POST', headers,
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Server error')
      navigate(`/cases/${data.case_id}`)
    } catch (e) {
      setError(e.message); setSubmitting(false)
    }
  }

  const canProceed = step !== 4

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">New Case</span>
        {fhirFile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--primary)', background: 'var(--primary-light)', padding: '4px 12px', borderRadius: 99 }}>
            <FileJson size={13} /> {fhirFile}
          </div>
        )}
      </div>

      {linkedPatientName && (
        <div style={{ margin: '12px 32px 0', padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 9, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#166534' }}>
          <User size={14} /> Creating case for <strong style={{ marginLeft: 3 }}>{linkedPatientName}</strong> — patient data pre-filled
        </div>
      )}

      <div style={{ padding: '28px 32px', maxWidth: 820 }}>
        {/* step indicator */}
        <div className="step-indicator" style={{ marginBottom: 28 }}>
          {STEPS.map((label, i) => (
            <React.Fragment key={i}>
              <div className="step-outer">
                <div className={`step-circle ${i < step ? 'done' : i === step ? 'active' : 'pending'}`}>
                  {i < step ? <Check size={14} strokeWidth={3} /> : i + 1}
                </div>
                <div className="step-label" style={{ color: i === step ? 'var(--primary)' : i < step ? 'var(--success)' : 'var(--text3)' }}>
                  {label}
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`step-connector ${i < step ? 'done' : ''}`} style={{ marginBottom: 16 }} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="card">
          <div className="card-body">

            {step === 0 && (
              <StepFhir
                fhirData={fhirData} fhirFile={fhirFile} fhirError={fhirError}
                dragging={dragging} setDragging={setDragging}
                fileRef={fileRef} onDrop={onDrop}
                onFile={handleFile} onClear={clearFhir}
              />
            )}

            {step === 1 && (
              <StepInfo
                info={info} setField={setInfoField}
                fhirPatient={fhirData?.patient || null}
              />
            )}

            {step === 2 && (
              <StepHistory history={history} setHistory={setHistory} />
            )}

            {step === 3 && (
              <>
                {fhirData && <FhirImportedSummary fhirData={fhirData} fhirFile={fhirFile} onClear={clearFhir} />}
                <StepQuestions answers={answers} setAnswers={setAnswers} />
              </>
            )}

            {step === 4 && (
              <StepReview
                info={info} history={history}
                answers={answers} fhirData={fhirData}
              />
            )}

            {error && (
              <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 8, fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            <hr className="divider" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button className="btn btn-secondary"
                onClick={() => step === 0 ? navigate('/cases') : setStep(s => s - 1)}
                disabled={submitting}>
                <ChevronLeft size={15} /> {step === 0 ? 'Cancel' : 'Back'}
              </button>

              {step < STEPS.length - 1 ? (
                <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>
                  Continue <ChevronRight size={15} />
                </button>
              ) : (
                <button className="btn btn-primary" onClick={submit} disabled={submitting}>
                  {submitting
                    ? <><div className="spinner" /> Analyzing…</>
                    : <><Send size={14} /> Submit & Analyze</>
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


/* ─────────────────────────────────────────────
   FHIR Imported Summary Banner
───────────────────────────────────────────── */
function FhirImportedSummary({ fhirData, fhirFile, onClear }) {
  const p = fhirData?.patient || {}
  const vitals = fhirData?.vitals || []
  const conditions = fhirData?.conditions?.filter(c => c.name) || []
  const medications = fhirData?.medications?.filter(m => m.name && m.status !== 'stopped' && m.status !== 'cancelled') || []
  const allergies = fhirData?.allergies?.filter(a => a.substance) || []

  const freshnessColor = (ageDays) => {
    if (ageDays === null) return '#94a3b8'
    if (ageDays <= 30) return '#059669'
    if (ageDays <= 90) return '#d97706'
    if (ageDays <= 180) return '#ea580c'
    return '#dc2626'
  }
  const freshnessLabel = (ageDays) => {
    if (ageDays === null) return 'no date'
    if (ageDays <= 30) return `${ageDays}d ago · current`
    if (ageDays <= 90) return `${ageDays}d ago · recent`
    if (ageDays <= 180) return `${ageDays}d ago · stale`
    if (ageDays <= 365) return `${ageDays}d ago · outdated`
    return `${ageDays}d ago · historical`
  }

  return (
    <div style={{ marginBottom: 20, border: '1.5px solid #0ea5e9', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ background: '#0ea5e9', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff', fontWeight: 600, fontSize: 13 }}>
          <span>📋</span> FHIR Imported — {fhirFile}
          {p.fullName && <span style={{ fontWeight: 400, opacity: .85 }}>· {p.fullName}{p.age ? `, ${p.age}y` : ''}{p.gender ? ` (${p.gender})` : ''}</span>}
        </div>
        <button onClick={onClear} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 11, padding: '3px 10px', fontWeight: 600 }}>✕ Clear</button>
      </div>
      <div style={{ background: '#f0f9ff', padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12.5 }}>
        {/* Vitals */}
        {vitals.length > 0 && (
          <div style={{ flex: '1 1 200px' }}>
            <div style={{ fontWeight: 700, color: '#0284c7', marginBottom: 5, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Vitals</div>
            {vitals.map((v, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                <span style={{ color: '#374151' }}>{v.name}: <strong>{v.value}{v.unit ? ` ${v.unit}` : ''}</strong></span>
                <span style={{ color: freshnessColor(v.age_days), fontSize: 11, whiteSpace: 'nowrap' }}>{freshnessLabel(v.age_days)}</span>
              </div>
            ))}
          </div>
        )}
        {/* Conditions */}
        {conditions.length > 0 && (
          <div style={{ flex: '1 1 180px' }}>
            <div style={{ fontWeight: 700, color: '#1d4ed8', marginBottom: 5, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Conditions</div>
            {conditions.map((c, i) => (
              <div key={i} style={{ color: '#374151', marginBottom: 2 }}>• {c.name}{c.onset ? <span style={{ color: '#94a3b8', fontSize: 11 }}> · {c.onset.slice(0,10)}</span> : ''}</div>
            ))}
          </div>
        )}
        {/* Medications */}
        {medications.length > 0 && (
          <div style={{ flex: '1 1 180px' }}>
            <div style={{ fontWeight: 700, color: '#059669', marginBottom: 5, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Medications</div>
            {medications.map((m, i) => (
              <div key={i} style={{ color: '#374151', marginBottom: 2 }}>• {m.name}{m.dosage ? <span style={{ color: '#94a3b8', fontSize: 11 }}> · {m.dosage}</span> : ''}</div>
            ))}
          </div>
        )}
        {/* Allergies */}
        {allergies.length > 0 && (
          <div style={{ flex: '1 1 160px' }}>
            <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 5, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Allergies</div>
            {allergies.map((a, i) => (
              <div key={i} style={{ color: '#374151', marginBottom: 2 }}>• {a.substance}{a.reaction ? <span style={{ color: '#94a3b8', fontSize: 11 }}> · {a.reaction}</span> : ''}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   STEP 0 — FHIR Import
───────────────────────────────────────────── */
function StepFhir({ fhirData, fhirFile, fhirError, dragging, setDragging, fileRef, onDrop, onFile, onClear }) {
  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Import Patient FHIR Record</h2>
      <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>
        Upload a FHIR R4 Bundle JSON to auto-fill patient demographics, vitals, conditions and medications —
        or skip this step and fill in manually.
      </p>

      {!fhirData ? (
        <>
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? 'var(--primary)' : '#cbd5e1'}`,
              borderRadius: 14, padding: '52px 32px', textAlign: 'center',
              background: dragging ? 'var(--primary-light)' : 'var(--surface2)',
              cursor: 'pointer', transition: 'all .15s',
            }}
          >
            <div style={{
              width: 60, height: 60, borderRadius: 14,
              background: dragging ? 'var(--primary)' : '#e2e8f0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px', transition: 'all .15s'
            }}>
              <FileJson size={28} color={dragging ? '#fff' : '#64748b'} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>
              Drop your FHIR Bundle here
            </div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>
              or click to browse · accepts .json files
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '9px 20px', background: 'var(--primary)', color: '#fff',
              borderRadius: 8, fontSize: 13, fontWeight: 600, pointerEvents: 'none'
            }}>
              <Upload size={14} /> Choose File
            </span>
            <input ref={fileRef} type="file" accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={e => onFile(e.target.files[0])} />
          </div>

          {fhirError && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 8, fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {fhirError}
            </div>
          )}

          <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {['Patient Demographics', 'Vital Signs & Labs', 'Conditions & Medications'].map(label => (
              <div key={label} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12.5, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 7 }}>
                <Check size={12} color="var(--success)" /> {label}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
              <Check size={16} strokeWidth={2.5} /> Data extracted from <span style={{ fontFamily: 'monospace' }}>{fhirFile}</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={onClear}>
              <X size={13} /> Clear & re-import
            </button>
          </div>
          <FhirPreview data={fhirData} fileName={fhirFile} />
          <div style={{ marginTop: 16, padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: 13, color: '#15803d', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Check size={15} strokeWidth={2.5} />
            Patient data pre-filled in the next steps. Review and adjust before submitting.
          </div>
        </>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
   STEP 1 — Patient Info
───────────────────────────────────────────── */
function StepInfo({ info, setField, fhirPatient }) {
  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 18 }}>Patient Information</h2>

      {/* FHIR patient context banner */}
      {fhirPatient?.fullName && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px', background: 'var(--primary-light)',
          border: '1px solid #bae6fd', borderRadius: 10, marginBottom: 20
        }}>
          <div style={{ width: 38, height: 38, borderRadius: 99, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{fhirPatient.fullName}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
              {[fhirPatient.mrn && `MRN: ${fhirPatient.mrn}`, fhirPatient.birthDate && `DOB: ${fhirPatient.birthDate}`, fhirPatient.phone].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
      )}

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Age <span className="req">*</span></label>
          <input className="form-input" type="number" min="0" max="120" placeholder="e.g. 34"
            value={info.age} onChange={e => setField('age', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Biological Sex <span className="req">*</span></label>
          <select className="form-select" value={info.sex} onChange={e => setField('sex', e.target.value)}>
            <option value="">— Select —</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other / Prefer not to say</option>
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">
          Clinical context for AI
          {info.free_text && (
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>
              <Check size={11} style={{ display: 'inline', marginRight: 2 }} />Pre-filled from FHIR vitals
            </span>
          )}
        </label>
        <textarea className="form-textarea" rows={3}
          placeholder="Vital signs, recent test results, or any additional clinical context for the AI…"
          value={info.free_text}
          onChange={e => setField('free_text', e.target.value)} />
        <div className="form-hint">This text is sent directly to the AI as additional clinical context.</div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   STEP 2 — Medical History
───────────────────────────────────────────── */
function StepHistory({ history, setHistory }) {
  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Medical History</h2>
      <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 20 }}>
        Enter each item and press <kbd style={{ padding: '1px 5px', borderRadius: 4, background: '#f1f5f9', border: '1px solid #e2e8f0', fontSize: 11 }}>Enter</kbd> to add it as a tag.
      </p>

      <div className="form-group">
        <label className="form-label">Known Medical Conditions</label>
        <TagInput
          values={history.known_conditions}
          onChange={v => setHistory(h => ({ ...h, known_conditions: v }))}
          placeholder="e.g. Hypertension, Diabetes Type 2…"
          color="var(--primary)"
          colorBg="var(--primary-light)"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Allergies</label>
        <TagInput
          values={history.allergies}
          onChange={v => setHistory(h => ({ ...h, allergies: v }))}
          placeholder="e.g. Penicillin, Peanuts, Latex…"
          color="#dc2626"
          colorBg="#fee2e2"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Current Medications</label>
        <TagInput
          values={history.current_medications}
          onChange={v => setHistory(h => ({ ...h, current_medications: v }))}
          placeholder="e.g. Metformin 500mg, Atorvastatin 20mg…"
          color="#7c3aed"
          colorBg="#f5f3ff"
        />
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   STEP 3 — Intake Questions
───────────────────────────────────────────── */
function StepQuestions({ answers, setAnswers }) {
  function set(k, v) { setAnswers(p => ({ ...p, [k]: v })) }
  const severity = Number(answers.q3) || 5

  const sevColor = severity <= 3 ? '#059669' : severity <= 6 ? '#d97706' : '#dc2626'
  const sevLabel = severity <= 3 ? 'Mild' : severity <= 6 ? 'Moderate' : severity <= 8 ? 'Severe' : 'Critical'

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Intake Questions</h2>
      <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 24 }}>Answer as many as you can. All fields are optional.</p>

      {/* Q1 */}
      <QBlock number={1} label="What is your main complaint or symptom today?">
        <textarea className="form-textarea" rows={3}
          placeholder="Describe your main symptom clearly…"
          value={answers.q1} onChange={e => set('q1', e.target.value)} />
      </QBlock>

      {/* Q2 */}
      <QBlock number={2} label="When did this symptom start and how has it changed over time?">
        <textarea className="form-textarea" rows={2}
          placeholder="e.g. Started 3 days ago, gradually getting worse…"
          value={answers.q2} onChange={e => set('q2', e.target.value)} />
      </QBlock>

      {/* Q3 — slider */}
      <QBlock number={3} label="How severe are your symptoms right now?">
        <div style={{ padding: '16px 20px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: sevColor, lineHeight: 1 }}>{severity}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: sevColor }}>{sevLabel}</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>1 = Minimal · 10 = Emergency</div>
          </div>
          <input type="range" min="1" max="10" step="1"
            value={severity}
            onChange={e => set('q3', e.target.value)}
            style={{ width: '100%', accentColor: sevColor, cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} style={{
                width: 20, textAlign: 'center', fontSize: 10,
                color: i + 1 === severity ? sevColor : 'var(--text3)',
                fontWeight: i + 1 === severity ? 700 : 400
              }}>{i + 1}</div>
            ))}
          </div>
        </div>
      </QBlock>

      {/* Q4 */}
      <QBlock number={4} label="Does anything make your symptoms better or worse?">
        <textarea className="form-textarea" rows={2}
          placeholder="e.g. Worse after eating, better when lying down…"
          value={answers.q4} onChange={e => set('q4', e.target.value)} />
      </QBlock>

      {/* Q5 */}
      <QBlock number={5} label="Do you have any other symptoms, even if they seem unrelated?">
        <textarea className="form-textarea" rows={2}
          placeholder="e.g. Fatigue, nausea, fever, headache…"
          value={answers.q5} onChange={e => set('q5', e.target.value)} />
      </QBlock>

      {/* Q6 — toggle + detail */}
      <QBlock number={6} label="Have you had any recent illnesses, injuries, or surgeries?">
        <ToggleQuestion
          value={answers.q6_toggle}
          detail={answers.q6_detail}
          onToggle={v => set('q6_toggle', v)}
          onDetail={v => set('q6_detail', v)}
          placeholder="Please describe — what, when, and any complications…"
        />
      </QBlock>

      {/* Q7 — toggle + detail */}
      <QBlock number={7} label="Have you traveled recently or been exposed to anyone who is sick?">
        <ToggleQuestion
          value={answers.q7_toggle}
          detail={answers.q7_detail}
          onToggle={v => set('q7_toggle', v)}
          onDetail={v => set('q7_detail', v)}
          placeholder="Where did you travel, or who were you exposed to…"
        />
      </QBlock>

      {/* Q8 */}
      <QBlock number={8} label="Any additional information you would like the doctor to know?">
        <textarea className="form-textarea" rows={3}
          placeholder="Family history, recent stress, lifestyle factors, specific concerns…"
          value={answers.q8} onChange={e => set('q8', e.target.value)} />
      </QBlock>
    </div>
  )
}

/* ─────────────────────────────────────────────
   STEP 4 — Review & Submit
───────────────────────────────────────────── */
function StepReview({ info, history, answers, fhirData }) {
  const severity = Number(answers.q3) || 5
  const sevColor = severity <= 3 ? '#059669' : severity <= 6 ? '#d97706' : '#dc2626'
  const sevLabel = severity <= 3 ? 'Mild' : severity <= 6 ? 'Moderate' : severity <= 8 ? 'Severe' : 'Critical'

  const filledQs = [
    answers.q1 && { label: 'Main complaint',                   value: answers.q1 },
    answers.q2 && { label: 'Symptom onset & progression',      value: answers.q2 },
    {              label: 'Severity',                          value: `${severity}/10 — ${sevLabel}`, color: sevColor },
    answers.q4 && { label: 'Aggravating / relieving factors',  value: answers.q4 },
    answers.q5 && { label: 'Other symptoms',                   value: answers.q5 },
    (answers.q6_toggle || answers.q6_detail) && {
      label: 'Recent illnesses / injuries / surgeries',
      value: [answers.q6_toggle, answers.q6_detail].filter(Boolean).join(' — ')
    },
    (answers.q7_toggle || answers.q7_detail) && {
      label: 'Travel / exposure',
      value: [answers.q7_toggle, answers.q7_detail].filter(Boolean).join(' — ')
    },
    answers.q8 && { label: 'Additional notes', value: answers.q8 },
  ].filter(Boolean)

  return (
    <div>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Review Before Submitting</h2>

      {/* FHIR badge */}
      {fhirData?._fileName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '9px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 13, color: '#1d4ed8' }}>
          <FileJson size={14} /> FHIR import: <strong>{fhirData._fileName}</strong>
          {fhirData.patient?.fullName && <span style={{ marginLeft: 4, color: '#3b82f6' }}>({fhirData.patient.fullName})</span>}
        </div>
      )}

      {/* Patient */}
      <ReviewSection title="Patient">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <ReviewTile label="Age"  value={info.age  ? `${info.age} years old`  : null} />
          <ReviewTile label="Sex"  value={info.sex  || null} />
        </div>
        {info.free_text && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6 }}>
            <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 11, display: 'block', marginBottom: 3 }}>CLINICAL CONTEXT</span>
            {info.free_text}
          </div>
        )}
      </ReviewSection>

      {/* History */}
      {(history.known_conditions.length > 0 || history.allergies.length > 0 || history.current_medications.length > 0) && (
        <ReviewSection title="Medical History">
          {history.known_conditions.length > 0 && (
            <PillGroup label="Conditions"  items={history.known_conditions} color="var(--primary)"  bg="var(--primary-light)" />
          )}
          {history.allergies.length > 0 && (
            <PillGroup label="Allergies"   items={history.allergies}        color="#dc2626"          bg="#fee2e2"              />
          )}
          {history.current_medications.length > 0 && (
            <PillGroup label="Medications" items={history.current_medications} color="#7c3aed"       bg="#f5f3ff"              />
          )}
        </ReviewSection>
      )}

      {/* Intake answers */}
      <ReviewSection title="Intake Answers">
        {filledQs.map((q, i) => (
          <div key={i} style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: 8, marginBottom: 8, borderLeft: `3px solid ${q.color || 'var(--primary)'}` }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 3 }}>{q.label}</div>
            <div style={{ fontSize: 13.5, color: q.color || 'var(--text)', fontWeight: q.color ? 700 : 400 }}>{q.value}</div>
          </div>
        ))}
        {filledQs.length === 0 && (
          <div style={{ color: 'var(--text3)', fontSize: 13, padding: '10px 0' }}>No intake answers provided — AI will work from FHIR data and medical history only.</div>
        )}
      </ReviewSection>

      {/* Warning */}
      <div style={{ padding: '12px 16px', background: 'var(--warning-light)', borderRadius: 10, fontSize: 13, color: 'var(--warning)', display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 8 }}>
        <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>The AI will analyze this data and generate a <strong>draft</strong> clinical analysis. All output must be reviewed and approved by a licensed physician before it reaches the patient.</span>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   Shared sub-components
───────────────────────────────────────────── */
function QBlock({ number, label, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: 99, background: 'var(--primary)',
          color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0
        }}>{number}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
      </label>
      {children}
    </div>
  )
}

function ToggleQuestion({ value, detail, onToggle, onDetail, placeholder }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: value === 'Yes' ? 10 : 0 }}>
        {['Yes', 'No', 'Unsure'].map(opt => (
          <button key={opt} type="button"
            onClick={() => onToggle(value === opt ? '' : opt)}
            style={{
              padding: '7px 20px', borderRadius: 8, border: '1.5px solid',
              borderColor: value === opt ? 'var(--primary)' : 'var(--border)',
              background: value === opt ? 'var(--primary)' : 'var(--surface)',
              color: value === opt ? '#fff' : 'var(--text2)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .12s'
            }}>{opt}</button>
        ))}
      </div>
      {value === 'Yes' && (
        <textarea className="form-textarea" rows={2} placeholder={placeholder}
          value={detail} onChange={e => onDetail(e.target.value)} />
      )}
    </div>
  )
}

function ReviewSection({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        {title}
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      {children}
    </div>
  )
}

function ReviewTile({ label, value }) {
  if (!value) return null
  return (
    <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
      <div style={{ fontSize: 10.5, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}

function PillGroup({ label, items, color, bg }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11.5, color: 'var(--text2)', fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map(v => (
          <span key={v} style={{ padding: '3px 10px', borderRadius: 99, background: bg, color, fontSize: 12.5, fontWeight: 500, border: `1px solid ${color}22` }}>
            {v}
          </span>
        ))}
      </div>
    </div>
  )
}

function TagInput({ values, onChange, placeholder, color, colorBg }) {
  const [input, setInput] = useState('')
  function add() {
    const v = input.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setInput('')
  }
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px',
      border: '1.5px solid var(--border)', borderRadius: 8, background: 'var(--surface)',
      minHeight: 44, alignItems: 'center',
      transition: 'border-color .15s',
    }}
      onFocus={e => e.currentTarget.style.borderColor = 'var(--primary)'}
      onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      {values.map(v => (
        <span key={v} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: colorBg, color, padding: '3px 9px', borderRadius: 6,
          fontSize: 12.5, fontWeight: 500
        }}>
          {v}
          <button type="button" onClick={() => onChange(values.filter(x => x !== v))}
            style={{ background: 'none', border: 'none', color, fontSize: 16, lineHeight: 1, padding: 0, cursor: 'pointer', opacity: .6 }}>×</button>
        </span>
      ))}
      <input
        style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, minWidth: 120, background: 'transparent' }}
        value={input}
        placeholder={values.length === 0 ? placeholder : 'Add another…'}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
      />
    </div>
  )
}
