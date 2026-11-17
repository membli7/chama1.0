"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const pause = ms => new Promise(r => setTimeout(r, ms));
async function freePort() { return new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); }); }
async function connect(url) {
  const socket = new WebSocket(url); let id = 0; const pending = new Map();
  socket.addEventListener('message', async event => {
    const message = JSON.parse(typeof event.data === 'string' ? event.data : await event.data.text());
    const item = pending.get(message.id); if (!item) return;
    pending.delete(message.id); clearTimeout(item.timer);
    message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
  });
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once:true }); socket.addEventListener('error', reject, { once:true }); });
  return { socket, send(method, params = {}) { return new Promise((resolve, reject) => { const key = ++id; const timer = setTimeout(() => { pending.delete(key); reject(new Error(method + ' timed out')); }, 10000); pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id:key, method, params })); }); } };
}
(async () => {
  const port = await freePort(); let browser, client;
  try {
    browser = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(root, '.work/footer-check-profile')}`, 'about:blank'], { stdio:'ignore', windowsHide:true });
    browser.on('error', error => { console.error(error.message); });
    let targets;
    for (let i=0;i<60;i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.some(t => t.type === 'page')) break; } catch {} await pause(100); }
    const target = targets?.find(t => t.type === 'page'); assert.ok(target, 'headless browser must start');
    client = await connect(target.webSocketDebuggerUrl);
    await client.send('Page.enable'); await client.send('Runtime.enable');
    const results = [];
    for (const width of [320,390,768,1024,1440]) {
      await client.send('Emulation.setDeviceMetricsOverride', { width, height:900, deviceScaleFactor:1, mobile:width < 768 });
      await client.send('Page.navigate', { url:'http://127.0.0.1:8001/' });
      let ready = false;
      for (let i=0;i<80;i++) { const response = await client.send('Runtime.evaluate', { expression:"Boolean(document.querySelector('body.landing-mode #login > .site-footer'))", returnByValue:true }); if (response.result.value) { ready=true; break; } await pause(100); }
      assert.ok(ready, `landing footer loads at ${width}px`);
      const response = await client.send('Runtime.evaluate', { expression:`(() => { const overlay = document.querySelector('#login'); const footer = overlay.querySelector(':scope > .site-footer'); const bounds = footer.getBoundingClientRect(); const box = overlay.getBoundingClientRect(); return { viewport:innerWidth, overlayWidth:overlay.clientWidth, footerWidth:bounds.width, offset:bounds.left-box.left, overlayOverflow:overlay.scrollWidth-overlay.clientWidth, pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth, links:[...footer.querySelectorAll('a')].map(a=>({text:a.textContent,href:a.getAttribute('href'),width:a.getBoundingClientRect().width})) }; })()`, returnByValue:true });
      const result = { width, ...response.result.value }; results.push(result);
      assert.ok(Math.abs(result.footerWidth-result.overlayWidth)<=1, `footer fills ${width}px overlay`);
      assert.ok(Math.abs(result.offset)<=1, `footer is aligned at ${width}px`);
      assert.ok(result.overlayOverflow<=1 && result.pageOverflow<=1, `no horizontal overflow at ${width}px`);
      assert.deepEqual(result.links.map(a=>a.href), ['/privacy.html','/terms.html']);
      assert.ok(result.links.every(a=>a.width>0), 'footer links remain rendered');
    }
    fs.writeFileSync(path.join(root, '.work/footer-responsive-results.json'), JSON.stringify(results,null,2));
    console.log(JSON.stringify({passed:true,viewports:results},null,2));
  } finally { client?.socket.close(); if(browser && browser.exitCode===null) browser.kill(); }
})().catch(error => { console.error(error.stack); process.exitCode=1; });
