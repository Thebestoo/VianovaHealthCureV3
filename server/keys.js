#!/usr/bin/env node
/**
 * Vianova Health — Key Management CLI
 *
 * Usage:
 *   node server/keys.js generate dev   "Dev Team Key"
 *   node server/keys.js generate doctor "Dr. Smith Key"
 *   node server/keys.js email <key> <email@example.com>
 *   node server/keys.js list
 *   node server/keys.js revoke <key>
 *   node server/keys.js activate <key>
 */

import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { randomBytes } from 'crypto'
import { mkdirSync } from 'fs'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '../data/vianova.db')
mkdirSync(join(__dirname, '../data'), { recursive: true })

const db = new Database(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS keys (
    key        TEXT PRIMARY KEY,
    role       TEXT NOT NULL,
    label      TEXT NOT NULL,
    email      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    active     INTEGER NOT NULL DEFAULT 1
  );
`)

// migrate: add email column if it doesn't exist
try { db.exec(`ALTER TABLE keys ADD COLUMN email TEXT NOT NULL DEFAULT ''`) } catch {}

const [,, command, ...args] = process.argv

const RESET  = '\x1b[0m'
const GREEN  = '\x1b[32m'
const RED    = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN   = '\x1b[36m'
const BOLD   = '\x1b[1m'
const DIM    = '\x1b[2m'

function header() {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════╗${RESET}`)
  console.log(`${BOLD}${CYAN}║   Vianova Health — Key Manager           ║${RESET}`)
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════╝${RESET}\n`)
}

function listKeys() {
  header()
  const rows = db.prepare('SELECT * FROM keys ORDER BY created_at DESC').all()
  if (rows.length === 0) {
    console.log(`${YELLOW}  No keys found. Generate one with:${RESET}`)
    console.log(`  node server/keys.js generate dev "My Dev Key"\n`)
    return
  }

  rows.forEach(r => {
    const status = r.active ? `${GREEN}active${RESET}` : `${RED}revoked${RESET}`
    const role   = r.role === 'dev' ? `${CYAN}dev${RESET}` : `${YELLOW}doctor${RESET}`
    console.log(`  ${DIM}${r.key}${RESET}`)
    console.log(`  ${role}  ${status}  ${BOLD}${r.label}${RESET}  ${r.email ? `<${r.email}>` : `${RED}no email set${RESET}`}`)
    console.log(`  ${DIM}Created: ${r.created_at}${RESET}\n`)
  })
}

function generateKey(role, label) {
  if (!['dev', 'doctor'].includes(role)) {
    console.error(`${RED}Error: role must be "dev" or "doctor"${RESET}`)
    process.exit(1)
  }
  const key = `vnh_${role === 'dev' ? 'dev' : 'doc'}_${randomBytes(20).toString('hex')}`
  const now = new Date().toISOString()
  db.prepare('INSERT INTO keys (key, role, label, created_at) VALUES (?, ?, ?, ?)').run(key, role, label || `${role} key`, now)

  header()
  console.log(`${GREEN}${BOLD}  Key generated successfully!${RESET}\n`)
  console.log(`  ${BOLD}Role  :${RESET} ${role === 'dev' ? `${CYAN}Dev Team${RESET}` : `${YELLOW}Doctor Team${RESET}`}`)
  console.log(`  ${BOLD}Label :${RESET} ${label || role + ' key'}`)
  console.log(`  ${BOLD}Key   :${RESET} ${BOLD}${key}${RESET}`)
  console.log(`\n  ${YELLOW}Tip: set the notification email:${RESET}`)
  console.log(`  ${DIM}node server/keys.js email ${key} doctor@example.com${RESET}\n`)
}

function setEmail(key, email) {
  const row = db.prepare('SELECT * FROM keys WHERE key = ?').get(key)
  if (!row) { console.error(`${RED}Key not found.${RESET}`); process.exit(1) }
  db.prepare('UPDATE keys SET email = ? WHERE key = ?').run(email, key)
  header()
  console.log(`${GREEN}${BOLD}  Email set!${RESET}`)
  console.log(`  ${BOLD}Key   :${RESET} ${key}`)
  console.log(`  ${BOLD}Label :${RESET} ${row.label}`)
  console.log(`  ${BOLD}Email :${RESET} ${email}\n`)
}

function revokeKey(key) {
  const row = db.prepare('SELECT * FROM keys WHERE key = ?').get(key)
  if (!row) { console.error(`${RED}Key not found.${RESET}`); process.exit(1) }
  db.prepare('UPDATE keys SET active = 0 WHERE key = ?').run(key)
  header()
  console.log(`${RED}${BOLD}  Key revoked: ${key}${RESET}`)
  console.log(`  ${DIM}Label: ${row.label} | Role: ${row.role}${RESET}\n`)
}

function activateKey(key) {
  const row = db.prepare('SELECT * FROM keys WHERE key = ?').get(key)
  if (!row) { console.error(`${RED}Key not found.${RESET}`); process.exit(1) }
  db.prepare('UPDATE keys SET active = 1 WHERE key = ?').run(key)
  header()
  console.log(`${GREEN}${BOLD}  Key re-activated: ${key}${RESET}`)
  console.log(`  ${DIM}Label: ${row.label} | Role: ${row.role}${RESET}\n`)
}

function showHelp() {
  header()
  console.log(`  ${BOLD}Commands:${RESET}`)
  console.log(`  ${CYAN}generate <role> [label]${RESET}       — Generate a new key (role: dev | doctor)`)
  console.log(`  ${CYAN}email <key> <address>${RESET}         — Set notification email for a key`)
  console.log(`  ${CYAN}list${RESET}                          — List all keys and their status`)
  console.log(`  ${CYAN}revoke <key>${RESET}                  — Revoke (disable) a key`)
  console.log(`  ${CYAN}activate <key>${RESET}                — Re-activate a revoked key`)
  console.log()
  console.log(`  ${BOLD}Examples:${RESET}`)
  console.log(`  ${DIM}node server/keys.js generate dev "Main Dev Team"${RESET}`)
  console.log(`  ${DIM}node server/keys.js generate doctor "Dr. Azemi"${RESET}`)
  console.log(`  ${DIM}node server/keys.js email vnh_doc_abc123... dr.azemi@hospital.com${RESET}`)
  console.log(`  ${DIM}node server/keys.js list${RESET}\n`)
}

switch (command) {
  case 'generate': generateKey(args[0], args.slice(1).join(' ')); break
  case 'email':    setEmail(args[0], args[1]); break
  case 'list':     listKeys(); break
  case 'revoke':   revokeKey(args[0]); break
  case 'activate': activateKey(args[0]); break
  default:         showHelp()
}
