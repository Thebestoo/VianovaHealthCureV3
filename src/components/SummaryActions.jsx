import React, { useState } from 'react'
import { Copy, Check, Download, Mail, Loader2 } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

// Drop-in toolbar for any AI-generated or computed "summary" block across the
// app (audit findings, discharge summary, billing scrub results, clinical
// decision summary, lab summary, SDOH summary, case summary, etc). Gives every
// summary the same three ways out of the screen: copy, download as a file,
// or email it — instead of each page reinventing (or skipping) this.
export default function SummaryActions({ title, text, filename, compact = false, dark = false }) {
  const { key } = useKey()
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(null)
  const [error, setError] = useState(null)

  const body = typeof text === 'string' ? text : String(text ?? '')
  const disabled = !body.trim()

  function handleCopy() {
    if (disabled) return
    navigator.clipboard.writeText(body).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleDownload() {
    if (disabled) return
    const blob = new Blob([body], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || `${(title || 'summary').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleEmail() {
    if (disabled || sending) return
    setSending(true); setSent(null); setError(null)
    try {
      const r = await fetch('/api/summary/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify({ title, text: body })
      })
      const d = await r.json()
      if (r.ok) { setSent(d.sentTo) } else { setError(d.error || 'Failed to send') }
    } catch (e) { setError('Failed to send') }
    setSending(false)
  }

  const btnSize = compact ? 11.5 : 12.5
  const iconSize = compact ? 12 : 13
  const pad = compact ? '4px 9px' : '5px 11px'
  const btnBase = dark
    ? { border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.85)' }
    : { border: '1px solid #d1d5db', background: '#fff', color: '#374151' }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button
        onClick={handleCopy}
        disabled={disabled}
        title="Copy summary text"
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: pad, borderRadius: 7, cursor: disabled ? 'default' : 'pointer', fontSize: btnSize, opacity: disabled ? .5 : 1, ...btnBase }}
      >
        {copied ? <><Check size={iconSize} color={dark ? '#4ade80' : '#059669'} /> Copied</> : <><Copy size={iconSize} /> Copy</>}
      </button>
      <button
        onClick={handleDownload}
        disabled={disabled}
        title="Download as a text file"
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: pad, borderRadius: 7, cursor: disabled ? 'default' : 'pointer', fontSize: btnSize, opacity: disabled ? .5 : 1, ...btnBase }}
      >
        <Download size={iconSize} /> Download
      </button>
      <button
        onClick={handleEmail}
        disabled={disabled || sending}
        title="Email this summary to yourself"
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: pad, borderRadius: 7, cursor: (disabled || sending) ? 'default' : 'pointer', fontSize: btnSize, opacity: disabled ? .5 : 1, ...btnBase, ...(sent ? { background: dark ? 'rgba(74,222,128,.15)' : '#f0fdf4', color: dark ? '#4ade80' : '#059669' } : {}) }}
      >
        {sending
          ? <Loader2 size={iconSize} style={{ animation: 'spin 1s linear infinite' }} />
          : sent ? <><Check size={iconSize} /> Sent</> : <><Mail size={iconSize} /> Email</>}
      </button>
      {error && <span style={{ fontSize: 11.5, color: dark ? '#fca5a5' : '#dc2626' }}>{error}</span>}
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
