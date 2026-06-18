import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HeartPulse, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

export default function Login() {
  const { key, loginWithOTP } = useKey()
  const navigate = useNavigate()

  const [step, setStep]     = useState(1)
  const [email, setEmail]   = useState('')
  const [code, setCode]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (key) navigate('/dashboard', { replace: true })
  }, [key, navigate])

  async function handleRequestOtp(e) {
    e.preventDefault()
    setError('')
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send code')
      setStep(2)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Invalid code')
      loginWithOTP(data.token, data.role, data.label, data.email)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f766e 0%, #0369a1 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: '40px 36px',
        width: '100%',
        maxWidth: 420,
        boxShadow: '0 20px 60px rgba(0,0,0,.25)',
      }}>
        {/* Branding */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'linear-gradient(135deg, #0f766e, #0369a1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
          }}>
            <HeartPulse size={28} color="#fff" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>
            Vianova Health
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            Cure Analyzer System
          </div>
        </div>

        {/* Step 1: Email */}
        {step === 1 && (
          <form onSubmit={handleRequestOtp} noValidate>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 6 }}>
                Sign in
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                Enter your email to receive a one-time login code.
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                Email address
              </label>
              <input
                type="text"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                style={{
                  width: '100%', padding: '10px 12px',
                  border: '1.5px solid #d1d5db', borderRadius: 8,
                  fontSize: 14, color: '#111827', outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color .15s',
                }}
                onFocus={e => e.target.style.borderColor = '#0f766e'}
                onBlur={e => e.target.style.borderColor = '#d1d5db'}
              />
            </div>

            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '10px 12px', fontSize: 13, color: '#dc2626', marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              style={{
                width: '100%', padding: '11px 16px',
                background: loading || !email.trim() ? '#9ca3af' : 'linear-gradient(135deg, #0f766e, #0369a1)',
                color: '#fff', border: 'none', borderRadius: 8,
                fontSize: 14, fontWeight: 600, cursor: loading || !email.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'opacity .15s',
              }}
            >
              {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              {loading ? 'Sending…' : 'Send Code'}
              {!loading && <ArrowRight size={15} />}
            </button>
          </form>
        )}

        {/* Step 2: OTP code */}
        {step === 2 && (
          <form onSubmit={handleVerifyOtp} noValidate>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 6 }}>
                Enter your code
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                We sent a 6-digit code to <strong style={{ color: '#374151' }}>{email}</strong>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                Verification code
              </label>
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                required
                autoFocus
                inputMode="numeric"
                maxLength={6}
                style={{
                  width: '100%', padding: '12px 14px',
                  border: '1.5px solid #d1d5db', borderRadius: 8,
                  fontSize: 22, fontWeight: 700, letterSpacing: 8,
                  color: '#111827', outline: 'none', textAlign: 'center',
                  boxSizing: 'border-box', transition: 'border-color .15s',
                }}
                onFocus={e => e.target.style.borderColor = '#0f766e'}
                onBlur={e => e.target.style.borderColor = '#d1d5db'}
              />
            </div>

            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                padding: '10px 12px', fontSize: 13, color: '#dc2626', marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              style={{
                width: '100%', padding: '11px 16px',
                background: loading || code.length !== 6 ? '#9ca3af' : 'linear-gradient(135deg, #0f766e, #0369a1)',
                color: '#fff', border: 'none', borderRadius: 8,
                fontSize: 14, fontWeight: 600, cursor: loading || code.length !== 6 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              {loading ? 'Verifying…' : 'Verify & Sign In'}
            </button>

            <button
              type="button"
              onClick={() => { setStep(1); setCode(''); setError('') }}
              style={{
                width: '100%', marginTop: 10, padding: '9px 16px',
                background: 'none', border: '1.5px solid #e5e7eb', borderRadius: 8,
                fontSize: 13, color: '#6b7280', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <ArrowLeft size={14} />
              Back
            </button>
          </form>
        )}

        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}
