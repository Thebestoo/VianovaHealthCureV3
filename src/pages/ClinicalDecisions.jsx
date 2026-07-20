import React, { useState, useEffect, useRef } from 'react'
import {
  Lightbulb, Loader2, X, AlertCircle, FlaskConical,
  Pill, Check, ChevronRight, ShieldCheck, Activity, Brain,
  Zap, BookOpen, RefreshCw, AlertTriangle, CheckCircle2,
  Info, ChevronDown, ChevronUp, Copy, ArrowRight, Target,
  Eye, Clock, User
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import SummaryActions from '../components/SummaryActions.jsx'

/* ── colour helpers ─────────────────────────────────────────────────────────── */
const RISK_CFG = {
  low:      { color: '#059669', bg: '#dcfce7', ring: '#86efac' },
  moderate: { color: '#d97706', bg: '#fef3c7', ring: '#fde68a' },
  medium:   { color: '#d97706', bg: '#fef3c7', ring: '#fde68a' },
  high:     { color: '#ea580c', bg: '#ffedd5', ring: '#fdba74' },
  critical: { color: '#dc2626', bg: '#fee2e2', ring: '#fca5a5' },
}
const SEV_CFG = {
  none:            { color: '#059669', bg: '#dcfce7' },
  minor:           { color: '#2563eb', bg: '#dbeafe' },
  low:             { color: '#2563eb', bg: '#dbeafe' },
  moderate:        { color: '#d97706', bg: '#fef3c7' },
  major:           { color: '#ea580c', bg: '#ffedd5' },
  high:            { color: '#ea580c', bg: '#ffedd5' },
  critical:        { color: '#dc2626', bg: '#fee2e2' },
  contraindicated: { color: '#dc2626', bg: '#fee2e2' },
}
const EVIDENCE_CFG = {
  A: { color: '#059669', bg: '#dcfce7', label: 'Level A' },
  B: { color: '#2563eb', bg: '#dbeafe', label: 'Level B' },
  C: { color: '#d97706', bg: '#fef3c7', label: 'Level C' },
}
const INDICATOR_COLOR = { info: '#2563eb', warning: '#d97706', critical: '#dc2626' }

function riskCfg(label) { return RISK_CFG[(label||'').toLowerCase()] || RISK_CFG.low }
function sevCfg(s)       { return SEV_CFG[(s||'').toLowerCase()] || { color: '#64748b', bg: '#f1f5f9' } }

function Badge({ label, color, bg }) {
  return (
    <span style={{ padding: '2px 9px', borderRadius: 99, fontSize: 10, fontWeight: 800,
      textTransform: 'uppercase', letterSpacing: '.07em', color, background: bg }}>
      {label}
    </span>
  )
}

/* ── RiskGauge ──────────────────────────────────────────────────────────────── */
function RiskGauge({ score, label }) {
  const pct  = Math.min(100, Math.max(0, score || 0))
  const cfg  = riskCfg(label)
  const r    = 40
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', width: 120, height: 120 }}>
        <svg width={120} height={120} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={60} cy={60} r={r} fill="none" stroke="#e2e8f0" strokeWidth={11} />
          <circle cx={60} cy={60} r={r} fill="none" stroke={cfg.color} strokeWidth={11}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray .7s ease', filter: `drop-shadow(0 0 6px ${cfg.ring})` }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: cfg.color, lineHeight: 1 }}>{pct}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>/ 100</div>
        </div>
      </div>
      <Badge label={label || 'Unknown'} color={cfg.color} bg={cfg.bg} />
    </div>
  )
}

/* ── Collapsible section ────────────────────────────────────────────────────── */
function Section({ title, count, children, defaultOpen = true, icon: Icon }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', padding: '14px 20px', border: 'none', background: 'none',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {Icon && <Icon size={15} color="var(--primary)" />}
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', flex: 1, textAlign: 'left' }}>{title}</span>
        {count != null && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 99,
            background: 'var(--primary-light)', color: 'var(--primary)' }}>{count}</span>
        )}
        {open ? <ChevronUp size={14} color="var(--text3)" /> : <ChevronDown size={14} color="var(--text3)" />}
      </button>
      {open && <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px' }}>{children}</div>}
    </div>
  )
}

/* ── Empty / Loading states ─────────────────────────────────────────────────── */
function EmptyState({ icon: Icon, title, desc }) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 24px', background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)' }}>
      <div style={{ width: 60, height: 60, borderRadius: 16, background: 'var(--primary-light)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
        <Icon size={26} color="var(--primary)" />
      </div>
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 7 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text3)', maxWidth: 320, margin: '0 auto', lineHeight: 1.6 }}>{desc}</div>
    </div>
  )
}

function LoadingState({ label }) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 24px', background: 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)' }}>
      <Loader2 size={34} color="var(--primary)"
        style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 14px' }} />
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{label}</div>
    </div>
  )
}

/* ── shared input style ─────────────────────────────────────────────────────── */
const inp = {
  width: '100%', padding: '11px 14px', border: '1.5px solid var(--border)',
  borderRadius: 10, fontSize: 13, color: 'var(--text)', background: 'var(--surface)',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB 1 — Patient Risk & CDS
══════════════════════════════════════════════════════════════════════════════ */

/* NEWS2 score colour */
function news2Cfg(score) {
  if (score === 0)   return { color: '#059669', bg: '#dcfce7', label: 'Low' }
  if (score <= 4)    return { color: '#2563eb', bg: '#dbeafe', label: 'Low-Medium' }
  if (score <= 6)    return { color: '#d97706', bg: '#fef3c7', label: 'Medium' }
  return               { color: '#dc2626', bg: '#fee2e2', label: 'High' }
}

function VitalRow({ label, value, unit, pts }) {
  const hasPoints = pts != null
  const ptColor   = pts === 0 ? '#059669' : pts <= 1 ? '#d97706' : '#dc2626'
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '9px 14px',
      borderBottom: '1px solid var(--border)', gap: 12 }}>
      <div style={{ width: 140, fontSize: 12, color: 'var(--text2)', fontWeight: 500 }}>{label}</div>
      <div style={{ flex: 1, fontWeight: 700, fontSize: 13, color: value ? 'var(--text)' : 'var(--text3)' }}>
        {value != null ? `${value} ${unit || ''}` : <span style={{ fontStyle: 'italic', fontWeight: 400 }}>Not recorded</span>}
      </div>
      {hasPoints && (
        <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 99,
          color: ptColor, background: pts === 0 ? '#dcfce7' : pts <= 1 ? '#fef3c7' : '#fee2e2' }}>
          {pts === 0 ? '+0 pts' : `+${pts} pts`}
        </span>
      )}
    </div>
  )
}

function DiffRow({ rank, diagnosis, probability, reasoning }) {
  const cfg = probability === 'high' ? { color: '#dc2626', bg: '#fee2e2' }
    : probability === 'moderate' ? { color: '#d97706', bg: '#fef3c7' }
    : { color: '#2563eb', bg: '#dbeafe' }
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '11px 14px',
      borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--surface2)',
        border: '1px solid var(--border)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text2)', flexShrink: 0 }}>
        {rank}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{diagnosis}</span>
          <Badge label={probability} color={cfg.color} bg={cfg.bg} />
        </div>
        {reasoning && <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{reasoning}</div>}
      </div>
    </div>
  )
}

function HistoryRow({ visit }) {
  const statusColor = visit.status === 'Approved' ? '#059669' : '#d97706'
  const statusBg    = visit.status === 'Approved' ? '#dcfce7' : '#fef3c7'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px',
      borderBottom: '1px solid var(--border)',
      background: visit.is_current ? 'rgba(14,116,144,.04)' : 'transparent' }}>
      <div style={{ width: 80, fontSize: 12, color: 'var(--text3)', flexShrink: 0, paddingTop: 1 }}>{visit.date}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: visit.is_current ? 700 : 500, lineHeight: 1.4 }}>
          {visit.chief_complaint}
        </div>
        {visit.confidence && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Confidence: {visit.confidence}</div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        {visit.is_current && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
            background: 'var(--primary)', color: '#fff' }}>Current</span>
        )}
        <Badge label={visit.status} color={statusColor} bg={statusBg} />
      </div>
    </div>
  )
}

function PatientCDSTab({ patients, apiKey }) {
  const [patientId, setPatientId] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState(null)
  const [dismissed, setDismissed] = useState(new Set())
  const [copied,    setCopied]    = useState(null)
  const [error,     setError]     = useState(null)

  async function run() {
    if (!patientId) return
    setLoading(true); setResult(null); setDismissed(new Set()); setError(null)
    try {
      const r = await fetch(`/api/cds/patient/${patientId}`, { method: 'POST', headers: { 'x-api-key': apiKey } })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Analysis failed'); setLoading(false); return }
      setResult(d)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const visible = (result?.cards || []).filter(c => !dismissed.has(c.id))
  const byIndicator = { critical: [], warning: [], info: [] }
  visible.forEach(c => { const k = c.indicator?.toLowerCase(); byIndicator[k in byIndicator ? k : 'info'].push(c) })

  const n2 = result?.news2
  const n2cfg = n2 ? news2Cfg(n2.score) : null
  const vt = result?.vitals || {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Select + Run */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
        padding: '20px 24px', boxShadow: 'var(--shadow)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase',
          letterSpacing: '.09em', marginBottom: 14 }}>Select Patient for Full CDS Analysis</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Patient</label>
            <select value={patientId} onChange={e => { setPatientId(e.target.value); setResult(null) }} style={inp}>
              <option value="">— Choose patient —</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={run} disabled={loading || !patientId}>
            {loading ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing…</>
              : <><Brain size={13} /> Run Full CDS</>}
          </button>
          {result && <button className="btn btn-secondary btn-sm" onClick={run} disabled={loading}><RefreshCw size={13} /></button>}
        </div>
        {error && <div style={{ marginTop: 12, fontSize: 13, color: '#dc2626', padding: '8px 12px',
          background: '#fee2e2', borderRadius: 8 }}>{error}</div>}
      </div>

      {loading && <LoadingState label="Running full clinical analysis — vitals, labs, history, AI reasoning…" />}
      {!result && !loading && !error && (
        <EmptyState icon={Brain} title="Patient CDS Analysis"
          desc="Select a patient and run CDS to get NEWS2 early warning score, vitals review, patient history, differential assessment, treatment plan, and AI summary for the physician." />
      )}

      {result && !loading && (() => {
        const tp = result.treatment_plan || {}
        const diff = result.differential || []

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── Row 1: NEWS2 + Patient Snapshot ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              {/* NEWS2 */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>NEWS2 Early Warning Score</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 28, fontWeight: 900, color: n2cfg.color, lineHeight: 1 }}>{n2?.score ?? 0}</span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: n2cfg.color }}>{n2cfg.label}</div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{n2?.action}</div>
                    </div>
                  </div>
                </div>
                {n2?.note && (
                  <div style={{ padding: '8px 18px', fontSize: 11, color: 'var(--text3)',
                    background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                    — {n2.note}
                  </div>
                )}
                <VitalRow label="Heart rate"          value={vt.hr}          unit="bpm"         pts={n2?.breakdown?.hr} />
                <VitalRow label="Oxygen saturation"   value={vt.spo2}        unit="%"           pts={n2?.breakdown?.spo2} />
                <VitalRow label="Blood pressure"      value={vt.sbp && vt.dbp ? `${vt.sbp}/${vt.dbp}` : vt.sbp} unit="mmHg" pts={n2?.breakdown?.sbp} />
                <VitalRow label="Respiratory rate"    value={vt.rr}          unit="breaths/min" pts={n2?.breakdown?.rr} />
                <VitalRow label="Body temperature"    value={vt.temp_f}      unit="°F"          pts={n2?.breakdown?.temp} />
                <VitalRow label="Body weight"         value={vt.weight}      unit="lbs"         />
                <VitalRow label="Body height"         value={vt.height}      unit="inches"      />
                <VitalRow label="Blood sugar"         value={vt.blood_sugar} unit="mg/dL"       />
                <VitalRow label="Pain level"          value={vt.pain != null ? `${vt.pain}/10` : null} />
              </div>

              {/* Patient Snapshot */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow)', overflow: 'hidden', flex: '0 0 auto' }}>
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Patient Snapshot</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                    {[
                      { label: 'Age',  value: result.age != null ? `${result.age} yrs` : '—' },
                      { label: 'Sex',  value: result.sex || '—' },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>{label}</div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {result.conditions?.length > 0 && (
                    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 7 }}>Active Conditions</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {result.conditions.map((c, i) => (
                          <span key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99,
                            background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)' }}>{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.medications?.length > 0 && (
                    <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 7 }}>Medications</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {result.medications.map((m, i) => (
                          <span key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99,
                            background: '#dbeafe', border: '1px solid #93c5fd', color: '#1d4ed8' }}>{m}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Allergy check */}
                <div style={{ background: result.allergy_conflicts?.length > 0 ? '#fff1f2' : '#f0fdf4',
                  border: `1px solid ${result.allergy_conflicts?.length > 0 ? '#fca5a5' : '#86efac'}`,
                  borderRadius: 12, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {result.allergy_conflicts?.length > 0
                      ? <AlertTriangle size={14} color="#dc2626" />
                      : <CheckCircle2 size={14} color="#059669" />}
                    <span style={{ fontWeight: 700, fontSize: 12,
                      color: result.allergy_conflicts?.length > 0 ? '#dc2626' : '#059669' }}>
                      Allergy &amp; Interaction Check
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: result.allergy_conflicts?.length > 0 ? '#be123c' : '#166534', lineHeight: 1.5 }}>
                    {result.allergy_conflicts?.length > 0
                      ? result.allergy_conflicts.map((c, i) => (
                          <div key={i}>⚠ {c.medication} conflicts with {c.allergy} allergy</div>
                        ))
                      : (result.allergy_check || 'No immediate conflicts detected based on patient-reported data.')}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Presenting Complaint ── */}
            {result.presenting_complaint && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
                padding: '16px 20px', boxShadow: 'var(--shadow)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase',
                  letterSpacing: '.09em', marginBottom: 8 }}>Presenting Complaint &amp; Symptoms</div>
                <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65, fontWeight: 500 }}>
                  {result.presenting_complaint}
                </div>
              </div>
            )}

            {/* ── Patient History ── */}
            {result.case_history?.length > 0 && (
              <Section title="Patient History" count={`${result.visit_count} visit${result.visit_count !== 1 ? 's' : ''}`} icon={Clock}>
                <div style={{ margin: '-16px -20px' }}>
                  {result.case_history.map((v, i) => <HistoryRow key={i} visit={v} />)}
                </div>
              </Section>
            )}

            {/* ── Differential Assessment ── */}
            {diff.length > 0 && (
              <Section title="Differential Assessment" count={diff.length} icon={Brain}>
                <div style={{ margin: '-16px -20px' }}>
                  {diff.map((d, i) => <DiffRow key={i} rank={d.rank || i + 1} diagnosis={d.diagnosis} probability={d.probability} reasoning={d.reasoning} />)}
                </div>
              </Section>
            )}

            {/* ── CDS Alert Cards ── */}
            {visible.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { key: 'critical', title: 'Critical Alerts', icon: AlertTriangle, clr: '#dc2626' },
                  { key: 'warning',  title: 'Warnings',        icon: AlertCircle,   clr: '#d97706' },
                  { key: 'info',     title: 'Recommendations', icon: Info,          clr: '#2563eb' },
                ].map(({ key, title, icon: Ic, clr }) => byIndicator[key].length > 0 && (
                  <Section key={key} title={title} count={byIndicator[key].length} icon={Ic} defaultOpen={key !== 'info'}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {byIndicator[key].map(card => (
                        <CDSCard key={card.id} card={card} clr={clr} copied={copied} setCopied={setCopied}
                          onDismiss={() => setDismissed(s => new Set([...s, card.id]))} />
                      ))}
                    </div>
                  </Section>
                ))}
              </div>
            )}

            {/* ── Treatment Plan ── */}
            {(tp.non_pharmacological?.length || tp.pharmacological?.length || tp.investigations?.length) ? (
              <Section title="Draft Treatment Plan" icon={Target}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {tp.non_pharmacological?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase',
                        letterSpacing: '.08em', marginBottom: 8 }}>Non-Pharmacological</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {tp.non_pharmacological.map((t, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                            fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                            <ChevronRight size={13} color="var(--primary)" style={{ flexShrink: 0, marginTop: 2 }} />{t}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {tp.pharmacological?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase',
                        letterSpacing: '.08em', marginBottom: 8 }}>Pharmacological</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {tp.pharmacological.map((t, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                            fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                            <Pill size={13} color="var(--primary)" style={{ flexShrink: 0, marginTop: 2 }} />{t}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {tp.investigations?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase',
                        letterSpacing: '.08em', marginBottom: 8 }}>Investigations</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {tp.investigations.map((t, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                            fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                            <FlaskConical size={13} color="var(--primary)" style={{ flexShrink: 0, marginTop: 2 }} />{t}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {tp.follow_up && (
                    <div style={{ padding: '10px 14px', background: 'var(--surface2)',
                      border: '1px solid var(--border)', borderRadius: 9,
                      display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Clock size={13} color="var(--primary)" />
                      <span style={{ fontSize: 13, color: 'var(--text2)' }}><strong>Follow-up:</strong> {tp.follow_up}</span>
                    </div>
                  )}
                </div>
              </Section>
            ) : null}

            {/* ── AI Summary for Doctor ── */}
            {result.doctor_summary && (
              <div style={{ background: 'linear-gradient(135deg, #0c5f78 0%, #083d52 100%)',
                borderRadius: 14, padding: '22px 24px', boxShadow: 'var(--shadow-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(255,255,255,.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Brain size={16} color="#fff" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>AI Reasoning for Doctor</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
                      Patient Summary Draft · {result.generated_at ? new Date(result.generated_at).toLocaleTimeString() : ''}
                    </div>
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 9px',
                    borderRadius: 99, background: 'rgba(255,255,255,.15)', color: 'rgba(255,255,255,.7)' }}>
                    Draft — not yet approved
                  </span>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <SummaryActions
                    dark
                    compact
                    title="AI Reasoning for Doctor"
                    filename="clinical-decision-summary.txt"
                    text={result.doctor_summary}
                  />
                </div>
                <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,.85)', lineHeight: 1.8,
                  padding: '16px 18px', background: 'rgba(0,0,0,.2)',
                  borderRadius: 10, border: '1px solid rgba(255,255,255,.1)' }}>
                  {result.doctor_summary}
                </div>
              </div>
            )}

          </div>
        )
      })()}
    </div>
  )
}

function CDSCard({ card, clr, copied, setCopied, onDismiss }) {
  const Icon = card.category?.toLowerCase().includes('lab') ? FlaskConical
    : card.category?.toLowerCase().includes('med') ? Pill
    : card.category?.toLowerCase().includes('risk') ? Activity
    : card.category?.toLowerCase().includes('screen') ? Eye
    : Brain

  function copy() {
    navigator.clipboard.writeText(card.action)
    setCopied(card.id)
    setTimeout(() => setCopied(null), 1600)
  }

  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)',
      borderLeft: `4px solid ${clr}`, borderRadius: 11, padding: '14px 16px',
      display: 'flex', gap: 13, alignItems: 'flex-start' }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: `${clr}15`,
        border: `1px solid ${clr}25`, display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: clr, flexShrink: 0 }}>
        <Icon size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>{card.title}</span>
          {card.category && (
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', background: 'var(--surface)',
              border: '1px solid var(--border)', padding: '1px 7px', borderRadius: 99,
              textTransform: 'uppercase', letterSpacing: '.05em' }}>{card.category}</span>
          )}
        </div>
        {card.detail && <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65, marginBottom: card.action ? 10 : 0 }}>{card.detail}</div>}
        {card.action && (
          <button onClick={copy} className="btn btn-secondary btn-sm">
            {copied === card.id ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy action</>}
          </button>
        )}
      </div>
      <button onClick={onDismiss} title="Dismiss"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)',
          padding: 4, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <X size={14} />
      </button>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB 2 — Medication Safety
══════════════════════════════════════════════════════════════════════════════ */
function MedSafetyTab({ patients, apiKey }) {
  const [patientId, setPatientId] = useState('')
  const [medName,   setMedName]   = useState('')
  const [medDose,   setMedDose]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState(null)

  async function run() {
    if (!patientId || !medName) return
    setLoading(true); setResult(null)
    try {
      const r = await fetch('/api/cds/medication-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ patient_id: patientId, new_medication: medName, ...(medDose && { new_dose: medDose }) }),
      })
      setResult(await r.json())
    } catch {}
    setLoading(false)
  }

  const statusCfg = result
    ? result.safe === true
      ? { bg: '#f0fdf4', border: '#86efac', color: '#15803d', label: 'Safe to Prescribe', icon: CheckCircle2 }
      : result.safe === false
      ? { bg: '#fff1f2', border: '#fca5a5', color: '#dc2626', label: 'Do Not Prescribe', icon: X }
      : { bg: '#fefce8', border: '#fde047', color: '#a16207', label: 'Use With Caution', icon: AlertCircle }
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
        padding: '20px 24px', boxShadow: 'var(--shadow)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase',
          letterSpacing: '.09em', marginBottom: 14 }}>Check New Medication Safety</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Patient *</label>
            <select value={patientId} onChange={e => setPatientId(e.target.value)} style={inp}>
              <option value="">— Choose patient —</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>New Medication *</label>
            <input value={medName} onChange={e => setMedName(e.target.value)} placeholder="e.g. Metformin" style={inp}
              onKeyDown={e => e.key === 'Enter' && run()} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Dose</label>
            <input value={medDose} onChange={e => setMedDose(e.target.value)} placeholder="500mg" style={inp}
              onKeyDown={e => e.key === 'Enter' && run()} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={run} disabled={loading || !patientId || !medName}>
          {loading ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Checking…</>
            : <><ShieldCheck size={13} /> Check Medication Safety</>}
        </button>
      </div>

      {loading && <LoadingState label="Checking for interactions, contraindications and allergies…" />}
      {!result && !loading && (
        <EmptyState icon={Pill} title="Medication Safety Check"
          desc="Select a patient, enter the new medication and optionally the dose to check for DDIs, contraindications, and allergy conflicts." />
      )}

      {result && !loading && statusCfg && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Status banner */}
          {(() => {
            const Icon = statusCfg.icon
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 24px',
                borderRadius: 14, background: statusCfg.bg,
                border: `1.5px solid ${statusCfg.border}`, boxShadow: 'var(--shadow)' }}>
                <div style={{ width: 48, height: 48, borderRadius: 13, background: statusCfg.border,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={22} color={statusCfg.color} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 19, color: statusCfg.color, letterSpacing: '-.01em' }}>
                    {statusCfg.label}
                  </div>
                  {result.overall_recommendation && (
                    <div style={{ fontSize: 13, color: statusCfg.color, opacity: .75, marginTop: 4, lineHeight: 1.5 }}>
                      {result.overall_recommendation}
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Alerts */}
          {result.alerts?.length > 0 && (
            <Section title="Clinical Alerts" count={result.alerts.length} icon={AlertTriangle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.alerts.map((alert, i) => {
                  const sc = sevCfg(alert.severity)
                  return (
                    <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)',
                      borderRadius: 11, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <Badge label={alert.severity || 'unknown'} color={sc.color} bg={sc.bg} />
                        {alert.type && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{alert.type}</span>}
                      </div>
                      {alert.message && <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)', marginBottom: 5 }}>{alert.message}</div>}
                      {alert.recommendation && <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }}>{alert.recommendation}</div>}
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* Alternatives */}
          {result.formulary_alternatives?.length > 0 && (
            <Section title="Formulary Alternatives" icon={ArrowRight}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {result.formulary_alternatives.map((alt, i) => (
                  <span key={i} style={{ padding: '6px 14px', background: 'var(--primary-light)',
                    color: 'var(--primary)', borderRadius: 99, fontSize: 13, fontWeight: 600,
                    border: '1px solid rgba(14,116,144,.2)' }}>{alt}</span>
                ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB 3 — DDI Checker
══════════════════════════════════════════════════════════════════════════════ */
function DDITab({ apiKey }) {
  const [medInput, setMedInput] = useState('')
  const [meds,     setMeds]     = useState([])
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState(null)
  const inputRef = useRef()

  function addMed() {
    const v = medInput.trim()
    if (!v || meds.includes(v)) return
    setMeds(m => [...m, v])
    setMedInput('')
    inputRef.current?.focus()
  }

  async function run() {
    if (meds.length < 2) return
    setLoading(true); setResult(null)
    try {
      const r = await fetch('/api/cds/ddi-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ medications: meds }),
      })
      setResult(await r.json())
    } catch {}
    setLoading(false)
  }

  const severityOrder = ['contraindicated', 'major', 'high', 'moderate', 'minor', 'low', 'none']
  const sorted = (result?.interactions || []).slice().sort((a, b) =>
    severityOrder.indexOf(a.severity?.toLowerCase()) - severityOrder.indexOf(b.severity?.toLowerCase()))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
        padding: '20px 24px', boxShadow: 'var(--shadow)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase',
          letterSpacing: '.09em', marginBottom: 14 }}>Add Medications to Check</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input ref={inputRef} value={medInput} onChange={e => setMedInput(e.target.value)}
            placeholder="e.g. Warfarin" style={{ ...inp, flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && addMed()} />
          <button className="btn btn-secondary" onClick={addMed} disabled={!medInput.trim()}>
            Add
          </button>
        </div>

        {meds.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 16 }}>
            {meds.map((m, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', background: 'var(--primary-light)',
                color: 'var(--primary)', borderRadius: 99, fontSize: 13, fontWeight: 600,
                border: '1px solid rgba(14,116,144,.2)' }}>
                {m}
                <button onClick={() => setMeds(ms => ms.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)',
                    padding: 0, display: 'flex', alignItems: 'center' }}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        <button className="btn btn-primary" onClick={run} disabled={loading || meds.length < 2}>
          {loading ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing…</>
            : <><Zap size={13} /> Check {meds.length} Drug Interactions</>}
        </button>
        {meds.length < 2 && meds.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>Add at least one more medication</div>
        )}
      </div>

      {loading && <LoadingState label="Analyzing all pairwise drug-drug interactions…" />}
      {!result && !loading && (
        <EmptyState icon={Zap} title="Drug-Drug Interaction Checker"
          desc="Add two or more medications to check all pairwise interactions, severity levels, and clinical management recommendations." />
      )}

      {result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Overall risk banner */}
          {(() => {
            const cfg = riskCfg(result.overall_risk)
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 22px',
                borderRadius: 14, background: cfg.bg, border: `1.5px solid ${cfg.ring}`,
                boxShadow: 'var(--shadow)' }}>
                <Activity size={22} color={cfg.color} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: cfg.color }}>
                    Overall risk: <span style={{ textTransform: 'uppercase' }}>{result.overall_risk}</span>
                  </div>
                  {result.summary && <div style={{ fontSize: 13, color: cfg.color, opacity: .8, marginTop: 3 }}>{result.summary}</div>}
                </div>
              </div>
            )
          })()}

          {/* High-risk pairs */}
          {result.high_risk_pairs?.length > 0 && (
            <div style={{ padding: '12px 16px', background: '#fff1f2', border: '1px solid #fca5a5',
              borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={16} color="#dc2626" />
              <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
                High-risk pairs: {result.high_risk_pairs.join(' · ')}
              </div>
            </div>
          )}

          {/* Interactions table */}
          {sorted.length > 0 && (
            <Section title="All Interactions" count={sorted.length} icon={Zap}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sorted.map((ix, i) => {
                  const sc = sevCfg(ix.severity)
                  return (
                    <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)',
                      borderLeft: `4px solid ${sc.color}`, borderRadius: 11, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <Badge label={ix.severity || 'unknown'} color={sc.color} bg={sc.bg} />
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                          {ix.drug_a} + {ix.drug_b}
                        </span>
                      </div>
                      {ix.mechanism && (
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 5 }}>
                          <span style={{ fontWeight: 600 }}>Mechanism: </span>{ix.mechanism}
                        </div>
                      )}
                      {ix.clinical_effect && (
                        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, marginBottom: 5 }}>{ix.clinical_effect}</div>
                      )}
                      {ix.management && (
                        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6,
                          padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8,
                          border: '1px solid var(--border)', marginTop: 6 }}>
                          <span style={{ fontWeight: 600 }}>Management: </span>{ix.management}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   TAB 4 — Clinical Guidelines
══════════════════════════════════════════════════════════════════════════════ */
const COMMON_CONDITIONS = [
  'Type 2 Diabetes', 'Hypertension', 'Heart Failure', 'COPD', 'Asthma',
  'Atrial Fibrillation', 'CKD', 'Hyperlipidemia', 'Depression', 'Osteoporosis',
]

function GuidelinesTab({ apiKey }) {
  const [condition, setCondition] = useState('')
  const [context,   setContext]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState(null)

  async function run() {
    if (!condition.trim()) return
    setLoading(true); setResult(null)
    try {
      const r = await fetch('/api/cds/guidelines', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ condition: condition.trim(), patient_context: context.trim() || undefined }),
      })
      setResult(await r.json())
    } catch {}
    setLoading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
        padding: '20px 24px', boxShadow: 'var(--shadow)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase',
          letterSpacing: '.09em', marginBottom: 14 }}>Look Up Clinical Guidelines</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Condition *</label>
            <input value={condition} onChange={e => setCondition(e.target.value)}
              placeholder="e.g. Type 2 Diabetes" style={inp}
              onKeyDown={e => e.key === 'Enter' && run()} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
              Patient context <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span>
            </label>
            <input value={context} onChange={e => setContext(e.target.value)}
              placeholder="e.g. elderly, CKD stage 3" style={inp}
              onKeyDown={e => e.key === 'Enter' && run()} />
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {COMMON_CONDITIONS.map(c => (
            <button key={c} onClick={() => setCondition(c)} style={{
              padding: '4px 11px', borderRadius: 99, border: '1px solid var(--border)',
              background: condition === c ? 'var(--primary)' : 'var(--surface2)',
              color: condition === c ? '#fff' : 'var(--text2)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all .12s',
            }}>{c}</button>
          ))}
        </div>

        <button className="btn btn-primary" onClick={run} disabled={loading || !condition.trim()}>
          {loading ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading guidelines…</>
            : <><BookOpen size={13} /> Get Guidelines</>}
        </button>
      </div>

      {loading && <LoadingState label="Fetching evidence-based clinical guidelines…" />}
      {!result && !loading && (
        <EmptyState icon={BookOpen} title="Clinical Guidelines Lookup"
          desc="Enter a condition name to get evidence-based management guidelines, treatment targets, monitoring parameters and red flags." />
      )}

      {result && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Header */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
            padding: '20px 24px', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--text)', letterSpacing: '-.01em', marginBottom: 6 }}>
              {result.condition}
            </div>
            {result.guideline_source && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px',
                background: 'var(--primary-light)', color: 'var(--primary)',
                borderRadius: 99, fontSize: 12, fontWeight: 600,
                border: '1px solid rgba(14,116,144,.2)' }}>
                <BookOpen size={11} /> {result.guideline_source}
              </div>
            )}
            {result.follow_up && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, color: 'var(--text2)' }}>
                <Clock size={13} color="var(--text3)" />
                Follow-up: <strong style={{ color: 'var(--text)' }}>{result.follow_up}</strong>
              </div>
            )}
          </div>

          {/* Treatments */}
          {result.first_line_treatments?.length > 0 && (
            <Section title="First-Line Treatments" count={result.first_line_treatments.length} icon={Pill}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.first_line_treatments.map((t, i) => {
                  const ev = EVIDENCE_CFG[t.evidence_level] || { color: '#64748b', bg: '#f1f5f9', label: t.evidence_level }
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '12px 14px', background: 'var(--surface2)',
                      border: '1px solid var(--border)', borderRadius: 10 }}>
                      <Badge label={ev.label} color={ev.color} bg={ev.bg} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 3 }}>{t.treatment}</div>
                        {t.notes && <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{t.notes}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* Targets */}
          {result.targets?.length > 0 && (
            <Section title="Treatment Targets" icon={Target}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                {result.targets.map((t, i) => (
                  <div key={i} style={{ padding: '14px 16px', background: 'var(--surface2)',
                    border: '1px solid var(--border)', borderRadius: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>{t.parameter}</div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--primary)' }}>{t.target}</div>
                    {t.notes && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{t.notes}</div>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Monitoring */}
          {result.monitoring?.length > 0 && (
            <Section title="Monitoring Parameters" icon={Activity} defaultOpen={false}>
              <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {result.monitoring.map((m, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{m}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* Red flags */}
          {result.red_flags?.length > 0 && (
            <Section title="Red Flags — Escalate Urgently" icon={AlertTriangle} defaultOpen={true}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {result.red_flags.map((rf, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9,
                    padding: '10px 12px', background: '#fff1f2',
                    border: '1px solid #fecdd3', borderRadius: 9 }}>
                    <AlertTriangle size={13} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 13, color: '#be123c', lineHeight: 1.5 }}>{rf}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Patient education */}
          {result.patient_education?.length > 0 && (
            <Section title="Patient Education Points" icon={Info} defaultOpen={false}>
              <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {result.patient_education.map((p, i) => (
                  <li key={i} style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{p}</li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════════
   ROOT
══════════════════════════════════════════════════════════════════════════════ */
const TABS = [
  { id: 'cds',  label: 'Patient CDS',      icon: Brain      },
  { id: 'med',  label: 'Medication Safety', icon: Pill       },
  { id: 'ddi',  label: 'DDI Checker',       icon: Zap        },
  { id: 'gl',   label: 'Guidelines',        icon: BookOpen   },
]

export default function ClinicalDecisions() {
  const { key }       = useKey()
  const [patients,  setPatients]  = useState([])
  const [activeTab, setActiveTab] = useState('cds')

  useEffect(() => {
    if (!key) return
    fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      .then(r => r.json()).then(d => setPatients(d.patients || [])).catch(() => {})
  }, [key])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--primary-light)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lightbulb size={16} color="var(--primary)" />
          </div>
          <span className="topbar-title">Clinical Decisions</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <ShieldCheck size={12} /> AI draft — physician review required
        </div>
      </div>

      <div style={{ padding: '24px 32px 40px' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 2, background: '#e2e8f0', borderRadius: 13, padding: 4,
          width: 'fit-content', marginBottom: 28 }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, transition: 'all .15s',
              background: activeTab === id ? '#fff' : 'transparent',
              color:      activeTab === id ? 'var(--primary)' : 'var(--text2)',
              boxShadow:  activeTab === id ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
            }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {activeTab === 'cds' && <PatientCDSTab patients={patients} apiKey={key} />}
        {activeTab === 'med' && <MedSafetyTab  patients={patients} apiKey={key} />}
        {activeTab === 'ddi' && <DDITab                            apiKey={key} />}
        {activeTab === 'gl'  && <GuidelinesTab                    apiKey={key} />}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
