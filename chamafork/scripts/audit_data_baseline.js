#!/usr/bin/env node
"use strict";

/**
 * audit_data_baseline.js
 *
 * Strictly non-destructive, read-only baseline data audit for Jirani Chama.
 *
 * Verifies:
 *  - Total Chama and user record counts
 *  - Unique normalized phone numbers
 *  - Multi-Chama phone numbers and invalid/ambiguous phone formats
 *  - Comprehensive user reference integrity (relational columns & embedded JSON)
 *  - Separation of orphaned references from tenant-mismatched references
 *
 * Safety Guarantees:
 *  - Does NOT call persist(), saveState(), migrate(), or start any server.
 *  - For PostgreSQL: uses an explicit READ ONLY transaction with ROLLBACK.
 *  - Refuses non-loopback database hosts unless --allow-staging is passed.
 *  - Never exports PIN hashes, scrypt salts, or raw credentials.
 */

const fs = require("node:fs");
const path = require("node:path");

// ---------------------------------------------------------------------------
// Verified Phone Normalization & Privacy Masking (from server.js lines 184-192)
// ---------------------------------------------------------------------------
function clean(value) {
  return String(value ?? "").trim();
}

function normalizePhone(value) {
  const raw = clean(value).replace(/[\s()-]/g, "");
  if (/^0[17]\d{8}$/.test(raw)) return `+254${raw.slice(1)}`;
  if (/^254[17]\d{8}$/.test(raw)) return `+${raw}`;
  if (/^\+254[17]\d{8}$/.test(raw)) return raw;
  return null;
}

function maskPhone(phone) {
  if (!phone) return "N/A";
  const str = String(phone).trim();
  if (str.length < 8) return "***";
  return `${str.slice(0, 5)} *** ${str.slice(-3)}`;
}

// ---------------------------------------------------------------------------
// Non-User Sentinels (from db/proposals/tenant_integrity_design.md)
// ---------------------------------------------------------------------------
const DOCUMENTED_SENTINELS = new Set(["system", "mpesa-c2b"]);

function isKnownSentinel(userId) {
  if (!userId || typeof userId !== "string") return false;
  const cleanId = userId.trim();
  if (DOCUMENTED_SENTINELS.has(cleanId)) return true;
  // Legacy loan approval role placeholders like "chairperson-legacy", "secretary-legacy"
  if (/^[a-z]+-legacy$/.test(cleanId)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// CLI Argument Parsing & Safety Guards
// ---------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    source: "json", // "json" | "postgres"
    file: path.resolve(process.env.CHAMA_DATA_FILE || path.join(__dirname, "..", "data.json")),
    connectionString: process.env.DATABASE_URL || "",
    allowStaging: false,
    out: path.resolve(process.cwd(), "baseline-audit-report.json"),
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith("--source=")) {
      options.source = arg.split("=")[1].toLowerCase();
    } else if (arg.startsWith("--file=")) {
      options.file = path.resolve(arg.split("=")[1]);
      options.source = "json";
    } else if (arg.startsWith("--connection-string=")) {
      options.connectionString = arg.split("=")[1];
      options.source = "postgres";
    } else if (arg === "--allow-staging") {
      options.allowStaging = true;
    } else if (arg.startsWith("--out=")) {
      options.out = path.resolve(arg.split("=")[1]);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  if (!["json", "postgres"].includes(options.source)) {
    console.error("Error: --source must be 'json' or 'postgres'.");
    process.exit(1);
  }

  return options;
}

function printHelp() {
  console.log(`
Jirani Chama - Baseline Data Audit Script (Read-Only)

Usage:
  node scripts/audit_data_baseline.js [options]

Options:
  --source=json|postgres        Select data backend (default: json)
  --file=<path>                 Path to data.json (for json source)
  --connection-string=<url>     PostgreSQL connection URL (for postgres source)
  --allow-staging               Permit connecting to non-loopback PostgreSQL host
  --out=<path>                  Path to output JSON report (default: baseline-audit-report.json)
  --help, -h                    Show this help message
`);
}

// ---------------------------------------------------------------------------
// Safe Read-Only PostgreSQL Loader
// ---------------------------------------------------------------------------
async function loadFromPostgres(connectionString, allowStaging) {
  if (!connectionString) {
    throw new Error("PostgreSQL connection string is required. Pass --connection-string or set DATABASE_URL.");
  }

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Invalid PostgreSQL connection string format.");
  }

  const host = url.hostname.toLowerCase();
  const isLoopback = ["localhost", "127.0.0.1", "::1", ""].includes(host);

  if (!isLoopback && !allowStaging) {
    throw new Error(
      `Safety guard: Refusing to connect to non-loopback host '${host}' without explicit --allow-staging flag.`
    );
  }

  const { Pool } = require("pg");
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();

  const dataset = {
    chamas: [],
    users: [],
    memberships: [],
    contributions: [],
    loans: [],
    loan_repayments: [],
    transactions: [],
    attendance: [],
    attendance_registers: [],
    audit_log: [],
    messages: [],
    invitations: [],
    dividends: [],
    penalties: [],
    mpesa_callbacks: [],
  };

  try {
    // Explicit read-only transaction ensures zero writes can occur
    await client.query("BEGIN TRANSACTION READ ONLY");

    const queryTable = async (table, targetArray) => {
      try {
        const res = await client.query(`SELECT * FROM ${table}`);
        targetArray.push(...res.rows);
      } catch (err) {
        // Table may not exist if migrations are partial; record warning
        if (err.code !== "42P01") throw err;
      }
    };

    await queryTable("chamas", dataset.chamas);
    await queryTable("users", dataset.users);
    await queryTable("memberships", dataset.memberships);
    await queryTable("contributions", dataset.contributions);
    await queryTable("loans", dataset.loans);
    await queryTable("loan_repayments", dataset.loan_repayments);
    await queryTable("transactions", dataset.transactions);
    await queryTable("attendance", dataset.attendance);
    await queryTable("attendance_registers", dataset.attendance_registers);
    await queryTable("audit_log", dataset.audit_log);
    await queryTable("messages", dataset.messages);
    await queryTable("invitations", dataset.invitations);
    await queryTable("dividends", dataset.dividends);
    await queryTable("penalties", dataset.penalties);
    await queryTable("mpesa_callbacks", dataset.mpesa_callbacks);

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }

  return dataset;
}

// ---------------------------------------------------------------------------
// Safe Read-Only JSON Loader
// ---------------------------------------------------------------------------
function loadFromJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Data file not found at: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const data = JSON.parse(raw);
  return {
    chamas: Array.isArray(data.chamas) ? data.chamas : [],
    users: Array.isArray(data.users) ? data.users : [],
    memberships: Array.isArray(data.memberships) ? data.memberships : [],
    contributions: Array.isArray(data.contributions) ? data.contributions : [],
    loans: Array.isArray(data.loans) ? data.loans : [],
    loan_repayments: Array.isArray(data.payouts) ? data.payouts : [], // in state JSON, repayments/payouts
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    attendance: Array.isArray(data.attendance) ? data.attendance : [],
    attendance_registers: Array.isArray(data.registers) ? data.registers : [],
    audit_log: Array.isArray(data.auditLog) ? data.auditLog : [],
    messages: Array.isArray(data.messages) ? data.messages : [],
    invitations: Array.isArray(data.invitations) ? data.invitations : [],
    dividends: Array.isArray(data.dividendCycles) ? data.dividendCycles : [],
    penalties: Array.isArray(data.penalties) ? data.penalties : [],
    mpesa_callbacks: Array.isArray(data.pendingMpesas) ? data.pendingMpesas : [],
    leadership_changes: Array.isArray(data.leadershipChanges) ? data.leadershipChanges : [],
  };
}

// ---------------------------------------------------------------------------
// Core Audit Engine (Analyzes Relational and Embedded References)
// ---------------------------------------------------------------------------
function runAudit(dataset, sourceLabel) {
  const startTime = Date.now();

  const chamas = dataset.chamas;
  const users = dataset.users;

  const chamaIds = new Set(chamas.map(c => String(c.id || c.chama_id)));
  const userMap = new Map(); // id -> user

  for (const u of users) {
    const id = String(u.id);
    const chamaId = String(u.chamaId || u.chama_id || "");
    const normalized = normalizePhone(u.phone);
    userMap.set(id, {
      id,
      chamaId,
      name: clean(u.name),
      normalizedPhone: normalized,
      rawPhone: clean(u.phone),
    });
  }

  // 1. Phone Identity & Collision Analysis
  const phoneToUsers = new Map();
  const invalidPhones = [];

  for (const [userId, user] of userMap.entries()) {
    if (!user.normalizedPhone) {
      invalidPhones.push({
        userId,
        chamaId: user.chamaId,
        rawPhone: maskPhone(user.rawPhone),
      });
      continue;
    }
    const phone = user.normalizedPhone;
    if (!phoneToUsers.has(phone)) {
      phoneToUsers.set(phone, []);
    }
    phoneToUsers.get(phone).push({
      userId,
      chamaId: user.chamaId,
      name: user.name,
    });
  }

  const multiChamaPhones = [];
  const singleChamaDuplicatePhones = [];
  let uniqueNormalizedPhones = 0;

  for (const [phone, occurrences] of phoneToUsers.entries()) {
    uniqueNormalizedPhones++;
    const distinctChamas = new Set(occurrences.map(o => o.chamaId));
    if (distinctChamas.size > 1) {
      multiChamaPhones.push({
        maskedPhone: maskPhone(phone),
        distinctChamaCount: distinctChamas.size,
        occurrences: occurrences.map(o => ({
          userId: o.userId,
          chamaId: o.chamaId,
        })),
      });
    } else if (occurrences.length > 1) {
      singleChamaDuplicatePhones.push({
        maskedPhone: maskPhone(phone),
        chamaId: occurrences[0].chamaId,
        count: occurrences.length,
        userIds: occurrences.map(o => o.userId),
      });
    }
  }

  // 2. Comprehensive User Reference Integrity (Separates Orphans from Tenant-Mismatches)
  const orphanedReferences = [];
  const tenantMismatches = [];
  let totalReferencesChecked = 0;

  function checkUserRef(entityName, fieldName, recordId, recordChamaId, refUserId, isJson = false) {
    if (!refUserId || typeof refUserId !== "string" && typeof refUserId !== "number") return;
    const cleanRef = String(refUserId).trim();
    if (!cleanRef || isKnownSentinel(cleanRef)) return;

    totalReferencesChecked++;
    const targetUser = userMap.get(cleanRef);

    if (!targetUser) {
      orphanedReferences.push({
        entity: entityName,
        field: fieldName,
        recordId: String(recordId),
        recordChamaId: String(recordChamaId || ""),
        referencedUserId: cleanRef,
        isEmbeddedJson: isJson,
      });
      return;
    }

    if (recordChamaId && targetUser.chamaId && targetUser.chamaId !== String(recordChamaId)) {
      tenantMismatches.push({
        entity: entityName,
        field: fieldName,
        recordId: String(recordId),
        recordChamaId: String(recordChamaId),
        referencedUserId: cleanRef,
        userActualChamaId: targetUser.chamaId,
        isEmbeddedJson: isJson,
      });
    }
  }

  // Helper to extract nested JSON values
  function safeJson(val) {
    if (!val) return null;
    if (typeof val === "object") return val;
    try { return JSON.parse(val); } catch { return null; }
  }

  // Scan Contributions
  for (const item of dataset.contributions) {
    const id = item.id;
    const cid = item.chama_id || item.chamaId;
    checkUserRef("contributions", "member_id", id, cid, item.member_id || item.memberId);
    checkUserRef("contributions", "recorded_by", id, cid, item.recorded_by || item.recordedBy);
  }

  // Scan Loans & Embedded Approvals / Guarantors
  for (const item of dataset.loans) {
    const id = item.id;
    const cid = item.chama_id || item.chamaId;
    checkUserRef("loans", "borrower_id", id, cid, item.borrower_id || item.memberId);

    // Approvals in JSONB / Array
    const approvals = safeJson(item.approvals) || [];
    if (Array.isArray(approvals)) {
      approvals.forEach((appr, idx) => {
        checkUserRef("loans", `approvals[${idx}].approverId`, id, cid, appr?.approverId || appr?.by, true);
      });
    }

    // Guarantors if present in record_data or JSON
    const recordData = safeJson(item.record_data);
    const guarantors = recordData?.guarantors || item.guarantors;
    if (Array.isArray(guarantors)) {
      guarantors.forEach((g, idx) => {
        checkUserRef("loans", `guarantors[${idx}].memberId`, id, cid, g?.memberId || g?.id, true);
      });
    }
  }

  // Scan Loan Repayments
  for (const item of dataset.loan_repayments) {
    const id = item.id;
    const cid = item.chama_id || item.chamaId;
    checkUserRef("loan_repayments", "member_id", id, cid, item.member_id || item.memberId);
    const recData = safeJson(item.record_data);
    if (recData?.recordedBy) {
      checkUserRef("loan_repayments", "record_data.recordedBy", id, cid, recData.recordedBy, true);
    }
  }

  // Scan Transactions
  for (const item of dataset.transactions) {
    const id = item.id;
    const cid = item.chama_id || item.chamaId;
    checkUserRef("transactions", "member_id", id, cid, item.member_id || item.memberId);
    checkUserRef("transactions", "recorded_by", id, cid, item.recorded_by || item.recordedBy);
  }

  // Scan Attendance & Registers
  for (const item of dataset.attendance) {
    const id = item.id;
    const cid = item.chama_id || item.chamaId;
    checkUserRef("attendance", "member_id", id, cid, item.member_id || item.userId);
    checkUserRef("attendance", "recorded_by", id, cid, item.recorded_by);
  }

  for (const item of dataset.attendance_registers) {
    const id = item.id;
    const cid = item.chama_id || item.chamaId;
    const recData = safeJson(item.record_data) || item;
    checkUserRef("attendance_registers", "createdBy.id", id, cid, recData?.createdBy?.id, true);
    checkUserRef("attendance_registers", "editedBy.id", id, cid, recData?.editedBy?.id, true);

    if (Array.isArray(recData?.history)) {
      recData.history.forEach((h, hIdx) => {
        checkUserRef("attendance_registers", `history[${hIdx}].by`, id, cid, h?.by?.id || h?.by, true);
        if (Array.isArray(h?.changes)) {
          h.changes.forEach((c, cIdx) => {
            checkUserRef("attendance_registers", `history[${hIdx}].changes[${cIdx}].userId`, id, cid, c?.userId, true);
          });
        }
      });
    }
  }

  // Scan Audit Log (Events & Leadership)
  for (const item of dataset.audit_log) {
    const id = item.id;
    const cid = item.chama_id || item.chamaId;
    checkUserRef("audit_log", "recorded_by", id, cid, item.recorded_by);

    const recData = safeJson(item.record_data) || item;
    checkUserRef("audit_log", "by.id", id, cid, recData?.by?.id || recData?.by, true);
    checkUserRef("audit_log", "memberId", id, cid, recData?.memberId, true);
    checkUserRef("audit_log", "incomingUserId", id, cid, recData?.incomingUserId, true);
    checkUserRef("audit_log", "outgoingUserId", id, cid, recData?.outgoingUserId, true);
    checkUserRef("audit_log", "proposedBy", id, cid, recData?.proposedBy, true);
    checkUserRef("audit_log", "confirmedBy", id, cid, recData?.confirmedBy, true);

    if (Array.isArray(recData?.candidateIds)) {
      recData.candidateIds.forEach((cId, idx) => checkUserRef("audit_log", `candidateIds[${idx}]`, id, cid, cId, true));
    }
    if (Array.isArray(recData?.eligibleVoterIds)) {
      recData.eligibleVoterIds.forEach((vId, idx) => checkUserRef("audit_log", `eligibleVoterIds[${idx}]`, id, cid, vId, true));
    }
  }

  // Scan Invitations
  for (const item of dataset.invitations) {
    const id = item.id;
    const cid = item.chama_id || item.chamaId;
    checkUserRef("invitations", "invited_by", id, cid, item.invited_by || item.invitedBy);
    checkUserRef("invitations", "accepted_by", id, cid, item.accepted_by || item.usedBy);
  }

  // Scan Dividends & Payouts
  for (const item of dataset.dividends) {
    const id = item.id;
    const cid = item.chama_id || item.chamaId;
    checkUserRef("dividends", "member_id", id, cid, item.member_id || item.memberId);
    const recData = safeJson(item.record_data) || item;
    if (Array.isArray(recData?.payouts)) {
      recData.payouts.forEach((p, idx) => {
        checkUserRef("dividends", `payouts[${idx}].memberId`, id, cid, p?.memberId || p?.userId, true);
      });
    }
  }

  // Scan Penalties
  for (const item of dataset.penalties) {
    const id = item.id;
    const cid = item.chama_id || item.chamaId;
    checkUserRef("penalties", "member_id", id, cid, item.member_id || item.memberId);
  }

  // Scan Messages & Notifications
  for (const item of dataset.messages) {
    const id = item.id;
    const cid = item.chama_id || item.chamaId;
    checkUserRef("messages", "author_id", id, cid, item.author_id || item.authorId);
    const recData = safeJson(item.record_data) || item;
    checkUserRef("messages", "recipientId", id, cid, recData?.recipientId || item.recipientId, true);
  }

  // Scan Leadership Changes (if separate table)
  if (Array.isArray(dataset.leadership_changes)) {
    for (const item of dataset.leadership_changes) {
      const id = item.id;
      const cid = item.chama_id || item.chamaId;
      checkUserRef("leadership_changes", "outgoing_user_id", id, cid, item.outgoing_user_id || item.outgoingUserId);
      checkUserRef("leadership_changes", "incoming_user_id", id, cid, item.incoming_user_id || item.incomingUserId);
      checkUserRef("leadership_changes", "proposedBy", id, cid, item.proposedBy);
      checkUserRef("leadership_changes", "confirmedBy", id, cid, item.confirmedBy);
    }
  }

  const durationMs = Date.now() - startTime;

  return {
    source: sourceLabel,
    durationMs,
    timestamp: new Date().toISOString(),
    metrics: {
      totalChamas: chamas.length,
      totalUserRecords: users.length,
      uniqueNormalizedPhones,
      multiChamaPhoneCount: multiChamaPhones.length,
      singleChamaDuplicateCount: singleChamaDuplicatePhones.length,
      invalidPhoneCount: invalidPhones.length,
      totalReferencesChecked,
      orphanedReferenceCount: orphanedReferences.length,
      tenantMismatchCount: tenantMismatches.length,
    },
    findings: {
      multiChamaPhones,
      singleChamaDuplicatePhones,
      invalidPhones,
      orphanedReferences,
      tenantMismatches,
    },
  };
}

// ---------------------------------------------------------------------------
// Formatted Console Reporting
// ---------------------------------------------------------------------------
function printReportSummary(report) {
  const m = report.metrics;
  console.log("\n=======================================================");
  console.log("       JIRANI CHAMA — BASELINE DATA AUDIT REPORT       ");
  console.log("=======================================================");
  console.log(`Source:                 ${report.source}`);
  console.log(`Execution Time:         ${report.durationMs}ms`);
  console.log(`Timestamp:              ${report.timestamp}`);
  console.log("-------------------------------------------------------");
  console.log("ENTITY COUNTS & IDENTITY DISTRIBUTION");
  console.log(`  Total Chamas:                     ${m.totalChamas}`);
  console.log(`  Total User Records:               ${m.totalUserRecords}`);
  console.log(`  Unique Normalized Phones (E.164): ${m.uniqueNormalizedPhones}`);
  console.log(`  Phones in Multiple Chamas:        ${m.multiChamaPhoneCount}`);
  console.log(`  Duplicate Phones in Same Chama:   ${m.singleChamaDuplicateCount}`);
  console.log(`  Invalid / Ambiguous Phones:       ${m.invalidPhoneCount}`);
  console.log("-------------------------------------------------------");
  console.log("USER REFERENTIAL INTEGRITY & TENANT CONSISTENCY");
  console.log(`  Total User References Checked:    ${m.totalReferencesChecked}`);
  console.log(`  Orphaned User References:         ${m.orphanedReferenceCount}`);
  console.log(`  Tenant-Mismatched References:     ${m.tenantMismatchCount}`);
  console.log("=======================================================");

  if (m.multiChamaPhoneCount > 0) {
    console.log("\n[!] MULTI-CHAMA PHONE OCCURRENCES (Safe Summary):");
    report.findings.multiChamaPhones.slice(0, 10).forEach(p => {
      console.log(`  - Phone ${p.maskedPhone}: across ${p.distinctChamaCount} chamas (${p.occurrences.length} total user rows)`);
    });
    if (m.multiChamaPhoneCount > 10) console.log(`    ... and ${m.multiChamaPhoneCount - 10} more.`);
  }

  if (m.invalidPhoneCount > 0) {
    console.log("\n[!] INVALID PHONE NUMBERS DETECTED:");
    report.findings.invalidPhones.slice(0, 10).forEach(p => {
      console.log(`  - User ${p.userId} in Chama ${p.chamaId}: "${p.rawPhone}"`);
    });
  }

  if (m.tenantMismatchCount > 0) {
    console.log("\n[!] TENANT-MISMATCHED REFERENCES (Child belongs to Chama A, User belongs to Chama B):");
    report.findings.tenantMismatches.slice(0, 10).forEach(t => {
      console.log(`  - ${t.entity}.${t.field} (Row ${t.recordId}) in Chama ${t.recordChamaId} references User ${t.referencedUserId} from Chama ${t.userActualChamaId}`);
    });
    if (m.tenantMismatchCount > 10) console.log(`    ... and ${m.tenantMismatchCount - 10} more.`);
  }

  if (m.orphanedReferenceCount > 0) {
    console.log("\n[!] ORPHANED REFERENCES (Referenced User ID does not exist in users):");
    report.findings.orphanedReferences.slice(0, 10).forEach(o => {
      console.log(`  - ${o.entity}.${o.field} (Row ${o.recordId}) in Chama ${o.recordChamaId} references Nonexistent User ${o.referencedUserId}`);
    });
    if (m.orphanedReferenceCount > 10) console.log(`    ... and ${m.orphanedReferenceCount - 10} more.`);
  }

  console.log("\nAudit finished. Zero writes performed.\n");
}

// ---------------------------------------------------------------------------
// Main Entrypoint
// ---------------------------------------------------------------------------
async function main() {
  const options = parseArgs();
  let dataset;
  let label;

  if (options.source === "postgres") {
    label = `PostgreSQL (${new URL(options.connectionString).host})`;
    console.log(`Connecting to PostgreSQL (READ ONLY mode) at ${label}...`);
    dataset = await loadFromPostgres(options.connectionString, options.allowStaging);
  } else {
    label = `JSON File (${options.file})`;
    console.log(`Reading JSON state from ${label}...`);
    dataset = loadFromJson(options.file);
  }

  const report = runAudit(dataset, label);
  printReportSummary(report);

  if (options.out) {
    fs.writeFileSync(options.out, JSON.stringify(report, null, 2), "utf8");
    console.log(`Full structured audit report written to: ${options.out}`);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(`Audit failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { runAudit, normalizePhone, maskPhone, isKnownSentinel };
