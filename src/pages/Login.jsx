import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  HeartPulse, ArrowRight, Loader2, Eye, EyeOff,
  ShieldCheck, Activity, Users, Lock, BadgeCheck, Cpu
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const STATS = [
  { icon: Users,    value: '12,400+', label: 'Patients' },
  { icon: Activity, value: '98.2%',   label: 'Uptime'   },
  { icon: ShieldCheck, value: 'HIPAA', label: 'Compliant' },
]

const TRUST = [
  { icon: Lock,       label: 'End-to-end encrypted' },
  { icon: BadgeCheck, label: 'HIPAA compliant'       },
  { icon: Cpu,        label: 'AI-assisted care'      },
]

export default function Login() {
  const { key, loginWithOTP } = useKey()
  const navigate = useNavigate()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [focused,  setFocused]  = useState(null)

  useEffect(() => {
    if (key) navigate('/dashboard', { replace: true })
  }, [key, navigate])

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    if (!email.trim() || !email.includes('@')) { setError('Please enter a valid email address.'); return }
    if (!password)                              { setError('Please enter your password.');        return }
    setLoading(true)
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      loginWithOTP(data.token, data.role, data.label, data.email)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = !loading && email.trim() && password

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'Inter', sans-serif" }}>

      {/* ── Left panel ── */}
      <div className="login-panel-left">
        {/* Decorative blobs */}
        <div style={{ position: 'absolute', top: -120, right: -120, width: 400, height: 400, borderRadius: '50%', background: 'rgba(255,255,255,.04)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -80, left: -80,  width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,.05)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '40%', left: '60%',  width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,.03)', pointerEvents: 'none' }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 13,
            background: 'rgba(255,255,255,.15)',
            border: '1px solid rgba(255,255,255,.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 24px rgba(255,255,255,.1)',
          }}>
            <HeartPulse size={22} color="#fff" />
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>Vianova Health</div>
            <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 11, letterSpacing: '.04em' }}>Cure Analyzer System</div>
          </div>
        </div>

        {/* Hero */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,.1)',
            border: '1px solid rgba(255,255,255,.15)',
            borderRadius: 99, padding: '5px 14px',
            fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.85)',
            textTransform: 'uppercase', letterSpacing: '.1em',
            marginBottom: 22, width: 'fit-content',
          }}>
            <ShieldCheck size={11} />
            HIPAA-Compliant Platform
          </div>

          <h1 style={{
            color: '#fff', fontSize: 38, fontWeight: 800,
            lineHeight: 1.15, margin: '0 0 18px',
            letterSpacing: '-.02em',
          }}>
            Clinical AI for<br />Modern Healthcare
          </h1>

          <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 14, lineHeight: 1.8, margin: '0 0 40px', maxWidth: 340 }}>
            AI-assisted diagnostics, care gap analysis, and population health management — all in one secure platform built for clinicians.
          </p>

          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {STATS.map(({ icon: Icon, value, label }) => (
              <div key={label} style={{
                background: 'rgba(255,255,255,.07)',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 14, padding: '18px 14px',
                backdropFilter: 'blur(8px)',
              }}>
                <Icon size={15} color="rgba(255,255,255,.5)" style={{ marginBottom: 10, display: 'block' }} />
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{value}</div>
                <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 11, marginTop: 5 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          color: 'rgba(255,255,255,.25)', fontSize: 11,
        }}>
          <ShieldCheck size={11} />
          v2.0 · llama-3.3-70b · AI drafts require physician review
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f8fafc', padding: '40px 24px',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* Heading */}
          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', margin: '0 0 8px', letterSpacing: '-.02em' }}>
              Welcome back
            </h2>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0, lineHeight: 1.5 }}>
              Sign in to your clinical workspace to continue.
            </p>
          </div>

          <form onSubmit={handleLogin} noValidate>

            {/* Email */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 7 }}>
                Email address
              </label>
              <input
                type="text" inputMode="email" autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="doctor@hospital.com" autoFocus
                style={{
                  width: '100%', padding: '12px 14px',
                  border: `1.5px solid ${focused === 'email' ? '#0e7490' : '#e2e8f0'}`,
                  borderRadius: 10, fontSize: 14, color: '#0f172a', outline: 'none',
                  boxSizing: 'border-box',
                  background: focused === 'email' ? '#f0fdff' : '#fff',
                  boxShadow: focused === 'email' ? '0 0 0 3px rgba(14,116,144,.1)' : '0 1px 2px rgba(0,0,0,.04)',
                  transition: 'border-color .15s, box-shadow .15s, background .15s',
                }}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 7 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'} autoComplete="current-password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  style={{
                    width: '100%', padding: '12px 44px 12px 14px',
                    border: `1.5px solid ${focused === 'password' ? '#0e7490' : '#e2e8f0'}`,
                    borderRadius: 10, fontSize: 14, color: '#0f172a', outline: 'none',
                    boxSizing: 'border-box',
                    background: focused === 'password' ? '#f0fdff' : '#fff',
                    boxShadow: focused === 'password' ? '0 0 0 3px rgba(14,116,144,.1)' : '0 1px 2px rgba(0,0,0,.04)',
                    transition: 'border-color .15s, box-shadow .15s, background .15s',
                  }}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                />
                <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1} style={{
                  position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                  color: '#94a3b8', display: 'flex', alignItems: 'center',
                  borderRadius: 6, transition: 'color .15s',
                }}
                  onMouseEnter={e => e.currentTarget.style.color = '#0e7490'}
                  onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: '#fff1f2', border: '1px solid #fecdd3',
                borderRadius: 10, padding: '12px 14px',
                fontSize: 13, color: '#be123c', marginBottom: 20,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fecdd3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M5 3v2.5M5 7h.01" stroke="#be123c" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                width: '100%', padding: '13px 16px',
                background: canSubmit
                  ? 'linear-gradient(135deg, #0e7490 0%, #0c6580 100%)'
                  : '#e2e8f0',
                color: canSubmit ? '#fff' : '#94a3b8',
                border: 'none', borderRadius: 10,
                fontSize: 14, fontWeight: 700,
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: canSubmit ? '0 4px 16px rgba(14,116,144,.3)' : 'none',
                transition: 'all .2s',
                letterSpacing: '.01em',
              }}
              onMouseEnter={e => { if (canSubmit) e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = canSubmit ? '0 6px 20px rgba(14,116,144,.35)' : 'none' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = canSubmit ? '0 4px 16px rgba(14,116,144,.3)' : 'none' }}
            >
              {loading
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Signing in…</>
                : <>Sign In <ArrowRight size={15} /></>}
            </button>
          </form>

          {/* Trust badges */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 24, marginTop: 32, paddingTop: 24,
            borderTop: '1px solid #e2e8f0',
          }}>
            {TRUST.map(({ icon: Icon, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#94a3b8' }}>
                <Icon size={12} color="#cbd5e1" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .login-panel-left {
          flex: 0 0 460px;
          background: linear-gradient(160deg, #0c5f78 0%, #0a4961 50%, #073848 100%);
          display: flex;
          flex-direction: column;
          gap: 32px;
          padding: 48px 52px;
          position: relative;
          overflow: hidden;
        }
        @media (max-width: 860px) {
          .login-panel-left { display: none !important; }
        }
      `}</style>
    </div>
  )
}
