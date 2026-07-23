import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Phone, PhoneCall, PhoneOff, PhoneIncoming, Mic, MicOff, Bot, Stethoscope,
  Users, Clock, Check, X, Loader2, Search, Send, User as UserIcon, CalendarClock,
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const TABS = [
  { key: 'ai',       label: 'AI Assistant',      icon: Bot },
  { key: 'doctors',  label: 'Doctor Calls',      icon: Stethoscope },
  { key: 'patients', label: 'Patient Calls',     icon: Users },
]

const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }
const SpeechRecognitionApi = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

function fmtDuration(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function CallTimer({ startedAt }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  return <span>{fmtDuration((now - startedAt) / 1000)}</span>
}

// ── AI Assistant voice call ─────────────────────────────────────────────────
function AiCallPanel({ apiKey }) {
  const [active, setActive] = useState(false)
  const [listening, setListening] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [muted, setMuted] = useState(false)
  const [transcript, setTranscript] = useState([])
  const [typed, setTyped] = useState('')
  const [startedAt, setStartedAt] = useState(null)
  const recognitionRef = useRef(null)
  const mutedRef = useRef(false)
  const transcriptEndRef = useRef(null)

  useEffect(() => { mutedRef.current = muted }, [muted])
  useEffect(() => { transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [transcript, thinking])

  const speak = useCallback((text, onDone) => {
    if (!window.speechSynthesis) { onDone?.(); return }
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.02
    u.onend = () => onDone?.()
    u.onerror = () => onDone?.()
    window.speechSynthesis.speak(u)
  }, [])

  const startListening = useCallback(() => {
    if (!SpeechRecognitionApi || mutedRef.current) return
    try {
      const rec = new SpeechRecognitionApi()
      rec.continuous = false
      rec.interimResults = false
      rec.lang = 'en-US'
      rec.onstart = () => setListening(true)
      rec.onend = () => setListening(false)
      rec.onerror = () => setListening(false)
      rec.onresult = (e) => {
        const text = e.results[0][0].transcript.trim()
        if (text) sendMessage(text)
      }
      recognitionRef.current = rec
      rec.start()
    } catch { /* mic permission denied or unsupported */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function sendMessage(text) {
    setTranscript(t => [...t, { role: 'user', text }])
    setThinking(true)
    try {
      const history = transcript.slice(-10).map(m => ({ role: m.role, text: m.text }))
      const r = await fetch('/api/ai-call/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ message: text, history }),
      })
      const d = await r.json()
      const reply = d.reply || "Sorry, I couldn't process that — could you say it again?"
      setThinking(false)
      setTranscript(t => [...t, { role: 'assistant', text: reply }])
      speak(reply, () => { if (active) startListening() })
    } catch {
      setThinking(false)
      const reply = "I'm having trouble connecting right now. Please try again in a moment."
      setTranscript(t => [...t, { role: 'assistant', text: reply }])
      speak(reply, () => { if (active) startListening() })
    }
  }

  function startCall() {
    setActive(true)
    setStartedAt(Date.now())
    setTranscript([{ role: 'assistant', text: "Hi, I'm the Vianova AI Assistant. How can I help you today?" }])
    speak("Hi, I'm the Vianova AI Assistant. How can I help you today?", () => startListening())
  }

  function endCall() {
    setActive(false)
    recognitionRef.current?.stop?.()
    window.speechSynthesis?.cancel()
    setListening(false)
    setThinking(false)
  }

  function handleTypedSubmit(e) {
    e.preventDefault()
    const text = typed.trim()
    if (!text) return
    setTyped('')
    recognitionRef.current?.stop?.()
    sendMessage(text)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: active ? '280px 1fr' : '1fr', gap: 20 }}>
      {active && (
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, height: 'fit-content' }}>
          <div style={{
            width: 84, height: 84, borderRadius: '50%',
            background: thinking ? 'linear-gradient(135deg,#0e7490,#059669)' : listening ? '#dcfce7' : '#eef2f6',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: listening ? '0 0 0 8px #dcfce7aa' : 'none', transition: 'all .3s',
          }}>
            <Bot size={36} color={thinking ? '#fff' : '#0e7490'} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>AI Assistant</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              {thinking ? 'Thinking…' : listening ? 'Listening…' : 'On call'} · <CallTimer startedAt={startedAt} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button className="icon-btn" title={muted ? 'Unmute' : 'Mute mic'} onClick={() => setMuted(m => !m)}
              style={{ width: 40, height: 40, borderRadius: '50%', background: muted ? '#fee2e2' : '#f3f4f6' }}>
              {muted ? <MicOff size={16} color="#dc2626" /> : <Mic size={16} />}
            </button>
            <button title="End call" onClick={endCall}
              style={{ width: 40, height: 40, borderRadius: '50%', background: '#dc2626', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <PhoneOff size={16} color="#fff" />
            </button>
          </div>
          {!SpeechRecognitionApi && (
            <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginTop: 4 }}>
              Voice input isn't supported in this browser — type your messages below instead.
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: active ? 480 : 'auto' }}>
        {!active ? (
          <div style={{ padding: '60px 30px', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Bot size={28} color="#0e7490" />
            </div>
            <div style={{ fontWeight: 700, fontSize: 17, color: '#111827', marginBottom: 6 }}>Talk to the AI Assistant</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', maxWidth: 380, margin: '0 auto 20px' }}>
              Start a live voice call for quick questions about platform features and general guidance.
              {!SpeechRecognitionApi && ' Your browser will use text chat with spoken replies.'}
            </div>
            <button className="btn btn-primary" onClick={startCall}>
              <PhoneCall size={15} /> Start AI Call
            </button>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {transcript.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '75%', padding: '9px 13px', borderRadius: 14, fontSize: 13, lineHeight: 1.5,
                    background: m.role === 'user' ? 'var(--primary)' : '#f3f4f6',
                    color: m.role === 'user' ? '#fff' : '#1f2937',
                    borderBottomRightRadius: m.role === 'user' ? 4 : 14,
                    borderBottomLeftRadius: m.role === 'user' ? 14 : 4,
                  }}>
                    {m.text}
                  </div>
                </div>
              ))}
              {thinking && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '9px 13px', borderRadius: 14, background: '#f3f4f6' }}>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>
            <form onSubmit={handleTypedSubmit} style={{ display: 'flex', gap: 8, padding: 14, borderTop: '1px solid var(--border)' }}>
              <input value={typed} onChange={e => setTyped(e.target.value)} placeholder="Type a message…"
                style={{ flex: 1, padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none' }} />
              <button type="submit" className="btn btn-primary btn-sm"><Send size={13} /></button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

// ── Doctor-to-doctor WebRTC calls ───────────────────────────────────────────
function DoctorCallsPanel({ apiKey, email, label }) {
  const [doctors, setDoctors] = useState([])
  const [search, setSearch] = useState('')
  const [call, setCall] = useState(null) // { id, role, status, peerName }
  const [incoming, setIncoming] = useState(null)
  const [error, setError] = useState('')
  const pcRef = useRef(null)
  const streamRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const seenCandidatesRef = useRef(0)
  const pollRef = useRef(null)
  const [muted, setMuted] = useState(false)
  const callRef = useRef(null)
  useEffect(() => { callRef.current = call }, [call])

  useEffect(() => {
    fetch('/api/doctors', { headers: { 'x-api-key': apiKey } }).then(r => r.json()).then(d => setDoctors(d.doctors || [])).catch(() => {})
  }, [apiKey])

  // Poll for incoming rings while idle
  useEffect(() => {
    if (call) return
    const iv = setInterval(async () => {
      try {
        const r = await fetch('/api/voice-calls/incoming', { headers: { 'x-api-key': apiKey } })
        const d = await r.json()
        const first = (d.calls || [])[0]
        setIncoming(first || null)
      } catch { /* silent */ }
    }, 3000)
    return () => clearInterval(iv)
  }, [call, apiKey])

  function cleanupCall() {
    clearInterval(pollRef.current)
    pcRef.current?.close?.()
    streamRef.current?.getTracks?.().forEach(t => t.stop())
    pcRef.current = null
    streamRef.current = null
    seenCandidatesRef.current = 0
  }

  async function setupPeerConnection(callId, role) {
    const pc = new RTCPeerConnection(ICE_SERVERS)
    pcRef.current = pc
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream
    stream.getTracks().forEach(t => pc.addTrack(t, stream))
    pc.ontrack = (e) => { if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0] }
    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      fetch(`/api/voice-calls/${callId}/candidate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ candidate: e.candidate }),
      }).catch(() => {})
    }
    return pc
  }

  function pollCall(callId, role) {
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/voice-calls/${callId}`, { headers: { 'x-api-key': apiKey } })
        if (!r.ok) return
        const d = await r.json()
        const c = d.call
        if (!c) return
        const pc = pcRef.current
        if (role === 'caller' && c.status === 'accepted' && pc && !pc.currentRemoteDescription) {
          await pc.setRemoteDescription(JSON.parse(c.answer))
          setCall(cur => cur && { ...cur, status: 'connected' })
        }
        const candField = role === 'caller' ? 'callee_candidates' : 'caller_candidates'
        let cands = []
        try { cands = JSON.parse(c[candField] || '[]') } catch { cands = [] }
        for (let i = seenCandidatesRef.current; i < cands.length; i++) {
          try { await pc?.addIceCandidate(cands[i]) } catch { /* ignore dup/invalid */ }
        }
        seenCandidatesRef.current = cands.length
        if (c.status === 'declined' || c.status === 'ended') {
          cleanupCall()
          setCall(null)
          setError(c.status === 'declined' ? 'Call declined' : 'Call ended')
          setTimeout(() => setError(''), 4000)
        }
      } catch { /* silent poll error */ }
    }, 1500)
  }

  async function startCall(doctor) {
    setError('')
    try {
      const pc = await setupPeerConnection(null, 'caller')
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const r = await fetch('/api/voice-calls', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ callee_email: doctor.email, offer: JSON.stringify(offer) }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Could not start call'); cleanupCall(); return }
      setCall({ id: d.id, role: 'caller', status: 'ringing', peerName: doctor.name, startedAt: Date.now() })
      pollCall(d.id, 'caller')
    } catch {
      setError('Microphone access is required to place a call.')
      cleanupCall()
    }
  }

  async function acceptIncoming() {
    const inc = incoming
    setIncoming(null)
    setError('')
    try {
      const r0 = await fetch(`/api/voice-calls/${inc.id}`, { headers: { 'x-api-key': apiKey } })
      const d0 = await r0.json()
      const pc = await setupPeerConnection(inc.id, 'callee')
      await pc.setRemoteDescription(JSON.parse(d0.call.offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await fetch(`/api/voice-calls/${inc.id}/accept`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ answer: JSON.stringify(answer) }),
      })
      setCall({ id: inc.id, role: 'callee', status: 'connected', peerName: inc.caller_name, startedAt: Date.now() })
      pollCall(inc.id, 'callee')
    } catch {
      setError('Microphone access is required to accept the call.')
      cleanupCall()
    }
  }

  async function declineIncoming() {
    const inc = incoming
    setIncoming(null)
    fetch(`/api/voice-calls/${inc.id}/decline`, { method: 'POST', headers: { 'x-api-key': apiKey } }).catch(() => {})
  }

  async function endCall() {
    const id = call?.id
    cleanupCall()
    setCall(null)
    if (id) fetch(`/api/voice-calls/${id}/end`, { method: 'POST', headers: { 'x-api-key': apiKey } }).catch(() => {})
  }

  useEffect(() => () => cleanupCall(), [])

  function toggleMute() {
    const next = !muted
    setMuted(next)
    streamRef.current?.getAudioTracks?.().forEach(t => { t.enabled = !next })
  }

  const filtered = doctors.filter(d => !search || d.name?.toLowerCase().includes(search.toLowerCase()) || d.email?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <audio ref={remoteAudioRef} autoPlay />

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {incoming && !call && (
        <div className="card" style={{ padding: 18, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, border: '1px solid #bbf7d0', background: '#f0fdf4' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, animation: 'pulse 1.4s ease-in-out infinite' }}>
            <PhoneIncoming size={19} color="#059669" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{incoming.caller_name}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Incoming call…</div>
          </div>
          <button className="btn btn-sm" style={{ background: '#dc2626', color: '#fff', border: 'none' }} onClick={declineIncoming}><X size={13} /> Decline</button>
          <button className="btn btn-primary btn-sm" onClick={acceptIncoming}><Check size={13} /> Accept</button>
        </div>
      )}

      {call && (
        <div className="card" style={{ padding: 24, marginBottom: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Stethoscope size={30} color="#0284c7" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>{call.peerName}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              {call.status === 'ringing' ? 'Ringing…' : <><CallTimer startedAt={call.startedAt} /> · Connected</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="icon-btn" title={muted ? 'Unmute' : 'Mute'} onClick={toggleMute}
              style={{ width: 40, height: 40, borderRadius: '50%', background: muted ? '#fee2e2' : '#f3f4f6' }}>
              {muted ? <MicOff size={16} color="#dc2626" /> : <Mic size={16} />}
            </button>
            <button title="End call" onClick={endCall}
              style={{ width: 40, height: 40, borderRadius: '50%', background: '#dc2626', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <PhoneOff size={16} color="#fff" />
            </button>
          </div>
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: 16, maxWidth: 340 }}>
        <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search doctors…"
          style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text3)' }}>
          <Stethoscope size={36} style={{ margin: '0 auto 10px', display: 'block', opacity: .35 }} />
          No other doctors on the platform yet.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {filtered.map(d => (
            <div key={d.id} className="card hoverable" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: d.role === 'superadmin' ? 'var(--primary)' : 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <UserIcon size={16} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)', textTransform: 'capitalize' }}>{d.role}</div>
              </div>
              <button className="icon-btn" title={`Call ${d.name}`} disabled={!!call} onClick={() => startCall(d)}
                style={{ width: 34, height: 34, borderRadius: '50%', background: call ? '#f3f4f6' : '#dcfce7', opacity: call ? .5 : 1 }}>
                <Phone size={15} color="#059669" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Patient callback requests ───────────────────────────────────────────────
const STATUS_STYLE = {
  pending:   { bg: '#fef3c7', color: '#b45309', label: 'Pending' },
  accepted:  { bg: '#dbeafe', color: '#1d4ed8', label: 'Accepted' },
  declined:  { bg: '#fee2e2', color: '#b91c1c', label: 'Declined' },
  completed: { bg: '#dcfce7', color: '#15803d', label: 'Completed' },
}

function PatientCallbacksPanel({ apiKey, email }) {
  const [requests, setRequests] = useState([])
  const [patients, setPatients] = useState([])
  const [doctors, setDoctors] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ patient_id: '', target_doctor_email: '', reason: '' })
  const [patientSearch, setPatientSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dialSearch, setDialSearch] = useState('')

  const load = useCallback(() => {
    fetch('/api/call-requests', { headers: { 'x-api-key': apiKey } })
      .then(r => r.json()).then(d => { setRequests(d.requests || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [apiKey])

  useEffect(() => {
    load()
    const iv = setInterval(load, 8000)
    return () => clearInterval(iv)
  }, [load])

  useEffect(() => {
    fetch('/api/gen-patients', { headers: { 'x-api-key': apiKey } }).then(r => r.json()).then(d => setPatients(d.patients || [])).catch(() => {})
    fetch('/api/doctors', { headers: { 'x-api-key': apiKey } }).then(r => r.json()).then(d => setDoctors(d.doctors || [])).catch(() => {})
  }, [apiKey])

  async function submitRequest(e) {
    e.preventDefault()
    const patient = patients.find(p => p.id === form.patient_id)
    if (!patient || !form.target_doctor_email) return
    setSubmitting(true)
    try {
      await fetch('/api/call-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ patient_id: patient.id, patient_name: patient.name, patient_phone: patient.phone, target_doctor_email: form.target_doctor_email, reason: form.reason }),
      })
      setForm({ patient_id: '', target_doctor_email: '', reason: '' })
      setPatientSearch('')
      setShowForm(false)
      load()
    } finally { setSubmitting(false) }
  }

  async function act(id, action, extra) {
    await fetch(`/api/call-requests/${id}/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: extra ? JSON.stringify(extra) : undefined,
    })
    load()
  }

  const filteredPatients = patients.filter(p => !patientSearch || p.name?.toLowerCase().includes(patientSearch.toLowerCase()))
  const dialMatches = dialSearch.trim()
    ? patients.filter(p => p.name?.toLowerCase().includes(dialSearch.toLowerCase())).slice(0, 8)
    : []

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>

  return (
    <div>
      {/* Any doctor can dial a patient's number on file directly — no routing/acceptance needed */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>Call a patient</div>
        <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 12 }}>Search by name and dial their number on file directly — no request or hand-off needed.</div>
        <div style={{ position: 'relative' }}>
          <Search size={14} color="var(--text3)" style={{ position: 'absolute', left: 12, top: 11 }} />
          <input value={dialSearch} onChange={e => setDialSearch(e.target.value)}
            placeholder="Search patients by name…"
            style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        {dialSearch.trim() && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dialMatches.length === 0 && <div style={{ padding: '7px 2px', fontSize: 12, color: 'var(--text3)' }}>No matches</div>}
            {dialMatches.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{p.phone || 'No phone number on file'}</div>
                </div>
                {p.phone
                  ? <a className="btn btn-primary btn-sm" href={`tel:${p.phone}`} style={{ textDecoration: 'none', flexShrink: 0 }}><Phone size={12} /> Call</a>
                  : <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>Unavailable</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)}>
          <PhoneCall size={13} /> {showForm ? 'Cancel' : 'Route to a colleague instead'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submitRequest} className="card" style={{ padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Patient</label>
            <input value={patientSearch} onChange={e => { setPatientSearch(e.target.value); setForm(f => ({ ...f, patient_id: '' })) }}
              placeholder="Search patient by name…" style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            {patientSearch && !form.patient_id && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 4, maxHeight: 160, overflowY: 'auto' }}>
                {filteredPatients.slice(0, 8).map(p => (
                  <div key={p.id} onClick={() => { setForm(f => ({ ...f, patient_id: p.id })); setPatientSearch(p.name) }}
                    style={{ padding: '7px 12px', fontSize: 13, cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                    {p.name} {p.phone ? <span style={{ color: 'var(--text3)' }}>· {p.phone}</span> : null}
                  </div>
                ))}
                {filteredPatients.length === 0 && <div style={{ padding: '7px 12px', fontSize: 12, color: 'var(--text3)' }}>No matches</div>}
              </div>
            )}
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Route to doctor</label>
            <select value={form.target_doctor_email} onChange={e => setForm(f => ({ ...f, target_doctor_email: e.target.value }))} required
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none' }}>
              <option value="">Select a doctor…</option>
              {doctors.map(d => <option key={d.id} value={d.email}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 4 }}>Reason (optional)</label>
            <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={2}
              placeholder="What does the patient want to discuss?" style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!form.patient_id || !form.target_doctor_email || submitting} style={{ alignSelf: 'flex-end' }}>
            {submitting ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />} Submit request
          </button>
        </form>
      )}

      {requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text3)' }}>
          <CalendarClock size={36} style={{ margin: '0 auto 10px', display: 'block', opacity: .35 }} />
          No callback requests yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.map(r => {
            const st = STATUS_STYLE[r.status] || STATUS_STYLE.pending
            const isTarget = r.target_doctor_email === email
            return (
              <div key={r.id} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{r.patient_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    {isTarget ? `Requested by ${r.owner_name}` : `Routed to ${r.target_doctor_name}`}
                    {r.patient_phone && <> · {r.patient_phone}</>}
                  </div>
                  {r.reason && <div style={{ fontSize: 12.5, color: '#374151', marginTop: 4 }}>{r.reason}</div>}
                </div>
                <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color, flexShrink: 0 }}>{st.label}</span>
                {isTarget && r.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-sm" style={{ background: '#f3f4f6', border: 'none' }} onClick={() => act(r.id, 'decline')}>Decline</button>
                    <button className="btn btn-primary btn-sm" onClick={() => act(r.id, 'accept')}>Accept</button>
                  </div>
                )}
                {isTarget && r.status === 'accepted' && r.patient_phone && (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <a className="btn btn-sm" href={`tel:${r.patient_phone}`} style={{ background: '#dcfce7', color: '#15803d', textDecoration: 'none' }}><Phone size={12} /> Call now</a>
                    <button className="btn btn-sm" style={{ background: '#f3f4f6', border: 'none' }} onClick={() => act(r.id, 'complete')}>Mark done</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Calls() {
  const { key, email, label } = useKey()
  const [tab, setTab] = useState('ai')

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">Calls</span>
      </div>

      <div className="tab-row" style={{ padding: '0 32px' }}>
        {TABS.map(t => (
          <button key={t.key} className={`tab-item ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '24px 32px' }}>
        {!key ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>Connect an API key to use Calls.</div>
        ) : tab === 'ai' ? (
          <AiCallPanel apiKey={key} />
        ) : tab === 'doctors' ? (
          <DoctorCallsPanel apiKey={key} email={email} label={label} />
        ) : (
          <PatientCallbacksPanel apiKey={key} email={email} />
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .7; transform: scale(1.08); } }`}</style>
    </div>
  )
}
