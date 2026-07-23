import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlusCircle, TrendingUp, ChevronDown } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { RingStat, DonutOverview } from '../components/MiniChart.jsx'

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

  const weekly = buildWeeklySeries(cases)
  const breakdown = buildConditionBreakdown(cases)
  const hasChartData = cases.length > 0
  const statusBreakdown = [
    { name: 'Approved', label: 'Approved', value: stats.approved, color: 'var(--success)', showPct: true },
    { name: 'Urgent',   label: 'Urgent',   value: cases.filter(c => (c.requires_urgent_review || c.emergency_detected) && !c.approved).length, color: 'var(--danger)', showPct: true },
    { name: 'Pending',  label: 'Pending',  value: cases.filter(c => !c.approved && !(c.requires_urgent_review || c.emergency_detected)).length, color: 'var(--warning)', showPct: true },
  ].filter(x => x.value > 0)
  const conditionOverview = breakdown.map(b => ({ name: b.name, label: b.name, value: b.count, color: CATEGORY_COLORS[b.name], showPct: true }))

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">Dashboard</span>
        <div className="topbar-right">
          <button className="dropdown-pill">
            Lifetime <ChevronDown size={13} />
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/cases/new')}>
            <PlusCircle size={14} /> New Case
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="card stat-card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <RingStat pct={100} label={stats.total} />
          <div>
            <div className="stat-val" style={{ fontSize: 24 }}><AnimatedNumber value={stats.total} /></div>
            <div className="stat-label">Total Cases</div>
          </div>
        </div>
        <div className="card stat-card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <RingStat pct={stats.total ? (stats.urgent / stats.total) * 100 : 0} label={stats.urgent} />
          <div>
            <div className="stat-val" style={{ fontSize: 24 }}><AnimatedNumber value={stats.urgent} /></div>
            <div className="stat-label">Urgent / Emergency</div>
          </div>
        </div>
        <div className="card stat-card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <RingStat pct={stats.total ? (stats.pending / stats.total) * 100 : 0} label={stats.pending} />
          <div>
            <div className="stat-val" style={{ fontSize: 24 }}><AnimatedNumber value={stats.pending} /></div>
            <div className="stat-label">Pending Review</div>
          </div>
        </div>
        <div className="card stat-card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <RingStat pct={stats.total ? (stats.approved / stats.total) * 100 : 0} label={stats.approved} />
          <div>
            <div className="stat-val" style={{ fontSize: 24 }}><AnimatedNumber value={stats.approved} /></div>
            <div className="stat-label">Approved</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 32px 0' }}>
        <div className="dash-charts-grid" style={{ display: 'grid', gap: 20 }}>
          <div className="card hoverable animate-fade-up">
            <div className="overview-card-header">
              <div className="overview-card-title">Total Cases Overview</div>
              <div className="overview-card-subtitle">By review status · all time</div>
            </div>
            {!hasChartData || statusBreakdown.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180, color: 'var(--text3)', fontSize: 13 }}>
                {loading ? <div className="spinner spinner-dark" /> : !key ? 'Connect an API key via Logs & Analytics to view data.' : 'No data yet.'}
              </div>
            ) : (
              <DonutOverview data={statusBreakdown} centerLabel="Cases" />
            )}
          </div>

          <div className="card hoverable animate-fade-up" style={{ animationDelay: '.06s' }}>
            <div className="overview-card-header">
              <div className="overview-card-title">Condition Breakdown</div>
              <div className="overview-card-subtitle">By complaint category</div>
            </div>
            {!hasChartData || conditionOverview.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180, color: 'var(--text3)', fontSize: 13 }}>
                No data yet.
              </div>
            ) : (
              <DonutOverview data={conditionOverview} centerLabel="Cases" />
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 32px 24px' }}>
        <div className="card hoverable animate-fade-up" style={{ animationDelay: '.12s' }}>
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
      </div>
    </div>
  )
}
