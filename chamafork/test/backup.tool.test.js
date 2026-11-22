"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, describe, afterEach } = require("node:test");
const {
  createJsonBackup,
  restoreJsonBackup,
  verifyBackupFile,
  validateJsonState,
} = require("../scripts/backup");

const testDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-backup-test-"));
  testDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (testDirs.length) {
    const dir = testDirs.pop();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
});

function validStateFixture() {
  return {
    version: 2,
    chamas: [{ id: "test-chama-1", name: "Test Chama One" }],
    users: [
      { id: "user-1", name: "Chair User", phone: "+254711000001", role: "chairperson" },
      { id: "user-2", name: "Member User", phone: "+254711000002", role: "member" },
    ],
    transactions: [
      { id: "tx-1", amount: 1000, type: "Monthly Contribution", memberId: "user-2" },
    ],
    loans: [],
    invitations: [],
    auditLog: [],
    settings: { defaultDeadlineDay: 5 },
  };
}

describe("Backup & Restore utility", () => {
  test("validateJsonState accepts valid schema and rejects invalid schemas", () => {
    assert.equal(validateJsonState(validStateFixture()), true);

    assert.throws(() => validateJsonState(null), /backup root must be an object/);
    assert.throws(() => validateJsonState([]), /backup root must be an object/);
    assert.throws(() => validateJsonState({ chamas: [] }), /missing or invalid schema version number/);
    assert.throws(() => validateJsonState({ version: 2, chamas: "not-an-array" }), /table 'chamas' must be an array/);
    assert.throws(() => validateJsonState({ version: 2, chamas: [], users: "bad" }), /table 'users' must be an array/);
  });

  test("createJsonBackup generates a valid timestamped snapshot file", () => {
    const dir = makeTempDir();
    const sourceFile = path.join(dir, "data.json");
    const backupDir = path.join(dir, "backups");
    const fixture = validStateFixture();

    fs.writeFileSync(sourceFile, JSON.stringify(fixture, null, 2), "utf8");

    const result = createJsonBackup({ sourcePath: sourceFile, backupDir });

    assert.equal(result.success, true);
    assert.equal(result.backend, "json");
    assert.equal(result.chamasCount, 1);
    assert.equal(result.usersCount, 2);
    assert.equal(result.transactionsCount, 1);
    assert.ok(fs.existsSync(result.destination));

    const content = JSON.parse(fs.readFileSync(result.destination, "utf8"));
    assert.deepEqual(content, fixture);
  });

  test("createJsonBackup fails when source file does not exist or is corrupted", () => {
    const dir = makeTempDir();
    const nonExistent = path.join(dir, "non-existent.json");
    assert.throws(() => createJsonBackup({ sourcePath: nonExistent }), /Source data file does not exist/);

    const corruptFile = path.join(dir, "corrupt.json");
    fs.writeFileSync(corruptFile, "{ invalid-json", "utf8");
    assert.throws(() => createJsonBackup({ sourcePath: corruptFile }), /Source data file is not valid JSON/);
  });

  test("verifyBackupFile accurately inspects valid backups", () => {
    const dir = makeTempDir();
    const backupPath = path.join(dir, "test-backup.json");
    const fixture = validStateFixture();

    fs.writeFileSync(backupPath, JSON.stringify(fixture), "utf8");

    const verified = verifyBackupFile(backupPath);
    assert.equal(verified.valid, true);
    assert.equal(verified.version, 2);
    assert.equal(verified.chamasCount, 1);
    assert.equal(verified.usersCount, 2);
    assert.equal(verified.transactionsCount, 1);
  });

  test("restoreJsonBackup cleanly restores state to target destination", () => {
    const dir = makeTempDir();
    const backupFile = path.join(dir, "snapshot.json");
    const targetFile = path.join(dir, "data.json");
    const fixture = validStateFixture();

    fs.writeFileSync(backupFile, JSON.stringify(fixture), "utf8");
    // Simulate empty or lost state in target
    fs.writeFileSync(targetFile, JSON.stringify({ version: 2, chamas: [], users: [], transactions: [], loans: [], invitations: [] }), "utf8");

    const result = restoreJsonBackup({ backupPath: backupFile, targetPath: targetFile });

    assert.equal(result.success, true);
    assert.equal(result.target, targetFile);
    assert.equal(result.chamasCount, 1);
    assert.equal(result.usersCount, 2);

    const restoredData = JSON.parse(fs.readFileSync(targetFile, "utf8"));
    assert.deepEqual(restoredData, fixture);
  });

  test("restoreJsonBackup rejects invalid or missing backup files", () => {
    const dir = makeTempDir();
    const missing = path.join(dir, "missing.json");
    assert.throws(() => restoreJsonBackup({ backupPath: missing }), /Backup file does not exist/);

    const invalid = path.join(dir, "invalid.json");
    fs.writeFileSync(invalid, JSON.stringify({ version: "bad", chamas: [] }), "utf8");
    assert.throws(() => restoreJsonBackup({ backupPath: invalid }), /missing or invalid schema version number/);
  });
});
