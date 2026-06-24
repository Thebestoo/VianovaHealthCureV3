import React, { useState, useEffect, useRef } from 'react'
import {
  FlaskConical, Plus, AlertTriangle, ChevronDown, ChevronUp,
  Loader2, Trash2, X, TrendingUp, Check
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
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, color, background: bg }}>
      {label}
    </span>
  )
}

/* Simple SVG sparkline */
function Sparkline({ data }) {
  if (!data || data.length < 2) {
    return <div style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>Not enough data points for trend.</div>
  }

  const vals = data.map(d => parseFloat(d.value)).filter(v => !isNaN(v))
  if (vals.length < 2) return <div style={{ fontSize: 12, color: '#9ca3af' }}>No numeric values to chart.</div>

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
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Trend</div>
      <svg width={W} height={H} style={{ display: 'block' }}>
        <polyline points={polyline} fill="none" stroke="#2563eb" strokeWidth={2} strokeLinejoin="round" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={3.5} fill="#fff" stroke="#2563eb" strokeWidth={2} />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#9ca3af', marginTop: 2, width: W }}>
        <span>{data[0]?.result_date?.slice(0, 10)}</span>
        <span>{data[data.length - 1]?.result_date?.slice(0, 10)}</span>
      </div>
    </div>
  )
}

function FL({ children }) {
  return <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{children}</label>
}
function FI({ value, onChange, placeholder, type = 'text', list }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      list={list}
      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
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

  return (
    <div>
      <div className="topbar">
        <span className="topbar-title">Lab Results</span>
        <button className="btn btn-primary btn-sm" onClick={openModal}>
          <Plus size={14} /> Add Result
        </button>
      </div>

      <div style={{ padding: '24px 32px' }}>

        {/* Critical banner */}
        {criticals.length > 0 && (
          <div style={{
            marginBottom: 20, padding: '12px 18px', borderRadius: 10,
            background: '#fee2e2', border: '1px solid #fca5a5',
            display: 'flex', alignItems: 'center', gap: 10
          }}>
            <AlertTriangle size={16} color="#dc2626" style={{ flexShrink: 0 }} />
            <div>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#b91c1c' }}>
                {criticals.length} CRITICAL value{criticals.length > 1 ? 's' : ''} in current view
              </span>
              <span style={{ fontSize: 12, color: '#dc2626', marginLeft: 8 }}>
                {criticals.map(c => `${c.test_name} (${c.patient_name || 'patient'})`).join(' • ')}
              </span>
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <select
            value={patientFilter}
            onChange={e => setPatientFilter(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', minWidth: 180, color: patientFilter ? '#111827' : '#9ca3af' }}
          >
            <option value="">All patients</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input
            value={testFilter}
            onChange={e => setTestFilter(e.target.value)}
            placeholder="Filter by test name…"
            style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', minWidth: 200 }}
          />
        </div>

        {/* Results list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 10px', display: 'block' }} />
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
            <FlaskConical size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: .35 }} />
            <div style={{ fontWeight: 600, fontSize: 15, color: '#374151', marginBottom: 6 }}>No lab results found</div>
            <div style={{ fontSize: 13 }}>Click "Add Result" to record your first lab value.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayed.map(result => {
              const isOpen = expanded === result.id
              const cacheKey = `${result.patient_id}:${result.test_name}`
              const trend = trendData[cacheKey]
              const trendBusy = trendLoading[cacheKey]
              const isCritical = (result.interpretation || '').toUpperCase() === 'HH' || (result.interpretation || '').toUpperCase() === 'LL' || result.critical

              return (
                <div key={result.id} style={{
                  background: '#fff',
                  border: `1px solid ${isCritical ? '#fca5a5' : '#e5e7eb'}`,
                  borderRadius: 12, overflow: 'hidden'
                }}>
                  <div
                    style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                    onClick={() => toggleExpand(result)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{result.test_name}</span>
                        <span style={{ fontSize: 14, color: '#374151' }}>
                          {result.value}{result.unit ? ` ${result.unit}` : ''}
                        </span>
                        {interpBadge(result.interpretation)}
                        {result.delta_flag && (
                          <span title="Significant change from previous" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: '#d97706', background: '#fef3c7' }}>
                            <AlertTriangle size={10} /> Δ
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {result.patient_name && <span>{result.patient_name}</span>}
                        {result.result_date && <span>{result.result_date?.slice(0, 10)}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(result.id) }}
                        disabled={deletingId === result.id}
                        style={{ padding: '5px 8px', border: '1px solid #fecaca', borderRadius: 7, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#dc2626' }}
                      >
                        {deletingId === result.id
                          ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                          : <Trash2 size={13} />}
                      </button>
                      {isOpen ? <ChevronUp size={15} color="#9ca3af" /> : <ChevronDown size={15} color="#9ca3af" />}
                    </div>
                  </div>

                  {isOpen && (
                    <div style={{ borderTop: '1px solid #f3f4f6', padding: '16px 18px' }}>
                      {result.ai_summary && (
                        <div style={{ marginBottom: 14, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>AI Summary</div>
                          <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{result.ai_summary}</div>
                        </div>
                      )}
                      {result.notes && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Notes</div>
                          <div style={{ fontSize: 13, color: '#4b5563' }}>{result.notes}</div>
                        </div>
                      )}
                      {(result.reference_low != null || result.reference_high != null) && (
                        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                          Reference range: {result.reference_low ?? '—'} – {result.reference_high ?? '—'} {result.unit || ''}
                        </div>
                      )}
                      {/* Trend */}
                      {trendBusy ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b7280', fontSize: 13, padding: '8px 0' }}>
                          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading trend…
                        </div>
                      ) : trend ? (
                        <Sparkline data={trend} />
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Add Result Modal */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '28px 16px', overflowY: 'auto' }}
          onClick={e => e.target === e.currentTarget && closeModal()}
        >
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: '0 24px 64px rgba(0,0,0,.22)', marginBottom: 28 }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>Add Lab Result</div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmit} noValidate style={{ padding: '20px 24px' }}>
              {!saveResult ? (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <FL>Patient *</FL>
                    <select
                      value={form.patient_id}
                      onChange={e => setField('patient_id', e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    >
                      <option value="">— Select patient —</option>
                      {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <FL>Test Name *</FL>
                    <FI
                      value={form.test_name}
                      onChange={v => setField('test_name', v)}
                      placeholder="e.g. Glucose"
                      list="test-suggestions"
                    />
                    <datalist id="test-suggestions">
                      {TEST_SUGGESTIONS.map(t => <option key={t} value={t} />)}
                    </datalist>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <FL>Value *</FL>
                      <FI value={form.value} onChange={v => setField('value', v)} placeholder="e.g. 5.4" />
                    </div>
                    <div>
                      <FL>Unit</FL>
                      <FI value={form.unit} onChange={v => setField('unit', v)} placeholder="e.g. mmol/L" />
                    </div>
                    <div>
                      <FL>Reference Low</FL>
                      <FI value={form.reference_low} onChange={v => setField('reference_low', v)} placeholder="e.g. 3.9" />
                    </div>
                    <div>
                      <FL>Reference High</FL>
                      <FI value={form.reference_high} onChange={v => setField('reference_high', v)} placeholder="e.g. 7.1" />
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <FL>Result Date</FL>
                    <FI type="date" value={form.result_date} onChange={v => setField('result_date', v)} />
                  </div>

                  <div style={{ marginBottom: 20 }}>
                    <FL>Notes</FL>
                    <textarea
                      value={form.notes}
                      onChange={e => setField('notes', e.target.value)}
                      rows={2}
                      placeholder="Optional clinical notes…"
                      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #d1d5db', borderRadius: 7, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button type="button" onClick={closeModal} className="btn btn-secondary btn-sm">Cancel</button>
                    <button
                      type="submit"
                      disabled={saving || !form.patient_id || !form.test_name || !form.value}
                      className="btn btn-primary btn-sm"
                    >
                      {saving
                        ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Processing…</>
                        : <><FlaskConical size={13} /> Add Result</>}
                    </button>
                  </div>
                </>
              ) : saveResult.error ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <AlertTriangle size={32} color="#dc2626" style={{ display: 'block', margin: '0 auto 10px' }} />
                  <div style={{ color: '#dc2626', fontSize: 14, marginBottom: 16 }}>{saveResult.error}</div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setSaveResult(null)}>Try Again</button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ width: 52, height: 52, borderRadius: 99, background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                    <Check size={24} color="#059669" />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#111827', marginBottom: 6 }}>Result Added</div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 13, color: '#6b7280' }}>Interpretation:</span>
                      {interpBadge(saveResult.interpretation)}
                    </div>
                    {saveResult.delta_flag && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, color: '#d97706', background: '#fef3c7' }}>
                        <AlertTriangle size={12} /> Significant Change
                      </span>
                    )}
                  </div>
                  {saveResult.ai_summary && (
                    <div style={{ marginTop: 16, padding: '12px 14px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, textAlign: 'left' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>AI Summary</div>
                      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{saveResult.ai_summary}</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
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
