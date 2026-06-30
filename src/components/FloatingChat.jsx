import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MessageCircle, X, Home, MessageSquare, Inbox, Send, Paperclip, Smile, Bot, ChevronDown, Check, XCircle, MoreVertical, ArrowRight } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const fmtTime = ts => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

function Avatar({ name, size = 36, role }) {
  const colors = {
    superadmin: 'linear-gradient(135deg,#1d6ef5,#38bdf8)',
    doctor:     'linear-gradient(135deg,#059669,#34d399)',
    nurse:      'linear-gradient(135deg,#d97706,#fbbf24)',
    default:    'linear-gradient(135deg,#7c3aed,#a78bfa)',
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: colors[role] || colors.default,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontWeight: 800, fontSize: Math.round(size * 0.38), color: '#fff',
      boxShadow: '0 2px 8px rgba(0,0,0,.15)',
    }}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  )
}

function OnlineDot() {
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e', marginRight: 5, boxShadow: '0 0 0 2px rgba(34,197,94,.3)' }} />
}

export default function FloatingChat() {
  const { key, role, label, email } = useKey()

  const [open, setOpen]   = useState(false)
  const [tab,  setTab]    = useState('home')

  // user
  const [session,  setSession]  = useState(null)
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [starting, setStarting] = useState(false)

  // superadmin
  const [activeSession,   setActiveSession]   = useState(null)
  const [adminMessages,   setAdminMessages]   = useState([])
  const [adminInput,      setAdminInput]      = useState('')
  const [adminSending,    setAdminSending]    = useState(false)
  const [pendingSessions, setPendingSessions] = useState([])
  const [pendingCount,    setPendingCount]    = useState(0)

  const msgEndRef      = useRef(null)
  const adminEndRef    = useRef(null)
  const msgPollRef     = useRef(null)
  const pendingPollRef = useRef(null)
  const adminPollRef   = useRef(null)

  const api = useCallback((path, opts = {}) => fetch(path, {
    ...opts,
    headers: { 'x-api-key': key, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  }).then(r => r.json()), [key])

  useEffect(() => {
    if (!key || !session || ['closed', 'declined'].includes(session.status)) {
      clearInterval(msgPollRef.current); return
    }
    const poll = () => {
      api(`/api/chat/sessions/${session.id}/messages`).then(d => Array.isArray(d) && setMessages(d)).catch(() => {})
      api('/api/chat/sessions').then(d => {
        if (Array.isArray(d)) { const s = d.find(x => x.id === session.id); if (s) setSession(s) }
      }).catch(() => {})
    }
    poll(); msgPollRef.current = setInterval(poll, 3000)
    return () => clearInterval(msgPollRef.current)
  }, [key, session?.id, session?.status]) // eslint-disable-line

  useEffect(() => {
    if (!key || role !== 'superadmin') return
    const poll = () => api('/api/chat/sessions/pending').then(d => {
      if (d?.count != null) { setPendingCount(d.count); setPendingSessions(d.sessions || []) }
    }).catch(() => {})
    poll(); pendingPollRef.current = setInterval(poll, 4000)
    return () => clearInterval(pendingPollRef.current)
  }, [key, role]) // eslint-disable-line

  useEffect(() => {
    clearInterval(adminPollRef.current)
    if (!activeSession) return
    const poll = () => api(`/api/chat/sessions/${activeSession.id}/messages`).then(d => Array.isArray(d) && setAdminMessages(d)).catch(() => {})
    poll(); adminPollRef.current = setInterval(poll, 3000)
    return () => clearInterval(adminPollRef.current)
  }, [activeSession?.id]) // eslint-disable-line

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { adminEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [adminMessages])

  if (!key) return null

  // ── Actions ───────────────────────────────────────────────────────────────
  async function startChat() {
    if (starting) return
    setStarting(true)
    setTab('messages')
    try {
      const d = await api('/api/chat/sessions', { method: 'POST', body: JSON.stringify({ subject: 'General inquiry' }) })
      if (d.id) setSession({ ...d, status: 'waiting' })
    } catch {}
    setStarting(false)
  }

  async function sendMsg() {
    if (!input.trim() || sending || !session) return
    setSending(true)
    const text = input.trim(); setInput('')
    try {
      const m = await api(`/api/chat/sessions/${session.id}/messages`, { method: 'POST', body: JSON.stringify({ message: text }) })
      if (m.id) setMessages(p => [...p, m])
    } catch {}
    setSending(false)
  }

  async function endUserChat() {
    if (!session) return
    await api(`/api/chat/sessions/${session.id}/close`, { method: 'POST' })
    setSession(p => ({ ...p, status: 'closed' }))
  }

  async function acceptSession(s) {
    await api(`/api/chat/sessions/${s.id}/accept`, { method: 'POST' })
    setActiveSession(s); setAdminMessages([])
    setPendingSessions(p => p.filter(x => x.id !== s.id))
    setPendingCount(p => Math.max(0, p - 1))
    setTab('messages')
  }

  async function declineSession(s) {
    await api(`/api/chat/sessions/${s.id}/decline`, { method: 'POST' })
    setPendingSessions(p => p.filter(x => x.id !== s.id))
    setPendingCount(p => Math.max(0, p - 1))
  }

  async function sendAdminMsg() {
    if (!adminInput.trim() || adminSending || !activeSession) return
    setAdminSending(true)
    const text = adminInput.trim(); setAdminInput('')
    try {
      const m = await api(`/api/chat/sessions/${activeSession.id}/messages`, { method: 'POST', body: JSON.stringify({ message: text }) })
      if (m.id) setAdminMessages(p => [...p, m])
    } catch {}
    setAdminSending(false)
  }

  async function endAdminChat() {
    if (!activeSession) return
    await api(`/api/chat/sessions/${activeSession.id}/close`, { method: 'POST' })
    setActiveSession(null); setAdminMessages([]); setTab('home')
  }

  // ── Shared message bubble ─────────────────────────────────────────────────
  function Bubble({ msg, i, myEmail }) {
    const mine = msg.sender_email === myEmail
    if (msg.sender_role === 'system') return (
      <div key={i} style={{ textAlign: 'center', margin: '10px 0' }}>
        <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', background: '#f1f5f9', padding: '3px 12px', borderRadius: 99 }}>{msg.message}</span>
      </div>
    )
    return (
      <div key={i} style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 }}>
        {!mine && <Avatar name={msg.sender_name} size={28} role={msg.sender_role} />}
        <div style={{ maxWidth: '73%' }}>
          {!mine && <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, marginLeft: 2 }}>{msg.sender_name}</div>}
          <div style={{
            padding: '10px 14px', lineHeight: 1.55, fontSize: 13.5,
            borderRadius: mine ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
            background: mine ? 'linear-gradient(135deg,#1d6ef5,#0ea5e9)' : '#f1f5f9',
            color: mine ? '#fff' : '#1e293b',
            boxShadow: mine ? '0 4px 14px rgba(29,110,245,.28)' : '0 1px 3px rgba(0,0,0,.07)',
          }}>{msg.message}</div>
          <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 3, textAlign: mine ? 'right' : 'left', paddingInline: 2 }}>
            {fmtTime(msg.created_at)}
          </div>
        </div>
      </div>
    )
  }

  // ── Input bar ─────────────────────────────────────────────────────────────
  function InputBar({ value, onChange, onSend, disabled, placeholder = 'Enter your message…' }) {
    return (
      <div style={{ padding: '10px 14px 12px', background: '#fff', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, color: '#94a3b8' }}>
          <Bot size={17} style={{ cursor: 'pointer', transition: 'color .15s' }} onMouseEnter={e => e.target.style.color='#1d6ef5'} onMouseLeave={e => e.target.style.color='#94a3b8'} />
          <Paperclip size={17} style={{ cursor: 'pointer', transition: 'color .15s' }} onMouseEnter={e => e.target.style.color='#1d6ef5'} onMouseLeave={e => e.target.style.color='#94a3b8'} />
          <Smile size={17} style={{ cursor: 'pointer', transition: 'color .15s' }} onMouseEnter={e => e.target.style.color='#1d6ef5'} onMouseLeave={e => e.target.style.color='#94a3b8'} />
        </div>
        <input
          value={value} onChange={onChange}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && onSend()}
          placeholder={placeholder} disabled={disabled}
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13.5, color: '#1e293b', background: 'transparent', minWidth: 0 }}
        />
        <button
          onClick={onSend} disabled={disabled || !value.trim()}
          style={{
            width: 38, height: 38, borderRadius: '50%', flexShrink: 0, border: 'none', cursor: 'pointer',
            background: (disabled || !value.trim()) ? '#e2e8f0' : 'linear-gradient(135deg,#1d6ef5,#0ea5e9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: (!disabled && value.trim()) ? '0 4px 12px rgba(29,110,245,.4)' : 'none',
            transition: 'all .2s',
          }}
        ><Send size={15} color="#fff" /></button>
      </div>
    )
  }

  // ── Tab bar ───────────────────────────────────────────────────────────────
  const userTabs  = [
    { id: 'home',     label: 'Home',     Icon: Home },
    { id: 'messages', label: 'Messages', Icon: MessageSquare },
  ]
  const adminTabs = [
    { id: 'home',     label: 'Home',     Icon: Home },
    { id: 'messages', label: 'Messages', Icon: MessageSquare },
    { id: 'requests', label: 'Requests', Icon: Inbox, badge: pendingCount },
  ]
  function TabBar({ tabs }) {
    return (
      <div style={{ display: 'flex', borderTop: '1px solid #f1f5f9', background: '#fff', flexShrink: 0, paddingBottom: 2 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '10px 0 8px', border: 'none', background: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            color: tab === t.id ? '#1d6ef5' : '#94a3b8',
            borderTop: `2px solid ${tab === t.id ? '#1d6ef5' : 'transparent'}`,
            fontSize: 10.5, fontWeight: tab === t.id ? 700 : 500, position: 'relative',
            transition: 'color .15s',
          }}>
            <t.Icon size={18} strokeWidth={tab === t.id ? 2.3 : 1.7} />
            {t.label}
            {t.badge > 0 && (
              <span style={{ position: 'absolute', top: 6, left: '50%', marginLeft: 4, background: '#ef4444', color: '#fff', borderRadius: 99, fontSize: 9, fontWeight: 800, padding: '1px 5px', lineHeight: '13px' }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    )
  }

  // ── Blue wave header ──────────────────────────────────────────────────────
  function BlueChatHeader({ name, subRole, onClose, onEnd }) {
    return (
      <div style={{ flexShrink: 0 }}>
        <div style={{ background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)', padding: '18px 16px 6px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <Avatar name={name} size={42} role={subRole} />
            <span style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, background: '#22c55e', borderRadius: '50%', border: '2px solid #1a65e8' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 11, letterSpacing: .3 }}>Chat with</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginTop: 1 }}>{name}</div>
          </div>
          <MoreVertical size={18} color="rgba(255,255,255,.65)" style={{ cursor: 'pointer' }} />
          {onEnd && <button onClick={onEnd} style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.25)', borderRadius: 8, padding: '4px 10px', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>End</button>}
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronDown size={18} color="#fff" />
          </button>
        </div>
        {/* Wave */}
        <div style={{ background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)', lineHeight: 0 }}>
          <svg viewBox="0 0 370 30" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', width: '100%' }}>
            <path d="M0,10 C60,28 160,0 260,18 C300,24 340,14 370,20 L370,30 L0,30 Z" fill="#fff" />
          </svg>
        </div>
        <div style={{ background: '#fff', padding: '4px 16px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <OnlineDot /><span style={{ fontSize: 12, color: '#64748b' }}>We are online!</span>
        </div>
      </div>
    )
  }

  // ── Home header ───────────────────────────────────────────────────────────
  function HomeHeader() {
    return (
      <div style={{ flexShrink: 0 }}>
        <div style={{ background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)', padding: '20px 16px 6px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={label} size={42} role={role} />
          <div style={{ flex: 1 }}>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 11, letterSpacing: .3 }}>Welcome back,</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, marginTop: 1 }}>{label}</div>
          </div>
          {role === 'superadmin' && pendingCount > 0 && (
            <span style={{ background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: 11, padding: '2px 8px', borderRadius: 99 }}>
              {pendingCount} pending
            </span>
          )}
          <button onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#fff" />
          </button>
        </div>
        <div style={{ background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)', lineHeight: 0 }}>
          <svg viewBox="0 0 370 30" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', width: '100%' }}>
            <path d="M0,10 C60,28 160,0 260,18 C300,24 340,14 370,20 L370,30 L0,30 Z" fill="#fff" />
          </svg>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HOME TAB
  // ══════════════════════════════════════════════════════════════════════════
  function HomeTab() {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* New Message — click = start chat immediately */}
        <button
          onClick={startChat}
          disabled={starting}
          style={{
            width: '100%', borderRadius: 16, padding: '18px 20px',
            background: 'linear-gradient(135deg,#1a65e8,#7c3aed)',
            border: 'none', cursor: starting ? 'default' : 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 14,
            boxShadow: '0 6px 24px rgba(26,101,232,.38)',
            opacity: starting ? .75 : 1, transition: 'opacity .2s, transform .15s',
          }}
          onMouseEnter={e => { if (!starting) e.currentTarget.style.transform = 'scale(1.015)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {starting
              ? <div style={{ width: 20, height: 20, border: '2.5px solid rgba(255,255,255,.4)', borderTop: '2.5px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              : <MessageSquare size={21} color="#fff" />
            }
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 2 }}>New Message</div>
            <div style={{ color: 'rgba(255,255,255,.72)', fontSize: 12 }}>
              {starting ? 'Opening chat…' : 'Start a new conversation'}
            </div>
          </div>
          {!starting && <ArrowRight size={18} color="rgba(255,255,255,.6)" />}
        </button>

        {/* Status */}
        <div style={{ borderRadius: 14, padding: '13px 15px', border: '1.5px solid #bbf7d0', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#059669,#34d399)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(5,150,105,.25)' }}>
            <Check size={17} color="#fff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ color: '#047857', fontWeight: 700, fontSize: 13 }}>Status: All Systems Operational</div>
            <div style={{ color: '#6b7280', fontSize: 11, marginTop: 1 }}>
              Vianova Health · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} UTC
            </div>
          </div>
        </div>

        {/* Documentation */}
        <button
          onClick={() => window.open('https://github.com/Thebestoo/VianovaHealthCureV3', '_blank')}
          style={{ width: '100%', borderRadius: 14, padding: '13px 17px', border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,.05)', transition: 'border-color .15s' }}
          onMouseEnter={e => e.currentTarget.style.borderColor='#1d6ef5'}
          onMouseLeave={e => e.currentTarget.style.borderColor='#e2e8f0'}
        >
          <span style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Documentation</span>
          <span style={{ color: '#94a3b8', fontSize: 17, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </span>
        </button>

        {/* Superadmin: pending alert */}
        {role === 'superadmin' && pendingCount > 0 && (
          <button
            onClick={() => setTab('requests')}
            style={{ width: '100%', borderRadius: 14, padding: '13px 15px', border: '1.5px solid #fecaca', background: 'linear-gradient(135deg,#fff7f7,#fff1f2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', transition: 'transform .15s' }}
            onMouseEnter={e => e.currentTarget.style.transform='scale(1.01)'}
            onMouseLeave={e => e.currentTarget.style.transform='scale(1)'}
          >
            <span style={{ background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: 14, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(239,68,68,.3)' }}>
              {pendingCount}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#dc2626' }}>Pending chat requests</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>Tap to review and respond</div>
            </div>
            <ArrowRight size={16} color="#ef4444" />
          </button>
        )}

        {/* Resume active chat shortcut */}
        {session && session.status === 'active' && (
          <button
            onClick={() => setTab('messages')}
            style={{ width: '100%', borderRadius: 14, padding: '13px 15px', border: '1.5px solid #bfdbfe', background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}
          >
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(29,110,245,.3)' }}>
              <MessageSquare size={15} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#1d6ef5' }}>Resume active chat</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>You have an ongoing conversation</div>
            </div>
            <ArrowRight size={16} color="#1d6ef5" />
          </button>
        )}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MESSAGES TAB — user
  // ══════════════════════════════════════════════════════════════════════════
  function UserMessages() {
    // Loading / just started
    if (starting || (session && session.status === 'waiting')) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, border: '3px solid #e2e8f0', borderTop: '3px solid #1d6ef5', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Connecting to support…</div>
          <div style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.6 }}>Our team will be with you shortly.<br />Available 24 / 7</div>
        </div>
      )
    }

    if (!session) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center', gap: 14 }}>
          <div style={{ fontSize: 44 }}>💬</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>No active conversation</div>
          <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>Go to Home and press <strong>New Message</strong> to start a chat with our team.</div>
          <button onClick={startChat} style={{ padding: '10px 22px', borderRadius: 12, background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 4px 14px rgba(29,110,245,.35)' }}>
            Start Chat
          </button>
        </div>
      )
    }

    if (session.status === 'closed' || session.status === 'declined') {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center', gap: 10 }}>
          <div style={{ fontSize: 46 }}>{session.status === 'declined' ? '😔' : '✅'}</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{session.status === 'declined' ? 'No agents available' : 'Chat ended'}</div>
          <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, maxWidth: 260 }}>
            {session.status === 'declined' ? 'Sorry, no agents are available right now. Please try again later.' : 'Thank you for reaching out. Have a great day!'}
          </div>
          <button onClick={() => { setSession(null); setMessages([]) }} style={{ marginTop: 6, padding: '10px 22px', borderRadius: 12, background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 4px 14px rgba(29,110,245,.35)' }}>
            New Chat
          </button>
        </div>
      )
    }

    // active
    return (
      <>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 4px', minHeight: 0 }}>
          {messages.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12.5, padding: '24px 0' }}>Support has joined — say hello 👋</div>}
          {messages.map((m, i) => <Bubble key={m.id || i} msg={m} i={i} myEmail={email} />)}
          <div ref={msgEndRef} />
        </div>
        <InputBar value={input} onChange={e => setInput(e.target.value)} onSend={sendMsg} disabled={sending} />
      </>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MESSAGES TAB — superadmin
  // ══════════════════════════════════════════════════════════════════════════
  function AdminMessages() {
    if (!activeSession) return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center', gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MessageSquare size={24} color="#cbd5e1" />
        </div>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#64748b' }}>No active chat</div>
        <div style={{ fontSize: 12.5, color: '#94a3b8', lineHeight: 1.6 }}>Accept a request from the <strong>Requests</strong> tab to start helping someone.</div>
        {pendingCount > 0 && (
          <button onClick={() => setTab('requests')} style={{ padding: '9px 20px', borderRadius: 12, background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 14px rgba(29,110,245,.35)' }}>
            View {pendingCount} Request{pendingCount > 1 ? 's' : ''}
          </button>
        )}
      </div>
    )

    return (
      <>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 4px', minHeight: 0 }}>
          {adminMessages.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12.5, padding: '24px 0' }}>Session started — say hello 👋</div>}
          {adminMessages.map((m, i) => <Bubble key={m.id || i} msg={m} i={i} myEmail={email} />)}
          <div ref={adminEndRef} />
        </div>
        <InputBar value={adminInput} onChange={e => setAdminInput(e.target.value)} onSend={sendAdminMsg} disabled={adminSending} />
      </>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REQUESTS TAB
  // ══════════════════════════════════════════════════════════════════════════
  function RequestsTab() {
    if (pendingSessions.length === 0) return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 46 }}>✅</div>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#059669' }}>All clear!</div>
        <div style={{ fontSize: 12.5, color: '#94a3b8' }}>No pending requests right now.</div>
      </div>
    )

    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {pendingSessions.map(s => (
          <div key={s.id} style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 16, padding: '14px', marginBottom: 10, boxShadow: '0 2px 10px rgba(0,0,0,.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ position: 'relative' }}>
                <Avatar name={s.created_by_name} size={42} role={s.created_by_role} />
                <span style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, background: '#22c55e', borderRadius: '50%', border: '2px solid #fff' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.created_by_name}</div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>
                  <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{s.created_by_role}</span> · {fmtTime(s.created_at)}
                </div>
                {s.subject && <div style={{ fontSize: 12, color: '#475569', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>"{s.subject}"</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => acceptSession(s)} style={{ flex: 1, padding: '9px 0', borderRadius: 10, background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, boxShadow: '0 4px 12px rgba(29,110,245,.3)' }}>
                <Check size={14} /> Accept
              </button>
              <button onClick={() => declineSession(s)} style={{ flex: 1, padding: '9px 0', borderRadius: 10, background: '#fff', border: '1.5px solid #fca5a5', color: '#ef4444', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <XCircle size={14} /> Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Determine header type ─────────────────────────────────────────────────
  const showChatHeader =
    (tab === 'messages' && role !== 'superadmin' && session?.status === 'active') ||
    (tab === 'messages' && role === 'superadmin' && activeSession)

  const chatName = role === 'superadmin'
    ? activeSession?.created_by_name
    : session?.admin_name || 'Vianova Support'
  const chatRole = role === 'superadmin'
    ? activeSession?.created_by_role
    : 'superadmin'

  const tabs = role === 'superadmin' ? adminTabs : userTabs

  return (
    <>
      <style>{`
        @keyframes chatPulse { 0%{transform:scale(1);opacity:1} 100%{transform:scale(1.8);opacity:0} }
        @keyframes slideUp   { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin      { to{transform:rotate(360deg)} }
      `}</style>

      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          width: 62, height: 62, borderRadius: '50%',
          background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)',
          border: 'none', cursor: 'pointer',
          boxShadow: '0 8px 28px rgba(26,101,232,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform .18s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform='scale(1.09)'}
        onMouseLeave={e => e.currentTarget.style.transform='scale(1)'}
      >
        <div style={{ transition: 'transform .2s', transform: open ? 'rotate(0deg)' : 'rotate(0deg)' }}>
          {open ? <X size={24} color="#fff" /> : <MessageCircle size={27} color="#fff" />}
        </div>
        {!open && pendingCount === 0 && (
          <span style={{ position: 'absolute', inset: -5, borderRadius: '50%', border: '2px solid rgba(26,101,232,.35)', animation: 'chatPulse 2.2s ease-out infinite' }} />
        )}
        {!open && pendingCount > 0 && (
          <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, borderRadius: 10, background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', padding: '0 4px' }}>
            {pendingCount}
          </span>
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 102, right: 28, zIndex: 9998,
          width: 375, borderRadius: 22,
          background: '#fff', boxShadow: '0 24px 72px rgba(0,0,0,.17)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'slideUp .22s ease',
          maxHeight: '82vh', height: 560,
        }}>

          {/* Header */}
          {showChatHeader
            ? <BlueChatHeader name={chatName} subRole={chatRole} onClose={() => setOpen(false)} onEnd={role === 'superadmin' ? endAdminChat : endUserChat} />
            : <HomeHeader />
          }

          {/* Content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            {tab === 'home'     && <HomeTab />}
            {tab === 'messages' && (role === 'superadmin' ? <AdminMessages /> : <UserMessages />)}
            {tab === 'requests' && role === 'superadmin' && <RequestsTab />}
          </div>

          {/* Tab bar */}
          <TabBar tabs={tabs} />
        </div>
      )}
    </>
  )
}
