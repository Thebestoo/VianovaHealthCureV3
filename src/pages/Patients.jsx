import React, { useState, useEffect, useRef } from 'react'
import {
  Users, Plus, Search, FileJson, FileSpreadsheet, X, Check, User,
  Phone, Calendar, Pill, Heart, AlertTriangle, ChevronDown, ChevronUp,
  Edit3, Trash2, Loader2, Upload, Mail, MapPin, Languages, ArrowRight,
  CheckCircle2, AlertCircle, SkipForward, RefreshCw, Briefcase
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import { useNavigate } from 'react-router-dom'
import { parseFhirBundle } from '../utils/parseFhir.js'
import FhirPreview from '../components/FhirPreview.jsx'
import {
  normalizePhone, normalizeName, normalizeDOB,
  computeQualityScore, qualityTier, PATIENT_FIELDS, parseCSV
} from '../utils/patientUtils.js'

/* ── small helpers ── */
function Tag({ label, color = '#1d4ed8', bg = '#dbeafe' }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600, color, background: bg, margin: '2px 3px 2px 0' }}>{label}</span>
  )
}
function FL({ children }) {
  return <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{children}</label>
}
function FI({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
  )
}
function Sec({ icon, title, children, wide }) {
  return (
    <div style={wide ? { gridColumn: '1/-1' } : {}}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em' }}>{title}</span>
      </div>
      {children}
    </div>
  )
}
function QualityBadge({ score }) {
  if (score == null) return null
  const t = qualityTier(score)
  return (
    <span title={`Data quality: ${score}/100`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 700, color: t.color, background: t.bg }}>
      {score}% {t.label}
    </span>
  )
}
function SourceBadge({ source }) {
  if (!source || source === 'manual') return null
  const map = { csv: { label: 'CSV', color: '#0369a1', bg: '#e0f2fe' }, fhir: { label: 'FHIR', color: '#7c3aed', bg: '#f5f3ff' } }
  const s = map[source] || { label: source, color: '#6b7280', bg: '#f3f4f6' }
  return <span style={{ padding: '2px 7px', borderRadius: 99, fontSize: 10, fontWeight: 700, color: s.color, background: s.bg }}>{s.label}</span>
}

const toArr  = v => (typeof v === 'string' ? v.split(/[,\n]+/).map(s => s.trim()).filter(Boolean) : (v || []))
const arrStr = a => (Array.isArray(a) ? a.join(', ') : (a || ''))
function tryParse(v)    { try { return typeof v === 'string' ? JSON.parse(v) : v } catch { return v } }
function tryParseArr(v) { const r = tryParse(v); return Array.isArray(r) ? r : (r ? [r] : []) }

const EMPTY = { name: '', dob: '', sex: '', mrn: '', phone: '', email: '', address: '', language: '', conditions: '', medications: '', allergies: '', notes: '' }

export default function Patients() {
  const { key } = useKey()
  const navigate = useNavigate()
  const [patients, setPatients]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId]       = useState(null)
  const [expanded, setExpanded]   = useState(null)
  const [deleting, setDeleting]   = useState(null)
  const [saving, setSaving]       = useState(false)
  const [dupWarning, setDupWarning] = useState('')
  const [patientCases, setPatientCases] = useState({})
  const [casesLoading, setCasesLoading] = useState({})

  // FHIR
  const [fhirData, setFhirData]   = useState(null)
  const [fhirFile, setFhirFile]   = useState('')
  const [fhirError, setFhirError] = useState('')
  const [dragging, setDragging]   = useState(false)
  const fileRef = useRef()

  // CSV import
  const [showCsvModal, setShowCsvModal] = useState(false)
  const [csvStep, setCsvStep]     = useState(1)          // 1=upload 2=map 3=preview
  const [csvParsed, setCsvParsed] = useState(null)       // { headers, rows }
  const [csvFile, setCsvFile]     = useState('')
  const [csvMapping, setCsvMapping] = useState([])       // [{csv_column, field}]
  const [csvMapping2, setCsvMapping2] = useState([])     // user-editable copy
  const [csvMappingLoading, setCsvMappingLoading] = useState(false)
  const [csvPreview, setCsvPreview] = useState([])       // mapped patient rows
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResult, setCsvResult] = useState(null)       // import result
  const [csvDragging, setCsvDragging] = useState(false)
  const csvFileRef = useRef()

  const [form, setForm] = useState(EMPTY)
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { if (key) load() }, [key])

  async function fetchPatientCases(patientId) {
    if (patientCases[patientId] !== undefined) return
    setCasesLoading(l => ({ ...l, [patientId]: true }))
    try {
      const r = await fetch(`/api/cases/by-patient/${patientId}`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPatientCases(pc => ({ ...pc, [patientId]: Array.isArray(d) ? d : [] }))
    } catch {
      setPatientCases(pc => ({ ...pc, [patientId]: [] }))
    }
    setCasesLoading(l => ({ ...l, [patientId]: false }))
  }

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPatients(d.patients || [])
    } catch {}
    setLoading(false)
  }

  // ── FHIR import ───────────────────────────────────────────────────────────
  async function handleFile(file) {
    if (!file) return
    setFhirError('')
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const parsed = parseFhirBundle(json)
      if (!parsed) throw new Error('Not a valid FHIR R4 Bundle')
      setFhirData(parsed)
      setFhirFile(file.name)
      const p = parsed.patient || {}
      setForm(f => ({
        ...f,
        name:        p.fullName  || f.name,
        dob:         p.birthDate || f.dob,
        sex:         p.gender ? (p.gender.charAt(0).toUpperCase() + p.gender.slice(1)) : f.sex,
        mrn:         p.mrn      || f.mrn,
        phone:       p.phone    || f.phone,
        email:       p.email    || f.email,
        address:     [p.address, p.city, p.state, p.country].filter(Boolean).join(', ') || f.address,
        language:    p.language || f.language,
        conditions:  arrStr((parsed.conditions  || []).map(c => c.name      || c).filter(Boolean)),
        medications: arrStr((parsed.medications || []).map(m => `${m.name || m}${m.dosage ? ' ' + m.dosage : ''}`).filter(Boolean)),
        allergies:   arrStr((parsed.allergies   || []).map(a => a.substance || a).filter(Boolean)),
      }))
    } catch (err) { setFhirError(err.message || 'Could not parse FHIR file') }
  }

  // ── CSV import flow ───────────────────────────────────────────────────────
  async function handleCsvFile(file) {
    if (!file) return
    const text = await file.text()
    const parsed = parseCSV(text)
    if (!parsed.headers.length) return
    setCsvParsed(parsed)
    setCsvFile(file.name)
    setCsvStep(2)
    // AI mapping
    setCsvMappingLoading(true)
    try {
      const r = await fetch('/api/gen-patients/ai-map-csv', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ headers: parsed.headers, sample: parsed.rows.slice(0, 3) })
      })
      const d = await r.json()
      setCsvMapping(d.mapping || [])
      setCsvMapping2(d.mapping ? d.mapping.map(m => ({ ...m })) : [])
    } catch {
      const fallback = parsed.headers.map(h => ({ csv_column: h, field: null }))
      setCsvMapping(fallback)
      setCsvMapping2(fallback.map(m => ({ ...m })))
    }
    setCsvMappingLoading(false)
  }

  function applyMappingAndPreview() {
    if (!csvParsed) return
    const mapped = csvParsed.rows.map(row => {
      const p = {}
      csvMapping2.forEach(({ csv_column, field }) => {
        if (field && row[csv_column] != null) {
          if (['conditions','medications','allergies'].includes(field)) {
            p[field] = p[field] ? p[field] + ', ' + row[csv_column] : row[csv_column]
          } else {
            p[field] = p[field] || row[csv_column]
          }
        }
      })
      return p
    }).filter(p => p.name?.trim())
    setCsvPreview(mapped)
    setCsvStep(3)
  }

  async function runCsvImport() {
    setCsvImporting(true)
    try {
      const r = await fetch('/api/gen-patients/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ rows: csvPreview })
      })
      const d = await r.json()
      setCsvResult(d)
      load()
    } catch (e) { setCsvResult({ error: e.message }) }
    setCsvImporting(false)
  }

  function resetCsvModal() {
    setShowCsvModal(false); setCsvStep(1); setCsvParsed(null); setCsvFile('')
    setCsvMapping([]); setCsvMapping2([]); setCsvPreview([]); setCsvResult(null)
  }

  // ── Single patient CRUD ───────────────────────────────────────────────────
  function openCreate() {
    setEditId(null); setForm(EMPTY); setDupWarning('')
    setFhirData(null); setFhirFile(''); setFhirError('')
    setShowModal(true)
  }
  function openEdit(p) {
    setEditId(p.id); setDupWarning('')
    setForm({
      name: p.name || '', dob: p.dob || '', sex: p.sex || '',
      mrn: p.mrn || '', phone: p.phone || '',
      email: p.email || '', address: p.address || '', language: p.language || '',
      conditions:  arrStr(tryParse(p.conditions)),
      medications: arrStr(tryParse(p.medications)),
      allergies:   arrStr(tryParse(p.allergies)),
      notes: p.notes || ''
    })
    setFhirData(null); setFhirFile(''); setFhirError('')
    setShowModal(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true); setDupWarning('')
    const body = {
      ...form,
      conditions:  JSON.stringify(toArr(form.conditions)),
      medications: JSON.stringify(toArr(form.medications)),
      allergies:   JSON.stringify(toArr(form.allergies)),
      fhir_vitals: fhirData?.vitals ? JSON.stringify(fhirData.vitals) : undefined,
      import_source: fhirData ? 'fhir' : (editId ? undefined : 'manual'),
    }
    try {
      const url    = editId ? `/api/gen-patients/${editId}` : '/api/gen-patients'
      const method = editId ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-api-key': key }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) {
        if (r.status === 409) { setDupWarning(d.error); setSaving(false); return }
        throw new Error(d.error || 'Save failed')
      }
      setShowModal(false); load()
    } catch (err) { setDupWarning(err.message) }
    setSaving(false)
  }

  async function handleDelete(p) {
    if (!window.confirm(`Delete patient "${p.name}"?`)) return
    setDeleting(p.id)
    try {
      await fetch(`/api/gen-patients/${p.id}`, { method: 'DELETE', headers: { 'x-api-key': key } })
      setPatients(prev => prev.filter(x => x.id !== p.id))
    } catch {}
    setDeleting(null)
  }

  const filtered = patients.filter(p =>
    (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.conditions || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.mrn || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.email || '').toLowerCase().includes(search.toLowerCase())
  )

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">Patients</span>
        <div className="topbar-right" style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { resetCsvModal(); setShowCsvModal(true) }}>
            <FileSpreadsheet size={14} /> Import CSV
          </button>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <Plus size={14} /> Add Patient
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 32px' }}>
        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 20, maxWidth: 400 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, condition, MRN or email…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
            <Users size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: .35 }} />
            <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 6 }}>
              {search ? 'No patients match your search' : 'No patients yet'}
            </div>
            {!search && <div style={{ fontSize: 13 }}>Click "Add Patient" or "Import CSV" to get started.</div>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(p => {
              const conditions  = tryParseArr(p.conditions)
              const medications = tryParseArr(p.medications)
              const allergies   = tryParseArr(p.allergies)
              const vitals      = tryParseArr(p.fhir_vitals)
              const isOpen      = expanded === p.id
              const score       = p.data_quality_score ?? computeQualityScore(p)
              return (
                <div key={p.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
                    onClick={() => { const next = isOpen ? null : p.id; setExpanded(next); if (next) fetchPatientCases(next) }}>
                    <div style={{ width: 42, height: 42, borderRadius: 99, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <User size={18} color="#2563eb" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{p.name}</span>
                        <QualityBadge score={score} />
                        <SourceBadge source={p.import_source} />
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {p.dob   && <span><Calendar size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />{p.dob}</span>}
                        {p.sex   && <span>{p.sex}</span>}
                        {p.mrn   && <span style={{ fontFamily: 'monospace' }}>MRN: {p.mrn}</span>}
                        {p.phone && <span><Phone size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />{p.phone}</span>}
                        {p.email && <span><Mail size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />{p.email}</span>}
                      </div>
                      {conditions.length > 0 && (
                        <div style={{ marginTop: 5 }}>
                          {conditions.slice(0, 4).map(c => <Tag key={c} label={c} />)}
                          {conditions.length > 4 && <Tag label={`+${conditions.length - 4}`} color="#6b7280" bg="#f3f4f6" />}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); openEdit(p) }}
                        style={{ padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: 7, background: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#374151' }}>
                        <Edit3 size={12} /> Edit
                      </button>
                      <button onClick={e => { e.stopPropagation(); handleDelete(p) }} disabled={deleting === p.id}
                        style={{ padding: '5px 8px', border: '1px solid #fecaca', borderRadius: 7, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#dc2626' }}>
                        {deleting === p.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                      </button>
                      {isOpen ? <ChevronUp size={15} color="#9ca3af" /> : <ChevronDown size={15} color="#9ca3af" />}
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ borderTop: '1px solid #f3f4f6', padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                      {p.address  && <Sec icon={<MapPin size={13} color="#0369a1"/>} title="Address"><span style={{ fontSize: 13, color: '#374151' }}>{p.address}</span></Sec>}
                      {p.language && <Sec icon={<Languages size={13} color="#0369a1"/>} title="Language"><Tag label={p.language} color="#0369a1" bg="#e0f2fe" /></Sec>}
                      {conditions.length > 0  && <Sec icon={<Heart size={13} color="#2563eb"/>} title="Conditions">{conditions.map(c=><Tag key={c} label={c}/>)}</Sec>}
                      {medications.length > 0 && <Sec icon={<Pill size={13} color="#059669"/>} title="Medications">{medications.map(m=><Tag key={m} label={m} color="#047857" bg="#d1fae5"/>)}</Sec>}
                      {allergies.length > 0   && <Sec icon={<AlertTriangle size={13} color="#dc2626"/>} title="Allergies">{allergies.map(a=><Tag key={a} label={a} color="#b91c1c" bg="#fee2e2"/>)}</Sec>}
                      {vitals.length > 0 && (
                        <Sec icon={<FileJson size={13} color="#7c3aed"/>} title="FHIR Vitals" wide>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                            {vitals.map((v,i) => (
                              <div key={i} style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 7, padding: '4px 10px', fontSize: 12 }}>
                                <span style={{ color: '#7c3aed', fontWeight: 600 }}>{v.name}</span>
                                <span style={{ color: '#374151', marginLeft: 6 }}>{v.value} {v.unit}</span>
                              </div>
                            ))}
                          </div>
                        </Sec>
                      )}
                      {p.notes && <Sec icon={<User size={13} color="#6b7280"/>} title="Notes" wide><p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.6 }}>{p.notes}</p></Sec>}

                      {/* Linked Cases */}
                      <div style={{ gridColumn: '1/-1' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Briefcase size={13} color="#7c3aed" />
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em' }}>Linked Cases</span>
                            {patientCases[p.id] && (
                              <span style={{ background: '#f3f4f6', color: '#374151', borderRadius: 99, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                                {patientCases[p.id].length}
                              </span>
                            )}
                          </div>
                          <button onClick={() => navigate('/cases/new')}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 7, border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#7c3aed', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            <Plus size={12} /> New Case
                          </button>
                        </div>
                        {casesLoading[p.id] ? (
                          <div style={{ textAlign: 'center', padding: '18px 0', color: '#9ca3af' }}>
                            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
                          </div>
                        ) : !patientCases[p.id] || patientCases[p.id].length === 0 ? (
                          <div style={{ padding: '14px 16px', background: '#f9fafb', borderRadius: 8, border: '1px dashed #e5e7eb', textAlign: 'center' }}>
                            <span style={{ fontSize: 13, color: '#9ca3af' }}>No cases linked yet — </span>
                            <button onClick={() => navigate('/cases/new')}
                              style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: 13, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                              + Create Case
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {patientCases[p.id].map(c => {
                              const isEmergency = c.emergency_detected || c.requires_urgent_review
                              const isApproved  = c.status === 'approved'
                              const badge = isEmergency
                                ? { label: 'Emergency', color: '#dc2626', bg: '#fee2e2' }
                                : isApproved
                                  ? { label: 'Approved', color: '#059669', bg: '#d1fae5' }
                                  : { label: 'Pending',  color: '#d97706', bg: '#fef3c7' }
                              return (
                                <div key={c.id} onClick={() => navigate(`/cases/${c.id}`)}
                                  style={{ padding: '10px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'background .15s' }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {c.chief_complaint || 'No complaint recorded'}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', gap: 10 }}>
                                      <span>{new Date(c.created_at).toLocaleDateString()}</span>
                                      {c.top_diagnosis && <span style={{ fontStyle: 'italic' }}>{c.top_diagnosis}</span>}
                                    </div>
                                  </div>
                                  <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: badge.color, background: badge.bg, flexShrink: 0 }}>
                                    {badge.label}
                                  </span>
                                  <ArrowRight size={13} color="#9ca3af" style={{ flexShrink: 0 }} />
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* Quality breakdown */}
                      <Sec icon={<CheckCircle2 size={13} color="#059669"/>} title="Data Quality" wide>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, height: 6, background: '#f3f4f6', borderRadius: 99 }}>
                            <div style={{ height: 6, borderRadius: 99, background: score >= 80 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626', width: `${score}%`, transition: 'width .4s' }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>{score}/100</span>
                        </div>
                        {score < 80 && (
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 5 }}>
                            Missing: {[
                              !p.name    && 'name', !p.dob   && 'DOB', !p.sex     && 'sex',
                              !p.mrn     && 'MRN',  !p.phone && 'phone', !p.email && 'email',
                              !p.address && 'address',
                            ].filter(Boolean).join(', ')}
                          </div>
                        )}
                      </Sec>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '28px 16px', overflowY: 'auto' }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 600, boxShadow: '0 24px 64px rgba(0,0,0,.22)', marginBottom: 28 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>{editId ? 'Edit Patient' : 'Add Patient'}</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}><X size={18} /></button>
            </div>

            <form onSubmit={handleSave} noValidate style={{ padding: '20px 24px' }}>

              {/* FHIR import (create only) */}
              {!editId && (
                <div style={{ marginBottom: 20 }}>
                  {!fhirData ? (
                    <div
                      onDragOver={e => { e.preventDefault(); setDragging(true) }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
                      onClick={() => fileRef.current?.click()}
                      style={{ border: `2px dashed ${dragging ? '#0ea5e9' : '#cbd5e1'}`, borderRadius: 10, padding: '18px 16px', textAlign: 'center', background: dragging ? '#e0f2fe' : '#f8fafc', cursor: 'pointer', transition: 'all .15s' }}>
                      <FileJson size={22} color={dragging ? '#0ea5e9' : '#94a3b8'} style={{ margin: '0 auto 6px', display: 'block' }} />
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 2 }}>Import FHIR R4 Bundle</div>
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>Drop .json or click — auto-fills all fields including email, address &amp; language</div>
                      <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#059669', fontWeight: 600 }}>
                          <Check size={14} strokeWidth={2.5} /> {fhirFile}
                        </div>
                        <button type="button" onClick={() => { setFhirData(null); setFhirFile(''); setFhirError('') }}
                          className="btn btn-secondary btn-sm"><X size={12} /> Clear</button>
                      </div>
                      <FhirPreview data={fhirData} fileName={fhirFile} />
                    </div>
                  )}
                  {fhirError && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626', display: 'flex', gap: 7, alignItems: 'center' }}>
                      <AlertTriangle size={13} /> {fhirError}
                    </div>
                  )}
                  {!fhirData && (
                    <div style={{ margin: '16px 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                      <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>or fill in manually</span>
                      <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                    </div>
                  )}
                </div>
              )}

              {/* Duplicate warning */}
              {dupWarning && (
                <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, fontSize: 13, color: '#c2410c', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <AlertCircle size={14} /> {dupWarning}
                </div>
              )}

              {/* Core fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <FL>Full Name *</FL>
                  <FI value={form.name} onChange={v => setField('name', v)} placeholder="Jane Smith" />
                </div>
                <div>
                  <FL>Date of Birth</FL>
                  <FI type="date" value={form.dob} onChange={v => setField('dob', v)} />
                </div>
                <div>
                  <FL>Biological Sex</FL>
                  <select value={form.sex} onChange={e => setField('sex', e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                    <option value="">— Select —</option>
                    <option>Male</option><option>Female</option><option>Other</option>
                  </select>
                </div>
                <div>
                  <FL>MRN / Patient ID</FL>
                  <FI value={form.mrn} onChange={v => setField('mrn', v)} placeholder="00123456" />
                </div>
                <div>
                  <FL>Phone</FL>
                  <FI value={form.phone} onChange={v => setField('phone', v)} placeholder="+1 555 000 0000" />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <FL>Email</FL>
                  <FI type="email" value={form.email} onChange={v => setField('email', v)} placeholder="patient@example.com" />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <FL>Address</FL>
                  <FI value={form.address} onChange={v => setField('address', v)} placeholder="123 Main St, Springfield, IL 62701" />
                </div>
                <div>
                  <FL>Preferred Language</FL>
                  <FI value={form.language} onChange={v => setField('language', v)} placeholder="e.g. English, Spanish" />
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <FL>Known Conditions <span style={{ color: '#9ca3af', fontWeight: 400 }}>(comma separated)</span></FL>
                <FI value={form.conditions} onChange={v => setField('conditions', v)} placeholder="Diabetes Type 2, Hypertension…" />
              </div>
              <div style={{ marginBottom: 10 }}>
                <FL>Current Medications <span style={{ color: '#9ca3af', fontWeight: 400 }}>(comma separated)</span></FL>
                <FI value={form.medications} onChange={v => setField('medications', v)} placeholder="Metformin 500mg, Lisinopril 10mg…" />
              </div>
              <div style={{ marginBottom: 10 }}>
                <FL>Allergies <span style={{ color: '#9ca3af', fontWeight: 400 }}>(comma separated)</span></FL>
                <FI value={form.allergies} onChange={v => setField('allergies', v)} placeholder="Penicillin, Sulfa drugs…" />
              </div>
              <div style={{ marginBottom: 20 }}>
                <FL>Notes</FL>
                <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} placeholder="Additional clinical notes…"
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              {/* Live quality preview */}
              {(() => {
                const preview = { ...form, conditions: JSON.stringify(toArr(form.conditions)), medications: JSON.stringify(toArr(form.medications)), allergies: JSON.stringify(toArr(form.allergies)) }
                const s = computeQualityScore(preview)
                const t = qualityTier(s)
                return (
                  <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Data Quality</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: t.color }}>{s}/100 — {t.label}</span>
                    </div>
                    <div style={{ height: 5, background: '#e5e7eb', borderRadius: 99 }}>
                      <div style={{ height: 5, borderRadius: 99, background: t.color, width: `${s}%`, transition: 'width .3s' }} />
                    </div>
                  </div>
                )
              })()}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={saving || !form.name.trim()} className="btn btn-primary btn-sm">
                  {saving ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : (editId ? 'Save Changes' : 'Add Patient')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CSV Import Modal ── */}
      {showCsvModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '28px 16px', overflowY: 'auto' }}
          onClick={e => e.target === e.currentTarget && resetCsvModal()}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 680, boxShadow: '0 24px 64px rgba(0,0,0,.22)', marginBottom: 28 }}>

            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>Import Patients from CSV</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  {['Upload', 'Map Fields', 'Preview & Import'].map((s, i) => (
                    <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: csvStep === i+1 ? 700 : 400, color: csvStep >= i+1 ? '#0ea5e9' : '#9ca3af' }}>
                      <span style={{ width: 18, height: 18, borderRadius: 99, background: csvStep >= i+1 ? '#0ea5e9' : '#e5e7eb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: csvStep >= i+1 ? '#fff' : '#9ca3af', fontWeight: 700 }}>{i+1}</span>
                      {s}
                      {i < 2 && <ArrowRight size={10} color="#d1d5db" />}
                    </span>
                  ))}
                </div>
              </div>
              <button onClick={resetCsvModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}><X size={18} /></button>
            </div>

            <div style={{ padding: '20px 24px' }}>

              {/* Step 1: Upload */}
              {csvStep === 1 && (
                <div
                  onDragOver={e => { e.preventDefault(); setCsvDragging(true) }}
                  onDragLeave={() => setCsvDragging(false)}
                  onDrop={e => { e.preventDefault(); setCsvDragging(false); handleCsvFile(e.dataTransfer.files[0]) }}
                  onClick={() => csvFileRef.current?.click()}
                  style={{ border: `2px dashed ${csvDragging ? '#0ea5e9' : '#cbd5e1'}`, borderRadius: 10, padding: '40px 24px', textAlign: 'center', background: csvDragging ? '#e0f2fe' : '#f8fafc', cursor: 'pointer', transition: 'all .15s' }}>
                  <Upload size={28} color={csvDragging ? '#0ea5e9' : '#94a3b8'} style={{ margin: '0 auto 10px', display: 'block' }} />
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#374151', marginBottom: 4 }}>Drop your CSV file here</div>
                  <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 8 }}>or click to browse — any column names, AI maps them automatically</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>Supported fields: name, DOB, sex, MRN, phone, email, address, language, conditions, medications, allergies, notes</div>
                  <input ref={csvFileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => handleCsvFile(e.target.files[0])} />
                </div>
              )}

              {/* Step 2: Map fields */}
              {csvStep === 2 && (
                <div>
                  <div style={{ fontSize: 13, color: '#374151', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileSpreadsheet size={15} color="#0369a1" />
                    <strong>{csvFile}</strong>
                    <span style={{ color: '#6b7280' }}>— {csvParsed?.rows.length} rows, {csvParsed?.headers.length} columns</span>
                  </div>

                  {csvMappingLoading ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: '#6b7280' }}>
                      <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 8px' }} />
                      AI is mapping your columns…
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>Review the field mapping — adjust if needed:</div>
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '8px 14px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          <span>CSV Column</span><span>Maps to Field</span>
                        </div>
                        {csvMapping2.map((m, i) => (
                          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '8px 14px', borderBottom: i < csvMapping2.length-1 ? '1px solid #f3f4f6' : 'none', alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: '#374151', fontFamily: 'monospace' }}>{m.csv_column}</span>
                            <select value={m.field || ''} onChange={e => {
                              const copy = [...csvMapping2]
                              copy[i] = { ...copy[i], field: e.target.value || null }
                              setCsvMapping2(copy)
                            }} style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12.5, outline: 'none', color: m.field ? '#111827' : '#9ca3af', background: m.field ? '#f0fdf4' : '#fff' }}>
                              <option value="">— skip —</option>
                              {PATIENT_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setCsvStep(1); setCsvParsed(null); setCsvFile('') }}>
                          <RefreshCw size={12} /> Re-upload
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={applyMappingAndPreview}>
                          Preview <ArrowRight size={13} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Step 3: Preview & import */}
              {csvStep === 3 && !csvResult && (
                <div>
                  <div style={{ fontSize: 13, color: '#374151', marginBottom: 14 }}>
                    <strong>{csvPreview.length}</strong> patients ready to import
                    {csvPreview.length === 0 && <span style={{ color: '#dc2626' }}> — no rows with a valid name found</span>}
                  </div>

                  {csvPreview.length > 0 && (
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 16, maxHeight: 280, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            {['Name','DOB','Sex','MRN','Phone','Quality'].map(h => (
                              <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {csvPreview.slice(0, 20).map((p, i) => {
                            const norm = { name: normalizeName(p.name), dob: normalizeDOB(p.dob), sex: p.sex, mrn: p.mrn, phone: normalizePhone(p.phone), email: p.email, address: p.address, language: p.language, conditions: p.conditions, medications: p.medications, allergies: p.allergies }
                            const s = computeQualityScore(norm)
                            const t = qualityTier(s)
                            return (
                              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '7px 10px', fontWeight: 600 }}>{norm.name}</td>
                                <td style={{ padding: '7px 10px', color: '#6b7280' }}>{norm.dob}</td>
                                <td style={{ padding: '7px 10px', color: '#6b7280' }}>{norm.sex}</td>
                                <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>{norm.mrn}</td>
                                <td style={{ padding: '7px 10px', color: '#6b7280' }}>{norm.phone}</td>
                                <td style={{ padding: '7px 10px' }}><span style={{ fontWeight: 700, color: t.color }}>{s}%</span></td>
                              </tr>
                            )
                          })}
                          {csvPreview.length > 20 && (
                            <tr><td colSpan={6} style={{ padding: '7px 10px', color: '#9ca3af', textAlign: 'center', fontSize: 11 }}>+ {csvPreview.length - 20} more rows</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14, padding: '8px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7 }}>
                    <strong>Duplicate check:</strong> Patients with the same MRN or same name + DOB will be skipped automatically.
                    Names and phone numbers will be normalized before saving.
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setCsvStep(2)}><ArrowRight size={12} style={{ transform: 'rotate(180deg)' }} /> Back</button>
                    <button className="btn btn-primary btn-sm" disabled={csvImporting || !csvPreview.length} onClick={runCsvImport}>
                      {csvImporting ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Importing…</> : <><Upload size={13} /> Import {csvPreview.length} Patients</>}
                    </button>
                  </div>
                </div>
              )}

              {/* Import result */}
              {csvStep === 3 && csvResult && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  {csvResult.error ? (
                    <div style={{ color: '#dc2626', fontSize: 14 }}><AlertCircle size={28} style={{ display: 'block', margin: '0 auto 10px' }} />{csvResult.error}</div>
                  ) : (
                    <>
                      <CheckCircle2 size={36} color="#059669" style={{ display: 'block', margin: '0 auto 12px' }} />
                      <div style={{ fontWeight: 700, fontSize: 16, color: '#111827', marginBottom: 6 }}>Import Complete</div>
                      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 12 }}>
                        {[
                          { label: 'Imported', val: csvResult.imported, color: '#059669', bg: '#d1fae5' },
                          { label: 'Duplicates skipped', val: csvResult.duplicates, color: '#d97706', bg: '#fef3c7' },
                          { label: 'Errors', val: csvResult.errors, color: '#dc2626', bg: '#fee2e2' },
                        ].map(s => (
                          <div key={s.label} style={{ padding: '10px 18px', borderRadius: 10, background: s.bg, textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
                            <div style={{ fontSize: 11, color: s.color, fontWeight: 600 }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                      {csvResult.details?.filter(d => d.status !== 'imported').length > 0 && (
                        <div style={{ marginTop: 14, textAlign: 'left', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                          {csvResult.details.filter(d => d.status !== 'imported').slice(0, 8).map((d, i) => (
                            <div key={i} style={{ padding: '7px 12px', borderBottom: '1px solid #f3f4f6', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                              {d.status === 'duplicate' ? <SkipForward size={13} color="#d97706" /> : <AlertCircle size={13} color="#dc2626" />}
                              <strong>{d.name}</strong> — {d.reason}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 20 }} onClick={resetCsvModal}>Done</button>
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
