"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, test } = require("node:test");
const {
  createPasskeyRouter,
  PASSKEY_CHALLENGE_TTL_MS,
  createPasskeyChallenge,
  consumePasskeyChallenge,
  derivePasskeyContext,
  validCounterTransition,
  nextStoredCounter,
} = require("../security/passkey-routes");

const servers = [];
function hashedPin(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
}
async function startAuthServer({ lockoutMs = 900000, production = false, empty = false, setupBootstrapSecret = "" } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-auth-test-"));
  const dataFile = path.join(directory, "data.json");
  const phone = "+254711000001";
  const legacyPhone = "+254711000002";
  fs.writeFileSync(dataFile, JSON.stringify({ version: 2, users: empty ? [] : [
    { id: "current", name: "Test Chair", phone, role: "chairperson", status: "active", pinHash: hashedPin("123456"), mustChangePin: false, chamaId: "test-chama" },
    { id: "legacy", name: "Legacy Member", phone: legacyPhone, role: "member", status: "active", pinHash: hashedPin("1234"), mustChangePin: false, chamaId: "test-chama" },
  ], transactions: [], loans: [], payouts: [], invitations: [], leadershipChanges: [], pendingMpesas: [], idempotency: {} }));
  const port = 30000 + (process.pid % 20000) + servers.length;
  const child = execFile(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env: { ...process.env, NODE_ENV: "test", APP_BIND_HOST: "localhost", FORCE_HTTPS_REDIRECT: production ? "1" : "0", FORCE_SECURE_COOKIE: production ? "1" : "0", FORCE_METRICS_AUTH: production ? "1" : "0", DATA_BACKEND: "json", TRUST_PROXY: production ? "1" : "0", PORT: String(port), SESSION_SECRET: "auth-test-secret", SETUP_BOOTSTRAP_SECRET: setupBootstrapSecret, METRICS_BEARER_TOKEN: "test-metrics-bearer-token-long-enough-123456", APP_ALLOWED_ORIGINS: production ? "https://chama.example.test" : "", CHAMA_DATA_FILE: dataFile, CHAMA_LOGIN_LOCKOUT_MS: String(lockoutMs), APP_CANONICAL_ORIGIN: production ? "https://chama.example.test" : "", AFRICASTALKING_USERNAME: "", AFRICASTALKING_API_KEY: "" } });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 8000);
    const check = setInterval(() => { if (output.includes(`localhost:${port}`)) { clearTimeout(timer); clearInterval(check); resolve(); } }, 20);
    child.once("exit", code => { clearTimeout(timer); clearInterval(check); reject(new Error(`Server exited (${code}): ${output}`)); });
  });
  const server = { baseUrl: `http://localhost:${port}`, phone, legacyPhone, dataFile, stop: async () => { if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once("exit", resolve)); } fs.rmSync(directory, { recursive: true, force: true }); } };
  servers.push(server);
  return server;
}
async function login(server, phone, pin, forwardedFor) {
  return fetch(`${server.baseUrl}/api/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "chama", ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}) }, body: JSON.stringify({ phone, pin }) });
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function json(response) { return response.json(); }
after(async () => { for (const server of servers) await server.stop(); });

test("signup rejects a four-digit PIN", async () => {
  const server = await startAuthServer({ empty: true });
  const signup = pin => fetch(`${server.baseUrl}/api/setup`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "chama" }, body: JSON.stringify({ chamaName: "Test Chama", name: "Test Chair", phone: "0711000001", email: "chair@example.test", pin, termsAccepted: true, privacyNoticeAcknowledged: true, ageConfirmed: true }) });
  assert.equal((await signup("1234")).status, 400);
  assert.equal((await signup("123456")).status, 201);
});

test("first-account setup requires the configured operator bootstrap credential", async () => {
  const bootstrapSecret = "B9g4H1k6M8n2P5q7R3w0X2c9V6t1Y4a8";
  const server = await startAuthServer({ empty: true, setupBootstrapSecret: bootstrapSecret });
  const payload = { chamaName: "Test Chama", name: "Test Chair", phone: "0711000001", email: "chair@example.test", pin: "123456", termsAccepted: true, privacyNoticeAcknowledged: true, ageConfirmed: true };
  const setup = secret => fetch(`${server.baseUrl}/api/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "chama", ...(secret ? { "X-Setup-Bootstrap-Secret": secret } : {}) },
    body: JSON.stringify(payload),
  });
  assert.equal((await setup()).status, 403);
  assert.equal((await setup("incorrect-bootstrap-value")).status, 403);
  const unchanged = JSON.parse(fs.readFileSync(server.dataFile, "utf8"));
  assert.equal(unchanged.users.length, 0);
  assert.equal(unchanged.chamas.length, 0);
  assert.equal((await setup(bootstrapSecret)).status, 201);
  assert.equal((await setup()).status, 403);
  const stored = JSON.parse(fs.readFileSync(server.dataFile, "utf8"));
  assert.equal(JSON.stringify(stored).includes(bootstrapSecret), false);
});

test("invitation activation rejects a four-digit PIN", async () => {
  const server = await startAuthServer({ empty: true });
  const setup = await fetch(`${server.baseUrl}/api/setup`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "chama" }, body: JSON.stringify({ chamaName: "Test Chama", name: "Test Chair", phone: "0711000001", email: "chair@example.test", pin: "123456", termsAccepted: true, privacyNoticeAcknowledged: true, ageConfirmed: true }) });
  assert.equal(setup.status, 201);
  const cookie = setup.headers.getSetCookie()[0].split(";")[0];
  const savedState = JSON.parse(fs.readFileSync(server.dataFile, "utf8"));
  await require("./active-subscription-fixture").activateTestSubscription({ dataFile: server.dataFile, baseUrl: server.baseUrl, chamaId: savedState.chamas[0].id });
  const invite = await fetch(`${server.baseUrl}/api/invitations`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "X-Requested-With": "chama", "Idempotency-Key": "auth-invite-test" }, body: JSON.stringify({ name: "Test Member", phone: "0711000002", email: "member@example.test", role: "member" }) });
  assert.equal(invite.status, 201);
  const { activationCode } = await json(invite);
  const activate = pin => fetch(`${server.baseUrl}/api/invitations/activate`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "chama" }, body: JSON.stringify({ phone: "0711000002", code: activationCode, pin, termsAccepted: true, privacyNoticeAcknowledged: true, ageConfirmed: true }) });
  assert.equal((await activate("5678")).status, 400);
  assert.equal((await activate("567890")).status, 201);
});

test("legacy four-digit PIN login requires a six-digit change before dashboard access", async () => {
  const server = await startAuthServer();
  const response = await login(server, server.legacyPhone, "1234");
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie()[0].split(";")[0];
  const dashboardUrl = `${server.baseUrl}/api/dashboard`;
  assert.equal((await fetch(dashboardUrl, { headers: { Cookie: cookie } })).status, 403);
  for (const route of ["/api/export.csv", "/api/leadership-changes", "/api/events/stream"]) {
    const gated = await fetch(`${server.baseUrl}${route}`, { headers: { Cookie: cookie } });
    assert.equal(gated.status, 403, `${route} must stay closed until the PIN changes`);
    assert.equal((await gated.json()).mustChangePin, true);
  }
  const change = newPin => fetch(`${server.baseUrl}/api/pin/change`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", "X-Requested-With": "chama" }, body: JSON.stringify({ currentPin: "1234", newPin }) });
  assert.equal((await change("5678")).status, 400);
  assert.equal((await change("567890")).status, 200);
  assert.equal((await fetch(dashboardUrl, { headers: { Cookie: cookie } })).status, 200);
});

test("five failures lock a phone and the sixth attempt receives the generic lockout message", async () => {
  const server = await startAuthServer();
  for (let index = 1; index <= 5; index += 1) assert.equal((await login(server, "0712000001", "wrong", `198.51.100.${index}`)).status, 401);
  const locked = await login(server, "0712000001", "wrong", "198.51.100.20");
  assert.equal(locked.status, 429);
  assert.equal((await locked.json()).message, "Too many login attempts. Try again in 15 minutes.");
});

test("five failures from one IP lock that IP independently of phone counters", async () => {
  const server = await startAuthServer();
  for (let index = 1; index <= 5; index += 1) assert.equal((await login(server, `071200000${index}`, "wrong", "198.51.100.30")).status, 401);
  const locked = await login(server, "0712000009", "wrong", "198.51.100.30");
  assert.equal(locked.status, 429);
  assert.equal((await locked.json()).message, "Too many login attempts. Try again in 15 minutes.");
});

test("login lockout expires after the 15-minute interval", async () => {
  const server = await startAuthServer({ lockoutMs: 120 });
  for (let index = 0; index < 5; index += 1) assert.equal((await login(server, server.phone, "wrong", "198.51.100.40")).status, 401);
  assert.equal((await login(server, server.phone, "123456", "198.51.100.40")).status, 429);
  await sleep(150);
  assert.equal((await login(server, server.phone, "123456", "198.51.100.40")).status, 200);
});

test("production redirects HTTP to HTTPS and marks session cookies Secure", async () => {
  const server = await startAuthServer({ production: true });
  const redirect = await fetch(`${server.baseUrl}/api/health`, { redirect: "manual", headers: { Host: "attacker.example" } });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get("location"), "https://chama.example.test/api/health");
  const blockedOrigin = await fetch(`${server.baseUrl}/api/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "chama", "X-Forwarded-Proto": "https", Origin: "https://attacker.example" }, body: JSON.stringify({ phone: server.phone, pin: "123456" }) });
  assert.equal(blockedOrigin.status, 403);
  const response = await fetch(`${server.baseUrl}/api/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "chama", "X-Forwarded-Proto": "https", Origin: "https://chama.example.test" }, body: JSON.stringify({ phone: server.phone, pin: "123456" }) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /; secure/i);
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
  const metrics = await fetch(`${server.baseUrl}/metrics`);
  assert.equal(metrics.status, 404);
  const metricsAuthorized = await fetch(`${server.baseUrl}/metrics`, { headers: { Authorization: "Bearer test-metrics-bearer-token-long-enough-123456" } });
  assert.equal(metricsAuthorized.status, 200);
});

test("write requests reject a missing custom header and a cross-site Origin", async () => {
  const server = await startAuthServer();
  const post = headers => fetch(`${server.baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ phone: server.phone, pin: "123456" }),
  });
  assert.equal((await post({})).status, 400);
  assert.equal((await post({ "X-Requested-With": "chama", Origin: "http://attacker.example" })).status, 403);
  assert.equal((await post({ "X-Requested-With": "chama", Origin: server.baseUrl })).status, 200);
});

test("OTP requests enforce a destination phone cooldown even when delivery is unavailable", async () => {
  const server = await startAuthServer();
  const requestCode = () => fetch(`${server.baseUrl}/api/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "chama" },
    body: JSON.stringify({ phone: server.phone }),
  });
  assert.equal((await requestCode()).status, 503);
  assert.equal((await requestCode()).status, 429);
});


function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function clientDataBytes(type, challenge, origin) {
  return Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }), "utf8");
}

function cborText(value) {
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length >= 24) throw new Error("Test CBOR text value is too long.");
  return Buffer.concat([Buffer.from([0x60 + bytes.length]), bytes]);
}

function cborBytes(value) {
  const bytes = Buffer.from(value);
  if (bytes.length < 24) return Buffer.concat([Buffer.from([0x40 + bytes.length]), bytes]);
  if (bytes.length <= 255) return Buffer.concat([Buffer.from([0x58, bytes.length]), bytes]);
  throw new Error("Test CBOR byte string is too long.");
}

function makeRegistrationFixture(options, origin, { userVerified = true } = {}) {
  const keyPair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const publicKey = keyPair.publicKey;
  const spki = publicKey.export({ type: "spki", format: "der" }).toString("base64url");
  const jwk = publicKey.export({ format: "jwk" });
  const cosePublicKey = Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21]),
    cborBytes(Buffer.from(jwk.x, "base64url")),
    Buffer.from([0x22]),
    cborBytes(Buffer.from(jwk.y, "base64url")),
  ]);
  const credentialIdBytes = crypto.randomBytes(32);
  const credentialIdLength = Buffer.alloc(2);
  credentialIdLength.writeUInt16BE(credentialIdBytes.length, 0);
  const rpIdHash = crypto.createHash("sha256").update(options.rpId, "utf8").digest();
  const authenticatorData = Buffer.concat([
    rpIdHash,
    Buffer.from([userVerified ? 0x45 : 0x41]),
    Buffer.alloc(4),
    Buffer.alloc(16),
    credentialIdLength,
    credentialIdBytes,
    cosePublicKey,
  ]);
  const attestationObject = Buffer.concat([
    Buffer.from([0xa3]),
    cborText("fmt"), cborText("none"),
    cborText("attStmt"), Buffer.from([0xa0]),
    cborText("authData"), cborBytes(authenticatorData),
  ]);
  const id = toBase64Url(credentialIdBytes);
  return {
    keyPair,
    publicKey: spki,
    body: {
      type: "public-key",
      id,
      rawId: id,
      user: options.user,
      response: {
        clientDataJSON: toBase64Url(clientDataBytes("webauthn.create", options.challenge, origin)),
        authenticatorData: toBase64Url(authenticatorData),
        attestationObject: toBase64Url(attestationObject),
        publicKey: spki,
        publicKeyAlgorithm: -7,
        transports: ["internal"],
      },
    },
  };
}

function makeAssertionFixture(credential, challenge, origin, counter = 1) {
  const clientData = clientDataBytes("webauthn.get", challenge, origin);
  const authenticatorData = Buffer.alloc(37);
  crypto.createHash("sha256").update(new URL(origin).hostname, "utf8").digest().copy(authenticatorData, 0);
  authenticatorData[32] = 0x05;
  authenticatorData.writeUInt32BE(counter, 33);
  const signedBytes = Buffer.concat([
    authenticatorData,
    crypto.createHash("sha256").update(clientData).digest(),
  ]);
  const signature = crypto.sign("sha256", signedBytes, credential.keyPair.privateKey);
  const userHandle = toBase64Url(Buffer.from(credential.userHandle, "utf8"));
  return {
    type: "public-key",
    id: credential.id,
    rawId: credential.id,
    authenticatorAttachment: "platform",
    response: {
      clientDataJSON: toBase64Url(clientData),
      authenticatorData: toBase64Url(authenticatorData),
      signature: toBase64Url(signature),
      userHandle,
    },
  };
}

function passkeyOrigin(server) {
  return server.baseUrl;
}

function passkeyHeaders(server, cookie) {
  return {
    "Content-Type": "application/json",
    "X-Requested-With": "chama",
    Origin: passkeyOrigin(server),
    Host: new URL(passkeyOrigin(server)).host,
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

function sessionCookie(response) {
  const cookies = response.headers.getSetCookie?.() || [response.headers.get("set-cookie")];
  const value = cookies.find(Boolean);
  if (!value) throw new Error("Expected a session cookie from the disposable test server.");
  return value.split(";")[0];
}

async function passkeyPost(server, route, cookie, body = {}) {
  return fetch(`${server.baseUrl}/api/passkeys/${route}`, {
    method: "POST",
    headers: passkeyHeaders(server, cookie),
    body: JSON.stringify(body),
  });
}

async function enrollTestPasskey(server, { userVerified = true } = {}) {
  const pinLogin = await login(server, server.phone, "123456");
  assert.equal(pinLogin.status, 200);
  const pinCookie = sessionCookie(pinLogin);
  const optionsResponse = await passkeyPost(server, "registration/options", pinCookie);
  assert.equal(optionsResponse.status, 200);
  const options = await json(optionsResponse);
  const fixture = makeRegistrationFixture(options, passkeyOrigin(server), { userVerified });
  const verifyResponse = await passkeyPost(server, "registration/verify", pinCookie, fixture.body);
  const savedState = JSON.parse(fs.readFileSync(server.dataFile, "utf8"));
  const savedUser = savedState.users.find(user => user.id === "current");
  return {
    pinCookie,
    options,
    fixture,
    verifyResponse,
    savedState,
    savedUser,
    credential: {
      id: fixture.body.id,
      keyPair: fixture.keyPair,
      publicKey: fixture.publicKey,
      userHandle: savedUser.passkeyUserHandle,
    },
  };
}

async function startPasskeyStepUpServer() {
  let currentSession = {};
  let state = { users: [{ id: "current", name: "Test Chair", phone: "+254711000001", role: "chairperson", status: "active", mustChangePin: false, chamaId: "test-chama" }] };
  const user = state.users[0];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { ...currentSession };
    req.sessionID = "step-up-test-session";
    next();
  });
  const passThrough = (_req, _res, next) => next();
  app.use("/api/passkeys", createPasskeyRouter({
    express,
    getState: () => state,
    persist: async updated => { state = updated; },
    production: false,
    strictOrigin: false,
    allowedOrigins: new Set(),
    sessionIdleMs: 30 * 60 * 1000,
    requireAuth: (req, _res, next) => { req.user = user; next(); },
    requirePinChanged: passThrough,
    loginLimiter: passThrough,
    passkeyLoginLimiter: passThrough,
    passkeyManagementLimiter: passThrough,
    activeSessionsGauge: { inc() {} },
    safeUser: value => ({ id: value.id }),
    findChamaName: () => "Test Chama",
    loginLocked: async () => false,
    recordLoginFailure: async () => {},
    clearLoginFailures: async () => {},
    normalizePhone: value => value,
    saveSession: async () => {},
  }));
  const server = await new Promise(resolve => {
    const listener = app.listen(0, "localhost", () => resolve(listener));
  });
  const address = server.address();
  return {
    baseUrl: `http://localhost:${address.port}`,
    setSession(value) { currentSession = value; },
    async close() { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}

test("passkey RP context accepts HTTPS or standards-valid HTTP localhost only", () => {
  assert.deepEqual(derivePasskeyContext({ originHeader: "http://localhost:3000", hostHeader: "localhost:3000" }), { origin: "http://localhost:3000", rpId: "localhost" });
  assert.equal(derivePasskeyContext({ originHeader: "http://127.0.0.1:3000", hostHeader: "127.0.0.1:3000" }), null);
  assert.deepEqual(derivePasskeyContext({ originHeader: "https://chama.example.test", hostHeader: "chama.example.test" }), { origin: "https://chama.example.test", rpId: "chama.example.test" });
  assert.equal(derivePasskeyContext({ originHeader: "https://127.0.0.1", hostHeader: "127.0.0.1" }), null);
  assert.equal(derivePasskeyContext({ originHeader: "https://[::1]", hostHeader: "[::1]" }), null);
  assert.equal(derivePasskeyContext({ originHeader: "http://chama.example.test", hostHeader: "chama.example.test" }), null);
  assert.equal(derivePasskeyContext({ originHeader: "https://attacker.example", hostHeader: "chama.example.test" }), null);
  assert.equal(derivePasskeyContext({ originHeader: "https://chama.example.test/path", hostHeader: "chama.example.test" }), null);
  assert.deepEqual(derivePasskeyContext({ originHeader: "https://chama.example.test", hostHeader: "chama.example.test", strictOrigin: true, canonicalOrigin: "https://chama.example.test" }), { origin: "https://chama.example.test", rpId: "chama.example.test" });
  assert.equal(derivePasskeyContext({ originHeader: "http://localhost:3000", hostHeader: "localhost:3000", strictOrigin: true, canonicalOrigin: "https://chama.example.test" }), null);
});

test("passkey challenges are session-bound, expire, and can be consumed only once", async () => {
  const challenge = crypto.randomBytes(24).toString("base64url");
  const record = createPasskeyChallenge({ ceremony: "login", challenge, sessionId: "session-one", origin: "https://chama.example.test", rpId: "chama.example.test" });
  let saveCount = 0;
  const saveSession = async session => {
    saveCount += 1;
    assert.equal(Object.hasOwn(session, "passkeyChallenge"), false);
  };
  const consumed = await consumePasskeyChallenge({ session: { passkeyChallenge: record }, sessionId: "session-one", ceremony: "login", saveSession });
  assert.equal(consumed.challenge, challenge);
  assert.equal(await consumePasskeyChallenge({ session: { passkeyChallenge: record }, sessionId: "session-one", ceremony: "login", saveSession }), null);
  assert.equal(await consumePasskeyChallenge({ session: { passkeyChallenge: record }, sessionId: "different-session", ceremony: "login", saveSession }), null);
  const expired = createPasskeyChallenge({ ceremony: "registration", challenge: crypto.randomBytes(24).toString("base64url"), sessionId: "session-one", origin: "https://chama.example.test", rpId: "chama.example.test", issuedAt: Date.now() - PASSKEY_CHALLENGE_TTL_MS - 1 });
  assert.equal(await consumePasskeyChallenge({ session: { passkeyChallenge: expired }, sessionId: "session-one", ceremony: "registration", saveSession }), null);
  assert.equal(saveCount, 4);
});

test("passkey signature counters reject repeats and regressions but allow counterless authenticators", () => {
  assert.equal(validCounterTransition(0, 0), true);
  assert.equal(validCounterTransition(0, 1), true);
  assert.equal(validCounterTransition(4, 5), true);
  assert.equal(validCounterTransition(4, 4), false);
  assert.equal(validCounterTransition(4, 3), false);
  assert.equal(validCounterTransition(4, 0), true);
  assert.equal(nextStoredCounter(4, 0), 4);
});

test("passkey enrollment needs a fresh PIN-authenticated session, not merely any logged-in session", async () => {
  const server = await startPasskeyStepUpServer();
  const request = () => fetch(`${server.baseUrl}/api/passkeys/registration/options`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "chama", Origin: passkeyOrigin(server), Host: new URL(passkeyOrigin(server)).host },
    body: "{}",
  });
  try {
    server.setSession({ authMethod: "passkey", pinAuthenticatedAt: Date.now() });
    assert.equal((await request()).status, 403);
    server.setSession({ authMethod: "pin", pinAuthenticatedAt: Date.now() - 11 * 60 * 1000 });
    assert.equal((await request()).status, 403);
    server.setSession({ authMethod: "pin", pinAuthenticatedAt: Date.now() });
    const allowed = await request();
    assert.equal(allowed.status, 200);
    assert.equal(typeof (await allowed.json()).challenge, "string");
  } finally {
    await server.close();
  }
});

test("registration requires verified user presence and consumes failed challenges", async () => {
  const server = await startAuthServer();
  const pinLogin = await login(server, server.phone, "123456");
  const pinCookie = sessionCookie(pinLogin);
  const optionsResponse = await passkeyPost(server, "registration/options", pinCookie);
  assert.equal(optionsResponse.status, 200);
  const options = await json(optionsResponse);
  const unverified = makeRegistrationFixture(options, passkeyOrigin(server), { userVerified: false });
  assert.equal((await passkeyPost(server, "registration/verify", pinCookie, unverified.body)).status, 400);
  const replay = makeRegistrationFixture(options, passkeyOrigin(server), { userVerified: true });
  assert.equal((await passkeyPost(server, "registration/verify", pinCookie, replay.body)).status, 400);
  const saved = JSON.parse(fs.readFileSync(server.dataFile, "utf8"));
  assert.equal(saved.users.find(user => user.id === "current").passkeys, undefined);
});

test("a PIN-enrolled passkey can sign in once; only public credential material is persisted", async () => {
  const server = await startAuthServer();
  const enrolled = await enrollTestPasskey(server);
  assert.equal(enrolled.verifyResponse.status, 201);
  const stored = enrolled.savedUser.passkeys[0];
  assert.equal(stored.id, enrolled.credential.id);
  assert.equal(stored.publicKey, enrolled.credential.publicKey);
  assert.equal(stored.privateKey, undefined);
  assert.equal(stored.counter, 0);
  assert.equal(enrolled.savedUser.passkeyUserHandle, enrolled.options.user.id);

  const optionsResponse = await passkeyPost(server, "login/options");
  assert.equal(optionsResponse.status, 200);
  const optionsCookie = sessionCookie(optionsResponse);
  const options = await json(optionsResponse);
  const assertion = makeAssertionFixture(enrolled.credential, options.challenge, passkeyOrigin(server));
  const loginResponse = await passkeyPost(server, "login/verify", optionsCookie, assertion);
  assert.equal(loginResponse.status, 200);
  assert.equal((await json(loginResponse)).message, "Signed in successfully.");
  const authenticatedCookie = sessionCookie(loginResponse);
  assert.notEqual(authenticatedCookie, optionsCookie, "successful passkey login must regenerate the session");
  const passkeyList = await fetch(`${server.baseUrl}/api/passkeys`, { headers: { Cookie: authenticatedCookie } });
  assert.equal(passkeyList.status, 200);
  assert.equal((await json(passkeyList)).data.length, 1);

  const replay = await passkeyPost(server, "login/verify", optionsCookie, assertion);
  assert.equal(replay.status, 401);
  assert.equal((await json(replay)).message, "Could not sign in with that passkey. Try again or use your phone number and PIN.");
});

test("passkey failures do not reveal whether a credential/account exists", async () => {
  const server = await startAuthServer();
  const enrolled = await enrollTestPasskey(server);
  assert.equal(enrolled.verifyResponse.status, 201);

  const knownOptionsResponse = await passkeyPost(server, "login/options");
  const knownCookie = sessionCookie(knownOptionsResponse);
  const knownOptions = await json(knownOptionsResponse);
  const knownBad = makeAssertionFixture(enrolled.credential, knownOptions.challenge, passkeyOrigin(server));
  knownBad.response.signature = toBase64Url(Buffer.alloc(64, 0x42));
  const knownFailure = await passkeyPost(server, "login/verify", knownCookie, knownBad);

  const unknownOptionsResponse = await passkeyPost(server, "login/options");
  const unknownCookie = sessionCookie(unknownOptionsResponse);
  const unknownOptions = await json(unknownOptionsResponse);
  const unknown = makeAssertionFixture(enrolled.credential, unknownOptions.challenge, passkeyOrigin(server));
  unknown.id = toBase64Url(crypto.randomBytes(32));
  unknown.rawId = unknown.id;
  const unknownFailure = await passkeyPost(server, "login/verify", unknownCookie, unknown);

  assert.equal(knownFailure.status, 401);
  assert.equal(unknownFailure.status, 401);
  assert.equal((await knownFailure.json()).message, (await unknownFailure.json()).message);
});
