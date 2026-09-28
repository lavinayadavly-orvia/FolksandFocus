# Two-axis intelligence framework

This implements the supplied framework in the existing Node/Cloudflare stack, not a second Python service. The frontend layout, CSS, logo, artwork, navigation and charts are unchanged. Persona labels now follow the registration-based rules.

## What is implemented

- Axis 1: UTC calendar year minus verified **basic medical registration year**. Bands are 35+, 25-34, 18-24, 10-17 and 0-9. Posting frequency and behavioral labels cannot override seniority. Registry corrections require an expected revision and audit reason.
- Axis 2: six independent behavioral archetypes from source-linked posts. Aggregation uses **publication time**, not processing time, in an inclusive rolling 90-day window. Every platform/post pair counts once. Secondary weight must be strictly greater than 25%. Ties follow the documented enum order and are flagged. Empty windows have no labels. Out-of-scope processed posts remain in the denominator and have no archetype.
- Cohort-only ingestion, identity-matched platform accounts, source URLs, collection basis, bounded atomic batches, duplicate protection, and persistent audit records. Unobserved engagement is null, not zero.
- OpenAI structured extraction, local schema validation, prompt/version provenance, timeouts, refusals, retry limits and worker leases. Media and linked URLs are not fetched or interpreted.
- Four independent PV criteria with source excerpts. Complete cases and incomplete adverse-event signals enter a protected human-review queue. A flag is neither proven causality nor a regulatory submission. Confirmation/dismissal requires a reviewer and reason.
- SQLite locally and a shared SQL/D1 adapter on Cloudflare. PostgreSQL/TimescaleDB is **not** installed or claimed to be connected. No time-series extension is needed for the current indexed workload.

## Current data

Local startup imports existing public-source dossiers as **PENDING** registration verification, without inventing registration dates. Publication candidates are not imported as verified clinicians. Career-biography lower bounds are retained as evidence but cannot determine a registration-based tier. Existing social account discoveries are not automatically treated as consent, collection permission, or identity proof.

The default database is `../.folksandfocus-data/intelligence.sqlite`, outside the static web root. No raw posts, safety records, API tokens, or database files are exposed by public summary routes. Only profile-level tier/behavior summaries are public, matching the current public platform. Production access control for the entire site remains a separate deployment decision.

## Local configuration

Requires Node 24 or later with `node:sqlite` (currently marked experimental by Node).

| Environment variable | Purpose |
| --- | --- |
| `PORT` | Existing local server port, e.g. 4175 |
| `INTELLIGENCE_DB_PATH` | Optional persistent SQLite path |
| `INTELLIGENCE_API_TOKEN` | Server-side bearer secret, minimum 32 characters; never place in browser code |
| `OPENAI_API_KEY` | Server-side extraction provider credential |
| `OPENAI_EXTRACTION_MODEL` | Defaults to the supplied spec's `gpt-4o-2024-08-06`; use an account-supported Structured Outputs model |
| `INTELLIGENCE_LLM_ENABLED` | Must explicitly be `true` after reviewing data/provider permissions |

No real keys are committed. No paid LLM calls or live social ingestion run at startup. The default local API is read-only until the operator configures the bearer token. Ingest only public or otherwise authorised professional posts, with personal patient identifiers removed before ingestion/provider processing. A collection_basis declaration records operator attestation; it does not itself establish legal rights. Before production, establish retention/deletion, access review, privacy and vendor processing policies appropriate to the deployment.

## API

Base: `/api/intelligence`. All responses disable caching. Only `GET /status` and `GET /summary` are unauthenticated. Other routes require `Authorization: Bearer <server token>`. Writes require JSON and accept at most 1 MB.

| Route | Contract |
| --- | --- |
| `GET /status` | Storage/configuration state and taxonomy; no secrets |
| `GET /summary?limit=1000&offset=0` | Public, computed profile-level 2D summaries |
| `GET /hcps?limit=50&offset=0` | Protected cohort registry, including pending dossiers |
| `GET /hcps/:id` | Registry record and current revision |
| `POST /hcps` | `{ "profile": {...}, "reason": "..." }`; creates verified cohort member |
| `PUT /hcps/:id` | Same plus `expected_revision`; verifies a pending dossier or corrects registration/account evidence |
| `POST /ingest` | `{ "posts": [...] }`; 1-100 records, entire batch rolls back on validation/conflict |
| `POST /process` | `{ "limit": 5 }`; max 10; consumes provider usage only when explicitly enabled |
| `GET /analytics?tier=Trailblazer&archetype=Trial_Dissector&hcp_id=...` | Protected 90-day post-level intersection; all filters optional; limit/offset pagination |
| `GET /queue` | Processing states, failures and attempts; protected |
| `GET /safety` | Protected candidate PV screens with source evidence; not submitted cases |
| `POST /safety/review` | platform, post_id, status (`CONFIRMED`/`DISMISSED`), reviewer, reason |
| `GET /audit` | Protected persistent audit trail |

Profile requires hcp_id, name, primary_specialty, medical_registration_year, registration_source_url, verified_by and verified_at. Optional sub_specialties and medical_council_id. A verified platform handle is required before its posts can be ingested:

```json
{"handles":{"x":{"handle":"@exact-account","source_url":"https://source.example/identity-proof","verified_at":"2026-09-28T00:00:00Z"}}}
```

Primary specialties: Endocrinology, Cardiology, Diabetology, General_Practice, General_Medicine, Gynecology_Obstetrics. Platform IDs: x, instagram, youtube, linkedin, substack, podcast, blog.

Raw post requires post_id, hcp_id, platform, timestamp (ISO with timezone), text, source_url, author_handle (exact verified handle), collection_basis (`official_api`, `licensed_provider`, `authorised_manual`, `public_rss`). Optional media_urls, urls, has_media, thread_indicator, engagement. Has-media is metadata only; OCR/video/audio processing is not implemented.

## Background processing and deployment

An authorised scheduler can call `POST /process` in small batches. Failed posts retry at most three times; expired two-minute leases can be reclaimed. Exhausted failures remain inspectable in `/queue` for operator remediation. Aggregates are calculated at read time so old posts age out without a stale cached archetype. No recurring external scheduler is configured by this change.

For Cloudflare Pages, create a D1 database, apply `backend/schema.sql`, and bind it as **INTELLIGENCE_DB**. Configure the token and provider credentials as secrets, not public variables or source files. The existing Pages Function delegates to the same API/store. With no binding or migration, intelligence endpoints clearly report NOT_CONFIGURED/503; the rest of the UI keeps working. D1 does not auto-import dossiers: use the protected registry endpoints with the existing dossier hcp_id to link a verified registration. No Cloudflare resources were provisioned or deployment performed here.

Existing `/api/research`, `/api/social-monitor`, and legacy evidence/safety endpoints remain backward-compatible. The new private intake/PV records are not copied into those public endpoints. New registry-only HCPs are available via the intelligence API; the current Persona UI shows established public dossiers and literature candidates, not private intake-only profiles.

Live X/Instagram/YouTube/LinkedIn connectors, automatic registration verification, speech/OCR extraction and qualified clinical validation are not supplied by this framework. It is not a claim of live platform coverage or validated NLP accuracy.

## Verification and references

Run `npm run check`. Tests cover tier boundaries, invalid inputs, every four-criterion PV combination, window edges, deduplication, provider failures, durable restart, protected routes, atomic ingestion, SQL adapter parity, processing and review. Provider calls are mocked; real model accuracy and a remote D1 deployment need separate evaluation.

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Cloudflare D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [EMA GVP reference](https://www.ema.europa.eu/en/human-regulatory-overview/post-authorisation/pharmacovigilance-post-authorisation/good-pharmacovigilance-practices-gvp), consulted for screening context, not used as an assertion of India-specific regulatory compliance.
