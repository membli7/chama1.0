"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { loadAppEnv } = require("../config/env");

test("loads only root .env and gives it precedence over chamafork/.env", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chama-env-loader-"));
  const childRoot = path.join(projectRoot, "chamafork");
  fs.mkdirSync(childRoot, { recursive: true });
  fs.writeFileSync(path.join(childRoot, ".env"), [
    "DATABASE_URL=child-db",
    "DATABASE_MIGRATION_URL=child-migration-db",
    "SMTP_HOST=child-smtp",
    "SMTP_PORT=2525",
    "CHAMAFORK_ONLY=child-only",
  ].join("\n") + "\n", "utf8");
  fs.writeFileSync(path.join(projectRoot, ".env"), [
    "DATABASE_URL=root-db",
    "DATABASE_MIGRATION_URL=root-migration-db",
    "SMTP_HOST=root-smtp",
    "ROOT_ONLY=root-only",
  ].join("\n") + "\n", "utf8");
  fs.writeFileSync(path.join(projectRoot, ".env.local"), [
    "DATABASE_URL=local-db",
    "DATABASE_MIGRATION_URL=local-migration-db",
    "NEON_BRANCH=should-not-load",
    "ENV_LOCAL_ONLY=should-not-load",
  ].join("\n") + "\n", "utf8");

  const envKeys = [
    "DATABASE_URL",
    "DATABASE_MIGRATION_URL",
    "SMTP_HOST",
    "SMTP_PORT",
    "CHAMAFORK_ONLY",
    "ROOT_ONLY",
    "NEON_BRANCH",
    "ENV_LOCAL_ONLY",
    "NODE_ENV",
  ];
  const originalEnv = new Map(envKeys.map(key => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  process.env.NODE_ENV = "development";

  try {
    loadAppEnv(projectRoot);
    assert.equal(process.env.DATABASE_URL, "root-db");
    assert.equal(process.env.DATABASE_MIGRATION_URL, "root-migration-db");
    assert.equal(process.env.SMTP_HOST, "root-smtp");
    assert.equal(process.env.SMTP_PORT, "2525");
    assert.equal(process.env.CHAMAFORK_ONLY, "child-only");
    assert.equal(process.env.ROOT_ONLY, "root-only");
    assert.equal(process.env.NEON_BRANCH, undefined);
    assert.equal(process.env.ENV_LOCAL_ONLY, undefined);
  } finally {
    for (const key of envKeys) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
