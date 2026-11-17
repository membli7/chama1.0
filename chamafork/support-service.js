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
  /\b(?:mkopo|mikopo|kukopa|mchango|michango|malipo|faini|riba|mdhamini|wadhamini|dhamana|hisa|gawio|mkutano|mahudhurio|mwenyekiti|katibu|mweka hazina|nenosiri|namba ya siri|kikundi|chama|mwanachama|kujisajili|kujiunga|msaada|msimbo wa mwaliko)\b/i
];

const ENGLISH_LANGUAGE_CUES = [
  /\b(?:hello|hi|hey|how|what|when|where|why|who|can|could|do|does|did|is|are|please|my|your|forgot|request|apply|loan|contribution|payment|fine|attendance|meeting|dividend|support|agent|ticket|password|account|reset)\b/i
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

function processAiChat(rawMessage, context = {}, state = {}) {
  const message = String(rawMessage || "").trim();
  const lower = message.toLowerCase();
  const language = detectChatLanguage(message, context.language);
  const localized = (english, swahili) => language === "sw" ? swahili : english;

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
    language,
    actions: language === "sw"
      ? actions.map(action => ({ ...action, label: SWAHILI_ACTION_LABELS[action.label] || action.label }))
      : actions,
    related: (related.length > 0 ? related : [
      "How do I request a loan?",
      "How are monthly contributions recorded?",
      "What if I forgot my PIN?",
      "Talk to human support"
    ]).map(question => language === "sw" ? SWAHILI_RELATED_QUESTIONS[question] || question : question),
    timestamp: new Date().toISOString(),
  });

  if (!message) {
    return reply(
      localized(
        "Hello! I am your Jirani Chama AI Assistant. I can help you with contributions, loans, PIN changes, meeting attendance, and account settings. How can I assist you today?",
        "Habari! Mimi ni msaidizi wa AI wa Jirani Chama. Naweza kukusaidia kuhusu michango, mikopo, kubadilisha PIN, mahudhurio ya mikutano na mipangilio ya akaunti. Nikusaidie vipi leo?"
      )
    );
  }

  // 1. Greetings
  if (/^(hi|hello|hey|jambo|habari|hujambo|mambo|shikamoo|niaje|salamu|greetings|good\s*(morning|afternoon|evening))\b/i.test(lower)) {
    const greeting = user?.name
      ? localized(`Hello ${user.name}!`, `Habari ${user.name}!`)
      : localized("Hello!", "Habari!");
    return reply(
      localized(
        `${greeting} Welcome to Jirani Chama AI Support. I am your in-app assistant. You can ask me about:\n\n• **Loans & borrowing limits** (3x shares, guarantors)\n• **Monthly contributions & late fines**\n• **PIN change & reset instructions**\n• **Meeting attendance & registers**\n• **Connecting to a human support agent**\n\nWhat would you like assistance with?`,
        `${greeting} Karibu kwenye huduma ya msaada ya Jirani Chama. Unaweza kuniuliza kuhusu:\n\n• **Mikopo na mipaka ya kukopa** (mara 3 ya hisa, wadhamini)\n• **Michango ya kila mwezi na faini za kuchelewa**\n• **Kubadilisha au kuweka upya PIN**\n• **Mahudhurio ya mikutano na rejista**\n• **Kuwasiliana na mhudumu wa msaada**\n\nNikusaidie kuhusu nini?`
      ),
      [],
      ["How do I request a loan?", "How are monthly contributions recorded?", "What if I forgot my PIN?"]
    );
  }

  // 2. Registration and joining a chama
  if (/register|sign\s*up|create\s+(?:a\s+)?new\s+chama|kujisajili|kusajili|sajili\s+chama|kuanzisha\s+chama|anzisha\s+chama/i.test(lower)) {
    return reply(localized(
      "To register a new Chama, choose 'Register a New Chama' on the home page, enter the group and Chairperson details, review the financial rules, accept the Terms and Privacy Notice, then set a secure 6-12 digit PIN.",
      "Kusajili chama kipya, chagua 'Sajili Chama Kipya' kwenye ukurasa wa mwanzo. Weka jina la chama na mawasiliano ya mwenyekiti, kagua kanuni za fedha, kubali Masharti na Ilani ya Faragha, kisha weka PIN salama ya tarakimu 6 hadi 12."
    ), [{ label: "Help & Guide", target: "#help-panel", action: "navigate" }]);
  }

  if (/join\s+(?:an?\s+)?(?:existing\s+)?chama|invitation|activation\s+code|invite\s+code|kujiunga|jiunge|msimbo\s+wa\s+mwaliko/i.test(lower)) {
    return reply(localized(
      "To join an existing Chama, ask its Chairperson or Secretary for an invitation code. On the Member Login page, choose 'Enter Invite Code', confirm your registered phone number, set a private 6-12 digit PIN, and accept the Terms.",
      "Kujiunga na chama kilichopo, omba msimbo wa mwaliko kutoka kwa mwenyekiti au katibu. Kwenye ukurasa wa kuingia kwa wanachama, chagua 'Weka Msimbo wa Mwaliko', thibitisha nambari yako ya simu iliyosajiliwa, weka PIN binafsi ya tarakimu 6 hadi 12, kisha kubali Masharti."
    ), [{ label: "Go to Login", target: "#login", action: "navigate" }]);
  }

  // 3. Loans & Guarantors
  if (/loan|borrow|lend|guarantor|credit|interest|mkopo|mikopo|kukopa|riba|dhamana|mdhamini|wadhamini|marejesho/i.test(lower)) {
    const rate = chamaSettings.loanMonthlyRatePercent || 5;
    return reply(
      localized(
        `### Loan Guidelines & How to Apply\n\n1. **Eligibility**: You must have active membership and share capital. You can borrow up to **3 times your share capital**.\n2. **Guarantors**: Every loan application requires **2 active Chama members** as guarantors.\n3. **Decisions**: Applications are evaluated automatically based on your group's configured credit rules.\n4. **Terms & Rates**: Loans can be requested for 1, 2, 3, or 6 months at your group's monthly interest rate of **${rate}%**.\n5. **Repayments**: Track your upcoming installments and settle them with the Treasurer in your dashboard.`,
        `### Mwongozo wa Mikopo na Jinsi ya Kuomba\n\n1. **Vigezo**: Lazima uwe mwanachama hai na uwe na mtaji wa hisa. Unaweza kukopa hadi **mara 3 ya mtaji wako wa hisa**.\n2. **Wadhamini**: Kila ombi la mkopo linahitaji **wanachama hai 2 wa chama** kama wadhamini.\n3. **Uamuzi**: Ombi hutathminiwa kiotomatiki kulingana na kanuni za mikopo za kikundi chako.\n4. **Muda na riba**: Unaweza kuomba mkopo wa miezi 1, 2, 3 au 6 kwa riba ya kila mwezi ya kikundi chako ya **${rate}%**.\n5. **Marejesho**: Angalia awamu zinazokaribia na ulipe kupitia kwa Mweka Hazina kwenye dashibodi yako.`
      ),
      [
        { label: "Request a Loan", target: "#loans-panel", action: "navigate" },
        { label: "Check Loan Policy", target: "#help-panel", action: "navigate" }
      ],
      ["How are loan guarantors selected?", "How do I repay my loan?", "How are contributions recorded?"]
    );
  }

  // 4. Contributions, Welfare & Penalties
  if (/contribution|welfare|deposit|penalty|penalties|fine|late\s*payment|record\s*cash|paybill|mpesa|mchango|michango|ustawi|malipo|faini|kuchelewa|rekodi\s+pesa|m-pesa/i.test(lower)) {
    const deadline = chamaSettings.defaultDeadlineDay || 5;
    const fee = chamaSettings.welfareMonthlyFee || 500;
    const penalty = chamaSettings.lateContributionPenalty || 200;
    return reply(
      localized(
        `### Monthly Contributions & Fees\n\n1. **Deadline**: Scheduled contributions are due by the **${deadline}th** of each month.\n2. **Welfare Fee**: A monthly welfare reserve contribution of **KES ${fee}** is deducted first on your initial payment of the month.\n3. **Late Penalties**: Payments logged after the deadline incur a late contribution penalty of **KES ${penalty}**, which is settled before share capital.\n4. **Recording Cash**: Payments made in cash are officially recorded by your Chama Treasurer under the *Record cash* section of the dashboard.\n5. **Ledger Verification**: You can verify your balance, penalties, and share capital in real time on the *Ledger* tab.`,
        `### Michango ya Kila Mwezi na Ada\n\n1. **Tarehe ya mwisho**: Michango ya kila mwezi inapaswa kulipwa kabla ya tarehe **${deadline}** ya kila mwezi.\n2. **Ada ya ustawi**: Ada ya kila mwezi ya ustawi ya **KES ${fee}** hukatwa kwanza kwenye malipo yako ya kwanza ya mwezi.\n3. **Faini za kuchelewa**: Malipo yanayorekodiwa baada ya tarehe ya mwisho hutozwa faini ya **KES ${penalty}**, ambayo hulipwa kabla ya mtaji wa hisa.\n4. **Kurekodi pesa taslimu**: Mweka Hazina wa chama hurekodi malipo ya pesa taslimu kwenye sehemu ya *Rekodi pesa taslimu* ya dashibodi.\n5. **Kukagua taarifa**: Unaweza kuthibitisha salio, faini na mtaji wako wa hisa kwenye kichupo cha *Taarifa za hesabu*.`
      ),
      [
        { label: "View Ledger", target: "#ledger-panel", action: "navigate" },
        { label: "Record Cash Payment", target: "#payment-panel", action: "navigate" }
      ],
      ["How do I request a loan?", "What if I forgot my PIN?", "How do meeting attendance and fines work?"]
    );
  }

  // 5. PIN Change, Reset, & Lockout
  if (/pin|password|reset|forgot|lockout|unlock|code|namba\s+ya\s+siri|nenosiri|nimesahau|kusahau|poteza|kupoteza|sikumbuki|fungua\s+akaunti|msimbo/i.test(lower)) {
    return reply(
      localized(
        `### PIN Security & Recovery\n\n1. **PIN Requirements**: All Jirani Chama accounts require a secure **6 to 12 digit numeric PIN**.\n2. **Forgot PIN**: On the Member Login screen, click **'Forgot PIN?'**. Enter your registered email to receive a 6-digit one-time reset code.\n3. **Upgrading Old PINs**: If you have an older 4-digit PIN, sign in as usual; you will be prompted to set a new 6-digit PIN immediately.\n4. **Account Lockout**: For your security, accounts are temporarily locked for 15 minutes after 5 consecutive incorrect attempts.\n5. **Passkeys**: You can also enroll a Passkey (Fingerprint or Face unlock) in your Profile settings for fast, passwordless login.`,
        `### Usalama na Urejeshaji wa PIN\n\n1. **Mahitaji ya PIN**: Akaunti zote za Jirani Chama zinahitaji PIN salama ya tarakimu **6 hadi 12**.\n2. **Umesahau PIN**: Kwenye ukurasa wa kuingia kwa wanachama, chagua **'Umesahau PIN?'**. Weka barua pepe iliyosajiliwa ili upokee msimbo wa kuweka upya wa tarakimu 6.\n3. **PIN za zamani**: Ikiwa una PIN ya zamani ya tarakimu 4, ingia kama kawaida; utaombwa kuweka PIN mpya ya tarakimu 6 mara moja.\n4. **Akaunti kufungwa kwa muda**: Kwa usalama wako, akaunti hufungwa kwa dakika 15 baada ya kuingiza PIN isiyo sahihi mara 5 mfululizo.\n5. **Passkey**: Unaweza pia kuweka Passkey (alama ya kidole au utambuzi wa uso) kwenye mipangilio ya wasifu ili kuingia bila nenosiri.`
      ),
      [
        { label: "Go to Login", target: "#login", action: "navigate" },
        { label: "Profile Settings", target: "#profile", action: "navigate" }
      ],
      ["How are contributions recorded?", "How do I request a loan?", "Talk to human support"]
    );
  }

  // 6. Meetings, Attendance, & Apologies
  if (/meeting|attendance|absent|register|apology|secretary|mkutano|mahudhurio|kutohudhuria|kuhudhuria|msamaha|katibu/i.test(lower)) {
    return reply(
      localized(
        `### Meeting Attendance & Registers\n\n1. **Attendance Register**: The Chama Secretary records attendance for each scheduled group meeting.\n2. **Status Options**: Members are marked as *Present*, *Absent with Apology*, or *Absent*.\n3. **Excused Absences**: If you cannot attend, notify your Secretary or Chairperson in advance so your apology is recorded.\n4. **Fines for Unexcused Absences**: Fines assessed for unexcused absences appear in your Ledger as outstanding penalties.`,
        `### Mahudhurio ya Mikutano na Rejista\n\n1. **Rejista ya mahudhurio**: Katibu wa chama hurekodi mahudhurio kwa kila mkutano uliopangwa.\n2. **Hali za mahudhurio**: Wanachama huwekwa kuwa *Hapo*, *Hapo kwa udhuru*, au *Hajafika*.\n3. **Udhuru**: Ikiwa huwezi kuhudhuria, mjulishe katibu au mwenyekiti mapema ili udhuru wako urekodiwe.\n4. **Faini za kutohudhuria bila udhuru**: Faini za kutohudhuria bila udhuru huonekana kama deni kwenye taarifa zako za hesabu.`
      ),
      [
        { label: "Check Attendance", target: "#attendance-panel", action: "navigate" },
        { label: "View Ledger", target: "#ledger-panel", action: "navigate" }
      ],
      ["How are late penalties charged?", "How are monthly contributions recorded?", "Talk to human support"]
    );
  }

  // 7. Dividends & Profit Sharing
  if (/dividend|profit|distribution|share\s*capital|payout|gawio|faida|mgawo|hisa/i.test(lower)) {
    return reply(
      localized(
        `### Dividends & Profit Sharing\n\n1. **Calculation**: The Chairperson and Treasurer calculate available dividends based on accumulated interest from loans and Chama earnings.\n2. **Proportionate Share**: Dividends are distributed proportionally according to each member's verified share capital.\n3. **Commitment**: Once reviewed and committed by leadership, dividend payouts are recorded in the Chama ledger.`,
        `### Gawio na Ugawaji wa Faida\n\n1. **Hesabu**: Mwenyekiti na Mweka Hazina huhesabu gawio linalopatikana kutokana na riba ya mikopo na mapato ya chama.\n2. **Mgao kulingana na hisa**: Gawio hugawiwa kulingana na mtaji wa hisa uliothibitishwa wa kila mwanachama.\n3. **Kurekodi**: Baada ya uongozi kukagua na kuidhinisha, malipo ya gawio hurekodiwa kwenye taarifa za hesabu za chama.`
      ),
      [
        { label: "Dividends Overview", target: "#dividend-panel", action: "navigate" },
        { label: "View Ledger", target: "#ledger-panel", action: "navigate" }
      ],
      ["How do I request a loan?", "How are monthly contributions recorded?", "Talk to human support"]
    );
  }

  // 8. Leadership, Roles, & Elections
  if (/chairperson|treasurer|secretary|role|election|leadership|officer|mwenyekiti|mweka\s+hazina|katibu|uongozi|uchaguzi/i.test(lower)) {
    return reply(
      localized(
        `### Chama Roles & Responsibilities\n\n• **Chairperson**: Oversees chama governance, schedules elections, and reviews loan policies.\n• **Secretary**: Manages member invitations, schedules meetings, and records attendance registers.\n• **Treasurer**: Records cash contributions, tracks loan repayments, and manages dividends.\n• **Member**: Makes monthly contributions, participates in meetings, requests loans, and votes in elections.`,
        `### Majukumu ya Viongozi wa Chama\n\n• **Mwenyekiti**: Husimamia uongozi wa chama, hupanga uchaguzi na hukagua sera za mikopo.\n• **Katibu**: Husimamia mialiko ya wanachama, hupanga mikutano na kurekodi mahudhurio.\n• **Mweka Hazina**: Hurekodi michango ya pesa taslimu, hufuatilia marejesho ya mikopo na kusimamia gawio.\n• **Mwanachama**: Huchangia kila mwezi, hushiriki mikutano, huomba mikopo na kupiga kura kwenye uchaguzi.`
      ),
      [
        { label: "Help & Guide", target: "#help-panel", action: "navigate" }
      ],
      ["How do I request a loan?", "How are monthly contributions recorded?", "Talk to human support"]
    );
  }

  // 9. Human Support Escalation
  if (/human|agent|person|ticket|representative|operator|support\s*staff|contact|msaada|mhudumu|wakala|mtu|zungumza|wasiliana|huduma\s+kwa\s+wateja/i.test(lower)) {
    return reply(
      localized(
        `### Connect with Human Support\n\nOur human support agents are ready to assist you directly!\n\nYou can submit a support ticket detailing your issue, attach photos or receipts, and communicate directly with designated staff.`,
        `### Wasiliana na Mhudumu wa Msaada\n\nWahudumu wetu wako tayari kukusaidia moja kwa moja.\n\nWasilisha ombi la msaada ukieleza tatizo lako. Unaweza kuambatisha picha au risiti na kuwasiliana moja kwa moja na wafanyakazi husika.`
      ),
      [
        { label: "Submit Support Ticket", target: "#support-panel", action: "open_ticket" },
        { label: "Browse FAQs", target: "#faq-panel", action: "navigate" }
      ],
      ["How do I request a loan?", "How are monthly contributions recorded?", "What if I forgot my PIN?"]
    );
  }

  // 10. Check FAQs for keyword match
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

  // 11. General fallback
  return reply(
    localized(
      `I couldn't find an exact match for your question, but I am here to help!\n\nHere are some common topics I can assist with:\n\n• **Loans**: Ask *"How do I request a loan?"*\n• **Contributions**: Ask *"How are contributions recorded?"*\n• **PIN & Security**: Ask *"How do I reset my PIN?"*\n• **Meetings**: Ask *"How does attendance work?"*\n\nIf you have a specific inquiry or need account assistance, you can also submit a ticket to our human support team.`,
      `Sijaweza kupata jibu linalolingana kabisa na swali lako, lakini niko hapa kukusaidia.\n\nNaweza kusaidia kuhusu:\n\n• **Mikopo**: Uliza *"Ninawezaje kuomba mkopo?"*\n• **Michango**: Uliza *"Michango hurekodiwaje?"*\n• **PIN na usalama**: Uliza *"Ninawezaje kuweka upya PIN yangu?"*\n• **Mikutano**: Uliza *"Mahudhurio hufuatiliwaje?"*\n\nIkiwa unahitaji msaada kuhusu akaunti yako, unaweza pia kuwasilisha ombi kwa timu yetu ya msaada.`
    ),
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
