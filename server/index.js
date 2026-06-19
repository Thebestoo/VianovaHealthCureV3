import 'dotenv/config'
import { setDefaultResultOrder } from 'dns'
// Force IPv4 DNS resolution — Render's network blocks outbound IPv6 (ENETUNREACH)
setDefaultResultOrder('ipv4first')
import express from 'express'
import cors from 'cors'
import { randomUUID, randomBytes } from 'crypto'
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
  ]
  for (const sql of stmts) {
    await db.execute({ sql, args: [] })
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
  ]
  for (const sql of migrations) {
    try { await db.execute({ sql, args: [] }) } catch {}
  }
}

const app = express()
app.use(cors())
app.use(express.json())

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
app.post('/api/analyze', auth, async (req, res) => {
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
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  const normalEmail = email.toLowerCase().trim()
  const user = (await db.execute({ sql: 'SELECT * FROM users WHERE email = ? AND active = 1', args: [normalEmail] })).rows[0]
  if (!user) return res.status(401).json({ error: 'Invalid email or password' })
  if (user.status && user.status !== 'active') return res.status(401).json({ error: 'Account pending approval — contact admin' })
  if (!user.password_hash) return res.status(401).json({ error: 'No password set — contact admin' })
  const valid = bcrypt.compareSync(password, user.password_hash)
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' })
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  await db.execute({ sql: 'INSERT INTO sessions (token, user_id, user_email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)', args: [token, user.id, user.email, expiresAt, new Date().toISOString()] })
  const displayName = user.role === 'doctor' ? `Dr. ${user.name}` : user.name
  await logUpdate('auth_login', `${user.role} "${displayName}" signed in`, { email: user.email, role: user.role })
  res.json({ token, role: user.role, label: displayName, email: user.email })
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

// ── gen_patients routes ────────────────────────────────────────────────────────
app.get('/api/gen-patients', auth, async (req, res) => {
  const rows = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE owner_email = ? ORDER BY name', args: [req.apiKey] })).rows
  res.json({ patients: rows })
})

app.post('/api/gen-patients', auth, async (req, res) => {
  const { name, dob, sex, mrn, phone, conditions, medications, allergies, fhir_vitals, notes } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const id = randomUUID()
  await db.execute({
    sql: `INSERT INTO gen_patients (id, owner_email, name, dob, sex, mrn, phone, conditions, medications, allergies, fhir_vitals, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [id, req.apiKey, name, dob||null, sex||null, mrn||null, phone||null, conditions||null, medications||null, allergies||null, fhir_vitals||null, notes||null, new Date().toISOString()]
  })
  res.json({ id })
})

app.put('/api/gen-patients/:id', auth, async (req, res) => {
  const existing = (await db.execute({ sql: 'SELECT * FROM gen_patients WHERE id = ? AND owner_email = ?', args: [req.params.id, req.apiKey] })).rows[0]
  if (!existing) return res.status(404).json({ error: 'Not found or access denied' })
  const { name, dob, sex, mrn, phone, conditions, medications, allergies, fhir_vitals, notes } = req.body
  await db.execute({
    sql: `UPDATE gen_patients SET name=?, dob=?, sex=?, mrn=?, phone=?, conditions=?, medications=?, allergies=?, fhir_vitals=?, notes=? WHERE id=? AND owner_email=?`,
    args: [name||existing.name, dob??existing.dob, sex??existing.sex, mrn??existing.mrn, phone??existing.phone, conditions??existing.conditions, medications??existing.medications, allergies??existing.allergies, fhir_vitals??existing.fhir_vitals, notes??existing.notes, req.params.id, req.apiKey]
  })
  res.json({ ok: true })
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

async function start() {
  await initDB()
  await seed()
  await logUpdate('server_start', 'Vianova server started', { port: process.env.PORT || 3001 })
  const PORT = process.env.PORT || 3001
  app.listen(PORT, () => console.log(`\nVianova server running on :${PORT}\n`))
}
start().catch(err => { console.error('Fatal startup error:', err); process.exit(1) })
