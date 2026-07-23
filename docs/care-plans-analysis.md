# Care Plans — Full Analysis & Roadmap

_Prepared for: CCM Enrollment workstream_
_Scope: (1) how Care Plans work today in Vianova, (2) how athenahealth models Care Plans/CCM, (3) the FHIR `CarePlan` resource, (4) the data points needed to let AI draft a care plan, (5) concrete next steps for the platform._

---

## 1. How Care Plans work today in Vianova (this codebase)

### 1.1 Data model (live Turso/libSQL schema)

| Table | Columns (actual, verified via `PRAGMA table_info`) |
|---|---|
| `ccm_patients` | `id, owner_email, name, dob, phone, condition, insurance, care_manager, status ('active'default), created_at` |
| `ccm_care_plans` | `id, patient_id, owner_key, tasks (TEXT JSON, default '[]'), updated_at` |
| `ccm_checkins` | `id, patient_id, owner_key, minutes, notes, barriers, plan_update, created_at` |
| `gen_patients` (shared roster) | `id, owner_email, name, dob, sex, mrn, phone, conditions, medications, allergies, fhir_vitals, notes, created_at, email, address, language, import_source, data_quality_score` |

Key observations:
- A **care plan is just one row per patient**: `tasks` is a flat JSON array of `{ text, done }` objects. There is no goal object, no care-team object, no per-condition structuring, no due dates, no versioning/history — one mutable blob that gets overwritten on every save (`UPDATE ccm_care_plans SET tasks = ? ... WHERE patient_id = ?`).
- `condition` on `ccm_patients` is a **single free-text string**, not the structured `conditions` list already captured on `gen_patients` (which stores full condition/medication/allergy/vitals data per patient, likely FHIR-ish JSON). Enrollment currently does not pull that structured clinical data into CCM at all — only `name`, `dob`, `phone` are copied from the roster.
- There is no `goal`, `careTeam`, `activity.detail` (frequency/scheduled timing), or `status` per task — just a boolean `done`.

### 1.2 UI/UX flow (`src/pages/CCM.jsx`)

1. **Enroll** — pick an existing patient from `gen_patients` via `/api/patients`, then manually set `condition` (single select, from `CARE_PLAN_TEMPLATES` keys), `insurance`, `care_manager`.
2. **Care Plan tab** — `applyTemplate(tpl)` takes a **hardcoded template** (`CARE_PLAN_TEMPLATES` object with 4 conditions: Diabetes Type 2, Hypertension, COPD, Heart Failure, each a fixed list of ~10 static task strings) and turns it into `planTasks = [{text, done:false}, ...]`. There is no personalization to the patient's actual labs, meds, or history at this step — it's a static checklist per condition name.
3. **Edit Plan modal** — lets a user pick a different template (replaces all tasks) or hand-edit/add/remove individual task strings.
4. **Task toggle** — checking a task calls `toggleTask` → POST `/plan` with the whole tasks array re-serialized; `%done` becomes the plan's "progress" score shown as a bar.
5. **Check-in** — separate from the plan: minutes + notes + barriers + plan_update, tied to CPT 99490 (≥20 min/month) eligibility tracking. An **AI Suggest** button (`POST /api/ccm/patients/:pid/checkins/ai-suggest`) drafts the note/minutes using: patient name, `condition` string, open (`!done`) task texts, care manager, and the last 3 check-ins — but it does **not** see labs, meds, or vitals.
6. **Disenroll** — hard-deletes `ccm_checkins` + `ccm_care_plans` rows, cannot be undone.

### 1.3 Gaps vs. a "real" care plan
- No goals (measurable targets like "HbA1c < 7%"), only tasks.
- No care team members/roles attached to the plan.
- No linkage to the conditions/problems it's meant to address (just a single string).
- No versioning — editing overwrites history; you can't see what the plan looked like last month.
- No due-dates/frequency on tasks (FHIR calls this `activity.detail.scheduled[x]`).
- Template selection is manual and static; nothing today reads the patient's actual clinical data (labs, meds, vitals already sitting in `gen_patients`/NLP notes) to generate or adapt the plan.

---

## 2. How athenahealth models Care Plans / CCM

*(Sourced from athenahealth's public developer docs and third-party CCM integration documentation; athenahealth gates full API reference behind an authenticated developer account, so some detail below is from partner/integration write-ups rather than raw endpoint specs.)*

athenahealth's CCM/Care Management workflow (athenaOne) is built around these stages, which map closely to what a payer/CMS audit expects for CPT 99490/99439/99491/99487:

1. **Eligibility & consent** — identify Medicare (or equivalent) patients with **2+ chronic conditions expected to last ≥12 months** (or until death) that place the patient at significant risk. Verbal or written **consent** is captured and stored as a discrete, auditable event (date + method) — this is a first-class object, not a checkbox buried in notes.
2. **Enrollment** — creates a CCM "episode" tied to the patient's chart, referencing the qualifying conditions pulled directly from the patient's active problem list (not retyped).
3. **Care plan** — athenahealth's care plan is explicitly a **structured, comprehensive plan addressing all chronic conditions together** (not one plan per condition), containing:
   - Problem list references (the qualifying conditions)
   - Medication list (kept in sync bidirectionally with the chart's medication list — not manually re-entered)
   - Goals/interventions per problem
   - Care team members and their roles
   - The plan is meant to be shareable with the patient (electronic copy requirement under CMS CCM rules)
4. **Monthly time tracking** — every contact (call, coordination action, chart review) is logged with a timestamp and duration; the system rolls this up automatically toward the 20-minute (99490) / 30-minute (99491, physician/QHP time) / additional-20-minute (99439/99487) thresholds, and **generates the billing code automatically** once thresholds are met — this removes the manual "did we hit 20 minutes?" tracking that Vianova currently does with a simple sum-and-compare.
5. **Bidirectional sync** — chronic conditions, medications, and problem list changes elsewhere in the chart flow into the care plan automatically; the care plan isn't a silo that can drift out of sync with the rest of the record.
6. **Disenrollment** — tracked as a status change/end-date on the CCM episode rather than a hard delete, preserving the audit trail (required for compliance — CMS can request records showing CCM services were actually rendered).

**Takeaway for Vianova**: athenahealth treats the care plan as **derived from and synced with structured chart data** (problems, meds) plus **auditable consent and time logs**, whereas Vianova's plan is currently a hand-typed checklist disconnected from the patient's actual structured data, and disenrollment is destructive rather than an audit-preserving status change.

### 2.1 CCNHealth's published athenahealth CCM workflow (as supplied)

CCNHealth (an athenahealth-integration vendor) documents the workflow as 5 concrete steps, which line up 1:1 with the stages in 2.0 above and give a clean checklist to hold Vianova against:

1. **Patient Enrollment** — identify Medicare patients with 2+ chronic conditions and obtain consent.
2. **Care Plan Creation** — develop a comprehensive care plan addressing all chronic conditions (a single plan, not one per condition).
3. **Monthly Coordination** — regular check-ins, medication reconciliation, and care plan updates every month.
4. **athenahealth Documentation** — care coordination notes and time logs **sync to athenahealth automatically** (no manual re-entry into the EHR).
5. **Billing Automation** — time tracking and documentation for **CPT 99490/99491 generated automatically** once thresholds are met.

**Feature summary (as published):**

| Feature | Details |
|---|---|
| EHR Integration | Bi-directional sync with athenahealth |
| Devices Supported | Blood pressure, weight, SpO2, glucose, contactless |
| Alert Time | Real-time notifications to care staff |
| Billing Codes | 99490, 99491 |
| Compliance | HIPAA compliant, CMS-aligned documentation |
| Platform Uptime | 99.9% availability |

**Supported "devices"/modules (as published):**

| Module | Use Case | Experience |
|---|---|---|
| Care Coordination Platform | Multi-condition management | Centralized dashboard for all chronic conditions |
| Medication Tracking | Adherence monitoring | Automated refill reminders and reconciliation |
| Secure Messaging | Patient communication | HIPAA-compliant messaging for monthly check-ins |

**Clinical benefits (as published):**
- Proactive management of multiple chronic conditions
- Reduced hospital readmissions through regular monitoring
- Improved medication adherence and reconciliation
- Better care coordination across providers

### 2.2 Gap check: this workflow against Vianova today

| CCNHealth/athenahealth capability | Vianova today | Gap |
|---|---|---|
| Enrollment requires 2+ chronic conditions + consent capture | Enrollment picks 1 patient, 1 free-text `condition`, no consent field at all | ❌ No multi-condition model, no consent record |
| Care plan addresses **all** chronic conditions together | `condition` is a single string driving a single template | ❌ Can't represent a patient with e.g. both Diabetes + Hypertension in one plan |
| Medication reconciliation as part of monthly coordination | Check-ins have free-text `notes`/`barriers`, no structured med-rec step | ⚠️ Partial — `gen_patients.medications` exists but isn't surfaced in the check-in flow |
| Notes/time logs sync to EHR automatically | No EHR (athenahealth or otherwise) integration exists yet | ❌ Fully manual, single-system today |
| Billing codes generated automatically from time thresholds | Vianova computes `monthlyMinutes >= 20` and shows an eligibility bar, but doesn't emit/tag an actual billing code record | ⚠️ Partial — the math exists, the billing artifact doesn't |
| Devices: BP, weight, SpO2, glucose, contactless | Vianova RPM (`VITALS_CONFIG`) supports heart rate, SpO2, systolic/diastolic BP, temperature, resp rate | ⚠️ Partial — **no weight, no glucose, no contactless monitoring** in the current RPM module |
| Secure messaging for monthly check-ins | No patient-facing secure messaging tied to CCM/RPM (Channels page exists separately, not wired to CCM check-ins) | ❌ Not connected |
| Real-time alerts to care staff | RPM has in-app critical/warning badges on the vitals view, but no push/real-time notification to staff | ⚠️ Partial — alerting is passive (only visible if someone opens the page) |

Sources:
- [athenahealth Developer Portal](https://www.athenahealth.com/developer-portal)
- [CCM Enrollment — API Solutions](https://docs.athenahealth.com/api/api-ref/ccm-enrollment)
- [athenahealth CCM Integration — CCNHealth](https://ccnhealth.com/articles/integrations/athenahealth/ccm)
- [Provide Care Management with athenaOne](https://www.athenahealth.com/resources/blog/care-management-athenaone)

---

## 3. The FHIR `CarePlan` resource (HL7 R4)

The FHIR `CarePlan` resource is the industry-standard shape for exactly this concept, and is what Vianova should structurally converge toward (Vianova already has an "Interoperability"/FHIR page and `fhir_vitals` field, so this isn't a foreign concept in the codebase).

**Purpose**: "Describes the intention of how one or more practitioners intend to deliver care for a particular patient, group, or community for a period of time."

| Field | Cardinality | Description | Vianova today? |
|---|---|---|---|
| `identifier` | 0..* | External business ID | ❌ (uses DB row id only) |
| `instantiatesCanonical` / `instantiatesUri` | 0..* | Reference to a protocol/guideline this plan follows (e.g. an ADA diabetes guideline) | ❌ — but this is exactly the slot the "condition template" concept should map to |
| `basedOn` / `replaces` / `partOf` | 0..* | Plan versioning/hierarchy | ❌ — currently plans are overwritten in place, no history |
| **`status`** | 1..1 | draft \| active \| on-hold \| revoked \| completed \| entered-in-error \| unknown | ❌ (only patient-level `status`, not plan-level) |
| **`intent`** | 1..1 | proposal \| plan \| order \| option | ❌ — relevant for AI-drafted plans: an AI-generated plan should start as `intent=proposal` until a clinician reviews/accepts it |
| `category` | 0..* | Type of plan (e.g. "assess-plan", "careteam") | ❌ |
| `title` / `description` | 0..1 | Human-friendly name / summary | Partial (condition name used as ad hoc title) |
| **`subject`** | 1..1 | The patient | ✅ (`patient_id`) |
| `period` | 0..1 | Effective start/end | ❌ |
| `created` / `author` | 0..1 | Who authored it, when | Partial (`updated_at` only, no author) |
| **`careTeam`** | 0..* | People/orgs responsible | ❌ (only a single `care_manager` string on the patient row, not on the plan) |
| **`addresses`** | 0..* | The Condition(s) this plan is for | ❌ — biggest gap; today it's one free-text `condition` string, not a reference to the patient's actual structured problem list |
| `supportingInfo` | 0..* | Clinical info that informed the plan (labs, vitals, notes) | ❌ — this is exactly what would let AI draft a plan grounded in real data instead of a static template |
| **`goal`** | 0..* | Desired measurable outcomes (references a `Goal` resource: description, target, due date) | ❌ — Vianova has tasks but no goals/targets |
| **`activity`** | 0..* | Planned actions; each can have `status`, `scheduled[x]` (frequency/due date), `performer`, `detail.kind`, outcome | Partial — Vianova's `{text, done}` is a crude subset of `activity.detail` with no scheduling, no performer, no outcome tracking |
| `note` | 0..* | Free-text comments | Partial (`plan_update`/`notes` on check-ins serve this loosely) |

Sources:
- [FHIR CarePlan resource (R4)](http://hl7.org/fhir/careplan.html)
- [CarePlan - FHIR v4.0.1](https://www.hl7.org/fhir/R4/careplan.html)

---

## 4. Input data points to let AI draft a care plan

To move from "pick a static template" to "AI drafts a real, patient-specific care plan," the AI call needs these inputs — most already exist somewhere in the DB, a few need to be newly captured:

### Already available today (just not wired into the plan draft)
| Data point | Where it lives now |
|---|---|
| Structured conditions/problem list | `gen_patients.conditions` (JSON) |
| Medications | `gen_patients.medications` (JSON) |
| Allergies | `gen_patients.allergies` |
| Vitals (structured, FHIR-shaped) | `gen_patients.fhir_vitals` |
| Demographics (age via `dob`, sex) | `gen_patients.sex`, `.dob` |
| Prior CCM check-in history (barriers, notes) | `ccm_checkins` |
| RPM vitals trend (if also enrolled in RPM) | `rpm_readings` |
| NLP-extracted problem/med/lab data from clinical notes | `nlp_notes` (`conditions`, `medications`, `lab_values_extracted`, `family_history`, `phenotype_flags`, `acuity_score`) |
| Open care gaps (existing feature) | `care_gaps` table |
| Recent lab results | `lab_results` table |

### Needs to be newly captured / structured
- **Care team & roles** — who is the PCP, care manager, specialists involved (today only one `care_manager` string).
- **Explicit goals with targets** — e.g. "HbA1c < 7.0% by [date]", "BP < 130/80" — not currently modeled anywhere; would need a `goals` JSON column or a `ccm_goals` table.
- **Consent record** — date/method of CCM consent (a compliance requirement athenahealth tracks explicitly that Vianova does not yet capture as a discrete field).
- **Plan status/intent** — so an AI-drafted plan can sit as `proposal`/`draft` pending clinician sign-off rather than immediately becoming the active plan.
- **Task scheduling/frequency** — "daily," "weekly," "every 3 months" per task, plus due dates, so tasks aren't just a flat unstructured checklist.

### What the AI prompt should look like (conceptually)
Instead of `applyTemplate(tpl)` picking a static array, a `POST /api/ccm/patients/:pid/plan/ai-draft` endpoint should assemble:
```
patient: { age, sex, conditions[], medications[], allergies[] }
vitals: latest fhir_vitals / rpm_readings trend
recent labs: lab_results (last N, out-of-range flagged)
open care gaps: care_gaps (unresolved)
prior check-in barriers: ccm_checkins.barriers (last N)
condition-specific guideline hints: keep CARE_PLAN_TEMPLATES as a fallback/seed, not the sole source
```
...and return a structured draft: `{ goals: [{description, target, due}], tasks: [{text, frequency, due}], addresses: [conditionIds], careTeam: [...] }` — with `status: "draft"` until a clinician reviews and activates it (mirrors FHIR `intent=proposal`).

---

## 5. Recommended next steps for the Vianova platform (in priority order)

1. **Stop losing structured data at enrollment.** When enrolling into CCM, pull `conditions`, `medications`, `allergies`, `fhir_vitals` from `gen_patients` into the CCM context (read-only reference, don't duplicate/fork the data) instead of only copying `name/dob/phone`. This alone unblocks everything below.
2. **Add a `goals` concept.** Extend `ccm_care_plans` with a `goals` JSON column (array of `{description, target, due, status}`), and extend the tasks shape with `{text, done, frequency, due}` — a low-risk additive schema change (matches the FHIR `goal`/`activity.detail.scheduled` shape without a full FHIR rewrite).
3. **Add care-team structure to the plan**, not just a single `care_manager` string on the patient — array of `{name, role}` so multi-provider CCM (PCP + specialist + care manager) is representable, matching FHIR `careTeam`.
4. **Preserve plan history.** Instead of `UPDATE ... SET tasks = ?` overwriting in place, insert a new version row (or a `ccm_care_plan_versions` audit table) each time the plan changes, so you can show "what changed and when" — this is both a FHIR (`replaces`) and an athenahealth/compliance expectation.
5. **Add a `status`/`intent` field on the plan** (`draft`/`active`/`completed`) so an AI-drafted plan can be reviewed before becoming the operative plan — critical once AI drafting ships, to keep a clinician in the loop.
6. **Build the AI draft endpoint** (`/api/ccm/patients/:pid/plan/ai-draft`) using the data points in Section 4 — reuse the existing Groq client pattern already used for `checkins/ai-suggest`. Keep `CARE_PLAN_TEMPLATES` as a fallback/seed for conditions not well covered by patient data yet, not the only source.
7. **Capture CCM consent as a discrete field/event** (date + method) on `ccm_patients` — required for CMS billing audits and currently entirely missing.
8. **Longer-term**: if/when true EHR interoperability matters, model the above using actual FHIR `CarePlan`/`Goal`/`CareTeam` resources (Vianova already has an Interoperability page and `fhir_vitals`, so the shape is a natural extension) rather than a bespoke JSON blob — this is what would make the data portable to/from systems like athenahealth via FHIR APIs.

---

### Sources
- [athenahealth Developer Portal](https://www.athenahealth.com/developer-portal)
- [CCM Enrollment — API Solutions (athenahealth)](https://docs.athenahealth.com/api/api-ref/ccm-enrollment)
- [athenahealth CCM Integration — CCNHealth](https://ccnhealth.com/articles/integrations/athenahealth/ccm)
- [Provide Care Management with athenaOne](https://www.athenahealth.com/resources/blog/care-management-athenaone)
- [FHIR CarePlan resource (current)](http://hl7.org/fhir/careplan.html)
- [FHIR CarePlan — R4 (v4.0.1)](https://www.hl7.org/fhir/R4/careplan.html)
