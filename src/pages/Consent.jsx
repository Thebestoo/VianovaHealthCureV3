import React, { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck, Plus, X, FileDown, RotateCcw, ClipboardList,
  AlertTriangle, ChevronDown, ChevronUp, Loader2, User, Calendar,
  CheckCircle2, Copy, Check, Zap, Eye, Bell, Download, Search,
  Lock, Unlock, FileText, Activity
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import SummaryActions from '../components/SummaryActions.jsx'

// ── Constants ──────────────────────────────────────────────────────────────────

const CONSENT_TYPES = [
  { value: 'treatment', label: 'Treatment Authorization', sensitive: false },
  { value: 'research', label: 'Research Participation', sensitive: false },
  { value: 'data_sharing', label: 'Data Sharing', sensitive: false },
  { value: 'marketing', label: 'Marketing Communications', sensitive: false },
  { value: 'sensitive_mental_health', label: 'Mental Health Records', sensitive: true },
  { value: 'sensitive_substance_abuse', label: 'Substance Use / Abuse Records', sensitive: true },
  { value: 'sensitive_hiv', label: 'HIV/AIDS Information', sensitive: true },
  { value: 'sensitive_reproductive', label: 'Reproductive Health', sensitive: true },
]

const TYPE_COLORS = {
  treatment:                  { color: '#1d4ed8', bg: '#dbeafe' },
  research:                   { color: '#7c3aed', bg: '#ede9fe' },
  data_sharing:               { color: '#0891b2', bg: '#cffafe' },
  marketing:                  { color: '#6b7280', bg: '#f3f4f6' },
  sensitive_mental_health:    { color: '#b91c1c', bg: '#fee2e2' },
  sensitive_substance_abuse:  { color: '#b91c1c', bg: '#fee2e2' },
  sensitive_hiv:              { color: '#92400e', bg: '#fef3c7' },
  sensitive_reproductive:     { color: '#9d174d', bg: '#fce7f3' },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return d }
}

function fmtDateTime(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return d }
}

// ── Small UI pieces ────────────────────────────────────────────────────────────

function FL({ children }) {
  return (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
      {children}
    </label>
  )
}

function InputEl({ style, ...props }) {
  return (
    <input
      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box', ...style }}
      {...props}
    />
  )
}

function TextareaEl({ style, ...props }) {
  return (
    <textarea
      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', ...style }}
      {...props}
    />
  )
}

function SelectEl({ style, ...props }) {
  return (
    <select
      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', boxSizing: 'border-box', ...style }}
      {...props}
    />
  )
}

function TypeBadge({ type }) {
  const ct = CONSENT_TYPES.find(t => t.value === type)
  const label = ct ? ct.label : (type || '').replace(/_/g, ' ')
  const isSensitive = ct?.sensitive || (type || '').startsWith('sensitive_')
  const c = TYPE_COLORS[type] || (isSensitive ? { color: '#b91c1c', bg: '#fee2e2' } : { color: '#6b7280', bg: '#f3f4f6' })
  return (
    <span style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: c.color, background: c.bg, display: 'inline-flex', alignItems: 'center', gap: 4, textTransform: 'capitalize' }}>
      {isSensitive && <Lock size={9} />}
      {label}
    </span>
  )
}

function StatusBadge({ status, expiresAt }) {
  const expiringSoon = status === 'active' && expiresAt && (() => {
    const diff = (new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff < 30
  })()
  const map = {
    active:             { label: 'Active',             color: '#065f46', bg: '#d1fae5' },
    pending:            { label: 'Pending Signature',  color: '#92400e', bg: '#fef3c7' },
    revoked:            { label: 'Revoked',            color: '#991b1b', bg: '#fee2e2' },
    expired:            { label: 'Expired',            color: '#6b7280', bg: '#f3f4f6' },
    deletion_requested: { label: 'Deletion Requested', color: '#7c2d12', bg: '#ffedd5' },
  }
  const s = map[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: s.color, background: s.bg }}>{s.label}</span>
      {expiringSoon && (
        <span style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fef3c7', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <AlertTriangle size={10} /> Expiring Soon
        </span>
      )}
    </span>
  )
}

function SeverityBadge({ severity }) {
  const map = { info: { color: '#1d4ed8', bg: '#dbeafe' }, high: { color: '#b91c1c', bg: '#fee2e2' }, medium: { color: '#92400e', bg: '#fef3c7' } }
  const s = map[severity] || map.info
  return <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, textTransform: 'capitalize' }}>{severity || 'info'}</span>
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}
      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 11, color: '#374151', cursor: 'pointer' }}
    >
      {copied ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── Consent Card ───────────────────────────────────────────────────────────────

function ConsentCard({ c, apiKey, onRefresh }) {
  const [expanded, setExpanded] = useState(false)
  const [showFhir, setShowFhir] = useState(false)
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const [showSignModal, setShowSignModal] = useState(false)
  const [showBgModal, setShowBgModal] = useState(false)
  const [revokeReason, setRevokeReason] = useState('')
  const [bgReason, setBgReason] = useState('')
  const [signSig, setSignSig] = useState('')
  const [signName, setSignName] = useState(c.signee_name || '')
  const [working, setWorking] = useState(false)
  const [deleteWorking, setDeleteWorking] = useState(false)
  const [deleteReport, setDeleteReport] = useState(null)

  const fhirParsed = c.fhir_consent ? (() => { try { return JSON.parse(c.fhir_consent) } catch { return null } })() : null

  async function doRevoke() {
    setWorking(true)
    await fetch(`/api/consent/${c.id}/revoke`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify({ revoke_reason: revokeReason }) })
    setWorking(false); setShowRevokeModal(false); onRefresh()
  }

  async function doSign() {
    if (!signSig.trim()) return
    setWorking(true)
    await fetch(`/api/consent/${c.id}/sign`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify({ signature: signSig, signee_name: signName }) })
    setWorking(false); setShowSignModal(false); onRefresh()
  }

  async function doBreakGlass() {
    if (!bgReason.trim()) return
    setWorking(true)
    await fetch('/api/consent/break-glass', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify({ patient_id: c.patient_id, reason: bgReason, actor: apiKey }) })
    setWorking(false); setShowBgModal(false); onRefresh()
  }

  async function doDeleteRequest() {
    if (!window.confirm('Submit GDPR right-to-delete request? This will flag the patient record for data deletion review.')) return
    setDeleteWorking(true)
    const r = await fetch(`/api/consent/${c.id}/delete-request`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey }, body: JSON.stringify({ reason: 'Patient requested data deletion under GDPR right to erasure' }) })
    const d = await r.json()
    setDeleteReport(d.report)
    setDeleteWorking(false)
    onRefresh()
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', transition: 'box-shadow .15s' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{c.patient_name}</span>
            <StatusBadge status={c.status} expiresAt={c.expires_at} />
            {c.break_glass_accessed === 1 && (
              <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fef3c7', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Zap size={9} /> Break-Glass Used
              </span>
            )}
          </div>
          <div style={{ marginBottom: 6 }}><TypeBadge type={c.consent_type} /></div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#6b7280' }}>
            {c.signee_name && <span><User size={11} style={{ marginRight: 3 }} />Signed by: <strong style={{ color: '#374151' }}>{c.signee_name}</strong></span>}
            {c.signed_at && <span><Calendar size={11} style={{ marginRight: 3 }} />Signed: <strong style={{ color: '#374151' }}>{fmtDate(c.signed_at)}</strong></span>}
            {c.expires_at && <span><Calendar size={11} style={{ marginRight: 3 }} />Expires: <strong style={{ color: '#374151' }}>{fmtDate(c.expires_at)}</strong></span>}
          </div>
        </div>
        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
          {c.status === 'pending' && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowSignModal(true)}>
              <CheckCircle2 size={12} /> Sign Now
            </button>
          )}
          {c.status === 'active' && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowRevokeModal(true)} style={{ color: '#dc2626', borderColor: '#fecaca' }}>
              <RotateCcw size={12} /> Revoke
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => setShowBgModal(true)} style={{ color: '#92400e', borderColor: '#fde68a' }}>
            <Zap size={12} /> Break-Glass
          </button>
          {fhirParsed && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowFhir(v => !v)}>
              <FileText size={12} /> FHIR
            </button>
          )}
          {c.status === 'active' && (
            <button className="btn btn-secondary btn-sm" onClick={doDeleteRequest} disabled={deleteWorking} style={{ color: '#7c3aed' }}>
              {deleteWorking ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <><X size={12} /> GDPR Delete</>}
            </button>
          )}
          <button onClick={() => setExpanded(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, display: 'flex' }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {c.scope && <div style={{ fontSize: 13 }}><strong style={{ color: '#374151' }}>Scope:</strong> <span style={{ color: '#6b7280' }}>{c.scope}</span></div>}
          {c.restrictions && <div style={{ fontSize: 13 }}><strong style={{ color: '#374151' }}>Restrictions:</strong> <span style={{ color: '#6b7280' }}>{c.restrictions}</span></div>}
          {c.signature && <div style={{ fontSize: 13 }}><strong style={{ color: '#374151' }}>E-Signature:</strong> <span style={{ color: '#6b7280', fontStyle: 'italic' }}>"{c.signature}"</span></div>}
          {c.revoke_reason && <div style={{ fontSize: 13 }}><strong style={{ color: '#dc2626' }}>Revoke reason:</strong> <span style={{ color: '#6b7280' }}>{c.revoke_reason}</span></div>}
          {c.break_glass_reason && <div style={{ fontSize: 13 }}><strong style={{ color: '#92400e' }}>Break-glass reason:</strong> <span style={{ color: '#6b7280' }}>{c.break_glass_reason}</span></div>}
        </div>
      )}

      {/* FHIR viewer */}
      {showFhir && fhirParsed && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.06em' }}>FHIR Consent Resource</span>
            <CopyBtn text={JSON.stringify(fhirParsed, null, 2)} />
          </div>
          <pre style={{ background: '#1e293b', color: '#e2e8f0', borderRadius: 8, padding: '12px 14px', fontSize: 11, overflowX: 'auto', margin: 0, maxHeight: 300, overflowY: 'auto' }}>
            {JSON.stringify(fhirParsed, null, 2)}
          </pre>
        </div>
      )}

      {/* GDPR Delete Report */}
      {deleteReport && (
        <div style={{ marginTop: 12, padding: '12px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#7c2d12', marginBottom: 8 }}>GDPR Deletion Report</div>
          {deleteReport.summary && <p style={{ fontSize: 12, color: '#374151', margin: '0 0 8px' }}>{deleteReport.summary}</p>}
          {deleteReport.summary && (
            <div style={{ marginBottom: 8 }}>
              <SummaryActions compact title="GDPR Deletion Report" filename="gdpr-deletion-report.txt" text={deleteReport.summary} />
            </div>
          )}
          {deleteReport.can_delete?.length > 0 && <div style={{ fontSize: 12, marginBottom: 4 }}><strong style={{ color: '#065f46' }}>Can Delete:</strong> {deleteReport.can_delete.join(', ')}</div>}
          {deleteReport.must_retain?.length > 0 && <div style={{ fontSize: 12, marginBottom: 4 }}><strong style={{ color: '#991b1b' }}>Must Retain ({deleteReport.retention_period_years}yr):</strong> {deleteReport.must_retain.join(', ')}</div>}
          {deleteReport.redact_only?.length > 0 && <div style={{ fontSize: 12 }}><strong style={{ color: '#92400e' }}>Redact Only:</strong> {deleteReport.redact_only.join(', ')}</div>}
        </div>
      )}

      {/* Revoke Modal */}
      {showRevokeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={e => e.target === e.currentTarget && setShowRevokeModal(false)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 400, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#dc2626', marginBottom: 12 }}>Revoke Consent</div>
            <FL>Reason for revocation (optional)</FL>
            <TextareaEl rows={3} value={revokeReason} onChange={e => setRevokeReason(e.target.value)} placeholder="Patient withdrew consent…" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowRevokeModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={doRevoke} disabled={working} style={{ background: '#dc2626', borderColor: '#dc2626' }}>
                {working ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : 'Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign Modal */}
      {showSignModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={e => e.target === e.currentTarget && setShowSignModal(false)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 420, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#111827', marginBottom: 14 }}>Capture E-Signature</div>
            <div style={{ marginBottom: 12 }}>
              <FL>Signee Name *</FL>
              <InputEl value={signName} onChange={e => setSignName(e.target.value)} placeholder="Full legal name" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <FL>Type Signature (legal e-signature) *</FL>
              <InputEl value={signSig} onChange={e => setSignSig(e.target.value)} placeholder="Type full name as signature…" style={{ fontFamily: 'Georgia, serif', fontSize: 15 }} />
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>By typing your name, you agree this constitutes a legally binding electronic signature.</div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowSignModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={doSign} disabled={working || !signSig.trim()}>
                {working ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <><CheckCircle2 size={12} /> Sign & Activate</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Break-Glass Modal */}
      {showBgModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={e => e.target === e.currentTarget && setShowBgModal(false)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 420, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.25)', border: '2px solid #f59e0b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Zap size={18} color="#f59e0b" />
              <span style={{ fontWeight: 700, fontSize: 16, color: '#92400e' }}>Emergency Break-Glass Access</span>
            </div>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>This action bypasses consent restrictions for emergency access. All access will be logged and audited.</p>
            <FL>Emergency reason (required) *</FL>
            <TextareaEl rows={3} value={bgReason} onChange={e => setBgReason(e.target.value)} placeholder="Patient is unconscious and requires immediate treatment…" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowBgModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={doBreakGlass} disabled={working || !bgReason.trim()} style={{ background: '#f59e0b', borderColor: '#f59e0b', color: '#fff' }}>
                {working ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <><Zap size={12} /> Confirm Emergency Access</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── New Consent Modal ─────────────────────────────────────────────────────────

const EMPTY_FORM = { patient_id: '', consent_type: 'treatment', scope: '', restrictions: '', expires_at: '', signee_name: '', signature: '' }

function NewConsentModal({ patients, onClose, onSaved, apiKey }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.patient_id) { setErr('Please select a patient.'); return }
    setSaving(true); setErr('')
    try {
      const r = await fetch('/api/consent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(form),
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Save failed') }
      onSaved()
    } catch (e) { setErr(e.message) }
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '28px 16px', overflowY: 'auto' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, boxShadow: '0 24px 64px rgba(0,0,0,.22)', marginBottom: 28 }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={18} color="#2563eb" /> New Consent</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} noValidate style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626', display: 'flex', gap: 7, alignItems: 'center' }}><AlertTriangle size={13} /> {err}</div>}
          <div>
            <FL>Patient *</FL>
            <SelectEl value={form.patient_id} onChange={e => set('patient_id', e.target.value)}>
              <option value="">— Select patient —</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectEl>
          </div>
          <div>
            <FL>Consent Type *</FL>
            <SelectEl value={form.consent_type} onChange={e => set('consent_type', e.target.value)}>
              {CONSENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}{t.sensitive ? ' (Sensitive)' : ''}</option>)}
            </SelectEl>
          </div>
          <div>
            <FL>Scope <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></FL>
            <TextareaEl rows={2} value={form.scope} onChange={e => set('scope', e.target.value)} placeholder="What this consent covers…" />
          </div>
          <div>
            <FL>Restrictions <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></FL>
            <TextareaEl rows={2} value={form.restrictions} onChange={e => set('restrictions', e.target.value)} placeholder="Any limitations or conditions…" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <FL>Signee Name</FL>
              <InputEl value={form.signee_name} onChange={e => set('signee_name', e.target.value)} placeholder="Patient or guardian name" />
            </div>
            <div>
              <FL>Expires At <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></FL>
              <InputEl type="date" value={form.expires_at} onChange={e => set('expires_at', e.target.value)} />
            </div>
          </div>
          <div>
            <FL>E-Signature (typed) <span style={{ color: '#9ca3af', fontWeight: 400 }}>(leave blank to sign later)</span></FL>
            <InputEl value={form.signature} onChange={e => set('signature', e.target.value)} placeholder="Type full name as legal e-signature" style={{ fontFamily: 'Georgia, serif', fontSize: 14 }} />
            {form.signature && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>By typing your name, you agree this constitutes a legally binding electronic signature.</div>}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
              {saving ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : <><Plus size={13} /> Create Consent</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Consent() {
  const { key } = useKey()

  const [tab, setTab] = useState('consents')
  const [patients, setPatients] = useState([])
  const [filterPid, setFilterPid] = useState('')
  const [showModal, setShowModal] = useState(false)

  // Consents tab
  const [consents, setConsents] = useState([])
  const [loadingConsents, setLoadingConsents] = useState(false)

  // Audit tab
  const [auditEvents, setAuditEvents] = useState([])
  const [loadingAudit, setLoadingAudit] = useState(false)

  // Export tab
  const [exportPid, setExportPid] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportBundle, setExportBundle] = useState(null)
  const [exportedAt, setExportedAt] = useState(null)

  // Alerts tab
  const [expiring, setExpiring] = useState([])
  const [violations, setViolations] = useState([])
  const [loadingAlerts, setLoadingAlerts] = useState(false)

  // Stats
  const [stats, setStats] = useState({ total: 0, active: 0, expiring: 0, violations: 0, pendingDeletion: 0 })

  // Load patients once
  useEffect(() => {
    if (!key) return
    fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      .then(r => r.json())
      .then(d => setPatients(d.patients || []))
      .catch(() => {})
  }, [key])

  const loadConsents = useCallback(async () => {
    if (!key) return
    setLoadingConsents(true)
    try {
      const url = filterPid ? `/api/consent?patient_id=${filterPid}` : '/api/consent'
      const d = await fetch(url, { headers: { 'x-api-key': key } }).then(r => r.json())
      const list = d.consents || []
      setConsents(list)
      // Compute stats
      const now = new Date()
      const in30 = new Date(now.getTime() + 30 * 86400000)
      setStats({
        total: list.length,
        active: list.filter(c => c.status === 'active').length,
        expiring: list.filter(c => c.status === 'active' && c.expires_at && new Date(c.expires_at) <= in30 && new Date(c.expires_at) >= now).length,
        violations: 0, // filled from audit
        pendingDeletion: list.filter(c => c.status === 'deletion_requested').length,
      })
    } catch { setConsents([]) }
    setLoadingConsents(false)
  }, [key, filterPid])

  const loadAudit = useCallback(async () => {
    if (!key) return
    setLoadingAudit(true)
    try {
      const url = filterPid ? `/api/consent/audit?patient_id=${filterPid}` : '/api/consent/audit'
      const d = await fetch(url, { headers: { 'x-api-key': key } }).then(r => r.json())
      const events = d.events || []
      setAuditEvents(events)
      setStats(s => ({ ...s, violations: events.filter(e => e.violation === 1).length }))
    } catch { setAuditEvents([]) }
    setLoadingAudit(false)
  }, [key, filterPid])

  const loadAlerts = useCallback(async () => {
    if (!key) return
    setLoadingAlerts(true)
    try {
      const [expR, audR] = await Promise.all([
        fetch('/api/consent/expiring', { headers: { 'x-api-key': key } }).then(r => r.json()),
        fetch('/api/consent/audit', { headers: { 'x-api-key': key } }).then(r => r.json()),
      ])
      setExpiring(expR.consents || [])
      setViolations((audR.events || []).filter(e => e.violation === 1).slice(0, 50))
    } catch {}
    setLoadingAlerts(false)
  }, [key])

  useEffect(() => { if (tab === 'consents') loadConsents() }, [tab, loadConsents])
  useEffect(() => { if (tab === 'audit') loadAudit() }, [tab, loadAudit])
  useEffect(() => { if (tab === 'alerts') loadAlerts() }, [tab, loadAlerts])

  async function doExport() {
    if (!exportPid) return
    setExporting(true); setExportBundle(null)
    try {
      const r = await fetch(`/api/consent/export/${exportPid}`, { method: 'POST', headers: { 'x-api-key': key } })
      const d = await r.json()
      setExportBundle(d.bundle)
      setExportedAt(d.exported_at)
    } catch {}
    setExporting(false)
  }

  function downloadBundle() {
    if (!exportBundle) return
    const p = patients.find(x => String(x.id) === String(exportPid))
    const blob = new Blob([JSON.stringify(exportBundle, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${p?.name || 'patient'}-fhir-bundle.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const tabStyle = (t) => ({
    padding: '8px 18px', border: 'none',
    borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
    background: 'none', cursor: 'pointer',
    fontWeight: tab === t ? 700 : 500,
    color: tab === t ? '#2563eb' : '#6b7280',
    fontSize: 14, transition: 'all .15s',
  })

  const selectStyle = { padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }

  // Bundle summary by resourceType
  const bundleSummary = exportBundle ? exportBundle.entry?.reduce((acc, e) => {
    const rt = e.resource?.resourceType || 'Unknown'
    acc[rt] = (acc[rt] || 0) + 1
    return acc
  }, {}) : null

  return (
    <div>
      {/* Top bar */}
      <div className="topbar">
        <span className="topbar-title">Consent &amp; Privacy</span>
        <div className="topbar-right">
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
            <Plus size={14} /> New Consent
          </button>
        </div>
      </div>

      <div style={{ padding: '0 32px' }}>

        {/* Page header */}
        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ShieldCheck size={24} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0 }}>Patient Consent &amp; Privacy</h1>
            <p style={{ fontSize: 14, color: '#6b7280', margin: '2px 0 0' }}>HIPAA-compliant consent management with FHIR support, audit logging, and GDPR right-to-erasure</p>
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 20, marginBottom: 28 }}>
          {[
            { label: 'Total Consents', value: stats.total, color: '#1d4ed8', bg: '#dbeafe', icon: ShieldCheck },
            { label: 'Active', value: stats.active, color: '#065f46', bg: '#d1fae5', icon: CheckCircle2 },
            { label: 'Expiring Soon', value: stats.expiring, color: '#92400e', bg: '#fef3c7', icon: Bell },
            { label: 'Violations', value: stats.violations, color: '#991b1b', bg: '#fee2e2', icon: AlertTriangle },
            { label: 'Pending Deletion', value: stats.pendingDeletion, color: '#7c2d12', bg: '#ffedd5', icon: X },
          ].map(({ label, value, color, bg, icon: Icon }) => (
            <div key={label} style={{ background: bg, borderRadius: 14, padding: '22px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8 }}>
              <Icon size={24} color={color} />
              <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color, opacity: .75 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 24 }}>
          {[
            { id: 'consents', label: 'Consents', icon: ShieldCheck },
            { id: 'audit', label: 'Audit Log', icon: ClipboardList },
            { id: 'export', label: 'Data Export', icon: FileDown },
            { id: 'alerts', label: 'Privacy Alerts', icon: Bell },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} style={tabStyle(id)} onClick={() => setTab(id)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon size={14} /> {label}</span>
            </button>
          ))}
        </div>

        {/* Patient filter (Consents + Audit) */}
        {(tab === 'consents' || tab === 'audit') && (
          <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <User size={14} color="#6b7280" />
            <select value={filterPid} onChange={e => setFilterPid(e.target.value)} style={{ ...selectStyle, minWidth: 220 }}>
              <option value="">All Patients</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}

        {/* ── Tab: Consents ── */}
        {tab === 'consents' && (
          <>
            {loadingConsents ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
                <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }} />
              </div>
            ) : consents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
                <ShieldCheck size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: .3 }} />
                <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 6 }}>No consents found</div>
                <div style={{ fontSize: 13 }}>Click "New Consent" to capture a patient consent.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {consents.map(c => (
                  <ConsentCard key={c.id} c={c} apiKey={key} onRefresh={loadConsents} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Tab: Audit Log ── */}
        {tab === 'audit' && (
          <>
            {loadingAudit ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
                <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }} />
              </div>
            ) : auditEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
                <ClipboardList size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: .3 }} />
                <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 6 }}>No audit events</div>
                <div style={{ fontSize: 13 }}>Consent actions will appear here as they occur.</div>
              </div>
            ) : (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      {['Date', 'Event Type', 'Actor', 'Resource', 'Patient', 'Violation', 'Severity'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditEvents.map((ev, i) => {
                      const isViolation = ev.violation === 1
                      const isBreakGlass = ev.event_type === 'break_glass'
                      const rowBg = isViolation ? '#fef2f2' : isBreakGlass ? '#fffbeb' : 'transparent'
                      return (
                        <tr key={ev.id || i} style={{ borderBottom: i < auditEvents.length - 1 ? '1px solid #f3f4f6' : 'none', background: rowBg }}>
                          <td style={{ padding: '10px 14px', color: '#6b7280', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateTime(ev.created_at)}</td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: isViolation ? '#991b1b' : isBreakGlass ? '#92400e' : '#1d4ed8', background: isViolation ? '#fee2e2' : isBreakGlass ? '#fef3c7' : '#dbeafe' }}>
                              {(ev.event_type || '').replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', color: '#374151', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.actor || '—'}</td>
                          <td style={{ padding: '10px 14px', color: '#374151' }}>{ev.resource_accessed || '—'}</td>
                          <td style={{ padding: '10px 14px', color: '#374151' }}>{ev.patient_name || ev.patient_id || '—'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {isViolation
                              ? <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: '#991b1b', background: '#fee2e2' }}>Yes</span>
                              : <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 14px' }}><SeverityBadge severity={ev.severity} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Tab: Data Export ── */}
        {tab === 'export' && (
          <div style={{ maxWidth: 640 }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#111827', marginBottom: 4 }}>FHIR $everything Export</div>
              <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 18, margin: '0 0 18px' }}>Generate a FHIR Bundle containing all patient data (demographics, labs, appointments, consents, discharge summaries).</p>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <FL>Select Patient *</FL>
                  <SelectEl value={exportPid} onChange={e => { setExportPid(e.target.value); setExportBundle(null) }} style={{ width: '100%' }}>
                    <option value="">— Select patient —</option>
                    {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </SelectEl>
                </div>
                <button className="btn btn-primary btn-sm" onClick={doExport} disabled={!exportPid || exporting} style={{ flexShrink: 0 }}>
                  {exporting ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</> : <><Activity size={13} /> Generate FHIR Export</>}
                </button>
              </div>
            </div>

            {exportBundle && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>Bundle Ready</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>Exported at {fmtDateTime(exportedAt)}</div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={downloadBundle}>
                    <Download size={13} /> Download JSON
                  </button>
                </div>
                {bundleSummary && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>Resource Summary</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {Object.entries(bundleSummary).map(([rt, count]) => (
                        <div key={rt} style={{ padding: '6px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 13 }}>
                          <strong style={{ color: '#0369a1' }}>{count}</strong> <span style={{ color: '#6b7280' }}>{rt}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 13, color: '#6b7280' }}>
                      Total: <strong style={{ color: '#111827' }}>{exportBundle.entry?.length || 0}</strong> resources
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Privacy Alerts ── */}
        {tab === 'alerts' && (
          <>
            {loadingAlerts ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
                <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }} />
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Expiring Soon */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <Bell size={16} color="#92400e" />
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#92400e', margin: 0 }}>Expiring Soon (next 30 days)</h3>
                    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fef3c7' }}>{expiring.length}</span>
                  </div>
                  {expiring.length === 0 ? (
                    <div style={{ padding: '20px', background: '#f9fafb', borderRadius: 10, fontSize: 13, color: '#6b7280', textAlign: 'center' }}>No consents expiring in the next 30 days.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {expiring.map(c => (
                        <div key={c.id} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{c.patient_name}</div>
                            <TypeBadge type={c.consent_type} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#92400e' }}>
                            <Calendar size={13} /> Expires: <strong>{fmtDate(c.expires_at)}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Violations */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <AlertTriangle size={16} color="#991b1b" />
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#991b1b', margin: 0 }}>Recent Access Violations</h3>
                    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: '#991b1b', background: '#fee2e2' }}>{violations.length}</span>
                  </div>
                  {violations.length === 0 ? (
                    <div style={{ padding: '20px', background: '#f9fafb', borderRadius: 10, fontSize: 13, color: '#6b7280', textAlign: 'center' }}>No access violations recorded.</div>
                  ) : (
                    <div style={{ border: '1px solid #fecaca', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                            {['Date', 'Event', 'Actor', 'Patient', 'Detail'].map(h => (
                              <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {violations.map((ev, i) => (
                            <tr key={ev.id || i} style={{ borderBottom: i < violations.length - 1 ? '1px solid #fee2e2' : 'none', background: '#fff' }}>
                              <td style={{ padding: '9px 14px', color: '#6b7280', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDateTime(ev.created_at)}</td>
                              <td style={{ padding: '9px 14px' }}>
                                <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: '#991b1b', background: '#fee2e2' }}>{(ev.event_type || '').replace(/_/g, ' ')}</span>
                              </td>
                              <td style={{ padding: '9px 14px', color: '#374151' }}>{ev.actor || '—'}</td>
                              <td style={{ padding: '9px 14px', color: '#374151' }}>{ev.patient_name || ev.patient_id || '—'}</td>
                              <td style={{ padding: '9px 14px', color: '#6b7280', fontSize: 12 }}>{ev.detail || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* New Consent Modal */}
      {showModal && (
        <NewConsentModal
          patients={patients}
          apiKey={key}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadConsents() }}
        />
      )}

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
