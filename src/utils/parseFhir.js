/**
 * parseFhir.js
 * Parses a FHIR R4 Bundle JSON and returns a clean structured object
 * for use in Vianova Health intake and AI context flows.
 */

/**
 * Calculate age in years from a birthDate string (YYYY-MM-DD or YYYY).
 * @param {string} birthDate
 * @returns {number|null}
 */
function calcAge(birthDate) {
  if (!birthDate) return null;
  try {
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age -= 1;
    }
    return age;
  } catch {
    return null;
  }
}

/**
 * Extract first entry of a given resourceType from a FHIR Bundle.
 * @param {Array} entries
 * @param {string} resourceType
 * @returns {object|null}
 */
function getFirst(entries, resourceType) {
  const found = entries.find(e => e?.resource?.resourceType === resourceType);
  return found?.resource ?? null;
}

/**
 * Extract all entries of a given resourceType from a FHIR Bundle.
 * @param {Array} entries
 * @param {string} resourceType
 * @returns {Array}
 */
function getAll(entries, resourceType) {
  return entries
    .filter(e => e?.resource?.resourceType === resourceType)
    .map(e => e.resource);
}

/**
 * Safely get a nested value from an object.
 * @param {object} obj
 * @param {...string} keys
 * @returns {*}
 */
function dig(obj, ...keys) {
  return keys.reduce((acc, key) => (acc != null ? acc[key] : null), obj) ?? null;
}

/**
 * Parse Patient resource.
 * @param {object|null} resource
 * @returns {object}
 */
function parsePatient(resource) {
  if (!resource) {
    return {
      fullName: null, firstName: null, lastName: null,
      gender: null, birthDate: null, age: null,
      mrn: null, phone: null, email: null,
      address: null, city: null, state: null, country: null,
      maritalStatus: null, language: null,
    };
  }

  // Name
  const nameObj = (resource.name || [])[0] ?? {};
  const firstName = (nameObj.given || []).join(' ') || null;
  const lastName = nameObj.family || null;
  const fullName = nameObj.text
    || [firstName, lastName].filter(Boolean).join(' ')
    || null;

  // Identifiers — look for MRN (usual / MR type)
  let mrn = null;
  for (const id of resource.identifier || []) {
    const use = id.use;
    const typeCode = dig(id, 'type', 'coding', 0, 'code');
    if (use === 'usual' || typeCode === 'MR') {
      mrn = id.value ?? null;
      break;
    }
  }
  if (!mrn && (resource.identifier || []).length > 0) {
    mrn = resource.identifier[0].value ?? null;
  }

  // Telecom
  let phone = null;
  let email = null;
  for (const t of resource.telecom || []) {
    if (t.system === 'phone' && !phone) phone = t.value ?? null;
    if (t.system === 'email' && !email) email = t.value ?? null;
  }

  // Address
  const addr = (resource.address || [])[0] ?? {};
  const addressLine = (addr.line || []).join(', ') || null;
  const city = addr.city ?? null;
  const state = addr.state ?? null;
  const country = addr.country ?? null;

  // Marital status
  const maritalStatus =
    dig(resource, 'maritalStatus', 'text') ||
    dig(resource, 'maritalStatus', 'coding', 0, 'display') ||
    dig(resource, 'maritalStatus', 'coding', 0, 'code') ||
    null;

  // Language
  const language =
    dig(resource, 'communication', 0, 'language', 'text') ||
    dig(resource, 'communication', 0, 'language', 'coding', 0, 'display') ||
    dig(resource, 'communication', 0, 'language', 'coding', 0, 'code') ||
    null;

  const birthDate = resource.birthDate ?? null;

  return {
    fullName,
    firstName,
    lastName,
    gender: resource.gender ?? null,
    birthDate,
    age: calcAge(birthDate),
    mrn,
    phone,
    email,
    address: addressLine,
    city,
    state,
    country,
    maritalStatus,
    language,
  };
}

/**
 * Known LOINC codes for vital signs and their human-readable names.
 */
const VITAL_LOINC_MAP = {
  '8867-4': 'Heart rate',
  '8302-2': 'Body height',
  '9279-1': 'Respiratory rate',
  '8310-5': 'Body temperature',
  '29463-7': 'Body weight',
  '2708-6': 'Oxygen saturation',
  '59408-5': 'Oxygen saturation',   // pulse ox variant
  '55284-4': 'Blood pressure',      // panel
  '8480-6': 'Systolic blood pressure',
  '8462-4': 'Diastolic blood pressure',
};

/**
 * Parse Observation resources that are vital-signs.
 * Combines systolic + diastolic into a single BP entry.
 * @param {Array} resources
 * @returns {Array}
 */
function parseVitals(resources) {
  const vitals = resources.filter(r => {
    const cats = r.category || [];
    return cats.some(c =>
      (c.coding || []).some(code => code.code === 'vital-signs')
    );
  });

  let systolic = null;
  let diastolic = null;
  let bpDate = null;
  let bpLoinc = null;
  const result = [];

  for (const obs of vitals) {
    // Get LOINC code
    const loincCode =
      (obs.code?.coding || []).find(c => c.system?.includes('loinc'))?.code ||
      (obs.code?.coding || [])[0]?.code ||
      null;

    const name =
      VITAL_LOINC_MAP[loincCode] ||
      obs.code?.text ||
      (obs.code?.coding || [])[0]?.display ||
      null;

    const date =
      obs.effectiveDateTime ||
      dig(obs, 'effectivePeriod', 'start') ||
      null;

    // Blood pressure panel — contains components
    if (
      loincCode === '55284-4' ||
      name === 'Blood pressure' ||
      (obs.component && obs.component.length > 0 &&
        obs.component.some(c => {
          const code = (c.code?.coding || [])[0]?.code;
          return code === '8480-6' || code === '8462-4';
        }))
    ) {
      let sys = null;
      let dia = null;
      let unit = 'mmHg';
      for (const comp of obs.component || []) {
        const compCode = (comp.code?.coding || [])[0]?.code;
        const val = comp.valueQuantity?.value ?? null;
        if (compCode === '8480-6') {
          sys = val;
          unit = comp.valueQuantity?.unit || 'mmHg';
        }
        if (compCode === '8462-4') {
          dia = val;
        }
      }
      if (sys !== null || dia !== null) {
        result.push({
          name: 'Blood pressure',
          value: `${sys ?? '?'}/${dia ?? '?'}`,
          unit,
          date,
          loincCode: loincCode || '55284-4',
        });
      }
      continue;
    }

    // Standalone systolic
    if (loincCode === '8480-6') {
      systolic = obs.valueQuantity?.value ?? null;
      bpDate = bpDate || date;
      bpLoinc = '55284-4';
      continue;
    }

    // Standalone diastolic
    if (loincCode === '8462-4') {
      diastolic = obs.valueQuantity?.value ?? null;
      bpDate = bpDate || date;
      bpLoinc = '55284-4';
      continue;
    }

    // All other vitals
    const value = obs.valueQuantity?.value ?? obs.valueString ?? null;
    const unit = obs.valueQuantity?.unit ?? null;

    result.push({ name, value, unit, date, loincCode });
  }

  // Flush standalone BP components
  if (systolic !== null || diastolic !== null) {
    result.push({
      name: 'Blood pressure',
      value: `${systolic ?? '?'}/${diastolic ?? '?'}`,
      unit: 'mmHg',
      date: bpDate,
      loincCode: bpLoinc,
    });
  }

  return result;
}

/**
 * Parse Condition resources.
 * @param {Array} resources
 * @returns {Array}
 */
function parseConditions(resources) {
  return resources.map(r => ({
    name:
      r.code?.text ||
      dig(r, 'code', 'coding', 0, 'display') ||
      null,
    status:
      r.clinicalStatus?.text ||
      dig(r, 'clinicalStatus', 'coding', 0, 'code') ||
      null,
    onset:
      r.onsetDateTime ||
      r.onsetString ||
      dig(r, 'onsetPeriod', 'start') ||
      null,
    verified:
      r.verificationStatus?.text ||
      dig(r, 'verificationStatus', 'coding', 0, 'code') ||
      null,
  }));
}

/**
 * Parse MedicationRequest resources.
 * @param {Array} resources
 * @returns {Array}
 */
function parseMedications(resources) {
  return resources.map(r => {
    const name =
      r.medicationCodeableConcept?.text ||
      dig(r, 'medicationCodeableConcept', 'coding', 0, 'display') ||
      dig(r, 'medicationReference', 'display') ||
      r.medication?.concept?.text ||
      dig(r, 'medication', 'concept', 'coding', 0, 'display') ||
      null;

    const dosageInstr = (r.dosageInstruction || [])[0] ?? {};
    const dosage =
      dosageInstr.text ||
      dosageInstr.patientInstruction ||
      null;

    return {
      name,
      status: r.status ?? null,
      dosage,
      authored: r.authoredOn ?? null,
    };
  });
}

/**
 * Parse AllergyIntolerance resources.
 * @param {Array} resources
 * @returns {Array}
 */
function parseAllergies(resources) {
  return resources.map(r => {
    const substance =
      r.code?.text ||
      dig(r, 'code', 'coding', 0, 'display') ||
      null;

    const rxn = (r.reaction || [])[0] ?? {};
    const reaction =
      dig(rxn, 'manifestation', 0, 'text') ||
      dig(rxn, 'manifestation', 0, 'coding', 0, 'display') ||
      null;

    const severity = rxn.severity ?? null;

    return { substance, reaction, severity };
  });
}

/**
 * Parse Encounter resource.
 * @param {object|null} resource
 * @returns {object}
 */
function parseEncounter(resource) {
  if (!resource) {
    return { type: null, status: null, start: null, end: null, class: null };
  }

  const type =
    dig(resource, 'type', 0, 'text') ||
    dig(resource, 'type', 0, 'coding', 0, 'display') ||
    null;

  const classCode =
    resource.class?.code ||
    resource.class?.display ||
    null;

  return {
    type,
    status: resource.status ?? null,
    start: dig(resource, 'period', 'start'),
    end: dig(resource, 'period', 'end'),
    class: classCode,
  };
}

/**
 * Build a free-text clinical vitals summary for AI context.
 * @param {Array} vitals
 * @returns {string}
 */
function buildFreeText(vitals) {
  if (!vitals || vitals.length === 0) return '';

  const abbrevMap = {
    'Heart rate': 'HR',
    'Blood pressure': 'BP',
    'Oxygen saturation': 'SpO2',
    'Body temperature': 'Temp',
    'Body weight': 'Weight',
    'Body height': 'Height',
    'Respiratory rate': 'RR',
  };

  const unitSuffix = {
    'Heart rate': 'bpm',
    'Blood pressure': 'mmHg',
    'Oxygen saturation': '%',
    'Body temperature': '°C',
    'Body weight': 'kg',
    'Body height': 'cm',
    'Respiratory rate': 'br/min',
  };

  const parts = vitals
    .filter(v => v.value !== null && v.value !== undefined)
    .map(v => {
      const abbrev = abbrevMap[v.name] || v.name;
      const suffix = unitSuffix[v.name] || v.unit || '';
      return `${abbrev} ${v.value}${suffix ? ' ' + suffix : ''}`;
    });

  return parts.length > 0 ? `Vitals: ${parts.join(', ')}.` : '';
}

/**
 * Capitalize first letter of a string.
 * @param {string|null} str
 * @returns {string|null}
 */
function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Normalize gender to "Male" / "Female" / "Other".
 * @param {string|null} gender
 * @returns {string}
 */
function normalizeSex(gender) {
  if (!gender) return '';
  const g = gender.toLowerCase();
  if (g === 'male') return 'Male';
  if (g === 'female') return 'Female';
  if (g === 'unknown') return '';
  return 'Other';
}

/**
 * Parse a FHIR R4 Bundle JSON and return a structured object.
 *
 * @param {object|string} json - FHIR R4 Bundle (object or JSON string)
 * @returns {object|null} Structured parsed data, or null on total failure
 */
export function parseFhirBundle(json) {
  try {
    const bundle = typeof json === 'string' ? JSON.parse(json) : json;

    if (!bundle || bundle.resourceType !== 'Bundle') {
      console.warn('parseFhirBundle: input is not a FHIR Bundle');
      return null;
    }

    const entries = bundle.entry || [];

    // --- Resources ---
    const patientResource   = getFirst(entries, 'Patient');
    const encounterResource = getFirst(entries, 'Encounter');
    const observationResources     = getAll(entries, 'Observation');
    const conditionResources       = getAll(entries, 'Condition');
    const medicationResources      = getAll(entries, 'MedicationRequest');
    const allergyResources         = getAll(entries, 'AllergyIntolerance');

    // --- Parse ---
    const patient    = parsePatient(patientResource);
    const vitals     = parseVitals(observationResources);
    const conditions = parseConditions(conditionResources);
    const medications= parseMedications(medicationResources);
    const allergies  = parseAllergies(allergyResources);
    const encounter  = parseEncounter(encounterResource);

    // --- Intake data ---
    const intakeData = {
      age: patient.age,
      sex: normalizeSex(patient.gender),
      known_conditions: conditions
        .filter(c => c.name)
        .map(c => c.name),
      allergies: allergies
        .filter(a => a.substance)
        .map(a => a.substance),
      current_medications: medications
        .filter(m => m.name && m.status !== 'stopped' && m.status !== 'cancelled')
        .map(m => m.name),
      free_text: buildFreeText(vitals),
    };

    return {
      patient,
      vitals,
      conditions,
      medications,
      allergies,
      encounter,
      intakeData,
    };
  } catch (err) {
    console.error('parseFhirBundle: failed to parse bundle', err);
    return null;
  }
}

