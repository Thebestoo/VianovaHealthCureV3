import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, RefreshCw, ArrowRight, ShieldAlert, CheckCircle, Clock, Heart, Activity, Thermometer, Wind, Droplets, Scale, Ruler, FileJson, ChevronDown, ChevronRight } from 'lucide-react'
import { StatusPieChart, TypeBarChart, TimelineChart } from '../../components/MiniChart.jsx'

const VITAL_ICONS = {
  'Heart rate':        <Heart size={12} />,
  'Blood pressure':    <Activity size={12} />,
  'Oxygen saturation': <Droplets size={12} />,
  'Body temperature':  <Thermometer size={12} />,
  'Body weight':       <Scale size={12} />,
  'Body height':       <Ruler size={12} />,
  'Respiratory rate':  <Wind size={12} />,
}
const VITAL_COLOR = {
  'Heart rate':        '#e11d48',
  'Blood pressure':    '#d97706',
  'Oxygen saturation': '#059669',
  'Body temperature':  '#ea580c',
  'Body weight':       '#2563eb',
  'Body height':       '#7c3aed',
  'Respiratory rate':  '#16a34a',
}

function groupByDay(items) {
  const map = {}
  items.forEach(c => {
    const date = c.created_at?.slice(0, 10)
    if (!date) return
    map[date] = (map[date] || 0) + 1
  })
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }))
}

function categorizeCases(cases) {
  // guess category from presenting complaint
  const cats = {}
  cases.forEach(c => {
    const complaint = (c.presenting_complaint || '').toLowerCase()
    let cat = 'General'
    if (/chest|heart|cardiac|palpitat/.test(complaint))   cat = 'Cardiology'
    else if (/breath|wheez|asthma|lung|cough/.test(complaint)) cat = 'Respiratory'
    else if (/head|migraine/.test(complaint))              cat = 'Neurology'
    else if (/abdomen|stomach|nausea|vomit|bowel/.test(complaint)) cat = 'Gastroenterology'
    else if (/skin|rash|itch/.test(complaint))             cat = 'Dermatology'
    else if (/fever|infect|virus|bacteria/.test(complaint)) cat = 'Infectious'
    else if (/back|joint|muscle|pain/.test(complaint))     cat = 'Musculoskeletal'
    cats[cat] = (cats[cat] || 0) + 1
  })
  return Object.entries(cats).map(([name, count]) => ({ name, count }))
}

export default function CasesPanel({ apiKey }) {
  const navigate = useNavigate()
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [expandedVitals, setExpandedVitals] = useState(null)

  function load() {
    setLoading(true)
    fetch('/api/logs/cases', { headers: { 'x-api-key': apiKey } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(load, [])

  function downloadReport() {
    const ts  = new Date().toISOString().slice(0, 10)
    const url = `/api/logs/cases/report?key=${encodeURIComponent(apiKey)}`
    const a   = document.createElement('a')
    a.href = url; a.download = `vianova-cases-${ts}.html`; a.click()
  }

  if (loading) return <Loader />
  if (!data)   return <Err />

  const statusData = [
    { name: 'Pending Review',       value: data.by_status.PENDING_REVIEW || 0 },
    { name: 'Approved',             value: data.by_status.APPROVED || 0 },
    { name: 'Reviewed / Not Approved', value: data.by_status.REVIEWED_NOT_APPROVED || 0 },
  ].filter(d => d.value > 0)

  const confData = [
    { name: 'High',     count: data.by_confidence.high     || 0 },
    { name: 'Moderate', count: data.by_confidence.moderate || 0 },
    { name: 'Low',      count: data.by_confidence.low      || 0 },
  ]

  const timelineData = groupByDay(data.cases)
  const catData = categorizeCases(data.cases)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>Cases Analytics</h2>
          <p style={{ color: 'var(--text2)', fontSize: 13, marginTop: 3 }}>{data.total} total cases in database</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={13} /> Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={downloadReport}><Download size={13} /> Export Report</button>
        </div>
      </div>

      {/* top stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Cases',   val: data.total,                              color: 'var(--primary)' },
          { label: 'Approved',      val: data.by_status.APPROVED || 0,            color: 'var(--success)' },
          { label: 'Pending',       val: data.by_status.PENDING_REVIEW || 0,      color: 'var(--warning)' },
          { label: 'Emergency',     val: data.cases.filter(c => c.emergency_detected).length, color: 'var(--danger)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Case Status Distribution</span></div>
          <div className="card-body">
            {statusData.length > 0
              ? <StatusPieChart data={statusData} />
              : <Empty text="No status data yet" />
            }
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Confidence Levels</span></div>
          <div className="card-body"><TypeBarChart data={confData} color="#0e7490" /></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Cases Over Time</span></div>
          <div className="card-body">
            {timelineData.length > 0
              ? <TimelineChart data={timelineData} color="#0e7490" />
              : <Empty text="No timeline data yet" />
            }
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Case Categories</span></div>
          <div className="card-body">
            {catData.length > 0
              ? <TypeBarChart data={catData} color="#7c3aed" />
              : <Empty text="No categories yet" />
            }
          </div>
        </div>
      </div>

      {/* case table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">All Cases</span>
          <button className="btn btn-secondary btn-sm" onClick={downloadReport}><Download size={12} /> Export Report</button>
        </div>
        <div className="table-wrap">
          {data.cases.length === 0 ? (
            <div className="empty-state"><p>No cases yet.</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Patient</th>
                  <th>Category / Complaint</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>Reviewed By</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.cases.map(c => {
                  const cat = categorizeCases([c])[0]?.name || 'General'
                  const hasVitals = c.vitals && c.vitals.length > 0
                  const isExpV = expandedVitals === c.case_id
                  return (
                    <React.Fragment key={c.case_id}>
                      <tr>
                        <td className="font-mono" style={{ fontSize: 11, color: 'var(--text3)' }}>{c.case_id.slice(0, 8)}</td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{c.age ? `${c.age}y` : '—'} {c.sex || ''}</div>
                          {c.patient_name && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.patient_name}</div>}
                        </td>
                        <td>
                          <div><span style={{ fontSize: 11, padding: '2px 6px', background: '#ede9fe', color: '#7c3aed', borderRadius: 4, fontWeight: 600 }}>{cat}</span></div>
                          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.presenting_complaint || '—'}
                          </div>
                        </td>
                        <td><ConfBadge val={c.confidence_level} /></td>
                        <td><StatusBadge c={c} /></td>
                        <td style={{ fontSize: 12, color: 'var(--text2)' }}>{c.reviewed_by || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{c.created_at?.slice(0, 10)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {hasVitals && (
                              <button
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '3px 8px', gap: 4 }}
                                onClick={() => setExpandedVitals(isExpV ? null : c.case_id)}
                                title="View FHIR vitals"
                              >
                                <FileJson size={12} />
                                {isExpV ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              </button>
                            )}
                            <button className="table-action" onClick={() => navigate(`/cases/${c.case_id}`)}>
                              Open <ArrowRight size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpV && hasVitals && (
                        <tr>
                          <td colSpan={8} style={{ padding: '0 16px 16px', background: '#f8fafc' }}>
                            <div style={{ padding: '12px 0 4px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <FileJson size={12} /> FHIR Vitals{c.mrn && ` — MRN: ${c.mrn}`}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {c.vitals.map((v, i) => {
                                const color = VITAL_COLOR[v.name] || '#64748b'
                                const icon  = VITAL_ICONS[v.name] || <Activity size={12} />
                                return (
                                  <div key={i} style={{
                                    padding: '8px 12px', background: '#fff',
                                    border: `1.5px solid ${color}30`,
                                    borderLeft: `3px solid ${color}`,
                                    borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8,
                                    minWidth: 120,
                                  }}>
                                    <span style={{ color }}>{icon}</span>
                                    <div>
                                      <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600 }}>{v.name}</div>
                                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>{v.value} <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>{v.unit}</span></div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function ConfBadge({ val }) {
  const map = { high: 'badge-success', moderate: 'badge-warning', low: 'badge-danger' }
  return <span className={`badge ${map[val] || 'badge-neutral'}`}>{val || '—'}</span>
}
function StatusBadge({ c }) {
  if (c.emergency_detected) return <span className="badge badge-danger" style={{ display:'inline-flex',alignItems:'center',gap:4 }}><ShieldAlert size={11} /> Emergency</span>
  if (c.approved) return <span className="badge badge-success" style={{ display:'inline-flex',alignItems:'center',gap:4 }}><CheckCircle size={11} /> Approved</span>
  if (c.review_status === 'REVIEWED_NOT_APPROVED') return <span className="badge badge-neutral">Reviewed</span>
  return <span className="badge badge-warning" style={{ display:'inline-flex',alignItems:'center',gap:4 }}><Clock size={11} /> Pending</span>
}
function Loader() { return <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner spinner-dark" style={{ margin: '0 auto' }} /></div> }
function Err()    { return <div style={{ color: 'var(--danger)', padding: 20 }}>Failed to load cases.</div> }
function Empty({ text }) { return <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text3)', fontSize: 13 }}>{text}</div> }
