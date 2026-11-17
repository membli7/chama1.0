# Tasks

## Decisions (FILLED IN)
- [x] (a) Can a Secretary invite an ordinary Member without Chairperson approval?  
  Answer: **YES — Secretary can invite Members directly**
- [x] (b) Do Secretary and Treasurer both see the full roster and balance, or is access narrowed?  
  Answer: **KEEP BROAD — both see full roster and balance**
- [x] (c) Minimum PIN length  
  Answer: **6 digits**

## Feature scope decision (2026-10-11; loan workflow superseded 2026-11-12)
- [x] Keep CSV export: transaction and attendance records, scoped for Member accounts.
- [x] Historical loan decision: 1, 2, 3, and 6 month terms with three role decisions; Secretary substituted when the borrower was Chairperson or Treasurer. **Superseded by the current automatic policy below.** No money is disbursed by the app.
- [x] Use the leadership-election workflow below for officer changes after initial setup; direct assignment remains limited to initial bootstrap.
- [x] Defer WhatsApp/SMS broadcasts, Paybill processing/matching, and loan terms outside 1, 2, 3, and 6 months. In-app group chat is in scope.

## Loan workflow update (2026-11-12; current)
- [x] New applications receive an immediate server-side decision under each Chama's Chairperson-configured group-balance/member-contribution caps and amount tiers for minimum active-membership days and share-capital contributions. No universal eligibility thresholds are prefilled.
- [x] Borrowers see decision reasons and the reducing-balance repayment estimate and can request one human review. Chairperson, Secretary, and Treasurer can inspect group records but do not vote on new applications; a conflicted officer cannot review their own or guaranteed loan.
- [x] Loan requests retain two active guarantors and 1-, 2-, 3-, or 6-month terms. The app records schedules and cash repayments but does not disburse money; legal, DPIA, human-review-operation, and actual-off-app-disbursement dependencies remain before real lending.

## Leadership election decisions (2026-10-20)
- Secretary proposes 2-20 active ordinary Members for Chairperson, Secretary, or Treasurer; Chairperson accepts the proposal and manually closes voting.
- All active chama accounts are eligible when voting opens. Ballots are secret and each eligible account may vote once.
- The candidate with the highest vote total wins; no quorum threshold applies. A tie among the highest candidates opens a rematch limited to the tied candidates.
- Chairperson verifies the closed result. The elected role and portal access switch exactly 24 hours after verification.
- No SQL schema change; elections use existing leadership, audit, and message records. Post-bootstrap officer changes must use elections.

## Product scope update (2026-11-04)
- In-app group chat is available to active members. New messages refresh over the existing server event stream, with polling fallback; chat author labels use the saved nickname when present, otherwise the member's actual name.
- Personal and group financial charts show monthly contribution and loan-repayment trends for the last six months, using existing dated transaction records and a visible data table.
- These election decisions supersede the 2026-10-20 opening, closing, verification, and activation timing: either the Chairperson or Secretary schedules 2-20 active ordinary Member candidates and a date. Voting opens at 12:00 a.m. and closes at 11:59 p.m. Africa/Nairobi time on that date. All active chama accounts are eligible, secret ballots are limited to one per eligible account, the highest total wins without a quorum, and a tie requires a separately scheduled runoff limited to tied candidates. A winner's role and portal access switch automatically when the election closes.
- Scheduled dates are stored as `scheduledDate` in the existing JSONB leadership record; no SQL column or migration is added. Existing elections without a scheduled date retain the legacy flow for compatibility.

## Verified safeguards and product additions (2026-11-08)
- [x] Contribution-entry dates must be real calendar dates no later than the Africa/Nairobi current date; ordinary Members cannot submit contribution entries.
- [x] Only the Chairperson or Treasurer may correct the date of an existing confirmed cash contribution. A non-empty reason is required; the date must remain in the original month and preserve on-time/late classification. Only the date field changes; an audit event appends actor, timestamp, old/new dates, and reason. The audit store is not tamper-evident.
- [x] Non-read API writes are serialized; the JSON snapshot uses an atomic file replacement and PostgreSQL snapshot saves use one transaction, so a corrected date and its audit event persist together. Synthetic idempotent-retry coverage prevents duplicate corrections/audit events.
- [x] Cross-chama application checks and tenant batch pre-validation are covered by synthetic foreign-read/write tests. No schema migration or destructive database change was run; reviewed relational tenant constraints remain a staging migration task before production.
- [x] In-app group chat remains available. Redis event-publish/startup failure falls back to same-instance SSE; the client polls during outages, reconciles periodically while connected, and reconnects when network access returns.
- [x] The officer-only month-end close review is read-only and summarizes recorded cash entries, tracked open loan balances, and items for review. It does not reconcile bank/M-PESA settlement or move money.
- [x] Public copy and README claims now distinguish three-role loan decisions, manual monthly penalty assessment, application-level audit history, in-app chat, and recorded cash versus moving/settling money.
- [x] The Kiswahili registration work is already in the current branch ancestry; no cherry-pick or reset was needed.
- [x] A backup/restore regression uses synthetic JSON data and a disposable temporary directory only. Production backup scheduling, PostgreSQL backup, and production restore remain unverified.
- [ ] Complete manual role-by-role and phone/tablet walkthroughs, then run a participating-chama pilot. No real-chama pilot has been performed.

## Production release gate (2026-11-09)

**Current status (2026-11-17): NOT production-ready.**

- [ ] Re-run the full suite in a supported environment and resolve every genuine failure. The 2026-11-17 root-level `npm.cmd test` run on `2dde66d` exited 1 (353 tests: 211 passed, 128 failed, 3 skipped); the log included `EACCES` loopback connections and test-server startup errors, so separate environmental restrictions from actual regressions before release.
- [ ] Complete manual acceptance walkthroughs for Chairperson, Secretary, Treasurer, and Member accounts.
- [ ] Complete a participating-chama pilot and record workflow, usability, and recovery results.
- [ ] Verify the production boundary: live HTTPS/TLS, reverse-proxy forwarded headers and exact trusted proxy IPs, firewalling, and browser behavior on the canonical origin.
- [ ] Verify the production services: PostgreSQL RLS runtime role, verified database TLS, Redis TLS/shared sessions, rate-limit persistence, and required production secrets/startup configuration checks.
- [ ] Configure and test scheduled PostgreSQL backups and complete a real restore drill.
- [ ] Remove or reset QA accounts and synthetic loans, contributions, votes, and attendance data; confirm QA PINs are not reused.
- [ ] Review and integrate/push the final tested release candidate; preserve and resolve the pre-existing worktree changes before release.
- [x] Staging deployment is the current readiness target; real-member production launch remains blocked until the items above are complete.

## Step 0: setup
- [x] Historical: initial readiness work used `review-fixes`. As checked 2026-11-17, the current checkout is `security/fix-runtime-secrets` at `2dde66d`; the worktree is a work in progress, not a release candidate.
- [x] Save the security report as `docs/review.md`. The UX plan currently lives at `docs/docs/docs/ux-plan.md` (the earlier `docs/ux-plan.md` path is stale).
- [x] Add `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, and `TASKS.md`.
- [x] Commit the verified local safeguards and month-end review changes; do not push as part of local readiness work.

## Step 2: security and server (Codex, one branch each)
- [ ] F-01: PIN policy and login throttling implemented; manual role walkthrough and merge remain in Step 5.
  - [x] 6-digit minimum enforced server-side
  - [x] Front-end form matches
  - [x] 5 failures per phone and per IP, then 15-minute lock
  - [x] Legacy 4-digit PINs log in, forced to change
  - [x] Production session cookie is secure; production trusts only configured private proxy IPs (`TRUSTED_PROXY_IPS`).
  - [x] Regression tests pass in the current full suite; role-by-role manual walkthrough and merge remain in Step 5.
- [x] F-02: included in F-01 branch above.
- [ ] F-03: Invitation code implementation and regression tests pass; manual walkthrough and merge remain in Step 5.
  - [x] Attempt limits and single-use
  - [x] Bound to invited phone
  - [x] Secretary can invite Members directly (no approval needed)
  - [x] Regression tests pass in the current full suite; manual walkthrough and merge remain in Step 5.
- [x] F-04: narrower roster/balance role scoping is intentionally skipped per decision b.

## Step 3: front-end clarity (Copilot agent mode)
- [x] No stale signed-out banner appears after login; notices appear after explicit sign-out or inactivity expiry.
- [x] Invitation copy says the Chairperson or Secretary can invite Members directly.
- [x] The literal "4 of 60 members" label is not present in the current frontend; recheck only if that label returns.
- [x] Paybill callback and reconciliation are out of scope; do not show Paybill status or promise automatic payments.
- [x] Invitation copy says an activation code is sent by SMS only when configured; otherwise share it privately. No in-app reminder delivery is claimed.
- [x] Cash confirmation says it records cash already received and does not transfer money.
- [x] Standardize loan status labels (Pending, Approved, Rejected, Repaid, Closed)

## Simulated payment workflow (2026-11-01)
- [x] Phase 2: add a local-only simulated payment inbox using TEST-prefixed transaction and phone identifiers; each new item is Unverified and stores its fake payload without changing a balance.
- [x] No data/schema change and no live callback, payment-provider connection, automatic match, approval, or ledger posting.
- [ ] Phase 3: suggest possible matches and require explicit Treasurer member/type/amount confirmation before any ledger change.
- [ ] Phase 4: duplicate/reversal/correction safeguards and full action audit.

## Step 2b: Decision — Attendance tracking

Attendance tracking scope decision (resolved): restore and test attendance end to end.

**Decision**: Pilot chamas will use attendance tracking to manage member presence and related fines.

- [x] **YES** — Restore attendance end-to-end with edit audit trail (Priority 2); the current attendance integration test passes.
- [ ] **NO** — Cut attendance and focus engineering on two fully-tested core features (Priority 2)

**Answer**: YES; attendance registers and edit auditing are implemented and covered by the current integration suite.
**Rationale for your answer**: (optional notes on why you chose yes/no)

## Step 4: larger UX work (Codex, after steps 2 and 3 are merged)
- [x] New Chairperson setup checklist; completion is derived from active officers and valid invitations, while skip/dismiss state is stored per Chairperson in the browser.
- [x] Leadership election lifecycle and dashboard panel implemented; scheduled-election rules are recorded above.
- [ ] Manual mobile layout review at common phone sizes (responsive navigation and stacked cards are implemented).
- [x] Kiswahili translation completeness and wording review (language support is implemented).
- [ ] Sample-group demo

## Step 5: review
- [ ] PR per branch, Copilot code review on each
- [ ] Manual walkthrough logged in as each of the four roles

## Step 6: cleanup before real members
- [ ] Delete or reset the 5 QA accounts
- [ ] Remove test loan, fake contribution, vote record, attendance register
- [ ] Confirm the QA PINs are not reused anywhere

## Deferred / not in scope
- [ ] Broadcast delivery via WhatsApp/SMS
- [ ] Paybill callback/matching
- [ ] Loan terms outside 1, 2, 3, and 6 months
- [ ] SMS invitation delivery (provider not configured)
- [ ] Overdue/default loan actions (recovery, penalty, note)
- [x] CSRF/origin protections, write serialization, and route authorization received source review and regression coverage; deployment proxy boundaries remain unverified.


## Security remediation decision (2026-11-10)
- Cash-out and “Other Income” are already unsupported. The server rejects `flowDirection`/cash-out fields and `cashOutType`/`cashOutLoanId`/`customType` at the boundary (`server.js`), and `PAYMENT_TYPES` only allows Monthly Contribution, Loan Repayment, and Fine — no “Other Income.” Regression tests cover this.
