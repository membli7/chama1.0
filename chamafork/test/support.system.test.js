"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jirani-support-test-"));
const dataFile = path.join(tempDir, "data.json");
let port;
let serverProcess;
let baseUrl;

let memberCookie;
let otherMemberCookie;
let chairCookie;
let otherChamaCookie;
let agentCookie;
let adminCookie;

function pinHash(pin) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pin, salt, 64).toString("hex")}`;
}

const chama1 = { id: "chama-1", name: "Alpha Chama", settings: { defaultDeadlineDay: 10, welfareMonthlyFee: 650, lateContributionPenalty: 250, loanMonthlyRatePercent: 7 }, subscription: require("./active-subscription-fixture").activeSubscription() };
const chama2 = { id: "chama-2", name: "Beta Chama", settings: { defaultDeadlineDay: 20, welfareMonthlyFee: 900, lateContributionPenalty: 350, loanMonthlyRatePercent: 9 }, subscription: require("./active-subscription-fixture").activeSubscription() };

const memberUser = { id: "user-member-1", name: "Alice Member", phone: "+254711100001", role: "member", status: "active", chamaId: "chama-1", pinHash: pinHash("123456"), mustChangePin: false, createdAt: "2026-09-01T08:00:00.000Z" };
const otherMemberUser = { id: "user-member-2", name: "Bob Member", phone: "+254711100002", role: "member", status: "active", chamaId: "chama-1", pinHash: pinHash("234567"), mustChangePin: false, createdAt: "2026-09-01T08:00:00.000Z" };
const chairUser = { id: "user-chair-1", name: "Charles Chair", phone: "+254711100003", role: "chairperson", status: "active", chamaId: "chama-1", pinHash: pinHash("345678"), mustChangePin: false, createdAt: "2026-09-01T08:00:00.000Z" };
const otherChamaUser = { id: "user-chair-2", name: "Diana Beta", phone: "+254711100004", role: "chairperson", status: "active", chamaId: "chama-2", pinHash: pinHash("456789"), mustChangePin: false, createdAt: "2026-09-01T08:00:00.000Z" };

const agentUser = { id: "agent-1", name: "Sam Support", phone: "+254711100005", role: "support_agent", status: "active", chamaId: "chama-1", pinHash: pinHash("567890"), mustChangePin: false, createdAt: "2026-09-01T08:00:00.000Z" };
const adminUser = { id: "admin-1", name: "Admin Alex", phone: "+254711100006", role: "platform_admin", status: "active", chamaId: "chama-1", pinHash: pinHash("678901"), mustChangePin: false, createdAt: "2026-09-01T08:00:00.000Z" };

const agentProfile = {
  id: "agent-1",
  name: "Sam Support",
  phone: "+254711100005",
  email: "sam@jiranichama.com",
  status: "active",
  permissions: {
    canAssign: true,
    canReassign: true,
    canChangePriority: true,
    canChangeStatus: true,
    canAddInternalNotes: true,
    canEscalate: true,
    canClose: true,
    canManageFaq: true,
    canViewCrossTenant: false,
  },
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
};

fs.writeFileSync(dataFile, JSON.stringify({
  version: 2,
  chamas: [chama1, chama2],
  users: [memberUser, otherMemberUser, chairUser, otherChamaUser, agentUser, adminUser],
  supportAgents: [agentProfile],
  supportTickets: [],
  faqs: [],
  faqFeedback: [],
  transactions: [],
  loans: [],
  payouts: [],
  invitations: [],
  leadershipChanges: [],
  pendingMpesas: [],
  idempotency: {},
  registers: [],
  auditLog: [],
}));

async function login(user, pin) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "chama" },
    body: JSON.stringify({ phone: user.phone, pin }),
  });
  assert.equal(response.status, 200, `Login failed for ${user.phone}`);
  return response.headers.getSetCookie()[0].split(";")[0];
}

function req(endpoint, { method = "GET", cookie, body } = {}) {
  const headers = {
    "X-Requested-With": "chama",
    Accept: "application/json",
  };
  if (cookie) headers.Cookie = cookie;
  if (body) headers["Content-Type"] = "application/json";

  return fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

before(async () => {
  port = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const availablePort = probe.address().port;
      probe.close(error => error ? reject(error) : resolve(availablePort));
    });
  });

  serverProcess = execFile(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATA_BACKEND: "json",
      PORT: String(port),
      SESSION_SECRET: "support-test-session-secret",
      CHAMA_DATA_FILE: dataFile,
    },
  });

  serverProcess.stderr.on("data", chunk => process.stderr.write(chunk));
  baseUrl = `http://127.0.0.1:${port}`;

  // Wait for server to start
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const check = await fetch(`${baseUrl}/api/health/live`);
      if (check.ok) break;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }

  // Log in users
  memberCookie = await login(memberUser, "123456");
  otherMemberCookie = await login(otherMemberUser, "234567");
  chairCookie = await login(chairUser, "345678");
  otherChamaCookie = await login(otherChamaUser, "456789");
  agentCookie = await login(agentUser, "567890");
  adminCookie = await login(adminUser, "678901");
});

after(() => {
  serverProcess?.kill();
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

test("Support ticket lifecycle and security", async (t) => {
  let createdTicketId;

  await t.test("1. Member can submit a support ticket", async () => {
    const res = await req("/api/support/tickets", {
      method: "POST",
      cookie: memberCookie,
      body: {
        category: "Contributions & Fines",
        subject: "Discrepancy in my monthly contribution record",
        description: "I gave 2000 KES to the Treasurer last week but only 1500 is shown in the ledger. Please help check.",
        attachments: [
          {
            originalName: "receipt_photo.png",
            mimeType: "image/png",
            data: Buffer.from("fake-png-content").toString("base64"),
          },
        ],
      },
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.ticket.status, "Open");
    assert.equal(body.ticket.category, "Contributions & Fines");
    assert.match(body.ticket.ticketNumber, /^TICK-\d+$/);
    assert.equal(body.ticket.messages.length, 1);
    assert.equal(body.ticket.messages[0].attachments.length, 1);
    createdTicketId = body.ticket.id;
  });

  await t.test("2. Member sees only their own tickets", async () => {
    // Alice sees her ticket
    const resAlice = await req("/api/support/tickets", { cookie: memberCookie });
    assert.equal(resAlice.status, 200);
    const aliceData = await resAlice.json();
    assert.equal(aliceData.data.some(tk => tk.id === createdTicketId), true);

    // Bob does NOT see Alice's ticket
    const resBob = await req("/api/support/tickets", { cookie: otherMemberCookie });
    assert.equal(resBob.status, 200);
    const bobData = await resBob.json();
    assert.equal(bobData.data.some(tk => tk.id === createdTicketId), false);
  });

  await t.test("3. IDOR Protection: other member cannot view or post to Alice's ticket", async () => {
    // Bob attempts to fetch Alice's ticket directly by ID
    const getRes = await req(`/api/support/tickets/${createdTicketId}`, { cookie: otherMemberCookie });
    assert.equal(getRes.status, 403);

    // Bob attempts to post a message to Alice's ticket
    const postRes = await req(`/api/support/tickets/${createdTicketId}/messages`, {
      method: "POST",
      cookie: otherMemberCookie,
      body: { message: "Unauthorized message attempt" },
    });
    assert.equal(postRes.status, 403);
  });

  await t.test("4. Tenant Isolation: User from Beta Chama cannot access Alpha Chama ticket", async () => {
    const res = await req(`/api/support/tickets/${createdTicketId}`, { cookie: otherChamaCookie });
    assert.equal(res.status, 403);
  });

  await t.test("5. Support Agent can view ticket and assign it to themselves", async () => {
    const assignRes = await req(`/api/support/tickets/${createdTicketId}/assign`, {
      method: "POST",
      cookie: agentCookie,
      body: {},
    });
    assert.equal(assignRes.status, 200);
    const body = await assignRes.json();
    assert.equal(body.data.assignedAgentId, agentUser.id);
    assert.equal(body.data.status, "In Progress");
  });

  await t.test("6. Support Agent can reply and ask member for information", async () => {
    const replyRes = await req(`/api/support/tickets/${createdTicketId}/messages`, {
      method: "POST",
      cookie: agentCookie,
      body: {
        message: "Hello Alice, I have contacted your Treasurer to verify the cash deposit book. Could you confirm the date of payment?",
      },
    });
    assert.equal(replyRes.status, 201);
    const body = await replyRes.json();
    assert.equal(body.data.messages.length, 2);
  });

  await t.test("7. Support Agent adds a private internal note (must NOT be visible to member)", async () => {
    const noteRes = await req(`/api/support/tickets/${createdTicketId}/messages`, {
      method: "POST",
      cookie: agentCookie,
      body: {
        message: "Internal Note: Checked transaction batch #44. There is an unallocated 500 KES cash entry recorded on Nov 5.",
        isInternalNote: true,
      },
    });
    assert.equal(noteRes.status, 201);

    // Agent viewing ticket sees the internal note
    const agentView = await (await req(`/api/support/tickets/${createdTicketId}`, { cookie: agentCookie })).json();
    const agentHasNote = agentView.data.messages.some(m => m.isInternalNote === true);
    assert.equal(agentHasNote, true, "Agent must see internal notes");

    // Member viewing ticket MUST NOT see the internal note
    const memberView = await (await req(`/api/support/tickets/${createdTicketId}`, { cookie: memberCookie })).json();
    const memberHasNote = memberView.data.messages.some(m => m.isInternalNote === true);
    assert.equal(memberHasNote, false, "Member must never see internal notes");
  });

  await t.test("8. Support Agent updates status and priority", async () => {
    // Set status to Waiting for User
    const statusRes = await req(`/api/support/tickets/${createdTicketId}/status`, {
      method: "PATCH",
      cookie: agentCookie,
      body: { status: "Waiting for User" },
    });
    assert.equal(statusRes.status, 200);
    assert.equal((await statusRes.json()).data.status, "Waiting for User");

    // Set priority to Urgent
    const prioRes = await req(`/api/support/tickets/${createdTicketId}/priority`, {
      method: "PATCH",
      cookie: agentCookie,
      body: { priority: "Urgent" },
    });
    assert.equal(prioRes.status, 200);
    assert.equal((await prioRes.json()).data.priority, "Urgent");
  });

  await t.test("9. Support Agent escalates ticket to administrator with reason", async () => {
    const escRes = await req(`/api/support/tickets/${createdTicketId}/escalate`, {
      method: "POST",
      cookie: agentCookie,
      body: { reason: "Requires chairperson transaction ledger correction permission" },
    });
    assert.equal(escRes.status, 200);
    const body = await escRes.json();
    assert.equal(body.data.escalated, true);
    assert.equal(body.data.escalationReason, "Requires chairperson transaction ledger correction permission");
  });

  await t.test("10. Support Agent workload metrics endpoint", async () => {
    const wlRes = await req("/api/support/agent/workload", { cookie: agentCookie });
    assert.equal(wlRes.status, 200);
    const body = await wlRes.json();
    assert.equal(body.data.totalAssigned >= 1, true);
    assert.equal(body.data.escalatedCount >= 1, true);
  });

  await t.test("11. Support Agent marks ticket Resolved, and Member reopens it", async () => {
    // Agent marks Resolved
    const resolveRes = await req(`/api/support/tickets/${createdTicketId}/status`, {
      method: "PATCH",
      cookie: agentCookie,
      body: { status: "Resolved" },
    });
    assert.equal(resolveRes.status, 200);
    assert.equal((await resolveRes.json()).data.status, "Resolved");

    // Member reopens ticket
    const reopenRes = await req(`/api/support/tickets/${createdTicketId}/reopen`, {
      method: "POST",
      cookie: memberCookie,
      body: { reason: "The ledger was not updated with the remaining 500 KES yet." },
    });
    assert.equal(reopenRes.status, 200);
    const body = await reopenRes.json();
    assert.equal(body.data.status, "Open");
  });

  await t.test("12. Attachment download security and authorization", async () => {
    const ticketView = await (await req(`/api/support/tickets/${createdTicketId}`, { cookie: memberCookie })).json();
    const attId = ticketView.data.messages[0].attachments[0].id;
    assert.ok(attId);

    // Authorized member can download
    const okDownload = await req(`/api/support/tickets/${createdTicketId}/attachments/${attId}`, { cookie: memberCookie });
    assert.equal(okDownload.status, 200);
    const content = await okDownload.text();
    assert.equal(content, "fake-png-content");

    // Unauthorized user receives 403
    const badDownload = await req(`/api/support/tickets/${createdTicketId}/attachments/${attId}`, { cookie: otherMemberCookie });
    assert.equal(badDownload.status, 403);
  });
});

test("Platform administrator support controls", async (t) => {
  let newAgentId;

  await t.test("1. Platform Admin can create a new Support Agent account", async () => {
    const res = await req("/api/support/admin/agents", {
      method: "POST",
      cookie: adminCookie,
      body: {
        name: "Carol Staff",
        phone: "+254711999888",
        email: "carol@jiranichama.com",
        pin: "987654",
        permissions: {
          canAssign: true,
          canReassign: false,
          canChangeStatus: true,
          canChangePriority: true,
          canAddInternalNotes: true,
          canEscalate: true,
          canClose: true,
          canManageFaq: true,
        },
      },
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data.name, "Carol Staff");
    newAgentId = body.data.id;
  });

  await t.test("2. Newly created agent can sign in", async () => {
    const newAgentCookie = await login({ phone: "+254711999888" }, "987654");
    assert.ok(newAgentCookie);
  });

  await t.test("3. Platform Admin can suspend an agent", async () => {
    const suspendRes = await req(`/api/support/admin/agents/${newAgentId}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: { status: "suspended" },
    });
    assert.equal(suspendRes.status, 200);
    assert.equal((await suspendRes.json()).data.status, "suspended");
  });

  await t.test("4. Platform Admin can view platform support statistics", async () => {
    const statsRes = await req("/api/support/admin/stats", { cookie: adminCookie });
    assert.equal(statsRes.status, 200);
    const body = await statsRes.json();
    assert.equal(body.data.totalTickets >= 1, true);
    assert.ok(body.data.byStatus);
    assert.ok(body.data.byCategory);
    assert.ok(body.data.agentWorkloads);
  });
});

test("Frequently Asked Questions (FAQ) System", async (t) => {
  let createdFaqId;

  await t.test("1. All users can view and search FAQs", async () => {
    const res = await req("/api/faqs", { cookie: memberCookie });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.length >= 5, true);
    assert.ok(body.data[0].question);
    assert.ok(body.data[0].answer);
  });

  await t.test("2. Keyword-based search returns matching FAQs and filters irrelevant ones", async () => {
    // Search for "PIN"
    const pinRes = await req("/api/faqs?search=PIN", { cookie: memberCookie });
    assert.equal(pinRes.status, 200);
    const pinData = await pinRes.json();
    assert.equal(pinData.data.some(f => f.question.includes("PIN") || f.answer.includes("PIN")), true);

    // Search for non-existent keyword returns empty array (no AI hallucinations!)
    const noneRes = await req("/api/faqs?search=cryptocurrencyblockchaintoken", { cookie: memberCookie });
    assert.equal(noneRes.status, 200);
    const noneData = await noneRes.json();
    assert.equal(noneData.data.length, 0);
  });

  await t.test("3. Users can vote helpful / not helpful on an FAQ", async () => {
    const listRes = await req("/api/faqs", { cookie: memberCookie });
    const firstFaq = (await listRes.json()).data[0];

    const voteRes = await req(`/api/faqs/${firstFaq.id}/feedback`, {
      method: "POST",
      cookie: memberCookie,
      body: { vote: "helpful" },
    });
    assert.equal(voteRes.status, 200);
    const body = await voteRes.json();
    assert.equal(body.helpfulCount, firstFaq.helpfulCount + 1);
  });

  await t.test("4. Support Agent can create, edit, and delete an FAQ", async () => {
    // Create
    const createRes = await req("/api/faqs", {
      method: "POST",
      cookie: agentCookie,
      body: {
        category: "Contributions & Fines",
        question: "How do I check my fine balance for missed meetings?",
        answer: "1. Go to your dashboard.\n2. Open the Ledger tab.\n3. Check the Outstanding Penalties section.\n4. Penalties are settled on your next recorded contribution.",
        published: true,
      },
    });
    assert.equal(createRes.status, 201);
    createdFaqId = (await createRes.json()).data.id;

    // Edit
    const editRes = await req(`/api/faqs/${createdFaqId}`, {
      method: "PUT",
      cookie: agentCookie,
      body: {
        question: "How do I check my penalty balance for missed meetings?",
      },
    });
    assert.equal(editRes.status, 200);
    assert.equal((await editRes.json()).data.question, "How do I check my penalty balance for missed meetings?");

    // Unpublish
    const unpublishRes = await req(`/api/faqs/${createdFaqId}`, {
      method: "PUT",
      cookie: agentCookie,
      body: { published: false },
    });
    assert.equal(unpublishRes.status, 200);

    // Regular member should NOT see unpublished FAQ
    const memberFaqs = (await (await req("/api/faqs", { cookie: memberCookie })).json()).data;
    assert.equal(memberFaqs.some(f => f.id === createdFaqId), false);

    // Delete
    const deleteRes = await req(`/api/faqs/${createdFaqId}`, {
      method: "DELETE",
      cookie: agentCookie,
    });
    assert.equal(deleteRes.status, 200);
  });

  await t.test("5. FAQ Admin metrics endpoint identifies negative feedback and top ticket categories", async () => {
    const res = await req("/api/faqs/admin/metrics", { cookie: agentCookie });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data.frequentlySubmittedCategories));
    assert.ok(Array.isArray(body.data.negativeFeedbackFaqs));
  });
});

test("In-App AI Support Bubble (100% In-House, No External API)", async (t) => {
  await t.test("1. Returns curated starter suggestions", async () => {
    const res = await req("/api/support/ai/suggestions");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length >= 3, true);
    assert.equal(body.data.some(s => s.toLowerCase().includes("loan")), true);
  });

  await t.test("1a. Returns Kiswahili starter suggestions when the interface is in Kiswahili", async () => {
    const res = await req("/api/support/ai/suggestions?language=sw");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.some(s => s.includes("mkopo")), true);
    assert.equal(body.data.some(s => s.includes("Michango")), true);
  });

  await t.test("1b. Guides users who ask in either language to join an existing Chama", async () => {
    for (const [message, expectedLanguage] of [
      ["Nataka kujiunga na chama kwa msimbo wa mwaliko", "sw"],
      ["How do I join an existing Chama with an activation code?", "en"],
    ]) {
      const res = await req("/api/support/ai/chat", { method: "POST", body: { message } });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.language, expectedLanguage);
      assert.match(body.data.reply, expectedLanguage === "sw" ? /Kujiunga na chama kilichopo/ : /To join an existing Chama/);
      assert.equal(body.data.actions.some(action => action.target === "#login"), true);
    }
  });

  await t.test("2. Answers loan inquiries with configured policy and guarantor requirements", async () => {
    const res = await req("/api/support/ai/chat", {
      method: "POST",
      cookie: memberCookie,
      body: { message: "How do I apply for a loan and how much can I borrow?" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.reply);
    assert.match(body.data.reply, /no universal eligibility threshold/i);
    assert.equal(body.data.reply.includes("guarantors"), true);
    assert.match(body.data.reply, /7%/);
    assert.ok(Array.isArray(body.data.actions));
    assert.equal(body.data.actions.some(a => a.target === "#loans-panel"), true);
  });

  await t.test("2a. Understands a Kiswahili loan question and replies in Kiswahili", async () => {
    const res = await req("/api/support/ai/chat", {
      method: "POST",
      cookie: memberCookie,
      body: { message: "Ninawezaje kuomba mkopo na ninahitaji wadhamini wangapi?" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.language, "sw");
    assert.match(body.data.reply, /Hakuna kigezo cha jumla/i);
    assert.match(body.data.reply, /wanachama hai wawili tofauti/i);
    assert.equal(body.data.actions.some(a => a.label === "Omba mkopo"), true);
  });

  await t.test("2b. Uses the signed-in user's own Chama loan rate", async () => {
    const res = await req("/api/support/ai/chat", {
      method: "POST",
      cookie: otherChamaCookie,
      body: { message: "What is my loan interest rate?" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.data.reply, /9%/);
    assert.doesNotMatch(body.data.reply, /7%/);
  });

  await t.test("3. Answers contribution and welfare inquiries with deadline and penalty info", async () => {
    const res = await req("/api/support/ai/chat", {
      method: "POST",
      cookie: memberCookie,
      body: { message: "When is the monthly contribution due and what is the late penalty?" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.reply);
    assert.equal(body.data.reply.toLowerCase().includes("welfare"), true);
    assert.equal(body.data.reply.toLowerCase().includes("penalty"), true);
    assert.match(body.data.reply, /KES 650/);
    assert.match(body.data.reply, /KES 250/);
    assert.equal(body.data.actions.some(a => a.target === "#ledger-panel"), true);
  });

  await t.test("3a. Understands Kiswahili contribution and late-fine questions", async () => {
    const res = await req("/api/support/ai/chat", {
      method: "POST",
      cookie: memberCookie,
      body: { message: "Mchango wa kila mwezi hulipwa lini na faini ya kuchelewa ni kiasi gani?" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.language, "sw");
    assert.match(body.data.reply, /Michango na faini zilizorekodiwa/);
    assert.match(body.data.reply, /faini/i);
    assert.match(body.data.reply, /KES 250/);
  });

  await t.test("3b. Does not invent contribution values without an authenticated Chama", async () => {
    const res = await req("/api/support/ai/chat", {
      method: "POST",
      body: { message: "What is the monthly contribution and late fine?" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.data.reply, /date configured by your Chama/i);
    assert.match(body.data.reply, /amount configured by your Chama/i);
    assert.doesNotMatch(body.data.reply, /KES \d+/);
  });

  await t.test("4. Answers PIN recovery inquiries with 6-12 digit rule", async () => {
    const res = await req("/api/support/ai/chat", {
      method: "POST",
      body: { message: "I forgot my PIN, how can I reset it?" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.reply);
    assert.match(body.data.reply, /6[–-]12 digit/i);
    assert.equal(body.data.reply.includes("Forgot PIN?"), true);
  });

  await t.test("4a. Answers Kiswahili PIN recovery questions in Kiswahili", async () => {
    const res = await req("/api/support/ai/chat", {
      method: "POST",
      body: { message: "Nimesahau namba yangu ya siri, nifanye nini?" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.language, "sw");
    assert.match(body.data.reply, /tarakimu \*\*6[–-]12\*\*/i);
    assert.match(body.data.reply, /Ukisahau PIN/i);
  });

  await t.test("5. Escalates directly to human support ticket on request", async () => {
    const res = await req("/api/support/ai/chat", {
      method: "POST",
      cookie: memberCookie,
      body: { message: "I want to talk to a human agent right now" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.reply);
    assert.equal(body.data.reply.toLowerCase().includes("human"), true);
    assert.equal(body.data.actions.some(a => a.action === "open_ticket"), true);
  });

  await t.test("5a. Escalates Kiswahili requests to a human support ticket", async () => {
    const res = await req("/api/support/ai/chat", {
      method: "POST",
      cookie: memberCookie,
      body: { message: "Naomba kuzungumza na mhudumu wa msaada" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.language, "sw");
    assert.match(body.data.reply, /Wasilisha ombi la msaada/);
    assert.equal(body.data.actions.some(a => a.action === "open_ticket"), true);
  });

  await t.test("5b. Uses the language of an English question even when the interface preference is Kiswahili", async () => {
    const res = await req("/api/support/ai/chat", {
      method: "POST",
      body: { message: "How do I reset my PIN?", language: "sw" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.language, "en");
    assert.match(body.data.reply, /6[–-]12 digit/i);
  });

  await t.test("6. Validates empty input and excessive length", async () => {
    const emptyRes = await req("/api/support/ai/chat", {
      method: "POST",
      body: { message: "" },
    });
    assert.equal(emptyRes.status, 400);

    const longRes = await req("/api/support/ai/chat", {
      method: "POST",
      body: { message: "a".repeat(2500) },
    });
    assert.equal(longRes.status, 400);
  });
});

test("Audit log verification for support events", async () => {
  const res = await req("/api/audit-log", { cookie: chairCookie });
  assert.equal(res.status, 200);
  const body = await res.json();
  const eventTypes = body.data.map(e => e.type);

  assert.equal(eventTypes.includes("support.ticket_created"), true, "Must log ticket creation");
  assert.equal(eventTypes.includes("support.ticket_assigned"), true, "Must log ticket assignment");
  assert.equal(eventTypes.includes("support.internal_note_added"), true, "Must log internal note");
  assert.equal(eventTypes.includes("support.ticket_status_changed"), true, "Must log status change");
  assert.equal(eventTypes.includes("support.ticket_escalated"), true, "Must log escalation");
  assert.equal(eventTypes.includes("support.ticket_reopened"), true, "Must log reopening");
});
