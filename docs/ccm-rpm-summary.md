# CCM/RPM Update — Team Summary

## What shipped

**Billing**
- RPM enrollment now auto-bills a new one-time code, **99453** (setup/education), same as CCM already does with G0506.
- Enrollment can now be linked to a phone call already logged in the system — pick the call, and it auto-creates the first billable time entry (and drafts a claim immediately if that call alone hits the 20-min/month threshold). Previously this required a separate manual step after enrolling.
- Care Plan is auto-drafted by AI the moment a patient is enrolled in CCM, using their real conditions/meds/vitals/labs — not a blank form. (This already existed, confirmed still working.)

**UI**
- Visual refresh on the CCM and RPM pages — consistent styling, clearer empty states, better modal layout.
- Both enroll forms now have a "Related Call" picker.

**Calls**
- Root cause of "calls not going through" found: the patient callback button relies on the Mac's native Continuity/Handoff calling, which fails at the OS level independent of the app. Added a "copy number" button as a fallback so staff aren't blocked when that happens.

## Still open

- **Care plan editing bug**: fixed the known root cause (a race between checking off tasks and AI-drafting a plan), but it's been re-reported as still happening. Re-checked the whole code path and can't find the defect by inspection — need either the deployed environment confirmed up to date, or exact steps to reproduce it live.

## Full technical writeup
See `docs/ccm-rpm-billing-and-calls-pr.md` for file/line-level detail on everything above.
