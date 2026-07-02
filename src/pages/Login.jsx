import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight, Loader2, Eye, EyeOff,
  ShieldCheck, TrendingUp, Users, Lock, Zap, CheckCircle2
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const FEATURES = [
  { icon: ShieldCheck, title: 'HIPAA Compliant',       desc: 'All data encrypted at rest and in transit' },
  { icon: Zap,         title: 'AI-Powered Insights',   desc: 'Real-time diagnostics with llama-3.3-70b'  },
  { icon: TrendingUp,  title: 'Population Health',     desc: 'Track cohorts, gaps, and outcomes at scale' },
  { icon: Users,       title: '12,400+ Patients',      desc: 'Trusted by clinical teams worldwide'        },
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
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse  { 0%,100% { opacity: .6; } 50% { opacity: 1; } }

        .login-root {
          min-height: 100vh;
          display: flex;
          background: #fff;
        }

        /* ── LEFT ── */
        .login-left {
          position: relative;
          width: 520px;
          flex-shrink: 0;
          background: #020d18;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          padding: 52px 56px;
        }
        .login-left-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px);
          background-size: 40px 40px;
          mask-image: radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%);
        }
        .login-left-glow {
          position: absolute;
          top: -160px; left: -160px;
          width: 600px; height: 600px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(14,116,144,.35) 0%, transparent 70%);
          pointer-events: none;
        }
        .login-left-glow2 {
          position: absolute;
          bottom: -120px; right: -120px;
          width: 400px; height: 400px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(6,78,59,.4) 0%, transparent 70%);
          pointer-events: none;
        }
        .login-left-glow3 {
          position: absolute;
          top: 40%; left: 30%;
          width: 300px; height: 300px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(99,102,241,.2) 0%, transparent 70%);
          pointer-events: none;
        }

        /* ── RIGHT ── */
        .login-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
          background: #f8fafc;
        }
        .login-card {
          width: 100%;
          max-width: 420px;
          animation: fadeUp .4s ease both;
        }

        /* ── INPUTS ── */
        .login-input {
          width: 100%;
          padding: 13px 15px;
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          font-size: 14px;
          color: #0f172a;
          outline: none;
          background: #fff;
          box-shadow: 0 1px 3px rgba(0,0,0,.05);
          transition: border-color .15s, box-shadow .15s;
        }
        .login-input:focus {
          border-color: #0e7490;
          box-shadow: 0 0 0 3px rgba(14,116,144,.12), 0 1px 3px rgba(0,0,0,.05);
        }
        .login-input::placeholder { color: #94a3b8; }

        /* ── BUTTON ── */
        .login-btn {
          width: 100%;
          padding: 14px 16px;
          border: none;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: .01em;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: transform .15s, box-shadow .15s;
        }
        .login-btn:disabled {
          background: #e2e8f0 !important;
          color: #94a3b8 !important;
          box-shadow: none !important;
          cursor: not-allowed;
        }
        .login-btn:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(14,116,144,.4) !important;
        }
        .login-btn:not(:disabled):active {
          transform: translateY(0);
        }

        /* ── FEATURE ROW ── */
        .feature-row {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          padding: 14px 0;
          border-bottom: 1px solid rgba(255,255,255,.07);
        }
        .feature-row:first-child { padding-top: 0; }
        .feature-row:last-child  { border-bottom: none; padding-bottom: 0; }

        @media (max-width: 900px) {
          .login-left { display: none; }
        }
      `}</style>

      <div className="login-root">

        {/* ════════════════ LEFT ════════════════ */}
        <div className="login-left">
          <div className="login-left-grid" />
          <div className="login-left-glow" />
          <div className="login-left-glow2" />
          <div className="login-left-glow3" />

          {/* Logo */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(14,116,144,.2)', border: '1px solid rgba(14,116,144,.4)',
                borderRadius: 99, padding: '4px 13px',
                width: 'fit-content',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2dd4bf', display: 'block', animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: '#5eead4', letterSpacing: '.06em', textTransform: 'uppercase' }}>Live Platform</span>
              </div>
              <img src="/vianova-logo.svg" alt="Vianova Health" style={{ height: 32, width: 'auto' }} />
            </div>
            <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 11, letterSpacing: '.04em', textAlign: 'center' }}>CURE ANALYZER SYSTEM</div>
          </div>

          {/* Hero copy */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 20 }}>
            <h1 style={{
              color: '#fff', fontSize: 44, fontWeight: 900,
              lineHeight: 1.1, letterSpacing: '-.03em',
              marginBottom: 20,
            }}>
              The smarter way<br />
              <span style={{ color: '#5eead4' }}>to deliver care</span>
            </h1>

            <p style={{ color: 'rgba(255,255,255,.45)', fontSize: 14, lineHeight: 1.8, marginBottom: 28, maxWidth: 360 }}>
              AI-assisted diagnostics, real-time care gap alerts, and population health tools — built for modern clinical teams.
            </p>

            {/* Stats grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32,
            }}>
              {[
                { value: '12,400+', label: 'Patients managed' },
                { value: '99.9%',   label: 'Uptime SLA'       },
                { value: '2.1s',    label: 'Avg AI response'  },
                { value: 'HIPAA',   label: 'Compliant'        },
              ].map(s => (
                <div key={s.label} style={{
                  background: 'rgba(255,255,255,.05)',
                  border: '1px solid rgba(255,255,255,.08)',
                  borderRadius: 14, padding: '18px 20px',
                }}>
                  <div style={{ color: '#38bdf8', fontWeight: 800, fontSize: 24, letterSpacing: '-.02em' }}>{s.value}</div>
                  <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 12, marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Feature list */}
            <div>
              {FEATURES.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="feature-row">
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: 'rgba(255,255,255,.06)',
                    border: '1px solid rgba(255,255,255,.09)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={15} color="#38bdf8" />
                  </div>
                  <div>
                    <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>{title}</div>
                    <div style={{ color: 'rgba(255,255,255,.35)', fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,.2)', fontSize: 11 }}>
            <Lock size={10} />
            v2.0 · AI drafts require physician review
          </div>
        </div>

        {/* ════════════════ RIGHT ════════════════ */}
        <div className="login-right">
          <div className="login-card">

            {/* Heading */}
            <div style={{ marginBottom: 36 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#0e7490', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 10 }}>
                Secure access
              </p>
              <h2 style={{ fontSize: 30, fontWeight: 900, color: '#0f172a', letterSpacing: '-.03em', lineHeight: 1.1, marginBottom: 10 }}>
                Sign in to your<br />workspace
              </h2>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
                Enter your credentials to access patient records and clinical tools.
              </p>
            </div>

            <form onSubmit={handleLogin} noValidate>

              {/* Email */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 7 }}>
                  Email address
                </label>
                <input
                  className="login-input"
                  type="text" inputMode="email" autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="doctor@hospital.com" autoFocus
                />
              </div>

              {/* Password */}
              <div style={{ marginBottom: 26 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 7 }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="login-input"
                    type={showPw ? 'text' : 'password'} autoComplete="current-password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    style={{ paddingRight: 46 }}
                  />
                  <button
                    type="button" tabIndex={-1}
                    onClick={() => setShowPw(v => !v)}
                    style={{
                      position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      color: '#94a3b8', display: 'flex', alignItems: 'center', borderRadius: 6,
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
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  background: '#fff1f2', border: '1px solid #fecdd3',
                  borderRadius: 12, padding: '12px 14px', marginBottom: 20,
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', background: '#fda4af',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
                  }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M5 2.5V5m0 2h.01" stroke="#be123c" strokeWidth="1.6" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <span style={{ fontSize: 13, color: '#be123c', lineHeight: 1.5 }}>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                className="login-btn"
                type="submit"
                disabled={!canSubmit}
                style={{
                  background: 'linear-gradient(135deg, #0e7490 0%, #0c6580 100%)',
                  color: '#fff',
                  boxShadow: '0 4px 16px rgba(14,116,144,.3)',
                }}
              >
                {loading
                  ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Signing in…</>
                  : <>Sign In <ArrowRight size={15} /></>}
              </button>
            </form>

            {/* Trust strip */}
            <div style={{
              marginTop: 32, paddingTop: 24, borderTop: '1px solid #e2e8f0',
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
            }}>
              {[
                { icon: Lock,        label: 'Encrypted'      },
                { icon: ShieldCheck, label: 'HIPAA ready'    },
                { icon: CheckCircle2,label: 'SOC 2 aligned'  },
              ].map(({ icon: Icon, label }) => (
                <div key={label} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '12px 8px', borderRadius: 10,
                  border: '1px solid #e2e8f0', background: '#fff',
                }}>
                  <Icon size={15} color="#0e7490" />
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b' }}>{label}</span>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
