#!/usr/bin/env node
// Internal-link + anchor check for the content in this repo.
//
//   npm run check:links
//   node scripts/check-links.mjs [repo-root]
//
// Every ](/...) link must point at a path listed in pages.json, and every
// #anchor must match a heading in the page it points at. Fenced code blocks are
// ignored, so a URL inside an example is not treated as a link.
//
// Needs no token and touches no network: this is the half of `--check` you can
// run before you have credentials, and the half that catches a rename.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(ROOT, 'pages.json'), 'utf8'));

// GitHub/Wiki.js-style heading slug.
const slug = (text) =>
  text
    .replace(/`/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');

const stripFences = (md) => md.replace(/^```[\s\S]*?^```/gm, '');

const byPath = new Map();
for (const page of manifest.pages) {
  const raw = await readFile(join(ROOT, page.file), 'utf8');
  const body = stripFences(raw);
  const anchors = new Set();
  for (const m of body.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) anchors.add(slug(m[1]));
  byPath.set(page.path, { page, raw, body, anchors });
}

let problems = 0;
let checked = 0;

for (const [path, { page, body }] of byPath) {
  for (const m of body.matchAll(/\]\((\/[^)\s]*)\)/g)) {
    checked++;
    const [target, hash] = m[1].split('#');
    const key = target.replace(/^\/+|\/+$/g, '');
    if (!byPath.has(key)) {
      console.log(`  BROKEN  ${page.file}: -> ${m[1]}  (no "${key}" in pages.json)`);
      problems++;
      continue;
    }
    if (hash && !byPath.get(key).anchors.has(hash)) {
      console.log(`  BROKEN  ${page.file}: -> ${m[1]}  (no heading "#${hash}" in ${key})`);
      problems++;
    }
  }
}

console.log(`\n${byPath.size} pages, ${checked} internal link(s) checked.`);
if (problems) {
  console.log(`${problems} broken.`);
  process.exit(1);
}
console.log('all internal links and anchors resolve.');
