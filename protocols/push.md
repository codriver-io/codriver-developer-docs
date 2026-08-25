# Push protocol (alternative)

The default integration is [pull](/protocols/pull): codriver calls your endpoint when drivers need data. **Push** is the alternative — your provider sends batches to codriver whenever it has updates.

Use push when:

- Your upstream pushes you events (webhooks, message queues, periodic crons you already run).
- Your upstream has no spatial index — you'd rather precompute and ship.
- You want to backfill historical data.

Don't use push when:

- Your data is queryable on-demand by lat/lng (pull is more efficient).
- Your upstream has rate limits (pull dedupes via codriver's cache; push doesn't).

## TL;DR

Codriver gives you a one-time-visible **push token** at registration. You POST entity batches to:

```
POST https://app.codriver.io/v2/feeds/<your-token>/entities
  Headers: Content-Type: application/json
  Body:    JSON array of v1 entities

→ HTTP 200
  { "accepted": <int>, "rejected": <int>, "errors": [ {…} ] }
```

The token *is* the auth — no `X-Codriver-Auth` header needed. Treat it like a bearer secret.

## Registering a push feed

```bash
# While signed in at https://codriver.io (cookie saved to /tmp/cookies.txt):
curl -X POST 'https://app.codriver.io/v2/feeds' \
  -H 'Content-Type: application/json' \
  --cookie /tmp/cookies.txt \
  -d '{
    "name":        "My push feed",
    "description": "Backfill from MyCity 311",
    "direction":   "push",
    "visibility":  "private"
  }'
```

Response (HTTP 201):

```jsonc
{
  "feed":  { "id": "f04...", "layer_id": "1a2...", "direction": "push", "active": true, ... },
  "layer": { "id": "1a2...", "slug": "my-push-feed-7a3c", "name": "My push feed" },
  "push_ingest_token": "cdrf_AbCd…"   // visible exactly once — save it now
}
```

> **Pending review.** Newly registered feeds are `is_approved=false, is_public=false` by default. Your push token works immediately for testing — pushes are stored — but drivers don't see your data until an admin reviews. codriver emails the address on your account when the decision lands (usually within 24 h).

If you lose the token, rotate it (the old one is immediately invalidated):

```bash
curl -X POST 'https://app.codriver.io/v2/feeds/<feed-id>/rotate-token' \
  --cookie /tmp/cookies.txt
# → { "feed_id": "f04…", "push_ingest_token": "cdrf_NewValue…" }
```

## Pushing entities

```bash
curl -X POST "https://app.codriver.io/v2/feeds/$TOKEN/entities" \
  -H 'Content-Type: application/json' \
  -d '[
    {
      "external_id": "311-incident-2026-001",
      "kind":        "alert.road_closed",
      "lat":         45.5017,
      "lng":         -73.5673,
      "properties":  { "street": "Boul René-Lévesque", "reason": "downed power line" },
      "ttl_seconds": 3600,
      "observed_at": "2026-05-23T18:30:00Z"
    }
  ]'
# → { "accepted": 1, "rejected": 0, "errors": [] }
```

The body is always a JSON **array** of [v1 entities](/concepts/entities-and-kinds#the-entity-shape), even when pushing a single one.

## Limits

| Limit | Value |
|---|---|
| Max entities per request | 5 000 |
| Max requests/minute per token | 60 |
| Max entities/minute per token | 10 000 |

Exceeding any of these returns HTTP `429 Too Many Requests` with a `Retry-After` header. Back off and retry.

## Error responses

| Status | Meaning |
|---|---|
| `200` | Request processed. Check `accepted` / `rejected` in the body. Per-row errors are in the `errors` array. |
| `400` | Malformed JSON, payload not an array, batch too large |
| `401` | Unknown or revoked token |
| `429` | Rate limit exceeded |
| `5xx` | Server-side problem. Retry with exponential backoff. |

Per-row rejections (in `errors[]`) don't fail the whole batch. Common reasons: unknown `kind`, missing `external_id`, out-of-range coordinates.

## When to use push vs pull

| | Pull | Push |
|---|---|---|
| Who initiates | codriver | your provider |
| Idle behavior | zero traffic | needs your scheduler |
| Spatial filtering | codriver passes lat/lng/radius | you push everything; codriver indexes it |
| Best for | live data with spatial queries | event-driven feeds, backfills, low-volume sources |
| Auth model | shared secret header | bearer token in URL path |
| Caching by codriver | yes (4-30 s SWR) | no |

Most providers should start with [pull](/protocols/pull). Push is the right answer when your upstream is event-driven (webhook in, push to codriver) or when you're doing a one-time bulk load.

## See also

- **[Pull protocol](/protocols/pull)** — the canonical integration
- **[Entities and kinds](/concepts/entities-and-kinds)** — the data shape
- **[Kind catalog](/reference/kinds)** — every kind you can publish
