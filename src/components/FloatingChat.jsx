import React, { useState, useEffect, useRef, useCallback, memo } from 'react'
import { MessageCircle, X, Home, MessageSquare, Inbox, Send, Check, XCircle, ArrowRight, ChevronDown } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

/* ─── helpers ────────────────────────────────────────────────────── */
const fmtTime = ts => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

/* ─── Avatar ─────────────────────────────────────────────────────── */
const GRAD = {
  superadmin: 'linear-gradient(135deg,#1d6ef5,#38bdf8)',
  doctor:     'linear-gradient(135deg,#059669,#34d399)',
  nurse:      'linear-gradient(135deg,#d97706,#fbbf24)',
  default:    'linear-gradient(135deg,#7c3aed,#a78bfa)',
}
const Avatar = memo(function Avatar({ name, size = 36, role, src }) {
  if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: GRAD[role] || GRAD.default, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 800, fontSize: Math.round(size * 0.4), color: '#fff' }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  )
})

/* ─── InputBar — outside so it NEVER remounts ────────────────────── */
const InputBar = memo(function InputBar({ value, onChange, onSend, disabled, fwdRef }) {
  return (
    <div style={{ padding: '10px 12px 12px', background: '#fff', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', borderRadius: 12, padding: '6px 8px 6px 12px', border: '1.5px solid #e2e8f0' }}>
        <input
          ref={fwdRef}
          value={value}
          onChange={onChange}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
          placeholder="Type a message…"
          disabled={disabled}
          autoComplete="off"
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13.5, color: '#1e293b', background: 'transparent', lineHeight: 1.4, fontFamily: 'inherit' }}
        />
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          style={{
            width: 34, height: 34, borderRadius: '50%', border: 'none', flexShrink: 0, cursor: 'pointer',
            background: (!disabled && value.trim()) ? 'linear-gradient(135deg,#1d6ef5,#0ea5e9)' : '#e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s',
          }}
        ><Send size={14} color="#fff" /></button>
      </div>
      <p style={{ margin: '5px 0 0', textAlign: 'center', fontSize: 10, color: '#d1d5db' }}>
        Enter to send — type <strong>!admincall</strong> for live admin
      </p>
    </div>
  )
})

/* ─── Bubble ─────────────────────────────────────────────────────── */
const Bubble = memo(function Bubble({ msg, myEmail }) {
  const mine = msg.sender_email === myEmail
  if (msg.sender_role === 'system') {
    if (msg.sender_name === 'Vianova Support') {
      return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>🏥</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, fontWeight: 600 }}>Vianova Support</div>
            <div style={{ background: '#f1f5f9', borderRadius: '3px 16px 16px 16px', padding: '11px 13px', fontSize: 13.5, lineHeight: 1.65, color: '#1e293b' }}>
              {msg.message.split('\n').map((l, i, a) => <span key={i}>{l}{i < a.length - 1 && <br />}</span>)}
            </div>
            <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 3 }}>{fmtTime(msg.created_at)}</div>
          </div>
        </div>
      )
    }
    const urgent = msg.message.startsWith('🚨')
    return (
      <div style={{ textAlign: 'center', margin: '8px 0' }}>
        <span style={{ display: 'inline-block', fontSize: 11, padding: '4px 12px', borderRadius: 99, background: urgent ? '#fef2f2' : '#f1f5f9', color: urgent ? '#dc2626' : '#94a3b8', border: urgent ? '1px solid #fecaca' : 'none', fontWeight: urgent ? 600 : 400, fontStyle: urgent ? 'normal' : 'italic' }}>
          {msg.message}
        </span>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 7, marginBottom: 10 }}>
      {!mine && <Avatar name={msg.sender_name} size={26} role={msg.sender_role} />}
      <div style={{ maxWidth: '74%' }}>
        {!mine && <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, paddingLeft: 2 }}>{msg.sender_name}</div>}
        <div style={{ padding: '9px 13px', fontSize: 13.5, lineHeight: 1.55, borderRadius: mine ? '16px 16px 3px 16px' : '3px 16px 16px 16px', background: mine ? 'linear-gradient(135deg,#1d6ef5,#0ea5e9)' : '#f1f5f9', color: mine ? '#fff' : '#1e293b', wordBreak: 'break-word' }}>
          {msg.message}
        </div>
        <div style={{ fontSize: 10, color: '#cbd5e1', marginTop: 3, textAlign: mine ? 'right' : 'left', paddingInline: 3 }}>{fmtTime(msg.created_at)}</div>
      </div>
    </div>
  )
})

/* ─── Headers ────────────────────────────────────────────────────── */
const ChatHeader = memo(function ChatHeader({ name, subRole, userSrc, onEnd, onClose }) {
  return (
    <div style={{ flexShrink: 0, background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)' }}>
      <div style={{ padding: '14px 14px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <Avatar name={name} size={38} role={subRole} src={userSrc} />
          <span style={{ position: 'absolute', bottom: 1, right: 1, width: 9, height: 9, background: '#22c55e', borderRadius: '50%', border: '2px solid #1a65e8' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'rgba(255,255,255,.65)', fontSize: 10.5 }}>Chat with</div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        </div>
        <button onClick={onEnd} style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 8, padding: '4px 10px', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>End</button>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ChevronDown size={16} color="#fff" />
        </button>
      </div>
      <svg viewBox="0 0 375 22" style={{ display: 'block', width: '100%', background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)' }}><path d="M0,8 C80,22 220,0 375,14 L375,22 L0,22 Z" fill="#fff" /></svg>
      <div style={{ background: '#fff', padding: '2px 14px 8px', display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
        <span style={{ fontSize: 11.5, color: '#64748b' }}>We are online!</span>
      </div>
    </div>
  )
})

const HomeHeader = memo(function HomeHeader({ label, role, avatar, escalatedCount, onClose }) {
  return (
    <div style={{ flexShrink: 0, background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)' }}>
      <div style={{ padding: '16px 14px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={label} size={38} role={role} src={avatar || undefined} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'rgba(255,255,255,.65)', fontSize: 10.5 }}>Welcome back,</div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        </div>
        {role === 'superadmin' && escalatedCount > 0 && (
          <span style={{ background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: 11, padding: '2px 8px', borderRadius: 99, flexShrink: 0 }}>{escalatedCount} urgent</span>
        )}
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <X size={15} color="#fff" />
        </button>
      </div>
      <svg viewBox="0 0 375 22" style={{ display: 'block', width: '100%', background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)' }}><path d="M0,8 C80,22 220,0 375,14 L375,22 L0,22 Z" fill="#fff" /></svg>
    </div>
  )
})

/* ─── TabBar ─────────────────────────────────────────────────────── */
const TabBar = memo(function TabBar({ tab, setTab, isSuperAdmin, escalatedCount }) {
  const tabs = isSuperAdmin
    ? [{ id: 'home', label: 'Home', Icon: Home }, { id: 'messages', label: 'Messages', Icon: MessageSquare }, { id: 'requests', label: 'Requests', Icon: Inbox, badge: escalatedCount }]
    : [{ id: 'home', label: 'Home', Icon: Home }, { id: 'messages', label: 'Messages', Icon: MessageSquare }]
  return (
    <div style={{ display: 'flex', borderTop: '1px solid #f1f5f9', background: '#fff', flexShrink: 0 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: '9px 0 7px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: tab === t.id ? '#1d6ef5' : '#94a3b8', borderTop: `2px solid ${tab === t.id ? '#1d6ef5' : 'transparent'}`, fontSize: 10, fontWeight: tab === t.id ? 700 : 400, position: 'relative' }}>
          <t.Icon size={17} strokeWidth={tab === t.id ? 2.3 : 1.7} />
          {t.label}
          {t.badge > 0 && <span style={{ position: 'absolute', top: 5, left: '50%', marginLeft: 5, background: '#ef4444', color: '#fff', borderRadius: 99, fontSize: 9, fontWeight: 800, padding: '0 4px', lineHeight: '13px' }}>{t.badge}</span>}
        </button>
      ))}
    </div>
  )
})

/* ─── HomeTab ────────────────────────────────────────────────────── */
const HomeTab = memo(function HomeTab({ role, escalatedCount, hasActiveSession, onNewChat, onGoMessages, onGoRequests, starting }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button onClick={onNewChat} disabled={starting} style={{ borderRadius: 14, padding: '16px 18px', background: 'linear-gradient(135deg,#1a65e8,#7c3aed)', border: 'none', cursor: starting ? 'default' : 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, opacity: starting ? .7 : 1, boxShadow: '0 4px 20px rgba(26,101,232,.3)' }}>
        <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {starting ? <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,.4)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'fc-spin 1s linear infinite' }} /> : <MessageSquare size={20} color="#fff" />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, marginBottom: 2 }}>New Message</div>
          <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 12 }}>{starting ? 'Opening…' : 'Start a conversation'}</div>
        </div>
        <ArrowRight size={16} color="rgba(255,255,255,.6)" />
      </button>

      <div style={{ borderRadius: 12, padding: '12px 14px', border: '1.5px solid #bbf7d0', background: '#f0fdf4', display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#059669,#34d399)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Check size={16} color="#fff" strokeWidth={2.5} />
        </div>
        <div>
          <div style={{ color: '#047857', fontWeight: 700, fontSize: 12.5 }}>All Systems Operational</div>
          <div style={{ color: '#6b7280', fontSize: 11, marginTop: 1 }}>Vianova Health Platform</div>
        </div>
      </div>

      <button onClick={() => window.open('https://github.com/Thebestoo/VianovaHealthCureV3', '_blank')} style={{ borderRadius: 12, padding: '12px 16px', border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: 13.5, color: '#0f172a' }}>Documentation</span>
        <svg width="14" height="14" fill="none" stroke="#94a3b8" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
      </button>

      {role === 'superadmin' && escalatedCount > 0 && (
        <button onClick={onGoRequests} style={{ borderRadius: 12, padding: '12px 14px', border: '1.5px solid #fecaca', background: '#fff7f7', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11 }}>
          <span style={{ background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: 13, width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{escalatedCount}</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#dc2626' }}>Urgent admin requests</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>Tap to review</div>
          </div>
          <ArrowRight size={15} color="#ef4444" />
        </button>
      )}

      {hasActiveSession && (
        <button onClick={onGoMessages} style={{ borderRadius: 12, padding: '12px 14px', border: '1.5px solid #bfdbfe', background: '#eff6ff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MessageSquare size={14} color="#fff" />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#1d6ef5' }}>Resume chat</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>You have an ongoing conversation</div>
          </div>
          <ArrowRight size={15} color="#1d6ef5" />
        </button>
      )}
    </div>
  )
})

/* ─── RequestsTab ────────────────────────────────────────────────── */
const RequestsTab = memo(function RequestsTab({ escalated, onAccept, onDecline }) {
  if (!escalated.length) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center', padding: '0 24px' }}>
      <div style={{ fontSize: 42 }}>✅</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#059669' }}>No urgent requests</div>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>When a user sends !admincall it appears here.</div>
    </div>
  )
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
      {escalated.map(s => (
        <div key={s.id} style={{ border: '1.5px solid #fca5a5', borderRadius: 14, padding: '13px', marginBottom: 10, background: '#fff', boxShadow: '0 2px 10px rgba(239,68,68,.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ position: 'relative' }}>
              <Avatar name={s.created_by_name} size={38} role={s.created_by_role} />
              <span style={{ position: 'absolute', bottom: 1, right: 1, width: 9, height: 9, background: '#22c55e', borderRadius: '50%', border: '2px solid #fff' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.created_by_name}</span>
                <span style={{ background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 99, flexShrink: 0 }}>URGENT</span>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'capitalize' }}>{s.created_by_role}</div>
              {s.subject && <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>"{s.subject}"</div>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onAccept(s)} style={{ flex: 1, padding: '8px 0', borderRadius: 10, background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Check size={14} /> Join Chat
            </button>
            <button onClick={() => onDecline(s)} style={{ flex: 1, padding: '8px 0', borderRadius: 10, background: '#fff', border: '1.5px solid #fca5a5', color: '#ef4444', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <XCircle size={14} /> Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  )
})

/* ─── MessageArea (user) ─────────────────────────────────────────── */
const UserMessageArea = memo(function UserMessageArea({ messages, myEmail, msgEndRef }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 4px', minHeight: 0 }}>
      {messages.map((m, i) => <Bubble key={m.id || i} msg={m} myEmail={myEmail} />)}
      <div ref={msgEndRef} />
    </div>
  )
})

const AdminMessageArea = memo(function AdminMessageArea({ messages, myEmail, adminEndRef }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 4px', minHeight: 0 }}>
      {messages.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12.5, padding: '20px 0' }}>You joined — say hello 👋</div>}
      {messages.map((m, i) => <Bubble key={m.id || i} msg={m} myEmail={myEmail} />)}
      <div ref={adminEndRef} />
    </div>
  )
})

/* ══════════════════════════════════════════════════════════════════ */
export default function FloatingChat() {
  const { key, role, label, email, avatar } = useKey()

  const [open,  setOpen]  = useState(false)
  const [tab,   setTab]   = useState('home')

  const [session,  setSession]  = useState(null)
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [starting, setStarting] = useState(false)

  const [activeSession,  setActiveSession]  = useState(null)
  const [adminMessages,  setAdminMessages]  = useState([])
  const [adminInput,     setAdminInput]     = useState('')
  const [adminSending,   setAdminSending]   = useState(false)
  const [escalated,      setEscalated]      = useState([])
  const [escalatedCount, setEscalatedCount] = useState(0)

  const msgEndRef     = useRef(null)
  const adminEndRef   = useRef(null)
  const inputRef      = useRef(null)
  const adminInputRef = useRef(null)
  const polls         = useRef({})
  const prevMsgLen    = useRef(0)
  const prevAdminLen  = useRef(0)

  const api = useCallback((path, opts = {}) =>
    fetch(path, { ...opts, headers: { 'x-api-key': key, 'Content-Type': 'application/json', ...(opts.headers || {}) } })
      .then(r => r.json()), [key])

  /* polls */
  useEffect(() => {
    clearInterval(polls.current.msg)
    if (!key || !session || session.status === 'closed') return
    const run = () => {
      api(`/api/chat/sessions/${session.id}/messages`).then(d => Array.isArray(d) && setMessages(d)).catch(() => {})
      api('/api/chat/sessions').then(d => {
        if (Array.isArray(d)) { const s = d.find(x => x.id === session.id); if (s) setSession(s) }
      }).catch(() => {})
    }
    run(); polls.current.msg = setInterval(run, 3000)
    return () => clearInterval(polls.current.msg)
  }, [key, session?.id, session?.status]) // eslint-disable-line

  useEffect(() => {
    clearInterval(polls.current.pending)
    if (!key || role !== 'superadmin') return
    const run = () => api('/api/chat/sessions/pending').then(d => {
      if (d?.count != null) { setEscalatedCount(d.count); setEscalated(d.sessions || []) }
    }).catch(() => {})
    run(); polls.current.pending = setInterval(run, 4000)
    return () => clearInterval(polls.current.pending)
  }, [key, role]) // eslint-disable-line

  useEffect(() => {
    clearInterval(polls.current.admin)
    if (!activeSession) return
    const run = () => api(`/api/chat/sessions/${activeSession.id}/messages`).then(d => Array.isArray(d) && setAdminMessages(d)).catch(() => {})
    run(); polls.current.admin = setInterval(run, 3000)
    return () => clearInterval(polls.current.admin)
  }, [activeSession?.id]) // eslint-disable-line

  /* scroll only when count changes */
  useEffect(() => {
    if (messages.length !== prevMsgLen.current) {
      prevMsgLen.current = messages.length
      msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  useEffect(() => {
    if (adminMessages.length !== prevAdminLen.current) {
      prevAdminLen.current = adminMessages.length
      adminEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [adminMessages.length])

  /* auto-focus on tab switch */
  useEffect(() => {
    if (tab === 'messages') setTimeout(() => (role === 'superadmin' ? adminInputRef : inputRef).current?.focus(), 80)
  }, [tab, session?.id, activeSession?.id]) // eslint-disable-line

  if (!key) return null

  /* ── actions ── */
  async function startChat() {
    if (starting) return
    setStarting(true); setTab('messages')
    try {
      const d = await api('/api/chat/sessions', { method: 'POST', body: JSON.stringify({ subject: 'General inquiry' }) })
      if (d.id) setSession({ ...d, status: 'open' })
    } catch {}
    setStarting(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function sendMsg() {
    const text = input.trim()
    if (!text || sending || !session) return
    if (text.toLowerCase() === '!admincall') {
      setInput(''); setSending(true)
      try { await api(`/api/chat/sessions/${session.id}/admincall`, { method: 'POST' }); setSession(p => ({ ...p, status: 'escalated' })) } catch {}
      setSending(false); setTimeout(() => inputRef.current?.focus(), 30); return
    }
    setSending(true); setInput('')
    try {
      const m = await api(`/api/chat/sessions/${session.id}/messages`, { method: 'POST', body: JSON.stringify({ message: text }) })
      if (m.id) setMessages(p => [...p, m])
    } catch {}
    setSending(false); setTimeout(() => inputRef.current?.focus(), 30)
  }

  async function endUserChat() {
    if (!session) return
    await api(`/api/chat/sessions/${session.id}/close`, { method: 'POST' })
    setSession(p => ({ ...p, status: 'closed' }))
  }

  async function acceptTicket(s) {
    await api(`/api/chat/sessions/${s.id}/accept`, { method: 'POST' })
    setActiveSession(s); setAdminMessages([])
    setEscalated(p => p.filter(x => x.id !== s.id)); setEscalatedCount(p => Math.max(0, p - 1))
    setTab('messages')
  }

  async function declineTicket(s) {
    await api(`/api/chat/sessions/${s.id}/decline`, { method: 'POST' })
    setEscalated(p => p.filter(x => x.id !== s.id)); setEscalatedCount(p => Math.max(0, p - 1))
  }

  async function sendAdminMsg() {
    if (!adminInput.trim() || adminSending || !activeSession) return
    setAdminSending(true); const text = adminInput.trim(); setAdminInput('')
    try {
      const m = await api(`/api/chat/sessions/${activeSession.id}/messages`, { method: 'POST', body: JSON.stringify({ message: text }) })
      if (m.id) setAdminMessages(p => [...p, m])
    } catch {}
    setAdminSending(false); setTimeout(() => adminInputRef.current?.focus(), 30)
  }

  async function endAdminChat() {
    if (!activeSession) return
    await api(`/api/chat/sessions/${activeSession.id}/close`, { method: 'POST' })
    setActiveSession(null); setAdminMessages([]); setTab('home')
  }

  /* ── derived ── */
  const isSuperAdmin  = role === 'superadmin'
  const inUserChat    = tab === 'messages' && !isSuperAdmin && session && session.status !== 'closed'
  const inAdminChat   = tab === 'messages' && isSuperAdmin && activeSession
  const hasActiveSession = session && session.status !== 'closed'

  const banner = !isSuperAdmin && session?.status === 'escalated'
    ? { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', text: '🚨 Admin call sent — joining shortly…' }
    : !isSuperAdmin && session?.status === 'active'
    ? { bg: '#f0fdf4', color: '#059669', border: '#bbf7d0', text: `✅ ${session.admin_name || 'Admin'} joined the chat` }
    : null

  return (
    <>
      <style>{`
        @keyframes fc-pulse  { 0%{transform:scale(1);opacity:1} 100%{transform:scale(1.8);opacity:0} }
        @keyframes fc-spin   { to{transform:rotate(360deg)} }
        @keyframes fc-slidein{ from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        .fc-win { animation: fc-slidein .2s ease both; }
      `}</style>

      {/* floating button */}
      <button onClick={() => setOpen(o => !o)} style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 9999, width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg,#1a65e8,#0ea5e9)', border: 'none', cursor: 'pointer', boxShadow: '0 6px 24px rgba(26,101,232,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {open ? <X size={22} color="#fff" /> : <MessageCircle size={25} color="#fff" />}
        {!open && escalatedCount === 0 && <span style={{ position: 'absolute', inset: -5, borderRadius: '50%', border: '2px solid rgba(26,101,232,.35)', animation: 'fc-pulse 2.2s ease-out infinite' }} />}
        {!open && escalatedCount > 0 && <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 19, height: 19, borderRadius: 10, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', padding: '0 3px' }}>{escalatedCount}</span>}
      </button>

      {/* chat window */}
      {open && (
        <div className="fc-win" style={{ position: 'fixed', bottom: 96, right: 28, zIndex: 9998, width: 370, height: 540, borderRadius: 20, background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,.18)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {(inUserChat || inAdminChat)
            ? <ChatHeader
                name={isSuperAdmin ? activeSession?.created_by_name : (session?.admin_name || 'Vianova Support')}
                subRole={isSuperAdmin ? activeSession?.created_by_role : 'superadmin'}
                onEnd={isSuperAdmin ? endAdminChat : endUserChat}
                onClose={() => setOpen(false)}
              />
            : <HomeHeader label={label} role={role} avatar={avatar} escalatedCount={escalatedCount} onClose={() => setOpen(false)} />
          }

          {/* content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

            {/* HOME */}
            {tab === 'home' && (
              <HomeTab
                role={role} escalatedCount={escalatedCount} starting={starting}
                hasActiveSession={hasActiveSession}
                onNewChat={startChat}
                onGoMessages={() => setTab('messages')}
                onGoRequests={() => setTab('requests')}
              />
            )}

            {/* USER MESSAGES */}
            {tab === 'messages' && !isSuperAdmin && (
              <>
                {starting && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, border: '3px solid #e2e8f0', borderTop: '3px solid #1d6ef5', borderRadius: '50%', animation: 'fc-spin 1s linear infinite' }} />
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Opening chat…</div>
                  </div>
                )}
                {!starting && !session && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '0 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: 42 }}>💬</div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>No active conversation</div>
                    <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>Press <strong>New Message</strong> on Home tab to start.</div>
                    <button onClick={startChat} style={{ padding: '10px 22px', borderRadius: 12, background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>Start Chat</button>
                  </div>
                )}
                {!starting && session && session.status === 'closed' && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '0 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: 44 }}>✅</div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Chat ended</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>Thank you for reaching out!</div>
                    <button onClick={() => { setSession(null); setMessages([]) }} style={{ marginTop: 8, padding: '10px 22px', borderRadius: 12, background: 'linear-gradient(135deg,#1d6ef5,#0ea5e9)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>New Chat</button>
                  </div>
                )}
                {!starting && session && session.status !== 'closed' && (
                  <>
                    {banner && <div style={{ flexShrink: 0, background: banner.bg, borderBottom: `1px solid ${banner.border}`, padding: '7px 14px', textAlign: 'center', fontSize: 11.5, fontWeight: 600, color: banner.color }}>{banner.text}</div>}
                    <UserMessageArea messages={messages} myEmail={email} msgEndRef={msgEndRef} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '3px 12px 0', flexShrink: 0 }}>
                      <button onClick={endUserChat} style={{ fontSize: 11, color: '#cbd5e1', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>End chat</button>
                    </div>
                    <InputBar value={input} onChange={e => setInput(e.target.value)} onSend={sendMsg} disabled={sending} fwdRef={inputRef} />
                  </>
                )}
              </>
            )}

            {/* ADMIN MESSAGES */}
            {tab === 'messages' && isSuperAdmin && (
              <>
                {!activeSession && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 24px', textAlign: 'center' }}>
                    <div style={{ width: 50, height: 50, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MessageSquare size={22} color="#d1d5db" />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#64748b' }}>No active chat</div>
                    <div style={{ fontSize: 12.5, color: '#94a3b8', lineHeight: 1.6 }}>Accept an <strong>!admincall</strong> from the Requests tab.</div>
                    {escalatedCount > 0 && <button onClick={() => setTab('requests')} style={{ padding: '9px 18px', borderRadius: 12, background: '#ef4444', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>🚨 {escalatedCount} Request{escalatedCount > 1 ? 's' : ''}</button>}
                  </div>
                )}
                {activeSession && (
                  <>
                    <AdminMessageArea messages={adminMessages} myEmail={email} adminEndRef={adminEndRef} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '3px 12px 0', flexShrink: 0 }}>
                      <button onClick={endAdminChat} style={{ fontSize: 11, color: '#cbd5e1', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Leave chat</button>
                    </div>
                    <InputBar value={adminInput} onChange={e => setAdminInput(e.target.value)} onSend={sendAdminMsg} disabled={adminSending} fwdRef={adminInputRef} />
                  </>
                )}
              </>
            )}

            {/* REQUESTS */}
            {tab === 'requests' && isSuperAdmin && (
              <RequestsTab escalated={escalated} onAccept={acceptTicket} onDecline={declineTicket} />
            )}
          </div>

          <TabBar tab={tab} setTab={setTab} isSuperAdmin={isSuperAdmin} escalatedCount={escalatedCount} />
        </div>
      )}
    </>
  )
}
