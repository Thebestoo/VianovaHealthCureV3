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

// Full Vianova Health wordmark logo — embedded inline so it renders in every email client without
// depending on external image loading. Kept exactly as exported, only sized via width/height on the root <svg>.
const VIANOVA_LOGO_SVG = `<svg width="170" height="27" display="block" role="presentation" viewBox="0 0 227 36" xmlns="http://www.w3.org/2000/svg" style="display:block;vertical-align:middle;"><defs ><linearGradient id="gFkTKSthQ-539504230-linear-gradient" x1="0" x2="1" y1="0.4975124378109453" y2="0.5024875621890547"><stop offset="0" stop-color="rgb(0, 167, 235)"/><stop offset="1" stop-color="rgb(43, 202, 166)"/></linearGradient></defs><g d="M 23.565 0.58 C 25.413 0.58 26.757 2.344 26.349 4.081 L 20.035 30.061 C 19.267 33.2 16.433 35.423 13.218 35.423 C 10.002 35.423 7.168 33.202 6.401 30.061 L 0.087 4.129 C -0.369 2.317 1.023 0.628 2.873 0.628 C 4.217 0.628 5.345 1.57 5.657 2.849 L 11.778 29.288 C 11.922 30.013 12.594 30.52 13.314 30.52 C 14.034 30.52 14.706 30.013 14.85 29.288 L 20.971 2.849 C 21.091 1.496 22.267 0.58 23.563 0.58 Z M 37.269 32.646 L 37.269 3.407 C 37.269 1.86 38.493 0.558 40.101 0.558 C 41.709 0.558 42.932 1.79 42.932 3.407 L 42.932 32.646 C 42.932 34.193 41.709 35.495 40.101 35.495 C 38.493 35.423 37.269 34.19 37.269 32.646 Z M 91.28 32.646 L 91.28 6.354 C 91.28 3.143 93.848 0.561 97.042 0.561 C 99.465 0.561 101.675 2.107 102.491 4.424 L 111.684 30.453 L 112.452 30.453 L 112.452 3.407 C 112.452 1.86 113.676 0.558 115.283 0.558 C 116.891 0.558 118.115 1.79 118.115 3.407 L 118.115 29.75 C 118.115 32.888 115.595 35.425 112.474 35.425 C 110.122 35.425 107.96 33.927 107.192 31.658 L 97.639 5.533 L 96.919 5.533 L 96.919 32.646 C 96.919 34.193 95.695 35.495 94.088 35.495 C 92.552 35.423 91.28 34.19 91.28 32.646 Z M 154.58 31.702 C 152.516 34.55 148.89 36 143.633 36 C 138.375 36 134.752 34.55 132.638 31.702 C 130.526 28.853 129.518 24.313 129.518 18.181 C 129.518 12.049 130.598 7.485 132.71 4.492 C 134.821 1.498 138.471 0 143.657 0 C 148.842 0 152.49 1.498 154.604 4.443 C 156.715 7.388 157.723 11.977 157.723 18.181 C 157.723 24.386 156.691 28.877 154.58 31.702 Z M 137.082 28.056 C 138.209 30.059 140.419 31.049 143.659 31.049 C 146.898 31.049 149.109 30.059 150.236 28.104 C 151.364 26.147 151.94 22.839 151.94 18.181 C 151.94 13.523 151.364 10.165 150.188 8.065 C 149.013 5.941 146.853 4.926 143.659 4.926 C 140.465 4.926 138.329 5.965 137.13 8.065 C 135.954 10.189 135.378 13.545 135.378 18.133 C 135.33 22.769 135.906 26.077 137.082 28.056 Z M 190.178 0.58 C 192.026 0.58 193.37 2.344 192.962 4.081 L 186.624 30.013 C 185.856 33.151 183.022 35.372 179.807 35.372 C 176.591 35.372 173.757 33.151 172.99 30.013 L 166.676 4.081 C 166.22 2.271 167.612 0.58 169.46 0.58 C 170.804 0.58 171.931 1.522 172.243 2.8 L 178.245 29.24 C 178.389 29.965 179.061 30.472 179.781 30.472 C 180.5 30.472 181.172 29.965 181.316 29.24 L 187.438 2.8 C 187.702 1.496 188.829 0.58 190.173 0.58 Z M 226.928 32.016 L 220.567 6.301 C 219.847 3.356 217.495 1.037 214.517 0.628 C 210.868 0.169 207.532 2.534 206.668 6.06 L 200.355 31.871 C 199.947 33.466 200.931 35.13 202.563 35.372 C 204.002 35.589 205.274 34.695 205.634 33.296 L 206.45 29.989 L 208.082 22.914 L 208.49 21.271 L 212.091 6.494 C 212.235 5.77 212.907 5.262 213.627 5.262 C 214.347 5.262 215.019 5.77 215.163 6.494 L 219.125 22.912 L 213.315 22.912 C 212.187 22.912 211.204 23.685 210.892 24.77 C 210.484 26.365 211.659 27.86 213.315 27.86 L 220.205 27.86 L 221.548 33.294 C 221.86 34.526 222.94 35.369 224.212 35.369 L 224.26 35.369 C 226.06 35.418 227.331 33.775 226.923 32.013 Z M 80.383 32.016 L 74.022 6.301 C 73.302 3.356 70.95 1.037 67.973 0.628 C 64.325 0.169 60.987 2.534 60.123 6.06 L 53.81 31.871 C 53.402 33.466 54.386 35.13 56.018 35.372 C 57.457 35.589 58.729 34.695 59.089 33.296 L 59.905 29.989 L 61.537 22.914 L 61.945 21.271 L 65.544 6.494 C 65.688 5.77 66.36 5.262 67.08 5.262 C 67.8 5.262 68.472 5.77 68.616 6.494 L 72.577 22.912 L 66.768 22.912 C 65.64 22.912 64.656 23.685 64.344 24.77 C 63.936 26.365 65.112 27.86 66.768 27.86 L 73.657 27.86 L 75.001 33.294 C 75.313 34.526 76.393 35.369 77.665 35.369 L 77.713 35.369 C 79.512 35.418 80.858 33.775 80.376 32.013 Z" fill="transparent" height="36px" id="NXnZnEtCi" width="227.00000172234047px"><path d="M 23.565 0.58 C 25.413 0.58 26.757 2.344 26.349 4.081 L 20.035 30.061 C 19.267 33.2 16.433 35.423 13.218 35.423 C 10.002 35.423 7.168 33.202 6.401 30.061 L 0.087 4.129 C -0.369 2.317 1.023 0.628 2.873 0.628 C 4.217 0.628 5.345 1.57 5.657 2.849 L 11.778 29.288 C 11.922 30.013 12.594 30.52 13.314 30.52 C 14.034 30.52 14.706 30.013 14.85 29.288 L 20.971 2.849 C 21.091 1.496 22.267 0.58 23.563 0.58 Z M 37.269 32.646 L 37.269 3.407 C 37.269 1.86 38.493 0.558 40.101 0.558 C 41.709 0.558 42.932 1.79 42.932 3.407 L 42.932 32.646 C 42.932 34.193 41.709 35.495 40.101 35.495 C 38.493 35.423 37.269 34.19 37.269 32.646 Z M 91.28 32.646 L 91.28 6.354 C 91.28 3.143 93.848 0.561 97.042 0.561 C 99.465 0.561 101.675 2.107 102.491 4.424 L 111.684 30.453 L 112.452 30.453 L 112.452 3.407 C 112.452 1.86 113.676 0.558 115.283 0.558 C 116.891 0.558 118.115 1.79 118.115 3.407 L 118.115 29.75 C 118.115 32.888 115.595 35.425 112.474 35.425 C 110.122 35.425 107.96 33.927 107.192 31.658 L 97.639 5.533 L 96.919 5.533 L 96.919 32.646 C 96.919 34.193 95.695 35.495 94.088 35.495 C 92.552 35.423 91.28 34.19 91.28 32.646 Z M 154.58 31.702 C 152.516 34.55 148.89 36 143.633 36 C 138.375 36 134.752 34.55 132.638 31.702 C 130.526 28.853 129.518 24.313 129.518 18.181 C 129.518 12.049 130.598 7.485 132.71 4.492 C 134.821 1.498 138.471 0 143.657 0 C 148.842 0 152.49 1.498 154.604 4.443 C 156.715 7.388 157.723 11.977 157.723 18.181 C 157.723 24.386 156.691 28.877 154.58 31.702 Z M 137.082 28.056 C 138.209 30.059 140.419 31.049 143.659 31.049 C 146.898 31.049 149.109 30.059 150.236 28.104 C 151.364 26.147 151.94 22.839 151.94 18.181 C 151.94 13.523 151.364 10.165 150.188 8.065 C 149.013 5.941 146.853 4.926 143.659 4.926 C 140.465 4.926 138.329 5.965 137.13 8.065 C 135.954 10.189 135.378 13.545 135.378 18.133 C 135.33 22.769 135.906 26.077 137.082 28.056 Z M 190.178 0.58 C 192.026 0.58 193.37 2.344 192.962 4.081 L 186.624 30.013 C 185.856 33.151 183.022 35.372 179.807 35.372 C 176.591 35.372 173.757 33.151 172.99 30.013 L 166.676 4.081 C 166.22 2.271 167.612 0.58 169.46 0.58 C 170.804 0.58 171.931 1.522 172.243 2.8 L 178.245 29.24 C 178.389 29.965 179.061 30.472 179.781 30.472 C 180.5 30.472 181.172 29.965 181.316 29.24 L 187.438 2.8 C 187.702 1.496 188.829 0.58 190.173 0.58 Z M 226.928 32.016 L 220.567 6.301 C 219.847 3.356 217.495 1.037 214.517 0.628 C 210.868 0.169 207.532 2.534 206.668 6.06 L 200.355 31.871 C 199.947 33.466 200.931 35.13 202.563 35.372 C 204.002 35.589 205.274 34.695 205.634 33.296 L 206.45 29.989 L 208.082 22.914 L 208.49 21.271 L 212.091 6.494 C 212.235 5.77 212.907 5.262 213.627 5.262 C 214.347 5.262 215.019 5.77 215.163 6.494 L 219.125 22.912 L 213.315 22.912 C 212.187 22.912 211.204 23.685 210.892 24.77 C 210.484 26.365 211.659 27.86 213.315 27.86 L 220.205 27.86 L 221.548 33.294 C 221.86 34.526 222.94 35.369 224.212 35.369 L 224.26 35.369 C 226.06 35.418 227.331 33.775 226.923 32.013 Z M 80.383 32.016 L 74.022 6.301 C 73.302 3.356 70.95 1.037 67.973 0.628 C 64.325 0.169 60.987 2.534 60.123 6.06 L 53.81 31.871 C 53.402 33.466 54.386 35.13 56.018 35.372 C 57.457 35.589 58.729 34.695 59.089 33.296 L 59.905 29.989 L 61.537 22.914 L 61.945 21.271 L 65.544 6.494 C 65.688 5.77 66.36 5.262 67.08 5.262 C 67.8 5.262 68.472 5.77 68.616 6.494 L 72.577 22.912 L 66.768 22.912 C 65.64 22.912 64.656 23.685 64.344 24.77 C 63.936 26.365 65.112 27.86 66.768 27.86 L 73.657 27.86 L 75.001 33.294 C 75.313 34.526 76.393 35.369 77.665 35.369 L 77.713 35.369 C 79.512 35.418 80.858 33.775 80.376 32.013 Z" fill="url(#gFkTKSthQ-539504230-linear-gradient)" height="36px" id="gFkTKSthQ" transform="translate(0 0)" width="227.00000172234047px"/></g></svg>`

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

// Fallback badge shown under the logo when no real photo is available for the
// notification (e.g. a case alert rather than a specific person signing in).
function emojiBadge(emoji, accentColor) {
  return `
<div style="width:72px;height:72px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;
  font-size:32px;line-height:1;background:${accentColor}14;border:4px solid ${accentColor}22;box-shadow:0 4px 14px ${accentColor}33;">
  ${emoji}
</div>`
}

/**
 * Build a full HTML email — clean white card, thin brand top bar, centered
 * avatar/emoji badge, chip-style info rows, black pill CTA. (Design 2)
 *
 * @param {object} opts
 * @param {string}   opts.headerGradient   - CSS gradient for the thin top bar
 * @param {string}   opts.title            - Main heading, shown centered under the badge
 * @param {string}   [opts.subtitle]       - Subtitle under heading
 * @param {string}   [opts.accentColor]    - Accent for badge ring / chips / button (#hex)
 * @param {string}   [opts.avatarUrl]      - Real profile photo to show as the badge, if available
 * @param {string}   [opts.emoji]          - Emoji fallback badge when there's no avatar (default ⚡)
 * @param {Array}    [opts.rows]           - Array of { label, value, valueColor?, chip? }
 * @param {Array}    [opts.alertPanels]    - Array of { borderColor, bgColor, textColor, title?, content }
 * @param {string}   [opts.actionUrl]      - CTA button URL
 * @param {string}   [opts.actionLabel]    - CTA button text
 * @param {string[]} [opts.extraSections]  - Raw HTML strings inserted after rows
 */
function buildEmail({ headerGradient, title, subtitle, accentColor = '#0284c7', avatarUrl, emoji = '⚡', rows = [], alertPanels = [], actionUrl, actionLabel, extraSections = [] }) {
  const rowsHtml = rows.map((r, i) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 18px;${i < rows.length - 1 ? 'border-bottom:1px solid #e2e8f0;' : ''}">
      <span style="font-size:12.5px;color:#94a3b8;font-weight:600;letter-spacing:.03em;">${r.label.toUpperCase()}</span>
      ${r.chip
        ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:${r.valueColor || accentColor};background:${(r.valueColor || accentColor)}1a;padding:3px 10px;border-radius:99px;">${r.value}</span>`
        : `<span style="font-size:13px;color:${r.valueColor || '#0f172a'};font-weight:700;text-align:right;">${r.value}</span>`}
    </div>`).join('')

  const panelsHtml = alertPanels.map(p => alertPanel(p)).join('')

  const badgeHtml = avatarUrl
    ? `<img src="${avatarUrl}" width="72" height="72" style="border-radius:50%;object-fit:cover;display:inline-block;border:4px solid ${accentColor}22;box-shadow:0 4px 14px ${accentColor}33;" />`
    : emojiBadge(emoji, accentColor)

  const btnHtml = actionUrl && actionLabel ? `
<div style="text-align:center;margin:26px 0 4px;">
  <a href="${actionUrl}" style="display:inline-block;background:${accentColor};color:#fff;text-decoration:none;padding:0 30px;height:46px;line-height:46px;border-radius:99px;font-weight:700;font-size:14px;">${actionLabel} →</a>
</div>` : ''

  const extraHtml = extraSections.join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<div style="max-width:600px;margin:32px auto;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;border-radius:20px;overflow:hidden;box-shadow:0 10px 40px rgba(15,23,42,.10);border:1px solid #eef2f7;">

  <!-- TOP BAR -->
  <div style="height:6px;background:${headerGradient};"></div>

  <div style="padding:26px 30px 0;display:flex;align-items:center;justify-content:space-between;">
    <div style="line-height:0;">${VIANOVA_LOGO_SVG}</div>
    <span style="font-size:11px;color:#94a3b8;white-space:nowrap;">${fmtNow()}</span>
  </div>

  <!-- BADGE + TITLE -->
  <div style="padding:22px 30px 0;text-align:center;">
    ${badgeHtml}
    <div style="font-size:22px;font-weight:800;color:#0f172a;margin-top:14px;line-height:1.25;">${title}</div>
    ${subtitle ? `<div style="font-size:13.5px;color:#64748b;margin-top:4px;">${subtitle}</div>` : ''}
  </div>

  <!-- CONTENT -->
  <div style="padding:24px 30px 8px;">
    ${rowsHtml ? `<div style="background:#f8fafc;border-radius:14px;padding:2px 4px;">${rowsHtml}</div>` : ''}
    ${panelsHtml}
    ${extraHtml}
    ${btnHtml}
  </div>

  <!-- FOOTER -->
  <div style="padding:22px 30px;text-align:center;">
    <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;font-weight:700;">Vianova Health — AI-Assisted Clinical Decision Support</p>
    <p style="margin:0 0 4px;font-size:11px;color:#cbd5e1;">This is an automated notification. AI drafts require physician review before any clinical action.</p>
    <p style="margin:0;font-size:11px;color:#cbd5e1;">© 2026 Vianova Health · HIPAA-compliant platform</p>
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

export function tplLoginWelcome({ displayName, email, role, loginTime, ip, geo, avatar }) {
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
            <td style="background:rgba(255,255,255,.94);border-radius:8px;padding:5px 9px;line-height:0;">${VIANOVA_LOGO_SVG}</td>
          </tr></table>
          <div style="font-size:10px;font-weight:800;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:.14em;margin-top:8px;">Cure Analyzer System</div>
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
        ${avatar
          ? `<img src="${avatar}" width="56" height="56" style="border-radius:50%;object-fit:cover;display:block;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.15);" />`
          : `<div style="width:56px;height:56px;border-radius:50%;background:${roleGrad};text-align:center;line-height:56px;font-size:22px;font-weight:900;color:#fff;">${initial}</div>`}
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
       style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:800;padding:0 40px;height:48px;line-height:48px;border-radius:99px;text-decoration:none;letter-spacing:.03em;box-shadow:0 4px 14px rgba(0,0,0,.15);">
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
          <span style="color:#cbd5e1;">&copy; 2026 Vianova Health &bull; HIPAA-compliant platform</span>
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
    <div style="background:rgba(255,255,255,.94);border-radius:8px;padding:6px 10px;display:inline-block;line-height:0;margin-bottom:20px;">${VIANOVA_LOGO_SVG}</div>
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
