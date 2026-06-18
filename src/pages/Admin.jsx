import React, { useState, useEffect } from 'react'
import { ShieldCheck, Plus, Trash2, X, Loader2, ToggleLeft, ToggleRight, Mail, Edit3, Save } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const EMPTY_FORM = { name: '', email: '', role: 'doctor' }

export default function Admin() {
  const { key } = useKey()
  const [users, setUsers]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [toggling, setToggling]   = useState(null)
  const [deleting, setDeleting]   = useState(null)
  // inline notify_email editing
  const [editNotify, setEditNotify] = useState(null)   // user.id being edited
  const [notifyVal, setNotifyVal]   = useState('')
  const [savingNotify, setSavingNotify] = useState(null)

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
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(form),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      await load(); setShowModal(false); setForm(EMPTY_FORM)
    } catch (err) { setError(err.message) }
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
    if (!window.confirm(`Delete ${user.name}? This will revoke their sessions.`)) return
    setDeleting(user.id)
    try {
      await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE', headers: { 'x-api-key': key } })
      setUsers(prev => prev.filter(u => u.id !== user.id))
    } catch {}
    setDeleting(null)
  }

  async function saveNotifyEmail(userId) {
    setSavingNotify(userId)
    try {
      await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ notify_email: notifyVal.trim() }),
      })
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, notify_email: notifyVal.trim() } : u))
      setEditNotify(null)
    } catch {}
    setSavingNotify(null)
  }

  const roleBadge = (role) => {
    const s = role === 'superadmin'
      ? { background: '#f3e8ff', color: '#7c3aed' }
      : { background: '#dbeafe', color: '#1d4ed8' }
    const label = role === 'superadmin' ? 'Super Admin' : 'Doctor'
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
            <Plus size={14} /> Add User
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 32px' }}>

        {/* Info banner */}
        <div style={{ marginBottom: 20, padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, fontSize: 13, color: '#1e40af' }}>
          <Mail size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} />
          <strong>Notification Email:</strong> If a user's login email is a custom domain without mail hosting (e.g. <em>name@vianova.ai</em>), set a <strong>Notification Email</strong> — OTP codes and case alerts will be sent there instead.
        </div>

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
                  {['Name', 'Login Email', 'Notification Email', 'Role', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} style={{ borderBottom: i < users.length - 1 ? '1px solid #f3f4f6' : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#111827' }}>{u.name}</td>
                    <td style={{ padding: '12px 14px', color: '#374151' }}>{u.email}</td>

                    {/* Notification email — inline editable */}
                    <td style={{ padding: '10px 14px', minWidth: 220 }}>
                      {editNotify === u.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="text"
                            value={notifyVal}
                            onChange={e => setNotifyVal(e.target.value)}
                            placeholder="real@gmail.com"
                            style={{ flex: 1, padding: '5px 8px', border: '1.5px solid #0ea5e9', borderRadius: 6, fontSize: 12, outline: 'none' }}
                            onKeyDown={e => { if (e.key === 'Enter') saveNotifyEmail(u.id); if (e.key === 'Escape') setEditNotify(null) }}
                            autoFocus
                          />
                          <button onClick={() => saveNotifyEmail(u.id)} disabled={savingNotify === u.id}
                            style={{ padding: '4px 8px', border: 'none', borderRadius: 6, background: '#0ea5e9', color: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3 }}>
                            {savingNotify === u.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={11} />}
                          </button>
                          <button onClick={() => setEditNotify(null)}
                            style={{ padding: '4px 6px', border: 'none', borderRadius: 6, background: '#f3f4f6', cursor: 'pointer' }}>
                            <X size={11} color="#6b7280" />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {u.notify_email ? (
                            <span style={{ fontSize: 12, color: '#059669', fontWeight: 500 }}>{u.notify_email}</span>
                          ) : (
                            <span style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>same as login</span>
                          )}
                          <button onClick={() => { setEditNotify(u.id); setNotifyVal(u.notify_email || '') }}
                            title="Edit notification email"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#9ca3af', display: 'flex' }}>
                            <Edit3 size={12} />
                          </button>
                        </div>
                      )}
                    </td>

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
                        <button onClick={() => toggleActive(u)} disabled={toggling === u.id} title={u.active ? 'Deactivate' : 'Activate'}
                          style={{ padding: '5px 10px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#374151' }}>
                          {toggling === u.id
                            ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                            : u.active ? <ToggleRight size={14} color="#059669" /> : <ToggleLeft size={14} color="#9ca3af" />}
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>
                        {u.role !== 'superadmin' && (
                          <button onClick={() => handleDelete(u)} disabled={deleting === u.id}
                            style={{ padding: '5px 10px', border: '1px solid #fecaca', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#dc2626' }}>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Add User</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9ca3af' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} noValidate style={{ padding: '20px 24px' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Full Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Jane Smith" style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Login Email *</label>
                <input type="text" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="jane@vianova.ai"
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>This is the email they type to sign in.</div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>
                  Notification Email <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
                </label>
                <input type="text" value={form.notify_email || ''} onChange={e => setForm(f => ({ ...f, notify_email: e.target.value }))}
                  placeholder="jane@gmail.com"
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>OTP codes and alerts go here. Leave blank to use login email.</div>
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                  <option value="doctor">Doctor</option>
                  <option value="superadmin">Super Admin</option>
                </select>
              </div>
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#dc2626', marginBottom: 14 }}>{error}</div>
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
