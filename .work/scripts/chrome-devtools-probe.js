"use strict";

const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profile = path.resolve(__dirname, "..", "chrome-probe-profile");

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
function connect(url, label) {
  const endpoint = new URL(url);
  if (endpoint.hostname === "localhost") endpoint.hostname = "127.0.0.1";
  const ws = new WebSocket(endpoint.href);
  const pending = new Map();
  let nextId = 0;
  ws.addEventListener("error", event => console.error(`${label} websocket error: ${event.type}, state=${ws.readyState}, host=${endpoint.hostname}:${endpoint.port}${endpoint.pathname}`));
  ws.addEventListener("message", async event => {
    let text;
    try {
      if (typeof event.data === "string") text = event.data;
      else if (Buffer.isBuffer(event.data)) text = event.data.toString("utf8");
      else if (event.data instanceof ArrayBuffer) text = Buffer.from(event.data).toString("utf8");
      else if (event.data && typeof event.data.text === "function") text = await event.data.text();
      else text = String(event.data);
      console.log(`${label} message (${typeof event.data}): ${text.slice(0, 300)}`);
      const message = JSON.parse(text);
      if (message.id && pending.has(message.id)) {
        const { resolve, reject, timer } = pending.get(message.id);
        clearTimeout(timer); pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message)); else resolve(message.result || {});
      }
    } catch (error) { console.log(`${label} message parse: ${error.message}`); }
  });
  return {
    ws,
    async open() {
      await Promise.race([
        new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", event => reject(new Error(`${label} websocket error: ${event.type}, state=${ws.readyState}, host=${endpoint.hostname}:${endpoint.port}${endpoint.pathname}`)), { once: true }); }),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} websocket open timed out`)), 5000))
      ]);
    },
    request(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${label} ${method} timed out`)); }, 3000);
        pending.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }
  };
}

(async () => {
  let chrome;
  const port = await freePort();
  try {
    chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--remote-allow-origins=*", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: ["ignore", "ignore", "ignore"], windowsHide: true });
    await Promise.race([once(chrome, "spawn"), once(chrome, "error").then(([error]) => { throw error; })]);
    let version;
    for (let i = 0; i < 30 && !version; i += 1) {
      try { const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) }); if (response.ok) version = await response.json(); } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!version?.webSocketDebuggerUrl) throw new Error("Chrome browser DevTools endpoint unavailable");
    console.log(`Chrome endpoint: ${new URL(version.webSocketDebuggerUrl).pathname}; browser version metadata received.`);
    const browserDevtools = connect(version.webSocketDebuggerUrl, "browser");
    await browserDevtools.open();
    const browserVersion = await browserDevtools.request("Browser.getVersion");
    console.log(`Browser.getVersion responded: ${browserVersion.product || "product not reported"}`);

    const listResponse = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) });
    const targets = await listResponse.json();
    const page = targets.find(target => target.type === "page" && target.webSocketDebuggerUrl);
    if (!page) throw new Error(`No page target found; target count=${targets.length}`);
    console.log(`Page target discovered: type=${page.type}, url=${page.url}, path=${new URL(page.webSocketDebuggerUrl).pathname}`);
    const pageDevtools = connect(page.webSocketDebuggerUrl, "page");
    await pageDevtools.open();
    await pageDevtools.request("Runtime.enable");
    console.log("Page Runtime.enable responded.");
    await pageDevtools.request("Page.enable");
    console.log("Page Page.enable responded.");
    await pageDevtools.request("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    console.log("Mobile device emulation command responded.");
    pageDevtools.ws.close();
    browserDevtools.ws.close();
  } catch (error) {
    console.error(`Chrome DevTools probe failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  } finally {
    if (chrome && chrome.exitCode === null) {
      chrome.kill();
      await Promise.race([once(chrome, "exit").catch(() => {}), new Promise(resolve => setTimeout(resolve, 2000))]);
    }
  }
})();
