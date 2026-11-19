# Production readiness limits

## Current candidate status (2026-11-19)

- Current checkout: `security/fix-runtime-secrets` at `0fdab70` (checked 2026-11-19). This update changes only this Markdown note; no production deployment or external infrastructure was verified.
- The full test suite passes when local test-server access is enabled. The earlier `EACCES` loopback failures came from test-environment access restrictions; that failed run is stale and is not evidence of current product regressions. The passing suite establishes test status only, not production readiness.
- Cash-out and “Other Income” are not remaining feature work: current client tests assert they are unavailable, and server code rejects unsupported values. Neither is a supported feature.
- The frontend build passed. The main bundle is about 705 KB minified (191 KB gzip); measure it under realistic conditions as a follow-up, but bundle size is not the primary go-live blocker.
- Remaining go-live gates: complete startup/shutdown cleanup; obtain explicit approval and validate cross-Chama database constraints in staging; verify production HTTPS/proxy/firewall/canonical origin; secure and validate PostgreSQL RLS/TLS and Redis TLS/shared sessions, persistent rate limits, and required production secrets; establish scheduled backups and pass an isolated restore; complete manual role-by-role and mobile walkthroughs; run a Chama pilot; clean QA accounts, test records, and PINs; and produce a clean, reviewed release candidate before real users.
- For real lending, legal/data-protection review, operation of the human-review process, and off-app disbursement arrangements remain required; the app does not disburse money.

## Synthetic safeguards check (2026-11-08; historical)

- Focused financial, tenant-isolation, chat-event fallback, repository, and restore tests passed: 23 passed, 0 failed. The standalone frontend regression suite passed: 42 passed, 0 failed.
- Full suite from `chamafork`: `npm.cmd test` passed with 199 passed, 0 failed, and 1 skipped. The skipped PostgreSQL tenant-foreign-key integration requires `TENANT_FK_TEST_DATABASE_URL`; no database connection was used.
- The JSON restore test used only a generated synthetic snapshot and a disposable temporary directory, then verified authenticated reads from the restored local state. The other integration tests used isolated fixtures and loopback servers; M-PESA, email/SMS, Redis, and database environment settings were removed. No production or user records were read or changed, no migration was run, and no outbound payment or messaging provider was contacted.
- Cross-chama behavior has application-level ownership checks and synthetic foreign-read/write regression coverage. The proposed relational tenant constraints remain unapplied; they require a reviewed migration and staging verification before production use.
- These checks do not establish a production backup schedule, PostgreSQL backup, isolated production restore, public HTTPS/proxy configuration, or real-chama workflow. Those remain deployment gates; no participating-chama pilot has occurred.

Evidence checked on 2026-10-20 for this checkout. This note records local observations; it is not proof of a production deployment.

## Local test and startup follow-up (2026-11-01)

- The integration-test subprocesses loaded `chamafork/.env`, which selected the local Redis session store and caused server startup timeouts before test assertions ran. Test mode now skips `.env` loading, forces in-process sessions, and disables Redis. The attendance and main-server integration tests now set `NODE_ENV=test` explicitly.
- Focused verification: attendance and main-server integration tests passed, 9 passed and 0 failed.
- Full verification from `chamafork`: `npm test` passed with 134 passed, 0 failed, and 1 skipped. The skipped tenant-foreign-key database integration requires `TENANT_FK_TEST_DATABASE_URL`; no existing database was used.
- A disposable JSON-backed local server returned HTTP 200 from `/api/health` on `127.0.0.1:18766`. Its data and profile files were directed to the system temporary folder; it was stopped after the check.
- The checkout is on `review-fixes` with local work not pushed to `origin/review-fixes`. No push or deployment was performed.
- The local `.env` still selects PostgreSQL and Redis without TLS; it is not a production configuration. No production host, public HTTPS route, firewall, backup, restore, or real-user workflow was checked.

## Local launch follow-up (2026-10-29)

- At verification start, the checkout was clean on `review-fixes` at `9f56b47`. The live local app answered `/` and `/api/health` on `127.0.0.1:8000`; served frontend files matched this checkout.
- The existing process initially listened on `0.0.0.0:8000`, because the previous development default omitted an explicit bind address. It reported no active sessions or SSE connections when checked. The code now defaults to `127.0.0.1`; both a disposable JSON-backed startup and the restarted app confirmed that listener. The restarted app returns HTTP 200 on `localhost:8000` and `/api/health`.
- `npm test`: 133 passed, 0 failed, 1 skipped after the bind-default and example-environment tests. `npm audit --audit-level=low`: 0 known vulnerabilities.
- The checked-in `.env.example` now supports local startup with JSON, in-process sessions, and proxy trust disabled. Production remains gated by HTTPS/proxy, PostgreSQL and Redis TLS, secret configuration, and the external backup/restore and firewall checks listed below.

## Latest local verification (2026-10-23)

- The full `chamafork` test suite passed: 131 passed, 0 failed, and 1 skipped. The skipped tenant foreign-key integration test was also run separately against a newly created temporary PostgreSQL database: 1 passed, 0 failed. The temporary database was dropped afterward; the existing `chama` database was not modified.
- `npm audit --audit-level=low` reported no known dependency vulnerabilities.
- A fresh production-configuration review still found this machine's local environment unsuitable for production: PostgreSQL and Redis connections are plaintext, and required production origin, proxy, TLS, and metrics-secret settings are not configured. These are local-development observations, not production environment evidence.
- This verification did not test external routing, certificate renewal, firewall rules, production secrets, scheduled backups, or a production restore. Those remain deployment gates.

## Prior local environment observations (2026-10-23 snapshot)

- The application supports JSON and PostgreSQL. Current source defaults to PostgreSQL when `DATA_BACKEND` is unset; set `DATA_BACKEND=json` explicitly for local/test JSON runs. The local `.env` selection was not rechecked in this review.
- A read-only PostgreSQL connection succeeded. The app-role tenant directory contains one chama. Counting records inside that chama's RLS context returned 5 users, 5 memberships, 6 contributions, 1 loan, 4 attendance rows, 1 attendance register, 8 transactions, 24 audit records, 2 messages, 4 invitations, and 4 penalties; dividends, ledger entries, loan repayments, and M-Pesa callbacks were empty. The database has 33 foreign keys.
- `chamafork/data.json` also exists and parses, with 1 user and no transactions, loans, payouts, invitations, leadership changes, attendance registers, audit records, penalties, dividends, or messages. It is not the selected backend; the PostgreSQL snapshot is populated and materially different. Do not run an import from this JSON snapshot over PostgreSQL. The importer is absent from this checkout.
- The application was not listening on `127.0.0.1:8000` during the check, so its active runtime backend and health endpoint could not be verified.
- `NODE_ENV` is unset, so production-only startup validation is not active in this local process environment. PostgreSQL TLS is disabled and Redis uses a plaintext URL. PostgreSQL and Redis were reachable locally, but these settings do not satisfy production requirements.
- Production startup checks require PostgreSQL, `PGSSL=verify-full`, TLS Redis (`rediss://`) for sessions and shared rate limits, trusted HTTPS origins, proxy configuration, and strong session and metrics secrets. These checks validate configuration values; they do not provision or verify the infrastructure.
- PostgreSQL state writes replace a chama's stored snapshot. A database advisory lock rejects a second application runtime, so deployment must run one server process per database. This design does not support horizontally scaled application processes.
- The M-Pesa callback route returns `503`; automated callback settlement is disabled until authenticated, exact-amount reconciliation is implemented.
- No deployment manifests or backup/restore scripts are present in this checkout. No `SECURITY_AUDIT.md` or JSON importer is tracked in this checkout or its available Git history.

## External deployment evidence still needed

- Public HTTPS routing, certificate renewal, trusted proxy behavior, exact allowed origins, and firewall rules that prevent direct public access to the application port.
- Production PostgreSQL certificate verification and network access controls, plus TLS-protected Redis connectivity and availability.
- A scheduled backup policy and a successful restore exercise into an isolated environment.
- Evidence that any credentials exposed in an earlier audit artifact were rotated if they were ever used live. The artifact is absent from the current tracked tree; its historical values and validity were not established here.
- Applicable data-protection and retention controls for the actual deployment.
