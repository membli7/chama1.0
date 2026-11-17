"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

const root = path.resolve(__dirname, "..", "..");
const appDir = path.join(root, "chamafork");
const previewDir = path.join(root, ".work", "previews");
const profileDir = path.join(root, ".work", "chrome-mobile-profile");
const progressFile = path.join(root, ".work", "mobile-smoke-progress.log");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const report = { viewports: [], footer: [], navigation: [], pricing: [], forms: [], subscriptions: {}, chat: {}, errors: [], screenshots: [] };
const failures = [];
let browser;
let browserSocket;
let sessionId;
let targetId;
const appServers = [];
const cdpPending = new Map();
let cdpId = 0;

function check(condition, message, details) {
  if (!condition) failures.push({ message, ...(details === undefined ? {} : { details }) });
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function stage(label) {
  const line = `${new Date().toISOString()} ${label}`;
  fs.appendFileSync(progressFile, `${line}\n`, "utf8");
  console.log(line);
}
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
async function waitForHttp(url, child, getLogs, label) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error(`${label} exited (${child.exitCode}): ${getLogs().slice(-1000)}`);
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {}
    await sleep(75);
  }
  throw new Error(`${label} did not become healthy: ${getLogs().slice(-1000)}`);
}
function baseState(chama, user) {
  return {
    version: 2,
    chamas: chama ? [chama] : [],
    users: user ? [user] : [],
    transactions: [], loans: [], payouts: [], invitations: [], leadershipChanges: [], pendingMpesas: [],
    idempotency: {}, registers: [], auditLog: [], welfareReserve: 0, penalties: [], dividendCycles: [], messages: [],
    settings: { defaultDeadlineDay: 5, welfareMonthlyFee: 500, lateContributionPenalty: 200, loanMonthlyRatePercent: 5, meetingDates: {} }
  };
}
async function startAppServer(label, state, enableC2b = false) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `jirani-mobile-${label}-`));
  const dataFile = path.join(tempDir, "data.json");
  fs.writeFileSync(dataFile, JSON.stringify(state), "utf8");
  const port = await freePort();
  const childEnv = { ...process.env };
  for (const key of Object.keys(childEnv)) {
    if (key.startsWith("MPESA_") || /^(SMTP_|MAIL_|EMAIL_|SMS_)/.test(key)) childEnv[key] = "";
  }
  Object.assign(childEnv, {
    NODE_ENV: "test", DATA_BACKEND: "json", CHAMA_DATA_FILE: dataFile, PORT: String(port), APP_BIND_HOST: "127.0.0.1",
    SESSION_SECRET: "mobile-test-session-secret-not-real-0123456789", REDIS_URL: "", SESSION_STORE: "memory",
    DATABASE_URL: "", SMTP_HOST: "", SMTP_USERNAME: "", SMTP_PASSWORD: "", SMS_API_KEY: "",
    APP_CANONICAL_ORIGIN: "", APP_ALLOWED_ORIGINS: "", TRUST_PROXY: ""
  });
  if (enableC2b) Object.assign(childEnv, {
    MPESA_ENV: "sandbox",
    MPESA_C2B_CALLBACKS_ENABLED: "1",
    MPESA_C2B_VALIDATION_URL: "https://sandbox.example.test/api/mpesa/c2b/validation",
    MPESA_C2B_CONFIRMATION_URL: "https://sandbox.example.test/api/mpesa/c2b/confirmation",
    MPESA_SHORTCODE_CHAMA_MAP: "mobile-chama=600001",
    MPESA_TEST_CALLBACK_IPS: "127.0.0.1,::1",
    MPESA_CONSUMER_KEY: "", MPESA_CONSUMER_SECRET: "", MPESA_PASSKEY: "", MPESA_STK_CALLBACK_URL: ""
  });
  const child = spawn(process.execPath, ["server.js"], { cwd: appDir, env: childEnv, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const logFile = path.join(root, ".work", `mobile-${label}-server.log`);
  fs.writeFileSync(logFile, "", "utf8");
  let logs = "";
  child.stdout.on("data", chunk => { logs += chunk.toString(); fs.appendFileSync(logFile, chunk); });
  child.stderr.on("data", chunk => { logs += chunk.toString(); fs.appendFileSync(logFile, chunk); });
  const record = { child, tempDir, port, baseUrl: `http://127.0.0.1:${port}`, getLogs: () => logs, logFile };
  appServers.push(record);
  await waitForHttp(`${record.baseUrl}/api/health`, child, () => logs, `${label} app server`);
  return record;
}
async function cdp(method, params = {}, sid = sessionId) {
  const id = ++cdpId;
  let timer;
  const result = new Promise((resolve, reject) => {
    timer = setTimeout(() => { cdpPending.delete(id); reject(new Error(`Chrome DevTools command timed out: ${method}`)); }, 7000);
    cdpPending.set(id, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: error => { clearTimeout(timer); reject(error); }
    });
  });
  try { browserSocket.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) })); }
  catch (error) { clearTimeout(timer); cdpPending.delete(id); throw error; }
  return result;
}
async function evaluate(expression) {
  const response = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || "Browser evaluation failed");
  return response.result?.value;
}
async function waitForExpression(expression, label, attempts = 70) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const value = await evaluate(expression);
      if (value) return value;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}
async function navigate(url) {
  await cdp("Page.navigate", { url });
  await waitForExpression('document.readyState === "complete" && !!document.body', `page load: ${url}`);
  await sleep(250);
}
async function setViewport(width, height) {
  await cdp("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 1, mobile: true,
    screenWidth: width, screenHeight: height,
    screenOrientation: { angle: width > height ? 90 : 0, type: width > height ? "landscapePrimary" : "portraitPrimary" }
  });
  await cdp("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await sleep(100);
}
async function tap(selector) {
  const point = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el || el.hidden || !el.getClientRects().length) return null;
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height };
  })()`);
  if (!point) throw new Error(`Cannot tap missing/hidden element: ${selector}`);
  await cdp("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: point.x, y: point.y, radiusX: 2, radiusY: 2, force: 1, id: 1 }] });
  await cdp("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(160);
  return point;
}
async function capture(name) {
  const result = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const file = path.join(previewDir, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(result.data, "base64"));
  report.screenshots.push(file);
}
async function currentLayout(label, width, height) {
  const data = await evaluate(`(() => {
    const visible = el => !el.hidden && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden" && el.getClientRects().length > 0;
    const overlay = document.querySelector(".login-overlay");
    const r = overlay?.getBoundingClientRect();
    const overflow = Array.from(document.querySelectorAll("body *")).filter(visible).filter(el => {
      const b = el.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0 || (b.left >= -1 && b.right <= innerWidth + 1)) return false;
      let p = el.parentElement;
      while (p && p !== document.body) {
        const s = getComputedStyle(p);
        if (["auto", "scroll"].includes(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return false;
        p = p.parentElement;
      }
      return true;
    }).slice(0, 8).map(el => ({ tag: el.tagName.toLowerCase(), id: el.id || "", cls: String(el.className || "").slice(0, 70), left: Math.round(el.getBoundingClientRect().left), right: Math.round(el.getBoundingClientRect().right) }));
    return {
      innerWidth, innerHeight, docScrollWidth: document.documentElement.scrollWidth, bodyScrollWidth: document.body.scrollWidth,
      overlay: overlay ? { scrollWidth: overlay.scrollWidth, clientWidth: overlay.clientWidth, scrollHeight: overlay.scrollHeight, clientHeight: overlay.clientHeight, overflowX: getComputedStyle(overlay).overflowX, overflowY: getComputedStyle(overlay).overflowY, top: Math.round(r.top), bottom: Math.round(r.bottom) } : null,
      overflow
    };
  })()`);
  const item = { label, expectedWidth: width, expectedHeight: height, ...data };
  report.viewports.push(item);
  check(data.innerWidth === width, `${label}: browser viewport width differs from requested`, data);
  check(data.docScrollWidth <= data.innerWidth + 1 && data.bodyScrollWidth <= data.innerWidth + 1, `${label}: page has horizontal overflow`, data);
  check(!data.overflow.length, `${label}: visible elements extend horizontally beyond the viewport`, data.overflow);
  return data;
}
async function checkTouchTargets(label, selector, threshold = 44) {
  const targets = await evaluate(`(() => Array.from(document.querySelectorAll(${JSON.stringify(selector)})).filter(el => !el.hidden && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden" && el.getClientRects().length).map(el => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return { label: el.id || el.getAttribute("aria-label") || el.textContent.trim().replace(/\\s+/g, " ").slice(0, 50) || el.tagName.toLowerCase(), width: Math.round(r.width), height: Math.round(r.height), fontSize: s.fontSize };
  }))()`);
  const small = targets.filter(target => target.height < threshold);
  report.forms.push({ label, targetCount: targets.length, smallTargets: small });
  check(!small.length, `${label}: touch targets below ${threshold}px`, small);
  return targets;
}
async function inspectFooter(width, height) {
  const footer = await evaluate(`(() => {
    const overlay = document.querySelector(".login-overlay"), footer = document.querySelector(".site-footer");
    if (!overlay || !footer) return { found: false, overlayFound: !!overlay, footerFound: !!footer };
    overlay.scrollTop = overlay.scrollHeight;
    const o = overlay.getBoundingClientRect(), f = footer.getBoundingClientRect();
    return { found: true, contained: overlay.contains(footer), scrollTop: overlay.scrollTop, scrollHeight: overlay.scrollHeight, clientHeight: overlay.clientHeight, top: Math.round(f.top), bottom: Math.round(f.bottom), overlayTop: Math.round(o.top), overlayBottom: Math.round(o.bottom), footerHeight: Math.round(f.height), documentScrollTop: document.documentElement.scrollTop };
  })()`);
  const entry = { width, height, ...footer };
  report.footer.push(entry);
  check(footer.found && footer.contained && footer.footerHeight > 0, `Footer is missing or outside the scrollable landing overlay at ${width}x${height}`, footer);
  check(footer.bottom <= footer.overlayBottom + 1 && footer.top >= footer.overlayTop - 1, `Footer is not fully reachable at the bottom of the landing overlay at ${width}x${height}`, footer);
  return footer;
}
async function checkNav(width, height) {
  const before = await evaluate(`(() => { const b=document.querySelector("#landing-menu-toggle"); return b ? {visible:!!b.getClientRects().length, expanded:b.getAttribute("aria-expanded")} : null; })()`);
  if (!before?.visible) return { width, height, mobileButtonVisible: false, desktopNavVisible: await evaluate('!!document.querySelector(".topbar-nav")?.getClientRects().length') };
  const button = await tap("#landing-menu-toggle");
  const opened = await evaluate(`(() => { const b=document.querySelector("#landing-menu-toggle"), n=document.querySelector("#landing-mobile-nav"); const r=n.getBoundingClientRect(); return { hidden:n.hidden, expanded:b.getAttribute("aria-expanded"), links:n.querySelectorAll("a").length, width:Math.round(r.width), left:Math.round(r.left), right:Math.round(r.right), linkHeights:Array.from(n.querySelectorAll("a")).map(a=>Math.round(a.getBoundingClientRect().height)) }; })()`);
  check(!opened.hidden && opened.expanded === "true" && opened.links >= 6, `Mobile navigation did not open correctly at ${width}x${height}`, opened);
  check(opened.right <= width + 1 && opened.left >= -1, `Mobile navigation exceeds viewport at ${width}x${height}`, opened);
  check(opened.linkHeights.every(h => h >= 44), `Mobile navigation has a tap target below 44px at ${width}x${height}`, opened.linkHeights);
  await tap('#landing-mobile-nav a[href="#pricing"]');
  const closed = await evaluate(`(() => ({hidden:document.querySelector("#landing-mobile-nav").hidden, expanded:document.querySelector("#landing-menu-toggle").getAttribute("aria-expanded"), hash:location.hash}))()`);
  check(closed.hidden && closed.expanded === "false", `Mobile navigation did not close after a section selection at ${width}x${height}`, closed);
  const entry = { width, height, ...opened, tapButton: button, afterSelection: closed };
  report.navigation.push(entry);
  return entry;
}
async function checkPricingModal(width, height) {
  const cases = [
    { selector: '[data-pricing-tier="Basic"][data-pricing-billing="Annual"]', expected: { tier: "Basic", cap: "Up to 10 members", billing: "Annual", total: "KSh 2,880", savings: "Save KSh 720 · KSh 240/month equivalent" } },
    { selector: '[data-pricing-tier="Growth Chama"][data-pricing-billing="Annual"]', expected: { tier: "Growth Chama", cap: "Up to 30 members", billing: "Annual", total: "KSh 5,760", savings: "Save KSh 1,440 · KSh 480/month equivalent" } },
    { selector: '[data-pricing-tier="Enterprise / Investment"]', expected: { tier: "Enterprise / Investment", cap: "Custom member cap for groups above 30 members", billing: "Custom", total: "Agreed with sales" } }
  ];
  for (const [index, item] of cases.entries()) {
    await tap(item.selector);
    const modal = await evaluate(`(() => {
      const d=document.querySelector("#pricing-modal"), r=d.getBoundingClientRect(), c=d.querySelector(".pricing-modal-content"), cr=c.getBoundingClientRect();
      return { open:d.open, left:Math.round(r.left), right:Math.round(r.right), top:Math.round(r.top), bottom:Math.round(r.bottom), width:Math.round(r.width), height:Math.round(r.height), scrollHeight:d.scrollHeight, clientHeight:d.clientHeight, overflowY:getComputedStyle(d).overflowY, contentHeight:Math.round(cr.height), contentScrollHeight:c.scrollHeight, contentClientHeight:c.clientHeight,
        fields:{ tier:document.querySelector("#pricing-modal-tier").textContent, cap:document.querySelector("#pricing-modal-cap").textContent, billing:document.querySelector("#pricing-modal-billing").textContent, total:document.querySelector("#pricing-modal-total").textContent, savings:document.querySelector("#pricing-modal-savings").textContent },
        contactText:document.querySelector("#pricing-contact").textContent.trim() };
    })()`);
    check(modal.open, `Pricing modal did not open from ${item.selector}`, modal);
    check(modal.left >= -1 && modal.right <= width + 1 && modal.top >= -1 && modal.bottom <= height + 1, `Pricing modal clips outside ${width}x${height}`, modal);
    for (const [key, value] of Object.entries(item.expected)) check(modal.fields[key] === value, `Pricing modal ${key} mismatch for ${item.expected.tier}`, modal.fields);
    check(/Contact us about this plan/i.test(modal.contactText), "Pricing modal next action is not the contact enquiry", modal.contactText);
    if (index === 0 && width <= 390) await capture(`pricing-modal-${width}x${height}`);
    const entry = { viewport: `${width}x${height}`, selection: item.expected.tier, ...modal };
    report.pricing.push(entry);
    await tap("#pricing-modal-cancel");
    check(!(await evaluate('document.querySelector("#pricing-modal").open')), "Pricing modal did not close from its cancel action.");
  }
}
async function checkContactForm(width, height) {
  const info = await evaluate(`(() => {
    const s=document.querySelector("#contact"), f=document.querySelector("#contact-form");
    if (!s || !f) return { found:false, section:!!s, form:!!f };
    s.scrollIntoView({block:"start", inline:"nearest"});
    const r=f.getBoundingClientRect();
    return {found:true, action:f.getAttribute("action"), fields:Array.from(f.querySelectorAll("input,textarea")).map(el=>{const b=el.getBoundingClientRect(), cs=getComputedStyle(el);return {id:el.id, width:Math.round(b.width),height:Math.round(b.height),fontSize:cs.fontSize,required:el.required};}), submit:(()=>{const b=document.querySelector("#contact-submit").getBoundingClientRect();return {width:Math.round(b.width),height:Math.round(b.height)};})(), left:Math.round(r.left),right:Math.round(r.right), hash:location.hash};
  })()`);
  check(info.found && info.action === "/api/contact" && info.fields.length === 4, `Contact form is missing or incomplete at ${width}x${height}`, info);
  check(info.fields.every(field => field.height >= 44 && parseFloat(field.fontSize) >= 16 && field.width <= width + 1), `Contact form fields are too small or overflow at ${width}x${height}`, info.fields);
  check(info.submit.height >= 44 && info.submit.width <= width + 1, `Contact submit button is not mobile-friendly at ${width}x${height}`, info.submit);
  for (const field of info.fields) {
    await tap(`#${field.id}`);
    const active = await evaluate(`document.activeElement?.id === ${JSON.stringify(field.id)}`);
    check(active, `Contact field ${field.id} did not receive a touch/focus at ${width}x${height}`);
  }
  if (width <= 390) await capture(`contact-form-${width}x${height}`);
  report.forms.push({ label: `contact form ${width}x${height}`, ...info });
}
function visibleControlSummaryExpression() {
  return `(() => {
    const visible=el=>!el.hidden&&getComputedStyle(el).display!=="none"&&getComputedStyle(el).visibility!=="hidden"&&el.getClientRects().length>0;
    return Array.from(document.querySelectorAll("button,input,select,textarea,.button-primary,[role=button]")).filter(visible).map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{id:el.id||"",tag:el.tagName.toLowerCase(),label:(el.getAttribute("aria-label")||el.textContent||el.placeholder||"").trim().replace(/\\s+/g," ").slice(0,45),width:Math.round(r.width),height:Math.round(r.height),fontSize:s.fontSize};});
  })()`;
}
async function checkMemberLogin(server) {
  await navigate(`${server.baseUrl}/member-login.html`);
  for (const size of [{ w: 320, h: 568 }, { w: 390, h: 844 }, { w: 768, h: 1024 }]) {
    await setViewport(size.w, size.h);
    const layout = await currentLayout(`member-login-${size.w}x${size.h}`, size.w, size.h);
    const controls = await evaluate(visibleControlSummaryExpression());
    const short = controls.filter(item => item.height < 44);
    check(!short.length, `Member-login controls below 44px at ${size.w}x${size.h}`, short);
    const formRect = await evaluate(`(() => { const r=document.querySelector("#login-form").getBoundingClientRect(); return {left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),bottom:Math.round(r.bottom),width:Math.round(r.width)}; })()`);
    check(formRect.left >= -1 && formRect.right <= size.w + 1, `Member-login form exceeds viewport at ${size.w}x${size.h}`, formRect);
    report.forms.push({ label: `member login ${size.w}x${size.h}`, controls, layout, formRect });
  }
  await setViewport(390, 844);
  const pinTypeBefore = await evaluate('document.querySelector("#login-pin").type');
  await tap("#toggleLoginPin");
  const pinToggle = await evaluate(`({type:document.querySelector("#login-pin").type,pressed:document.querySelector("#toggleLoginPin").getAttribute("aria-pressed")})`);
  check(pinTypeBefore === "password" && pinToggle.type === "text" && pinToggle.pressed === "true", "Mobile PIN visibility control did not toggle correctly", pinToggle);
  await tap("#toggleLoginPin");
  await evaluate(`(() => { const set=(id,value)=>{const e=document.querySelector(id);const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),"value");d.set.call(e,value);e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));};set("#login-phone","+254711000001");set("#login-pin","123456");})()`);
  await tap('#login-form button[type="submit"]');
  await waitForExpression('location.pathname === "/" && document.querySelector("#app") && !document.querySelector("#app").hidden', "test chairperson sign-in and dashboard load", 100);
  const unpaid = await evaluate(`(async()=>{const r=await fetch("/api/dashboard",{credentials:"same-origin"});const j=await r.json();return{httpStatus:r.status,subscription:j.subscription&&{status:j.subscription.status,tier:j.subscription.tier,renewalMessage:j.subscription.renewalMessage},chatPanel:!!document.querySelector("#chat-panel"),noticeHidden:document.querySelector("#subscription-notice").hidden,noticeText:document.querySelector("#subscription-notice-copy").textContent};})()`);
  check(unpaid.httpStatus === 200 && unpaid.subscription?.status !== "active" && !unpaid.noticeHidden && unpaid.noticeText.length > 0, "Unpaid mobile dashboard state is not visible or truthful", unpaid);
  report.subscriptions.unpaid = unpaid;
  await capture("dashboard-unpaid-390x844");

  for (const size of [{ w: 320, h: 568 }, { w: 390, h: 844 }, { w: 768, h: 1024 }, { w: 844, h: 390 }]) {
    await setViewport(size.w, size.h);
    const layout = await currentLayout(`dashboard-unpaid-${size.w}x${size.h}`, size.w, size.h);
    const notice = await evaluate(`(()=>{const el=document.querySelector("#subscription-notice"),r=el.getBoundingClientRect();return{hidden:el.hidden,left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),bottom:Math.round(r.bottom),width:Math.round(r.width),height:Math.round(r.height)}})()`);
    check(!notice.hidden && notice.left >= -1 && notice.right <= size.w + 1, `Unpaid subscription notice clips at ${size.w}x${size.h}`, notice);
    report.viewports.push({ label: `unpaid-dashboard-notice-${size.w}x${size.h}`, ...layout, notice });
  }
  await setViewport(390, 844);
  await tap("#notification-button");
  const chat = await evaluate(`(async()=>{const p=document.querySelector("#chat-panel"),r=p.getBoundingClientRect(),s=getComputedStyle(p),res=await fetch("/api/messages",{credentials:"same-origin"});return{panelFound:!!p,panelVisible:!!p.getClientRects().length&&s.display!=="none"&&!p.hidden,width:Math.round(r.width),left:Math.round(r.left),right:Math.round(r.right),messagesStatus:res.status,composer:!!p.querySelector("textarea,input")};})()`);
  report.chat.unpaid = chat;
  check(chat.panelFound && chat.messagesStatus === 200, "Chat/history are not available in the unpaid mobile state", chat);
  check(chat.right <= 391 && chat.left >= -1, "Chat panel exceeds the mobile viewport in unpaid state", chat);

  const selected = await evaluate(`(async()=>{const r=await fetch("/api/subscription/selection",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-Requested-With":"chama","Idempotency-Key":"mobile-plan-selection-0001"},body:JSON.stringify({tier:"basic",billing:"annual"})});return{status:r.status,body:await r.json()};})()`);
  check(selected.status === 201 && selected.body.plan?.paymentEnabled === false && selected.body.plan?.paymentRequestStarted === false && selected.body.plan?.amount === 2880, "Mobile plan selection did not remain non-charging and exact", selected);
  const reference = selected.body.plan?.reference;
  if (reference) {
    const payment = { TransID: "TESTMOBILERECEIPT01", BusinessShortCode: "600001", BillRefNumber: reference, TransTime: "20261107123456", TransAmount: "2880.00", MSISDN: "254711000001" };
    const callback = async (route, payload) => evaluate(`(async()=>{const r=await fetch(${JSON.stringify(route)},{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(${JSON.stringify(payload)})});return{status:r.status,body:await r.json()};})()`);
    const mismatch = await callback("/api/mpesa/c2b/validation", { ...payment, TransAmount: "2880.01" });
    check(mismatch.status === 200 && mismatch.body.ResultCode === 1, "Synthetic mobile mismatch callback was not rejected", mismatch);
    const before = await evaluate(`(async()=>{const r=await fetch("/api/dashboard");return(await r.json()).subscription.status;})()`);
    check(before !== "active", "Mismatched mobile callback changed subscription access", before);
    const validation = await callback("/api/mpesa/c2b/validation", payment);
    check(validation.status === 200 && validation.body.ResultCode === 0, "Synthetic sandbox validation did not accept the exact plan", validation);
    const confirmation = await callback("/api/mpesa/c2b/confirmation", payment);
    check(confirmation.status === 200 && confirmation.body.ResultCode === 0, "Synthetic sandbox confirmation did not activate the plan", confirmation);
    await cdp("Page.reload", { ignoreCache: true });
    await waitForExpression('document.querySelector("#app") && !document.querySelector("#app").hidden && document.querySelector("#subscription-notice").hidden === true', "active mobile dashboard render", 100);
    const paid = await evaluate(`(async()=>{const r=await fetch("/api/dashboard",{credentials:"same-origin"});const j=await r.json();return{httpStatus:r.status,subscription:j.subscription&&{status:j.subscription.status,tier:j.subscription.tier,maxMembers:j.subscription.maxMembers,expectedAmount:j.subscription.expectedAmount},noticeHidden:document.querySelector("#subscription-notice").hidden,chatPanel:!!document.querySelector("#chat-panel")};})()`);
    report.subscriptions.paid = paid;
    check(paid.httpStatus === 200 && paid.subscription?.status === "active" && paid.subscription?.tier === "Basic" && paid.noticeHidden, "Verified mobile subscription state did not render as active", paid);
    await capture("dashboard-active-390x844");
    for (const size of [{ w: 320, h: 568 }, { w: 390, h: 844 }, { w: 768, h: 1024 }]) {
      await setViewport(size.w, size.h);
      const layout = await currentLayout(`dashboard-active-${size.w}x${size.h}`, size.w, size.h);
      report.viewports.push({ label: `active-dashboard-${size.w}x${size.h}`, ...layout });
    }
  }
}
async function checkRegisterForm(server) {
  await navigate(`${server.baseUrl}/register.html?new-chama=1`);
  await waitForExpression('document.querySelector("#register-chama-form") && !document.querySelector("#register-chama-form").hidden', "new-chama registration form");
  for (const size of [{ w: 320, h: 568 }, { w: 390, h: 844 }, { w: 768, h: 1024 }]) {
    await setViewport(size.w, size.h);
    const layout = await currentLayout(`register-${size.w}x${size.h}`, size.w, size.h);
    const controls = await evaluate(visibleControlSummaryExpression());
    const short = controls.filter(item => item.height < 44);
    check(!short.length, `Registration controls below 44px at ${size.w}x${size.h}`, short);
    const formRect = await evaluate(`(()=>{const r=document.querySelector("#register-chama-form").getBoundingClientRect();return{left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),bottom:Math.round(r.bottom),width:Math.round(r.width),scrollHeight:document.querySelector("#auth-page").scrollHeight,clientHeight:document.querySelector("#auth-page").clientHeight}})()`);
    check(formRect.left >= -1 && formRect.right <= size.w + 1, `Registration form exceeds viewport at ${size.w}x${size.h}`, formRect);
    report.forms.push({ label: `register ${size.w}x${size.h}`, controls, layout, formRect });
  }
  await setViewport(320, 568);
  await capture("register-form-320x568");
}

async function cleanup() {
  if (browserSocket) { try { await browserSocket.close(); } catch {} browserSocket = null; }
  if (browser && browser.exitCode === null) {
    browser.kill();
    await Promise.race([once(browser, "exit").catch(() => {}), sleep(2500)]);
  }
  for (const server of appServers) {
    if (server.child.exitCode === null) {
      server.child.kill();
      await Promise.race([once(server.child, "exit").catch(() => {}), sleep(2500)]);
    }
    try { fs.rmSync(server.tempDir, { recursive: true, force: true }); } catch {}
  }
}

async function main() {
  fs.mkdirSync(previewDir, { recursive: true });
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(progressFile, "", "utf8");
  const salt = "jirani-mobile-test-salt";
  const user = { id: "mobile-chair", name: "Mobile Test Chair", phone: "+254711000001", email: "chair@example.test", role: "chairperson", status: "active", pinHash: `${salt}:${crypto.scryptSync("123456", salt, 64).toString("hex")}`, mustChangePin: false, chamaId: "mobile-chama" };
  const chama = { id: "mobile-chama", name: "Mobile Test Chama", createdAt: new Date().toISOString() };
  stage("Starting disposable primary and registration servers");
  const mainServer = await startAppServer("main", baseState(chama, user), true);
  stage(`Primary server healthy on loopback port ${mainServer.port}`);
  const registerServer = await startAppServer("register", baseState(null, null), false);
  stage(`Registration server healthy on loopback port ${registerServer.port}`);

  const debugPort = await freePort();
  browser = spawn(chromePath, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--disable-sync", "--disable-default-apps", "--disable-extensions", "--disable-translate", "--metrics-recording-only",
    "--remote-allow-origins=*", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profileDir}`, "about:blank"
  ], { stdio: ["ignore", "ignore", "ignore"], windowsHide: true });
  const browserSpawned = new Promise((resolve, reject) => { browser.once("spawn", resolve); browser.once("error", reject); });
  await browserSpawned;
  stage(`Started isolated Chrome DevTools session on loopback port ${debugPort}`);
  let pageTarget;
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(500) });
      if (response.ok) pageTarget = (await response.json()).find(target => target.type === "page" && target.webSocketDebuggerUrl);
      if (pageTarget) break;
    } catch {}
    if (browser.exitCode !== null) throw new Error(`Headless Chrome exited before its DevTools endpoint was available (${browser.exitCode}).`);
    await sleep(75);
  }
  if (!pageTarget?.webSocketDebuggerUrl) throw new Error("Chrome DevTools page target did not start.");
  const pageDevtoolsUrl = new URL(pageTarget.webSocketDebuggerUrl);
  if (pageDevtoolsUrl.hostname === "localhost") pageDevtoolsUrl.hostname = "127.0.0.1";
  browserSocket = new WebSocket(pageDevtoolsUrl.href);
  await Promise.race([
    new Promise((resolve, reject) => { browserSocket.addEventListener("open", resolve, { once: true }); browserSocket.addEventListener("error", reject, { once: true }); }),
    sleep(7000).then(() => { throw new Error("Chrome DevTools WebSocket did not open within 7 seconds."); })
  ]);
  browserSocket.addEventListener("message", async event => {
    let message;
    try {
      let text;
      if (typeof event.data === "string") text = event.data;
      else if (Buffer.isBuffer(event.data)) text = event.data.toString("utf8");
      else if (event.data instanceof ArrayBuffer) text = Buffer.from(event.data).toString("utf8");
      else if (event.data && typeof event.data.text === "function") text = await event.data.text();
      else text = String(event.data);
      message = JSON.parse(text);
    } catch (error) { report.errors.push(`DevTools response parse error: ${error.message}`); return; }
    if (message.method === "Runtime.exceptionThrown") report.errors.push(message.params.exceptionDetails?.text || "Browser runtime exception");
    if (message.id && cdpPending.has(message.id)) {
      const pending = cdpPending.get(message.id); cdpPending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result || {});
    }
  });
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Network.enable");
  await cdp("Log.enable");
  await cdp("Network.setBlockedURLs", { urls: ["https://*"] });
  stage("Chrome DevTools connected; starting viewport and interaction checks");

  await setViewport(320, 568);
  await navigate(`${mainServer.baseUrl}/`);
  await waitForExpression('document.querySelector(".login-overlay") && document.querySelector("#landing-menu-toggle")', "signed-out landing page");
  for (const size of [{ w: 320, h: 568 }, { w: 360, h: 800 }, { w: 390, h: 844 }, { w: 768, h: 1024 }, { w: 1024, h: 768 }, { w: 844, h: 390 }]) {
    await setViewport(size.w, size.h);
    await evaluate('window.scrollTo(0,0); const o=document.querySelector(".login-overlay"); if(o)o.scrollTop=0;');
    await currentLayout(`landing-${size.w}x${size.h}`, size.w, size.h);
    await inspectFooter(size.w, size.h);
  }
  for (const size of [{ w: 320, h: 568 }, { w: 390, h: 844 }, { w: 768, h: 1024 }]) {
    await setViewport(size.w, size.h);
    await evaluate('const o=document.querySelector(".login-overlay"); if(o)o.scrollTop=0;');
    await checkNav(size.w, size.h);
  }
  await setViewport(320, 568);
  await checkPricingModal(320, 568);
  await setViewport(390, 844);
  await checkPricingModal(390, 844);
  await checkContactForm(390, 844);
  await capture("landing-contact-390x844");
  await setViewport(768, 1024);
  await checkPricingModal(768, 1024);
  await checkContactForm(768, 1024);
  const landingTargets = await checkTouchTargets("landing touch controls 390x844", 'button, input, select, textarea, #landing-mobile-nav a, .site-footer-links a, .contact-route-link');
  report.landingTouchTargets = landingTargets;

  await checkMemberLogin(mainServer);
  stage("Landing, dialogs, contact, member login, and subscription UI checks complete");
  await checkRegisterForm(registerServer);
  stage("Registration form checks complete; collecting final results");

  await cleanup();
  report.errors = [...new Set(report.errors)];
  const resultsFile = path.join(root, ".work", "mobile-test-results.json");
  fs.writeFileSync(resultsFile, JSON.stringify({ report, failures }, null, 2), "utf8");
  console.log(JSON.stringify({ resultsFile, failures, viewportsChecked: report.viewports.length, footerChecks: report.footer.length, pricingModalChecks: report.pricing.length, formsChecked: report.forms.length, unpaid: report.subscriptions.unpaid, paid: report.subscriptions.paid, chat: report.chat, browserErrors: report.errors, screenshots: report.screenshots }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch(async error => {
  console.error(`Mobile smoke test aborted: ${error.stack || error.message}`);
  try { stage(`Failed: ${error.message}`); } catch {}
  await cleanup();
  try { fs.writeFileSync(path.join(root, ".work", "mobile-test-results.json"), JSON.stringify({ report, failures, error: error.message }, null, 2), "utf8"); } catch {}
  process.exitCode = 1;
});
