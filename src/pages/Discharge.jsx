import React, { useState, useEffect, useCallback } from 'react'
import {
  FileText, Plus, ChevronDown, ChevronUp, Loader2, Copy, Check,
  AlertTriangle, CheckCircle2, Clock, Send, Users, Activity,
  Pill, CalendarDays, Globe, Cpu, Shield, X, RefreshCw
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import toast from 'react-hot-toast'

/* ── tiny helpers ── */
const fmtDate = str => {
  if (!str) return '—'
  try { return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return str }
}

const riskColors = {
  high:   { bg: '#fee2e2', color: '#b91c1c', dot: '#ef4444' },
  medium: { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b' },
  low:    { bg: '#d1fae5', color: '#047857', dot: '#10b981' },
}

function RiskBadge({ level }) {
  const c = riskColors[(level || '').toLowerCase()] || { bg: '#f3f4f6', color: '#6b7280', dot: '#9ca3af' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: c.color, background: c.bg, textTransform: 'capitalize' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot }} />
      {level || 'Unknown'} Risk
    </span>
  )
}

function StatusBadge({ label, color = '#6b7280', bg = '#f3f4f6', icon: Icon }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600, color, background: bg }}>
      {Icon && <Icon size={11} />}{label}
    </span>
  )
}

function Section({ icon: Icon, title, children, accent = '#0f766e' }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, paddingBottom: 7, borderBottom: '1px solid #f3f4f6' }}>
        <Icon size={14} color={accent} />
        <span style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '.06em' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function BulletList({ text, color = '#374151' }) {
  if (!text) return <p style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>None recorded</p>
  const lines = text.split(/\n|(?=•)/).map(s => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean)
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {lines.map((l, i) => <li key={i} style={{ fontSize: 13, color, marginBottom: 4, lineHeight: 1.5 }}>{l}</li>)}
    </ul>
  )
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 12, color: '#374151', cursor: 'pointer' }}>
      {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

/* ── DischargeCard ── */
function DischargeCard({ rec, apiKey, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [transmitProvider, setTransmitProvider] = useState('')
  const [transmitting, setTransmitting] = useState(false)
  const [acknowledging, setAcknowledging] = useState(false)

  const txStatus = rec.transmission_status
  const isTransmitted = txStatus === 'transmitted' || txStatus === 'acknowledged'
  const isAcknowledged = txStatus === 'acknowledged'

  async function handleTransmit() {
    if (!transmitProvider.trim()) { toast.error('Enter receiving provider name'); return }
    setTransmitting(true)
    try {
      const res = await fetch(`/api/discharge/${rec.id}/transmit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ receiving_provider: transmitProvider }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Transmitted to receiving provider')
      onRefresh()
    } catch (e) { toast.error(e.message) } finally { setTransmitting(false) }
  }

  async function handleAcknowledge() {
    setAcknowledging(true)
    try {
      const res = await fetch(`/api/discharge/${rec.id}/acknowledge`, {
        method: 'POST',
        headers: { 'x-api-key': apiKey },
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Acknowledged by receiving provider')
      onRefresh()
    } catch (e) { toast.error(e.message) } finally { setAcknowledging(false) }
  }

  let fhirObj = null
  try { fhirObj = rec.fhir_bundle ? JSON.stringify(JSON.parse(rec.fhir_bundle), null, 2) : null } catch { fhirObj = rec.fhir_bundle }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
      {/* header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', cursor: 'pointer', userSelect: 'none' }} onClick={() => setOpen(o => !o)}>
        <FileText size={16} color="#0f766e" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {rec.patient_name || `Patient #${rec.patient_id}`}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>
            Generated {fmtDate(rec.created_at)}{rec.language && rec.language !== 'en' ? ` · ${rec.language.toUpperCase()} instructions` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <RiskBadge level={rec.risk_level} />
          {rec.tcm_enrolled ? (
            <StatusBadge label="TCM Active" color="#0369a1" bg="#e0f2fe" icon={Shield} />
          ) : null}
          {isAcknowledged ? (
            <StatusBadge label="Acknowledged" color="#047857" bg="#d1fae5" icon={CheckCircle2} />
          ) : isTransmitted ? (
            <StatusBadge label="Transmitted" color="#6d28d9" bg="#ede9fe" icon={Send} />
          ) : (
            <StatusBadge label="Pending TX" color="#b45309" bg="#fef3c7" icon={Clock} />
          )}
          {rec.finalized ? <StatusBadge label="Finalized" color="#374151" bg="#f3f4f6" icon={Check} /> : null}
        </div>
        {open ? <ChevronUp size={16} color="#9ca3af" style={{ flexShrink: 0 }} /> : <ChevronDown size={16} color="#9ca3af" style={{ flexShrink: 0 }} />}
      </div>

      {open && (
        <div style={{ padding: '0 18px 20px', borderTop: '1px solid #f3f4f6' }}>
          <div style={{ paddingTop: 18 }}>

            {/* Clinical Summary */}
            <Section icon={Activity} title="Clinical Summary">
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>{rec.summary || 'No summary available.'}</p>
            </Section>

            {/* Medications */}
            <Section icon={Pill} title="Medications at Discharge">
              <BulletList text={rec.medications_at_discharge} />
              {rec.medications_reconciliation && (
                <div style={{ marginTop: 10, padding: '10px 12px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8 }}>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    <AlertTriangle size={13} color="#d97706" style={{ marginTop: 1, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 3 }}>RECONCILIATION NOTE</div>
                      <p style={{ margin: 0, fontSize: 12, color: '#78350f', lineHeight: 1.6 }}>{rec.medications_reconciliation}</p>
                    </div>
                  </div>
                </div>
              )}
            </Section>

            {/* Follow-up */}
            <Section icon={CalendarDays} title="Follow-up Plan">
              <BulletList text={rec.follow_up_plan} />
              {rec.followup_appointment_id && (
                <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 12, color: '#15803d' }}>
                  <CheckCircle2 size={12} /> Follow-up appointment auto-scheduled (ID #{rec.followup_appointment_id})
                </div>
              )}
            </Section>

            {/* Patient Instructions — English */}
            <Section icon={FileText} title="Patient Instructions (English)">
              <BulletList text={rec.patient_instructions} color="#1f2937" />
            </Section>

            {/* Patient Instructions — preferred language */}
            {rec.patient_instructions_lang && rec.language && rec.language !== 'en' && (
              <Section icon={Globe} title={`Patient Instructions (${rec.language.toUpperCase()})`} accent="#7c3aed">
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-line' }}>{rec.patient_instructions_lang}</p>
              </Section>
            )}

            {/* TCM */}
            {rec.tcm_enrolled ? (
              <Section icon={Shield} title="Transitional Care Management (TCM)" accent="#0369a1">
                <div style={{ padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 4 }}>TCM Enrollment Active</div>
                  <p style={{ margin: 0, fontSize: 13, color: '#1e40af', lineHeight: 1.6 }}>{rec.tcm_reason || 'Patient enrolled in Transitional Care Management program based on risk stratification.'}</p>
                </div>
              </Section>
            ) : null}

            {/* Transmission */}
            <Section icon={Send} title="Provider Transmission" accent="#7c3aed">
              {isAcknowledged ? (
                <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <CheckCircle2 size={14} color="#15803d" />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>Receipt Acknowledged</div>
                      <div style={{ fontSize: 12, color: '#166534' }}>Provider: {rec.receiving_provider}</div>
                    </div>
                  </div>
                </div>
              ) : isTransmitted ? (
                <div>
                  <div style={{ padding: '10px 14px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#6d28d9', marginBottom: 2 }}>Transmitted</div>
                    <div style={{ fontSize: 12, color: '#7c3aed' }}>Receiving provider: {rec.receiving_provider}</div>
                  </div>
                  <button onClick={handleAcknowledge} disabled={acknowledging}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#10b981', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    {acknowledging ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={13} />}
                    Mark as Acknowledged
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Receiving Provider / Facility</label>
                    <input value={transmitProvider} onChange={e => setTransmitProvider(e.target.value)} placeholder="Dr. Smith / General Hospital"
                      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <button onClick={handleTransmit} disabled={transmitting}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, background: '#7c3aed', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {transmitting ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
                    Transmit
                  </button>
                </div>
              )}
            </Section>

            {/* FHIR Bundle */}
            {fhirObj && (
              <Section icon={Cpu} title="FHIR Bundle (R4 Composition)" accent="#374151">
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}><CopyBtn text={fhirObj} /></div>
                  <pre style={{ margin: 0, padding: '12px 14px', background: '#0f172a', color: '#e2e8f0', borderRadius: 8, fontSize: 11, lineHeight: 1.6, overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
                    {fhirObj}
                  </pre>
                </div>
              </Section>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── GenerateModal ── */
function GenerateModal({ apiKey, onClose, onDone }) {
  const [patients, setPatients] = useState([])
  const [cases, setCases] = useState([])
  const [patientId, setPatientId] = useState('')
  const [caseId, setCaseId] = useState('')
  const [language, setLanguage] = useState('en')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/gen-patients', { headers: { 'x-api-key': apiKey } })
      .then(r => r.json()).then(d => setPatients(d.patients || [])).catch(() => {})
  }, [apiKey])

  useEffect(() => {
    if (!patientId) { setCases([]); setCaseId(''); return }
    fetch(`/api/cases/by-patient/${patientId}`, { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : []
        setCases(list)
        setCaseId(list[0]?.id || '')
        const lang = patients.find(p => String(p.id) === String(patientId))?.language
        if (lang) setLanguage(lang)
      }).catch(() => {})
  }, [patientId, apiKey, patients])

  async function handleGenerate() {
    if (!patientId) { toast.error('Select a patient'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/discharge/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ patient_id: patientId, case_id: caseId || undefined, language }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Discharge summary generated')
      onDone()
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={18} color="#0f766e" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>Generate Discharge Summary</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>AI-powered with TCM & FHIR</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Patient *</label>
            <select value={patientId} onChange={e => setPatientId(e.target.value)}
              style={{ width: '100%', padding: '9px 11px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff', outline: 'none', boxSizing: 'border-box' }}>
              <option value="">Select patient…</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.name} ({p.dob || 'DOB unknown'})</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Case (optional)</label>
            <select value={caseId} onChange={e => setCaseId(e.target.value)}
              style={{ width: '100%', padding: '9px 11px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff', outline: 'none', boxSizing: 'border-box' }}>
              <option value="">No specific case</option>
              {cases.map(c => <option key={c.id} value={c.id}>{c.title || `Case #${c.id}`} ({c.status})</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Patient Instructions Language</label>
            <input value={language} onChange={e => setLanguage(e.target.value)} placeholder="en, es, fr, de, ar…"
              style={{ width: '100%', padding: '9px 11px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>Use ISO 639-1 code. Pre-filled from patient record.</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 9, border: '1.5px solid #d1d5db', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleGenerate} disabled={loading || !patientId}
            style={{ flex: 2, padding: '10px', borderRadius: 9, border: 'none', background: loading || !patientId ? '#d1d5db' : 'linear-gradient(135deg,#0f766e,#059669)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: loading || !patientId ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            {loading ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</> : <><FileText size={14} /> Generate Summary</>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main page ── */
export default function Discharge() {
  const { key } = useKey()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [filterPatient, setFilterPatient] = useState('')
  const [patients, setPatients] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/discharge', { headers: { 'x-api-key': key } })
      const d = await res.json()
      setRecords(Array.isArray(d) ? d : d.records || [])
    } catch { toast.error('Failed to load discharge records') } finally { setLoading(false) }
  }, [key])

  useEffect(() => {
    if (key) {
      load()
      fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
        .then(r => r.json()).then(d => setPatients(d.patients || [])).catch(() => {})
    }
  }, [key, load])

  const filtered = filterPatient
    ? records.filter(r => String(r.patient_id) === filterPatient)
    : records

  // Stats
  const total      = records.length
  const highRisk   = records.filter(r => (r.risk_level || '').toLowerCase() === 'high').length
  const tcmActive  = records.filter(r => r.tcm_enrolled).length
  const pending    = records.filter(r => !r.transmission_status || r.transmission_status === 'pending').length
  const transmitted = records.filter(r => r.transmission_status === 'transmitted' || r.transmission_status === 'acknowledged').length

  return (
    <div style={{ padding: '28px 32px', maxWidth: 920, margin: '0 auto' }}>
      {/* page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#0f766e,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={20} color="#fff" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#111827' }}>Discharge & Transition of Care</h1>
              <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>AI-generated summaries · TCM enrollment · FHIR R4 · Multilingual instructions</p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 9, border: '1.5px solid #d1d5db', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => setShowModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#0f766e,#059669)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(15,118,110,.3)' }}>
            <Plus size={15} /> New Summary
          </button>
        </div>
      </div>

      {/* stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total', value: total,      icon: FileText,  color: '#0f766e', bg: '#f0fdf4' },
          { label: 'High Risk', value: highRisk, icon: AlertTriangle, color: '#b91c1c', bg: '#fee2e2' },
          { label: 'TCM Active', value: tcmActive, icon: Shield, color: '#0369a1', bg: '#eff6ff' },
          { label: 'Pending TX', value: pending, icon: Clock,   color: '#b45309', bg: '#fef3c7' },
          { label: 'Transmitted', value: transmitted, icon: Send, color: '#6d28d9', bg: '#faf5ff' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <s.icon size={18} color={s.color} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: s.color, opacity: .75, marginTop: 2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* filter */}
      {patients.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <select value={filterPatient} onChange={e => setFilterPatient(e.target.value)}
            style={{ padding: '8px 12px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: 13, background: '#fff', outline: 'none' }}>
            <option value="">All patients</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {/* records */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 10, color: '#6b7280' }}>
          <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} /> Loading records…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px', background: '#fff', borderRadius: 16, border: '1px dashed #d1d5db' }}>
          <FileText size={40} color="#d1d5db" style={{ margin: '0 auto 14px' }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 6 }}>No discharge records yet</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>Generate AI-powered discharge summaries with TCM, FHIR bundles, and multilingual patient instructions</div>
          <button onClick={() => setShowModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#0f766e,#059669)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={15} /> Generate First Summary
          </button>
        </div>
      ) : (
        filtered.map(r => <DischargeCard key={r.id} rec={r} apiKey={key} onRefresh={load} />)
      )}

      {showModal && <GenerateModal apiKey={key} onClose={() => setShowModal(false)} onDone={() => { setShowModal(false); load() }} />}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
