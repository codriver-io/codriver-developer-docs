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
changelog.md                   /changelog
pages.json                     path → title/description/tags for each of the above
```

## Publishing

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

Related: the marketing site's `/developers` page is positioning copy and links
here; this wiki is canonical for the contract.
