# X network candidate discovery

This is a one-hop, operator-driven discovery connector, not a verified doctor census or a recursive crawler. No UI changes. LinkedIn and Instagram graph collection is not implemented.

## Setup

Apply `backend/schema.sql` to D1 before cloud use (local startup applies it automatically). Configure the protected API token as described in README.md, then set server-side `X_BEARER_TOKEN` and `X_DISCOVERY_ENABLED=true`. Never put tokens in the browser. Official X API access and any applicable usage charges are the operator's responsibility. Enable only after confirming access and budget.

The seed must be a verified HCP in the existing backend with a separately verified X username, source URL and verification timestamp. Supplied draft profiles are not automatically accepted as verified seeds. A current username lookup resolves the account ID before collecting edges; account ownership evidence still requires human review.

## Protected endpoints

- `POST /api/intelligence/network/discover`: JSON `{ "seed_hcp_id": "existing-verified-id", "direction": "following" }`. Direction can also be `followers`.
- Each request makes at most two X requests (identity lookup, one page of at most 100 accounts). It does not loop, auto-retry, or expand candidates.
- Pass the returned `next_token` as `pagination_token` with the same seed and direction to continue. `END_OF_TRAVERSAL` means only that this response had no continuation, not that all seeds or the entire network have been covered. Runs persist continuation tokens for resumption.
- `GET /api/intelligence/network/candidates?limit=50&offset=0`: unique X account candidates, bio matches, declared location and count of distinct connected seeds.
- `GET /api/intelligence/network/runs`: page counts, continuation and timestamps. Counts are per page, not additive population estimates; use unique candidate total for deduplicated size.

Failures and partial API errors stop without retry or candidate writes. Rate limit responses remain HTTP 429. Replaying a page updates candidates/edges without duplicating them. Candidate rows and edges are committed atomically with the run/audit record.

## Interpretation

Explicit clinician roles and bounded credentials are clinical signals only. MD, DM and Consultant alone are ambiguous, not high-confidence medical matches. Generic nonmatches are counted but not retained. This English-language heuristic misses some spelling variants and languages and can match institutional accounts; it needs measured precision/recall before scaling.

Every retained account remains UNVERIFIED for identity and Indian clinical practice. A location string is not proof. No registration year, experience tier, opinion-leader label or engagement statistic is inferred from a follow or a bio. Review institutional evidence, medical registration, account ownership and actual authored content before adding a profile through the existing verified HCP workflow. Network connections are not endorsements or proof of influence.

Screening version `bio-2` also records all specialty signals, distinguishing self-described roles from topics or affiliations. A single explicit role yields a suggested specialty only; the verified primary specialty remains null. Internal medicine maps to General Medicine, not General Practice. MBBS alone assigns neither. Surgeons are retained for scope review without inventing an in-scope specialty. Credentials can appear in the name or bio. Explicit qualification/registration year phrases are stored as unverified `year_clues`; unrelated dates are ignored, future dates are excluded using the processing year. Neither clues nor missing dates populate the registration year or experience tier. There is no 2010 sentinel. Previously stored candidates acquire the updated assessment when recollected.

The claimed 5,000-12,000 yield and hours-to-completion have not been validated. No live collection is performed without configured credentials and verified seeds. Tests use synthetic fixtures only and never seed production data.

Official reference: https://docs.x.com/x-api/users/follows/introduction
