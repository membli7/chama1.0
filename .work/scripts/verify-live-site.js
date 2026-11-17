"use strict";

(async () => {
  const base = "http://localhost:8001/";
  const response = await fetch(base, { signal: AbortSignal.timeout(5000) });
  const html = await response.text();
  const sources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)/gi)].map(match => match[1]);
  const scripts = [];
  for (const source of sources) {
    if (!source.includes("chama.js")) continue;
    const url = new URL(source, base);
    const scriptResponse = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const text = await scriptResponse.text();
    scripts.push({
      path: `${url.pathname}${url.search}`,
      status: scriptResponse.status,
      bytes: text.length,
      hasMenuSelector: text.includes("landing-menu-toggle"),
      hasClickListener: text.includes("landingMenuToggle?.addEventListener"),
      togglesHidden: text.includes("landingMobileNav.hidden = !open")
    });
  }
  console.log(JSON.stringify({ htmlStatus: response.status, scriptCount: sources.length, menuScripts: scripts }, null, 2));
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
