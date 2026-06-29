import React, { useState, useEffect, useCallback } from 'react'
import {
  Receipt, DollarSign, FileCheck, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, Copy, Check, Loader2, RefreshCw,
  Shield, AlertOctagon, FileText, Activity, ClipboardCheck
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const API = (path, opts = {}) => {
  const key = typeof opts.key !== 'undefined' ? opts.key : undefined
  delete opts.key
  return fetch(`/api${path}`, {
    headers: { 'x-api-key': key, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  }).then(r => r.json())
}

// ── Confidence bar ─────────────────────────────────────────────────────────────
function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100)
  const color = pct >= 80 ? '#22c55e' : pct >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 60, height: 4, borderRadius: 2, background: '#e5e7eb', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, color: '#6b7280' }}>{pct}%</span>
    </div>
  )
}

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    draft: { bg: '#f3f4f6', color: '#6b7280', label: 'Draft' },
    submitted: { bg: '#dcfce7', color: '#16a34a', label: 'Submitted' },
    under_review: { bg: '#fef3c7', color: '#d97706', label: 'Under Review' },
    rejected: { bg: '#fee2e2', color: '#dc2626', label: 'Rejected' },
  }
  const s = map[status] || map.draft
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
      {s.label}
    </span>
  )
}

// ── Severity badge ─────────────────────────────────────────────────────────────
function SeverityBadge({ severity }) {
  const map = {
    high: { bg: '#fee2e2', color: '#dc2626' },
    medium: { bg: '#fef3c7', color: '#d97706' },
    low: { bg: '#dbeafe', color: '#2563eb' },
  }
  const s = map[severity] || map.low
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, textTransform: 'uppercase' }}>
      {severity}
    </span>
  )
}

// ── FHIR block with copy ───────────────────────────────────────────────────────
function FhirBlock({ json }) {
  const [copied, setCopied] = useState(false)
  const text = typeof json === 'string' ? json : JSON.stringify(json, null, 2)
  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div style={{ position: 'relative', background: '#1e1e2e', borderRadius: 8, padding: 16, overflowX: 'auto' }}>
      <button onClick={copy} style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 6, padding: '4px 8px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
        {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre style={{ margin: 0, color: '#cdd6f4', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{text}</pre>
    </div>
  )
}

// ── Coding sections (shared between ClaimCard and suggestion results) ──────────
function CodingDetails({ claim, onScrub, onSubmit, onStatusUpdate, showActions = true, apiKey }) {
  const icd = parseJson(claim.icd_codes, [])
  const cpt = parseJson(claim.cpt_codes, [])
  const hcpcs = parseJson(claim.hcpcs_codes, [])
  const hcc = parseJson(claim.hcc_codes, [])
  const queries = parseJson(claim.coding_queries, [])
  const flags = parseJson(claim.compliance_flags, [])
  const fhir = parseJson(claim.fhir_claim, null)
  const scrub = parseJson(claim.scrub_results, null)
  const confScores = parseJson(claim.confidence_scores, {})
  const hasHighFlag = flags.some(f => f.severity === 'high')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 16 }}>
      {/* ICD-10 */}
      {icd.length > 0 && (
        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>ICD-10 Diagnoses</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Code', 'Description', 'Confidence', 'HCC', 'Issue'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 11, borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {icd.map((d, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: '#4f46e5', fontFamily: 'monospace' }}>{d.code}</td>
                    <td style={{ padding: '8px 10px', color: '#374151' }}>{d.description}</td>
                    <td style={{ padding: '8px 10px' }}><ConfidenceBar value={d.confidence} /></td>
                    <td style={{ padding: '8px 10px' }}>
                      {d.hcc_eligible ? <span style={{ background: '#dbeafe', color: '#2563eb', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99 }}>HCC</span> : <span style={{ color: '#9ca3af', fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {d.specificity_issue ? <span title={d.specificity_issue} style={{ color: '#f59e0b', cursor: 'help' }}><AlertTriangle size={14} /></span> : <span style={{ color: '#9ca3af', fontSize: 11 }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* CPT / HCPCS */}
      {(cpt.length > 0 || hcpcs.length > 0) && (
        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>CPT / HCPCS Procedures</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Type', 'Code', 'Description', 'Modifier', 'Confidence'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 11, borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cpt.map((p, i) => (
                  <tr key={`cpt-${i}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 10px' }}><span style={{ background: '#ede9fe', color: '#7c3aed', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99 }}>CPT</span></td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: '#4f46e5', fontFamily: 'monospace' }}>{p.code}</td>
                    <td style={{ padding: '8px 10px', color: '#374151' }}>{p.description}</td>
                    <td style={{ padding: '8px 10px', color: '#6b7280', fontFamily: 'monospace' }}>{p.modifier || '—'}</td>
                    <td style={{ padding: '8px 10px' }}><ConfidenceBar value={p.confidence} /></td>
                  </tr>
                ))}
                {hcpcs.map((p, i) => (
                  <tr key={`hcpcs-${i}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 10px' }}><span style={{ background: '#fce7f3', color: '#db2777', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99 }}>HCPCS</span></td>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: '#4f46e5', fontFamily: 'monospace' }}>{p.code}</td>
                    <td style={{ padding: '8px 10px', color: '#374151' }}>{p.description}</td>
                    <td style={{ padding: '8px 10px', color: '#6b7280' }}>—</td>
                    <td style={{ padding: '8px 10px' }}><ConfidenceBar value={p.confidence} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* MDM & E&M */}
      {(claim.em_level || claim.mdm_complexity) && (
        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>MDM & E&M Level</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {claim.em_level && (
              <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 14px' }}>
                <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>E&M Level</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#4f46e5', fontFamily: 'monospace' }}>{claim.em_level}</div>
              </div>
            )}
            {claim.mdm_complexity && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 14px' }}>
                <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>MDM Complexity</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#15803d', textTransform: 'capitalize' }}>{claim.mdm_complexity}</div>
              </div>
            )}
            {claim.drg_code && (
              <div style={{ background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: '8px 14px' }}>
                <div style={{ fontSize: 11, color: '#9333ea', fontWeight: 600 }}>DRG</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#7e22ce' }}>{claim.drg_code}</div>
                {claim.drg_description && <div style={{ fontSize: 11, color: '#9ca3af' }}>{claim.drg_description}</div>}
              </div>
            )}
          </div>
        </section>
      )}

      {/* HCC codes */}
      {hcc.length > 0 && (
        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>HCC Risk Adjustment Codes</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {hcc.map((h, i) => (
              <div key={i} style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '6px 12px' }}>
                <div style={{ fontWeight: 700, color: '#0369a1', fontFamily: 'monospace', fontSize: 13 }}>{h.code}</div>
                <div style={{ fontSize: 11, color: '#374151' }}>{h.description}</div>
                {h.risk_weight && <div style={{ fontSize: 11, color: '#0ea5e9', fontWeight: 600 }}>Risk weight: {h.risk_weight}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Coding queries */}
      {queries.length > 0 && (
        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>Coding Queries ({queries.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {queries.map((q, i) => (
              <div key={i} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontWeight: 600, color: '#92400e', fontSize: 13 }}>{q.field}: {q.question}</div>
                  <div style={{ fontSize: 12, color: '#78350f', marginTop: 2 }}>{q.reason}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Compliance flags */}
      {flags.length > 0 && (
        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>Compliance Flags ({flags.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {flags.map((f, i) => {
              const bgColor = f.severity === 'high' ? '#fee2e2' : f.severity === 'medium' ? '#fef3c7' : '#dbeafe'
              const borderColor = f.severity === 'high' ? '#fecaca' : f.severity === 'medium' ? '#fde68a' : '#bfdbfe'
              const textColor = f.severity === 'high' ? '#991b1b' : f.severity === 'medium' ? '#92400e' : '#1e40af'
              return (
                <div key={i} style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <AlertOctagon size={16} color={f.severity === 'high' ? '#dc2626' : f.severity === 'medium' ? '#d97706' : '#2563eb'} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontWeight: 700, color: textColor, fontSize: 13 }}>{f.type?.replace(/_/g, ' ').toUpperCase()}</span>
                      <SeverityBadge severity={f.severity} />
                      {f.code && <span style={{ fontFamily: 'monospace', fontSize: 11, color: textColor }}>{f.code}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: textColor }}>{f.description}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Scrub results */}
      {scrub && (
        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>Claim Scrub Results</div>
          <div style={{ background: scrub.scrub_passed ? '#f0fdf4' : '#fef2f2', border: `1px solid ${scrub.scrub_passed ? '#bbf7d0' : '#fecaca'}`, borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              {scrub.scrub_passed ? <CheckCircle2 size={18} color="#16a34a" /> : <AlertOctagon size={18} color="#dc2626" />}
              <span style={{ fontWeight: 700, color: scrub.scrub_passed ? '#15803d' : '#dc2626' }}>
                {scrub.scrub_passed ? 'Scrub Passed' : 'Issues Found'} — Risk: {scrub.risk_level?.toUpperCase()}
              </span>
            </div>
            {scrub.summary && <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>{scrub.summary}</p>}
            {scrub.issues?.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {scrub.issues.map((iss, i) => (
                  <div key={i} style={{ background: 'rgba(255,255,255,.5)', borderRadius: 6, padding: '8px 12px' }}>
                    <div style={{ fontWeight: 600, color: '#374151', fontSize: 13 }}>{iss.type?.replace(/_/g, ' ')} <SeverityBadge severity={iss.severity} /></div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{iss.description}</div>
                    {iss.recommendation && <div style={{ fontSize: 11, color: '#4f46e5', marginTop: 3 }}>Rec: {iss.recommendation}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* FHIR Claim */}
      {fhir && (
        <section>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>FHIR R4 Claim Resource</div>
          <FhirBlock json={fhir} />
        </section>
      )}

      {/* Action buttons */}
      {showActions && claim.id && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 4 }}>
          {onScrub && (
            <button onClick={() => onScrub(claim.id)} style={{ padding: '8px 16px', borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Shield size={14} /> Run Claim Scrub
            </button>
          )}
          {onSubmit && claim.status !== 'submitted' && (
            <button
              onClick={() => onSubmit(claim.id)}
              disabled={hasHighFlag}
              title={hasHighFlag ? 'Resolve high-severity compliance flags before submitting' : ''}
              style={{ padding: '8px 16px', borderRadius: 8, background: hasHighFlag ? '#f3f4f6' : '#4f46e5', border: 'none', color: hasHighFlag ? '#9ca3af' : '#fff', fontWeight: 600, fontSize: 13, cursor: hasHighFlag ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileCheck size={14} /> Submit Claim
            </button>
          )}
          {onStatusUpdate && claim.status === 'draft' && (
            <button onClick={() => onStatusUpdate(claim.id, 'under_review')} style={{ padding: '8px 16px', borderRadius: 8, background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Mark Under Review
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function parseJson(val, fallback) {
  if (!val) return fallback
  if (typeof val === 'object') return val
  try { return JSON.parse(val) } catch { return fallback }
}

// ── Claim Card ─────────────────────────────────────────────────────────────────
function ClaimCard({ claim, onScrub, onSubmit, onStatusUpdate, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [scrubbing, setScrubbing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { key } = useKey()

  async function handleScrub(id) {
    setScrubbing(true)
    await API(`/billing/scrub/${id}`, { method: 'POST', key })
    await onRefresh()
    setScrubbing(false)
  }
  async function handleSubmit(id) {
    setSubmitting(true)
    await API(`/billing/${id}/submit`, { method: 'POST', key })
    await onRefresh()
    setSubmitting(false)
  }
  async function handleStatusUpdate(id, status) {
    await API(`/billing/${id}`, { method: 'PUT', key, body: JSON.stringify({ status }) })
    await onRefresh()
  }

  const flags = parseJson(claim.compliance_flags, [])
  const queries = parseJson(claim.coding_queries, [])
  const highFlags = flags.filter(f => f.severity === 'high').length

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, boxShadow: '0 1px 4px rgba(0,0,0,.06)', overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
      >
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 700, color: '#111827', fontSize: 15 }}>{claim.patient_name}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{claim.encounter_date || claim.created_at?.slice(0,10)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {claim.em_level && (
            <span style={{ background: '#eef2ff', color: '#4f46e5', fontSize: 12, fontWeight: 800, padding: '2px 10px', borderRadius: 99, fontFamily: 'monospace' }}>{claim.em_level}</span>
          )}
          {claim.drg_code && (
            <span style={{ background: '#fdf4ff', color: '#9333ea', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>DRG {claim.drg_code}</span>
          )}
          {highFlags > 0 && (
            <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertOctagon size={11} /> {highFlags} High Risk
            </span>
          )}
          {queries.length > 0 && (
            <span style={{ background: '#fffbeb', color: '#d97706', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
              {queries.length} Quer{queries.length === 1 ? 'y' : 'ies'}
            </span>
          )}
          <StatusBadge status={claim.status} />
          {claim.total_charges > 0 && (
            <span style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>${claim.total_charges?.toFixed(2)}</span>
          )}
        </div>
        <div style={{ color: '#9ca3af' }}>
          {(scrubbing || submitting) ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </div>
      {open && (
        <div style={{ padding: '0 18px 18px' }}>
          <CodingDetails
            claim={claim}
            onScrub={handleScrub}
            onSubmit={handleSubmit}
            onStatusUpdate={handleStatusUpdate}
            apiKey={key}
          />
        </div>
      )}
    </div>
  )
}

// ── Stats strip ────────────────────────────────────────────────────────────────
function StatsStrip({ stats }) {
  const items = [
    { label: 'Total Claims', value: stats.total ?? '—' },
    { label: 'Draft', value: stats.draft ?? '—' },
    { label: 'Submitted', value: stats.submitted ?? '—' },
    { label: 'Total Charges', value: stats.total_charges_sum != null ? `$${stats.total_charges_sum.toFixed(0)}` : '—' },
    { label: 'High Risk Flags', value: stats.high_risk_flags ?? '—', warn: stats.high_risk_flags > 0 },
    { label: 'Pending Queries', value: stats.pending_queries ?? '—', warn: stats.pending_queries > 0 },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 24 }}>
      {items.map(s => (
        <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: s.warn ? '#dc2626' : '#4f46e5' }}>{s.value}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Billing() {
  const { key } = useKey()
  const [tab, setTab] = useState('claims')
  const [claims, setClaims] = useState([])
  const [stats, setStats] = useState({})
  const [patients, setPatients] = useState([])
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)

  // Suggestion form state
  const [sugPatient, setSugPatient] = useState('')
  const [sugCase, setSugCase] = useState('')
  const [sugNote, setSugNote] = useState('')
  const [sugDate, setSugDate] = useState(new Date().toISOString().slice(0, 10))
  const [suggesting, setSuggesting] = useState(false)
  const [suggestion, setSuggestion] = useState(null)
  const [sugError, setSugError] = useState('')

  const fetchClaims = useCallback(async () => {
    setLoading(true)
    const data = await API('/billing', { key })
    setClaims(data.claims || [])
    setLoading(false)
  }, [key])

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    const data = await API('/billing/stats', { key })
    setStats(data)
    setStatsLoading(false)
  }, [key])

  useEffect(() => {
    fetchClaims()
    fetchStats()
    API('/gen-patients', { key }).then(d => setPatients(d.patients || []))
  }, [fetchClaims, fetchStats, key])

  useEffect(() => {
    if (sugPatient) {
      API(`/cases?patient_id=${sugPatient}`, { key }).then(d => setCases(d.cases || []))
    } else {
      setCases([])
    }
  }, [sugPatient, key])

  async function handleSuggest() {
    if (!sugPatient || !sugNote) { setSugError('Please select a patient and enter a clinical note.'); return }
    setSugError('')
    setSuggesting(true)
    try {
      const data = await API('/billing/suggest', {
        method: 'POST', key,
        body: JSON.stringify({ patient_id: sugPatient, case_id: sugCase || undefined, clinical_note: sugNote, encounter_date: sugDate })
      })
      if (data.error) { setSugError(data.error) } else {
        setSuggestion(data)
      }
    } catch (e) { setSugError(e.message) }
    setSuggesting(false)
  }

  async function handleSaveAsClaim() {
    await fetchClaims()
    await fetchStats()
    setTab('claims')
    setSuggestion(null)
    setSugNote('')
    setSugPatient('')
    setSugCase('')
  }

  const allFlags = claims.flatMap(c => {
    const flags = parseJson(c.compliance_flags, [])
    return flags.map(f => ({ ...f, patient_name: c.patient_name, claim_id: c.id }))
  })
  const highFlags = allFlags.filter(f => f.severity === 'high')
  const medFlags = allFlags.filter(f => f.severity === 'medium')
  const lowFlags = allFlags.filter(f => f.severity === 'low')

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto', background: '#f9fafb', minHeight: '100vh' }}>
      {/* Page header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Receipt size={26} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#111827' }}>Coding & Billing Automation</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>ICD-10-CM · CPT/HCPCS · DRG grouping · HCC capture · Claim scrubbing · FHIR Claim</p>
        </div>
        <button onClick={() => { fetchClaims(); fetchStats() }} style={{ padding: '8px 14px', borderRadius: 8, background: '#fff', border: '1px solid #e5e7eb', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <StatsStrip stats={stats} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[
          { key: 'claims', label: 'Claims', icon: FileText },
          { key: 'suggest', label: 'Code Suggestions', icon: Activity },
          { key: 'compliance', label: 'Compliance', icon: Shield },
        ].map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '7px 16px', borderRadius: 9, background: tab === t.key ? '#4f46e5' : 'transparent', border: 'none', color: tab === t.key ? '#fff' : '#6b7280', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s' }}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* Claims tab */}
      {tab === 'claims' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: '#374151', fontSize: 15 }}>{claims.length} claim{claims.length !== 1 ? 's' : ''}</div>
            <button onClick={() => setTab('suggest')} style={{ padding: '8px 18px', borderRadius: 9, background: '#4f46e5', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
              <DollarSign size={15} /> Code New Encounter
            </button>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#6b7280' }}><Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} /></div>
          ) : claims.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
              <FileCheck size={40} style={{ marginBottom: 12, opacity: .3 }} />
              <div style={{ fontSize: 16, fontWeight: 600 }}>No claims yet</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Use "Code New Encounter" to generate your first claim</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {claims.map(c => (
                <ClaimCard key={c.id} claim={c} onRefresh={async () => { await fetchClaims(); await fetchStats() }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Code Suggestions tab */}
      {tab === 'suggest' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24 }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 800, color: '#111827' }}>Generate Code Suggestions</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Patient *</label>
                <select
                  value={sugPatient}
                  onChange={e => { setSugPatient(e.target.value); setSugCase(''); setSuggestion(null) }}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#111827', background: '#fff' }}
                >
                  <option value="">Select patient…</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Case (optional)</label>
                <select
                  value={sugCase}
                  onChange={e => { setSugCase(e.target.value); setSuggestion(null) }}
                  disabled={!sugPatient}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#111827', background: '#fff' }}
                >
                  <option value="">No case selected</option>
                  {cases.map(c => <option key={c.id} value={c.id}>{c.chief_complaint || c.id}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Encounter Date</label>
              <input
                type="date"
                value={sugDate}
                onChange={e => setSugDate(e.target.value)}
                style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#111827' }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Clinical Note *</label>
              <textarea
                value={sugNote}
                onChange={e => { setSugNote(e.target.value); setSuggestion(null) }}
                placeholder="Paste or type the clinical note, SOAP note, discharge summary, or encounter documentation…"
                rows={8}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#111827', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
            {sugError && (
              <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 12 }}>
                {sugError}
              </div>
            )}
            <button
              onClick={handleSuggest}
              disabled={suggesting}
              style={{ padding: '10px 24px', borderRadius: 9, background: '#4f46e5', border: 'none', color: '#fff', fontWeight: 700, fontSize: 14, cursor: suggesting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: suggesting ? .7 : 1 }}
            >
              {suggesting ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</> : <><Activity size={16} /> Generate Code Suggestions</>}
            </button>
          </div>

          {suggestion && (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#111827' }}>Suggested Codes — {suggestion.patient_name}</h2>
                <button
                  onClick={handleSaveAsClaim}
                  style={{ padding: '8px 18px', borderRadius: 9, background: '#4f46e5', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <ClipboardCheck size={14} /> Saved — View in Claims
                </button>
              </div>
              <CodingDetails claim={suggestion.claim} showActions={false} />
            </div>
          )}
        </div>
      )}

      {/* Compliance tab */}
      {tab === 'compliance' && (
        <div>
          {allFlags.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#16a34a' }}>
              <CheckCircle2 size={48} style={{ marginBottom: 12, opacity: .5 }} />
              <div style={{ fontSize: 18, fontWeight: 700 }}>No compliance issues found</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>All claims are clean</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {[
                { severity: 'high', flags: highFlags, label: 'High Severity', color: '#dc2626', bg: '#fee2e2', border: '#fecaca' },
                { severity: 'medium', flags: medFlags, label: 'Medium Severity', color: '#d97706', bg: '#fef3c7', border: '#fde68a' },
                { severity: 'low', flags: lowFlags, label: 'Low Severity', color: '#2563eb', bg: '#dbeafe', border: '#bfdbfe' },
              ].filter(g => g.flags.length > 0).map(group => (
                <div key={group.severity}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: group.color, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertOctagon size={15} /> {group.label} ({group.flags.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {group.flags.map((f, i) => (
                      <div key={i} style={{ background: group.bg, border: `1px solid ${group.border}`, borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>{f.patient_name}</span>
                            <span style={{ background: 'rgba(255,255,255,.7)', color: group.color, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, textTransform: 'uppercase' }}>{f.type?.replace(/_/g, ' ')}</span>
                            {f.code && <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#6b7280' }}>{f.code}</span>}
                          </div>
                          <div style={{ fontSize: 13, color: '#374151' }}>{f.description}</div>
                        </div>
                        <button
                          onClick={() => { setTab('claims') }}
                          style={{ padding: '5px 12px', borderRadius: 7, background: '#fff', border: `1px solid ${group.border}`, color: group.color, fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
                        >
                          Review
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
