"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { loadAppEnv } = require("../config/env");

if (process.env.NODE_ENV !== "test") {
  loadAppEnv();
}

function resolveDataFile(target) {
  return target || process.env.CHAMA_DATA_FILE || path.join(__dirname, "..", "data.json");
}

function resolveBackupDir(customDir) {
  const dir = customDir || process.env.CHAMA_BACKUP_DIR || path.join(__dirname, "..", "backups");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

function validateJsonState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("Invalid state: backup root must be an object.");
  }
  if (typeof state.version !== "number") {
    throw new Error("Invalid state: missing or invalid schema version number.");
  }
  for (const table of ["chamas", "users", "transactions", "loans", "invitations"]) {
    if (!Array.isArray(state[table])) {
      throw new Error(`Invalid state: table '${table}' must be an array.`);
    }
  }
  return true;
}

function createJsonBackup({ sourcePath, destinationPath, backupDir } = {}) {
  const source = resolveDataFile(sourcePath);
  if (!fs.existsSync(source)) {
    throw new Error(`Source data file does not exist: ${source}`);
  }

  const raw = fs.readFileSync(source, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Source data file is not valid JSON: ${error.message}`);
  }

  validateJsonState(parsed);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const destDir = resolveBackupDir(backupDir);
  const dest = destinationPath || path.join(destDir, `backup-${timestamp}.json`);

  const tmpDest = `${dest}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmpDest, JSON.stringify(parsed, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmpDest, dest);

  return {
    success: true,
    backend: "json",
    source,
    destination: dest,
    chamasCount: parsed.chamas.length,
    usersCount: parsed.users.length,
    transactionsCount: parsed.transactions.length,
    timestamp: new Date().toISOString(),
  };
}

function restoreJsonBackup({ backupPath, targetPath } = {}) {
  if (!backupPath) {
    throw new Error("Backup file path is required for restore.");
  }
  const resolvedBackup = path.resolve(backupPath);
  if (!fs.existsSync(resolvedBackup)) {
    throw new Error(`Backup file does not exist: ${resolvedBackup}`);
  }

  const raw = fs.readFileSync(resolvedBackup, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Backup file is not valid JSON: ${error.message}`);
  }

  validateJsonState(parsed);

  const target = resolveDataFile(targetPath);
  const targetDir = path.dirname(target);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const tmpTarget = `${target}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmpTarget, JSON.stringify(parsed, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmpTarget, target);

  return {
    success: true,
    backend: "json",
    restoredFrom: resolvedBackup,
    target,
    chamasCount: parsed.chamas.length,
    usersCount: parsed.users.length,
    transactionsCount: parsed.transactions.length,
    timestamp: new Date().toISOString(),
  };
}

function verifyBackupFile(backupPath) {
  if (!backupPath) {
    throw new Error("Backup file path is required for verification.");
  }
  const resolvedBackup = path.resolve(backupPath);
  if (!fs.existsSync(resolvedBackup)) {
    throw new Error(`Backup file does not exist: ${resolvedBackup}`);
  }

  const raw = fs.readFileSync(resolvedBackup, "utf8");
  const parsed = JSON.parse(raw);
  validateJsonState(parsed);

  return {
    valid: true,
    version: parsed.version,
    chamasCount: parsed.chamas.length,
    usersCount: parsed.users.length,
    transactionsCount: parsed.transactions.length,
  };
}

async function runCli(argv = process.argv.slice(2)) {
  const command = argv[0] || "help";
  const arg1 = argv[1];
  const arg2 = argv[2];

  switch (command) {
    case "create":
    case "backup": {
      const result = createJsonBackup({ destinationPath: arg1 });
      console.log(`Backup created successfully: ${result.destination}`);
      console.log(`Chamas: ${result.chamasCount}, Users: ${result.usersCount}, Transactions: ${result.transactionsCount}`);
      return result;
    }
    case "restore": {
      if (!arg1) {
        console.error("Usage: node scripts/backup.js restore <path-to-backup.json> [target-data-file]");
        process.exitCode = 1;
        return;
      }
      const result = restoreJsonBackup({ backupPath: arg1, targetPath: arg2 });
      console.log(`Backup restored successfully to: ${result.target}`);
      console.log(`Chamas: ${result.chamasCount}, Users: ${result.usersCount}, Transactions: ${result.transactionsCount}`);
      return result;
    }
    case "verify": {
      if (!arg1) {
        console.error("Usage: node scripts/backup.js verify <path-to-backup.json>");
        process.exitCode = 1;
        return;
      }
      const result = verifyBackupFile(arg1);
      console.log(`Backup verified: valid schema v${result.version}. Chamas: ${result.chamasCount}, Users: ${result.usersCount}`);
      return result;
    }
    default: {
      console.log("Jirani Chama Backup & Restore Utility");
      console.log("Commands:");
      console.log("  create [output-path]                 Create a snapshot backup of current data");
      console.log("  restore <backup-file> [target-file]  Restore state from a backup file");
      console.log("  verify <backup-file>                 Verify backup file schema and integrity");
      break;
    }
  }
}

if (require.main === module) {
  runCli().catch(error => {
    console.error(`Backup operation failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  createJsonBackup,
  restoreJsonBackup,
  verifyBackupFile,
  validateJsonState,
  runCli,
};
