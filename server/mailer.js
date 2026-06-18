import nodemailer from 'nodemailer'

const USER = process.env.GMAIL_USER
const PASS = process.env.GMAIL_PASS

let transporter = null

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: USER, pass: PASS },
    })
  }
  return transporter
}

/**
 * Send an email.
 * Returns { ok: true } or { ok: false, error: string }
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!USER || !PASS || USER === 'your_gmail@gmail.com') {
    return { ok: false, error: 'Gmail credentials not configured in .env' }
  }
  if (!to) {
    return { ok: false, error: 'No recipient email on this key — add one with: node server/keys.js email <key> <email>' }
  }
  try {
    await getTransporter().sendMail({
      from: `"Vianova Health" <${USER}>`,
      to,
      subject,
      html,
      text: text || subject,
    })
    return { ok: true }
  } catch (err) {
    transporter = null  // reset so next attempt creates a fresh one
    return { ok: false, error: err.message }
  }
}

/* ── Email templates ── */

export function tplNewCase({ caseId, label, age, sex, complaint, confidence, emergency }) {
  const urgentBanner = emergency
    ? `<div style="background:#fee2e2;border-left:4px solid #dc2626;padding:12px 16px;margin-bottom:16px;border-radius:4px;color:#7f1d1d;font-weight:600;">
         ⚠ EMERGENCY / URGENT — Immediate review required
       </div>`
    : ''

  return {
    subject: emergency
      ? `🚨 EMERGENCY Case Submitted — ${caseId.slice(0, 8)}`
      : `New Case Submitted — ${caseId.slice(0, 8)}`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;background:#f8fafc;padding:24px;">
  <div style="background:linear-gradient(135deg,#0e4f7c,#0284c7);padding:24px;border-radius:12px 12px 0 0;color:#fff;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.7;margin-bottom:6px;">Vianova Health · Cure Analyzer System</div>
    <div style="font-size:22px;font-weight:700;">New Case Submitted</div>
    <div style="opacity:.75;font-size:13px;margin-top:4px;">Submitted by ${label}</div>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
    ${urgentBanner}
    <table style="width:100%;border-collapse:collapse;font-size:13.5px;">
      <tr><td style="padding:8px 0;color:#64748b;width:140px;">Case ID</td><td style="font-family:monospace;color:#0f172a;">${caseId}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">Patient</td><td>${age ? age + 'y' : '—'} ${sex || ''}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">Chief Complaint</td><td>${complaint || '—'}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">AI Confidence</td><td><span style="font-weight:600;color:${confidence === 'high' ? '#059669' : confidence === 'moderate' ? '#d97706' : '#dc2626'}">${confidence || '—'}</span></td></tr>
    </table>
    <div style="margin-top:20px;">
      <a href="http://localhost:5173/cases/${caseId}" style="background:#0284c7;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">Open Case →</a>
    </div>
    <div style="margin-top:20px;font-size:11.5px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:12px;">
      AI draft — physician review required before any clinical decision.
    </div>
  </div>
</div>`,
  }
}

export function tplEmergencyAlert({ caseId, label, age, sex, complaint, redFlags }) {
  const flags = Array.isArray(redFlags) ? redFlags : []
  return {
    subject: `🚨 EMERGENCY ALERT — Immediate Action Required`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;background:#f8fafc;padding:24px;">
  <div style="background:linear-gradient(135deg,#7f1d1d,#dc2626);padding:24px;border-radius:12px 12px 0 0;color:#fff;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.7;margin-bottom:6px;">Vianova Health · Emergency Alert</div>
    <div style="font-size:22px;font-weight:700;">Emergency Case Detected</div>
    <div style="opacity:.8;font-size:13px;margin-top:4px;">Submitted by ${label} — Immediate review required</div>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #fecaca;border-top:none;">
    <table style="width:100%;border-collapse:collapse;font-size:13.5px;">
      <tr><td style="padding:8px 0;color:#64748b;width:140px;">Case ID</td><td style="font-family:monospace;color:#0f172a;">${caseId}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">Patient</td><td>${age ? age + 'y' : '—'} ${sex || ''}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">Chief Complaint</td><td>${complaint || '—'}</td></tr>
    </table>
    ${flags.length ? `
    <div style="margin-top:16px;">
      <div style="font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Red Flags</div>
      ${flags.map(f => `<div style="background:#fee2e2;border-radius:6px;padding:8px 12px;margin-bottom:6px;font-size:13px;color:#7f1d1d;">• ${f}</div>`).join('')}
    </div>` : ''}
    <div style="margin-top:20px;">
      <a href="http://localhost:5173/cases/${caseId}" style="background:#dc2626;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">Review Now →</a>
    </div>
  </div>
</div>`,
  }
}

export function tplCaseApproved({ caseId, label, age, sex, complaint, approvedBy, treatment }) {
  return {
    subject: `Case Approved — ${caseId.slice(0, 8)}`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;background:#f8fafc;padding:24px;">
  <div style="background:linear-gradient(135deg,#064e3b,#059669);padding:24px;border-radius:12px 12px 0 0;color:#fff;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.7;margin-bottom:6px;">Vianova Health · Case Update</div>
    <div style="font-size:22px;font-weight:700;">Case Approved</div>
    <div style="opacity:.8;font-size:13px;margin-top:4px;">Reviewed by ${approvedBy || label}</div>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #a7f3d0;border-top:none;">
    <table style="width:100%;border-collapse:collapse;font-size:13.5px;">
      <tr><td style="padding:8px 0;color:#64748b;width:140px;">Case ID</td><td style="font-family:monospace;color:#0f172a;">${caseId}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">Patient</td><td>${age ? age + 'y' : '—'} ${sex || ''}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">Chief Complaint</td><td>${complaint || '—'}</td></tr>
    </table>
    ${treatment ? `
    <div style="margin-top:16px;background:#ecfdf5;border-radius:8px;padding:14px 16px;">
      <div style="font-size:12px;font-weight:600;color:#059669;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Approved Treatment Plan</div>
      <div style="font-size:13.5px;color:#0f172a;line-height:1.6;">${treatment}</div>
    </div>` : ''}
    <div style="margin-top:20px;">
      <a href="http://localhost:5173/cases/${caseId}" style="background:#059669;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">View Case →</a>
    </div>
  </div>
</div>`,
  }
}

export function tplTreatmentEdited({ caseId, label, age, sex, oldTreatment, newTreatment, notes }) {
  return {
    subject: `Treatment Plan Updated — ${caseId.slice(0, 8)}`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;background:#f8fafc;padding:24px;">
  <div style="background:linear-gradient(135deg,#4c1d95,#7c3aed);padding:24px;border-radius:12px 12px 0 0;color:#fff;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.7;margin-bottom:6px;">Vianova Health · Case Update</div>
    <div style="font-size:22px;font-weight:700;">Treatment Plan Edited</div>
    <div style="opacity:.8;font-size:13px;margin-top:4px;">Updated by ${label}</div>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #ddd6fe;border-top:none;">
    <table style="width:100%;border-collapse:collapse;font-size:13.5px;">
      <tr><td style="padding:8px 0;color:#64748b;width:140px;">Case ID</td><td style="font-family:monospace;color:#0f172a;">${caseId}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">Patient</td><td>${age ? age + 'y' : '—'} ${sex || ''}</td></tr>
    </table>
    ${oldTreatment ? `
    <div style="margin-top:14px;background:#f1f5f9;border-radius:8px;padding:12px 14px;">
      <div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;margin-bottom:4px;">Previous</div>
      <div style="font-size:13px;color:#475569;line-height:1.5;">${oldTreatment}</div>
    </div>` : ''}
    ${newTreatment ? `
    <div style="margin-top:10px;background:#ede9fe;border-radius:8px;padding:12px 14px;">
      <div style="font-size:11px;font-weight:600;color:#7c3aed;text-transform:uppercase;margin-bottom:4px;">Updated</div>
      <div style="font-size:13px;color:#0f172a;line-height:1.5;">${newTreatment}</div>
    </div>` : ''}
    ${notes ? `
    <div style="margin-top:10px;background:#f0fdf4;border-radius:8px;padding:12px 14px;">
      <div style="font-size:11px;font-weight:600;color:#059669;text-transform:uppercase;margin-bottom:4px;">Doctor Notes</div>
      <div style="font-size:13px;color:#0f172a;line-height:1.5;">${notes}</div>
    </div>` : ''}
    <div style="margin-top:20px;">
      <a href="http://localhost:5173/cases/${caseId}" style="background:#7c3aed;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">View Case →</a>
    </div>
  </div>
</div>`,
  }
}
