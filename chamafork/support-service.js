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

function parseSupportKnowledge(markdown) {
  const headings = [...markdown.matchAll(/^## intent:([a-z0-9-]+)\s*$/gim)];
  if (headings.length === 0) throw new Error("Support knowledge document has no intent sections.");

  const topics = Object.create(null);
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const sectionStart = heading.index + heading[0].length;
    const sectionEnd = headings[index + 1]?.index ?? markdown.length;
    const section = markdown.slice(sectionStart, sectionEnd);
    const englishTriggers = section.match(/^\*\*Triggers \(English\):\*\*\s*(.*)$/im);
    const swahiliTriggers = section.match(/^\*\*Triggers \(Kiswahili\):\*\*\s*(.*)$/im);
    const englishAnswer = section.match(/^### English\s*\r?\n([\s\S]*?)(?=^### Kiswahili\s*$)/im);
    const swahiliAnswer = section.match(/^### Kiswahili\s*\r?\n([\s\S]*)$/im);
    const id = heading[1].toLowerCase();

    if (topics[id]) throw new Error(`Duplicate support knowledge intent: ${id}`);
    if (!englishTriggers || !swahiliTriggers || !englishAnswer?.[1]?.trim() || !swahiliAnswer?.[1]?.trim()) {
      throw new Error(`Support knowledge intent '${id}' must define triggers and answers in both languages.`);
    }

    const phrases = value => value.split("|").map(phrase => phrase.trim()).filter(Boolean);
    topics[id] = {
      triggers: { en: phrases(englishTriggers[1]), sw: phrases(swahiliTriggers[1]) },
      answers: { en: englishAnswer[1].trim(), sw: swahiliAnswer[1].trim() },
    };
  }

  if (!topics.unknown || !topics.welcome) {
    throw new Error("Support knowledge document must define 'welcome' and 'unknown' intents.");
  }
  return topics;
}

const SUPPORT_KNOWLEDGE = parseSupportKnowledge(
  fs.readFileSync(path.join(__dirname, "support-knowledge.md"), "utf8")
);

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

const SWAHILI_STARTER_SUGGESTIONS = [
  "Ninawezaje kuomba mkopo?",
  "Michango ya kila mwezi hurekodiwaje?",
  "Nifanye nini nikisahau PIN yangu?",
  "Mahudhurio na faini za mikutano hufanyaje kazi?",
  "Gawio huhesabiwaje?",
  "Wasiliana na mhudumu wa msaada"
];

const SWAHILI_ACTION_LABELS = {
  "Request a Loan": "Omba mkopo",
  "Check Loan Policy": "Angalia sera ya mikopo",
  "View Ledger": "Tazama taarifa za hesabu",
  "Record Cash Payment": "Rekodi malipo ya pesa taslimu",
  "Go to Login": "Nenda kwenye ukurasa wa kuingia",
  "Profile Settings": "Mipangilio ya wasifu",
  "Check Attendance": "Angalia mahudhurio",
  "Dividends Overview": "Muhtasari wa gawio",
  "Help & Guide": "Mwongozo wa usaidizi",
  "Submit Support Ticket": "Wasilisha ombi la msaada",
  "Browse FAQs": "Angalia maswali yanayoulizwa mara kwa mara",
  "Browse All FAQs": "Angalia maswali yote yanayoulizwa mara kwa mara",
  "Talk to Human Support": "Wasiliana na mhudumu wa msaada"
};

const SWAHILI_RELATED_QUESTIONS = {
  "How do I request a loan?": "Ninawezaje kuomba mkopo?",
  "How are monthly contributions recorded?": "Michango ya kila mwezi hurekodiwaje?",
  "What if I forgot my PIN?": "Nifanye nini nikisahau PIN yangu?",
  "Talk to human support": "Wasiliana na mhudumu wa msaada",
  "How are loan guarantors selected?": "Wadhamini wa mkopo huchaguliwaje?",
  "How do I repay my loan?": "Nitalipaje mkopo wangu?",
  "How are contributions recorded?": "Michango hurekodiwaje?",
  "How do meeting attendance and fines work?": "Mahudhurio na faini za mikutano hufanyaje kazi?",
  "How are late penalties charged?": "Faini za kuchelewa hutozwaje?",
  "How is meeting attendance tracked?": "Mahudhurio ya mikutano hufuatiliwaje?",
  "How do dividends get calculated?": "Gawio huhesabiwaje?"
};

const SWAHILI_LANGUAGE_CUES = [
  /\b(?:habari|hujambo|mambo|shikamoo|niaje|kwaheri|asante|tafadhali|naomba|ninawezaje|nawezaje|ninahitaji|nahitaji|ninataka|nataka|nifanye|nimesahau|sijui|yangu|wangu|lini|wapi|vipi|je|kwa nini|kiasi gani)\b/i,
  /\b(?:mkopo|mikopo|kukopa|mchango|michango|malipo|faini|riba|mdhamini|wadhamini|dhamana|hisa|gawio|mkutano|mahudhurio|mwenyekiti|katibu|mweka hazina|nenosiri|namba ya siri|kikundi|chama|mwanachama|kujisajili|kujiunga|msaada|msimbo wa mwaliko|uchaguzi|kura|viongozi|ruhusa|mazungumzo|usajili|tarehe)\b/i
];

const ENGLISH_LANGUAGE_CUES = [
  /\b(?:hello|hi|hey|how|what|when|where|why|who|can|could|do|does|did|is|are|please|my|your|forgot|request|apply|loan|contribution|payment|fine|attendance|meeting|dividend|support|agent|ticket|password|account|reset|register|registration|join|invitation|election|vote|ballot|chat|role|leadership|paybill|mpesa)\b/i
];

function detectChatLanguage(message, preferredLanguage) {
  const text = String(message || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const countCues = patterns => patterns.reduce((score, pattern) => {
    const matches = text.match(new RegExp(pattern.source, "gi"));
    return score + (matches?.length || 0);
  }, 0);
  const swahiliScore = countCues(SWAHILI_LANGUAGE_CUES);
  const englishScore = countCues(ENGLISH_LANGUAGE_CUES);

  if (swahiliScore > englishScore) return "sw";
  if (englishScore > swahiliScore) return "en";
  return String(preferredLanguage || "").toLowerCase().startsWith("sw") ? "sw" : "en";
}

function normalizeSupportText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function matchesSupportIntent(message, intentId) {
  const topic = SUPPORT_KNOWLEDGE[intentId];
  if (!topic) return false;
  const text = normalizeSupportText(message);
  return [...topic.triggers.en, ...topic.triggers.sw].some(phrase => {
    const escaped = normalizeSupportText(phrase).split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+");
    const start = intentId === "greeting" ? "^" : "\\b";
    return new RegExp(`${start}${escaped}(?:\\b|$)`, "i").test(text);
  });
}

function ordinalDay(day) {
  const remainder = day % 100;
  if (remainder >= 11 && remainder <= 13) return `${day}th`;
  return `${day}${({ 1: "st", 2: "nd", 3: "rd" })[day % 10] || "th"}`;
}

function configuredNumber(settings, key) {
  const raw = settings?.[key];
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function loanPolicySummary(policy, language) {
  const localized = (english, swahili) => language === "sw" ? swahili : english;
  const fallback = localized(
    "Check with your Chama's Chairperson for the current rules. If no policy is saved, the app will not record a new loan application.",
    "Muulize Mwenyekiti kuhusu kanuni za sasa. Ikiwa sera haijahifadhiwa, programu haitasajili ombi jipya la mkopo."
  );
  if (!policy || !Array.isArray(policy.tiers) || policy.tiers.length < 1 || policy.tiers.length > 8) return fallback;
  if (!Number.isInteger(policy.maxGroupCashPercent) || policy.maxGroupCashPercent < 0 || policy.maxGroupCashPercent > 100
    || !Number.isInteger(policy.maxMemberContributionPercent) || policy.maxMemberContributionPercent < 0 || policy.maxMemberContributionPercent > 1000) return fallback;

  const tiers = policy.tiers.map((tier, index) => {
    if (!Number.isSafeInteger(tier?.maxAmountKsh) || tier.maxAmountKsh < 1 || tier.maxAmountKsh > 1_000_000_000
      || !Number.isSafeInteger(tier?.minActiveDays) || tier.minActiveDays < 0 || tier.minActiveDays > 36_500
      || !Number.isSafeInteger(tier?.minShareContributionKsh) || tier.minShareContributionKsh < 0 || tier.minShareContributionKsh > 1_000_000_000) return null;
    return language === "sw"
      ? `Daraja ${index + 1}: hadi KES ${tier.maxAmountKsh}; angalau siku ${tier.minActiveDays} za uanachama hai na KES ${tier.minShareContributionKsh} za michango ya mtaji wa hisa`
      : `Tier ${index + 1}: up to KES ${tier.maxAmountKsh}; at least ${tier.minActiveDays} active-membership days and KES ${tier.minShareContributionKsh} in share-capital contributions`;
  });
  if (tiers.some(tier => !tier)) return fallback;

  return language === "sw"
    ? `Ukomo wa salio la chama: ${policy.maxGroupCashPercent}% ya salio lililorekodiwa; ukomo unaotegemea michango ya mwanachama: ${policy.maxMemberContributionPercent}% ya mtaji wa hisa uliorekodiwa; madaraja: ${tiers.join("; ")}.`
    : `Group-balance cap: ${policy.maxGroupCashPercent}% of the recorded balance; member-contribution cap: ${policy.maxMemberContributionPercent}% of recorded share capital; tiers: ${tiers.join("; ")}.`;
}

function knowledgeAnswer(intentId, language, settings = {}, loanPolicy = null) {
  const topic = SUPPORT_KNOWLEDGE[intentId] || SUPPORT_KNOWLEDGE.unknown;
  const localized = (english, swahili) => language === "sw" ? swahili : english;
  const deadlineDay = configuredNumber(settings, "defaultDeadlineDay");
  const welfareFee = configuredNumber(settings, "welfareMonthlyFee");
  const latePenalty = configuredNumber(settings, "lateContributionPenalty");
  const loanRate = configuredNumber(settings, "loanMonthlyRatePercent");
  const values = {
    deadline: deadlineDay !== null && Number.isInteger(deadlineDay) && deadlineDay >= 1 && deadlineDay <= 28
      ? localized(`the ${ordinalDay(deadlineDay)}`, `tarehe ${deadlineDay}`)
      : localized("the date configured by your Chama", "tarehe iliyowekwa na chama chako"),
    welfareFee: welfareFee !== null && Number.isSafeInteger(welfareFee) && welfareFee >= 0
      ? `KES ${welfareFee}`
      : localized("the amount configured by your Chama", "kiasi kilichowekwa na chama chako"),
    latePenalty: latePenalty !== null && Number.isSafeInteger(latePenalty) && latePenalty >= 0
      ? `KES ${latePenalty}`
      : localized("the amount configured by your Chama", "kiasi kilichowekwa na chama chako"),
    loanRate: loanRate !== null && loanRate >= 0 && loanRate <= 100
      ? `${loanRate}%`
      : localized("the rate configured by your Chama", "riba iliyowekwa na chama chako"),
    loanPolicyDetails: loanPolicySummary(loanPolicy, language),
  };
  return topic.answers[language === "sw" ? "sw" : "en"].replace(/\{\{(deadline|welfareFee|latePenalty|loanRate|loanPolicyDetails)\}\}/g, (_, key) => values[key]);
}

const FAQ_STOP_WORDS = new Set([
  "a", "an", "and", "are", "can", "do", "for", "how", "i", "in", "is", "it", "me", "my", "of", "the", "to", "what", "when", "where", "with", "you",
  "je", "na", "ni", "nini", "ya", "yangu", "za", "wa", "wangu", "kwenye", "vipi", "ninawezaje", "nawezaje",
]);

function findRelevantAssistantFaqs(faqs, query) {
  const list = (Array.isArray(faqs) ? faqs : []).filter(faq => faq && faq.published !== false);
  const normalizedQuery = normalizeSupportText(query);
  const exactMatch = list.find(faq => normalizeSupportText(faq.question) === normalizedQuery);
  if (exactMatch) return [exactMatch];

  const queryTerms = [...new Set(normalizedQuery.split(/\s+/).filter(term => term.length >= 3 && !FAQ_STOP_WORDS.has(term)))];
  if (queryTerms.length < 2) return [];
  const ranked = list.map(faq => {
    const questionTerms = new Set(normalizeSupportText(faq.question).split(/\s+/));
    return { faq, score: queryTerms.filter(term => questionTerms.has(term)).length };
  }).filter(item => item.score >= 2).sort((left, right) => right.score - left.score);
  return ranked.length ? [ranked[0].faq] : [];
}

function processAiChat(rawMessage, context = {}, state = {}) {
  const message = String(rawMessage || '').trim();
  const language = detectChatLanguage(message, context.language);
  const settings = context.settings || {};
  const user = context.user || null;
  const localized = (english, swahili) => language === 'sw' ? swahili : english;

  const reply = (text, actions = [], related = [], metadata = {}) => ({
    reply: text,
    language,
    actions: language === 'sw'
      ? actions.map(action => ({ ...action, label: SWAHILI_ACTION_LABELS[action.label] || action.label }))
      : actions,
    related: (related.length > 0 ? related : [
      'How do I request a loan?',
      'How are monthly contributions recorded?',
      'What if I forgot my PIN?',
      'Talk to human support'
    ]).map(question => language === 'sw' ? SWAHILI_RELATED_QUESTIONS[question] || question : question),
    followUp: message ? localized("Would you like help with anything else?", "Je, kuna jambo lingine unalohitaji msaada nalo?") : "",
    timestamp: new Date().toISOString(),
    ...metadata,
  });

  if (!message) return reply(knowledgeAnswer('welcome', language, settings));

  if (matchesSupportIntent(message, 'greeting')) {
    const greeting = user?.name ? localized(`Hello ${user.name}!`, `Habari ${user.name}!`) : '';
    const answer = knowledgeAnswer('greeting', language, settings);
    return reply(greeting ? `${greeting}\n\n${answer}` : answer, [], [
      'How do I request a loan?',
      'How are monthly contributions recorded?',
      'What if I forgot my PIN?'
    ]);
  }

  const topicRoutes = [
    {
      id: 'human-support',
      actions: [
        { label: 'Submit Support Ticket', target: '#support-panel', action: 'open_ticket' },
        { label: 'Browse FAQs', target: '#faq-panel', action: 'navigate' }
      ],
    },
    {
      id: 'payment-automation',
      actions: [
        { label: 'View Ledger', target: '#ledger-panel', action: 'navigate' },
        { label: 'Talk to Human Support', target: '#support-panel', action: 'open_ticket' }
      ],
    },
    {
      id: 'join-existing-chama',
      actions: [{ label: 'Go to Login', target: '#login', action: 'navigate' }],
    },
    {
      id: 'register-new-chama',
      actions: [{ label: 'Help & Guide', target: '#help-panel', action: 'navigate' }],
    },
    {
      id: 'loan',
      actions: [
        { label: 'Request a Loan', target: '#loans-panel', action: 'navigate' },
        { label: 'Check Loan Policy', target: '#help-panel', action: 'navigate' }
      ],
      related: ['How are loan guarantors selected?', 'How do I repay my loan?', 'How are contributions recorded?'],
    },
    {
      id: 'attendance',
      actions: [
        { label: 'Check Attendance', target: '#attendance-panel', action: 'navigate' },
        { label: 'View Ledger', target: '#ledger-panel', action: 'navigate' }
      ],
      related: ['How are late penalties charged?', 'How are monthly contributions recorded?', 'Talk to human support'],
    },
    {
      id: 'contributions',
      actions: [
        { label: 'View Ledger', target: '#ledger-panel', action: 'navigate' },
        { label: 'Record Cash Payment', target: '#payment-panel', action: 'navigate' }
      ],
      related: ['How do I request a loan?', 'What if I forgot my PIN?', 'How do meeting attendance and fines work?'],
    },
    {
      id: 'pin',
      actions: [{ label: 'Go to Login', target: '#login', action: 'navigate' }],
      related: ['How are contributions recorded?', 'How do I request a loan?', 'Talk to human support'],
    },
    {
      id: 'dividends',
      actions: [
        { label: 'Dividends Overview', target: '#dividend-panel', action: 'navigate' },
        { label: 'View Ledger', target: '#ledger-panel', action: 'navigate' }
      ],
    },
    {
      id: 'elections',
      actions: [{ label: 'Help & Guide', target: '#help-panel', action: 'navigate' }],
    },
    {
      id: 'roles',
      actions: [{ label: 'Help & Guide', target: '#help-panel', action: 'navigate' }],
    },
    { id: 'group-chat', actions: [] },
  ];

  for (const route of topicRoutes) {
    if (matchesSupportIntent(message, route.id)) {
      return reply(knowledgeAnswer(route.id, language, settings, context.loanPolicy), route.actions, route.related || []);
    }
  }

  const matchingFaqs = findRelevantAssistantFaqs(state.faqs || DEFAULT_FAQS, message);
  if (matchingFaqs.length > 0) {
    const best = matchingFaqs[0];
    if (language === 'sw') {
      return reply(
        knowledgeAnswer('faq-not-translated', language, settings),
        [
          { label: 'Browse All FAQs', target: '#faq-panel', action: 'navigate' },
          { label: 'Talk to Human Support', target: '#support-panel', action: 'open_ticket' }
        ]
      );
    }
    return reply(
      `### ${best.question}\n\n${best.answer}`,
      [
        { label: 'Browse All FAQs', target: '#faq-panel', action: 'navigate' },
        { label: 'Talk to Human Support', target: '#support-panel', action: 'open_ticket' }
      ]
    );
  }

  return reply(knowledgeAnswer('unknown', language, settings), [
    { label: 'Submit Support Ticket', target: '#support-panel', action: 'open_ticket' },
    { label: 'Browse FAQs', target: '#faq-panel', action: 'navigate' }
  ], [], { unanswered: true, unansweredQuestion: message });
}

module.exports = {
  VALID_STATUSES,
  VALID_PRIORITIES,
  VALID_CATEGORIES,
  DEFAULT_FAQS,
  STARTER_SUGGESTIONS,
  SWAHILI_STARTER_SUGGESTIONS,
  isStaffUser,
  isPlatformAdmin,
  isChamaAdmin,
  canAccessTicket,
  sanitizeTicketForUser,
  keywordSearchFaqs,
  generateTicketNumber,
  processAiChat,
};
