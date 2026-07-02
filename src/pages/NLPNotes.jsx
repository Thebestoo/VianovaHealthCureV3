import React, { useState, useEffect, useCallback } from 'react'
import {
  Brain, Loader2, ChevronDown, ChevronUp, Copy, Check,
  AlertTriangle, Activity, Pill, Thermometer, FlaskConical,
  FileText, Users, Shield, Eye, EyeOff, Download, X
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

// ── Shared styles ─────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '9px 13px', border: '1.5px solid #e5e7eb',
  borderRadius: 8, fontSize: 13.5, color: '#111827', background: '#fff',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit'
}
const labelStyle = { display: 'block', fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 5 }
const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,.06)', marginBottom: 16 }

// ── Helpers ───────────────────────────────────────────────────────────────────
function acuityPill(score) {
  if (score == null) return null
  const n = Number(score)
  const style = n <= 3 ? { color: '#065f46', bg: '#d1fae5' } : n <= 6 ? { color: '#92400e', bg: '#fef3c7' } : { color: '#b91c1c', bg: '#fee2e2' }
  return (
    <span style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: style.color, background: style.bg }}>
      Acuity {n.toFixed(1)}
    </span>
  )
}

function Badge({ label, color = '#6b7280', bg = '#f3f4f6' }) {
  return <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color, background: bg }}>{label}</span>
}

function statusBadge(status) {
  const map = {
    processed: { color: '#065f46', bg: '#d1fae5' },
    pending: { color: '#6b7280', bg: '#f3f4f6' },
    present: { color: '#065f46', bg: '#d1fae5' },
    absent: { color: '#b91c1c', bg: '#fee2e2' },
    possible: { color: '#92400e', bg: '#fef3c7' },
    historical: { color: '#1d4ed8', bg: '#eff6ff' },
    family: { color: '#6d28d9', bg: '#ede9fe' },
    active: { color: '#065f46', bg: '#d1fae5' },
    discontinued: { color: '#b91c1c', bg: '#fee2e2' },
    ordered: { color: '#1d4ed8', bg: '#eff6ff' },
  }
  const s = (status || '').toLowerCase()
  const st = map[s] || { color: '#6b7280', bg: '#f3f4f6' }
  return <Badge label={status} color={st.color} bg={st.bg} />
}

const entityTypeStyle = {
  disease: { color: '#b91c1c', bg: '#fee2e2' },
  symptom: { color: '#92400e', bg: '#fef3c7' },
  medication: { color: '#1d4ed8', bg: '#eff6ff' },
  procedure: { color: '#7c3aed', bg: '#faf5ff' },
  anatomy: { color: '#6b7280', bg: '#f3f4f6' },
  lab_value: { color: '#047857', bg: '#f0fdf4' },
  vital: { color: '#0f766e', bg: '#f0fdf4' },
  dosage: { color: '#92400e', bg: '#fef3c7' },
}

function EntityTypeBadge({ type }) {
  const s = entityTypeStyle[type] || { color: '#6b7280', bg: '#f3f4f6' }
  return <Badge label={type} color={s.color} bg={s.bg} />
}

function ConfidenceBar({ value }) {
  if (value == null) return null
  const pct = Math.round(value * 100)
  const color = pct >= 80 ? '#059669' : pct >= 50 ? '#d97706' : '#b91c1c'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 4, background: '#e2e8f0', borderRadius: 99, maxWidth: 80 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 10, color: '#9ca3af' }}>{pct}%</span>
    </div>
  )
}

function parse(str) {
  if (!str) return null
  if (typeof str === 'object') return str
  try { return JSON.parse(str) } catch { return null }
}

function Tab({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 16, background: '#f9fafb', borderRadius: 10, padding: 4, border: '1px solid #e5e7eb', width: 'fit-content' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          background: active === t.id ? '#fff' : 'transparent',
          color: active === t.id ? '#0f766e' : '#6b7280',
          boxShadow: active === t.id ? '0 1px 3px rgba(0,0,0,.08)' : 'none'
        }}>{t.label}</button>
      ))}
    </div>
  )
}

// ── NoteCard ──────────────────────────────────────────────────────────────────
function NoteCard({ note, onSelect, selected }) {
  const [expanded, setExpanded] = useState(false)
  const [innerTab, setInnerTab] = useState('overview')
  const [copied, setCopied] = useState(false)

  const conditions = parse(note.conditions) || []
  const medications = parse(note.medications) || []
  const entities = parse(note.entities) || []
  const vitals = parse(note.vitals_extracted) || {}
  const labs = parse(note.lab_values_extracted) || []
  const phenotypes = parse(note.phenotype_flags) || []
  const negations = parse(note.negations) || []
  const temporals = parse(note.temporals) || []
  const relations = parse(note.relations) || []
  const codingQueries = parse(note.coding_queries) || []
  const fhir = parse(note.fhir_resources) || []

  const noteTypeLabel = {
    soap: 'SOAP Note', discharge: 'Discharge Summary', consult: 'Consult Note',
    nursing: 'Nursing Note', progress: 'Progress Note', hp: 'H&P', operative: 'Operative Report'
  }[note.note_type] || note.note_type

  return (
    <div style={{ ...card, borderLeft: selected ? '3px solid #0f766e' : '1px solid #e5e7eb', cursor: 'pointer' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 4 }}>
            {note.patient_name || 'Unknown Patient'}
            {note.note_title && <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>— {note.note_title}</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <Badge label={noteTypeLabel} color="#0f766e" bg="#f0fdf4" />
            {statusBadge(note.status)}
            {acuityPill(note.acuity_score)}
            {note.sentiment && <Badge label={note.sentiment} color="#6b7280" bg="#f3f4f6" />}
            {note.word_count && <span style={{ fontSize: 11, color: '#9ca3af' }}>{note.word_count} words</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(note.created_at).toLocaleDateString()}</span>
          <button onClick={e => { e.stopPropagation(); onSelect(note) }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>Select</button>
          {expanded ? <ChevronUp size={14} color="#9ca3af" /> : <ChevronDown size={14} color="#9ca3af" />}
        </div>
      </div>

      {/* Expanded */}
      {expanded && note.status === 'processed' && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
          <Tab
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'entities', label: `Entities (${entities.length})` },
              { id: 'medications', label: `Medications (${medications.length})` },
              { id: 'temporals', label: `Temporals (${temporals.length})` },
              { id: 'fhir', label: 'FHIR' },
            ]}
            active={innerTab}
            onChange={setInnerTab}
          />

          {/* Overview */}
          {innerTab === 'overview' && (
            <div>
              {/* Conditions */}
              {conditions.filter(c => c.assertion === 'present').length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Conditions (Present)</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {conditions.filter(c => c.assertion === 'present').map((c, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: '#fee2e2', borderRadius: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#b91c1c' }}>{c.name}</span>
                        {c.icd10_hint && <span style={{ fontSize: 10.5, color: '#9ca3af', background: '#fff', borderRadius: 4, padding: '1px 4px' }}>{c.icd10_hint}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Vitals grid */}
              {Object.keys(vitals).filter(k => vitals[k] && vitals[k] !== 'null').length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Vitals</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px,1fr))', gap: 8 }}>
                    {Object.entries(vitals).filter(([, v]) => v && v !== 'null').map(([k, v]) => (
                      <div key={k} style={{ background: '#f0fdf4', border: '1px solid #d1fae5', borderRadius: 8, padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>{k.toUpperCase()}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#065f46' }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lab values */}
              {labs.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Lab Values</div>
                  <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: '#f9fafb' }}>
                      <th style={{ textAlign: 'left', padding: '4px 8px', color: '#6b7280', fontWeight: 600 }}>Test</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px', color: '#6b7280', fontWeight: 600 }}>Value</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px', color: '#6b7280', fontWeight: 600 }}>Interpretation</th>
                    </tr></thead>
                    <tbody>{labs.map((l, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '5px 8px', color: '#374151', fontWeight: 500 }}>{l.test}</td>
                        <td style={{ padding: '5px 8px', color: '#111827', fontWeight: 700 }}>{l.value}{l.unit ? ` ${l.unit}` : ''}</td>
                        <td style={{ padding: '5px 8px' }}>{l.interpretation && statusBadge(l.interpretation)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}

              {/* Phenotype flags */}
              {phenotypes.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Phenotype Flags</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {phenotypes.map((p, i) => <Badge key={i} label={p} color="#0f766e" bg="#f0fdf4" />)}
                  </div>
                </div>
              )}

              {/* Coding queries */}
              {codingQueries.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  {codingQueries.map((q, i) => (
                    <div key={i} style={{ padding: '10px 14px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12.5, color: '#78350f', marginBottom: 6 }}>
                      <AlertTriangle size={12} style={{ display: 'inline', marginRight: 6 }} />{q}
                    </div>
                  ))}
                </div>
              )}

              {/* Negations */}
              {negations.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Negations</div>
                  <div style={{ fontSize: 12.5, color: '#9ca3af', fontStyle: 'italic' }}>
                    NOT detected: {negations.join(', ')}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Entities */}
          {innerTab === 'entities' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#f9fafb' }}>
                  {['Entity', 'Type', 'Assertion', 'Negated', 'Confidence'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>{entities.map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '6px 10px', color: '#111827', fontWeight: 500, textDecoration: e.negated ? 'line-through' : 'none' }}>{e.text}</td>
                    <td style={{ padding: '6px 10px' }}><EntityTypeBadge type={e.type} /></td>
                    <td style={{ padding: '6px 10px' }}>{statusBadge(e.assertion)}</td>
                    <td style={{ padding: '6px 10px' }}>
                      {e.negated ? <Badge label="Yes" color="#b91c1c" bg="#fee2e2" /> : <Badge label="No" color="#6b7280" bg="#f3f4f6" />}
                    </td>
                    <td style={{ padding: '6px 10px' }}><ConfidenceBar value={e.confidence} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {/* Medications */}
          {innerTab === 'medications' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 10 }}>
                {medications.map((m, i) => (
                  <div key={i} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1e3a8a', marginBottom: 4 }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>
                      {[m.dose, m.route, m.frequency].filter(Boolean).join(' · ') || 'No details'}
                    </div>
                    {statusBadge(m.status)}
                  </div>
                ))}
              </div>
              {relations.filter(r => {
                const meds = medications.map(m => m.name?.toLowerCase())
                return meds.includes(r.subject?.toLowerCase()) || meds.includes(r.object?.toLowerCase())
              }).length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>Relations</div>
                  {relations.map((r, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: '#374151', padding: '4px 0', display: 'flex', gap: 6 }}>
                      <span style={{ fontWeight: 600, color: '#1d4ed8' }}>{r.subject}</span>
                      <span style={{ color: '#6b7280' }}>{r.predicate}</span>
                      <span style={{ fontWeight: 600, color: '#1d4ed8' }}>{r.object}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Temporals */}
          {innerTab === 'temporals' && (
            <div>
              {temporals.length === 0 ? <div style={{ color: '#9ca3af', fontSize: 13 }}>No temporal data extracted.</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {temporals.map((t, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                      <span style={{ fontWeight: 600, color: '#111827', fontSize: 13 }}>{t.entity}</span>
                      <span style={{ color: '#6b7280', fontSize: 12 }}>→</span>
                      <span style={{ color: '#374151', fontSize: 12.5 }}>{t.time_expression}</span>
                      <Badge label={t.type} color="#0f766e" bg="#f0fdf4" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* FHIR */}
          {innerTab === 'fhir' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <button style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                  onClick={() => { navigator.clipboard.writeText(JSON.stringify(fhir, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
                  {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy JSON'}
                </button>
              </div>
              <pre style={{ background: '#111827', color: '#e2e8f0', padding: '14px 16px', borderRadius: 10, fontSize: 11.5, overflowX: 'auto', maxHeight: 380 }}>
                {JSON.stringify(fhir, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Process New Note Modal ────────────────────────────────────────────────────
function ProcessModal({ patients, onClose, onSuccess, apiKey }) {
  const [form, setForm] = useState({ patient_id: '', note_type: 'soap', note_title: '', note_text: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!form.patient_id || !form.note_text.trim()) return setError('Patient and note text required.')
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/nlp-notes/process', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify(form)
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Error'); setLoading(false); return }
      onSuccess(d.note)
    } catch (e) { setError(e.message); setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>Process New Clinical Note</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20} /></button>
        </div>
        {error && <div style={{ padding: '10px 14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, color: '#b91c1c', fontSize: 13, marginBottom: 14 }}>{error}</div>}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Patient *</label>
          <select value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))} style={inputStyle}>
            <option value="">— Select patient —</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Note Type</label>
            <select value={form.note_type} onChange={e => setForm(f => ({ ...f, note_type: e.target.value }))} style={inputStyle}>
              {[['soap','SOAP Note'],['discharge','Discharge Summary'],['consult','Consult Note'],['nursing','Nursing Note'],['progress','Progress Note'],['hp','History & Physical'],['operative','Operative Report']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Note Title</label>
            <input type="text" value={form.note_title} onChange={e => setForm(f => ({ ...f, note_title: e.target.value }))} placeholder="Optional title" style={inputStyle} />
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Note Text *</label>
          <textarea value={form.note_text} onChange={e => setForm(f => ({ ...f, note_text: e.target.value }))} rows={12} placeholder="Paste clinical note here…" style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, fontSize: 13 }} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 7, opacity: loading ? .7 : 1 }}>
            {loading ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Running NLP pipeline…</> : 'Process Note'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function NLPNotes() {
  const { key } = useKey()
  const [tab, setTab] = useState('notes')
  const [notes, setNotes] = useState([])
  const [patients, setPatients] = useState([])
  const [stats, setStats] = useState({})
  const [phenotypes, setPhenotypes] = useState([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [selectedNote, setSelectedNote] = useState(null)

  // De-id tab state
  const [deidNoteId, setDeidNoteId] = useState('')
  const [showOriginal, setShowOriginal] = useState(false)
  const [confirmedShow, setConfirmedShow] = useState(false)
  const [batchSelected, setBatchSelected] = useState([])
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchResult, setBatchResult] = useState(null)

  // Phenotype cohort drawer
  const [cohortPhenotype, setCohortPhenotype] = useState(null)

  const headers = { 'x-api-key': key }

  const loadAll = useCallback(async () => {
    if (!key) return
    setLoading(true)
    try {
      const [rn, rp, rs, rph] = await Promise.all([
        fetch('/api/nlp-notes', { headers }).then(r => r.json()),
        fetch('/api/gen-patients', { headers }).then(r => r.json()),
        fetch('/api/nlp-notes/stats', { headers }).then(r => r.json()),
        fetch('/api/nlp-notes/phenotypes', { headers }).then(r => r.json()),
      ])
      setNotes(rn.notes || [])
      setPatients(rp.patients || [])
      setStats(rs)
      setPhenotypes(rph.phenotypes || [])
    } catch {}
    setLoading(false)
  }, [key])

  useEffect(() => { loadAll() }, [loadAll])

  function handleNoteSuccess(note) {
    setShowModal(false)
    loadAll()
  }

  // De-id helpers
  const processedNotes = notes.filter(n => n.status === 'processed')
  const selectedDeidNote = processedNotes.find(n => n.id === deidNoteId)
  const pendingNotes = notes.filter(n => n.status === 'pending')

  async function runBatchDeid() {
    if (!batchSelected.length) return
    setBatchRunning(true); setBatchResult(null)
    try {
      const r = await fetch('/api/nlp-notes/deidentify-batch', {
        method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ note_ids: batchSelected })
      })
      const d = await r.json()
      setBatchResult(d.updated)
      setBatchSelected([])
      loadAll()
    } catch {}
    setBatchRunning(false)
  }

  function downloadDeid() {
    if (!selectedDeidNote?.deidentified_text) return
    const blob = new Blob([selectedDeidNote.deidentified_text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `deid_note_${selectedDeidNote.id.slice(0,8)}.txt`; a.click()
    URL.revokeObjectURL(url)
  }

  const topTabs = [
    { id: 'notes', label: 'Notes' },
    { id: 'entities', label: 'Entities' },
    { id: 'phenotyping', label: 'Phenotyping' },
    { id: 'deidentification', label: 'De-identification' },
  ]

  const totalNotes = stats.total || 0
  const maxPhenoCount = phenotypes.length ? phenotypes[0].count : 1

  // Get cohort patients for selected phenotype
  const cohortPatients = cohortPhenotype
    ? [...new Map(notes.filter(n => {
        const flags = parse(n.phenotype_flags) || []
        return flags.includes(cohortPhenotype)
      }).map(n => [n.patient_id, { id: n.patient_id, name: n.patient_name }])).values()]
    : []

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {/* Page Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '20px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#0f766e,#0d9488)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Brain size={22} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, color: '#111827' }}>Clinical NLP Engine</div>
            <div style={{ fontSize: 12.5, color: '#6b7280' }}>Named Entity Recognition · Negation Detection · Temporal Extraction · FHIR · De-identification</div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={() => setShowModal(true)} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
              <FileText size={14} /> Process New Note
            </button>
          </div>
        </div>
        {/* Stats strip */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 20 }}>
          {[
            { label: 'Total Notes', value: stats.total ?? '—' },
            { label: 'Processed', value: stats.processed ?? '—' },
            { label: 'Patients Analyzed', value: stats.patients_analyzed ?? '—' },
            { label: 'Phenotypes Found', value: stats.phenotypes_found ?? '—' },
            { label: 'Avg Acuity', value: notes.filter(n=>n.acuity_score!=null).length ? (notes.filter(n=>n.acuity_score!=null).reduce((s,n)=>s+Number(n.acuity_score),0)/notes.filter(n=>n.acuity_score!=null).length).toFixed(1) : '—' },
          ].map(s => (
            <div key={s.label} style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 14, padding: '22px 28px', minWidth: 150, flex: '1 1 150px', textAlign: 'center' }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: '#0f766e', lineHeight: 1.1 }}>{s.value}</div>
              <div style={{ fontSize: 13, color: '#0f766e', fontWeight: 600, marginTop: 5 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 32px' }}>
        <Tab tabs={topTabs} active={tab} onChange={setTab} />

        {/* NOTES TAB */}
        {tab === 'notes' && (
          <div>
            {loading && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>}
            {!loading && notes.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12 }}>
                <Brain size={36} color="#d1d5db" style={{ marginBottom: 12 }} />
                <div style={{ fontWeight: 700, fontSize: 15, color: '#374151', marginBottom: 6 }}>No clinical notes yet</div>
                <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>Process a clinical note to extract entities, conditions, medications, and more.</div>
                <button onClick={() => setShowModal(true)} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#0f766e', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Process First Note</button>
              </div>
            )}
            {notes.map(n => <NoteCard key={n.id} note={n} onSelect={setSelectedNote} selected={selectedNote?.id === n.id} />)}
          </div>
        )}

        {/* ENTITIES TAB */}
        {tab === 'entities' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Select a note to explore entities</label>
              <select value={selectedNote?.id || ''} onChange={e => setSelectedNote(notes.find(n => n.id === e.target.value) || null)} style={{ ...inputStyle, maxWidth: 480 }}>
                <option value="">— Select note —</option>
                {processedNotes.map(n => <option key={n.id} value={n.id}>{n.patient_name || 'Unknown'} — {n.note_title || n.note_type} ({new Date(n.created_at).toLocaleDateString()})</option>)}
              </select>
            </div>
            {selectedNote ? (
              <div style={card}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 14 }}>
                  Entities for: {selectedNote.patient_name} — {selectedNote.note_title || selectedNote.note_type}
                </div>
                {(() => {
                  const entities = parse(selectedNote.entities) || []
                  return entities.length === 0 ? <div style={{ color: '#9ca3af', fontSize: 13 }}>No entities extracted.</div> : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                        <thead><tr style={{ background: '#f9fafb' }}>
                          {['Entity', 'Type', 'Assertion', 'Negated', 'Confidence'].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '7px 10px', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>{entities.map((e, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '7px 10px', color: '#111827', fontWeight: 500, textDecoration: e.negated ? 'line-through' : 'none' }}>{e.text}</td>
                            <td style={{ padding: '7px 10px' }}><EntityTypeBadge type={e.type} /></td>
                            <td style={{ padding: '7px 10px' }}>{statusBadge(e.assertion)}</td>
                            <td style={{ padding: '7px 10px' }}>{e.negated ? <Badge label="Yes" color="#b91c1c" bg="#fee2e2" /> : <Badge label="No" color="#6b7280" bg="#f3f4f6" />}</td>
                            <td style={{ padding: '7px 10px' }}><ConfidenceBar value={e.confidence} /></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )
                })()}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                Select a processed note to view detailed entity extraction.
              </div>
            )}
          </div>
        )}

        {/* PHENOTYPING TAB */}
        {tab === 'phenotyping' && (
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 320 }}>
              <div style={card}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 16 }}>Population Phenotype Distribution</div>
                {phenotypes.length === 0 ? (
                  <div style={{ color: '#9ca3af', fontSize: 13 }}>No phenotype data yet. Process notes to identify phenotypes.</div>
                ) : (
                  <div>
                    {/* CSS Bar Chart */}
                    <div style={{ marginBottom: 20 }}>
                      {phenotypes.slice(0, 12).map((p, i) => (
                        <div key={i} style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                            <span style={{ fontWeight: 600, color: '#374151' }}>{p.phenotype}</span>
                            <span style={{ color: '#6b7280' }}>{p.count}</span>
                          </div>
                          <div style={{ height: 10, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${(p.count / maxPhenoCount) * 100}%`, background: '#0f766e', borderRadius: 99, transition: 'width .4s' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Table */}
                    <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                      <thead><tr style={{ background: '#f9fafb' }}>
                        {['Phenotype', 'Count', '% of Population', 'Action'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: '#6b7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>{phenotypes.map((p, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '7px 10px', fontWeight: 600, color: '#111827' }}>{p.phenotype}</td>
                          <td style={{ padding: '7px 10px', color: '#374151' }}>{p.count}</td>
                          <td style={{ padding: '7px 10px', color: '#374151' }}>{totalNotes ? ((p.count / totalNotes) * 100).toFixed(1) : 0}%</td>
                          <td style={{ padding: '7px 10px' }}>
                            <button onClick={() => setCohortPhenotype(p.phenotype)} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #0f766e', background: '#f0fdf4', color: '#0f766e', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>View Cohort</button>
                          </td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Cohort drawer */}
            {cohortPhenotype && (
              <div style={{ flex: '0 0 280px', ...card }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Cohort: {cohortPhenotype}</div>
                  <button onClick={() => setCohortPhenotype(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={16} /></button>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>{cohortPatients.length} patient{cohortPatients.length !== 1 ? 's' : ''}</div>
                {cohortPatients.map((p, i) => (
                  <div key={i} style={{ padding: '7px 10px', background: '#f9fafb', borderRadius: 7, marginBottom: 6, fontSize: 13, fontWeight: 500, color: '#374151' }}>
                    <Users size={12} style={{ marginRight: 6, color: '#9ca3af' }} />{p.name || 'Unknown'}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* DE-IDENTIFICATION TAB */}
        {tab === 'deidentification' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
              {/* Note selector */}
              <div style={card}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 14 }}>View De-identified Note</div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Select Note</label>
                  <select value={deidNoteId} onChange={e => { setDeidNoteId(e.target.value); setShowOriginal(false); setConfirmedShow(false) }} style={inputStyle}>
                    <option value="">— Select processed note —</option>
                    {processedNotes.map(n => <option key={n.id} value={n.id}>{n.patient_name || 'Unknown'} — {n.note_title || n.note_type}</option>)}
                  </select>
                </div>
                {selectedDeidNote && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <button onClick={() => {
                      if (!confirmedShow) {
                        if (window.confirm('This note contains PHI. Are you sure you want to reveal the original?')) { setConfirmedShow(true); setShowOriginal(true) }
                      } else setShowOriginal(o => !o)
                    }} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: '#374151' }}>
                      {showOriginal ? <EyeOff size={13} /> : <Eye size={13} />} {showOriginal ? 'Hide' : 'Show Original'}
                    </button>
                    <button onClick={downloadDeid} style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #0f766e', background: '#f0fdf4', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, color: '#0f766e' }}>
                      <Download size={13} /> Download De-id
                    </button>
                  </div>
                )}
              </div>

              {/* Batch De-id */}
              <div style={card}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 14 }}>Batch De-identify</div>
                {pendingNotes.length === 0 ? (
                  <div style={{ color: '#9ca3af', fontSize: 13 }}>No pending notes to de-identify.</div>
                ) : (
                  <div>
                    {pendingNotes.map(n => (
                      <label key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox" checked={batchSelected.includes(n.id)} onChange={e => {
                          if (e.target.checked) setBatchSelected(s => [...s, n.id])
                          else setBatchSelected(s => s.filter(id => id !== n.id))
                        }} />
                        <span style={{ color: '#374151', fontWeight: 500 }}>{n.patient_name || 'Unknown'}</span>
                        <span style={{ color: '#9ca3af', fontSize: 12 }}>{n.note_title || n.note_type}</span>
                      </label>
                    ))}
                    <button onClick={runBatchDeid} disabled={batchRunning || !batchSelected.length} style={{ marginTop: 12, padding: '8px 18px', borderRadius: 7, border: 'none', background: batchSelected.length ? '#0f766e' : '#d1d5db', color: '#fff', fontSize: 13, fontWeight: 700, cursor: batchSelected.length ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 7 }}>
                      {batchRunning ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Running…</> : `De-identify Selected (${batchSelected.length})`}
                    </button>
                    {batchResult != null && <div style={{ marginTop: 10, padding: '8px 12px', background: '#d1fae5', borderRadius: 7, fontSize: 13, color: '#065f46' }}>{batchResult} note{batchResult !== 1 ? 's' : ''} de-identified.</div>}
                  </div>
                )}
              </div>
            </div>

            {/* Side-by-side panels */}
            {selectedDeidNote && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={card}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Eye size={14} /> Original Note
                    {!showOriginal && <Badge label="PHI — Hidden" color="#b91c1c" bg="#fee2e2" />}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <pre style={{ fontSize: 12.5, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#374151', margin: 0, filter: showOriginal ? 'none' : 'blur(6px)', userSelect: showOriginal ? 'auto' : 'none', pointerEvents: showOriginal ? 'auto' : 'none', maxHeight: 400, overflowY: 'auto' }}>
                      {selectedDeidNote.note_text}
                    </pre>
                    {!showOriginal && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ background: 'rgba(255,255,255,.9)', padding: '12px 20px', borderRadius: 10, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.1)' }}>
                          <Shield size={20} color="#b91c1c" style={{ marginBottom: 6 }} />
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#b91c1c' }}>Contains PHI</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>Click "Show Original" to reveal</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div style={card}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Shield size={14} color="#0f766e" /> De-identified Note
                    <Badge label="PHI Removed" color="#065f46" bg="#d1fae5" />
                  </div>
                  <pre style={{ fontSize: 12.5, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#374151', margin: 0, maxHeight: 400, overflowY: 'auto' }}>
                    {selectedDeidNote.deidentified_text || 'De-identified text not available.'}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && <ProcessModal patients={patients} onClose={() => setShowModal(false)} onSuccess={handleNoteSuccess} apiKey={key} />}

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
