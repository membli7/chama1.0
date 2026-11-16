"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const VALID_STATUSES = ["Open", "In Progress", "Waiting for User", "Resolved", "Closed"];
const VALID_PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const VALID_CATEGORIES = [
  "Account & Login",
  "Contributions & Fines",
  "Loans & Approvals",
  "Attendance & Meetings",
  "Technical Issue",
  "Other"
];

const DEFAULT_FAQS = [
  {
    id: "faq-1",
    category: "Account & Login",
    question: "How do I register a new chama?",
    answer: "1. On the home page, select 'Register a New Chama'.\n2. Enter your Chama name, meeting frequency, and your Chairperson contact details (name, Kenyan phone number, email address).\n3. Review the financial rules (minimum shares, loan interest rate, meeting deadline).\n4. Acknowledge the Terms and Conditions and Privacy Notice.\n5. Choose a secure 6-12 digit PIN to complete registration.",
    published: true,
    helpfulCount: 12,
    notHelpfulCount: 0,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z"
  },
  {
    id: "faq-2",
    category: "Account & Login",
    question: "How do I join an existing chama with an activation code?",
    answer: "1. Contact your chama Chairperson or Secretary to receive your one-time invitation code.\n2. Go to the Member Login page and select 'Enter Invite Code' or 'Activate invitation'.\n3. Enter your activation code, confirm your registered phone number, and set your private 6-12 digit PIN.\n4. Accept the Terms and Conditions to access your dashboard.",
    published: true,
    helpfulCount: 18,
    notHelpfulCount: 1,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z"
  },
  {
    id: "faq-3",
    category: "Account & Login",
    question: "What should I do if I forgot my PIN?",
    answer: "1. On the Member Login screen, click 'Forgot PIN?'.\n2. Enter the email address associated with your chama account.\n3. Check your email for a 6-digit PIN reset code.\n4. Enter the verification code and set your new 6-12 digit PIN.\n5. If you do not have an email registered, contact your Chama Chairperson or submit a support ticket.",
    published: true,
    helpfulCount: 9,
    notHelpfulCount: 0,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z"
  },
  {
    id: "faq-4",
    category: "Contributions & Fines",
    question: "How are monthly contributions recorded?",
    answer: "1. Chama members make their scheduled monthly payments directly to the group according to group rules.\n2. The Treasurer records the cash received under 'Record cash' in the dashboard.\n3. Each payment is split into welfare fees, penalties (if late), and share capital according to chama policies.\n4. Both the member and the Treasurer can immediately verify the transaction in their Ledger.",
    published: true,
    helpfulCount: 15,
    notHelpfulCount: 0,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z"
  },
  {
    id: "faq-5",
    category: "Loans & Approvals",
    question: "How do loan requests and guarantors work?",
    answer: "1. Navigate to the 'Loans' section in your dashboard and select 'Request loan'.\n2. Enter your desired loan amount and term (1, 2, 3, or 6 months).\n3. Select two active chama members to act as your guarantors.\n4. Submit your application. The system will evaluate your eligibility based on group rules, active membership history, and share capital.\n5. Once approved, the repayment schedule is tracked in your loan details.",
    published: true,
    helpfulCount: 14,
    notHelpfulCount: 1,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z"
  },
  {
    id: "faq-6",
    category: "Attendance & Meetings",
    question: "How is meeting attendance tracked?",
    answer: "1. The Chama Secretary creates and manages the attendance register for each scheduled meeting date.\n2. Members are marked as Present, Absent with Apology, or Absent.\n3. Any fines or penalties associated with unexcused absences are logged according to group rules.",
    published: true,
    helpfulCount: 7,
    notHelpfulCount: 0,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z"
  }
];

function isStaffUser(user) {
  if (!user) return false;
  return ["support_agent", "platform_admin", "admin"].includes(user.role);
}

function isPlatformAdmin(user) {
  if (!user) return false;
  return ["platform_admin", "admin"].includes(user.role);
}

function isChamaAdmin(user) {
  if (!user) return false;
  return user.role === "chairperson";
}

function canAccessTicket(user, ticket, state) {
  if (!user || !ticket) return false;
  // Creator can always access their own ticket
  if (ticket.userId === user.id) return true;
  // Platform administrator can access any ticket
  if (isPlatformAdmin(user)) return true;
  // Chama chairperson can access tickets belonging to their Chama
  if (isChamaAdmin(user) && ticket.chamaId === user.chamaId) return true;
  // Support agent check
  if (user.role === "support_agent") {
    // Check if agent account is active
    const agentProfile = state.supportAgents?.find(a => a.id === user.id);
    if (agentProfile && agentProfile.status !== "active") return false;
    // Assigned agent can access
    if (ticket.assignedAgentId === user.id) return true;
    // Agent with cross-tenant or unassigned ticket permission can view unassigned tickets
    if (!ticket.assignedAgentId) return true;
    if (agentProfile?.permissions?.canViewCrossTenant) return true;
  }
  return false;
}

function sanitizeTicketForUser(ticket, user) {
  const isStaff = isStaffUser(user);
  const cloned = structuredClone(ticket);
  if (!isStaff) {
    // Strip private internal notes
    cloned.messages = (cloned.messages || []).filter(m => !m.isInternalNote);
    // Strip internal history actions
    cloned.history = (cloned.history || []).filter(h => h.action !== "internal_note" && !h.isInternal);
  }
  return cloned;
}

function keywordSearchFaqs(faqs, query, category) {
  let list = Array.isArray(faqs) ? faqs : [];
  // Filter published only by default
  list = list.filter(f => f.published !== false);

  if (category && category !== "All") {
    list = list.filter(f => f.category.toLowerCase() === category.toLowerCase());
  }

  if (!query || typeof query !== "string" || !query.trim()) {
    return list;
  }

  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return list.filter(faq => {
    const haystack = `${faq.question} ${faq.answer} ${faq.category}`.toLowerCase();
    return terms.some(term => haystack.includes(term));
  });
}

function generateTicketNumber(existingTickets) {
  const count = (Array.isArray(existingTickets) ? existingTickets.length : 0) + 1;
  return `TICK-${1000 + count}`;
}

const STARTER_SUGGESTIONS = [
  "How do I request a loan?",
  "How are monthly contributions recorded?",
  "What if I forgot my PIN?",
  "How do meeting attendance and fines work?",
  "How do dividends get calculated?",
  "Talk to human support"
];

function processAiChat(rawMessage, context = {}, state = {}) {
  const message = String(rawMessage || "").trim();
  const lower = message.toLowerCase();

  const user = context.user || null;
  const chamaSettings = context.settings || {
    defaultDeadlineDay: 5,
    welfareMonthlyFee: 500,
    lateContributionPenalty: 200,
    loanMonthlyRatePercent: 5,
  };

  // Helper response builder
  const reply = (text, actions = [], related = []) => ({
    reply: text,
    actions,
    related: related.length > 0 ? related : [
      "How do I request a loan?",
      "How are monthly contributions recorded?",
      "What if I forgot my PIN?",
      "Talk to human support"
    ],
    timestamp: new Date().toISOString(),
  });

  if (!message) {
    return reply(
      "Hello! I am your Jirani Chama AI Assistant. I can help you with contributions, loans, PIN changes, meeting attendance, and account settings. How can I assist you today?"
    );
  }

  // 1. Greetings
  if (/^(hi|hello|hey|jambo|habari|greetings|good\s*(morning|afternoon|evening))\b/i.test(lower)) {
    const greeting = user?.name ? `Hello ${user.name}!` : "Hello!";
    return reply(
      `${greeting} Welcome to Jirani Chama AI Support. I am your in-app assistant. You can ask me about:\n\n• **Loans & borrowing limits** (3x shares, guarantors)\n• **Monthly contributions & late fines**\n• **PIN change & reset instructions**\n• **Meeting attendance & registers**\n• **Connecting to a human support agent**\n\nWhat would you like assistance with?`,
      [],
      ["How do I request a loan?", "How are monthly contributions recorded?", "What if I forgot my PIN?"]
    );
  }

  // 2. Loans & Guarantors
  if (/loan|borrow|lend|guarantor|credit|interest/i.test(lower)) {
    const rate = chamaSettings.loanMonthlyRatePercent || 5;
    return reply(
      `### Loan Guidelines & How to Apply\n\n1. **Eligibility**: You must have active membership and share capital. You can borrow up to **3 times your share capital**.\n2. **Guarantors**: Every loan application requires **2 active Chama members** as guarantors.\n3. **Decisions**: Applications are evaluated automatically based on your group's configured credit rules.\n4. **Terms & Rates**: Loans can be requested for 1, 2, 3, or 6 months at your group's monthly interest rate of **${rate}%**.\n5. **Repayments**: Track your upcoming installments and settle them with the Treasurer in your dashboard.`,
      [
        { label: "Request a Loan", target: "#loans-panel", action: "navigate" },
        { label: "Check Loan Policy", target: "#help-panel", action: "navigate" }
      ],
      ["How are loan guarantors selected?", "How do I repay my loan?", "How are contributions recorded?"]
    );
  }

  // 3. Contributions, Welfare & Penalties
  if (/contribution|welfare|deposit|penalty|penalties|fine|late\s*payment|record\s*cash|paybill|mpesa/i.test(lower)) {
    const deadline = chamaSettings.defaultDeadlineDay || 5;
    const fee = chamaSettings.welfareMonthlyFee || 500;
    const penalty = chamaSettings.lateContributionPenalty || 200;
    return reply(
      `### Monthly Contributions & Fees\n\n1. **Deadline**: Scheduled contributions are due by the **${deadline}th** of each month.\n2. **Welfare Fee**: A monthly welfare reserve contribution of **KES ${fee}** is deducted first on your initial payment of the month.\n3. **Late Penalties**: Payments logged after the deadline incur a late contribution penalty of **KES ${penalty}**, which is settled before share capital.\n4. **Recording Cash**: Payments made in cash are officially recorded by your Chama Treasurer under the *Record cash* section of the dashboard.\n5. **Ledger Verification**: You can verify your balance, penalties, and share capital in real time on the *Ledger* tab.`,
      [
        { label: "View Ledger", target: "#ledger-panel", action: "navigate" },
        { label: "Record Cash Payment", target: "#payment-panel", action: "navigate" }
      ],
      ["How do I request a loan?", "What if I forgot my PIN?", "How do meeting attendance and fines work?"]
    );
  }

  // 4. PIN Change, Reset, & Lockout
  if (/pin|password|reset|forgot|lockout|unlock|code/i.test(lower)) {
    return reply(
      `### PIN Security & Recovery\n\n1. **PIN Requirements**: All Jirani Chama accounts require a secure **6 to 12 digit numeric PIN**.\n2. **Forgot PIN**: On the Member Login screen, click **'Forgot PIN?'**. Enter your registered email to receive a 6-digit one-time reset code.\n3. **Upgrading Old PINs**: If you have an older 4-digit PIN, sign in as usual; you will be prompted to set a new 6-digit PIN immediately.\n4. **Account Lockout**: For your security, accounts are temporarily locked for 15 minutes after 5 consecutive incorrect attempts.\n5. **Passkeys**: You can also enroll a Passkey (Fingerprint or Face unlock) in your Profile settings for fast, passwordless login.`,
      [
        { label: "Go to Login", target: "#login", action: "navigate" },
        { label: "Profile Settings", target: "#profile", action: "navigate" }
      ],
      ["How are contributions recorded?", "How do I request a loan?", "Talk to human support"]
    );
  }

  // 5. Meetings, Attendance, & Apologies
  if (/meeting|attendance|absent|register|apology|secretary/i.test(lower)) {
    return reply(
      `### Meeting Attendance & Registers\n\n1. **Attendance Register**: The Chama Secretary records attendance for each scheduled group meeting.\n2. **Status Options**: Members are marked as *Present*, *Absent with Apology*, or *Absent*.\n3. **Excused Absences**: If you cannot attend, notify your Secretary or Chairperson in advance so your apology is recorded.\n4. **Fines for Unexcused Absences**: Fines assessed for unexcused absences appear in your Ledger as outstanding penalties.`,
      [
        { label: "Check Attendance", target: "#attendance-panel", action: "navigate" },
        { label: "View Ledger", target: "#ledger-panel", action: "navigate" }
      ],
      ["How are late penalties charged?", "How are monthly contributions recorded?", "Talk to human support"]
    );
  }

  // 6. Dividends & Profit Sharing
  if (/dividend|profit|distribution|share\s*capital|payout/i.test(lower)) {
    return reply(
      `### Dividends & Profit Sharing\n\n1. **Calculation**: The Chairperson and Treasurer calculate available dividends based on accumulated interest from loans and Chama earnings.\n2. **Proportionate Share**: Dividends are distributed proportionally according to each member's verified share capital.\n3. **Commitment**: Once reviewed and committed by leadership, dividend payouts are recorded in the Chama ledger.`,
      [
        { label: "Dividends Overview", target: "#dividend-panel", action: "navigate" },
        { label: "View Ledger", target: "#ledger-panel", action: "navigate" }
      ],
      ["How do I request a loan?", "How are monthly contributions recorded?", "Talk to human support"]
    );
  }

  // 7. Leadership, Roles, & Elections
  if (/chairperson|treasurer|secretary|role|election|leadership|officer/i.test(lower)) {
    return reply(
      `### Chama Roles & Responsibilities\n\n• **Chairperson**: Oversees chama governance, schedules elections, and reviews loan policies.\n• **Secretary**: Manages member invitations, schedules meetings, and records attendance registers.\n• **Treasurer**: Records cash contributions, tracks loan repayments, and manages dividends.\n• **Member**: Makes monthly contributions, participates in meetings, requests loans, and votes in elections.`,
      [
        { label: "Help & Guide", target: "#help-panel", action: "navigate" }
      ],
      ["How do I request a loan?", "How are monthly contributions recorded?", "Talk to human support"]
    );
  }

  // 8. Human Support Escalation
  if (/human|agent|person|ticket|representative|operator|support\s*staff|contact/i.test(lower)) {
    return reply(
      `### Connect with Human Support\n\nOur human support agents are ready to assist you directly!\n\nYou can submit a support ticket detailing your issue, attach photos or receipts, and communicate directly with designated staff.`,
      [
        { label: "Submit Support Ticket", target: "#support-panel", action: "open_ticket" },
        { label: "Browse FAQs", target: "#faq-panel", action: "navigate" }
      ],
      ["How do I request a loan?", "How are monthly contributions recorded?", "What if I forgot my PIN?"]
    );
  }

  // 9. Check FAQs for keyword match
  const matchingFaqs = keywordSearchFaqs(state.faqs || DEFAULT_FAQS, message);
  if (matchingFaqs.length > 0) {
    const best = matchingFaqs[0];
    return reply(
      `### ${best.question}\n\n${best.answer}`,
      [
        { label: "Browse All FAQs", target: "#faq-panel", action: "navigate" },
        { label: "Talk to Human Support", target: "#support-panel", action: "open_ticket" }
      ],
      matchingFaqs.slice(1, 4).map(f => f.question)
    );
  }

  // 10. Intelligent general fallback
  return reply(
    `I couldn't find an exact match for your question, but I am here to help!\n\nHere are some common topics I can assist with:\n\n• **Loans**: Ask *"How do I request a loan?"*\n• **Contributions**: Ask *"How are contributions recorded?"*\n• **PIN & Security**: Ask *"How do I reset my PIN?"*\n• **Meetings**: Ask *"How does attendance work?"*\n\nIf you have a specific inquiry or need account assistance, you can also submit a ticket to our human support team.`,
    [
      { label: "Submit Support Ticket", target: "#support-panel", action: "open_ticket" },
      { label: "Browse FAQs", target: "#faq-panel", action: "navigate" }
    ],
    STARTER_SUGGESTIONS.slice(0, 4)
  );
}

module.exports = {
  VALID_STATUSES,
  VALID_PRIORITIES,
  VALID_CATEGORIES,
  DEFAULT_FAQS,
  STARTER_SUGGESTIONS,
  isStaffUser,
  isPlatformAdmin,
  isChamaAdmin,
  canAccessTicket,
  sanitizeTicketForUser,
  keywordSearchFaqs,
  generateTicketNumber,
  processAiChat,
};
