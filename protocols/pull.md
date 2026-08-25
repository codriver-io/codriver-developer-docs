# Pull protocol (canonical)

The default integration mode. codriver pulls from your provider's HTTP endpoint on every driver request that touches your bbox. You expose two endpoints; codriver does the rest.

## TL;DR

You stand up a small HTTPS service. codriver calls it like this:

```
GET https://your-provider.example.com/relay/incidents
    ?lat=45.4699&lng=-73.5461&radius=2000&tenant=<opaque-id>
  Headers:
    X-Codriver-Auth: <RELAY_SHARED_SECRET>

→ HTTP 200
  {
    "entities":       [ {…}, {…}, … ],
    "fetched_at_utc": "2026-05-23T22:14:13.182Z"
  }
```

You define the secret at registration; codriver stores it server-side and sends it on every call. The `tenant` query param carries a stable per-Tesla session-affinity key (your provider uses it if your upstream has sessions; ignores it otherwise).

codriver caches the response per `(tenant, bbox-rounded-to-100m)` with a 4-second freshness window and a 30-second hard TTL. Stale-while-revalidate means drivers never wait on your upstream; the call rate to your provider stays ≤1 per Tesla per 4s per bbox.

## Endpoints

Two flavors. Same auth, same parameters; different response shapes.

### `GET /relay/incidents` — canonical v1 entity shape

**Request**

```
GET /relay/incidents
  ?lat=<number>      (required, [-90, 90])
  &lng=<number>      (required, [-180, 180])
  &radius=<number>   (required, meters, [100, 50000])
  &tenant=<string>   (required, ≤64 chars, per-Tesla affinity key)

Headers:
  X-Codriver-Auth: <RELAY_SHARED_SECRET>
```

**Response (200)**

```jsonc
{
  "entities": [
    {
      "external_id": "my-id-1",
      "kind":        "alert.police",
      "lat":         45.4699,
      "lng":         -73.5461,
      "properties":  { "street": "...", ... },
      "observed_at": "2026-05-23T22:14:11.000Z"
      // ttl_seconds optional; omit to use kind default
    },
    ...
  ],
  "fetched_at_utc": "2026-05-23T22:14:13.182Z"
}
```

**Errors**

| Status | Meaning |
|---|---|
| `400` | Missing/invalid lat/lng/radius/tenant |
| `401` | Missing or wrong `X-Codriver-Auth` header |
| `503` | Provider misconfigured (e.g. shared secret env var unset) |
| `5xx` | Upstream unavailable; codriver falls back to cached or to other providers in the catalog |

### `GET /relay/incidents-raw` — upstream raw shape

Same auth + parameters. Returns the unshaped upstream data so codriver can apply its own normalizer logic. Useful when your upstream returns fields the v1 entity shape would otherwise collapse.

```jsonc
{
  "alerts":         [ {…}, {…}, … ],
  "jams":           [ {…}, {…}, … ],
  "users":          [],
  "fetched_at_utc": "2026-05-23T22:14:13.182Z"
}
```

The `alerts` / `jams` shape depends on your upstream. codriver expects a structure shaped like `{ uuid, type, subtype, location: { x, y }, pubMillis, ... }` — common across most consumer traffic APIs. If your upstream returns a different shape, use `/relay/incidents` (canonical v1) instead.

## Authentication

`X-Codriver-Auth: <RELAY_SHARED_SECRET>` header on every relay request. The shared secret is set at registration:

```bash
openssl rand -hex 32                                # generate
# → paste the same value into both:
#   - your provider's env (RELAY_SHARED_SECRET)
#   - codriver's feed registration (pull_auth_header)
```

Rotate by re-running `openssl rand -hex 32`, updating both ends, and redeploying. codriver doesn't currently force-rotate the secret — you own that.

If your endpoint receives a request without the header (or with the wrong value), respond `401`. codriver doesn't retry on 401 — it moves on to other providers in the catalog and surfaces the failure in your operator dashboard.

## The `tenant` parameter

A short opaque string. codriver derives it from each driver's session; the same Tesla always sends the same value, different Teslas get different values. Treat the param as opaque — don't try to parse, decode, or correlate it.

What your provider does with it depends on your upstream:

- **Stateless upstream** (most cases — typical REST APIs): ignore the param. The protocol preserves it for compatibility.
- **Session-based upstream** (the upstream tracks "what has this user seen" across calls): use the param as the key into a per-Tesla session pool. Each Tesla gets a dedicated session — your provider's calls to the upstream look like a single, stable client.

```js
const session = sessionPool.getOrCreate(req.query.tenant);
const result  = await session.fetchAlerts({ bbox });
```

The protocol shape is identical either way, so codriver can swap providers without code changes.

## Cache behavior (codriver side)

codriver wraps every `/relay/incidents` call in a stale-while-revalidate cache keyed by `(tenant, bbox rounded to a coarse grid)`:

| Window | Behavior |
|---|---|
| First 4 s after a fetch | Cached. No call to your endpoint. |
| 4–30 s | Cached response served immediately; a background refresh fires once. |
| Beyond 30 s | Cache expired. Next request triggers a synchronous fetch. |

Drivers never wait on your upstream — codriver serves cached the moment it has one. You'll see at most one call per `(tenant, rounded bbox)` per 4 seconds from codriver. With ~10 concurrent Teslas in your coverage that's roughly 2-3 requests/sec at peak.

## Provider checklist

- [ ] Endpoint at `/relay/incidents` (canonical) or `/relay/incidents-raw` (legacy adapter)
- [ ] Validates `X-Codriver-Auth` header → 401 on mismatch
- [ ] Validates `lat`, `lng`, `radius`, `tenant` query params → 400 on missing/bad
- [ ] Returns `{ entities, fetched_at_utc }` with v1-conformant entities ([catalog](/reference/kinds))
- [ ] Returns under 30 s, ideally under 5 s
- [ ] HTTPS with a valid cert (Let's Encrypt is fine)
- [ ] Persistent — codriver expects your endpoint to stay up as long as it's registered

## See also

- **[Registering as a feed](/protocols/pull#registration)** — `POST /v2/feeds` flow
- **[Push protocol](/protocols/push)** — alternative integration mode
- **[Kind catalog](/reference/kinds)** — what `kind` values you can publish
- **[Walkthrough: building a provider](/examples/build-a-provider)** — end-to-end reference
