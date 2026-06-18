/**
 * NEWS2 — National Early Warning Score 2
 * Royal College of Physicians standard, widely used in hospitals.
 * Calculated from FHIR vitals imported into a case.
 */

export function calcNEWS2(vitals = [], onSupplementalO2 = false) {
  const find = (name) => {
    const v = vitals.find(v => v.name === name)
    if (!v) return null
    const num = parseFloat(String(v.value).replace(/[^\d.]/g, ''))
    return isNaN(num) ? null : num
  }

  const rr   = find('Respiratory rate')
  const spo2 = find('Oxygen saturation')
  const temp = find('Body temperature')
  const hr   = find('Heart rate')
  // BP stored as "134/82" — extract systolic
  const bpRaw = vitals.find(v => v.name === 'Blood pressure')
  const sbp   = bpRaw ? parseFloat(String(bpRaw.value).split('/')[0]) : null

  const scores = {}
  let total = 0
  let available = 0

  // Respiratory rate
  if (rr !== null) {
    available++
    let s = 0
    if      (rr <= 8)  s = 3
    else if (rr <= 11) s = 1
    else if (rr <= 20) s = 0
    else if (rr <= 24) s = 2
    else               s = 3
    scores.rr = s; total += s
  }

  // SpO2 (Scale 1 — not on supplemental O2 for COPD)
  if (spo2 !== null) {
    available++
    let s = 0
    if      (spo2 <= 91) s = 3
    else if (spo2 <= 93) s = 2
    else if (spo2 <= 95) s = 1
    else                 s = 0
    scores.spo2 = s; total += s
  }

  // Supplemental O2
  if (onSupplementalO2) { scores.o2 = 2; total += 2 }
  else scores.o2 = 0

  // Temperature
  if (temp !== null) {
    available++
    let s = 0
    if      (temp <= 35.0) s = 3
    else if (temp <= 36.0) s = 1
    else if (temp <= 38.0) s = 0
    else if (temp <= 39.0) s = 1
    else                   s = 2
    scores.temp = s; total += s
  }

  // Systolic BP
  if (sbp !== null) {
    available++
    let s = 0
    if      (sbp <= 90)  s = 3
    else if (sbp <= 100) s = 2
    else if (sbp <= 110) s = 1
    else if (sbp <= 219) s = 0
    else                 s = 3
    scores.sbp = s; total += s
  }

  // Heart rate
  if (hr !== null) {
    available++
    let s = 0
    if      (hr <= 40)  s = 3
    else if (hr <= 50)  s = 1
    else if (hr <= 90)  s = 0
    else if (hr <= 110) s = 1
    else if (hr <= 130) s = 2
    else                s = 3
    scores.hr = s; total += s
  }

  // Consciousness — default Alert (0) unless AI flagged altered
  scores.consciousness = 0

  if (available === 0) return null

  let risk, color, bg, description
  if      (total <= 0) { risk = 'Low';          color = '#059669'; bg = '#d1fae5'; description = 'Routine monitoring' }
  else if (total <= 4) { risk = 'Low–Medium';   color = '#d97706'; bg = '#fef3c7'; description = 'Increase monitoring frequency' }
  else if (total <= 6) { risk = 'Medium';        color = '#ea580c'; bg = '#ffedd5'; description = 'Urgent clinical review' }
  else                 { risk = 'High';           color = '#dc2626'; bg = '#fee2e2'; description = 'Emergency — immediate clinical review' }

  return { total, risk, color, bg, description, scores, available }
}

/**
 * Flag individual vitals that are outside normal ranges.
 */
export function flagVitals(vitals = []) {
  const flags = []

  vitals.forEach(v => {
    const num = parseFloat(String(v.value).replace(/[^\d.]/g, ''))
    if (isNaN(num)) return

    if (v.name === 'Heart rate') {
      if (num > 100) flags.push({ vital: 'Heart Rate', value: `${num} bpm`, message: 'Tachycardia', severity: num > 130 ? 'critical' : 'warning' })
      if (num < 60)  flags.push({ vital: 'Heart Rate', value: `${num} bpm`, message: 'Bradycardia', severity: num < 40  ? 'critical' : 'warning' })
    }
    if (v.name === 'Blood pressure') {
      const [sys, dia] = String(v.value).split('/').map(Number)
      if (sys > 140) flags.push({ vital: 'Blood Pressure', value: `${v.value} mmHg`, message: sys > 180 ? 'Hypertensive crisis' : 'Hypertension', severity: sys > 180 ? 'critical' : 'warning' })
      if (sys < 90)  flags.push({ vital: 'Blood Pressure', value: `${v.value} mmHg`, message: 'Hypotension', severity: sys < 70  ? 'critical' : 'warning' })
    }
    if (v.name === 'Oxygen saturation') {
      if (num < 95) flags.push({ vital: 'SpO₂', value: `${num}%`, message: num < 90 ? 'Severe hypoxia' : 'Low oxygen saturation', severity: num < 90 ? 'critical' : 'warning' })
    }
    if (v.name === 'Body temperature') {
      if (num >= 38.5) flags.push({ vital: 'Temperature', value: `${num}°C`, message: num >= 39.5 ? 'High fever' : 'Fever', severity: num >= 40 ? 'critical' : 'warning' })
      if (num < 36.0)  flags.push({ vital: 'Temperature', value: `${num}°C`, message: 'Hypothermia', severity: num < 35 ? 'critical' : 'warning' })
    }
    if (v.name === 'Respiratory rate') {
      if (num > 20) flags.push({ vital: 'Resp. Rate', value: `${num}/min`, message: 'Tachypnoea', severity: num > 25 ? 'critical' : 'warning' })
      if (num < 12) flags.push({ vital: 'Resp. Rate', value: `${num}/min`, message: 'Bradypnoea', severity: 'warning' })
    }
  })

  return flags
}
