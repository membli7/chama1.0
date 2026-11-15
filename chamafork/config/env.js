"use strict";

const path = require("path");
const dotenv = require("dotenv");

function loadAppEnv(projectRoot = path.join(__dirname, "..", "..")) {
  if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "test") return;
  // Root .env is authoritative for local development; .env.local is intentionally not loaded.
  dotenv.config({ path: path.join(projectRoot, "chamafork", ".env") });
  dotenv.config({ path: path.join(projectRoot, ".env"), override: true });
  if (process.env.DATABASE_URL && !process.env.DATABASE_MIGRATION_URL) {
    process.env.DATABASE_MIGRATION_URL = process.env.DATABASE_URL;
  }
}

module.exports = { loadAppEnv };
