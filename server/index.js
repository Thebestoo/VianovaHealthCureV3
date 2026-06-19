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
import { mkdirSync, existsSync } from 'fs'
import Groq from 'groq-sdk'
import bcrypt from 'bcryptjs'
import { sendEmail, tplNewCase, tplEmergencyAlert, tplCaseApproved, tplTreatmentEdited } from './mailer.js'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const { generateCasesReport } = require('./report.cjs')

const __dirname = dirname(fileURLToPath(import.meta.url))
const IS_PROD   = process.env.NODE_ENV === 'production'

// Use DATA_DIR env var if set (e.g. Railway volume), otherwise write next to server/
const DATA_DIR  = process.env.DATA_DIR || join(__dirname, '../data')
const DB_PATH   = join(DATA_DIR, 'vianova.db')
mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS cases (
    case_id       TEXT PRIMARY KEY,
    created_at    TEXT NOT NULL,
    patient_input TEXT NOT NULL,
    analysis      TEXT NOT NULL,
    owner_key     TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS keys (
    key        TEXT PRIMARY KEY,
    role       TEXT NOT NULL,
    label      TEXT NOT NULL,
    email      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    active     INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS updates_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata    TEXT,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS errors_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL,
    message     TEXT NOT NULL,
    stack       TEXT,
    route       TEXT,
    metadata    TEXT,
    created_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL,
    name       TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'doctor',
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS otp_codes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT NOT NULL,
    code       TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    user_email TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS gen_patients (
    id          TEXT PRIMARY KEY,
    owner_email TEXT NOT NULL,
    name        TEXT NOT NULL,
    dob         TEXT,
    sex         TEXT,
    mrn         TEXT,
    phone       TEXT,
    conditions  TEXT,
    medications TEXT,
    allergies   TEXT,
    fhir_vitals TEXT,
    notes       TEXT,
    created_at  TEXT NOT NULL
  );
`)

// ── migrations ────────────────────────────────────────────────────────────────
try { db.exec(`ALTER TABLE keys ADD COLUMN email TEXT NOT NULL DEFAULT ''`) } catch {}
try { db.exec(`ALTER TABLE cases ADD COLUMN follow_up_date TEXT`) } catch {}
try { db.exec(`ALTER TABLE cases ADD COLUMN share_token TEXT`) } catch {}
// notify_email: where OTPs and notifications are delivered
// (separate from login email so custom-domain accounts can use a real inbox)
try { db.exec(`ALTER TABLE users ADD COLUMN notify_email TEXT NOT NULL DEFAULT ''`) } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''`) } catch {}
try { db.exec(`ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`) } catch {}

const app = express()
app.use(cors())
app.use(express.json())

const client = new Groq({ apiKey: process.env.GROQ_API_KEY })

// ── DB helpers: cases ──────────────────────────────────────────────────────────
const insertCase     = db.prepare('INSERT INTO cases (case_id, created_at, patient_input, analysis, owner_key) VALUES (?, ?, ?, ?, ?)')
const updateAnalysis = db.prepare('UPDATE cases SET analysis = ?, follow_up_date = ? WHERE case_id = ?')
const getCase        = db.prepare('SELECT * FROM cases WHERE case_id = ?')
const listCases      = db.prepare('SELECT * FROM cases ORDER BY created_at DESC')
const listCasesByKey = db.prepare('SELECT * FROM cases WHERE owner_key = ? ORDER BY created_at DESC')

// ── ownership helper ───────────────────────────────────────────────────────────
function getCaseForKey(caseId, reqKey, reqRole) {
  if (reqRole === 'superadmin') return getCase.get(caseId)
  return db.prepare('SELECT * FROM cases WHERE case_id = ? AND owner_key = ?').get(caseId, reqKey)
}
function listCasesForKey(reqKey, reqRole) {
  if (reqRole === 'superadmin') return listCases.all()
  return listCasesByKey.all(reqKey)
}
function keyStats(apiKey, role) {
  const rows = role === 'superadmin'
    ? db.prepare('SELECT analysis, owner_key FROM cases').all()
    : db.prepare('SELECT analysis FROM cases WHERE owner_key = ?').all(apiKey)
  let total = rows.length, pending = 0, approved = 0, emergency = 0
  rows.forEach(r => {
    const a = JSON.parse(r.analysis)
    if (a.doctor_review?.approved) approved++
    else pending++
    if (a.red_flags?.emergency_detected) emergency++
  })
  // superadmin: also list distinct doctors
  let doctors = undefined
  if (role === 'superadmin') {
    const users = db.prepare('SELECT id, name, email, role FROM users WHERE active = 1').all()
    doctors = users.map(u => ({
      key: u.email,
      label: u.name,
      role: u.role,
      cases: rows.filter(r => r.owner_key === u.email).length
    }))
  }
  return { total, pending, approved, emergency, ...(doctors ? { doctors } : {}) }
}

// ── DB helpers: logs ───────────────────────────────────────────────────────────
const insertUpdate  = db.prepare('INSERT INTO updates_log (type, description, metadata, created_at) VALUES (?, ?, ?, ?)')
const insertError   = db.prepare('INSERT INTO errors_log (type, message, stack, route, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)')

function logUpdate(type, description, metadata = null) {
  insertUpdate.run(type, description, metadata ? JSON.stringify(metadata) : null, new Date().toISOString())
}
function logError(type, message, route = null, stack = null, metadata = null) {
  insertError.run(type, message, stack || null, route || null, metadata ? JSON.stringify(metadata) : null, new Date().toISOString())
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
function notifyAll(tpl, { skipEmail } = {}) {
  const users = db.prepare('SELECT email, notify_email FROM users WHERE active = 1').all()
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
function notifySystemError(errorMsg, route, submitterEmail) {
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
  const admins = db.prepare("SELECT email FROM users WHERE role = 'superadmin' AND active = 1").all()
  admins.forEach(u => { sendEmail({ to: u.email, ...tpl }).catch(() => {}) })
  // Also email the submitter if they're not a superadmin
  if (submitterEmail && !admins.find(u => u.email === submitterEmail)) {
    sendEmail({ to: submitterEmail, ...tpl }).catch(() => {})
  }
}

// ── new auth middleware ────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers['x-api-key'] || req.query.key
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token)
  if (!session || new Date(session.expires_at) < new Date()) return res.status(401).json({ error: 'Session expired' })
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id)
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
  return (req, res, next) => {
    // Try new session-based auth first
    const token = req.headers['x-api-key'] || req.query.key
    if (token) {
      const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token)
      if (session && new Date(session.expires_at) >= new Date()) {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id)
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
      const row = db.prepare('SELECT * FROM keys WHERE key = ? AND active = 1').get(token)
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
;(() => {
  const now = new Date().toISOString()
  // Set SUPERADMIN_PASSWORD env var on Render to auto-seed login password
  const seedPasswordHash = process.env.SUPERADMIN_PASSWORD
    ? bcrypt.hashSync(process.env.SUPERADMIN_PASSWORD, 10)
    : ''
  const upsertUser = db.prepare(`
    INSERT INTO users (id, email, name, role, active, status, password_hash, created_at) VALUES (?, ?, ?, ?, 1, 'active', ?, ?)
    ON CONFLICT(email) DO UPDATE SET name=excluded.name, role=excluded.role, active=1, status='active',
      password_hash = CASE WHEN users.password_hash = '' AND excluded.password_hash != '' THEN excluded.password_hash ELSE users.password_hash END
  `)

  // Hardcoded superadmins
  const superadmins = [
    { email: 'diar.azemi@outlook.com', name: 'Diar Azemi',    role: 'superadmin' },
    { email: 'emorina@vianova.ai',     name: 'Emorina Salihu', role: 'superadmin' },
  ]
  superadmins.forEach(u => {
    upsertUser.run(randomUUID(), u.email, u.name, u.role, seedPasswordHash, now)
  })

  // Doctors from env vars
  const docSlots = [
    { email: process.env.DOC_EMAIL_1, name: process.env.DOC_NAME_1 },
    { email: process.env.DOC_EMAIL_2, name: process.env.DOC_NAME_2 },
    { email: process.env.DOC_EMAIL_3, name: process.env.DOC_NAME_3 },
    { email: process.env.DOC_EMAIL_4, name: process.env.DOC_NAME_4 },
    { email: process.env.DOC_EMAIL_5, name: process.env.DOC_NAME_5 },
  ]
  docSlots.filter(d => d.email && d.name).forEach(d => {
    upsertUser.run(randomUUID(), d.email, d.name, 'doctor', '', now)
    console.log(`  DOCTOR: ${d.email} (${d.name})`)
  })

  console.log('\n  === Vianova Users ===')
  superadmins.forEach(u => console.log(`  SUPERADMIN: ${u.email}`))
  console.log()
})()

// ── GET /api/admin/keys — view all keys (protected by ADMIN_SECRET env var) ───
app.get('/api/admin/keys', (req, res) => {
  const secret = process.env.ADMIN_SECRET
  if (!secret || req.query.secret !== secret) {
    return res.status(403).json({ error: 'Forbidden — set ADMIN_SECRET env var and pass ?secret=YOUR_SECRET' })
  }
  const keys = db.prepare('SELECT key, role, label, email, active, created_at FROM keys ORDER BY created_at DESC').all()
  res.json({ keys })
})

// log server start
logUpdate('server_start', 'Vianova server started', { port: process.env.PORT || 3001 })

// ── system prompt ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the Cure Analyzer of Vianova Health — a clinical decision-support engine.
Your single mission: convert one patient's registration data and intake answers into a structured, evidence-grounded DRAFT clinical analysis and suggested treatment plan ("cure") that a licensed physician will review, edit, and approve before any of it reaches the patient.
You are an assistant to the doctor, never a replacement. You do not issue diagnoses, prescriptions, or final decisions. Every output is a draft pending mandatory human physician approval.

NON-NEGOTIABLE OPERATING PRINCIPLES:
1. Evidence from data only. Use only what the patient provided. Never invent symptoms, vitals, history, lab values, durations, medications, or allergies. If you infer something, label it as an inference, not a fact.
2. Gaps are flagged, never filled. Missing critical information goes in missing_critical_info. Do not guess to complete a picture.
3. Possibilities, not verdicts. Always produce a ranked differential. Never collapse to one certain diagnosis.
4. Emergencies first. If any red flag is present, set red_flags.emergency_detected = true and requires_urgent_review = true.
5. Conservative medication handling. For every drug suggestion: give option, rationale, and cautions; set requires_physician_verification: true. Never present a final dose as a patient instruction. Flag special populations (pediatric, pregnancy, breastfeeding, elderly, renal/hepatic impairment).
6. Safety cross-checks. Always check stated allergies and current medications for conflicts.
7. Honest uncertainty. Calibrate confidence_level. Thin or contradictory data => lower confidence.
8. No scope creep. Stay within clinical-support drafting.
9. Strict output. Return one valid JSON object and nothing else — no markdown, no fences, no commentary before or after.
10. Privacy posture. Treat all input as confidential health data.

LANGUAGE HANDLING:
- Input may arrive in Albanian (Kosovo dialect) or English, or a mix. Understand both.
- All structured/clinical fields for the doctor are in English.
- patient_summary_draft.text is written in the same language the patient used, in plain, calm, non-alarming wording.

RED-FLAG / EMERGENCY SCREEN: Set emergency if data suggests any of: chest pain with breathlessness/sweating/radiation; signs of stroke; severe or uncontrolled bleeding; difficulty breathing/stridor/blue lips; anaphylaxis; signs of sepsis; suicidal or self-harm intent; severe dehydration in infants/elderly; pregnancy with bleeding or severe abdominal pain; sudden severe abdominal pain; loss of consciousness; seizure; suspected poisoning/overdose.

MEDICATION SAFETY RULES:
- Prefer non-pharmacological and conservative options first.
- Always requires_physician_verification: true.
- Never state a definitive dose as instruction.
- Explicitly flag pediatric, pregnancy, breastfeeding, elderly, and renal/hepatic cases.

CONFIDENCE CALIBRATION:
- high: coherent, sufficient data; clear leading possibility.
- moderate: reasonable picture but with gaps or competing possibilities.
- low: sparse, vague, or contradictory data.

You receive one JSON object of patient data. Return EXACTLY this JSON structure (no markdown, no fences):
{
  "schema_version": "1.0",
  "status_note": "DRAFT — pending physician review. Not for patient use until approved.",
  "patient_snapshot": {
    "patient_id": null,
    "age": null,
    "sex": null,
    "known_allergies": [],
    "current_medications": [],
    "relevant_history": []
  },
  "data_completeness": {
    "missing_critical_info": [],
    "notes": ""
  },
  "presenting_complaint": "",
  "structured_symptoms": [
    { "symptom": "", "onset": "", "duration": "", "severity": "", "location": "", "source_answer": "" }
  ],
  "red_flags": {
    "emergency_detected": false,
    "indicators": [],
    "recommended_immediate_action": ""
  },
  "differential_assessment": [
    { "possibility": "", "likelihood": "high | moderate | low", "supporting_findings": [], "findings_against": [] }
  ],
  "recommended_investigations": [],
  "draft_treatment_plan": {
    "non_pharmacological": [],
    "pharmacological_suggestions": [
      {
        "option": "",
        "rationale": "",
        "physician_dose_consideration": "",
        "cautions": [],
        "special_population_flags": [],
        "requires_physician_verification": true
      }
    ],
    "lifestyle_and_followup": []
  },
  "allergy_interaction_check": {
    "potential_conflicts": [],
    "notes": ""
  },
  "patient_summary_draft": {
    "language": "",
    "text": ""
  },
  "confidence_level": "low | moderate | high",
  "reasoning_for_doctor": "",
  "requires_urgent_review": false,
  "doctor_review": {
    "status": "PENDING_REVIEW",
    "approved": false,
    "edited_by_doctor": false,
    "doctor_notes": "",
    "final_approved_cure": null,
    "reviewed_by": null,
    "reviewed_at": null
  },
  "audit": {
    "generated_by": "vianova-cure-analyzer",
    "is_ai_generated": true
  },
  "disclaimers": [
    "AI-generated and unverified. A draft for a licensed physician to review and edit.",
    "Not a diagnosis and not a prescription. Do not act on it until a doctor has approved it."
  ]
}`

// ── POST /api/analyze ──────────────────────────────────────────────────────────
app.post('/api/analyze', auth, async (req, res) => {
  try {
    const patientData = req.body
    const caseId = randomUUID()
    patientData.patient_id = patientData.patient_id || caseId

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
    insertCase.run(caseId, now, JSON.stringify(patientData), JSON.stringify(analysis), req.apiKey)

    const isEmergency = analysis.red_flags?.emergency_detected || analysis.requires_urgent_review
    logUpdate('case_submitted', `New case submitted by ${req.keyLabel} (${patientData.age || '?'}y ${patientData.sex || '?'})${isEmergency ? ' — EMERGENCY' : ''}`, {
      case_id: caseId,
      label: req.keyLabel,
      confidence: analysis.confidence_level,
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
      confidence: analysis.confidence_level,
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
app.get('/api/cases', auth, (req, res) => {
  const rows = listCasesForKey(req.apiKey, req.keyRole)
  const list = rows.map(row => {
    const patient  = JSON.parse(row.patient_input)
    const analysis = JSON.parse(row.analysis)
    return {
      case_id:              row.case_id,
      created_at:           row.created_at,
      age:                  patient?.age,
      sex:                  patient?.sex,
      presenting_complaint: analysis?.presenting_complaint,
      confidence_level:     analysis?.confidence_level,
      requires_urgent_review: analysis?.requires_urgent_review,
      emergency_detected:   analysis?.red_flags?.emergency_detected,
      review_status:        analysis?.doctor_review?.status,
      approved:             analysis?.doctor_review?.approved,
      follow_up_date:       row.follow_up_date || null,
      vitals:               patient?.vitals || [],
    }
  })
  res.json(list)
})

// ── GET /api/cases/:id ─────────────────────────────────────────────────────────
app.get('/api/cases/:id', auth, (req, res) => {
  const row = getCaseForKey(req.params.id, req.apiKey, req.keyRole)
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
app.patch('/api/cases/:id/review', auth, (req, res) => {
  const row = getCaseForKey(req.params.id, req.apiKey, req.keyRole)
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

  updateAnalysis.run(JSON.stringify(analysis), follow_up_date || row.follow_up_date || null, req.params.id)

  if (approved) {
    logUpdate('case_approved', `Case ${req.params.id.slice(0,8)} approved by ${reviewed_by || req.keyLabel}`, {
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
    logUpdate('treatment_edited', `Treatment plan edited for case ${req.params.id.slice(0,8)} by ${req.keyLabel}`, {
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
    logUpdate('notes_updated', `Doctor notes updated for case ${req.params.id.slice(0,8)} by ${req.keyLabel}`, {
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
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  const normalEmail = email.toLowerCase().trim()
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(normalEmail)
  if (!user) return res.status(401).json({ error: 'Invalid email or password' })
  if (user.status && user.status !== 'active') return res.status(401).json({ error: 'Account pending approval — contact admin' })
  if (!user.password_hash) return res.status(401).json({ error: 'No password set — contact admin' })
  const valid = bcrypt.compareSync(password, user.password_hash)
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' })
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  db.prepare('INSERT INTO sessions (token, user_id, user_email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(
    token, user.id, user.email, expiresAt, new Date().toISOString()
  )
  const displayName = user.role === 'doctor' ? `Dr. ${user.name}` : user.name
  logUpdate('auth_login', `${user.role} "${displayName}" signed in`, { email: user.email, role: user.role })
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
app.post('/api/auth/verify', (req, res) => {
  const { key } = req.body
  if (!key) return res.status(400).json({ error: 'Key required' })
  // Try session token
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(key)
  if (session && new Date(session.expires_at) >= new Date()) {
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(session.user_id)
    if (user) {
      const displayName = user.role === 'doctor' ? `Dr. ${user.name}` : user.name
      const stats = keyStats(user.email, user.role)
      return res.json({ role: user.role, label: displayName, stats, email: user.email })
    }
  }
  // Fall back to legacy key
  const row = db.prepare('SELECT * FROM keys WHERE key = ? AND active = 1').get(key)
  if (!row) return res.status(403).json({ error: 'Invalid or revoked key' })
  logUpdate('auth_login', `${row.role} key "${row.label}" connected`, { role: row.role, label: row.label })
  const stats = keyStats(key, row.role)
  res.json({ role: row.role, label: row.label, stats })
})

// ── GET /api/logs/updates ─────────────────────────────────────────────────────
// Superadmin: all update types. Doctor: all case-related updates for all doctors.
const CASE_UPDATE_TYPES = ['case_submitted','case_approved','case_reviewed','treatment_edited','notes_updated','email_sent']
app.get('/api/logs/updates', auth, (req, res) => {
  let rows
  if (req.keyRole === 'superadmin') {
    rows = db.prepare('SELECT * FROM updates_log ORDER BY created_at DESC LIMIT 500').all()
  } else {
    // Doctors see all case-related activity (not just their own) — no personal filter
    rows = db.prepare(
      `SELECT * FROM updates_log WHERE type IN (${CASE_UPDATE_TYPES.map(()=>'?').join(',')}) ORDER BY created_at DESC LIMIT 500`
    ).all(...CASE_UPDATE_TYPES)
  }
  const counts = {}
  rows.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1 })
  res.json({ total: rows.length, by_type: counts, items: rows.map(r => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })) })
})

// ── GET /api/logs/errors ──────────────────────────────────────────────────────
// Superadmin: all errors. Doctor: only case-submission failures (analyze_failed + email_failed).
const DOCTOR_ERROR_TYPES = ['analyze_failed', 'email_failed']
app.get('/api/logs/errors', auth, (req, res) => {
  let rows
  if (req.keyRole === 'superadmin') {
    rows = db.prepare('SELECT * FROM errors_log ORDER BY created_at DESC LIMIT 500').all()
  } else {
    rows = db.prepare(
      `SELECT * FROM errors_log WHERE type IN (${DOCTOR_ERROR_TYPES.map(()=>'?').join(',')}) ORDER BY created_at DESC LIMIT 200`
    ).all(...DOCTOR_ERROR_TYPES)
  }
  const counts = {}
  rows.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1 })
  res.json({ total: rows.length, by_type: counts, items: rows.map(r => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })) })
})

// ── GET /api/logs/errors/:id/report (superadmin only) ─────────────────────────
app.get('/api/logs/errors/:id/report', auth, requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM errors_log WHERE id = ?').get(req.params.id)
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
app.get('/api/logs/cases', auth, (req, res) => {
  const rows = listCasesForKey(req.apiKey, req.keyRole)
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
      confidence_level: analysis.confidence_level,
      emergency_detected: analysis.red_flags?.emergency_detected,
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
    if (c.confidence_level && byConfidence[c.confidence_level] !== undefined) byConfidence[c.confidence_level]++
  })
  res.json({ total: cases.length, by_status: byStatus, by_confidence: byConfidence, cases })
})

// ── GET /api/logs/cases/report ────────────────────────────────────────────────
app.get('/api/logs/cases/report', auth, (req, res) => {
  const rows = listCases.all()
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
      confidence_level:    analysis.confidence_level,
      emergency_detected:  analysis.red_flags?.emergency_detected,
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
    if (c.confidence_level && byConf[c.confidence_level] !== undefined) byConf[c.confidence_level]++
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
app.get('/api/logs/summary', auth, (req, res) => {
  const updates = db.prepare('SELECT COUNT(*) as c FROM updates_log').get().c
  const errors  = db.prepare('SELECT COUNT(*) as c FROM errors_log').get().c
  const stats   = keyStats(req.apiKey, req.keyRole)
  res.json({ updates, errors, cases: stats.total, stats, role: req.keyRole, label: req.keyLabel })
})

// ── GET /api/patients/timeline ────────────────────────────────────────────────
app.get('/api/patients/timeline', auth, (req, res) => {
  const q = String(req.query.q || '').trim()
  if (!q) return res.json([])
  const like = `%${q}%`
  const rows = req.keyRole === 'superadmin'
    ? db.prepare(`SELECT * FROM cases WHERE patient_input LIKE ? ORDER BY created_at ASC`).all(like)
    : db.prepare(`SELECT * FROM cases WHERE patient_input LIKE ? AND owner_key = ? ORDER BY created_at ASC`).all(like, req.apiKey)

  const items = rows.map(r => {
    let pi = {}, an = {}
    try { pi = JSON.parse(r.patient_input) } catch {}
    try { an = JSON.parse(r.analysis) } catch {}
    return {
      case_id: r.case_id,
      created_at: r.created_at,
      presenting_complaint: an.presenting_complaint || '',
      confidence_level: an.confidence_level || null,
      approved: !!an.doctor_review?.approved,
      emergency_detected: !!an.red_flags?.emergency_detected,
      follow_up_date: r.follow_up_date || null,
    }
  })
  res.json(items)
})

// ── GET /api/cases/:id/print ───────────────────────────────────────────────────
app.get('/api/cases/:id/print', auth, (req, res) => {
  const row = getCaseForKey(req.params.id, req.apiKey, req.keyRole)
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
app.post('/api/cases/:id/share', auth, (req, res) => {
  const row = getCaseForKey(req.params.id, req.apiKey, req.keyRole)
  if (!row) return res.status(404).json({ error: 'Not found or access denied' })
  let token = row.share_token
  if (!token) {
    token = randomBytes(16).toString('hex')
    db.prepare('UPDATE cases SET share_token = ? WHERE case_id = ?').run(token, req.params.id)
  }
  logUpdate('case_shared', `Share link generated for case ${req.params.id.slice(0,8)} by ${req.keyLabel}`, { case_id: req.params.id, label: req.keyLabel })
  res.json({ token, share_url: '/share/' + token })
})

// ── GET /api/share/:token — public read-only access ───────────────────────────
app.get('/api/share/:token', (req, res) => {
  const row = db.prepare('SELECT * FROM cases WHERE share_token = ?').get(req.params.token)
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
app.get('/api/admin/users', auth, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, email, notify_email, name, role, active, status, password_hash, created_at FROM users ORDER BY created_at DESC').all()
  res.json({
    users: users.map(u => ({
      ...u,
      has_password: !!u.password_hash,
      password_hash: undefined,
    }))
  })
})

app.post('/api/admin/users', auth, requireAdmin, (req, res) => {
  const { email, name, role = 'doctor', password } = req.body
  if (!email || !name) return res.status(400).json({ error: 'email and name required' })
  const normalEmail = email.toLowerCase().trim()
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalEmail)
  const passwordHash = password ? bcrypt.hashSync(password, 10) : ''
  if (existing) {
    db.prepare('UPDATE users SET name = ?, role = ?, active = 1 WHERE email = ?').run(name, role, normalEmail)
    res.json({ id: existing.id })
  } else {
    const id = randomUUID()
    db.prepare('INSERT INTO users (id, email, name, role, active, status, password_hash, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)').run(
      id, normalEmail, name, role, 'pending', passwordHash, new Date().toISOString()
    )
    res.json({ id })
  }
})

app.patch('/api/admin/users/:id', auth, requireAdmin, async (req, res) => {
  const { active, name, role, notify_email, password, status } = req.body
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const newName        = name         !== undefined ? name         : user.name
  const newRole        = role         !== undefined ? role         : user.role
  const newActive      = active       !== undefined ? (active ? 1 : 0) : user.active
  const newNotifyEmail = notify_email !== undefined ? notify_email.toLowerCase().trim() : (user.notify_email || '')
  const newStatus      = status       !== undefined ? status       : (user.status || 'active')
  const newPasswordHash = password    !== undefined ? bcrypt.hashSync(password, 10) : user.password_hash

  db.prepare('UPDATE users SET name = ?, role = ?, active = ?, notify_email = ?, status = ?, password_hash = ? WHERE id = ?')
    .run(newName, newRole, newActive, newNotifyEmail, newStatus, newPasswordHash, req.params.id)

  // Deactivation: if active changed from 1 to 0, export CSV and notify
  if (user.active === 1 && newActive === 0) {
    try {
      // Fetch all cases for this user
      const cases = db.prepare('SELECT * FROM cases WHERE owner_key = ? ORDER BY created_at ASC').all(user.email)
      const sessionCount = db.prepare('SELECT COUNT(*) as c FROM sessions WHERE user_id = ?').get(req.params.id)?.c || 0
      const otpCount = db.prepare('SELECT COUNT(*) as c FROM otp_codes WHERE email = ?').get(user.email)?.c || 0

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
          confidence = an.confidence_level || ''
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
      const admins = db.prepare("SELECT email, notify_email FROM users WHERE role = 'superadmin' AND active = 1").all()
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
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id)
    } catch (err) {
      console.error('Deactivation export error:', err.message)
    }
  }

  res.json({ ok: true })
})

app.post('/api/admin/users/:id/approve', auth, requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(req.params.id)
  res.json({ ok: true })
})

app.post('/api/admin/users/:id/set-password', auth, requireAdmin, (req, res) => {
  const { password } = req.body
  if (!password) return res.status(400).json({ error: 'password required' })
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  const hash = bcrypt.hashSync(password, 10)
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id)
  res.json({ ok: true })
})

app.delete('/api/admin/users/:id', auth, requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.params.id)
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ── gen_patients routes ────────────────────────────────────────────────────────
app.get('/api/gen-patients', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM gen_patients WHERE owner_email = ? ORDER BY name').all(req.apiKey)
  res.json({ patients: rows })
})

app.post('/api/gen-patients', auth, (req, res) => {
  const { name, dob, sex, mrn, phone, conditions, medications, allergies, fhir_vitals, notes } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const id = randomUUID()
  db.prepare(`INSERT INTO gen_patients
    (id, owner_email, name, dob, sex, mrn, phone, conditions, medications, allergies, fhir_vitals, notes, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, req.apiKey, name, dob||null, sex||null, mrn||null, phone||null,
    conditions||null, medications||null, allergies||null, fhir_vitals||null, notes||null,
    new Date().toISOString()
  )
  res.json({ id })
})

app.put('/api/gen-patients/:id', auth, (req, res) => {
  const existing = db.prepare('SELECT * FROM gen_patients WHERE id = ? AND owner_email = ?').get(req.params.id, req.apiKey)
  if (!existing) return res.status(404).json({ error: 'Not found or access denied' })
  const { name, dob, sex, mrn, phone, conditions, medications, allergies, fhir_vitals, notes } = req.body
  db.prepare(`UPDATE gen_patients SET
    name=?, dob=?, sex=?, mrn=?, phone=?, conditions=?, medications=?, allergies=?, fhir_vitals=?, notes=?
    WHERE id=? AND owner_email=?`).run(
    name||existing.name, dob??existing.dob, sex??existing.sex, mrn??existing.mrn,
    phone??existing.phone, conditions??existing.conditions, medications??existing.medications,
    allergies??existing.allergies, fhir_vitals??existing.fhir_vitals, notes??existing.notes,
    req.params.id, req.apiKey
  )
  res.json({ ok: true })
})

app.delete('/api/gen-patients/:id', auth, (req, res) => {
  const existing = db.prepare('SELECT * FROM gen_patients WHERE id = ? AND owner_email = ?').get(req.params.id, req.apiKey)
  if (!existing) return res.status(404).json({ error: 'Not found or access denied' })
  db.prepare('DELETE FROM gen_patients WHERE id = ? AND owner_email = ?').run(req.params.id, req.apiKey)
  res.json({ ok: true })
})

// ── RPM & CCM tables (migrations) ─────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS rpm_patients (
    id         TEXT PRIMARY KEY,
    owner_key  TEXT NOT NULL,
    name       TEXT NOT NULL,
    dob        TEXT,
    condition  TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rpm_readings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id   TEXT NOT NULL,
    owner_key    TEXT NOT NULL,
    heart_rate   REAL,
    spo2         REAL,
    systolic_bp  REAL,
    diastolic_bp REAL,
    temperature  REAL,
    resp_rate    REAL,
    note         TEXT,
    recorded_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ccm_patients (
    id           TEXT PRIMARY KEY,
    owner_key    TEXT NOT NULL,
    name         TEXT NOT NULL,
    dob          TEXT,
    phone        TEXT,
    condition    TEXT,
    insurance    TEXT,
    care_manager TEXT,
    status       TEXT NOT NULL DEFAULT 'active',
    created_at   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ccm_care_plans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT NOT NULL UNIQUE,
    owner_key  TEXT NOT NULL,
    tasks      TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ccm_checkins (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id TEXT NOT NULL,
    owner_key  TEXT NOT NULL,
    minutes    INTEGER,
    notes      TEXT,
    barriers   TEXT,
    plan_update TEXT,
    created_at TEXT NOT NULL
  );
`)

// ── RPM routes ─────────────────────────────────────────────────────────────────
app.get('/api/rpm/patients', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM rpm_patients WHERE owner_key = ? ORDER BY name').all(req.apiKey)
  res.json({ patients: rows })
})

app.post('/api/rpm/patients', auth, (req, res) => {
  const { name, dob, condition } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const id = randomUUID()
  db.prepare('INSERT INTO rpm_patients (id, owner_key, name, dob, condition, created_at) VALUES (?,?,?,?,?,?)').run(
    id, req.apiKey, name, dob || null, condition || null, new Date().toISOString()
  )
  res.json({ id })
})

app.get('/api/rpm/patients/:pid/readings', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM rpm_readings WHERE patient_id = ? AND owner_key = ? ORDER BY recorded_at DESC').all(req.params.pid, req.apiKey)
  res.json({ readings: rows })
})

app.post('/api/rpm/patients/:pid/readings', auth, (req, res) => {
  const { heart_rate, spo2, systolic_bp, diastolic_bp, temperature, resp_rate, note } = req.body
  db.prepare(`INSERT INTO rpm_readings (patient_id, owner_key, heart_rate, spo2, systolic_bp, diastolic_bp, temperature, resp_rate, note, recorded_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    req.params.pid, req.apiKey,
    heart_rate || null, spo2 || null, systolic_bp || null, diastolic_bp || null,
    temperature || null, resp_rate || null, note || null,
    new Date().toISOString()
  )
  res.json({ ok: true })
})

// ── CCM routes ─────────────────────────────────────────────────────────────────
app.get('/api/ccm/patients', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM ccm_patients WHERE owner_key = ? ORDER BY name').all(req.apiKey)
  res.json({ patients: rows })
})

app.post('/api/ccm/patients', auth, (req, res) => {
  const { name, dob, phone, condition, insurance, care_manager } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  const id = randomUUID()
  db.prepare(`INSERT INTO ccm_patients (id, owner_key, name, dob, phone, condition, insurance, care_manager, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
    id, req.apiKey, name, dob || null, phone || null,
    condition || null, insurance || null, care_manager || null, new Date().toISOString()
  )
  res.json({ id })
})

app.get('/api/ccm/patients/:pid/plan', auth, (req, res) => {
  const plan = db.prepare('SELECT * FROM ccm_care_plans WHERE patient_id = ? AND owner_key = ?').get(req.params.pid, req.apiKey)
  res.json({ plan: plan || null })
})

app.post('/api/ccm/patients/:pid/plan', auth, (req, res) => {
  const { tasks } = req.body
  db.prepare(`INSERT INTO ccm_care_plans (patient_id, owner_key, tasks, updated_at) VALUES (?,?,?,?)
    ON CONFLICT(patient_id) DO UPDATE SET tasks=excluded.tasks, updated_at=excluded.updated_at`).run(
    req.params.pid, req.apiKey, tasks || '[]', new Date().toISOString()
  )
  res.json({ ok: true })
})

app.get('/api/ccm/patients/:pid/checkins', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM ccm_checkins WHERE patient_id = ? AND owner_key = ? ORDER BY created_at DESC').all(req.params.pid, req.apiKey)
  res.json({ checkins: rows })
})

app.post('/api/ccm/patients/:pid/checkins', auth, (req, res) => {
  const { minutes, notes, barriers, plan_update } = req.body
  db.prepare(`INSERT INTO ccm_checkins (patient_id, owner_key, minutes, notes, barriers, plan_update, created_at) VALUES (?,?,?,?,?,?,?)`).run(
    req.params.pid, req.apiKey, minutes || null, notes || null, barriers || null, plan_update || null, new Date().toISOString()
  )
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

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Vianova server running on port ${PORT}`)
  logUpdate('server_start', `Vianova server started (${IS_PROD ? 'production' : 'dev'})`, { port: PORT })
})
