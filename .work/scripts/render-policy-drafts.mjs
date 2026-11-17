import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const documents = [
  { source: 'docs/terms-and-conditions-draft.md', output: 'en public/terms.html', title: 'Terms and Conditions', page: 'terms' },
  { source: 'docs/privacy-policy-draft.md', output: 'en public/privacy.html', title: 'Privacy Policy', page: 'privacy' },
];

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function slugify(value) {
  return value.toLowerCase().replace(/&/g, ' and ').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}
function resolveHref(href, page) {
  const clean = href.trim();
  if (clean === 'terms-and-conditions-draft.md') return '/terms.html';
  if (clean === 'privacy-policy-draft.md') return '/privacy.html';
  if (clean === 'kenyan-legal-research-notes.md') return page === 'privacy' ? '#17-more-information-and-official-sources' : '/privacy.html#17-more-information-and-official-sources';
  return clean;
}
function renderInline(input, page) {
  const placeholders = [];
  const hold = (html) => {
    const token = `@@POLICY_INLINE_${placeholders.length}@@`;
    placeholders.push(html);
    return token;
  };
  let text = input.replace(/`([^`]+)`/g, (_match, code) => hold(`<code>${escapeHtml(code)}</code>`));
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, rawHref) => {
    const href = resolveHref(rawHref, page);
    const attrs = /^https?:\/\//i.test(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
    return hold(`<a href="${escapeHtml(href)}"${attrs}>${renderInline(label, page)}</a>`);
  });
  text = escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return text.replace(/@@POLICY_INLINE_(\d+)@@/g, (_match, index) => placeholders[Number(index)]);
}
function isTableStart(lines, index) {
  return lines[index]?.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] ?? '');
}
function tableCells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}
function renderTable(lines, start, page) {
  const header = tableCells(lines[start]);
  let index = start + 2;
  const rows = [];
  while (index < lines.length && lines[index].trim() && lines[index].includes('|')) rows.push(tableCells(lines[index++]));
  const head = `<thead><tr>${header.map((cell) => `<th scope="col">${renderInline(cell, page)}</th>`).join('')}</tr></thead>`;
  const body = `<tbody>${rows.map((row) => `<tr>${header.map((_cell, cellIndex) => `<td>${renderInline(row[cellIndex] ?? '', page)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return { html: `<div class="table-wrap" role="region" aria-label="Scrollable policy table" tabindex="0"><table>${head}${body}</table></div>`, next: index };
}
function renderMarkdown(markdown, page) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      out.push(`<h${level} id="${escapeHtml(slugify(text))}">${renderInline(text, page)}</h${level}>`);
      i += 1;
      continue;
    }
    if (isTableStart(lines, i)) {
      const table = renderTable(lines, i, page);
      out.push(table.html);
      i = table.next;
      continue;
    }
    const firstItem = line.match(/^\s*(-|\*|\d+\.)\s+(.+)$/);
    if (firstItem) {
      const ordered = /^\d+\.$/.test(firstItem[1]);
      const tag = ordered ? 'ol' : 'ul';
      const items = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*(-|\*|\d+\.)\s+(.+)$/);
        if (!item || /^\d+\.$/.test(item[1]) !== ordered) break;
        items.push(`<li>${renderInline(item[2].trim(), page)}</li>`);
        i += 1;
      }
      out.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${quote.map((part) => `<p>${renderInline(part, page)}</p>`).join('')}</blockquote>`);
      continue;
    }
    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s+/.test(lines[i]) && !isTableStart(lines, i) && !/^\s*(-|\*|\d+\.)\s+/.test(lines[i]) && !/^>\s?/.test(lines[i])) paragraph.push(lines[i++]);
    const rendered = paragraph.map((part) => `${renderInline(part.trim(), page)}${/\s{2,}$/.test(part) ? '<br>' : ''}`);
    out.push(`<p>${rendered.join(' ')}</p>`);
  }
  return out.join('\n');
}
function makePage({ content, title }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(title)} | Jirani Chama</title>
  <link rel="stylesheet" href="/chama.css?v=20261107.5">
</head>
<body>
  <main id="login" class="login-overlay">
    <article class="login-card">
      <nav class="login-footer" aria-label="Policy navigation">
        <a href="/">Jirani Chama home</a> ·
        <a href="/terms.html">Terms and Conditions</a> ·
        <a href="/privacy.html">Privacy Policy</a>
      </nav>
      <aside class="login-notice" role="note">
        <p><strong>Review draft — not a final legal notice.</strong> Operator identity, processing roles, service providers, data locations, retention periods, and other marked facts still require confirmation. These pages do not record acceptance, and no sign-in acceptance gate is active. Do not treat this draft as proof that a person agreed to it.</p>
      </aside>
      ${content}
      <footer class="login-footer">
        <p><a href="/terms.html">Terms and Conditions</a> · <a href="/privacy.html">Privacy Policy</a> · <a href="/">Back to Jirani Chama</a></p>
        <p>Draft dated 11 November 2026. Review the legal and factual details before deployment.</p>
      </footer>
    </article>
  </main>
</body>
</html>
`;
}

for (const doc of documents) {
  const markdown = fs.readFileSync(path.join(root, doc.source), 'utf8');
  const content = renderMarkdown(markdown, doc.page);
  fs.writeFileSync(path.join(root, doc.output), makePage({ content, title: doc.title }), 'utf8');
  console.log(`${doc.output}: rendered ${markdown.split(/\s+/).filter(Boolean).length} source words`);
}
