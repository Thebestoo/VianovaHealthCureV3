import React, { useState, useEffect, useRef } from 'react'
import {
  Lightbulb, Loader2, X, AlertCircle, FlaskConical,
  Pill, Check, ChevronRight, ShieldCheck, Activity, Brain,
  Zap, BookOpen, RefreshCw, AlertTriangle, CheckCircle2,
  Info, ChevronDown, ChevronUp, Copy, ArrowRight, Target,
  Eye, Clock, User
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

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
function PatientCDSTab({ patients, apiKey }) {
  const [patientId, setPatientId] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState(null)
  const [dismissed, setDismissed] = useState(new Set())
  const [copied,    setCopied]    = useState(null)
  const [history,   setHistory]   = useState([])   // last 3 analyses

  async function run() {
    if (!patientId) return
    setLoading(true); setResult(null); setDismissed(new Set())
    try {
      const r = await fetch(`/api/cds/patient/${patientId}`, { method: 'POST', headers: { 'x-api-key': apiKey } })
      const d = await r.json()
      setResult(d)
      setHistory(h => [{ ...d, ts: new Date() }, ...h].slice(0, 3))
    } catch {}
    setLoading(false)
  }

  const visible = (result?.cards || []).filter(c => !dismissed.has(c.id))
  const byIndicator = { critical: [], warning: [], info: [] }
  visible.forEach(c => { const k = c.indicator?.toLowerCase(); byIndicator[k in byIndicator ? k : 'info'].push(c) })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Control row */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
        padding: '20px 24px', boxShadow: 'var(--shadow)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase',
          letterSpacing: '.09em', marginBottom: 14 }}>Select Patient for Analysis</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
              Patient
            </label>
            <select value={patientId} onChange={e => setPatientId(e.target.value)} style={inp}>
              <option value="">— Choose patient —</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={run} disabled={loading || !patientId}>
            {loading ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing…</>
              : <><Brain size={13} /> Run CDS Analysis</>}
          </button>
          {result && (
            <button className="btn btn-secondary btn-sm" onClick={run} disabled={loading} title="Re-run">
              <RefreshCw size={13} />
            </button>
          )}
        </div>
      </div>

      {loading && <LoadingState label="Analyzing patient — evaluating risk factors, guidelines & labs…" />}

      {!result && !loading && (
        <EmptyState icon={Brain} title="Patient Risk Analysis"
          desc="Select a patient and run CDS to get AI-powered risk scores, clinical alerts, and evidence-based recommendations." />
      )}

      {result && !loading && (
        <>
          {/* Risk overview card */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
            padding: '24px 28px', boxShadow: 'var(--shadow)', display: 'flex', gap: 28,
            alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <RiskGauge score={result.risk_score} label={result.risk_label} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--text)', letterSpacing: '-.01em' }}>
                  {result.patient_name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text3)' }}>
                  <Clock size={11} /> {result.generated_at ? new Date(result.generated_at).toLocaleTimeString() : 'Just now'}
                </div>
              </div>

              {/* Indicator summary pills */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {[
                  { key: 'critical', label: 'Critical', color: '#dc2626', bg: '#fee2e2' },
                  { key: 'warning',  label: 'Warnings', color: '#d97706', bg: '#fef3c7' },
                  { key: 'info',     label: 'Info',     color: '#2563eb', bg: '#dbeafe' },
                ].map(({ key, label, color, bg }) => byIndicator[key].length > 0 && (
                  <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700, color, background: bg }}>
                    {key === 'critical' && <AlertTriangle size={11} />}
                    {key === 'warning' && <AlertCircle size={11} />}
                    {key === 'info' && <Info size={11} />}
                    {byIndicator[key].length} {label}
                  </span>
                ))}
              </div>

              {result.summary && (
                <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.75,
                  padding: '14px 16px', background: 'var(--surface2)',
                  borderRadius: 10, border: '1px solid var(--border)' }}>
                  {result.summary}
                </div>
              )}
            </div>
          </div>

          {/* Grouped recommendations */}
          {visible.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { key: 'critical', title: 'Critical Alerts',    icon: AlertTriangle, clr: '#dc2626' },
                { key: 'warning',  title: 'Warnings',           icon: AlertCircle,   clr: '#d97706' },
                { key: 'info',     title: 'Recommendations',    icon: Info,          clr: '#2563eb' },
              ].map(({ key, title, icon: Icon, clr }) => byIndicator[key].length > 0 && (
                <Section key={key} title={title} count={byIndicator[key].length} icon={Icon} defaultOpen={key !== 'info'}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {byIndicator[key].map(card => (
                      <CDSCard key={card.id} card={card} clr={clr}
                        copied={copied} setCopied={setCopied}
                        onDismiss={() => setDismissed(s => new Set([...s, card.id]))} />
                    ))}
                  </div>
                </Section>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text3)', fontSize: 13,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
              All recommendations dismissed. <button onClick={() => setDismissed(new Set())}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)',
                  fontWeight: 600, fontSize: 13 }}>Restore</button>
            </div>
          )}
        </>
      )}

      {/* History */}
      {history.length > 1 && (
        <Section title="Recent Analyses" icon={Clock} defaultOpen={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <User size={14} color="var(--text3)" />
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{h.patient_name}</div>
                <Badge label={h.risk_label} color={riskCfg(h.risk_label).color} bg={riskCfg(h.risk_label).bg} />
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{h.ts?.toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
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
