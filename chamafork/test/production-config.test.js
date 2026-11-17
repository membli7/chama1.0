"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const dotenv = require("dotenv");
const { createRenderTrustedProxyPredicate, createTrustedProxyPredicate, isPrivateIp, parseAllowedOrigins, parseTrustedProxyIps, resolveAppBindHost, strongSecret, validateProductionConfig } = require("../security/production-config");

const good = {
  NODE_ENV: "production",
  APP_CANONICAL_ORIGIN: "https://chama.example.test",
  APP_ALLOWED_ORIGINS: "https://chama.example.test",
  SESSION_SECRET: "A9b8C7d6E5f4G3h2J1k0LmNqRsTuVwXy",
  ONE_TIME_CODE_HMAC_SECRET: "D7k2P9m4X6c1V8n3R5t0Qw2E9a6Z1b4H",
  SETUP_BOOTSTRAP_SECRET: "B9g4H1k6M8n2P5q7R3w0X2c9V6t1Y4a8",
  METRICS_BEARER_TOKEN: "M9n8B7v6C5x4Z3a2Q1w0ErTyUiOpLsKd",
  DATA_BACKEND: "postgres",
  DATABASE_URL: "postgresql://runtime:private@db.example.test/chama",
  REDIS_URL: "rediss://redis.example.test",
  SESSION_STORE: "redis",
  TRUST_PROXY: "render",
  PGSSL: "verify-full",
};

test("production startup requires secure origins, strong secrets, PostgreSQL, Redis, and verified TLS", () => {
  assert.doesNotThrow(() => validateProductionConfig(good));
  for (const [key, value] of Object.entries({
    SESSION_SECRET: "short",
    ONE_TIME_CODE_HMAC_SECRET: "short",
    SETUP_BOOTSTRAP_SECRET: "short",
    METRICS_BEARER_TOKEN: "example-token-that-is-long-but-not-private-12345",
    SMTP_TRANSPORT: "json",
    SMTP_LOG_FILE: "mail.jsonl",
    APP_ALLOWED_ORIGINS: "http://chama.example.test",
    DATA_BACKEND: "json",
    REDIS_URL: "",
    TRUST_PROXY: "0",
    PGSSL: "require",
  })) {
    assert.throws(() => validateProductionConfig({ ...good, [key]: value }), /Unsafe production configuration/);
  }
  assert.throws(() => validateProductionConfig({ ...good, ONE_TIME_CODE_HMAC_SECRET: good.SESSION_SECRET }), /distinct from SESSION_SECRET/);
  assert.throws(() => validateProductionConfig({ ...good, SETUP_BOOTSTRAP_SECRET: "" }), /SETUP_BOOTSTRAP_SECRET must be/);
  assert.throws(() => validateProductionConfig({ ...good, SETUP_BOOTSTRAP_SECRET: good.SESSION_SECRET }), /SETUP_BOOTSTRAP_SECRET must be distinct from SESSION_SECRET/);
  assert.throws(() => validateProductionConfig({ ...good, SMTP_TRANSPORT: "json" }), /SMTP_TRANSPORT=json is prohibited in production/);
  assert.throws(() => validateProductionConfig({ ...good, SMTP_LOG_FILE: "mail.jsonl" }), /SMTP_LOG_FILE is prohibited in production/);
  assert.throws(() => validateProductionConfig({ ...good, REDIS_URL: "redis://redis.example.test" }), /Unsafe production configuration/);
});

test("server startup requires each security secret from the process environment", () => {
  for (const key of ["SESSION_SECRET", "ONE_TIME_CODE_HMAC_SECRET", "METRICS_BEARER_TOKEN"]) {
    const env = {
      ...process.env,
      NODE_ENV: "test",
      DATA_BACKEND: "json",
      PORT: "0",
      APP_BIND_HOST: "127.0.0.1",
    };
    delete env[key];
    delete env.NODE_OPTIONS;
    const result = spawnSync(process.execPath, ["server.js"], {
      cwd: path.join(__dirname, ".."),
      env,
      encoding: "utf8",
      timeout: 5000,
    });
    assert.equal(result.error, undefined, `${key} should fail during startup without hanging`);
    assert.notEqual(result.status, 0, `${key} must be required`);
    assert.match(result.stderr, new RegExp(`${key} must be set in the process environment\\.`));
  }
});

test("origin parsing rejects paths and non-HTTPS origins", () => {
  assert.deepEqual(parseAllowedOrigins("https://chama.example.test, https://app.example.test/"), ["https://chama.example.test", "https://app.example.test"]);
  assert.throws(() => parseAllowedOrigins("https://chama.example.test/dashboard"), /HTTPS scheme and host/);
});

test("production trusts only explicit private proxies and rejects public proxy or bind addresses", () => {
  assert.deepEqual(parseTrustedProxyIps("127.0.0.1,::ffff:127.0.0.1,10.0.0.8"), ["127.0.0.1", "10.0.0.8"]);
  const trustsProxy = createTrustedProxyPredicate("127.0.0.1,10.0.0.8");
  assert.equal(trustsProxy("::ffff:127.0.0.1"), true);
  assert.equal(trustsProxy("203.0.113.4"), false);
  assert.equal(isPrivateIp("0.0.0.0"), false);
  assert.equal(isPrivateIp("203.0.113.4"), false);
  assert.throws(() => parseTrustedProxyIps("203.0.113.4"), /exact loopback or private/);
  assert.throws(() => validateProductionConfig({ ...good, APP_BIND_HOST: "203.0.113.4" }), /APP_BIND_HOST must be/);
  assert.doesNotThrow(() => validateProductionConfig({ ...good, TRUST_PROXY: "1", TRUSTED_PROXY_IPS: "127.0.0.1" }));
  assert.throws(() => validateProductionConfig({ ...good, TRUST_PROXY: "1", TRUSTED_PROXY_IPS: "" }), /TRUSTED_PROXY_IPS must list/);
});

test("the app binds to localhost locally and 0.0.0.0 in production", () => {
  assert.equal(resolveAppBindHost({ NODE_ENV: "development" }), "127.0.0.1");
  assert.equal(resolveAppBindHost({ NODE_ENV: "production" }), "0.0.0.0");
  assert.equal(resolveAppBindHost({ APP_BIND_HOST: "10.0.0.8" }), "10.0.0.8");
  assert.equal(resolveAppBindHost({ APP_BIND_HOST: "  " }), "127.0.0.1");
});

test("Render proxy trust accepts only one private immediate hop", () => {
  const trustsRenderProxy = createRenderTrustedProxyPredicate();
  assert.equal(trustsRenderProxy("10.0.0.8", 0), true);
  assert.equal(trustsRenderProxy("::ffff:10.0.0.8", 0), true);
  assert.equal(trustsRenderProxy("10.0.0.8", 1), false);
  assert.equal(trustsRenderProxy("203.0.113.4", 0), false);
  assert.equal(trustsRenderProxy("0.0.0.0", 0), false);
});

test("the example environment selects safe local development services", () => {
  const example = dotenv.parse(fs.readFileSync(path.join(__dirname, "..", ".env.example")));
  const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.equal(example.PORT, "8001");
  assert.match(serverSource, /const PORT = Number\(process\.env\.PORT \|\| 8001\)/);
  assert.equal(example.DATA_BACKEND, "json");
  assert.equal(example.SESSION_STORE, "memory");
  assert.equal(example.REDIS_URL, "");
  assert.equal(example.TRUST_PROXY, "0");
  assert.equal(resolveAppBindHost(example), "127.0.0.1");
});

test("production environment loading does not read local dotenv files", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalPort = process.env.PORT;
  process.env.NODE_ENV = "production";
  process.env.PORT = "render-dashboard-port";
  try {
    require("../config/env").loadAppEnv();
    assert.equal(process.env.PORT, "render-dashboard-port");
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
  }
});

test("secret strength rejects short and placeholder values", () => {
  assert.equal(strongSecret("short"), false);
  assert.equal(strongSecret("a long example password value that is not secret"), false);
  assert.equal(strongSecret(good.SESSION_SECRET), true);
});
