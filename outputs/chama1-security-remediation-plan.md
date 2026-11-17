# Chama 1.0 Security Remediation Plan

**Prepared:** 2026-11-10  
**Basis:** Read-only source audit of commit `510d3f768a9a91452883934f06753ea756de3e6a` and the project decisions in `TASKS.md`.  
**Scope:** Security and production-readiness findings in the latest audit. M-Pesa/provider callbacks and simulated-payment implementation are excluded. No code, schema, configuration, database, or Git history changes are part of this plan.

## Executive recommendation

At the time of the 2026-11-10 audit, the application was not cleared for production: its cash-entry contract was unresolved and deployment recovery/perimeter gates lacked evidence. For tenant integrity, the audit distinguished three states: (1) an approved design, which is not enforcement and does not clear the release gate; (2) a migration implemented and validated in staging with evidence, after which the technical gate can be considered met subject to separate deployment authorization; or (3) a deliberate deferral recorded with an owner, rationale, compensating controls, and residual-risk acceptance. Deferral is not completed enforcement and does not by itself clear the production gate. At that time, the form/API mismatch and missing tenant-aware foreign keys were visible in source; setup exposure, partial-startup impact, and production recovery needed deployment validation; session metrics and map bounds were hardening work.

**Current disposition (2026-11-17):** The cash-entry mismatch described in the original P0 finding has since been addressed in the current source: cash-out and “Other Income” are not offered, and unsupported values are rejected. The focused client cash-entry tests passed in the current full-suite run. Overall verification remains blocked: `npm.cmd test` on `2dde66d` exited 1 (353 tests: 211 passed, 128 failed, 3 skipped), with loopback `EACCES` and test-server startup errors. This update supersedes the original cash-entry P0 as an implementation task, but does not clear the production no-go; the test, deployment, tenant-integrity, recovery, manual/pilot, and cleanup gates remain open. See the [current production-readiness status](../docs/docs/production-readiness.md).

This is a remediation plan, not authorization to implement schema changes, touch a live database, change payment integrations, or deploy. Project rules prohibit changing the data format/schema without approval. If a remediation requires that, stop at the decision gate and request explicit authorization.

## Decisions required before implementation

Record these decisions in `TASKS.md` before changing business behavior:

1. **Cash-out and “Other Income” — resolved 2026-11-17:** They are unsupported in the current product: the UI omits them and the server rejects unsupported values. Do not add them without a separate product decision specifying eligible roles, transaction types, accounting effect, audit details, correction/reversal rules, and whether member/loan fields apply.
2. **Accounting model:** Is Chama a cash-entry register or a balanced double-entry ledger? The source contains a `ledger_entries` table and stores/loads rows, but this audit found no application posting logic that creates balanced journals. Do not claim double-entry consistency or add journal constraints until the product requirement is decided.
3. **Tenant database enforcement:** The composite-FK and JSON-link proposals require schema changes. Approve or decline that schema work explicitly before any migration is registered or run. The current project rule is to stop and ask rather than change schema implicitly.
4. **Deployment target:** Confirm staging is disposable, isolated, and distinct from production before any later SQL or integration test. This audit did not establish the current staging database identity or run SQL.

## Priority 0 — Financial-entry UI/API mismatch (implementation addressed; verification open)

**Finding at the 2026-11-10 audit:** The cash form used `name="reason"`, but the ordinary cash handlers read `req.body.note` and require a 3–500 character note. The form also offered cash-out controls and “Other Income”; the reviewed submit handler routed by `paymentType`, did not map `flowDirection`, and the server’s accepted types did not include “Other Income.” Sources: `en public/index.html:508–541`, `en public/chama.js:1113–1136`, `chamafork/server.js:123, 1947–1968`.

**Status (2026-11-17):** The current UI omits cash-out and “Other Income,” and the server rejects unsupported values. Focused client checks passed; the full suite failed, so server-side financial acceptance still needs a clean verification run.

**Original plan (2026-11-10):**

- After the business decision above, align the field contract so the submitted payload uses the server’s canonical `note` field. Keep server-side validation authoritative.
- If cash-out and other-income are not approved, remove or disable those controls and reject unsupported values on the server. Do not merely hide controls while leaving undocumented API behavior.
- If they are approved, design the complete server-side cash-flow transition first: authenticate and authorize the actor, bind the member/loan to the same chama where applicable, validate the category and amount, append an audit event, prevent duplicate writes, and persist the cash entry and its audit record atomically. Do not implement any provider payment or money-transfer behavior as part of this task.
- Ensure the confirmation dialog accurately says what the endpoint will record. Keep “recorded cash” distinct from money movement or reconciliation.

**Original tests and acceptance criteria:**

- Add client contract tests asserting the exact `FormData` to JSON mapping and selected endpoint for every supported option.
- Add server integration tests for valid notes, missing/short/long notes, unsupported types, unsupported directions, invalid tenant IDs, repeated idempotency keys, and successful audit/persistence.
- Verify a cash-out selection cannot be stored as an inflow. If the feature is intentionally unsupported, verify the UI does not offer it and the API rejects it.
- Run the focused financial/client tests, then the full `npm.cmd test` suite from `chamafork` before marking the implementation complete.

**Current gate:** P0 verification remains before pilot or production use of this form. New cash-out semantics require a separate product decision.

## Priority 1 — Close the tenant relationship integrity gap (approval-gated schema work)

**Finding:** RLS scopes database access, but active typed foreign keys do not consistently require parent and child rows to share `chama_id`. JSON-held links (for example loan guarantors, approval actors, repayment actor IDs, audit references, and attendance history) need additional consistency controls. The current proposals are unregistered and unapplied. Evidence: `chamafork/db/001_foundation.sql:34–100, 120–135`, `chamafork/db/migrate.js:41–46`, and the proposal documents.

**Plan:**

1. **Do not run or register a migration yet.** First obtain explicit approval for schema/data-integrity changes under the project’s no-schema-change rule.
2. Review the existing design in `chamafork/db/proposals/tenant_foreign_keys.sql` and `tenant_integrity_design.md`. Treat it as a design/validation contract, not deployable SQL.
3. Resolve the migration-runner replay problem before adding a one-time tenant-integrity migration. The proposal states that replaying its installation block after validation can reset constraints to `NOT VALID`; a durable versioned migration record or separately gated run-once procedure is required.
4. In an approved disposable staging database, run read-only preflight reports for typed cross-chama links, missing targets, duplicate/missing logical IDs, JSON/typed-copy disagreements, unclassified audit entity types, and legacy sentinels. Stop on unexplained rows; do not auto-rewrite financial or audit records.
5. Only after the preflight and migration plan are reviewed, install constraints in staging, test cross-chama rejection for each relationship type, and validate constraints as a separate gated step. Use the runtime role to test RLS. Test the actual `saveState` delete/replace order and rollback on invalid references.
6. Retain a restorable backup and a rollback plan. Production execution requires separate approval and successful staging evidence.

**Tests and acceptance:**

- Extend the synthetic tenant tests to cover all relationship classes in the approved plan, including same-chama success, cross-chama rejection, copy mismatches, nulls/sentinels, updates/deletes, and transaction rollback.
- Run the PostgreSQL integration test only after the database URL is verified as the disposable staging target. Never point it at production or an unidentified local database.

**Priority:** P1 release gate. Relative effort: large. No schema changes authorized by this plan.

## Priority 1 — Make startup and shutdown cleanup deterministic

**Finding:** Startup rejection logs and sets an exit code, but does not call the cleanup routine registered on the HTTP server’s `close` event. If startup has already acquired the PostgreSQL runtime lock or opened dependencies, cleanup can be skipped. Signal handling also has no visible bounded drain and does not await dependency cleanup. Sources: `chamafork/server.js:2725–2790`.

**Plan:**

- Extract one idempotent cleanup routine that tolerates partially initialized resources and can be called from both startup failure and normal shutdown.
- Track which resources were acquired; close/release each safely in reverse acquisition order. Preserve and report the original startup error if cleanup also fails.
- On SIGINT/SIGTERM, stop accepting new requests, drain active requests/SSE connections for a configured deadline, then close remaining connections if the supported Node runtime permits it. Await session-store, Redis, PostgreSQL pool, and advisory-lock cleanup before resolving shutdown.
- Confirm the supported Node.js version and deployment termination grace period before choosing APIs/timeouts.

**Tests and acceptance:** Inject failure after each startup stage (lock acquisition, state load, session connection, Redis setup, election processing, listen) with fake dependencies. Assert each acquired resource is released exactly once. Add shutdown tests for active SSE and delayed requests, cleanup rejection, and deadline expiry. No real services are required for unit tests; integration checks must use isolated local dependencies.

**Priority:** P1 before a managed deployment. Relative effort: medium.

## Priority 1 — Establish backup and restore evidence

**Finding:** Repository documentation explicitly says scheduled PostgreSQL backups and an isolated production restore are unverified. This is an evidence gap, not proof that external backups are absent. Sources: `docs/docs/production-readiness.md:5–9, 46–52`; `TASKS.md:39, 48`.

**Plan:** The deployment owner should document backup owner, schedule, encryption, key custody, retention, monitoring/alerting, recovery-point objective (RPO), recovery-time objective (RTO), and restore procedure. Perform a restore into an isolated non-production environment and record the result, duration, and integrity checks. Include PostgreSQL, required configuration/keys, and any separately stored profile assets as applicable. Never test restore by overwriting the live database.

**Acceptance:** A recent successful isolated restore is recorded; backup failure alerts are tested; restoration instructions are reproducible by someone other than the original operator. Production remains blocked until this and the other `TASKS.md` release gates are complete.

**Priority:** P1 production release gate. This is primarily an operations task.

## Priority 2 — Harden setup and login abuse controls

### Bootstrap secret

`/api/setup` enforces `SETUP_BOOTSTRAP_SECRET` only when it is configured (`server.js:1261–1264`). Production validation requires it, and the default bind host is loopback, but non-production environment/bind settings were not observed.

- Validate the effective `NODE_ENV`, `APP_BIND_HOST`, proxy and firewall for each deployment.
- Keep local loopback setup usable if desired, but require a bootstrap secret or fail startup when setup could be externally reachable outside production validation.
- Add tests for empty/unset secret on loopback, non-loopback bind, production validation, incorrect secret, and already-completed setup. Never log the secret.
- Do not treat the loopback default as proof that a deployed reverse proxy cannot expose the route.

### Login-failure map bound

The non-production process-local failure map can exceed its configured cap if all entries are locked (`server.js:153–155, 259–290`).

- Choose a hard-bound policy that does not silently discard active lockouts. Options include a shared bounded store or rejecting new distinct failure keys when at capacity while preserving existing locks.
- Avoid storing raw phone/IP identifiers unnecessarily; retain the project’s existing privacy controls and expiry behavior.
- Add deterministic tests for cap, all-locked state, expiry, per-IP limiter interaction, and lockout preservation.

**Priority:** P2 unless deployment validation finds an externally reachable non-production instance; in that case escalate setup protection to P1.

## Priority 2 — Correct metrics and audit-history expectations

- `activeSessionsGauge` increments at sign-in and decrements on explicit logout, but expiry destroys a session without decrementing it (`server.js:616–619, 1316, 1416`; `observability.js:40–47, 58, 112–113`). Either reconcile it from the authoritative session store or rename/document it as an approximate process-local counter. Test login, logout, expiry, reset/revocation and restart behavior.
- Keep request IDs, structured logs, health/readiness checks, HTTP metrics, and existing sensitive-field protections. Add alert rules and verify the metrics endpoint’s deployment authentication; these external controls were not observed in this audit.
- The project decision explicitly says the audit store is not tamper-evident (`TASKS.md:32`). Do not claim otherwise. Decide whether append-only/tamper-evident records are a requirement. If yes, threat-model the change and seek schema/retention approval before changing privileges, storage or introducing an external audit sink.

**Priority:** P2 for gauge accuracy; audit-log immutability is a decision and architecture task, not an asserted exploitable vulnerability.

## Priority 3 — Migration governance and scale

- Migration runner `chamafork/db/migrate.js:34–53` executes a fixed list transactionally but has no visible applied-version/checksum ledger or migration-specific lock. Design a run-once/versioning mechanism before adding non-idempotent migrations. Avoid combining destructive changes with automatic startup.
- Migration 006 adds child-side FK-support indexes with a five-second lock timeout (`db/006_fk_support_indexes.sql:6–64`) and is already registered. Preserve this work; the earlier missing-index concern is not an active finding in this audit.
- Snapshot persistence clears and rewrites tenant repositories in a transaction (`repo/postgres-state.js:468–531`). The readiness notes state one server process per database (`docs/docs/production-readiness.md:44`). Benchmark with representative synthetic data and realistic record counts. If it no longer meets an agreed latency/lock budget, propose targeted writes separately; that is an architectural/data-format decision, not an automatic refactor.
- The README/source mismatch about the default `DATA_BACKEND` was corrected on 2026-11-17 in `README.md` and `docs/docs/production-readiness.md`. A source-level default assertion exists in `chamafork/test/server.integration.test.js`; full-suite verification still needs a passing rerun.

**Priority:** P3 unless measurement or deployment evidence escalates it.

## Verification and rollout gates

For each implementation ticket, use its own branch and focused tests; preserve unrelated work. Before merge, require:

1. Targeted unit and API/integration tests for the changed behavior.
2. The full `npm.cmd test` suite from `chamafork` on the final candidate commit.
3. A dependency advisory scan using an approved environment; the latest audit did not re-run `npm audit`.
4. PostgreSQL tenant integration tests only against a positively identified disposable staging database after explicit schema approval.
5. Role-by-role Chairperson, Secretary, Treasurer, and Member walkthroughs, plus the participating-chama pilot already required by `TASKS.md:40, 44–51`.
6. Deployment evidence for HTTPS, proxy trust, firewall, PostgreSQL/Redis TLS and roles, rate-limit persistence, backups, and restore.
7. QA-account and synthetic-record cleanup before real members, as listed in `TASKS.md:49, 113–116`.

**No-go:** Do not launch with the cash form contract unresolved, no recovery evidence, an unresolved tenant-integrity decision, or unverified production network/storage controls. Do not enable M-Pesa, callbacks, settlement or simulated-payment approval as part of this plan.

## Status of previously discussed items

- **Ledger reload:** current code loads and restores ledger rows (`repo/postgres-state.js:534–554, 579–581`); do not report the earlier missing-load concern as current.
- **PIN reset:** current helper revokes the account’s sessions before consuming the challenge and persisting the new PIN (`security/pin-recovery.js:14–31`; route `server.js:1391–1412`). Preserve this ordering and retain regression tests.
- **OTP:** current flow requires OTP plus the current PIN and preserves the existing account data format; no PIN-policy metadata migration is proposed here.
- **FK support indexes:** migration 006 is registered; keep it. The open issue is tenant-aware relationships, not the previous child-index gap.

## Scope and limitations

This plan is based on source and tracked documentation only. It does not establish current production exposure, live database state, actual backups, or whether untracked external infrastructure controls exist. M-Pesa/payment-provider implementation remains excluded. No source code, schema, configuration, database, or Git history has been changed as part of producing this plan.
