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

export function tplLoginWelcome({ displayName, email, role, loginTime, ip, geo }) {
  const roleLabel = role === 'superadmin' ? 'Super Administrator' : 'Doctor'
  const roleColor = role === 'superadmin' ? '#0369a1' : '#059669'
  const roleGrad  = role === 'superadmin'
    ? 'linear-gradient(135deg,#0c4a6e 0%,#0284c7 100%)'
    : 'linear-gradient(135deg,#064e3b 0%,#059669 100%)'

  // Build location string from geo data
  const locationParts = []
  if (geo) {
    if (geo.city)       locationParts.push(geo.city)
    if (geo.regionName) locationParts.push(geo.regionName)
    if (geo.country)    locationParts.push(geo.country)
  }
  const locationStr = locationParts.length ? locationParts.join(', ') : null
  const timezone    = geo?.timezone || null
  const isp         = geo?.isp     || geo?.org || null
  const initial     = displayName.charAt(0).toUpperCase()

  return {
    subject: `Welcome back, ${displayName} — Successful sign-in detected`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Sign-in Notification — Vianova Health</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:40px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- ░░ HEADER CARD ░░ -->
  <tr><td style="background:${roleGrad};border-radius:16px 16px 0 0;padding:0;">

    <!-- top bar -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:18px 32px 0;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:7px;vertical-align:middle;">
              <svg width="18" height="14" viewBox="0 0 32 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polyline points="0,12 6,12 9,4 13,20 17,8 20,16 24,12 32,12" stroke="rgba(255,255,255,0.6)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </td>
            <td style="font-size:10px;font-weight:800;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:.14em;vertical-align:middle;">Vianova Health &nbsp;&bull;&nbsp; Cure Analyzer System</td>
          </tr></table>
        </td>
      </tr>
    </table>

    <!-- big headline area -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:28px 32px 32px;">
          <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;">Security Notification</div>
          <div style="font-size:32px;font-weight:900;color:#ffffff;line-height:1.1;letter-spacing:-.5px;">Welcome back!</div>
          <div style="font-size:15px;color:rgba(255,255,255,0.78);margin-top:8px;font-weight:400;line-height:1.5;">A successful sign-in to your Vianova Health account has been detected.</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- ░░ PROFILE STRIP ░░ -->
  <tr><td style="background:#ffffff;padding:28px 32px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <!-- Avatar -->
      <td style="width:56px;" valign="middle">
        <div style="width:56px;height:56px;border-radius:50%;background:${roleGrad};text-align:center;line-height:56px;font-size:22px;font-weight:900;color:#fff;">${initial}</div>
      </td>
      <!-- Name / email -->
      <td style="padding-left:16px;" valign="middle">
        <div style="font-size:19px;font-weight:800;color:#0f172a;line-height:1.2;">${displayName}</div>
        <div style="font-size:12.5px;color:#64748b;margin-top:3px;">${email}</div>
      </td>
      <!-- Role badge -->
      <td align="right" valign="middle">
        <span style="display:inline-block;padding:5px 14px;border-radius:99px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${roleColor};background:${roleColor}18;">${roleLabel}</span>
      </td>
    </tr></table>
  </td></tr>

  <!-- ░░ DIVIDER ░░ -->
  <tr><td style="background:#ffffff;padding:0 32px;"><div style="height:1px;background:#e8edf3;"></div></td></tr>

  <!-- ░░ SIGN-IN DETAILS ░░ -->
  <tr><td style="background:#ffffff;padding:24px 32px 8px;">
    <div style="font-size:10.5px;font-weight:800;color:#94a3b8;text-transform:uppercase;letter-spacing:.12em;margin-bottom:14px;">Sign-in Details</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;font-size:13.5px;">
      <tr style="background:#f8fafc;">
        <td style="padding:12px 16px;color:#64748b;width:145px;border-bottom:1px solid #e2e8f0;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Date &amp; Time
        </td>
        <td style="padding:12px 16px;color:#0f172a;font-weight:600;border-bottom:1px solid #e2e8f0;">${loginTime}</td>
      </tr>
      ${ip ? `<tr>
        <td style="padding:12px 16px;color:#64748b;border-bottom:1px solid #e2e8f0;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px;"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 12h10M12 7v10"/></svg>
          IP Address
        </td>
        <td style="padding:12px 16px;font-family:ui-monospace,'Cascadia Code','Fira Code',monospace;font-size:13px;color:#0f172a;font-weight:600;border-bottom:1px solid #e2e8f0;">${ip}</td>
      </tr>` : ''}
      ${locationStr ? `<tr style="background:#f8fafc;">
        <td style="padding:12px 16px;color:#64748b;border-bottom:1px solid #e2e8f0;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          Location
        </td>
        <td style="padding:12px 16px;color:#0f172a;font-weight:600;border-bottom:1px solid #e2e8f0;">${locationStr}</td>
      </tr>` : ''}
      ${timezone ? `<tr${locationStr ? '' : ' style="background:#f8fafc;"'}>
        <td style="padding:12px 16px;color:#64748b;${isp ? 'border-bottom:1px solid #e2e8f0;' : ''}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          Timezone
        </td>
        <td style="padding:12px 16px;color:#0f172a;font-weight:600;${isp ? 'border-bottom:1px solid #e2e8f0;' : ''}">${timezone}</td>
      </tr>` : ''}
      ${isp ? `<tr style="background:#f8fafc;">
        <td style="padding:12px 16px;color:#64748b;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:5px;"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
          Network / ISP
        </td>
        <td style="padding:12px 16px;color:#0f172a;font-weight:600;">${isp}</td>
      </tr>` : ''}
    </table>
  </td></tr>

  <!-- ░░ MAP PLACEHOLDER — lat/lon geo pill ░░ -->
  ${geo && geo.lat && geo.lon ? `<tr><td style="background:#ffffff;padding:12px 32px 0;">
    <div style="background:linear-gradient(135deg,#f0f9ff,#e0f2fe);border:1px solid #bae6fd;border-radius:10px;padding:14px 18px;display:flex;align-items:center;">
      <table cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:12px;">
          <div style="width:38px;height:38px;background:#0284c7;border-radius:50%;text-align:center;line-height:38px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
        </td>
        <td>
          <div style="font-size:12px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:.06em;">Approximate Location</div>
          <div style="font-size:13px;color:#0c4a6e;font-weight:500;margin-top:2px;">${locationStr || 'Unknown'} &nbsp;&bull;&nbsp; <span style="font-family:monospace;">${geo.lat.toFixed(4)}&deg;N, ${geo.lon.toFixed(4)}&deg;E</span></div>
        </td>
      </tr></table>
    </div>
  </td></tr>` : ''}

  <!-- ░░ SECURITY ALERT BOX ░░ -->
  <tr><td style="background:#ffffff;padding:20px 32px 28px;">
    <div style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:16px 18px;">
      <table cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:12px;vertical-align:top;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </td>
        <td>
          <div style="font-size:12.5px;font-weight:800;color:#92400e;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">Security Notice</div>
          <div style="font-size:13px;color:#78350f;line-height:1.65;">If you did not initiate this sign-in, your account may be compromised. Contact your system administrator immediately and reset your password. Never share your login credentials with anyone.</div>
        </td>
      </tr></table>
    </div>
  </td></tr>

  <!-- ░░ CTA BUTTON ░░ -->
  <tr><td style="background:#ffffff;padding:0 32px 36px;text-align:center;">
    <a href="https://vianova-health.onrender.com/dashboard"
       style="display:inline-block;background:${roleGrad};color:#ffffff;font-size:14px;font-weight:800;padding:0 40px;height:48px;line-height:48px;border-radius:10px;text-decoration:none;letter-spacing:.03em;box-shadow:0 4px 14px rgba(0,0,0,.15);">
      Open Dashboard &rarr;
    </a>
  </td></tr>

  <!-- ░░ FOOTER ░░ -->
  <tr><td style="background:#f8fafc;border-radius:0 0 16px 16px;padding:24px 32px;border-top:1px solid #e2e8f0;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <div style="font-size:11px;color:#94a3b8;line-height:1.8;text-align:center;">
          <strong style="color:#64748b;font-size:12px;">Vianova Health</strong> &mdash; AI-Assisted Clinical Decision Support<br>
          This is an automated security notification. Do not reply to this email.<br>
          AI-generated content requires physician review before any clinical action.<br>
          <span style="color:#cbd5e1;">&copy; 2025 Vianova Health &bull; HIPAA-compliant platform</span>
        </div>
      </td>
    </tr></table>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   FEATURE NOTIFICATION TEMPLATES
   ───────────────────────────────────────────────────────────────────────────── */

export function tplBillingClaimSubmitted({ claimId, patientName, emLevel, icdCount, cptCount, totalCharges, complianceFlags }) {
  const flagCount = complianceFlags || 0
  return {
    subject: `Billing Claim Submitted — ${String(claimId).slice(0, 8)}`,
    html: buildEmail({
      headerGradient: 'linear-gradient(135deg,#312e81,#4f46e5)',
      title: 'Billing Claim Submitted',
      accentColor: '#4f46e5',
      rows: [
        { label: 'Claim ID', value: `<span style="font-family:monospace;">${claimId}</span>` },
        { label: 'Patient', value: patientName || '—' },
        { label: 'E&M Level', value: emLevel || '—' },
        { label: 'ICD-10 Codes', value: String(icdCount ?? 0) },
        { label: 'CPT Codes', value: String(cptCount ?? 0) },
        { label: 'Estimated Charges', value: `$${Number(totalCharges || 0).toFixed(2)}` },
        { label: 'Compliance Flags', value: `<span style="color:${flagCount > 0 ? '#dc2626' : '#059669'};font-weight:700;">${flagCount}</span>` },
      ],
      alertPanels: flagCount > 0 ? [{ borderColor: '#f59e0b', bgColor: '#fffbeb', textColor: '#92400e', content: `${flagCount} compliance flag${flagCount > 1 ? 's' : ''} require review before final submission` }] : [],
      actionUrl: 'https://vianova-health.onrender.com/billing',
      actionLabel: 'Review Claim →',
    }),
  }
}

export function tplAppointmentScheduled({ patientName, appointmentType, appointmentDate, provider, location, status }) {
  const title = status === 'cancelled' ? 'Appointment Cancelled' : status === 'completed' ? 'Appointment Completed' : 'Appointment Scheduled'
  const statusColor = status === 'cancelled' ? '#dc2626' : status === 'completed' ? '#059669' : '#0284c7'
  return {
    subject: `${title} — ${patientName || 'Patient'}`,
    html: buildEmail({
      headerGradient: 'linear-gradient(135deg,#164e63,#0e7490)',
      title,
      accentColor: '#0e7490',
      rows: [
        { label: 'Patient', value: patientName || '—' },
        { label: 'Type', value: appointmentType || '—' },
        { label: 'Date & Time', value: appointmentDate || '—' },
        { label: 'Provider', value: provider || '—' },
        { label: 'Location', value: location || '—' },
        { label: 'Status', value: `<span style="color:${statusColor};font-weight:700;">${status || 'scheduled'}</span>` },
      ],
      actionUrl: 'https://vianova-health.onrender.com/appointments',
      actionLabel: 'View Appointments →',
    }),
  }
}

export function tplLabResultAdded({ patientName, testName, value, unit, interpretation, critical, referenceRange }) {
  const isCrit = !!critical
  const valColor = isCrit ? '#dc2626' : (interpretation === 'H' || interpretation === 'HH') ? '#dc2626' : (interpretation === 'N') ? '#059669' : '#0f172a'
  return {
    subject: isCrit ? `CRITICAL Lab Result — ${testName}` : `New Lab Result — ${testName}`,
    html: buildEmail({
      headerGradient: isCrit ? 'linear-gradient(135deg,#7f1d1d,#dc2626)' : 'linear-gradient(135deg,#1e3a5f,#0284c7)',
      title: isCrit ? 'CRITICAL Lab Result' : 'New Lab Result',
      accentColor: isCrit ? '#dc2626' : '#0284c7',
      rows: [
        { label: 'Patient', value: patientName || '—' },
        { label: 'Test', value: testName || '—' },
        { label: 'Result', value: `<span style="color:${valColor};font-weight:700;">${value} ${unit || ''}</span>` },
        { label: 'Reference Range', value: referenceRange || '—' },
        { label: 'Interpretation', value: interpretation || '—' },
        { label: 'Flagged Critical', value: isCrit ? '<span style="color:#dc2626;font-weight:700;">Yes</span>' : 'No' },
      ],
      alertPanels: isCrit ? [{ borderColor: '#dc2626', bgColor: '#fee2e2', textColor: '#7f1d1d', content: 'This result requires immediate physician review' }] : [],
      actionUrl: 'https://vianova-health.onrender.com/labs',
      actionLabel: 'View Lab Results →',
    }),
  }
}

export function tplDischargeGenerated({ patientName, riskLevel, tcmEnrolled, language, followupScheduled, transmissionStatus }) {
  const riskColor = riskLevel === 'high' ? '#dc2626' : riskLevel === 'medium' ? '#d97706' : '#059669'
  return {
    subject: `Discharge Summary Generated — ${patientName || 'Patient'}`,
    html: buildEmail({
      headerGradient: 'linear-gradient(135deg,#064e3b,#059669)',
      title: 'Discharge Summary Generated',
      accentColor: '#059669',
      rows: [
        { label: 'Patient', value: patientName || '—' },
        { label: 'Risk Level', value: `<span style="color:${riskColor};font-weight:700;">${riskLevel || '—'}</span>` },
        { label: 'TCM Enrolled', value: tcmEnrolled ? 'Yes' : 'No' },
        { label: 'Language', value: language || 'en' },
        { label: 'Follow-up Scheduled', value: followupScheduled ? 'Yes' : 'No' },
        { label: 'Transmission Status', value: transmissionStatus || '—' },
      ],
      actionUrl: 'https://vianova-health.onrender.com/discharge',
      actionLabel: 'View Discharge →',
    }),
  }
}

export function tplConsentSigned({ patientName, consentType, signedBy, expiresAt }) {
  return {
    subject: `Consent Signed — ${patientName || 'Patient'}`,
    html: buildEmail({
      headerGradient: 'linear-gradient(135deg,#1e3a5f,#1d4ed8)',
      title: 'Consent Signed',
      accentColor: '#1d4ed8',
      rows: [
        { label: 'Patient', value: patientName || '—' },
        { label: 'Consent Type', value: consentType || '—' },
        { label: 'Signed By', value: signedBy || '—' },
        { label: 'Signed At', value: fmtNow() },
        { label: 'Expires At', value: expiresAt || 'No expiry' },
      ],
      actionUrl: 'https://vianova-health.onrender.com/consent',
      actionLabel: 'View Consents →',
    }),
  }
}

export function tplConsentRevoked({ patientName, consentType, revokedBy, reason }) {
  return {
    subject: `Consent Revoked — ${patientName || 'Patient'}`,
    html: buildEmail({
      headerGradient: 'linear-gradient(135deg,#7f1d1d,#b91c1c)',
      title: 'Consent Revoked',
      accentColor: '#b91c1c',
      rows: [
        { label: 'Patient', value: patientName || '—' },
        { label: 'Consent Type', value: consentType || '—' },
        { label: 'Revoked By', value: revokedBy || '—' },
        { label: 'Reason', value: reason || '—' },
        { label: 'Revoked At', value: fmtNow() },
      ],
      alertPanels: [{ borderColor: '#dc2626', bgColor: '#fee2e2', textColor: '#7f1d1d', content: 'Data access restrictions for this patient may have changed' }],
    }),
  }
}

export function tplCareGapDetected({ patientName, gapType, priority, description, dueDate }) {
  const gradient = priority === 'high' ? 'linear-gradient(135deg,#7c2d12,#ea580c)' : 'linear-gradient(135deg,#713f12,#ca8a04)'
  const prioColor = priority === 'high' ? '#dc2626' : priority === 'medium' ? '#d97706' : '#059669'
  return {
    subject: `Care Gap Identified — ${patientName || 'Patient'}`,
    html: buildEmail({
      headerGradient: gradient,
      title: 'Care Gap Identified',
      accentColor: priority === 'high' ? '#ea580c' : '#ca8a04',
      rows: [
        { label: 'Patient', value: patientName || '—' },
        { label: 'Gap Type', value: gapType || '—' },
        { label: 'Priority', value: `<span style="color:${prioColor};font-weight:700;">${priority || '—'}</span>` },
        { label: 'Description', value: description || '—' },
        { label: 'Due Date', value: dueDate || '—' },
      ],
      actionUrl: 'https://vianova-health.onrender.com/care-gaps',
      actionLabel: 'View Care Gaps →',
    }),
  }
}

export function tplNlpNoteProcessed({ patientName, noteType, acuityScore, phenotypeFlags, conditionsFound, medicationsFound, sentiment }) {
  const score = acuityScore ?? 0
  const acuityColor = score >= 7 ? '#dc2626' : score >= 4 ? '#d97706' : '#059669'
  const phenotypes = Array.isArray(phenotypeFlags) ? phenotypeFlags.join(', ') || '—' : String(phenotypeFlags || '—')
  return {
    subject: `Clinical Note Processed — ${patientName || 'Patient'}`,
    html: buildEmail({
      headerGradient: 'linear-gradient(135deg,#0c4a6e,#0284c7)',
      title: 'Clinical Note Processed',
      accentColor: '#0284c7',
      rows: [
        { label: 'Patient', value: patientName || '—' },
        { label: 'Note Type', value: noteType || '—' },
        { label: 'Acuity Score', value: `<span style="color:${acuityColor};font-weight:700;">${score}/10</span>` },
        { label: 'Sentiment', value: sentiment || '—' },
        { label: 'Conditions Found', value: String(conditionsFound ?? 0) },
        { label: 'Medications Found', value: String(medicationsFound ?? 0) },
        { label: 'Phenotypes', value: phenotypes },
      ],
      actionUrl: 'https://vianova-health.onrender.com/nlp-notes',
      actionLabel: 'View NLP Notes →',
    }),
  }
}

export function tplSdohAssessmentCompleted({ patientName, housingRisk, foodSecurity, transportationRisk, zCodes, resourcesSuggested }) {
  return {
    subject: `SDOH Screening Completed — ${patientName || 'Patient'}`,
    html: buildEmail({
      headerGradient: 'linear-gradient(135deg,#134e4a,#0f766e)',
      title: 'SDOH Screening Completed',
      accentColor: '#0f766e',
      rows: [
        { label: 'Patient', value: patientName || '—' },
        { label: 'Housing', value: housingRisk || '—' },
        { label: 'Food Security', value: foodSecurity || '—' },
        { label: 'Transportation', value: transportationRisk || '—' },
        { label: 'Z-Codes Assigned', value: Array.isArray(zCodes) ? zCodes.join(', ') || '—' : String(zCodes || '—') },
        { label: 'Resources Suggested', value: String(resourcesSuggested ?? 0) },
      ],
      actionUrl: 'https://vianova-health.onrender.com/sdoh',
      actionLabel: 'View SDOH →',
    }),
  }
}

export function tplChronicDiseaseUpdate({ patientName, conditions, riskLevel, lastCheckin, nextCheckin }) {
  const riskColor = riskLevel === 'critical' ? '#dc2626' : riskLevel === 'high' ? '#ea580c' : riskLevel === 'moderate' ? '#d97706' : '#059669'
  return {
    subject: `Chronic Disease Plan Updated — ${patientName || 'Patient'}`,
    html: buildEmail({
      headerGradient: 'linear-gradient(135deg,#4c1d95,#7c3aed)',
      title: 'Chronic Disease Plan Updated',
      accentColor: '#7c3aed',
      rows: [
        { label: 'Patient', value: patientName || '—' },
        { label: 'Conditions', value: Array.isArray(conditions) ? conditions.join(', ') || '—' : String(conditions || '—') },
        { label: 'Risk Level', value: `<span style="color:${riskColor};font-weight:700;">${riskLevel || '—'}</span>` },
        { label: 'Last Check-in', value: lastCheckin || fmtNow() },
        { label: 'Next Check-in', value: nextCheckin || '—' },
      ],
      actionUrl: 'https://vianova-health.onrender.com/chronic-disease',
      actionLabel: 'View Chronic Disease →',
    }),
  }
}

export function tplClinicalDecisionRun({ patientName, news2Score, news2Label, riskLabel, topDiagnosis, alertCount }) {
  const s = news2Score ?? 0
  const gradient = s >= 7 ? 'linear-gradient(135deg,#7f1d1d,#dc2626)' : s >= 5 ? 'linear-gradient(135deg,#713f12,#d97706)' : 'linear-gradient(135deg,#0c4a6e,#0e7490)'
  const accentColor = s >= 7 ? '#dc2626' : s >= 5 ? '#d97706' : '#0e7490'
  const scoreColor = s >= 7 ? '#dc2626' : s >= 5 ? '#d97706' : '#059669'
  const riskColor = riskLabel === 'critical' ? '#dc2626' : riskLabel === 'high' ? '#ea580c' : riskLabel === 'moderate' ? '#d97706' : '#059669'
  return {
    subject: `Clinical Decision Support Run — ${patientName || 'Patient'}`,
    html: buildEmail({
      headerGradient: gradient,
      title: 'Clinical Decision Support Run',
      accentColor,
      rows: [
        { label: 'Patient', value: patientName || '—' },
        { label: 'NEWS2 Score', value: `<span style="color:${scoreColor};font-weight:700;">${s}</span>` },
        { label: 'NEWS2 Level', value: news2Label || '—' },
        { label: 'Overall Risk', value: `<span style="color:${riskColor};font-weight:700;">${riskLabel || '—'}</span>` },
        { label: 'Top Diagnosis', value: topDiagnosis || '—' },
        { label: 'Clinical Alerts', value: String(alertCount ?? 0) },
      ],
      actionUrl: 'https://vianova-health.onrender.com/clinical-decisions',
      actionLabel: 'View Clinical Decisions →',
    }),
  }
}

export function tplAuditEvent({ eventType, actor, resourceType, patientId, detail, severity }) {
  const isHigh = severity === 'high'
  return {
    subject: `Audit Event: ${eventType}${isHigh ? ' [HIGH SEVERITY]' : ''}`,
    html: buildEmail({
      headerGradient: isHigh ? 'linear-gradient(135deg,#7f1d1d,#dc2626)' : 'linear-gradient(135deg,#1c1917,#44403c)',
      title: 'Audit Event Recorded',
      accentColor: isHigh ? '#dc2626' : '#44403c',
      rows: [
        { label: 'Event Type', value: eventType || '—' },
        { label: 'Actor', value: actor || '—' },
        { label: 'Resource Type', value: resourceType || '—' },
        { label: 'Patient', value: patientId || '—' },
        { label: 'Detail', value: detail || '—' },
        { label: 'Severity', value: `<span style="color:${isHigh ? '#dc2626' : '#d97706'};font-weight:700;">${severity || '—'}</span>` },
        { label: 'Timestamp', value: fmtNow() },
      ],
      alertPanels: isHigh ? [{ borderColor: '#dc2626', bgColor: '#fee2e2', textColor: '#7f1d1d', content: 'High-severity compliance event requires immediate review' }] : [],
      actionUrl: 'https://vianova-health.onrender.com/audit-compliance',
      actionLabel: 'View Audit Log →',
    }),
  }
}

export function tplNewUserWelcome({ name, email, password, role, addedBy }) {
  const roleLabel = role === 'superadmin' ? 'Super Admin' : 'Doctor'
  const subject = 'Welcome to Vianova Health — Your account is ready'
  const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
  <div style="background:linear-gradient(135deg,#0e7490,#0369a1);padding:32px 36px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <div style="width:40px;height:40px;background:rgba(255,255,255,.15);border-radius:10px;display:flex;align-items:center;justify-content:center;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      </div>
      <span style="color:#fff;font-weight:700;font-size:18px;">Vianova Health</span>
    </div>
    <h1 style="color:#fff;font-size:26px;font-weight:800;margin:0 0 8px;letter-spacing:-.02em;">Welcome, ${name}!</h1>
    <p style="color:rgba(255,255,255,.7);font-size:14px;margin:0;">Your account has been created by ${addedBy}</p>
  </div>
  <div style="padding:32px 36px;">
    <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px;">You've been added to the <strong>Vianova Health Cure Analyzer System</strong> as a <strong style="color:#0e7490;">${roleLabel}</strong>. Use the credentials below to sign in.</p>
    <div style="background:#f1f5f9;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
      <div style="margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Login Email</div>
        <div style="font-size:15px;font-weight:600;color:#0f172a;">${email}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Temporary Password</div>
        <div style="font-size:15px;font-weight:600;color:#0f172a;font-family:monospace;background:#e2e8f0;padding:6px 12px;border-radius:8px;display:inline-block;">${password}</div>
      </div>
    </div>
    <a href="https://vianova-health.onrender.com/login" style="display:block;text-align:center;background:linear-gradient(135deg,#0e7490,#0369a1);color:#fff;font-weight:700;font-size:14px;padding:14px 24px;border-radius:12px;text-decoration:none;margin-bottom:24px;">Sign In to Vianova Health</a>
    <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:0;">Please change your password after your first login. If you have any issues, contact your system administrator.</p>
  </div>
  <div style="background:#f8fafc;padding:16px 36px;text-align:center;border-top:1px solid #e2e8f0;">
    <p style="color:#cbd5e1;font-size:11px;margin:0;">Vianova Health · Cure Analyzer System v2.0</p>
  </div>
</div>
</body></html>`
  return { subject, html, text: `Welcome ${name}! Your Vianova Health account is ready. Email: ${email} | Password: ${password} | Sign in at https://vianova-health.onrender.com/login` }
}

export function tplPopulationHealthReport({ cohortName, memberCount, highRiskCount, programType, criteria }) {
  const critSummary = typeof criteria === 'object' ? JSON.stringify(criteria).slice(0, 120) : String(criteria || '—')
  return {
    subject: `Population Health Cohort Updated — ${cohortName || 'Cohort'}`,
    html: buildEmail({
      headerGradient: 'linear-gradient(135deg,#1e3a5f,#0369a1)',
      title: 'Population Health Cohort Updated',
      accentColor: '#0369a1',
      rows: [
        { label: 'Cohort', value: cohortName || '—' },
        { label: 'Program Type', value: programType || '—' },
        { label: 'Members', value: String(memberCount ?? 0) },
        { label: 'High Risk Members', value: String(highRiskCount ?? 0) },
        { label: 'Criteria Summary', value: critSummary },
      ],
      actionUrl: 'https://vianova-health.onrender.com/population-health',
      actionLabel: 'View Population Health →',
    }),
  }
}
