import React from 'react'
import {
  User, Phone, Mail, MapPin, Heart, Thermometer, Wind, Activity,
  Scale, Ruler, Droplets, Pill, ClipboardList, Calendar, FileJson,
  Building2, Stethoscope, BadgeInfo
} from 'lucide-react'

/* ── colour helpers ── */
const VITAL_COLOR = {
  'Heart rate':        { bg: '#fff1f2', border: '#fecdd3', icon: '#e11d48' },
  'Blood pressure':    { bg: '#fef3c7', border: '#fde68a', icon: '#d97706' },
  'Oxygen saturation': { bg: '#ecfdf5', border: '#a7f3d0', icon: '#059669' },
  'Body temperature':  { bg: '#fff7ed', border: '#fed7aa', icon: '#ea580c' },
  'Body weight':       { bg: '#eff6ff', border: '#bfdbfe', icon: '#2563eb' },
  'Body height':       { bg: '#f5f3ff', border: '#ddd6fe', icon: '#7c3aed' },
  'Respiratory rate':  { bg: '#f0fdf4', border: '#bbf7d0', icon: '#16a34a' },
}
const DEFAULT_VITAL = { bg: '#f8fafc', border: '#e2e8f0', icon: '#64748b' }

const VITAL_ICONS = {
  'Heart rate':        <Heart size={16} />,
  'Blood pressure':    <Activity size={16} />,
  'Oxygen saturation': <Droplets size={16} />,
  'Body temperature':  <Thermometer size={16} />,
  'Body weight':       <Scale size={16} />,
  'Body height':       <Ruler size={16} />,
  'Respiratory rate':  <Wind size={16} />,
}

export default function FhirPreview({ data, fileName }) {
  const { patient, vitals = [], conditions = [], medications = [], allergies = [], encounter } = data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── import banner ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 18px', background: 'linear-gradient(135deg, #0e7490 0%, #0284c7 100%)',
        borderRadius: 10, color: '#fff'
      }}>
        <FileJson size={20} style={{ flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>FHIR Bundle Imported</div>
          <div style={{ fontSize: 12, opacity: .8, marginTop: 2 }}>{fileName} — data extracted and pre-filled below</div>
        </div>
      </div>

      {/* ── patient demographics ── */}
      <Section icon={<User size={15} />} title="Patient Demographics" accent="#0e7490">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {patient.fullName      && <InfoTile label="Full Name"      value={patient.fullName} bold />}
          {patient.birthDate     && <InfoTile label="Date of Birth"  value={`${patient.birthDate} (${patient.age}y)`} />}
          {patient.gender        && <InfoTile label="Gender"         value={cap(patient.gender)} />}
          {patient.mrn           && <InfoTile label="MRN"            value={patient.mrn} mono />}
          {patient.maritalStatus && <InfoTile label="Marital Status" value={patient.maritalStatus} />}
          {patient.language      && <InfoTile label="Language"       value={patient.language} />}
        </div>
        {(patient.phone || patient.email || patient.address) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
            {patient.phone && <ContactTile icon={<Phone size={13} />} label="Phone" value={patient.phone} />}
            {patient.email && <ContactTile icon={<Mail size={13} />}  label="Email" value={patient.email} />}
            {patient.address && (
              <ContactTile icon={<MapPin size={13} />} label="Address"
                value={[patient.address, patient.city, patient.state, patient.country].filter(Boolean).join(', ')} />
            )}
          </div>
        )}
      </Section>

      {/* ── vital signs ── */}
      {vitals.length > 0 && (
        <Section icon={<Activity size={15} />} title="Vital Signs" accent="#0284c7">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {vitals.map((v, i) => {
              const theme = VITAL_COLOR[v.name] || DEFAULT_VITAL
              const icon  = VITAL_ICONS[v.name] || <Activity size={16} />
              return (
                <div key={i} style={{
                  padding: '14px 16px',
                  background: theme.bg,
                  border: `1.5px solid ${theme.border}`,
                  borderRadius: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, color: theme.icon }}>
                    {icon}
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: '#64748b' }}>{v.name}</span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', lineHeight: 1 }}>{v.value}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>{v.unit}</div>
                  {v.date && (
                    <div style={{ fontSize: 10.5, color: '#cbd5e1', marginTop: 6 }}>
                      {new Date(v.date).toLocaleDateString()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* ── conditions ── */}
      {conditions.length > 0 && (
        <Section icon={<ClipboardList size={15} />} title="Active Conditions" accent="#dc2626">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {conditions.map((c, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', background: '#fff', border: '1px solid #e2e8f0',
                borderLeft: '3px solid #dc2626', borderRadius: 8
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</div>
                  {c.onset && <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>Onset: {c.onset}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                    background: c.status === 'active' ? '#dcfce7' : '#f1f5f9',
                    color: c.status === 'active' ? '#15803d' : '#64748b'
                  }}>{cap(c.status || 'unknown')}</span>
                  {c.verified && (
                    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#e0f2fe', color: '#0369a1' }}>
                      {cap(c.verified)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── medications ── */}
      {medications.length > 0 && (
        <Section icon={<Pill size={15} />} title="Current Medications" accent="#7c3aed">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {medications.map((m, i) => (
              <div key={i} style={{
                padding: '12px 14px', background: '#faf5ff', border: '1.5px solid #ddd6fe', borderRadius: 9
              }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{m.name}</div>
                {m.dosage && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{m.dosage}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8 }}>
                  <span style={{
                    padding: '2px 7px', borderRadius: 99, fontSize: 10.5, fontWeight: 600,
                    background: m.status === 'active' ? '#d1fae5' : '#f1f5f9',
                    color: m.status === 'active' ? '#059669' : '#64748b'
                  }}>{cap(m.status || 'unknown')}</span>
                  {m.authored && (
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>since {m.authored}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── allergies ── */}
      {allergies.length > 0 && (
        <Section icon={<BadgeInfo size={15} />} title="Known Allergies" accent="#ea580c">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {allergies.map((a, i) => (
              <div key={i} style={{
                padding: '8px 14px', background: '#fff7ed',
                border: '1.5px solid #fed7aa', borderRadius: 8
              }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{a.substance}</div>
                {a.reaction && <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>{a.reaction}</div>}
                {a.severity && (
                  <span style={{
                    display: 'inline-block', marginTop: 4, padding: '1px 7px', borderRadius: 99,
                    fontSize: 10.5, fontWeight: 600,
                    background: a.severity === 'severe' ? '#fee2e2' : '#fef3c7',
                    color: a.severity === 'severe' ? '#dc2626' : '#d97706'
                  }}>{cap(a.severity)}</span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── encounter ── */}
      {encounter && (
        <Section icon={<Building2 size={15} />} title="Recent Encounter" accent="#0369a1">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            <InfoTile label="Type"   value={encounter.type || '—'} />
            <InfoTile label="Class"  value={encounter.class ? cap(encounter.class) : '—'} />
            <InfoTile label="Status" value={encounter.status ? cap(encounter.status) : '—'} />
            {encounter.start && <InfoTile label="Start" value={fmtDate(encounter.start)} />}
            {encounter.end   && <InfoTile label="End"   value={fmtDate(encounter.end)}   />}
          </div>
        </Section>
      )}
    </div>
  )
}

/* ── sub-components ── */
function Section({ icon, title, accent, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '13px 18px', borderBottom: '1px solid #f1f5f9',
        background: '#fafbfc', color: accent
      }}>
        {icon}
        <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{title}</span>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  )
}

function InfoTile({ label, value, bold, mono }) {
  return (
    <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
      <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: 13, color: '#0f172a',
        fontWeight: bold ? 700 : 500,
        fontFamily: mono ? 'Menlo, Consolas, monospace' : 'inherit'
      }}>{value || '—'}</div>
    </div>
  )
}

function ContactTile({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
      <div style={{ color: '#0e7490', flexShrink: 0, marginTop: 1 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
        <div style={{ fontSize: 12.5, color: '#0f172a', marginTop: 2 }}>{value}</div>
      </div>
    </div>
  )
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '' }
function fmtDate(ts) { try { return new Date(ts).toLocaleString() } catch { return ts } }
