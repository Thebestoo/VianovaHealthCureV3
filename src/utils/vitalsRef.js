// Single source of truth for vitals reference ranges — shared by RPM.jsx (roster
// triage dots, detail charts, table coloring) and the CCM Care Plan Panel's Vitals
// section, so "normal"/"critical" bounds can't silently drift between the two pages.
export const VITALS_REF = [
  { key: 'heart_rate',   label: 'Heart Rate',   unit: 'bpm',  normal: [60, 100],     critical: [40, 130] },
  { key: 'spo2',         label: 'SpO2',         unit: '%',    normal: [95, 100],     critical: [90, 100] },
  { key: 'systolic_bp',  label: 'Systolic BP',  unit: 'mmHg', normal: [90, 140],     critical: [70, 180] },
  { key: 'diastolic_bp', label: 'Diastolic BP', unit: 'mmHg', normal: [60, 90],      critical: [40, 120] },
  { key: 'temperature',  label: 'Temperature',  unit: '°C',   normal: [36.1, 37.5],  critical: [35, 39] },
  { key: 'resp_rate',    label: 'Resp. Rate',   unit: '/min', normal: [12, 20],      critical: [8, 30] },
]

// LOINC codes per vital, reused when mapping an rpm_readings row into FHIR
// Observation resources (see utils/toFhir.js) — keeps the reading→FHIR mapping
// in sync with the same key set this file already governs.
export const VITAL_LOINC = {
  heart_rate:   '8867-4',
  spo2:         '2708-6',
  systolic_bp:  '8480-6',
  diastolic_bp: '8462-4',
  temperature:  '8310-5',
  resp_rate:    '9279-1',
}

export function vitalStatus(key, val) {
  const cfg = VITALS_REF.find(v => v.key === key)
  if (!cfg || val === '' || val === null || val === undefined) return 'normal'
  const n = parseFloat(val)
  if (Number.isNaN(n)) return 'normal'
  if (n < cfg.critical[0] || n > cfg.critical[1]) return 'critical'
  if (n < cfg.normal[0]   || n > cfg.normal[1])   return 'warning'
  return 'normal'
}

// Worst status across every tracked vital in a single reading.
export function worstVitalStatus(reading) {
  if (!reading) return 'none'
  let worst = 'normal'
  for (const cfg of VITALS_REF) {
    const s = vitalStatus(cfg.key, reading[cfg.key])
    if (s === 'critical') return 'critical'
    if (s === 'warning') worst = 'warning'
  }
  return worst
}
