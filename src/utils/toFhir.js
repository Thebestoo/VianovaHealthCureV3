// Maps our own DB rows (lab_results, rpm_readings, care_gaps) into FHIR R4
// resource shapes. This is the reverse direction of utils/parseFhir.js, which
// parses an *imported* FHIR Bundle into app data — these functions go the other
// way, for the CCM Care Plan Panel's Care Gaps/Labs/Vitals section, so that
// section's data is FHIR-interoperable the same way the rest of the app already
// is (see buildFhirClaim on the server for the billing-claim equivalent).
import { VITAL_LOINC, VITALS_REF } from './vitalsRef.js'

const INTERPRETATION_CODE = {
  N:  { code: 'N',  display: 'Normal' },
  H:  { code: 'H',  display: 'High' },
  L:  { code: 'L',  display: 'Low' },
  HH: { code: 'HH', display: 'Critical high' },
  LL: { code: 'LL', display: 'Critical low' },
}

export function labToFhirObservation(lab) {
  const interp = INTERPRETATION_CODE[lab.interpretation] || null
  return {
    resourceType: 'Observation',
    id: lab.id,
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
    code: { text: lab.test_name },
    subject: { reference: `Patient/${lab.patient_id}` },
    effectiveDateTime: lab.result_date,
    valueQuantity: { value: lab.value, unit: lab.unit || undefined },
    ...(lab.reference_low != null && lab.reference_high != null
      ? { referenceRange: [{ low: { value: lab.reference_low }, high: { value: lab.reference_high } }] }
      : {}),
    ...(interp ? { interpretation: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', ...interp }] }] } : {}),
  }
}

// One rpm_readings row holds several vitals at once — FHIR models each as its
// own Observation, so this returns an array (only for the components actually
// present on the reading) rather than a single resource.
export function readingToFhirObservations(reading) {
  return VITALS_REF
    .filter(v => reading[v.key] != null && reading[v.key] !== '')
    .map(v => ({
      resourceType: 'Observation',
      id: `${reading.id}-${v.key}`,
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: VITAL_LOINC[v.key] }], text: v.label },
      subject: { reference: `Patient/${reading.patient_id}` },
      effectiveDateTime: reading.recorded_at,
      valueQuantity: { value: reading[v.key], unit: v.unit },
    }))
}

const PRIORITY_SEVERITY = { high: 'high', medium: 'moderate', low: 'low' }

// FHIR has no first-class "care gap" resource — DetectedIssue (a finding that
// implies a gap in care, e.g. an overdue screening) is the closest standard fit.
export function careGapToFhirDetectedIssue(gap) {
  return {
    resourceType: 'DetectedIssue',
    id: gap.id,
    status: gap.status === 'closed' ? 'resolved' : 'preliminary',
    code: { text: gap.gap_type },
    severity: PRIORITY_SEVERITY[gap.priority] || 'moderate',
    patient: { reference: `Patient/${gap.patient_id}` },
    detail: gap.description,
    identifiedDateTime: gap.created_at,
  }
}
