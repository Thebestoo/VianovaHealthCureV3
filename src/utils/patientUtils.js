// ─── Patient data normalization, quality scoring, and CSV parsing ───────────

/** Format phone number to (XXX) XXX-XXXX or +1 (XXX) XXX-XXXX */
export function normalizePhone(raw) {
  if (!raw) return ''
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 10)
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits[0] === '1')
    return `+1 (${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`
  return raw.trim()
}

/** Title-case a name */
export function normalizeName(raw) {
  if (!raw) return ''
  return raw.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

/** Normalize date of birth to YYYY-MM-DD */
export function normalizeDOB(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // MM/DD/YYYY or M/D/YYYY
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m1) return `${m1[3]}-${m1[1].padStart(2,'0')}-${m1[2].padStart(2,'0')}`
  // DD-MM-YYYY (European)
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (m2) return `${m2[3]}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`
  // Try native Date as fallback
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return s
}

/** Compute a data quality score 0–100 */
export function computeQualityScore(p) {
  let score = 0
  if (p.name?.trim())    score += 20
  if (p.dob?.trim())     score += 15
  if (p.sex?.trim())     score += 10
  if (p.mrn?.trim())     score += 15
  if (p.phone?.trim())   score += 10
  if (p.email?.trim())   score += 5
  if (p.address?.trim()) score += 5
  if (toArr(p.conditions).length)  score += 10
  if (toArr(p.medications).length) score += 5
  if (toArr(p.allergies).length)   score += 5
  return Math.min(100, score)
}

/** Colour-coded tier for quality score */
export function qualityTier(score) {
  if (score >= 80) return { label: 'High',     color: '#059669', bg: '#d1fae5' }
  if (score >= 50) return { label: 'Moderate', color: '#d97706', bg: '#fef3c7' }
  return                  { label: 'Low',      color: '#dc2626', bg: '#fee2e2' }
}

/** All supported patient fields with human-readable labels */
export const PATIENT_FIELDS = [
  { key: 'name',        label: 'Full Name' },
  { key: 'dob',         label: 'Date of Birth' },
  { key: 'sex',         label: 'Biological Sex' },
  { key: 'mrn',         label: 'MRN / Patient ID' },
  { key: 'phone',       label: 'Phone' },
  { key: 'email',       label: 'Email' },
  { key: 'address',     label: 'Address' },
  { key: 'language',    label: 'Language' },
  { key: 'conditions',  label: 'Conditions' },
  { key: 'medications', label: 'Medications' },
  { key: 'allergies',   label: 'Allergies' },
  { key: 'notes',       label: 'Notes' },
]

// ── CSV parser (handles quoted fields) ──────────────────────────────────────

function parseLine(line) {
  const result = []
  let cur = '', inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuote = !inQuote
    } else if (c === ',' && !inQuote) {
      result.push(cur.trim()); cur = ''
    } else cur += c
  }
  result.push(cur.trim())
  return result
}

/** Parse CSV text → { headers, rows } */
export function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return { headers: [], rows: [] }
  const headers = parseLine(lines[0])
  const rows = lines.slice(1, 51).map(l => {  // cap at 50 preview rows
    const vals = parseLine(l)
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
  return { headers, rows }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function toArr(v) {
  if (!v) return []
  try {
    const r = typeof v === 'string' ? JSON.parse(v) : v
    return Array.isArray(r) ? r.filter(Boolean) : r ? [String(r)] : []
  } catch { return String(v).split(',').map(s => s.trim()).filter(Boolean) }
}
