# codriver developer docs

Content for <https://developer.codriver.io> (Wiki.js 2). The markdown in this
repo is the source of truth; `scripts/publish.mjs` pushes it to a wiki.

```
home.md                        /
concepts/entities-and-kinds.md /concepts/entities-and-kinds
protocols/pull.md              /protocols/pull
protocols/push.md              /protocols/push
reference/kinds.md             /reference/kinds
reference/read-api.md          /reference/read-api
examples/build-a-provider.md   /examples/build-a-provider
guides/build-an-app.md         /guides/build-an-app
guides/ntfy-app.md             /guides/ntfy-app
guides/install-an-app.md       /guides/install-an-app
changelog.md                   /changelog
pages.json                     path → title/description/tags for each of the above
```

## How this reaches the wiki

Since 2026-08-26 the production and staging wikis **sync with this repository**
(Wiki.js git storage, `sync` mode, every 5 minutes). Push to `main` and the
change appears on the site shortly after; edit a page in the wiki UI and the
change is committed back here by `Wiki.js sync <wikijs-sync@codriver.io>`.

Three consequences worth knowing:

- **Pull before you edit.** The wiki can have committed a UI edit since you last
  fetched. `git pull` first, or you will be resolving a conflict Wiki.js has no
  way to help with.
- **`scripts/publish.mjs` is still here and still works**, but it is now the
  fallback rather than the normal path — use it to force a push when sync is
  wedged, or to publish to an environment that is not wired up. Everyday
  changes just need a commit.
- **Sync starts tracking from whatever `main` is at when it is enabled.**
  Commits already in history are not replayed, so if a wiki is ever
  re-connected, run `publish.mjs` once to bring its pages up to date, then let
  sync take over.

### Why this file is a .txt in .github/

Wiki.js's git module turns EVERY .md, .adoc and .html file in this repo into a
public wiki page. There is no ignore setting. Both obvious workarounds fail:

  - README.md at the root -> published as /README.
  - .github/README.md -> published as /github/README. The `.git` path filter in
    server/modules/storage/git/storage.js only guards importAll(), not the
    incremental sync that runs every 5 minutes.

Only the three extensions above are treated as pages (server/helpers/page.js,
contentToExt), so a .txt is skipped outright. GitHub still shows this as the
repository readme, just without markdown formatting.

THE RULE: anything .md/.adoc/.html in this repo is published to the world.
Maintainer notes -- infrastructure, hostnames, recipes -- do not belong in one.
This file was briefly published as a wiki page on 2026-08-26 for that reason.

### Reconfiguring the storage target

Two things will waste an hour if you rediscover them the hard way:

- The `updateTargets` mutation reads its config values from a wrapper keyed
  **`v`**, not `value` (`server/graph/resolvers/storage.js`). Send
  `{"v": "…"}`. Send `{"value": "…"}` and every field is silently stored as
  `null`, after which the admin UI and the `storage.targets` query both throw
  `Cannot read properties of null`.
- Cloudflare's WAF blocks that mutation on the production host. Post it from
  the origin instead: `curl --resolve developer.codriver.io:443:127.0.0.1 -k`
  from the Coolify host. Staging is not proxied and takes it directly.

## Publishing (manual fallback)

A token is needed for every command, including `--check`: anonymous visitors
can list pages but not read their markdown. Mint one per environment in
**Wiki.js Admin → API Access → New API Key**, and keep it out of git (`.env`).

```bash
cp .env.example .env        # fill in WIKI_URL + WIKI_TOKEN

# 1. Staging first. Always.
export WIKI_URL=https://developer.staging.codriver.io WIKI_TOKEN=...
npm run check               # what differs between this repo and that wiki
npm run publish:wiki        # push it

# 2. Then production, with the prod URL + token.
export WIKI_URL=https://developer.codriver.io WIKI_TOKEN=...
npm run check
npm run publish:wiki

node scripts/publish.mjs --only protocols/pull   # one page
```

`npm run pull` does the reverse: it overwrites local files with what the wiki
currently holds. **Run `npm run check` before publishing.** The wiki is
editable in its own UI, so someone may have fixed a typo there; publishing
would silently overwrite it, and `--pull` is how you bring it back into git
first.

Adding a page: create the markdown, add an entry to `pages.json`, publish. The
script creates pages it cannot find by path. The **sidebar is not managed
here** — Wiki.js navigation is configured in its admin UI, so a genuinely new
page needs one manual nav entry.

## Writing rules

This is a public, developer-facing surface, and it stays that way:

- Document the contract, never the implementation. No internal file paths, no
  environment-variable names, no infrastructure details, no upstream vendor
  names.
- Every claim is checked against the running service before it goes up. Most of
  the 2026-08 rewrite existed because that had stopped happening.
- When behaviour changes, add a [changelog](changelog.md) entry in the same
  commit.
- Where something is not built yet, say so plainly, with a date. Do not
  describe an unshipped surface in the present tense — three months of that is
  what the 2026-08 rewrite was cleaning up.
- Run `npm run check:links` before you commit. It needs no token and no
  network: every `](/…)` must point at a path in `pages.json`, and every
  `#anchor` must match a heading in the page it points at. Renaming a heading
  is the easy way to break a link nobody notices for a month.

Related: the marketing site's `/developers` page is positioning copy and links
here; this wiki is canonical for the contract.
