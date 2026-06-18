import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

export default function SharedCase() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then(r => {
        if (!r.ok) { setError(true); setLoading(false); return null }
        return r.json()
      })
      .then(d => {
        if (d) setData(d)
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [token])

  const pageStyle = {
    minHeight: '100vh',
    background: '#f8fafc',
    fontFamily: '-apple-system, system-ui, "Segoe UI", sans-serif',
    color: '#0f172a',
    padding: '40px 20px',
  }
  const cardStyle = {
    maxWidth: 760,
    margin: '0 auto',
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 4px 20px rgba(0,0,0,.06)',
    overflow: 'hidden',
  }
  const headerStyle = {
    background: 'linear-gradient(135deg, #0284c7, #0369a1)',
    color: '#fff',
    padding: '24px 32px',
  }
  const sectionStyle = {
    padding: '20px 32px',
    borderBottom: '1px solid #f1f5f9',
  }
  const h2Style = {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    color: '#64748b',
    margin: '0 0 10px 0',
    fontWeight: 700,
  }
  const labelStyle = { fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, padding: 60, textAlign: 'center', color: '#64748b' }}>Loading…</div>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, padding: 60, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, color: '#0f172a', marginTop: 0 }}>Vianova Health</h1>
          <p style={{ color: '#64748b', fontSize: 14 }}>This case summary is not available.</p>
        </div>
      </div>
    )
  }

  const a = data.analysis
  const dr = a?.doctor_review || {}
  const diffs = (a?.differential_assessment || []).slice(0, 3)
  const meds = a?.draft_treatment_plan?.pharmacological_suggestions || []
  const nonPharm = a?.draft_treatment_plan?.non_pharmacological || []

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div style={{ fontSize: 12, opacity: 0.85, letterSpacing: '.05em', textTransform: 'uppercase' }}>Vianova Health</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>Approved Case Summary</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
            Case {data.case_id.slice(0, 8)} · {new Date(data.created_at).toLocaleDateString()}
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>Patient</h2>
          <div style={{ display: 'flex', gap: 24 }}>
            <div>
              <div style={labelStyle}>Age</div>
              <div style={{ fontSize: 15, fontWeight: 500, marginTop: 2 }}>{data.patient_input?.age || '—'}</div>
            </div>
            <div>
              <div style={labelStyle}>Sex</div>
              <div style={{ fontSize: 15, fontWeight: 500, marginTop: 2 }}>{data.patient_input?.sex || '—'}</div>
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>Presenting Complaint</h2>
          <div style={{
            background: '#f8fafc', borderLeft: '3px solid #0284c7',
            padding: '12px 14px', borderRadius: 6, fontSize: 14,
          }}>{a?.presenting_complaint || '—'}</div>
        </div>

        {dr.final_approved_cure && (
          <div style={sectionStyle}>
            <h2 style={h2Style}>Approved Treatment Plan</h2>
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              padding: '14px 16px', borderRadius: 8, fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap',
            }}>{dr.final_approved_cure}</div>
          </div>
        )}

        {(nonPharm.length > 0 || meds.length > 0) && (
          <div style={sectionStyle}>
            <h2 style={h2Style}>Care Details</h2>
            {nonPharm.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Non-Pharmacological</div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#334155', lineHeight: 1.7 }}>
                  {nonPharm.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            )}
            {meds.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Medications</div>
                {meds.map((m, i) => (
                  <div key={i} style={{
                    background: '#fffbeb', border: '1px solid #fde68a',
                    padding: '8px 12px', borderRadius: 6, marginBottom: 6, fontSize: 13,
                  }}>
                    <strong>{m.option}</strong> — {m.rationale}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {dr.doctor_notes && (
          <div style={sectionStyle}>
            <h2 style={h2Style}>Doctor Notes</h2>
            <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{dr.doctor_notes}</div>
            {dr.reviewed_by && (
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                Reviewed by {dr.reviewed_by}{dr.reviewed_at ? ` on ${new Date(dr.reviewed_at).toLocaleString()}` : ''}
              </div>
            )}
          </div>
        )}

        {diffs.length > 0 && (
          <div style={sectionStyle}>
            <h2 style={h2Style}>AI Differential Assessment (Top 3)</h2>
            {diffs.map((d, i) => (
              <div key={i} style={{
                padding: '8px 12px', background: '#f8fafc',
                borderRadius: 6, marginBottom: 6, fontSize: 13,
              }}>
                <strong style={{ color: '#0284c7' }}>{d.possibility}</strong>
                <span style={{ marginLeft: 8, fontSize: 11, color: '#64748b' }}>({d.likelihood})</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: '16px 32px', background: '#f8fafc', fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
          This summary was reviewed and approved by a licensed physician via the Vianova Health Cure Analyzer System.
          AI-assisted clinical decision support — not a substitute for direct medical care. Confidential health information.
        </div>
      </div>
    </div>
  )
}
