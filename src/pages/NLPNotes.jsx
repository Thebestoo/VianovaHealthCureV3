import React, { useState, useEffect } from 'react'
import {
  FileText, Loader2, ChevronDown, ChevronUp, Copy, Check,
  AlertTriangle, Activity, Pill, Thermometer, FlaskConical
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const inputStyle = {
  width: '100%', padding: '9px 13px', border: '1.5px solid var(--border)',
  borderRadius: 8, fontSize: 13.5, color: 'var(--text)', background: 'var(--surface)',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit'
}
const labelStyle = {
  display: 'block', fontSize: 12.5, fontWeight: 600,
  color: 'var(--text)', marginBottom: 5
}

function acuityColor(acuity) {
  if (!acuity) return { color: '#64748b', bg: '#f1f5f9' }
  const a = acuity.toLowerCase()
  if (a === 'critical') return { color: '#b91c1c', bg: '#fee2e2' }
  if (a === 'high') return { color: '#ea580c', bg: '#ffedd5' }
  if (a === 'medium') return { color: '#d97706', bg: '#fef3c7' }
  return { color: '#059669', bg: '#d1fae5' }
}

function statusBadge(status) {
  if (!status) return null
  const s = status.toLowerCase()
  const map = {
    present: { color: '#059669', bg: '#d1fae5' },
    absent: { color: '#64748b', bg: '#f1f5f9' },
    historical: { color: '#2563eb', bg: '#dbeafe' },
    possible: { color: '#d97706', bg: '#fef3c7' },
  }
  const style = map[s] || { color: '#64748b', bg: '#f1f5f9' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, ...style }}>
      {status}
    </span>
  )
}

function ConfidenceBar({ value }) {
  if (value == null) return null
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
      <div style={{ flex: 1, height: 4, background: '#e2e8f0', borderRadius: 99, maxWidth: 100 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>{pct}%</span>
    </div>
  )
}

function CollapsibleSection({ title, icon: Icon, count, children }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ padding: '10px 14px', background: 'var(--surface2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {Icon && <Icon size={14} color="var(--primary)" />}
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{title}</span>
          {count != null && <span style={{ fontSize: 11, color: 'var(--text3)', background: '#f1f5f9', borderRadius: 99, padding: '1px 7px' }}>{count}</span>}
        </div>
        {open ? <ChevronUp size={14} color="var(--text3)" /> : <ChevronDown size={14} color="var(--text3)" />}
      </div>
      {open && <div style={{ padding: '12px 14px', background: 'var(--surface)' }}>{children}</div>}
    </div>
  )
}

export default function NLPNotes() {
  const { key } = useKey()
  const [patients, setPatients] = useState([])
  const [patientId, setPatientId] = useState('')
  const [noteText, setNoteText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted] = useState(null)
  const [deidentifying, setDeidentifying] = useState(false)
  const [deid, setDeid] = useState(null)
  const [activeTab, setActiveTab] = useState('extract') // 'extract' | 'deid'
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { if (key) loadPatients() }, [key])

  async function loadPatients() {
    try {
      const r = await fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPatients(d.patients || [])
    } catch {}
  }

  async function handleExtract() {
    if (!noteText.trim()) return
    setExtracting(true)
    setExtracted(null)
    setApplyResult(null)
    setActiveTab('extract')
    try {
      const body = { note_text: noteText, ...(patientId && { patient_id: patientId }) }
      const r = await fetch('/api/nlp/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(body)
      })
      const d = await r.json()
      setExtracted(d.extracted || d)
    } catch {}
    setExtracting(false)
  }

  async function handleDeidentify() {
    if (!noteText.trim()) return
    setDeidentifying(true)
    setDeid(null)
    setActiveTab('deid')
    try {
      const r = await fetch('/api/nlp/deidentify', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ note_text: noteText })
      })
      const d = await r.json()
      setDeid(d)
    } catch {}
    setDeidentifying(false)
  }

  async function handleApply() {
    if (!patientId || !extracted) return
    setApplying(true)
    setApplyResult(null)
    try {
      const r = await fetch(`/api/nlp/apply/${patientId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ extracted })
      })
      const d = await r.json()
      setApplyResult(d)
    } catch {}
    setApplying(false)
  }

  const hasResults = extracted || deid

  return (
    <div>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={18} color="var(--primary)" />
          <span className="topbar-title">Clinical Notes NLP</span>
        </div>
      </div>

      <div style={{ padding: '24px 32px 32px', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* LEFT: Input */}
        <div style={{ flex: '0 0 380px', minWidth: 0 }}>
          <div className="card" style={{ padding: '20px 22px' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 16 }}>Input</div>

            {/* Patient selector */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Patient <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(optional)</span></label>
              <select value={patientId} onChange={e => setPatientId(e.target.value)} style={inputStyle}>
                <option value="">— Select patient —</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Note textarea */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Clinical Note <span style={{ color: 'var(--danger)' }}>*</span></label>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                rows={10}
                placeholder="Paste clinical note here…"
                style={{ ...inputStyle, resize: 'vertical', minHeight: 200, fontSize: 13, lineHeight: 1.6 }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={handleExtract}
                disabled={extracting || !noteText.trim()}
                style={{ flex: 1 }}
              >
                {extracting ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Extracting…</> : <><Activity size={13} /> Extract Data</>}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleDeidentify}
                disabled={deidentifying || !noteText.trim()}
                style={{ flex: 1 }}
              >
                {deidentifying ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Processing…</> : 'De-identify'}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Results */}
        <div style={{ flex: 1, minWidth: 300 }}>
          {!hasResults && !extracting && !deidentifying ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)' }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <FileText size={24} color="var(--primary)" />
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 5 }}>No results yet</div>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>Paste a clinical note and click Extract Data or De-identify.</div>
            </div>
          ) : (
            <>
              {/* Tabs */}
              {extracted && deid && (
                <div style={{ display: 'flex', gap: 0, marginBottom: 16, background: 'var(--surface2)', borderRadius: 10, padding: 4, border: '1px solid var(--border)', width: 'fit-content' }}>
                  {['extract', 'deid'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        padding: '7px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        background: activeTab === tab ? 'var(--surface)' : 'transparent',
                        color: activeTab === tab ? 'var(--primary)' : 'var(--text2)',
                        boxShadow: activeTab === tab ? 'var(--shadow)' : 'none'
                      }}
                    >
                      {tab === 'extract' ? 'Extracted Data' : 'De-identified'}
                    </button>
                  ))}
                </div>
              )}

              {/* Extract results */}
              {activeTab === 'extract' && extracted && (
                <div>
                  {/* Acuity + note type */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                    {extracted.acuity && (
                      <span style={{ padding: '3px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700, ...acuityColor(extracted.acuity) }}>
                        Acuity: {extracted.acuity}
                      </span>
                    )}
                    {extracted.note_type && (
                      <span style={{ padding: '3px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)' }}>
                        {extracted.note_type}
                      </span>
                    )}
                  </div>

                  {/* Summary */}
                  {extracted.summary && (
                    <div style={{ padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, marginBottom: 14, fontSize: 13.5, color: '#1e3a5f', lineHeight: 1.65 }}>
                      {extracted.summary}
                    </div>
                  )}

                  {/* Conditions */}
                  {extracted.conditions?.length > 0 && (
                    <CollapsibleSection title="Conditions" icon={Activity} count={extracted.conditions.length}>
                      {extracted.conditions.map((c, i) => (
                        <div key={i} style={{ padding: '8px 0', borderBottom: i < extracted.conditions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text)' }}>{c.name || c}</span>
                            {statusBadge(c.status)}
                          </div>
                          <ConfidenceBar value={c.confidence} />
                        </div>
                      ))}
                    </CollapsibleSection>
                  )}

                  {/* Medications */}
                  {extracted.medications?.length > 0 && (
                    <CollapsibleSection title="Medications" icon={Pill} count={extracted.medications.length}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {extracted.medications.map((m, i) => (
                          <span key={i} style={{ padding: '4px 10px', background: '#dbeafe', color: '#1d4ed8', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>
                            {m.name || m}{m.dose ? ` ${m.dose}` : ''}{m.frequency ? ` · ${m.frequency}` : ''}
                          </span>
                        ))}
                      </div>
                    </CollapsibleSection>
                  )}

                  {/* Symptoms */}
                  {extracted.symptoms?.length > 0 && (
                    <CollapsibleSection title="Symptoms" icon={AlertTriangle} count={extracted.symptoms.length}>
                      {extracted.symptoms.map((s, i) => (
                        <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '3px 4px 3px 0', padding: '4px 10px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 13, color: 'var(--text)' }}>{s.name || s}</span>
                          {statusBadge(s.status)}
                        </div>
                      ))}
                    </CollapsibleSection>
                  )}

                  {/* Allergies */}
                  {extracted.allergies?.length > 0 && (
                    <CollapsibleSection title="Allergies" count={extracted.allergies.length}>
                      {extracted.allergies.map((a, i) => (
                        <div key={i} style={{ padding: '6px 0', borderBottom: i < extracted.allergies.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13, color: 'var(--text)' }}>
                          <span style={{ fontWeight: 600 }}>{a.substance || a}</span>
                          {a.reaction && <span style={{ color: 'var(--text2)' }}> — {a.reaction}</span>}
                        </div>
                      ))}
                    </CollapsibleSection>
                  )}

                  {/* Vitals */}
                  {extracted.vitals && Object.keys(extracted.vitals).length > 0 && (
                    <CollapsibleSection title="Vitals" icon={Thermometer}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                        {Object.entries(extracted.vitals).map(([k, v]) => (
                          <div key={k} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>{k}</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleSection>
                  )}

                  {/* Lab Values */}
                  {extracted.lab_values?.length > 0 && (
                    <CollapsibleSection title="Lab Values" icon={FlaskConical} count={extracted.lab_values.length}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {extracted.lab_values.map((l, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 8px', background: 'var(--surface2)', borderRadius: 7 }}>
                            <span style={{ color: 'var(--text2)', fontWeight: 500 }}>{l.test || l.name || l}</span>
                            <span style={{ color: 'var(--text)', fontWeight: 700 }}>{l.value}{l.unit ? ` ${l.unit}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    </CollapsibleSection>
                  )}

                  {/* Apply to patient */}
                  {patientId && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                      {!applyResult ? (
                        <button className="btn btn-primary btn-sm" onClick={handleApply} disabled={applying}>
                          {applying ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Applying…</> : 'Apply to Patient Record'}
                        </button>
                      ) : (
                        <div style={{ padding: '10px 14px', background: 'var(--success-light)', borderRadius: 8, fontSize: 13 }}>
                          <span style={{ fontWeight: 700, color: 'var(--success)' }}>Applied! </span>
                          <span style={{ color: 'var(--text)' }}>
                            {applyResult.added_conditions?.length > 0 && `${applyResult.added_conditions.length} conditions, `}
                            {applyResult.added_medications?.length > 0 && `${applyResult.added_medications.length} medications, `}
                            {applyResult.added_allergies?.length > 0 && `${applyResult.added_allergies.length} allergies `}
                            added.
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* De-identified results */}
              {activeTab === 'deid' && deid && (
                <div>
                  <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>De-identified Text</span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        navigator.clipboard.writeText(deid.deidentified_text || '')
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1500)
                      }}
                    >
                      {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={deid.deidentified_text || ''}
                    rows={10}
                    style={{ ...inputStyle, resize: 'vertical', background: 'var(--surface2)', fontSize: 13, lineHeight: 1.6, minHeight: 180 }}
                  />
                  {deid.phi_found?.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text2)', marginBottom: 7 }}>PHI Types Found</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {deid.phi_found.map((phi, i) => (
                          <span key={i} style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: '#fee2e2', color: '#b91c1c' }}>{phi}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
