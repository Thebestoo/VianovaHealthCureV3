import React, { useState } from 'react'
import { Lock, ShieldCheck } from 'lucide-react'

const BETA_PASSCODE = '1906'

// Simple passcode wall for features still in beta review (CCM / RPM automations).
// Unlock persists for the browser tab session so reviewers aren't re-prompted
// every time they navigate away and back.
function isUnlocked(featureKey) {
  return sessionStorage.getItem(`vnh_beta_unlocked_${featureKey}`) === '1'
}

export default function BetaGate({ featureKey, title, children }) {
  const [unlocked, setUnlocked] = useState(() => isUnlocked(featureKey))
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  function submit(e) {
    e.preventDefault()
    if (code.trim() === BETA_PASSCODE) {
      sessionStorage.setItem(`vnh_beta_unlocked_${featureKey}`, '1')
      setUnlocked(true)
      setError('')
    } else {
      setError('Incorrect passcode')
    }
  }

  if (unlocked) return children

  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onSubmit={submit} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '36px 32px', width: 380, maxWidth: '95vw', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,.06)' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Lock size={22} color="#8b5cf6" />
        </div>
        <div style={{ fontWeight: 700, fontSize: 17, color: '#111827', marginBottom: 6 }}>{title || 'Beta Feature'}</div>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px' }}>
          This feature is in beta test review. Enter the reviewer passcode to continue.
        </p>
        <input
          type="password"
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="Passcode"
          autoFocus
          style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 12px', fontSize: 14, textAlign: 'center', boxSizing: 'border-box', marginBottom: 12 }}
        />
        {error && <div style={{ color: '#dc2626', fontSize: 12.5, marginBottom: 12 }}>{error}</div>}
        <button type="submit" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 0', border: 'none', borderRadius: 8, background: '#8b5cf6', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
          <ShieldCheck size={15} /> Unlock
        </button>
      </form>
    </div>
  )
}
