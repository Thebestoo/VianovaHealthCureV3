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

function startOfHour(d) {
  const x = new Date(d)
  x.setMinutes(0, 0, 0)
  return x
}

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function startOfMonth(d) {
  const x = startOfDay(d)
  x.setDate(1)
  return x
}

// Builds `count` buckets stepping backward from now by `stepMs`-ish units (via
// `advance`), so daily/weekly/monthly/lifetime views all share one shape of series.
function buildSeries(cases, { count, floor, advance, format }) {
  const buckets = []
  const now = floor(new Date())
  for (let i = count - 1; i >= 0; i--) {
    const start = advance(new Date(now), -i)
    buckets.push({ start, label: format(start), count: 0 })
  }
  cases.forEach(c => {
    const start = floor(new Date(c.created_at))
    const slot = buckets.find(b => b.start.getTime() === start.getTime())
    if (slot) slot.count++
  })
  return buckets.map(b => ({ bucket: b.label, count: b.count }))
}

const RANGE_OPTIONS = [
  { key: 'daily',    label: 'Daily',    chartLabel: 'Last 24 hours', suffix: 'today' },
  { key: 'weekly',   label: 'Weekly',   chartLabel: 'Last 7 days',   suffix: 'last 7 days' },
  { key: 'monthly',  label: 'Monthly',  chartLabel: 'Last 30 days',  suffix: 'last 30 days' },
  { key: 'lifetime', label: 'Lifetime', chartLabel: 'Last 12 months', suffix: 'all time' },
]

function filterByRange(cases, range) {
  if (range === 'lifetime') return cases
  const now = new Date()
  const cutoff = new Date(now)
  if (range === 'daily') return cases.filter(c => new Date(c.created_at) >= startOfDay(now))
  if (range === 'weekly') cutoff.setDate(cutoff.getDate() - 7)
  if (range === 'monthly') cutoff.setDate(cutoff.getDate() - 30)
  return cases.filter(c => new Date(c.created_at) >= cutoff)
}

function buildRangeSeries(cases, range) {
  if (range === 'daily') {
    return buildSeries(cases, {
      count: 24, floor: startOfHour,
      advance: (d, i) => { d.setHours(d.getHours() + i); return d },
      format: d => d.toLocaleTimeString('en-US', { hour: 'numeric' }),
    })
  }
  if (range === 'weekly') {
    return buildSeries(cases, {
      count: 7, floor: startOfDay,
      advance: (d, i) => { d.setDate(d.getDate() + i); return d },
      format: d => d.toLocaleDateString('en-US', { weekday: 'short' }),
    })
  }
  if (range === 'monthly') {
    return buildSeries(cases, {
      count: 30, floor: startOfDay,
      advance: (d, i) => { d.setDate(d.getDate() + i); return d },
      format: d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    })
  }
  return buildSeries(cases, {
    count: 12, floor: startOfMonth,
    advance: (d, i) => { d.setMonth(d.getMonth() + i); return d },
    format: d => d.toLocaleDateString('en-US', { month: 'short' }),
  })
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

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', boxShadow: 'var(--shadow-md)' }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{payload[0].value} case{payload[0].value === 1 ? '' : 's'}</div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { key } = useKey()
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('lifetime')
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false)

  useEffect(() => {
    if (!key) { setLoading(false); return }
    fetch('/api/cases', { headers: { 'x-api-key': key } })
      .then(r => r.json())
      .then(data => { setCases(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [key])

  const rangeOption = RANGE_OPTIONS.find(r => r.key === range)
  const rangedCases = filterByRange(cases, range)

  const stats = {
    total: rangedCases.length,
    urgent: rangedCases.filter(c => c.requires_urgent_review || c.emergency_detected).length,
    pending: rangedCases.filter(c => !c.approved).length,
    approved: rangedCases.filter(c => c.approved).length,
  }

  const series = buildRangeSeries(rangedCases, range)
  const seriesTotal = series.reduce((s, b) => s + b.count, 0)
  const seriesPeak = series.reduce((m, b) => Math.max(m, b.count), 0)
  const breakdown = buildConditionBreakdown(rangedCases)
  const hasChartData = rangedCases.length > 0
  const statusBreakdown = [
    { name: 'Approved', label: 'Approved', value: stats.approved, color: 'var(--success)', showPct: true },
    { name: 'Urgent',   label: 'Urgent',   value: rangedCases.filter(c => (c.requires_urgent_review || c.emergency_detected) && !c.approved).length, color: 'var(--danger)', showPct: true },
    { name: 'Pending',  label: 'Pending',  value: rangedCases.filter(c => !c.approved && !(c.requires_urgent_review || c.emergency_detected)).length, color: 'var(--warning)', showPct: true },
  ].filter(x => x.value > 0)
  const conditionOverview = breakdown.map(b => ({ name: b.name, label: b.name, value: b.count, color: CATEGORY_COLORS[b.name], showPct: true }))

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">Dashboard</span>
        <div className="topbar-right">
          <div style={{ position: 'relative' }}>
            <button className="dropdown-pill" onClick={() => setRangeMenuOpen(o => !o)}>
              {rangeOption.label} <ChevronDown size={13} style={{ transform: rangeMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
            </button>
            {rangeMenuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setRangeMenuOpen(false)} />
                <div className="card" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 150, padding: 6, zIndex: 1000, boxShadow: '0 16px 40px rgba(0,0,0,.16)' }}>
                  {RANGE_OPTIONS.map(opt => (
                    <button key={opt.key} onClick={() => { setRange(opt.key); setRangeMenuOpen(false) }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px',
                        background: opt.key === range ? 'var(--primary-light)' : 'none', border: 'none', borderRadius: 7, cursor: 'pointer',
                        fontSize: 13, fontWeight: opt.key === range ? 600 : 500, color: opt.key === range ? 'var(--primary-dark)' : 'var(--text)',
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
              <div className="overview-card-subtitle">By review status · {rangeOption.suffix}</div>
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
              <div className="overview-card-subtitle">By complaint category · {rangeOption.suffix}</div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {hasChartData && (
                <span style={{ fontSize: 11.5, color: 'var(--text2)' }}>
                  Peak <b style={{ color: 'var(--text)' }}>{seriesPeak}</b> · Total <b style={{ color: 'var(--text)' }}>{seriesTotal}</b>
                </span>
              )}
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>{rangeOption.chartLabel}</span>
            </div>
          </div>
          <div className="card-body" style={{ height: 260 }}>
            {!hasChartData ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: 13 }}>
                No data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 16, right: 12, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="casesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0e7490" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="#0e7490" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="casesStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#0e7490" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="4 6" stroke="var(--border)" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} interval={range === 'monthly' ? 3 : 0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} width={26} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '3 3' }} />
                  <Area type="monotone" dataKey="count" stroke="url(#casesStroke)" strokeWidth={2.75} fill="url(#casesFill)"
                    activeDot={{ r: 5, fill: '#fff', stroke: '#0e7490', strokeWidth: 2.5 }}
                    isAnimationActive animationDuration={900} animationEasing="ease-out" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
