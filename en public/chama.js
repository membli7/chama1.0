"use strict";

const $ = selector => document.querySelector(selector);
const money = value => value === null || value === undefined ? "Private" : `KES ${Number(value).toLocaleString("en-KE")}`;
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const t = key => window.jiraniI18n?.t(key) || key;
const SUBSCRIPTION_PAYMENTS_ENABLED = false;
const writeRequester = window.chamaWriteRequests.createWriteRequester();
let state;
let guarantorMembers = [];
let eventStream;
let streamRetryTimer;
let pollingTimer;
let activityTimer;
let authenticated = false;
let activeAppPage = "overview";
let lastActivity = Date.now();
let lastActivityPing = 0;
const idleLimitMs = 15 * 60 * 1000;
const menuToggle = $("#menu-toggle");
const menuBar = $("#menu-bar");

async function openPricingModal(button) {
  const dialog = $("#pricing-modal");
  if (!dialog || !button || button.disabled) return;
  const copy = $("#pricing-modal-copy");
  const referencePanel = $("#pricing-reference-panel");
  const referenceOutput = $("#pricing-modal-reference");
  const copyButton = $("#pricing-copy-reference");
  const copyStatus = $("#pricing-reference-copy-status");
  $("#pricing-modal-tier").textContent = button.dataset.pricingTier;
  $("#pricing-modal-cap").textContent = button.dataset.memberCap;
  $("#pricing-modal-billing").textContent = button.dataset.pricingBilling;
  $("#pricing-modal-total").textContent = button.dataset.pricingTotal;
  $("#pricing-modal-savings").textContent = button.dataset.pricingSavings;
  if (referencePanel) referencePanel.hidden = true;
  if (referenceOutput) referenceOutput.textContent = "";
  if (copyButton) copyButton.disabled = true;
  if (copyStatus) copyStatus.textContent = "";
  if (copy) copy.textContent = "Online subscription payments are temporarily paused. Prices remain available for review, but selecting a plan will not start checkout, request payment, change subscription status, or affect existing access. Contact us for updates.";
  dialog.showModal();
  dialog.scrollTop = 0;
  $("#pricing-modal-title")?.focus({ preventScroll: true });
  if (!SUBSCRIPTION_PAYMENTS_ENABLED) return;

  const billing = String(button.dataset.pricingBilling || "").toLowerCase();
  if (billing === "custom") {
    if (copy) copy.textContent = "Enterprise / Investment plans use custom member limits and pricing. Contact our team to discuss your group; no payment request is sent and access is not activated by selecting this option.";
    return;
  }
  if (!authenticated || !state?.user) {
    if (copy) copy.textContent = "Sign in through Member Login as the chama chairperson to request a pending reference. You can also contact our team for next steps. No payment request is sent and plan selection does not activate access.";
    return;
  }
  if (state.user.role !== "chairperson") {
    if (copy) copy.textContent = "Only the chama chairperson can request a pending reference. Please contact your chairperson or our team. No payment request was sent and access was not activated.";
    return;
  }
  const tier = ({ Basic: "basic", "Growth Chama": "growth" })[button.dataset.pricingTier];
  if (!tier || !["monthly", "annual"].includes(billing)) {
    if (copy) copy.textContent = "This plan cannot be selected here. Contact our team for the next steps.";
    return;
  }

  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  if (copy) copy.textContent = "Saving the plan selection and requesting a pending reference. This does not send a payment request.";
  try {
    const result = await api("/api/subscription/selection", {
      method: "POST",
      body: { tier, billing },
      write: button,
      validateResponse: data => typeof data?.plan?.reference === "string"
        && /^JC[A-F0-9]{12}$/.test(data.plan.reference)
        && data.plan.paymentEnabled === false
        && data.plan.paymentRequestStarted === false,
    });
    if (referenceOutput) referenceOutput.textContent = result.plan.reference;
    if (referencePanel) referencePanel.hidden = false;
    if (copyButton) copyButton.disabled = false;
    if (copy) copy.textContent = result.message || "Pending reference created. Contact our team for payment instructions. No payment request was sent; access activates only after a matching M-PESA C2B confirmation.";
    if (copyStatus && result.plan.expiresAt) {
      const expires = new Date(result.plan.expiresAt);
      const formatted = Number.isNaN(expires.getTime()) ? "" : new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }).format(expires);
      copyStatus.textContent = formatted ? `Reference expires ${formatted} (Nairobi time).` : "Copy this reference when contacting our team.";
    } else if (copyStatus) copyStatus.textContent = "Copy this reference when contacting our team.";
  } catch (error) {
    if (error.status === 401) dialog.close();
    if (copy) {
      if (error.status === 503) copy.textContent = "Verified M-PESA references are not configured for this chama yet. No payment request was sent and no access was activated. Please contact our team for next steps.";
      else if (error.uncertain) copy.textContent = "We could not confirm the reference was saved. No payment request is sent by this flow. Please retry or contact our team if the issue continues.";
      else copy.textContent = error.message || "The plan could not be selected. No payment request was sent.";
    }
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

document.querySelectorAll("[data-pricing-tier]").forEach(button => {
  button.addEventListener("click", () => openPricingModal(button));
});
$("#pricing-modal-cancel")?.addEventListener("click", () => $("#pricing-modal")?.close());
$("#pricing-contact")?.addEventListener("click", () => $("#pricing-modal")?.close());
$("#pricing-copy-reference")?.addEventListener("click", async () => {
  const reference = $("#pricing-modal-reference")?.textContent?.trim();
  const status = $("#pricing-reference-copy-status");
  if (!reference || !status) return;
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
    await navigator.clipboard.writeText(reference);
    status.textContent = "Reference copied.";
  } catch {
    status.textContent = "Copy is unavailable here. Select and copy the reference above.";
  }
});
const landingMenuToggle = $("#landing-menu-toggle");
const landingMobileNav = $("#landing-mobile-nav");
landingMenuToggle?.addEventListener("click", () => {
  const open = landingMenuToggle.getAttribute("aria-expanded") !== "true";
  landingMenuToggle.setAttribute("aria-expanded", String(open));
  landingMenuToggle.setAttribute("aria-label", t(open ? "landingNavClose" : "landingNavOpen"));
  landingMobileNav.hidden = !open;
});
landingMobileNav?.addEventListener("click", () => {
  landingMenuToggle?.setAttribute("aria-expanded", "false");
  landingMenuToggle?.setAttribute("aria-label", t("landingNavOpen"));
  landingMobileNav.hidden = true;
});

async function api(path, { method = "GET", body, write = false, validateResponse, silentForbidden = false } = {}) {
  if (write) {
    try {
      return await writeRequester.submit({ owner: write === true ? {} : write, path, method, body, validate: validateResponse });
    } catch (error) {
      if (error.status === 401 && path !== "/api/login") showLogin();
      if (error.status === 402) notice(error.message, true);
      if (error.status === 403 && !error.data?.mustChangePin) notice("You do not have permission to perform that action.", true);
      throw error;
    }
  }
  const headers = { "Content-Type": "application/json", "X-Requested-With": "chama" };
  const response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== "/api/login") showLogin();
  if (response.status === 402) notice(data.message || "Subscription renewal is required to create records.", true);
  if (response.status === 403 && !data.mustChangePin && !silentForbidden) notice("You do not have permission to perform that action.", true);
  if (!response.ok) { const error = new Error(data.message || `Request failed (${response.status}).`); error.status = response.status; error.data = data; throw error; }
  return data;
}
async function checkBackendConnection({ selectInitialScreen = false } = {}) {
  try {
    const response = await fetch("/api/health", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) { setConnectionStatus("offline"); return; }
    setConnectionStatus("ready");
    const setupResponse = await fetch("/api/setup/status", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
    if (selectInitialScreen && setupResponse.ok && !authenticated) {
      const setup = await setupResponse.json();
      const setupForm = $("#setup-form");
      const loginForm = $("#login-form");
      const activationForm = $("#activation-form");
      if (setupForm) setupForm.hidden = !setup.requiresSetup;
      if (loginForm) loginForm.hidden = !!setup.requiresSetup;
      if (activationForm) activationForm.hidden = true;
    }
  } catch {
    setConnectionStatus("offline");
  }
}
function setLoginNotice(node, message) {
  if (!node) return;
  node.textContent = window.jiraniI18n?.translateText(message) || message;
  node.hidden = !message;
}
function notice(message, error = false) { const node = $("#notice"); node.textContent = window.jiraniI18n?.translateText(message) || message; node.classList.toggle("error", error); node.setAttribute("aria-live", error ? "assertive" : "polite"); node.setAttribute("role", error ? "alert" : "status"); }
window.addEventListener("chama:notice-requested", event => {
  const message = event.detail?.message;
  if (typeof message === "string" && message) notice(message, event.detail?.error === true);
});
function setButton(form, disabled) { form.querySelector("button[type=submit]").disabled = disabled; }
function roleName(role) { return window.jiraniI18n?.roleName(role) || (role ? role[0].toUpperCase() + role.slice(1) : ""); }
function chairpersonChecklistItems(members, invitations, overviewReviewed) {
  const hasRole = role => members.some(member => member.role === role && member.status === "active") ||
    invitations.some(invitation => invitation.requestedRole === role && !invitation.usedAt && !invitation.revocation && Date.parse(invitation.expiresAt) > Date.now());
  const hasMember = members.some(member => member.role === "member" && member.status === "active") ||
    invitations.some(invitation => invitation.requestedRole === "member" && !invitation.usedAt && !invitation.revocation && Date.parse(invitation.expiresAt) > Date.now());
  return [
    { key: "secretary", label: "setupInviteSecretary", complete: hasRole("secretary"), panel: "invite-panel" },
    { key: "treasurer", label: "setupInviteTreasurer", complete: hasRole("treasurer"), panel: "invite-panel" },
    { key: "members", label: "setupAddMembers", complete: hasMember, panel: "invite-panel" },
    { key: "overview", label: "setupReviewOverview", complete: overviewReviewed, panel: "dashboard" }
  ];
}
function setupChecklistStorageKey(userId) { return `jirani-setup-checklist:${userId}`; }
function readSetupChecklistState(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(setupChecklistStorageKey(userId)) || "{}");
    return { dismissed: saved.dismissed === true, overviewReviewed: saved.overviewReviewed === true, skipped: saved.skipped && typeof saved.skipped === "object" ? saved.skipped : {} };
  } catch { return { dismissed: false, overviewReviewed: false, skipped: {} }; }
}
function saveSetupChecklistState(userId, checklistState) {
  try { localStorage.setItem(setupChecklistStorageKey(userId), JSON.stringify(checklistState)); } catch { /* Checklist remains usable when browser storage is unavailable. */ }
}
function renderChairpersonSetupChecklist(user, members, invitations) {
  const openButton = $("#setup-checklist-open");
  const section = $("#chairperson-setup-checklist");
  if (!openButton || !section) return;
  const isChairperson = user.role === "chairperson";
  openButton.hidden = !isChairperson;
  section.hidden = !isChairperson;
  if (!isChairperson) return;
  const saved = readSetupChecklistState(user.id);
  section.hidden = saved.dismissed;
  openButton.textContent = t("setupChecklistShow");
  openButton.hidden = !saved.dismissed;
  const items = chairpersonChecklistItems(members, invitations, saved.overviewReviewed);
  $("#setup-checklist-items").innerHTML = items.map(item => {
    const skipped = saved.skipped[item.key] === true;
    const stateLabel = item.complete ? t("setupChecklistComplete") : skipped ? t("setupChecklistSkipped") : t("setupChecklistNeeded");
    const action = item.complete ? "" : `<div class="setup-checklist-item-actions"><a class="mini-btn" href="#${esc(item.panel)}" data-setup-panel="${esc(item.panel)}"${item.key === "overview" ? ' data-setup-review="true"' : ""}>${t(item.key === "overview" ? "setupChecklistReview" : "setupChecklistOpen")}</a>${skipped ? `<button class="mini-btn" type="button" data-setup-restore="${esc(item.key)}">${t("setupChecklistUndoSkip")}</button>` : `<button class="mini-btn" type="button" data-setup-skip="${esc(item.key)}">${t("setupChecklistSkip")}</button>`}</div>`;
    return `<li class="setup-checklist-item"><span class="setup-checklist-item-copy"><strong>${t(item.label)}</strong><span class="setup-checklist-item-state">${stateLabel}</span></span>${action}</li>`;
  }).join("");
}
function fmtDate(value) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Africa/Nairobi" }).format(new Date(value)); }
function fmtTime(value) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Nairobi" }).format(new Date(value)); }
function meetingDateToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Africa/Nairobi" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function render() {
  const { user, permissions, summary, members, invitations = [], transactions, loans, approvalQueue = [], pendingLoans, leadershipChanges, subscription } = state;
  if (!authenticated) {
    authenticated = true;
    lastActivity = Date.now();
    lastActivityPing = 0;
    startActivityMonitor();
  }
  document.body.classList.remove("landing-mode");
  $(".topbar")?.classList.add("is-authenticated");
  setNavigationOpen(false);
  $("#identity").textContent = `${user.name} (${roleName(user.role)})`;
  $("#menu-identity").textContent = `${user.name} (${roleName(user.role)})`;
  $("#logout").hidden = false;
  $("#role-label").textContent = `${roleName(user.role)} ${t("dashboard")}`;
  $("#greeting").textContent = `${t("welcome")}, ${user.name}`;
  const subscriptionNotice = $("#subscription-notice");
  if (subscriptionNotice) {
    const renewalMessage = "";
    const subscriptionNoticeCopy = $("#subscription-notice-copy");
    const subscriptionRenewalLink = $("#subscription-renewal-link");
    if (subscriptionNoticeCopy) subscriptionNoticeCopy.textContent = renewalMessage;
    if (subscriptionRenewalLink) subscriptionRenewalLink.hidden = !renewalMessage;
    subscriptionNotice.hidden = !renewalMessage;
  }
  renderChairpersonSetupChecklist(user, members, invitations);
  const balance = $("#balance");
  const contributions = $("#contributions");
  const outstanding = $("#outstanding");
  if (balance) balance.textContent = money(summary.balance);
  if (contributions) contributions.textContent = money(summary.contributions);
  if (outstanding) outstanding.textContent = money(summary.outstanding);
  [$("#balance"), $("#contributions"), $("#outstanding")].forEach(node => node?.classList.remove("skeleton"));
  $("#members-panel").hidden = user.role === "member";
  $("#payment-panel").hidden = !permissions.recordPayments;
  $("#simulated-payment-section").hidden = !permissions.simulatePayments;
  $("#invite-panel").hidden = !permissions.manageMembers;
  $("#leadership-panel").hidden = !permissions.manageLeadership;
  $("#audit-panel").hidden = !permissions.viewAuditLog;
  $("#penalty-panel").hidden = !permissions.assessPenalties;
  $("#dividend-panel").hidden = !permissions.manageDividends;
  $("#cash-flows-panel").hidden = user.role === "member";
  $("#leadership-elections-panel").hidden = false;
  const faqPanel = $("#faq-panel");
  if (faqPanel) faqPanel.hidden = false;
  const supportPanel = $("#support-panel");
  if (supportPanel) supportPanel.hidden = false;
  const supportAgentPanel = $("#support-agent-panel");
  if (supportAgentPanel) supportAgentPanel.hidden = !permissions.isSupportAgent && !permissions.isPlatformAdmin;
  const supportAdminPanel = $("#support-admin-panel");
  if (supportAdminPanel) supportAdminPanel.hidden = !permissions.canManageSupport;
  const faqAdminPanel = $("#faq-admin-panel");
  if (faqAdminPanel) faqAdminPanel.hidden = !permissions.canManageFaq;
  if (user.mustChangePin) notice("Change your temporary PIN before making any records.", true);

  $("#app").hidden = false; $("#login").hidden = true;
  updateNavigationVisibility();
  showAppPage(activeAppPage);
  window.jiraniI18n?.apply();
  if (typeof CustomEvent !== "undefined") window.dispatchEvent(new CustomEvent("chama:dashboard-state", { detail: { user: state.user, transactions: state.transactions, loans: state.loans, approvalQueue: state.approvalQueue, members: state.members, invitations: state.invitations, leadershipChanges: state.leadershipChanges, leadershipElections: state.leadershipElections, notifications: state.notifications, simulatedPayments: state.simulatedPayments || [], permissions: state.permissions, guarantorMembers, subscription: state.subscription, activePage: activeAppPage } }));
  window.dispatchEvent(new Event("chama:dashboard-ready"));
}
function updateNavigationVisibility() {
  for (const link of menuBar.querySelectorAll("a[data-panel]")) {
    const target = link.dataset.panel === "dashboard" ? null : document.getElementById(link.dataset.panel);
    link.hidden = !!target?.hidden;
  }
  for (const dropdown of menuBar.querySelectorAll(".nav-dropdown")) {
    const links = [...dropdown.querySelectorAll("a[data-panel]")];
    dropdown.hidden = links.length > 0 && links.every(link => link.hidden);
  }
}
function showAppPage(panelId, { scrollTarget } = {}) {
  const overview = panelId === "overview" || panelId === "dashboard";
  if (panelId === "dashboard" && typeof CustomEvent !== "undefined") window.dispatchEvent(new CustomEvent("chama:finance-view", { detail: { view: "you" } }));
  const activeIds = overview ? new Set() : new Set([panelId]);
  activeAppPage = overview ? "overview" : panelId;
  if (typeof CustomEvent !== "undefined") window.dispatchEvent(new CustomEvent("chama:app-page", { detail: { overview, panelId } }));
  const sectionIds = ["attendance-panel", "loans-panel"];
  for (const sectionId of sectionIds) {
    const section = document.getElementById(sectionId);
    if (!section) continue;
    section.dataset.pageInactive = String(!activeIds.has(sectionId));
  }

  const mainGrid = $(".main-grid");
  let showGrid = false;
  for (const section of mainGrid.querySelectorAll(".panel[id]")) {
    const active = activeIds.has(section.id) && !section.hidden;
    section.dataset.pageInactive = String(!active);
    showGrid ||= active;
  }
  mainGrid.dataset.pageInactive = String(!showGrid);
  mainGrid.classList.toggle("is-single-view", !overview);

  for (const link of menuBar.querySelectorAll("a[data-panel]")) {
    const selected = link.dataset.panel === panelId || (overview && link.dataset.panel === "dashboard");
    link.classList.toggle("active", selected);
    if (selected) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  for (const dropdown of menuBar.querySelectorAll(".nav-dropdown")) {
    dropdown.classList.toggle("active", !!dropdown.querySelector("a[aria-current='page']"));
  }
  setNavigationOpen(false);
  if (scrollTarget) requestAnimationFrame(() => document.getElementById(scrollTarget)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  else window.scrollTo({ top: 0, behavior: "smooth" });
}
async function refresh() {
  try {
    state = await api("/api/dashboard");
    state.simulatedPayments = state.permissions.simulatePayments ? (await api("/api/payments/inbox")).data || [] : [];
    guarantorMembers = (await api("/api/loans/guarantors")).data || [];
    $("#retry").hidden = true;
    render();
    window.dispatchEvent(new CustomEvent("chama:dashboard-state", { detail: state }));
    connectEventStream();
  }
  catch (error) {
    if (error.data?.mustChangePin) {
      authenticated = false; document.body.classList.remove("landing-mode"); $("#app").hidden = true; $("#login").hidden = true;
      window.dispatchEvent(new CustomEvent("chama:pin-change-required"));
    } else if (!/session has expired/i.test(error.message)) { notice(error.message || t("retryError"), true); $("#retry").hidden = false; }
  }
}
window.addEventListener("chama:dashboard-refresh-requested", () => { void refresh(); });
function setConnectionStatus(status) {
  const labels = { ready: t("checkingServer"), live: t("live"), reconnecting: t("reconnecting"), polling: t("polling"), offline: t("offline") };
  const node = $("#connection-status"); if (!node) return;
  const label = $("#connection-status-label");
  if (label) label.textContent = labels[status] || status;
  node.setAttribute("aria-label", labels[status] || status);
  node.dataset.status = status;
}
function startPollingFallback() {
  window.dispatchEvent(new CustomEvent("chama:stream-state", { detail: { live: false } }));
  if (!pollingTimer) {
    setConnectionStatus(navigator.onLine ? "polling" : "offline");
    pollingTimer = setInterval(() => { if (navigator.onLine) refresh(); else setConnectionStatus("offline"); }, 30000);
  }
}
function stopPollingFallback() {
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
}
function startActivityMonitor() {
  if (activityTimer) return;
  const checkActivity = () => {
    if (!authenticated) return;
    const idleFor = Date.now() - lastActivity;
    if (idleFor >= idleLimitMs) { endSessionForInactivity(); return; }
    if (navigator.onLine && Date.now() - lastActivityPing >= 4 * 60 * 1000) {
      lastActivityPing = Date.now();
      api("/api/session/activity", { method: "POST" }).catch(() => {});
    }
  };
  activityTimer = setInterval(checkActivity, 60 * 1000);
}
async function endSessionForInactivity() {
  authenticated = false;
  try { if (navigator.onLine) await api("/api/logout", { method: "POST" }); } catch {}
  showLogin();
  notice("You were signed out after 15 minutes of inactivity.");
}
function noteActivity() { if (authenticated) lastActivity = Date.now(); }
for (const eventName of ["pointerdown", "keydown", "touchstart", "scroll"]) document.addEventListener(eventName, noteActivity, { passive: true });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && authenticated && Date.now() - lastActivity >= idleLimitMs) endSessionForInactivity();
});
function connectEventStream() {
  if (eventStream || streamRetryTimer) return;
  if (!window.EventSource) { startPollingFallback(); return; }
  setConnectionStatus("reconnecting");
  eventStream = new EventSource("/api/events/stream");
  eventStream.onopen = () => {
    setConnectionStatus("live");
    window.dispatchEvent(new CustomEvent("chama:stream-state", { detail: { live: true } }));
    stopPollingFallback();
  };
  eventStream.addEventListener("members-updated", () => { refresh(); });
  eventStream.addEventListener("loans-updated", () => { refresh(); });
  eventStream.addEventListener("notifications-updated", () => { refresh(); });
  eventStream.addEventListener("messages-updated", () => {
    window.dispatchEvent(new Event("chama:messages-updated"));
  });
  eventStream.onerror = () => {
    eventStream.close(); eventStream = null; startPollingFallback(); setConnectionStatus(navigator.onLine ? "reconnecting" : "offline");
    streamRetryTimer = setTimeout(() => { streamRetryTimer = null; connectEventStream(); }, 5000);
  };
}
function clearAppData() {
  state = null;
  guarantorMembers = [];
  for (const selector of ["#identity", "#greeting", "#role-label", "#balance", "#contributions", "#outstanding", "#notice"]) {
    const node = $(selector); if (node) node.textContent = "";
  }
  for (const key of Object.keys(sessionStorage)) if (key.startsWith("jirani:")) sessionStorage.removeItem(key);
}
function showLogin({ notifyReact = true } = {}) { clearAppData(); if (eventStream) { eventStream.close(); eventStream = null; } stopPollingFallback(); clearTimeout(streamRetryTimer); streamRetryTimer = null; clearInterval(activityTimer); activityTimer = null; authenticated = false; document.body.classList.add("landing-mode"); setNavigationOpen(false); $(".topbar")?.classList.remove("is-authenticated"); $("#identity").textContent = ""; $("#menu-identity").textContent = ""; $("#logout").hidden = true; $("#app").hidden = true; $("#login").hidden = false; const setupForm = $("#setup-form"); const loginForm = $("#login-form"); const activationForm = $("#activation-form"); if (setupForm) setupForm.hidden = true; if (loginForm) loginForm.hidden = false; if (activationForm) activationForm.hidden = true; setLoginNotice($("#setup-notice"), ""); setLoginNotice($("#login-notice"), ""); setLoginNotice($("#activation-notice"), ""); if (notifyReact && typeof window !== "undefined") window.dispatchEvent(new Event("chama:session-ended")); }

$("#setup-form")?.addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; setButton(form, true);
  try {
    await api("/api/setup", { method: "POST", body: Object.fromEntries(new FormData(form)) });
    form.reset(); setLoginNotice($("#setup-notice"), ""); await refresh();
  } catch (error) {
    setLoginNotice($("#setup-notice"), error instanceof TypeError ? "Cannot reach the server. Check that it is running, then try again." : error.message);
  } finally { setButton(form, false); }
});

$("#login-form")?.addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; setButton(form, true);
  try { await api("/api/login", { method: "POST", body: Object.fromEntries(new FormData(form)) }); form.reset(); setLoginNotice($("#login-notice"), ""); await refresh(); }
  catch (error) { if (error instanceof TypeError) { setConnectionStatus("offline"); setLoginNotice($("#login-notice"), "Cannot reach the server. Check that it is running, then try again."); } else setLoginNotice($("#login-notice"), error.message); } finally { setButton(form, false); }
});

$("#activation-form")?.addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; setButton(form, true);
  try { const result = await api("/api/invitations/activate", { method: "POST", body: Object.fromEntries(new FormData(form)) }); form.reset(); setLoginNotice($("#activation-notice"), ""); setLoginNotice($("#login-notice"), result.message); $("#activation-form").hidden = true; $("#login-form").hidden = false; }
  catch (error) { setLoginNotice($("#activation-notice"), error instanceof TypeError ? "Cannot reach the server. Check that it is running, then try again." : error.message); } finally { setButton(form, false); }
});
$("#show-activate")?.addEventListener("click", () => { $("#login-form").hidden = true; $("#activation-form").hidden = false; });
$("#show-login")?.addEventListener("click", () => { $("#activation-form").hidden = true; $("#login-form").hidden = false; });
async function signOut() { try { await api("/api/logout", { method: "POST" }); showLogin(); notice("Signed out."); } catch (error) { notice(error.message, true); } }
$("#logout").addEventListener("click", signOut);
$("#menu-logout").addEventListener("click", signOut);
$("#retry").addEventListener("click", () => { $("#retry").disabled = true; refresh().finally(() => { $("#retry").disabled = false; }); });
window.addEventListener("online", () => {
  setConnectionStatus("reconnecting");
  if (streamRetryTimer) { clearTimeout(streamRetryTimer); streamRetryTimer = null; }
  if (eventStream) { eventStream.close(); eventStream = null; }
  if (authenticated) { startPollingFallback(); refresh(); } else checkBackendConnection();
});
window.addEventListener("offline", () => { if (eventStream) { eventStream.close(); eventStream = null; } setConnectionStatus("offline"); startPollingFallback(); });

async function restoreSession() {
  showLogin({ notifyReact: false });
  try {
    const session = await api("/api/session");
    if (session.authenticated) {
      await refresh();
      return;
    }
  } catch {}
  await checkBackendConnection({ selectInitialScreen: true });
}
restoreSession();

function setNavigationOpen(open) {
  if (!menuToggle || !menuBar) return;
  if (!open) {
    for (const dropdown of menuBar.querySelectorAll(".nav-dropdown")) {
      dropdown.classList.remove("open");
      dropdown.querySelector(".nav-dropdown-toggle")?.setAttribute("aria-expanded", "false");
    }
  }
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  menuBar.classList.toggle("menu-open", open);
  menuBar.setAttribute("aria-hidden", String(!open));
}
menuToggle.addEventListener("click", () => setNavigationOpen(menuToggle.getAttribute("aria-expanded") !== "true"));
window.addEventListener("chama:financial-tab-selected", () => showAppPage("overview"));
menuBar.addEventListener("click", event => {
  const dropdownToggle = event.target.closest(".nav-dropdown-toggle");
  if (dropdownToggle) {
    const dropdown = dropdownToggle.closest(".nav-dropdown");
    const expanded = dropdownToggle.getAttribute("aria-expanded") === "true";
    dropdownToggle.setAttribute("aria-expanded", String(!expanded));
    dropdown.classList.toggle("open", !expanded);
    return;
  }
  const contributionsLink = event.target.closest("a[data-contributions-link]");
  if (contributionsLink) {
    event.preventDefault();
    const selectedView = state?.user?.role === "member" ? "you" : "group";
    if (typeof CustomEvent !== "undefined") window.dispatchEvent(new CustomEvent("chama:finance-view", { detail: { view: selectedView } }));
    const targetId = selectedView === "group" ? "group-contributions-title" : "you-contributions-title";
    showAppPage("overview", { scrollTarget: targetId });
    return;
  }
  const panelLink = event.target.closest("a[data-panel]");
  if (panelLink) {
    event.preventDefault();
    showAppPage(panelLink.dataset.panel);
  }
});
$("#notification-button").addEventListener("click", () => showAppPage("chat-panel"));
document.addEventListener("click", event => {
  if (!state?.user || state.user.role !== "chairperson") return;
  const saved = readSetupChecklistState(state.user.id);
  if (event.target.closest("#setup-checklist-open")) {
    saved.dismissed = false;
    saveSetupChecklistState(state.user.id, saved);
    renderChairpersonSetupChecklist(state.user, state.members, state.invitations || []);
    return;
  }
  if (event.target.closest("#setup-checklist-dismiss")) saved.dismissed = true;
  else {
    const skip = event.target.closest("[data-setup-skip]");
    const restore = event.target.closest("[data-setup-restore]");
    const panelLink = event.target.closest("a[data-setup-panel]");
    if (skip) saved.skipped[skip.dataset.setupSkip] = true;
    else if (restore) delete saved.skipped[restore.dataset.setupRestore];
    else if (panelLink) {
      event.preventDefault();
      if (panelLink.dataset.setupReview) saved.overviewReviewed = true;
      showAppPage(panelLink.dataset.setupPanel);
    } else return;
  }
  saveSetupChecklistState(state.user.id, saved);
  renderChairpersonSetupChecklist(state.user, state.members, state.invitations || []);
});
window.addEventListener("languagechange", () => {
  if (state?.user) renderChairpersonSetupChecklist(state.user, state.members, state.invitations || []);
});
document.addEventListener("click", event => {
  if (event.target.closest("#menu-bar, #menu-toggle")) return;
  setNavigationOpen(false);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
    setNavigationOpen(false);
    menuToggle.focus();
  }
});

const profileMenuButton = $("#profile-icon");
const profileMenu = $("#profile-menu");
profileMenuButton.addEventListener("click", () => {
  const expanded = profileMenuButton.getAttribute("aria-expanded") === "true";
  profileMenuButton.setAttribute("aria-expanded", String(!expanded));
  profileMenu.hidden = expanded;
});
document.addEventListener("click", event => {
  if (event.target.closest(".profile-menu-wrap")) return;
  profileMenu.hidden = true;
  profileMenuButton.setAttribute("aria-expanded", "false");
});
document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || profileMenu.hidden) return;
  profileMenu.hidden = true;
  profileMenuButton.setAttribute("aria-expanded", "false");
  profileMenuButton.focus();
});
