import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MessageCircle, X, Home, MessageSquare, Inbox, Send, Paperclip, Smile, Bot, ChevronDown, Check, XCircle, MoreVertical } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 36, role, src }) {
  const colors = {
    superadmin: 'linear-gradient(135deg,#1d6ef5,#0284c7)',
    doctor:     'linear-gradient(135deg,#059669,#10b981)',
    nurse:      'linear-gradient(135deg,#d97706,#f59e0b)',
    default:    'linear-gradient(135deg,#7c3aed,#6366f1)',
  }
  if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: colors[role] || colors.default,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontWeight: 800, fontSize: size * 0.38, color: '#fff',
    }}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  )
}

const fmtTime = ts => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

// Wave SVG divider
function Wave({ color = '#1d6ef5' }) {
  return (
    <div style={{ background: color, lineHeight: 0, flexShrink: 0 }}>
      <svg viewBox="0 0 370 28" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', width: '100%' }}>
        <path d="M0,14 C80,28 200,0 370,18 L370,28 L0,28 Z" fill="#fff" />
      </svg>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FloatingChat() {
  const { key, role, label, email } = useKey()

  const [open, setOpen]     = useState(false)
  const [tab, setTab]       = useState('home') // 'home' | 'messages' | 'requests'

  // ── User state ──────────────────────────────────────────────────────────────
  const [session,  setSession]  = useState(null)
  const [messages, setMessages] = useState([])
  const [input,    setInput]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [subject,  setSubject]  = useState('')
  const [starting, setStarting] = useState(false)

  // ── Superadmin state ────────────────────────────────────────────────────────
  const [activeSession, setActiveSession] = useState(null)
  const [adminMessages, setAdminMessages] = useState([])
  const [adminInput,    setAdminInput]    = useState('')
  const [adminSending,  setAdminSending]  = useState(false)
  const [pendingSessions, setPendingSessions] = useState([])
  const [pendingCount,    setPendingCount]    = useState(0)

  const messagesEndRef  = useRef(null)
  const adminMsgEndRef  = useRef(null)
  const msgPollRef      = useRef(null)
  const pendingPollRef  = useRef(null)
  const adminMsgPollRef = useRef(null)

  const api = useCallback((path, opts = {}) => fetch(path, {
    ...opts,
    headers: { 'x-api-key': key, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  }).then(r => r.json()), [key])

  // ── Polls ─────────────────────────────────────────────────────────────────
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
    clearInterval(adminMsgPollRef.current)
    if (!activeSession) return
    const poll = () => api(`/api/chat/sessions/${activeSession.id}/messages`).then(d => Array.isArray(d) && setAdminMessages(d)).catch(() => {})
    poll(); adminMsgPollRef.current = setInterval(poll, 3000)
    return () => clearInterval(adminMsgPollRef.current)
  }, [activeSession?.id]) // eslint-disable-line

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { adminMsgEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [adminMessages])

  if (!key) return null

  // ── Actions ───────────────────────────────────────────────────────────────
  async function startChat() {
    setStarting(true)
    try {
      const d = await api('/api/chat/sessions', { method: 'POST', body: JSON.stringify({ subject: subject.trim() || 'General inquiry' }) })
      if (d.id) { setSession({ ...d, status: 'waiting' }); setTab('messages') }
    } catch {}
    setStarting(false)
  }

  async function sendMessage() {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      const msg = await api(`/api/chat/sessions/${session.id}/messages`, { method: 'POST', body: JSON.stringify({ message: input.trim() }) })
      if (msg.id) setMessages(p => [...p, msg]); setInput('')
    } catch {}
    setSending(false)
  }

  async function closeUserSession() {
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

  async function sendAdminMessage() {
    if (!adminInput.trim() || adminSending || !activeSession) return
    setAdminSending(true)
    try {
      const msg = await api(`/api/chat/sessions/${activeSession.id}/messages`, { method: 'POST', body: JSON.stringify({ message: adminInput.trim() }) })
      if (msg.id) setAdminMessages(p => [...p, msg]); setAdminInput('')
    } catch {}
    setAdminSending(false)
  }

  async function closeAdminChat() {
    if (!activeSession) return
    await api(`/api/chat/sessions/${activeSession.id}/close`, { method: 'POST' })
    setActiveSession(null); setAdminMessages([]); setTab('home')
  }

  // ── Message bubble ────────────────────────────────────────────────────────
  function Bubble({ msg, idx, myEmail, senderName, senderRole }) {
    const isMine = msg.sender_email === myEmail
    if (msg.sender_role === 'system') {
      return (
        <div key={msg.id || idx} style={{ textAlign: 'center', margin: '8px 0' }}>
          <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', background: '#f3f4f6', padding: '2px 10px', borderRadius: 99 }}>{msg.message}</span>
        </div>
      )
    }
    return (
      <div key={msg.id || idx} style={{ display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 7, marginBottom: 10 }}>
        {!isMine && <Avatar name={msg.sender_name} size={28} role={msg.sender_role} />}
        <div style={{ maxWidth: '72%' }}>
          {!isMine && <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3, marginLeft: 4 }}>{msg.sender_name}</div>}
          <div style={{
            padding: '9px 14px', lineHeight: 1.5, fontSize: 13,
            borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
            background: isMine ? 'linear-gradient(135deg,#1d6ef5,#0284c7)' : '#f0f2f5',
            color: isMine ? '#fff' : '#111827',
            boxShadow: isMine ? '0 2px 8px rgba(29,110,245,.3)' : '0 1px 3px rgba(0,0,0,.06)',
          }}>
            {msg.message}
          </div>
          <div style={{ fontSize: 10, color: '#c4c9d4', marginTop: 3, textAlign: isMine ? 'right' : 'left', paddingInline: 4 }}>
            {fmtTime(msg.created_at)}
          </div>
        </div>
      </div>
    )
  }

  // ── Chat input bar ────────────────────────────────────────────────────────
  function ChatInput({ value, onChange, onSend, disabled, placeholder }) {
    return (
      <div style={{ padding: '10px 14px', borderTop: '1px solid #f0f2f5', display: 'flex', alignItems: 'center', gap: 8, background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, color: '#9ca3af' }}>
          <Bot size={17} style={{ cursor: 'pointer' }} />
          <Paperclip size={17} style={{ cursor: 'pointer' }} />
          <Smile size={17} style={{ cursor: 'pointer' }} />
        </div>
        <input
          value={value} onChange={onChange}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && onSend()}
          placeholder={placeholder || 'Enter your message…'}
          disabled={disabled}
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: '#374151', background: 'transparent', padding: '2px 0' }}
        />
        <button
          onClick={onSend} disabled={disabled || !value.trim()}
          style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: (disabled || !value.trim()) ? '#e5e7eb' : 'linear-gradient(135deg,#1d6ef5,#0284c7)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background .2s',
          }}
        >
          <Send size={15} color="#fff" />
        </button>
      </div>
    )
  }

  // ── Bottom tab bar ────────────────────────────────────────────────────────
  function TabBar({ tabs }) {
    return (
      <div style={{ display: 'flex', borderTop: '1px solid #f0f2f5', background: '#fff', flexShrink: 0 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '10px 0 8px', border: 'none', background: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              color: tab === t.id ? '#1d6ef5' : '#9ca3af',
              borderTop: tab === t.id ? '2px solid #1d6ef5' : '2px solid transparent',
              fontSize: 10, fontWeight: tab === t.id ? 700 : 500, transition: 'color .15s',
            }}
          >
            <t.Icon size={18} strokeWidth={tab === t.id ? 2.2 : 1.8} />
            {t.label}
            {t.badge > 0 && (
              <span style={{ position: 'absolute', marginTop: -6, marginLeft: 12, background: '#ef4444', color: '#fff', borderRadius: 99, fontSize: 9, fontWeight: 800, padding: '0px 4px', minWidth: 14, textAlign: 'center', lineHeight: '14px' }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    )
  }

  const WINDOW = {
    position: 'fixed', bottom: 100, right: 28, zIndex: 9998,
    width: 370, borderRadius: 20,
    background: '#fff', boxShadow: '0 24px 64px rgba(0,0,0,.18)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    animation: 'slideUp .22s ease',
    maxHeight: '82vh',
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HOME TAB
  // ══════════════════════════════════════════════════════════════════════════
  function HomeTab() {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* New Message card */}
        <button
          onClick={() => { setTab('messages') }}
          style={{
            width: '100%', borderRadius: 14, padding: '18px 20px',
            background: 'linear-gradient(135deg,#1d6ef5,#7c3aed)',
            border: 'none', cursor: 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 14,
            boxShadow: '0 4px 20px rgba(29,110,245,.35)',
          }}
        >
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MessageSquare size={20} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 2 }}>New Message</div>
            <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 12 }}>Start a new conversation</div>
          </div>
          <span style={{ color: 'rgba(255,255,255,.6)', fontSize: 18, fontWeight: 300 }}>›</span>
        </button>

        {/* Status card */}
        <div style={{ borderRadius: 14, padding: '14px 16px', border: '1.5px solid #bbf7d0', background: '#f0fdf4', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Check size={17} color="#fff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ color: '#059669', fontWeight: 700, fontSize: 13 }}>Status: All Systems Operational</div>
            <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>
              Vianova Health Platform · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} UTC
            </div>
          </div>
        </div>

        {/* Documentation link */}
        <button
          onClick={() => window.open('https://github.com/Thebestoo/VianovaHealthCureV3', '_blank')}
          style={{ width: '100%', borderRadius: 14, padding: '14px 18px', border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}
        >
          <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>Documentation</span>
          <span style={{ color: '#9ca3af', fontSize: 16, transform: 'rotate(45deg)', display: 'inline-block' }}>↗</span>
        </button>

        {/* Superadmin: quick pending summary */}
        {role === 'superadmin' && pendingCount > 0 && (
          <button
            onClick={() => setTab('requests')}
            style={{ width: '100%', borderRadius: 14, padding: '13px 16px', border: '1.5px solid #fecaca', background: '#fff7f7', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}
          >
            <span style={{ background: '#ef4444', color: '#fff', fontWeight: 800, fontSize: 13, width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {pendingCount}
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#dc2626' }}>Pending chat requests</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>Tap to review and respond</div>
            </div>
            <span style={{ marginLeft: 'auto', color: '#ef4444', fontSize: 18 }}>›</span>
          </button>
        )}

        {/* Already in active chat? quick link */}
        {session && session.status === 'active' && (
          <button
            onClick={() => setTab('messages')}
            style={{ width: '100%', borderRadius: 14, padding: '13px 16px', border: '1.5px solid #bfdbfe', background: '#eff6ff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}
          >
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1d6ef5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <MessageSquare size={14} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#1d6ef5' }}>Resume active chat</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>You have an ongoing conversation</div>
            </div>
            <span style={{ marginLeft: 'auto', color: '#1d6ef5', fontSize: 18 }}>›</span>
          </button>
        )}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MESSAGES TAB — user side
  // ══════════════════════════════════════════════════════════════════════════
  function UserMessagesTab() {
    // No session
    if (!session) {
      return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px' }}>
          <div style={{ textAlign: 'center', marginBottom: 20, paddingTop: 10 }}>
            <div style={{ fontSize: 38, marginBottom: 8 }}>💬</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 6 }}>How can we help?</div>
            <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>Start a conversation and our support team will connect with you shortly.</div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Subject (optional)</label>
            <input
              value={subject} onChange={e => setSubject(e.target.value)} onKeyDown={e => e.key === 'Enter' && startChat()}
              placeholder="e.g. Question about my data"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#f9fafb' }}
            />
          </div>
          <button
            onClick={startChat} disabled={starting}
            style={{ width: '100%', padding: '12px', borderRadius: 12, background: 'linear-gradient(135deg,#1d6ef5,#0284c7)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: starting ? .6 : 1 }}
          >
            {starting ? 'Starting…' : '🚀 Start Chat'}
          </button>
        </div>
      )
    }

    // Waiting
    if (session.status === 'waiting') {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', width: 40, height: 40, border: '3px solid #e5e7eb', borderTop: '3px solid #1d6ef5', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 16 }} />
          <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 6 }}>Connecting you to support…</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>Available 24/7 · Usually within minutes</div>
          {session.subject && (
            <div style={{ padding: '8px 16px', background: '#f0f6ff', borderRadius: 8, fontSize: 12, color: '#1d6ef5', fontWeight: 600 }}>
              "{session.subject}"
            </div>
          )}
        </div>
      )
    }

    // Closed / declined
    if (session.status === 'closed' || session.status === 'declined') {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>{session.status === 'declined' ? '😔' : '✅'}</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 8 }}>
            {session.status === 'declined' ? 'No agents available' : 'Chat ended'}
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
            {session.status === 'declined' ? 'Sorry, no support agents are available right now. Please try again.' : 'Thank you for reaching out. Have a great day!'}
          </div>
          <button
            onClick={() => { setSession(null); setMessages([]); setSubject('') }}
            style={{ padding: '10px 24px', borderRadius: 10, background: 'linear-gradient(135deg,#1d6ef5,#0284c7)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            Start New Chat
          </button>
        </div>
      )
    }

    // Active chat
    return (
      <>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 4px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '20px 0' }}>Support has joined. Say hello! 👋</div>
          )}
          {messages.map((msg, i) => <Bubble key={msg.id || i} msg={msg} idx={i} myEmail={email} />)}
          <div ref={messagesEndRef} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 14px 8px' }}>
          <button onClick={closeUserSession} style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>End Chat</button>
        </div>
        <ChatInput value={input} onChange={e => setInput(e.target.value)} onSend={sendMessage} disabled={sending} />
      </>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MESSAGES TAB — superadmin side
  // ══════════════════════════════════════════════════════════════════════════
  function AdminMessagesTab() {
    if (!activeSession) {
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <MessageSquare size={22} color="#d1d5db" />
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#6b7280', marginBottom: 6 }}>No active chat</div>
          <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.6 }}>Accept a request from the <strong>Requests</strong> tab to start helping someone.</div>
          <button onClick={() => setTab('requests')} style={{ marginTop: 14, padding: '8px 20px', borderRadius: 10, background: 'linear-gradient(135deg,#1d6ef5,#0284c7)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            View Requests {pendingCount > 0 && `(${pendingCount})`}
          </button>
        </div>
      )
    }

    return (
      <>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 4px' }}>
          {adminMessages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '20px 0' }}>Session started — say hello 👋</div>
          )}
          {adminMessages.map((msg, i) => <Bubble key={msg.id || i} msg={msg} idx={i} myEmail={email} />)}
          <div ref={adminMsgEndRef} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 14px 8px' }}>
          <button onClick={closeAdminChat} style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>End Chat</button>
        </div>
        <ChatInput value={adminInput} onChange={e => setAdminInput(e.target.value)} onSend={sendAdminMessage} disabled={adminSending} />
      </>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REQUESTS TAB (superadmin only)
  // ══════════════════════════════════════════════════════════════════════════
  function RequestsTab() {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {pendingSessions.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#059669', marginBottom: 6 }}>All clear!</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>No pending chat requests right now.</div>
          </div>
        ) : pendingSessions.map(s => (
          <div key={s.id} style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 14, padding: '13px 14px', marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 10 }}>
              <Avatar name={s.created_by_name} size={38} role={s.created_by_role} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.created_by_name}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>
                  <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{s.created_by_role}</span> · {fmtTime(s.created_at)}
                </div>
                {s.subject && <div style={{ fontSize: 12, color: '#374151', marginTop: 3, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{s.subject}"</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => acceptSession(s)}
                style={{ flex: 1, padding: '8px 0', borderRadius: 10, background: 'linear-gradient(135deg,#1d6ef5,#0284c7)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, boxShadow: '0 2px 8px rgba(29,110,245,.3)' }}
              >
                <Check size={14} /> Accept
              </button>
              <button
                onClick={() => declineSession(s)}
                style={{ flex: 1, padding: '8px 0', borderRadius: 10, background: '#fff', border: '1.5px solid #fca5a5', color: '#ef4444', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
              >
                <XCircle size={14} /> Decline
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Chat header (blue gradient with wave + "We are online") ───────────────
  function ChatHeader({ name, subRole, showEndBtn, onEnd }) {
    return (
      <div style={{ flexShrink: 0 }}>
        <div style={{ background: 'linear-gradient(135deg,#1d6ef5,#0284c7)', padding: '16px 16px 0', display: 'flex', alignItems: 'center', gap: 11 }}>
          <Avatar name={name} size={40} role={subRole} />
          <div style={{ flex: 1 }}>
            <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 11, marginBottom: 1 }}>Chat with</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{name}</div>
          </div>
          <MoreVertical size={18} color="rgba(255,255,255,.7)" style={{ cursor: 'pointer' }} />
          <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 2 }}>
            <ChevronDown size={20} color="rgba(255,255,255,.8)" />
          </button>
        </div>
        <Wave color="#1d6ef5" />
        <div style={{ background: '#fff', padding: '4px 16px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>We are online!</span>
          {showEndBtn && (
            <button onClick={onEnd} style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>End</button>
          )}
        </div>
      </div>
    )
  }

  // ── Default header (home / non-chat tabs) ─────────────────────────────────
  function DefaultHeader() {
    return (
      <div style={{ flexShrink: 0 }}>
        <div style={{ background: 'linear-gradient(135deg,#1d6ef5,#0284c7)', padding: '16px 16px 0', display: 'flex', alignItems: 'center', gap: 11 }}>
          <Avatar name={label} size={40} role={role} />
          <div style={{ flex: 1 }}>
            <div style={{ color: 'rgba(255,255,255,.75)', fontSize: 11 }}>Welcome back,</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{label}</div>
          </div>
          <button onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,.18)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#fff" />
          </button>
        </div>
        <Wave color="#1d6ef5" />
      </div>
    )
  }

  // ── Decide which header + which content to show ───────────────────────────
  const isUserActiveChat = role !== 'superadmin' && session && session.status === 'active'
  const isAdminActiveChat = role === 'superadmin' && activeSession && tab === 'messages'

  const userTabs = [
    { id: 'home',     label: 'Home',     Icon: Home },
    { id: 'messages', label: 'Messages', Icon: MessageSquare },
  ]
  const adminTabs = [
    { id: 'home',     label: 'Home',     Icon: Home },
    { id: 'messages', label: 'Messages', Icon: MessageSquare },
    { id: 'requests', label: 'Requests', Icon: Inbox, badge: pendingCount },
  ]

  return (
    <>
      <style>{`
        @keyframes chatPulse { 0% { transform:scale(1);opacity:1 } 100% { transform:scale(1.7);opacity:0 } }
        @keyframes slideUp   { from { opacity:0;transform:translateY(16px) } to { opacity:1;transform:translateY(0) } }
        @keyframes spin      { to { transform:rotate(360deg) } }
      `}</style>

      {/* ── Floating button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          width: 60, height: 60, borderRadius: '50%',
          background: 'linear-gradient(135deg,#1d6ef5,#0284c7)',
          border: 'none', cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(29,110,245,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {open ? <X size={24} color="#fff" /> : <MessageCircle size={26} color="#fff" />}
        {!open && pendingCount === 0 && (
          <span style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '2px solid rgba(29,110,245,.4)', animation: 'chatPulse 2s ease-out infinite' }} />
        )}
        {!open && pendingCount > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
            {pendingCount}
          </span>
        )}
      </button>

      {/* ── Chat window ── */}
      {open && (
        <div style={WINDOW}>

          {/* Header — blue chat header when in active chat, default otherwise */}
          {isUserActiveChat && tab === 'messages' ? (
            <ChatHeader
              name={session.admin_name || 'Support'}
              subRole="superadmin"
              showEndBtn
              onEnd={closeUserSession}
            />
          ) : isAdminActiveChat ? (
            <ChatHeader
              name={activeSession.created_by_name}
              subRole={activeSession.created_by_role}
              showEndBtn
              onEnd={closeAdminChat}
            />
          ) : (
            <DefaultHeader />
          )}

          {/* Tab content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            {tab === 'home' && <HomeTab />}
            {tab === 'messages' && (role === 'superadmin' ? <AdminMessagesTab /> : <UserMessagesTab />)}
            {tab === 'requests' && role === 'superadmin' && <RequestsTab />}
          </div>

          {/* Bottom tab bar */}
          <TabBar tabs={role === 'superadmin' ? adminTabs : userTabs} />
        </div>
      )}
    </>
  )
}
