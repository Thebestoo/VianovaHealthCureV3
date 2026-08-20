import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  AlertTriangle, CheckCircle, Clock, ChevronLeft, ShieldAlert, Check,
  Pill, FlaskConical, Stethoscope, UserRound, FileText, Save,
  Activity, Heart, Thermometer, Droplets, Wind, CalendarClock, TriangleAlert,
  Printer, Share2, History, Copy, X
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import SummaryActions from '../components/SummaryActions.jsx'
import { calcNEWS2, flagVitals } from '../utils/news2.js'
import { suggestICD10 } from '../utils/icd10.js'

// Shown when the AI didn't return per-case disclaimers (current schema doesn't
// generate any) — standard compliance boilerplate, not case-specific content.
const DEFAULT_DISCLAIMERS = [
  'This is an AI-generated draft for physician review only — not a diagnosis or prescription.',
  'All pharmacological suggestions require physician verification of dose, contraindications, and interactions.',
  'Based on patient/FHIR-reported information — verify against the full medical record before treatment decisions.',
]

// Turns the AI's structured draft_treatment_plan into an editable starting point
// for "Final Approved Cure", so the doctor edits/verifies the AI's own draft
// instead of retyping the whole plan from scratch on every case.
function draftTreatmentPlanText(a) {
  const plan = a?.draft_treatment_plan
  if (!plan) return ''
  const lines = []
  if (plan.non_pharmacological?.length) {
    lines.push('Non-pharmacological:')
    plan.non_pharmacological.forEach(v => lines.push(`- ${v}`))
  }
  const pharma = plan.pharmacological ?? plan.pharmacological_suggestions ?? []
  if (pharma.length) {
    if (lines.length) lines.push('')
    lines.push('Pharmacological (verify dose, contraindications, and interactions before prescribing):')
    pharma.forEach(d => {
      const name = d.drug ?? d.option
      const caution = d.caution ?? d.physician_dose_consideration
      lines.push(`- ${name}${d.class ? ` (${d.class})` : ''}${d.rationale ? ` — ${d.rationale}` : ''}${caution ? ` [Caution: ${caution}]` : ''}`)
    })
  }
  const lifestyle = plan.lifestyle_and_followup || []
  if (plan.follow_up || lifestyle.length) {
    if (lines.length) lines.push('')
    lines.push('Follow-up:')
    if (plan.follow_up) lines.push(plan.follow_up)
    lifestyle.forEach(v => lines.push(`- ${v}`))
  }
  if (plan.referral_needed) {
    if (lines.length) lines.push('')
    lines.push(`Referral needed${plan.referral_type ? `: ${plan.referral_type}` : ''}`)
  }
  return lines.join('\n')
}

export default function CaseReview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { key, label } = useKey()
  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [doctorNotes, setDoctorNotes] = useState('')
  const [finalCure, setFinalCure] = useState('')
  const [approve, setApprove] = useState(false)
  const [followUpDate, setFollowUpDate] = useState('')

  const [interactions, setInteractions] = useState({ loading: false, checked: false, flagged: [], drugs: [], error: null })
  const [timeline, setTimeline] = useState({ loading: false, items: [] })
  const [shareUrl, setShareUrl] = useState('')
  const [showShareModal, setShowShareModal] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!key) { setLoading(false); return }
    fetch(`/api/cases/${id}`, { headers: { 'x-api-key': key } })
      .then(r => r.json())
      .then(data => {
        setRecord(data)
        const dr = data.analysis?.doctor_review
        setDoctorNotes(dr?.doctor_notes || '')
        // Pre-fill with the AI's own draft treatment plan (not yet reviewed) so the
        // doctor edits/verifies it instead of retyping the whole plan from scratch —
        // never overwrite a plan the doctor already saved.
        setFinalCure(dr?.final_approved_cure || draftTreatmentPlanText(data.analysis))
        setApprove(dr?.approved || false)
        setFollowUpDate(data.follow_up_date || '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id, key])

  // Drug interaction check via openFDA
  useEffect(() => {
    if (!record) return
    const fromInput = record.patient_input?.current_medications || []
    const fromSnap = record.analysis?.patient_snapshot?.current_medications || []
    const all = [...(Array.isArray(fromInput) ? fromInput : []), ...(Array.isArray(fromSnap) ? fromSnap : [])]
      .map(d => String(d || '').trim())
      .filter(Boolean)
    const seen = new Set()
    const drugs = []
    for (const d of all) {
      const k = d.toLowerCase()
      if (!seen.has(k)) { seen.add(k); drugs.push(d) }
      if (drugs.length >= 6) break
    }
    if (drugs.length < 2) {
      setInteractions({ loading: false, checked: true, flagged: [], drugs, error: null })
      return
    }
    let cancelled = false
    setInteractions({ loading: true, checked: false, flagged: [], drugs, error: null })
    ;(async () => {
      const pairs = []
      for (let i = 0; i < drugs.length; i++) {
        for (let j = i + 1; j < drugs.length; j++) {
          pairs.push([drugs[i], drugs[j]])
        }
      }
      const flagged = []
      try {
        for (const [a, b] of pairs) {
          const ea = encodeURIComponent(`"${a.replace(/"/g, '')}"`)
          const eb = encodeURIComponent(`"${b.replace(/"/g, '')}"`)
          const url = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:${ea}+AND+patient.drug.medicinalproduct:${eb}&limit=1`
          try {
            const r = await fetch(url)
            if (r.ok) {
              const j = await r.json()
              const count = j?.meta?.results?.total ?? (j?.results?.length || 0)
              if (count > 0) flagged.push({ a, b, count })
            }
          } catch {}
        }
        if (!cancelled) setInteractions({ loading: false, checked: true, flagged, drugs, error: null })
      } catch (e) {
        if (!cancelled) setInteractions({ loading: false, checked: true, flagged: [], drugs, error: e.message })
      }
    })()
    return () => { cancelled = true }
  }, [record])

  // Patient timeline
  useEffect(() => {
    if (!record || !key) return
    const name = record.patient_input?.patient_name
    const mrn = record.patient_input?.mrn
    const q = mrn || name
    if (!q) return
    setTimeline({ loading: true, items: [] })
    fetch(`/api/patients/timeline?q=${encodeURIComponent(q)}`, { headers: { 'x-api-key': key } })
      .then(r => r.ok ? r.json() : [])
      .then(items => setTimeline({ loading: false, items: Array.isArray(items) ? items : [] }))
      .catch(() => setTimeline({ loading: false, items: [] }))
  }, [record, key])

  async function shareCase() {
    setSharing(true)
    try {
      const r = await fetch(`/api/cases/${id}/share`, {
        method: 'POST',
        headers: { 'x-api-key': key },
      })
      const data = await r.json()
      if (data.share_url) {
        const fullUrl = window.location.origin + data.share_url
        setShareUrl(fullUrl)
        setShowShareModal(true)
      }
    } catch {}
    setSharing(false)
  }

  function copyShareUrl() {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function saveReview() {
    setSaving(true)
    const res = await fetch(`/api/cases/${id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({
        doctor_notes: doctorNotes,
        final_approved_cure: finalCure || null,
        approved: approve,
        follow_up_date: followUpDate || null,
      }),
    })
    const data = await res.json()
    if (data.auto_assigned) {
      toast.success(`You're now the assigned doctor on this case`)
    }
    setRecord(data)
    if (data.follow_up_date) setFollowUpDate(data.follow_up_date)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <div className="spinner spinner-dark" />
    </div>
  )

  if (!record) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>Case not found.</div>
  )

  const a       = record.analysis
  const vitals  = record.patient_input?.vitals || []
  const news2   = calcNEWS2(vitals)
  const vFlags  = flagVitals(vitals)

  // The AI's JSON schema (SYSTEM_PROMPT in server/index.js) has changed field names
  // over time — read the current names but fall back to older ones so older stored
  // cases still render real content instead of blank boxes.
  const confidenceLevel   = a?.confidence?.level ?? a?.confidence_level
  const emergencyDetected = a?.red_flags?.emergency_escalation_required ?? a?.red_flags?.emergency_detected
  const diffs             = a?.differential_assessment || []
  const symptoms          = !Array.isArray(a?.structured_symptoms) ? a?.structured_symptoms : null
  const legacySymptoms    = Array.isArray(a?.structured_symptoms) ? a.structured_symptoms : []
  const missingInfo       = a?.patient_snapshot?.missing_critical_info ?? a?.data_completeness?.missing_critical_info ?? []
  const retestRequired    = a?.retest_required || []
  const investigationsRaw = a?.recommended_investigations
  const investigations    = Array.isArray(investigationsRaw)
    ? { urgent: [], routine: investigationsRaw, rationale: '' }
    : (investigationsRaw || { urgent: [], routine: [], rationale: '' })
  const pharmacological   = a?.draft_treatment_plan?.pharmacological ?? a?.draft_treatment_plan?.pharmacological_suggestions ?? []
  const lifestyleList     = a?.draft_treatment_plan?.lifestyle_and_followup || []
  const allergyConflicts  = a?.allergy_interaction_check?.conflicts ?? a?.allergy_interaction_check?.potential_conflicts ?? []
  const interactionRisks  = a?.allergy_interaction_check?.interaction_risks || []
  const summaryDraftText  = a?.patient_plain_language_summary || a?.patient_summary_draft?.text || ''

  const icdSuggestions = suggestICD10(diffs.map(d => d.condition ?? d.possibility))
  const hasPatientId = !!(record.patient_input?.patient_name || record.patient_input?.mrn)

  return (
    <div>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/cases')}>
            <ChevronLeft size={14} /> Cases
          </button>
          <span className="topbar-title">
            Case Review
            <span className="font-mono" style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>{id.slice(0, 8)}</span>
          </span>
        </div>
        <div className="topbar-right">
          <button className="btn btn-secondary btn-sm" onClick={() => window.open(`/api/cases/${id}/print?key=${key}`, '_blank')}>
            <Printer size={13} /> Print
          </button>
          {a?.doctor_review?.approved && (
            <button className="btn btn-secondary btn-sm" onClick={shareCase} disabled={sharing}>
              <Share2 size={13} /> {sharing ? 'Sharing…' : 'Share'}
            </button>
          )}
          {emergencyDetected && <span className="badge badge-danger" style={{ display:'inline-flex',alignItems:'center',gap:4 }}><ShieldAlert size={11} /> Emergency</span>}
          {a?.requires_urgent_review && !emergencyDetected && <span className="badge badge-danger">Urgent Review</span>}
          {a?.doctor_review?.approved && <span className="badge badge-success" style={{ display:'inline-flex',alignItems:'center',gap:4 }}><CheckCircle size={11} /> Approved</span>}
          {!a?.doctor_review?.approved && !a?.requires_urgent_review && !emergencyDetected && (
            <span className="badge badge-warning">Pending Review</span>
          )}
        </div>
      </div>

      <div className="review-layout">
        {/* ── left: analysis ── */}
        <div>
          {/* emergency banner */}
          {emergencyDetected && (
            <div className="emergency-banner">
              <ShieldAlert size={20} />
              <div>
                <h3>EMERGENCY DETECTED — Immediate Action Required</h3>
                <p>{a.red_flags.escalation_reason || a.red_flags.recommended_immediate_action || 'Direct patient to emergency services immediately.'}</p>
                {(a.red_flags.items || a.red_flags.indicators || []).length > 0 && (
                  <div className="pill-row mt-2">
                    {(a.red_flags.items || a.red_flags.indicators).map((ind, i) => (
                      <span key={i} style={{ background: 'rgba(255,255,255,.2)', color: '#fff', padding: '2px 8px', borderRadius: 5, fontSize: 12 }}>{ind}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* red flags noted, but not a full emergency escalation */}
          {!emergencyDetected && a?.red_flags?.present && a.red_flags.items?.length > 0 && (
            <div style={{ padding: '10px 14px', background: 'var(--warning-light)', border: '1px solid var(--warning)', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--warning)', fontSize: 13, marginBottom: 8 }}>
                <TriangleAlert size={14} /> Red Flags Noted
              </div>
              <div className="pill-row">
                {a.red_flags.items.map((it, i) => <span key={i} className="pill" style={{ color: 'var(--warning)', borderColor: 'var(--warning)' }}>{it}</span>)}
              </div>
            </div>
          )}

          {/* status note — data quality / staleness callout from the AI's confidence assessment */}
          {(a?.status_note || a?.confidence?.data_quality_notes) && (
            <div style={{ padding: '10px 14px', background: 'var(--warning-light)', borderRadius: 8, fontSize: 12.5, color: 'var(--warning)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} />
              {a?.status_note || a.confidence.data_quality_notes}
            </div>
          )}

          {/* NEWS2 score + vital flags */}
          {news2 && (
            <div className="card mb-4">
              <div className="card-header">
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Activity size={15} /> NEWS2 Early Warning Score
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    padding: '4px 14px', borderRadius: 99, fontWeight: 700, fontSize: 13,
                    background: news2.bg, color: news2.color,
                    display: 'flex', alignItems: 'center', gap: 6
                  }}>
                    <span style={{ fontSize: 20, fontWeight: 800 }}>{news2.total}</span>
                    <span>{news2.risk}</span>
                  </div>
                </div>
              </div>
              <div className="card-body">
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 12 }}>
                  <strong style={{ color: news2.color }}>{news2.description}</strong>
                  <span style={{ marginLeft: 8, color: 'var(--text3)' }}>— calculated from {news2.available} imported vital{news2.available !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {vitals.map((v, i) => {
                    const scoreKey = { 'Respiratory rate': 'rr', 'Oxygen saturation': 'spo2', 'Body temperature': 'temp', 'Heart rate': 'hr', 'Blood pressure': 'sbp' }[v.name]
                    const s = scoreKey !== undefined ? news2.scores[scoreKey] : undefined
                    return (
                      <div key={i} style={{
                        padding: '8px 12px', borderRadius: 8,
                        background: s > 0 ? 'var(--warning-light)' : 'var(--success-light)',
                        border: `1.5px solid ${s > 0 ? 'var(--warning)' : 'var(--success-light)'}`,
                        minWidth: 110,
                      }}>
                        <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600, marginBottom: 2 }}>{v.name}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{v.value} <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>{v.unit}</span></div>
                        {s !== undefined && <div style={{ fontSize: 10.5, marginTop: 3, color: s > 0 ? 'var(--warning)' : '#059669', fontWeight: 600 }}>+{s} pts</div>}
                      </div>
                    )
                  })}
                </div>

                {/* vital flags */}
                {vFlags.length > 0 && (
                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Abnormal Values</div>
                    {vFlags.map((f, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 8,
                        background: f.severity === 'critical' ? '#fee2e2' : 'var(--warning-light)',
                        border: `1px solid ${f.severity === 'critical' ? 'var(--danger-light)' : 'var(--warning)'}`,
                      }}>
                        <TriangleAlert size={14} color={f.severity === 'critical' ? '#dc2626' : '#d97706'} />
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{f.vital}</span>
                          <span style={{ fontSize: 12, color: 'var(--text2)', marginLeft: 8 }}>{f.value}</span>
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                          background: f.severity === 'critical' ? '#dc2626' : '#d97706', color: '#fff'
                        }}>{f.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* patient snapshot */}
          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserRound size={15} /> Patient Snapshot
              </span>
              <ConfBadge val={confidenceLevel} score={a?.confidence?.score} />
            </div>
            <div className="card-body">
              <div className="info-grid mb-4">
                <dl className="info-item"><dt>Age</dt><dd>{a?.patient_snapshot?.age ?? '—'}</dd></dl>
                <dl className="info-item"><dt>Sex</dt><dd>{a?.patient_snapshot?.sex ?? '—'}</dd></dl>
              </div>
              {(a?.patient_snapshot?.allergies ?? a?.patient_snapshot?.known_allergies ?? []).length > 0 && (
                <div className="mb-4">
                  <dt style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 500, marginBottom: 5 }}>Known Allergies</dt>
                  <div className="pill-row">{(a.patient_snapshot.allergies ?? a.patient_snapshot.known_allergies).map((v, i) => <span key={i} className="pill" style={{ color: 'var(--danger)', borderColor: '#fca5a5' }}>{v}</span>)}</div>
                </div>
              )}
              {a?.patient_snapshot?.current_medications?.length > 0 && (
                <div className="mb-4">
                  <dt style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 500, marginBottom: 5 }}>Current Medications</dt>
                  <div className="pill-row">{a.patient_snapshot.current_medications.map((v, i) => <span key={i} className="pill">{v}</span>)}</div>
                </div>
              )}
              {(a?.patient_snapshot?.known_conditions ?? a?.patient_snapshot?.relevant_history ?? []).length > 0 && (
                <div className="mb-4">
                  <dt style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 500, marginBottom: 5 }}>Known Conditions / Relevant History</dt>
                  <div className="pill-row">{(a.patient_snapshot.known_conditions ?? a.patient_snapshot.relevant_history).map((v, i) => <span key={i} className="pill">{v}</span>)}</div>
                </div>
              )}
              {a?.patient_snapshot?.special_population_flags?.length > 0 && (
                <div>
                  <dt style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 500, marginBottom: 5 }}>Special Population Flags</dt>
                  <div className="pill-row">{a.patient_snapshot.special_population_flags.map((v, i) => <span key={i} className="pill" style={{ color: 'var(--warning)', borderColor: 'var(--warning)' }}>{v}</span>)}</div>
                </div>
              )}
            </div>
          </div>

          {/* patient history timeline */}
          {hasPatientId && (
            <div className="card mb-4">
              <div className="card-header">
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <History size={15} /> Patient History
                </span>
                {timeline.items.length > 0 && (
                  <span className="badge badge-info">{timeline.items.length} visit{timeline.items.length !== 1 ? 's' : ''}</span>
                )}
              </div>
              <div className="card-body">
                {timeline.loading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', fontSize: 13 }}>
                    <div className="spinner spinner-dark" /> Loading prior visits…
                  </div>
                ) : timeline.items.length <= 1 ? (
                  <div style={{ color: 'var(--text2)', fontSize: 13 }}>No prior visits on record.</div>
                ) : (
                  <div style={{ position: 'relative', paddingLeft: 18, borderLeft: '2px solid #e2e8f0', marginLeft: 6 }}>
                    {timeline.items.map((t, i) => {
                      const isCurrent = t.case_id === id
                      return (
                        <div key={t.case_id} style={{ position: 'relative', paddingBottom: i < timeline.items.length - 1 ? 16 : 0 }}>
                          <div style={{
                            position: 'absolute', left: -25, top: 4, width: 12, height: 12, borderRadius: 99,
                            background: isCurrent ? '#0284c7' : '#cbd5e1',
                            border: '2px solid #fff', boxShadow: '0 0 0 1px ' + (isCurrent ? '#0284c7' : '#cbd5e1'),
                          }} />
                          <div style={{
                            cursor: isCurrent ? 'default' : 'pointer',
                            padding: '8px 12px', borderRadius: 7,
                            background: isCurrent ? '#f0f9ff' : 'var(--surface2)',
                            border: isCurrent ? '1px solid var(--primary-light)' : '1px solid transparent',
                          }} onClick={() => { if (!isCurrent) navigate(`/cases/${t.case_id}`) }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(t.created_at).toLocaleDateString()}</span>
                              {isCurrent && <span className="badge badge-info" style={{ fontSize: 10 }}>Current</span>}
                              {t.confidence_level && <ConfBadge val={t.confidence_level} />}
                              {t.emergency_detected ? (
                                <span className="badge badge-danger" style={{ fontSize: 10 }}>Emergency</span>
                              ) : t.approved ? (
                                <span className="badge badge-success" style={{ fontSize: 10 }}>Approved</span>
                              ) : (
                                <span className="badge badge-warning" style={{ fontSize: 10 }}>Pending</span>
                              )}
                            </div>
                            <div style={{ fontSize: 13, color: '#0f172a' }}>
                              {(t.presenting_complaint || '—').slice(0, 120)}{t.presenting_complaint && t.presenting_complaint.length > 120 ? '…' : ''}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* presenting complaint + symptoms */}
          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Stethoscope size={15} /> Presenting Complaint & Symptoms
              </span>
            </div>
            <div className="card-body">
              <p style={{ fontWeight: 500, marginBottom: 14 }}>{a?.presenting_complaint || '—'}</p>

              {legacySymptoms.length > 0 && (
                <>
                  <div className="symptom-row" style={{ fontWeight: 600, color: 'var(--text3)', fontSize: 11, paddingTop: 0 }}>
                    <div>Symptom</div><div>Onset / Duration</div><div>Severity</div><div>Location</div>
                  </div>
                  {legacySymptoms.map((s, i) => (
                    <div key={i} className="symptom-row">
                      <div style={{ fontWeight: 500 }}>{s.symptom}</div>
                      <div style={{ color: 'var(--text2)' }}>{[s.onset, s.duration].filter(Boolean).join(' · ') || '—'}</div>
                      <div style={{ color: 'var(--text2)' }}>{s.severity || '—'}</div>
                      <div style={{ color: 'var(--text2)' }}>{s.location || '—'}</div>
                    </div>
                  ))}
                </>
              )}

              {symptoms && (symptoms.primary || symptoms.onset || symptoms.duration || symptoms.severity) && (
                <div className="info-grid mb-4">
                  <dl className="info-item"><dt>Primary Symptom</dt><dd>{symptoms.primary || '—'}</dd></dl>
                  <dl className="info-item"><dt>Onset</dt><dd>{symptoms.onset || '—'}</dd></dl>
                  <dl className="info-item"><dt>Duration</dt><dd>{symptoms.duration || '—'}</dd></dl>
                  <dl className="info-item"><dt>Severity</dt><dd>{symptoms.severity || '—'}</dd></dl>
                  {symptoms.character && <dl className="info-item"><dt>Character</dt><dd>{symptoms.character}</dd></dl>}
                </div>
              )}
              {symptoms?.associated?.length > 0 && (
                <div className="mb-4">
                  <dt style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 500, marginBottom: 5 }}>Associated Symptoms</dt>
                  <div className="pill-row">{symptoms.associated.map((v, i) => <span key={i} className="pill">{v}</span>)}</div>
                </div>
              )}
              {symptoms?.aggravating_factors?.length > 0 && (
                <div className="mb-4">
                  <dt style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 500, marginBottom: 5 }}>Aggravating Factors</dt>
                  <div className="pill-row">{symptoms.aggravating_factors.map((v, i) => <span key={i} className="pill" style={{ color: 'var(--warning)', borderColor: 'var(--warning)' }}>{v}</span>)}</div>
                </div>
              )}
              {symptoms?.relieving_factors?.length > 0 && (
                <div>
                  <dt style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 500, marginBottom: 5 }}>Relieving Factors</dt>
                  <div className="pill-row">{symptoms.relieving_factors.map((v, i) => <span key={i} className="pill" style={{ color: 'var(--success)', borderColor: 'var(--success-light)' }}>{v}</span>)}</div>
                </div>
              )}
            </div>
          </div>

          {/* missing info */}
          {missingInfo.length > 0 && (
            <div className="card mb-4">
              <div className="card-header">
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--warning)' }}>
                  <AlertTriangle size={15} /> Missing Critical Information
                </span>
              </div>
              <div className="card-body">
                {missingInfo.map((m, i) => (
                  <div key={i} className="missing-item"><AlertTriangle size={12} />{m}</div>
                ))}
                {a?.data_completeness?.notes && <p style={{ marginTop: 10, fontSize: 12.5, color: 'var(--text2)' }}>{a.data_completeness.notes}</p>}
              </div>
            </div>
          )}

          {/* repeat testing required — stale/outdated/undated findings the AI flagged */}
          {retestRequired.length > 0 && (
            <div className="card mb-4">
              <div className="card-header">
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--warning)' }}>
                  <FlaskConical size={15} /> Repeat Testing Required (Stale Data)
                </span>
              </div>
              <div className="card-body">
                {retestRequired.map((t, i) => (
                  <div key={i} style={{
                    padding: '8px 12px', borderRadius: 7, marginBottom: 7,
                    background: t.priority === 'urgent' ? '#fee2e2' : 'var(--warning-light)',
                    border: `1px solid ${t.priority === 'urgent' ? 'var(--danger-light)' : 'var(--warning)'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 13, color: '#0f172a' }}>{t.test}</strong>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: t.priority === 'urgent' ? '#dc2626' : '#d97706', color: '#fff' }}>{t.priority || 'routine'}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>
                      {t.reason_stale}
                      {t.last_value ? ` · last value: ${t.last_value}` : ''}
                      {t.last_date ? ` (${t.last_date})` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* differential */}
          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title">Differential Assessment</span>
            </div>
            <div className="card-body">
              {diffs.map((d, i) => {
                const condition  = d.condition ?? d.possibility
                const supporting = d.supporting_evidence ?? d.supporting_findings ?? []
                const against    = d.against_evidence ?? d.findings_against ?? []
                return (
                  <div key={i} className="diff-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h4 style={{ margin: 0 }}>{condition}</h4>
                      <LikelihoodBadge val={d.likelihood} />
                      {d.based_on_stale_data && <span className="badge badge-warning" style={{ fontSize: 10 }}>Based on stale data</span>}
                    </div>
                    <div className="findings">
                      {supporting.map((f, j) => <span key={j} className="finding-tag finding-for">+ {f}</span>)}
                      {against.map((f, j) => <span key={j} className="finding-tag finding-against">− {f}</span>)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ICD-10 suggestions */}
          {icdSuggestions.length > 0 && (
            <div className="card mb-4">
              <div className="card-header">
                <span className="card-title">ICD-10 Code Suggestions</span>
              </div>
              <div className="card-body">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {icdSuggestions.map((s, i) => (
                    <div key={i} style={{
                      background: 'var(--success-light)', border: '1px solid var(--success-light)',
                      padding: '6px 10px', borderRadius: 7, fontSize: 12.5,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ color: '#059669', fontWeight: 700, fontFamily: 'monospace' }}>[{s.code}]</span>
                      <span style={{ color: '#0f172a' }}>{s.description}</span>
                      <span style={{ color: '#94a3b8', fontSize: 11 }}>· {s.differential}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
                  Suggested codes — verify against current ICD-10-CM before billing.
                </div>
              </div>
            </div>
          )}

          {/* Drug Interactions */}
          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Pill size={15} /> Drug Interactions
              </span>
              {interactions.drugs.length > 0 && (
                <span className="badge badge-info">{interactions.drugs.length} drugs</span>
              )}
            </div>
            <div className="card-body">
              {interactions.drugs.length < 2 ? (
                <div style={{ color: 'var(--text2)', fontSize: 13 }}>Add at least 2 medications to check interactions.</div>
              ) : interactions.loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', fontSize: 13 }}>
                  <div className="spinner spinner-dark" /> Checking openFDA for reported interactions…
                </div>
              ) : interactions.error ? (
                <div style={{ color: 'var(--warning)', fontSize: 13 }}>Could not reach openFDA: {interactions.error}</div>
              ) : interactions.flagged.length === 0 ? (
                <div style={{ color: 'var(--success)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <CheckCircle size={15} /> No interactions found between listed medications.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {interactions.flagged.map((f, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', borderRadius: 7,
                      background: 'var(--warning-light)', border: '1px solid var(--warning)',
                      fontSize: 13, color: 'var(--warning)',
                    }}>
                      <AlertTriangle size={14} color="#d97706" />
                      <span><strong>{f.a}</strong> &harr; <strong>{f.b}</strong></span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--warning)' }}>potential interaction reported</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>
                    Based on openFDA adverse event reports. Verify with a pharmacology reference before clinical action.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* investigations */}
          {(investigations.urgent.length > 0 || investigations.routine.length > 0) && (
            <div className="card mb-4">
              <div className="card-header">
                <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FlaskConical size={15} /> Recommended Investigations
                </span>
              </div>
              <div className="card-body">
                {investigations.urgent.length > 0 && (
                  <div className="mb-4">
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Urgent</div>
                    <ul className="list-bullets">{investigations.urgent.map((inv, i) => <li key={i}>{inv}</li>)}</ul>
                  </div>
                )}
                {investigations.routine.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Routine</div>
                    <ul className="list-bullets">{investigations.routine.map((inv, i) => <li key={i}>{inv}</li>)}</ul>
                  </div>
                )}
                {investigations.rationale && <p style={{ marginTop: 10, fontSize: 12.5, color: 'var(--text2)' }}>{investigations.rationale}</p>}
              </div>
            </div>
          )}

          {/* treatment plan */}
          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Pill size={15} /> Draft Treatment Plan
              </span>
            </div>
            <div className="card-body">
              {a?.draft_treatment_plan?.non_pharmacological?.length > 0 && (
                <div className="analysis-section">
                  <h3>Non-Pharmacological</h3>
                  <ul className="list-bullets">
                    {a.draft_treatment_plan.non_pharmacological.map((v, i) => <li key={i}>{v}</li>)}
                  </ul>
                </div>
              )}
              {pharmacological.length > 0 && (
                <div className="analysis-section">
                  <h3>Pharmacological Suggestions (physician verification required)</h3>
                  {pharmacological.map((d, i) => {
                    const drugName = d.drug ?? d.option
                    const contraindications = d.contraindications_to_check ?? d.cautions ?? []
                    return (
                      <div key={i} className="drug-card">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <h4>{drugName}{d.class && <span style={{ fontWeight: 400, color: 'var(--text2)', fontSize: 12, marginLeft: 6 }}>({d.class})</span>}</h4>
                          <span className="badge badge-warning" style={{ fontSize: 11 }}>Rx Verification Required</span>
                        </div>
                        <div className="drug-meta">{d.rationale}</div>
                        {(d.caution || d.physician_dose_consideration) && (
                          <div style={{ marginTop: 7, fontSize: 12.5, color: 'var(--text2)', background: 'var(--surface2)', padding: '6px 10px', borderRadius: 6 }}>
                            <strong>Caution:</strong> {d.caution || d.physician_dose_consideration}
                          </div>
                        )}
                        {contraindications.length > 0 && (
                          <div style={{ marginTop: 7 }}>
                            <div style={{ fontSize: 11.5, color: 'var(--text3)', fontWeight: 600, marginBottom: 3 }}>CONTRAINDICATIONS TO CHECK</div>
                            <div className="pill-row">
                              {contraindications.map((c, j) => <span key={j} className="pill" style={{ color: 'var(--warning)', borderColor: 'var(--warning)', fontSize: 11.5 }}>{c}</span>)}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {(a?.draft_treatment_plan?.follow_up || lifestyleList.length > 0 || a?.draft_treatment_plan?.referral_needed) && (
                <div className="analysis-section">
                  <h3>Follow-up & Referral</h3>
                  {a?.draft_treatment_plan?.follow_up && (
                    <p style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: lifestyleList.length ? 8 : 0 }}>{a.draft_treatment_plan.follow_up}</p>
                  )}
                  {lifestyleList.length > 0 && (
                    <ul className="list-bullets">
                      {lifestyleList.map((v, i) => <li key={i}>{v}</li>)}
                    </ul>
                  )}
                  {a?.draft_treatment_plan?.referral_needed && (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="badge badge-warning" style={{ fontSize: 11 }}>Referral Needed</span>
                      {a.draft_treatment_plan.referral_type && <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{a.draft_treatment_plan.referral_type}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* allergy interaction check */}
          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title">Allergy & Interaction Check</span>
            </div>
            <div className="card-body">
              {allergyConflicts.length > 0 ? (
                <div>
                  {allergyConflicts.map((c, i) => (
                    <div key={i} style={{ padding: '8px 12px', background: 'var(--danger-light)', borderRadius: 7, marginBottom: 7, fontSize: 13, color: 'var(--danger)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{c}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--success)', fontSize: 13, display: 'flex', gap: 7, alignItems: 'center' }}>
                  <CheckCircle size={15} /> No immediate conflicts detected based on patient-reported data.
                </div>
              )}
              {interactionRisks.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text3)', marginBottom: 5 }}>INTERACTION RISKS</div>
                  {interactionRisks.map((r, i) => (
                    <div key={i} style={{ padding: '8px 12px', background: 'var(--warning-light)', border: '1px solid var(--warning)', borderRadius: 7, marginBottom: 6, fontSize: 13, color: 'var(--warning)' }}>{r}</div>
                  ))}
                </div>
              )}
              {a?.allergy_interaction_check?.notes && (
                <p style={{ marginTop: 10, fontSize: 12.5, color: 'var(--text2)' }}>{a.allergy_interaction_check.notes}</p>
              )}
            </div>
          </div>

          {/* doctor reasoning */}
          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title">AI Reasoning for Doctor</span>
            </div>
            <div className="card-body">
              <p style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.7 }}>{a?.reasoning_for_doctor || a?.confidence?.reasoning || '—'}</p>
            </div>
          </div>

          {/* patient summary draft */}
          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={15} /> Patient Summary Draft
              </span>
              <span className="badge badge-warning" style={{ fontSize: 11 }}>Draft — not yet approved</span>
            </div>
            <div className="card-body">
              {summaryDraftText && (
                <div style={{ marginBottom: 10 }}>
                  <SummaryActions
                    compact
                    title="Patient Summary Draft"
                    filename="patient-summary-draft.txt"
                    text={summaryDraftText}
                  />
                </div>
              )}
              <p style={{ fontSize: 13.5, lineHeight: 1.8, color: 'var(--text)', background: 'var(--surface2)', padding: '14px 16px', borderRadius: 8 }}>
                {summaryDraftText || '—'}
              </p>
            </div>
          </div>

          {/* disclaimers */}
          <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.7 }}>
            {(a?.disclaimers?.length ? a.disclaimers : DEFAULT_DISCLAIMERS).map((d, i) => <div key={i} style={{ display:'flex',alignItems:'flex-start',gap:6 }}><AlertTriangle size={12} style={{ flexShrink:0,marginTop:2,color:'var(--warning)' }} />{d}</div>)}
          </div>
        </div>

        {/* ── right: doctor review panel ── */}
        <div className="review-sidebar">
          <div className="card" style={{ position: 'sticky', top: 80 }}>
            <div className="card-header">
              <span className="card-title">Physician Review</span>
              {a?.doctor_review?.approved
                ? <span className="badge badge-success">Approved</span>
                : <span className="badge badge-warning">Pending</span>
              }
            </div>
            <div className="card-body">
              {record?.assigned_to_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
                  <UserRound size={13} /> Assigned to <strong style={{ color: 'var(--text2)' }}>{record.assigned_to_name}</strong>
                </div>
              )}
              {a?.doctor_review?.approved && (
                <div className="approved-overlay mb-4" style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, color: 'var(--success)', fontSize: 13, display:'flex',alignItems:'center',gap:6 }}><CheckCircle size={14} /> Approved by {a.doctor_review.reviewed_by}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>{a.doctor_review.reviewed_at ? new Date(a.doctor_review.reviewed_at).toLocaleString() : ''}</div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Reviewed by</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 8, fontSize: 13, fontWeight: 500, color: 'var(--text2)' }}>
                  <UserRound size={13} /> {label} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(recorded automatically as you)</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Doctor Notes</label>
                <textarea className="form-textarea" rows={5} placeholder="Add clinical notes, corrections, or comments…"
                  value={doctorNotes} onChange={e => setDoctorNotes(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Final Approved Cure (edited plan)</label>
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 5 }}>
                  Pre-filled from the AI's draft plan — review and edit before approving; this is what's communicated to the patient.
                </div>
                <textarea className="form-textarea" rows={6}
                  placeholder="Write the approved treatment plan here. This is what will be communicated to the patient after approval."
                  value={finalCure} onChange={e => setFinalCure(e.target.value)} />
              </div>

              {/* Follow-up scheduling comes after the final cure is drafted, since the
                  follow-up date should reflect the approved plan, not precede it. */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CalendarClock size={13} /> Follow-up Date
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={followUpDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={e => setFollowUpDate(e.target.value)}
                />
                {followUpDate && (
                  <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text3)' }}>
                    Follow-up in {Math.ceil((new Date(followUpDate) - new Date()) / 86400000)} day(s)
                  </div>
                )}
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: approve ? 'var(--success-light)' : 'var(--surface2)', borderRadius: 8, cursor: 'pointer' }}
                onClick={() => setApprove(v => !v)}>
                <div style={{
                  width: 20, height: 20, borderRadius: 5, border: `2px solid ${approve ? 'var(--success)' : 'var(--border)'}`,
                  background: approve ? 'var(--success)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  {approve && <Check size={13} color="#fff" strokeWidth={3} />}
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: approve ? 'var(--success)' : 'var(--text)' }}>
                  Approve this analysis
                </span>
              </div>

              <button className="btn btn-primary w-full mt-4" onClick={saveReview} disabled={saving}>
                {saving ? <><div className="spinner" /> Saving…</> : saved ? <><CheckCircle size={15} /> Saved!</> : <><Save size={14} /> Save Review</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showShareModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowShareModal(false)}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 24, maxWidth: 480, width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,.3)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Share2 size={16} /> Shareable Case Link
              </h3>
              <button onClick={() => setShowShareModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
              Anyone with this link can view the approved case summary (no PHI such as patient name is included).
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                readOnly
                value={shareUrl}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: 7, border: '1px solid var(--border)',
                  fontSize: 12.5, fontFamily: 'monospace', background: 'var(--surface2)',
                }}
                onFocus={e => e.target.select()}
              />
              <button className="btn btn-primary btn-sm" onClick={copyShareUrl}>
                <Copy size={13} /> {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ConfBadge({ val, score }) {
  if (!val) return null
  const map = { high: 'badge-success', moderate: 'badge-warning', low: 'badge-danger' }
  return (
    <span className={`badge ${map[val] || 'badge-neutral'}`}>
      Confidence: {val}{typeof score === 'number' ? ` (${Math.round(score * 100)}%)` : ''}
    </span>
  )
}

function LikelihoodBadge({ val }) {
  if (!val) return null
  const map = { high: 'badge-danger', moderate: 'badge-warning', low: 'badge-neutral' }
  return <span className={`badge ${map[val] || 'badge-neutral'}`} style={{ fontSize: 11 }}>{val}</span>
}
