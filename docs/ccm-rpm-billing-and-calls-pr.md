# CCM/RPM Care Plan, Call-Linked Billing & Calls Feature — PR Notes

_Prepared for: PR documentation._
_Scope: (1) confirms the CCM-enrollment care-plan auto-draft is implemented and working, (2) documents the CMS/billing changes shipped this cycle, (3) documents the care-plan data-loss fix and its current (unresolved) re-report, (4) documents the "calls can't go through" investigation and the fix shipped for it._

All line numbers below are current as of commit `a445f0d` on `main`. Every claim is cited to a file path + line number (or a commit) so it can be re-verified directly against the repo — nothing here is from memory or docs elsewhere.

---

## 1. Care Plan auto-assigned at CCM Enroll — confirmed done

**Status: done, in production, predates this PR's changes.**

`POST /api/ccm/patients` (`server/index.js:2576-2608`) runs this on every CCM enrollment:

1. Inserts the new `ccm_patients` row (`server/index.js:2582-2585`).
2. Immediately calls `draftCarePlanForPatient()` (`server/index.js:2511-2565`, called at `server/index.js:2599`) — the same AI logic behind the manual "AI Draft Care Plan" button — using the patient's just-entered `conditions`/`medications`/`allergies` plus data pulled concurrently from the DB: recent RPM vitals, labs, open care gaps, and check-in barriers (`server/index.js:2515-2520`).
3. Inserts the result directly into `ccm_care_plans` as an **active, editable** plan (`server/index.js:2600-2604`) — not a draft sitting in a buffer waiting for a click. The care manager sees a populated Care Plan card the moment they open the newly enrolled patient.
4. Wrapped in try/catch (`server/index.js:2596-2608`) so an AI failure never fails enrollment — `carePlanDrafted` just comes back `false`, and the manual "AI Draft" button remains as a fallback.

Source commit: `00ca3e3` — "Auto-draft CCM care plan at enrollment, matching CMS's own requirement." The code comment at `server/index.js:2587-2593` states the rationale directly: CMS requires the comprehensive care plan to originate from the initiating visit, not a separate step created days later.

This logic was **not touched** by this PR's changes (verified via `git log -p -- server/index.js` across `1b09b8e` and `a445f0d`) — it's called out here only to confirm it's live, not as new work.

---

## 2. CMS/billing changes shipped this PR

### 2.1 New CPT code — 99453 (RPM one-time setup)

RPM enrollment now auto-bills CPT `99453` ("Remote physiologic monitoring initial setup and patient education") the same way CCM enrollment already auto-billed `G0506` — one-time, fired once per patient at enrollment, independent of whether a call is linked.

- `server/index.js:2257-2270` — `POST /api/rpm/patients`, calls `autoBillOneTimeCode()` with `code: '99453'` whenever the enrollment carries a `gen_patient_id`.
- `autoBillOneTimeCode()` itself: `server/index.js:2473` (pre-existing helper, reused — previously only used for `G0506`).

### 2.2 Call-linked enrollment billing

Enrollment (CCM or RPM) can now cite an already-logged phone call as the basis for the first billable time entry, instead of requiring a separate manual check-in/reading after the fact.

- **`GET /api/patients/:id/calls`** (`server/index.js:2226`) — new endpoint, lists logged calls for a roster patient *before* they're enrolled in CCM or RPM. Backed by a new shared helper:
- **`queryCallsForGenPatient(genPatientId, ownerEmail)`** (`server/index.js:2214`) — the query logic, also reused by the existing per-program call-listing endpoints (`GET /api/rpm/patients/:pid/calls`, `GET /api/ccm/patients/:pid/calls`) so all three no longer duplicate the same SQL.
- **`linkEnrollmentCall({ callId, genPatientId, ownerEmail, table, pid, cpt, insertEntry })`** (`server/index.js:2461`) — new shared helper. Validates the call belongs to the patient, inserts a time-entry via a caller-supplied `insertEntry` callback (`ccm_checkins` for CCM, `rpm_readings` for RPM), then runs `checkMonthlyTimeThreshold()` (`server/index.js:2439`) to auto-draft a `99490` (CCM) or `99457` (RPM) claim if the ≥20-min/month threshold is already met from that one call.
  - Wired into `POST /api/ccm/patients` at `server/index.js:2639-2640`.
  - Wired into `POST /api/rpm/patients` at `server/index.js:2280-2281`.
- **`CPT_CCM_TIME` / `CPT_RPM_TIME`** (`server/index.js:2404-2405`) — new constants centralizing the `{code, description}` pairs for the monthly time-based codes, so the manual check-in flow and the new call-linked flow can't drift apart on wording.

**Frontend:** both `src/pages/CCM.jsx` and `src/pages/RPM.jsx` enroll modals gained a "Related Call" dropdown (`enrollCalls` state + `loadEnrollCalls()`) shown once a roster patient is picked, letting staff select the call the enrollment is based on. Submits as `call_id` on the enrollment POST.

Source commit for all of §2: `1b09b8e` — "Fix care-plan data-loss race, add call-linked CCM/RPM enrollment billing, polish UI."

### 2.3 Refactor (no behavior change)

The three near-identical "list calls for a patient" queries (`/api/patients/:id/calls`, `/api/rpm/patients/:pid/calls`, `/api/ccm/patients/:pid/calls`) all now call `queryCallsForGenPatient()` (`server/index.js:2214`) instead of each duplicating the SQL.

---

## 3. Care-plan data-loss bug — fix shipped, re-reported as still occurring

**Status: fix shipped and verified by code inspection; user has since reported the symptom persists. Root cause of the persistence not yet confirmed — needs a live repro.**

### What was fixed (commit `1b09b8e`)

`src/pages/CCM.jsx` previously mixed the *committed* care plan (what's saved and shown on the read-only Care Plan card) with the *edit buffer* (what the Edit Care Plan modal and the AI Draft flow work with), creating a race where an in-flight task toggle could clobber — or be clobbered by — an unreviewed AI draft. The fix separates them into two independent state groups:

- **Committed**: `planTasks`, `planGoals`, `careTeam`, `planStatus` (`src/pages/CCM.jsx:88-91`) — set only by `loadPlan()` (server truth) or `toggleTask()`'s own optimistic update.
- **Edit buffer**: `editTasks`, `editGoals`, `editCareTeam`, `editStatus` (`src/pages/CCM.jsx:97-100`) — used exclusively by the Edit Care Plan modal (`src/pages/CCM.jsx:1088-1247`), seeded by `openPlanEdit()` (`src/pages/CCM.jsx:352-359`) or by `aiDraftPlan()`'s AI response (`src/pages/CCM.jsx:419-436`); only reaches the committed state indirectly via `savePlan()` → server → `loadPlan()` (`src/pages/CCM.jsx:361-375`).
- `toggleTask()` (`src/pages/CCM.jsx:386-401`) was made race-safe with a `planTasksRef` (avoids stale closures) and a serialized promise-chain save queue, so concurrent toggles can't land out of order.

### Re-verification this cycle (no defect found yet)

In direct response to the "still a bug" report, the entire path was re-read end-to-end: state declarations, `loadPlan`, `openPlanEdit`, `savePlan`, `closePlanEdit`, `toggleTask`, `aiDraftPlan`, the full Edit Care Plan modal JSX input bindings (`src/pages/CCM.jsx:1112-1242`), the read-only Care Plan card JSX (`src/pages/CCM.jsx:662-756`), and the backend `GET`/`POST /api/ccm/patients/:pid/plan` handlers (`server/index.js:2657-2695`). No binding mismatch or field-clobbering was found. `git status` confirms `main` is clean and pushed at the time of this re-check, and a fresh local `vite build` hashed identical to the existing `dist/`, ruling out a stale local build as the cause.

**Open question blocking further progress:** whether the report is against the deployed Railway environment (which rebuilds `dist/` fresh from git via `nixpacks` on every deploy — see `railway.toml`) versus local, and the exact click sequence that reproduces "isn't updated." Until one of those is confirmed, this remains open.

---

## 4. "Calls can't go through" — investigated, one fix shipped

**Status: root cause identified as a macOS/OS-level limitation outside the app's control (not a code bug); a client-side mitigation was shipped anyway.**

The "Calls" tab (`src/pages/Calls.jsx`) bundles three unrelated features:

1. **AI Assistant call** — Web Speech API (browser STT/TTS) driving text chat to `POST /api/ai-call/message`.
2. **Doctor↔doctor calls** — real in-app WebRTC audio, signaled via HTTP polling against `voice_calls`/`/api/voice-calls*`. `ICE_SERVERS` (`src/pages/Calls.jsx:27`) configures **STUN only, no TURN** — a standing gap (confirmed via `git log -p` to predate this PR), meaning audio can silently fail to flow for any pair of peers behind symmetric NAT or a managed/hospital network even though signaling succeeds.
3. **Patient callback calls** — not in-app; a `call_requests` DB record paired with a plain `<a href="tel:...">` link (originally `src/pages/Calls.jsx:560, 676`) that hands off to the OS's registered phone handler.

The user's exact symptom — the macOS system dialog **"iPhone Calls Not Available"** — is category 3: Safari/Chrome handing the `tel:` link to macOS Continuity/Handoff calling, which failed at the OS level (this can happen even with an iPhone paired, e.g. transient Wi-Fi/Bluetooth/relay issues) — not something the app can detect or control.

**Fix shipped (commit `a445f0d`):** added a copy-to-clipboard fallback next to both `tel:` "Call" buttons, so staff aren't blocked when Handoff misbehaves.
- `copyPhone()` helper — `src/pages/Calls.jsx:14-20`.
- Copy button next to the direct-dial "Call" button — `src/pages/Calls.jsx:569-575` (patient list in `PatientCallbacksPanel`).
- Copy button next to the accepted-request "Call now" button — `src/pages/Calls.jsx:692-693`.

Uses `navigator.clipboard` + the existing `react-hot-toast` pattern already used elsewhere in the app for confirmation toasts.

---

## Sources

Everything above is sourced directly from this repository — no external references. Cited as `file:line` or commit hash inline throughout; key commits for quick reference:

- `00ca3e3` — Auto-draft CCM care plan at enrollment (§1)
- `1b09b8e` — Care-plan race fix + call-linked CCM/RPM billing + UI polish (§2, §3)
- `a445f0d` — Copy-to-clipboard fallback for call numbers (§4)
