import React, { useState, useEffect, useMemo } from 'react'
import { ShieldCheck, Plus, Trash2, X, Loader2, ToggleLeft, ToggleRight, Mail, Edit3, Save, Lock, CheckCircle, XCircle, Users, Search, UserPlus } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const EMPTY_FORM = { name: '', email: '', role: 'doctor', password: '' }

const AVATAR_PALETTE = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#6366f1', '#ef4444', '#14b8a6']

function avatarColor(str) {
  let hash = 0
  for (let i = 0; i < (str || '').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?'
}

function UserAvatar({ name }) {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
      background: avatarColor(name), color: '#fff', fontWeight: 700, fontSize: 13,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {initials(name)}
    </div>
  )
}

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
  const [approvingId, setApprovingId] = useState(null)
  // inline notify_email editing
  const [editNotify, setEditNotify] = useState(null)
  const [notifyVal, setNotifyVal]   = useState('')
  const [savingNotify, setSavingNotify] = useState(null)
  // inline password editing
  const [editPassword, setEditPassword] = useState(null)
  const [passwordVal, setPasswordVal]   = useState('')
  const [savingPassword, setSavingPassword] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

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
    if (!form.password.trim()) { setError('Password is required'); return }
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
      await load()
    } catch {}
    setToggling(null)
  }

  async function handleDelete(user) {
    setDeleting(user.id)
    try {
      await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE', headers: { 'x-api-key': key } })
      setUsers(prev => prev.filter(u => u.id !== user.id))
    } catch {}
    setDeleting(null)
    setConfirmDelete(null)
  }

  async function handleApprove(user) {
    setApprovingId(user.id)
    try {
      await fetch(`/api/admin/users/${user.id}/approve`, { method: 'POST', headers: { 'x-api-key': key } })
      await load()
    } catch {}
    setApprovingId(null)
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

  async function savePassword(userId) {
    if (!passwordVal.trim()) return
    setSavingPassword(userId)
    try {
      const res = await fetch(`/api/admin/users/${userId}/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ password: passwordVal.trim() }),
      })
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, has_password: true } : u))
        setEditPassword(null)
        setPasswordVal('')
      }
    } catch {}
    setSavingPassword(null)
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

  const statusBadge = (u) => {
    const status = u.status || 'active'
    const isActive = u.active === 1 || u.active === true
    if (!isActive) {
      return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#f3f4f6', color: '#9ca3af' }}>Inactive</span>
    }
    if (status === 'pending') {
      return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#fef3c7', color: '#d97706' }}>Pending</span>
    }
    return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#d1fae5', color: '#059669' }}>Active</span>
  }

  const pendingUsers = users.filter(u => (u.status === 'pending') && (u.active === 1 || u.active === true))
  const activeUsers = users.filter(u => !(u.status === 'pending' && (u.active === 1 || u.active === true)))

  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const filteredActiveUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    return activeUsers.filter(u => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (!q) return true
      return (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.notify_email || '').toLowerCase().includes(q)
    })
  }, [activeUsers, query, roleFilter])

  const totalUsers = users.length
  const activeCount = users.filter(u => (u.active === 1 || u.active === true) && u.status !== 'pending').length
  const adminCount = users.filter(u => u.role === 'superadmin').length

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

        {/* Stats row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 28 }}>
          {[
            { label: 'Total Users', value: totalUsers, icon: Users, bg: '#eff6ff', color: '#1d4ed8' },
            { label: 'Active', value: activeCount, icon: CheckCircle, bg: '#ecfdf5', color: '#059669' },
            { label: 'Pending Approval', value: pendingUsers.length, icon: ShieldCheck, bg: '#fffbeb', color: '#d97706' },
            { label: 'Super Admins', value: adminCount, icon: UserPlus, bg: '#f3e8ff', color: '#7c3aed' },
          ].map((s, idx) => (
            <div key={s.label} className="stat-card animate-fade-up" style={{
              flex: '1 1 190px', minWidth: 170, background: '#fff', border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8,
              animationDelay: `${idx * 0.06}s`,
            }}>
              <div className="stat-icon" style={{ width: 40, height: 40, borderRadius: 12, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <s.icon size={19} color={s.color} />
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1, color: '#111827' }}>{s.value}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Info banner */}
        <div style={{ marginBottom: 20, padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, fontSize: 13, color: '#1e40af' }}>
          <Mail size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} />
          <strong>Notification Email:</strong> If a user's login email is a custom domain without mail hosting (e.g. <em>name@vianova.ai</em>), set a <strong>Notification Email</strong> — case alerts will be sent there instead.
        </div>

        {/* Search + role filter */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 20 }}>
          <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 340 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search users by name or email…"
              style={{ width: '100%', padding: '9px 12px 9px 36px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'doctor', label: 'Doctors' },
              { key: 'superadmin', label: 'Super Admins' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setRoleFilter(f.key)}
                style={{
                  padding: '7px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: roleFilter === f.key ? '1.5px solid #0ea5e9' : '1px solid #e5e7eb',
                  background: roleFilter === f.key ? '#e0f2fe' : '#fff',
                  color: roleFilter === f.key ? '#0369a1' : '#6b7280',
                  transition: 'all .15s ease',
                }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: i < 4 ? '1px solid #f3f4f6' : 'none' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#f1f5f9', animation: 'shimmer 1.4s ease-in-out infinite', animationDelay: `${i * 0.08}s` }} />
                <div style={{ height: 12, width: `${140 + (i % 3) * 40}px`, borderRadius: 6, background: '#f1f5f9', animation: 'shimmer 1.4s ease-in-out infinite', animationDelay: `${i * 0.08}s` }} />
                <div style={{ height: 12, width: 90, borderRadius: 6, background: '#f1f5f9', marginLeft: 'auto', animation: 'shimmer 1.4s ease-in-out infinite', animationDelay: `${i * 0.08}s` }} />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Pending Approval section */}
            {pendingUsers.length > 0 && (
              <div className="animate-fade-up" style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#d97706', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={16} />
                  Pending Approval ({pendingUsers.length})
                </div>
                <div className="card hoverable" style={{ padding: 0, overflow: 'hidden', border: '1.5px solid #fde68a' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                        {['Name', 'Email', 'Role', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#92400e', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pendingUsers.map((u, i) => (
                        <tr key={u.id} style={{ borderBottom: i < pendingUsers.length - 1 ? '1px solid #fef3c7' : 'none' }}>
                          <td style={{ padding: '12px 14px', fontWeight: 600, color: '#111827' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <UserAvatar name={u.name} />
                              {u.name}
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px', color: '#374151' }}>{u.email}</td>
                          <td style={{ padding: '12px 14px' }}>{roleBadge(u.role)}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => handleApprove(u)}
                                disabled={approvingId === u.id}
                                style={{ padding: '5px 12px', border: 'none', borderRadius: 6, background: '#059669', color: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                                {approvingId === u.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={13} />}
                                Approve
                              </button>
                              <button
                                onClick={() => setConfirmDelete(u)}
                                disabled={deleting === u.id}
                                style={{ padding: '5px 12px', border: 'none', borderRadius: 6, background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                                {deleting === u.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <XCircle size={13} />}
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* All users table */}
            <div className="card hoverable animate-fade-up" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    {['Name', 'Login Email', 'Notification Email', 'Role', 'Password', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredActiveUsers.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: '32px 14px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No users match your search or filter.</td></tr>
                  )}
                  {filteredActiveUsers.map((u, i) => (
                    <tr key={u.id} className="followup-row" style={{ borderBottom: i < filteredActiveUsers.length - 1 ? '1px solid #f3f4f6' : 'none', transition: 'background .15s ease' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600, color: '#111827' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <UserAvatar name={u.name} />
                          {u.name}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#374151' }}>{u.email}</td>

                      {/* Notification email — inline editable */}
                      <td style={{ padding: '10px 14px', minWidth: 200 }}>
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

                      {/* Password column */}
                      <td style={{ padding: '10px 14px', minWidth: 160 }}>
                        {editPassword === u.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              type="password"
                              value={passwordVal}
                              onChange={e => setPasswordVal(e.target.value)}
                              placeholder="New password"
                              style={{ flex: 1, padding: '5px 8px', border: '1.5px solid #6366f1', borderRadius: 6, fontSize: 12, outline: 'none' }}
                              onKeyDown={e => { if (e.key === 'Enter') savePassword(u.id); if (e.key === 'Escape') { setEditPassword(null); setPasswordVal('') } }}
                              autoFocus
                            />
                            <button onClick={() => savePassword(u.id)} disabled={savingPassword === u.id || !passwordVal.trim()}
                              style={{ padding: '4px 8px', border: 'none', borderRadius: 6, background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3 }}>
                              {savingPassword === u.id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={11} />}
                            </button>
                            <button onClick={() => { setEditPassword(null); setPasswordVal('') }}
                              style={{ padding: '4px 6px', border: 'none', borderRadius: 6, background: '#f3f4f6', cursor: 'pointer' }}>
                              <X size={11} color="#6b7280" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditPassword(u.id); setPasswordVal('') }}
                            title={u.has_password ? 'Change password' : 'Set password'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', gap: 5, borderRadius: 6 }}
                          >
                            <Lock size={14} color={u.has_password ? '#059669' : '#dc2626'} />
                            <span style={{ fontSize: 12, color: u.has_password ? '#059669' : '#dc2626', fontWeight: 500 }}>
                              {u.has_password ? 'Set' : 'Not set'}
                            </span>
                          </button>
                        )}
                      </td>

                      <td style={{ padding: '12px 14px' }}>{statusBadge(u)}</td>

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
                            <button onClick={() => setConfirmDelete(u)} disabled={deleting === u.id}
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
          </>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="animate-fade-up" style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 440, boxShadow: '0 24px 64px rgba(0,0,0,.24)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <UserPlus size={17} color="#1d4ed8" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Add User</div>
              </div>
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
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Alerts go here. Leave blank to use login email.</div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Password *</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Set initial password"
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>The user will need this to sign in. You can change it later.</div>
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Role</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { value: 'doctor', label: 'Doctor' },
                    { value: 'superadmin', label: 'Super Admin' },
                  ].map(r => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, role: r.value }))}
                      style={{
                        flex: 1, padding: '9px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: form.role === r.value ? '1.5px solid #0ea5e9' : '1.5px solid #d1d5db',
                        background: form.role === r.value ? '#e0f2fe' : '#fff',
                        color: form.role === r.value ? '#0369a1' : '#374151',
                        transition: 'all .15s ease',
                      }}>
                      {r.label}
                    </button>
                  ))}
                </div>
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

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="animate-fade-up" style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 380, boxShadow: '0 24px 64px rgba(0,0,0,.24)', padding: '24px 24px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Trash2 size={19} color="#dc2626" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Delete {confirmDelete.name}?</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>This will revoke their sessions immediately.</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button type="button" onClick={() => setConfirmDelete(null)} className="btn btn-secondary btn-sm">Cancel</button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleting === confirmDelete.id}
                style={{ padding: '7px 16px', border: 'none', borderRadius: 7, background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {deleting === confirmDelete.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%, 100% { opacity: .6; } 50% { opacity: 1; } }
      `}</style>
    </div>
  )
}
