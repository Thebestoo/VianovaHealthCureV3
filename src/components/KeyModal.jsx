import React, { useState } from 'react'
import { KeyRound, ShieldCheck, Loader2, X } from 'lucide-react'

export default function KeyModal({ onSuccess, onClose }) {
  const [key, setKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function verify(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Invalid key')
      sessionStorage.setItem('vnh_key', key.trim())
      sessionStorage.setItem('vnh_role', data.role)
      onSuccess(key.trim(), data.role)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,.2)', overflow: 'hidden' }}>
        <div style={{ background: 'var(--primary)', padding: '24px 28px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldCheck size={20} color="#fff" />
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Logs & Analytics Access</div>
            <div style={{ color: 'rgba(255,255,255,.65)', fontSize: 12, marginTop: 2 }}>Enter your team access key to continue</div>
          </div>
          {onClose && (
            <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'rgba(255,255,255,.6)', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          )}
        </div>

        <form onSubmit={verify} style={{ padding: 28 }}>
          <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Access Key</div>
          <div style={{ position: 'relative' }}>
            <KeyRound size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input
              className="form-input"
              style={{ paddingLeft: 36, fontFamily: 'monospace', fontSize: 13, letterSpacing: '.02em' }}
              placeholder="vnh_dev_... or vnh_doc_..."
              value={key}
              onChange={e => setKey(e.target.value)}
              autoFocus
            />
          </div>
          {error && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--danger-light)', color: 'var(--danger)', borderRadius: 7, fontSize: 12.5 }}>
              {error}
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text3)' }}>
            Dev Team: full access · Doctor Team: cases only
          </div>
          <button type="submit" className="btn btn-primary w-full mt-4" disabled={loading || !key.trim()}>
            {loading ? <><Loader2 size={14} style={{ animation: 'spin .6s linear infinite' }} /> Verifying…</> : 'Unlock Access'}
          </button>
        </form>
      </div>
    </div>
  )
}
