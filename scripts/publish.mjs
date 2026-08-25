#!/usr/bin/env node
// Publish the markdown in this repo to a Wiki.js 2 instance.
//
//   node scripts/publish.mjs --check     diff local vs live, change nothing
//   node scripts/publish.mjs --pull      overwrite local files with live content
//   node scripts/publish.mjs             publish (create or update) every page
//   node scripts/publish.mjs --only protocols/pull      one page
//
// Env: WIKI_URL (e.g. https://developer.staging.codriver.io), WIKI_TOKEN
// (Wiki.js Admin -> API Access -> New API Key; one token per environment).
//
// Publish to staging first. Prod is a deliberate second command with a
// different WIKI_URL/WIKI_TOKEN — there is no --prod flag on purpose.
//
// The wiki is editable in its own UI, so live content can drift ahead of this
// repo. Publishing overwrites the live page with what is here — so run
// `--check` first, and `--pull` to bring a UI edit back into git before you
// publish over it.
//
// A token is required for every mode, including --check: anonymous users can
// list pages but not read their source (pages.single is authorized).

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;
const MODE = args.has('--check') ? 'check' : args.has('--pull') ? 'pull' : 'publish';

const WIKI_URL = (process.env.WIKI_URL || '').replace(/\/+$/, '');
const WIKI_TOKEN = process.env.WIKI_TOKEN || '';
if (!WIKI_URL) die('WIKI_URL is not set (e.g. https://developer.staging.codriver.io)');
if (!WIKI_TOKEN) die('WIKI_TOKEN is not set (Wiki.js Admin -> API Access -> New API Key)');

function die(msg) { console.error(`error: ${msg}`); process.exit(1); }

async function gql(query, variables = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (WIKI_TOKEN) headers.Authorization = `Bearer ${WIKI_TOKEN}`;
  const res = await fetch(`${WIKI_URL}/graphql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) die(`HTTP ${res.status} from ${WIKI_URL}/graphql`);
  const body = await res.json();
  if (body.errors?.length) die(`GraphQL: ${body.errors.map((e) => e.message).join('; ')}`);
  return body.data;
}

// Wiki.js wraps every mutation result in responseResult; a failure there is
// HTTP 200 with succeeded:false, so it has to be checked explicitly.
function assertOk(result, what) {
  const r = result?.responseResult;
  if (!r?.succeeded) die(`${what} failed: ${r?.message || 'unknown'} (${r?.errorCode ?? '?'})`);
}

const listPages = () => gql(`{ pages { list(orderBy: PATH) { id path title } } }`)
  .then((d) => new Map(d.pages.list.map((p) => [p.path, p])));

const pageContent = (id) => gql(`query($id: Int!) { pages { single(id: $id) { content } } }`, { id })
  .then((d) => d.pages.single.content);

const CREATE = `mutation($content:String!,$description:String!,$path:String!,$title:String!,$tags:[String]!){
  pages { create(content:$content, description:$description, editor:"markdown", isPublished:true,
                 isPrivate:false, locale:"en", path:$path, title:$title, tags:$tags) {
    responseResult { succeeded errorCode message } page { id } } } }`;

const UPDATE = `mutation($id:Int!,$content:String!,$description:String!,$title:String!,$tags:[String]!){
  pages { update(id:$id, content:$content, description:$description, title:$title,
                 tags:$tags, isPublished:true) {
    responseResult { succeeded errorCode message } page { id updatedAt } } } }`;

const manifest = JSON.parse(await readFile(join(ROOT, 'pages.json'), 'utf8'));
const pages = manifest.pages.filter((p) => !ONLY || p.path === ONLY);
if (!pages.length) die(ONLY ? `no page with path "${ONLY}" in pages.json` : 'pages.json is empty');

const live = await listPages();
console.log(`${MODE} · ${WIKI_URL} · ${pages.length} page(s)\n`);

let changed = 0, created = 0, drifted = 0;

for (const page of pages) {
  const local = await readFile(join(ROOT, page.file), 'utf8');
  const existing = live.get(page.path);

  if (!existing) {
    if (MODE === 'publish') {
      const d = await gql(CREATE, {
        content: local, description: page.description, path: page.path,
        title: page.title, tags: page.tags ?? [],
      });
      assertOk(d.pages.create, `create ${page.path}`);
      console.log(`  created  ${page.path}`);
      created++;
    } else {
      console.log(`  MISSING  ${page.path} (would be created)`);
    }
    continue;
  }

  const remote = await pageContent(existing.id);
  const same = remote.replace(/\r\n/g, '\n').trimEnd() === local.replace(/\r\n/g, '\n').trimEnd();

  if (MODE === 'pull') {
    if (same) { console.log(`  same     ${page.path}`); continue; }
    await writeFile(join(ROOT, page.file), remote.endsWith('\n') ? remote : `${remote}\n`);
    console.log(`  pulled   ${page.path}`);
    changed++;
    continue;
  }

  if (same) { console.log(`  same     ${page.path}`); continue; }

  if (MODE === 'check') {
    console.log(`  DIFFERS  ${page.path}  (local ${local.length}B vs live ${remote.length}B)`);
    drifted++;
    continue;
  }

  const d = await gql(UPDATE, {
    id: existing.id, content: local, description: page.description,
    title: page.title, tags: page.tags ?? [],
  });
  assertOk(d.pages.update, `update ${page.path}`);
  console.log(`  updated  ${page.path}`);
  changed++;
}

console.log('');
if (MODE === 'check') {
  console.log(drifted ? `${drifted} page(s) differ from the wiki.` : 'wiki matches this repo.');
  process.exit(drifted ? 1 : 0);
}
if (MODE === 'pull') console.log(`${changed} file(s) rewritten from the wiki.`);
else console.log(`${created} created, ${changed} updated.`);
