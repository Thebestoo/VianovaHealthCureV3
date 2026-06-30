import React, { createContext, useContext, useState, useCallback } from 'react'
import toast from 'react-hot-toast'

const KeyContext = createContext(null)

const LS_KEY    = 'vnh_api_key'
const LS_ROLE   = 'vnh_api_role'
const LS_LABEL  = 'vnh_api_label'
const LS_EMAIL  = 'vnh_user_email'
const LS_AVATAR = 'vnh_user_avatar'

export function KeyProvider({ children }) {
  const [key,    setKeyState]    = useState(() => localStorage.getItem(LS_KEY)    || '')
  const [role,   setRoleState]   = useState(() => localStorage.getItem(LS_ROLE)   || '')
  const [label,  setLabelState]  = useState(() => localStorage.getItem(LS_LABEL)  || '')
  const [email,  setEmailState]  = useState(() => localStorage.getItem(LS_EMAIL)  || '')
  const [avatar, setAvatarState] = useState(() => localStorage.getItem(LS_AVATAR) || '')
  const [stats,  setStats]       = useState(null)

  const setAvatar = useCallback((dataUrl) => {
    if (dataUrl) localStorage.setItem(LS_AVATAR, dataUrl)
    else localStorage.removeItem(LS_AVATAR)
    setAvatarState(dataUrl || '')
  }, [])

  // connect(apiKey) — backward compat: validates a session token via /api/auth/verify
  const connect = useCallback(async (apiKey) => {
    const res  = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: apiKey }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Invalid key')

    localStorage.setItem(LS_KEY,   apiKey)
    localStorage.setItem(LS_ROLE,  data.role)
    localStorage.setItem(LS_LABEL, data.label)
    localStorage.setItem(LS_EMAIL, data.email || '')
    setKeyState(apiKey)
    setRoleState(data.role)
    setLabelState(data.label)
    setEmailState(data.email || '')
    setStats(data.stats || null)

    toast.success(
      `Connected as ${data.label}`,
      {
        duration: 4000,
        style: {
          background: data.role === 'superadmin' ? '#0e7490' : '#059669',
          color: '#fff',
          fontWeight: 600,
          fontSize: 13,
          borderRadius: 10,
          padding: '10px 16px',
        },
        iconTheme: { primary: '#fff', secondary: data.role === 'superadmin' ? '#0e7490' : '#059669' },
      }
    )

    return data
  }, [])

  // loginWithOTP — called by Login page after successful OTP verification
  const loginWithOTP = useCallback((token, role, labelStr, userEmail) => {
    localStorage.setItem(LS_KEY,   token)
    localStorage.setItem(LS_ROLE,  role)
    localStorage.setItem(LS_LABEL, labelStr)
    localStorage.setItem(LS_EMAIL, userEmail || '')
    setKeyState(token)
    setRoleState(role)
    setLabelState(labelStr)
    setEmailState(userEmail || '')
    setStats(null)

    toast.success(
      `Welcome, ${labelStr}`,
      {
        duration: 4000,
        style: {
          background: role === 'superadmin' ? '#0e7490' : '#059669',
          color: '#fff',
          fontWeight: 600,
          fontSize: 13,
          borderRadius: 10,
          padding: '10px 16px',
        },
        iconTheme: { primary: '#fff', secondary: role === 'superadmin' ? '#0e7490' : '#059669' },
      }
    )
  }, [])

  const disconnect = useCallback(() => {
    // Revoke the session server-side before clearing localStorage
    const token = localStorage.getItem(LS_KEY)
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'x-api-key': token },
      }).catch(() => {})
    }
    localStorage.removeItem(LS_KEY)
    localStorage.removeItem(LS_ROLE)
    localStorage.removeItem(LS_LABEL)
    localStorage.removeItem(LS_EMAIL)
    setKeyState(''); setRoleState(''); setLabelState(''); setEmailState(''); setAvatarState(''); setStats(null)
    toast('Signed out', { icon: '🔒', style: { fontSize: 13 } })
  }, [])

  const refreshStats = useCallback(async (apiKey) => {
    const k = apiKey || key
    if (!k) return
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: k }),
      })
      if (res.status === 401 || res.status === 403) {
        // stale key — clear it so user is redirected to login
        localStorage.removeItem(LS_KEY); localStorage.removeItem(LS_ROLE)
        localStorage.removeItem(LS_LABEL); localStorage.removeItem(LS_EMAIL)
        setKeyState(''); setRoleState(''); setLabelState(''); setEmailState(''); setStats(null)
        return
      }
      const data = await res.json()
      if (res.ok) setStats(data.stats || null)
    } catch {}
  }, [key])

  return (
    <KeyContext.Provider value={{ key, role, label, email, avatar, stats, connect, loginWithOTP, disconnect, refreshStats, setAvatar }}>
      {children}
    </KeyContext.Provider>
  )
}

export function useKey() {
  const ctx = useContext(KeyContext)
  if (!ctx) throw new Error('useKey must be used inside KeyProvider')
  return ctx
}
