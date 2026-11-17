"use strict";

const fs = require("fs");
const path = require("path");
const projectRoot = path.resolve(__dirname, "..", "..");
const dotenv = require(path.join(projectRoot, "chamafork", "node_modules", "dotenv"));
const { Client } = require(path.join(projectRoot, "chamafork", "node_modules", "pg"));
const sharedEnv = dotenv.parse(fs.readFileSync(path.join(projectRoot, ".env.local"), "utf8"));
const appEnv = dotenv.parse(fs.readFileSync(path.join(projectRoot, "chamafork", ".env"), "utf8"));

function errorSummary(error) {
  const code = error && error.code ? String(error.code) : "UNKNOWN";
  const known = {
    ECONNREFUSED: "Connection refused",
    ETIMEDOUT: "Connection timed out",
    ENOTFOUND: "Host lookup failed",
    "28P01": "Database authentication failed",
    "3D000": "Database does not exist",
    CERT_HAS_EXPIRED: "TLS certificate expired",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "TLS certificate could not be verified",
  };
  return { code, message: known[code] || "Database check failed; details withheld" };
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function checkSource() {
  const url = new URL(sharedEnv.DATABASE_URL || "");
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!url.hostname.endsWith(".neon.tech") || database !== "neondb") {
    throw new Error("Configured source is not the expected Neon neondb endpoint.");
  }
  url.searchParams.delete("sslmode");
  url.searchParams.delete("ssl");
  const client = new Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: 12000,
    query_timeout: 30000,
  });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const identity = (await client.query(
      "SELECT current_database() AS database, current_schema() AS schema, current_setting($1) AS server_version",
      ["server_version"],
    )).rows[0];
    const tls = (await client.query(
      "SELECT ssl, version, cipher FROM pg_stat_ssl WHERE pid = pg_backend_pid()",
    )).rows[0] || { ssl: false };
    const tables = (await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = $2 ORDER BY table_name",
      ["public", "BASE TABLE"],
    )).rows.map((row) => row.table_name);
    const rowCounts = {};
    for (const table of tables) {
      const result = await client.query(
        `SELECT count(*)::text AS row_count FROM ${quoteIdentifier("public")}.${quoteIdentifier(table)}`,
      );
      rowCounts[table] = result.rows[0].row_count;
    }
    await client.query("ROLLBACK");
    return {
      provider: "Neon",
      host: url.hostname,
      configuredDatabase: database,
      verifiedDatabase: identity.database,
      schema: identity.schema,
      serverVersion: identity.server_version,
      tls,
      tableCount: tables.length,
      rowCounts,
      readOnlyTransaction: true,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function checkLocal() {
  const url = new URL(appEnv.DATABASE_URL || "");
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || database !== "chama") {
    throw new Error("Configured local target is not localhost/chama; no target was queried.");
  }
  const client = new Client({
    connectionString: url.toString(),
    ssl: false,
    connectionTimeoutMillis: 6000,
    query_timeout: 10000,
  });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const result = (await client.query(
      "SELECT current_database() AS database, current_setting($1) AS server_version, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser, (SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user) AS can_create_database, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass_rls, EXISTS (SELECT 1 FROM pg_database WHERE datname = $2) AS copy_database_exists",
      ["server_version", "chama_local_copy_20261112"],
    )).rows[0];
    const tls = (await client.query(
      "SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()",
    )).rows[0] || { ssl: false };
    await client.query("ROLLBACK");
    return {
      host: url.hostname,
      port: url.port || "5432",
      configuredDatabase: database,
      connectedDatabase: result.database,
      serverVersion: result.server_version,
      tls,
      roleFlags: {
        isSuperuser: result.is_superuser,
        canCreateDatabase: result.can_create_database,
        bypassRls: result.bypass_rls,
      },
      chosenCopyDatabaseExists: result.copy_database_exists,
      readOnlyTransaction: true,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

(async () => {
  const report = {};
  try {
    report.source = await checkSource();
  } catch (error) {
    report.source = { error: errorSummary(error) };
  }
  try {
    report.local = await checkLocal();
  } catch (error) {
    report.local = { error: errorSummary(error) };
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.source.error || report.local.error) process.exitCode = 1;
})().catch(() => {
  console.error("Verification script failed; details withheld.");
  process.exitCode = 1;
});
