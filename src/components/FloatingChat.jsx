import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MessageCircle, X, Home, MessageSquare, Inbox, Send, Paperclip, Smile, Bot, ChevronDown, Check, XCircle, ArrowRight, MoreVertical } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const fmtTime = ts => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
const fmtDate = ts => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

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
      boxShadow: '0 2px 6px rgba(0,0,0,.15)',
    }}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  )
}

const STATUS_COLORS = { open: '#0ea5e9', escalated: '#ef4444', active: '#10b981', closed: '#94a3b8' }
const STATUS_LABELS = { open: 'Open', escalated: '🚨 Urgent', active: 'Live', closed: 'Closed' }

export default function FloatingChat() {
  const { key, role, label, email } = useKey()

  const [open, setOpen]   = useState(false)
  const [tab,  setTab]    = useState('home')

  // user chat state
  const [session,  setSession]  = useState(null)   // current user session
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [starting, setStarting] = useState(false)

  // superadmin state
  const [activeSession,   setActiveSession]   = useState(null)   // ticket admin is chatting in
  const [adminMessages,   setAdminMessages]   = useState([])
  const [adminInput,      setAdminInput]      = useState('')
  const [adminSending,    setAdminSending]    = useState(false)
  const [escalated,       setEscalated]       = useState([])     // !admincall tickets
  const [escalatedCount,  setEscalatedCount]  = useState(0)

  const msgEndRef   = useRef(null)
  const adminEndRef = useRef(null)
  const inputRef    = useRef(null)
  const adminInputRef = useRef(null)
  const pollRefs    = useRef({})

  const api = useCallback((path, opts = {}) => fetch(path, {
    ...opts,
    headers: { 'x-api-key': key, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  }).then(r => r.json()), [key])

  // poll user messages + session status
  useEffect(() => {
    clearInterval(pollRefs.current.msg)
    if (!key || !session || session.status === 'closed') return
    const poll = () => {
      api(`/api/chat/sessions/${session.id}/messages`).then(d => Array.isArray(d) && setMessages(d)).catch(() => {})
      api('/api/chat/sessions').then(d => {
        if (Array.isArray(d)) { const s = d.find(x => x.id === session.id); if (s) setSession(s) }
      }).catch(() => {})
    }
    poll()
    pollRefs.current.msg = setInterval(poll, 3000)
    return () => clearInterval(pollRefs.current.msg)
  }, [key, session?.id, session?.status]) // eslint-disable-line

  // poll escalated tickets for superadmin
  useEffect(() => {
    clearInterval(pollRefs.current.pending)
    if (!key || role !== 'superadmin') return
    const poll = () => api('/api/chat/sessions/pending').then(d => {
      if (d?.count != null) { setEscalatedCount(d.count); setEscalated(d.sessions || []) }
    }).catch(() => {})
    poll()
    pollRefs.current.pending = setInterval(poll, 4000)
    return () => clearInterval(pollRefs.current.pending)
  }, [key, role]) // eslint-disable-line

  // poll admin active chat messages
  useEffect(() => {
    clearInterval(pollRefs.current.admin)
    if (!activeSession) return
    const poll = () => api(`/api/chat/sessions/${activeSession.id}/messages`).then(d => Array.isArray(d) && setAdminMessages(d)).catch(() => {})
    poll()
    pollRefs.current.admin = setInterval(poll, 3000)
    return () => clearInterval(pollRefs.current.admin)
  }, [activeSession?.id]) // eslint-disable-line

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { adminEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [adminMessages])
  // Auto-focus input when switching to messages tab
  useEffect(() => {
    if (tab === 'messages') setTimeout(() => (role === 'superadmin' ? adminInputRef : inputRef).current?.focus(), 100)
  }, [tab, session?.id, activeSession?.id]) // eslint-disable-line

  if (!key) return null

  // ── Actions ───────────────────────────────────────────────────────────────
  async function startChat() {
    if (starting) return
    setStarting(true)
    setTab('messages')
    try {
      const d = await api('/api/chat/sessions', { method: 'POST', body: JSON.stringify({ subject: 'General inquiry' }) })
      if (d.id) setSession({ ...d, status: 'open' })
    } catch {}
    setStarting(false)
  }

  async function sendMsg() {
    const text = input.trim()
    if (!text || sending) return

    // !admincall command
    if (text.toLowerCase() === '!admincall') {
      setInput('')
      if (!session) { await startChat(); return }
      setSending(true)
      try {
        await api(`/api/chat/sessions/${session.id}/admincall`, { method: 'POST' })
        setSession(p => ({ ...p, status: 'escalated' }))
      } catch {}
      setSending(false)
      return
    }

    if (!session) return
    setSending(true)
    setInput('')
    try {
      const m = await api(`/api/chat/sessions/${session.id}/messages`, { method: 'POST', body: JSON.stringify({ message: text }) })
      if (m.id) setMessages(p => [...p, m])
    } catch {}
    setSending(false)
    setTimeout(() => inputRef.current?.focus(), 30)
  }

  async function endUserChat() {
    if (!session) return
    await api(`/api/chat/sessions/${session.id}/close`, { method: 'POST' })
    setSession(p => ({ ...p, status: 'closed' }))
  }

  async function acceptTicket(s) {
    await api(`/api/chat/sessions/${s.id}/accept`, { method: 'POST' })
    setActiveSession(s)
    setAdminMessages([])
    setEscalated(p => p.filter(x => x.id !== s.id))
    setEscalatedCount(p => Math.max(0, p - 1))
    setTab('messages')
  }

  async function declineTicket(s) {
    await api(`/api/chat/sessions/${s.id}/decline`, { method: 'POST' })
    setEscalated(p => p.filter(x => x.id !== s.id))
    setEscalatedCount(p => Math.max(0, p - 1))
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
    setTimeout(() => adminInputRef.current?.focus(), 30)
  }

  async function endAdminChat() {
    if (!activeSession) return
    await api(`/api/chat/sessions/${activeSession.id}/close`, { method: 'POST' })
    setActiveSession(null); setAdminMessages([]); setTab('home')
  }

  // ── Bubble ────────────────────────────────────────────────────────────────
  function Bubble({ msg, i, myEmail }) {
    const mine = msg.sender_email === myEmail
    if (msg.sender_role === 'system') {
      const urgent   = msg.message.includes('🚨')
      const isWelcome = msg.sender_name === 'Vianova Support'
      if (isWelcome) {
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>🏥</div>
            <div style={{ maxWidth: '82%' }}>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4, fontWeight: 600 }}>Vianova Support</div>
              <div style={{ background: '#f1f5f9', borderRadius: '4px 18px 18px 18px', padding: '12px 14px', fontSize: 13.5, lineHeight: 1.6, color: '#1e293b', whiteSpace: 'pre-line', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                {msg.message}
              </div>
              <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 3, paddingLeft: 2 }}>{fmtTime(msg.created_at)}</div>
            </div>
          </div>
        )
      }
      return (
        <div key={i} style={{ textAlign: 'center', margin: '10px 0' }}>
          <span style={{
            fontSize: urgent ? 12 : 11, fontWeight: urgent ? 700 : 400, fontStyle: urgent ? 'normal' : 'italic',
            background: urgent ? '#fef2f2' : '#f1f5f9', color: urgent ? '#dc2626' : '#94a3b8',
            border: urgent ? '1.5px solid #fecaca' : 'none',
            padding: urgent ? '5px 14px' : '3px 12px', borderRadius: 99, display: 'inline-block',
          }}>{msg.message}</span>
        </div>
      )
    }
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
            boxShadow: mine ? '0 4px 12px rgba(29,110,245,.25)' : '0 1px 3px rgba(0,0,0,.06)',
          }}>{msg.message}</div>
          <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 3, textAlign: mine ? 'right' : 'left', paddingInline: 2 }}>
            {fmtTime(msg.created_at)}
          </div>
        </div>
      </div>
    )
  }

  // ── Input bar — textarea grows with content, Enter sends, Shift+Enter newline ──
  function InputBar({ value, onChange, onSend, disabled, placeholder = 'Enter your message…', ref: fwdRef }) {
    const handleKey = e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() }
    }
    return (
      <div style={{ padding: '10px 14px 12px', background: '#fff', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, background: '#f8fafc', borderRadius: 14, padding: '8px 12px', border: '1.5px solid #e2e8f0' }}>
          <textarea
            ref={fwdRef}
            value={value}
            onChange={e => { onChange(e); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
            onKeyDown={handleKey}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            style={{
              flex: 1, border: 'none', outline: 'none', resize: 'none', overflow: 'hidden',
              fontSize: 13.5, lineHeight: 1.5, color: '#1e293b', background: 'transparent',
              minWidth: 0, fontFamily: 'inherit', minHeight: 22, maxHeight: 120,
            }}
          />
          <button onClick={onSend} disabled={disabled || !value.trim()} style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0, border: 'none', cursor: 'pointer',
            background: (disabled || !value.trim()) ? '#e2e8f0' : 'linear-gradient(135deg,#1d6ef5,#0ea5e9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: (!disabled && value.trim()) ? '0 4px 12px rgba(29,110,245,.4)' : 'none',
            transition: 'all .2s', alignSelf: 'flex-end',
          }}><Send size={14} color="#fff" /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, color: '#cbd5e1' }}>
          <Bot size={15} style={{ cursor: 'pointer' }} />
          <Paperclip size={15} style={{ cursor: 'pointer' }} />
          <Smile size={15} style={{ cursor: 'pointer' }} />
          <span style={{ fontSize: 10, color: '#e2e8f0', marginLeft: 4 }}>Shift+Enter for new line</span>
        </div>
      </div>
    )
  }

  // ── Blue header with wave ─────────────────────────────────────────────────
  function BlueChatHeader({ name, subRole, onClose, onEnd, statusLabel }) {
    return (
      <div style={{ flexShrink: 0 }}>
        <div style={{ background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)', padding: '16px 16px 4px', display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ position: 'relative' }}>
            <Avatar name={name} size={40} role={subRole} />
            <span style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, background: '#22c55e', borderRadius: '50%', border: '2px solid #1a65e8' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 10.5 }}>Chat with</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{name}</div>
          </div>
          {onEnd && <button onClick={onEnd} style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 8, padding: '4px 10px', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>End</button>}
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronDown size={17} color="#fff" />
          </button>
        </div>
        <div style={{ background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)', lineHeight: 0 }}>
          <svg viewBox="0 0 375 28" style={{ display: 'block', width: '100%' }}>
            <path d="M0,10 C70,26 180,0 280,16 C320,22 355,12 375,18 L375,28 L0,28 Z" fill="#fff" />
          </svg>
        </div>
        <div style={{ background: '#fff', padding: '3px 16px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 2px rgba(34,197,94,.25)' }} />
          <span style={{ fontSize: 12, color: '#64748b' }}>We are online! {statusLabel && <span style={{ color: '#94a3b8' }}>· {statusLabel}</span>}</span>
        </div>
      </div>
    )
  }

  function HomeHeader() {
    return (
      <div style={{ flexShrink: 0 }}>
        <div style={{ background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)', padding: '18px 16px 4px', display: 'flex', alignItems: 'center', gap: 11 }}>
          <Avatar name={label} size={40} role={role} />
          <div style={{ flex: 1 }}>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 10.5 }}>Welcome back,</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{label}</div>
          </div>
          {role === 'superadmin' && escalatedCount > 0 && (
            <span style={{ background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: 11, padding: '2px 8px', borderRadius: 99 }}>{escalatedCount} urgent</span>
          )}
          <button onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#fff" />
          </button>
        </div>
        <div style={{ background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)', lineHeight: 0 }}>
          <svg viewBox="0 0 375 28" style={{ display: 'block', width: '100%' }}>
            <path d="M0,10 C70,26 180,0 280,16 C320,22 355,12 375,18 L375,28 L0,28 Z" fill="#fff" />
          </svg>
        </div>
      </div>
    )
  }

  // ══ HOME TAB ══════════════════════════════════════════════════════════════
  function HomeTab() {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        <button onClick={startChat} disabled={starting} style={{
          width: '100%', borderRadius: 16, padding: '18px 20px',
          background: 'linear-gradient(135deg,#1a65e8,#7c3aed)',
          border: 'none', cursor: starting ? 'default' : 'pointer', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: '0 6px 24px rgba(26,101,232,.35)', opacity: starting ? .75 : 1,
          transition: 'transform .15s',
        }}
          onMouseEnter={e => { if (!starting) e.currentTarget.style.transform = 'scale(1.015)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {starting
              ? <div style={{ width: 20, height: 20, border: '2.5px solid rgba(255,255,255,.4)', borderTop: '2.5px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              : <MessageSquare size={21} color="#fff" />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 2 }}>New Message</div>
            <div style={{ color: 'rgba(255,255,255,.72)', fontSize: 12 }}>{starting ? 'Opening chat…' : 'Start a new conversation'}</div>
          </div>
          {!starting && <ArrowRight size={18} color="rgba(255,255,255,.6)" />}
        </button>

        <div style={{ borderRadius: 14, padding: '13px 15px', border: '1.5px solid #bbf7d0', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#059669,#34d399)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Check size={17} color="#fff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ color: '#047857', fontWeight: 700, fontSize: 13 }}>Status: All Systems Operational</div>
            <div style={{ color: '#6b7280', fontSize: 11, marginTop: 1 }}>Vianova Health · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} UTC</div>
          </div>
        </div>

        <button onClick={() => window.open('https://github.com/Thebestoo/VianovaHealthCureV3', '_blank')} style={{
          width: '100%', borderRadius: 14, padding: '13px 17px', border: '1.5px solid #e2e8f0', background: '#fff',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Documentation</span>
          <svg width="15" height="15" fill="none" stroke="#94a3b8" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>

        {role === 'superadmin' && escalatedCount > 0 && (
          <button onClick={() => setTab('requests')} style={{ width: '100%', borderRadius: 14, padding: '13px 15px', border: '1.5px solid #fecaca', background: '#fff7f7', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: 14, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{escalatedCount}</span>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#dc2626' }}>Urgent !admincall requests</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>Tap to review and join</div>
            </div>
            <ArrowRight size={16} color="#ef4444" />
          </button>
        )}

        {session && session.status !== 'closed' && (
          <button onClick={() => setTab('messages')} style={{ width: '100%', borderRadius: 14, padding: '13px 15px', border: '1.5px solid #bfdbfe', background: '#eff6ff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MessageSquare size={15} color="#fff" />
            </div>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#1d6ef5' }}>Resume chat</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>You have an ongoing conversation</div>
            </div>
            <ArrowRight size={16} color="#1d6ef5" />
          </button>
        )}
      </div>
    )
  }

  // ══ USER MESSAGES TAB ════════════════════════════════════════════════════
  function UserMessages() {
    if (starting) return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 24 }}>
        <div style={{ width: 40, height: 40, border: '3px solid #e2e8f0', borderTop: '3px solid #1d6ef5', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Opening your chat…</div>
      </div>
    )

    if (!session) return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center', gap: 14 }}>
        <div style={{ fontSize: 44 }}>💬</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>No active conversation</div>
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>Press <strong>New Message</strong> on Home to start.</div>
        <button onClick={startChat} style={{ padding: '10px 22px', borderRadius: 12, background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
          Start Chat
        </button>
      </div>
    )

    if (session.status === 'closed') return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center', gap: 10 }}>
        <div style={{ fontSize: 46 }}>✅</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Chat ended</div>
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>Thank you for reaching out!</div>
        <button onClick={() => { setSession(null); setMessages([]) }} style={{ marginTop: 6, padding: '10px 22px', borderRadius: 12, background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
          New Chat
        </button>
      </div>
    )

    // open / escalated / active — all show the same chat UI
    const statusBanner = session.status === 'escalated'
      ? { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', text: '🚨 Admin call sent — an admin will join shortly' }
      : session.status === 'active'
      ? { bg: '#f0fdf4', color: '#059669', border: '#bbf7d0', text: `✅ ${session.admin_name || 'Admin'} has joined` }
      : null

    return (
      <>
        {statusBanner && (
          <div style={{ background: statusBanner.bg, border: `1px solid ${statusBanner.border}`, borderRadius: 0, padding: '8px 14px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: statusBanner.color, flexShrink: 0 }}>
            {statusBanner.text}
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 4px', minHeight: 0 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12.5, padding: '24px 0', lineHeight: 1.7 }}>
              Chat started 🎉<br />
              <span style={{ fontSize: 11 }}>Type your message below. Type <strong>!admincall</strong> to request a live admin.</span>
            </div>
          )}
          {messages.map((m, i) => <Bubble key={m.id || i} msg={m} i={i} myEmail={email} />)}
          <div ref={msgEndRef} />
        </div>

        {/* !admincall button + end */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 14px 2px' }}>
          {session.status === 'open' && (
            <button
              onClick={async () => {
                setSending(true)
                try {
                  await api(`/api/chat/sessions/${session.id}/admincall`, { method: 'POST' })
                  setSession(p => ({ ...p, status: 'escalated' }))
                } catch {}
                setSending(false)
              }}
              style={{ fontSize: 11, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              🚨 !admincall — request live admin
            </button>
          )}
          <button onClick={endUserChat} style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>End Chat</button>
        </div>

        <InputBar value={input} onChange={e => setInput(e.target.value)} onSend={sendMsg} disabled={sending} ref={inputRef} />
      </>
    )
  }

  // ══ ADMIN MESSAGES TAB ═══════════════════════════════════════════════════
  function AdminMessages() {
    if (!activeSession) return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 28, textAlign: 'center', gap: 14 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MessageSquare size={22} color="#d1d5db" />
        </div>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#64748b' }}>No active chat</div>
        <div style={{ fontSize: 12.5, color: '#94a3b8', lineHeight: 1.6 }}>Accept an <strong>!admincall</strong> request from the Requests tab to join a live chat.</div>
        {escalatedCount > 0 && (
          <button onClick={() => setTab('requests')} style={{ padding: '9px 20px', borderRadius: 12, background: 'linear-gradient(135deg,#ef4444,#f87171)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            🚨 {escalatedCount} Urgent Request{escalatedCount > 1 ? 's' : ''}
          </button>
        )}
      </div>
    )

    return (
      <>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 4px', minHeight: 0 }}>
          {adminMessages.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12.5, padding: '24px 0' }}>You joined the chat — say hello 👋</div>}
          {adminMessages.map((m, i) => <Bubble key={m.id || i} msg={m} i={i} myEmail={email} />)}
          <div ref={adminEndRef} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 14px 2px' }}>
          <button onClick={endAdminChat} style={{ fontSize: 11, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Leave Chat</button>
        </div>
        <InputBar value={adminInput} onChange={e => setAdminInput(e.target.value)} onSend={sendAdminMsg} disabled={adminSending} ref={adminInputRef} />
      </>
    )
  }

  // ══ REQUESTS TAB (superadmin — only !admincall escalations) ══════════════
  function RequestsTab() {
    if (escalated.length === 0) return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 44 }}>✅</div>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#059669' }}>No urgent requests</div>
        <div style={{ fontSize: 12.5, color: '#94a3b8' }}>When a user types !admincall, their ticket appears here.</div>
      </div>
    )

    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {escalated.map(s => (
          <div key={s.id} style={{ background: '#fff', border: '1.5px solid #fca5a5', borderRadius: 16, padding: '14px', marginBottom: 10, boxShadow: '0 2px 14px rgba(239,68,68,.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
              <div style={{ position: 'relative' }}>
                <Avatar name={s.created_by_name} size={40} role={s.created_by_role} />
                <span style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, background: '#22c55e', borderRadius: '50%', border: '2px solid #fff' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{s.created_by_name}</div>
                  <span style={{ background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 99 }}>URGENT</span>
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>
                  <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{s.created_by_role}</span> · {fmtDate(s.created_at)}
                </div>
                {s.subject && <div style={{ fontSize: 12, color: '#475569', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>"{s.subject}"</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => acceptTicket(s)} style={{ flex: 1, padding: '9px 0', borderRadius: 10, background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, boxShadow: '0 4px 12px rgba(29,110,245,.3)' }}>
                <Check size={14} /> Join Chat
              </button>
              <button onClick={() => declineTicket(s)} style={{ flex: 1, padding: '9px 0', borderRadius: 10, background: '#fff', border: '1.5px solid #fca5a5', color: '#ef4444', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <XCircle size={14} /> Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Tab bar ───────────────────────────────────────────────────────────────
  const userTabs  = [{ id: 'home', label: 'Home', Icon: Home }, { id: 'messages', label: 'Messages', Icon: MessageSquare }]
  const adminTabs = [{ id: 'home', label: 'Home', Icon: Home }, { id: 'messages', label: 'Messages', Icon: MessageSquare }, { id: 'requests', label: 'Requests', Icon: Inbox, badge: escalatedCount }]

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

  // ── Determine header ──────────────────────────────────────────────────────
  const isChatTab = tab === 'messages'
  const userInChat = isChatTab && role !== 'superadmin' && session && !['closed'].includes(session.status)
  const adminInChat = isChatTab && role === 'superadmin' && activeSession

  const chatName = role === 'superadmin' ? activeSession?.created_by_name : (session?.admin_name || 'Vianova Support')
  const chatRole = role === 'superadmin' ? activeSession?.created_by_role : 'superadmin'

  return (
    <>
      <style>{`
        @keyframes chatPulse { 0%{transform:scale(1);opacity:1} 100%{transform:scale(1.8);opacity:0} }
        @keyframes slideUp   { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin      { to{transform:rotate(360deg)} }
      `}</style>

      {/* Floating button */}
      <button onClick={() => setOpen(o => !o)} style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
        width: 62, height: 62, borderRadius: '50%',
        background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)',
        border: 'none', cursor: 'pointer',
        boxShadow: '0 8px 28px rgba(26,101,232,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'transform .18s',
      }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.09)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {open ? <X size={24} color="#fff" /> : <MessageCircle size={27} color="#fff" />}
        {!open && escalatedCount === 0 && <span style={{ position: 'absolute', inset: -5, borderRadius: '50%', border: '2px solid rgba(26,101,232,.35)', animation: 'chatPulse 2.2s ease-out infinite' }} />}
        {!open && escalatedCount > 0 && (
          <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, borderRadius: 10, background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', padding: '0 4px' }}>
            {escalatedCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 102, right: 28, zIndex: 9998,
          width: 375, borderRadius: 22,
          background: '#fff', boxShadow: '0 24px 72px rgba(0,0,0,.17)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'slideUp .22s ease',
          height: 560, maxHeight: '82vh',
        }}>
          {(userInChat || adminInChat)
            ? <BlueChatHeader name={chatName} subRole={chatRole} onClose={() => setOpen(false)} onEnd={role === 'superadmin' ? endAdminChat : endUserChat} />
            : <HomeHeader />
          }

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            {tab === 'home'     && <HomeTab />}
            {tab === 'messages' && (role === 'superadmin' ? <AdminMessages /> : <UserMessages />)}
            {tab === 'requests' && role === 'superadmin' && <RequestsTab />}
          </div>

          <TabBar tabs={role === 'superadmin' ? adminTabs : userTabs} />
        </div>
      )}
    </>
  )
}
