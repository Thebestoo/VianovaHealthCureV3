import React, { useState, useEffect } from 'react'
import { GitMerge, Loader2, ChevronDown, ChevronUp, Download, Copy, Check } from 'lucide-react'
import { useKey } from '../context/KeyContext.jsx'

function interpBadge(value) {
  if (!value) return null
  const v = value.toLowerCase()
  let color, bg
  if (v === 'normal' || v === 'final') { color = '#059669'; bg = '#d1fae5' }
  else if (v === 'abnormal' || v === 'pending') { color = '#d97706'; bg = '#fef3c7' }
  else if (v === 'critical') { color = '#b91c1c'; bg = '#fee2e2' }
  else { color = 'var(--text2)'; bg = 'var(--surface2)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 9px',
      borderRadius: 99, fontSize: 11, fontWeight: 700, color, background: bg, textTransform: 'capitalize'
    }}>
      {value}
    </span>
  )
}

function systemBadge(system) {
  const colors = {
    'SNOMED CT': { color: '#1d4ed8', bg: '#dbeafe' },
    'LOINC': { color: '#7c3aed', bg: '#ede9fe' },
    'RxNorm': { color: '#065f46', bg: '#d1fae5' },
    'ICD-10': { color: '#92400e', bg: '#fef3c7' },
  }
  const c = colors[system] || { color: 'var(--text2)', bg: 'var(--surface2)' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 9px',
      borderRadius: 99, fontSize: 11, fontWeight: 700, color: c.color, background: c.bg
    }}>
      {system}
    </span>
  )
}

function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100)
  const color = value >= 0.8 ? '#059669' : value >= 0.5 ? '#d97706' : '#b91c1c'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 80, height: 6, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 700, color }}>{pct}%</span>
    </div>
  )
}

function AccordionSection({ title, count, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
      <div
        style={{ padding: '12px 18px', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{title}</span>
          {count != null && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 99, background: 'var(--primary-light)', color: 'var(--primary)' }}>
              {count}
            </span>
          )}
        </div>
        <div style={{ color: 'var(--text3)' }}>{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</div>
      </div>
      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 18px', background: 'var(--surface2)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

function SimpleTable({ headers, rows }) {
  if (!rows || rows.length === 0) return <div style={{ fontSize: 13, color: 'var(--text3)' }}>No records.</div>
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {headers.map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text2)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows}
        </tbody>
      </table>
    </div>
  )
}

const inputStyle = {
  padding: '9px 13px', border: '1.5px solid var(--border)', borderRadius: 8,
  fontSize: 13.5, color: 'var(--text)', background: 'var(--surface)',
  outline: 'none', fontFamily: 'inherit'
}

export default function Interoperability() {
  const { key } = useKey()
  const [tab, setTab] = useState('export')
  const [patients, setPatients] = useState([])

  // Export tab
  const [exportPatient, setExportPatient] = useState('')
  const [record, setRecord] = useState(null)
  const [loadingRecord, setLoadingRecord] = useState(false)
  const [copied, setCopied] = useState(false)

  // Terminology tab
  const [termsInput, setTermsInput] = useState('')
  const [targetSystem, setTargetSystem] = useState('')
  const [mappings, setMappings] = useState([])
  const [mapping, setMapping] = useState(false)

  useEffect(() => { if (key) loadPatients() }, [key])

  async function loadPatients() {
    try {
      const r = await fetch('/api/gen-patients', { headers: { 'x-api-key': key } })
      const d = await r.json()
      setPatients(d.patients || [])
    } catch {}
  }

  async function loadRecord() {
    if (!exportPatient) return
    setLoadingRecord(true)
    setRecord(null)
    try {
      const r = await fetch(`/api/patients/${exportPatient}/complete-record`, { headers: { 'x-api-key': key } })
      const d = await r.json()
      setRecord(d)
    } catch {}
    setLoadingRecord(false)
  }

  function downloadJSON() {
    if (!record) return
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `patient-record-${exportPatient}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function copyFHIR() {
    if (!record) return
    const fhir = {
      resourceType: 'Bundle',
      type: 'collection',
      timestamp: record.exported_at || new Date().toISOString(),
      entry: [
        { resource: { resourceType: 'Patient', id: String(exportPatient), ...record.patient } },
        ...(record.resources?.lab_results || []).map((r, i) => ({
          resource: { resourceType: 'Observation', id: `obs-${i}`, ...r }
        }))
      ]
    }
    navigator.clipboard.writeText(JSON.stringify(fhir, null, 2)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function mapTerms() {
    const terms = termsInput.split('\n').map(t => t.trim()).filter(Boolean)
    if (!terms.length) return
    setMapping(true)
    setMappings([])
    try {
      const body = { terms, ...(targetSystem && { target_system: targetSystem }) }
      const r = await fetch('/api/terminology/map', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(body)
      })
      const d = await r.json()
      setMappings(d.mappings || [])
    } catch {}
    setMapping(false)
  }

  const tabStyle = (active) => ({
    padding: '8px 18px', border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 13.5, fontWeight: active ? 700 : 500,
    background: active ? 'var(--primary)' : 'transparent',
    color: active ? '#fff' : 'var(--text2)', transition: 'all .15s'
  })

  const res = record?.resources || {}
  const sum = record?.summary || {}

  const statCards = [
    { label: 'Lab Results', value: sum.lab_results ?? res.lab_results?.length ?? 0, color: '#2563eb' },
    { label: 'Care Gaps', value: sum.care_gaps ?? res.care_gaps?.length ?? 0, color: '#d97706' },
    { label: 'Appointments', value: sum.appointments ?? res.appointments?.length ?? 0, color: '#059669' },
    { label: 'Adverse Events', value: sum.adverse_events ?? res.adverse_events?.length ?? 0, color: '#b91c1c' },
  ]

  return (
    <div>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <GitMerge size={18} color="var(--primary)" />
          <span className="topbar-title">Interoperability</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={tabStyle(tab === 'export')} onClick={() => setTab('export')}>Patient Record Export</button>
          <button style={tabStyle(tab === 'terminology')} onClick={() => setTab('terminology')}>Terminology Mapper</button>
        </div>
      </div>

      <div style={{ padding: '24px 32px 32px' }}>

        {/* ── Tab 1: Export ── */}
        {tab === 'export' && (
          <>
            {/* Patient selector */}
            <div className="card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>Patient</label>
              <select value={exportPatient} onChange={e => setExportPatient(e.target.value)} style={{ ...inputStyle, flex: '1 1 220px', minWidth: 0 }}>
                <option value="">— Select patient —</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button
                className="btn btn-primary btn-sm"
                onClick={loadRecord}
                disabled={!exportPatient || loadingRecord}
              >
                {loadingRecord
                  ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading…</>
                  : <><GitMerge size={13} /> Load Record</>}
              </button>
            </div>

            {loadingRecord && (
              <div style={{ textAlign: 'center', padding: 80 }}>
                <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)', display: 'block', margin: '0 auto 12px' }} />
                <div style={{ fontSize: 14, color: 'var(--text2)' }}>Loading complete patient record…</div>
              </div>
            )}

            {!loadingRecord && record && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Stat tiles */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
                  {statCards.map(c => (
                    <div key={c.label} className="card" style={{ padding: '22px 24px', borderLeft: `4px solid ${c.color}`, borderRadius: 14 }}>
                      <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{c.value}</div>
                      <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600, marginTop: 5 }}>{c.label}</div>
                    </div>
                  ))}
                </div>

                {/* Export buttons */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-secondary btn-sm" onClick={downloadJSON}>
                    <Download size={13} /> Download JSON
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={copyFHIR}>
                    {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy FHIR Bundle</>}
                  </button>
                </div>

                {/* Accordion sections */}
                <div>
                  <AccordionSection title="Lab Results" count={res.lab_results?.length}>
                    <SimpleTable
                      headers={['Date', 'Test', 'Value', 'Unit', 'Interpretation']}
                      rows={(res.lab_results || []).map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '7px 10px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{r.result_date?.slice(0, 10)}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--text)', fontWeight: 600 }}>{r.test_name}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--text)', fontWeight: 700 }}>{r.value}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--text2)' }}>{r.unit}</td>
                          <td style={{ padding: '7px 10px' }}>{interpBadge(r.interpretation)}</td>
                        </tr>
                      ))}
                    />
                  </AccordionSection>

                  <AccordionSection title="Care Gaps" count={res.care_gaps?.length}>
                    <SimpleTable
                      headers={['Gap Type', 'Priority', 'Status']}
                      rows={(res.care_gaps || []).map((g, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '7px 10px', color: 'var(--text)' }}>{g.gap_type}</td>
                          <td style={{ padding: '7px 10px' }}>{interpBadge(g.priority)}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--text2)' }}>{g.status}</td>
                        </tr>
                      ))}
                    />
                  </AccordionSection>

                  <AccordionSection title="Appointments" count={res.appointments?.length}>
                    <SimpleTable
                      headers={['Type', 'Date', 'Status']}
                      rows={(res.appointments || []).map((a, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '7px 10px', color: 'var(--text)' }}>{a.appointment_type || a.type}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{a.scheduled_date?.slice(0, 10) || a.date?.slice(0, 10)}</td>
                          <td style={{ padding: '7px 10px' }}>{interpBadge(a.status)}</td>
                        </tr>
                      ))}
                    />
                  </AccordionSection>

                  <AccordionSection title="Discharge Summaries" count={res.discharge_summaries?.length}>
                    <SimpleTable
                      headers={['Date', 'Risk Level', 'Finalized']}
                      rows={(res.discharge_summaries || []).map((d, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '7px 10px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{d.discharge_date?.slice(0, 10) || d.created_at?.slice(0, 10)}</td>
                          <td style={{ padding: '7px 10px' }}>{interpBadge(d.risk_level)}</td>
                          <td style={{ padding: '7px 10px' }}>{d.finalized ? <Check size={14} color="#059669" /> : <span style={{ color: 'var(--text3)' }}>—</span>}</td>
                        </tr>
                      ))}
                    />
                  </AccordionSection>

                  <AccordionSection title="Consents" count={res.consents?.length}>
                    <SimpleTable
                      headers={['Type', 'Status', 'Expiry']}
                      rows={(res.consents || []).map((c, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '7px 10px', color: 'var(--text)' }}>{c.consent_type || c.type}</td>
                          <td style={{ padding: '7px 10px' }}>{interpBadge(c.status)}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{c.expiry_date?.slice(0, 10) || '—'}</td>
                        </tr>
                      ))}
                    />
                  </AccordionSection>

                  <AccordionSection title="SDOH Assessment" count={res.sdoh_assessment ? 1 : 0}>
                    {res.sdoh_assessment ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {res.sdoh_assessment.assessed_at && (
                          <div style={{ fontSize: 13, color: 'var(--text2)' }}>Assessed: {res.sdoh_assessment.assessed_at?.slice(0, 10)}</div>
                        )}
                        {Array.isArray(res.sdoh_assessment.z_codes) && res.sdoh_assessment.z_codes.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {res.sdoh_assessment.z_codes.map((z, i) => (
                              <span key={i} style={{ padding: '3px 10px', borderRadius: 99, background: '#ede9fe', color: '#6d28d9', fontSize: 12, fontWeight: 700 }}>{z}</span>
                            ))}
                          </div>
                        )}
                        {(res.sdoh_assessment.ai_summary || res.sdoh_assessment.summary) && (
                          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{res.sdoh_assessment.ai_summary || res.sdoh_assessment.summary}</div>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: 'var(--text3)' }}>No SDOH assessment on file.</div>
                    )}
                  </AccordionSection>

                  <AccordionSection title="Adverse Events" count={res.adverse_events?.length}>
                    <SimpleTable
                      headers={['Event Type', 'Severity', 'Status']}
                      rows={(res.adverse_events || []).map((e, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '7px 10px', color: 'var(--text)' }}>{e.event_type}</td>
                          <td style={{ padding: '7px 10px' }}>{interpBadge(e.severity)}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--text2)' }}>{e.status}</td>
                        </tr>
                      ))}
                    />
                  </AccordionSection>

                  <AccordionSection title="Portal Intakes" count={res.portal_intakes?.length}>
                    <SimpleTable
                      headers={['Date', 'Chief Complaint', 'Triage']}
                      rows={(res.portal_intakes || []).map((p, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '7px 10px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{p.created_at?.slice(0, 10)}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--text)' }}>{p.chief_complaint}</td>
                          <td style={{ padding: '7px 10px' }}>{interpBadge(p.triage_level)}</td>
                        </tr>
                      ))}
                    />
                  </AccordionSection>
                </div>
              </div>
            )}

            {!loadingRecord && !record && (
              <div style={{
                textAlign: 'center', padding: '80px 20px',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12
              }}>
                <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <GitMerge size={28} color="var(--primary)" />
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', marginBottom: 6 }}>No record loaded</div>
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>Select a patient and click "Load Record" to view their complete health record.</div>
              </div>
            )}
          </>
        )}

        {/* ── Tab 2: Terminology ── */}
        {tab === 'terminology' && (
          <div style={{ maxWidth: 800 }}>
            <div className="card" style={{ padding: '18px 20px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 5 }}>
                  Clinical Terms (one per line)
                </label>
                <textarea
                  value={termsInput}
                  onChange={e => setTermsInput(e.target.value)}
                  rows={5}
                  placeholder="e.g.&#10;diabetes mellitus&#10;hypertension&#10;metformin&#10;chest pain"
                  style={{ ...inputStyle, width: '100%', resize: 'vertical', minHeight: 110, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>Target System</label>
                <select value={targetSystem} onChange={e => setTargetSystem(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                  <option value="">All Systems</option>
                  <option value="SNOMED CT">SNOMED CT</option>
                  <option value="LOINC">LOINC</option>
                  <option value="RxNorm">RxNorm</option>
                  <option value="ICD-10">ICD-10</option>
                </select>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={mapTerms}
                  disabled={!termsInput.trim() || mapping}
                  style={{ flexShrink: 0 }}
                >
                  {mapping
                    ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Mapping…</>
                    : 'Map Terms'}
                </button>
              </div>
            </div>

            {mappings.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Mapping Results</span>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{mappings.length} terms mapped</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                        {['Original Term', 'Mapped Code', 'Display', 'System', 'Confidence'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '8px 14px', color: 'var(--text2)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mappings.map((m, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '9px 14px', color: 'var(--text)', fontWeight: 600 }}>{m.original_term}</td>
                          <td style={{ padding: '9px 14px', color: 'var(--primary)', fontFamily: 'monospace', fontSize: 12.5 }}>{m.code}</td>
                          <td style={{ padding: '9px 14px', color: 'var(--text)' }}>{m.display}</td>
                          <td style={{ padding: '9px 14px' }}>{systemBadge(m.system)}</td>
                          <td style={{ padding: '9px 14px' }}><ConfidenceBar value={m.confidence} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
