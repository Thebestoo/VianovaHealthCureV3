import React, { useEffect, useState } from 'react'
import { RefreshCw, Download, AlertCircle, CheckCircle, Mail, MailX, ShieldAlert } from 'lucide-react'
import { useKey } from '../../context/KeyContext.jsx'

export default function ErrorsPanel({ apiKey, isSuperAdmin }) {
  const { role } = useKey()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  function load() {
    setLoading(true)
    fetch('/api/logs/errors', { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(load, [])

  function downloadReport(id) {
    const url = `/api/logs/errors/${id}/report?key=${encodeURIComponent(apiKey)}`
    const a = document.createElement('a')
    a.href = url; a.download = `error-${id}-report.txt`; a.click()
  }

  if (loading) return <Loader />
  if (!data)   return <Err />

  const typeLabel = {
    analyze_failed: 'Case Analysis Failed',
    email_failed:   'Email Delivery Failed',
  }
  const typeIcon = {
    analyze_failed: <ShieldAlert size={15} color="#dc2626" />,
    email_failed:   <MailX size={15} color="#dc2626" />,
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>
            {isSuperAdmin ? 'System Error Log' : 'Case & Email Errors'}
          </h2>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 3 }}>
            {isSuperAdmin
              ? `${data.total} total system errors`
              : `${data.total} case-related ${data.total === 1 ? 'error' : 'errors'} — a report was emailed to admins`}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={13} /> Refresh</button>
      </div>

      {!isSuperAdmin && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, fontSize: 13, color: '#1e40af' }}>
          <AlertCircle size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'text-bottom' }} />
          This shows failures that happened while submitting or processing your cases. Each error is automatically reported to the admin team.
        </div>
      )}

      {data.total === 0 ? (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle size={26} color="#059669" />
            </div>
            <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>No errors on record</div>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 6 }}>Everything is working normally.</div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Error Details</span>
            <span className="badge badge-danger">{data.total} {data.total === 1 ? 'error' : 'errors'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {data.items.map((item, i) => {
              const isExp = expanded === item.id
              const m = item.metadata
              const label = typeLabel[item.type] || item.type

              return (
                <div
                  key={item.id}
                  style={{
                    borderBottom: i < data.items.length - 1 ? '1px solid #f1f5f9' : 'none',
                    padding: '16px 20px',
                    background: isExp ? '#fef2f2' : '#fff',
                    cursor: 'pointer',
                    transition: 'background .15s',
                  }}
                  onClick={() => setExpanded(isExp ? null : item.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      {typeIcon[item.type] || <AlertCircle size={15} color="#dc2626" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>{label}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)' }}>{fmt(item.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: '#374151', marginTop: 3, fontFamily: 'monospace', wordBreak: 'break-all' }}>{item.message}</div>

                      {isExp && (
                        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {m?.to      && <Detail label="Recipient" value={m.to} />}
                          {m?.subject && <Detail label="Subject"   value={m.subject} />}
                          {item.route && <Detail label="Route" value={item.route} mono />}
                          {isSuperAdmin && (
                            <button
                              className="btn btn-secondary btn-sm"
                              style={{ alignSelf: 'flex-start', marginTop: 4 }}
                              onClick={e => { e.stopPropagation(); downloadReport(item.id) }}
                            >
                              <Download size={12} /> Download Report
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value, mono }) {
  return (
    <div style={{ padding: '6px 10px', background: '#fef2f2', borderRadius: 7, fontSize: 12 }}>
      <span style={{ color: '#9ca3af', fontWeight: 600, marginRight: 6 }}>{label}</span>
      <span style={{ fontFamily: mono ? 'monospace' : 'inherit', color: '#0f172a' }}>{value}</span>
    </div>
  )
}

function fmt(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
}
function Loader() { return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner spinner-dark" style={{ margin: '0 auto' }} /></div> }
function Err()    { return <div style={{ color: 'var(--danger)', padding: 20 }}>Failed to load errors.</div> }
