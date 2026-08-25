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

The token *is* the auth — there is no separate header and no session cookie. Treat it like a bearer secret: it is shown once at registration, it does not expire, and anyone holding it can write to your layer. If it leaks, [rotate it](#registering-a-push-feed).

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

Exceeding the rate limit returns HTTP `429 Too Many Requests` with a `Retry-After` header — back off and retry. A batch over 5 000 entities is rejected outright with `400`; split it.

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
| Who initiates | codriver, on your interval | you, whenever you have updates |
| What you run | a URL (a static file will do) | a scheduler or an event handler |
| Latency floor | your `pull_interval_seconds` (min 30 s) | as fast as you send |
| Auth model | your own header, replayed by codriver | feed token in the URL path |
| Failure handling | backoff, auto-disable after 20 failures | your retry logic |
| Best for | a snapshot you can already publish | event-driven feeds, backfills, bursty sources |

Most feeds should start with [pull](/protocols/pull) — there is less of it to keep running. Push is the right answer when your data arrives as events (a webhook you already receive) or when you are doing a one-time bulk load.

## See also

- **[Pull protocol](/protocols/pull)** — the canonical integration
- **[Entities and kinds](/concepts/entities-and-kinds)** — the data shape
- **[Kind catalog](/reference/kinds)** — every kind you can publish
- **[Read API](/reference/read-api)** — reading back what you published
