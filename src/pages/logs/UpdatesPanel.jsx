import React, { useEffect, useState } from 'react'
import {
  RefreshCw, FolderPlus, CheckCircle, ClipboardCheck, KeyRound,
  Server, FileEdit, StickyNote, Mail, ShieldAlert
} from 'lucide-react'
import { TypeBarChart, TimelineChart } from '../../components/MiniChart.jsx'

const TYPE_META = {
  case_submitted:   { label: 'Case Submitted',      icon: <FolderPlus size={11} />,     color: '#0284c7', bg: '#e0f2fe' },
  case_approved:    { label: 'Case Approved',        icon: <CheckCircle size={11} />,    color: '#059669', bg: '#d1fae5' },
  case_reviewed:    { label: 'Case Reviewed',        icon: <ClipboardCheck size={11} />, color: '#d97706', bg: '#fef3c7' },
  treatment_edited: { label: 'Treatment Edited',     icon: <FileEdit size={11} />,       color: '#7c3aed', bg: '#ede9fe' },
  notes_updated:    { label: 'Notes Updated',        icon: <StickyNote size={11} />,     color: '#0891b2', bg: '#cffafe' },
  email_sent:       { label: 'Email Sent',           icon: <Mail size={11} />,           color: '#64748b', bg: '#f1f5f9' },
  auth_login:       { label: 'Connected',            icon: <KeyRound size={11} />,       color: '#0e7490', bg: '#e0f2fe' },
  server_start:     { label: 'Server Start',         icon: <Server size={11} />,         color: '#475569', bg: '#f8fafc' },
  // legacy
  case_created:     { label: 'Case Created',         icon: <FolderPlus size={11} />,     color: '#0284c7', bg: '#e0f2fe' },
}

function groupByDay(items) {
  const map = {}
  items.forEach(item => {
    const date = item.created_at?.slice(0, 10)
    if (!date) return
    map[date] = (map[date] || 0) + 1
  })
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }))
}

export default function UpdatesPanel({ apiKey }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  function load() {
    setLoading(true)
    fetch('/api/logs/updates', { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(load, [])

  if (loading) return <Loader />
  if (!data)   return <Err />

  const typeData     = Object.entries(data.by_type).map(([name, count]) => ({ name: TYPE_META[name]?.label || name, count }))
  const timelineData = groupByDay(data.items)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>Activity Log</h2>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 3 }}>{data.total} events recorded</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={13} /> Refresh</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Activity by Type</span></div>
          <div className="card-body">
            {typeData.length > 0
              ? <TypeBarChart data={typeData} color="#0e7490" />
              : <Empty text="No activity yet" />
            }
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Activity Timeline</span></div>
          <div className="card-body">
            {timelineData.length > 0
              ? <TimelineChart data={timelineData} color="#0284c7" />
              : <Empty text="No timeline data" />
            }
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Recent Activity</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {data.items.slice(0, 60).map((item, i) => {
            const meta  = TYPE_META[item.type] || { label: item.type, icon: null, color: '#64748b', bg: '#f8fafc' }
            const isExp = expanded === item.id
            const m     = item.metadata

            return (
              <div
                key={item.id}
                style={{
                  borderBottom: i < data.items.length - 1 ? '1px solid #f1f5f9' : 'none',
                  padding: '14px 20px',
                  cursor: m ? 'pointer' : 'default',
                  background: isExp ? '#fafbfc' : '#fff',
                  transition: 'background .15s',
                }}
                onClick={() => m && setExpanded(isExp ? null : item.id)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* icon chip */}
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 1,
                    background: meta.bg, color: meta.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {meta.icon}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: meta.color }}>{meta.label}</span>
                      {m?.emergency && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600, color: '#dc2626', background: '#fee2e2', padding: '1px 7px', borderRadius: 99 }}>
                          <ShieldAlert size={10} /> Emergency
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmt(item.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2 }}>{item.description}</div>

                    {/* expanded metadata */}
                    {isExp && m && (
                      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {m.case_id     && <Chip label="Case ID" value={m.case_id.slice(0, 8)} mono />}
                        {m.age         && <Chip label="Age" value={`${m.age}y`} />}
                        {m.sex         && <Chip label="Sex" value={m.sex} />}
                        {m.confidence  && <Chip label="AI Confidence" value={m.confidence} />}
                        {m.reviewed_by && <Chip label="Reviewed By" value={m.reviewed_by} />}
                        {m.to          && <Chip label="Email To" value={m.to} />}
                        {m.subject     && <Chip label="Subject" value={m.subject} />}
                        {m.treatment   && <Chip label="Treatment" value={m.treatment} fullWidth />}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {data.items.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No activity recorded yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function Chip({ label, value, mono, fullWidth }) {
  return (
    <div style={{
      padding: '4px 10px', background: '#f1f5f9', borderRadius: 7,
      fontSize: 11.5, color: '#0f172a',
      ...(fullWidth ? { width: '100%' } : {}),
    }}>
      <span style={{ color: '#94a3b8', fontWeight: 600, marginRight: 5 }}>{label}</span>
      <span style={{ fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  )
}

function fmt(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
}
function Loader() { return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner spinner-dark" style={{ margin: '0 auto' }} /></div> }
function Err()    { return <div style={{ color: 'var(--danger)', padding: 20 }}>Failed to load activity.</div> }
function Empty({ text }) { return <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)', fontSize: 13 }}>{text}</div> }
