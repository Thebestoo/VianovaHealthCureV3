// Doctor specialties — mirrors the SPECIALTIES list in server/index.js. Kept as a
// plain array (not fetched from the API) since it changes rarely and is needed
// synchronously for the Admin.jsx doctor create/edit form dropdown.
// KEEP IN SYNC with SPECIALTIES in server/index.js, which is the source of truth /
// validation allow-list — there's no shared build step between the two.
export const SPECIALTIES = [
  'General Practice', 'Cardiology', 'Pulmonology', 'Neurology', 'Endocrinology',
  'Gastroenterology', 'Nephrology', 'Psychiatry', 'Dermatology', 'OB/GYN',
  'Orthopedics', 'Pediatrics', 'Emergency Medicine', 'Infectious Disease',
  'Rheumatology', 'Urology', 'ENT', 'Ophthalmology', 'Oncology',
]
