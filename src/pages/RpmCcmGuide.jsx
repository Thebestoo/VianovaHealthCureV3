import React from 'react'
import { BookOpen, UserPlus, Radio, Activity, CalendarCheck, FileCheck2, CheckCircle2, CircleDashed } from 'lucide-react'

const STEPS = [
  {
    icon: UserPlus,
    title: '1. Patient Enrollment',
    body: 'Patients with two or more chronic conditions are identified as candidates for combined RPM + CCM monitoring. Consent is captured separately for each program before enrollment.',
    status: 'Enroll forms (CCM.jsx / RPM.jsx) capture conditions and consent; care plan is auto-drafted by AI the moment a patient is enrolled in CCM.',
  },
  {
    icon: Radio,
    title: '2. Device Setup & Data Transmission',
    body: "Patients are given connected devices (BP cuffs, glucose meters, pulse oximeters) that report readings back to the care team, cutting down on manual clinic visits.",
    status: 'Not yet automated here — readings are entered by staff via "Log Reading" (with an AI-suggest helper). No device/API ingestion pipeline exists yet.',
    manual: true,
  },
  {
    icon: Activity,
    title: '3. Continuous Monitoring & Analysis',
    body: 'The care team watches for trends and out-of-range readings so they can intervene or adjust medication quickly.',
    status: 'Each vital has normal/critical ranges (VITALS_CONFIG); the roster automatically sorts and flags patients as critical/warning from their latest reading.',
  },
  {
    icon: CalendarCheck,
    title: '4. Monthly Care Management Activities',
    body: 'Each month, the CCM team follows up with the patient to review progress, discuss symptoms, and update the care plan — the human layer on top of the device data.',
    status: 'A logged phone call can be linked at enrollment to seed the first time entry, and a claim is auto-drafted the moment ≥20 min/month is logged.',
  },
  {
    icon: FileCheck2,
    title: '5. Documentation & Billing',
    body: 'Every RPM alert and CCM follow-up is logged against the right CMS code so reimbursement is accurate and the record is audit-ready.',
    status: 'Claims are stored with coding, compliance flags, scrub results, and an exportable FHIR Claim resource for every auto-billed code below.',
  },
]

const CPT_CODES = [
  { program: 'RPM', code: '99453', desc: 'Initial setup & patient education (one-time)', live: true, note: 'Auto-billed at RPM enrollment' },
  { program: 'RPM', code: '99454', desc: 'Device supply with daily recording/transmission (16+ of 30 days)', live: false, note: 'Not yet automated — would need device data-volume tracking' },
  { program: 'RPM', code: '99457', desc: 'Treatment management, first 20 min/month', live: true, note: 'Auto-drafted once ≥20 min/month is logged' },
  { program: 'RPM', code: '99458', desc: 'Treatment management, each additional 20 min/month', live: false, note: 'Not yet automated — only the first 20-min code is tracked' },
  { program: 'CCM', code: 'G0506', desc: 'Comprehensive care planning at CCM initiation (one-time)', live: true, note: 'Auto-billed at CCM enrollment' },
  { program: 'CCM', code: '99490', desc: 'Chronic Care Management, first 20 min/month', live: true, note: 'Auto-drafted once ≥20 min/month is logged' },
  { program: 'CCM', code: '99439', desc: 'Chronic Care Management, each additional 20 min/month', live: false, note: 'Not yet automated' },
  { program: 'CCM', code: '99487', desc: 'Complex CCM, first 60 min/month', live: false, note: 'Not yet automated — complex CCM isn’t distinguished from standard CCM yet' },
  { program: 'CCM', code: '99489', desc: 'Complex CCM, each additional 30 min/month', live: false, note: 'Not yet automated' },
]

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24 }

export default function RpmCcmGuide() {
  return (
    <div style={{ padding: '24px 28px', maxWidth: 980, margin: '0 auto' }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg, var(--primary), #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <BookOpen size={26} color="var(--surface)" />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--text)' }}>RPM + CCM Combined Care Guide</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text2)' }}>
            The end-to-end workflow, CPT reference, and CMS billing rules for Remote Patient Monitoring and Chronic Care Management on this platform.
          </p>
        </div>
      </div>

      {/* Workflow */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>How it works</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {STEPS.map((s, i) => (
            <div key={s.title} style={{ display: 'flex', gap: 14, paddingBottom: i < STEPS.length - 1 ? 20 : 0, position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <s.icon size={17} color="var(--primary-dark)" />
                </div>
                {i < STEPS.length - 1 && <div style={{ flex: 1, width: 2, background: 'var(--border)', marginTop: 4 }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{s.title}</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3, lineHeight: 1.5 }}>{s.body}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11.5, color: s.manual ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>
                  {s.manual ? <CircleDashed size={12} /> : <CheckCircle2 size={12} />}
                  {s.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CPT reference */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>CPT code reference</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>Status reflects what this platform auto-bills today, not what's billable under CMS rules in general.</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text3)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.03em' }}>
                <th style={{ padding: '6px 10px 10px 0' }}>Program</th>
                <th style={{ padding: '6px 10px 10px' }}>Code</th>
                <th style={{ padding: '6px 10px 10px' }}>Description</th>
                <th style={{ padding: '6px 10px 10px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {CPT_CODES.map(c => (
                <tr key={c.code} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 10px 10px 0', color: 'var(--text2)', fontWeight: 600 }}>{c.program}</td>
                  <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text)' }}>{c.code}</td>
                  <td style={{ padding: '10px', color: 'var(--text2)' }}>{c.desc}</td>
                  <td style={{ padding: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: c.live ? 'var(--success)' : 'var(--text3)', fontWeight: 600, fontSize: 12 }}>
                      {c.live ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}
                      {c.live ? 'Live' : 'Not yet automated'}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>{c.note}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* CMS rule */}
      <div style={{ ...cardStyle, background: 'var(--primary-light)', border: '1px solid var(--primary-light)' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--primary-dark)', marginBottom: 6 }}>CMS rule: billing RPM and CCM together</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          CMS allows the same patient to be billed for both RPM and CCM in the same month, provided each program's time and activities are documented separately — distinct patient communications and clear time logs per program. This platform enforces that separation structurally: RPM time comes from <code>rpm_readings</code> and CCM time from <code>ccm_checkins</code>, so the two are never mixed into a single threshold check.
        </div>
      </div>
    </div>
  )
}
