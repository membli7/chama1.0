"use strict";

const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { after, test } = require("node:test");

const servers = [];
const validMessage = {
  name: "Eli Example",
  email: "Eli@example.test",
  subject: "Question about a chama",
  message: "Could you tell me more about the group tools?"
};

async function closedLocalPort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

async function startTestServer({ emailEnabled = true, logFile = "", smtpFailurePort = 0 } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-contact-test-"));
  const dataFile = path.join(directory, "data.json");
  const port = 42000 + (process.pid % 10000) + servers.length;
  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATA_BACKEND: "json",
    APP_BIND_HOST: "127.0.0.1",
    PORT: String(port),
    SESSION_SECRET: "test-contact-form-secret",
    CHAMA_DATA_FILE: dataFile,
    SMTP_TRANSPORT: emailEnabled ? "json" : "",
    SMTP_HOST: smtpFailurePort ? "127.0.0.1" : "",
    SMTP_PORT: smtpFailurePort ? String(smtpFailurePort) : "",
    SMTP_SECURE: "false",
    SMTP_USER: smtpFailurePort ? "contact-test-user" : "",
    SMTP_PASS: smtpFailurePort ? "contact-test-password" : "",
    SMTP_FROM: smtpFailurePort ? "contact-test-user@example.test" : "",
    SMTP_LOG_FILE: logFile
  };
  const child = execFile(process.execPath, ["server.js"], { cwd: path.join(__dirname, ".."), env });
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
    output: () => output,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill();
        await new Promise(resolve => child.once("exit", resolve));
      }
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
  servers.push(server);
  return server;
}

async function postContact(server, body = validMessage) {
  return fetch(`${server.baseUrl}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "chama" },
    body: JSON.stringify(body)
  });
}

after(async () => {
  for (const server of servers) await server.stop();
});

test("contact form emails the fixed inbox and sets the sender as Reply-To after SMTP accepts it", async () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-contact-mail-"));
  const logFile = path.join(logDir, "sent-mail.jsonl");
  const server = await startTestServer({ emailEnabled: true, logFile });
  const response = await postContact(server);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).message, "Your message has been sent.");
  assert.ok(fs.existsSync(logFile), "mail should be logged by the isolated JSON test transport");
  const payload = JSON.parse(fs.readFileSync(logFile, "utf8").trim().split("\n")[0]);
  assert.equal(payload.to[0].address, "09elim3@gmail.com");
  assert.equal(payload.replyTo[0].address, "eli@example.test");
  assert.equal(payload.subject, "Website contact: Question about a chama");
  assert.match(payload.text, /Name: Eli Example/);
  assert.match(payload.text, /Email: eli@example\.test/);
  assert.match(payload.text, /Could you tell me more about the group tools\?/);
  fs.rmSync(logDir, { recursive: true, force: true });
});

test("contact email redacts secrets and payment details before delivery", async () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-contact-redaction-"));
  const logFile = path.join(logDir, "sent-mail.jsonl");
  const server = await startTestServer({ emailEnabled: true, logFile });
  const response = await postContact(server, {
    ...validMessage,
    subject: "Unanswered question from Jirani Chama AI Assistant",
    message: "My PIN is 123456; OTP 654321; account number: 1234567890; card 4111 1111 1111 1111; CVC: 123; password: secret"
  });

  assert.equal(response.status, 200);
  const payload = JSON.parse(fs.readFileSync(logFile, "utf8").trim().split("\n")[0]);
  assert.match(payload.text, /\[redacted\]/);
  assert.doesNotMatch(payload.text, /123456|654321|1234567890|4111 1111 1111 1111|secret/);
  fs.rmSync(logDir, { recursive: true, force: true });
});

test("contact form reports unavailable rather than success when email is not configured", async () => {
  const server = await startTestServer({ emailEnabled: false });
  const response = await postContact(server);
  assert.equal(response.status, 503);
  assert.match((await response.json()).message, /temporarily unavailable/i);
});

test("contact form reports SMTP connection failure without claiming success or logging secrets", async () => {
  const smtpFailurePort = await closedLocalPort();
  const server = await startTestServer({ emailEnabled: false, smtpFailurePort });
  const response = await postContact(server);
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.match(body.message, /temporarily unavailable/i);
  assert.doesNotMatch(JSON.stringify(body), /contact-test-user|contact-test-password|ECONNECTION/);
  for (let attempt = 0; attempt < 30 && !server.output().includes("Contact email delivery failed."); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.match(server.output(), /Contact email delivery failed\./);
  assert.match(server.output(), /code:\s*['"]?[A-Z][A-Z0-9_]*['"]?/);
  assert.doesNotMatch(server.output(), /contact-test-user|contact-test-password/);
});

test("contact form rejects header injection and malformed inputs before sending email", async () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-contact-invalid-"));
  const logFile = path.join(logDir, "sent-mail.jsonl");
  const server = await startTestServer({ emailEnabled: true, logFile });
  const response = await postContact(server, { ...validMessage, subject: "Question\r\nBcc: attacker@example.test" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /required fields/i);
  assert.equal(fs.existsSync(logFile), false, "invalid contact data must not be sent");
  fs.rmSync(logDir, { recursive: true, force: true });
});

test("contact form rate-limits repeated submissions", async () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-contact-limit-"));
  const logFile = path.join(logDir, "sent-mail.jsonl");
  const server = await startTestServer({ emailEnabled: true, logFile });
  for (let attempt = 0; attempt < 5; attempt += 1) assert.equal((await postContact(server)).status, 200);
  assert.equal((await postContact(server)).status, 429);
  assert.equal(fs.readFileSync(logFile, "utf8").trim().split("\n").length, 5);
  fs.rmSync(logDir, { recursive: true, force: true });
});
