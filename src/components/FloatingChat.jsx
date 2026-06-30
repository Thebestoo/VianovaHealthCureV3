import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MessageCircle, X, ArrowLeft, Check, ChevronDown } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

// ── Helpers ──────────────────────────────────────────────────────────────────

function Avatar({ name, size = 36, role }) {
  const colors = {
    superadmin: 'linear-gradient(135deg,#0369a1,#0284c7)',
    doctor:     'linear-gradient(135deg,#059669,#10b981)',
    default:    'linear-gradient(135deg,#7c3aed,#6366f1)',
  }
  const bg = colors[role] || colors.default
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg,
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

  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [subject, setSubject] = useState('')
  const [starting, setStarting] = useState(false)
  const [pendingSessions, setPendingSessions] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [adminView, setAdminView] = useState('pending') // 'pending' | 'chat'
  const [activeAdminSession, setActiveAdminSession] = useState(null)
  const [adminMessages, setAdminMessages] = useState([])
  const [adminInput, setAdminInput] = useState('')
  const [adminSending, setAdminSending] = useState(false)
  const [btnPulse] = useState(true)

  const messagesEndRef = useRef(null)
  const adminMsgEndRef = useRef(null)
  const msgPollRef = useRef(null)
  const pendingPollRef = useRef(null)

  const api = useCallback((path, opts = {}) => {
    return fetch(path, {
      ...opts,
      headers: { 'x-api-key': key, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    }).then(r => r.json())
  }, [key])

  // ── User message polling ──────────────────────────────────────────────────
  useEffect(() => {
    if (!key || !session || ['closed', 'declined'].includes(session.status)) {
      clearInterval(msgPollRef.current)
      return
    }
    const poll = () => {
      api(`/api/chat/sessions/${session.id}/messages`)
        .then(data => { if (Array.isArray(data)) setMessages(data) })
        .catch(() => {})
      // Also refresh session status
      api(`/api/chat/sessions`)
        .then(data => {
          if (Array.isArray(data)) {
            const s = data.find(x => x.id === session.id)
            if (s) setSession(s)
          }
        })
        .catch(() => {})
    }
    poll()
    msgPollRef.current = setInterval(poll, 3000)
    return () => clearInterval(msgPollRef.current)
  }, [key, session?.id, session?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Superadmin pending polling ────────────────────────────────────────────
  useEffect(() => {
    if (!key || role !== 'superadmin') return
    const poll = () => {
      api('/api/chat/sessions/pending')
        .then(data => {
          if (data && typeof data.count === 'number') {
            setPendingCount(data.count)
            setPendingSessions(data.sessions || [])
          }
        })
        .catch(() => {})
    }
    poll()
    pendingPollRef.current = setInterval(poll, 4000)
    return () => clearInterval(pendingPollRef.current)
  }, [key, role]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Admin active chat polling ─────────────────────────────────────────────
  useEffect(() => {
    if (!activeAdminSession) return
    const poll = () => {
      api(`/api/chat/sessions/${activeAdminSession.id}/messages`)
        .then(data => { if (Array.isArray(data)) setAdminMessages(data) })
        .catch(() => {})
    }
    poll()
    const t = setInterval(poll, 3000)
    return () => clearInterval(t)
  }, [activeAdminSession?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { adminMsgEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [adminMessages])

  if (!key) return null

  // ── Actions ───────────────────────────────────────────────────────────────
  async function startChat() {
    setStarting(true)
    try {
      const data = await api('/api/chat/sessions', {
        method: 'POST',
        body: JSON.stringify({ subject: subject.trim() || 'General inquiry' }),
      })
      if (data.id) setSession({ ...data, status: 'waiting' })
    } catch {}
    setStarting(false)
  }

  async function sendMessage() {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      const msg = await api(`/api/chat/sessions/${session.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: input.trim() }),
      })
      if (msg.id) setMessages(prev => [...prev, msg])
      setInput('')
    } catch {}
    setSending(false)
  }

  async function closeSession() {
    if (!session) return
    await api(`/api/chat/sessions/${session.id}/close`, { method: 'POST' })
    setSession(prev => ({ ...prev, status: 'closed' }))
  }

  async function acceptSession(s) {
    await api(`/api/chat/sessions/${s.id}/accept`, { method: 'POST' })
    setActiveAdminSession(s)
    setAdminView('chat')
    setPendingSessions(prev => prev.filter(x => x.id !== s.id))
    setPendingCount(prev => Math.max(0, prev - 1))
  }

  async function declineSession(s) {
    await api(`/api/chat/sessions/${s.id}/decline`, { method: 'POST' })
    setPendingSessions(prev => prev.filter(x => x.id !== s.id))
    setPendingCount(prev => Math.max(0, prev - 1))
  }

  async function sendAdminMessage() {
    if (!adminInput.trim() || adminSending || !activeAdminSession) return
    setAdminSending(true)
    try {
      const msg = await api(`/api/chat/sessions/${activeAdminSession.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message: adminInput.trim() }),
      })
      if (msg.id) setAdminMessages(prev => [...prev, msg])
      setAdminInput('')
    } catch {}
    setAdminSending(false)
  }

  async function closeAdminChat() {
    if (!activeAdminSession) return
    await api(`/api/chat/sessions/${activeAdminSession.id}/close`, { method: 'POST' })
    setActiveAdminSession(null)
    setAdminMessages([])
    setAdminView('pending')
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function renderMessage(msg, idx, isMine) {
    if (msg.sender_role === 'system') {
      return (
        <div key={msg.id || idx} style={{ textAlign: 'center', margin: '8px 0' }}>
          <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', background: '#f3f4f6', padding: '3px 10px', borderRadius: 99 }}>
            {msg.message}
          </span>
        </div>
      )
    }
    return (
      <div key={msg.id || idx} style={{ display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6, marginBottom: 8 }}>
        {!isMine && <Avatar name={msg.sender_name} size={26} role={msg.sender_role} />}
        <div style={{ maxWidth: '75%' }}>
          {!isMine && (
            <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2, marginLeft: 4 }}>{msg.sender_name}</div>
          )}
          <div style={{
            padding: '8px 12px', borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
            background: isMine ? 'linear-gradient(135deg,#7c3aed,#6366f1)' : '#f3f4f6',
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

  const chatWindowBase = {
    position: 'fixed', bottom: 100, right: 28, zIndex: 9998,
    width: 360, borderRadius: 16,
    background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,.18)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    animation: 'slideUp .25s ease',
  }

  // ── Superadmin UI ─────────────────────────────────────────────────────────
  function renderAdminWindow() {
    return (
      <div style={chatWindowBase}>
        {adminView === 'pending' ? (
          <>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg,#0369a1,#0284c7)', padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Avatar name={label} size={36} role="superadmin" />
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Live Support</div>
                  {pendingCount > 0 && (
                    <div style={{ background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99, display: 'inline-block', marginTop: 2 }}>
                      {pendingCount} pending
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} color="#fff" />
              </button>
            </div>

            {/* Pending list */}
            <div style={{ padding: 14, overflowY: 'auto', maxHeight: 420 }}>
              {pendingSessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: '#6b7280' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#059669' }}>All clear!</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>No pending chats right now.</div>
                </div>
              ) : (
                pendingSessions.map(s => (
                  <div key={s.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={s.created_by_name} size={36} role={s.created_by_role} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.created_by_name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{s.created_by_role} · {fmtTime(s.created_at)}</div>
                        <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>{s.subject}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button onClick={() => acceptSession(s)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: '#059669', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        Accept
                      </button>
                      <button onClick={() => declineSession(s)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: '#fff', border: '1px solid #ef4444', color: '#ef4444', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        Decline
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          /* Admin active chat */
          <>
            <div style={{ background: 'linear-gradient(135deg,#0369a1,#0284c7)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => { setAdminView('pending'); setActiveAdminSession(null); setAdminMessages([]) }}
                style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ArrowLeft size={14} color="#fff" />
              </button>
              <Avatar name={activeAdminSession?.created_by_name} size={32} role={activeAdminSession?.created_by_role} />
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{activeAdminSession?.created_by_name}</div>
                <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 11 }}>{activeAdminSession?.created_by_role}</div>
              </div>
              <button onClick={closeAdminChat} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                Close Chat
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', maxHeight: 340, minHeight: 200 }}>
              {adminMessages.map((msg, i) => renderMessage(msg, i, msg.sender_email === email))}
              <div ref={adminMsgEndRef} />
            </div>

            <div style={{ borderTop: '1px solid #e5e7eb', padding: '10px 12px', display: 'flex', gap: 8 }}>
              <input
                value={adminInput}
                onChange={e => setAdminInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendAdminMessage()}
                placeholder="Type a message…"
                style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none' }}
              />
              <button onClick={sendAdminMessage} disabled={adminSending || !adminInput.trim()}
                style={{ padding: '9px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#0369a1,#0284c7)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: (adminSending || !adminInput.trim()) ? .5 : 1 }}>
                Send
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── User UI ───────────────────────────────────────────────────────────────
  function renderUserWindow() {
    // No session yet — welcome screen
    if (!session) {
      return (
        <div style={chatWindowBase}>
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

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>Subject (optional)</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="e.g. Question about patient data"
                style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <button onClick={startChat} disabled={starting}
              style={{ width: '100%', padding: '11px 0', borderRadius: 10, background: 'linear-gradient(135deg,#7c3aed,#6366f1)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: starting ? .6 : 1 }}>
              {starting ? 'Starting…' : 'Start Chat'}
            </button>
          </div>
        </div>
      )
    }

    // Session waiting
    if (session.status === 'waiting') {
      return (
        <div style={chatWindowBase}>
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

          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ display: 'inline-block', width: 36, height: 36, border: '3px solid #e5e7eb', borderTop: '3px solid #7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 14 }} />
            <div style={{ fontWeight: 600, fontSize: 14, color: '#111827', marginBottom: 6 }}>Connecting you to support…</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>Available 24/7 · Usually responds in minutes</div>
            {session.subject && (
              <div style={{ marginTop: 16, padding: '8px 14px', background: '#f9fafb', borderRadius: 8, fontSize: 12, color: '#6b7280' }}>
                Topic: <strong>{session.subject}</strong>
              </div>
            )}
          </div>

          {messages.filter(m => m.sender_role === 'system').map((msg, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '4px 16px 12px' }}>
              <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>{msg.message}</span>
            </div>
          ))}
        </div>
      )
    }

    // Session closed or declined
    if (session.status === 'closed' || session.status === 'declined') {
      return (
        <div style={chatWindowBase}>
          <div style={{ background: 'linear-gradient(135deg,#7c3aed,#6366f1)', padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Chat Ended</div>
            <button onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color="#fff" />
            </button>
          </div>
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>{session.status === 'declined' ? '😔' : '✅'}</div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#111827', marginBottom: 6 }}>
              {session.status === 'declined' ? 'No support available' : 'Chat ended'}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>
              {session.status === 'declined' ? 'Sorry, no support agents are available right now. Please try again later.' : 'Thank you for reaching out. Have a great day!'}
            </div>
            <button onClick={() => { setSession(null); setMessages([]); setSubject('') }}
              style={{ padding: '9px 20px', borderRadius: 10, background: 'linear-gradient(135deg,#7c3aed,#6366f1)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              Start New Chat
            </button>
          </div>
        </div>
      )
    }

    // Session active
    return (
      <div style={{ ...chatWindowBase, maxHeight: 560 }}>
        <div style={{ background: 'linear-gradient(135deg,#7c3aed,#6366f1)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={session.admin_name || 'Support'} size={34} role="superadmin" />
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{session.admin_name || 'Support'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80' }} />
              <span style={{ color: 'rgba(255,255,255,.8)', fontSize: 11 }}>Online</span>
            </div>
          </div>
          <button onClick={closeSession} style={{ background: 'rgba(255,255,255,.15)', border: 'none', borderRadius: 8, padding: '5px 10px', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            End Chat
          </button>
          <button onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronDown size={16} color="#fff" />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', maxHeight: 340 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, padding: '20px 0' }}>Support has joined. Say hello!</div>
          )}
          {messages.map((msg, i) => renderMessage(msg, i, msg.sender_email === email))}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ borderTop: '1px solid #e5e7eb', padding: '10px 12px', display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Type a message…"
            style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, outline: 'none' }}
          />
          <button onClick={sendMessage} disabled={sending || !input.trim()}
            style={{ padding: '9px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#7c3aed,#6366f1)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: (sending || !input.trim()) ? .5 : 1 }}>
            Send
          </button>
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes chatPulse {
          0%   { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
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
          boxShadow: '0 8px 32px rgba(124,58,237,.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform .2s, box-shadow .2s',
        }}
      >
        {open ? <X size={24} color="#fff" /> : <MessageCircle size={26} color="#fff" />}

        {/* Pulse ring when closed and no pending */}
        {!open && btnPulse && pendingCount === 0 && (
          <span style={{
            position: 'absolute', inset: -4, borderRadius: '50%',
            border: '2px solid rgba(124,58,237,.4)',
            animation: 'chatPulse 2s ease-out infinite',
          }} />
        )}

        {/* Pending badge for superadmin */}
        {!open && pendingCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            width: 20, height: 20, borderRadius: '50%',
            background: '#ef4444', color: '#fff',
            fontSize: 11, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #fff',
          }}>
            {pendingCount}
          </span>
        )}
      </button>

      {/* Chat window */}
      {open && (role === 'superadmin' ? renderAdminWindow() : renderUserWindow())}
    </>
  )
}
