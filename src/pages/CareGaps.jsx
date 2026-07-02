import React, { useState, useEffect, useRef } from 'react'
import {
  AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Loader2, MessageSquare, Copy, Check, Search, Zap, User
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const PRIORITY_STYLES = {
  high:   { color: '#dc2626', bg: '#fee2e2' },
  medium: { color: '#d97706', bg: '#fef3c7' },
  low:    { color: '#059669', bg: '#d1fae5' },
}

const STATUS_STYLES = {
  open:       { color: '#1d4ed8', bg: '#dbeafe' },
  closed:     { color: '#059669', bg: '#d1fae5' },
  suppressed: { color: '#6b7280', bg: '#f3f4f6' },
}

function Badge({ label, color, bg }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600, color, background: bg }}>
      {label}
    </span>
  )
}

function Chip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: active ? 700 : 500,
      border: active ? '1.5px solid #2563eb' : '1.5px solid #e5e7eb',
      background: active ? '#dbeafe' : '#fff', color: active ? '#1d4ed8' : '#6b7280',
      cursor: 'pointer', transition: 'all .15s'
    }}>
      {label}
    </button>
  )
}

export default function CareGaps() {
  const { key } = useKey()
  const [gaps, setGaps] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedPatient, setSelectedPatient] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [detectResult, setDetectResult] = useState(null)

  // Per-gap state
  const [suppressingId, setSuppressingId] = useState(null)
  const [suppressReasons, setSuppressReasons] = useState({})
  const [closingId, setClosingId] = useState(null)
  const [outreachLoading, setOutreachLoading] = useState({})
  const [outreachMessages, setOutreachMessages] = useState({})
  const [copiedId, setCopiedId] = useState(null)

  useEffect(() => { if (key) { loadGaps(); loadPatients() } }, [key])

  async function loadGaps() {
    setLoading(true)
    try {
      const r = await fetch('/api/care-gaps', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setGaps(Array.isArray(d) ? d : (d.gaps || []))
    } catch {}
    setLoading(false)
  }

  async function loadPatients() {
    try {
      const r = await fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPatients(d.patients || [])
    } catch {}
  }

  async function handleDetect() {
    if (!selectedPatient) return
    setDetecting(true)
    setDetectResult(null)
    try {
      const r = await fetch(`/api/care-gaps/detect/${selectedPatient}`, {
        method: 'POST',
        headers: { 'x-api-key': key }
      })
      const d = await r.json()
      setDetectResult(d)
      await loadGaps()
    } catch (e) { setDetectResult({ error: e.message }) }
    setDetecting(false)
  }

  async function handleClose(id) {
    setClosingId(id)
    try {
      await fetch(`/api/care-gaps/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ status: 'closed' })
      })
      setGaps(prev => prev.map(g => g.id === id ? { ...g, status: 'closed', closed_at: new Date().toISOString() } : g))
    } catch {}
    setClosingId(null)
  }

  async function handleSuppress(id) {
    const reason = suppressReasons[id] || ''
    try {
      await fetch(`/api/care-gaps/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ status: 'suppressed', suppression_reason: reason })
      })
      setGaps(prev => prev.map(g => g.id === id ? { ...g, status: 'suppressed' } : g))
      setSuppressingId(null)
    } catch {}
  }

  async function handleOutreach(id) {
    setOutreachLoading(prev => ({ ...prev, [id]: true }))
    try {
      const r = await fetch(`/api/care-gaps/${id}/outreach`, {
        method: 'POST',
        headers: { 'x-api-key': key }
      })
      const d = await r.json()
      setOutreachMessages(prev => ({ ...prev, [id]: d.message }))
    } catch {}
    setOutreachLoading(prev => ({ ...prev, [id]: false }))
  }

  function handleCopy(id, text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const openGaps = gaps.filter(g => g.status === 'open')
  const highPriority = openGaps.filter(g => g.priority === 'high')
  const closedThisMonth = gaps.filter(g => g.status === 'closed' && g.closed_at?.startsWith(thisMonth))

  const displayed = gaps.filter(g => {
    if (filter !== 'all' && g.status !== filter) return false
    if (selectedPatient && String(g.patient_id) !== String(selectedPatient)) return false
    return true
  })

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">Care Gaps</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={selectedPatient}
            onChange={e => setSelectedPatient(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', minWidth: 180, color: selectedPatient ? '#111827' : '#9ca3af' }}
          >
            <option value="">All patients</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleDetect}
            disabled={!selectedPatient || detecting}
          >
            {detecting
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Detecting…</>
              : <><Zap size={13} /> Detect Gaps</>}
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 32px' }}>

        {/* Detection result banner */}
        {detectResult && (
          <div style={{
            marginBottom: 20, padding: '12px 16px', borderRadius: 10,
            background: detectResult.error ? '#fee2e2' : '#d1fae5',
            border: `1px solid ${detectResult.error ? '#fca5a5' : '#6ee7b7'}`,
            color: detectResult.error ? '#b91c1c' : '#065f46',
            fontSize: 13, display: 'flex', alignItems: 'center', gap: 8
          }}>
            {detectResult.error
              ? <><AlertTriangle size={14} /> {detectResult.error}</>
              : <><CheckCircle2 size={14} /> AI scan complete — {detectResult.detected ?? detectResult.gaps?.length ?? 0} gap(s) detected.</>}
            <button onClick={() => setDetectResult(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: .7, padding: 2 }}>✕</button>
          </div>
        )}

        {/* Detection loading overlay card */}
        {detecting && (
          <div style={{ marginBottom: 20, padding: '20px 24px', borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: 14 }}>
            <Loader2 size={22} color="#2563eb" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#1d4ed8' }}>AI is scanning patient record…</div>
              <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>Analyzing clinical history, guidelines, and outstanding care needs</div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 28, flexWrap: 'wrap' }}>
          {[
            { label: 'Open Gaps', value: openGaps.length, color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
            { label: 'High Priority', value: highPriority.length, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
            { label: 'Closed This Month', value: closedThisMonth.length, color: '#059669', bg: '#f0fdf4', border: '#a7f3d0' },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 14, padding: '22px 28px', minWidth: 190, flex: '1 1 190px' }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
              <div style={{ fontSize: 13, color: s.color, fontWeight: 600, marginTop: 5 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {['all', 'open', 'closed', 'suppressed'].map(f => (
            <Chip key={f} label={f.charAt(0).toUpperCase() + f.slice(1)} active={filter === f} onClick={() => setFilter(f)} />
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }} />
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
            <CheckCircle2 size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: .35 }} />
            <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 6 }}>No care gaps found</div>
            <div style={{ fontSize: 13 }}>Select a patient and click "Detect Gaps" to run AI analysis.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {displayed.map(gap => {
              const pStyle = PRIORITY_STYLES[gap.priority] || PRIORITY_STYLES.low
              const sStyle = STATUS_STYLES[gap.status] || STATUS_STYLES.open
              const isSuppressing = suppressingId === gap.id
              const outreachMsg = outreachMessages[gap.id]
              const outreachBusy = outreachLoading[gap.id]

              return (
                <div key={gap.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,.03)' }}>
                  <div style={{ padding: '20px 24px' }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{gap.gap_type}</span>
                          <Badge label={gap.priority} color={pStyle.color} bg={pStyle.bg} />
                          <Badge label={gap.status} color={sStyle.color} bg={sStyle.bg} />
                        </div>
                        <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.5, marginBottom: 6 }}>{gap.description}</div>
                        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: '#6b7280' }}>
                          {gap.patient_name && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <User size={11} /> {gap.patient_name}
                            </span>
                          )}
                          {gap.due_date && (
                            <span>Due: <strong style={{ color: '#374151' }}>{gap.due_date}</strong></span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      {gap.status === 'open' && (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleClose(gap.id)}
                            disabled={closingId === gap.id}
                          >
                            {closingId === gap.id
                              ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                              : <><CheckCircle2 size={12} /> Close Gap</>}
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setSuppressingId(isSuppressing ? null : gap.id)}
                          >
                            <XCircle size={12} /> Suppress
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOutreach(gap.id)}
                            disabled={outreachBusy}
                          >
                            {outreachBusy
                              ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                              : <><MessageSquare size={12} /> Generate Outreach</>}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Suppress input */}
                    {isSuppressing && (
                      <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          placeholder="Suppression reason (optional)…"
                          value={suppressReasons[gap.id] || ''}
                          onChange={e => setSuppressReasons(prev => ({ ...prev, [gap.id]: e.target.value }))}
                          style={{ flex: 1, padding: '7px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 12.5, outline: 'none' }}
                        />
                        <button className="btn btn-secondary btn-sm" onClick={() => setSuppressingId(null)}>Cancel</button>
                        <button className="btn btn-primary btn-sm" onClick={() => handleSuppress(gap.id)}>Confirm</button>
                      </div>
                    )}

                    {/* Outreach message */}
                    {outreachMsg && (
                      <div style={{ marginTop: 12, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em' }}>AI Outreach Message</span>
                          <button
                            onClick={() => handleCopy(gap.id, outreachMsg)}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#374151' }}
                          >
                            {copiedId === gap.id ? <><Check size={12} color="#059669" /> Copied</> : <><Copy size={12} /> Copy</>}
                          </button>
                        </div>
                        <textarea
                          readOnly
                          value={outreachMsg}
                          rows={4}
                          style={{ width: '100%', fontSize: 13, color: '#374151', border: 'none', background: 'transparent', resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box' }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
