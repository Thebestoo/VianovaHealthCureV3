import React, { useState, useEffect } from 'react'
import {
  ShieldCheck, Plus, X, FileDown, RotateCcw, ClipboardList,
  AlertTriangle, ChevronDown, Loader2, User, Calendar, CheckCircle2
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const CONSENT_TYPES = [
  'Treatment Authorization',
  'Data Sharing (Research)',
  'HIPAA Privacy Notice',
  'Telehealth Services',
  'Photography & Recording',
  'Financial Responsibility',
  'Mental Health Records',
  'Substance Use Records',
  'HIV/AIDS Information',
  'Custom...',
]

const today = () => new Date().toISOString().slice(0, 10)

function FL({ children }) {
  return (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
      {children}
    </label>
  )
}

function StatusBadge({ status, expiresAt }) {
  const expiringSoon = status === 'active' && expiresAt && (() => {
    const diff = (new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff < 30
  })()

  const map = {
    active:  { label: 'Active',  color: '#065f46', bg: '#d1fae5' },
    revoked: { label: 'Revoked', color: '#991b1b', bg: '#fee2e2' },
    expired: { label: 'Expired', color: '#6b7280', bg: '#f3f4f6' },
  }
  const s = map[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: s.color, background: s.bg }}>
        {s.label}
      </span>
      {expiringSoon && (
        <span style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fef3c7', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <AlertTriangle size={10} /> Expiring Soon
        </span>
      )}
    </span>
  )
}

function AuditActionBadge({ action }) {
  const map = {
    data_export:       { color: '#1d4ed8', bg: '#dbeafe' },
    consent_created:   { color: '#065f46', bg: '#d1fae5' },
    consent_updated:   { color: '#92400e', bg: '#fef3c7' },
    access_denied:     { color: '#991b1b', bg: '#fee2e2' },
  }
  const s = map[action] || { color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: s.color, background: s.bg }}>
      {action.replace(/_/g, ' ')}
    </span>
  )
}

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

function fmtDetails(details) {
  if (!details) return '—'
  let obj = details
  if (typeof details === 'string') {
    try { obj = JSON.parse(details) } catch { return details }
  }
  if (typeof obj !== 'object' || obj === null) return String(obj)
  return Object.entries(obj).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')
}

const EMPTY_FORM = {
  patient_id: '',
  consent_type: 'Treatment Authorization',
  custom_type: '',
  granted: true,
  signed_by: '',
  signed_date: today(),
  expires_at: '',
  notes: '',
}

export default function Consent() {
  const { key } = useKey()

  const [tab, setTab]           = useState('consents')
  const [patients, setPatients] = useState([])
  const [filterPid, setFilterPid] = useState('')

  // Consents tab
  const [consents, setConsents] = useState([])
  const [loadingConsents, setLoadingConsents] = useState(false)

  // Audit tab
  const [auditEvents, setAuditEvents] = useState([])
  const [loadingAudit, setLoadingAudit] = useState(false)

  // Modal
  const [showModal, setShowModal]   = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [formErr, setFormErr]       = useState('')

  // Revoke / Export
  const [revoking, setRevoking]     = useState(null)
  const [exporting, setExporting]   = useState(null)

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Load patients once
  useEffect(() => {
    if (!key) return
    fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      .then(r => r.json())
      .then(d => setPatients(d.patients || []))
      .catch(() => {})
  }, [key])

  // Load consents when filter or tab changes
  useEffect(() => {
    if (!key || tab !== 'consents') return
    loadConsents()
  }, [key, filterPid, tab])

  // Load audit when filter or tab changes
  useEffect(() => {
    if (!key || tab !== 'audit') return
    loadAudit()
  }, [key, filterPid, tab])

  async function loadConsents() {
    setLoadingConsents(true)
    try {
      const url = filterPid ? `/api/consents?patient_id=${filterPid}` : '/api/consents'
      const r = await fetch(url, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setConsents(Array.isArray(d) ? d : [])
    } catch { setConsents([]) }
    setLoadingConsents(false)
  }

  async function loadAudit() {
    setLoadingAudit(true)
    try {
      const url = filterPid ? `/api/audit-events?patient_id=${filterPid}` : '/api/audit-events'
      const r = await fetch(url, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setAuditEvents(Array.isArray(d) ? d : [])
    } catch { setAuditEvents([]) }
    setLoadingAudit(false)
  }

  function openModal() {
    setForm({ ...EMPTY_FORM, patient_id: filterPid || '' })
    setFormErr('')
    setShowModal(true)
  }

  // Auto-fill signed_by when patient changes
  function handlePatientSelect(pid) {
    setField('patient_id', pid)
    const p = patients.find(x => String(x.id) === String(pid))
    if (p) setField('signed_by', p.name)
    else setField('signed_by', '')
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.patient_id) { setFormErr('Please select a patient.'); return }
    const ct = form.consent_type === 'Custom...' ? form.custom_type.trim() : form.consent_type
    if (!ct) { setFormErr('Please enter a consent type.'); return }
    setSaving(true); setFormErr('')
    try {
      const body = {
        patient_id:   form.patient_id,
        consent_type: ct,
        granted:      form.granted,
        signed_by:    form.signed_by,
        signed_date:  form.signed_date,
        expires_at:   form.expires_at || null,
        notes:        form.notes,
      }
      const r = await fetch('/api/consents', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(body),
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Save failed') }
      setShowModal(false)
      loadConsents()
    } catch (err) { setFormErr(err.message) }
    setSaving(false)
  }

  async function handleRevoke(consent) {
    if (!window.confirm(`Revoke consent "${consent.consent_type}" for ${consent.patient_name}?`)) return
    setRevoking(consent.id)
    try {
      await fetch(`/api/consents/${consent.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ status: 'revoked' }),
      })
      loadConsents()
    } catch {}
    setRevoking(null)
  }

  async function handleExport(consent) {
    setExporting(consent.id)
    try {
      const r = await fetch(`/api/consents/export/${consent.patient_id}`, { headers: { 'x-api-key': key } })
      if (!r.ok) throw new Error('Export failed')
      const data = await r.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${consent.patient_name || 'patient'}-data-export.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
    setExporting(null)
  }

  const tabStyle = (t) => ({
    padding: '8px 18px',
    border: 'none',
    borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontWeight: tab === t ? 700 : 500,
    color: tab === t ? '#2563eb' : '#6b7280',
    fontSize: 14,
    transition: 'all .15s',
  })

  const selectStyle = {
    padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7,
    fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer',
  }

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">Consent &amp; Privacy</span>
        <div className="topbar-right">
          <button className="btn btn-primary btn-sm" onClick={openModal}>
            <Plus size={14} /> Add Consent
          </button>
        </div>
      </div>

      <div style={{ padding: '0 32px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 24 }}>
          <button style={tabStyle('consents')} onClick={() => setTab('consents')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ShieldCheck size={14} /> Consents</span>
          </button>
          <button style={tabStyle('audit')} onClick={() => setTab('audit')}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><ClipboardList size={14} /> Audit Log</span>
          </button>
        </div>

        {/* Patient filter */}
        <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <User size={14} color="#6b7280" />
          <select value={filterPid} onChange={e => setFilterPid(e.target.value)} style={{ ...selectStyle, minWidth: 220 }}>
            <option value="">All Patients</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* ── Consents Tab ── */}
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
                <div style={{ fontSize: 13 }}>Click "Add Consent" to capture a patient consent.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {consents.map(c => (
                  <div key={c.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{c.patient_name}</span>
                          <StatusBadge status={c.status} expiresAt={c.expires_at} />
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1d4ed8', marginBottom: 8 }}>{c.consent_type}</div>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#6b7280' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <User size={11} /> Signed by: <strong style={{ color: '#374151' }}>{c.signed_by || '—'}</strong>
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Calendar size={11} /> Signed: <strong style={{ color: '#374151' }}>{fmtDate(c.signed_date)}</strong>
                          </span>
                          {c.expires_at && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Calendar size={11} /> Expires: <strong style={{ color: '#374151' }}>{fmtDate(c.expires_at)}</strong>
                            </span>
                          )}
                        </div>
                        {c.notes && (
                          <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>
                            {c.notes}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        {c.status !== 'revoked' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleRevoke(c)}
                            disabled={revoking === c.id}
                            style={{ color: '#dc2626', borderColor: '#fecaca' }}
                          >
                            {revoking === c.id
                              ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                              : <><RotateCcw size={12} /> Revoke</>
                            }
                          </button>
                        )}
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleExport(c)}
                          disabled={exporting === c.id}
                        >
                          {exporting === c.id
                            ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                            : <><FileDown size={12} /> Export Patient Data</>
                          }
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Audit Log Tab ── */}
        {tab === 'audit' && (
          <>
            {loadingAudit ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
                <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }} />
              </div>
            ) : auditEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
                <ClipboardList size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: .3 }} />
                <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 6 }}>No audit events found</div>
                <div style={{ fontSize: 13 }}>Audit events will appear here as actions are performed.</div>
              </div>
            ) : (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                      {['Timestamp', 'Action', 'Resource', 'Actor', 'Details'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditEvents.map((ev, i) => (
                      <tr key={ev.id ?? i} style={{ borderBottom: i < auditEvents.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                        <td style={{ padding: '10px 14px', color: '#6b7280', whiteSpace: 'nowrap', fontSize: 12 }}>
                          {fmtDateTime(ev.created_at)}
                        </td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <AuditActionBadge action={ev.action} />
                        </td>
                        <td style={{ padding: '10px 14px', color: '#374151' }}>{ev.resource_type || '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#374151', whiteSpace: 'nowrap' }}>{ev.actor || '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#6b7280', fontSize: 12, maxWidth: 320 }}>
                          <span style={{ wordBreak: 'break-word' }}>{fmtDetails(ev.details)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Add Consent Modal ── */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '28px 16px', overflowY: 'auto' }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}
        >
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: '0 24px 64px rgba(0,0,0,.22)', marginBottom: 28 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>Add Consent</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} noValidate style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              {formErr && (
                <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626', display: 'flex', gap: 7, alignItems: 'center' }}>
                  <AlertTriangle size={13} /> {formErr}
                </div>
              )}

              <div>
                <FL>Patient *</FL>
                <select value={form.patient_id} onChange={e => handlePatientSelect(e.target.value)} style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}>
                  <option value="">— Select patient —</option>
                  {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <FL>Consent Type *</FL>
                <select value={form.consent_type} onChange={e => setField('consent_type', e.target.value)} style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}>
                  {CONSENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {form.consent_type === 'Custom...' && (
                <div>
                  <FL>Custom Consent Type Name *</FL>
                  <input
                    type="text"
                    value={form.custom_type}
                    onChange={e => setField('custom_type', e.target.value)}
                    placeholder="e.g. Organ Donation Authorization"
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                <input
                  id="granted-check"
                  type="checkbox"
                  checked={form.granted}
                  onChange={e => setField('granted', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#059669', cursor: 'pointer' }}
                />
                <label htmlFor="granted-check" style={{ fontSize: 13, fontWeight: 600, color: '#065f46', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <CheckCircle2 size={14} color="#059669" /> Consent Granted
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <FL>Signed By</FL>
                  <input
                    type="text"
                    value={form.signed_by}
                    onChange={e => setField('signed_by', e.target.value)}
                    placeholder="Patient or guardian name"
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <FL>Signed Date</FL>
                  <input
                    type="date"
                    value={form.signed_date}
                    onChange={e => setField('signed_date', e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div>
                <FL>Expires At <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></FL>
                <input
                  type="date"
                  value={form.expires_at}
                  onChange={e => setField('expires_at', e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <FL>Notes <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></FL>
                <textarea
                  value={form.notes}
                  onChange={e => setField('notes', e.target.value)}
                  rows={3}
                  placeholder="Additional details or context…"
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
                  {saving
                    ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</>
                    : <><Plus size={13} /> Add Consent</>
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
