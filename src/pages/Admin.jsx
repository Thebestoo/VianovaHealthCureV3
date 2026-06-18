import React, { useState, useEffect } from 'react'
import { ShieldCheck, Plus, Trash2, X, Loader2, ToggleLeft, ToggleRight } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const EMPTY_FORM = { name: '', email: '', role: 'doctor' }

export default function Admin() {
  const { key } = useKey()
  const [users, setUsers]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [toggling, setToggling] = useState(null)
  const [deleting, setDeleting] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users', { headers: { 'x-api-key': key } })
      const data = await res.json()
      setUsers(data.users || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [key])

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.email.trim() || !form.name.trim()) { setError('Name and email required'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Failed to create user')
      }
      await load()
      setShowModal(false)
      setForm(EMPTY_FORM)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  async function toggleActive(user) {
    setToggling(user.id)
    try {
      await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ active: !user.active }),
      })
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, active: user.active ? 0 : 1 } : u))
    } catch {}
    setToggling(null)
  }

  async function handleDelete(user) {
    if (!window.confirm(`Delete ${user.name}? This will also revoke their sessions.`)) return
    setDeleting(user.id)
    try {
      await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE', headers: { 'x-api-key': key } })
      setUsers(prev => prev.filter(u => u.id !== user.id))
    } catch {}
    setDeleting(null)
  }

  const roleBadge = (role) => {
    const styles = {
      superadmin: { background: '#f3e8ff', color: '#7c3aed' },
      doctor:     { background: '#dbeafe', color: '#1d4ed8' },
    }
    const s = styles[role] || { background: '#f3f4f6', color: '#6b7280' }
    const label = role === 'superadmin' ? 'Super Admin' : role.charAt(0).toUpperCase() + role.slice(1)
    return (
      <span style={{ ...s, display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>
        {label}
      </span>
    )
  }

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">User Management</span>
        <div className="topbar-right">
          <button className="btn btn-primary btn-sm" onClick={() => { setForm(EMPTY_FORM); setError(''); setShowModal(true) }}>
            <Plus size={14} /> Add Doctor
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 32px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }} />
            Loading users…
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  {['Name', 'Email', 'Role', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? '1px solid #f3f4f6' : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#111827' }}>{u.name}</td>
                    <td style={{ padding: '12px 14px', color: '#374151' }}>{u.email}</td>
                    <td style={{ padding: '12px 14px' }}>{roleBadge(u.role)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                        background: u.active ? '#d1fae5' : '#f3f4f6',
                        color: u.active ? '#059669' : '#9ca3af',
                      }}>
                        {u.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={toggling === u.id}
                          title={u.active ? 'Deactivate' : 'Activate'}
                          style={{
                            padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff',
                            cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#374151',
                          }}
                        >
                          {toggling === u.id
                            ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                            : u.active ? <ToggleRight size={14} color="#059669" /> : <ToggleLeft size={14} color="#9ca3af" />
                          }
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>
                        {u.role !== 'superadmin' && (
                          <button
                            onClick={() => handleDelete(u)}
                            disabled={deleting === u.id}
                            style={{
                              padding: '5px 10px', border: '1px solid #fecaca', borderRadius: 6, background: '#fff',
                              cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#dc2626',
                            }}
                          >
                            {deleting === u.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={12} />}
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
        }} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Add Doctor</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9ca3af' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreate} style={{ padding: '20px 24px' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Full Name *</label>
                <input
                  type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                  placeholder="Dr. Jane Smith"
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, color: '#111827', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Email *</label>
                <input
                  type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required
                  placeholder="doctor@clinic.com"
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, color: '#111827', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, color: '#111827', outline: 'none', boxSizing: 'border-box' }}
                >
                  <option value="doctor">Doctor</option>
                  <option value="superadmin">Super Admin</option>
                </select>
              </div>
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#dc2626', marginBottom: 14 }}>
                  {error}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary btn-sm">
                  {saving ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving…</> : 'Add User'}
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
