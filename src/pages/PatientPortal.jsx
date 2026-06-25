import React, { useState, useEffect, useRef } from 'react'
import { MessageSquare, Loader2, Send, User, Bot, ChevronDown, ChevronUp } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const SYMPTOMS_LIST = [
  'Fever', 'Cough', 'Shortness of Breath', 'Chest Pain',
  'Headache', 'Nausea', 'Fatigue', 'Dizziness', 'Abdominal Pain', 'Other'
]

const PHQ9_QUESTIONS = [
  'Little interest or pleasure in doing things',
  'Feeling down, depressed, or hopeless',
  'Trouble falling or staying asleep, or sleeping too much',
  'Feeling tired or having little energy',
  'Poor appetite or overeating',
  'Feeling bad about yourself — or that you are a failure or have let yourself or your family down',
  'Trouble concentrating on things, such as reading the newspaper or watching television',
  'Moving or speaking so slowly that other people could have noticed. Or the opposite — being so fidgety or restless',
  'Thoughts that you would be better off dead or of hurting yourself in some way'
]

const GAD7_QUESTIONS = [
  'Feeling nervous, anxious, or on edge',
  'Not being able to stop or control worrying',
  'Worrying too much about different things',
  'Trouble relaxing',
  'Being so restless that it is hard to sit still',
  'Becoming easily annoyed or irritable',
  'Feeling afraid, as if something awful might happen'
]

const SCORE_LABELS = ['Not at all', 'Several days', 'More than half', 'Nearly every day']

function phq9Severity(score) {
  if (score >= 20) return { label: 'Severe', color: '#b91c1c' }
  if (score >= 15) return { label: 'Moderately Severe', color: '#d97706' }
  if (score >= 10) return { label: 'Moderate', color: '#d97706' }
  if (score >= 5) return { label: 'Mild', color: '#059669' }
  return { label: 'Minimal / None', color: '#059669' }
}

function gad7Severity(score) {
  if (score >= 15) return { label: 'Severe', color: '#b91c1c' }
  if (score >= 10) return { label: 'Moderate', color: '#d97706' }
  if (score >= 5) return { label: 'Mild', color: '#059669' }
  return { label: 'Minimal', color: '#059669' }
}

function triageColors(level) {
  if (!level) return { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' }
  const l = level.toLowerCase()
  if (l === 'emergency') return { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' }
  if (l === 'urgent') return { bg: '#fef3c7', text: '#b45309', border: '#fbbf24' }
  if (l === 'routine') return { bg: '#fefce8', text: '#854d0e', border: '#fde047' }
  if (l === 'self_care' || l === 'self care') return { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7' }
  return { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' }
}

function triage_badge(level) {
  const c = triageColors(level)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 12px',
      borderRadius: 99, fontSize: 12, fontWeight: 700,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      textTransform: 'uppercase', letterSpacing: '.04em'
    }}>
      {level?.replace('_', ' ') || 'Unknown'}
    </span>
  )
}

const inputStyle = {
  width: '100%', padding: '9px 13px', border: '1.5px solid var(--border)',
  borderRadius: 8, fontSize: 13.5, color: 'var(--text)', background: 'var(--surface)',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit'
}
const labelStyle = {
  display: 'block', fontSize: 12.5, fontWeight: 600,
  color: 'var(--text)', marginBottom: 5
}

export default function PatientPortal() {
  const { key } = useKey()
  const [tab, setTab] = useState('intake')
  const [patients, setPatients] = useState([])

  // Intake state
  const [intakePatient, setIntakePatient] = useState('')
  const [step, setStep] = useState(1)
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [symptoms, setSymptoms] = useState([])
  const [duration, setDuration] = useState('')
  const [painScale, setPainScale] = useState(0)
  const [phq9, setPhq9] = useState(Array(9).fill(0))
  const [gad7, setGad7] = useState(Array(7).fill(0))
  const [submitting, setSubmitting] = useState(false)
  const [triageResult, setTriageResult] = useState(null)

  // Chat state
  const [chatPatient, setChatPatient] = useState('')
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hello! I'm your Vianova Health assistant. How can I help you today?" }
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef(null)

  // History state
  const [historyPatient, setHistoryPatient] = useState('')
  const [intakeHistory, setIntakeHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [expandedIntake, setExpandedIntake] = useState(null)

  useEffect(() => { if (key) loadPatients() }, [key])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function loadPatients() {
    try {
      const r = await fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPatients(d.patients || [])
    } catch {}
  }

  function toggleSymptom(s) {
    setSymptoms(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  const phq9Score = phq9.reduce((a, b) => a + b, 0)
  const gad7Score = gad7.reduce((a, b) => a + b, 0)

  async function submitIntake() {
    if (!intakePatient) return
    setSubmitting(true)
    setTriageResult(null)
    try {
      const r = await fetch('/api/portal/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({
          patient_id: intakePatient,
          chief_complaint: chiefComplaint,
          symptoms,
          symptom_duration: duration,
          pain_scale: painScale,
          phq9_answers: phq9,
          gad7_answers: gad7
        })
      })
      const d = await r.json()
      setTriageResult(d)
      setStep(4)
    } catch {}
    setSubmitting(false)
  }

  function resetIntake() {
    setStep(1); setChiefComplaint(''); setSymptoms([]); setDuration('')
    setPainScale(0); setPhq9(Array(9).fill(0)); setGad7(Array(7).fill(0))
    setTriageResult(null)
  }

  async function sendChat() {
    const msg = chatInput.trim()
    if (!msg || chatLoading) return
    const newMessages = [...messages, { role: 'user', text: msg }]
    setMessages(newMessages)
    setChatInput('')
    setChatLoading(true)
    try {
      const r = await fetch('/api/portal/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({
          message: msg,
          context: newMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
          ...(chatPatient && { patient_id: chatPatient })
        })
      })
      const d = await r.json()
      setMessages(prev => [...prev, { role: 'assistant', text: d.reply || d.message || 'I received your message.' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, I encountered an error. Please try again.' }])
    }
    setChatLoading(false)
  }

  async function loadHistory() {
    setHistoryLoading(true)
    try {
      const qs = historyPatient ? `?patient_id=${historyPatient}` : ''
      const r = await fetch(`/api/portal/intakes${qs}`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setIntakeHistory(Array.isArray(d) ? d : [])
    } catch {}
    setHistoryLoading(false)
  }

  useEffect(() => { if (tab === 'history' && key) loadHistory() }, [tab, historyPatient, key])

  const tabStyle = (active) => ({
    padding: '8px 18px', border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 13.5, fontWeight: active ? 700 : 500,
    background: active ? 'var(--primary)' : 'transparent',
    color: active ? '#fff' : 'var(--text2)', transition: 'all .15s'
  })

  const stepBg = (n) => ({
    width: 28, height: 28, borderRadius: 99, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontWeight: 700, fontSize: 13,
    background: step >= n ? 'var(--primary)' : 'var(--surface2)',
    color: step >= n ? '#fff' : 'var(--text3)',
    border: `2px solid ${step >= n ? 'var(--primary)' : 'var(--border)'}`
  })

  function ScoreQuestion({ questions, answers, setAnswers, label }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {questions.map((q, i) => (
          <div key={i} style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 10, lineHeight: 1.5 }}>
              <strong>{i + 1}.</strong> {q}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SCORE_LABELS.map((l, v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    const next = [...answers]; next[i] = v; setAnswers(next)
                  }}
                  style={{
                    padding: '5px 11px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                    border: answers[i] === v ? '2px solid var(--primary)' : '1.5px solid var(--border)',
                    background: answers[i] === v ? 'var(--primary-light)' : 'var(--surface)',
                    color: answers[i] === v ? 'var(--primary)' : 'var(--text2)',
                    fontWeight: answers[i] === v ? 700 : 400, transition: 'all .12s'
                  }}
                >
                  {v} – {l}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <MessageSquare size={18} color="var(--primary)" />
          <span className="topbar-title">Patient Portal</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['intake', 'New Intake'], ['chat', 'AI Chat'], ['history', 'History']].map(([id, lbl]) => (
            <button key={id} style={tabStyle(tab === id)} onClick={() => setTab(id)}>{lbl}</button>
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 32px 32px' }}>

        {/* ── Tab 1: New Intake ── */}
        {tab === 'intake' && (
          <div style={{ maxWidth: 720, margin: '0 auto' }}>

            {/* Patient selector */}
            <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
              <label style={labelStyle}>Patient <span style={{ color: 'var(--danger)' }}>*</span></label>
              <select value={intakePatient} onChange={e => setIntakePatient(e.target.value)} style={inputStyle}>
                <option value="">— Select patient —</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Progress bar */}
            {step < 4 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  {[1, 2, 3].map((n, i) => (
                    <React.Fragment key={n}>
                      <div style={stepBg(n)}>{n}</div>
                      <span style={{ fontSize: 12, color: step === n ? 'var(--primary)' : 'var(--text3)', fontWeight: step === n ? 700 : 400 }}>
                        {['Symptoms', 'PHQ-9', 'GAD-7'][i]}
                      </span>
                      {n < 3 && <div style={{ flex: 1, height: 2, background: step > n ? 'var(--primary)' : 'var(--border)', borderRadius: 99 }} />}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            {/* Step 1 */}
            {step === 1 && (
              <div className="card" style={{ padding: '20px 22px' }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 18 }}>Chief Complaint & Symptoms</div>

                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Chief Complaint</label>
                  <textarea
                    value={chiefComplaint}
                    onChange={e => setChiefComplaint(e.target.value)}
                    rows={3}
                    placeholder="Describe the main reason for this visit…"
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Symptoms</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {SYMPTOMS_LIST.map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSymptom(s)}
                        style={{
                          padding: '6px 13px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                          border: symptoms.includes(s) ? '2px solid var(--primary)' : '1.5px solid var(--border)',
                          background: symptoms.includes(s) ? 'var(--primary-light)' : 'var(--surface)',
                          color: symptoms.includes(s) ? 'var(--primary)' : 'var(--text2)',
                          fontWeight: symptoms.includes(s) ? 700 : 400, transition: 'all .12s'
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                  <div>
                    <label style={labelStyle}>Duration</label>
                    <input
                      type="text"
                      value={duration}
                      onChange={e => setDuration(e.target.value)}
                      placeholder="e.g. 3 days"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Pain Scale (0–10): <strong>{painScale}</strong></label>
                    <input
                      type="range"
                      min={0} max={10} step={1}
                      value={painScale}
                      onChange={e => setPainScale(Number(e.target.value))}
                      style={{ width: '100%', marginTop: 10 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text3)' }}>
                      <span>No pain</span><span>Worst pain</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setStep(2)}
                    disabled={!intakePatient || !chiefComplaint}
                  >
                    Next: PHQ-9 →
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 — PHQ-9 */}
            {step === 2 && (
              <div className="card" style={{ padding: '20px 22px' }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 4 }}>PHQ-9 Depression Screening</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>Over the last 2 weeks, how often have you been bothered by:</div>
                <ScoreQuestion questions={PHQ9_QUESTIONS} answers={phq9} setAnswers={setPhq9} label="PHQ-9" />
                <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>PHQ-9 Score: <strong>{phq9Score}</strong> / 27</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: phq9Severity(phq9Score).color }}>{phq9Severity(phq9Score).label}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>← Back</button>
                  <button className="btn btn-primary btn-sm" onClick={() => setStep(3)}>Next: GAD-7 →</button>
                </div>
              </div>
            )}

            {/* Step 3 — GAD-7 */}
            {step === 3 && (
              <div className="card" style={{ padding: '20px 22px' }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 4 }}>GAD-7 Anxiety Screening</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>Over the last 2 weeks, how often have you been bothered by:</div>
                <ScoreQuestion questions={GAD7_QUESTIONS} answers={gad7} setAnswers={setGad7} label="GAD-7" />
                <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>GAD-7 Score: <strong>{gad7Score}</strong> / 21</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: gad7Severity(gad7Score).color }}>{gad7Severity(gad7Score).label}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setStep(2)}>← Back</button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={submitIntake}
                    disabled={submitting}
                  >
                    {submitting
                      ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Submitting…</>
                      : 'Submit Intake →'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 4 — Triage result */}
            {step === 4 && triageResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Banner */}
                <div style={{
                  padding: '20px 22px', borderRadius: 12, textAlign: 'center',
                  background: triageColors(triageResult.triage_level).bg,
                  border: `2px solid ${triageColors(triageResult.triage_level).border}`
                }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: triageColors(triageResult.triage_level).text, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                    {triageResult.triage_level?.replace('_', ' ') || 'Triage Complete'}
                  </div>
                  {triageResult.recommendation && (
                    <div style={{ fontSize: 14, color: triageColors(triageResult.triage_level).text, opacity: .85 }}>{triageResult.recommendation}</div>
                  )}
                </div>

                {/* Details card */}
                <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {triageResult.care_instructions && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Care Instructions</div>
                      <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.65 }}>{triageResult.care_instructions}</div>
                    </div>
                  )}

                  {triageResult.red_flags && triageResult.red_flags.length > 0 && (
                    <div style={{ padding: '12px 14px', background: '#fee2e2', borderRadius: 8, border: '1px solid #fca5a5' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Red Flags</div>
                      {triageResult.red_flags.map((f, i) => (
                        <div key={i} style={{ fontSize: 13, color: '#991b1b', marginBottom: 4 }}>• {f}</div>
                      ))}
                    </div>
                  )}

                  {triageResult.mental_health_flag && triageResult.mental_health_note && (
                    <div style={{ padding: '12px 14px', background: '#ede9fe', borderRadius: 8, border: '1px solid #c4b5fd' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Mental Health</div>
                      <div style={{ fontSize: 13, color: '#5b21b6' }}>{triageResult.mental_health_note}</div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>PHQ-9</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{triageResult.phq9_score ?? phq9Score}</div>
                      <div style={{ fontSize: 11, color: phq9Severity(triageResult.phq9_score ?? phq9Score).color, fontWeight: 600 }}>{phq9Severity(triageResult.phq9_score ?? phq9Score).label}</div>
                    </div>
                    <div style={{ flex: 1, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>GAD-7</div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{triageResult.gad7_score ?? gad7Score}</div>
                      <div style={{ fontSize: 11, color: gad7Severity(triageResult.gad7_score ?? gad7Score).color, fontWeight: 600 }}>{gad7Severity(triageResult.gad7_score ?? gad7Score).label}</div>
                    </div>
                  </div>
                </div>

                <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={resetIntake}>
                  New Intake
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Tab 2: AI Chat ── */}
        {tab === 'chat' && (
          <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>Patient (optional)</label>
              <select value={chatPatient} onChange={e => setChatPatient(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                <option value="">— No patient selected —</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 480 }}>
              {/* Message area */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end' }}>
                    {msg.role === 'assistant' && (
                      <div style={{ width: 28, height: 28, borderRadius: 99, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Bot size={14} color="var(--primary)" />
                      </div>
                    )}
                    <div style={{
                      maxWidth: '72%', padding: '10px 14px', borderRadius: 14,
                      fontSize: 13.5, lineHeight: 1.6,
                      background: msg.role === 'user' ? 'var(--primary)' : 'var(--surface2)',
                      color: msg.role === 'user' ? '#fff' : 'var(--text)',
                      borderBottomRightRadius: msg.role === 'user' ? 4 : 14,
                      borderBottomLeftRadius: msg.role === 'assistant' ? 4 : 14,
                      border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none'
                    }}>
                      {msg.text}
                    </div>
                    {msg.role === 'user' && (
                      <div style={{ width: 28, height: 28, borderRadius: 99, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <User size={14} color="#64748b" />
                      </div>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 99, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Bot size={14} color="var(--primary)" />
                    </div>
                    <div style={{ padding: '10px 14px', borderRadius: 14, borderBottomLeftRadius: 4, background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', gap: 5, alignItems: 'center' }}>
                      <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />
                      <span style={{ fontSize: 13, color: 'var(--text2)' }}>Thinking…</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                  placeholder="Type a message…"
                  style={{ ...inputStyle, flex: 1 }}
                  disabled={chatLoading}
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={sendChat}
                  disabled={!chatInput.trim() || chatLoading}
                  style={{ flexShrink: 0 }}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab 3: History ── */}
        {tab === 'history' && (
          <div>
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Filter by patient</label>
              <select
                value={historyPatient}
                onChange={e => setHistoryPatient(e.target.value)}
                style={{ ...inputStyle, width: 240 }}
              >
                <option value="">All patients</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: 60 }}>
                <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)', display: 'block', margin: '0 auto 10px' }} />
              </div>
            ) : intakeHistory.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '60px 20px',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12
              }}>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>No intake records found.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {intakeHistory.map((intake, i) => {
                  const isExp = expandedIntake === i
                  return (
                    <div key={i} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      <div
                        style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                        onClick={() => setExpandedIntake(isExp ? null : i)}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                              {intake.patient_name || `Patient ${intake.patient_id}`}
                            </span>
                            {triage_badge(intake.triage_level)}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
                            {intake.chief_complaint}
                            {intake.created_at && <span style={{ marginLeft: 8, color: 'var(--text3)' }}>· {new Date(intake.created_at).toLocaleDateString()}</span>}
                          </div>
                          {(intake.phq9_score != null || intake.gad7_score != null) && (
                            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                              {intake.phq9_score != null && <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>PHQ-9: {intake.phq9_score}</span>}
                              {intake.gad7_score != null && <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>GAD-7: {intake.gad7_score}</span>}
                            </div>
                          )}
                        </div>
                        <div style={{ color: 'var(--text3)' }}>
                          {isExp ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                      {isExp && (
                        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 18px', background: 'var(--surface2)', fontSize: 13, color: 'var(--text)', lineHeight: 1.65 }}>
                          {intake.recommendation && <div style={{ marginBottom: 8 }}><strong>Recommendation:</strong> {intake.recommendation}</div>}
                          {intake.care_instructions && <div><strong>Care Instructions:</strong> {intake.care_instructions}</div>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
