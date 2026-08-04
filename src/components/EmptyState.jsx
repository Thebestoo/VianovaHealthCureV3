import React from 'react'

// Purely presentational — a consistent icon + title (+ optional hint) empty state
// for blank panels (patient lists, care plans, check-ins, readings, roster search,
// etc.) instead of ad-hoc bare text. Shared by CCM and RPM.
export default function EmptyState({ icon: Icon, title, hint, compact = false }) {
  return (
    <div style={{ textAlign: 'center', padding: compact ? '28px 20px' : '48px 24px', color: 'var(--text3)' }}>
      <div style={{
        width: compact ? 40 : 52, height: compact ? 40 : 52, borderRadius: '50%',
        background: 'var(--surface2)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
      }}>
        <Icon size={compact ? 18 : 22} color="var(--text3)" />
      </div>
      <div style={{ fontSize: compact ? 13 : 14, fontWeight: 600, color: 'var(--text2)' }}>{title}</div>
      {hint && <div style={{ fontSize: compact ? 11.5 : 12.5, color: 'var(--text3)', marginTop: 4, maxWidth: 280, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>{hint}</div>}
    </div>
  )
}
