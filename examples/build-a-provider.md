# Walkthrough: building a provider

The typical provider is a small HTTPS service that wraps an upstream traffic / POI API and exposes the codriver [pull protocol](/protocols/pull). ~200 lines of Node.js, two files, deployable on any tiny VM.

This walkthrough builds one from scratch against a hypothetical upstream `https://your-upstream.example/alerts`. The pattern generalizes to any HTTP-based source.

## What you're building

```
                       /relay/incidents
   codriver ─────────────────────────────▶ your provider ─────────▶ your upstream
            ◀───────────────────────────                   ◀────────
                {entities, fetched_at_utc}            (whatever shape)
```

- Receive `lat`, `lng`, `radius`, `tenant` from codriver
- Call your upstream for the same bbox
- Map your upstream's shape to codriver canonical kinds
- Return v1 entities

## Project layout

```
package.json
src/
  upstream.js     HTTPS client for your upstream API
  transform.js    upstream shape → codriver v1 entity shape
  server.js       Fastify with /relay/* endpoints
```

`package.json` only needs `fastify` as a runtime dep.

## 1. The upstream client (`src/upstream.js`)

A thin fetch wrapper. The auth flavor depends on your upstream — most are `X-API-Key`, some are `Authorization: Bearer`, RapidAPI uses `X-RapidAPI-Key` + `X-RapidAPI-Host`.

```js
const API_KEY = process.env.UPSTREAM_API_KEY;
const BASE = process.env.UPSTREAM_BASE_URL || 'https://your-upstream.example';

export async function fetchAlerts({ lat, lng, radius }) {
  if (!API_KEY) throw new Error('UPSTREAM_API_KEY not set');

  // Most upstreams take a bbox; convert from circle.
  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.cos(lat * Math.PI / 180));
  const bbox = `${(lng - dLng).toFixed(6)},${(lat - dLat).toFixed(6)},` +
               `${(lng + dLng).toFixed(6)},${(lat + dLat).toFixed(6)}`;

  const url = new URL('/alerts', BASE);
  url.searchParams.set('bbox', bbox);

  const res = await fetch(url, {
    headers: { 'X-API-Key': API_KEY, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error('auth rejected');
  if (res.status === 429) throw new Error('rate limited');
  if (!res.ok) throw new Error(`upstream HTTP ${res.status}`);
  return res.json();
}
```

## 2. The transform (`src/transform.js`)

The interesting part. Map your upstream's vocabulary to codriver kinds.

```js
// Codriver kinds you can publish — full list at /reference/kinds
function mapToKind(upstreamType, upstreamSubtype) {
  if (upstreamType === 'POLICE')        return 'alert.police';
  if (upstreamType === 'ACCIDENT')      return 'alert.accident';
  if (upstreamType === 'ROAD_CLOSED')   return 'alert.road_closed';
  if (upstreamType === 'CONSTRUCTION')  return 'alert.construction';
  if (upstreamType === 'JAM')           return 'traffic.jam';
  if (upstreamType === 'HAZARD') {
    // Subtypes give richer rendering. Map the ones your upstream uses.
    const s = String(upstreamSubtype || '').toUpperCase();
    if (s.includes('CAR_STOPPED'))     return 'alert.hazard.car_stopped';
    if (s.includes('POT_HOLE'))        return 'alert.hazard.pothole';
    if (s.includes('OBJECT'))          return 'alert.hazard.object_on_road';
    if (s.includes('FOG'))             return 'alert.hazard.fog';
    if (s.includes('ICE'))             return 'alert.hazard.ice';
    if (s.includes('FLOOD'))           return 'alert.hazard.flooding';
    return 'alert.hazard';              // generic fallback
  }
  return null;                          // unknown type → drop the entity
}

export function transformOne(upstreamItem) {
  if (upstreamItem.latitude == null || upstreamItem.longitude == null) return null;
  const kind = mapToKind(upstreamItem.type, upstreamItem.subtype);
  if (!kind) return null;
  return {
    // Namespace your ids so they don't collide with other providers
    external_id: `myprovider-${upstreamItem.id}`,
    kind,
    lat: Number(upstreamItem.latitude),
    lng: Number(upstreamItem.longitude),
    properties: {
      // Preserve anything codriver might render in tooltips
      subtype:  upstreamItem.subtype || null,
      street:   upstreamItem.street  || null,
      city:     upstreamItem.city    || null,
      country:  upstreamItem.country || null,
    },
    observed_at: upstreamItem.timestamp || null,
    // omit ttl_seconds → codriver applies the kind's default (see /reference/kinds)
  };
}

export function transformBatch(upstreamPayload) {
  const items = upstreamPayload?.alerts || [];
  return items.map(transformOne).filter(Boolean);
}
```

The two big rules:

- **Stable `external_id`**. Codriver dedupes by `(your-feed, external_id)`. Repeated publishes of the same upstream item refresh `last_seen_at` and extend `expires_at`. If your upstream changes ids per fetch, hash the stable fields: `sha256(name + lat + lng).slice(0, 16)`.
- **Namespace it.** Prefix with something unique to your provider (`myprovider-`) so multiple providers in the codriver catalog don't collide on raw upstream ids.

## 3. The relay endpoint (`src/server.js`)

Auth-gated by a shared secret you generate at registration.

```js
import Fastify from 'fastify';
import { fetchAlerts } from './upstream.js';
import { transformBatch } from './transform.js';

const app = Fastify({ logger: true });
const SECRET = process.env.RELAY_SHARED_SECRET;

app.get('/relay/incidents', async (req, reply) => {
  if (!SECRET) {
    reply.code(503); return { error: 'relay disabled (set RELAY_SHARED_SECRET)' };
  }
  if (req.headers['x-codriver-auth'] !== SECRET) {
    reply.code(401); return { error: 'unauthorized' };
  }
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Number(req.query.radius || 2_000);
  const tenant = String(req.query.tenant || '').slice(0, 64);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90) { reply.code(400); return { error: 'bad lat' }; }
  if (!Number.isFinite(lng) || Math.abs(lng) > 180) { reply.code(400); return { error: 'bad lng' }; }
  if (!Number.isFinite(radius) || radius < 100 || radius > 50_000) {
    reply.code(400); return { error: 'bad radius' };
  }
  if (!tenant) { reply.code(400); return { error: 'tenant required' }; }

  // `tenant` is a stable per-Tesla key. Use it if your upstream is
  // session-based (one session per tenant); otherwise ignore it.

  try {
    const upstreamPayload = await fetchAlerts({ lat, lng, radius });
    const entities = transformBatch(upstreamPayload);
    return { entities, fetched_at_utc: new Date().toISOString() };
  } catch (e) {
    req.log.warn({ err: e, tenant }, 'upstream fetch failed');
    reply.code(502);
    return { error: 'upstream_unavailable' };
  }
});

await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT || 3000) });
```

## 4. Trying it locally

```bash
# Set your upstream API key + a shared secret for the codriver relay
export UPSTREAM_API_KEY='...'
export RELAY_SHARED_SECRET="$(openssl rand -hex 32)"

node src/server.js

# In another terminal — hit the relay endpoint with the secret
curl -H "X-Codriver-Auth: $RELAY_SHARED_SECRET" \
  'http://localhost:3000/relay/incidents?lat=45.4699&lng=-73.5461&radius=2000&tenant=demo'
```

Expected output: a JSON array of v1 entities for the requested bbox.

## 5. Deploying

Anywhere you can run a small Node.js HTTPS service works — Fly, Render, Coolify, Railway, a raw VPS with Caddy/Traefik. Your provider is stateless; horizontal scaling is just running more instances.

Production essentials:

- TLS on a real domain (Let's Encrypt via your reverse proxy is fine).
- Set `RELAY_SHARED_SECRET` and `UPSTREAM_API_KEY` as env vars.
- Health-check endpoint: `app.get('/healthz', () => ({ ok: true }))` is enough.

## 6. Registering with codriver

```bash
# While signed in at https://codriver.io (cookie saved to /tmp/cookies.txt):
curl -X POST 'https://app.codriver.io/v2/feeds' \
  -H 'Content-Type: application/json' \
  --cookie /tmp/cookies.txt \
  -d '{
    "name":             "My traffic provider",
    "direction":        "pull",
    "pull_url":         "https://my-provider.example.com/relay/incidents",
    "pull_auth_header": "X-Codriver-Auth: <same secret>",
    "visibility":       "public"
  }'
```

### Pending review

After registration the feed enters **pending review**. codriver emails the address on your account when an admin approves or rejects it. Until then:

- **Pull feeds**: codriver doesn't call your endpoint yet.
- **Push feeds**: your push token works for testing — pushes are accepted and stored, but drivers don't see your data.

Approval is usually within 24 h. If you don't hear back within 7 days, email `support@codriver.io`.

### After approval

For **public approved** feeds, drivers see your feed in their **Settings → Community Feeds** panel inside the codriver app and can opt in to start receiving your data. codriver doesn't auto-subscribe anyone — each user picks the feeds they want.

For **private approved** feeds (your visibility = `private`), only you see the data on your own map.

Codriver now calls `GET /relay/incidents?lat&lng&radius&tenant` on every driver `/alerts` hit in your coverage area (only from subscribers) and caches the response briefly on its side (4 s freshness / 30 s hard TTL).

## Variations

- **Session-based upstream** (the upstream tracks per-user state across calls): use the `tenant` query param as the key into a per-Tesla session pool. Each codriver-pull becomes a stable mobile-app-style session against the upstream.
- **Bbox vs circle**: this walkthrough converts (lat, lng, radius) into a bbox the upstream understands. If your upstream takes a radius directly, skip the conversion.
- **Per-bbox caching**: codriver caches on its side. Don't add another cache in your provider — your contribution is fresh-fetch + transform; codriver decides how to amortize calls.

## See also

- **[Pull protocol](/protocols/pull)** — full spec the provider implements
- **[Entities and kinds](/concepts/entities-and-kinds)** — the v1 shape
- **[Kind catalog](/reference/kinds)** — canonical kind ids
- **[Push protocol](/protocols/push)** — alternative integration if pull doesn't fit
