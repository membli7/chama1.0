"use strict";

const fs = require("fs");
const path = require("path");
const { loadAppEnv } = require("../config/env");
loadAppEnv();
const { createPostgresPool } = require("./postgres");

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function grantRuntimePrivileges(client, runtimeConnectionString, migrationConnectionString = runtimeConnectionString) {
  if (!runtimeConnectionString) return;
  const runtimeUrl = new URL(runtimeConnectionString);
  const migrationUrl = new URL(migrationConnectionString);
  const runtimeDatabase = decodeURIComponent(runtimeUrl.pathname.replace(/^\/+/, ""));
  const migrationDatabase = decodeURIComponent(migrationUrl.pathname.replace(/^\/+/, ""));
  if (!runtimeDatabase || runtimeDatabase !== migrationDatabase) {
    throw new Error("DATABASE_URL and DATABASE_MIGRATION_URL must target the same database before runtime privileges can be granted.");
  }
  const runtimeRole = decodeURIComponent(runtimeUrl.username);
  if (!runtimeRole) throw new Error("DATABASE_URL must include the PostgreSQL runtime role.");
  const role = quoteIdentifier(runtimeRole);

  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
  await client.query(`REVOKE UPDATE, DELETE ON public.financial_reference_reservations FROM ${role}`);
  await client.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON app_chama_directory TO ${role}`);
  await client.query(`REVOKE ALL ON app_chama_directory FROM PUBLIC`);
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`);
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${role}`);
}

async function main() {
  const connectionString = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
  const pool = createPostgresPool({ connectionString });
  if (!pool) throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL must be set before running db:migrate.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const migration of ["001_foundation.sql", "002_app_tables.sql", "003_indexes.sql", "004_mpesa_receipts.sql", "005_receipt_reference_reservations.sql", "006_fk_support_indexes.sql", "007_support_and_faq.sql"]) {
      const sql = fs.readFileSync(path.join(__dirname, migration), "utf8");
      await client.query(sql);
    }
    await grantRuntimePrivileges(client, process.env.DATABASE_URL, connectionString);
    await client.query("COMMIT");
    console.log("PostgreSQL migrations 001 through 006 applied.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) main().catch(error => {
  console.error(`PostgreSQL migration failed: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { main, grantRuntimePrivileges };
