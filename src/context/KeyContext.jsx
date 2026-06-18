import React, { createContext, useContext, useState, useCallback } from 'react'
import toast from 'react-hot-toast'

const KeyContext = createContext(null)

const LS_KEY   = 'vnh_api_key'
const LS_ROLE  = 'vnh_api_role'
const LS_LABEL = 'vnh_api_label'

export function KeyProvider({ children }) {
  const [key,   setKeyState]   = useState(() => localStorage.getItem(LS_KEY)   || '')
  const [role,  setRoleState]  = useState(() => localStorage.getItem(LS_ROLE)  || '')
  const [label, setLabelState] = useState(() => localStorage.getItem(LS_LABEL) || '')
  const [stats, setStats]      = useState(null)

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
    setKeyState(apiKey)
    setRoleState(data.role)
    setLabelState(data.label)
    setStats(data.stats || null)

    toast.success(
      `Connected as ${data.label}`,
      {
        duration: 4000,
        style: {
          background: data.role === 'dev' ? '#0e7490' : '#059669',
          color: '#fff',
          fontWeight: 600,
          fontSize: 13,
          borderRadius: 10,
          padding: '10px 16px',
        },
        iconTheme: { primary: '#fff', secondary: data.role === 'dev' ? '#0e7490' : '#059669' },
      }
    )

    return data
  }, [])

  const disconnect = useCallback(() => {
    localStorage.removeItem(LS_KEY)
    localStorage.removeItem(LS_ROLE)
    localStorage.removeItem(LS_LABEL)
    setKeyState(''); setRoleState(''); setLabelState(''); setStats(null)
    toast('Disconnected', { icon: '🔒', style: { fontSize: 13 } })
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
      const data = await res.json()
      if (res.ok) setStats(data.stats || null)
    } catch {}
  }, [key])

  return (
    <KeyContext.Provider value={{ key, role, label, stats, connect, disconnect, refreshStats }}>
      {children}
    </KeyContext.Provider>
  )
}

export function useKey() {
  const ctx = useContext(KeyContext)
  if (!ctx) throw new Error('useKey must be used inside KeyProvider')
  return ctx
}
