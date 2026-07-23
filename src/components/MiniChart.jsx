import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend
} from 'recharts'

export function TypeBarChart({ data, color = '#0e7490' }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
        <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function TimelineChart({ data, color = '#0e7490', dataKey = 'count' }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

const PIE_COLORS = ['#0e7490', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0284c7']

export function StatusPieChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
          dataKey="value" nameKey="name" paddingAngle={3}>
          {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

// Small circular progress ring (teal → green gradient stroke) used on stat cards
// throughout the platform — e.g. "62% of patients engaged this month".
export function RingStat({ pct = 0, size = 48, stroke = 5, label }) {
  const gradId = `ringGrad${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, pct))
  const offset = c - (clamped / 100) * c
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0e7490" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f6" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${gradId})`}
          strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.24, fontWeight: 800, color: 'var(--text)' }}>
        {label ?? `${Math.round(clamped)}%`}
      </div>
    </div>
  )
}

// Legend-style breakdown row: colored dot + label on the left, value right-aligned —
// used for "Overview" style summary cards (patients by status, condition mix, etc).
// Pass `pct: true` on an item's parent call (or per-item `pct`) to also show a
// percentage-of-total ahead of the raw value, e.g. "40.68%   24".
export function LegendList({ items }) {
  const total = items.reduce((s, it) => s + (Number(it.value) || 0), 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {items.map((it, i) => (
        <div key={it.label ?? i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px', borderBottom: i < items.length - 1 ? '1px solid var(--border)' : 'none' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: it.color || PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--text2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
          {it.showPct && total > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{((it.value / total) * 100).toFixed(1)}%</span>
          )}
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', minWidth: 22, textAlign: 'right' }}>{it.value}</span>
        </div>
      ))}
    </div>
  )
}

// Segmented donut with center-overlaid total/label, paired with a colored-dot
// legend — the "category" card pattern (Total Patients / Engagement / Providers
// Patient Distribution style cards): ring on the left, legend list filling the rest.
export function DonutOverview({ data, size = 120, thickness = 16, centerLabel }) {
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0)
  return (
    <div className="overview-donut-row">
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <ResponsiveContainer width={size} height={size}>
          <PieChart>
            <Pie
              data={data} dataKey="value" nameKey="name"
              cx="50%" cy="50%" innerRadius={size / 2 - thickness} outerRadius={size / 2}
              paddingAngle={data.length > 1 ? 3 : 0} startAngle={90} endAngle={-270}
              isAnimationActive animationDuration={800}
            >
              {data.map((d, i) => <Cell key={i} fill={d.color || PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />)}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ fontSize: size * 0.2, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{total}</div>
          {centerLabel && <div style={{ fontSize: size * 0.09, color: 'var(--text3)', marginTop: 3 }}>{centerLabel}</div>}
        </div>
      </div>
      <div className="overview-legend">
        <LegendList items={data} />
      </div>
    </div>
  )
}
