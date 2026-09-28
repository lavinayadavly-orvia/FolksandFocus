# DOLytics Metabolic Intelligence

A professional, locally runnable product prototype for governed obesity and metabolic expert intelligence in India.

Run `npm start`, then open `http://127.0.0.1:4174`. Run `npm test` for the domain model tests.

Cloudflare Pages serves the static application from the repository root and runs the API through `functions/api/[[path]].js`. No build command is required; the output directory is `.`.

The service models resolved HCP identities, source-linked evidence, verified social accounts, post-level metric observations, governed safety-case transitions, expert audit cards, and audit events. The current dependency-free runtime exposes the same contracts from the local Node server and Cloudflare Pages Functions. A production implementation should map these entities to PostgreSQL, keep source snapshots in object storage, and add a queue only when ingestion volume requires it. Graph projections should contain verified peer interactions only.

Safety detections are potential cases only and must remain human-reviewed. The current HCP, publication, institution, news and social-account records are public-source dossiers with explicit source URLs and review states. Empty safety and claim queues remain empty until an authorised source is connected. Analyst tiers are classifications, not clinical-authority scores.

# DOLytics

## Two-axis intelligence backend

The registration-based experience and independent 90-day behavioral framework is implemented in the existing Node/Cloudflare runtime. See [backend setup, API contracts and operational limits](backend/README.md). Local data is persisted outside the web root; production requires a Cloudflare D1 binding. Existing UI styling and navigation are preserved.

## Social Listening

The Social Listening tab (`#listening`) presents the Obesity Voices India specialist listening wave (67 coded statements from 37 voices, Mar 2025 to Sep 2026). Data lives in `listening-data.mjs`; every chart is computed from the statement ledger, and `listening.test.mjs` checks the ledger against the published aggregates. Source labels are carried over from the report; direct URLs still need to be re-attached.
