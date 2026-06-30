/**
 * mailer.js — Vianova Health email system
 *
 * Provider priority (on cloud/Render — SMTP port 587 is blocked):
 *   1. Brevo  (HTTP API — works everywhere, free 300/day)
 *   2. Resend (HTTP API — fallback)
 *   3. Gmail SMTP — LOCAL DEV ONLY (Render blocks port 587)
 *
 * Sender display: "Vianova Health" <vianova.healthtest@gmail.com>
 * NOTE: to send FROM that Gmail address via Brevo/Resend you must verify
 * it as a sender in your Brevo/Resend dashboard, OR use the Brevo default
 * sender and set replyTo to vianova.healthtest@gmail.com.
 */

import nodemailer from 'nodemailer'
import { lookup as dnsLookup } from 'dns'

const GMAIL_USER  = process.env.GMAIL_USER
const GMAIL_PASS  = process.env.GMAIL_PASS
const BREVO_KEY   = process.env.BREVO_API_KEY
const RESEND_KEY  = process.env.RESEND_API_KEY

const SENDER_NAME  = 'Vianova Health'
const SENDER_EMAIL = 'vianova.healthtest@gmail.com'

let gmailTransporter = null

function getGmailTransporter() {
  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
      // Force IPv4 — Render's IPv6 routing to Google SMTP is unreliable
      lookup: (hostname, options, cb) => dnsLookup(hostname, { ...options, family: 4 }, cb),
    })
  }
  return gmailTransporter
}

async function sendViaGmail(to, subject, html, text) {
  try {
    await getGmailTransporter().sendMail({
      from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
      to, subject,
      html: html || `<p>${text || subject}</p>`,
      text: text || subject,
    })
    return { ok: true }
  } catch (err) {
    gmailTransporter = null  // reset so next call gets a fresh transporter
    return { ok: false, error: err.message }
  }
}

async function sendViaBrevo(to, subject, html, attachments) {
  const body = {
    sender:      { name: SENDER_NAME, email: SENDER_EMAIL },
    to:          [{ email: to }],
    replyTo:     { email: SENDER_EMAIL },
    subject,
    htmlContent: html,
  }
  if (attachments && attachments.length > 0) body.attachment = attachments
  const res  = await fetch('https://api.brevo.com/v3/smtp/email', {
    method:  'POST',
    headers: { 'api-key': BREVO_KEY, 'content-type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: data.message || `Brevo HTTP ${res.status}` }
  return { ok: true }
}

async function sendViaResend(to, subject, html) {
  const res  = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ from: `${SENDER_NAME} <${SENDER_EMAIL}>`, to: [to], subject, html }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: data.message || data.error || `Resend HTTP ${res.status}` }
  return { ok: true }
}

/**
 * Send an email. Returns { ok: true } or { ok: false, error: string }.
 *
 * Priority: Brevo (HTTP) → Resend (HTTP) → Gmail SMTP (local dev only).
 * HTTP APIs are used first because cloud hosts (Render, Railway, Fly)
 * block outbound SMTP port 587, causing connection timeouts.
 */
export async function sendEmail({ to, subject, html, text, attachments }) {
  if (!to) return { ok: false, error: 'No recipient email' }
  const body = html || `<p>${text || subject}</p>`

  // 1. Brevo — HTTP API, works on all cloud platforms
  if (BREVO_KEY) {
    try { return await sendViaBrevo(to, subject, body, attachments) }
    catch (e) { /* fall through to next provider */ }
  }

  // 2. Resend — HTTP API fallback
  if (RESEND_KEY) {
    try { return await sendViaResend(to, subject, body) }
    catch (e) { /* fall through */ }
  }

  // 3. Gmail SMTP — only reliable in local dev; Render blocks port 587
  if (GMAIL_USER && GMAIL_PASS) {
    return sendViaGmail(to, subject, body, text)
  }

  return { ok: false, error: 'No email provider configured. Set BREVO_API_KEY (recommended) or RESEND_API_KEY in environment variables.' }
}

/* ─────────────────────────────────────────────────────────────────────────────
   SHARED HTML BUILDER
   ───────────────────────────────────────────────────────────────────────────── */

const HEARTBEAT_SVG = `<svg width="16" height="12" viewBox="0 0 32 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin:0 6px">
  <polyline points="0,12 6,12 9,4 13,20 17,8 20,16 24,12 32,12" stroke="rgba(255,255,255,0.7)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

function fmtNow() {
  return new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function alertPanel({ borderColor, bgColor, textColor, title, content }) {
  return `
<div style="border-left:4px solid ${borderColor};background:${bgColor};border-radius:6px;padding:12px 16px;margin:14px 0;">
  ${title ? `<div style="font-size:12px;font-weight:700;color:${textColor};text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">${title}</div>` : ''}
  <div style="font-size:13.5px;color:${textColor};line-height:1.5;">${content}</div>
</div>`
}

/**
 * Build a full HTML email.
 *
 * @param {object} opts
 * @param {string}   opts.headerGradient   - CSS gradient string for header
 * @param {string}   opts.title            - Main heading in header
 * @param {string}   [opts.subtitle]       - Subtitle under heading
 * @param {string}   [opts.accentColor]    - Accent for button / highlights (#hex)
 * @param {Array}    [opts.rows]           - Array of { label, value, valueColor? }
 * @param {Array}    [opts.alertPanels]    - Array of { borderColor, bgColor, textColor, title?, content }
 * @param {string}   [opts.actionUrl]      - CTA button URL
 * @param {string}   [opts.actionLabel]    - CTA button text
 * @param {string[]} [opts.extraSections]  - Raw HTML strings inserted after rows
 */
function buildEmail({ headerGradient, title, subtitle, accentColor = '#0284c7', rows = [], alertPanels = [], actionUrl, actionLabel, extraSections = [] }) {
  const tableRows = rows.map((r, i) => `
    <tr style="${i % 2 === 1 ? 'background:#f8fafc;' : ''}">
      <td style="padding:9px 10px;color:#64748b;width:130px;font-size:13px;vertical-align:top;">${r.label}</td>
      <td style="padding:9px 10px;color:${r.valueColor || '#0f172a'};font-weight:600;font-size:13px;">${r.value}</td>
    </tr>`).join('')

  const panelsHtml = alertPanels.map(p => alertPanel(p)).join('')

  const btnHtml = actionUrl && actionLabel ? `
<div style="text-align:center;margin:24px 0 8px;">
  <a href="${actionUrl}" style="display:inline-block;background:${accentColor};color:#fff;text-decoration:none;padding:0 28px;height:44px;line-height:44px;border-radius:8px;font-weight:700;font-size:14px;">${actionLabel}</a>
</div>` : ''

  const extraHtml = extraSections.join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
<div style="max-width:600px;margin:24px auto;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);">

  <!-- HEADER -->
  <div style="background:${headerGradient};padding:28px 28px 22px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;">
      <div style="font-size:11px;color:rgba(255,255,255,.75);font-weight:600;letter-spacing:.08em;text-transform:uppercase;">VIANOVA HEALTH ${HEARTBEAT_SVG} Cure Analyzer System</div>
      <div style="font-size:11px;color:rgba(255,255,255,.65);white-space:nowrap;">${fmtNow()}</div>
    </div>
    <div style="font-size:26px;font-weight:700;color:#ffffff;margin-top:12px;line-height:1.2;">${title}</div>
    ${subtitle ? `<div style="font-size:14px;color:rgba(255,255,255,.85);margin-top:6px;">${subtitle}</div>` : ''}
  </div>

  <!-- CONTENT -->
  <div style="padding:28px;">
    ${tableRows ? `<table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;">${tableRows}</table>` : ''}
    ${panelsHtml}
    ${extraHtml}
    ${btnHtml}
  </div>

  <!-- FOOTER -->
  <div style="border-top:1px solid #e2e8f0;padding:18px 28px;background:#f8fafc;">
    <p style="margin:0 0 4px;font-size:12px;color:#64748b;text-align:center;font-weight:600;">Vianova Health — AI-Assisted Clinical Decision Support</p>
    <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;text-align:center;">This is an automated notification. AI drafts require physician review before any clinical action.</p>
    <p style="margin:0;font-size:11px;color:#cbd5e1;text-align:center;">You are receiving this because you have an active account. &nbsp;|&nbsp; &copy; 2025 Vianova Health. HIPAA-compliant platform.</p>
  </div>

</div>
</body>
</html>`
}

/* ─────────────────────────────────────────────────────────────────────────────
   EMAIL TEMPLATES
   ───────────────────────────────────────────────────────────────────────────── */

export function tplNewCase({ caseId, label, age, sex, complaint, confidence, emergency, diagnoses = [] }) {
  const gradient = emergency
    ? 'linear-gradient(135deg,#7f1d1d,#dc2626)'
    : 'linear-gradient(135deg,#1e3a5f,#0284c7)'
  const title = emergency
    ? 'Emergency Case Requires Immediate Review'
    : 'New Case Submitted'
  const confColor = confidence === 'high' ? '#059669' : confidence === 'moderate' ? '#d97706' : '#dc2626'
  const topDx = diagnoses.slice(0, 2).join(', ') || '—'

  const rows = [
    { label: 'Case ID', value: `<span style="font-family:monospace;">${caseId}</span>` },
    { label: 'Submitted By', value: label || '—' },
    { label: 'Patient Profile', value: `${age ? age + 'y' : '—'} ${sex || ''}`.trim() || '—' },
    { label: 'Chief Complaint', value: complaint || '—' },
    { label: 'AI Confidence', value: `<span style="color:${confColor};font-weight:700;">${confidence || '—'}</span>` },
    { label: 'Top Diagnoses', value: topDx },
  ]

  const alertPanels = emergency ? [{
    borderColor: '#dc2626',
    bgColor: '#fee2e2',
    textColor: '#7f1d1d',
    title: null,
    content: 'Emergency / Urgent — This case requires immediate physician review.',
  }] : []

  return {
    subject: emergency
      ? `EMERGENCY Case Submitted — ${caseId.slice(0, 8)}`
      : `New Case Submitted — ${caseId.slice(0, 8)}`,
    html: buildEmail({
      headerGradient: gradient,
      title,
      subtitle: `Submitted by ${label || '—'}`,
      accentColor: emergency ? '#dc2626' : '#0284c7',
      rows,
      alertPanels,
      actionUrl: `https://vianova-health.onrender.com/cases/${caseId}`,
      actionLabel: 'Review Case →',
    }),
  }
}

export function tplEmergencyAlert({ caseId, label, age, sex, complaint, redFlags = [] }) {
  const flags = Array.isArray(redFlags) ? redFlags : []
  const flagsHtml = flags.length
    ? `<div style="margin-top:14px;">${flags.map(f => `<div style="background:#fee2e2;border-radius:5px;padding:7px 12px;margin-bottom:6px;color:#7f1d1d;font-size:13px;">&#9888; ${f}</div>`).join('')}</div>`
    : ''

  return {
    subject: 'EMERGENCY ALERT — Immediate Action Required',
    html: buildEmail({
      headerGradient: 'linear-gradient(135deg,#450a0a,#991b1b)',
      title: 'EMERGENCY ALERT — Immediate Action Required',
      subtitle: `Submitted by ${label || '—'}`,
      accentColor: '#dc2626',
      rows: [
        { label: 'Case ID', value: `<span style="font-family:monospace;">${caseId}</span>` },
        { label: 'Submitted By', value: label || '—' },
        { label: 'Patient', value: `${age ? age + 'y' : '—'} ${sex || ''}`.trim() || '—' },
        { label: 'Chief Complaint', value: complaint || '—' },
      ],
      extraSections: flagsHtml ? [`<div style="margin-top:4px;"><div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Red Flags</div>${flagsHtml}</div>`] : [],
      actionUrl: `https://vianova-health.onrender.com/cases/${caseId}`,
      actionLabel: 'REVIEW NOW →',
    }),
  }
}

export function tplCaseApproved({ caseId, label, age, sex, complaint, approvedBy, treatment }) {
  const treatmentPanel = treatment ? alertPanel({
    borderColor: '#bbf7d0',
    bgColor: '#f0fdf4',
    textColor: '#065f46',
    title: 'Approved Treatment Plan',
    content: treatment,
  }) : ''

  return {
    subject: `Case Approved — ${caseId.slice(0, 8)}`,
    html: buildEmail({
      headerGradient: 'linear-gradient(135deg,#064e3b,#059669)',
      title: 'Case Approved',
      subtitle: `Reviewed by ${approvedBy || label || '—'}`,
      accentColor: '#059669',
      rows: [
        { label: 'Case ID', value: `<span style="font-family:monospace;">${caseId}</span>` },
        { label: 'Patient', value: `${age ? age + 'y' : '—'} ${sex || ''}`.trim() || '—' },
        { label: 'Chief Complaint', value: complaint || '—' },
        { label: 'Approved By', value: approvedBy || label || '—' },
        { label: 'Approval Time', value: fmtNow() },
      ],
      extraSections: treatmentPanel ? [treatmentPanel] : [],
      actionUrl: `https://vianova-health.onrender.com/cases/${caseId}`,
      actionLabel: 'View Case →',
    }),
  }
}

export function tplTreatmentEdited({ caseId, label, age, sex, oldTreatment, newTreatment, notes }) {
  const panels = [
    oldTreatment && alertPanel({ borderColor: '#cbd5e1', bgColor: '#f1f5f9', textColor: '#475569', title: 'Previous Plan', content: oldTreatment }),
    newTreatment && alertPanel({ borderColor: '#c4b5fd', bgColor: '#f5f3ff', textColor: '#5b21b6', title: 'Updated Plan', content: newTreatment }),
    notes && alertPanel({ borderColor: '#bbf7d0', bgColor: '#f0fdf4', textColor: '#065f46', title: 'Doctor Notes', content: notes }),
  ].filter(Boolean)

  return {
    subject: `Treatment Plan Updated — ${caseId.slice(0, 8)}`,
    html: buildEmail({
      headerGradient: 'linear-gradient(135deg,#3b0764,#7c3aed)',
      title: 'Treatment Plan Updated',
      subtitle: `Updated by ${label || '—'}`,
      accentColor: '#7c3aed',
      rows: [
        { label: 'Case ID', value: `<span style="font-family:monospace;">${caseId}</span>` },
        { label: 'Patient', value: `${age ? age + 'y' : '—'} ${sex || ''}`.trim() || '—' },
        { label: 'Updated By', value: label || '—' },
        { label: 'Update Time', value: fmtNow() },
      ],
      extraSections: panels,
      actionUrl: `https://vianova-health.onrender.com/cases/${caseId}`,
      actionLabel: 'View Changes →',
    }),
  }
}

export function tplAppointmentReminder({ patientName, appointmentType, appointmentDate, provider, location, durationMinutes }) {
  const formattedDate = appointmentDate
    ? new Date(appointmentDate).toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'

  const rows = [
    { label: 'Patient Name', value: patientName || '—' },
    { label: 'Appointment Type', value: appointmentType || '—' },
    { label: 'Date & Time', value: formattedDate },
    provider && { label: 'Provider', value: provider },
    location && { label: 'Location', value: location },
    durationMinutes && { label: 'Duration', value: `${durationMinutes} minutes` },
  ].filter(Boolean)

  return {
    subject: `Appointment Reminder: ${appointmentType || 'Upcoming Appointment'}`,
    html: buildEmail({
      headerGradient: 'linear-gradient(135deg,#164e63,#0e7490)',
      title: 'Appointment Reminder',
      subtitle: `For ${patientName || 'Patient'}`,
      accentColor: '#0e7490',
      rows,
      alertPanels: [{
        borderColor: '#67e8f9',
        bgColor: '#ecfeff',
        textColor: '#164e63',
        title: 'Important',
        content: 'Please arrive 10 minutes early. Bring your insurance card and a list of current medications.',
      }],
      actionUrl: 'https://vianova-health.onrender.com',
      actionLabel: 'Confirm Appointment',
      extraSections: [`<p style="text-align:center;font-size:12px;color:#94a3b8;margin-top:8px;">To reschedule, contact your care team.</p>`],
    }),
  }
}

export function tplUserDeactivated({ userName, userEmail, deactivatedBy }) {
  return {
    subject: `User Account Deactivated — ${userName || userEmail}`,
    html: buildEmail({
      headerGradient: 'linear-gradient(135deg,#1c1917,#44403c)',
      title: 'User Account Deactivated',
      subtitle: `Account access has been revoked`,
      accentColor: '#78716c',
      rows: [
        { label: 'User Name', value: userName || '—' },
        { label: 'Email', value: userEmail || '—' },
        { label: 'Deactivated By', value: deactivatedBy || '—' },
        { label: 'Time', value: fmtNow() },
      ],
      alertPanels: [{
        borderColor: '#fbbf24',
        bgColor: '#fffbeb',
        textColor: '#92400e',
        title: 'Access Revoked',
        content: "This user's access has been revoked. All active sessions have been terminated.",
      }],
    }),
  }
}

export function tplAdverseEventDetected({ patientId, patientName, eventType, severity, medication, detectedBy }) {
  const sevColor = severity === 'severe' || severity === 'life-threatening' ? '#dc2626'
    : severity === 'moderate' ? '#d97706'
    : '#64748b'

  return {
    subject: `Adverse Event Detected — ${eventType || 'Unknown'}`,
    html: buildEmail({
      headerGradient: 'linear-gradient(135deg,#7c2d12,#ea580c)',
      title: 'Adverse Event Detected',
      subtitle: `Patient: ${patientName || patientId || '—'}`,
      accentColor: '#ea580c',
      rows: [
        { label: 'Patient', value: patientName || patientId || '—' },
        { label: 'Event Type', value: eventType || '—' },
        { label: 'Severity', value: `<span style="color:${sevColor};font-weight:700;">${severity || '—'}</span>` },
        { label: 'Suspected Medication', value: medication || '—' },
        { label: 'Detected By', value: detectedBy || '—' },
        { label: 'Detection Time', value: fmtNow() },
      ],
      alertPanels: [{
        borderColor: '#fb923c',
        bgColor: '#fff7ed',
        textColor: '#9a3412',
        title: 'Action Required',
        content: 'Review and document this adverse event in accordance with your pharmacovigilance protocol.',
      }],
      actionUrl: 'https://vianova-health.onrender.com/adverse-events',
      actionLabel: 'Review Adverse Event →',
    }),
  }
}

export function tplConsentExpiring({ patientName, consentType, expiresAt, daysLeft }) {
  const daysNum = Number(daysLeft)
  const daysColor = daysNum <= 7 ? '#dc2626' : daysNum <= 14 ? '#d97706' : '#059669'
  const formattedExpiry = expiresAt
    ? new Date(expiresAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : '—'

  return {
    subject: `Consent Expiring Soon — ${patientName || 'Patient'} (${daysLeft} days)`,
    html: buildEmail({
      headerGradient: 'linear-gradient(135deg,#713f12,#ca8a04)',
      title: 'Consent Expiring Soon',
      subtitle: `Patient: ${patientName || '—'}`,
      accentColor: '#ca8a04',
      rows: [
        { label: 'Patient', value: patientName || '—' },
        { label: 'Consent Type', value: consentType || '—' },
        { label: 'Expires On', value: formattedExpiry },
        { label: 'Days Remaining', value: `<span style="color:${daysColor};font-weight:700;">${daysLeft}</span>` },
      ],
      alertPanels: [{
        borderColor: '#fbbf24',
        bgColor: '#fefce8',
        textColor: '#713f12',
        title: 'Renewal Required',
        content: 'Patient consent must be renewed before expiry to maintain compliant data access.',
      }],
    }),
  }
}

export function tplSystemError({ errorMsg, route, triggeredBy }) {
  return {
    subject: 'System Error Detected — Vianova Health',
    html: buildEmail({
      headerGradient: 'linear-gradient(135deg,#450a0a,#b91c1c)',
      title: 'System Error Detected',
      subtitle: 'An unexpected error occurred on the platform',
      accentColor: '#dc2626',
      rows: [
        { label: 'Route', value: `<span style="font-family:monospace;">${route || '—'}</span>` },
        { label: 'Triggered By', value: triggeredBy || '—' },
        { label: 'Time', value: fmtNow() },
      ],
      extraSections: [
        `<div style="margin-top:14px;"><div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">Error Message</div>
        <pre style="background:#0f172a;color:#f87171;font-family:monospace;font-size:12px;padding:14px 16px;border-radius:6px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;margin:0;">${errorMsg || '(no message)'}</pre></div>`,
        `<p style="font-size:12px;color:#94a3b8;margin-top:14px;">Check the Logs &amp; Analytics &#8594; Errors tab for full details.</p>`,
      ],
    }),
  }
}

export function tplLoginWelcome({ displayName, email, role, loginTime, ipHint }) {
  const roleLabel = role === 'superadmin' ? 'Super Administrator' : 'Doctor'
  const roleColor = role === 'superadmin' ? '#0369a1' : '#059669'
  const roleGrad  = role === 'superadmin'
    ? 'linear-gradient(135deg,#0c4a6e,#0284c7)'
    : 'linear-gradient(135deg,#064e3b,#059669)'

  return {
    subject: `Welcome back, ${displayName} — You are now signed in`,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <tr><td style="background:${roleGrad};border-radius:16px 16px 0 0;padding:36px 36px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><table cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:8px;vertical-align:middle;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 12h2l2-7 3 14 3-10 2 3h6" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </td>
        <td style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:.1em;vertical-align:middle;">Vianova Health &middot; Cure Analyzer System</td>
      </tr></table></td>
      <td align="right" style="font-size:11px;color:rgba(255,255,255,0.45);">${loginTime}</td>
    </tr></table>
    <div style="margin-top:24px;">
      <div style="font-size:28px;font-weight:800;color:#fff;line-height:1.15;letter-spacing:-.3px;">Welcome back!</div>
      <div style="font-size:14px;color:rgba(255,255,255,0.8);margin-top:7px;">You have successfully signed in to Vianova Health.</div>
    </div>
  </td></tr>

  <tr><td style="background:#fff;padding:28px 36px 0;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="width:52px;height:52px;background:${roleGrad};border-radius:50%;text-align:center;line-height:52px;font-size:20px;font-weight:800;color:#fff;vertical-align:middle;">${displayName.charAt(0).toUpperCase()}</td>
      <td style="padding-left:14px;">
        <div style="font-size:17px;font-weight:700;color:#0f172a;">${displayName}</div>
        <div style="font-size:12px;color:#64748b;margin-top:3px;">${email}</div>
      </td>
      <td align="right"><span style="background:${roleColor}22;color:${roleColor};font-size:11px;font-weight:700;padding:5px 13px;border-radius:20px;letter-spacing:.04em;text-transform:uppercase;">${roleLabel}</span></td>
    </tr></table>
  </td></tr>

  <tr><td style="background:#fff;padding:20px 36px 0;"><div style="height:1px;background:#e2e8f0;"></div></td></tr>

  <tr><td style="background:#fff;padding:20px 36px;">
    <div style="font-size:10.5px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px;">Sign-in Details</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13.5px;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr style="background:#f8fafc;"><td style="padding:11px 14px;color:#64748b;width:140px;border-bottom:1px solid #e2e8f0;">Date &amp; Time</td><td style="padding:11px 14px;color:#0f172a;font-weight:500;border-bottom:1px solid #e2e8f0;">${loginTime}</td></tr>
      <tr><td style="padding:11px 14px;color:#64748b;border-bottom:1px solid #e2e8f0;">Account</td><td style="padding:11px 14px;color:#0f172a;font-weight:500;border-bottom:1px solid #e2e8f0;">${email}</td></tr>
      <tr style="background:#f8fafc;"><td style="padding:11px 14px;color:#64748b;${ipHint ? 'border-bottom:1px solid #e2e8f0;' : ''}">Role</td><td style="padding:11px 14px;${ipHint ? 'border-bottom:1px solid #e2e8f0;' : ''}"><span style="color:${roleColor};font-weight:700;">${roleLabel}</span></td></tr>
      ${ipHint ? `<tr><td style="padding:11px 14px;color:#64748b;">Access From</td><td style="padding:11px 14px;color:#0f172a;font-family:monospace;font-size:12px;">${ipHint}</td></tr>` : ''}
    </table>
  </td></tr>

  <tr><td style="background:#fff;padding:0 36px 28px;">
    <div style="background:#fef9ec;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:14px 18px;">
      <div style="font-size:11.5px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">Security Notice</div>
      <div style="font-size:13px;color:#78350f;line-height:1.65;">If you did not initiate this sign-in, contact your system administrator immediately and reset your password. Never share your login credentials.</div>
    </div>
  </td></tr>

  <tr><td style="background:#fff;padding:0 36px 32px;text-align:center;">
    <a href="https://vianova-health.onrender.com/dashboard" style="display:inline-block;background:${roleGrad};color:#fff;font-size:14px;font-weight:700;padding:14px 42px;border-radius:8px;text-decoration:none;letter-spacing:.02em;">Open Dashboard &rarr;</a>
  </td></tr>

  <tr><td style="background:#fff;border-radius:0 0 16px 16px;padding:0 36px 28px;">
    <div style="border-top:1px solid #e2e8f0;padding-top:20px;text-align:center;">
      <div style="font-size:11px;color:#94a3b8;line-height:1.8;"><strong style="color:#64748b;">Vianova Health</strong> &mdash; AI-Assisted Clinical Decision Support<br>This is an automated security notification. AI drafts require physician review before any clinical action.<br><span style="color:#cbd5e1;">&copy; 2025 Vianova Health. HIPAA-compliant platform.</span></div>
    </div>
  </td></tr>

</table></td></tr>
</table>
</body></html>`,
  }
}
