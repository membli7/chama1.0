"use strict";

const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const { after, before, describe, test } = require("node:test");

const execFileAsync = promisify(execFile);
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
let server;
let baseUrl;
let tempDir;
let cookie;
let testPort;
let testClockFile;

async function reserveLoopbackPort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  assert.equal(address.address, "127.0.0.1");
  await new Promise((resolve, reject) => {
    probe.close(error => error ? reject(error) : resolve());
  });
  return address.port;
}

function isolatedProcessEnv() {
  const allowedKeys = ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP"];
  return Object.fromEntries(allowedKeys
    .filter(key => typeof process.env[key] === "string")
    .map(key => [key, process.env[key]]));
}

function request(route, options = {}) {
  const headers = new Headers(options.headers || {});
  if (cookie) headers.set("Cookie", cookie);
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    headers.set("X-Requested-With", "chama");
  }
  if (options.write) headers.set("Idempotency-Key", `test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return fetch(`${baseUrl}${route}`, { ...options, headers });
}

async function json(response) {
  return response.json();
}

async function loginWithPin(phone, pin) {
  cookie = null;
  const response = await request("/api/login", { method: "POST", body: JSON.stringify({ phone, pin }) });
  assert.equal(response.status, 200);
  cookie = response.headers.getSetCookie?.()[0]?.split(";")[0] || response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "login should establish a session cookie");
  return cookie;
}

function setServerTime(timestamp) {
  const value = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  assert.ok(Number.isFinite(value), "test clock must be set to a valid timestamp");
  fs.writeFileSync(testClockFile, String(value), "utf8");
  return value;
}

function todayInNairobi(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-chama-test-"));
  testPort = await reserveLoopbackPort();
  testClockFile = path.join(tempDir, "clock.txt");
  fs.writeFileSync(testClockFile, String(Date.now()), "utf8");
  const testClockPreload = path.join(tempDir, "test-clock.cjs");
  fs.writeFileSync(testClockPreload, [
    "const fs = require('node:fs');",
    "const NativeDate = Date;",
    `const clockFile = ${JSON.stringify(testClockFile)};`,
    "class TestDate extends NativeDate {",
    "  constructor(...args) { super(...(args.length ? args : [Number(fs.readFileSync(clockFile, 'utf8'))])); }",
    "  static now() { return Number(fs.readFileSync(clockFile, 'utf8')); }",
    "}",
    "globalThis.Date = TestDate;",
  ].join("\n"), "utf8");
  const initialState = { version: 2, users: [], transactions: [], loans: [], payouts: [], invitations: [], leadershipChanges: [], pendingMpesas: [], idempotency: {}, registers: [], auditLog: [] };
  fs.writeFileSync(path.join(tempDir, "data.json"), `\uFEFF${JSON.stringify(initialState)}`, "utf8");
  server = execFile(process.execPath, ["--require", testClockPreload, "server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...isolatedProcessEnv(),
      NODE_ENV: "test",
      DATA_BACKEND: "json",
      PORT: String(testPort),
      APP_BIND_HOST: "127.0.0.1",
      SESSION_SECRET: "integration-test-session-secret",
      ONE_TIME_CODE_HMAC_SECRET: "integration-test-one-time-code-hmac-secret-0123456789abcdef",
      METRICS_BEARER_TOKEN: "integration-test-metrics-bearer-token-0123456789abcdef",
      REDIS_URL: "",
      SESSION_STORE: "memory",
      PIN_RECOVERY_TEST_REDIS_URL: "",
      CHAMA_DATA_FILE: path.join(tempDir, "data.json"),
      CHAMA_PROFILE_ICON_DIR: path.join(tempDir, "profile-icons"),
      CHAMA_PROFILE_DETAILS_FILE: path.join(tempDir, "profile-details.json"),
      CHAMA_PUSH_SUBSCRIPTIONS_FILE: path.join(tempDir, "push-subscriptions.json"),
      AFRICASTALKING_USERNAME: "",
      AFRICASTALKING_API_KEY: "",
    },
  });

  let output = "";
  let stderr = "";
  baseUrl = `http://127.0.0.1:${testPort}`;
  server.stdout.on("data", chunk => { output += chunk; });
  server.stderr.on("data", chunk => { stderr += chunk; });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start. Output: ${output}`)), 5000);
    const onData = () => {
      if (output.includes(`localhost:${testPort}`)) {
        clearTimeout(timeout);
        resolve();
      }
    };
    server.stdout.on("data", onData);
    server.once("error", reject);
    server.once("exit", code => reject(new Error(`Server exited with code ${code}. Output: ${output}`)));
  });
  let probeDetails = "";
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health/live`);
      if (response.ok) return;
      probeDetails = `HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`;
    } catch (error) {
      probeDetails = `${error.name}: ${error.message}${error.cause?.code ? ` (${error.cause.code})` : ""}`;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Server did not respond to its loopback liveness probe. Output: ${output}. Stderr: ${stderr}. Probe: ${probeDetails}`);
});

after(async () => {
  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill("SIGTERM");
    await new Promise(resolve => server.once("exit", resolve));
  }
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("Jirani Chama server", () => {
  test("uses PostgreSQL by default when no storage backend is selected", () => {
    assert.match(serverSource, /const DATA_BACKEND = process\.env\.DATA_BACKEND \|\| "postgres";/);
  });

  test("reports health and requires first-time setup", async () => {
    const liveness = await request("/api/health/live");
    assert.equal(liveness.status, 200);
    assert.deepEqual(await json(liveness), { status: "ok" });

    const healthz = await request("/healthz");
    assert.equal(healthz.status, 200);
    assert.deepEqual(await json(healthz), { status: "ok" });

    const readiness = await request("/api/health/ready");
    assert.equal(readiness.status, 200);
    assert.deepEqual(await json(readiness), { status: "ok" });

    const readyz = await request("/readyz");
    assert.equal(readyz.status, 200);
    assert.deepEqual(await json(readyz), { status: "ok" });

    const health = await request("/api/health");
    assert.equal(health.status, 200);
    assert.match(health.headers.get("x-request-id"), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.deepEqual(await json(health), { status: "ok" });

    const setupStatus = await request("/api/setup/status");
    assert.equal(setupStatus.status, 200);
    assert.deepEqual(await json(setupStatus), { requiresSetup: true });

    const rootPage = await request("/");
    assert.equal(rootPage.status, 200);
    const rootHtml = await rootPage.text();
    assert.match(rootHtml, /<div id="root"><\/div>/);
    const rootBundlePaths = [...rootHtml.matchAll(/src="([^\"]+\.js)"/g)].map(match => match[1]);
    assert.ok(rootBundlePaths.length > 0, "root page must reference a built React bundle");
    const rootBundleSources = await Promise.all(rootBundlePaths.map(async bundlePath => {
      const bundle = await request(bundlePath);
      assert.equal(bundle.status, 200);
      return bundle.text();
    }));
    const rootBundleSource = rootBundleSources.join("\n");
    assert.match(rootBundleSource, /\/api\/session/);
    assert.match(rootBundleSource, /\/api\/contact/);
    assert.match(rootBundleSource, /Enter Invite Code/);
    assert.match(rootBundleSource, /react-chat-root/);
    assert.match(rootBundleSource, /\/api\/messages/);
    assert.match(rootBundleSource, /chama:messages-updated/);

    const manifest = await request("/manifest.webmanifest");
    assert.equal(manifest.status, 200);
    assert.match(manifest.headers.get("content-type"), /application\/manifest\+json/);
    const manifestBody = await json(manifest);
    assert.equal(manifestBody.name, "Jirani Chama");
    assert.equal(manifestBody.short_name, "Jirani");
    assert.equal(manifestBody.start_url, "/");
    assert.equal(manifestBody.scope, "/");
    assert.equal(manifestBody.display, "standalone");
    assert.deepEqual(manifestBody.icons, [
      { src: "/assets/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/assets/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ]);
    const serviceWorker = await request("/service-worker.js");
    assert.equal(serviceWorker.status, 200);
    assert.match(serviceWorker.headers.get("content-type"), /javascript/);
    const appIcon = await request("/assets/app-icon-192.png");
    assert.equal(appIcon.status, 200);
    assert.match(appIcon.headers.get("content-type"), /image\/png/);

    const registerPage = await request("/register.html");
    assert.equal(registerPage.status, 200);
    const registerHtml = await registerPage.text();
    assert.match(registerHtml, /<div id="root"><\/div>/);
    assert.equal(registerPage.headers.get("cache-control"), "no-store");
    const registerBundlePath = registerHtml.match(/src="([^"]+\.js)"/)?.[1];
    assert.ok(registerBundlePath, "registration page must reference a built React bundle");
    const registerBundle = await request(registerBundlePath);
    assert.equal(registerBundle.status, 200);
    assert.match(registerBundle.headers.get("content-type"), /javascript/);
    assert.match(registerBundle.headers.get("cache-control"), /immutable/);
    assert.match(await registerBundle.text(), /register-chama-form/);

    const loginPage = await request("/member-login.html");
    assert.equal(loginPage.status, 200);
    const loginHtml = await loginPage.text();
    assert.match(loginHtml, /<div id="root"><\/div>/);
    assert.doesNotMatch(loginHtml, /auth-pages\.js/);
    const loginBundlePaths = [...loginHtml.matchAll(/src="([^"]+\.js)"/g)].map(match => match[1]);
    assert.ok(loginBundlePaths.length > 0, "member-login page must reference a built React bundle");
    const loginBundleSources = await Promise.all(loginBundlePaths.map(async bundlePath => {
      const bundle = await request(bundlePath);
      assert.equal(bundle.status, 200);
      assert.match(bundle.headers.get("content-type"), /javascript/);
      return bundle.text();
    }));
    const loginBundleSource = loginBundleSources.join("\n");
    assert.match(loginBundleSource, /\/api\/login/);
    assert.match(loginBundleSource, /\/api\/invitations\/activate/);
    assert.match(loginBundleSource, /\/api\/forgot-pin/);
    assert.match(loginBundleSource, /\/api\/reset-pin/);
  });

  test("correlates request IDs and exposes HTTP status, error, and latency metrics", async () => {
    const malformed = await request("/api/not-a-route", {
      method: "POST",
      headers: { "X-Request-ID": "untrusted-client-value" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    const requestId = malformed.headers.get("x-request-id");
    assert.match(requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.notEqual(requestId, "untrusted-client-value");
    assert.equal((await json(malformed)).requestId, requestId);

    const metrics = await request("/metrics");
    assert.equal(metrics.status, 200);
    const exposition = await metrics.text();
    assert.match(exposition, /^chama_http_responses_total\{status_code="400"\} \d+$/m);
    assert.match(exposition, /^chama_http_server_errors_total \d+$/m);
    assert.match(exposition, /^chama_http_server_error_rate (?:0|[0-9]*\.[0-9]+)$/m);
    assert.match(exposition, /^# TYPE chama_http_request_duration_milliseconds histogram$/m);
    assert.match(exposition, /^chama_http_request_duration_milliseconds_bucket\{le="\+Inf"\} \d+$/m);
    assert.match(exposition, /^chama_http_request_duration_milliseconds_count \d+$/m);
  });

  test("counts 5xx responses in server error metrics", () => {
    const { EventEmitter } = require("node:events");
    const { latencyMiddleware, metricsHandler } = require("../observability");
    const response = new EventEmitter();
    response.statusCode = 503;
    response.type = function () { return this; };
    response.send = function (body) { this.body = body; return this; };
    const originalInfo = console.info;
    console.info = () => {};
    try {
      latencyMiddleware({ method: "GET" }, response, () => {});
      response.emit("finish");
      metricsHandler({}, response);
    } finally {
      console.info = originalInfo;
    }
    assert.match(response.body, /^chama_http_responses_total\{status_code="503"\} 1$/m);
    assert.match(response.body, /^chama_http_server_errors_total 1$/m);
    assert.match(response.body, /^chama_http_server_error_rate 1$/m);
  });

  test("writes production logs as structured JSON", async () => {
    const { stdout } = await execFileAsync(process.execPath, ["-e", 'require("./observability").logger.info("structured-check", { check: "ok" });'], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, NODE_ENV: "production" },
    });
    const record = JSON.parse(stdout.trim());
    assert.equal(record.level, "info");
    assert.equal(record.message, "structured-check");
    assert.equal(record.check, "ok");
    assert.ok(Number.isFinite(Date.parse(record.timestamp)));
  });

  test("creates a chairperson session and serves the dashboard", async () => {
    const invalidDeadline = await request("/api/setup", {
      method: "POST",
      body: JSON.stringify({ chamaName: "Test Chama", name: "Test Chair", phone: "0712345678", email: "chair@example.test", pin: "123456", deadlineDay: 29, ageConfirmed: "true" }),
    });
    assert.equal(invalidDeadline.status, 400);
    const invalidRules = await request("/api/setup", {
      method: "POST",
      body: JSON.stringify({ chamaName: "Test Chama", name: "Test Chair", phone: "0712345678", email: "chair@example.test", pin: "123456", deadlineDay: 10, welfareMonthlyFee: "", lateContributionPenalty: 75, loanMonthlyRatePercent: 101, ageConfirmed: "true" }),
    });
    assert.equal(invalidRules.status, 400);

    const missingTerms = await request("/api/setup", {
      method: "POST",
      body: JSON.stringify({ chamaName: "Test Chama", name: "Test Chair", phone: "0712345678", email: "chair@example.test", pin: "123456", deadlineDay: 10, welfareMonthlyFee: 350, lateContributionPenalty: 75, loanMonthlyRatePercent: 7.5, ageConfirmed: "true" }),
    });
    assert.equal(missingTerms.status, 400);
    assert.match((await json(missingTerms)).message, /Terms and Conditions/);

    const missingPrivacyAcknowledgment = await request("/api/setup", {
      method: "POST",
      body: JSON.stringify({ chamaName: "Test Chama", name: "Test Chair", phone: "0712345678", email: "chair@example.test", pin: "123456", deadlineDay: 10, welfareMonthlyFee: 350, lateContributionPenalty: 75, loanMonthlyRatePercent: 7.5, termsAccepted: "true", ageConfirmed: "true" }),
    });
    assert.equal(missingPrivacyAcknowledgment.status, 400);
    assert.match((await json(missingPrivacyAcknowledgment)).message, /Privacy Notice/);

    const stateBeforeAgeRejections = JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf8"));
    const underAge = await request("/api/setup", {
      method: "POST",
      body: JSON.stringify({ chamaName: "Test Chama", name: "Test Chair", phone: "0712345678", email: "chair@example.test", pin: "123456", termsAccepted: "true", privacyNoticeAcknowledged: "true", ageConfirmed: "false" }),
    });
    assert.equal(underAge.status, 400);
    assert.match((await json(underAge)).message, /18 years old or older/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf8")), stateBeforeAgeRejections);

    const missingAgeDeclaration = await request("/api/setup", {
      method: "POST",
      body: JSON.stringify({ chamaName: "Test Chama", name: "Test Chair", phone: "0712345678", email: "chair@example.test", pin: "123456", termsAccepted: "true", privacyNoticeAcknowledged: "true" }),
    });
    assert.equal(missingAgeDeclaration.status, 400);
    assert.match((await json(missingAgeDeclaration)).message, /18 years old or older/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf8")), stateBeforeAgeRejections);

    const setup = await request("/api/setup", {
      method: "POST",
      body: JSON.stringify({ chamaName: "Test Chama", name: "Test Chair", phone: "0712345678", email: "chair@example.test", pin: "123456", deadlineDay: 10, welfareMonthlyFee: 350, lateContributionPenalty: 75, loanMonthlyRatePercent: 7.5, termsAccepted: "true", privacyNoticeAcknowledged: "true", ageConfirmed: "true" }),
    });
    assert.equal(setup.status, 201);
    const duplicateSetup = await request("/api/setup", {
      method: "POST",
      body: JSON.stringify({ chamaName: "Another Chama", name: "Second Chair", phone: "0712345688", email: "second@example.test", pin: "654321", deadlineDay: 5, welfareMonthlyFee: 500, lateContributionPenalty: 200, loanMonthlyRatePercent: 5, termsAccepted: "true", privacyNoticeAcknowledged: "true", ageConfirmed: "true" }),
    });
    assert.equal(duplicateSetup.status, 201, "multi-tenant: second chama registration should succeed");
    const setupBody = await json(setup);
    assert.equal(setupBody.user.role, "chairperson");
    assert.match(setupBody.user.phone, /^\+254/);
    const savedState = JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf8"));
    assert.equal(savedState.chamas.length, 2, "multi-tenant: both chamas should be saved");
    assert.equal(savedState.chamas[0].name, "Test Chama");
    assert.equal(savedState.chamas[0].subscription.status, "unpaid");
    assert.deepEqual(savedState.settings, { defaultDeadlineDay: 10, welfareMonthlyFee: 350, lateContributionPenalty: 75, loanMonthlyRatePercent: 7.5, meetingDates: {} });
    assert.deepEqual(savedState.chamas[0].settings, { defaultDeadlineDay: 10, welfareMonthlyFee: 350, lateContributionPenalty: 75, loanMonthlyRatePercent: 7.5 }, "first chama per-chama settings");
    assert.deepEqual(savedState.chamas[1].settings, { defaultDeadlineDay: 5, welfareMonthlyFee: 500, lateContributionPenalty: 200, loanMonthlyRatePercent: 5 }, "second chama per-chama settings");
    assert.equal(savedState.users[0].chamaId, savedState.chamas[0].id);
    const termsAcceptanceEvent = savedState.auditLog.find(item => item.type === "terms.accepted");
    assert.ok(termsAcceptanceEvent);
    assert.match(termsAcceptanceEvent.version, /^sha256:[a-f0-9]{64}$/);
    assert.equal(termsAcceptanceEvent.source, "initial-setup");
    assert.equal(termsAcceptanceEvent.chamaId, savedState.chamas[0].id);
    assert.deepEqual(savedState.users[0].termsAcceptance, { version: termsAcceptanceEvent.version, acceptedAt: termsAcceptanceEvent.at, source: "initial-setup" });
    const privacyAcknowledgmentEvent = savedState.auditLog.find(item => item.type === "privacy.notice.acknowledged");
    assert.ok(privacyAcknowledgmentEvent);
    assert.match(privacyAcknowledgmentEvent.version, /^sha256:[a-f0-9]{64}$/);
    assert.equal(privacyAcknowledgmentEvent.source, "initial-setup");
    assert.equal(privacyAcknowledgmentEvent.chamaId, savedState.chamas[0].id);
    assert.deepEqual(savedState.users[0].privacyNoticeAcknowledgment, { version: privacyAcknowledgmentEvent.version, acknowledgedAt: privacyAcknowledgmentEvent.at, source: "initial-setup" });
    const ageEligibilityEvent = savedState.auditLog.find(item => item.type === "eligibility.age.self-declared" && item.entityId === setupBody.user.id);
    assert.ok(ageEligibilityEvent);
    assert.equal(ageEligibilityEvent.minimumAge, 18);
    assert.equal(ageEligibilityEvent.selfDeclared, true);
    assert.equal(ageEligibilityEvent.source, "initial-setup");
    assert.equal(ageEligibilityEvent.chamaId, savedState.chamas[0].id);
    cookie = setup.headers.getSetCookie?.()[0]?.split(";")[0] || setup.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie, "setup should establish a session cookie");
    await require("./active-subscription-fixture").activateTestSubscription({ dataFile: path.join(tempDir, "data.json"), baseUrl, chamaId: savedState.chamas[0].id });

    const dashboard = await request("/api/dashboard");
    assert.equal(dashboard.status, 200);
    const dashboardBody = await json(dashboard);
    assert.equal(dashboardBody.user.name, "Test Chair");
    assert.equal(dashboardBody.summary.balance, 0);
    assert.equal(dashboardBody.permissions.manageMembers, true);

    const beforeRecovery = JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf8"));
    const forgotPin = await request("/api/forgot-pin", { method: "POST", body: JSON.stringify({ email: "chair@example.test" }) });
    const resetPin = await request("/api/reset-pin", { method: "POST", body: JSON.stringify({ email: "chair@example.test", otp: "123456", newPin: "654321" }) });
    const otpRequest = await request("/api/otp/request", { method: "POST", body: JSON.stringify({ phone: "0712345678" }) });
    assert.equal(forgotPin.status, 200);
    assert.deepEqual(await json(forgotPin), { message: "If an active account uses this email address, a PIN reset code may be sent." });
    assert.equal(resetPin.status, 400);
    assert.equal(otpRequest.status, 503);
    const afterRecovery = JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf8"));
    assert.equal(afterRecovery.users[0].resetOtp, beforeRecovery.users[0].resetOtp);
    assert.equal(afterRecovery.users[0].pinHash, beforeRecovery.users[0].pinHash);
  });

  test("preserves distinct concurrent writes instead of replacing a newer snapshot", async () => {
    const stream = await fetch(`${baseUrl}/api/events/stream`, { headers: { Cookie: cookie, Accept: "text/event-stream" } });
    assert.equal(stream.status, 200);
    const reader = stream.body.getReader();
    await reader.read(); // ready event
    const responses = await Promise.all([
      request("/api/messages", { method: "POST", write: true, body: JSON.stringify({ text: "Concurrent message A" }) }),
      request("/api/messages", { method: "POST", write: true, body: JSON.stringify({ text: "Concurrent message B" }) }),
    ]);
    assert.deepEqual(responses.map(response => response.status), [201, 201]);

    const messages = await request("/api/messages");
    assert.equal(messages.status, 200);
    const texts = (await json(messages)).data.map(message => message.text);
    assert.ok(texts.includes("Concurrent message A"));
    assert.ok(texts.includes("Concurrent message B"));
    const eventChunk = new TextDecoder().decode((await reader.read()).value);
    assert.match(eventChunk, /event: messages-updated/);
    await reader.cancel();
    assert.ok((await json(await request("/api/messages"))).data.every(message => message.authorName === "Test Chair"));
  });

  test("profile page loads profile API data and securely saves profile details and photo icons", async () => {
    const page = await request("/profile.html");
    assert.equal(page.status, 200);
    const pageHtml = await page.text();
    assert.match(pageHtml, /<div id="root"><\/div>/);
    assert.match(pageHtml, /src="\/assets\/main-[^\"]+\.js"/);
    assert.doesNotMatch(pageHtml, /profile\.js/);
    const profileBundles = [...pageHtml.matchAll(/src="([^\"]+\.js)"/g)].map(match => match[1]);
    const profileBundleSources = await Promise.all(profileBundles.map(async bundlePath => {
      const bundle = await request(bundlePath);
      assert.equal(bundle.status, 200);
      assert.match(bundle.headers.get("content-type"), /javascript/);
      return bundle.text();
    }));
    const profileBundleSource = profileBundleSources.join("\n");
    assert.match(profileBundleSource, /\/api\/session/);
    assert.match(profileBundleSource, /\/api\/profile/);
    assert.match(profileBundleSource, /\/api\/profile\/photo\//);

    const profile = await request("/api/profile");
    assert.equal(profile.status, 200);
    assert.deepEqual((await json(profile)).data, {
      firstName: "Test", lastName: "Chair", nickname: "", phone: "+254712345678", email: "chair@example.test",
    });

    const save = await request("/api/profile", {
      method: "PUT",
      write: true,
      body: JSON.stringify({ firstName: "New", lastName: "Chair", nickname: "N", phone: "0712345678", email: "new@example.test" }),
    });
    assert.equal(save.status, 200);
    assert.equal((await json(save)).data.nickname, "N");
    assert.ok((await json(await request("/api/messages"))).data.every(message => message.authorName === "N"), "chat history should show the saved nickname");

    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    png.writeUInt32BE(13, 8);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(180, 16);
    png.writeUInt32BE(180, 20);
    const photo = await fetch(`${baseUrl}/api/profile/photo/180`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "image/png", "X-Requested-With": "chama", "Idempotency-Key": `photo-${Date.now()}-integration` },
      body: png,
    });
    assert.equal(photo.status, 201);
    const savedPhoto = await request("/api/profile/photo/180");
    assert.equal(savedPhoto.status, 200);
    assert.equal(savedPhoto.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await savedPhoto.arrayBuffer()), png);
  });

  test("only permits direct officer assignment during initial setup", async () => {
    const chairCookie = cookie;
    const invitation = await request("/api/invitations", {
      method: "POST",
      write: true,
      body: JSON.stringify({ name: "Test Secretary", phone: "0712345679", email: "secretary@example.test", role: "member" }),
    });
    assert.equal(invitation.status, 201);
    const invitationBody = await json(invitation);
    assert.match(invitationBody.activationCode, /^\d{6}$/);

    const missingTerms = await request("/api/invitations/activate", {
      method: "POST",
      body: JSON.stringify({ phone: "0712345679", code: invitationBody.activationCode, pin: "567890", ageConfirmed: "true" }),
    });
    assert.equal(missingTerms.status, 400);
    assert.match((await json(missingTerms)).message, /Terms and Conditions/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf8")).users.length, 2);

    const missingPrivacyAcknowledgment = await request("/api/invitations/activate", {
      method: "POST",
      body: JSON.stringify({ phone: "0712345679", code: invitationBody.activationCode, pin: "567890", termsAccepted: "true", ageConfirmed: "true" }),
    });
    assert.equal(missingPrivacyAcknowledgment.status, 400);
    assert.match((await json(missingPrivacyAcknowledgment)).message, /Privacy Notice/);

    const activation = await request("/api/invitations/activate", {
      method: "POST",
      body: JSON.stringify({ phone: "0712345679", code: invitationBody.activationCode, pin: "567890", termsAccepted: "true", privacyNoticeAcknowledged: "true", ageConfirmed: "true" }),
    });
    assert.equal(activation.status, 201);
    const secretaryId = (await json(activation)).user.id;
    const activationState = JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf8"));
    const activationEvent = activationState.auditLog.find(item => item.type === "terms.accepted" && item.entityId === secretaryId);
    assert.ok(activationEvent);
    assert.equal(activationEvent.source, "invitation-activation");
    assert.equal(activationState.users.find(user => user.id === secretaryId).termsAcceptance.acceptedAt, activationEvent.at);
    const privacyActivationEvent = activationState.auditLog.find(item => item.type === "privacy.notice.acknowledged" && item.entityId === secretaryId);
    assert.ok(privacyActivationEvent);
    assert.equal(privacyActivationEvent.source, "invitation-activation");
    assert.equal(activationState.users.find(user => user.id === secretaryId).privacyNoticeAcknowledgment.acknowledgedAt, privacyActivationEvent.at);
    const ageEligibilityEvent = activationState.auditLog.find(item => item.type === "eligibility.age.self-declared" && item.entityId === secretaryId);
    assert.ok(ageEligibilityEvent);
    assert.equal(ageEligibilityEvent.minimumAge, 18);
    assert.equal(ageEligibilityEvent.selfDeclared, true);
    assert.equal(ageEligibilityEvent.source, "invitation-activation");
    assert.equal(ageEligibilityEvent.chamaId, activationState.users.find(user => user.id === secretaryId).chamaId);

    cookie = null;
    const login = await request("/api/login", {
      method: "POST",
      body: JSON.stringify({ phone: "0712345679", pin: "567890" }),
    });
    assert.equal(login.status, 200);
    const secretaryUserId = (await json(login)).user.id;
    cookie = login.headers.getSetCookie?.()[0]?.split(";")[0] || login.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie, "secretary login should establish a session cookie");
    const secretaryCookie = cookie;

    const secretaryProposalAttempt = await request("/api/leadership-changes", {
      method: "POST",
      write: true,
      body: JSON.stringify({ role: "treasurer", incomingUserId: secretaryId, effectiveDate: "2030-01-01" }),
    });
    assert.equal(secretaryProposalAttempt.status, 403);

    cookie = chairCookie;
    const chairUserId = (await json(await request("/api/dashboard"))).user.id;
    const proposal = await request("/api/leadership-changes", {
      method: "POST",
      write: true,
      body: JSON.stringify({
        role: "secretary",
        incomingUserId: secretaryId,
        effectiveDate: "2030-01-01",
      }),
    });
    assert.equal(proposal.status, 201);
    const proposalBody = await json(proposal);
    assert.equal(proposalBody.data.status, "confirmed");
    assert.equal(proposalBody.data.type, "appointment");
    assert.equal(proposalBody.data.vote, null);
    assert.equal(proposalBody.data.confirmedBy, chairUserId);

    cookie = chairCookie;
    const treasurerInvitation = await request("/api/invitations", {
      method: "POST",
      write: true,
      body: JSON.stringify({ name: "Test Treasurer", phone: "0712345680", email: "treasurer@example.test", role: "member" }),
    });
    assert.equal(treasurerInvitation.status, 201);
    const treasurerInvitationBody = await json(treasurerInvitation);
    const treasurerActivation = await request("/api/invitations/activate", {
      method: "POST",
      body: JSON.stringify({ phone: "0712345680", code: treasurerInvitationBody.activationCode, pin: "901234", termsAccepted: true, privacyNoticeAcknowledged: true, ageConfirmed: true }),
    });
    assert.equal(treasurerActivation.status, 201);
    const treasurerId = (await json(treasurerActivation)).user.id;

    const laterProposal = await request("/api/leadership-changes", {
      method: "POST",
      write: true,
      body: JSON.stringify({ role: "treasurer", incomingUserId: treasurerId, effectiveDate: "2030-02-01" }),
    });
    assert.equal(laterProposal.status, 409);
    assert.match((await json(laterProposal)).message, /member election/i);

    const secondInvitation = await request("/api/invitations", { method: "POST", write: true, body: JSON.stringify({ name: "Runoff Candidate", phone: "0712345681", email: "runoff@example.test", role: "member" }) });
    assert.equal(secondInvitation.status, 201);
    const secondInvitationBody = await json(secondInvitation);
    const secondActivation = await request("/api/invitations/activate", { method: "POST", body: JSON.stringify({ phone: "0712345681", code: secondInvitationBody.activationCode, pin: "678901", termsAccepted: true, privacyNoticeAcknowledged: true, ageConfirmed: true }) });
    assert.equal(secondActivation.status, 201);
    const secondCandidateId = (await json(secondActivation)).user.id;

    const activateMember = async (name, phone, email, pin) => {
      const invitation = await request("/api/invitations", {
        method: "POST", write: true, body: JSON.stringify({ name, phone, email, role: "member" }),
      });
      assert.equal(invitation.status, 201);
      const invitationBody = await json(invitation);
      const activation = await request("/api/invitations/activate", {
        method: "POST",
        body: JSON.stringify({ phone, code: invitationBody.activationCode, pin, termsAccepted: true, privacyNoticeAcknowledged: true, ageConfirmed: true }),
      });
      assert.equal(activation.status, 201);
      return (await json(activation)).user.id;
    };
    const extraVoterId = await activateMember("Extra Approval Voter", "0712345683", "extra-voter@example.test", "135790");
    const edgeVoterId = await activateMember("Deadline Voter", "0712345684", "deadline-voter@example.test", "112233");
    const treasurerCookie = await loginWithPin("0712345680", "901234");
    const secondCookie = await loginWithPin("0712345681", "678901");
    const extraCookie = await loginWithPin("0712345683", "135790");
    const edgeCookie = await loginWithPin("0712345684", "112233");

    cookie = chairCookie;
    const chairApprovalResponse = await request("/api/leadership-election-approvals", {
      method: "POST", write: true, body: JSON.stringify({ role: "treasurer" }),
    });
    assert.equal(chairApprovalResponse.status, 201);
    const chairApproval = (await json(chairApprovalResponse)).data;
    const approvalId = chairApproval.id;
    assert.equal(chairApproval.role, "chairperson", "the API must bind a request to the authenticated leader's own office");
    assert.equal(Date.parse(chairApproval.deadlineAt) - Date.parse(chairApproval.openedAt), 7 * 24 * 60 * 60 * 1000);
    assert.equal(chairApproval.eligibleMembers, 6);
    for (const privateField of ["requestedBy", "eligibleVoterIds", "ballots", "voterToken"]) assert.equal(Object.hasOwn(chairApproval, privateField), false);
    assert.match(chairApproval.privacyNotice, /application operator may be able to access/);
    assert.equal((await request("/api/leadership-election-approvals/missing-approval/vote", {
      method: "POST", write: true, body: JSON.stringify({ choice: "yes" }),
    })).status, 404, "a missing approval request should return not found without changing state");

    cookie = secondCookie;
    assert.equal((await request("/api/leadership-election-approvals", { method: "POST", write: true, body: JSON.stringify({ role: "chairperson" }) })).status, 403,
      "an ordinary member cannot request a re-election even if the body names an office");
    cookie = secretaryCookie;
    const secretaryApprovalResponse = await request("/api/leadership-election-approvals", {
      method: "POST", write: true, body: JSON.stringify({ role: "treasurer" }),
    });
    assert.equal(secretaryApprovalResponse.status, 201, "different positions may have separate open approval requests");
    const secretaryApproval = (await json(secretaryApprovalResponse)).data;
    assert.equal(secretaryApproval.role, "secretary");
    assert.equal(secretaryApproval.deadlineAt, chairApproval.deadlineAt, "the isolated test clock gives both ballots the same exact boundary");
    cookie = chairCookie;
    assert.equal((await request("/api/leadership-election-approvals", { method: "POST", write: true, body: JSON.stringify({ role: "secretary" }) })).status, 409,
      "only one open request is allowed for the same position");
    assert.equal((await request(`/api/leadership-election-approvals/${approvalId}/schedule`, {
      method: "POST", write: true, body: JSON.stringify({ role: "treasurer", candidateIds: [treasurerId, secondCandidateId], scheduledDate: todayInNairobi() }),
    })).status, 409, "an election cannot be scheduled before the approval ballot passes at its deadline");
    assert.equal((await request("/api/leadership-elections", {
      method: "POST", write: true,
      body: JSON.stringify({ role: "chairperson", candidateIds: [treasurerId, secondCandidateId], scheduledDate: todayInNairobi() }),
    })).status, 409, "the standard schedule route cannot bypass an open role-specific approval ballot");

    const lateInvitation = await request("/api/invitations", {
      method: "POST", write: true,
      body: JSON.stringify({ name: "Late Approval Voter", phone: "0712345682", email: "late-voter@example.test", role: "member" }),
    });
    assert.equal(lateInvitation.status, 201);
    const lateInvitationBody = await json(lateInvitation);
    const lateActivation = await request("/api/invitations/activate", {
      method: "POST", body: JSON.stringify({ phone: "0712345682", code: lateInvitationBody.activationCode, pin: "246810", termsAccepted: true, privacyNoticeAcknowledged: true, ageConfirmed: true }),
    });
    assert.equal(lateActivation.status, 201);
    const lateVoterId = (await json(lateActivation)).user.id;
    const lateCookie = await loginWithPin("0712345682", "246810");
    cookie = lateCookie;
    assert.equal((await request(`/api/leadership-election-approvals/${approvalId}/vote`, { method: "POST", write: true, body: JSON.stringify({ choice: "yes" }) })).status, 403,
      "a member added after opening is excluded from the frozen voter list");

    const castApprovalVote = (voterCookie, choice, targetApprovalId = approvalId) => {
      cookie = voterCookie;
      return request(`/api/leadership-election-approvals/${targetApprovalId}/vote`, { method: "POST", write: true, body: JSON.stringify({ choice }) });
    };
    assert.equal((await castApprovalVote(chairCookie, "no")).status, 200);
    assert.equal((await castApprovalVote(secretaryCookie, "no")).status, 200);
    assert.equal((await castApprovalVote(treasurerCookie, "yes")).status, 200);
    cookie = extraCookie;
    const concurrentApprovalVotes = await Promise.all([
      request(`/api/leadership-election-approvals/${approvalId}/vote`, { method: "POST", write: true, body: JSON.stringify({ choice: "yes" }) }),
      request(`/api/leadership-election-approvals/${approvalId}/vote`, { method: "POST", write: true, body: JSON.stringify({ choice: "yes" }) }),
    ]);
    assert.deepEqual(concurrentApprovalVotes.map(response => response.status).sort(), [200, 409],
      "concurrent duplicate submissions must record exactly one choice");
    assert.equal((await castApprovalVote(chairCookie, "yes", secretaryApproval.id)).status, 200);
    assert.equal((await castApprovalVote(secretaryCookie, "yes", secretaryApproval.id)).status, 200);
    assert.equal((await castApprovalVote(treasurerCookie, "yes", secretaryApproval.id)).status, 200);
    assert.equal((await castApprovalVote(secondCookie, "no", secretaryApproval.id)).status, 200);
    assert.equal((await castApprovalVote(extraCookie, "yes", secretaryApproval.id)).status, 200);

    cookie = chairCookie;
    const chairApprovalView = (await json(await request("/api/leadership-elections"))).reElectionApprovals.find(item => item.id === approvalId);
    assert.equal(chairApprovalView.hasVoted, true);
    assert.equal(chairApprovalView.status, "voting", "an approval ballot remains open before its deadline");
    assert.equal(chairApprovalView.eligibleMembers, 6, "the denominator must remain frozen after a seventh member joins");
    assert.equal(chairApprovalView.threshold, 4);
    assert.equal(chairApprovalView.votesCast, 4);
    assert.equal(chairApprovalView.yesVotes, 2);
    assert.equal(chairApprovalView.noVotes, 2);
    assert.equal(chairApprovalView.unvoted, 2);
    for (const privateField of ["requestedBy", "eligibleVoterIds", "ballots", "voterToken", "choice"]) assert.equal(Object.hasOwn(chairApprovalView, privateField), false);
    cookie = secretaryCookie;
    const secretaryApprovalView = (await json(await request("/api/leadership-elections"))).reElectionApprovals.find(item => item.id === secretaryApproval.id);
    assert.equal(secretaryApprovalView.hasVoted, true, "an officer sees only their own voted status");
    assert.equal(secretaryApprovalView.eligibleMembers, 6);
    assert.equal(secretaryApprovalView.threshold, 4);
    assert.equal(secretaryApprovalView.votesCast, 5);
    assert.equal(secretaryApprovalView.yesVotes, 4);
    assert.equal(secretaryApprovalView.noVotes, 1);
    assert.equal(secretaryApprovalView.unvoted, 1);
    assert.equal(secretaryApprovalView.status, "voting", "reaching the Yes threshold does not close a ballot early");
    assert.equal(secretaryApprovalView.result, null);
    cookie = secondCookie;
    const memberApprovalView = (await json(await request("/api/dashboard"))).leadershipReElectionApprovals.find(item => item.id === approvalId);
    assert.equal(memberApprovalView.hasVoted, false, "a member sees only their own voted status");
    assert.equal(memberApprovalView.eligible, true);
    assert.equal(memberApprovalView.canVote, true);
    assert.equal(memberApprovalView.yesVotes, chairApprovalView.yesVotes);
    cookie = lateCookie;
    const lateApprovalView = (await json(await request("/api/leadership-elections"))).reElectionApprovals.find(item => item.id === approvalId);
    assert.equal(lateApprovalView.eligibleMembers, 6);
    assert.equal(lateApprovalView.eligible, false);
    assert.equal(lateApprovalView.canVote, false);
    assert.equal(lateApprovalView.hasVoted, false);
    assert.equal(lateApprovalView.votesCast, 4);
    cookie = chairCookie;
    const legacyLeadershipView = await json(await request("/api/leadership-changes"));
    assert.ok(legacyLeadershipView.data.every(item => item.type !== "election" && item.type !== "re-election-approval"),
      "the legacy leadership endpoint must not reveal raw election or approval-ballot records");
    const voteAudit = (await json(await request("/api/audit-log"))).data.filter(item => item.type === "leadership.re-election-approval.vote-cast");
    assert.equal(voteAudit.length, 0, "officer-visible audit timelines must not expose per-vote timing or identity");

    cookie = chairCookie;
    const scheduledByChair = await request("/api/leadership-elections", { method: "POST", write: true, body: JSON.stringify({ role: "treasurer", candidateIds: [treasurerId, secondCandidateId], scheduledDate: todayInNairobi() }) });
    assert.equal(scheduledByChair.status, 201);
    const electionId = (await json(scheduledByChair)).data.id;
    assert.equal((await json(await request("/api/dashboard"))).permissions.proposeLeadershipElection, true);
    cookie = secretaryCookie;
    assert.equal((await json(await request("/api/dashboard"))).permissions.proposeLeadershipElection, true);
    cookie = chairCookie;
    assert.equal((await request(`/api/leadership-elections/${electionId}/decline`, { method: "POST", write: true, body: JSON.stringify({}) })).status, 409);
    const activeElection = (await json(await request("/api/leadership-elections"))).data.find(item => item.id === electionId);
    assert.equal(activeElection.status, "voting");
    assert.equal(activeElection.scheduledDate, todayInNairobi());

    const castVote = async (voterCookie, candidateId) => {
      cookie = voterCookie;
      return request(`/api/leadership-elections/${electionId}/vote`, { method: "POST", write: true, body: JSON.stringify({ candidateId }) });
    };
    await castVote(chairCookie, treasurerId);
    await castVote(secretaryCookie, treasurerId);
    await castVote(treasurerCookie, treasurerId);
    assert.equal((await castVote(secondCookie, secondCandidateId)).status, 200);
    assert.equal((await castVote(secondCookie, treasurerId)).status, 409);
    cookie = secondCookie;
    assert.equal((await request("/api/leadership-elections", { method: "POST", write: true, body: JSON.stringify({ role: "treasurer", candidateIds: [treasurerId, secondCandidateId], scheduledDate: todayInNairobi() }) })).status, 403);

    cookie = secondCookie;
    const votingElection = (await json(await request("/api/dashboard"))).leadershipElections.find(item => item.id === electionId);
    assert.equal(votingElection.votesCast, 4);
    assert.equal(votingElection.result, null);
    cookie = chairCookie;
    assert.equal(JSON.stringify(votingElection).includes("voterToken"), false);
    cookie = chairCookie;
    assert.equal((await request(`/api/leadership-elections/${electionId}/close`, { method: "POST", write: true, body: JSON.stringify({}) })).status, 409);
    cookie = secondCookie;
    const memberMessages = (await json(await request("/api/messages"))).data;
    assert.ok(memberMessages.some(message => message.text === "Concurrent message A" && message.authorName === "N"), "another active member should receive chat messages with the sender nickname");
    assert.equal((await json(await request("/api/leadership-elections"))).data.find(item => item.id === electionId).result, null);
    const privateMessages = await json(await request("/api/messages"));
    assert.ok(privateMessages.data.every(message => !message.recipientId || message.recipientId === secondCandidateId));

    const approvalDeadline = Date.parse(chairApproval.deadlineAt);
    setServerTime(approvalDeadline - 1);
    const chairBeforeDeadlineCookie = await loginWithPin("0712345678", "123456");
    cookie = chairBeforeDeadlineCookie;
    const preDeadlineList = await json(await request("/api/leadership-elections"));
    const preDeadlineChair = preDeadlineList.reElectionApprovals.find(item => item.id === approvalId);
    const preDeadlineSecretary = preDeadlineList.reElectionApprovals.find(item => item.id === secretaryApproval.id);
    assert.equal(preDeadlineChair.status, "voting");
    assert.equal(preDeadlineChair.unvoted, 2);
    assert.equal(preDeadlineSecretary.status, "voting", "a threshold-reaching ballot remains open until its exact deadline");
    assert.equal(preDeadlineSecretary.yesVotes, preDeadlineSecretary.threshold);
    assert.equal(preDeadlineSecretary.result, null);
    const regularElectionAfterDay = preDeadlineList.data.find(item => item.id === electionId);
    assert.equal(regularElectionAfterDay.status, "completed");
    assert.equal(regularElectionAfterDay.result.winnerId, treasurerId, "the existing election flow should still activate its role-specific winner");

    const secondBeforeDeadlineCookie = await loginWithPin("0712345681", "678901");
    assert.equal((await castApprovalVote(secondBeforeDeadlineCookie, "yes")).status, 200,
      "an eligible member may cast a valid vote one millisecond before the deadline");
    const chairBeforeExactDeadlineCookie = await loginWithPin("0712345678", "123456");
    cookie = chairBeforeExactDeadlineCookie;
    const beforeExactList = await json(await request("/api/leadership-elections"));
    const chairBeforeExact = beforeExactList.reElectionApprovals.find(item => item.id === approvalId);
    assert.equal(chairBeforeExact.status, "voting");
    assert.equal(chairBeforeExact.yesVotes, 3);
    assert.equal(chairBeforeExact.noVotes, 2);
    assert.equal(chairBeforeExact.votesCast, 5);
    assert.equal(chairBeforeExact.unvoted, 1);

    const scheduledDate = todayInNairobi(approvalDeadline);
    setServerTime(approvalDeadline);
    const chairAtDeadlineCookie = await loginWithPin("0712345678", "123456");
    const treasurerAtDeadlineCookie = await loginWithPin("0712345680", "901234");
    cookie = treasurerAtDeadlineCookie;
    assert.equal((await request(`/api/leadership-election-approvals/${secretaryApproval.id}/schedule`, {
      method: "POST", write: true,
      body: JSON.stringify({ candidateIds: [secondCandidateId, lateVoterId], scheduledDate }),
    })).status, 403, "the Treasurer cannot schedule the replacement election");
    cookie = chairAtDeadlineCookie;
    const failedDeadlineSchedule = await request(`/api/leadership-election-approvals/${approvalId}/schedule`, {
      method: "POST", write: true,
      body: JSON.stringify({ candidateIds: [secondCandidateId, lateVoterId], scheduledDate }),
    });
    assert.equal(failedDeadlineSchedule.status, 409, "a failed ballot is resolved and cannot schedule when the first request arrives at its deadline");
    const edgeAtDeadlineCookie = await loginWithPin("0712345684", "112233");
    const exactDeadlineVote = await castApprovalVote(edgeAtDeadlineCookie, "yes");
    assert.equal(exactDeadlineVote.status, 409, "the ballot closes at the deadline and rejects a vote arriving at that instant");
    assert.match((await json(exactDeadlineVote)).message, /closed/i);
    cookie = chairAtDeadlineCookie;
    const scheduledReElectionResponse = await request(`/api/leadership-election-approvals/${secretaryApproval.id}/schedule`, {
      method: "POST", write: true,
      body: JSON.stringify({ candidateIds: [secondCandidateId, lateVoterId], scheduledDate }),
    });
    assert.equal(scheduledReElectionResponse.status, 201, "a passed ballot may schedule its role-specific election at the boundary");
    const scheduledReElection = (await json(scheduledReElectionResponse)).data;
    assert.equal(scheduledReElection.role, "secretary");
    assert.equal(scheduledReElection.reElection, true);
    assert.equal(scheduledReElection.scheduledDate, scheduledDate);
    assert.equal(scheduledReElection.status, "voting");

    const atDeadlineList = await json(await request("/api/leadership-elections"));
    const failedChairApproval = atDeadlineList.reElectionApprovals.find(item => item.id === approvalId);
    const passedSecretaryApproval = atDeadlineList.reElectionApprovals.find(item => item.id === secretaryApproval.id);
    assert.equal(failedChairApproval.status, "failed");
    assert.equal(failedChairApproval.closedAt, chairApproval.deadlineAt);
    assert.deepEqual(failedChairApproval.result, { yesVotes: 3, noVotes: 2, votesCast: 5, abstentions: 1, threshold: 4, passed: false });
    assert.equal(passedSecretaryApproval.status, "approved");
    assert.equal(passedSecretaryApproval.closedAt, secretaryApproval.deadlineAt);
    assert.deepEqual(passedSecretaryApproval.result, { yesVotes: 4, noVotes: 1, votesCast: 5, abstentions: 1, threshold: 4, passed: true });

    setServerTime(approvalDeadline + 1);
    cookie = edgeAtDeadlineCookie;
    assert.equal((await request(`/api/leadership-election-approvals/${secretaryApproval.id}/vote`, {
      method: "POST", write: true, body: JSON.stringify({ choice: "yes" }),
    })).status, 409, "an unvoted member cannot add a ballot one millisecond after closure");
    const chairAfterDeadlineCookie = await loginWithPin("0712345678", "123456");
    cookie = chairAfterDeadlineCookie;
    const afterDeadlineList = await json(await request("/api/leadership-elections"));
    assert.equal(afterDeadlineList.reElectionApprovals.find(item => item.id === approvalId).status, "failed");
    assert.equal(afterDeadlineList.reElectionApprovals.find(item => item.id === secretaryApproval.id).status, "approved");
    const closeAudit = (await json(await request("/api/audit-log"))).data.filter(item => item.type === "leadership.re-election-approval.closed");
    assert.equal(closeAudit.length, 2, "each approval closes once and only aggregate closure records enter the officer-visible audit log");

    const beforeReplacementDashboard = await json(await request("/api/dashboard"));
    const roleOf = (userId, members) => members.find(member => member.id === userId)?.role;
    assert.equal(roleOf(chairUserId, beforeReplacementDashboard.members), "chairperson");
    assert.equal(roleOf(secretaryId, beforeReplacementDashboard.members), "secretary", "the incumbent remains in office while the replacement election is active");
    assert.equal(roleOf(treasurerId, beforeReplacementDashboard.members), "treasurer", "the unrelated Treasurer office remains unchanged");

    const secretaryAtReplacementCookie = await loginWithPin("0712345679", "567890");
    const treasurerAtReplacementCookie = await loginWithPin("0712345680", "901234");
    const secondAtReplacementCookie = await loginWithPin("0712345681", "678901");
    const lateAtReplacementCookie = await loginWithPin("0712345682", "246810");
    const castReplacementVote = async (voterCookie, candidateId) => {
      cookie = voterCookie;
      return request(`/api/leadership-elections/${scheduledReElection.id}/vote`, { method: "POST", write: true, body: JSON.stringify({ candidateId }) });
    };
    const chairAtReplacementCookie = chairAfterDeadlineCookie;
    assert.equal((await castReplacementVote(chairAtReplacementCookie, lateVoterId)).status, 200);
    assert.equal((await castReplacementVote(secretaryAtReplacementCookie, secondCandidateId)).status, 200);
    assert.equal((await castReplacementVote(treasurerAtReplacementCookie, lateVoterId)).status, 200);
    assert.equal((await castReplacementVote(secondAtReplacementCookie, secondCandidateId)).status, 200);
    assert.equal((await castReplacementVote(lateAtReplacementCookie, lateVoterId)).status, 200);
    setServerTime(Date.parse(`${scheduledDate}T21:00:00.001Z`));
    const chairAfterReplacementCookie = await loginWithPin("0712345678", "123456");
    const treasurerAfterReplacementCookie = await loginWithPin("0712345680", "901234");
    cookie = chairAfterReplacementCookie;
    const completedList = await json(await request("/api/leadership-elections"));
    const completedReElection = completedList.data.find(item => item.id === scheduledReElection.id);
    assert.equal(completedReElection.status, "completed");
    assert.equal(completedReElection.result.winnerId, lateVoterId);
    const afterReplacementDashboard = await json(await request("/api/dashboard"));
    assert.equal(roleOf(chairUserId, afterReplacementDashboard.members), "chairperson");
    assert.equal(roleOf(treasurerId, afterReplacementDashboard.members), "treasurer");
    assert.equal(roleOf(extraVoterId, afterReplacementDashboard.members), "member");
    assert.equal(roleOf(edgeVoterId, afterReplacementDashboard.members), "member");
    assert.equal(roleOf(lateVoterId, afterReplacementDashboard.members), "secretary");
    assert.equal(roleOf(secretaryId, afterReplacementDashboard.members), "member");
    cookie = treasurerAfterReplacementCookie;
    const treasurerOwnRequest = await request("/api/leadership-election-approvals", {
      method: "POST", write: true, body: JSON.stringify({ role: "chairperson" }),
    });
    assert.equal(treasurerOwnRequest.status, 201);
    assert.equal((await json(treasurerOwnRequest)).data.role, "treasurer",
      "the request body cannot change a Treasurer's own-position re-election request");
    cookie = chairAfterReplacementCookie;
  });

  test("exports transactions and expires the session after logout", async () => {
    const csv = await request("/api/export.csv");
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-type"), /text\/csv/);
    assert.match(csv.headers.get("content-disposition"), /jirani-register\.csv/);
    assert.match(await csv.text(), /"Date","Member","Amount \(KES\)","Method","Type","Reference"/);

    assert.equal((await request("/api/messages", { method: "POST", body: JSON.stringify({ type: "meeting", message: "Test" }) })).status, 400);
    assert.equal((await request("/api/payments/mpesa/callback", { method: "POST", body: JSON.stringify({}) })).status, 404);
    const beforeCallback = JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf8")).pendingMpesas.length;
    const callback = await request("/api/mpesa/callback", { method: "POST", body: JSON.stringify({ Body: { stkCallback: { CheckoutRequestID: "unmatched", ResultCode: 0, CallbackMetadata: { Item: [{ Name: "Amount", Value: 900 }] } } } }) });
    assert.equal(callback.status, 503);
    assert.equal(JSON.parse(fs.readFileSync(path.join(tempDir, "data.json"), "utf8")).pendingMpesas.length, beforeCallback);

    const logout = await request("/api/logout", { method: "POST", body: JSON.stringify({}) });
    assert.equal(logout.status, 200);

    const dashboard = await request("/api/dashboard");
    assert.equal(dashboard.status, 401);
  });
});

test("malformed JSON gets a 400 and the server keeps running", async () => {
  const malformed = await request("/api/loans", { method: "POST", body: "{bad json", write: true });
  assert.equal(malformed.status, 400);
  assert.match((await json(malformed)).message, /could not be read/);
  assert.equal((await request("/api/health")).status, 200);
});
