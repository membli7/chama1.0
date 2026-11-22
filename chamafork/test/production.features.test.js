"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { after, test } = require("node:test");

const servers = [];

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = probe.address().port;
      probe.close(error => (error ? reject(error) : resolve(port)));
    });
  });
}

function hashedPin(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
}

async function startTestServer({ hstsIncludeSubdomains = false, production = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-prod-features-"));
  const dataFile = path.join(directory, "data.json");
  const phone = "+254711000001";

  fs.writeFileSync(
    dataFile,
    JSON.stringify({
      version: 2,
      chamas: [{ id: "test-chama", name: "Production Feature Test Chama" }],
      users: [
        {
          id: "chair-1",
          name: "Test Chair",
          phone,
          role: "chairperson",
          status: "active",
          pinHash: hashedPin("123456"),
          mustChangePin: false,
          chamaId: "test-chama",
        },
      ],
      transactions: [],
      loans: [],
      payouts: [],
      invitations: [],
      leadershipChanges: [],
      pendingMpesas: [],
      idempotency: {},
    }),
    "utf8"
  );

  const port = await freePort();
  const child = execFile(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "test",
      APP_BIND_HOST: "127.0.0.1",
      PORT: String(port),
      DATA_BACKEND: "json",
      CHAMA_DATA_FILE: dataFile,
      SESSION_SECRET: "prod-features-test-session-secret-long",
      METRICS_BEARER_TOKEN: "prod-features-metrics-token-at-least-32-chars",
      ONE_TIME_CODE_HMAC_SECRET: "prod-features-onetime-code-secret-32-chars",
      FORCE_HTTPS_REDIRECT: production ? "1" : "0",
      FORCE_SECURE_COOKIE: production ? "1" : "0",
      TRUST_PROXY: production ? "1" : "0",
      APP_CANONICAL_ORIGIN: "https://chama.example.test",
      APP_ALLOWED_ORIGINS: "https://chama.example.test",
      HSTS_INCLUDE_SUBDOMAINS: hstsIncludeSubdomains ? "1" : "0",
      AFRICASTALKING_USERNAME: "",
      AFRICASTALKING_API_KEY: "",
    },
  });

  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 8000);
    const check = setInterval(() => {
      if (output.includes(`localhost:${port}`)) {
        clearTimeout(timer);
        clearInterval(check);
        resolve();
      }
    }, 20);
    child.once("exit", code => {
      clearTimeout(timer);
      clearInterval(check);
      reject(new Error(`Server exited (${code}): ${output}`));
    });
  });

  const server = {
    baseUrl: `http://127.0.0.1:${port}`,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill();
        await new Promise(res => child.once("exit", res));
      }
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
  servers.push(server);
  return server;
}

after(async () => {
  for (const server of servers) {
    await server.stop();
  }
});

test("/healthz and /readyz endpoints return HTTP 200 with ok status", async () => {
  const server = await startTestServer();

  const healthzRes = await fetch(`${server.baseUrl}/healthz`);
  assert.equal(healthzRes.status, 200);
  const healthzData = await healthzRes.json();
  assert.deepEqual(healthzData, { status: "ok" });

  const readyzRes = await fetch(`${server.baseUrl}/readyz`);
  assert.equal(readyzRes.status, 200);
  const readyzData = await readyzRes.json();
  assert.deepEqual(readyzData, { status: "ok" });
});

test("HSTS header respects HSTS_INCLUDE_SUBDOMAINS=1 configuration", async () => {
  const server = await startTestServer({ production: true, hstsIncludeSubdomains: true });

  const res = await fetch(`${server.baseUrl}/healthz`, {
    headers: {
      "X-Forwarded-Proto": "https",
      "X-Requested-With": "chama",
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains");
});

test("HSTS header defaults to max-age without includeSubDomains when flag is not 1", async () => {
  const server = await startTestServer({ production: true, hstsIncludeSubdomains: false });

  const res = await fetch(`${server.baseUrl}/healthz`, {
    headers: {
      "X-Forwarded-Proto": "https",
      "X-Requested-With": "chama",
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("strict-transport-security"), "max-age=31536000");
});

test("root page serves the compiled React frontend mount point and security headers", async () => {
  const server = await startTestServer({ production: true });

  const res = await fetch(`${server.baseUrl}/`, {
    headers: {
      "X-Forwarded-Proto": "https",
    },
  });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<div id="root"><\/div>/);
  assert.ok(res.headers.get("content-security-policy"));
  assert.match(res.headers.get("content-security-policy"), /default-src 'self'/);
});
