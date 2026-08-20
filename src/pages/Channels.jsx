import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { MessageSquare, Plus, X, Loader2, ShieldCheck, Send, Users, Check, Info, AtSign,
         CheckCircle, XCircle, Crown, Hash, Siren, BellRing, Search, Bell, BellOff, Trash2, LogOut } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import toast from 'react-hot-toast'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

const DEFAULT_RULES = 'No racism, hate speech, or discrimination of any kind.\nNo harassment or personal attacks.\nKeep discussion professional and patient-related.\nRespect patient confidentiality (no PHI outside secure systems).'

const AVATAR_PALETTE = ['#0e7490', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#6366f1', '#ef4444', '#14b8a6']
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

function sameDay(a, b) {
  const da = new Date(a), db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

function dayLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })
}

// System/admin-call/invite messages render as centered cards, not chat bubbles —
// consecutive regular messages from the same sender within this window collapse
// into one visual group (avatar/name shown once) like most chat apps.
const GROUP_WINDOW_MS = 5 * 60 * 1000
function isSpecial(m) { return m.type === 'system' || m.type === 'admin_call' || m.type === 'invite' }
function isGrouped(msg, prev) {
  if (!prev || isSpecial(msg) || isSpecial(prev)) return false
  if (prev.sender_email !== msg.sender_email) return false
  return (new Date(msg.created_at) - new Date(prev.created_at)) < GROUP_WINDOW_MS
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
  const [confirmDeleteMsgId, setConfirmDeleteMsgId] = useState(null)
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

  async function leaveChannel() {
    if (!window.confirm(`Leave #${selected.name}? You'll need a new invite to rejoin.`)) return
    try {
      await api(`/api/channels/${selectedId}/leave`, { method: 'POST' })
      setSelectedId(null)
      await loadChannels()
      toast('You left the channel')
    } catch (err) { toast.error(err.message) }
  }

  async function deleteMessage(messageId) {
    setConfirmDeleteMsgId(null)
    try {
      await api(`/api/channels/${selectedId}/messages/${messageId}`, { method: 'DELETE' })
      await loadMessages()
    } catch (err) { toast.error(err.message) }
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
  const unreadTotal = useMemo(() => channels.filter(isUnread).length, [channels, selectedId, lastReadMap])

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Doctor Channels
          {unreadTotal > 0 && (
            <span style={{ background: 'var(--primary)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, lineHeight: 1.5 }}>
              {unreadTotal} unread
            </span>
          )}
        </span>
        <div className="topbar-right">
          {isSuperAdmin && (
            <button className="btn btn-primary btn-sm" onClick={() => { setForm({ name: '', rules: DEFAULT_RULES, head_doctor_id: '' }); setCreateError(''); setShowCreate(true) }}>
              <Plus size={14} /> New Channel
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '20px 24px 24px' }}>
        <div className={`card ch-layout${selected ? ' ch-has-selected' : ''}`}
          style={{ display: 'flex', height: 'calc(100vh - 106px)', overflow: 'hidden' }}>
          {/* Sidebar */}
          <div className="ch-sidebar" style={{ width: 288, borderRight: '1px solid var(--border)', background: 'var(--surface)', overflowY: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            {isSuperAdmin && adminCalls.length > 0 && (
              <div style={{ borderBottom: '1px solid var(--border)' }}>
                <div style={{ padding: '14px 16px 6px', fontSize: 11, fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '.05em', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Siren size={12} /> Admin Section ({adminCalls.length})
                </div>
                {adminCalls.map(c => (
                  <div key={c.id} onClick={() => setSelectedId(c.channel_id)} className="followup-row"
                    style={{ padding: '8px 16px 10px', cursor: 'pointer' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>#{c.channel_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', margin: '2px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.message}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{timeAgo(c.created_at)}</span>
                      <button onClick={e => { e.stopPropagation(); resolveCall(c.channel_id, c.id) }} className="badge badge-danger"
                        style={{ border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                        Resolve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {channels.length > 0 && (
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={13} color="var(--text3)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search channels…"
                    className="ch-search-input"
                    style={{ width: '100%', padding: '8px 10px 8px 32px', border: '1.5px solid var(--border)', background: 'var(--surface2)', borderRadius: 99, fontSize: 12.5, outline: 'none', boxSizing: 'border-box', color: 'var(--text)' }}
                  />
                </div>
              </div>
            )}
            {loadingList ? (
              <div style={{ padding: 30, textAlign: 'center' }}>
                <div className="spinner spinner-dark" style={{ margin: '0 auto' }} />
              </div>
            ) : channels.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 20px' }}>
                <MessageSquare strokeWidth={1.2} />
                <p style={{ fontSize: 13 }}>{isSuperAdmin ? 'No channels yet. Create one to get started.' : 'No channels yet. Ask a Head Doctor to invite you.'}</p>
              </div>
            ) : invitedChannels.length === 0 && joinedChannels.length === 0 ? (
              <div className="empty-state" style={{ padding: '30px 20px' }}>
                <Search strokeWidth={1.2} />
                <p style={{ fontSize: 13 }}>No channels match "{search}"</p>
              </div>
            ) : (
              <>
                {invitedChannels.length > 0 && (
                  <div style={{ padding: '14px 16px 4px', fontSize: 11, fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Invitations ({invitedChannels.length})
                  </div>
                )}
                {invitedChannels.map(c => (
                  <ChannelRow key={c.id} c={c} active={c.id === selectedId} pending onClick={() => setSelectedId(c.id)} />
                ))}
                <div style={{ padding: '14px 16px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
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
          <div className="ch-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--surface2)', containerType: 'inline-size' }}>
            {!selected ? (
              <div className="empty-state" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                <MessageSquare strokeWidth={1.2} />
                <p>Select a channel to start chatting</p>
              </div>
            ) : myStatus === 'invited' ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 60, overflowY: 'auto' }}>
                <div className="card hoverable animate-fade-up" style={{ maxWidth: 460, width: '100%', padding: '28px 28px 24px', textAlign: 'center', margin: 16 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--warning-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    <Hash size={24} color="var(--warning)" />
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>{selected.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}>
                    <Crown size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 4, color: 'var(--warning)' }} />
                    {selected.head_doctor_name} invited you to join this channel
                  </div>
                  <div style={{ textAlign: 'left', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Channel Rules</div>
                    {selected.rules.split('\n').map((r, i) => (
                      <div key={i} style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4, display: 'flex', gap: 6 }}>
                        <span style={{ color: 'var(--text3)' }}>•</span>{r}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button disabled={responding} onClick={() => respond(true)} className="btn btn-success">
                      {responding ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
                      Accept Join
                    </button>
                    <button disabled={responding} onClick={() => respond(false)} className="btn btn-secondary"
                      style={{ color: 'var(--danger)', borderColor: 'var(--danger-light)' }}>
                      <XCircle size={14} />
                      Decline Join
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Channel header */}
                <div style={{ padding: '14px 22px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1, overflow: 'hidden' }}>
                    <button className="ch-back ch-icon-btn" onClick={() => setSelectedId(null)} title="Back to channels"
                      style={{ display: 'none', width: 32, height: 32, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      ‹
                    </button>
                    <div style={{ minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <Hash size={15} color="var(--text3)" style={{ flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected.name}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <Crown size={11} style={{ display: 'inline', verticalAlign: -1, marginRight: 3, color: 'var(--warning)' }} />
                        {selected.head_doctor_name} ·{' '}
                        <span onClick={() => setShowMembers(true)} style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}>
                          {members.length || '…'} member{members.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="ch-header-buttons" style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => toggleMute(selectedId)} title={mutedSet.has(selectedId) ? 'Unmute notifications' : 'Mute notifications'}
                      className="ch-icon-btn" style={mutedSet.has(selectedId) ? { background: 'var(--danger-light)', color: 'var(--danger)' } : undefined}>
                      {mutedSet.has(selectedId) ? <BellOff size={13} /> : <Bell size={13} />}
                    </button>
                    <button onClick={() => setShowMembers(true)} title="Channel members" className="ch-icon-btn">
                      <Users size={13} /> <span className="ch-btn-label">Members</span>
                    </button>
                    <button onClick={() => setShowRules(true)} title="Channel rules" className="ch-icon-btn">
                      <Info size={13} /> <span className="ch-btn-label">Rules</span>
                    </button>
                    {!isSuperAdmin && !isHead && (
                      <button onClick={leaveChannel} title="Leave channel" className="ch-icon-btn" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
                        <LogOut size={13} /> <span className="ch-btn-label">Leave</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {loadingMsgs ? (
                    <div style={{ textAlign: 'center', padding: 30 }}><div className="spinner spinner-dark" style={{ margin: '0 auto' }} /></div>
                  ) : messages.length === 0 ? (
                    <div className="empty-state" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      <MessageSquare strokeWidth={1.2} />
                      <p>No messages yet — say hello!</p>
                    </div>
                  ) : messages.map((m, i) => {
                    const prev = messages[i - 1]
                    const showDivider = !prev || !sameDay(m.created_at, prev.created_at)
                    const divider = showDivider && (
                      <div style={{ textAlign: 'center', margin: i === 0 ? '0 0 8px' : '10px 0 8px' }}>
                        <span style={{ background: 'var(--surface2)', color: 'var(--text3)', fontSize: 11, fontWeight: 700, padding: '4px 14px', borderRadius: 99, letterSpacing: '.02em' }}>
                          {dayLabel(m.created_at)}
                        </span>
                      </div>
                    )

                    if (m.type === 'system') {
                      return (
                        <React.Fragment key={m.id}>
                          {divider}
                          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', margin: '6px 0' }}>{m.message}</div>
                        </React.Fragment>
                      )
                    }
                    if (m.type === 'admin_call') {
                      return (
                        <React.Fragment key={m.id}>
                          {divider}
                          <div style={{ alignSelf: 'center', maxWidth: 420, width: '100%', margin: '6px 0' }}>
                            <div className="card" style={{ padding: '14px 18px', textAlign: 'center', border: `1.5px solid ${m.resolved ? 'var(--border)' : 'var(--danger)'}`, background: m.resolved ? 'var(--surface2)' : 'var(--danger-light)' }}>
                              {m.resolved ? <BellRing size={16} color="var(--text3)" style={{ marginBottom: 6 }} /> : <Siren size={16} color="var(--danger)" style={{ marginBottom: 6 }} />}
                              <div style={{ fontSize: 13, fontWeight: 600, color: m.resolved ? 'var(--text2)' : 'var(--danger)' }}>{m.message}</div>
                              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{timeAgo(m.created_at)}</div>
                              {isSuperAdmin && (
                                m.resolved ? (
                                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>Resolved by {m.resolved_by}</div>
                                ) : (
                                  <button onClick={() => resolveCall(selectedId, m.id)} className="btn btn-danger btn-sm" style={{ marginTop: 8 }}>
                                    Resolve
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        </React.Fragment>
                      )
                    }
                    if (m.type === 'invite') {
                      return (
                        <React.Fragment key={m.id}>
                          {divider}
                          <div style={{ alignSelf: 'center', maxWidth: 420, width: '100%', margin: '6px 0' }}>
                            <div className="card" style={{ padding: '14px 18px', textAlign: 'center', border: '1.5px solid var(--border-strong)', background: 'var(--primary-light)' }}>
                              <AtSign size={16} color="var(--primary-dark)" style={{ marginBottom: 6 }} />
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary-dark)' }}>{m.message}</div>
                              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{timeAgo(m.created_at)}</div>
                            </div>
                          </div>
                        </React.Fragment>
                      )
                    }

                    const mine = m.sender_email === email
                    const canDelete = mine || isSuperAdmin
                    const grouped = isGrouped(m, prev) && !showDivider

                    return (
                      <React.Fragment key={m.id}>
                        {divider}
                        <div className="msg-row" style={{ display: 'flex', gap: 10, flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', marginTop: showDivider ? 0 : (grouped ? 2 : 14) }}>
                          {grouped ? <div style={{ width: 30, flexShrink: 0 }} /> : <Avatar name={m.sender_name} size={30} src={m.sender_avatar} />}
                          <div style={{ maxWidth: '65%', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                            {!grouped && (
                              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>
                                {m.sender_name} · {timeAgo(m.created_at)}
                              </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: mine ? 'row-reverse' : 'row' }}>
                              <div style={{
                                padding: '9px 14px', fontSize: 13.5, lineHeight: 1.4, whiteSpace: 'pre-wrap',
                                borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                                background: mine ? 'var(--primary)' : 'var(--surface)', color: mine ? '#fff' : 'var(--text)',
                                border: mine ? 'none' : '1px solid var(--border)',
                              }}>
                                {m.message}
                              </div>
                              {canDelete && (
                                <Trash2 size={12} onClick={() => setConfirmDeleteMsgId(m.id)}
                                  className="msg-meta-hover" style={{ cursor: 'pointer', color: 'var(--text3)', flexShrink: 0 }} />
                              )}
                            </div>
                            {grouped && (
                              <div className="msg-meta-hover" style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{timeAgo(m.created_at)}</div>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    )
                  })}
                </div>

                {/* Input */}
                <form onSubmit={handleSend} style={{ padding: '12px 22px', background: 'var(--surface)', borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
                  <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={
                      isSuperAdmin ? 'Message #' + selected.name + '  (try /kick, /ban, /timeout, /warn, /addrule, /removerule)'
                      : isHead ? 'Message #' + selected.name + '  (try /invite Dr. Name, /info, /admin)'
                      : 'Message #' + selected.name + '  (try /info, /admin)'
                    }
                    className="ch-msg-input"
                    style={{ flex: 1, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13.5, outline: 'none', color: 'var(--text)', background: 'var(--surface)' }}
                  />
                  <button type="submit" disabled={sending || !input.trim()} className="ch-send-btn"
                    style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: input.trim() ? 'var(--primary)' : 'var(--border)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default' }}>
                    {sending ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Rules modal */}
      {showRules && selected && (
        <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setShowRules(false)}>
          <div className="animate-fade-up" style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: '0 24px 64px rgba(0,0,0,.24)' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                <ShieldCheck size={17} color="var(--primary)" /> #{selected.name} Rules
              </div>
              <button onClick={() => setShowRules(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              {selected.rules.split('\n').map((r, i) => (
                <div key={i} style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 8, display: 'flex', gap: 8 }}>
                  <Check size={14} color="var(--success)" style={{ marginTop: 2, flexShrink: 0 }} />
                  {isSuperAdmin && <span style={{ color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span>}
                  {r}
                </div>
              ))}
              <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text3)' }}>
                Head Doctor: <strong style={{ color: 'var(--text2)' }}>{selected.head_doctor_name}</strong>
              </div>
              {isSuperAdmin && (
                <div style={{ marginTop: 14, padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--text)' }}>Admin commands:</strong><br />
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
          <div className="animate-fade-up" style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 380, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,.24)' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                <Users size={17} color="var(--primary)" /> #{selected.name} Members ({members.length})
              </div>
              <button onClick={() => setShowMembers(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '10px 14px', overflowY: 'auto' }}>
              {members.map(m => (
                <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px' }}>
                  <Avatar name={m.user_name} size={32} src={m.avatar} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.user_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.user_email}</div>
                  </div>
                  {m.member_role === 'head' && (
                    <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
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
          <div className="animate-fade-up" style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 440, boxShadow: '0 24px 64px rgba(0,0,0,.24)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Hash size={17} color="var(--primary)" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>New Channel</div>
              </div>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} style={{ padding: '20px 24px' }}>
              <div className="form-group">
                <label className="form-label">Channel Name<span className="req">*</span></label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Cardiology Team" className="form-input" />
              </div>
              <div className="form-group">
                <label className="form-label">Head Doctor<span className="req">*</span></label>
                <select value={form.head_doctor_id} onChange={e => setForm(f => ({ ...f, head_doctor_id: e.target.value }))} className="form-select">
                  <option value="">Select a doctor…</option>
                  {doctors.map(d => <option key={d.id} value={d.id}>{d.name} ({d.email})</option>)}
                </select>
                <div className="form-hint">The Head Doctor can invite other doctors with /invite.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Channel Rules</label>
                <textarea value={form.rules} onChange={e => setForm(f => ({ ...f, rules: e.target.value }))} rows={4} className="form-textarea" />
              </div>
              {createError && (
                <div style={{ background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--danger)', marginBottom: 14 }}>{createError}</div>
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

      <ConfirmDialog
        open={!!confirmDeleteMsgId}
        title="Delete Message"
        message="Delete this message? This cannot be undone."
        danger
        onConfirm={() => deleteMessage(confirmDeleteMsgId)}
        onCancel={() => setConfirmDeleteMsgId(null)}
      />

      <style>{`
        .ch-icon-btn {
          background: var(--surface2); border: none; border-radius: 8px; padding: 7px 12px;
          display: flex; align-items: center; gap: 5px; cursor: pointer; font-size: 12px; font-weight: 600;
          color: var(--text2); transition: background .15s, color .15s;
        }
        .ch-icon-btn:hover { background: var(--border); color: var(--text); }
        .ch-search-input:focus { border-color: var(--primary) !important; background: var(--surface) !important; }
        .ch-msg-input:focus { border-color: var(--primary) !important; box-shadow: 0 0 0 3.5px var(--primary-muted); }
        .ch-send-btn:hover:not(:disabled) { background: var(--primary-dark) !important; }
        .msg-meta-hover { opacity: 0; transition: opacity .15s; }
        .msg-row:hover .msg-meta-hover { opacity: 1; }
        @media (max-width: 640px) {
          .ch-sidebar { width: 100% !important; }
          .ch-main { display: none !important; }
          .ch-has-selected .ch-sidebar { display: none !important; }
          .ch-has-selected .ch-main { display: flex !important; }
          .ch-back { display: flex !important; }
        }
        @container (max-width: 480px) {
          .ch-header-buttons { gap: 4px !important; }
          .ch-icon-btn { padding: 7px 9px !important; }
          .ch-icon-btn span.ch-btn-label { display: none; }
        }
      `}</style>
    </div>
  )
}

function ChannelRow({ c, active, pending, unread, muted, onClick, onToggleMute }) {
  return (
    <div onClick={onClick} className="followup-row" style={{
      padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
      background: active ? 'var(--primary-light)' : 'transparent', borderLeft: active ? '3px solid var(--primary)' : '3px solid transparent',
      transition: 'background .15s ease',
    }}>
      <Avatar name={c.name} size={32} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: unread ? 800 : 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}>
          {c.name}
          {muted && <BellOff size={11} color="var(--text3)" />}
        </div>
        <div style={{ fontSize: 11, color: pending ? 'var(--warning)' : 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {pending ? 'Pending invite' : previewText(c)}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
        {c.last_message_at && !pending && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{timeAgo(c.last_message_at)}</span>}
        {pending ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--warning)' }} /> :
          unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)' }} />}
      </div>
      {!pending && onToggleMute && (
        <button onClick={e => { e.stopPropagation(); onToggleMute() }} title={muted ? 'Unmute' : 'Mute'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {muted ? <BellOff size={13} /> : <Bell size={13} />}
        </button>
      )}
    </div>
  )
}
