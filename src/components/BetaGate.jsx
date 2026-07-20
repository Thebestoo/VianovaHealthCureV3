import React, { useState } from 'react'
import { Lock, ShieldCheck, KeyRound } from 'lucide-react'

const BETA_PASSCODE = '1906'

// Simple passcode wall for features still in beta review (CCM / RPM automations).
// Unlock persists for the browser tab session so reviewers aren't re-prompted
// every time they navigate away and back.
function isUnlocked(featureKey) {
  return sessionStorage.getItem(`vnh_beta_unlocked_${featureKey}`) === '1'
}

export default function BetaGate({ featureKey, title, accent = '#8b5cf6', children }) {
  const [unlocked, setUnlocked] = useState(() => isUnlocked(featureKey))
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)

  function submit(e) {
    e.preventDefault()
    if (code.trim() === BETA_PASSCODE) {
      sessionStorage.setItem(`vnh_beta_unlocked_${featureKey}`, '1')
      setUnlocked(true)
      setError('')
    } else {
      setError('Incorrect passcode — try again')
      setShake(true)
      setTimeout(() => setShake(false), 420)
    }
  }

  if (unlocked) return children

  return (
    <div style={{
      minHeight: '78vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      background: `radial-gradient(circle at 30% 20%, ${accent}14, transparent 55%), radial-gradient(circle at 80% 80%, ${accent}0d, transparent 50%)`,
    }}>
      <form
        onSubmit={submit}
        style={{
          position: 'relative',
          background: 'rgba(255,255,255,.75)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          border: '1px solid rgba(255,255,255,.6)',
          borderRadius: 24,
          padding: '40px 36px',
          width: 400,
          maxWidth: '95vw',
          textAlign: 'center',
          boxShadow: `0 24px 70px -20px ${accent}33, 0 2px 8px rgba(0,0,0,.04)`,
          animation: shake ? 'betaShake .4s' : 'betaIn .5s cubic-bezier(.16,1,.3,1)',
        }}
      >
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: `linear-gradient(135deg, ${accent}, ${accent}99)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px', boxShadow: `0 10px 28px -8px ${accent}66`,
        }}>
          <Lock size={26} color="#fff" />
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `${accent}14`, color: accent, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: 99, marginBottom: 14 }}>
          Beta Test Review
        </div>
        <div style={{ fontWeight: 800, fontSize: 20, color: '#0f172a', marginBottom: 8, letterSpacing: '-.01em' }}>{title || 'Beta Feature'}</div>
        <p style={{ fontSize: 13.5, color: '#64748b', margin: '0 0 24px', lineHeight: 1.5 }}>
          This module is gated for reviewers. Enter the access code to continue.
        </p>
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <KeyRound size={15} color="#94a3b8" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="password"
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="Enter passcode"
            autoFocus
            style={{
              width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '13px 14px 13px 38px',
              fontSize: 15, letterSpacing: '.15em', textAlign: 'center', boxSizing: 'border-box',
              outline: 'none', transition: 'border-color .15s, box-shadow .15s', background: '#fff',
            }}
            onFocus={e => { e.target.style.borderColor = accent; e.target.style.boxShadow = `0 0 0 4px ${accent}1f` }}
            onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none' }}
          />
        </div>
        {error && <div style={{ color: '#dc2626', fontSize: 12.5, marginBottom: 14, fontWeight: 500 }}>{error}</div>}
        <button
          type="submit"
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '13px 0', border: 'none', borderRadius: 12,
            background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
            color: '#fff', fontWeight: 700, fontSize: 14.5, cursor: 'pointer',
            boxShadow: `0 8px 20px -6px ${accent}66`, transition: 'transform .15s, box-shadow .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 12px 26px -6px ${accent}80` }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = `0 8px 20px -6px ${accent}66` }}
        >
          <ShieldCheck size={16} /> Unlock Module
        </button>
      </form>
      <style>{`
        @keyframes betaIn { from { opacity:0; transform:translateY(14px) scale(.97) } to { opacity:1; transform:translateY(0) scale(1) } }
        @keyframes betaShake { 10%,90%{transform:translateX(-1px)} 20%,80%{transform:translateX(2px)} 30%,50%,70%{transform:translateX(-4px)} 40%,60%{transform:translateX(4px)} }
      `}</style>
    </div>
  )
}
