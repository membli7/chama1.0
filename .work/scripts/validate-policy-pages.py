from html.parser import HTMLParser
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path.cwd()
PUBLIC = ROOT / 'en public'
PAGES = {'/terms.html': PUBLIC / 'terms.html', '/privacy.html': PUBLIC / 'privacy.html'}
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

class Check(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.ids = set()
        self.links = []
        self.text = []
        self.errors = []
        self.tables = 0
        self.h1_count = 0
        self.heading_count = 0
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.add(attrs['id'])
        if tag == 'a' and 'href' in attrs:
            self.links.append(attrs['href'])
        if tag == 'table':
            self.tables += 1
        if tag in {'h1', 'h2', 'h3', 'h4', 'h5', 'h6'}:
            self.heading_count += 1
        if tag == 'h1':
            self.h1_count += 1
        if tag not in VOID:
            self.stack.append(tag)
    def handle_startendtag(self, tag, attrs):
        pass
    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append(f'unexpected closing tag </{tag}>')
        elif self.stack[-1] != tag:
            self.errors.append(f'mismatched closing tag </{tag}> while <{self.stack[-1]}> is open')
            if tag in self.stack:
                while self.stack and self.stack[-1] != tag:
                    self.stack.pop()
                if self.stack:
                    self.stack.pop()
        else:
            self.stack.pop()
    def handle_data(self, data):
        self.text.append(data)

results = {}
for route, file_path in PAGES.items():
    source = file_path.read_text(encoding='utf-8')
    parser = Check()
    parser.feed(source)
    parser.close()
    if parser.stack:
        parser.errors.append('unclosed tags: ' + ', '.join(parser.stack))
    plain = ' '.join(parser.text)
    words = len(re.findall(r'\S+', plain))
    if parser.h1_count != 1:
        parser.errors.append(f'expected one h1 page title, found {parser.h1_count}')
    if parser.heading_count < 15:
        parser.errors.append(f'only {parser.heading_count} headings found')
    if 'Review draft — not a final legal notice.' not in plain:
        parser.errors.append('draft status banner missing')
    if re.search(r'(^|\s)#{1,6}\s+|\*\*[^*]+\*\*|\]\([^)]+\)', plain):
        parser.errors.append('Markdown syntax appears unrendered')
    results[route] = {'file': file_path, 'parser': parser, 'words': words}

for route, result in results.items():
    parser = result['parser']
    for href in parser.links:
        parts = urlsplit(href)
        if parts.scheme in ('http', 'https', 'mailto') or href == '/':
            continue
        target_route = parts.path or route
        target = PAGES.get(target_route)
        if target is None:
            target = (PUBLIC / parts.path.lstrip('/')) if parts.path else result['file']
        if not target.exists():
            parser.errors.append(f'broken local link: {href}')
            continue
        if parts.fragment:
            target_result = results.get(target_route)
            if target_result is None:
                check = Check()
                check.feed(target.read_text(encoding='utf-8'))
                valid_ids = check.ids
            else:
                valid_ids = target_result['parser'].ids
            if parts.fragment not in valid_ids:
                parser.errors.append(f'broken anchor: {href}')

for route, result in results.items():
    parser = result['parser']
    print(f"{route}: words={result['words']} headings={parser.heading_count} tables={parser.tables} links={len(parser.links)} errors={len(parser.errors)}")
    for error in parser.errors:
        print('  ERROR:', error)
    if parser.errors:
        raise SystemExit(1)

print('Policy HTML structure and local-link checks passed.')
