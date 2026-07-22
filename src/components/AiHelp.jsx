import React, { useState, useRef, useEffect } from 'react'
import { Sparkles, X, Send } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

// Floating "not sure what to do" assistant for beta modules (CCM/RPM). Answers
// questions about how to use the screen itself — separate from any per-patient
// clinical AI calls (e.g. check-in note drafting), which live inline in those forms.
export default function AiHelp({ module, accent = '#8b5cf6' }) {
  const { key } = useKey()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi! I'm your AI guide for this screen. Not sure what to do next? Ask me anything about enrolling, check-ins, or plans." }
  ])
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, open])

  async function send(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    const next = [...messages, { role: 'user', text }]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      const r = await fetch('/api/beta/assist', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({
          message: text,
          module,
          context: next.slice(-6).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
        }),
      })
      const d = await r.json()
      setMessages(m => [...m, { role: 'assistant', text: d.reply || "Sorry, I couldn't come up with an answer — try rephrasing." }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: 'Something went wrong reaching the AI guide. Please try again.' }])
    } finally { setSending(false) }
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Ask AI what to do"
        style={{
          position: 'fixed', bottom: 26, right: 26, zIndex: 1100,
          width: 54, height: 54, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 12px 30px -8px ${accent}88`,
          transition: 'transform .15s',
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.06)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        {open ? <X size={22} /> : <Sparkles size={22} />}
      </button>

      {open && (
        <div style={{
          position: 'fixed', bottom: 92, right: 26, zIndex: 1100,
          width: 340, maxWidth: '90vw', height: 440, maxHeight: '70vh',
          background: '#fff', borderRadius: 18, boxShadow: '0 30px 80px -20px rgba(0,0,0,.35)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          border: '1px solid #e5e7eb', animation: 'aiHelpIn .18s cubic-bezier(.16,1,.3,1)',
        }}>
          <div style={{ padding: '14px 16px', background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} />
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>AI Guide</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%', padding: '9px 12px', borderRadius: 12,
                borderBottomRightRadius: m.role === 'user' ? 4 : 12,
                borderBottomLeftRadius: m.role === 'user' ? 12 : 4,
                background: m.role === 'user' ? accent : '#f3f4f6',
                color: m.role === 'user' ? '#fff' : '#1f2937',
                fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
              }}>
                {m.text}
              </div>
            ))}
            {sending && <div style={{ alignSelf: 'flex-start', fontSize: 12, color: '#9ca3af' }}>Thinking…</div>}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #f3f4f6' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask what to do…"
              style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 9, padding: '8px 10px', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }}
            />
            <button type="submit" disabled={sending || !input.trim()} style={{
              width: 34, height: 34, borderRadius: 9, border: 'none', flexShrink: 0,
              background: input.trim() ? accent : '#e5e7eb', color: '#fff', cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
      <style>{`@keyframes aiHelpIn { from { opacity:0; transform:translateY(10px) scale(.97) } to { opacity:1; transform:translateY(0) scale(1) } }`}</style>
    </>
  )
}
