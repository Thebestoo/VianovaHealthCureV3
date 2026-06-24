import React, { useState, useEffect, useRef } from 'react'
import {
  FileText, Plus, X, Loader2, ChevronDown, ChevronUp,
  Lock, Unlock, AlertTriangle, CheckCircle2, Printer, Copy,
  Sparkles, Save, Check
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

/* ── helpers ── */
function FL({ children }) {
  return <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{children}</label>
}
function TA({ value, onChange, rows = 3, placeholder, readOnly }) {
  return (
    <textarea value={value} onChange={e => onChange && onChange(e.target.value)} rows={rows} placeholder={placeholder}
      readOnly={readOnly}
      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', background: readOnly ? '#f9fafb' : '#fff', color: '#111827' }} />
  )
}

function riskBadge(level) {
  const map = {
    low:    { bg: '#d1fae5', color: '#047857' },
    medium: { bg: '#fef3c7', color: '#92400e' },
    high:   { bg: '#fee2e2', color: '#b91c1c' },
  }
  const s = map[(level || '').toLowerCase()] || { bg: '#f3f4f6', color: '#6b7280' }
  return (
    <span style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, textTransform: 'capitalize' }}>
      {level || 'unknown'} Risk
    </span>
  )
}

function parseBullets(text) {
  if (!text) return []
  return text.split(/\n|(?=-)/).map(s => s.replace(/^-+\s*/, '').trim()).filter(Boolean)
}

function fmtDate(str) {
  if (!str) return ''
  try { return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return str }
}

const EMPTY_FORM = { patient_id: '', case_id: '', summary: '', patient_instructions: '', medications_at_discharge: '', follow_up_plan: '', risk_level: 'low' }

export default function Discharge() {
  const { key } = useKey()
  const [records, setRecords]       = useState([])
  const [patients, setPatients]     = useState([])
  const [cases, setCases]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [patientFilter, setPatientFilter] = useState('')
  const [expanded, setExpanded]     = useState(null)
  const [showModal, setShowModal]   = useState(false)
  const [genPatient, setGenPatient] = useState('')
  const [genCase, setGenCase]       = useState('')
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult]   = useState(null)
  const [genError, setGenError]     = useState('')
  const [editForm, setEditForm]     = useState({})   // { [id]: { ...fields } }
  const [saving, setSaving]         = useState({})   // { [id]: true }
  const [copied, setCopied]         = useState(null)
  const genTimerRef = useRef(null)

  useEffect(() => { if (key) { load(); loadPatients(); loadCases() } }, [key])
  useEffect(() => { if (key) load() }, [patientFilter, key])

  async function load() {
    setLoading(true)
    try {
      const params = patientFilter ? `?patient_id=${patientFilter}` : ''
      const r = await fetch(`/api/discharge${params}`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setRecords(Array.isArray(d) ? d : [])
    } catch { setRecords([]) }
    setLoading(false)
  }

  async function loadPatients() {
    try {
      const r = await fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPatients(d.patients || [])
    } catch {}
  }

  async function loadCases() {
    try {
      const r = await fetch('/api/cases', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setCases(Array.isArray(d) ? d : [])
    } catch {}
  }

  const filteredCases = genPatient
    ? cases.filter(c => String(c.patient_id) === String(genPatient))
    : cases

  async function handleGenerate() {
    if (!genPatient) return
    setGenerating(true)
    setGenResult(null)
    setGenError('')

    // 30s timeout
    const timeout = new Promise((_, rej) => {
      genTimerRef.current = setTimeout(() => rej(new Error('Request timed out after 30 seconds')), 30000)
    })

    try {
      const body = { patient_id: genPatient }
      if (genCase) body.case_id = genCase
      const result = await Promise.race([
        fetch('/api/discharge/generate', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': key },
          body: JSON.stringify(body)
        }).then(r => r.json()),
        timeout
      ])
      clearTimeout(genTimerRef.current)
      setGenResult(result)
    } catch (err) {
      clearTimeout(genTimerRef.current)
      setGenError(err.message || 'Generation failed')
    }
    setGenerating(false)
  }

  function openEdit(rec) {
    setEditForm(f => ({
      ...f,
      [rec.id]: {
        summary: rec.summary || '',
        patient_instructions: rec.patient_instructions || '',
        medications_at_discharge: rec.medications_at_discharge || '',
        follow_up_plan: rec.follow_up_plan || '',
        risk_level: rec.risk_level || 'low',
      }
    }))
  }

  function getEdit(rec) {
    return editForm[rec.id] || {
      summary: rec.summary || '',
      patient_instructions: rec.patient_instructions || '',
      medications_at_discharge: rec.medications_at_discharge || '',
      follow_up_plan: rec.follow_up_plan || '',
      risk_level: rec.risk_level || 'low',
    }
  }

  function setEditField(id, k, v) {
    setEditForm(f => ({ ...f, [id]: { ...f[id], [k]: v } }))
  }

  async function handleSave(rec, finalize) {
    const fields = getEdit(rec)
    setSaving(s => ({ ...s, [rec.id]: true }))
    try {
      const r = await fetch(`/api/discharge/${rec.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ ...fields, finalized: finalize ?? rec.finalized })
      })
      if (r.ok) {
        const updated = await r.json()
        setRecords(prev => prev.map(x => x.id === rec.id ? { ...x, ...fields, finalized: finalize ?? rec.finalized, ...updated } : x))
      }
    } catch {}
    setSaving(s => ({ ...s, [rec.id]: false }))
  }

  async function handleSaveGenerated(draft) {
    // Save the newly generated summary (already has an id from POST)
    setSaving(s => ({ ...s, [genResult.id]: true }))
    try {
      const r = await fetch(`/api/discharge/${genResult.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ ...genResult, finalized: draft ? false : true })
      })
      if (r.ok) {
        setShowModal(false)
        setGenResult(null)
        setGenPatient('')
        setGenCase('')
        load()
      }
    } catch {}
    setSaving(s => ({ ...s, [genResult.id]: false }))
  }

  function copyInstructions(text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  function printInstructions(name, text) {
    const w = window.open('', '_blank')
    w.document.write(`<html><head><title>Patient Instructions — ${name}</title><style>body{font-family:sans-serif;padding:32px;max-width:600px}h2{margin-bottom:16px}li{margin-bottom:8px;line-height:1.6}</style></head><body>`)
    w.document.write(`<h2>Patient Instructions</h2><ul>`)
    parseBullets(text).forEach(b => { w.document.write(`<li>${b}</li>`) })
    w.document.write(`</ul></body></html>`)
    w.document.close()
    w.print()
  }

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">Discharge Summaries</span>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowModal(true); setGenResult(null); setGenError(''); setGenPatient(''); setGenCase('') }}>
          <Plus size={14} /> Generate Summary
        </button>
      </div>

      <div style={{ padding: '24px 32px' }}>
        {/* Patient filter */}
        <div style={{ marginBottom: 20 }}>
          <select value={patientFilter} onChange={e => setPatientFilter(e.target.value)}
            style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', color: '#374151', background: '#fff', cursor: 'pointer' }}>
            <option value="">All Patients</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }} />
          </div>
        ) : records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
            <FileText size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: .35 }} />
            <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 6 }}>No discharge summaries yet</div>
            <div style={{ fontSize: 13 }}>Click "Generate Summary" to create one with AI.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {records.map(rec => {
              const isOpen = expanded === rec.id
              const ef = getEdit(rec)
              const isFinalized = rec.finalized
              const bullets = parseBullets(ef.patient_instructions)

              return (
                <div key={rec.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                  {/* Card header */}
                  <div style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
                    onClick={() => { setExpanded(isOpen ? null : rec.id); if (!isOpen) openEdit(rec) }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <FileText size={18} color="#059669" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{rec.patient_name}</span>
                        {riskBadge(rec.risk_level)}
                        {isFinalized ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: '#047857', background: '#d1fae5' }}>
                            <Lock size={10} /> Finalized
                          </span>
                        ) : (
                          <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: '#6b7280', background: '#f3f4f6' }}>Draft</span>
                        )}
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>{fmtDate(rec.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: '#6b7280', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {rec.summary || 'No summary available.'}
                      </div>
                    </div>
                    {isOpen ? <ChevronUp size={15} color="#9ca3af" /> : <ChevronDown size={15} color="#9ca3af" />}
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div style={{ borderTop: '1px solid #f3f4f6', padding: '20px 20px 16px' }}>
                      {isFinalized && (
                        <div style={{ marginBottom: 14, padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, fontSize: 12, color: '#047857', display: 'flex', gap: 6, alignItems: 'center' }}>
                          <Lock size={13} /> This summary is finalized and read-only.
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div>
                          <FL>Summary</FL>
                          <TA value={ef.summary} onChange={v => !isFinalized && setEditField(rec.id, 'summary', v)} rows={4} placeholder="Discharge summary…" readOnly={isFinalized} />
                        </div>

                        {/* Patient instructions as bulleted list */}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                            <FL>Patient Instructions</FL>
                            {!isFinalized && (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button type="button" onClick={() => copyInstructions(ef.patient_instructions)}
                                  style={{ padding: '3px 8px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, color: '#374151' }}>
                                  {copied === ef.patient_instructions ? <><Check size={11} color="#059669" /> Copied</> : <><Copy size={11} /> Copy</>}
                                </button>
                                <button type="button" onClick={() => printInstructions(rec.patient_name, ef.patient_instructions)}
                                  style={{ padding: '3px 8px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, color: '#374151' }}>
                                  <Printer size={11} /> Print
                                </button>
                              </div>
                            )}
                          </div>
                          {!isFinalized && (
                            <TA value={ef.patient_instructions} onChange={v => setEditField(rec.id, 'patient_instructions', v)} rows={3} placeholder="- Take medications as prescribed&#10;- Follow up within 7 days" />
                          )}
                          {bullets.length > 0 && (
                            <ul style={{ margin: '8px 0 0', paddingLeft: 20, listStyle: 'disc' }}>
                              {bullets.map((b, i) => (
                                <li key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 4, lineHeight: 1.6 }}>{b}</li>
                              ))}
                            </ul>
                          )}
                          {isFinalized && (
                            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                              <button type="button" onClick={() => copyInstructions(ef.patient_instructions)}
                                style={{ padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3, color: '#374151' }}>
                                {copied === ef.patient_instructions ? <><Check size={11} color="#059669" /> Copied</> : <><Copy size={11} /> Copy Instructions</>}
                              </button>
                              <button type="button" onClick={() => printInstructions(rec.patient_name, ef.patient_instructions)}
                                style={{ padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3, color: '#374151' }}>
                                <Printer size={11} /> Print Instructions
                              </button>
                            </div>
                          )}
                        </div>

                        <div>
                          <FL>Medications at Discharge</FL>
                          <TA value={ef.medications_at_discharge} onChange={v => !isFinalized && setEditField(rec.id, 'medications_at_discharge', v)} rows={2} placeholder="Metformin 500mg twice daily…" readOnly={isFinalized} />
                        </div>

                        <div>
                          <FL>Follow-up Plan</FL>
                          <TA value={ef.follow_up_plan} onChange={v => !isFinalized && setEditField(rec.id, 'follow_up_plan', v)} rows={2} placeholder="Follow up with cardiologist in 2 weeks…" readOnly={isFinalized} />
                        </div>

                        {!isFinalized && (
                          <div>
                            <FL>Risk Level</FL>
                            <select value={ef.risk_level} onChange={e => setEditField(rec.id, 'risk_level', e.target.value)}
                              style={{ padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none' }}>
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                          </div>
                        )}
                      </div>

                      {!isFinalized && (
                        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                          <button onClick={() => handleSave(rec, false)} disabled={!!saving[rec.id]}
                            className="btn btn-secondary btn-sm">
                            {saving[rec.id] ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />} Save Draft
                          </button>
                          <button onClick={() => { if (window.confirm('Finalize this summary? It will become read-only.')) handleSave(rec, true) }}
                            disabled={!!saving[rec.id]} className="btn btn-primary btn-sm">
                            <Lock size={13} /> Finalize
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Generate Summary Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '28px 16px', overflowY: 'auto' }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 600, boxShadow: '0 24px 64px rgba(0,0,0,.22)', marginBottom: 28 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>Generate Discharge Summary</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}><X size={18} /></button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {!genResult ? (
                <>
                  <div style={{ marginBottom: 14 }}>
                    <FL>Patient *</FL>
                    <select value={genPatient} onChange={e => { setGenPatient(e.target.value); setGenCase('') }}
                      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none' }}>
                      <option value="">— Select patient —</option>
                      {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>

                  {genPatient && (
                    <div style={{ marginBottom: 14 }}>
                      <FL>Linked Case (optional)</FL>
                      <select value={genCase} onChange={e => setGenCase(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none' }}>
                        <option value="">— No case —</option>
                        {filteredCases.map(c => <option key={c.case_id || c.id} value={c.case_id || c.id}>{c.title || c.diagnosis || `Case ${c.case_id || c.id}`}</option>)}
                      </select>
                    </div>
                  )}

                  {genError && (
                    <div style={{ marginBottom: 14, padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 13, color: '#dc2626', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <AlertTriangle size={14} /> {genError}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary btn-sm">Cancel</button>
                    <button type="button" onClick={handleGenerate} disabled={!genPatient || generating} className="btn btn-primary btn-sm">
                      {generating
                        ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Generating… (up to 30s)</>
                        : <><Sparkles size={13} /> Generate with AI</>}
                    </button>
                  </div>
                </>
              ) : (
                /* Generated result — editable before saving */
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                    <CheckCircle2 size={15} color="#059669" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#047857' }}>Summary generated — review and save</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <FL>Summary</FL>
                      <TA value={genResult.summary || ''} onChange={v => setGenResult(r => ({ ...r, summary: v }))} rows={4} />
                    </div>
                    <div>
                      <FL>Patient Instructions</FL>
                      <TA value={genResult.patient_instructions || ''} onChange={v => setGenResult(r => ({ ...r, patient_instructions: v }))} rows={3} placeholder="- Each instruction on a new line starting with -" />
                      {parseBullets(genResult.patient_instructions).length > 0 && (
                        <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                          {parseBullets(genResult.patient_instructions).map((b, i) => (
                            <li key={i} style={{ fontSize: 12, color: '#374151', marginBottom: 3, lineHeight: 1.6 }}>{b}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <FL>Medications at Discharge</FL>
                      <TA value={genResult.medications_at_discharge || ''} onChange={v => setGenResult(r => ({ ...r, medications_at_discharge: v }))} rows={2} />
                    </div>
                    <div>
                      <FL>Follow-up Plan</FL>
                      <TA value={genResult.follow_up_plan || ''} onChange={v => setGenResult(r => ({ ...r, follow_up_plan: v }))} rows={2} />
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <FL>Risk Level</FL>
                        <select value={genResult.risk_level || 'low'} onChange={e => setGenResult(r => ({ ...r, risk_level: e.target.value }))}
                          style={{ padding: '7px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none' }}>
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                      {genResult.risk_reason && (
                        <div style={{ flex: 2, fontSize: 12, color: '#6b7280', fontStyle: 'italic', paddingTop: 14 }}>{genResult.risk_reason}</div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => { setGenResult(null); setGenError('') }} className="btn btn-secondary btn-sm">
                      <X size={13} /> Regenerate
                    </button>
                    <button type="button" onClick={() => handleSaveGenerated(true)} disabled={!!saving[genResult?.id]} className="btn btn-secondary btn-sm">
                      {saving[genResult?.id] ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />} Save Draft
                    </button>
                    <button type="button" onClick={() => handleSaveGenerated(false)} disabled={!!saving[genResult?.id]} className="btn btn-primary btn-sm">
                      {saving[genResult?.id] ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Lock size={13} />} Finalize
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
