import React, { useState, useEffect } from 'react'
import { Users, Plus, Pencil, Trash2, X, Loader2 } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const EMPTY_FORM = { name: '', dob: '', sex: '', phone: '', conditions: '', notes: '' }

export default function Patients() {
  const { key } = useKey()
  const [patients, setPatients] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]   = useState(null)   // null = create, patient obj = edit
  const [form, setForm]         = useState(EMPTY_FORM)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [deleting, setDeleting] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      const data = await res.json()
      setPatients(data.patients || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [key])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowModal(true)
  }

  function openEdit(p) {
    setEditing(p)
    setForm({ name: p.name || '', dob: p.dob || '', sex: p.sex || '', phone: p.phone || '', conditions: p.conditions || '', notes: p.notes || '' })
    setError('')
    setShowModal(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      const url = editing ? `/api/gen-patients/${editing.id}` : '/api/gen-patients'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Failed to save')
      }
      await load()
      setShowModal(false)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this patient?')) return
    setDeleting(id)
    try {
      await fetch(`/api/gen-patients/${id}`, { method: 'DELETE', headers: { 'x-api-key': key } })
      setPatients(prev => prev.filter(p => p.id !== id))
    } catch {}
    setDeleting(null)
  }

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
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }} />
            Loading patients…
          </div>
        ) : patients.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
            <Users size={40} color="#d1d5db" style={{ margin: '0 auto 14px', display: 'block' }} />
            <div style={{ fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 6 }}>No patients yet</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>Add your first patient to get started.</div>
            <button className="btn btn-primary btn-sm" onClick={openCreate}>
              <Plus size={14} /> Add Patient
            </button>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['Full Name', 'Date of Birth', 'Sex', 'Phone', 'Conditions', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {patients.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: i < patients.length - 1 ? '1px solid #f3f4f6' : 'none', transition: 'background .1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#111827' }}>{p.name}</td>
                    <td style={{ padding: '12px 14px', color: '#374151' }}>{p.dob || '—'}</td>
                    <td style={{ padding: '12px 14px', color: '#374151' }}>
                      {p.sex ? (
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                          background: p.sex === 'Male' ? '#dbeafe' : p.sex === 'Female' ? '#fce7f3' : '#f3f4f6',
                          color: p.sex === 'Male' ? '#1d4ed8' : p.sex === 'Female' ? '#9d174d' : '#6b7280',
                        }}>{p.sex}</span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#374151' }}>{p.phone || '—'}</td>
                    <td style={{ padding: '12px 14px', color: '#374151', maxWidth: 200 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.conditions || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => openEdit(p)}
                          style={{ padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#374151' }}
                        >
                          <Pencil size={12} /> Edit
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          disabled={deleting === p.id}
                          style={{ padding: '5px 10px', border: '1px solid #fecaca', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#dc2626' }}
                        >
                          {deleting === p.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={12} />}
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
        }} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 500, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>
                {editing ? 'Edit Patient' : 'Add Patient'}
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9ca3af' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Full Name *" required>
                    <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required style={inputStyle} />
                  </Field>
                </div>
                <Field label="Date of Birth">
                  <input type="date" value={form.dob} onChange={e => setForm(f => ({ ...f, dob: e.target.value }))} style={inputStyle} />
                </Field>
                <Field label="Sex">
                  <select value={form.sex} onChange={e => setForm(f => ({ ...f, sex: e.target.value }))} style={inputStyle}>
                    <option value="">— Select —</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </Field>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Phone">
                    <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inputStyle} />
                  </Field>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Conditions">
                    <textarea value={form.conditions} onChange={e => setForm(f => ({ ...f, conditions: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="e.g. Hypertension, Type 2 Diabetes" />
                  </Field>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Notes">
                    <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                  </Field>
                </div>
              </div>

              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#dc2626', marginBottom: 14 }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
                  {saving ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : (editing ? 'Save Changes' : 'Add Patient')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7,
  fontSize: 13, color: '#111827', outline: 'none', boxSizing: 'border-box',
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  )
}
