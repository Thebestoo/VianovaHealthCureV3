import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MessageCircle, X, ChevronDown, ChevronUp, Check, XCircle, Send } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

// ── Helpers ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 36, role }) {
  const colors = {
    superadmin: 'linear-gradient(135deg,#0369a1,#0284c7)',
    doctor:     'linear-gradient(135deg,#059669,#10b981)',
    nurse:      'linear-gradient(135deg,#d97706,#f59e0b)',
    default:    'linear-gradient(135deg,#7c3aed,#6366f1)',
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: colors[role] || colors.default,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontWeight: 800, fontSize: size * 0.4, color: '#fff',
    }}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  )
}

const fmtTime = ts => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

// ── Main Component ────────────────────────────────────────────────────────────

export default function FloatingChat() {
  const { key, role, label, email } = useKey()

  const [open, setOpen]       = useState(false)
  const [input, setInput]     = useState('')
  const [sending, setSending] = useState(false)

  // ── User state ──────────────────────────────────────────────────────────────
  const [session,  setSession]  = useState(null)
  const [messages, setMessages] = useState([])
  const [subject,  setSubject]  = useState('')
  const [starting, setStarting] = useState(false)

  // ── Superadmin state ────────────────────────────────────────────────────────
  const [activeSession,   setActiveSession]   = useState(null)  // currently accepted session
  const [adminMessages,   setAdminMessages]   = useState([])
  const [adminInput,      setAdminInput]      = useState('')
  const [adminSending,    setAdminSending]    = useState(false)
  const [pendingSessions, setPendingSessions] = useState([])
  const [pendingCount,    setPendingCount]    = useState(0)
  const [pendingOpen,     setPendingOpen]     = useState(true)  // collapsible section

  const messagesEndRef  = useRef(null)
  const adminMsgEndRef  = useRef(null)
  const msgPollRef      = useRef(null)
  const pendingPollRef  = useRef(null)
  const adminMsgPollRef = useRef(null)

  const api = useCallback((path, opts = {}) => fetch(path, {
    ...opts,
    headers: { 'x-api-key': key, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  }).then(r => r.json()), [key])

  // ── User: poll messages + session status ──────────────────────────────────
  useEffect(() => {
    if (!key || !session || ['closed', 'declined'].includes(session.status)) {
      clearInterval(msgPollRef.current)
      return
    }
    const poll = () => {
      api(`/api/chat/sessions/${session.id}/messages`)
        .then(d => Array.isArray(d) && setMessages(d)).catch(() => {})
      api('/api/chat/sessions')
        .then(d => {
          if (Array.isArray(d)) {
            const s = d.find(x => x.id === session.id)
            if (s) setSession(s)
          }
        }).catch(() => {})
    }
    poll()
    msgPollRef.current = setInterval(poll, 3000)
    return () => clearInterval(msgPollRef.current)
  }, [key, session?.id, session?.status]) // eslint-disable-line

  // ── Superadmin: poll pending sessions ─────────────────────────────────────
  useEffect(() => {
    if (!key || role !== 'superadmin') return
    const poll = () => {
      api('/api/chat/sessions/pending')
        .then(d => {
          if (d && typeof d.count === 'number') {
            setPendingCount(d.count)
            setPendingSessions(d.sessions || [])
          }
        }).catch(() => {})
    }
    poll()
    pendingPollRef.current = setInterval(poll, 4000)
    return () => clearInterval(pendingPollRef.current)
  }, [key, role]) // eslint-disable-line

  // ── Superadmin: poll active chat messages ─────────────────────────────────
  useEffect(() => {
    clearInterval(adminMsgPollRef.current)
    if (!activeSession) return
    const poll = () => api(`/api/chat/sessions/${activeSession.id}/messages`)
      .then(d => Array.isArray(d) && setAdminMessages(d)).catch(() => {})
    poll()
    adminMsgPollRef.current = setInterval(poll, 3000)
    return () => clearInterval(adminMsgPollRef.current)
  }, [activeSession?.id]) // eslint-disable-line

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { adminMsgEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [adminMessages])

  if (!key) return null

  // ── Actions ───────────────────────────────────────────────────────────────
  async function startChat() {
    setStarting(true)
    try {
      const d = await api('/api/chat/sessions', {
        method: 'POST',
        body: JSON.stringify({ subject: subject.trim() || 'General inquiry' }),
      })
      if (d.id) setSession({ ...d, status: 'waiting' })
    } catch {}
    setStarting(false)
  }

  async function sendMessage() {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      const msg = await api(`/api/chat/sessions/${session.id}/messages`, {
        method: 'POST', body: JSON.stringify({ message: input.trim() }),
      })
      if (msg.id) setMessages(p => [...p, msg])
      setInput('')
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
    setActiveSession(s)
    setAdminMessages([])
    setPendingSessions(p => p.filter(x => x.id !== s.id))
    setPendingCount(p => Math.max(0, p - 1))
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
      const msg = await api(`/api/chat/sessions/${activeSession.id}/messages`, {
        method: 'POST', body: JSON.stringify({ message: adminInput.trim() }),
      })
      if (msg.id) setAdminMessages(p => [...p, msg])
      setAdminInput('')
    } catch {}
    setAdminSending(false)
  }

  async function closeAdminChat() {
    if (!activeSession) return
    await api(`/api/chat/sessions/${activeSession.id}/close`, { method: 'POST' })
    setActiveSession(null)
    setAdminMessages([])
  }

  // ── Shared message bubble ──────────────────────────────────────────────────
  function Bubble({ msg, idx, myEmail, accentColor }) {
    const isMine = msg.sender_email === myEmail
    if (msg.sender_role === 'system') {
      return (
        <div key={msg.id || idx} style={{ textAlign: 'center', margin: '6px 0' }}>
          <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', background: '#f3f4f6', padding: '2px 10px', borderRadius: 99 }}>
            {msg.message}
          </span>
        </div>
      )
    }
    return (
      <div key={msg.id || idx} style={{ display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6, marginBottom: 8 }}>
        {!isMine && <Avatar name={msg.sender_name} size={24} role={msg.sender_role} />}
        <div style={{ maxWidth: '75%' }}>
          {!isMine && <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2, marginLeft: 4 }}>{msg.sender_name}</div>}
          <div style={{
            padding: '8px 12px',
            borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
            background: isMine ? (accentColor || 'linear-gradient(135deg,#7c3aed,#6366f1)') : '#f3f4f6',
            color: isMine ? '#fff' : '#111827', fontSize: 13, lineHeight: 1.45,
          }}>
            {msg.message}
          </div>
          <div style={{ fontSize: 10, color: '#d1d5db', marginTop: 2, textAlign: isMine ? 'right' : 'left', paddingInline: 4 }}>
            {fmtTime(msg.created_at)}
          </div>
        </div>
      </div>
    )
  }

  // ── Shared input bar ───────────────────────────────────────────────────────
  function InputBar({ value, onChange, onSend, disabled, placeholder, accent }) {
    return (
      <div style={{ borderTop: '1px solid #e5e7eb', padding: '10px 12px', display: 'flex', gap: 8, background: '#fff' }}>
        <input
          value={value}
          onChange={onChange}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && onSend()}
          placeholder={placeholder || 'Type a message…'}
          style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none', background: '#f9fafb' }}
        />
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: accent || 'linear-gradient(135deg,#7c3aed,#6366f1)',
            border: 'none', color: '#fff', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: (disabled || !value.trim()) ? .45 : 1,
          }}
        >
          <Send size={16} />
        </button>
      </div>
    )
  }

  const BASE = {
    position: 'fixed', bottom: 100, right: 28, zIndex: 9998,
    width: 370, borderRadius: 18,
    background: '#fff', boxShadow: '0 24px 64px rgba(0,0,0,.2)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    animation: 'slideUp .22s ease',
    maxHeight: '80vh',
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUPERADMIN WINDOW — chat on top, pending requests panel below
  // ══════════════════════════════════════════════════════════════════════════
  function renderAdminWindow() {
    return (
      <div style={BASE}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ background: 'linear-gradient(135deg,#0369a1,#0284c7)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Avatar name={label} size={38} role="superadmin" />
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{label}</div>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 11 }}>
              {activeSession ? `Chatting with ${activeSession.created_by_name}` : 'Super Admin · Live Support'}
            </div>
          </div>
          {activeSession && (
            <button onClick={closeAdminChat} style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 8, padding: '4px 10px', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              End
            </button>
          )}
          <button onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#fff" />
          </button>
        </div>

        {/* ── Active chat area ────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', minHeight: activeSession ? 220 : 80 }}>
          {activeSession ? (
            <>
              {adminMessages.length === 0 && (
                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '16px 0' }}>
                  Session started — say hello 👋
                </div>
              )}
              {adminMessages.map((msg, i) => (
                <Bubble key={msg.id || i} msg={msg} idx={i} myEmail={email} accentColor="linear-gradient(135deg,#0369a1,#0284c7)" />
              ))}
              <div ref={adminMsgEndRef} />
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '16px 0', color: '#9ca3af', gap: 6 }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageCircle size={20} color="#d1d5db" />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>No active chat</div>
              <div style={{ fontSize: 11, textAlign: 'center', maxWidth: 200, lineHeight: 1.5 }}>Accept a request below to start helping someone</div>
            </div>
          )}
        </div>

        {/* ── Input bar (only enabled when active chat) ─────────────────── */}
        <InputBar
          value={adminInput}
          onChange={e => setAdminInput(e.target.value)}
          onSend={sendAdminMessage}
          disabled={adminSending || !activeSession}
          placeholder={activeSession ? 'Type a reply…' : 'Accept a request to start chatting…'}
          accent="linear-gradient(135deg,#0369a1,#0284c7)"
        />

        {/* ── Pending Requests Panel ───────────────────────────────────────── */}
        <div style={{ borderTop: '2px solid #e5e7eb', flexShrink: 0, maxHeight: pendingOpen ? 260 : 48, overflow: 'hidden', transition: 'max-height .25s ease' }}>

          {/* Section header */}
          <button
            onClick={() => setPendingOpen(o => !o)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f9fafb', border: 'none', cursor: 'pointer', borderBottom: pendingOpen && pendingSessions.length ? '1px solid #e5e7eb' : 'none' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>Pending Requests</div>
              {pendingCount > 0 && (
                <span style={{ background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 99 }}>
                  {pendingCount}
                </span>
              )}
              {pendingCount === 0 && (
                <span style={{ background: '#dcfce7', color: '#059669', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99 }}>
                  All clear
                </span>
              )}
            </div>
            {pendingOpen ? <ChevronDown size={16} color="#9ca3af" /> : <ChevronUp size={16} color="#9ca3af" />}
          </button>

          {/* Pending list */}
          <div style={{ overflowY: 'auto', maxHeight: 210, padding: pendingSessions.length ? '8px 12px 12px' : 0 }}>
            {pendingSessions.length === 0 && pendingOpen && (
              <div style={{ textAlign: 'center', padding: '16px', color: '#9ca3af', fontSize: 12 }}>
                No one waiting right now ✓
              </div>
            )}
            {pendingSessions.map(s => (
              <div key={s.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', marginBottom: 8, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <Avatar name={s.created_by_name} size={32} role={s.created_by_role} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.created_by_name}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      <span style={{ textTransform: 'capitalize' }}>{s.created_by_role}</span> · {fmtTime(s.created_at)}
                    </div>
                    {s.subject && (
                      <div style={{ fontSize: 11, color: '#374151', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        "{s.subject}"
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => acceptSession(s)}
                    style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: 'linear-gradient(135deg,#059669,#10b981)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  >
                    <Check size={13} /> Accept
                  </button>
                  <button
                    onClick={() => declineSession(s)}
                    style={{ flex: 1, padding: '6px 0', borderRadius: 8, background: '#fff', border: '1px solid #fca5a5', color: '#ef4444', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  >
                    <XCircle size={13} /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // USER WINDOW
  // ══════════════════════════════════════════════════════════════════════════
  function renderUserWindow() {
    // No session — welcome screen
    if (!session) {
      return (
        <div style={BASE}>
          <div style={{ background: 'linear-gradient(135deg,#7c3aed,#6366f1)', padding: '20px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar name={label} size={40} role={role} />
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{label}</div>
                <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 12, textTransform: 'capitalize' }}>{role}</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color="#fff" />
            </button>
          </div>

          <div style={{ padding: '24px 20px' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#111827', marginBottom: 6 }}>How can we help you today?</div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>Our support team is here to assist you. Start a chat and we'll connect you with someone shortly.</div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Subject (optional)</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && startChat()}
                placeholder="e.g. Question about patient data"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#f9fafb' }}
              />
            </div>

            <button onClick={startChat} disabled={starting} style={{ width: '100%', padding: '12px 0', borderRadius: 10, background: 'linear-gradient(135deg,#7c3aed,#6366f1)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: starting ? .6 : 1 }}>
              {starting ? 'Starting…' : '🚀 Start Chat'}
            </button>
          </div>
        </div>
      )
    }

    // Waiting
    if (session.status === 'waiting') {
      return (
        <div style={BASE}>
          <div style={{ background: 'linear-gradient(135deg,#7c3aed,#6366f1)', padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={label} size={36} role={role} />
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{label}</div>
                <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 12 }}>Waiting for support…</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color="#fff" />
            </button>
          </div>

          <div style={{ padding: '36px 20px', textAlign: 'center' }}>
            <div style={{ display: 'inline-block', width: 36, height: 36, border: '3px solid #e5e7eb', borderTop: '3px solid #7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 14 }} />
            <div style={{ fontWeight: 600, fontSize: 14, color: '#111827', marginBottom: 6 }}>Connecting you to support…</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>Available 24/7 · Usually responds in minutes</div>
            {session.subject && (
              <div style={{ marginTop: 16, padding: '8px 14px', background: '#f9fafb', borderRadius: 8, fontSize: 12, color: '#6b7280' }}>
                Topic: <strong>{session.subject}</strong>
              </div>
            )}
          </div>
        </div>
      )
    }

    // Closed / declined
    if (session.status === 'closed' || session.status === 'declined') {
      return (
        <div style={BASE}>
          <div style={{ background: 'linear-gradient(135deg,#7c3aed,#6366f1)', padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Chat Ended</div>
            <button onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color="#fff" />
            </button>
          </div>
          <div style={{ padding: '36px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>{session.status === 'declined' ? '😔' : '✅'}</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', marginBottom: 6 }}>
              {session.status === 'declined' ? 'No support available' : 'Chat ended'}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 24, lineHeight: 1.6 }}>
              {session.status === 'declined'
                ? 'Sorry, no support agents are available right now. Please try again later.'
                : 'Thank you for reaching out. Have a great day!'}
            </div>
            <button
              onClick={() => { setSession(null); setMessages([]); setSubject('') }}
              style={{ padding: '10px 24px', borderRadius: 10, background: 'linear-gradient(135deg,#7c3aed,#6366f1)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              Start New Chat
            </button>
          </div>
        </div>
      )
    }

    // Active chat
    return (
      <div style={{ ...BASE, maxHeight: '80vh' }}>
        <div style={{ background: 'linear-gradient(135deg,#7c3aed,#6366f1)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Avatar name={session.admin_name || 'Support'} size={34} role="superadmin" />
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{session.admin_name || 'Support'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80' }} />
              <span style={{ color: 'rgba(255,255,255,.8)', fontSize: 11 }}>Online</span>
            </div>
          </div>
          <button onClick={closeUserSession} style={{ background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 8, padding: '5px 10px', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            End Chat
          </button>
          <button onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronDown size={15} color="#fff" />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '20px 0' }}>Support has joined. Say hello! 👋</div>
          )}
          {messages.map((msg, i) => (
            <Bubble key={msg.id || i} msg={msg} idx={i} myEmail={email} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        <InputBar
          value={input}
          onChange={e => setInput(e.target.value)}
          onSend={sendMessage}
          disabled={sending}
        />
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes chatPulse {
          0%   { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.7); opacity: 0; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 28, right: 28, zIndex: 9999,
          width: 60, height: 60, borderRadius: '50%',
          background: 'linear-gradient(135deg,#7c3aed,#6366f1)',
          border: 'none', cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(124,58,237,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform .15s, box-shadow .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {open ? <X size={24} color="#fff" /> : <MessageCircle size={26} color="#fff" />}

        {!open && pendingCount === 0 && (
          <span style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '2px solid rgba(124,58,237,.4)', animation: 'chatPulse 2s ease-out infinite' }} />
        )}

        {!open && pendingCount > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
            {pendingCount}
          </span>
        )}
      </button>

      {/* Chat window */}
      {open && (role === 'superadmin' ? renderAdminWindow() : renderUserWindow())}
    </>
  )
}
