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

module.exports = {
  VALID_STATUSES,
  VALID_PRIORITIES,
  VALID_CATEGORIES,
  DEFAULT_FAQS,
  isStaffUser,
  isPlatformAdmin,
  isChamaAdmin,
  canAccessTicket,
  sanitizeTicketForUser,
  keywordSearchFaqs,
  generateTicketNumber,
};
