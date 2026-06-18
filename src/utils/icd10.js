/**
 * ICD-10 code suggestions for common conditions.
 * Maps differential possibility names to ICD-10 codes via fuzzy keyword matching.
 */

const ICD10_MAP = {
  // Cardiology
  'chest pain': { code: 'R07.9', description: 'Chest pain, unspecified' },
  'angina': { code: 'I20.9', description: 'Angina pectoris, unspecified' },
  'unstable angina': { code: 'I20.0', description: 'Unstable angina' },
  'myocardial infarction': { code: 'I21.9', description: 'Acute myocardial infarction, unspecified' },
  'mi': { code: 'I21.9', description: 'Acute myocardial infarction, unspecified' },
  'stemi': { code: 'I21.3', description: 'ST elevation myocardial infarction' },
  'nstemi': { code: 'I21.4', description: 'Non-ST elevation myocardial infarction' },
  'hypertension': { code: 'I10', description: 'Essential (primary) hypertension' },
  'hypertensive': { code: 'I10', description: 'Essential (primary) hypertension' },
  'heart failure': { code: 'I50.9', description: 'Heart failure, unspecified' },
  'chf': { code: 'I50.9', description: 'Congestive heart failure' },
  'arrhythmia': { code: 'I49.9', description: 'Cardiac arrhythmia, unspecified' },
  'atrial fibrillation': { code: 'I48.91', description: 'Atrial fibrillation, unspecified' },
  'afib': { code: 'I48.91', description: 'Atrial fibrillation, unspecified' },
  'bradycardia': { code: 'R00.1', description: 'Bradycardia, unspecified' },
  'tachycardia': { code: 'R00.0', description: 'Tachycardia, unspecified' },
  'pericarditis': { code: 'I31.9', description: 'Disease of pericardium, unspecified' },

  // Respiratory
  'pneumonia': { code: 'J18.9', description: 'Pneumonia, unspecified organism' },
  'community-acquired pneumonia': { code: 'J18.9', description: 'Community-acquired pneumonia' },
  'cap': { code: 'J18.9', description: 'Community-acquired pneumonia' },
  'asthma': { code: 'J45.909', description: 'Unspecified asthma, uncomplicated' },
  'copd': { code: 'J44.9', description: 'Chronic obstructive pulmonary disease, unspecified' },
  'bronchitis': { code: 'J40', description: 'Bronchitis, not specified as acute or chronic' },
  'acute bronchitis': { code: 'J20.9', description: 'Acute bronchitis, unspecified' },
  'pulmonary embolism': { code: 'I26.99', description: 'Pulmonary embolism without acute cor pulmonale' },
  'pe': { code: 'I26.99', description: 'Pulmonary embolism' },
  'pleurisy': { code: 'R09.1', description: 'Pleurisy' },
  'pneumothorax': { code: 'J93.9', description: 'Pneumothorax, unspecified' },
  'upper respiratory': { code: 'J06.9', description: 'Acute upper respiratory infection, unspecified' },
  'uri': { code: 'J06.9', description: 'Acute upper respiratory infection' },
  'sinusitis': { code: 'J32.9', description: 'Chronic sinusitis, unspecified' },
  'pharyngitis': { code: 'J02.9', description: 'Acute pharyngitis, unspecified' },
  'tonsillitis': { code: 'J03.90', description: 'Acute tonsillitis, unspecified' },

  // GI
  'gerd': { code: 'K21.9', description: 'Gastro-esophageal reflux disease without esophagitis' },
  'reflux': { code: 'K21.9', description: 'Gastro-esophageal reflux disease' },
  'appendicitis': { code: 'K35.80', description: 'Unspecified acute appendicitis' },
  'ibs': { code: 'K58.9', description: 'Irritable bowel syndrome without diarrhea' },
  'irritable bowel': { code: 'K58.9', description: 'Irritable bowel syndrome' },
  'gastroenteritis': { code: 'K52.9', description: 'Noninfective gastroenteritis and colitis, unspecified' },
  'pancreatitis': { code: 'K85.90', description: 'Acute pancreatitis, unspecified' },
  'cholecystitis': { code: 'K81.9', description: 'Cholecystitis, unspecified' },
  'gastritis': { code: 'K29.70', description: 'Gastritis, unspecified, without bleeding' },
  'peptic ulcer': { code: 'K27.9', description: 'Peptic ulcer, unspecified' },
  'constipation': { code: 'K59.00', description: 'Constipation, unspecified' },
  'diarrhea': { code: 'R19.7', description: 'Diarrhea, unspecified' },
  'hemorrhoids': { code: 'K64.9', description: 'Unspecified hemorrhoids' },
  'diverticulitis': { code: 'K57.92', description: 'Diverticulitis of intestine, unspecified' },

  // Neurology
  'migraine': { code: 'G43.909', description: 'Migraine, unspecified, not intractable' },
  'headache': { code: 'R51.9', description: 'Headache, unspecified' },
  'stroke': { code: 'I63.9', description: 'Cerebral infarction, unspecified' },
  'cva': { code: 'I63.9', description: 'Cerebrovascular accident' },
  'seizure': { code: 'R56.9', description: 'Unspecified convulsions' },
  'epilepsy': { code: 'G40.909', description: 'Epilepsy, unspecified, not intractable' },
  'vertigo': { code: 'R42', description: 'Dizziness and giddiness' },
  'tia': { code: 'G45.9', description: 'Transient cerebral ischemic attack, unspecified' },
  'transient ischemic': { code: 'G45.9', description: 'Transient ischemic attack' },
  'syncope': { code: 'R55', description: 'Syncope and collapse' },
  'concussion': { code: 'S06.0X0A', description: 'Concussion without loss of consciousness' },

  // Infectious
  'uti': { code: 'N39.0', description: 'Urinary tract infection, site not specified' },
  'urinary tract infection': { code: 'N39.0', description: 'Urinary tract infection' },
  'sepsis': { code: 'A41.9', description: 'Sepsis, unspecified organism' },
  'covid': { code: 'U07.1', description: 'COVID-19' },
  'coronavirus': { code: 'U07.1', description: 'COVID-19' },
  'influenza': { code: 'J11.1', description: 'Influenza due to unidentified virus' },
  'flu': { code: 'J11.1', description: 'Influenza' },
  'cellulitis': { code: 'L03.90', description: 'Cellulitis, unspecified' },
  'abscess': { code: 'L02.91', description: 'Cutaneous abscess, unspecified' },
  'meningitis': { code: 'G03.9', description: 'Meningitis, unspecified' },
  'pyelonephritis': { code: 'N12', description: 'Tubulo-interstitial nephritis' },

  // Musculoskeletal
  'back pain': { code: 'M54.9', description: 'Dorsalgia, unspecified' },
  'low back pain': { code: 'M54.50', description: 'Low back pain, unspecified' },
  'fracture': { code: 'T14.8', description: 'Fracture, unspecified' },
  'arthritis': { code: 'M19.90', description: 'Unspecified osteoarthritis, unspecified site' },
  'osteoarthritis': { code: 'M19.90', description: 'Unspecified osteoarthritis' },
  'rheumatoid': { code: 'M06.9', description: 'Rheumatoid arthritis, unspecified' },
  'gout': { code: 'M10.9', description: 'Gout, unspecified' },
  'sprain': { code: 'T14.3', description: 'Sprain of joint, unspecified body region' },
  'sciatica': { code: 'M54.30', description: 'Sciatica, unspecified side' },
  'tendinitis': { code: 'M77.9', description: 'Enthesopathy, unspecified' },

  // Endocrine
  'diabetes': { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
  'type 1 diabetes': { code: 'E10.9', description: 'Type 1 diabetes mellitus without complications' },
  'type 2 diabetes': { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
  'hypothyroidism': { code: 'E03.9', description: 'Hypothyroidism, unspecified' },
  'hyperthyroidism': { code: 'E05.90', description: 'Thyrotoxicosis, unspecified' },
  'hypoglycemia': { code: 'E16.2', description: 'Hypoglycemia, unspecified' },
  'hyperglycemia': { code: 'R73.9', description: 'Hyperglycemia, unspecified' },
  'dka': { code: 'E10.10', description: 'Diabetic ketoacidosis' },

  // Mental health
  'depression': { code: 'F32.9', description: 'Major depressive disorder, single episode, unspecified' },
  'anxiety': { code: 'F41.9', description: 'Anxiety disorder, unspecified' },
  'panic': { code: 'F41.0', description: 'Panic disorder' },
  'ptsd': { code: 'F43.10', description: 'Post-traumatic stress disorder, unspecified' },
  'insomnia': { code: 'G47.00', description: 'Insomnia, unspecified' },

  // Other
  'anemia': { code: 'D64.9', description: 'Anemia, unspecified' },
  'dehydration': { code: 'E86.0', description: 'Dehydration' },
  'allergic reaction': { code: 'T78.40XA', description: 'Allergy, unspecified, initial encounter' },
  'anaphylaxis': { code: 'T78.2XXA', description: 'Anaphylactic shock, unspecified, initial encounter' },
  'dvt': { code: 'I82.40', description: 'Acute embolism and thrombosis of unspecified deep veins of lower extremity' },
  'deep vein thrombosis': { code: 'I82.40', description: 'Deep vein thrombosis' },
  'kidney stone': { code: 'N20.0', description: 'Calculus of kidney' },
  'renal colic': { code: 'N23', description: 'Unspecified renal colic' },
  'nephrolithiasis': { code: 'N20.0', description: 'Calculus of kidney' },
  'conjunctivitis': { code: 'H10.9', description: 'Unspecified conjunctivitis' },
  'otitis media': { code: 'H66.90', description: 'Otitis media, unspecified, unspecified ear' },
  'eczema': { code: 'L30.9', description: 'Dermatitis, unspecified' },
  'rash': { code: 'R21', description: 'Rash and other nonspecific skin eruption' },
  'fatigue': { code: 'R53.83', description: 'Other fatigue' },
  'fever': { code: 'R50.9', description: 'Fever, unspecified' },
}

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

export function suggestICD10(differentials = []) {
  if (!Array.isArray(differentials)) return []
  const seen = new Set()
  const results = []

  for (const diff of differentials) {
    if (!diff) continue
    const diffStr = String(diff)
    const diffLower = diffStr.toLowerCase()
    const diffTokens = new Set(tokenize(diffStr))

    let best = null
    let bestScore = 0

    for (const [key, val] of Object.entries(ICD10_MAP)) {
      const keyLower = key.toLowerCase()
      let score = 0

      // Full phrase match (highest priority)
      if (diffLower.includes(keyLower)) {
        score = keyLower.length + 100
      } else {
        // Word overlap
        const keyTokens = tokenize(key)
        const overlap = keyTokens.filter(t => diffTokens.has(t)).length
        if (overlap === keyTokens.length && keyTokens.length > 0) {
          score = overlap * 10
        } else if (overlap > 0 && keyTokens.length > 1) {
          score = overlap
        }
      }

      if (score > bestScore) {
        bestScore = score
        best = { ...val, differential: diffStr }
      }
    }

    if (best && !seen.has(best.code)) {
      seen.add(best.code)
      results.push(best)
    }
  }

  return results
}
