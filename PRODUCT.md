# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are independent and small-practice physicians and their care teams (care managers, admins, nurses) running Chronic Care Management (CCM) and Remote Patient Monitoring (RPM) programs. A secondary, lighter-weight audience is patients themselves via a Patient Portal (viewing check-ins, readings, and care plan status). The product is live with real patient data today, not a demo/pilot.

## Product Purpose

Vianova Health is a care-coordination platform that lets a small practice run CCM/RPM programs, async case consults, and day-to-day clinical operations (labs, care gaps, appointments, discharge, adverse events, consent, compliance) from one system, with CPT billing capture built in rather than bolted on.

## Positioning

All-in-one CCM/RPM/billing: it replaces a stack of separate point tools (enrollment, remote monitoring, care plan authoring, CPT/billing capture, compliance/audit logging) with one system, so a small practice doesn't need to reconcile data or workflows across several vendors to run and bill for these programs correctly.

## Operating Context

- Doctors and care managers work through a role-gated multi-page dashboard (`/dashboard`, `/patients`, `/cases`, `/ccm`, `/rpm`, `/labs`, `/care-gaps`, `/appointments`, `/billing`, `/audit-compliance`, `/interoperability`, `/admin`, `/channels`, `/calls`, and more).
- CCM and RPM are gated beta features (`PBeta`) alongside the always-on core.
- AI (Groq-hosted LLM) is used throughout as clinical decision support: drafting CCM care plans grounded in the patient's actual vitals/labs/care-gaps/check-in history, and other AI-assisted drafting call sites across the app. This is assistive, reviewed-before-save tooling, not autonomous clinical decision-making — plans are explicit drafts a care manager must review and save.
- Patients interact via a separate Patient Portal and via calls/check-ins logged by the care team.
- Data is stored in a Turso (libSQL) database; the API is an Express server; FHIR import/export exists for interoperability with outside systems.

## Capabilities and Constraints

- Confirmed: CCM/RPM enrollment and billing (CPT code capture), AI-drafted and manually-edited care plans with a draft/active/completed lifecycle and version history, labs, care gaps, adverse events, discharge, consent, population health, SDOH, chronic disease tracking, clinical decision support, NLP notes, audit/compliance logging, FHIR-based interoperability, admin/user management, in-app channels and call requests, patient portal.
- Constraint: care plan edits use an explicit draft-then-save flow (no silent autosave) so an unreviewed AI draft can never leak into the live/billable plan.
- Undecided/not established: no formal accessibility standard has been confirmed as a requirement (see Accessibility & Inclusion).

## Brand Commitments

Name: "Vianova Health." Existing wordmark/logo at `public/vianova-logo.svg`, favicon at `public/favicon.svg`. Page title: "Vianova Health — Cure Analyzer." Typeface already committed in `index.html`: Inter (400–800). Theme color meta already set to `#0e7490` (teal).

## Evidence on Hand

Live production data: real enrolled CCM/RPM patients, real care plans, real lab results and vitals, real billing/CPT records. No fabricated testimonials, customer logos, or press exist and none should be invented in future design work.

## Product Principles

1. One system beats a reconciled stack — CCM, RPM, billing, and compliance live together so data entered once is correct everywhere it's used (billing, audit, care plan).
2. AI assists, clinicians decide — every AI-generated clinical artifact (care plan drafts, notes, decision support) is reviewed and explicitly saved by a human before it affects the live record.
3. Small-practice pragmatism — the product is built for a physician/care-manager team without a dedicated IT department, not an enterprise health-system buyer; workflows should stay scannable and low-friction rather than configuration-heavy.
4. Real patient data, real stakes — this is live in production with real patients; changes must preserve correctness and auditability, not just visual polish.

## Accessibility & Inclusion

No product-specific accessibility standard has been established yet; treat as an open gap worth surfacing in audit/critique rather than a confirmed requirement.
