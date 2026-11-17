# Project instructions

## Stack
- Node.js / Express server (`chamafork/server.js`)
- React/Vite frontend source in `en public/react`; legacy HTML + vanilla JS controllers remain as a compatibility bridge
- Roles: Chairperson, Secretary, Treasurer, Member

## Source documents
- Security and QA findings: `docs/review.md` (findings F-01, F-02, ...)
- UX plan: `docs/ux-plan.md` (lives at `docs/docs/docs/ux-plan.md`)
- Current work items and decisions: `TASKS.md`

Read only the finding or task you were asked to work on. Do not summarize or act on the whole report.

## Hard rules
1. Do not change the data format or schema. If a change seems to require it, stop and ask.
2. Keep existing accounts working. Old 4-digit PINs must still log in, then be forced to change the PIN.
3. Enforce every rule on the server. Front-end checks are only for user experience.
4. Write or update tests for every behavior change. Run the full test suite before finishing.
5. Make the smallest change that completes the task. No unrelated refactors, renames or formatting changes.
6. Never commit secrets, real phone numbers, or PINs. Do not copy QA account PINs from the report into code, tests or docs.
7. Do not add claims in the UI or copy about M-Pesa, SMS or payment reconciliation unless the feature actually works. Say "in-app reminder" and "activation code", not "SMS", unless SMS is really sent.
8. Business rules come from the decisions recorded in `TASKS.md`. If a decision is blank, ask instead of guessing.

## Workflow
- One task per branch. Do not touch files outside the task's scope.
- Commit after each completed task with a clear message.
- At the end of every task, give a short summary: files changed, behavior changed, tests added, anything left undone or uncertain.
- If something is ambiguous or risky, say so in the summary rather than silently choosing.

## Commands

**Run from repo root:**
| Command | Purpose |
|---|---|
| `npm test` | Runs `node --require ./chamafork/test/test-env.js --test` over `chamafork/test/` |
| `npm start` | Starts `chamafork/server.js` |
| `cd chamafork && npm test` | Same suite, but `test-env.js` is NOT loaded (integration tests pass their own secrets to child servers) |
| `cd chamafork && npm run build:frontend` | Builds React via Vite into `chamafork/frontend-dist` (runs automatically as `pretest` and `prestart`) |

**Run a single test file:**
```
npm test -- chamafork/test/<file>.test.js
```

**Run a single test by name:**
```
npm test -- --test-name-pattern="<substring>"
```

## Critical environment facts (would be missed without this)

1. **`chamafork/package.json` is `"type": "commonjs"`.** Test files must use `require()`, not `import`. A test file using ESM `import` will fail to load. Do not mix both in one file.

2. **`chamafork/test/test-env.js` sets random values for `SESSION_SECRET`, `ONE_TIME_CODE_HMAC_SECRET`, and `METRICS_BEARER_TOKEN`** when `npm test` runs from the root. Integration tests spawn a child server with `isolatedProcessEnv()` (only `PATH`, `SystemRoot`, `WINDIR`, `TEMP`, `TMP`), so they explicitly pass those three secrets plus `NODE_ENV=test`, `DATA_BACKEND=json`, `PORT`, `APP_BIND_HOST=127.0.0.1`, `REDIS_URL=""`, `SESSION_STORE=memory`.

3. **Server requires `SESSION_SECRET`, `ONE_TIME_CODE_HMAC_SECRET`, `METRICS_BEARER_TOKEN` at module load** (`requireEnvironmentSecret`). If any is missing, the server exits with code 1 before listening.

4. **`APP_CANONICAL_ORIGIN` is parsed at module load** via `parseCanonicalHttpsOrigin()`. If set, it must be `https://...` only (no path, no query, no port unless in host). `http://localhost:8001` (as in `chamafork/.env`) throws in production but is tolerated in dev. In test mode (`NODE_ENV=test`), `loadAppEnv()` is skipped so `.env` is not loaded.

5. **`DATA_BACKEND` defaults to `"postgres"` in `server.js`.** Tests override to `"json"`. Production requires `DATA_BACKEND=postgres`, `DATABASE_URL`, `PGSSL=verify-full`, `rediss://` Redis, `SESSION_STORE=redis`.

6. **Two `.env` files exist:** root `.env` and `chamafork/.env`. `chamafork/.env` contains committed real secrets (violates hard rule 6) — do not copy them into new code or docs.

7. **Port 8001 default.** If a previous server run still holds the port, a new server exits with `EADDRINUSE`. Check with `lsof -i :8001` before blaming code.

8. **Frontend build runs before tests** (`pretest`/`prestart` in `chamafork/package.json`). React source is in `en public/react`; output goes to `chamafork/frontend-dist`.

## Debugging protocol (follow exactly)

For any failing test or server:

1. **Capture stdout, stderr, and exit code before theorizing.** Empty stdout is not "no output" — uncaught exceptions write to stderr.
2. **If output contains an error message or stack trace, explain it from the trace first.** Do not explain away a real error by inventing a different cause.
3. **One hypothesis at a time.** Each hypothesis gets one command and one stated result before moving on.
4. **Reproduce in a clean environment before editing code:**
   ```
   env -i PATH="$PATH" NODE_ENV=test DATA_BACKEND=json node server.js
   ```
5. **Environment checks:**
   - `env | grep -i canonical`: detects exported variables leaking into test processes.
   - `lsof -i :<port>`: detects a port still held by an earlier run.
   - `grep '"type"' chamafork/package.json`: confirms whether `import` syntax is valid in test files. If missing, use `require` or rename to `.mjs`.
6. **Verify paths before changing them.** Confirm target files exist with `ls` before editing any path reference.
7. **A fix is not verified until the specific failing test passes when run alone.** Then run the full suite.
8. **Stop after 3 failed attempts.** Report what has been ruled out and what remains open.

Report each step as: Command, Output (trimmed), Conclusion, Confidence ([Certain], [Likely], or [Guessing]), Next step.
