"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const frontend = path.join(__dirname, "..", "..", "en public");
const reactSource = path.join(frontend, "react", "src");
const html = fs.readFileSync(path.join(frontend, "index.html"), "utf8");
const script = fs.readFileSync(path.join(frontend, "chama.js"), "utf8");
const css = fs.readFileSync(path.join(frontend, "chama.css"), "utf8");
const landingTheme = fs.readFileSync(path.join(frontend, "landing-theme.css"), "utf8");
const profileReactShell = fs.readFileSync(path.join(frontend, "react", "profile.html"), "utf8");
const profilePage = fs.readFileSync(path.join(reactSource, "pages", "ProfilePage.jsx"), "utf8");
const profileModeSource = fs.readFileSync(path.join(reactSource, "profileMode.mjs"), "utf8");
const registerHtml = fs.readFileSync(path.join(frontend, "register.html"), "utf8");
const legacyRegisterScript = fs.readFileSync(path.join(frontend, "register.js"), "utf8");
const registerReactShell = fs.readFileSync(path.join(frontend, "react", "register.html"), "utf8");
const registerPage = fs.readFileSync(path.join(reactSource, "pages", "RegisterPage.jsx"), "utf8");
const registerActions = fs.readFileSync(path.join(reactSource, "registrationActions.mjs"), "utf8");
const memberLoginReactShell = fs.readFileSync(path.join(frontend, "react", "member-login.html"), "utf8");
const memberLoginHtml = fs.readFileSync(path.join(frontend, "member-login.html"), "utf8");
const legacyAuthScript = fs.readFileSync(path.join(frontend, "auth-pages.js"), "utf8");
const memberLoginPage = fs.readFileSync(path.join(reactSource, "pages", "MemberLoginPage.jsx"), "utf8");
const authActions = fs.readFileSync(path.join(reactSource, "authActions.mjs"), "utf8");
const chatPage = fs.readFileSync(path.join(reactSource, "components", "ChatPanel.jsx"), "utf8");
const chatActions = fs.readFileSync(path.join(reactSource, "chatActions.mjs"), "utf8");
const financePage = fs.readFileSync(path.join(reactSource, "components", "FinancialOverview.jsx"), "utf8");
const financeActions = fs.readFileSync(path.join(reactSource, "financeActions.mjs"), "utf8");
const loansPage = fs.readFileSync(path.join(reactSource, "components", "LoansPanel.jsx"), "utf8");
const loanActions = fs.readFileSync(path.join(reactSource, "loanActions.mjs"), "utf8");
const ledgerPage = fs.readFileSync(path.join(reactSource, "components", "LedgerPanel.jsx"), "utf8");
const ledgerActions = fs.readFileSync(path.join(reactSource, "ledgerActions.mjs"), "utf8");
const memberDirectory = fs.readFileSync(path.join(reactSource, "components", "MemberDirectory.jsx"), "utf8");
const memberActions = fs.readFileSync(path.join(reactSource, "memberActions.mjs"), "utf8");
const monthClosePage = fs.readFileSync(path.join(reactSource, "components", "MonthClosePanel.jsx"), "utf8");
const monthCloseActions = fs.readFileSync(path.join(reactSource, "monthCloseActions.mjs"), "utf8");
const auditPage = fs.readFileSync(path.join(reactSource, "components", "AuditLogPanel.jsx"), "utf8");
const auditActions = fs.readFileSync(path.join(reactSource, "auditActions.mjs"), "utf8");
const penaltyPage = fs.readFileSync(path.join(reactSource, "components", "PenaltyPanel.jsx"), "utf8");
const dividendsPage = fs.readFileSync(path.join(reactSource, "components", "DividendsPanel.jsx"), "utf8");
const adminFinanceActions = fs.readFileSync(path.join(reactSource, "adminFinanceActions.mjs"), "utf8");
const cashEntryPage = fs.readFileSync(path.join(reactSource, "components", "CashEntryPanel.jsx"), "utf8");
const cashEntryActions = fs.readFileSync(path.join(reactSource, "cashEntryActions.mjs"), "utf8");
const invitePanel = fs.readFileSync(path.join(reactSource, "components", "InviteMemberPanel.jsx"), "utf8");
const invitationActions = fs.readFileSync(path.join(reactSource, "invitationActions.mjs"), "utf8");
const simulatedInbox = fs.readFileSync(path.join(reactSource, "components", "SimulatedPaymentInbox.jsx"), "utf8");
const simulatedPaymentActions = fs.readFileSync(path.join(reactSource, "simulatedPaymentActions.mjs"), "utf8");
const i18n = fs.readFileSync(path.join(frontend, "i18n.js"), "utf8");
const contactScript = fs.readFileSync(path.join(frontend, "contact.js"), "utf8");

function fakeControl(initial = {}) {
  const listeners = new Map();
  return {
    hidden: false,
    disabled: false,
    textContent: "",
    value: "",
    open: false,
    dataset: {},
    addEventListener(type, listener) {
      const group = listeners.get(type) || [];
      group.push(listener);
      listeners.set(type, group);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) listener(event);
    },
    getHandler(type) { return (listeners.get(type) || [])[0]; },
    showModal() { this.open = true; },
    close() { this.open = false; },
    focus() { this.focused = true; },
    querySelector: () => null,
    querySelectorAll: () => [],
    ...initial,
  };
}

test("launch-critical invitation, election, and cash copy is accurate in English and Kiswahili", () => {
  for (const message of [
    "The Chairperson or Secretary can invite Members directly.",
    "After setup, officers are selected through secret-ballot elections.",
    "After setup, the Secretary proposes officer candidates. Eligible group accounts vote by secret ballot; the Chairperson opens and closes voting and verifies the result. Verified changes take effect after 24 hours.",
    "This records cash already received; it does not transfer money."
  ]) {
    assert.ok(html.includes(message) || cashEntryPage.includes(message), `expected English UI copy: ${message}`);
    const escaped = message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(i18n, new RegExp(`"${escaped}":\\s*"[^"]+"`), `expected Kiswahili translation for: ${message}`);
  }
});

test("Kiswahili switch translates keyed text and attributes, then restores English", () => {
  const makeElement = ({ key, text, attributes = {} }) => {
    const textNode = text === undefined ? null : { nodeType: 3, nodeValue: text };
    const element = {
      dataset: key ? { i18n: key } : {},
      childNodes: textNode ? [textNode] : [],
      textContent: text || "",
      attributes: { ...attributes },
      querySelectorAll: () => [],
      getAttribute(name) {
        if (name.startsWith("data-i18n-")) return this.dataset[`i18n${name.slice(10).replace(/(^|-)([a-z])/g, (_, _dash, char) => char.toUpperCase())}`] || null;
        return this.attributes[name] ?? null;
      },
      setAttribute(name, value) { this.attributes[name] = value; }
    };
    return { element, textNode };
  };
  const keyed = makeElement({ key: "date", text: "Date" });
  const placeholder = makeElement({ attributes: { placeholder: "e.g. Cash received at the weekly meeting" } });
  placeholder.element.dataset.i18nPlaceholder = "cashNotePlaceholder";
  const accessible = makeElement({ attributes: { "aria-label": "Financial views" } });
  accessible.element.dataset.i18nAriaLabel = "financialViews";
  const elements = [keyed.element, placeholder.element, accessible.element];
  const root = { lang: "en", querySelectorAll: selector => selector.includes("data-i18n") ? elements : [] };
  const document = {
    documentElement: root,
    querySelector: () => null,
    querySelectorAll: () => [],
    createTreeWalker: () => ({ nextNode: () => false }),
    addEventListener: () => {}
  };
  const storage = new Map();
  const window = { dispatchEvent: () => {} };
  const sandbox = { window, document, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) }, NodeFilter: { SHOW_TEXT: 4 }, CustomEvent: function CustomEvent() {} };
  vm.runInNewContext(i18n, sandbox);

  window.jiraniI18n.setLanguage("sw");
  assert.equal(keyed.textNode.nodeValue, "Tarehe");
  assert.equal(placeholder.element.getAttribute("placeholder"), "mf. Pesa taslimu iliyopokelewa kwenye mkutano wa wiki");
  assert.equal(accessible.element.getAttribute("aria-label"), "Mionekano ya fedha");
  assert.equal(window.jiraniI18n.translateText("View profile"), "Tazama wasifu");
  assert.equal(window.jiraniI18n.roleName("treasurer"), "Mweka Hazina");
  const pageSources = [html, profilePage, registerPage, memberLoginPage];
  const hookKeys = [...new Set(pageSources.flatMap(source => [...source.matchAll(/data-i18n(?:-placeholder|-aria-label)?="([^"]+)"/g)].map(match => match[1])))];
  for (const key of hookKeys) assert.notEqual(window.jiraniI18n.t(key), key, `missing translation for keyed hook: ${key}`);
  window.jiraniI18n.setLanguage("en");
  assert.equal(keyed.textNode.nodeValue, "Date");
  assert.equal(placeholder.element.getAttribute("placeholder"), "e.g. Cash received at the weekly meeting");
  assert.equal(accessible.element.getAttribute("aria-label"), "Financial views");
});

test("profile and sign-in pages load the shared language switch", () => {
  assert.match(profileReactShell, /<div id="root"><\/div>/);
  assert.match(profilePage, /id="language-switch"/);
  assert.match(memberLoginReactShell, /<div id="root"><\/div>/);
  assert.match(memberLoginPage, /id="language-switch"/);
  assert.match(registerReactShell, /<div id="root"><\/div>/);
  assert.match(registerPage, /id="language-switch"/);
  assert.match(memberLoginPage, /error instanceof TypeError/);
  assert.match(registerPage, /translate\(message\)/);
  assert.match(profilePage, /translate\("Uploading profile icons…"\)/);
});

test("Kiswahili switch translates new-chama registration copy and restores English", () => {
  const strings = [
    "Register a new chama | Jirani Chama", "GROUP SAVINGS", "Language", "Start a new chama",
    "Register your group and create the chairperson account. You will be signed in when setup is complete.",
    "This instance is already set up",
    "To create a separate chama, open this app on a separate instance connected to an empty database. This instance’s existing records will remain unchanged.",
    "Sign in to this instance", "Chama and chairperson details",
    "All fields are required. Your PIN must have 6 to 12 digits.", "Chama name", "Chairperson full name",
    "Phone number", "Email address", "Financial rules",
    "These defaults can be changed for this chama. They are enforced by the server.",
    "Monthly contribution due by day", "Monthly welfare contribution (KES)",
    "Late contribution penalty (KES)", "Monthly loan interest (%)", "Create PIN", "Register chama",
    "Back to home", "Chama registered",
    "Your chairperson account is ready. Continue to your chama dashboard.", "Open dashboard"
  ];
  const nodes = strings.map(value => ({ nodeType: 3, nodeValue: value, parentElement: { tagName: "P", closest: () => null } }));
  const root = { lang: "en", querySelectorAll: () => [] };
  const document = {
    documentElement: root,
    querySelector: () => null,
    querySelectorAll: () => [],
    createTreeWalker: () => {
      let currentIndex = -1;
      return {
        nextNode() {
          if (currentIndex + 1 >= nodes.length) return false;
          this.currentNode = nodes[++currentIndex];
          return true;
        }
      };
    },
    addEventListener: () => {}
  };
  const storage = new Map();
  const sandbox = {
    window: { dispatchEvent: () => {} },
    document,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    NodeFilter: { SHOW_TEXT: 4 },
    CustomEvent: function CustomEvent() {}
  };
  vm.runInNewContext(i18n, sandbox);

  sandbox.window.jiraniI18n.setLanguage("sw");
  for (let index = 0; index < strings.length; index++) {
    assert.notEqual(nodes[index].nodeValue, strings[index], `registration copy was not translated: ${strings[index]}`);
  }
  assert.match(registerPage, /<option value="en" data-i18n="englishOption">English<\/option>/);
  assert.match(registerPage, /<option value="sw" data-i18n="swahili">Kiswahili<\/option>/);
  assert.match(registerPage, /href="\/member-login\.html" data-i18n="memberLogin">Member Login<\/a>/);
  assert.match(registerPage, /data-i18n-aria-label="newChamaRegistration"/);

  sandbox.window.jiraniI18n.setLanguage("en");
  assert.deepEqual(nodes.map(node => node.nodeValue), strings);
});

test("all page backgrounds use a subdued blend of the logo colors", () => {
  for (const color of [
    "rgba(83, 101, 168, .12)",
    "rgba(200, 85, 61, .09)",
    "rgba(125, 154, 120, .12)",
    "rgba(224, 165, 38, .09)"
  ]) assert.match(css, new RegExp(color.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(css, /body\s*\{[\s\S]*?background-color:\s*#f3f1eb/);
  assert.match(css, /\.login-overlay\s*\{[\s\S]*?background-color:\s*#f3f1eb/);
});

test("landing page uses muted color backgrounds without photos", () => {
  assert.match(css, /\.login-overlay::before\s*\{[\s\S]*?background-image:\s*linear-gradient/);
  assert.match(css, /\.login-overlay \.landing-sections-container\s*\{[\s\S]*?background-image:\s*linear-gradient/);
  assert.match(css, /\.login-overlay > \*\s*\{[\s\S]*?z-index:\s*1/);
  assert.doesNotMatch(css, /chama-(?:hero|community)-background\.webp/);
});

test("public landing design system is scoped to signed-out mode and has a distinct responsive hierarchy", () => {
  assert.match(html, /<body class="landing-mode">/);
  assert.match(html, /href="\/landing-theme\.css\?v=20261112\.1"/);
  assert.match(landingTheme, /body\.landing-mode\s*\{[\s\S]*?--forest:\s*#153d33/);
  assert.match(landingTheme, /body\.landing-mode \.topbar\s*\{[\s\S]*?background:\s*var\(--forest\)/);
  assert.match(landingTheme, /body\.landing-mode \.login-brand\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(landingTheme, /body\.landing-mode \.login-brand h1\s*\{[\s\S]*?font-family:\s*Georgia/);
  assert.match(landingTheme, /body\.landing-mode \.login-brand::before[\s\S]*?background:\s*linear-gradient\(var\(--gold\)/);
  assert.match(landingTheme, /body\.landing-mode #login \.landing-sections-container\s*\{[\s\S]*?gap:\s*0/);
  assert.match(landingTheme, /body\.landing-mode #features \.features-grid[\s\S]*?grid-template-columns:\s*repeat\(3/);
  assert.match(landingTheme, /body\.landing-mode #security\.landing-section\s*\{/);
  assert.match(landingTheme, /body\.landing-mode #pricing\.landing-section\s*\{/);
  assert.match(landingTheme, /body\.landing-mode #faq details\s*\{/);
  assert.match(landingTheme, /body\.landing-mode #contact \.contact-shell\s*\{/);
  assert.match(landingTheme, /body\.landing-mode #pricing-modal\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(landingTheme, /font-size:\s*clamp\(30px, 4vw, 43px\) !important;/);
  assert.match(landingTheme, /body\.landing-mode \.pricing-amount\s*\{[^}]*font-size:\s*clamp\(27px, 3vw, 34px\) !important;/);
  assert.match(landingTheme, /body\.landing-mode #pricing-modal\s*\{\s*position:\s*fixed !important;[\s\S]*?transform:\s*translate\(-50%, -50%\) !important;/);
  assert.match(landingTheme, /@media \(max-width: 600px\)[\s\S]*?body\.landing-mode #pricing-modal\s*\{[\s\S]*?top:\s*calc\(50% \+ 32px\) !important;[\s\S]*?max-height:\s*calc\(100dvh - 88px\)/);
  assert.match(landingTheme, /@media \(max-width: 900px\)/);
  assert.match(landingTheme, /@media \(max-width: 600px\)/);
  assert.match(landingTheme, /@media \(max-width: 390px\)/);
  assert.match(script, /document\.body\.classList\.remove\("landing-mode"\)/);
  assert.match(script, /document\.body\.classList\.add\("landing-mode"\)/);
});

test("landing features and FAQs distinguish chat, monthly close, approvals, penalties, and money handling", () => {
  assert.equal((html.match(/class="feature-card"/g) || []).length, 6);
  assert.match(html, /data-i18n="landingMonthCloseTitle"/);
  assert.match(html, /data-i18n="landingChatTitle"/);
  assert.match(landingTheme, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important/);
  assert.match(landingTheme, /@media \(max-width: 900px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(landingTheme, /@media \(max-width: 600px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(html, /data-i18n="faqMonthCloseAnswer"/);
  assert.match(html, /data-i18n="faqChatAnswer"/);
  assert.match(html, /data-i18n="faqCorrectionAnswer"/);
  assert.match(html, /data-i18n="faqMoneyAnswer"/);
  assert.doesNotMatch(html, /Two-step approvals|Every action is recorded/);
  assert.match(i18n, /landingMonthCloseTitle: "A clearer month-end close"/);
  assert.match(i18n, /landingMonthCloseTitle: "Hitimisho la mwezi lililo wazi zaidi"/);
  assert.match(i18n, /faqPenaltyAnswer: "[^"]*manual, not automatic\./);
  assert.match(i18n, /faqSecurityAnswer: "[^"]*not tamper-evident/);
  assert.match(i18n, /faqMoneyAnswer: "No\.[^"]*does not collect or disburse funds/);
});

test("landing footer remains reachable inside the scrollable sign-in overlay", () => {
  assert.match(html, /<section class="login-overlay" id="login"[\s\S]*?<footer class="site-footer">[\s\S]*?<\/footer>\s*<\/section>/);
  assert.match(css, /\.login-overlay\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /#login\.login-overlay\s*\{\s*align-content:\s*start;\s*\}/);
  assert.match(css, /#login\.login-overlay > \.site-footer\s*\{[\s\S]*?width:\s*calc/);
});

test("landing pricing presents capped tiers and transparent enquiries without initiating payment", () => {
  assert.match(html, /<section id="pricing"[^>]*aria-labelledby="pricing-title"/);
  assert.match(html, /<h3 id="basic-plan-title">Basic<\/h3>/);
  assert.match(html, /Up to 10 members/);
  assert.match(html, /KSh 300<span>\/month<\/span>/);
  assert.match(html, /Annual: KSh 2,880\/year — save KSh 720 \(KSh 240\/month equivalent\)\./);
  assert.match(html, /data-pricing-tier="Basic" data-member-cap="Up to 10 members" data-pricing-billing="Monthly"/);
  assert.match(html, /data-pricing-tier="Basic" data-member-cap="Up to 10 members" data-pricing-billing="Annual"/);
  assert.match(html, /<h3 id="growth-plan-title">Growth Chama<\/h3>/);
  assert.match(html, /Up to 30 members/);
  assert.match(html, /KSh 600<span>\/month<\/span>/);
  assert.match(html, /Annual: KSh 5,760\/year — save KSh 1,440 \(KSh 480\/month equivalent\)\./);
  assert.match(html, /data-pricing-tier="Growth Chama" data-member-cap="Up to 30 members" data-pricing-billing="Monthly"/);
  assert.match(html, /<h3 id="enterprise-plan-title">Enterprise \/ Investment<\/h3>/);
  assert.match(html, /Custom member caps for groups above 30 members/);
  assert.match(html, /Custom pricing<span>Contact us<\/span>/);
  assert.match(html, /data-pricing-tier="Enterprise \/ Investment" data-member-cap="Custom member cap for groups above 30 members" data-pricing-billing="Custom" data-pricing-price="Custom pricing — Contact sales"/);
  assert.match(html, /id="pricing-modal"[^>]*aria-labelledby="pricing-modal-title"/);
  for (const id of ["pricing-modal-tier", "pricing-modal-cap", "pricing-modal-billing", "pricing-modal-total", "pricing-modal-savings"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /Online subscription payments are temporarily paused/);
  assert.match(html, /selecting a plan will not start checkout, request payment, change subscription status, or affect existing access/);
  for (const id of ["pricing-reference-panel", "pricing-modal-reference", "pricing-copy-reference", "pricing-reference-copy-status"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /id="pricing-contact"[^>]*href="#contact">Contact us about this plan/);
  assert.match(script, /async function openPricingModal\(button\)/);
  const pricingModalSource = script.match(/async function openPricingModal\(button\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(pricingModalSource, "pricing modal opener is present");
  assert.match(script, /const SUBSCRIPTION_PAYMENTS_ENABLED = false;/);
  const pauseIndex = pricingModalSource.indexOf("if (!SUBSCRIPTION_PAYMENTS_ENABLED) return;");
  const selectionRequestIndex = pricingModalSource.indexOf('api("/api/subscription/selection"');
  assert.ok(pauseIndex >= 0 && pauseIndex < selectionRequestIndex, "the pause guard returns before the plan-selection request");
  assert.match(pricingModalSource.slice(0, pauseIndex), /temporarily paused/);
  assert.match(pricingModalSource, /button\.dataset\.pricingTier/);
  assert.match(pricingModalSource, /button\.dataset\.memberCap/);
  assert.match(pricingModalSource, /state\.user\.role !== "chairperson"/);
  assert.match(pricingModalSource, /api\("\/api\/subscription\/selection"/);
  assert.match(pricingModalSource, /write:\s*button/);
  assert.match(pricingModalSource, /paymentEnabled === false/);
  assert.match(pricingModalSource, /paymentRequestStarted === false/);
  assert.match(pricingModalSource, /JC\[A-F0-9\]\{12\}/);
  assert.match(script, /document\.querySelectorAll\("\[data-pricing-tier\]"\)/);
  assert.match(pricingModalSource, /dialog\.showModal\(\)/);
  assert.match(html, /<h2 id="pricing-modal-title" tabindex="-1">Review your plan<\/h2>/);
  assert.ok(pricingModalSource.includes("dialog.scrollTop = 0;"));
  assert.ok(pricingModalSource.includes('$("#pricing-modal-title")?.focus({ preventScroll: true });'));
  assert.doesNotMatch(pricingModalSource, /api\("\/api\/mpesa\//);
  assert.doesNotMatch(pricingModalSource, /fetch\(/);
  assert.match(css, /\.pricing-grid\s*\{/);
  assert.match(css, /\.pricing-card-featured\s*\{\s*border: 2px solid var\(--green\)/);
});

test("subscription UI remains informational while server access is not subscription-gated", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.doesNotMatch(server, /SUBSCRIPTION_TRIAL_DAYS/);
  assert.match(server, /function unpaidSubscription/);
  assert.match(server, /function requireActiveSubscription/);
  assert.match(server, /app\.post\("\/api\/invitations"[\s\S]*?requireActiveSubscription/);
  assert.match(server, /app\.post\("\/api\/payments"[\s\S]*?requireActiveSubscription/);
  assert.match(server, /function memberCapFor\(source, chamaId\) \{\s+return null;/);
  assert.match(server, /app\.post\("\/api\/loans\/:id\/decisions"[\s\S]*?requireActiveSubscription/);
  assert.match(server, /app\.post\("\/api\/mpesa\/callback"[\s\S]*?STK payment requests are not implemented/);
  assert.match(server, /app\.post\("\/api\/mpesa\/c2b\/validation"/);
  assert.match(server, /app\.post\("\/api\/mpesa\/c2b\/confirmation"/);
  assert.match(html, /That assessment is manual, not automatic/);
  assert.match(html, /Clicking a plan or reporting that you paid never activates access/);
  assert.match(html, /Your financial history remains available to view and export/);
  assert.match(html, /New financial records, member invitations, loan decisions, and other subscription-gated actions are blocked for unpaid or expired groups/);
  assert.match(html, /href="\/privacy\.html"/);
  assert.match(html, /href="\/terms\.html"/);
  assert.match(html, /id="landing-menu-toggle"/);
  assert.match(script, /landingMenuToggle\?\.addEventListener/);
});

test("landing navigation uses an icon-only hamburger with accessible open and close labels", () => {
  const button = html.match(/<button id="landing-menu-toggle"[\s\S]*?<\/button>/)?.[0];
  assert.ok(button, "landing navigation toggle should exist");
  assert.equal((button.match(/<span class="ham-bar" aria-hidden="true"><\/span>/g) || []).length, 3);
  assert.match(button, /aria-label="Open landing navigation"/);
  assert.match(button, /data-i18n-aria-label="landingNavOpen"/);
  assert.doesNotMatch(button, /data-i18n="landingNavMenu"|>\s*Menu\s*<\/button>/);
  assert.match(script, /landingMenuToggle\.setAttribute\("aria-expanded", String\(open\)\)/);
  assert.match(script, /landingMenuToggle\.setAttribute\("aria-label", t\(open \? "landingNavClose" : "landingNavOpen"\)\)/);
  assert.doesNotMatch(script, /landingMenuToggle(?:\?)*\.textContent\s*=/);
  assert.match(landingTheme, /body\.landing-mode \.landing-menu-toggle \.ham-bar\s*\{[^}]*background:\s*var\(--paper\)/);
});

test("React loan UI remains available while officer-role revocation stays protected", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(html, /id="react-loan-request-root"/);
  assert.match(html, /id="react-loans-root"/);
  assert.match(loansPage, /id="loan-submit" className="button-primary" type="submit"/);
  assert.match(loansPage, /requestLoanEstimate\(/);
  assert.match(loansPage, /loan\.canRequestHumanReview/);
  assert.doesNotMatch(loansPage, /recordLoanDecision|decideLoans/);
  assert.doesNotMatch(script, /updateLoanRequestAccess|\$\("#loan-form"\)|\$\("#loans"\)/);
  assert.match(script, /chama:dashboard-refresh-requested/);
  assert.match(server, /app\.post\("\/api\/loans", requireAuth, requirePinChanged, requireActiveSubscription/);
  assert.match(server, /app\.post\("\/api\/leadership-changes\/:id\/revoke", requireAuth, requirePinChanged, requireRole\("chairperson"\), idempotent/);
  assert.doesNotMatch(server, /app\.post\("\/api\/leadership-changes\/:id\/revoke"[^\n]*requireActiveSubscription/);
  assert.match(html, /data-i18n="roleRevocationSecurityException"/);
  assert.match(i18n, /roleRevocationSecurityException:\s*"For account security, chairpersons can still revoke an officer role\."/);
  assert.match(i18n, /roleRevocationSecurityException:\s*"Kwa usalama wa akaunti/);
});

test("member roster and invitation history are distinct, normalized, and phone-friendly", () => {
  assert.match(html, /id="react-member-directory-root"/);
  assert.match(memberDirectory, /id="active-members-title"[\s\S]*?id="members"/);
  assert.match(memberDirectory, /id="member-history-title"[\s\S]*?id="member-invitation-history"/);
  assert.match(memberDirectory, /activeMembers = members\.filter\(member => String\(member\.status \|\| ""\)\.toLowerCase\(\) === "active"\)/);
  assert.match(memberDirectory, /inactiveMembers = members\.filter\(member => String\(member\.status \|\| ""\)\.toLowerCase\(\) !== "active"\)/);
  assert.match(memberActions, /const statusKey = revoked \? "revokedStatus"/);
  assert.match(memberActions, /canUndoInvitation/);
  assert.doesNotMatch(script, /memberStatusPresentation|activeMemberRows|member-invitation-history|data-revoke-invitation|data-revoke-role/);
  assert.match(i18n, /activeStatus:\s*"Active"/);
  assert.match(i18n, /activeStatus:\s*"Hai"/);
  assert.match(css, /#members-panel \.members-table td \{ display: grid; grid-template-columns/);
  assert.match(css, /@media \(max-width: 700px\) \{[\s\S]*?#members-panel \.members-table tr \{ display: block/);
  assert.match(css, /#members-panel \.members-table td \.mini-btn \{ max-width: 100%; min-height: 44px/);
});

test("Contributions navigation opens the appropriate contribution history view", () => {
  assert.match(html, /href="#group-contributions-title" data-panel="overview" data-contributions-link data-i18n="contributionsNav"/);
  assert.match(script, /const contributionsLink = event\.target\.closest\("a\[data-contributions-link\]"\)/);
  assert.match(script, /showAppPage\("overview", \{ scrollTarget: targetId \}\)/);
  assert.match(script, /function showAppPage\(panelId, \{ scrollTarget \} = \{\}\)/);
  assert.match(i18n, /contributionsNav:\s*"Contributions"/);
  assert.match(i18n, /contributionsNav:\s*"Michango"/);
});

test("landing contact section offers accessible localized routes for members and new groups", () => {
  const sectionStart = html.indexOf('<section id="contact"');
  const sectionEnd = html.indexOf('</section>', sectionStart) + '</section>'.length;
  const contact = sectionStart >= 0 && sectionEnd >= '</section>'.length ? html.slice(sectionStart, sectionEnd) : "";
  assert.ok(html.includes('href="#contact" class="topbar-nav-link" data-i18n="getInTouchNav">Get in touch</a>'));
  assert.ok(contact.includes('aria-labelledby="get-in-touch"'));
  assert.ok(contact.includes('<h2 id="get-in-touch" data-i18n="getInTouchTitle">Get in touch</h2>'));
  assert.ok(contact.includes('id="contact-form"'));
  for (const field of ["name", "email", "subject", "message"]) assert.match(contact, new RegExp(`name="${field}"`));
  assert.ok(contact.includes('id="contact-feedback" class="contact-feedback" role="status" aria-live="polite"'));
  assert.ok(contact.includes('href="mailto:09elim3@gmail.com"'));
  assert.ok(contact.includes('href="/member-login.html"'));
  assert.ok(contact.includes('href="/register.html"'));
  assert.match(html, /src="\/contact\.js\?v=/);
  assert.match(contactScript, /fetch\("\/api\/contact"/);
  assert.match(contactScript, /if \(!response\.ok\)/);
  assert.doesNotMatch(contactScript, /SMTP_(?:USER|PASS|HOST)/);
  assert.ok(css.includes('#contact .contact-shell {'));
  assert.ok(css.includes('#contact .contact-form-fields {'));
  assert.ok(css.includes('#contact .contact-submit:focus-visible,'));
  assert.ok(css.includes('@media (max-width: 760px)'));
  assert.match(i18n, /contactDescription: \["Tell us how we can help\./);
  assert.match(i18n, /contactDescription:[^\n]*Tuambie jinsi/);
});

test("simulated payment inbox is clearly local-only and exposes the test fields", () => {
  assert.match(html, /id="simulated-payment-section"/);
  assert.match(html, /id="react-simulated-payment-root"/);
  assert.match(simulatedInbox, /Use fake TEST-\* values only\. This does not connect to M-Pesa or any payment provider\. Saving a simulation never changes a balance\./);
  for (const field of ["transactionId", "phoneNumber", "amount", "reference", "timestamp"]) {
    assert.match(simulatedInbox, new RegExp(`name="${field}"`));
  }
  assert.match(simulatedInbox, /rawPayload/);
  assert.match(simulatedPaymentActions, /path: "\/api\/payments\/simulate"/);
  assert.match(script, /simulatedPayments: state\.simulatedPayments \|\| \[\]/);
  assert.doesNotMatch(script, /renderSimulatedPaymentInbox|#simulated-payment-form|#simulated-payment-rows/);
});

test("loan status labels use the agreed title case and group pending decision states in React", () => {
  assert.match(loanActions, /\["pending", "requested", "waiting for decisions"\]\.includes\(normalized\)/);
  assert.match(loanActions, /label: "Pending", className: "pending"/);
  assert.match(loansPage, /loanStatusPresentation\(loan\.status\)/);
});

test("Chairperson setup checklist reflects active members and valid invitations", () => {
  const source = script.match(/function chairpersonChecklistItems\(members, invitations, overviewReviewed\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, "checklist completion helper is present");
  const sandbox = { Date };
  vm.runInNewContext(`${source}; this.chairpersonChecklistItems = chairpersonChecklistItems;`, sandbox);
  const invitation = (requestedRole, overrides = {}) => ({ requestedRole, expiresAt: new Date(Date.now() + 60_000).toISOString(), usedAt: null, revocation: null, ...overrides });
  const items = sandbox.chairpersonChecklistItems(
    [{ role: "chairperson", status: "active" }],
    [invitation("secretary"), invitation("treasurer", { revocation: { at: new Date().toISOString() } }), invitation("member")],
    true
  );
  assert.deepEqual(JSON.parse(JSON.stringify(items.map(({ key, complete }) => [key, complete]))), [
    ["secretary", true], ["treasurer", false], ["members", true], ["overview", true]
  ]);
  assert.match(html, /id="chairperson-setup-checklist"[^>]*hidden/);
  assert.match(script, /openButton\.hidden = !isChairperson/);
  assert.ok((i18n.match(/setupChecklistTitle:/g) || []).length === 2, "checklist title is available in English and Kiswahili");
});

test("standalone member login posts credentials to the login API", () => {
  assert.match(memberLoginReactShell, /<div id="root"><\/div>/);
  assert.doesNotMatch(memberLoginReactShell, /auth-pages\.js/);
  assert.match(memberLoginReactShell, /src="\/src\/main\.jsx"/);
  assert.match(memberLoginPage, /<form id="login-form"/);
  assert.match(memberLoginPage, /name="phone" type="tel" autoComplete="tel"/);
  assert.match(memberLoginPage, /name="pin" type=\{pinVisible \? "text" : "password"\}/);
  assert.match(memberLoginPage, /id="show-forgot-pin"/);
  assert.match(memberLoginPage, /id="forgot-pin-form"/);
  assert.match(memberLoginPage, /id="reset-pin-form"/);
  assert.match(memberLoginPage, /setChamaChoices\(result\.chooseChamaId\)/);
  assert.match(memberLoginPage, /window\.location\.assign\("\/"\)/);
  assert.match(memberLoginPage, /id="activate-code"[^>]*autoComplete="one-time-code"/);
  assert.match(memberLoginPage, /id="activate-pin"[^>]*autoComplete="new-password"/);
  assert.match(memberLoginPage, /name="termsAccepted" type="checkbox" value="true" required/);
  assert.match(memberLoginHtml, /name="termsAccepted" type="checkbox" value="true" required/);
  assert.match(memberLoginPage, /name="privacyNoticeAcknowledged" type="checkbox" value="true" required/);
  assert.match(memberLoginHtml, /name="privacyNoticeAcknowledged" type="checkbox" value="true" required/);
  assert.match(memberLoginPage, /<dialog id="activate-age-dialog"/);
  assert.match(memberLoginPage, /onCancel=\{event => event\.preventDefault\(\)\}/);
  assert.match(memberLoginPage, /hidden=\{view !== "activate" \|\| !activationAllowed\}/);
  assert.match(memberLoginPage, /ageConfirmed === "true" \? "true" : ""/);
  assert.doesNotMatch(memberLoginPage, /name="ageConfirmed" type="radio"/);
  assert.match(memberLoginPage, /disabled=\{busy === "activation" \|\| ageConfirmed !== "true"\}/);
  assert.match(memberLoginPage, /values\.ageConfirmed !== "true"/);
  assert.match(memberLoginPage, /role="alert" aria-live="assertive"/);
  assert.match(memberLoginHtml, /<dialog id="activate-age-dialog"/);
  assert.match(memberLoginHtml, /name="ageConfirmed" type="hidden" value=""/);
  assert.doesNotMatch(memberLoginHtml, /name="ageConfirmed" type="radio"/);
  assert.match(legacyAuthScript, /values\.ageConfirmed !== "true"/);
  assert.match(legacyAuthScript, /activationAgeConfirmed\.value = "true"/);
  assert.match(legacyAuthScript, /activationAgeDialog\.addEventListener\("cancel", event => event\.preventDefault\(\)\)/);
  assert.match(authActions, /postJson\("\/api\/login"/);
  assert.match(authActions, /postJson\("\/api\/forgot-pin"/);
  assert.match(authActions, /postJson\("\/api\/reset-pin"/);
  assert.match(authActions, /postJson\("\/api\/invitations\/activate"/);
  assert.match(authActions, /method:\s*"POST"/);
  assert.match(authActions, /credentials:\s*"same-origin"/);
  assert.match(authActions, /"X-Requested-With":\s*"chama"/);
  assert.match(memberLoginPage, /PIN reset code/);
  assert.doesNotMatch(memberLoginPage, /We.ll send a one-time code|Send OTP/);
});

test("React auth services preserve same-origin request contracts", async () => {
  const { signIn, activateInvitation, requestPinReset, resetPin } = await import("../../en public/react/src/authActions.mjs");
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ message: "Synthetic test response." }) };
  };
  await signIn({ phone: "synthetic-phone", pin: "synthetic-pin" }, fetcher);
  await activateInvitation({ phone: "synthetic-phone", code: "synthetic-activation-code", pin: "synthetic-pin", termsAccepted: true, privacyNoticeAcknowledged: true, ageConfirmed: "true" }, fetcher);
  await requestPinReset({ email: "member@example.test" }, fetcher);
  await resetPin({ code: "synthetic-reset-code", newPin: "synthetic-new-pin" }, "member@example.test", fetcher);

  assert.deepEqual(requests.map(request => request.url), [
    "/api/login", "/api/invitations/activate", "/api/forgot-pin", "/api/reset-pin",
  ]);
  for (const { options } of requests) {
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.headers["X-Requested-With"], "chama");
    assert.equal(options.headers["Content-Type"], "application/json");
  }
  assert.deepEqual(JSON.parse(requests[0].options.body), { phone: "synthetic-phone", pin: "synthetic-pin" });
  assert.equal(JSON.parse(requests[1].options.body).termsAccepted, true);
  assert.equal(JSON.parse(requests[1].options.body).privacyNoticeAcknowledged, true);
  assert.equal(JSON.parse(requests[1].options.body).ageConfirmed, "true");
  assert.deepEqual(JSON.parse(requests[3].options.body), { code: "synthetic-reset-code", newPin: "synthetic-new-pin", email: "member@example.test" });
});

test("landing registration opens a complete first-chama setup page", () => {
  assert.match(html, /id="landing-register" href="\/register\.html"/);
  for (const field of ["chamaName", "name", "phone", "email", "deadlineDay", "welfareMonthlyFee", "lateContributionPenalty", "loanMonthlyRatePercent", "pin", "bootstrapSecret", "ageConfirmed"]) {
    assert.match(registerPage, new RegExp(`name="${field}"`));
  }
  assert.match(registerPage, /<dialog id="register-age-dialog"/);
  assert.match(registerPage, /onCancel=\{event => event\.preventDefault\(\)\}/);
  assert.match(registerPage, /ageConfirmed === "true" \? "true" : ""/);
  assert.match(registerPage, /hidden=\{ageConfirmed !== "true"\}/);
  assert.doesNotMatch(registerPage, /name="ageConfirmed" type="radio"/);
  assert.match(registerPage, /disabled=\{submitting \|\| ageConfirmed !== "true"\}/);
  assert.match(registerPage, /values\.ageConfirmed !== "true"/);
  assert.match(registerPage, /role="alert" aria-live="assertive"/);
  assert.match(registerHtml, /<dialog id="register-age-dialog"/);
  assert.match(registerHtml, /name="ageConfirmed" type="hidden" value=""/);
  assert.doesNotMatch(registerHtml, /name="ageConfirmed" type="radio"/);
  assert.match(legacyRegisterScript, /formData\.ageConfirmed !== "true"/);
  assert.match(legacyRegisterScript, /registrationAgeConfirmed\.value = "true"/);
  assert.match(legacyRegisterScript, /registrationAgeDialog\.addEventListener\("cancel", event => event\.preventDefault\(\)\)/);
  assert.match(legacyRegisterScript, /button\.dataset\.ageAnswer !== "true"/);
  assert.match(registerPage, /id="register-chama-form"/);
  assert.match(registerPage, /name="deadlineDay" type="number" min=\{1\} max=\{28\} defaultValue=\{5\}/);
  assert.match(registerPage, /name="welfareMonthlyFee" type="number" min=\{0\} step=\{1\} defaultValue=\{500\}/);
  assert.match(registerPage, /name="lateContributionPenalty" type="number" min=\{0\} step=\{1\} defaultValue=\{200\}/);
  assert.match(registerPage, /name="loanMonthlyRatePercent" type="number" min=\{0\} max=\{100\} step=\{0\.1\} defaultValue=\{5\}/);
  assert.match(registerPage, /name="termsAccepted" type="checkbox" value="true" required/);
  assert.match(registerHtml, /name="termsAccepted" type="checkbox" value="true" required/);
  assert.match(registerPage, /name="privacyNoticeAcknowledged" type="checkbox" value="true" required/);
  assert.match(registerHtml, /name="privacyNoticeAcknowledged" type="checkbox" value="true" required/);
  assert.match(registerReactShell, /<div id="root"><\/div>/);
  assert.doesNotMatch(registerReactShell, /id="register-chama-form"|register\.js/);
  assert.match(registerActions, /fetcher\("\/api\/setup"/);
  assert.match(registerActions, /credentials: "same-origin"/);
  assert.match(registerActions, /payload\[field\] = Number\(payload\[field\]\)/);
  assert.match(registerActions, /X-Requested-With": "chama"/);
  assert.match(registerActions, /response\.status === 409/);
  assert.match(registerActions, /fetcher\("\/api\/login"/);
  assert.match(registerActions, /navigate\("\/"\)/);
  assert.match(registerPage, /error instanceof TypeError/);
});

test("React and classic invitation activation use a blocking, accessible age dialog", () => {
  assert.match(memberLoginPage, /<dialog id="activate-age-dialog"/);
  assert.match(memberLoginPage, /onCancel=\{event => event\.preventDefault\(\)\}/);
  assert.match(memberLoginPage, /hidden=\{view !== "activate" \|\| !activationAllowed\}/);
  assert.match(memberLoginPage, /setActivationAllowed\(true\)/);
  assert.match(memberLoginPage, /setAgeGateNotice\(AGE_ELIGIBILITY_MESSAGE\)/);
  assert.match(memberLoginPage, /ageConfirmed === "true" \? "true" : ""/);
  assert.doesNotMatch(memberLoginPage, /name="ageConfirmed" type="radio"/);
  assert.match(memberLoginHtml, /<dialog id="activate-age-dialog"/);
  assert.match(memberLoginHtml, /name="ageConfirmed" type="hidden" value=""/);
  assert.doesNotMatch(memberLoginHtml, /name="ageConfirmed" type="radio"/);
  assert.match(legacyAuthScript, /activationAgeDialog\.addEventListener\("cancel", event => event\.preventDefault\(\)\)/);
  assert.match(legacyAuthScript, /button\.dataset\.ageAnswer !== "true"/);
  assert.match(legacyAuthScript, /values\.ageConfirmed !== "true"/);
  assert.match(css, /dialog\.age-gate-dialog[^\n]*background: #153d33/);
  assert.match(css, /\.age-gate-button[^\n]*min-height: 52px/);
  assert.match(css, /\.age-gate-button:focus-visible/);
  assert.match(css, /@media \(max-width: 360px\)/);
});

test("classic new-Chama signup blocks No, prevents modal dismissal, and submits ageConfirmed only after Yes", async () => {
  const ageConfirmed = fakeControl();
  const submitButton = fakeControl({ disabled: true });
  const firstField = fakeControl();
  const bootstrapField = fakeControl();
  const registrationNotice = fakeControl({ hidden: true });
  const ageBlock = fakeControl({ hidden: true });
  const yesButton = fakeControl({ dataset: { ageAnswer: "true" } });
  const noButton = fakeControl({ dataset: { ageAnswer: "false" } });
  const ageDialog = fakeControl({ querySelectorAll: () => [yesButton, noButton] });
  const registrationForm = fakeControl({ hidden: true });
  const formElements = new Map([
    ["#register-age-confirmed", ageConfirmed], ['button[type="submit"]', submitButton],
    ['input:not([type="hidden"])', firstField], ["#register-bootstrap-secret", bootstrapField],
  ]);
  registrationForm.querySelector = selector => formElements.get(selector) || null;
  registrationForm.formValues = {
    chamaName: "Test Chama", name: "Test Chair", phone: "0711000001", email: "chair@example.test",
    deadlineDay: "5", welfareMonthlyFee: "500", lateContributionPenalty: "200",
    loanMonthlyRatePercent: "5", pin: "123456", termsAccepted: "true", privacyNoticeAcknowledged: "true",
  };
  registrationForm.elements = { namedItem: name => name === "bootstrapSecret" ? bootstrapField : null };
  const elements = new Map([
    ["#register-chama-form", registrationForm], ["#register-notice", registrationNotice],
    ["#register-age-dialog", ageDialog], ["#register-age-block", ageBlock],

  ]);
  const fetchCalls = [];
  const navigations = [];
  class TestFormData {
    constructor(form) { this.form = form; }
    [Symbol.iterator]() {
      const values = { ...this.form.formValues, ageConfirmed: this.form.querySelector("#register-age-confirmed").value };
      return Object.entries(values)[Symbol.iterator]();
    }
  }
  vm.runInNewContext(legacyRegisterScript, {
    document: { querySelector: selector => elements.get(selector) || null },
    window: { location: { search: "", assign: destination => navigations.push(destination) } },
    URLSearchParams,
    FormData: TestFormData,
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return { ok: true, status: 201, json: async () => ({}) };
    },
  });

  assert.equal(ageDialog.open, true, "signup should open the modal immediately");
  assert.equal(registrationForm.hidden, true, "the signup form stays hidden until Yes");
  noButton.dispatch("click");
  assert.equal(ageDialog.open, true, "No must not dismiss the modal");
  assert.equal(ageBlock.hidden, false, "No must explain the age requirement");
  assert.equal(registrationForm.hidden, true, "No must keep the form blocked");
  let cancelled = false;
  ageDialog.dispatch("cancel", { preventDefault() { cancelled = true; } });
  assert.equal(cancelled, true, "Escape cancellation is prevented");
  await registrationForm.getHandler("submit")({ preventDefault() {} });
  assert.equal(fetchCalls.length, 0, "a missing Yes declaration must never reach setup");

  yesButton.dispatch("click");
  assert.equal(ageDialog.open, false, "Yes closes the modal");
  assert.equal(registrationForm.hidden, false, "Yes reveals the form");
  assert.equal(ageConfirmed.value, "true");
  assert.equal(firstField.focused, true, "focus moves into the revealed form");
  await registrationForm.getHandler("submit")({ preventDefault() {} });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "/api/setup");
  assert.equal(JSON.parse(fetchCalls[0].options.body).ageConfirmed, "true");
  assert.deepEqual(navigations, ["/"]);
});

test("classic invited-member activation blocks No and allows activation only after Yes", async () => {
  const ageConfirmed = fakeControl();
  const activationSubmit = fakeControl({ disabled: true });
  const activationPhone = fakeControl();
  const activationNotice = fakeControl({ hidden: true });
  const ageBlock = fakeControl({ hidden: true });
  const yesButton = fakeControl({ dataset: { ageAnswer: "true" } });
  const noButton = fakeControl({ dataset: { ageAnswer: "false" } });
  const ageDialog = fakeControl({ querySelectorAll: () => [yesButton, noButton] });
  const loginForm = fakeControl({ hidden: false });
  const loginNotice = fakeControl({ hidden: true });
  const activationForm = fakeControl({ hidden: true });
  const activationFields = new Map([
    ["#activate-age-confirmed", ageConfirmed], ['button[type="submit"]', activationSubmit], ["#activate-phone", activationPhone],
  ]);
  activationForm.querySelector = selector => activationFields.get(selector) || null;
  activationForm.formValues = { phone: "0711000002", code: "123456", pin: "567890", termsAccepted: "true", privacyNoticeAcknowledged: "true" };
  activationForm.reset = () => { ageConfirmed.value = ""; };
  const forgotPinView = fakeControl({ hidden: true });
  const forgotPinForm = fakeControl();
  const resetPinForm = fakeControl({ hidden: true });
  const forgotPinNotice = fakeControl({ hidden: true });
  const showActivate = fakeControl();
  const showLogin = fakeControl();
  const elements = new Map([
    ["#login-form", loginForm], ["#login-notice", loginNotice], ["#activation-form", activationForm],
    ["#activation-notice", activationNotice], ["#activate-age-dialog", ageDialog], ["#activate-age-block", ageBlock],
    ["#forgot-pin-view", forgotPinView], ["#forgot-pin-form", forgotPinForm], ["#reset-pin-form", resetPinForm],
    ["#forgot-pin-notice", forgotPinNotice], ["#show-activate", showActivate], ["#show-login", showLogin],
  ]);
  const fetchCalls = [];
  class TestFormData {
    constructor(form) { this.form = form; }
    [Symbol.iterator]() {
      const values = { ...this.form.formValues, ageConfirmed: this.form.querySelector("#activate-age-confirmed").value };
      return Object.entries(values)[Symbol.iterator]();
    }
  }
  vm.runInNewContext(legacyAuthScript, {
    document: { querySelector: selector => elements.get(selector) || null },
    window: { location: { search: "" } },
    URLSearchParams,
    FormData: TestFormData,
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ message: "Account activated." }) };
    },
  });

  showActivate.dispatch("click");
  assert.equal(ageDialog.open, true, "activation should open the modal");
  assert.equal(activationForm.hidden, true, "the activation form stays hidden until Yes");
  noButton.dispatch("click");
  assert.equal(ageDialog.open, true, "No must not dismiss the modal");
  assert.equal(ageBlock.hidden, false, "No must explain the age requirement");
  assert.equal(activationForm.hidden, true, "No must keep activation blocked");
  let cancelled = false;
  ageDialog.dispatch("cancel", { preventDefault() { cancelled = true; } });
  assert.equal(cancelled, true, "Escape cancellation is prevented");
  await activationForm.getHandler("submit")({ preventDefault() {} });
  assert.equal(fetchCalls.length, 0, "a missing Yes declaration must never reach activation");

  yesButton.dispatch("click");
  assert.equal(ageDialog.open, false, "Yes closes the modal");
  assert.equal(activationForm.hidden, false, "Yes reveals the activation form");
  assert.equal(ageConfirmed.value, "true");
  assert.equal(activationPhone.focused, true, "focus moves to the first activation field");
  await activationForm.getHandler("submit")({ preventDefault() {} });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, "/api/invitations/activate");
  assert.equal(JSON.parse(fetchCalls[0].options.body).ageConfirmed, "true");
  assert.equal(activationForm.hidden, true, "successful activation returns to sign-in");
});

test("React member invitations require an email and preserve one-time activation-code handling", () => {
  assert.match(html, /id="react-invite-root"/);
  assert.doesNotMatch(html, /id="invite-form"|id="invite-code"/);
  assert.match(invitePanel, /name="email" type="email"/);
  assert.match(invitePanel, /name="phone" type="tel"/);
  assert.match(invitePanel, /name="role"/);
  assert.match(invitePanel, /Share the code privately with the member/);
  assert.match(invitePanel, /navigator\.clipboard\.writeText\(result\.code\)/);
  assert.match(invitationActions, /path: "\/api\/invitations"/);
  assert.match(invitationActions, /invitation\.idempotencyKey === key/);
  assert.doesNotMatch(script, /\$\("#invite-form"\)|\$\("#copy-invite-code"\)|invite-result-message/);
});

test("registration signs in and opens the dashboard when setup was already completed", async () => {
  let redirect = "";
  const requests = [];
  const { registerChama } = await import("../../en public/react/src/registrationActions.mjs");
  await registerChama({
    chamaName: "Test Chama", name: "Test Chair", phone: "0700000000", email: "chair@example.test", pin: "135790",
    deadlineDay: "5", welfareMonthlyFee: "500", lateContributionPenalty: "200", loanMonthlyRatePercent: "5", termsAccepted: "true", privacyNoticeAcknowledged: "true", ageConfirmed: "true",
  }, {
    fetcher: async (url, options) => {
      requests.push({ url, options });
      return requests.length === 1
        ? { ok: false, status: 409, json: async () => ({ message: "Initial setup has already been completed." }) }
        : { ok: true, status: 200, json: async () => ({ message: "Signed in successfully." }) };
    },
    navigate: url => { redirect = url; },
  });

  assert.deepEqual(requests.map(request => request.url), ["/api/setup", "/api/login"]);
  assert.deepEqual(JSON.parse(requests[1].options.body), { phone: "0700000000", pin: "135790" });
  assert.equal(redirect, "/");
});

test("registration sends the bootstrap code only in the setup header and clears the field", async () => {
  let redirect = "";
  const bootstrapSecret = "operator-test-code";
  const requests = [];
  const { registerChama } = await import("../../en public/react/src/registrationActions.mjs");
  await registerChama({
    chamaName: "Test Chama", name: "Test Chair", phone: "0711000001", email: "chair@example.test", pin: "123456",
    deadlineDay: "5", welfareMonthlyFee: "500", lateContributionPenalty: "200", loanMonthlyRatePercent: "5", termsAccepted: "true", privacyNoticeAcknowledged: "true", ageConfirmed: "true",
    bootstrapSecret,
  }, {
    fetcher: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 201, json: async () => ({ message: "Your chairperson account is ready." }) };
    },
    navigate: url => { redirect = url; },
  });

  assert.equal(requests[0].options.headers["X-Setup-Bootstrap-Secret"], bootstrapSecret);
  const requestBody = JSON.parse(requests[0].options.body);
  assert.equal(requestBody.termsAccepted, "true");
  assert.equal(requestBody.bootstrapSecret, undefined);
  assert.equal(JSON.stringify(requestBody).includes(bootstrapSecret), false);
  assert.equal(JSON.stringify(requests[0].options.headers).includes(bootstrapSecret), true);
  assert.deepEqual([
    requestBody.deadlineDay,
    requestBody.welfareMonthlyFee,
    requestBody.lateContributionPenalty,
    requestBody.loanMonthlyRatePercent,
  ], [5, 500, 200, 5]);
  assert.equal(redirect, "/");
  assert.match(registerPage, /bootstrapField\.value = ""/);
});

test("registration redirects to member sign-in when setup login requires a chama choice", async () => {
  let redirect = "";
  let requestNumber = 0;
  const { registerChama } = await import("../../en public/react/src/registrationActions.mjs");
  await registerChama({ phone: "0700000000", pin: "123456" }, {
    fetcher: async () => {
      requestNumber += 1;
      return requestNumber === 1
        ? { ok: false, status: 409, json: async () => ({ message: "Initial setup has already been completed." }) }
        : { ok: true, status: 200, json: async () => ({ chooseChamaId: [{ chamaId: "chama-1", name: "Test Chama" }] }) };
    },
    navigate: url => { redirect = url; },
  });
  assert.equal(redirect, "/member-login.html");
});

test("root page restores the dashboard for an existing authenticated session", async () => {
  const source = script.match(/async function restoreSession\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, "root page should define its session restoration flow");
  assert.match(html, /src="\/chama\.js\?v=20261111\.2" defer/);

  const calls = [];
  const restoreSession = vm.runInNewContext(`(${source})`, {
    api: async path => { calls.push(["api", path]); return { authenticated: true }; },
    showLogin: () => calls.push(["showLogin"]),
    refresh: async () => calls.push(["refresh"]),
    checkBackendConnection: async options => calls.push(["checkBackendConnection", options]),
  });
  await restoreSession();

  assert.deepEqual(calls, [["showLogin"], ["api", "/api/session"], ["refresh"]]);
});

test("root page keeps setup selection for a signed-out visitor", async () => {
  const source = script.match(/async function restoreSession\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, "root page should define its session restoration flow");

  const calls = [];
  const restoreSession = vm.runInNewContext(`(${source})`, {
    api: async path => { calls.push(["api", path]); return { authenticated: false }; },
    showLogin: () => calls.push(["showLogin"]),
    refresh: async () => calls.push(["refresh"]),
    checkBackendConnection: async options => calls.push(["checkBackendConnection", options]),
  });
  await restoreSession();

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ["showLogin"],
    ["api", "/api/session"],
    ["checkBackendConnection", { selectInitialScreen: true }],
  ]);
});

test("root app tolerates the absence of standalone authentication forms", async () => {
  const normalizedScript = script.replace(/\r\n/g, "\n");
  const backendStart = normalizedScript.indexOf("async function checkBackendConnection(");
  const backendEnd = normalizedScript.indexOf("\nfunction setLoginNotice", backendStart);
  const loginSource = script.split(/\r?\n/).find(line => /^function showLogin\(/.test(line));
  const backendSource = backendStart >= 0 && backendEnd > backendStart ? normalizedScript.slice(backendStart, backendEnd) : null;
  assert.ok(backendSource, "root page should define backend status handling");
  assert.ok(loginSource, "root page should define its signed-out state");

  const nodes = new Map([["#logout", {}], ["#app", {}], ["#login", {}], ["#identity", {}], ["#menu-identity", {}]]);
  const bodyClasses = new Set();
  const context = {
    $: selector => nodes.get(selector) || null,
    document: { body: { classList: { add: name => bodyClasses.add(name), remove: name => bodyClasses.delete(name) } } },
    fetch: async url => url === "/api/health"
      ? { ok: true }
      : { ok: true, json: async () => ({ requiresSetup: false }) },
    setConnectionStatus() {},
    clearAppData() {},
    stopPollingFallback() {},
    clearTimeout() {},
    clearInterval() {},
    setLoginNotice() {},
    setNavigationOpen() {},
    eventStream: null,
    streamRetryTimer: null,
    activityTimer: null,
    authenticated: false,
  };
  const checkBackendConnection = vm.runInNewContext(`(${backendSource})`, context);
  const showLogin = vm.runInNewContext(`(${loginSource})`, context);
  await checkBackendConnection({ selectInitialScreen: true });
  showLogin();

  assert.equal(nodes.get("#app").hidden, true);
  assert.equal(nodes.get("#login").hidden, false);
  assert.ok(bodyClasses.has("landing-mode"));
});

test("root renderer tolerates summary cards absent from the current dashboard markup", () => {
  for (const id of ["balance", "contributions", "outstanding"]) {
    assert.doesNotMatch(script, new RegExp(`\\$\\("#${id}"\\)\\.textContent\\s*=`));
  }
});

test("authenticated dashboard navigation uses an accessible hamburger drawer", () => {
  assert.match(html, /id="menu-toggle"[\s\S]*?aria-controls="menu-bar"/);
  assert.match(html, /<nav class="menu-bar" id="menu-bar"[\s\S]*?data-panel="members-panel"/);
  assert.match(html, /id="menu-identity"/);
  assert.match(script, /menuToggle\.addEventListener\("click"/);
  assert.match(script, /menuBar\.addEventListener\("click"/);
  assert.match(script, /function showAppPage\(panelId, \{ scrollTarget \} = \{\}\)/);
  assert.match(script, /showAppPage\(panelLink\.dataset\.panel\)/);
  assert.match(script, /aria-expanded/);
  assert.match(css, /\.topbar\.is-authenticated \.topbar-nav/);
  assert.match(css, /\.topbar\.is-authenticated \.landing-menu-toggle,\s*\.topbar\.is-authenticated \.landing-mobile-nav/);
  assert.match(css, /\.menu-bar\.menu-open\s*\{\s*display:\s*flex !important/);
  assert.match(css, /@media \(max-width: 600px\)[\s\S]*?\.topbar\.is-authenticated\s*\{\s*backdrop-filter:\s*none;/);
  assert.match(css, /\.topbar\.is-authenticated \.dashboard-tabs\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.topbar\.is-authenticated \.dashboard-tab svg\s*\{\s*width:\s*28px;\s*height:\s*28px;/);
});

test("You and Group finance tabs and monthly charts are owned by React while preserving API feeds", () => {
  assert.match(html, /<nav class="dashboard-tabs" id="react-dashboard-root"/);
  assert.match(html, /id="react-finance-root"/);
  assert.doesNotMatch(html, /id="dashboard-tabs"|id="you-dashboard"|id="group-chart"/);
  assert.match(financePage, /createPortal\(<div hidden=\{!overviewVisible\}>\{section\}<\/div>, financeTarget\)/);
  assert.match(financePage, /fetchFinanceSummary\("\/api\/profile\/summary"/);
  assert.match(financePage, /fetchFinanceSummary\("\/api\/summary"/);
  assert.match(financeActions, /summary\.financialTrends/);
  assert.match(financePage, /<polyline points=\{points\}/);
  assert.match(financePage, /className="trend-data"/);
  assert.match(financePage, /Your monthly financial trends/);
  assert.match(financePage, /Group monthly financial trends/);
  assert.match(financePage, /group-contributions-title/);
  assert.match(financePage, /window\.addEventListener\("chama:app-page"/);
  assert.match(script, /new CustomEvent\("chama:dashboard-state"/);
  assert.match(script, /new CustomEvent\("chama:app-page"/);
  assert.doesNotMatch(script, /loadFinancialViews|renderFinancialTrend|function financeRows|selectedDashboardView/);
  assert.match(css, /\.topbar\.is-authenticated \.dashboard-tabs\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?bottom:\s*0;/);
  assert.match(financeActions, /credentials: "same-origin"/);
});

test("attendance markup and behavior are owned by React, not the vanilla controller", () => {
  const attendance = fs.readFileSync(path.join(reactSource, "components", "AttendancePanel.jsx"), "utf8");
  const actions = fs.readFileSync(path.join(reactSource, "attendanceActions.mjs"), "utf8");
  assert.match(html, /<div id="react-attendance-root"><\/div>/);
  assert.doesNotMatch(html, /id="attendance-date"|id="attendance-members"|id="attendance-save"|attendance-overwrite-dialog/);
  assert.match(attendance, /id="attendance-panel"/);
  assert.match(attendance, /role === "secretary"/);
  assert.match(attendance, /Mark all present/);
  assert.match(attendance, /Meeting history/);
  assert.match(attendance, /Edit history/);
  assert.match(actions, /"\/api\/attendance"/);
  assert.doesNotMatch(script, /renderAttendance|updateAttendanceCount|attendance-date|attendance-members|attendance-save|api\("\/api\/attendance"/);
});

test("phone React financial views keep details readable and expose trend data by swipe", () => {
  assert.match(financePage, /className="trend-data-wrap" role="region"[^>]*tabIndex="0"/);
  assert.match(css, /\.trend-data-wrap\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.trend-data\s*\{\s*display:\s*table;\s*width:\s*max-content;/);
  assert.match(css, /\.finance-data-table\s*\{\s*min-width:\s*0;/);
  assert.match(css, /td::before\s*\{\s*content:\s*attr\(data-label\)/);
  assert.match(financePage, /className="trend-data"/);
  assert.match(financePage, /tabIndex="0"/);
  assert.match(css, /button, \.button-primary, \.mini-btn, input, select, textarea \{ min-height: 44px; \}/);
  assert.match(css, /\.field input, \.field select, textarea \{ min-height: 44px; font-size: 16px; \}/);
  assert.match(css, /body\s*\*\s*\{\s*font-size:\s*max\(14px,\s*1em\)\s*!important/);
  assert.match(css, /max-height:\s*calc\(100dvh - 64px - env\(safe-area-inset-bottom\)\)/);
  assert.match(html, /href="\/chama\.css\?v=20261110\.2"/);
  assert.match(html, /href="\/landing-theme\.css\?v=20261112\.1"/);
  assert.match(html, /src="\/i18n\.js\?v=20261112\.1"/);
  assert.match(html, /src="\/chama\.js\?v=20261111\.2"/);
  assert.match(financePage, /item\.color === "#bd7b35" \? "is-ochre" : "is-green"/);
  assert.doesNotMatch(financePage, /dangerouslySetInnerHTML|innerHTML/);
  assert.match(css, /\.trend-legend-item i\.is-green \{ background: #347c62; \}/);
  assert.match(css, /\.trend-legend-item i\.is-ochre \{ background: #bd7b35; \}/);
});

test("landing sections fit narrow phones without clipping cards", () => {
  assert.match(css, /@media \(max-width: 600px\)\s*\{[^}]*\.login-overlay \.landing-sections-container \{ padding-right: 0; padding-left: 0; \}/);
  assert.match(css, /#features \.features-grid,\s*#how-it-works \.steps-list \{ grid-template-columns: minmax\(0, 1fr\) !important; gap: 14px !important; \}/);
  assert.match(css, /#features \.feature-card,\s*#how-it-works \.step-card \{ min-width: 0; \}/);
});

test("React chat owns messages, form state and fallback polling while using the authenticated SSE bridge", () => {
  assert.match(html, /<section class="panel" id="chat-panel"[^>]*>[\s\S]*?<div id="react-chat-root"><\/div>/);
  assert.doesNotMatch(html, /id="chat-messages"|id="chat-form"/);
  assert.match(chatPage, /useState\(\[\]\)/);
  assert.match(chatPage, /onChange=\{event => setDraft\(event\.target\.value\)\}/);
  assert.match(chatPage, /onSubmit=\{handleSubmit\}/);
  assert.match(chatPage, /chama:messages-updated/);
  assert.match(chatPage, /chama:stream-state/);
  assert.match(chatPage, /streamLive \? 30000 : 5000/);
  assert.match(chatPage, /aria-live="polite"/);
  assert.match(chatActions, /fetcher\("\/api\/messages"/);
  assert.match(chatActions, /credentials: "same-origin"/);
  assert.match(chatActions, /path: "\/api\/messages"/);
  assert.match(chatActions, /method: "POST"/);
  assert.match(script, /addEventListener\("messages-updated", \(\) => \{\s*window\.dispatchEvent\(new Event\("chama:messages-updated"\)\)/);
  assert.match(script, /chama:stream-state/);
  assert.doesNotMatch(script, /renderMessages|setChatPolling|#chat-form|\/api\/messages/);
  assert.match(script, /window\.addEventListener\("online", \(\) => \{[\s\S]*?clearTimeout\(streamRetryTimer\)/);
});

test("month-close review is read-only, bilingual, and laid out as responsive cards", () => {
  assert.match(html, /id="cash-flows-panel"[^>]*hidden/);
  assert.match(html, /id="react-month-close-root"/);
  assert.match(monthClosePage, /id="month-close-form"/);
  assert.match(monthClosePage, /id="month-close-month"[\s\S]*?type="month"/);
  assert.match(monthClosePage, /t\("monthCloseIntro"\)/);
  assert.match(i18n, /monthCloseIntro: "Review cash entries and open items recorded in this chama\. This is a read-only ledger review; it doesn't reconcile with bank or M-PESA statements or move money\."/);
  assert.match(monthClosePage, /fetchMonthlyClose\(month\)/);
  assert.match(monthCloseActions, /\/api\/monthly-close\?month=\$\{encodeURIComponent\(month\)\}/);
  assert.doesNotMatch(script, /renderMonthlyClose|#month-close-form|#month-close-summary|#month-close-entries/);
  assert.match(script, /\$\("#cash-flows-panel"\)\.hidden = user\.role === "member"/);
  assert.match(i18n, /monthCloseTitle: "Month-end review"/);
  assert.match(i18n, /monthCloseTitle: "Mapitio ya mwisho wa mwezi"/);
  assert.match(i18n, /monthCloseNoTransferNote: "These are recorded balances only; the app does not move money\."/);
  assert.match(i18n, /monthCloseNoTransferNote: "Haya ni masalio yaliyorekodiwa tu; programu haihamishi pesa\."/);
  assert.match(css, /\.month-close-summary\s*\{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 680px\) \{[\s\S]*?\.month-close-summary, \.month-close-exceptions \{ grid-template-columns: minmax\(0, 1fr\)/);
});

test("contribution date correction UI is reason-required, officer-only, and bilingual", () => {
  assert.match(html, /id="react-ledger-root"/);
  assert.match(ledgerPage, /id="contribution-date-dialog"/);
  assert.match(ledgerPage, /id="contribution-correction-reason"[\s\S]*?maxLength="500"[\s\S]*?required/);
  assert.match(ledgerActions, /\["chairperson", "treasurer"\]\.includes\(user\?\.role\)/);
  assert.match(ledgerActions, /transaction\?\.status === "confirmed"[\s\S]*?transaction\?\.paymentType === "Monthly Contribution"[\s\S]*?transaction\?\.method === "Cash"/);
  assert.match(ledgerActions, /\/api\/contributions\/\$\{encodeURIComponent\(transactionId\)\}\/correct-date/);
  assert.match(ledgerPage, /min=\{correctionBounds\?\.min\}/);
  assert.match(i18n, /correctContributionDate: "Correct contribution date"/);
  assert.match(i18n, /correctContributionDate: "Sahihisha tarehe ya mchango"/);
  assert.match(i18n, /dateCorrectionRules: "Mwenyekiti au Mweka Hazina pekee/);
  assert.match(i18n, /cashDateLimit: \["Dates must be real calendar dates and cannot be in the future\./);
});

test("header icons, profile actions, live dot, muted background, and short menu are usable", () => {
  const profileMenu = html.match(/<div id="profile-menu"[\s\S]*?<\/div>/)?.[0] || "";
  for (const action of ["View profile", "Edit profile", "Create new chama", "Switch chama"]) assert.match(profileMenu, new RegExp(action));
  assert.match(html, /id="notification-button"[^>]*aria-controls="chat-panel"/);
  assert.match(script, /\$\("#notification-button"\)\.addEventListener\("click", \(\) => showAppPage\("chat-panel"\)\)/);
  assert.match(html, /connection-status-dot/);
  assert.match(css, /\.topbar\.is-authenticated \.connection-status\s*\{[\s\S]*?display:\s*inline-flex !important/);
  assert.match(css, /\.connection-status\[data-status="live"\] \.connection-status-dot\s*\{\s*background:\s*#2f9b5e/);
  assert.match(css, /\.connection-status:not\(\[data-status="live"\]\) \.connection-status-dot\s*\{\s*background:\s*#9aa39d/);
  assert.match(css, /body:has\(#app:not\(\[hidden\]\)\)\s*\{[\s\S]*?radial-gradient/);
  assert.match(css, /\.menu-bar\s*\{\s*height:\s*auto; bottom:\s*auto; max-height:\s*min\(72vh, 640px\)/);
  assert.match(profilePage, /profileModeFromSearch\(window\.location\.search\)/);
  assert.match(profileModeSource, /mode === "view"/);
  assert.match(profileModeSource, /mode === "edit"/);

  assert.match(registerPage, /get\("new-chama"\) === "1"/);
  assert.match(memberLoginPage, /id="login-page-title"/);
  assert.match(memberLoginPage, /get\("switch-chama"\) === "1"/);
});

test("audit log, penalty, and dividend panels exist and start hidden", () => {
  assert.match(html, /<section class="panel" id="audit-panel"[^>]*hidden>/);
  assert.match(html, /id="react-audit-root"/);
  assert.match(auditPage, /id="audit-list"/);
  assert.match(auditPage, /permissions\?\.viewAuditLog === true/);
  assert.match(html, /<section class="panel" id="penalty-panel"[^>]*hidden>/);
  assert.match(html, /id="react-penalty-root"/);
  assert.match(penaltyPage, /id="penalty-form"/);
  assert.match(html, /<section class="panel" id="dividend-panel"[^>]*hidden>/);
  assert.match(html, /id="react-dividend-root"/);
  assert.match(dividendsPage, /id="dividend-form"/);
});

test("React audit panel uses the existing read endpoint and keeps client-side search and pagination", () => {
  assert.match(auditActions, /\/api\/audit-log/);
  assert.match(auditActions, /credentials: "same-origin"/);
  assert.match(auditActions, /filterAuditEntries/);
  assert.match(auditActions, /paginateAuditEntries/);
  assert.match(auditPage, /filterAuditEntries\(entries, query, roleName\)/);
  assert.match(auditPage, /paginateAuditEntries\(matches, page, pageSize\)/);
  assert.match(auditPage, /onChange=\{event => \{ setQuery\(event\.target\.value\); setPage\(0\); \}\}/);
  assert.doesNotMatch(auditPage, /dangerouslySetInnerHTML|innerHTML/);
  assert.doesNotMatch(script, /renderAuditLogPage|loadAuditLog|#audit-list|#audit-search/);
});

test("penalty and dividend panels are shown only to the right roles", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(server, /assessPenalties: \["chairperson", "secretary"\]/);
  assert.match(server, /manageDividends: \["chairperson", "treasurer"\]/);
  assert.match(script, /\$\("#penalty-panel"\)\.hidden = !permissions\.assessPenalties;/);
  assert.match(script, /\$\("#dividend-panel"\)\.hidden = !permissions\.manageDividends;/);
});

test("dividend UI calculates first and commits only the previewed payouts", () => {
  assert.match(dividendsPage, /name="cycleStartDate"/);
  assert.match(dividendsPage, /name="cycleEndDate"/);
  assert.match(dividendsPage, /name="adminExpenses"/);
  assert.match(dividendsPage, /calculateDividendCycle\(writer, owner\.current, input\)/);
  assert.match(dividendsPage, /commitDividendCycle\(writer, owner\.current, preview\.input, preview\.data\.payouts\)/);
  assert.match(adminFinanceActions, /path: "\/api\/dividends\/calculate"/);
  assert.match(adminFinanceActions, /path: "\/api\/dividends\/commit"/);
  assert.match(adminFinanceActions, /payouts: payouts\.map\(item => \(\{ memberId: item\.memberId, dividend: item\.dividend \}\)\)/);
  assert.match(dividendsPage, /data\.overlapsCommitted/);
  assert.doesNotMatch(script, /renderDividendPreview|dividendDraft|api\("\/api\/dividends/);
});

test("penalty button calls the assessment endpoint", () => {
  assert.match(penaltyPage, /Assess monthly penalties/);
  assert.match(penaltyPage, /assessMonthlyPenalties\(writer, owner\.current, month\)/);
  assert.match(adminFinanceActions, /path: "\/api\/penalties\/assess"/);
  assert.doesNotMatch(script, /api\("\/api\/penalties\/assess"/);
});

test("React loan form and cash entry preserve guarantor, repayment reference, and date fields", () => {
  assert.match(loansPage, /id="loan-amount" name="amount"/);
  assert.match(loansPage, /id="loan-months" name="months"/);
  assert.match(loansPage, /name="guarantorIds"/);
  assert.match(loanActions, /formData\.getAll\("guarantorIds"\)/);
  assert.match(loanActions, /path: "\/api\/loans"/);
  assert.match(script, /api\("\/api\/loans\/guarantors"\)/);
  assert.match(cashEntryPage, /name="referenceNumber"/);
  assert.match(cashEntryPage, /name="date" type="date"/);
  assert.match(cashEntryPage, /buildCashEntryRequest\(writer, new FormData\(form\)\)/);
  assert.match(cashEntryActions, /writeRequester\.cashEntryRequest\(formData\)/);
  assert.match(cashEntryActions, /writeRequester\.submit\(/);
});

test("profile page loads its write helper and connects forms to authenticated profile endpoints", () => {
  assert.match(profileReactShell, /<div id="root"><\/div>/);
  assert.match(profilePage, /fetch\("\/api\/session"/);
  assert.match(profilePage, /if \(!session\.authenticated\)[\s\S]*?fetch\("\/api\/profile"/);
  assert.match(profilePage, /fetch\("\/api\/profile"/);
  assert.match(profilePage, /path: "\/api\/profile"/);
  assert.match(profilePage, /`\/api\/profile\/photo\/\$\{size\}`/);
  assert.match(profilePage, /"X-Requested-With": "chama"/);
  assert.match(profilePage, /credentials: "same-origin"/);
  assert.match(profilePage, /writeRequester\.submit\(/);
  assert.doesNotMatch(profilePage, /dangerouslySetInnerHTML|\.innerHTML\s*=/);
  assert.match(html, /id="profile-menu"[\s\S]*?href="\/profile\.html\?mode=view"[^>]*>View profile<\/a>/);
});

test("profile menu view and edit links select the correct profile-page mode", async () => {
  const { profileModeFromSearch } = await import("../../en public/react/src/profileMode.mjs");
  assert.match(html, /href="\/profile\.html\?mode=view"/);
  assert.match(html, /href="\/profile\.html\?mode=edit"/);
  assert.deepEqual(profileModeFromSearch("?mode=view"), { viewOnly: true, editMode: false });
  assert.deepEqual(profileModeFromSearch("?mode=edit"), { viewOnly: false, editMode: true });
  assert.deepEqual(profileModeFromSearch(""), { viewOnly: false, editMode: false });
  assert.match(profilePage, /disabled=\{!editing \|\| viewOnly\}/);
  assert.match(profilePage, /!viewOnly &&/);
});
