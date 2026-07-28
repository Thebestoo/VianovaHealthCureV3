import React from 'react'
import { Calendar, Phone, Mail, MapPin, Languages, Heart, Pill, AlertTriangle, FileJson } from 'lucide-react'
import { toArr, qualityTier } from '../utils/patientUtils.js'

function Tag({ label, color = '#1d4ed8', bg = '#dbeafe' }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600, color, background: bg, margin: '2px 3px 2px 0' }}>{label}</span>
  )
}

/**
 * Compact, consistent patient-context card — every page that operates on a
 * selected patient (RPM, Labs, Discharge, CCM, Calls, Case Review, …) renders
 * the same demographics/conditions/medications/allergies summary instead of
 * each page inventing its own partial view. `patient` is expected to carry
 * the gen_patients-shaped fields (name, dob, sex, mrn, phone, email, address,
 * language, conditions/medications/allergies as JSON-or-CSV, notes) — fields
 * that are missing are simply omitted, so this also works with a patient
 * object that's been enriched from a smaller table.
 */
export default function PatientSnapshot({ patient, compact = false }) {
  if (!patient) return null
  const conditions  = toArr(patient.conditions)
  const medications = toArr(patient.medications)
  const allergies   = toArr(patient.allergies)
  const score       = patient.data_quality_score
  const tier        = score != null ? qualityTier(score) : null

  return (
    <div className="card" style={{ padding: compact ? '12px 16px' : '16px 20px', marginBottom: compact ? 12 : 18 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'center', marginBottom: (conditions.length || medications.length || allergies.length) ? 10 : 0 }}>
        {patient.dob && <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={12} /> {patient.dob}</span>}
        {patient.sex && <span style={{ fontSize: 12, color: 'var(--text2)' }}>{patient.sex}</span>}
        {patient.mrn && <span style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'monospace' }}>MRN: {patient.mrn}</span>}
        {patient.phone && <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {patient.phone}</span>}
        {patient.email && <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={12} /> {patient.email}</span>}
        {patient.address && <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {patient.address}</span>}
        {patient.language && <span style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4 }}><Languages size={12} /> {patient.language}</span>}
        {tier && (
          <span title={`Data quality: ${score}/100`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 700, color: tier.color, background: tier.bg }}>
            {score}% {tier.label}
          </span>
        )}
      </div>
      {conditions.length > 0 && (
        <div style={{ marginBottom: 5, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
          <Heart size={12} color="#2563eb" style={{ marginRight: 2 }} />
          {conditions.map(c => <Tag key={c} label={c} />)}
        </div>
      )}
      {medications.length > 0 && (
        <div style={{ marginBottom: 5, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
          <Pill size={12} color="#059669" style={{ marginRight: 2 }} />
          {medications.map(m => <Tag key={m} label={m} color="#047857" bg="#d1fae5" />)}
        </div>
      )}
      {allergies.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
          <AlertTriangle size={12} color="#dc2626" style={{ marginRight: 2 }} />
          {allergies.map(a => <Tag key={a} label={a} color="#b91c1c" bg="#fee2e2" />)}
        </div>
      )}
      {!compact && patient.notes?.trim() && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 12.5, color: 'var(--text2)', display: 'flex', gap: 5 }}>
          <FileJson size={12} style={{ marginTop: 2, flexShrink: 0 }} color="var(--text3)" />
          <span>{patient.notes}</span>
        </div>
      )}
    </div>
  )
}
