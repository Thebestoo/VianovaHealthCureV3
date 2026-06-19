import React, { useState, useEffect, useRef } from 'react'
import {
  Users, Plus, Search, FileJson, X, Check, User,
  Phone, Calendar, Pill, Heart, AlertTriangle, ChevronDown, ChevronUp,
  Edit3, Trash2, Loader2
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import { parseFhirBundle } from '../utils/parseFhir.js'
import FhirPreview from '../components/FhirPreview.jsx'

/* ── small tag chip ── */
function Tag({ label, color = '#1d4ed8', bg = '#dbeafe' }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 99,
      fontSize: 11, fontWeight: 600, color, background: bg, margin: '2px 3px 2px 0'
    }}>{label}</span>
  )
}

const toArr  = v => (typeof v === 'string' ? v.split(/[,\n]+/).map(s => s.trim()).filter(Boolean) : (v || []))
const arrStr = a => (Array.isArray(a) ? a.join(', ') : (a || ''))
function tryParse(v)    { try { return typeof v === 'string' ? JSON.parse(v) : v } catch { return v } }
function tryParseArr(v) { const r = tryParse(v); return Array.isArray(r) ? r : (r ? [r] : []) }

const EMPTY = { name: '', dob: '', sex: '', mrn: '', phone: '', conditions: '', medications: '', allergies: '', notes: '' }

export default function Patients() {
  const { key } = useKey()
  const [patients, setPatients]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId]       = useState(null)
  const [expanded, setExpanded]   = useState(null)
  const [deleting, setDeleting]   = useState(null)
  const [saving, setSaving]       = useState(false)

  // FHIR
  const [fhirData, setFhirData]   = useState(null)
  const [fhirFile, setFhirFile]   = useState('')
  const [fhirError, setFhirError] = useState('')
  const [dragging, setDragging]   = useState(false)
  const fileRef = useRef()

  const [form, setForm] = useState(EMPTY)
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { if (key) load() }, [key])

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPatients(d.patients || [])
    } catch {}
    setLoading(false)
  }

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
        mrn:         p.mrn   || f.mrn,
        phone:       p.phone || f.phone,
        conditions:  arrStr((parsed.conditions  || []).map(c => c.name      || c).filter(Boolean)),
        medications: arrStr((parsed.medications || []).map(m => m.name      || m).filter(Boolean)),
        allergies:   arrStr((parsed.allergies   || []).map(a => a.substance || a).filter(Boolean)),
      }))
    } catch (err) { setFhirError(err.message || 'Could not parse FHIR file') }
  }

  function openCreate() {
    setEditId(null); setForm(EMPTY)
    setFhirData(null); setFhirFile(''); setFhirError('')
    setShowModal(true)
  }
  function openEdit(p) {
    setEditId(p.id)
    setForm({
      name: p.name || '', dob: p.dob || '', sex: p.sex || '',
      mrn: p.mrn || '', phone: p.phone || '',
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
    setSaving(true)
    const body = {
      ...form,
      conditions:  JSON.stringify(toArr(form.conditions)),
      medications: JSON.stringify(toArr(form.medications)),
      allergies:   JSON.stringify(toArr(form.allergies)),
      fhir_vitals: fhirData?.vitals ? JSON.stringify(fhirData.vitals) : undefined,
    }
    try {
      if (editId) {
        await fetch(`/api/gen-patients/${editId}`, {
          method: 'PUT', headers: { 'content-type': 'application/json', 'x-api-key': key },
          body: JSON.stringify(body)
        })
      } else {
        await fetch('/api/gen-patients', {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key },
          body: JSON.stringify(body)
        })
      }
      setShowModal(false); load()
    } catch {}
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
    (p.mrn || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">Patients</span>
        <div className="topbar-right">
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <Plus size={14} /> Add Patient
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 32px' }}>
        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 20, maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, condition or MRN…"
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
            {!search && <div style={{ fontSize: 13 }}>Click "Add Patient" to register the first patient.</div>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(p => {
              const conditions  = tryParseArr(p.conditions)
              const medications = tryParseArr(p.medications)
              const allergies   = tryParseArr(p.allergies)
              const vitals      = tryParseArr(p.fhir_vitals)
              const isOpen      = expanded === p.id
              return (
                <div key={p.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', transition: 'box-shadow .15s' }}>
                  <div style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
                    onClick={() => setExpanded(isOpen ? null : p.id)}>
                    <div style={{ width: 42, height: 42, borderRadius: 99, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <User size={18} color="#2563eb" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {p.dob   && <span><Calendar size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />{p.dob}</span>}
                        {p.sex   && <span>{p.sex}</span>}
                        {p.mrn   && <span style={{ fontFamily: 'monospace' }}>MRN: {p.mrn}</span>}
                        {p.phone && <span><Phone size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />{p.phone}</span>}
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
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 580, boxShadow: '0 24px 64px rgba(0,0,0,.22)', marginBottom: 28 }}>
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
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>Drop .json or click — auto-fills all fields</div>
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

              {/* Fields */}
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

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
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
