import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle, Clock, Users, PlusCircle, ArrowRight, ShieldAlert, KeyRound, CalendarClock, Heart, Activity, TrendingUp, BarChart3 } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import { calcNEWS2, flagVitals } from '../utils/news2.js'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'

const CATEGORY_KEYWORDS = {
  Cardiology: ['chest', 'heart', 'cardiac', 'palpitation', 'angina', 'hypertension'],
  Respiratory: ['cough', 'breath', 'pneumonia', 'asthma', 'copd', 'wheez', 'respiratory', 'lung'],
  Neurology: ['headache', 'migraine', 'seizure', 'stroke', 'dizz', 'vertigo', 'numb', 'tingl'],
  GI: ['abdomen', 'abdominal', 'stomach', 'nausea', 'vomit', 'diarrhea', 'reflux', 'gerd', 'bowel'],
  Infectious: ['fever', 'infection', 'sepsis', 'covid', 'flu', 'uti', 'cellulitis'],
  Musculoskeletal: ['back', 'joint', 'knee', 'shoulder', 'muscle', 'fracture', 'sprain', 'arthritis'],
  General: [],
}
const CATEGORY_COLORS = {
  Cardiology: '#dc2626',
  Respiratory: '#0284c7',
  Neurology: '#7c3aed',
  GI: '#ea580c',
  Infectious: '#059669',
  Musculoskeletal: '#d97706',
  General: '#64748b',
}

function categorize(complaint) {
  const c = String(complaint || '').toLowerCase()
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    if (kws.some(k => c.includes(k))) return cat
  }
  return 'General'
}

function startOfWeek(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  x.setDate(x.getDate() - day)
  return x
}

function buildWeeklySeries(cases) {
  const weeks = []
  const now = startOfWeek(new Date())
  for (let i = 7; i >= 0; i--) {
    const w = new Date(now)
    w.setDate(w.getDate() - i * 7)
    weeks.push({ start: w, label: w.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), count: 0 })
  }
  cases.forEach(c => {
    const w = startOfWeek(new Date(c.created_at))
    const slot = weeks.find(x => x.start.getTime() === w.getTime())
    if (slot) slot.count++
  })
  return weeks.map(w => ({ week: w.label, count: w.count }))
}

function buildConditionBreakdown(cases) {
  const counts = {}
  Object.keys(CATEGORY_KEYWORDS).forEach(k => { counts[k] = 0 })
  cases.forEach(c => { counts[categorize(c.presenting_complaint)]++ })
  return Object.entries(counts).map(([name, count]) => ({ name, count })).filter(x => x.count > 0)
}

function AnimatedNumber({ value }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const target = Number(value) || 0
    if (target === 0) { setDisplay(0); return }
    const duration = 600
    const start = performance.now()
    let raf
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(target * eased))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return display
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { key } = useKey()
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!key) { setLoading(false); return }
    fetch('/api/cases', { headers: { 'x-api-key': key } })
      .then(r => r.json())
      .then(data => { setCases(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [key])

  const stats = {
    total: cases.length,
    urgent: cases.filter(c => c.requires_urgent_review || c.emergency_detected).length,
    pending: cases.filter(c => !c.approved).length,
    approved: cases.filter(c => c.approved).length,
  }

  const today = new Date()
  const followUps = cases.filter(c => c.follow_up_date).map(c => ({
    ...c,
    daysUntil: Math.ceil((new Date(c.follow_up_date) - today) / 86400000),
  })).filter(c => c.daysUntil <= 7).sort((a, b) => a.daysUntil - b.daysUntil)

  const recent = cases.slice(0, 5)
  const weekly = buildWeeklySeries(cases)
  const breakdown = buildConditionBreakdown(cases)
  const hasChartData = cases.length > 0

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">Dashboard</span>
        <div className="topbar-right">
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/cases/new')}>
            <PlusCircle size={14} /> New Case
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="card stat-card">
          <div className="stat-icon" style={{ background: '#e0f2fe' }}>
            <Users size={18} color="#0e7490" />
          </div>
          <div className="stat-val"><AnimatedNumber value={stats.total} /></div>
          <div className="stat-label">Total Cases</div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon" style={{ background: '#fee2e2', position: 'relative' }}>
            <AlertTriangle size={18} color="#dc2626" />
            {stats.urgent > 0 && (
              <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: '50%', background: '#dc2626', animation: 'pulse 1.6s ease-in-out infinite' }} />
            )}
          </div>
          <div className="stat-val"><AnimatedNumber value={stats.urgent} /></div>
          <div className="stat-label">Urgent / Emergency</div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon" style={{ background: '#fef3c7' }}>
            <Clock size={18} color="#d97706" />
          </div>
          <div className="stat-val"><AnimatedNumber value={stats.pending} /></div>
          <div className="stat-label">Pending Review</div>
        </div>
        <div className="card stat-card">
          <div className="stat-icon" style={{ background: '#d1fae5' }}>
            <CheckCircle size={18} color="#059669" />
          </div>
          <div className="stat-val"><AnimatedNumber value={stats.approved} /></div>
          <div className="stat-label">Approved</div>
        </div>
      </div>

      <div style={{ padding: '0 32px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card hoverable animate-fade-up" style={{ animationDelay: '.1s' }}>
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={15} /> Cases Over Time
              </span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Last 8 weeks</span>
            </div>
            <div className="card-body" style={{ height: 240 }}>
              {!hasChartData ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: 13 }}>
                  No data yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weekly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCases" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0284c7" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#0284c7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Area type="monotone" dataKey="count" stroke="#0284c7" strokeWidth={2.5} fill="url(#colorCases)" isAnimationActive animationDuration={900} animationEasing="ease-out" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card hoverable animate-fade-up" style={{ animationDelay: '.16s' }}>
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <BarChart3 size={15} /> Condition Breakdown
              </span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>By complaint category</span>
            </div>
            <div className="card-body" style={{ height: 240 }}>
              {!hasChartData || breakdown.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: 13 }}>
                  No data yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={breakdown} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#64748b' }} width={100} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} cursor={{ fill: 'rgba(2,132,199,.06)' }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive animationDuration={800} animationEasing="ease-out">
                      {breakdown.map((entry, i) => (
                        <Cell key={i} fill={CATEGORY_COLORS[entry.name] || '#64748b'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 32px 24px' }}>
        {/* follow-up reminders */}
        {followUps.length > 0 && (
          <div className="animate-fade-up" style={{ animationDelay: '.22s', marginBottom: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
            <div style={{ padding: '13px 18px', borderBottom: '1px solid #f1f5f9', background: '#fafbfc', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalendarClock size={15} color="#0e7490" />
              <span style={{ fontWeight: 700, fontSize: 13 }}>Upcoming Follow-ups</span>
              <span className="badge badge-info" style={{ marginLeft: 4 }}>{followUps.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {followUps.map((c, i) => (
                <div key={c.case_id} className="followup-row" style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px',
                  borderBottom: i < followUps.length - 1 ? '1px solid #f1f5f9' : 'none',
                  cursor: 'pointer', transition: 'background .15s ease'
                }} onClick={() => navigate(`/cases/${c.case_id}`)}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: c.daysUntil < 0 ? '#fee2e2' : c.daysUntil === 0 ? '#fff7ed' : '#e0f2fe',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: c.daysUntil < 0 ? '#dc2626' : c.daysUntil === 0 ? '#d97706' : '#0284c7', lineHeight: 1 }}>
                      {c.daysUntil < 0 ? Math.abs(c.daysUntil) : c.daysUntil}
                    </span>
                    <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>
                      {c.daysUntil < 0 ? 'OVR' : c.daysUntil === 0 ? 'TODAY' : 'DAYS'}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                      {c.age ? `${c.age}y` : '—'} {c.sex || ''} — {c.presenting_complaint || 'Case ' + c.case_id.slice(0, 8)}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 1 }}>
                      Follow-up: {new Date(c.follow_up_date).toLocaleDateString()}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 99,
                    background: c.daysUntil < 0 ? '#fee2e2' : c.daysUntil === 0 ? '#fff7ed' : '#e0f2fe',
                    color: c.daysUntil < 0 ? '#dc2626' : c.daysUntil === 0 ? '#d97706' : '#0284c7'
                  }}>
                    {c.daysUntil < 0 ? 'Overdue' : c.daysUntil === 0 ? 'Today' : `In ${c.daysUntil}d`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '0 32px 24px' }}>
        <div className="card animate-fade-up" style={{ animationDelay: '.28s' }}>
          <div className="card-header">
            <span className="card-title">Recent Cases</span>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/cases')}>
              View All <ArrowRight size={13} />
            </button>
          </div>
          <div className="table-wrap">
            {loading ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <div className="spinner spinner-dark" style={{ margin: '0 auto' }} />
              </div>
            ) : !key ? (
              <div className="empty-state">
                <KeyRound />
                <p>Connect an API key via Logs &amp; Analytics to view your cases.</p>
                <button className="btn btn-secondary mt-4" onClick={() => navigate('/logs')}>
                  Go to Logs
                </button>
              </div>
            ) : recent.length === 0 ? (
              <div className="empty-state">
                <Users />
                <p>No cases yet. Start by submitting a new patient case.</p>
                <button className="btn btn-primary mt-4" onClick={() => navigate('/cases/new')}>
                  <PlusCircle size={14} /> New Case
                </button>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Presenting Complaint</th>
                    <th>Risk</th>
                    <th>Confidence</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(c => {
                    const news2 = calcNEWS2(c.vitals || [])
                    const vflags = flagVitals(c.vitals || [])
                    const hasCritical = vflags.some(f => f.severity === 'critical')
                    return (
                    <tr key={c.case_id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>
                          {c.age ? `${c.age}y` : '—'} {c.sex || ''}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{c.case_id.slice(0, 8)}</div>
                      </td>
                      <td style={{ maxWidth: 240 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.presenting_complaint || '—'}
                        </div>
                      </td>
                      <td>
                        {news2 ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 99, fontSize: 11.5, fontWeight: 700, background: news2.bg, color: news2.color }}>
                            <Activity size={11} /> NEWS2 {news2.total}
                          </span>
                        ) : hasCritical ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#fee2e2', color: '#dc2626' }}>
                            <Heart size={11} /> Critical
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text3)' }}>—</span>
                        )}
                      </td>
                      <td><ConfBadge val={c.confidence_level} /></td>
                      <td><StatusBadge c={c} /></td>
                      <td style={{ color: 'var(--text2)' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                      <td>
                        <button className="table-action" onClick={() => navigate(`/cases/${c.case_id}`)}>
                          Review →
                        </button>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ConfBadge({ val }) {
  if (!val) return <span className="badge badge-neutral">—</span>
  const map = { high: 'badge-success', moderate: 'badge-warning', low: 'badge-danger' }
  return <span className={`badge ${map[val] || 'badge-neutral'}`}>{val}</span>
}

function StatusBadge({ c }) {
  if (c.emergency_detected) return <span className="badge badge-danger" style={{ display:'inline-flex',alignItems:'center',gap:4 }}><ShieldAlert size={11} /> Emergency</span>
  if (c.requires_urgent_review) return <span className="badge badge-danger" style={{ display:'inline-flex',alignItems:'center',gap:4 }}><AlertTriangle size={11} /> Urgent</span>
  if (c.approved) return <span className="badge badge-success" style={{ display:'inline-flex',alignItems:'center',gap:4 }}><CheckCircle size={11} /> Approved</span>
  return <span className="badge badge-warning" style={{ display:'inline-flex',alignItems:'center',gap:4 }}><Clock size={11} /> Pending</span>
}
