"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..", "..");
const appDir = path.join(root, "chamafork");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const previewDataDir = path.join(root, ".work", "visible-mobile-data");
const profileDir = path.join(root, ".work", "chrome-visible-mobile-profile");
const sessionFile = path.join(root, ".work", "visible-mobile-session.json");

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}
async function waitForHttp(url, child, logFile) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error(`Preview server exited with ${child.exitCode}; log: ${logFile}`);
    try { const response = await fetch(url, { signal: AbortSignal.timeout(500) }); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 75));
  }
  throw new Error(`Preview server did not become healthy; log: ${logFile}`);
}

(async () => {
  fs.mkdirSync(previewDataDir, { recursive: true });
  fs.mkdirSync(profileDir, { recursive: true });
  const dataFile = path.join(previewDataDir, "data.json");
  const salt = "visible-mobile-test-salt";
  const user = { id: "mobile-chair", name: "Mobile Test Chair", phone: "+254711000001", email: "chair@example.test", role: "chairperson", status: "active", pinHash: `${salt}:${crypto.scryptSync("123456", salt, 64).toString("hex")}`, mustChangePin: false, chamaId: "mobile-chama" };
  const chama = { id: "mobile-chama", name: "Mobile Test Chama", createdAt: new Date().toISOString() };
  const state = { version: 2, chamas: [chama], users: [user], transactions: [], loans: [], payouts: [], invitations: [], leadershipChanges: [], pendingMpesas: [], idempotency: {}, registers: [], auditLog: [], welfareReserve: 0, penalties: [], dividendCycles: [], messages: [], settings: { defaultDeadlineDay: 5, welfareMonthlyFee: 500, lateContributionPenalty: 200, loanMonthlyRatePercent: 5, meetingDates: {} } };
  fs.writeFileSync(dataFile, JSON.stringify(state), "utf8");

  const port = await freePort();
  const childEnv = { ...process.env };
  for (const key of Object.keys(childEnv)) if (key.startsWith("MPESA_") || /^(SMTP_|MAIL_|EMAIL_|SMS_)/.test(key)) childEnv[key] = "";
  Object.assign(childEnv, {
    NODE_ENV: "test", DATA_BACKEND: "json", CHAMA_DATA_FILE: dataFile, PORT: String(port), APP_BIND_HOST: "127.0.0.1",
    SESSION_SECRET: "visible-mobile-test-secret-not-real-0123456789", REDIS_URL: "", SESSION_STORE: "memory",
    DATABASE_URL: "", SMTP_HOST: "", SMTP_USERNAME: "", SMTP_PASSWORD: "", SMS_API_KEY: "",
    APP_CANONICAL_ORIGIN: "", APP_ALLOWED_ORIGINS: "", TRUST_PROXY: ""
  });
  const logFile = path.join(root, ".work", "visible-mobile-server.log");
  fs.writeFileSync(logFile, "", "utf8");
  const server = spawn(process.execPath, ["server.js"], { cwd: appDir, env: childEnv, stdio: ["ignore", fs.openSync(logFile, "a"), fs.openSync(logFile, "a")], windowsHide: true });
  await waitForHttp(`http://127.0.0.1:${port}/api/health`, server, logFile);

  const chrome = spawn(chromePath, [
    "--no-first-run", "--no-default-browser-check", "--disable-sync", "--disable-default-apps", "--disable-extensions",
    "--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1, EXCLUDE ::1", "--auto-open-devtools-for-tabs", `--user-data-dir=${profileDir}`, "--window-size=1400,950",
    `http://127.0.0.1:${port}/`
  ], { stdio: "ignore", windowsHide: false });
  const session = { url: `http://127.0.0.1:${port}/`, port, launcherPid: process.pid, serverPid: server.pid, chromePid: chrome.pid, dataFile, logFile, profileDir, credentials: { phone: user.phone, pin: "123456" }, payment: "disabled; no provider calls" };
  fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2), "utf8");
  console.log(JSON.stringify({ sessionFile, url: session.url, launcherPid: process.pid, serverPid: server.pid, chromePid: chrome.pid, dataFile, logFile }, null, 2));
  const shutdown = () => { if (server.exitCode === null) server.kill(); if (chrome.exitCode === null) chrome.kill(); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
