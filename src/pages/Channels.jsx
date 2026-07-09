import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { MessageSquare, Plus, X, Loader2, ShieldCheck, Send, Users, Check, Info, AtSign,
         CheckCircle, XCircle, Crown, Hash, Siren, BellRing, Search, Bell, BellOff } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import toast from 'react-hot-toast'

const DEFAULT_RULES = 'No racism, hate speech, or discrimination of any kind.\nNo harassment or personal attacks.\nKeep discussion professional and patient-related.\nRespect patient confidentiality (no PHI outside secure systems).'

const AVATAR_PALETTE = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#6366f1', '#ef4444', '#14b8a6']
function avatarColor(str) {
  let hash = 0
  for (let i = 0; i < (str || '').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}
function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?'
}
function Avatar({ name, size = 32, src }) {
  if (src) {
    return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: avatarColor(name), color: '#fff', fontWeight: 700, fontSize: size * 0.38,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {initials(name)}
    </div>
  )
}

function timeAgo(iso) {
  if (!iso) return ''
  const d = new Date(iso), diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString()
}

function previewText(c) {
  if (!c.last_message) return 'No messages yet'
  if (c.last_message_type === 'system') return c.last_message
  if (c.last_message_type === 'admin_call') return '🚨 Admin called'
  if (c.last_message_type === 'invite') return c.last_message
  return c.last_message
}

const LS_LAST_READ = 'vnh_channel_last_read'
function readLastReadMap() {
  try { return JSON.parse(localStorage.getItem(LS_LAST_READ) || '{}') } catch { return {} }
}

const LS_MUTED = 'vnh_channel_muted'
function readMutedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_MUTED) || '[]')) } catch { return new Set() }
}
function writeMutedSet(set) {
  localStorage.setItem(LS_MUTED, JSON.stringify([...set]))
}

export default function Channels() {
  const { key, role, label, email } = useKey()
  const isSuperAdmin = role === 'superadmin'
  const api = useCallback((url, opts = {}) => fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, ...(opts.headers || {}) },
  }).then(async r => {
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error || 'Request failed')
    return data
  }), [key])

  const [channels, setChannels]         = useState([])
  const [loadingList, setLoadingList]   = useState(true)
  const [selectedId, setSelectedId]     = useState(null)
  const [messages, setMessages]         = useState([])
  const [members, setMembers]           = useState([])
  const [loadingMsgs, setLoadingMsgs]   = useState(false)
  const [input, setInput]               = useState('')
  const [sending, setSending]           = useState(false)
  const [responding, setResponding]     = useState(false)
  const [showRules, setShowRules]       = useState(false)
  const [showMembers, setShowMembers]   = useState(false)
  const [showCreate, setShowCreate]     = useState(false)
  const [doctors, setDoctors]           = useState([])
  const [form, setForm] = useState({ name: '', rules: DEFAULT_RULES, head_doctor_id: '' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [adminCalls, setAdminCalls] = useState([])
  const [search, setSearch] = useState('')
  const [lastReadMap, setLastReadMap] = useState(readLastReadMap)
  const [mutedSet, setMutedSet] = useState(readMutedSet)
  const scrollRef = useRef(null)
  const seenLastMsgRef = useRef({})
  const selectedIdRef = useRef(null)
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  function toggleMute(channelId) {
    setMutedSet(prev => {
      const next = new Set(prev)
      if (next.has(channelId)) { next.delete(channelId); toast('Notifications unmuted') }
      else { next.add(channelId); toast('Notifications muted') }
      writeMutedSet(next)
      return next
    })
  }

  const loadChannels = useCallback(async () => {
    try {
      const data = await api('/api/channels')
      const fetched = data.channels || []
      const seen = seenLastMsgRef.current
      const isFirstLoad = Object.keys(seen).length === 0
      for (const c of fetched) {
        if (!c.last_message_at) continue
        const prev = seen[c.id]
        seen[c.id] = c.last_message_at
        if (isFirstLoad) continue
        if (prev === c.last_message_at) continue
        if (c.last_message_sender_email === email) continue
        if (mutedSet.has(c.id)) continue
        if (c.id === selectedIdRef.current) continue
        const snippet = c.last_message_type === 'admin_call' ? c.last_message
          : `${c.last_message_sender || 'Someone'}: ${c.last_message}`
        toast(`#${c.name}\n${snippet}`, { icon: '💬', duration: 5000, style: { whiteSpace: 'pre-line' } })
      }
      setChannels(fetched)
    } catch {}
    setLoadingList(false)
  }, [api, email, mutedSet])

  useEffect(() => { loadChannels() }, [loadChannels])
  useEffect(() => {
    const t = setInterval(loadChannels, 5000)
    return () => clearInterval(t)
  }, [loadChannels])

  const selected = channels.find(c => c.id === selectedId) || null
  const myStatus = isSuperAdmin ? 'joined' : (selected?.my_status || null)
  const isHead = selected?.my_role === 'head'

  const loadMessages = useCallback(async () => {
    if (!selectedId || myStatus !== 'joined') return
    try {
      const data = await api(`/api/channels/${selectedId}/messages`)
      setMessages(data.messages || [])
    } catch {}
  }, [api, selectedId, myStatus])

  useEffect(() => {
    if (!selectedId || myStatus !== 'joined') { setMessages([]); return }
    setLoadingMsgs(true)
    loadMessages().finally(() => setLoadingMsgs(false))
    const t = setInterval(loadMessages, 3000)
    return () => clearInterval(t)
  }, [selectedId, myStatus, loadMessages])

  useEffect(() => {
    if (!selectedId || myStatus !== 'joined') return
    api(`/api/channels/${selectedId}/members`).then(d => setMembers((d.members || []).filter(m => m.status === 'joined'))).catch(() => {})
  }, [selectedId, myStatus, api, messages.length])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!selectedId || !selected?.last_message_at) return
    setLastReadMap(prev => {
      if (prev[selectedId] === selected.last_message_at) return prev
      const next = { ...prev, [selectedId]: selected.last_message_at }
      localStorage.setItem(LS_LAST_READ, JSON.stringify(next))
      return next
    })
  }, [selectedId, selected?.last_message_at])

  useEffect(() => {
    if (showCreate && isSuperAdmin) {
      api('/api/admin/users').then(d => setDoctors((d.users || []).filter(u => u.role === 'doctor'))).catch(() => {})
    }
  }, [showCreate, isSuperAdmin, api])

  const loadAdminCalls = useCallback(async () => {
    if (!isSuperAdmin) return
    try {
      const data = await api('/api/admin/channel-calls')
      setAdminCalls(data.calls || [])
    } catch {}
  }, [api, isSuperAdmin])

  useEffect(() => {
    if (!isSuperAdmin) return
    loadAdminCalls()
    const t = setInterval(loadAdminCalls, 5000)
    return () => clearInterval(t)
  }, [isSuperAdmin, loadAdminCalls])

  async function resolveCall(channelId, messageId) {
    try {
      await api(`/api/channels/${channelId}/messages/${messageId}/resolve`, { method: 'POST' })
      await loadAdminCalls()
      if (channelId === selectedId) await loadMessages()
      toast.success('Admin call resolved')
    } catch (err) { toast.error(err.message) }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.head_doctor_id) { setCreateError('Channel name and Head Doctor are required'); return }
    setCreating(true); setCreateError('')
    try {
      await api('/api/channels', { method: 'POST', body: JSON.stringify(form) })
      setShowCreate(false)
      setForm({ name: '', rules: DEFAULT_RULES, head_doctor_id: '' })
      await loadChannels()
      toast.success('Channel created')
    } catch (err) { setCreateError(err.message) }
    setCreating(false)
  }

  async function respond(accept) {
    setResponding(true)
    try {
      await api(`/api/channels/${selectedId}/respond`, { method: 'POST', body: JSON.stringify({ accept }) })
      await loadChannels()
      if (accept) toast.success('Joined channel')
      else toast('Invite declined')
    } catch (err) { toast.error(err.message) }
    setResponding(false)
  }

  async function requireSuperAdmin() {
    if (!isSuperAdmin) { toast.error('Only admin can use this command'); return false }
    return true
  }

  async function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    try {
      if (text.startsWith('/invite ')) {
        if (!isHead) { toast.error('Only the Head Doctor can invite members'); setSending(false); return }
        const query = text.slice(8).trim()
        await api(`/api/channels/${selectedId}/invite`, { method: 'POST', body: JSON.stringify({ query }) })
        toast.success(`Invite sent to ${query}`)
      } else if (text === '/info') {
        setShowRules(true)
      } else if (text === '/admin' || text.startsWith('/admin ')) {
        const msg = text === '/admin' ? '' : text.slice(7).trim()
        await api(`/api/channels/${selectedId}/call-admin`, { method: 'POST', body: JSON.stringify({ message: msg }) })
        toast.success('Admin has been called — visible in this channel and the Admin Section.')
        await loadAdminCalls()
      } else if (text.startsWith('/kick ')) {
        if (await requireSuperAdmin()) {
          const query = text.slice(6).trim()
          await api(`/api/channels/${selectedId}/kick`, { method: 'POST', body: JSON.stringify({ query }) })
          toast.success(`${query} kicked`)
        }
      } else if (text.startsWith('/ban ')) {
        if (await requireSuperAdmin()) {
          const query = text.slice(5).trim()
          await api(`/api/channels/${selectedId}/ban`, { method: 'POST', body: JSON.stringify({ query }) })
          toast.success(`${query} banned`)
        }
      } else if (text.startsWith('/timeout ')) {
        if (await requireSuperAdmin()) {
          const parts = text.slice(9).trim().split(/\s+/)
          const minutes = Number(parts[parts.length - 1])
          const hasMinutes = !isNaN(minutes) && parts.length > 1
          const query = (hasMinutes ? parts.slice(0, -1) : parts).join(' ')
          await api(`/api/channels/${selectedId}/timeout`, { method: 'POST', body: JSON.stringify({ query, minutes: hasMinutes ? minutes : undefined }) })
          toast.success(`${query} timed out`)
        }
      } else if (text.startsWith('/warn ')) {
        if (await requireSuperAdmin()) {
          const rest = text.slice(6).trim()
          const [query, reason = ''] = rest.includes('|') ? rest.split('|').map(s => s.trim()) : [rest, '']
          await api(`/api/channels/${selectedId}/warn`, { method: 'POST', body: JSON.stringify({ query, reason }) })
          toast.success(`${query} warned`)
        }
      } else if (text.startsWith('/addrule ')) {
        if (await requireSuperAdmin()) {
          const rule = text.slice(9).trim()
          await api(`/api/channels/${selectedId}/rules`, { method: 'POST', body: JSON.stringify({ action: 'add', rule }) })
          toast.success('Rule added')
        }
      } else if (text.startsWith('/removerule ')) {
        if (await requireSuperAdmin()) {
          const rule = text.slice(12).trim()
          await api(`/api/channels/${selectedId}/rules`, { method: 'POST', body: JSON.stringify({ action: 'remove', rule }) })
          toast.success('Rule removed')
        }
      } else {
        await api(`/api/channels/${selectedId}/messages`, { method: 'POST', body: JSON.stringify({ message: text }) })
      }
      setInput('')
      await loadMessages()
      await loadChannels()
    } catch (err) { toast.error(err.message) }
    setSending(false)
  }

  const q = search.trim().toLowerCase()
  const matchesSearch = c => !q || c.name.toLowerCase().includes(q) || c.head_doctor_name.toLowerCase().includes(q)
  const joinedChannels   = channels.filter(c => (isSuperAdmin || c.my_status === 'joined') && matchesSearch(c))
  const invitedChannels  = channels.filter(c => !isSuperAdmin && c.my_status === 'invited' && matchesSearch(c))
  const isUnread = c => c.id !== selectedId && c.last_message_at && c.last_message_at > (lastReadMap[c.id] || '')

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">Doctor Channels</span>
        <div className="topbar-right">
          {isSuperAdmin && (
            <button className="btn btn-primary btn-sm" onClick={() => { setForm({ name: '', rules: DEFAULT_RULES, head_doctor_id: '' }); setCreateError(''); setShowCreate(true) }}>
              <Plus size={14} /> New Channel
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 56px)' }}>
        {/* Sidebar */}
        <div style={{ width: 280, borderRight: '1px solid var(--border)', background: '#fff', overflowY: 'auto', flexShrink: 0 }}>
          {isSuperAdmin && adminCalls.length > 0 && (
            <div style={{ borderBottom: '1px solid var(--border)' }}>
              <div style={{ padding: '14px 16px 6px', fontSize: 11, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '.05em', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Siren size={12} /> Admin Section ({adminCalls.length})
              </div>
              {adminCalls.map(c => (
                <div key={c.id} onClick={() => setSelectedId(c.channel_id)} className="followup-row"
                  style={{ padding: '8px 16px 10px', cursor: 'pointer' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>#{c.channel_name}</div>
                  <div style={{ fontSize: 12, color: '#374151', margin: '2px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.message}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{timeAgo(c.created_at)}</span>
                    <button onClick={e => { e.stopPropagation(); resolveCall(c.channel_id, c.id) }}
                      style={{ padding: '3px 10px', border: 'none', borderRadius: 6, background: '#fee2e2', color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      Resolve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {channels.length > 0 && (
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search channels…"
                  style={{ width: '100%', padding: '7px 10px 7px 30px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          )}
          {loadingList ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : channels.length === 0 ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              {isSuperAdmin ? 'No channels yet. Create one to get started.' : 'No channels yet. Ask a Head Doctor to invite you.'}
            </div>
          ) : invitedChannels.length === 0 && joinedChannels.length === 0 ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No channels match "{search}"</div>
          ) : (
            <>
              {invitedChannels.length > 0 && (
                <div style={{ padding: '14px 16px 4px', fontSize: 11, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  Invitations ({invitedChannels.length})
                </div>
              )}
              {invitedChannels.map(c => (
                <ChannelRow key={c.id} c={c} active={c.id === selectedId} pending onClick={() => setSelectedId(c.id)} />
              ))}
              <div style={{ padding: '14px 16px 4px', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Channels ({joinedChannels.length})
              </div>
              {joinedChannels.map(c => (
                <ChannelRow key={c.id} c={c} active={c.id === selectedId} unread={isUnread(c)} muted={mutedSet.has(c.id)}
                  onClick={() => setSelectedId(c.id)} onToggleMute={() => toggleMute(c.id)} />
              ))}
            </>
          )}
        </div>

        {/* Main panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#f8fafc' }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', gap: 10 }}>
              <MessageSquare size={40} strokeWidth={1.2} />
              <div style={{ fontSize: 14 }}>Select a channel to start chatting</div>
            </div>
          ) : myStatus === 'invited' ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 60 }}>
              <div className="card animate-fade-up" style={{ maxWidth: 460, width: '100%', padding: '28px 28px 24px', textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Hash size={24} color="#d97706" />
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#111827', marginBottom: 4 }}>{selected.name}</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 18 }}>
                  <Crown size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 4, color: '#d97706' }} />
                  {selected.head_doctor_name} invited you to join this channel
                </div>
                <div style={{ textAlign: 'left', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Channel Rules</div>
                  {selected.rules.split('\n').map((r, i) => (
                    <div key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 4, display: 'flex', gap: 6 }}>
                      <span style={{ color: '#9ca3af' }}>•</span>{r}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button disabled={responding} onClick={() => respond(true)}
                    style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: '#059669', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {responding ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
                    Accept Join
                  </button>
                  <button disabled={responding} onClick={() => respond(false)}
                    style={{ padding: '9px 20px', border: '1px solid #fecaca', borderRadius: 8, background: '#fff', color: '#dc2626', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <XCircle size={14} />
                    Decline Join
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Channel header */}
              <div style={{ padding: '14px 22px', background: '#fff', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Hash size={15} color="#9ca3af" /> {selected.name}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    <Crown size={11} style={{ display: 'inline', verticalAlign: -1, marginRight: 3, color: '#d97706' }} />
                    {selected.head_doctor_name} ·{' '}
                    <span onClick={() => setShowMembers(true)} style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}>
                      {members.length || '…'} member{members.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => toggleMute(selectedId)} title={mutedSet.has(selectedId) ? 'Unmute notifications' : 'Mute notifications'}
                    style={{ background: mutedSet.has(selectedId) ? '#fef2f2' : '#f3f4f6', border: 'none', borderRadius: 8, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: mutedSet.has(selectedId) ? '#dc2626' : '#374151' }}>
                    {mutedSet.has(selectedId) ? <BellOff size={13} /> : <Bell size={13} />}
                  </button>
                  <button onClick={() => setShowMembers(true)} title="Channel members"
                    style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151' }}>
                    <Users size={13} /> Members
                  </button>
                  <button onClick={() => setShowRules(true)} title="Channel rules"
                    style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#374151' }}>
                    <Info size={13} /> Rules
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {loadingMsgs ? (
                  <div style={{ textAlign: 'center', color: '#9ca3af', padding: 30 }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 30 }}>No messages yet — say hello!</div>
                ) : messages.map(m => {
                  if (m.type === 'system') {
                    return <div key={m.id} style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>{m.message}</div>
                  }
                  if (m.type === 'admin_call') {
                    return (
                      <div key={m.id} style={{ alignSelf: 'center', maxWidth: 420, width: '100%' }}>
                        <div className="card" style={{ padding: '14px 18px', textAlign: 'center', border: `1.5px solid ${m.resolved ? '#e5e7eb' : '#fecaca'}`, background: m.resolved ? '#f9fafb' : '#fef2f2' }}>
                          {m.resolved ? <BellRing size={16} color="#9ca3af" style={{ marginBottom: 6 }} /> : <Siren size={16} color="#dc2626" style={{ marginBottom: 6 }} />}
                          <div style={{ fontSize: 13, fontWeight: 600, color: m.resolved ? '#6b7280' : '#991b1b' }}>{m.message}</div>
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{timeAgo(m.created_at)}</div>
                          {isSuperAdmin && (
                            m.resolved ? (
                              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>Resolved by {m.resolved_by}</div>
                            ) : (
                              <button onClick={() => resolveCall(selectedId, m.id)}
                                style={{ marginTop: 8, padding: '5px 14px', border: 'none', borderRadius: 7, background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                Resolve
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    )
                  }
                  if (m.type === 'invite') {
                    let meta = {}
                    try { meta = JSON.parse(m.meta || '{}') } catch {}
                    return (
                      <div key={m.id} style={{ alignSelf: 'center', maxWidth: 420, width: '100%' }}>
                        <div className="card" style={{ padding: '14px 18px', textAlign: 'center', border: '1.5px solid #bfdbfe', background: '#eff6ff' }}>
                          <AtSign size={16} color="#1d4ed8" style={{ marginBottom: 6 }} />
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e40af' }}>{m.message}</div>
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{timeAgo(m.created_at)}</div>
                        </div>
                      </div>
                    )
                  }
                  const mine = m.sender_email === email
                  return (
                    <div key={m.id} style={{ display: 'flex', gap: 10, flexDirection: mine ? 'row-reverse' : 'row' }}>
                      <Avatar name={m.sender_name} size={30} src={m.sender_avatar} />
                      <div style={{ maxWidth: '65%' }}>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 3, textAlign: mine ? 'right' : 'left' }}>
                          {m.sender_name} · {timeAgo(m.created_at)}
                        </div>
                        <div style={{
                          padding: '9px 14px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.4, whiteSpace: 'pre-wrap',
                          background: mine ? '#0ea5e9' : '#fff', color: mine ? '#fff' : '#1e293b',
                          border: mine ? 'none' : '1px solid #e5e7eb',
                        }}>
                          {m.message}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Input */}
              <form onSubmit={handleSend} style={{ padding: '12px 22px', background: '#fff', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder={
                    isSuperAdmin ? 'Message #' + selected.name + '  (try /kick, /ban, /timeout, /warn, /addrule, /removerule)'
                    : isHead ? 'Message #' + selected.name + '  (try /invite Dr. Name, /info, /admin)'
                    : 'Message #' + selected.name + '  (try /info, /admin)'
                  }
                  style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 13.5, outline: 'none' }}
                />
                <button type="submit" disabled={sending || !input.trim()}
                  style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: input.trim() ? '#0ea5e9' : '#e2e8f0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default' }}>
                  {sending ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Rules modal */}
      {showRules && selected && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowRules(false)}>
          <div className="animate-fade-up" style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: '0 24px 64px rgba(0,0,0,.24)' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, color: '#111827' }}>
                <ShieldCheck size={17} color="#0ea5e9" /> #{selected.name} Rules
              </div>
              <button onClick={() => setShowRules(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              {selected.rules.split('\n').map((r, i) => (
                <div key={i} style={{ fontSize: 13.5, color: '#374151', marginBottom: 8, display: 'flex', gap: 8 }}>
                  <Check size={14} color="#059669" style={{ marginTop: 2, flexShrink: 0 }} />
                  {isSuperAdmin && <span style={{ color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span>}
                  {r}
                </div>
              ))}
              <div style={{ marginTop: 14, fontSize: 12, color: '#9ca3af' }}>
                Head Doctor: <strong style={{ color: '#374151' }}>{selected.head_doctor_name}</strong>
              </div>
              {isSuperAdmin && (
                <div style={{ marginTop: 14, padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11.5, color: '#6b7280', lineHeight: 1.6 }}>
                  <strong style={{ color: '#374151' }}>Admin commands:</strong><br />
                  /addrule &lt;text&gt; · /removerule &lt;number or text&gt; · /kick &lt;name&gt; · /ban &lt;name&gt; · /timeout &lt;name&gt; [minutes] · /warn &lt;name&gt; [| reason]
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Members modal */}
      {showMembers && selected && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowMembers(false)}>
          <div className="animate-fade-up" style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 380, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,.24)' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, color: '#111827' }}>
                <Users size={17} color="#0ea5e9" /> #{selected.name} Members ({members.length})
              </div>
              <button onClick={() => setShowMembers(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '10px 14px', overflowY: 'auto' }}>
              {members.map(m => (
                <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px' }}>
                  <Avatar name={m.user_name} size={32} src={m.avatar} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.user_name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{m.user_email}</div>
                  </div>
                  {m.member_role === 'head' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 700, color: '#d97706', background: '#fffbeb', padding: '3px 8px', borderRadius: 99, flexShrink: 0 }}>
                      <Crown size={10} /> Head
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create channel modal */}
      {showCreate && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="animate-fade-up" style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 440, boxShadow: '0 24px 64px rgba(0,0,0,.24)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Hash size={17} color="#1d4ed8" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>New Channel</div>
              </div>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9ca3af' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} style={{ padding: '20px 24px' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Channel Name *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Cardiology Team"
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Head Doctor *</label>
                <select value={form.head_doctor_id} onChange={e => setForm(f => ({ ...f, head_doctor_id: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                  <option value="">Select a doctor…</option>
                  {doctors.map(d => <option key={d.id} value={d.id}>{d.name} ({d.email})</option>)}
                </select>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>The Head Doctor can invite other doctors with /invite.</div>
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#374151', marginBottom: 5 }}>Channel Rules</label>
                <textarea value={form.rules} onChange={e => setForm(f => ({ ...f, rules: e.target.value }))} rows={4}
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
              </div>
              {createError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#dc2626', marginBottom: 14 }}>{createError}</div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreate(false)} className="btn btn-secondary btn-sm">Cancel</button>
                <button type="submit" disabled={creating} className="btn btn-primary btn-sm">
                  {creating ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Creating…</> : 'Create Channel'}
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

function ChannelRow({ c, active, pending, unread, muted, onClick, onToggleMute }) {
  return (
    <div onClick={onClick} className="followup-row" style={{
      padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
      background: active ? '#eff6ff' : 'transparent', borderLeft: active ? '3px solid #0ea5e9' : '3px solid transparent',
      transition: 'background .15s ease',
    }}>
      <Avatar name={c.name} size={32} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: unread ? 800 : 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}>
          {c.name}
          {muted && <BellOff size={11} color="#9ca3af" />}
        </div>
        <div style={{ fontSize: 11, color: pending ? '#d97706' : '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {pending ? 'Pending invite' : previewText(c)}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
        {c.last_message_at && !pending && <span style={{ fontSize: 10, color: '#9ca3af' }}>{timeAgo(c.last_message_at)}</span>}
        {pending ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /> :
          unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0ea5e9' }} />}
      </div>
      {!pending && onToggleMute && (
        <button onClick={e => { e.stopPropagation(); onToggleMute() }} title={muted ? 'Unmute' : 'Mute'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2, flexShrink: 0 }}>
          {muted ? <BellOff size={13} /> : <Bell size={13} />}
        </button>
      )}
    </div>
  )
}
