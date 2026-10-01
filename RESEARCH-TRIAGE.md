# Doctor Research: NOW and LATER

## Active Phase: Analytics and UI

On 2026-10-01 the user capped classification at 1,060 doctors. The remaining
963 source-confirmed doctors are retained and deferred to LATER, not deleted
or treated as inactive clinicians. Do not resume broad enrichment until requested.
The 2,023-person source-confirmed database remains the overall denominator;
1,060 is the classified subset, not the number with captured social activity.
`research-phase.mjs` records this decision and the triage generator applies it.

## First Pass

### Uploaded Database Priority

Prioritize the uploaded DB.csv pool for Diabetology, Cardiology, Endocrinology, Gynaecology/Obstetrics, Consulting Physicians (CP), and General Practitioners (GP). Other specialties remain outside the priority pool; do not delete them.

Cardiac Anaesthesiology is explicitly deferred to LATER by user instruction. Preserve its records and sources, do not treat it as Cardiology, and revisit only after the priority specialties. This specialty-level deferral takes precedence over scan completion and field-gap ranking.

Use explicit `Specialty 2` values to distinguish Consulting Physician and General Practitioner within the combined `Physician (CP/GP)` label. Retain the combined label only where the second column does not distinguish them; never count one row twice. Broad `Modern Medicine`, missing labels and qualification-only hints enter specialty review, not a presumed target specialty. Explicit subspecialties found during hospital scans can promote these candidates into the priority pool with source evidence.

The user expects approximately 2,233 selected uploaded doctors. The available CSV contains 554,522 rows and no selection column. Do not stage the broad specialty match as the requested subset. Staging requires an explicit reviewed source-record selection tied to the source checksum; await the intended filter or selected file.

The uploaded candidate pool is separate from the source-confirmed platform cohort until identity reconciliation. Apply the same five-minute first-pass limit and field-level NOW/LATER rules to it. Existing cohort overlaps should be enriched, not inserted as new doctors solely because they have a different spreadsheet ID.

- Scan every active doctor against their hospital name and existing institutional URL.
- Five minutes is a maximum per doctor, not a required duration. Stop sooner when useful evidence is captured or a field is blocked.
- Save supported fields immediately, including exact source URL, observation date, attribution and uncertainty. Never delay an entire profile for one missing field.
- Track affiliation, location, specialty, qualifications, experience/archetype, public accounts and attributed content separately.
- A failed or inconclusive search means unresolved, not absent. Never fill gaps with invented values or merge by name alone.
- Prefer hospital-published experience, retaining conflicting claims. Preserve authorship and medical-review roles separately.
- Move unresolved fields to LATER with the reason and next source to try. If nothing useful is found, move the entire doctor to LATER.
- Finish the first pass across all names before returning to difficult profiles.

## Second Pass

Work LATER in this order: profiles with one or two unresolved fields and the most supported information; then other partially populated profiles; then profiles with no usable evidence. Resume individual missing fields rather than repeating completed research.

## Queue

`node scripts/build-research-triage.mjs` rebuilds `generated/research-triage.json` from current evidence and preserves recorded scan outcomes. Existing evidence does not imply that a timed first pass has taken place.

Record actual `startedAt`, `finishedAt`, `status: COMPLETE`, and field-level `deferred` reasons/next sources in a queue item's `scan` object after each scan. Keep research evidence in the existing reviewed source files; this queue is a work ledger, not another clinician database. UI and classification rules are not changed by queue generation.
