import React, { useState, useEffect, useRef } from 'react'
import {
  FlaskConical, Plus, AlertTriangle, ChevronDown, ChevronUp,
  Loader2, Trash2, X, TrendingUp, Check, Activity
} from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

const TEST_SUGGESTIONS = [
  'Glucose', 'HbA1c', 'Creatinine', 'eGFR', 'Sodium', 'Potassium',
  'Hemoglobin', 'WBC', 'Platelets', 'TSH', 'LDL', 'HDL', 'Troponin'
]

function interpBadge(interp) {
  if (!interp) return null
  const up = interp.toUpperCase()
  let color, bg, label
  if (up === 'HH' || up === 'LL') {
    color = '#b91c1c'; bg = '#fee2e2'; label = `${interp} CRITICAL`
  } else if (up === 'H' || up === 'L') {
    color = '#d97706'; bg = '#fef3c7'; label = interp
  } else {
    color = '#059669'; bg = '#d1fae5'; label = 'N'
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 9px',
      borderRadius: 99, fontSize: 11, fontWeight: 700, color, background: bg,
      letterSpacing: '.02em'
    }}>
      {label}
    </span>
  )
}

function interpBorderColor(interp, critical) {
  if (!interp && !critical) return 'var(--border)'
  const up = (interp || '').toUpperCase()
  if (up === 'HH' || up === 'LL' || critical) return 'var(--danger)'
  if (up === 'H' || up === 'L') return 'var(--warning)'
  return 'var(--success)'
}

function interpAccentColor(interp, critical) {
  if (!interp && !critical) return 'var(--success)'
  const up = (interp || '').toUpperCase()
  if (up === 'HH' || up === 'LL' || critical) return 'var(--danger)'
  if (up === 'H' || up === 'L') return 'var(--warning)'
  return 'var(--success)'
}

/* Reference range bar — 180px wide */
function RangeBar({ value, low, high, unit }) {
  if (low == null || high == null) return null
  const numVal = parseFloat(value)
  const numLow = parseFloat(low)
  const numHigh = parseFloat(high)
  if (isNaN(numVal) || isNaN(numLow) || isNaN(numHigh) || numLow >= numHigh) return null

  const span = numHigh - numLow
  const padding = span * 0.25
  const min = numLow - padding
  const max = numHigh + padding
  const total = max - min

  const lowPct = ((numLow - min) / total) * 100
  const highPct = ((numHigh - min) / total) * 100
  const valPct = Math.max(2, Math.min(98, ((numVal - min) / total) * 100))

  const isAbove = numVal > numHigh
  const isBelow = numVal < numLow
  const dotColor = isAbove || isBelow ? (
    Math.abs(numVal - numLow) > span * 0.5 || Math.abs(numVal - numHigh) > span * 0.5
      ? 'var(--danger)' : 'var(--warning)'
  ) : 'var(--success)'

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ position: 'relative', width: 180, height: 6, borderRadius: 99, background: '#e2e8f0' }}>
        {/* normal zone highlight */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${lowPct}%`, width: `${highPct - lowPct}%`,
          background: '#bbf7d0', borderRadius: 99
        }} />
        {/* dot */}
        <div style={{
          position: 'absolute', top: '50%', left: `${valPct}%`,
          transform: 'translate(-50%, -50%)',
          width: 10, height: 10, borderRadius: 99,
          background: dotColor, border: '2px solid #fff',
          boxShadow: '0 0 0 1px ' + dotColor,
          zIndex: 2
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: 180, marginTop: 3, fontSize: 10, color: 'var(--text3)' }}>
        <span>{numLow}{unit ? ` ${unit}` : ''}</span>
        <span>{numHigh}{unit ? ` ${unit}` : ''}</span>
      </div>
    </div>
  )
}

/* Simple SVG sparkline */
function Sparkline({ data }) {
  if (!data || data.length < 2) {
    return <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>Not enough data points for trend.</div>
  }

  const vals = data.map(d => parseFloat(d.value)).filter(v => !isNaN(v))
  if (vals.length < 2) return <div style={{ fontSize: 12, color: 'var(--text3)' }}>No numeric values to chart.</div>

  const W = 320, H = 80, pad = 12
  const minV = Math.min(...vals), maxV = Math.max(...vals)
  const range = maxV - minV || 1

  const pts = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (W - 2 * pad)
    const y = H - pad - ((v - minV) / range) * (H - 2 * pad)
    return [x, y]
  })

  const polyline = pts.map(p => p.join(',')).join(' ')

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
        <TrendingUp size={12} /> Trend
      </div>
      <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 12px 8px', display: 'inline-block', border: '1px solid var(--border)' }}>
        <svg width={W} height={H} style={{ display: 'block' }}>
          <polyline points={polyline} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" />
          {pts.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={3.5} fill="#fff" stroke="var(--primary)" strokeWidth={2} />
          ))}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text3)', marginTop: 2, width: W }}>
          <span>{data[0]?.result_date?.slice(0, 10)}</span>
          <span>{data[data.length - 1]?.result_date?.slice(0, 10)}</span>
        </div>
      </div>
    </div>
  )
}

const EMPTY_FORM = {
  patient_id: '', test_name: '', value: '', unit: '',
  reference_low: '', reference_high: '', result_date: '', notes: ''
}

export default function Labs() {
  const { key } = useKey()
  const [results, setResults] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [patientFilter, setPatientFilter] = useState('')
  const [testFilter, setTestFilter] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [trendData, setTrendData] = useState({})
  const [trendLoading, setTrendLoading] = useState({})
  const [deletingId, setDeletingId] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState(null)

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => { if (key) { loadResults(); loadPatients() } }, [key])

  async function loadResults() {
    setLoading(true)
    try {
      const qs = patientFilter ? `?patient_id=${patientFilter}` : ''
      const r = await fetch(`/api/labs${qs}`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setResults(Array.isArray(d) ? d : (d.results || []))
    } catch {}
    setLoading(false)
  }

  useEffect(() => { if (key) loadResults() }, [patientFilter, key])

  async function loadPatients() {
    try {
      const r = await fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPatients(d.patients || [])
    } catch {}
  }

  async function loadTrend(result) {
    const cacheKey = `${result.patient_id}:${result.test_name}`
    if (trendData[cacheKey] !== undefined) return
    setTrendLoading(prev => ({ ...prev, [cacheKey]: true }))
    try {
      const r = await fetch(
        `/api/labs/trends/${result.patient_id}/${encodeURIComponent(result.test_name)}`,
        { headers: { 'x-api-key': key } }
      )
      const d = await r.json()
      setTrendData(prev => ({ ...prev, [cacheKey]: Array.isArray(d) ? d : [] }))
    } catch {
      setTrendData(prev => ({ ...prev, [cacheKey]: [] }))
    }
    setTrendLoading(prev => ({ ...prev, [cacheKey]: false }))
  }

  function toggleExpand(result) {
    const id = result.id
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    loadTrend(result)
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this lab result?')) return
    setDeletingId(id)
    try {
      await fetch(`/api/labs/${id}`, { method: 'DELETE', headers: { 'x-api-key': key } })
      setResults(prev => prev.filter(r => r.id !== id))
    } catch {}
    setDeletingId(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.patient_id || !form.test_name || !form.value) return
    setSaving(true)
    setSaveResult(null)
    try {
      const body = {
        patient_id: form.patient_id,
        test_name: form.test_name,
        value: form.value,
        ...(form.unit && { unit: form.unit }),
        ...(form.reference_low && { reference_low: form.reference_low }),
        ...(form.reference_high && { reference_high: form.reference_high }),
        ...(form.result_date && { result_date: form.result_date }),
        ...(form.notes && { notes: form.notes }),
      }
      const r = await fetch('/api/labs', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(body)
      })
      const d = await r.json()
      setSaveResult(d)
      loadResults()
    } catch (err) { setSaveResult({ error: err.message }) }
    setSaving(false)
  }

  function openModal() { setForm(EMPTY_FORM); setSaveResult(null); setShowModal(true) }
  function closeModal() { setShowModal(false); setSaveResult(null) }

  const displayed = results.filter(r => {
    if (testFilter && !r.test_name?.toLowerCase().includes(testFilter.toLowerCase())) return false
    return true
  })

  const criticals = displayed.filter(r => {
    const up = (r.interpretation || '').toUpperCase()
    return up === 'HH' || up === 'LL' || r.critical
  })

  const abnormals = displayed.filter(r => {
    const up = (r.interpretation || '').toUpperCase()
    return (up === 'H' || up === 'L') && !r.critical
  })

  const inputStyle = {
    width: '100%', padding: '9px 13px', border: '1.5px solid var(--border)',
    borderRadius: 8, fontSize: 13.5, color: 'var(--text)', background: 'var(--surface)',
    outline: 'none', boxSizing: 'border-box', transition: 'border-color .15s',
    fontFamily: 'inherit'
  }
  const labelStyle = {
    display: 'block', fontSize: 12.5, fontWeight: 600,
    color: 'var(--text)', marginBottom: 5
  }

  return (
    <div>
      {/* ── Topbar ── */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FlaskConical size={18} color="var(--primary)" />
          <span className="topbar-title">Lab Results</span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openModal}>
          <Plus size={14} /> Add Result
        </button>
      </div>

      {/* ── Summary stats row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, padding: '20px 32px 0' }}>
        {/* Total */}
        <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Activity size={18} color="var(--primary)" />
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{displayed.length}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>Total Results</div>
          </div>
        </div>
        {/* Critical */}
        <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, borderLeft: criticals.length ? '3px solid var(--danger)' : undefined }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: criticals.length ? 'var(--danger-light)' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <AlertTriangle size={18} color={criticals.length ? 'var(--danger)' : 'var(--text3)'} />
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: criticals.length ? 'var(--danger)' : 'var(--text)', lineHeight: 1 }}>{criticals.length}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>Critical Values</div>
          </div>
        </div>
        {/* Abnormal */}
        <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, borderLeft: abnormals.length ? '3px solid var(--warning)' : undefined }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: abnormals.length ? 'var(--warning-light)' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TrendingUp size={18} color={abnormals.length ? 'var(--warning)' : 'var(--text3)'} />
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: abnormals.length ? 'var(--warning)' : 'var(--text)', lineHeight: 1 }}>{abnormals.length}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3 }}>Abnormal</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 32px 32px' }}>

        {/* ── Filter bar ── */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center',
          flexWrap: 'wrap', marginBottom: 20, boxShadow: 'var(--shadow)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 200px', minWidth: 0 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap' }}>Patient</label>
            <select
              value={patientFilter}
              onChange={e => setPatientFilter(e.target.value)}
              style={{ ...inputStyle, padding: '7px 11px', fontSize: 13, flex: 1 }}
            >
              <option value="">All patients</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 200px', minWidth: 0 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap' }}>Test</label>
            <input
              value={testFilter}
              onChange={e => setTestFilter(e.target.value)}
              placeholder="Filter by test name…"
              style={{ ...inputStyle, padding: '7px 11px', fontSize: 13, flex: 1 }}
            />
          </div>
          {(patientFilter || testFilter) && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { setPatientFilter(''); setTestFilter('') }}
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {/* ── Results list ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--text3)' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block', color: 'var(--primary)' }} />
            <div style={{ fontSize: 13 }}>Loading results…</div>
          </div>
        ) : displayed.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '80px 20px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, boxShadow: 'var(--shadow)'
          }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <FlaskConical size={28} color="var(--primary)" />
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>No lab results found</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 24 }}>
              {testFilter || patientFilter ? 'Try adjusting your filters.' : 'Record your first lab value to get started.'}
            </div>
            {!testFilter && !patientFilter && (
              <button className="btn btn-primary" onClick={openModal}>
                <Plus size={15} /> Add First Result
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {displayed.map(result => {
              const isOpen = expanded === result.id
              const cacheKey = `${result.patient_id}:${result.test_name}`
              const trend = trendData[cacheKey]
              const trendBusy = trendLoading[cacheKey]
              const isCritical = (result.interpretation || '').toUpperCase() === 'HH' || (result.interpretation || '').toUpperCase() === 'LL' || result.critical
              const isAbnormal = !isCritical && ((result.interpretation || '').toUpperCase() === 'H' || (result.interpretation || '').toUpperCase() === 'L')
              const accentColor = interpAccentColor(result.interpretation, result.critical)
              const hasRange = result.reference_low != null && result.reference_high != null

              return (
                <div key={result.id} style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderLeft: `4px solid ${accentColor}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                  boxShadow: 'var(--shadow)',
                  transition: 'box-shadow .15s'
                }}>
                  {/* Row header */}
                  <div
                    style={{ padding: '14px 16px 14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
                    onClick={() => toggleExpand(result)}
                  >
                    {/* Left: test name + patient */}
                    <div style={{ flex: '0 0 200px', minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {result.test_name}
                      </div>
                      {result.patient_name && (
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {result.patient_name}
                        </div>
                      )}
                    </div>

                    {/* Center: big value + range bar */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                        <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>
                          {result.value}
                        </span>
                        {result.unit && (
                          <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>
                            {result.unit}
                          </span>
                        )}
                      </div>
                      {hasRange ? (
                        <RangeBar
                          value={result.value}
                          low={result.reference_low}
                          high={result.reference_high}
                          unit={result.unit}
                        />
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>No reference range</div>
                      )}
                    </div>

                    {/* Right: badge + date + delta */}
                    <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {interpBadge(result.interpretation)}
                        {result.delta_flag && (
                          <span title="Significant change from previous" style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            padding: '2px 7px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                            color: 'var(--warning)', background: 'var(--warning-light)'
                          }}>
                            Δ
                          </span>
                        )}
                      </div>
                      {result.result_date && (
                        <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
                          {result.result_date?.slice(0, 10)}
                        </div>
                      )}
                    </div>

                    {/* Far right: expand + delete */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, marginLeft: 8 }}>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(result.id) }}
                        disabled={deletingId === result.id}
                        style={{
                          padding: '5px 8px', border: '1px solid var(--border)',
                          borderRadius: 7, background: 'var(--surface)',
                          cursor: 'pointer', display: 'flex', alignItems: 'center',
                          color: 'var(--danger)', transition: 'all .15s'
                        }}
                        title="Delete result"
                      >
                        {deletingId === result.id
                          ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                          : <Trash2 size={13} />}
                      </button>
                      <div style={{ color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>
                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '18px 20px 18px 22px', background: 'var(--surface2)' }}>
                      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 240 }}>
                          {result.ai_summary && (
                            <div style={{ marginBottom: 14, padding: '12px 14px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                                <Activity size={11} /> AI Summary
                              </div>
                              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.65 }}>{result.ai_summary}</div>
                            </div>
                          )}
                          {result.notes && (
                            <div style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Clinical Notes</div>
                              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, padding: '10px 12px', background: 'var(--surface)', borderRadius: 7, border: '1px solid var(--border)' }}>
                                {result.notes}
                              </div>
                            </div>
                          )}
                          {hasRange && (
                            <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>
                              <span style={{ fontWeight: 600 }}>Reference:</span> {result.reference_low} – {result.reference_high}{result.unit ? ` ${result.unit}` : ''}
                            </div>
                          )}
                        </div>

                        <div style={{ flex: '0 0 auto' }}>
                          {trendBusy ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', fontSize: 13, padding: '8px 0' }}>
                              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading trend…
                            </div>
                          ) : trend ? (
                            <Sparkline data={trend} />
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Add Result Modal ── */}
      {showModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            zIndex: 1000, padding: '32px 16px', overflowY: 'auto',
            backdropFilter: 'blur(2px)'
          }}
          onClick={e => e.target === e.currentTarget && closeModal()}
        >
          <div style={{
            background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 560,
            boxShadow: '0 24px 64px rgba(0,0,0,.22)', marginBottom: 32
          }}>
            {/* Modal header */}
            <div style={{
              padding: '18px 24px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FlaskConical size={16} color="var(--primary)" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Add Lab Result</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Enter result details below</div>
                </div>
              </div>
              <button
                onClick={closeModal}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 6, borderRadius: 7, display: 'flex', alignItems: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate style={{ padding: '22px 24px' }}>
              {!saveResult ? (
                <>
                  {/* Patient selector */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Patient <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <select
                      value={form.patient_id}
                      onChange={e => setField('patient_id', e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">— Select patient —</option>
                      {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>

                  {/* Test name */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Test Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <input
                      type="text"
                      value={form.test_name}
                      onChange={e => setField('test_name', e.target.value)}
                      placeholder="e.g. Glucose"
                      list="test-suggestions"
                      style={inputStyle}
                    />
                    <datalist id="test-suggestions">
                      {TEST_SUGGESTIONS.map(t => <option key={t} value={t} />)}
                    </datalist>
                  </div>

                  {/* Value + Unit */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                    <div>
                      <label style={labelStyle}>Value <span style={{ color: 'var(--danger)' }}>*</span></label>
                      <input type="text" value={form.value} onChange={e => setField('value', e.target.value)} placeholder="e.g. 5.4" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Unit</label>
                      <input type="text" value={form.unit} onChange={e => setField('unit', e.target.value)} placeholder="e.g. mmol/L" style={inputStyle} />
                    </div>
                  </div>

                  {/* Reference range */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                    <div>
                      <label style={labelStyle}>Reference Low</label>
                      <input type="text" value={form.reference_low} onChange={e => setField('reference_low', e.target.value)} placeholder="e.g. 3.9" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Reference High</label>
                      <input type="text" value={form.reference_high} onChange={e => setField('reference_high', e.target.value)} placeholder="e.g. 7.1" style={inputStyle} />
                    </div>
                  </div>

                  {/* Date */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Result Date</label>
                    <input type="date" value={form.result_date} onChange={e => setField('result_date', e.target.value)} style={inputStyle} />
                  </div>

                  {/* Notes */}
                  <div style={{ marginBottom: 22 }}>
                    <label style={labelStyle}>Clinical Notes</label>
                    <textarea
                      value={form.notes}
                      onChange={e => setField('notes', e.target.value)}
                      rows={3}
                      placeholder="Optional clinical notes…"
                      style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                    <button type="button" onClick={closeModal} className="btn btn-secondary btn-sm">Cancel</button>
                    <button
                      type="submit"
                      disabled={saving || !form.patient_id || !form.test_name || !form.value}
                      className="btn btn-primary btn-sm"
                    >
                      {saving
                        ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Processing…</>
                        : <><FlaskConical size={13} /> Save Result</>}
                    </button>
                  </div>
                </>
              ) : saveResult.error ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <div style={{ width: 52, height: 52, borderRadius: 99, background: 'var(--danger-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                    <AlertTriangle size={24} color="var(--danger)" />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>Save Failed</div>
                  <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 20 }}>{saveResult.error}</div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setSaveResult(null)}>Try Again</button>
                </div>
              ) : (
                <div style={{ padding: '8px 0' }}>
                  {/* Success card */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--success-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Check size={22} color="var(--success)" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 2 }}>Result Saved</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>The result has been added to the patient record.</div>
                    </div>
                  </div>

                  {/* Result mini-card */}
                  <div style={{
                    border: '1px solid var(--border)',
                    borderLeft: `4px solid ${interpAccentColor(saveResult.interpretation, saveResult.critical)}`,
                    borderRadius: 9, padding: '14px 16px',
                    background: 'var(--surface2)', marginBottom: 16
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{saveResult.test_name || form.test_name}</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 4 }}>
                          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{saveResult.value || form.value}</span>
                          {(saveResult.unit || form.unit) && <span style={{ fontSize: 13, color: 'var(--text2)' }}>{saveResult.unit || form.unit}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                        {interpBadge(saveResult.interpretation)}
                        {saveResult.delta_flag && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, color: 'var(--warning)', background: 'var(--warning-light)' }}>
                            <AlertTriangle size={11} /> Significant Change
                          </span>
                        )}
                      </div>
                    </div>
                    {saveResult.ai_summary && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>AI Summary</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.6 }}>{saveResult.ai_summary}</div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setForm(EMPTY_FORM); setSaveResult(null) }}>Add Another</button>
                    <button className="btn btn-primary btn-sm" onClick={closeModal}>Done</button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
