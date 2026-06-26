import 'dotenv/config'
import { setDefaultResultOrder } from 'dns'
// Force IPv4 DNS resolution — Render's network blocks outbound IPv6 (ENETUNREACH)
setDefaultResultOrder('ipv4first')
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { randomUUID, randomBytes, timingSafeEqual } from 'crypto'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import Groq from 'groq-sdk'
import bcrypt from 'bcryptjs'
import { sendEmail, tplNewCase, tplEmergencyAlert, tplCaseApproved, tplTreatmentEdited } from './mailer.js'

const require = createRequire(import.meta.url)
const { generateCasesReport } = require('./report.cjs')

// ── Turso HTTP client (native fetch, no library dependency) ───────────────────
const TURSO_URL   = process.env.TURSO_URL
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN

function toArg(v) {
  if (v === null || v === undefined) return { type: 'null' }
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' }
  if (typeof v === 'number') return Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v }
  return { type: 'text', value: String(v) }
}

const db = {
  async execute({ sql, args = [] }) {
    const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ type: 'execute', stmt: { sql, args: args.map(toArg) } }, { type: 'close' }] }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`Turso HTTP ${res.status}: ${JSON.stringify(data)}`)
    const result = data.results?.[0]
    if (result?.type === 'error') throw new Error(result.error?.message || 'Turso query error')
    const cols = result?.response?.result?.cols?.map(c => c.name) || []
    const rows = (result?.response?.result?.rows || []).map(row => {
      const obj = {}
      cols.forEach((col, i) => {
        const cell = row[i]
        obj[col] = cell?.type === 'null' ? null : cell?.type === 'integer' ? Number(cell.value) : (cell?.value ?? null)
      })
      return obj
    })
    return { rows }
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const IS_PROD   = process.env.NODE_ENV === 'production'

async function initDB() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS cases (case_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, patient_input TEXT NOT NULL, analysis TEXT NOT NULL, owner_key TEXT NOT NULL DEFAULT '', follow_up_date TEXT, share_token TEXT)`,
    `CREATE TABLE IF NOT EXISTS keys (key TEXT PRIMARY KEY, role TEXT NOT NULL, label TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)`,
    `CREATE TABLE IF NOT EXISTS updates_log (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, description TEXT NOT NULL, metadata TEXT, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS errors_log (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, message TEXT NOT NULL, stack TEXT, route TEXT, metadata TEXT, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'doctor', active INTEGER NOT NULL DEFAULT 1, notify_email TEXT NOT NULL DEFAULT '', password_hash TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS otp_codes (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, code TEXT NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, user_email TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS gen_patients (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, name TEXT NOT NULL, dob TEXT, sex TEXT, mrn TEXT, phone TEXT, conditions TEXT, medications TEXT, allergies TEXT, fhir_vitals TEXT, notes TEXT, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS rpm_patients (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, name TEXT NOT NULL, dob TEXT, condition TEXT, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS rpm_readings (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, heart_rate REAL, spo2 REAL, systolic_bp REAL, diastolic_bp REAL, temperature REAL, resp_rate REAL, note TEXT, recorded_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ccm_patients (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, name TEXT NOT NULL, dob TEXT, conditions TEXT, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ccm_care_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, template TEXT NOT NULL, tasks TEXT NOT NULL, goals TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS ccm_checkins (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL, minutes INTEGER NOT NULL, notes TEXT, checkin_date TEXT NOT NULL, created_at TEXT NOT NULL)`,
    // feature 5 – care gaps
    `CREATE TABLE IF NOT EXISTS care_gaps (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, owner_email TEXT NOT NULL, gap_type TEXT NOT NULL, description TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'medium', status TEXT NOT NULL DEFAULT 'open', suppression_reason TEXT, due_date TEXT, outreach_message TEXT, created_at TEXT NOT NULL, closed_at TEXT)`,
    // feature 8 – lab results
    `CREATE TABLE IF NOT EXISTS lab_results (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, owner_email TEXT NOT NULL, test_name TEXT NOT NULL, value REAL NOT NULL, unit TEXT, reference_low REAL, reference_high REAL, interpretation TEXT, critical INTEGER NOT NULL DEFAULT 0, delta_flag INTEGER NOT NULL DEFAULT 0, result_date TEXT NOT NULL, ai_summary TEXT, notes TEXT, created_at TEXT NOT NULL)`,
    // feature 9 – appointments
    `CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, owner_email TEXT NOT NULL, appointment_type TEXT NOT NULL, appointment_date TEXT NOT NULL, duration_minutes INTEGER NOT NULL DEFAULT 30, provider TEXT, location TEXT, notes TEXT, status TEXT NOT NULL DEFAULT 'scheduled', no_show_risk REAL, reminder_sent INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
    // feature 10 – discharge summaries
    `CREATE TABLE IF NOT EXISTS discharge_summaries (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, owner_email TEXT NOT NULL, case_id TEXT, summary TEXT NOT NULL, patient_instructions TEXT, medications_at_discharge TEXT, follow_up_plan TEXT, risk_level TEXT NOT NULL DEFAULT 'low', finalized INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
    // feature 12 – consents & audit
    `CREATE TABLE IF NOT EXISTS consents (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, owner_email TEXT NOT NULL, consent_type TEXT NOT NULL, granted INTEGER NOT NULL DEFAULT 1, signed_by TEXT, signed_date TEXT, expires_at TEXT, notes TEXT, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_email TEXT NOT NULL, patient_id TEXT, action TEXT NOT NULL, resource_type TEXT, actor TEXT, details TEXT, created_at TEXT NOT NULL)`,
    // feature 13 – adverse events & pharmacovigilance
    `CREATE TABLE IF NOT EXISTS adverse_events (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, owner_email TEXT NOT NULL, event_type TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'moderate', suspected_medication TEXT, description TEXT NOT NULL, detected_at TEXT NOT NULL, detection_method TEXT NOT NULL DEFAULT 'manual', status TEXT NOT NULL DEFAULT 'open', causality TEXT, ai_assessment TEXT, medwatch_draft TEXT, resolved_at TEXT, notes TEXT, created_at TEXT NOT NULL)`,
    // feature 14 – population health
    `CREATE TABLE IF NOT EXISTS cohorts (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, name TEXT NOT NULL, description TEXT, criteria TEXT NOT NULL, program_type TEXT, member_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS cohort_members (id INTEGER PRIMARY KEY AUTOINCREMENT, cohort_id TEXT NOT NULL, patient_id TEXT NOT NULL, enrolled_at TEXT NOT NULL, risk_level TEXT, outreach_status TEXT NOT NULL DEFAULT 'pending', UNIQUE(cohort_id, patient_id))`,
    // feature 17 – SDOH
    `CREATE TABLE IF NOT EXISTS sdoh_assessments (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, owner_email TEXT NOT NULL, housing TEXT, food_security TEXT, transportation TEXT, financial_strain TEXT, social_isolation TEXT, education TEXT, employment TEXT, safety TEXT, z_codes TEXT, ai_summary TEXT, resources_suggested TEXT, status TEXT NOT NULL DEFAULT 'active', assessed_at TEXT NOT NULL, created_at TEXT NOT NULL)`,
    // feature 19 – patient portal / chatbot
    `CREATE TABLE IF NOT EXISTS portal_intakes (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, owner_email TEXT NOT NULL, chief_complaint TEXT, symptoms TEXT, symptom_duration TEXT, pain_scale INTEGER, phq9_score INTEGER, gad7_score INTEGER, phq9_answers TEXT, gad7_answers TEXT, triage_level TEXT, ai_recommendation TEXT, created_at TEXT NOT NULL)`,
  ]
  for (const sql of stmts) {
    try { await db.execute({ sql, args: [] }) } catch (e) { console.warn('initDB stmt skipped:', e.message) }
  }
  // migrations for old columns — ignore errors if already exist
  const migrations = [
    `ALTER TABLE keys ADD COLUMN email TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE cases ADD COLUMN follow_up_date TEXT`,
    `ALTER TABLE cases ADD COLUMN share_token TEXT`,
    `ALTER TABLE users ADD COLUMN notify_email TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`,
    // rename owner_key → owner_email in patient tables if created with old schema
    `ALTER TABLE gen_patients RENAME COLUMN owner_key TO owner_email`,
    `ALTER TABLE rpm_patients RENAME COLUMN owner_key TO owner_email`,
    `ALTER TABLE ccm_patients RENAME COLUMN owner_key TO owner_email`,
    // patient ingestion v2 — new fields
    `ALTER TABLE gen_patients ADD COLUMN email TEXT`,
    `ALTER TABLE gen_patients ADD COLUMN address TEXT`,
    `ALTER TABLE gen_patients ADD COLUMN language TEXT`,
    `ALTER TABLE gen_patients ADD COLUMN import_source TEXT`,
    `ALTER TABLE gen_patients ADD COLUMN data_quality_score INTEGER`,
  ]
  for (const sql of migrations) {
    try { await db.execute({ sql, args: [] }) } catch {}
  }
}

const app = express()

// ── Trust proxy (Render sits behind a load-balancer) ─────────────────────────
app.set('trust proxy', 1)

// ── Security headers via Helmet ───────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'"],          // Vite inlines scripts in dev
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:         ["'self'", 'data:', 'https:'],
      connectSrc:     ["'self'", 'https://api.groq.com'],
      frameSrc:       ["'none'"],
      objectSrc:      ["'none'"],
      upgradeInsecureRequests: IS_PROD ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,   // some browsers block CDN fonts otherwise
  hsts: IS_PROD ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
}))

// ── CORS — only allow the known frontend origin ───────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean)

app.use(cors({
  origin(origin, cb) {
    // Allow server-to-server (no origin) and listed origins; block everything else in prod
    if (!origin || !IS_PROD || ALLOWED_ORIGINS.length === 0) return cb(null, true)
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization'],
  credentials: true,
  maxAge:      86400,
}))

// ── Body parsing — cap JSON payload at 256 KB ─────────────────────────────────
app.use(express.json({ limit: '256kb' }))

// ── Rate limiters ─────────────────────────────────────────────────────────────
// Strict limiter for auth endpoints (login / OTP)
const authLimiter = rateLimit({
  windowMs:         15 * 60 * 1000,  // 15 min window
  max:              10,               // 10 attempts per IP
  standardHeaders:  'draft-7',
  legacyHeaders:    false,
  message:          { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
  skipSuccessfulRequests: true,
})

// General API limiter — generous but caps scraping / runaway loops
const apiLimiter = rateLimit({
  windowMs:        60 * 1000,   // 1 min
  max:             120,         // 120 req/min per IP
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  message:         { error: 'Rate limit exceeded. Please slow down.' },
})

// AI endpoints are expensive — tighter cap
const aiLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             20,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  message:         { error: 'AI rate limit reached. Please wait before making more AI requests.' },
})

app.use('/api/auth', authLimiter)
app.use('/api',      apiLimiter)

// ── Helpers ───────────────────────────────────────────────────────────────────
// Constant-time token comparison to prevent timing attacks
function safeEqual(a, b) {
  try {
    return timingSafeEqual(Buffer.from(String(a)), Buffer.from(String(b)))
  } catch { return false }
}

// Sanitise a free-text string — strip null bytes, control chars, oversized input
function sanitise(val, maxLen = 2000) {
  if (val == null) return val
  return String(val).replace(/\0/g, '').replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').slice(0, maxLen)
}

// Simple email shape check
function validEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}

const client = new Groq({ apiKey: process.env.GROQ_API_KEY })

// ── ownership helpers ──────────────────────────────────────────────────────────
async function getCaseForKey(caseId, reqKey, reqRole) {
  if (reqRole === 'superadmin') {
    return (await db.execute({ sql: 'SELECT * FROM cases WHERE case_id = ?', args: [caseId] })).rows[0] ?? null
  }
  return (await db.execute({ sql: 'SELECT * FROM cases WHERE case_id = ? AND owner_key = ?', args: [caseId, reqKey] })).rows[0] ?? null
}
async function listCasesForKey(reqKey, reqRole) {
  if (reqRole === 'superadmin') return (await db.execute({ sql: 'SELECT * FROM cases ORDER BY created_at DESC', args: [] })).rows
  return (await db.execute({ sql: 'SELECT * FROM cases WHERE owner_key = ? ORDER BY created_at DESC', args: [reqKey] })).rows
}
async function keyStats(apiKey, role) {
  const rows = role === 'superadmin'
    ? (await db.execute({ sql: 'SELECT analysis, owner_key FROM cases', args: [] })).rows
    : (await db.execute({ sql: 'SELECT analysis FROM cases WHERE owner_key = ?', args: [apiKey] })).rows
  let total = rows.length, pending = 0, approved = 0, emergency = 0
  rows.forEach(r => {
    const a = JSON.parse(r.analysis)
    if (a.doctor_review?.approved) approved++
    else pending++
    if ((a.red_flags?.emergency_escalation_required ?? a.red_flags?.emergency_detected)) emergency++
  })
  let doctors = undefined
  if (role === 'superadmin') {
    const users = (await db.execute({ sql: "SELECT id, name, email, role FROM users WHERE active = 1", args: [] })).rows
    doctors = users.map(u => ({
      key: u.email, label: u.name, role: u.role,
      cases: rows.filter(r => r.owner_key === u.email).length
    }))
  }
  return { total, pending, approved, emergency, ...(doctors ? { doctors } : {}) }
}

// ── log helpers ────────────────────────────────────────────────────────────────
async function logUpdate(type, description, metadata = null) {
  await db.execute({ sql: 'INSERT INTO updates_log (type, description, metadata, created_at) VALUES (?, ?, ?, ?)', args: [type, description, metadata ? JSON.stringify(metadata) : null, new Date().toISOString()] })
}
async function logError(type, message, route = null, stack = null, metadata = null) {
  await db.execute({ sql: 'INSERT INTO errors_log (type, message, stack, route, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)', args: [type, message, stack || null, route || null, metadata ? JSON.stringify(metadata) : null, new Date().toISOString()] })
}

// ── email helpers ─────────────────────────────────────────────────────────────
async function notify(email, tpl) {
  const result = await sendEmail({ to: email, ...tpl })
  if (!result.ok) {
    logError('email_failed', result.error, 'notify()', null, { to: email, subject: tpl.subject })
  } else {
    logUpdate('email_sent', `Email sent to ${email}: ${tpl.subject}`, { to: email, subject: tpl.subject })
  }
  return result
}

// Broadcast a notification to ALL active users (all doctors + superadmins)
// Delivers to notify_email if set, otherwise falls back to login email
async function notifyAll(tpl, { skipEmail } = {}) {
  const users = (await db.execute({ sql: 'SELECT email, notify_email FROM users WHERE active = 1', args: [] })).rows
  users.forEach(u => {
    if (skipEmail && u.email === skipEmail) return
    const dest = u.notify_email || u.email
    if (!dest) return
    sendEmail({ to: dest, ...tpl }).then(r => {
      if (!r.ok) logError('email_failed', r.error, 'notifyAll()', null, { to: dest, subject: tpl.subject })
      else logUpdate('email_sent', `Email sent to ${dest}: ${tpl.subject}`, { to: dest, subject: tpl.subject })
    }).catch(() => {})
  })
}

// Send a system-error alert to all superadmins + the given doctor email
async function notifySystemError(errorMsg, route, submitterEmail) {
  const tpl = {
    subject: '⚠️ Vianova System Error',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <div style="background:#7f1d1d;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.7;margin-bottom:4px">Vianova Health · System Alert</div>
          <div style="font-size:20px;font-weight:700">System Error Detected</div>
        </div>
        <div style="background:#fff;border:1px solid #fecaca;border-top:none;padding:20px 24px;border-radius:0 0 12px 12px">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr><td style="padding:7px 0;color:#64748b;width:120px">Route</td><td style="color:#0f172a;font-family:monospace">${route || '—'}</td></tr>
            <tr><td style="padding:7px 0;color:#64748b">Error</td><td style="color:#dc2626;font-weight:600">${errorMsg}</td></tr>
            <tr><td style="padding:7px 0;color:#64748b">Triggered by</td><td style="color:#0f172a">${submitterEmail || '—'}</td></tr>
            <tr><td style="padding:7px 0;color:#64748b">Time</td><td style="color:#0f172a">${new Date().toLocaleString()}</td></tr>
          </table>
          <div style="margin-top:16px;font-size:12px;color:#94a3b8">Check the Logs &amp; Analytics → Errors tab for full details.</div>
        </div>
      </div>
    `
  }
  // Email all superadmins
  const admins = (await db.execute({ sql: "SELECT email FROM users WHERE role = 'superadmin' AND active = 1", args: [] })).rows
  admins.forEach(u => { sendEmail({ to: u.email, ...tpl }).catch(() => {}) })
  // Also email the submitter if they're not a superadmin
  if (submitterEmail && !admins.find(u => u.email === submitterEmail)) {
    sendEmail({ to: submitterEmail, ...tpl }).catch(() => {})
  }
}

// ── new auth middleware ────────────────────────────────────────────────────────
async function auth(req, res, next) {
  const token = req.headers['x-api-key'] || req.query.key
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const session = (await db.execute({ sql: 'SELECT * FROM sessions WHERE token = ?', args: [token] })).rows[0]
  if (!session || new Date(session.expires_at) < new Date()) return res.status(401).json({ error: 'Session expired' })
  const user = (await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [session.user_id] })).rows[0]
  if (!user || !user.active) return res.status(401).json({ error: 'Account inactive' })
  if (user.status && user.status !== 'active') return res.status(401).json({ error: 'Account pending approval' })
  req.apiKey   = user.email   // backward compat — owner_key queries use email
  req.keyRole  = user.role
  req.keyLabel = user.name
  req.user     = user
  next()
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'superadmin') return res.status(403).json({ error: 'Admin only' })
  next()
}

// ── legacy requireRole (kept for backward compat; mapped to auth/requireAdmin) ─
function requireRole(...roles) {
  return async (req, res, next) => {
    // Try new session-based auth first
    const token = req.headers['x-api-key'] || req.query.key
    if (token) {
      const session = (await db.execute({ sql: 'SELECT * FROM sessions WHERE token = ?', args: [token] })).rows[0]
      if (session && new Date(session.expires_at) >= new Date()) {
        const user = (await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [session.user_id] })).rows[0]
        if (user && user.active) {
          req.apiKey   = user.email
          req.keyRole  = user.role
          req.keyLabel = user.name
          req.user     = user
          // map roles: 'dev' => 'superadmin', 'doctor' => 'doctor'
          const mappedRoles = roles.map(r => r === 'dev' ? 'superadmin' : r)
          if (mappedRoles.includes(user.role)) return next()
          return res.status(403).json({ error: 'Insufficient permissions' })
        }
      }
      // Fall back to legacy key lookup
      const row = (await db.execute({ sql: 'SELECT * FROM keys WHERE key = ? AND active = 1', args: [token] })).rows[0]
      if (row) {
        if (!roles.includes(row.role)) return res.status(403).json({ error: 'Insufficient permissions' })
        req.apiKey   = row.key
        req.keyRole  = row.role
        req.keyLabel = row.label
        return next()
      }
    }
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

// ── Seed superadmins and doctors ──────────────────────────────────────────────
async function seed() {
  const now = new Date().toISOString()
  // Set SUPERADMIN_PASSWORD env var on Render to auto-seed login password
  const seedPasswordHash = process.env.SUPERADMIN_PASSWORD
    ? bcrypt.hashSync(process.env.SUPERADMIN_PASSWORD, 10)
    : ''

  // Hardcoded superadmins
  const superadmins = [
    { email: 'diar.azemi@outlook.com', name: 'Diar Azemi',    role: 'superadmin' },
    { email: 'emorina@vianova.ai',     name: 'Eron Morina', role: 'superadmin' },
  ]
  for (const u of superadmins) {
    await db.execute({
      sql: `INSERT INTO users (id, email, name, role, active, status, password_hash, created_at) VALUES (?, ?, ?, ?, 1, 'active', ?, ?) ON CONFLICT(email) DO UPDATE SET name=excluded.name, role=excluded.role, active=1, status='active', password_hash = CASE WHEN users.password_hash = '' AND excluded.password_hash != '' THEN excluded.password_hash ELSE users.password_hash END`,
      args: [randomUUID(), u.email, u.name, u.role, seedPasswordHash, now]
    })
  }

  // Doctors from env vars
  for (let i = 1; i <= 5; i++) {
    const email = process.env[`DOC_EMAIL_${i}`], name = process.env[`DOC_NAME_${i}`]
    if (email && name) {
      await db.execute({
        sql: `INSERT INTO users (id, email, name, role, active, status, password_hash, created_at) VALUES (?, ?, ?, 'doctor', 1, 'active', '', ?) ON CONFLICT(email) DO UPDATE SET name=excluded.name, active=1`,
        args: [randomUUID(), email, name, now]
      })
      console.log(`  DOCTOR: ${email} (${name})`)
    }
  }

  console.log('\n  === Vianova Users ===')
  superadmins.forEach(u => console.log(`  SUPERADMIN: ${u.email}`))
  console.log()
}

// ── GET /api/admin/keys — view all keys (protected by ADMIN_SECRET env var) ───
app.get('/api/admin/keys', async (req, res) => {
  const secret = process.env.ADMIN_SECRET
  if (!secret || req.query.secret !== secret) {
    return res.status(403).json({ error: 'Forbidden — set ADMIN_SECRET env var and pass ?secret=YOUR_SECRET' })
  }
  const keys = (await db.execute({ sql: 'SELECT key, role, label, email, active, created_at FROM keys ORDER BY created_at DESC', args: [] })).rows
  res.json({ keys })
})

// ── system prompt ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a clinical decision support assistant for Vianova Health.
Your role is to analyze patient intake data — which may include imported FHIR records — and produce a structured DRAFT clinical analysis for a licensed physician to review.

CRITICAL RULES — follow every one:
1. This is a DRAFT for physician review ONLY. It is never a final diagnosis or prescription.
2. Use ONLY the data provided. Flag any missing information explicitly in missing_critical_info.
3. Provide DIFFERENTIAL diagnoses ranked by likelihood — never a single certain diagnosis.
4. Clearly flag ALL red flags and emergency indicators.
5. For every pharmacological suggestion add: "REQUIRES PHYSICIAN VERIFICATION OF DOSE, CONTRAINDICATIONS, AND INTERACTIONS".
6. Flag special populations: pediatric (age <18), elderly (age >65), pregnancy-related presentations, renal or hepatic impairment.
7. Be conservative: when in doubt, recommend investigation rather than treatment.
8. Emergency cases (emergency_escalation_required = true) must be flagged immediately at the top of the output.

DATA FRESHNESS — apply to ALL imported FHIR findings (each finding is given with a date and AGE_DAYS):
9. You are given CURRENT DATE. Judge every dated finding by how old it is. Do NOT assume imported data reflects the patient's present condition.
10. Classify VOLATILE data (vital signs, lab results, imaging, acute symptoms, current medication lists) by age:
    - 0–30 days  -> "current"    : use normally.
    - 31–90 days -> "recent"     : use, but note it may have changed.
    - 91–180 days-> "stale"      : DO NOT base treatment on it; require a repeat test.
    - 181–365 days-> "outdated"  : historical context only; repeat test required.
    - >365 days  -> "historical" : trend/context only; must be re-measured.
11. Classify DURABLE data (allergies, chronic diagnoses, surgical/family history, immunizations) as durable; flag only if >3 years old AND clinically expected to change.
12. Any finding with NO date is "undated" -> reliability unknown; add to missing_critical_info.
13. For EVERY finding that is "stale", "outdated", "historical", or "undated", you MUST add a concrete repeat-test recommendation to retest_required AND to recommended_investigations (urgent if clinically time-sensitive, otherwise routine), naming the exact test and WHY its age makes it unreliable.
14. Lower the overall confidence score and explain in data_quality_notes whenever the assessment leans on stale/outdated/undated data. If the chief complaint can only be assessed with data older than 90 days, confidence cannot be "high".
15. NEVER suggest starting or changing a medication based on a lab/vital older than 90 days without first listing the repeat test that must confirm it.

Return ONLY valid JSON — no markdown, no explanation, no code block — matching this EXACT schema:
{
  "patient_snapshot": { "age": 0, "sex": "", "known_conditions": [], "allergies": [], "current_medications": [], "special_population_flags": [], "missing_critical_info": [] },
  "data_recency_assessment": {
    "current_date": "",
    "overall_data_freshness": "current",
    "findings": [
      { "finding": "", "type": "volatile", "value": "", "recorded_date": "", "age_days": 0, "freshness": "current", "reliable_for_decision": true, "note": "" }
    ],
    "summary": ""
  },
  "retest_required": [
    { "test": "", "reason_stale": "", "last_value": "", "last_date": "", "age_days": 0, "priority": "routine" }
  ],
  "presenting_complaint": "",
  "structured_symptoms": { "primary": "", "associated": [], "onset": "", "duration": "", "severity": "", "character": "", "aggravating_factors": [], "relieving_factors": [] },
  "red_flags": { "present": false, "items": [], "emergency_escalation_required": false, "escalation_reason": "" },
  "differential_assessment": [ { "condition": "", "likelihood": "high", "supporting_evidence": [], "against_evidence": [], "based_on_stale_data": false } ],
  "recommended_investigations": { "urgent": [], "routine": [], "rationale": "" },
  "draft_treatment_plan": { "non_pharmacological": [], "pharmacological": [ { "drug": "", "class": "", "rationale": "", "caution": "REQUIRES PHYSICIAN VERIFICATION OF DOSE AND CONTRAINDICATIONS", "contraindications_to_check": [] } ], "follow_up": "", "referral_needed": false, "referral_type": "" },
  "allergy_interaction_check": { "allergy_conflicts_found": false, "conflicts": [], "interaction_risks": [], "notes": "" },
  "patient_plain_language_summary": "",
  "confidence": { "level": "moderate", "score": 0.7, "reasoning": "", "data_quality_notes": "" },
  "doctor_review": { "status": "PENDING_REVIEW", "approved": false, "edited_by_doctor": false, "doctor_notes": "", "final_approved_cure": null, "reviewed_by": null, "reviewed_at": null }
}`

// ── POST /api/analyze ──────────────────────────────────────────────────────────
app.post('/api/analyze', auth, aiLimiter, async (req, res) => {
  try {
    const patientData = req.body
    const caseId = randomUUID()
    patientData.patient_id = patientData.patient_id || caseId
    patientData.current_date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD for FHIR freshness rules

    const message = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 4096,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(patientData) }
      ]
    })

    let analysis
    try {
      const raw = message.choices[0].message.content.trim()
      analysis = JSON.parse(raw)
    } catch {
      return res.status(500).json({ error: 'AI returned malformed JSON', raw: message.choices[0].message.content })
    }

    const now = new Date().toISOString()
    await db.execute({ sql: 'INSERT INTO cases (case_id, created_at, patient_input, analysis, owner_key) VALUES (?, ?, ?, ?, ?)', args: [caseId, now, JSON.stringify(patientData), JSON.stringify(analysis), req.apiKey] })

    const isEmergency = (analysis.red_flags?.emergency_escalation_required ?? analysis.red_flags?.emergency_detected) || analysis.requires_urgent_review
    await logUpdate('case_submitted', `New case submitted by ${req.keyLabel} (${patientData.age || '?'}y ${patientData.sex || '?'})${isEmergency ? ' — EMERGENCY' : ''}`, {
      case_id: caseId,
      label: req.keyLabel,
      confidence: (analysis.confidence?.level ?? analysis.confidence_level),
      emergency: isEmergency,
      age: patientData.age,
      sex: patientData.sex,
      complaint: analysis.presenting_complaint,
      vitals: patientData.vitals || null,
    })

    // send email notifications (fire-and-forget)
    const emailCtx = {
      caseId, label: req.keyLabel,
      age: patientData.age, sex: patientData.sex,
      complaint: analysis.presenting_complaint,
      confidence: (analysis.confidence?.level ?? analysis.confidence_level),
      emergency: isEmergency,
    }
    // Notify ALL users about the new case
    if (isEmergency) {
      notifyAll(tplEmergencyAlert({
        ...emailCtx,
        redFlags: analysis.red_flags?.indicators || [],
      }))
    } else {
      notifyAll(tplNewCase(emailCtx))
    }

    res.json({ case_id: caseId, analysis })
  } catch (err) {
    console.error(err)
    logError('analyze_failed', err.message, 'POST /api/analyze', err.stack)
    notifySystemError(err.message, 'POST /api/analyze', req.apiKey)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/cases ─────────────────────────────────────────────────────────────
app.get('/api/cases', auth, async (req, res) => {
  const rows = await listCasesForKey(req.apiKey, req.keyRole)
  const list = rows.map(row => {
    const patient  = JSON.parse(row.patient_input)
    const analysis = JSON.parse(row.analysis)
    return {
      case_id:              row.case_id,
      created_at:           row.created_at,
      age:                  patient?.age,
      sex:                  patient?.sex,
      presenting_complaint: analysis?.presenting_complaint,
      confidence_level:     (analysis?.confidence?.level ?? analysis?.confidence_level),
      requires_urgent_review: analysis?.requires_urgent_review,
      emergency_detected:   (analysis?.red_flags?.emergency_escalation_required ?? analysis?.red_flags?.emergency_detected),
      review_status:        analysis?.doctor_review?.status,
      approved:             analysis?.doctor_review?.approved,
      follow_up_date:       row.follow_up_date || null,
      vitals:               patient?.vitals || [],
    }
  })
  res.json(list)
})

// ── GET /api/cases/:id ─────────────────────────────────────────────────────────
app.get('/api/cases/:id', auth, async (req, res) => {
  const row = await getCaseForKey(req.params.id, req.apiKey, req.keyRole)
  if (!row) return res.status(404).json({ error: 'Not found or access denied' })
  res.json({
    case_id:        row.case_id,
    created_at:     row.created_at,
    patient_input:  JSON.parse(row.patient_input),
    analysis:       JSON.parse(row.analysis),
    follow_up_date: row.follow_up_date || null,
  })
})

// ── PATCH /api/cases/:id/review ────────────────────────────────────────────────
app.patch('/api/cases/:id/review', auth, async (req, res) => {
  const row = await getCaseForKey(req.params.id, req.apiKey, req.keyRole)
  if (!row) return res.status(404).json({ error: 'Not found or access denied' })

  const analysis = JSON.parse(row.analysis)
  const { doctor_notes, final_approved_cure, approved, reviewed_by, follow_up_date } = req.body

  analysis.doctor_review = {
    status: approved ? 'APPROVED' : 'REVIEWED_NOT_APPROVED',
    approved: !!approved,
    edited_by_doctor: true,
    doctor_notes: doctor_notes ?? analysis.doctor_review.doctor_notes,
    final_approved_cure: final_approved_cure ?? analysis.doctor_review.final_approved_cure,
    reviewed_by: reviewed_by ?? 'Dr. (name pending)',
    reviewed_at: new Date().toISOString()
  }

  const patient = JSON.parse(row.patient_input)
  const prevAnalysis = JSON.parse(row.analysis)
  const oldTreatment = prevAnalysis.doctor_review?.final_approved_cure || null
  const treatmentChanged = final_approved_cure && final_approved_cure !== oldTreatment

  await db.execute({ sql: 'UPDATE cases SET analysis = ?, follow_up_date = ? WHERE case_id = ?', args: [JSON.stringify(analysis), follow_up_date || row.follow_up_date || null, req.params.id] })

  if (approved) {
    await logUpdate('case_approved', `Case ${req.params.id.slice(0,8)} approved by ${reviewed_by || req.keyLabel}`, {
      case_id: req.params.id, label: req.keyLabel, reviewed_by,
      age: patient.age, sex: patient.sex,
      treatment: final_approved_cure,
    })
    notifyAll(tplCaseApproved({
      caseId: req.params.id,
      label: req.keyLabel,
      age: patient.age, sex: patient.sex,
      complaint: analysis.presenting_complaint,
      approvedBy: reviewed_by || req.keyLabel,
      treatment: final_approved_cure,
    }))
  } else if (treatmentChanged) {
    await logUpdate('treatment_edited', `Treatment plan edited for case ${req.params.id.slice(0,8)} by ${req.keyLabel}`, {
      case_id: req.params.id, label: req.keyLabel,
      old_treatment: oldTreatment, new_treatment: final_approved_cure,
    })
    notifyAll(tplTreatmentEdited({
      caseId: req.params.id,
      label: req.keyLabel,
      age: patient.age, sex: patient.sex,
      oldTreatment, newTreatment: final_approved_cure,
      notes: doctor_notes,
    }))
  } else if (doctor_notes) {
    await logUpdate('notes_updated', `Doctor notes updated for case ${req.params.id.slice(0,8)} by ${req.keyLabel}`, {
      case_id: req.params.id, label: req.keyLabel,
    })
  }

  res.json({
    case_id:        row.case_id,
    created_at:     row.created_at,
    patient_input:  patient,
    analysis,
    follow_up_date: follow_up_date || row.follow_up_date || null,
  })
})

// ── POST /api/auth/login ───────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  if (!validEmail(email))  return res.status(400).json({ error: 'Invalid email format' })
  if (typeof password !== 'string' || password.length > 256)
    return res.status(400).json({ error: 'Invalid password' })

  const normalEmail = email.toLowerCase().trim()
  const user = (await db.execute({ sql: 'SELECT * FROM users WHERE email = ? AND active = 1', args: [normalEmail] })).rows[0]

  // Always run bcrypt to prevent user-enumeration via timing
  const dummyHash = '$2a$12$invalidhashpaddingtomakethisreallylong000000000000000000'
  const hash = user?.password_hash || dummyHash
  const valid = bcrypt.compareSync(password, hash)

  if (!user || !valid) return res.status(401).json({ error: 'Invalid email or password' })
  if (user.status && user.status !== 'active') return res.status(401).json({ error: 'Account pending approval — contact admin' })
  if (!user.password_hash) return res.status(401).json({ error: 'No password set — contact admin' })

  const token     = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  await db.execute({
    sql:  'INSERT INTO sessions (token, user_id, user_email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [token, user.id, user.email, expiresAt, new Date().toISOString()],
  })
  const displayName = user.role === 'doctor' ? `Dr. ${user.name}` : user.name
  await logUpdate('auth_login', `${user.role} "${displayName}" signed in`, { email: user.email, role: user.role })
  res.json({ token, role: user.role, label: displayName, email: user.email })
})

// ── POST /api/auth/logout — invalidate the session token ─────────────────────
app.post('/api/auth/logout', async (req, res) => {
  const token = req.headers['x-api-key'] || req.body?.token
  if (token) await db.execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [token] }).catch(() => {})
  res.json({ ok: true })
})

// ── POST /api/auth/request-otp (kept for backward compat — no longer used in UI) ─
app.post('/api/auth/request-otp', async (req, res) => {
  res.status(410).json({ error: 'OTP login is no longer supported. Use email + password.' })
})

// ── POST /api/auth/verify-otp (kept for backward compat) ──────────────────────
app.post('/api/auth/verify-otp', (req, res) => {
  res.status(410).json({ error: 'OTP login is no longer supported. Use email + password.' })
})

// ── POST /api/auth/verify — backward compat (session token lookup) ─────────────
app.post('/api/auth/verify', async (req, res) => {
  const { key } = req.body
  if (!key) return res.status(400).json({ error: 'Key required' })
  // Try session token
  const session = (await db.execute({ sql: 'SELECT * FROM sessions WHERE token = ?', args: [key] })).rows[0]
  if (session && new Date(session.expires_at) >= new Date()) {
    const user = (await db.execute({ sql: 'SELECT * FROM users WHERE id = ? AND active = 1', args: [session.user_id] })).rows[0]
    if (user) {
      const displayName = user.role === 'doctor' ? `Dr. ${user.name}` : user.name
      const stats = await keyStats(user.email, user.role)
      return res.json({ role: user.role, label: displayName, stats, email: user.email })
    }
  }
  // Fall back to legacy key
  const row = (await db.execute({ sql: 'SELECT * FROM keys WHERE key = ? AND active = 1', args: [key] })).rows[0]
  if (!row) return res.status(403).json({ error: 'Invalid or revoked key' })
  await logUpdate('auth_login', `${row.role} key "${row.label}" connected`, { role: row.role, label: row.label })
  const stats = await keyStats(key, row.role)
  res.json({ role: row.role, label: row.label, stats })
})

// ── GET /api/logs/updates ─────────────────────────────────────────────────────
// Superadmin: all update types. Doctor: all case-related updates for all doctors.
const CASE_UPDATE_TYPES = ['case_submitted','case_approved','case_reviewed','treatment_edited','notes_updated','email_sent']
app.get('/api/logs/updates', auth, async (req, res) => {
  let rows
  if (req.keyRole === 'superadmin') {
    rows = (await db.execute({ sql: 'SELECT * FROM updates_log ORDER BY created_at DESC LIMIT 500', args: [] })).rows
  } else {
    // Doctors see all case-related activity (not just their own) — no personal filter
    rows = (await db.execute({
      sql: `SELECT * FROM updates_log WHERE type IN (${CASE_UPDATE_TYPES.map(()=>'?').join(',')}) ORDER BY created_at DESC LIMIT 500`,
      args: [...CASE_UPDATE_TYPES]
    })).rows
  }
  const counts = {}
  rows.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1 })
  res.json({ total: rows.length, by_type: counts, items: rows.map(r => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })) })
})

// ── GET /api/logs/errors ──────────────────────────────────────────────────────
// Superadmin: all errors. Doctor: only case-submission failures (analyze_failed + email_failed).
const DOCTOR_ERROR_TYPES = ['analyze_failed', 'email_failed']
app.get('/api/logs/errors', auth, async (req, res) => {
  let rows
  if (req.keyRole === 'superadmin') {
    rows = (await db.execute({ sql: 'SELECT * FROM errors_log ORDER BY created_at DESC LIMIT 500', args: [] })).rows
  } else {
    rows = (await db.execute({
      sql: `SELECT * FROM errors_log WHERE type IN (${DOCTOR_ERROR_TYPES.map(()=>'?').join(',')}) ORDER BY created_at DESC LIMIT 200`,
      args: [...DOCTOR_ERROR_TYPES]
    })).rows
  }
  const counts = {}
  rows.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1 })
  res.json({ total: rows.length, by_type: counts, items: rows.map(r => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })) })
})

// ── GET /api/logs/errors/:id/report (superadmin only) ─────────────────────────
app.get('/api/logs/errors/:id/report', auth, requireAdmin, async (req, res) => {
  const row = (await db.execute({ sql: 'SELECT * FROM errors_log WHERE id = ?', args: [req.params.id] })).rows[0]
  if (!row) return res.status(404).json({ error: 'Not found' })
  const meta = row.metadata ? JSON.parse(row.metadata) : {}
  const report = [
    '=== VIANOVA HEALTH — ERROR REPORT ===',
    `Generated : ${new Date().toISOString()}`,
    `Error ID  : ${row.id}`,
    `Type      : ${row.type}`,
    `Route     : ${row.route || 'N/A'}`,
    `Occurred  : ${row.created_at}`,
    '',
    '--- MESSAGE ---',
    row.message,
    '',
    '--- STACK TRACE ---',
    row.stack || 'N/A',
    '',
    '--- METADATA ---',
    JSON.stringify(meta, null, 2),
    '',
    '=== END OF REPORT ==='
  ].join('\n')
  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('Content-Disposition', `attachment; filename="error-${row.id}-report.txt"`)
  res.send(report)
})

// ── GET /api/logs/cases ───────────────────────────────────────────────────────
app.get('/api/logs/cases', auth, async (req, res) => {
  const rows = await listCasesForKey(req.apiKey, req.keyRole)
  const cases = rows.map(r => {
    const patient = JSON.parse(r.patient_input)
    const analysis = JSON.parse(r.analysis)
    return {
      case_id: r.case_id,
      created_at: r.created_at,
      age: patient.age,
      sex: patient.sex,
      known_conditions: patient.known_conditions || [],
      presenting_complaint: analysis.presenting_complaint,
      confidence_level: (analysis.confidence?.level ?? analysis.confidence_level),
      emergency_detected: (analysis.red_flags?.emergency_escalation_required ?? analysis.red_flags?.emergency_detected),
      requires_urgent_review: analysis.requires_urgent_review,
      review_status: analysis.doctor_review?.status,
      approved: analysis.doctor_review?.approved,
      reviewed_by: analysis.doctor_review?.reviewed_by,
      reviewed_at: analysis.doctor_review?.reviewed_at,
      differentials: analysis.differential_assessment?.map(d => d.possibility) || [],
      vitals: patient.vitals || [],
      fhir_imported: !!(patient.fhir_source || (patient.vitals && patient.vitals.length > 0)),
      patient_name: patient.patient_name || null,
      mrn: patient.mrn || null,
    }
  })
  const byStatus = { PENDING_REVIEW: 0, APPROVED: 0, REVIEWED_NOT_APPROVED: 0 }
  const byConfidence = { high: 0, moderate: 0, low: 0 }
  cases.forEach(c => {
    if (c.review_status && byStatus[c.review_status] !== undefined) byStatus[c.review_status]++
    if ((c.confidence?.level ?? c.confidence_level) && byConfidence[(c.confidence?.level ?? c.confidence_level)] !== undefined) byConfidence[(c.confidence?.level ?? c.confidence_level)]++
  })
  res.json({ total: cases.length, by_status: byStatus, by_confidence: byConfidence, cases })
})

// ── GET /api/logs/cases/report ────────────────────────────────────────────────
app.get('/api/logs/cases/report', auth, async (req, res) => {
  const rows = (await db.execute({ sql: 'SELECT * FROM cases ORDER BY created_at DESC', args: [] })).rows
  const cases = rows.map(r => {
    const patient  = JSON.parse(r.patient_input)
    const analysis = JSON.parse(r.analysis)
    return {
      case_id:             r.case_id,
      created_at:          r.created_at,
      age:                 patient.age,
      sex:                 patient.sex,
      known_conditions:    patient.known_conditions || [],
      presenting_complaint: analysis.presenting_complaint,
      confidence_level:    (analysis.confidence?.level ?? analysis.confidence_level),
      emergency_detected:  (analysis.red_flags?.emergency_escalation_required ?? analysis.red_flags?.emergency_detected),
      requires_urgent_review: analysis.requires_urgent_review,
      review_status:       analysis.doctor_review?.status,
      approved:            analysis.doctor_review?.approved,
      reviewed_by:         analysis.doctor_review?.reviewed_by,
      reviewed_at:         analysis.doctor_review?.reviewed_at,
      doctor_notes:        analysis.doctor_review?.doctor_notes,
      final_approved_cure: analysis.doctor_review?.final_approved_cure,
      differentials:       analysis.differential_assessment || [],
      structured_symptoms: analysis.structured_symptoms || [],
      draft_treatment:     analysis.draft_treatment_plan || {},
      patient_summary:     analysis.patient_summary_draft?.text || '',
    }
  })

  const byStatus = { PENDING_REVIEW: 0, APPROVED: 0, REVIEWED_NOT_APPROVED: 0 }
  const byConf   = { high: 0, moderate: 0, low: 0 }
  cases.forEach(c => {
    if (c.review_status && byStatus[c.review_status] !== undefined) byStatus[c.review_status]++
    if ((c.confidence?.level ?? c.confidence_level) && byConf[(c.confidence?.level ?? c.confidence_level)] !== undefined) byConf[(c.confidence?.level ?? c.confidence_level)]++
  })

  const html = generateCasesReport(cases, {
    generatedAt: new Date().toISOString(),
    totalCases: cases.length,
    byStatus,
    byConfidence: byConf,
    doctorName: req.query.doctor || null,
  })

  const ts = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="vianova-cases-report-${ts}.html"`)
  res.send(html)
})

// ── GET /api/logs/summary ──────────────────────────────────────────────────────
app.get('/api/logs/summary', auth, async (req, res) => {
  const updates = (await db.execute({ sql: 'SELECT COUNT(*) as c FROM updates_log', args: [] })).rows[0].c
  const errors  = (await db.execute({ sql: 'SELECT COUNT(*) as c FROM errors_log', args: [] })).rows[0].c
  const stats   = await keyStats(req.apiKey, req.keyRole)
  res.json({ updates, errors, cases: stats.total, stats, role: req.keyRole, label: req.keyLabel })
})

// ── GET /api/patients/timeline ────────────────────────────────────────────────
app.get('/api/patients/timeline', auth, async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (!q) return res.json([])
  const like = `%${q}%`
  const rows = req.keyRole === 'superadmin'
    ? (await db.execute({ sql: `SELECT * FROM cases WHERE patient_input LIKE ? ORDER BY created_at ASC`, args: [like] })).rows
    : (await db.execute({ sql: `SELECT * FROM cases WHERE patient_input LIKE ? AND owner_key = ? ORDER BY created_at ASC`, args: [like, req.apiKey] })).rows

  const items = rows.map(r => {
    let pi = {}, an = {}
    try { pi = JSON.parse(r.patient_input) } catch {}
    try { an = JSON.parse(r.analysis) } catch {}
    return {
      case_id: r.case_id,
      created_at: r.created_at,
      presenting_complaint: an.presenting_complaint || '',
      confidence_level: (an.confidence?.level ?? an.confidence_level) || null,
      approved: !!an.doctor_review?.approved,
      emergency_detected: !!(an.red_flags?.emergency_escalation_required ?? an.red_flags?.emergency_detected),
      follow_up_date: r.follow_up_date || null,
    }
  })
  res.json(items)
})

// ── GET /api/cases/:id/print ───────────────────────────────────────────────────
app.get('/api/cases/:id/print', auth, async (req, res) => {
  const row = await getCaseForKey(req.params.id, req.apiKey, req.keyRole)
  if (!row) return res.status(404).send('Not found')
  const patient = JSON.parse(row.patient_input)
  const analysis = JSON.parse(row.analysis)
  const dr = analysis.doctor_review || {}
  const diffs = (analysis.differential_assessment || []).slice(0, 3)
  const nonPharm = analysis.draft_treatment_plan?.non_pharmacological || []
  const meds = analysis.draft_treatment_plan?.pharmacological_suggestions || []

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Case ${esc(row.case_id.slice(0,8))} — Vianova Health</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; color: #0f172a; max-width: 800px; margin: 30px auto; padding: 0 30px; line-height: 1.55; }
  .header { border-bottom: 3px solid #0284c7; padding-bottom: 14px; margin-bottom: 22px; display: flex; justify-content: space-between; align-items: flex-end; }
  .header h1 { margin: 0; font-size: 22px; color: #0284c7; }
  .header .sub { font-size: 12px; color: #64748b; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .05em; color: #475569; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-top: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  table td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
  table td:first-child { font-weight: 600; color: #64748b; width: 30%; }
  .complaint { background: #f8fafc; padding: 12px 14px; border-radius: 6px; border-left: 3px solid #0284c7; font-size: 13.5px; }
  .diff { padding: 10px 12px; background: #f8fafc; border-radius: 6px; margin-bottom: 8px; font-size: 13px; }
  .diff strong { color: #0284c7; }
  ul { padding-left: 20px; font-size: 13px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; }
  .approved { background: #d1fae5; color: #059669; }
  .pending { background: #fef3c7; color: #d97706; }
  .footer { margin-top: 30px; padding-top: 14px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; line-height: 1.6; }
  .med { padding: 8px 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; margin-bottom: 6px; font-size: 12.5px; }
  @media print { body { margin: 0; } }
</style></head><body>
<div class="header">
  <div>
    <h1>Vianova Health</h1>
    <div class="sub">Cure Analyzer System — Case Summary</div>
  </div>
  <div class="sub" style="text-align:right">
    <div>Case ID: <strong>${esc(row.case_id.slice(0,8))}</strong></div>
    <div>${new Date(row.created_at).toLocaleString()}</div>
    <div>${dr.approved ? '<span class="badge approved">APPROVED</span>' : '<span class="badge pending">PENDING REVIEW</span>'}</div>
  </div>
</div>

<h2>Patient Information</h2>
<table>
  <tr><td>Name</td><td>${esc(patient.patient_name || '—')}</td></tr>
  <tr><td>Age / Sex</td><td>${esc(patient.age || '—')} / ${esc(patient.sex || '—')}</td></tr>
  <tr><td>MRN</td><td>${esc(patient.mrn || '—')}</td></tr>
  <tr><td>Allergies</td><td>${esc((analysis.patient_snapshot?.known_allergies || []).join(', ') || 'None reported')}</td></tr>
  <tr><td>Current Medications</td><td>${esc((analysis.patient_snapshot?.current_medications || []).join(', ') || 'None reported')}</td></tr>
</table>

<h2>Presenting Complaint</h2>
<div class="complaint">${esc(analysis.presenting_complaint || '—')}</div>

<h2>Top Differentials</h2>
${diffs.length ? diffs.map(d => `<div class="diff"><strong>${esc(d.possibility)}</strong> <em>(${esc(d.likelihood)})</em><br>${esc((d.supporting_findings || []).join('; '))}</div>`).join('') : '<p>—</p>'}

<h2>Draft Treatment Plan</h2>
${nonPharm.length ? `<h3 style="font-size:13px;margin-bottom:4px">Non-Pharmacological</h3><ul>${nonPharm.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
${meds.length ? `<h3 style="font-size:13px;margin-bottom:4px">Medications (physician verification required)</h3>${meds.map(m => `<div class="med"><strong>${esc(m.option)}</strong> — ${esc(m.rationale)}${m.physician_dose_consideration ? `<br><em>Dose:</em> ${esc(m.physician_dose_consideration)}` : ''}</div>`).join('')}` : ''}

${dr.approved ? `<h2>Doctor Review</h2>
<table>
  <tr><td>Reviewed by</td><td>${esc(dr.reviewed_by || '—')}</td></tr>
  <tr><td>Reviewed at</td><td>${dr.reviewed_at ? new Date(dr.reviewed_at).toLocaleString() : '—'}</td></tr>
</table>
${dr.doctor_notes ? `<p><strong>Notes:</strong> ${esc(dr.doctor_notes)}</p>` : ''}
${dr.final_approved_cure ? `<div class="complaint" style="border-left-color:#059669"><strong>Approved Treatment:</strong><br>${esc(dr.final_approved_cure).replace(/\n/g, '<br>')}</div>` : ''}
` : ''}

<div class="footer">
  This document is generated by Vianova Health Cure Analyzer System. AI-assisted clinical decision support — all suggestions require licensed physician review and approval. Not a substitute for medical judgment. Confidential health information.
</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(html)
})

// ── POST /api/cases/:id/share ──────────────────────────────────────────────────
app.post('/api/cases/:id/share', auth, async (req, res) => {
  const row = await getCaseForKey(req.params.id, req.apiKey, req.keyRole)
  if (!row) return res.status(404).json({ error: 'Not found or access denied' })
  let token = row.share_token
  if (!token) {
    token = randomBytes(16).toString('hex')
    await db.execute({ sql: 'UPDATE cases SET share_token = ? WHERE case_id = ?', args: [token, req.params.id] })
  }
  await logUpdate('case_shared', `Share link generated for case ${req.params.id.slice(0,8)} by ${req.keyLabel}`, { case_id: req.params.id, label: req.keyLabel })
  res.json({ token, share_url: '/share/' + token })
})

// ── GET /api/share/:token — public read-only access ───────────────────────────
app.get('/api/share/:token', async (req, res) => {
  const row = (await db.execute({ sql: 'SELECT * FROM cases WHERE share_token = ?', args: [req.params.token] })).rows[0]
  if (!row) return res.status(404).json({ error: 'Not found' })
  let analysis = {}, patient = {}
  try { analysis = JSON.parse(row.analysis) } catch {}
  try { patient = JSON.parse(row.patient_input) } catch {}
  if (!analysis?.doctor_review?.approved) {
    return res.status(404).json({ error: 'Not available' })
  }
  res.json({
    case_id: row.case_id,
    created_at: row.created_at,
    patient_input: { age: patient.age || null, sex: patient.sex || null },
    analysis,
  })
})

// ── Admin routes ───────────────────────────────────────────────────────────────
app.get('/api/admin/users', auth, requireAdmin, async (req, res) => {
  const users = (await db.execute({ sql: 'SELECT id, email, notify_email, name, role, active, status, password_hash, created_at FROM users ORDER BY created_at DESC', args: [] })).rows
  res.json({
    users: users.map(u => ({
      ...u,
      has_password: !!u.password_hash,
      password_hash: undefined,
    }))
  })
})

app.post('/api/admin/users', auth, requireAdmin, async (req, res) => {
  const { email, name, role = 'doctor', password } = req.body
  if (!email || !name) return res.status(400).json({ error: 'email and name required' })
  const normalEmail = email.toLowerCase().trim()
  const existing = (await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [normalEmail] })).rows[0]
  const passwordHash = password ? bcrypt.hashSync(password, 10) : ''
  if (existing) {
    await db.execute({ sql: 'UPDATE users SET name = ?, role = ?, active = 1 WHERE email = ?', args: [name, role, normalEmail] })
    res.json({ id: existing.id })
  } else {
    const id = randomUUID()
    await db.execute({ sql: 'INSERT INTO users (id, email, name, role, active, status, password_hash, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)', args: [id, normalEmail, name, role, 'pending', passwordHash, new Date().toISOString()] })
    res.json({ id })
  }
})

app.patch('/api/admin/users/:id', auth, requireAdmin, async (req, res) => {
  const { active, name, role, notify_email, password, status } = req.body
  const user = (await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [req.params.id] })).rows[0]
  if (!user) return res.status(404).json({ error: 'User not found' })
  const newName        = name         !== undefined ? name         : user.name
  const newRole        = role         !== undefined ? role         : user.role
  const newActive      = active       !== undefined ? (active ? 1 : 0) : user.active
  const newNotifyEmail = notify_email !== undefined ? notify_email.toLowerCase().trim() : (user.notify_email || '')
  const newStatus      = status       !== undefined ? status       : (user.status || 'active')
  const newPasswordHash = password    !== undefined ? bcrypt.hashSync(password, 10) : user.password_hash

  await db.execute({ sql: 'UPDATE users SET name = ?, role = ?, active = ?, notify_email = ?, status = ?, password_hash = ? WHERE id = ?', args: [newName, newRole, newActive, newNotifyEmail, newStatus, newPasswordHash, req.params.id] })

  // Deactivation: if active changed from 1 to 0, export CSV and notify
  if (user.active === 1 && newActive === 0) {
    try {
      // Fetch all cases for this user
      const cases = (await db.execute({ sql: 'SELECT * FROM cases WHERE owner_key = ? ORDER BY created_at ASC', args: [user.email] })).rows
      const sessionCountRow = (await db.execute({ sql: 'SELECT COUNT(*) as c FROM sessions WHERE user_id = ?', args: [req.params.id] })).rows[0]
      const sessionCount = sessionCountRow?.c || 0
      const otpCountRow = (await db.execute({ sql: 'SELECT COUNT(*) as c FROM otp_codes WHERE email = ?', args: [user.email] })).rows[0]
      const otpCount = otpCountRow?.c || 0

      // Build CSV
      const csvRows = ['case_id,created_at,complaint,confidence,status,emergency']
      cases.forEach(c => {
        let complaint = '', confidence = '', approved = 'pending', emergency = 'false'
        try {
          const pi = JSON.parse(c.patient_input)
          complaint = pi.complaint || ''
        } catch {}
        try {
          const an = JSON.parse(c.analysis)
          confidence = (an.confidence?.level ?? an.confidence_level) || ''
          approved = an.doctor_review?.approved ? 'approved' : 'pending'
          emergency = an.red_flags?.emergency_detected ? 'true' : 'false'
        } catch {}
        const esc = s => `"${String(s).replace(/"/g, '""')}"`
        csvRows.push([esc(c.case_id), esc(c.created_at), esc(complaint), esc(confidence), esc(approved), esc(emergency)].join(','))
      })
      const csvString = csvRows.join('\n')
      const csvBase64 = Buffer.from(csvString).toString('base64')

      const subject = `Account Deactivated — ${user.name} — Full History Export`
      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
          <h2 style="color:#0f172a">Account Deactivated</h2>
          <p>User <strong>${user.name}</strong> (${user.email}) has been deactivated.</p>
          <table style="font-size:13px;border-collapse:collapse;width:100%">
            <tr><td style="color:#64748b;padding:4px 0;width:140px">Total cases</td><td>${cases.length}</td></tr>
            <tr><td style="color:#64748b;padding:4px 0">Sessions</td><td>${sessionCount}</td></tr>
            <tr><td style="color:#64748b;padding:4px 0">OTP codes</td><td>${otpCount}</td></tr>
          </table>
          <p style="font-size:12px;color:#94a3b8;margin-top:16px">Full case history is attached as a CSV.</p>
        </div>`
      const attachments = [{ name: `${user.email}-history.csv`, content: csvBase64 }]

      // Notify superadmins
      const admins = (await db.execute({ sql: "SELECT email, notify_email FROM users WHERE role = 'superadmin' AND active = 1", args: [] })).rows
      for (const a of admins) {
        const dest = a.notify_email || a.email
        sendEmail({ to: dest, subject, html, attachments }).catch(() => {})
      }
      // Also notify the deactivated user
      const userDest = user.notify_email || user.email
      if (userDest && !admins.find(a => (a.notify_email || a.email) === userDest)) {
        sendEmail({ to: userDest, subject, html, attachments }).catch(() => {})
      }

      // Delete all sessions for user
      await db.execute({ sql: 'DELETE FROM sessions WHERE user_id = ?', args: [req.params.id] })
    } catch (err) {
      console.error('Deactivation export error:', err.message)
    }
  }

  res.json({ ok: true })
})

app.post('/api/admin/users/:id/approve', auth, requireAdmin, async (req, res) => {
  const user = (await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [req.params.id] })).rows[0]
  if (!user) return res.status(404).json({ error: 'User not found' })
  await db.execute({ sql: "UPDATE users SET status = 'active' WHERE id = ?", args: [req.params.id] })
  res.json({ ok: true })
})

app.post('/api/admin/users/:id/set-password', auth, requireAdmin, async (req, res) => {
  const { password } = req.body
  if (!password) return res.status(400).json({ error: 'password required' })
  const user = (await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [req.params.id] })).rows[0]
  if (!user) return res.status(404).json({ error: 'User not found' })
  const hash = bcrypt.hashSync(password, 10)
  await db.execute({ sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [hash, req.params.id] })
  res.json({ ok: true })
})

app.delete('/api/admin/users/:id', auth, requireAdmin, async (req, res) => {
  const user = (await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [req.params.id] })).rows[0]
  if (!user) return res.status(404).json({ error: 'User not found' })
  await db.execute({ sql: 'DELETE FROM sessions WHERE user_id = ?', args: [req.params.id] })
  await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [req.params.id] })
  res.json({ ok: true })
})

// ── Health / ping ──────────────────────────────────────────────────────────────
app.get('/api/ping', (req, res) => res.json({ ok: true, ts: Date.now() }))

// ── Mobile-friendly alias routes ──────────────────────────────────────────────

// GET /api/stats — returns case stats for the current user (used by mobile app)
app.get('/api/stats', auth, async (req, res) => {
  try {
    const stats = await keyStats(req.apiKey, req.keyRole)
    res.json(stats)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/patients — returns gen_patients for the current user
app.get('/api/patients', auth, async (req, res) => {
  try {
    const rows = req.keyRole === 'superadmin'
      ? (await db.execute({ sql: 'SELECT * FROM gen_patients ORDER BY name', args: [] })).rows
      : (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE owner_email = ? ORDER BY name', args: [req.apiKey] })).rows
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/cases — mobile alias for POST /api/analyze (same pipeline)
app.post('/api/cases', auth, async (req, res) => {
  try {
    const { patientData: pd = {}, complaint } = req.body
    // Build patientData same way as /api/analyze
    const patientData = { ...pd }
    if (complaint) patientData.free_text = [patientData.free_text, `Chief complaint: ${complaint}`].filter(Boolean).join('\n')
    patientData.patient_id   = patientData.patient_id || randomUUID()
    patientData.current_date = new Date().toISOString().slice(0, 10)

    const message = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 4096,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: JSON.stringify(patientData) }
      ],
    })

    let analysis
    try { analysis = JSON.parse(message.choices[0].message.content.trim()) }
    catch { return res.status(500).json({ error: 'AI returned malformed JSON' }) }

    const caseId = randomUUID()
    const now = new Date().toISOString()
    // Use exact same INSERT as /api/analyze — no extra columns
    await db.execute({
      sql: 'INSERT INTO cases (case_id, created_at, patient_input, analysis, owner_key) VALUES (?, ?, ?, ?, ?)',
      args: [caseId, now, JSON.stringify(patientData), JSON.stringify(analysis), req.apiKey]
    })

    const isEmergency = analysis.red_flags?.emergency_escalation_required ?? analysis.red_flags?.emergency_detected
    const confidence  = analysis.confidence?.level ?? analysis.confidence_level

    await logUpdate('case_submitted', `New case submitted by ${req.keyLabel} (${patientData.age || '?'}y ${patientData.sex || '?'})${isEmergency ? ' — EMERGENCY' : ''}`, {
      case_id: caseId, label: req.keyLabel, confidence, emergency: isEmergency,
      age: patientData.age, sex: patientData.sex, complaint: analysis.presenting_complaint,
    })

    const admins = (await db.execute({ sql: "SELECT email FROM users WHERE role='superadmin' AND active=1 AND status='active'", args: [] })).rows
    for (const a of admins) {
      await notify(a.email, tplNewCase({ caseId, label: req.keyLabel, age: patientData.age, sex: patientData.sex, complaint: analysis.presenting_complaint, confidence, emergency: isEmergency }))
      if (isEmergency) await notify(a.email, tplEmergencyAlert({ caseId, label: req.keyLabel, age: patientData.age, sex: patientData.sex, complaint: analysis.presenting_complaint, redFlags: analysis.red_flags?.flags }))
    }

    res.json({ case_id: caseId, analysis })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── patient data helpers ───────────────────────────────────────────────────────
function normalizePhone(raw) {
  if (!raw) return null
  const d = String(raw).replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  if (d.length === 11 && d[0] === '1') return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`
  return raw.trim() || null
}
function normalizeName(raw) {
  if (!raw) return null
  return raw.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}
function normalizeDOB(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m1) return `${m1[3]}-${m1[1].padStart(2,'0')}-${m1[2].padStart(2,'0')}`
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (m2) return `${m2[3]}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0,10)
}
function toArrServer(v) {
  if (!v) return []
  try { const r = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(r) ? r.filter(Boolean) : r ? [String(r)] : [] }
  catch { return String(v).split(',').map(s => s.trim()).filter(Boolean) }
}
function computeQuality(p) {
  let s = 0
  if (p.name?.trim())    s += 20
  if (p.dob?.trim())     s += 15
  if (p.sex?.trim())     s += 10
  if (p.mrn?.trim())     s += 15
  if (p.phone?.trim())   s += 10
  if (p.email?.trim())   s += 5
  if (p.address?.trim()) s += 5
  if (toArrServer(p.conditions).length)  s += 10
  if (toArrServer(p.medications).length) s += 5
  if (toArrServer(p.allergies).length)   s += 5
  return Math.min(100, s)
}

// ── gen_patients routes ────────────────────────────────────────────────────────
app.get('/api/gen-patients', auth, async (req, res) => {
  const rows = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE owner_email = ? ORDER BY name', args: [req.apiKey] })).rows
  res.json({ patients: rows })
})

app.post('/api/gen-patients', auth, async (req, res) => {
  const { name, dob, sex, mrn, phone, email, address, language, conditions, medications, allergies, fhir_vitals, notes, import_source } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })

  // Normalize
  const nName  = normalizeName(name)
  const nPhone = normalizePhone(phone)
  const nDOB   = normalizeDOB(dob)

  // Duplicate check: same MRN or same name+DOB
  if (mrn) {
    const dup = (await db.execute({ sql: 'SELECT id FROM gen_patients WHERE owner_email=? AND mrn=?', args: [req.apiKey, mrn.trim()] })).rows[0]
    if (dup) return res.status(409).json({ error: 'A patient with this MRN already exists', duplicate_id: dup.id })
  }
  if (nName && nDOB) {
    const dup = (await db.execute({ sql: 'SELECT id FROM gen_patients WHERE owner_email=? AND name=? AND dob=?', args: [req.apiKey, nName, nDOB] })).rows[0]
    if (dup) return res.status(409).json({ error: 'A patient with this name and date of birth already exists', duplicate_id: dup.id })
  }

  const p = { name: nName, dob: nDOB, sex: sex||null, mrn: mrn?.trim()||null, phone: nPhone, email: email?.trim()||null, address: address?.trim()||null, language: language?.trim()||null, conditions: conditions||null, medications: medications||null, allergies: allergies||null }
  const quality = computeQuality(p)
  const id = randomUUID()
  await db.execute({
    sql: `INSERT INTO gen_patients (id, owner_email, name, dob, sex, mrn, phone, email, address, language, conditions, medications, allergies, fhir_vitals, notes, import_source, data_quality_score, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [id, req.apiKey, nName, nDOB, sex||null, mrn?.trim()||null, nPhone, email?.trim()||null, address?.trim()||null, language?.trim()||null, conditions||null, medications||null, allergies||null, fhir_vitals||null, notes||null, import_source||'manual', quality, new Date().toISOString()]
  })
  res.json({ id, data_quality_score: quality })
})

app.put('/api/gen-patients/:id', auth, async (req, res) => {
  const existing = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE id = ? AND owner_email = ?', args: [req.params.id, req.apiKey] })).rows[0]
  if (!existing) return res.status(404).json({ error: 'Not found or access denied' })
  const { name, dob, sex, mrn, phone, email, address, language, conditions, medications, allergies, fhir_vitals, notes } = req.body
  const nName  = name  ? normalizeName(name)  : existing.name
  const nPhone = normalizePhone(phone ?? existing.phone)
  const nDOB   = normalizeDOB(dob ?? existing.dob)
  const p = { name: nName, dob: nDOB, sex: sex??existing.sex, mrn: mrn??existing.mrn, phone: nPhone, email: email??existing.email, address: address??existing.address, language: language??existing.language, conditions: conditions??existing.conditions, medications: medications??existing.medications, allergies: allergies??existing.allergies }
  const quality = computeQuality(p)
  await db.execute({
    sql: `UPDATE gen_patients SET name=?, dob=?, sex=?, mrn=?, phone=?, email=?, address=?, language=?, conditions=?, medications=?, allergies=?, fhir_vitals=?, notes=?, data_quality_score=? WHERE id=? AND owner_email=?`,
    args: [nName, nDOB, p.sex, p.mrn, nPhone, p.email, p.address, p.language, p.conditions, p.medications, p.allergies, fhir_vitals??existing.fhir_vitals, notes??existing.notes, quality, req.params.id, req.apiKey]
  })
  res.json({ ok: true, data_quality_score: quality })
})

// AI field mapping for CSV import
app.post('/api/gen-patients/ai-map-csv', auth, aiLimiter, async (req, res) => {
  const { headers, sample } = req.body
  if (!headers?.length) return res.status(400).json({ error: 'headers required' })
  const FIELDS = ['name','dob','sex','mrn','phone','email','address','language','conditions','medications','allergies','notes']
  const prompt = `You are mapping CSV columns to patient record fields.
CSV headers: ${JSON.stringify(headers)}
Sample rows (first 3): ${JSON.stringify(sample?.slice(0,3))}

Map each CSV header to ONE of these patient fields (or null if no match):
${FIELDS.join(', ')}

Rules:
- "name", "patient name", "full name", "patient" → name
- "dob", "date of birth", "birth date", "birthdate" → dob
- "gender", "sex", "biological sex" → sex
- "mrn", "patient id", "patient_id", "medical record" → mrn
- "phone", "telephone", "mobile", "contact" → phone
- "email", "e-mail" → email
- "address", "addr", "street", "location" → address
- "language", "preferred language", "lang" → language
- "conditions", "diagnosis", "diagnoses", "problems", "icd" → conditions
- "medications", "meds", "drugs", "prescriptions" → medications
- "allergies", "allergy" → allergies
- "notes", "comments", "remarks" → notes

Return ONLY valid JSON array: [{"csv_column":"...","field":"...or null"}]`

  try {
    const chat = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 600,
    })
    let text = chat.choices[0].message.content.trim()
    const m = text.match(/\[[\s\S]*\]/)
    const mapping = m ? JSON.parse(m[0]) : headers.map(h => ({ csv_column: h, field: null }))
    res.json({ mapping })
  } catch (e) {
    // Fallback: return unmapped headers
    res.json({ mapping: headers.map(h => ({ csv_column: h, field: null })) })
  }
})

// Bulk CSV import
app.post('/api/gen-patients/import', auth, async (req, res) => {
  const { rows } = req.body   // array of already-mapped patient objects
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'rows required' })

  let imported = 0, duplicates = 0, errors = 0
  const details = []

  for (const row of rows) {
    const { name, dob, sex, mrn, phone, email, address, language, conditions, medications, allergies, notes } = row
    if (!name?.trim()) { errors++; details.push({ name: name||'(blank)', status: 'error', reason: 'Name is required' }); continue }

    const nName  = normalizeName(name)
    const nPhone = normalizePhone(phone)
    const nDOB   = normalizeDOB(dob)

    try {
      // Duplicate check
      if (mrn?.trim()) {
        const dup = (await db.execute({ sql: 'SELECT id FROM gen_patients WHERE owner_email=? AND mrn=?', args: [req.apiKey, mrn.trim()] })).rows[0]
        if (dup) { duplicates++; details.push({ name: nName, status: 'duplicate', reason: 'MRN already exists' }); continue }
      }
      if (nName && nDOB) {
        const dup = (await db.execute({ sql: 'SELECT id FROM gen_patients WHERE owner_email=? AND name=? AND dob=?', args: [req.apiKey, nName, nDOB] })).rows[0]
        if (dup) { duplicates++; details.push({ name: nName, status: 'duplicate', reason: 'Name + DOB already exists' }); continue }
      }

      const p = { name: nName, dob: nDOB, sex: sex||null, mrn: mrn?.trim()||null, phone: nPhone, email: email?.trim()||null, address: address?.trim()||null, language: language?.trim()||null, conditions: conditions||null, medications: medications||null, allergies: allergies||null }
      const quality = computeQuality(p)
      const id = randomUUID()
      await db.execute({
        sql: `INSERT INTO gen_patients (id, owner_email, name, dob, sex, mrn, phone, email, address, language, conditions, medications, allergies, notes, import_source, data_quality_score, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [id, req.apiKey, nName, nDOB, p.sex, p.mrn, nPhone, p.email, p.address, p.language, p.conditions, p.medications, p.allergies, notes||null, 'csv', quality, new Date().toISOString()]
      })
      imported++
      details.push({ name: nName, status: 'imported', data_quality_score: quality })
    } catch (e) {
      errors++
      details.push({ name: nName, status: 'error', reason: e.message })
    }
  }

  res.json({ imported, duplicates, errors, total: rows.length, details })
})

// GET /api/cases/by-patient/:patientId — cases linked to a gen_patient
app.get('/api/cases/by-patient/:patientId', auth, async (req, res) => {
  try {
    const like = `%"patient_id":"${req.params.patientId}"%`
    const rows = (await db.execute({
      sql: `SELECT case_id, created_at, analysis, patient_input FROM cases WHERE patient_input LIKE ? AND owner_key = ? ORDER BY created_at DESC`,
      args: [like, req.apiKey]
    })).rows
    const cases = rows.map(r => {
      let analysis = {}; let patient = {}
      try { analysis = JSON.parse(r.analysis) } catch {}
      try { patient = JSON.parse(r.patient_input) } catch {}
      return {
        id: r.case_id,
        created_at: r.created_at,
        chief_complaint: patient.chief_complaint || patient.symptoms || '',
        status: analysis.status || 'pending',
        emergency_detected: analysis.emergency_detected || false,
        requires_urgent_review: analysis.requires_urgent_review || false,
        top_diagnosis: analysis.diagnoses?.[0]?.name || ''
      }
    })
    res.json(cases)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/gen-patients/:id', auth, async (req, res) => {
  const existing = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE id = ? AND owner_email = ?', args: [req.params.id, req.apiKey] })).rows[0]
  if (!existing) return res.status(404).json({ error: 'Not found or access denied' })
  await db.execute({ sql: 'DELETE FROM gen_patients WHERE id = ? AND owner_email = ?', args: [req.params.id, req.apiKey] })
  res.json({ ok: true })
})

// ── RPM routes ─────────────────────────────────────────────────────────────────
app.get('/api/rpm/patients', auth, async (req, res) => {
  const rows = (await db.execute({ sql: 'SELECT * FROM rpm_patients WHERE owner_email = ? ORDER BY name', args: [req.apiKey] })).rows
  res.json({ patients: rows })
})

app.post('/api/rpm/patients', auth, async (req, res) => {
  const { name, dob, condition } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const id = randomUUID()
  await db.execute({ sql: 'INSERT INTO rpm_patients (id, owner_email, name, dob, condition, created_at) VALUES (?,?,?,?,?,?)', args: [id, req.apiKey, name, dob || null, condition || null, new Date().toISOString()] })
  res.json({ id })
})

app.get('/api/rpm/patients/:pid/readings', auth, async (req, res) => {
  const rows = (await db.execute({ sql: 'SELECT * FROM rpm_readings WHERE patient_id = ? ORDER BY recorded_at DESC', args: [req.params.pid] })).rows
  res.json({ readings: rows })
})

app.post('/api/rpm/patients/:pid/readings', auth, async (req, res) => {
  const { heart_rate, spo2, systolic_bp, diastolic_bp, temperature, resp_rate, note } = req.body
  await db.execute({
    sql: `INSERT INTO rpm_readings (patient_id, heart_rate, spo2, systolic_bp, diastolic_bp, temperature, resp_rate, note, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [req.params.pid, heart_rate || null, spo2 || null, systolic_bp || null, diastolic_bp || null, temperature || null, resp_rate || null, note || null, new Date().toISOString()]
  })
  res.json({ ok: true })
})

// ── CCM routes ─────────────────────────────────────────────────────────────────
app.get('/api/ccm/patients', auth, async (req, res) => {
  const rows = (await db.execute({ sql: 'SELECT * FROM ccm_patients WHERE owner_email = ? ORDER BY name', args: [req.apiKey] })).rows
  res.json({ patients: rows })
})

app.post('/api/ccm/patients', auth, async (req, res) => {
  const { name, dob, phone, condition, insurance, care_manager } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const id = randomUUID()
  await db.execute({
    sql: `INSERT INTO ccm_patients (id, owner_email, name, dob, conditions, created_at) VALUES (?,?,?,?,?,?)`,
    args: [id, req.apiKey, name, dob || null, condition || null, new Date().toISOString()]
  })
  res.json({ id })
})

app.get('/api/ccm/patients/:pid/plan', auth, async (req, res) => {
  const plan = (await db.execute({ sql: 'SELECT * FROM ccm_care_plans WHERE patient_id = ?', args: [req.params.pid] })).rows[0]
  res.json({ plan: plan || null })
})

app.post('/api/ccm/patients/:pid/plan', auth, async (req, res) => {
  const { tasks } = req.body
  const now = new Date().toISOString()
  // Check if exists
  const existing = (await db.execute({ sql: 'SELECT id FROM ccm_care_plans WHERE patient_id = ?', args: [req.params.pid] })).rows[0]
  if (existing) {
    await db.execute({ sql: 'UPDATE ccm_care_plans SET tasks = ?, updated_at = ? WHERE patient_id = ?', args: [tasks || '[]', now, req.params.pid] })
  } else {
    await db.execute({ sql: 'INSERT INTO ccm_care_plans (patient_id, template, tasks, goals, created_at, updated_at) VALUES (?,?,?,?,?,?)', args: [req.params.pid, '', tasks || '[]', null, now, now] })
  }
  res.json({ ok: true })
})

app.get('/api/ccm/patients/:pid/checkins', auth, async (req, res) => {
  const rows = (await db.execute({ sql: 'SELECT * FROM ccm_checkins WHERE patient_id = ? ORDER BY created_at DESC', args: [req.params.pid] })).rows
  res.json({ checkins: rows })
})

app.post('/api/ccm/patients/:pid/checkins', auth, async (req, res) => {
  const { minutes, notes, barriers, plan_update } = req.body
  await db.execute({
    sql: `INSERT INTO ccm_checkins (patient_id, minutes, notes, checkin_date, created_at) VALUES (?,?,?,?,?)`,
    args: [req.params.pid, minutes || 0, notes || null, new Date().toISOString(), new Date().toISOString()]
  })
  res.json({ ok: true })
})

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 5 — CARE GAP DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/care-gaps', auth, async (req, res) => {
  const { patient_id, status } = req.query
  let sql = 'SELECT g.*, p.name as patient_name FROM care_gaps g JOIN gen_patients p ON g.patient_id = p.id WHERE g.owner_email = ?'
  const args = [req.apiKey]
  if (patient_id) { sql += ' AND g.patient_id = ?'; args.push(patient_id) }
  if (status)     { sql += ' AND g.status = ?';     args.push(status) }
  sql += ' ORDER BY CASE g.priority WHEN \'high\' THEN 0 WHEN \'medium\' THEN 1 ELSE 2 END, g.created_at DESC'
  const rows = (await db.execute({ sql, args })).rows
  res.json(rows)
})

app.post('/api/care-gaps/detect/:patientId', auth, aiLimiter, async (req, res) => {
  const patient = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE id = ? AND owner_email = ?', args: [req.params.patientId, req.apiKey] })).rows[0]
  if (!patient) return res.status(404).json({ error: 'Patient not found' })

  // Calculate age from DOB
  let age = null
  if (patient.dob) {
    const dob = new Date(patient.dob)
    if (!isNaN(dob)) age = Math.floor((Date.now() - dob) / (365.25 * 24 * 3600 * 1000))
  }

  const existingGaps = (await db.execute({ sql: "SELECT gap_type FROM care_gaps WHERE patient_id = ? AND status = 'open'", args: [req.params.patientId] })).rows.map(r => r.gap_type)

  const prompt = `You are a clinical quality measure analyst. Analyze this patient and identify preventive care gaps based on USPSTF guidelines.

Patient:
- Name: ${patient.name}
- Age: ${age ?? 'unknown'}
- Sex: ${patient.sex || 'unknown'}
- Conditions: ${patient.conditions || 'none documented'}
- Medications: ${patient.medications || 'none documented'}

Already-open gaps (do NOT re-add these): ${existingGaps.join(', ') || 'none'}

Rules:
- Diabetes/diabetic → A1C monitoring (every 3 months), annual eye exam, annual foot exam, annual nephropathy screening
- Female age 40–74 → mammogram (every 2 years)
- Age 45–75 → colorectal cancer screening (every 10 years or annual FIT)
- Age 18+ with hypertension → annual BP reading
- Age 65+ → annual flu vaccine, pneumococcal vaccine, shingles vaccine
- Female age 21–65 → Pap smear (every 3 years or 5 years with HPV co-test)
- Age 35+ with obesity/overweight → diabetes screening
- Smoker → lung cancer screening (LDCT), smoking cessation counseling
- Age 12+ → annual depression screening
- Any patient → annual medication review

Return ONLY valid JSON array. Each item: {"gap_type":"string","description":"1-sentence description","priority":"high|medium|low","due_date":"YYYY-MM-DD or null","recommended_action":"brief action string"}

Limit to the 5 most clinically important gaps. Return [] if no gaps.`

  try {
    const chat = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 800,
    })
    const text = chat.choices[0].message.content
    const match = text.match(/\[[\s\S]*\]/)
    const gaps = match ? JSON.parse(match[0]) : []

    const inserted = []
    for (const g of gaps) {
      if (!g.gap_type) continue
      const id = randomUUID()
      await db.execute({
        sql: 'INSERT INTO care_gaps (id, patient_id, owner_email, gap_type, description, priority, due_date, created_at) VALUES (?,?,?,?,?,?,?,?)',
        args: [id, req.params.patientId, req.apiKey, g.gap_type, g.description, g.priority || 'medium', g.due_date || null, new Date().toISOString()]
      })
      inserted.push({ id, ...g })
    }
    res.json({ detected: inserted.length, gaps: inserted })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/care-gaps/:id', auth, async (req, res) => {
  const { status, suppression_reason } = req.body
  const gap = (await db.execute({ sql: 'SELECT * FROM care_gaps WHERE id = ? AND owner_email = ?', args: [req.params.id, req.apiKey] })).rows[0]
  if (!gap) return res.status(404).json({ error: 'Not found' })
  const closed_at = (status === 'closed' || status === 'suppressed') ? new Date().toISOString() : null
  await db.execute({
    sql: 'UPDATE care_gaps SET status = ?, suppression_reason = ?, closed_at = ? WHERE id = ?',
    args: [status || gap.status, suppression_reason || gap.suppression_reason, closed_at, req.params.id]
  })
  res.json({ ok: true })
})

app.post('/api/care-gaps/:id/outreach', auth, async (req, res) => {
  const gap = (await db.execute({
    sql: 'SELECT g.*, p.name as patient_name, p.language FROM care_gaps g JOIN gen_patients p ON g.patient_id = p.id WHERE g.id = ? AND g.owner_email = ?',
    args: [req.params.id, req.apiKey]
  })).rows[0]
  if (!gap) return res.status(404).json({ error: 'Not found' })

  const lang = gap.language || 'English'
  const prompt = `Write a concise, friendly patient outreach message for the following care gap.

Patient: ${gap.patient_name}
Care gap: ${gap.description}
Priority: ${gap.priority}
Language preference: ${lang}

Requirements:
- 3–5 sentences maximum
- Empathetic, non-alarming tone
- Include what action the patient should take
- Suitable for SMS or portal message
- If language is not English, write in that language

Return only the message text, no subject line.`

  try {
    const chat = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      max_tokens: 200,
    })
    const msg = chat.choices[0].message.content.trim()
    await db.execute({ sql: 'UPDATE care_gaps SET outreach_message = ? WHERE id = ?', args: [msg, req.params.id] })
    res.json({ message: msg })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 8 — LAB RESULTS
// ═══════════════════════════════════════════════════════════════════════════════

// Reference ranges for common tests (age/sex-independent defaults)
const LAB_REFS = {
  'glucose': { low: 70, high: 100, unit: 'mg/dL', critical_low: 40, critical_high: 500 },
  'hba1c': { low: 4, high: 5.7, unit: '%', critical_high: 14 },
  'creatinine': { low: 0.6, high: 1.2, unit: 'mg/dL', critical_high: 10 },
  'egfr': { low: 60, high: 120, unit: 'mL/min/1.73m²', critical_low: 15 },
  'sodium': { low: 136, high: 145, unit: 'mEq/L', critical_low: 120, critical_high: 160 },
  'potassium': { low: 3.5, high: 5.0, unit: 'mEq/L', critical_low: 2.5, critical_high: 6.5 },
  'hemoglobin': { low: 12, high: 17.5, unit: 'g/dL', critical_low: 7 },
  'hematocrit': { low: 36, high: 52, unit: '%', critical_low: 21 },
  'wbc': { low: 4.5, high: 11, unit: 'K/µL', critical_low: 2, critical_high: 30 },
  'platelets': { low: 150, high: 400, unit: 'K/µL', critical_low: 50, critical_high: 1000 },
  'tsh': { low: 0.4, high: 4.0, unit: 'mIU/L', critical_low: 0.1, critical_high: 10 },
  'ldl': { low: 0, high: 100, unit: 'mg/dL' },
  'hdl': { low: 40, high: 999, unit: 'mg/dL' },
  'triglycerides': { low: 0, high: 150, unit: 'mg/dL', critical_high: 1000 },
  'alt': { low: 0, high: 56, unit: 'U/L', critical_high: 1000 },
  'ast': { low: 0, high: 40, unit: 'U/L', critical_high: 1000 },
  'bilirubin': { low: 0, high: 1.2, unit: 'mg/dL', critical_high: 15 },
  'bnp': { low: 0, high: 100, unit: 'pg/mL', critical_high: 900 },
  'troponin': { low: 0, high: 0.04, unit: 'ng/mL', critical_high: 0.1 },
  'psa': { low: 0, high: 4.0, unit: 'ng/mL' },
  'inr': { low: 0.9, high: 1.1, unit: '', critical_low: 0.5, critical_high: 5 },
  'calcium': { low: 8.5, high: 10.5, unit: 'mg/dL', critical_low: 6.5, critical_high: 13 },
}

function interpretLab(testName, value, refLow, refHigh, critLow, critHigh) {
  const hi = refHigh ?? Infinity
  const lo = refLow ?? -Infinity
  const cHi = critHigh ?? Infinity
  const cLo = critLow ?? -Infinity
  if (value > cHi || value < cLo) return value > cHi ? 'HH' : 'LL'
  if (value > hi) return 'H'
  if (value < lo) return 'L'
  return 'N'
}

app.get('/api/labs', auth, async (req, res) => {
  const { patient_id } = req.query
  let sql = 'SELECT l.*, p.name as patient_name FROM lab_results l JOIN gen_patients p ON l.patient_id = p.id WHERE l.owner_email = ?'
  const args = [req.apiKey]
  if (patient_id) { sql += ' AND l.patient_id = ?'; args.push(patient_id) }
  sql += ' ORDER BY l.result_date DESC, l.created_at DESC'
  res.json((await db.execute({ sql, args })).rows)
})

app.get('/api/labs/trends/:patientId/:testName', auth, async (req, res) => {
  const rows = (await db.execute({
    sql: 'SELECT result_date, value, unit, interpretation FROM lab_results WHERE patient_id = ? AND owner_email = ? AND test_name = ? ORDER BY result_date ASC',
    args: [req.params.patientId, req.apiKey, req.params.testName]
  })).rows
  res.json(rows)
})

app.post('/api/labs', auth, async (req, res) => {
  const { patient_id, test_name, value, unit, reference_low, reference_high, result_date, notes } = req.body
  if (!patient_id || !test_name || value == null) return res.status(400).json({ error: 'patient_id, test_name and value required' })

  // Check patient ownership
  const patient = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE id = ? AND owner_email = ?', args: [patient_id, req.apiKey] })).rows[0]
  if (!patient) return res.status(404).json({ error: 'Patient not found' })

  // Auto-fill reference ranges from built-in lookup
  const key = test_name.toLowerCase().replace(/\s+/g, '')
  const ref = LAB_REFS[key] || LAB_REFS[test_name.toLowerCase()] || {}
  const refLow  = reference_low  ?? ref.low  ?? null
  const refHigh = reference_high ?? ref.high ?? null
  const critLow  = ref.critical_low  ?? null
  const critHigh = ref.critical_high ?? null

  const interp = interpretLab(test_name, parseFloat(value), refLow, refHigh, critLow, critHigh)
  const critical = (interp === 'HH' || interp === 'LL') ? 1 : 0

  // Delta check vs. most recent prior result
  const prior = (await db.execute({
    sql: 'SELECT value FROM lab_results WHERE patient_id = ? AND test_name = ? AND owner_email = ? ORDER BY result_date DESC LIMIT 1',
    args: [patient_id, test_name, req.apiKey]
  })).rows[0]
  const delta_flag = prior && Math.abs((parseFloat(value) - parseFloat(prior.value)) / Math.max(Math.abs(parseFloat(prior.value)), 1)) > 0.5 ? 1 : 0

  // AI summary
  let ai_summary = null
  try {
    const prompt = `Briefly interpret this lab result in 1–2 sentences for a physician (clinical context only, no boilerplate):
Test: ${test_name} | Value: ${value} ${unit || ''} | Reference: ${refLow ?? '?'}–${refHigh ?? '?'} ${unit || ''} | Interpretation: ${interp}${prior ? ` | Prior value: ${prior.value} ${unit || ''}` : ''}
Patient: ${patient.name}, age ${patient.dob ? Math.floor((Date.now() - new Date(patient.dob)) / (365.25 * 24 * 3600 * 1000)) : 'unknown'}, ${patient.sex || 'unknown sex'}
Conditions: ${patient.conditions || 'none'}`
    const chat = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 120,
    })
    ai_summary = chat.choices[0].message.content.trim()
  } catch {}

  const id = randomUUID()
  await db.execute({
    sql: 'INSERT INTO lab_results (id, patient_id, owner_email, test_name, value, unit, reference_low, reference_high, interpretation, critical, delta_flag, result_date, ai_summary, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    args: [id, patient_id, req.apiKey, test_name, parseFloat(value), unit || null, refLow, refHigh, interp, critical, delta_flag, result_date || new Date().toISOString().slice(0,10), ai_summary, notes || null, new Date().toISOString()]
  })

  // Auto-close related care gap if it matches
  await db.execute({
    sql: "UPDATE care_gaps SET status = 'closed', closed_at = ? WHERE patient_id = ? AND owner_email = ? AND status = 'open' AND (gap_type LIKE ? OR gap_type LIKE ?)",
    args: [new Date().toISOString(), patient_id, req.apiKey, `%${test_name}%`, `%${key}%`]
  })

  res.json({ id, interpretation: interp, critical: !!critical, delta_flag: !!delta_flag, ai_summary })
})

app.delete('/api/labs/:id', auth, async (req, res) => {
  await db.execute({ sql: 'DELETE FROM lab_results WHERE id = ? AND owner_email = ?', args: [req.params.id, req.apiKey] })
  res.json({ ok: true })
})

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 9 — APPOINTMENTS
// ═══════════════════════════════════════════════════════════════════════════════

function noShowRisk(appt) {
  let risk = 0.15  // baseline
  const apptDate = new Date(appt.appointment_date)
  const leadDays = (apptDate - Date.now()) / (24 * 3600 * 1000)
  if (leadDays > 14) risk += 0.15
  if (leadDays > 30) risk += 0.10
  const hour = apptDate.getHours()
  if (hour >= 15) risk += 0.08   // late afternoon
  if (hour < 9)   risk += 0.05   // early morning
  return Math.min(0.95, Math.round(risk * 100) / 100)
}

app.get('/api/appointments', auth, async (req, res) => {
  const { patient_id, view } = req.query
  const now = new Date().toISOString()
  let sql = 'SELECT a.*, p.name as patient_name FROM appointments a JOIN gen_patients p ON a.patient_id = p.id WHERE a.owner_email = ?'
  const args = [req.apiKey]
  if (patient_id) { sql += ' AND a.patient_id = ?'; args.push(patient_id) }
  if (view === 'upcoming') { sql += ' AND a.appointment_date >= ?'; args.push(now) }
  if (view === 'past')     { sql += ' AND a.appointment_date < ?';  args.push(now) }
  sql += ' ORDER BY a.appointment_date ' + (view === 'past' ? 'DESC' : 'ASC')
  res.json((await db.execute({ sql, args })).rows)
})

app.post('/api/appointments', auth, async (req, res) => {
  const { patient_id, appointment_type, appointment_date, duration_minutes, provider, location, notes } = req.body
  if (!patient_id || !appointment_type || !appointment_date) return res.status(400).json({ error: 'patient_id, appointment_type, appointment_date required' })
  const patient = (await db.execute({ sql: 'SELECT id FROM gen_patients WHERE id = ? AND owner_email = ?', args: [patient_id, req.apiKey] })).rows[0]
  if (!patient) return res.status(404).json({ error: 'Patient not found' })

  const id = randomUUID()
  const risk = noShowRisk({ appointment_date })
  await db.execute({
    sql: 'INSERT INTO appointments (id, patient_id, owner_email, appointment_type, appointment_date, duration_minutes, provider, location, notes, status, no_show_risk, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    args: [id, patient_id, req.apiKey, appointment_type, appointment_date, duration_minutes || 30, provider || null, location || null, notes || null, 'scheduled', risk, new Date().toISOString()]
  })
  res.json({ id, no_show_risk: risk })
})

app.put('/api/appointments/:id', auth, async (req, res) => {
  const appt = (await db.execute({ sql: 'SELECT * FROM appointments WHERE id = ? AND owner_email = ?', args: [req.params.id, req.apiKey] })).rows[0]
  if (!appt) return res.status(404).json({ error: 'Not found' })
  const { appointment_type, appointment_date, duration_minutes, provider, location, notes, status } = req.body
  await db.execute({
    sql: 'UPDATE appointments SET appointment_type=?, appointment_date=?, duration_minutes=?, provider=?, location=?, notes=?, status=? WHERE id=?',
    args: [appointment_type||appt.appointment_type, appointment_date||appt.appointment_date, duration_minutes||appt.duration_minutes, provider??appt.provider, location??appt.location, notes??appt.notes, status||appt.status, req.params.id]
  })
  res.json({ ok: true })
})

app.delete('/api/appointments/:id', auth, async (req, res) => {
  await db.execute({ sql: 'DELETE FROM appointments WHERE id = ? AND owner_email = ?', args: [req.params.id, req.apiKey] })
  res.json({ ok: true })
})

app.post('/api/appointments/suggest', auth, aiLimiter, async (req, res) => {
  const { patient_id } = req.body
  const patient = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE id = ? AND owner_email = ?', args: [patient_id, req.apiKey] })).rows[0]
  if (!patient) return res.status(404).json({ error: 'Patient not found' })
  const gaps = (await db.execute({ sql: "SELECT gap_type, description, priority FROM care_gaps WHERE patient_id = ? AND status = 'open' ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END LIMIT 5", args: [patient_id] })).rows

  const prompt = `Suggest the most appropriate appointment type for this patient.
Patient: ${patient.name}, ${patient.sex || 'unknown sex'}, conditions: ${patient.conditions || 'none'}
Open care gaps: ${gaps.map(g => g.gap_type).join(', ') || 'none'}
Respond with JSON: {"appointment_type":"string","reason":"1 sentence","duration_minutes":number,"urgency":"routine|urgent|same-day"}`

  try {
    const chat = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1, max_tokens: 150,
    })
    const m = chat.choices[0].message.content.match(/\{[\s\S]*\}/)
    res.json(m ? JSON.parse(m[0]) : { appointment_type: 'Follow-up Visit', duration_minutes: 30 })
  } catch (e) { res.json({ appointment_type: 'Follow-up Visit', duration_minutes: 30 }) }
})

app.post('/api/appointments/:id/remind', auth, async (req, res) => {
  const appt = (await db.execute({
    sql: 'SELECT a.*, p.name as patient_name, p.email as patient_email FROM appointments a JOIN gen_patients p ON a.patient_id = p.id WHERE a.id = ? AND a.owner_email = ?',
    args: [req.params.id, req.apiKey]
  })).rows[0]
  if (!appt) return res.status(404).json({ error: 'Not found' })
  if (!appt.patient_email) return res.status(400).json({ error: 'Patient has no email on record' })

  const date = new Date(appt.appointment_date).toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  await sendEmail({
    to: appt.patient_email,
    subject: `Appointment Reminder: ${appt.appointment_type}`,
    html: `<p>Dear ${appt.patient_name},</p>
<p>This is a reminder of your upcoming appointment:</p>
<ul>
  <li><strong>Type:</strong> ${appt.appointment_type}</li>
  <li><strong>Date &amp; Time:</strong> ${date}</li>
  ${appt.provider ? `<li><strong>Provider:</strong> ${appt.provider}</li>` : ''}
  ${appt.location ? `<li><strong>Location:</strong> ${appt.location}</li>` : ''}
  ${appt.duration_minutes ? `<li><strong>Duration:</strong> ${appt.duration_minutes} minutes</li>` : ''}
</ul>
<p>Please contact us if you need to reschedule.<br/>Vianova Health</p>`
  })
  await db.execute({ sql: 'UPDATE appointments SET reminder_sent = 1 WHERE id = ?', args: [req.params.id] })
  res.json({ ok: true })
})

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 10 — DISCHARGE SUMMARIES
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/discharge', auth, async (req, res) => {
  const { patient_id } = req.query
  let sql = 'SELECT d.*, p.name as patient_name FROM discharge_summaries d JOIN gen_patients p ON d.patient_id = p.id WHERE d.owner_email = ?'
  const args = [req.apiKey]
  if (patient_id) { sql += ' AND d.patient_id = ?'; args.push(patient_id) }
  sql += ' ORDER BY d.created_at DESC'
  res.json((await db.execute({ sql, args })).rows)
})

app.get('/api/discharge/:id', auth, async (req, res) => {
  const row = (await db.execute({ sql: 'SELECT * FROM discharge_summaries WHERE id = ? AND owner_email = ?', args: [req.params.id, req.apiKey] })).rows[0]
  if (!row) return res.status(404).json({ error: 'Not found' })
  res.json(row)
})

app.post('/api/discharge/generate', auth, async (req, res) => {
  const { patient_id, case_id } = req.body
  if (!patient_id) return res.status(400).json({ error: 'patient_id required' })

  const patient = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE id = ? AND owner_email = ?', args: [patient_id, req.apiKey] })).rows[0]
  if (!patient) return res.status(404).json({ error: 'Patient not found' })

  let caseData = null
  if (case_id) {
    const row = (await db.execute({ sql: 'SELECT * FROM cases WHERE case_id = ? AND owner_key = ?', args: [case_id, req.apiKey] })).rows[0]
    if (row) caseData = JSON.parse(row.analysis)
  }

  let age = null
  if (patient.dob) {
    const dob = new Date(patient.dob)
    if (!isNaN(dob)) age = Math.floor((Date.now() - dob) / (365.25 * 24 * 3600 * 1000))
  }

  const prompt = `You are a physician generating a structured discharge summary. Return a JSON object with these exact keys.

Patient: ${patient.name}, age ${age ?? 'unknown'}, ${patient.sex || 'unknown sex'}
Conditions: ${patient.conditions || 'none documented'}
Medications: ${patient.medications || 'none documented'}
Allergies: ${patient.allergies || 'none documented'}
${caseData ? `
AI Analysis:
- Diagnosis: ${caseData.most_likely_diagnosis?.[0]?.name || 'see case'}
- Treatment: ${caseData.recommended_treatment || 'see case'}
- Red flags: ${caseData.red_flags?.flags?.join(', ') || 'none'}` : ''}

Return ONLY valid JSON:
{
  "summary": "3–5 sentence clinical discharge summary in medical prose",
  "patient_instructions": "3–6 bullet points of plain-language (6th grade) discharge instructions starting with -",
  "medications_at_discharge": "list the current medications with dosing as a comma-separated string",
  "follow_up_plan": "specific follow-up steps, e.g. 'Follow up with PCP in 1 week; repeat labs in 2 weeks'",
  "risk_level": "low|medium|high",
  "risk_reason": "1 sentence explaining risk level"
}`

  try {
    const chat = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 700,
    })
    const m = chat.choices[0].message.content.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('Invalid AI response')
    const draft = JSON.parse(m[0])

    const id = randomUUID()
    await db.execute({
      sql: 'INSERT INTO discharge_summaries (id, patient_id, owner_email, case_id, summary, patient_instructions, medications_at_discharge, follow_up_plan, risk_level, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      args: [id, patient_id, req.apiKey, case_id || null, draft.summary, draft.patient_instructions, draft.medications_at_discharge, draft.follow_up_plan, draft.risk_level || 'low', new Date().toISOString()]
    })
    res.json({ id, ...draft })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/discharge/:id', auth, async (req, res) => {
  const row = (await db.execute({ sql: 'SELECT * FROM discharge_summaries WHERE id = ? AND owner_email = ?', args: [req.params.id, req.apiKey] })).rows[0]
  if (!row) return res.status(404).json({ error: 'Not found' })
  const { summary, patient_instructions, medications_at_discharge, follow_up_plan, risk_level, finalized } = req.body
  await db.execute({
    sql: 'UPDATE discharge_summaries SET summary=?, patient_instructions=?, medications_at_discharge=?, follow_up_plan=?, risk_level=?, finalized=? WHERE id=?',
    args: [summary??row.summary, patient_instructions??row.patient_instructions, medications_at_discharge??row.medications_at_discharge, follow_up_plan??row.follow_up_plan, risk_level??row.risk_level, finalized??row.finalized, req.params.id]
  })
  res.json({ ok: true })
})

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 12 — CONSENT & PRIVACY
// ═══════════════════════════════════════════════════════════════════════════════

async function logAudit(ownerEmail, patientId, action, resourceType, actor, details) {
  await db.execute({
    sql: 'INSERT INTO audit_events (owner_email, patient_id, action, resource_type, actor, details, created_at) VALUES (?,?,?,?,?,?,?)',
    args: [ownerEmail, patientId || null, action, resourceType || null, actor || null, details ? JSON.stringify(details) : null, new Date().toISOString()]
  })
}

app.get('/api/consents', auth, async (req, res) => {
  const { patient_id } = req.query
  let sql = 'SELECT c.*, p.name as patient_name FROM consents c JOIN gen_patients p ON c.patient_id = p.id WHERE c.owner_email = ?'
  const args = [req.apiKey]
  if (patient_id) { sql += ' AND c.patient_id = ?'; args.push(patient_id) }
  sql += ' ORDER BY c.created_at DESC'
  res.json((await db.execute({ sql, args })).rows)
})

app.post('/api/consents', auth, async (req, res) => {
  const { patient_id, consent_type, granted, signed_by, signed_date, expires_at, notes } = req.body
  if (!patient_id || !consent_type) return res.status(400).json({ error: 'patient_id and consent_type required' })
  const patient = (await db.execute({ sql: 'SELECT id FROM gen_patients WHERE id = ? AND owner_email = ?', args: [patient_id, req.apiKey] })).rows[0]
  if (!patient) return res.status(404).json({ error: 'Patient not found' })
  const id = randomUUID()
  await db.execute({
    sql: 'INSERT INTO consents (id, patient_id, owner_email, consent_type, granted, signed_by, signed_date, expires_at, notes, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    args: [id, patient_id, req.apiKey, consent_type, granted ?? 1, signed_by || null, signed_date || new Date().toISOString().slice(0,10), expires_at || null, notes || null, 'active', new Date().toISOString()]
  })
  await logAudit(req.apiKey, patient_id, 'consent_created', 'Consent', req.apiKey, { consent_type, granted })
  res.json({ id })
})

app.put('/api/consents/:id', auth, async (req, res) => {
  const row = (await db.execute({ sql: 'SELECT * FROM consents WHERE id = ? AND owner_email = ?', args: [req.params.id, req.apiKey] })).rows[0]
  if (!row) return res.status(404).json({ error: 'Not found' })
  const { status, notes, expires_at } = req.body
  await db.execute({
    sql: 'UPDATE consents SET status=?, notes=?, expires_at=? WHERE id=?',
    args: [status||row.status, notes??row.notes, expires_at??row.expires_at, req.params.id]
  })
  await logAudit(req.apiKey, row.patient_id, 'consent_updated', 'Consent', req.apiKey, { status, new_status: status || row.status })
  res.json({ ok: true })
})

// Patient data export (right-to-access)
app.get('/api/consents/export/:patientId', auth, async (req, res) => {
  const pid = req.params.patientId
  const patient = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE id = ? AND owner_email = ?', args: [pid, req.apiKey] })).rows[0]
  if (!patient) return res.status(404).json({ error: 'Patient not found' })

  const [labs, appts, gaps, consents, discharge] = await Promise.all([
    db.execute({ sql: 'SELECT * FROM lab_results WHERE patient_id = ? AND owner_email = ? ORDER BY result_date DESC', args: [pid, req.apiKey] }),
    db.execute({ sql: 'SELECT * FROM appointments WHERE patient_id = ? AND owner_email = ? ORDER BY appointment_date DESC', args: [pid, req.apiKey] }),
    db.execute({ sql: 'SELECT * FROM care_gaps WHERE patient_id = ? AND owner_email = ? ORDER BY created_at DESC', args: [pid, req.apiKey] }),
    db.execute({ sql: 'SELECT * FROM consents WHERE patient_id = ? AND owner_email = ? ORDER BY created_at DESC', args: [pid, req.apiKey] }),
    db.execute({ sql: 'SELECT * FROM discharge_summaries WHERE patient_id = ? AND owner_email = ? ORDER BY created_at DESC', args: [pid, req.apiKey] }),
  ])

  await logAudit(req.apiKey, pid, 'data_export', 'Patient', req.apiKey, { reason: 'right-to-access' })

  res.json({
    export_date: new Date().toISOString(),
    patient,
    lab_results: labs.rows,
    appointments: appts.rows,
    care_gaps: gaps.rows,
    consents: consents.rows,
    discharge_summaries: discharge.rows,
  })
})

app.get('/api/audit-events', auth, async (req, res) => {
  const { patient_id } = req.query
  let sql = 'SELECT * FROM audit_events WHERE owner_email = ?'
  const args = [req.apiKey]
  if (patient_id) { sql += ' AND patient_id = ?'; args.push(patient_id) }
  sql += ' ORDER BY created_at DESC LIMIT 200'
  res.json((await db.execute({ sql, args })).rows)
})

// ── ADVERSE EVENTS ────────────────────────────────────────────────────────────

// GET /api/adverse-events
app.get('/api/adverse-events', auth, async (req, res) => {
  try {
    const { patient_id, severity, status } = req.query
    let sql = 'SELECT a.*, p.name as patient_name FROM adverse_events a JOIN gen_patients p ON a.patient_id = p.id WHERE a.owner_email = ?'
    const args = [req.apiKey]
    if (patient_id) { sql += ' AND a.patient_id = ?'; args.push(patient_id) }
    if (severity) { sql += ' AND a.severity = ?'; args.push(severity) }
    if (status) { sql += ' AND a.status = ?'; args.push(status) }
    sql += ' ORDER BY a.created_at DESC'
    const rows = (await db.execute({ sql, args })).rows
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/adverse-events — manual report
app.post('/api/adverse-events', auth, async (req, res) => {
  try {
    const { patient_id, event_type, severity, suspected_medication, description, detected_at, notes } = req.body
    if (!patient_id || !event_type || !description) return res.status(400).json({ error: 'patient_id, event_type and description required' })
    const id = randomUUID()
    const now = new Date().toISOString()
    await db.execute({
      sql: 'INSERT INTO adverse_events (id, patient_id, owner_email, event_type, severity, suspected_medication, description, detected_at, detection_method, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      args: [id, patient_id, req.apiKey, event_type, severity || 'moderate', suspected_medication || null, description, detected_at || now, 'manual', 'open', now]
    })
    // AI causality assessment
    try {
      const patient = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE id = ?', args: [patient_id] })).rows[0]
      const meds = patient?.medications ? JSON.parse(patient.medications) : []
      const prompt = `You are a pharmacovigilance AI. Assess this adverse event report and provide a JSON response.

Patient medications: ${meds.join(', ') || 'unknown'}
Suspected medication: ${suspected_medication || 'not specified'}
Event type: ${event_type}
Severity: ${severity || 'moderate'}
Description: ${description}

Return JSON with keys:
- causality: "certain" | "probable" | "possible" | "unlikely" | "unclassified"
- causality_reasoning: string (1-2 sentences)
- recommended_action: string (what to do now)
- medwatch_draft: string (a brief FDA MedWatch-style narrative, 3-4 sentences)
- signal_strength: "strong" | "moderate" | "weak"`

      const aiRes = await client.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2
      })
      const ai = JSON.parse(aiRes.choices[0].message.content)
      await db.execute({
        sql: 'UPDATE adverse_events SET causality = ?, ai_assessment = ?, medwatch_draft = ? WHERE id = ?',
        args: [ai.causality || null, JSON.stringify(ai), ai.medwatch_draft || null, id]
      })
      const updated = (await db.execute({ sql: 'SELECT * FROM adverse_events WHERE id = ?', args: [id] })).rows[0]
      return res.json({ ...updated, ai_assessment: ai })
    } catch {}
    const saved = (await db.execute({ sql: 'SELECT * FROM adverse_events WHERE id = ?', args: [id] })).rows[0]
    res.json(saved)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/adverse-events/detect/:patientId — AI scan of patient data for signals
app.post('/api/adverse-events/detect/:patientId', auth, aiLimiter, async (req, res) => {
  try {
    const patient = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE id = ? AND owner_email = ?', args: [req.params.patientId, req.apiKey] })).rows[0]
    if (!patient) return res.status(404).json({ error: 'Patient not found' })
    const labs = (await db.execute({ sql: 'SELECT * FROM lab_results WHERE patient_id = ? ORDER BY result_date DESC LIMIT 20', args: [req.params.patientId] })).rows
    const existingEvents = (await db.execute({ sql: "SELECT event_type, suspected_medication FROM adverse_events WHERE patient_id = ? AND status = 'open'", args: [req.params.patientId] })).rows

    let meds = []; let conditions = []
    try { meds = JSON.parse(patient.medications || '[]') } catch {}
    try { conditions = JSON.parse(patient.conditions || '[]') } catch {}

    const labSummary = labs.map(l => `${l.test_name}: ${l.value} ${l.unit || ''} (${l.interpretation || 'N'}) on ${l.result_date?.slice(0,10)}`).join('\n')
    const existingSummary = existingEvents.map(e => `${e.event_type} (${e.suspected_medication || 'unknown med'})`).join(', ')

    const prompt = `You are a pharmacovigilance AI. Analyze this patient's data for adverse drug event signals.

Patient: ${patient.name}, ${patient.sex || 'unknown sex'}, DOB: ${patient.dob || 'unknown'}
Conditions: ${conditions.join(', ') || 'none documented'}
Current medications: ${meds.join(', ') || 'none documented'}
Allergies: ${patient.allergies || 'none'}

Recent lab results:
${labSummary || 'No labs available'}

Already reported open events: ${existingSummary || 'none'}

Identify any potential adverse drug events, drug-lab interactions, or safety signals.
Return a JSON array of detected signals (empty array if none found). Each signal:
{
  "event_type": string (e.g. "Drug-Lab Interaction", "Potential Toxicity", "Hypersensitivity"),
  "severity": "mild" | "moderate" | "severe" | "life-threatening",
  "suspected_medication": string or null,
  "description": string (clear clinical description),
  "signal_strength": "strong" | "moderate" | "weak",
  "recommended_action": string
}
Only report genuine signals, not already-reported ones. Return [] if no new signals.`

    const aiRes = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2
    })
    let signals = []
    try {
      const parsed = JSON.parse(aiRes.choices[0].message.content)
      signals = Array.isArray(parsed) ? parsed : (parsed.signals || [])
    } catch {}

    // Auto-create adverse_event records for strong signals
    const now = new Date().toISOString()
    const created = []
    for (const s of signals.filter(s => s.signal_strength === 'strong')) {
      const id = randomUUID()
      await db.execute({
        sql: 'INSERT INTO adverse_events (id, patient_id, owner_email, event_type, severity, suspected_medication, description, detected_at, detection_method, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        args: [id, req.params.patientId, req.apiKey, s.event_type, s.severity, s.suspected_medication || null, s.description, now, 'ai_detected', 'open', now]
      })
      created.push(id)
    }

    res.json({ signals, auto_created: created.length, patient_name: patient.name })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PATCH /api/adverse-events/:id — update status / resolve
app.patch('/api/adverse-events/:id', auth, async (req, res) => {
  try {
    const { status, notes, causality } = req.body
    const now = new Date().toISOString()
    const resolved_at = status === 'resolved' ? now : null
    await db.execute({
      sql: 'UPDATE adverse_events SET status = COALESCE(?, status), notes = COALESCE(?, notes), causality = COALESCE(?, causality), resolved_at = COALESCE(?, resolved_at) WHERE id = ? AND owner_email = ?',
      args: [status || null, notes || null, causality || null, resolved_at, req.params.id, req.apiKey]
    })
    const updated = (await db.execute({ sql: 'SELECT * FROM adverse_events WHERE id = ?', args: [req.params.id] })).rows[0]
    res.json(updated)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE /api/adverse-events/:id
app.delete('/api/adverse-events/:id', auth, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM adverse_events WHERE id = ? AND owner_email = ?', args: [req.params.id, req.apiKey] })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── POPULATION HEALTH ─────────────────────────────────────────────────────────

app.get('/api/cohorts', auth, async (req, res) => {
  try {
    const rows = (await db.execute({ sql: 'SELECT * FROM cohorts WHERE owner_email = ? ORDER BY created_at DESC', args: [req.apiKey] })).rows
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/cohorts', auth, async (req, res) => {
  try {
    const { name, description, criteria, program_type } = req.body
    if (!name || !criteria) return res.status(400).json({ error: 'name and criteria required' })
    const id = randomUUID(); const now = new Date().toISOString()
    await db.execute({ sql: 'INSERT INTO cohorts (id, owner_email, name, description, criteria, program_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)', args: [id, req.apiKey, name, description || '', JSON.stringify(criteria), program_type || null, now, now] })
    res.json({ id, name })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/cohorts/:id', auth, async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM cohort_members WHERE cohort_id = ?', args: [req.params.id] })
    await db.execute({ sql: 'DELETE FROM cohorts WHERE id = ? AND owner_email = ?', args: [req.params.id, req.apiKey] })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Auto-enroll matching patients into cohort
app.post('/api/cohorts/:id/enroll', auth, async (req, res) => {
  try {
    const cohort = (await db.execute({ sql: 'SELECT * FROM cohorts WHERE id = ? AND owner_email = ?', args: [req.params.id, req.apiKey] })).rows[0]
    if (!cohort) return res.status(404).json({ error: 'Cohort not found' })
    const criteria = typeof cohort.criteria === 'string' ? JSON.parse(cohort.criteria) : cohort.criteria
    const patients = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE owner_email = ?', args: [req.apiKey] })).rows

    const matches = []
    for (const p of patients) {
      let conds = []; let meds = []
      try { conds = JSON.parse(p.conditions || '[]') } catch {}
      try { meds = JSON.parse(p.medications || '[]') } catch {}
      const condStr = conds.join(' ').toLowerCase()
      const medStr = meds.join(' ').toLowerCase()
      let match = false
      if (criteria.condition_keywords?.length) {
        match = criteria.condition_keywords.some(k => condStr.includes(k.toLowerCase()))
      }
      if (!match && criteria.medication_keywords?.length) {
        match = criteria.medication_keywords.some(k => medStr.includes(k.toLowerCase()))
      }
      if (!match && criteria.program_type) {
        const prog = criteria.program_type.toLowerCase()
        match = condStr.includes(prog) || medStr.includes(prog)
      }
      if (match) matches.push(p)
    }

    const now = new Date().toISOString(); let enrolled = 0; let skipped = 0
    for (const p of matches) {
      try {
        await db.execute({ sql: 'INSERT OR IGNORE INTO cohort_members (cohort_id, patient_id, enrolled_at, risk_level, outreach_status) VALUES (?,?,?,?,?)', args: [cohort.id, p.id, now, null, 'pending'] })
        enrolled++
      } catch { skipped++ }
    }
    await db.execute({ sql: 'UPDATE cohorts SET member_count = (SELECT COUNT(*) FROM cohort_members WHERE cohort_id = ?), updated_at = ? WHERE id = ?', args: [cohort.id, now, cohort.id] })
    res.json({ enrolled, skipped, total_matches: matches.length, patient_names: matches.slice(0,5).map(p => p.name) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Get cohort members
app.get('/api/cohorts/:id/members', auth, async (req, res) => {
  try {
    const rows = (await db.execute({
      sql: 'SELECT cm.*, p.name, p.dob, p.sex, p.conditions, p.medications, p.mrn FROM cohort_members cm JOIN gen_patients p ON cm.patient_id = p.id WHERE cm.cohort_id = ? ORDER BY cm.enrolled_at DESC',
      args: [req.params.id]
    })).rows
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// AI risk stratification for cohort members
app.post('/api/cohorts/:id/stratify', auth, aiLimiter, async (req, res) => {
  try {
    const members = (await db.execute({
      sql: 'SELECT cm.*, p.name, p.dob, p.conditions, p.medications, p.allergies FROM cohort_members cm JOIN gen_patients p ON cm.patient_id = p.id WHERE cm.cohort_id = ?',
      args: [req.params.id]
    })).rows

    if (!members.length) return res.json({ stratified: 0 })
    const cohort = (await db.execute({ sql: 'SELECT * FROM cohorts WHERE id = ?', args: [req.params.id] })).rows[0]

    const prompt = `You are a population health AI. Stratify these patients by risk level for the ${cohort?.name || 'program'} program.

Patients:
${members.map((m, i) => `${i+1}. ${m.name} | Conditions: ${m.conditions || 'none'} | Medications: ${m.medications || 'none'}`).join('\n')}

Return JSON: { "stratification": [ { "patient_id": "...", "risk_level": "high"|"medium"|"low", "reason": "brief reason" } ] }`

    const aiRes = await client.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.2 })
    const { stratification = [] } = JSON.parse(aiRes.choices[0].message.content)

    for (const s of stratification) {
      await db.execute({ sql: 'UPDATE cohort_members SET risk_level = ? WHERE cohort_id = ? AND patient_id = ?', args: [s.risk_level, req.params.id, s.patient_id] })
    }
    res.json({ stratified: stratification.length, breakdown: stratification.reduce((a, s) => { a[s.risk_level] = (a[s.risk_level]||0)+1; return a }, {}) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Generate AI outreach message for cohort member
app.post('/api/cohorts/:cohortId/members/:patientId/outreach', auth, async (req, res) => {
  try {
    const patient = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE id = ?', args: [req.params.patientId] })).rows[0]
    const cohort = (await db.execute({ sql: 'SELECT * FROM cohorts WHERE id = ?', args: [req.params.cohortId] })).rows[0]
    if (!patient || !cohort) return res.status(404).json({ error: 'Not found' })

    const prompt = `Write a brief, empathetic patient outreach message for a ${cohort.name} program.
Patient: ${patient.name}, Conditions: ${patient.conditions || 'not documented'}
Message should: introduce the program, explain benefits, ask patient to schedule an appointment.
Keep it under 120 words. Plain language. Return JSON: { "message": "..." }`

    const aiRes = await client.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.5 })
    const { message } = JSON.parse(aiRes.choices[0].message.content)
    await db.execute({ sql: "UPDATE cohort_members SET outreach_status = 'sent' WHERE cohort_id = ? AND patient_id = ?", args: [req.params.cohortId, req.params.patientId] })
    res.json({ message, patient_name: patient.name })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── NLP / CLINICAL NOTES ──────────────────────────────────────────────────────

app.post('/api/nlp/extract', auth, aiLimiter, async (req, res) => {
  try {
    const { note_text, patient_id } = req.body
    if (!note_text) return res.status(400).json({ error: 'note_text required' })

    const prompt = `You are a clinical NLP system. Extract structured data from this clinical note.

Note:
${note_text.slice(0, 3000)}

Return JSON:
{
  "conditions": [{"name": "...", "status": "present"|"absent"|"historical"|"possible", "confidence": 0.0-1.0}],
  "medications": [{"name": "...", "dose": "...", "route": "...", "frequency": "...", "confidence": 0.0-1.0}],
  "symptoms": [{"name": "...", "status": "present"|"absent"|"resolved", "onset": "...", "confidence": 0.0-1.0}],
  "allergies": [{"substance": "...", "reaction": "...", "confidence": 0.0-1.0}],
  "vitals": {"bp": "...", "hr": "...", "temp": "...", "rr": "...", "spo2": "..."},
  "lab_values": [{"test": "...", "value": "...", "unit": "...", "date": "..."}],
  "procedures": [{"name": "...", "date": "...", "confidence": 0.0-1.0}],
  "note_type": "SOAP"|"discharge"|"consult"|"nursing"|"other",
  "acuity": "low"|"medium"|"high"|"critical",
  "summary": "1-2 sentence clinical summary"
}`

    const aiRes = await client.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.1 })
    const extracted = JSON.parse(aiRes.choices[0].message.content)
    res.json({ extracted, patient_id: patient_id || null })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/nlp/deidentify', auth, aiLimiter, async (req, res) => {
  try {
    const { note_text } = req.body
    if (!note_text) return res.status(400).json({ error: 'note_text required' })

    const prompt = `De-identify this clinical note by replacing all PHI with placeholders.
Replace: patient names → [PATIENT], provider names → [PROVIDER], dates → [DATE], MRN/IDs → [ID], phone numbers → [PHONE], addresses → [ADDRESS], facility names → [FACILITY].
Return JSON: { "deidentified_text": "...", "phi_found": ["list of PHI types found"] }`

    const aiRes = await client.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: `${prompt}\n\nNote:\n${note_text.slice(0, 3000)}` }], response_format: { type: 'json_object' }, temperature: 0.1 })
    const result = JSON.parse(aiRes.choices[0].message.content)
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Apply extracted data to a patient record
app.post('/api/nlp/apply/:patientId', auth, async (req, res) => {
  try {
    const { extracted } = req.body
    if (!extracted) return res.status(400).json({ error: 'extracted data required' })
    const patient = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE id = ? AND owner_email = ?', args: [req.params.patientId, req.apiKey] })).rows[0]
    if (!patient) return res.status(404).json({ error: 'Patient not found' })

    let conds = []; let meds = []; let allgs = []
    try { conds = JSON.parse(patient.conditions || '[]') } catch {}
    try { meds = JSON.parse(patient.medications || '[]') } catch {}
    try { allgs = JSON.parse(patient.allergies || '[]') } catch { allgs = patient.allergies ? [patient.allergies] : [] }

    const newConds = (extracted.conditions || []).filter(c => c.status === 'present' && c.confidence >= 0.7).map(c => c.name).filter(n => !conds.includes(n))
    const newMeds = (extracted.medications || []).filter(m => m.confidence >= 0.7).map(m => m.dose ? `${m.name} ${m.dose}` : m.name).filter(n => !meds.includes(n))
    const newAllgs = (extracted.allergies || []).filter(a => a.confidence >= 0.7).map(a => a.substance).filter(n => !allgs.includes(n))

    const updConds = [...conds, ...newConds]; const updMeds = [...meds, ...newMeds]; const updAllgs = [...allgs, ...newAllgs]
    await db.execute({ sql: 'UPDATE gen_patients SET conditions = ?, medications = ?, allergies = ? WHERE id = ?', args: [JSON.stringify(updConds), JSON.stringify(updMeds), JSON.stringify(updAllgs), req.params.patientId] })
    res.json({ added_conditions: newConds, added_medications: newMeds, added_allergies: newAllgs })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── CLINICAL DECISION SUPPORT ─────────────────────────────────────────────────

// Full patient CDS check
// ── NEWS2 helper ──────────────────────────────────────────────────────────────
function calcNEWS2(v = {}) {
  // v: { hr, rr, spo2, sbp, temp_c }
  let score = 0; const breakdown = {}

  // Respiratory rate
  const rr = Number(v.rr)
  if (!isNaN(rr)) {
    const pts = rr <= 8 ? 3 : rr <= 11 ? 1 : rr <= 20 ? 0 : rr <= 24 ? 2 : 3
    score += pts; breakdown.rr = pts
  }

  // SpO2 (scale 1 — no supplemental O2)
  const spo2 = Number(v.spo2)
  if (!isNaN(spo2)) {
    const pts = spo2 <= 91 ? 3 : spo2 <= 93 ? 2 : spo2 <= 95 ? 1 : 0
    score += pts; breakdown.spo2 = pts
  }

  // Systolic BP
  const sbp = Number(v.sbp)
  if (!isNaN(sbp)) {
    const pts = sbp <= 90 ? 3 : sbp <= 100 ? 2 : sbp <= 110 ? 1 : sbp <= 219 ? 0 : 3
    score += pts; breakdown.sbp = pts
  }

  // Heart rate
  const hr = Number(v.hr)
  if (!isNaN(hr)) {
    const pts = hr <= 40 ? 3 : hr <= 50 ? 1 : hr <= 90 ? 0 : hr <= 110 ? 1 : hr <= 130 ? 2 : 3
    score += pts; breakdown.hr = pts
  }

  // Temperature (°C)
  const temp = Number(v.temp_c)
  if (!isNaN(temp)) {
    const pts = temp <= 35.0 ? 3 : temp <= 36.0 ? 1 : temp <= 38.0 ? 0 : temp <= 39.0 ? 1 : 2
    score += pts; breakdown.temp = pts
  }

  const label = score === 0 ? 'Low' : score <= 4 ? 'Low' : score <= 6 ? 'Medium' : 'High'
  const action = score <= 4 ? 'Routine monitoring' : score <= 6 ? 'Increased monitoring' : 'Urgent clinical review'
  return { score, label, action, breakdown }
}

// ── POST /api/cds/patient/:patientId ─────────────────────────────────────────
app.post('/api/cds/patient/:patientId', auth, aiLimiter, async (req, res) => {
  try {
    const patient = (await db.execute({
      sql: 'SELECT * FROM gen_patients WHERE id = ? AND owner_email = ?',
      args: [req.params.patientId, req.apiKey],
    })).rows[0]
    if (!patient) return res.status(404).json({ error: 'Patient not found' })

    // ── Parse stored JSON fields ──────────────────────────────────────────────
    let conds = [], meds = [], allgs = [], vitals = {}
    try { conds  = JSON.parse(patient.conditions  || '[]') } catch {}
    try { meds   = JSON.parse(patient.medications || '[]') } catch {}
    try { allgs  = JSON.parse(patient.allergies   || '[]') } catch {}
    try { vitals = JSON.parse(patient.fhir_vitals || '{}') } catch {}

    // ── Parallel DB fetches ───────────────────────────────────────────────────
    const [labRows, gapRows, apptRows, caseRows, adverseRows] = await Promise.all([
      db.execute({ sql: 'SELECT * FROM lab_results WHERE patient_id = ? ORDER BY result_date DESC LIMIT 15', args: [patient.id] }),
      db.execute({ sql: "SELECT * FROM care_gaps WHERE patient_id = ? AND status = 'open'", args: [patient.id] }),
      db.execute({ sql: "SELECT * FROM appointments WHERE patient_id = ? ORDER BY appointment_date DESC LIMIT 10", args: [patient.id] }),
      db.execute({ sql: "SELECT case_id, created_at, patient_input, analysis FROM cases WHERE patient_input LIKE ? AND owner_key = ? ORDER BY created_at DESC", args: [`%"patient_id":"${patient.id}"%`, req.apiKey] }),
      db.execute({ sql: "SELECT * FROM adverse_events WHERE patient_id = ? ORDER BY created_at DESC LIMIT 5", args: [patient.id] }),
    ])
    const labs     = labRows.rows
    const gaps     = gapRows.rows
    const appts    = apptRows.rows
    const cases    = caseRows.rows
    const adverse  = adverseRows.rows

    // ── Build patient history from cases ────────────────────────────────────
    const history = cases.map(c => {
      let pi = {}; let an = {}
      try { pi = JSON.parse(c.patient_input) } catch {}
      try { an = JSON.parse(c.analysis) }      catch {}
      return {
        case_id:          c.case_id,
        date:             c.created_at?.slice(0, 10),
        chief_complaint:  pi.chief_complaint || pi.symptoms || 'Unspecified',
        status:           an.doctor_review?.approved ? 'Approved' : 'Pending',
        confidence:       an.confidence_level || 'low',
        top_diagnosis:    an.differential_diagnosis?.[0]?.name || null,
        is_current:       false,
      }
    })
    // Mark most recent as current
    if (history.length > 0) history[0].is_current = true

    // ── Age calculation ───────────────────────────────────────────────────────
    let age = null
    if (patient.dob) {
      const dob = new Date(patient.dob)
      const now = new Date()
      age = now.getFullYear() - dob.getFullYear()
      if (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate())) age--
    }

    // ── Extract vitals from fhir_vitals (various key shapes) ────────────────
    // fhir_vitals may store { heart_rate, spo2, systolic_bp, diastolic_bp, temperature, resp_rate, weight, height, pain_level, blood_sugar }
    const vhr   = vitals.heart_rate       || vitals.hr   || null
    const vrr   = vitals.resp_rate        || vitals.rr   || null
    const vspo2 = vitals.spo2             || vitals.oxygen_saturation || null
    const vsbp  = vitals.systolic_bp      || vitals.sbp  || null
    const vdbp  = vitals.diastolic_bp     || vitals.dbp  || null
    const vtempF= vitals.temperature      || null                    // stored as °F
    const vtempC= vtempF != null ? ((vtempF - 32) * 5/9) : null
    const vwt   = vitals.weight           || null
    const vht   = vitals.height           || null
    const vpain = vitals.pain_level       || null
    const vbs   = vitals.blood_sugar      || null

    // ── NEWS2 calculation ────────────────────────────────────────────────────
    const news2 = calcNEWS2({ hr: vhr, rr: vrr, spo2: vspo2, sbp: vsbp, temp_c: vtempC })
    const vitalSources = [vhr, vrr, vspo2, vsbp, vtempF].filter(x => x != null).length
    const news2Note = `calculated from ${vitalSources} imported vital${vitalSources !== 1 ? 's' : ''}`

    // ── Allergy + medication conflict check (rule-based, instant) ────────────
    const ALLERGY_MED_MAP = {
      penicillin: ['amoxicillin','ampicillin','piperacillin','nafcillin'],
      sulfa:      ['sulfamethoxazole','trimethoprim-sulfamethoxazole','bactrim'],
      aspirin:    ['aspirin','ibuprofen','naproxen','ketorolac'],
      nsaids:     ['ibuprofen','naproxen','celecoxib','ketorolac','indomethacin'],
      codeine:    ['codeine','morphine'],
    }
    const conflicts = []
    allgs.forEach(alg => {
      const a = alg.toLowerCase()
      const relatedMeds = ALLERGY_MED_MAP[a] || []
      meds.forEach(med => {
        if (relatedMeds.some(rm => med.toLowerCase().includes(rm))) {
          conflicts.push({ allergy: alg, medication: med })
        }
      })
    })

    // ── Current case data (most recent) for presenting complaint ────────────
    let presentingComplaint = null
    let currentAnalysis = null
    if (cases[0]) {
      try {
        const pi = JSON.parse(cases[0].patient_input)
        presentingComplaint = pi.chief_complaint || pi.symptoms || null
      } catch {}
      try { currentAnalysis = JSON.parse(cases[0].analysis) } catch {}
    }

    // ── AI comprehensive analysis ────────────────────────────────────────────
    const allergyNote = conflicts.length
      ? 'CONFLICTS: ' + conflicts.map(c => `${c.medication} conflicts with ${c.allergy} allergy`).join('; ')
      : 'No immediate allergy-medication conflicts detected'

    const prompt = `You are a senior clinical decision support AI. Analyze this patient and return a JSON object for physician review.

PATIENT: ${patient.name}, Age ${age ?? 'unknown'}, ${patient.sex || 'unknown sex'}
CONDITIONS: ${conds.join(', ') || 'none'}
MEDICATIONS: ${meds.join(', ') || 'none'}
ALLERGIES: ${allgs.join(', ') || 'none'}
VITALS: HR ${vhr || '?'} bpm, RR ${vrr || '?'}/min, SpO2 ${vspo2 || '?'}%, BP ${vsbp || '?'}/${vdbp || '?'} mmHg, Temp ${vtempF || '?'}F, Weight ${vwt || '?'} lbs, Pain ${vpain ?? '?'}/10, Blood sugar ${vbs || '?'} mg/dL
NEWS2: ${news2.score} (${news2.label})
LABS: ${labs.length ? labs.slice(0,6).map(l => `${l.test_name} ${l.value}${l.unit||''} (${l.interpretation||'N/A'})`).join(', ') : 'none'}
CARE GAPS: ${gaps.map(g => g.gap_type).join(', ') || 'none'}
COMPLAINT: ${presentingComplaint || 'not stated'}
ADVERSE EVENTS: ${adverse.length ? adverse.map(a => a.event_type).join(', ') : 'none'}
ALLERGY CHECK: ${allergyNote}

Return this exact JSON structure:
{
  "risk_score": <integer 0-100>,
  "risk_label": "<low|moderate|high|critical>",
  "summary": "<2-3 sentence overall assessment>",
  "cards": [
    { "id": "<unique>", "indicator": "<info|warning|critical>", "title": "<short>", "detail": "<explanation>", "category": "<screening|medication|lab|care_gap|risk|follow_up>", "action": "<suggested action or null>" }
  ],
  "differential": [
    { "rank": 1, "diagnosis": "<name>", "probability": "<high|moderate|low>", "reasoning": "<brief>" }
  ],
  "treatment_plan": {
    "non_pharmacological": ["<item>"],
    "pharmacological": ["<drug and rationale>"],
    "investigations": ["<test>"],
    "follow_up": "<timeframe>"
  },
  "doctor_summary": "<3-5 sentence physician narrative covering key findings, risks, and recommended next steps>"
}`

    const aiRes = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 2000,
    })
    const aiResult = JSON.parse(aiRes.choices[0].message.content)

    res.json({
      // patient info
      patient_name:       patient.name,
      patient_id:         patient.id,
      age,
      sex:                patient.sex,
      dob:                patient.dob,
      conditions:         conds,
      medications:        meds,
      allergies:          allgs,
      // vitals
      vitals: {
        hr: vhr, rr: vrr, spo2: vspo2, sbp: vsbp, dbp: vdbp,
        temp_f: vtempF, weight: vwt, height: vht,
        pain: vpain, blood_sugar: vbs,
      },
      // NEWS2
      news2: { ...news2, note: news2Note },
      // history
      case_history:       history,
      visit_count:        history.length,
      presenting_complaint: presentingComplaint,
      // labs, gaps, adverse
      labs:               labs.slice(0, 8),
      open_gaps:          gaps,
      adverse_events:     adverse,
      // allergy conflicts (rule-based, not AI)
      allergy_conflicts:  conflicts,
      allergy_check:      allergyNote,
      // AI fields — spread last so they override nothing critical
      cards:              aiResult.cards              || [],
      risk_score:         aiResult.risk_score         ?? 0,
      risk_label:         aiResult.risk_label         || 'low',
      summary:            aiResult.summary            || '',
      differential:       aiResult.differential       || [],
      treatment_plan:     aiResult.treatment_plan     || {},
      doctor_summary:     aiResult.doctor_summary     || '',
      generated_at:       new Date().toISOString(),
    })
  } catch (e) {
    console.error('CDS error:', e)
    res.status(500).json({ error: e.message })
  }
})

// Medication safety check
app.post('/api/cds/medication-check', auth, async (req, res) => {
  try {
    const { patient_id, new_medication, new_dose } = req.body
    if (!patient_id || !new_medication) return res.status(400).json({ error: 'patient_id and new_medication required' })

    const patient = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE id = ?', args: [patient_id] })).rows[0]
    let meds = []; let allgs = []; let conds = []
    try { meds = JSON.parse(patient?.medications || '[]') } catch {}
    try { allgs = JSON.parse(patient?.allergies || '[]') } catch {}
    try { conds = JSON.parse(patient?.conditions || '[]') } catch {}

    const prompt = `You are a clinical pharmacist AI. Check this new medication for safety issues.

Patient conditions: ${conds.join(', ') || 'unknown'}
Current medications: ${meds.join(', ') || 'none'}
Known allergies: ${allgs.join(', ') || 'none'}
New medication: ${new_medication}${new_dose ? ` ${new_dose}` : ''}

Return JSON:
{
  "safe": true|false,
  "alerts": [{ "type": "DDI"|"allergy"|"dose"|"contraindication", "severity": "low"|"moderate"|"high"|"critical", "message": "...", "recommendation": "..." }],
  "formulary_alternatives": ["alternative1", "alternative2"],
  "overall_recommendation": "proceed"|"caution"|"do_not_prescribe"
}`

    const aiRes = await client.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.1 })
    const result = JSON.parse(aiRes.choices[0].message.content)
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── CDS: Drug-Drug Interaction checker (no patient required) ─────────────────
app.post('/api/cds/ddi-check', auth, aiLimiter, async (req, res) => {
  try {
    const { medications } = req.body
    if (!medications || !Array.isArray(medications) || medications.length < 2)
      return res.status(400).json({ error: 'Provide at least 2 medications as an array' })

    const prompt = `You are a clinical pharmacist AI. Analyze all pairwise drug-drug interactions between these medications.

Medications: ${medications.join(', ')}

Return JSON:
{
  "interactions": [
    {
      "drug_a": "name",
      "drug_b": "name",
      "severity": "none"|"minor"|"moderate"|"major"|"contraindicated",
      "mechanism": "brief mechanism",
      "clinical_effect": "what happens clinically",
      "management": "what the clinician should do"
    }
  ],
  "high_risk_pairs": ["drug_a + drug_b", ...],
  "overall_risk": "low"|"moderate"|"high"|"critical",
  "summary": "overall 1-2 sentence clinical summary"
}`

    const aiRes = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    })
    res.json(JSON.parse(aiRes.choices[0].message.content))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── CDS: Clinical guideline lookup ────────────────────────────────────────────
app.post('/api/cds/guidelines', auth, aiLimiter, async (req, res) => {
  try {
    const { condition, patient_context } = req.body
    if (!condition) return res.status(400).json({ error: 'condition required' })

    const prompt = `You are a clinical guidelines expert. Provide evidence-based management guidelines for the following condition.

Condition: ${condition}
${patient_context ? `Patient context: ${patient_context}` : ''}

Return JSON:
{
  "condition": "standardised condition name",
  "guideline_source": "e.g. AHA/ACC 2023, USPSTF 2022",
  "first_line_treatments": [{ "treatment": "name", "evidence_level": "A"|"B"|"C", "notes": "brief" }],
  "monitoring": ["what to monitor and how often"],
  "targets": [{ "parameter": "e.g. HbA1c", "target": "< 7%", "notes": "" }],
  "red_flags": ["list of warning signs requiring urgent escalation"],
  "patient_education": ["key points to tell the patient"],
  "follow_up": "recommended follow-up interval"
}`

    const aiRes = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    })
    res.json(JSON.parse(aiRes.choices[0].message.content))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── SDOH ──────────────────────────────────────────────────────────────────────

app.get('/api/sdoh', auth, async (req, res) => {
  try {
    const { patient_id } = req.query
    let sql = 'SELECT s.*, p.name as patient_name FROM sdoh_assessments s JOIN gen_patients p ON s.patient_id = p.id WHERE s.owner_email = ?'
    const args = [req.apiKey]
    if (patient_id) { sql += ' AND s.patient_id = ?'; args.push(patient_id) }
    sql += ' ORDER BY s.created_at DESC'
    res.json((await db.execute({ sql, args })).rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/sdoh', auth, async (req, res) => {
  try {
    const { patient_id, housing, food_security, transportation, financial_strain, social_isolation, education, employment, safety } = req.body
    if (!patient_id) return res.status(400).json({ error: 'patient_id required' })

    const id = randomUUID(); const now = new Date().toISOString()
    const answers = { housing, food_security, transportation, financial_strain, social_isolation, education, employment, safety }

    const prompt = `Map these SDOH screening responses to ICD-10 Z-codes and suggest community resources.

Responses: ${JSON.stringify(answers)}

Return JSON:
{
  "z_codes": ["Z59.x description", ...],
  "risk_domains": ["housing", "food", ...],
  "summary": "brief clinical summary of social needs",
  "resources": [{"category": "...", "name": "...", "action": "..."}],
  "priority": "low"|"moderate"|"high"
}`

    const aiRes = await client.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.2 })
    const ai = JSON.parse(aiRes.choices[0].message.content)

    await db.execute({
      sql: 'INSERT INTO sdoh_assessments (id, patient_id, owner_email, housing, food_security, transportation, financial_strain, social_isolation, education, employment, safety, z_codes, ai_summary, resources_suggested, status, assessed_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      args: [id, patient_id, req.apiKey, housing||null, food_security||null, transportation||null, financial_strain||null, social_isolation||null, education||null, employment||null, safety||null, JSON.stringify(ai.z_codes||[]), ai.summary||null, JSON.stringify(ai.resources||[]), 'active', now, now]
    })

    const saved = (await db.execute({ sql: 'SELECT * FROM sdoh_assessments WHERE id = ?', args: [id] })).rows[0]
    res.json({ ...saved, ai })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/sdoh/:id', auth, async (req, res) => {
  try {
    await db.execute({ sql: 'UPDATE sdoh_assessments SET status = COALESCE(?, status) WHERE id = ? AND owner_email = ?', args: [req.body.status || null, req.params.id, req.apiKey] })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── CHRONIC DISEASE MANAGEMENT ────────────────────────────────────────────────

app.post('/api/chronic-disease/analyze/:patientId', auth, aiLimiter, async (req, res) => {
  try {
    const patient = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE id = ? AND owner_email = ?', args: [req.params.patientId, req.apiKey] })).rows[0]
    if (!patient) return res.status(404).json({ error: 'Patient not found' })

    const labs = (await db.execute({ sql: 'SELECT * FROM lab_results WHERE patient_id = ? ORDER BY result_date DESC LIMIT 30', args: [req.params.patientId] })).rows
    let conds = []; let meds = []
    try { conds = JSON.parse(patient.conditions || '[]') } catch {}
    try { meds = JSON.parse(patient.medications || '[]') } catch {}

    const labStr = labs.map(l => `${l.test_name}: ${l.value} ${l.unit||''} (${l.interpretation||'N'}) ${l.result_date?.slice(0,10)}`).join('\n')

    const prompt = `You are a chronic disease management AI. Analyze this patient's data and generate a disease management report.

Patient: ${patient.name}, DOB: ${patient.dob}, Sex: ${patient.sex}
Conditions: ${conds.join(', ') || 'none documented'}
Medications: ${meds.join(', ') || 'none documented'}

Recent lab results:
${labStr || 'No labs available'}

Identify which chronic disease programs apply (Diabetes, Heart Failure, COPD, CKD, Hypertension) and analyze each.

Return JSON:
{
  "programs": [
    {
      "condition": "Diabetes"|"Heart Failure"|"COPD"|"CKD"|"Hypertension"|"Other",
      "status": "well_controlled"|"suboptimal"|"uncontrolled"|"at_risk",
      "key_metrics": [{"name": "...", "value": "...", "status": "ok"|"warning"|"critical"}],
      "alerts": [{"severity": "info"|"warning"|"critical", "message": "..."}],
      "recommendations": ["recommendation 1", "recommendation 2"],
      "next_actions": ["action 1", "action 2"],
      "goals": [{"goal": "...", "target": "...", "current": "...", "met": true|false}]
    }
  ],
  "overall_status": "stable"|"worsening"|"improving"|"critical",
  "priority_action": "most urgent thing to do now"
}`

    const aiRes = await client.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.2 })
    const result = JSON.parse(aiRes.choices[0].message.content)
    res.json({ ...result, patient_name: patient.name, generated_at: new Date().toISOString() })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── PATIENT PORTAL ────────────────────────────────────────────────────────────

app.get('/api/portal/intakes', auth, async (req, res) => {
  try {
    const { patient_id } = req.query
    let sql = 'SELECT pi.*, p.name as patient_name FROM portal_intakes pi JOIN gen_patients p ON pi.patient_id = p.id WHERE pi.owner_email = ?'
    const args = [req.apiKey]
    if (patient_id) { sql += ' AND pi.patient_id = ?'; args.push(patient_id) }
    sql += ' ORDER BY pi.created_at DESC'
    res.json((await db.execute({ sql, args })).rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/portal/intake', auth, async (req, res) => {
  try {
    const { patient_id, chief_complaint, symptoms, symptom_duration, pain_scale, phq9_answers, gad7_answers } = req.body
    if (!patient_id || !chief_complaint) return res.status(400).json({ error: 'patient_id and chief_complaint required' })

    const phq9Score = phq9_answers ? phq9_answers.reduce((s, v) => s + (parseInt(v) || 0), 0) : null
    const gad7Score = gad7_answers ? gad7_answers.reduce((s, v) => s + (parseInt(v) || 0), 0) : null

    const prompt = `You are a medical triage AI. Assess this patient intake and provide a triage recommendation.

Chief complaint: ${chief_complaint}
Symptoms: ${Array.isArray(symptoms) ? symptoms.join(', ') : (symptoms || 'not specified')}
Duration: ${symptom_duration || 'not specified'}
Pain scale: ${pain_scale != null ? pain_scale + '/10' : 'not rated'}
PHQ-9 score: ${phq9Score != null ? `${phq9Score}/27` : 'not completed'}
GAD-7 score: ${gad7Score != null ? `${gad7Score}/21` : 'not completed'}

Return JSON:
{
  "triage_level": "self_care"|"routine"|"urgent"|"emergency",
  "triage_color": "green"|"yellow"|"orange"|"red",
  "recommendation": "what the patient should do",
  "care_instructions": "brief self-care or pre-visit instructions",
  "red_flags": ["any concerning symptoms to watch for"],
  "mental_health_flag": true|false,
  "mental_health_note": "note if PHQ-9 or GAD-7 scores indicate concern or null"
}`

    const aiRes = await client.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.2 })
    const ai = JSON.parse(aiRes.choices[0].message.content)

    const id = randomUUID(); const now = new Date().toISOString()
    await db.execute({
      sql: 'INSERT INTO portal_intakes (id, patient_id, owner_email, chief_complaint, symptoms, symptom_duration, pain_scale, phq9_score, gad7_score, phq9_answers, gad7_answers, triage_level, ai_recommendation, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      args: [id, patient_id, req.apiKey, chief_complaint, JSON.stringify(symptoms||[]), symptom_duration||null, pain_scale||null, phq9Score, gad7Score, JSON.stringify(phq9_answers||[]), JSON.stringify(gad7_answers||[]), ai.triage_level, JSON.stringify(ai), now]
    })

    res.json({ id, ...ai, phq9_score: phq9Score, gad7_score: gad7Score })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Chatbot message endpoint
app.post('/api/portal/chat', auth, aiLimiter, async (req, res) => {
  try {
    const { message, context, patient_id } = req.body
    if (!message) return res.status(400).json({ error: 'message required' })

    let patientCtx = ''
    if (patient_id) {
      const p = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE id = ?', args: [patient_id] })).rows[0]
      if (p) {
        let conds = []; let meds = []
        try { conds = JSON.parse(p.conditions || '[]') } catch {}
        try { meds = JSON.parse(p.medications || '[]') } catch {}
        patientCtx = `Patient: ${p.name} | Conditions: ${conds.join(', ')||'none'} | Medications: ${meds.join(', ')||'none'}`
      }
    }

    const sysPrompt = `You are a helpful medical assistant AI for Vianova Health. You help patients understand their health, explain lab results in plain language, answer general health questions, and guide them on when to seek care.${patientCtx ? `\n${patientCtx}` : ''}
Rules: Never diagnose. Always recommend seeing a doctor for serious symptoms. Be warm, clear, and use plain language.`

    const history = Array.isArray(context) ? context.slice(-8) : []
    const messages = [{ role: 'system', content: sysPrompt }, ...history, { role: 'user', content: message }]

    const aiRes = await client.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages, temperature: 0.5, max_tokens: 400 })
    res.json({ reply: aiRes.choices[0].message.content })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── INTEROPERABILITY ──────────────────────────────────────────────────────────

// Complete patient record as structured bundle
app.get('/api/patients/:patientId/complete-record', auth, async (req, res) => {
  try {
    const patient = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE id = ? AND owner_email = ?', args: [req.params.patientId, req.apiKey] })).rows[0]
    if (!patient) return res.status(404).json({ error: 'Patient not found' })

    const [labs, gaps, appts, discharge, consents, sdoh, adverse, intakes] = await Promise.all([
      db.execute({ sql: 'SELECT * FROM lab_results WHERE patient_id = ? ORDER BY result_date DESC', args: [req.params.patientId] }),
      db.execute({ sql: 'SELECT * FROM care_gaps WHERE patient_id = ? ORDER BY created_at DESC', args: [req.params.patientId] }),
      db.execute({ sql: 'SELECT * FROM appointments WHERE patient_id = ? ORDER BY appointment_date DESC', args: [req.params.patientId] }),
      db.execute({ sql: 'SELECT * FROM discharge_summaries WHERE patient_id = ? ORDER BY created_at DESC', args: [req.params.patientId] }),
      db.execute({ sql: 'SELECT * FROM consents WHERE patient_id = ? ORDER BY created_at DESC', args: [req.params.patientId] }),
      db.execute({ sql: 'SELECT * FROM sdoh_assessments WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1', args: [req.params.patientId] }),
      db.execute({ sql: 'SELECT * FROM adverse_events WHERE patient_id = ? ORDER BY created_at DESC', args: [req.params.patientId] }),
      db.execute({ sql: 'SELECT * FROM portal_intakes WHERE patient_id = ? ORDER BY created_at DESC LIMIT 5', args: [req.params.patientId] }),
    ])

    res.json({
      patient,
      summary: {
        lab_results: labs.rows.length,
        care_gaps: gaps.rows.filter(g => g.status === 'open').length,
        appointments: appts.rows.filter(a => a.status === 'scheduled').length,
        adverse_events: adverse.rows.filter(a => a.status === 'open').length,
      },
      resources: {
        lab_results: labs.rows,
        care_gaps: gaps.rows,
        appointments: appts.rows,
        discharge_summaries: discharge.rows,
        consents: consents.rows,
        sdoh_assessment: sdoh.rows[0] || null,
        adverse_events: adverse.rows,
        portal_intakes: intakes.rows,
      },
      exported_at: new Date().toISOString()
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Terminology mapping
app.post('/api/terminology/map', auth, async (req, res) => {
  try {
    const { terms, target_system } = req.body
    if (!terms?.length) return res.status(400).json({ error: 'terms array required' })

    const prompt = `Map these clinical terms to standardized codes.
Terms: ${terms.join(', ')}
Target system: ${target_system || 'SNOMED CT, LOINC, and RxNorm as appropriate'}

Return JSON: { "mappings": [ { "original_term": "...", "code": "...", "display": "...", "system": "SNOMED CT"|"LOINC"|"RxNorm"|"ICD-10", "confidence": 0.0-1.0 } ] }`

    const aiRes = await client.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.1 })
    const result = JSON.parse(aiRes.choices[0].message.content)
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── AUDIT & COMPLIANCE ────────────────────────────────────────────────────────

app.get('/api/compliance/audit-log', auth, async (req, res) => {
  try {
    const { days = 30, patient_id } = req.query
    const since = new Date(Date.now() - days * 86400000).toISOString()
    let sql = 'SELECT * FROM audit_events WHERE owner_email = ? AND created_at >= ?'
    const args = [req.apiKey, since]
    if (patient_id) { sql += ' AND patient_id = ?'; args.push(patient_id) }
    sql += ' ORDER BY created_at DESC LIMIT 500'
    const rows = (await db.execute({ sql, args })).rows
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/compliance/analyze-audit', auth, aiLimiter, async (req, res) => {
  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString()
    const events = (await db.execute({ sql: 'SELECT action, resource_type, patient_id, created_at FROM audit_events WHERE owner_email = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 200', args: [req.apiKey, since] })).rows

    if (!events.length) return res.json({ anomalies: [], summary: 'No audit events in last 7 days.', risk_level: 'low' })

    const summary = events.reduce((acc, e) => { acc[e.action] = (acc[e.action]||0)+1; return acc }, {})

    const prompt = `Analyze these audit log events for anomalies, unusual patterns, or compliance concerns.

Event summary (last 7 days): ${JSON.stringify(summary)}
Total events: ${events.length}
Unique patients accessed: ${new Set(events.map(e => e.patient_id).filter(Boolean)).size}

Return JSON:
{
  "anomalies": [{"type": "...", "description": "...", "severity": "low"|"medium"|"high"}],
  "compliance_score": 0-100,
  "risk_level": "low"|"medium"|"high",
  "summary": "brief overall assessment",
  "recommendations": ["recommendation 1"]
}`

    const aiRes = await client.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.2 })
    const result = JSON.parse(aiRes.choices[0].message.content)
    res.json({ ...result, event_count: events.length, period_days: 7 })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/compliance/report', auth, async (req, res) => {
  try {
    const patients = (await db.execute({ sql: 'SELECT COUNT(*) as c FROM gen_patients WHERE owner_email = ?', args: [req.apiKey] })).rows[0]?.c || 0
    const consents = (await db.execute({ sql: "SELECT COUNT(*) as c FROM consents WHERE owner_email = ? AND status = 'active'", args: [req.apiKey] })).rows[0]?.c || 0
    const expiredConsents = (await db.execute({ sql: "SELECT COUNT(*) as c FROM consents WHERE owner_email = ? AND expires_at < ? AND status = 'active'", args: [req.apiKey, new Date().toISOString()] })).rows[0]?.c || 0
    const auditEvents7d = (await db.execute({ sql: 'SELECT COUNT(*) as c FROM audit_events WHERE owner_email = ? AND created_at >= ?', args: [req.apiKey, new Date(Date.now() - 7*86400000).toISOString()] })).rows[0]?.c || 0
    const openAdverse = (await db.execute({ sql: "SELECT COUNT(*) as c FROM adverse_events WHERE owner_email = ? AND status = 'open'", args: [req.apiKey] })).rows[0]?.c || 0
    const openCareGaps = (await db.execute({ sql: "SELECT COUNT(*) as c FROM care_gaps WHERE owner_email = ? AND status = 'open'", args: [req.apiKey] })).rows[0]?.c || 0

    res.json({
      generated_at: new Date().toISOString(),
      metrics: { patients, active_consents: consents, expired_consents: expiredConsents, audit_events_7d: auditEvents7d, open_adverse_events: openAdverse, open_care_gaps: openCareGaps },
      compliance_checks: [
        { check: 'Patient consent coverage', status: patients > 0 && consents >= patients * 0.8 ? 'pass' : 'review', detail: `${consents}/${patients} patients have active consent` },
        { check: 'Expired consents', status: expiredConsents === 0 ? 'pass' : 'fail', detail: `${expiredConsents} consents have expired` },
        { check: 'Adverse event tracking', status: openAdverse === 0 ? 'pass' : 'review', detail: `${openAdverse} open adverse events` },
        { check: 'Audit logging active', status: auditEvents7d > 0 ? 'pass' : 'review', detail: `${auditEvents7d} events logged in last 7 days` },
        { check: 'Care gap management', status: openCareGaps < 10 ? 'pass' : 'review', detail: `${openCareGaps} open care gaps` },
      ]
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Serve built frontend (whenever dist/ exists) ──────────────────────────────
const DIST = join(__dirname, '../dist')
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  // SPA fallback — let React Router handle all non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(DIST, 'index.html'))
    }
  })
}

// ── 404 for unknown API routes ────────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' })
})

// ── Global error handler — never leak stack traces to clients ─────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const id = randomUUID()
  console.error(`[${id}] Unhandled error on ${req.method} ${req.path}:`, err)
  logError('unhandled_exception', err.message, `${req.method} ${req.path}`, err.stack).catch(() => {})
  if (res.headersSent) return
  // In production never expose internal details
  const msg = IS_PROD ? `An unexpected error occurred (ref: ${id})` : err.message
  res.status(500).json({ error: msg })
})

async function start() {
  await initDB()
  await seed()
  await logUpdate('server_start', 'Vianova server started', { port: process.env.PORT || 3001 })
  const PORT = process.env.PORT || 3001
  app.listen(PORT, () => console.log(`\nVianova server running on :${PORT}\n`))
}
start().catch(err => { console.error('Fatal startup error:', err); process.exit(1) })
