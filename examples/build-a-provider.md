# Walkthrough: building a feed

The typical feed is a small HTTPS service that wraps an upstream API and republishes it as codriver entities. About 80 lines of Node.js, three files, deployable anywhere — including as a static file on object storage if your data updates on a cron you already run.

This walkthrough builds one against a hypothetical `https://your-upstream.example/alerts`. The pattern generalises to any HTTP source.

## What you're building

```
   codriver ──── GET (every 5 min) ────▶ your service ─────▶ your upstream
            ◀─── [ {…}, {…} ] ─────────               ◀─────  (whatever shape)
```

Your job is one endpoint that answers with the current picture: fetch upstream, map their vocabulary to codriver kinds, return a JSON array.

## Project layout

```
package.json
src/
  upstream.js     HTTPS client for your upstream API
  transform.js    upstream shape → codriver v1 entity shape
  server.js       Fastify, one route
```

`package.json` needs only `fastify` at runtime.

## 1. The upstream client (`src/upstream.js`)

A thin fetch wrapper. Auth flavour depends on your upstream — most are `X-API-Key`, some `Authorization: Bearer`.

```js
const API_KEY = process.env.UPSTREAM_API_KEY;
const BASE = process.env.UPSTREAM_BASE_URL || 'https://your-upstream.example';

export async function fetchAlerts() {
  if (!API_KEY) throw new Error('UPSTREAM_API_KEY not set');
  const res = await fetch(new URL('/alerts', BASE), {
    headers: { 'X-API-Key': API_KEY, Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
  return res.json();
}
```

Note what is *absent*: no bbox, no radius, no per-driver parameters. codriver polls you for your whole coverage and indexes it spatially on its side, so a feed does not need a spatial query.

## 2. The transform (`src/transform.js`)

The interesting part — mapping your upstream's vocabulary onto codriver [kinds](/reference/kinds).

```js
function mapToKind(type, subtype) {
  if (type === 'POLICE')       return 'alert.police';
  if (type === 'ACCIDENT')     return 'alert.accident';
  if (type === 'ROAD_CLOSED')  return 'alert.road_closed';
  if (type === 'CONSTRUCTION') return 'alert.construction';
  if (type === 'JAM')          return 'traffic.jam';
  if (type === 'HAZARD') {
    const s = String(subtype || '').toUpperCase();
    if (s.includes('CAR_STOPPED')) return 'alert.hazard.car_stopped';
    if (s.includes('POT_HOLE'))    return 'alert.hazard.pothole';
    if (s.includes('OBJECT'))      return 'alert.hazard.object_on_road';
    if (s.includes('FOG'))         return 'alert.hazard.fog';
    if (s.includes('ICE'))         return 'alert.hazard.ice';
    if (s.includes('FLOOD'))       return 'alert.hazard.flooding';
    return 'alert.hazard';               // generic fallback
  }
  return null;                           // unknown type → drop the row
}

export function transformOne(item) {
  if (item.latitude == null || item.longitude == null) return null;
  const kind = mapToKind(item.type, item.subtype);
  if (!kind) return null;
  return {
    external_id: `myfeed-${item.id}`,    // namespaced + stable
    kind,
    lat: Number(item.latitude),
    lng: Number(item.longitude),
    properties: {
      subtype: item.subtype || null,
      street:  item.street  || null,
      city:    item.city    || null,
    },
    observed_at: item.timestamp || null,
    // omit ttl_seconds → codriver applies the kind's default
  };
}

export const transformBatch = (payload) =>
  (payload?.alerts || []).map(transformOne).filter(Boolean);
```

Two rules worth more than the rest:

- **Stable `external_id`.** codriver dedupes on `(your feed, external_id)`. Republishing the same id refreshes the row and extends its life. If your upstream mints a new id every fetch, derive your own: `sha256(street + lat + lng).slice(0, 16)`.
- **Namespace it.** Prefix with something of yours so you never collide with another feed's raw upstream ids.

## 3. The endpoint (`src/server.js`)

```js
import Fastify from 'fastify';
import { fetchAlerts } from './upstream.js';
import { transformBatch } from './transform.js';

const app = Fastify({ logger: true });
const SECRET = process.env.FEED_SHARED_SECRET;

app.get('/codriver-feed.json', async (req, reply) => {
  // Optional: the header you registered as pull_auth_header. Skip this whole
  // check if your feed is public data and you don't mind who reads it.
  if (SECRET && req.headers['x-feed-key'] !== SECRET) {
    reply.code(401); return { error: 'unauthorized' };
  }
  try {
    return transformBatch(await fetchAlerts());   // ← a bare array
  } catch (e) {
    req.log.warn({ err: e }, 'upstream fetch failed');
    reply.code(502); return { error: 'upstream_unavailable' };
  }
});

app.get('/healthz', () => ({ ok: true }));

await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT || 3000) });
```

The response body must be the **array itself**. Wrapping it in an object is the single most common integration mistake — codriver records it as a parse error.

Answer within 15 seconds. If your upstream is slower or rate-limited, cache its result in memory and serve the last good snapshot; you own that trade-off, and a slightly stale array beats a timeout.

## 4. Trying it locally

```bash
export UPSTREAM_API_KEY='...'
export FEED_SHARED_SECRET="$(openssl rand -hex 32)"
node src/server.js

# In another terminal:
curl -H "X-Feed-Key: $FEED_SHARED_SECRET" http://localhost:3000/codriver-feed.json | jq 'length, .[0]'
```

You want a number and one well-formed entity.

## 5. Deploying

Anywhere you can run a small HTTPS service: Fly, Render, Railway, a VPS behind Caddy or Traefik. The service is stateless, so scaling is running more of it. Requirements from codriver's side are short: **https on a public hostname** with a valid certificate (Let's Encrypt is fine), and an answer in under 15 s.

If your data changes on a schedule you already control, you do not need a service at all — write the array to object storage on each update and register that URL.

## 6. Registering

```bash
curl -X POST 'https://app.codriver.io/v2/feeds' \
  -H 'Content-Type: application/json' \
  --cookie /tmp/codriver-cookies.txt \
  -d '{
    "name":                  "My traffic feed",
    "direction":             "pull",
    "pull_url":              "https://my-feed.example.com/codriver-feed.json",
    "pull_auth_header":      "X-Feed-Key: <same secret>",
    "pull_interval_seconds": 300,
    "visibility":            "public"
  }'
```

Then watch the first polls land:

```bash
curl 'https://app.codriver.io/v2/feeds' --cookie /tmp/codriver-cookies.txt \
  | jq '.feeds[] | select(.is_owner) | {layer_name, last_fetched_at, last_fetch_outcome, consecutive_failures}'
```

`last_fetch_outcome` is `ok` when a poll parsed and ingested. Anything else — `parse_error`, `auth_failed`, `timeout`, `4xx`, `5xx` — tells you which half to look at.

Your feed is polled from registration onward, but its entities reach drivers only after a curator approves it. See [pending review](/protocols/pull#pending-review).

## Variations

- **Slow or rate-limited upstream.** Refresh on your own timer, serve from memory. codriver's poll should never trigger an upstream call you cannot afford.
- **Event-driven upstream.** If updates arrive as webhooks, consider the [push protocol](/protocols/push) instead — you send when you have something, rather than being asked.
- **Very large coverage.** There is no cap on array length for pull feeds, but keep the response honest: publish what is currently true, not your entire history. Everything you publish has a TTL and dies on its own.

## See also

- **[Pull protocol](/protocols/pull)** — the full contract
- **[Entities and kinds](/concepts/entities-and-kinds)** — the v1 shape
- **[Kind catalog](/reference/kinds)** — canonical kind ids
- **[Push protocol](/protocols/push)** — the alternative
