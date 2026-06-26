import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HeartPulse, ArrowRight, Loader2, Eye, EyeOff, ShieldCheck, Activity, Users } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const STATS = [
  { icon: Users,       value: '12,400+', label: 'Patients managed'   },
  { icon: Activity,    value: '98.2%',   label: 'Uptime reliability'  },
  { icon: ShieldCheck, value: 'HIPAA',   label: 'Compliant & secure'  },
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

  const inputStyle = (field) => ({
    width: '100%', padding: '12px 14px',
    border: `1.5px solid ${focused === field ? '#0e7490' : '#e5e7eb'}`,
    borderRadius: 10, fontSize: 14, color: '#111827', outline: 'none',
    boxSizing: 'border-box', background: focused === field ? '#f0fdff' : '#fafafa',
    transition: 'border-color .15s, background .15s',
  })

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* ── Left panel ── */}
      <div style={{
        flex: '0 0 480px',
        background: 'linear-gradient(160deg, #0c5f78 0%, #0a4a61 45%, #083d52 100%)',
        display: 'flex', flexDirection: 'column',
        padding: '48px 52px',
        position: 'relative', overflow: 'hidden',
      }} className="login-left">
        {/* Background circles */}
        <div style={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, borderRadius: '50%', background: 'rgba(255,255,255,.04)' }} />
        <div style={{ position: 'absolute', bottom: 60, left: -60, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,.04)' }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'auto' }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: 'rgba(255,255,255,.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(255,255,255,.1)',
          }}>
            <HeartPulse size={22} color="#fff" />
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 16, lineHeight: 1.2 }}>Vianova Health</div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12 }}>Cure Analyzer System</div>
          </div>
        </div>

        {/* Hero text */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 40 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,.1)', borderRadius: 99, padding: '5px 14px',
            fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.8)',
            textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 20,
            width: 'fit-content',
          }}>
            <ShieldCheck size={12} /> HIPAA-Compliant Platform
          </div>
          <h1 style={{ color: '#fff', fontSize: 34, fontWeight: 800, lineHeight: 1.2, margin: '0 0 16px' }}>
            Clinical AI for<br />Modern Healthcare
          </h1>
          <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 14, lineHeight: 1.7, margin: 0 }}>
            AI-assisted diagnostics, care gap analysis, and population health management — all in one secure platform.
          </p>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 20, marginTop: 40 }}>
            {STATS.map(({ icon: Icon, value, label }) => (
              <div key={label} style={{
                flex: 1, background: 'rgba(255,255,255,.08)',
                borderRadius: 12, padding: '16px 14px',
                border: '1px solid rgba(255,255,255,.1)',
              }}>
                <Icon size={16} color="rgba(255,255,255,.6)" style={{ marginBottom: 8 }} />
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>{value}</div>
                <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 11, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ color: 'rgba(255,255,255,.3)', fontSize: 11 }}>
          v2.0 · llama-3.3-70b · AI drafts require physician review
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f8fafc', padding: '40px 24px',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* Header */}
          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: '#111827', margin: '0 0 6px' }}>
              Welcome back
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
              Sign in to your clinical workspace
            </p>
          </div>

          <form onSubmit={handleLogin} noValidate>
            {/* Email */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
                Email address
              </label>
              <input
                type="text" inputMode="email" autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="doctor@hospital.com" autoFocus
                style={inputStyle('email')}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 22 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'} autoComplete="current-password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ ...inputStyle('password'), paddingRight: 44 }}
                  onFocus={() => setFocused('password')}
                  onBlur={() => setFocused(null)}
                />
                <button type="button" onClick={() => setShowPw(v => !v)} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                  color: '#9ca3af', display: 'flex', alignItems: 'center',
                }}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10,
                padding: '11px 14px', fontSize: 13, color: '#be123c',
                marginBottom: 18, display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <span style={{ fontSize: 15, lineHeight: 1 }}>⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              style={{
                width: '100%', padding: '13px 16px',
                background: (loading || !email.trim() || !password)
                  ? '#e5e7eb'
                  : 'linear-gradient(135deg, #0e7490 0%, #0c6580 100%)',
                color: (loading || !email.trim() || !password) ? '#9ca3af' : '#fff',
                border: 'none', borderRadius: 10,
                fontSize: 14, fontWeight: 700,
                cursor: (loading || !email.trim() || !password) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all .15s',
                boxShadow: (loading || !email.trim() || !password) ? 'none' : '0 4px 14px rgba(14,116,144,.35)',
              }}
            >
              {loading
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Signing in…</>
                : <>Sign In <ArrowRight size={15} /></>}
            </button>
          </form>

          {/* Trust badges */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20,
            marginTop: 36, paddingTop: 28, borderTop: '1px solid #e5e7eb',
          }}>
            {[['🔒', 'End-to-end encrypted'], ['🏥', 'HIPAA compliant'], ['🤖', 'AI-assisted']].map(([icon, text]) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9ca3af' }}>
                <span>{icon}</span><span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .login-left { display: none !important; }
        }
      `}</style>
    </div>
  )
}
