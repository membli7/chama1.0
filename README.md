# Jirani Chama — MVP

A web app for running a savings chama: cash contributions with a welfare fee, member loans with guarantors, penalties, dividends, in-app group chat, and a read-only month-end close review. The server is Node.js and Express, local development uses a JSON data file, and production can use PostgreSQL. React/Vite frontend source is in `en public/react`; existing HTML and vanilla-JavaScript controllers remain mounted as a compatibility bridge during the migration. The frontend supports English and Kiswahili; translation coverage still needs a review.

This README describes the state at the end of the sprint. Anything not listed under "What it does" is not built.

## What it does

**Contributions** (`POST /api/contributions`)
- Cash only. Each entry needs a member, an amount, a 3–40 character reference number, a date (YYYY-MM-DD), and a note.
- The server rejects impossible and future dates. Only the Treasurer can record a contribution; ordinary Members cannot submit or backdate one.
- A confirmed cash contribution's date can be corrected only by the Chairperson or Treasurer, with a non-empty reason. The new date must stay in the original month and preserve on-time/late status; the amount, member, and other transaction fields do not change. The correction appends an audit event with actor, time, old/new dates, and reason.
- The KES 500 welfare fee is charged on a member's first payment in each calendar month. The rest goes to the member's share capital, and the welfare fee goes to the welfare reserve.
- Payments are applied in this order: outstanding penalties, then the welfare fee, then share capital. The amount must cover penalties plus the welfare fee.
- Legacy payments were backfilled once with the same split. Backfill is idempotent.

**Penalties**
- A late-dated contribution can create the configured late-payment penalty when the Treasurer records it. The default deadline is the 5th of each month.
- `POST /api/settings/meeting-date` (Chairperson or Secretary) sets a different deadline for one month.
- `POST /api/penalties/assess` (Chairperson or Secretary) runs after a month's deadline. It gives an outstanding KES 200 penalty to each active member who paid less than KES 500 by then. Each member is penalised once per month, and members with a late-payment penalty for that month are skipped.

**Loans** (`POST /api/loans`, `POST /api/loans/policy`, `GET /api/loans/estimate`, `POST /api/loans/:id/review-requests`, `POST /api/loans/:id/reviews`, `POST /api/loans/repay`)
- Eligibility is configured per Chama by its Chairperson. A policy sets the maximum share of recorded group balance, the maximum share of each borrower's recorded share-capital contributions, and amount tiers with minimum active-membership days and share-capital contributions. No universal numeric thresholds are prefilled; a Chama without a saved policy cannot submit a loan application.
- An application is assessed immediately against those rules and records an automatic approval or rejection with its reasons, criteria inputs, and policy version. Chairperson, Secretary, and Treasurer accounts can inspect group records but do not vote on new applications. A borrower may request one post-decision human review from a non-conflicted officer.
- Guarantors: exactly two different active members of the same Chama, not the borrower. Their combined unpledged share capital must cover the principal. Pledges are locked for approved loans until principal is repaid.
- Interest: the Chama's saved monthly rate, with a reducing-balance model only. The authenticated, read-only estimate endpoint returns estimated interest, total payable, and each installment before submission; an approved record snapshots the rate and schedule. New terms are 1, 2, 3, or 6 months. The current UI does not support changing the rate after setup.
- The app records schedules and Treasurer-entered cash repayments but does not transfer or disburse money or verify an off-app advance. Confirm the actual amount/date advanced and final written terms before treating a projected schedule as funded debt.
- Repayments pay interest first on the earliest installment, then principal. Guarantor pledges are released as principal falls.

**Dividends** (`POST /api/dividends/calculate`, `POST /api/dividends/commit`; Chairperson or Treasurer)
- The pool is interest and paid penalties dated within the cycle, minus admin expenses.
- Each active member's share is pro-rata to share capital, rounded to whole shillings. Leftover shillings go to the largest remainders, with ties going to the member ID that sorts first, so payouts add up to the pool exactly.
- Calculate changes nothing. Commit recalculates and rejects the request if the payouts differ from the current figures, adds each dividend to share capital, and is refused for cycles that overlap a cycle already paid out.

**Attendance**
- The Secretary can record and revise meeting attendance registers. Edits are retained in the audit trail.

**In-app group chat** (`GET /api/messages`, `POST /api/messages`)
- Active accounts can exchange group messages within their chama. The authenticated event stream carries message updates; clients poll while the stream is unavailable and continue periodic reconciliation after reconnecting.
- WhatsApp/SMS broadcasts and chat by email are not available.

**Month-end close review** (`GET /api/monthly-close?month=YYYY-MM`)
- Chairperson, Secretary, and Treasurer can view a read-only summary of recorded cash contributions and repayments, tracked open loan balances, and items to review such as pending loans or incomplete cash references.
- It does not reconcile bank or M-PESA statements, verify external settlement, or move money. It is a practical close checklist, not a claim that records are externally settled.

**Leadership elections**
- After initial setup, the Secretary proposes 2–20 active ordinary members for an officer seat. The Chairperson opens voting and manually closes it; each eligible chama account may cast one secret ballot. The Chairperson verifies the result, and the role change takes effect 24 hours later. A tie for the highest vote opens a runoff among tied candidates; no quorum threshold applies.

**Audit log** (`GET /api/audit-log`; Chairperson or Treasurer)
- Records payments, contributions and date corrections, penalties, loan requests and decisions, repayments, pledge releases, officer changes, meeting-date changes, backfill, and dividend batches.
- A contribution correction changes only the stored date and appends its before/after details to the audit log. The app has no endpoint that edits or deletes audit entries, but the log is not tamper-evident: anyone with access to the underlying storage can change it.

## Install and run

Requirements: Node.js `^20.19.0` or `>=22.12.0` (tested on Node 24), on Windows PowerShell or any shell.

1. Install dependencies:

   ```powershell
   cd chamafork
   npm install
   ```

2. Create the environment file. Copy `chamafork/.env.example` to `chamafork/.env` and set `SESSION_SECRET` to a long random string:

   ```powershell
   Copy-Item .env.example .env
   ```

   `PORT` defaults to 8001. `CHAMA_DATA_FILE` optionally moves the data file; by default it is `chamafork/data.json`. The Africa's Talking settings are optional. Without them, invitation codes are shown once on screen instead of being sent by SMS.

3. Start the server:

   ```powershell
   npm start
   ```

   Or from the repository root, `npm start` runs the same thing.

4. Open `http://localhost:8001`.

On first run with no data, the screen offers first-time setup. This creates the first Chairperson, using a name, a Kenyan phone number, and a 6–12 digit PIN.

## Setting up roles and logging in

There are no default accounts and no default PINs. Set them up as follows.

1. **Chairperson:** create the account with the first-time setup screen.
2. **Members:** the Chairperson or Secretary invites each person with a name, Kenyan phone number, and email address. The invitation shows a one-time activation code. The person enters their phone number, the code, and a PIN of their own choosing on the activation screen. Activated accounts start as Members.
3. **Officers:** direct assignment is limited to initial setup. After setup, the Secretary proposes 2–20 active ordinary members for an officer role; the Chairperson opens voting and closes it manually; eligible group accounts vote once by secret ballot; then the Chairperson verifies the result. A verified role change takes effect after 24 hours. A tie for the highest vote opens a runoff among the tied candidates; there is no quorum threshold.
4. **Logging in:** each account signs in with its phone number and PIN at the sign-in screen. Use a separate browser profile or private window for each role. Accounts with a temporary PIN must change it before they can use the dashboard.

Suggested test order: Chairperson, then Secretary, then Treasurer, then a few members. Then record a few contributions, request a loan with two guarantors, approve it, repay it, assess penalties after a month's deadline, and run a dividend preview.

## Running the tests

From `chamafork`:

```powershell
npm test
```

This runs the Node.js built-in test runner (`node --test`) over `chamafork/test/`. Each integration suite starts its own server with temporary data. On 2026-11-08, `npm.cmd test` passed with 199 passed, 0 failed, and 1 skipped; the skipped PostgreSQL tenant-foreign-key integration requires `TENANT_FK_TEST_DATABASE_URL`. Test mode ignores `chamafork/.env` and uses in-process sessions; this run also removed payment, messaging, Redis, and database environment settings.

The frontend suite includes responsive-layout, bilingual-copy, and interaction-wiring regressions. This code/test pass did not include a fresh manual browser/device walkthrough or a participating-chama pilot.

## Known limits (not built or not verified)

- **Pilot and manual walkthrough:** automated frontend checks do not replace a role-by-role walkthrough with participating chamas. No real-chama pilot has been performed.
- **Language:** English and Kiswahili are available in the interface. Translation completeness and wording have not been reviewed end to end.
- **Payments:** the app does not initiate M-PESA STK requests or live subscription charges. A sandbox-only inbound C2B subscription verifier is disabled until public HTTPS validation/confirmation URLs are registered and the shortcode-to-group map is valid. Bank reconciliation is not available; existing cash entries remain unchanged.
- **Messages:** in-app group chat is available with event-stream updates, polling during outages, and periodic reconciliation. External WhatsApp/SMS broadcasts and email chat are not available. Invitation-code SMS delivery is optional and live provider delivery has not been verified.
- **Security:** no two-factor authentication or tamper-evident audit chain. Application-level cross-chama checks and tenant-safe write validation have regression coverage; the proposed relational tenant-constraint migration has not been applied. This is not an independent penetration test or deployment verification.
- **Data:** `DATA_BACKEND` selects JSON or PostgreSQL and defaults to PostgreSQL when unset. Set `DATA_BACKEND=json` explicitly for local/test JSON runs; production startup requires PostgreSQL. The PostgreSQL snapshot writer allows only one server process per database. See [production readiness limits](docs/docs/production-readiness.md) for the verified local state and infrastructure items that still need deployment evidence.
- **Legacy loans:** approved loans created before the schedule change have no schedule, so they carry no interest. They repay against principal only.
- **Penalties:** outstanding penalties are applied before welfare and share capital. A late-dated contribution can add its configured late penalty at entry; the separate monthly assessment for members below the welfare threshold runs only when a Chairperson or Secretary calls the endpoint.
- **Backup/restore:** a synthetic JSON backup and restore is verified in a temporary test directory. No production backup schedule, PostgreSQL backup, or production restore has been verified.
- **Dividend preview:** it shows the combined pool, not the penalty and interest split.
- **Document vault, minutes, noticeboard, goals, and welfare disbursements:** not built.
- **Leadership elections:** post-setup officer changes use secret-ballot elections. General-purpose polls are not built.
- **Roles:** only Chairperson, Secretary, Treasurer, and Member exist. Vice-Chairperson and Welfare Officer are not built.

## Repository layout

- `chamafork/server.js`: the server and all business rules.
- `chamafork/test/`: integration tests.
- `en public/`: the front end (`index.html`, `chama.js`, `chama.css`, `i18n.js`).
- `docs/`: review and UX notes from earlier work.
- `TASKS.md`: the decisions and task list that drove the sprint.

`en public/README.md` predates this file and still describes bootstrap environment variables that the server does not read. Use this README instead.
