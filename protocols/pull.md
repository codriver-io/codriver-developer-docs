# Pull protocol (canonical)

The default integration mode. You publish a JSON document at a URL you control; codriver fetches it on a schedule you choose and ingests whatever is in it. Nothing is pushed to you, and there is nothing to keep running beyond a static file or a small endpoint.

## TL;DR

```
GET https://your-service.example.com/codriver-feed.json
  Headers:
    Accept: application/json
    <your auth header, if you registered one>

→ HTTP 200
  [ {…entity…}, {…entity…}, … ]
```

The response body is a **JSON array of [v1 entities](/concepts/entities-and-kinds)** — a bare array, not an object wrapping one. codriver polls it every `pull_interval_seconds` (whatever you set at registration, between 30 s and 3600 s; default 300 s).

## Registering

```bash
# While signed in at https://codriver.io, with the session cookie in a jar:
curl -X POST 'https://app.codriver.io/v2/feeds' \
  -H 'Content-Type: application/json' \
  --cookie /tmp/codriver-cookies.txt \
  -d '{
    "name":                  "MyCity 311",
    "description":           "Road closures from the city open-data portal",
    "direction":             "pull",
    "pull_url":              "https://feeds.mycity.example/codriver.json",
    "pull_auth_header":      "X-API-Key: your-key-here",
    "pull_interval_seconds": 300,
    "visibility":            "public"
  }'
```

`pull_auth_header` is optional. If present it must be in `Name: value` form; codriver stores it and replays it verbatim on every fetch. Everything else about the request is fixed — codriver sends no query parameters, no body, and no other custom headers.

Your feed enters [pending review](#pending-review) at this point.

## Requirements on your endpoint

| Requirement | Detail |
|---|---|
| **https** | Plain `http://` is rejected at registration. Your auth header is replayed on every poll; it is not going over clear text. |
| **Public hostname** | No IP literals, `localhost`, `.local` or `.internal`. codriver must be able to reach it from the public internet. |
| **JSON array body** | A top-level array. `{"entities": [...]}` is the *push* shape and will be recorded as a parse error here. |
| **Answer within 15 s** | Requests are aborted at 15 seconds and count as a failure. |
| **Be a snapshot** | Return your *current* full picture each time — see [Snapshot semantics](#snapshot-semantics). |

Redirects are followed. Any non-2xx status, a body that will not parse, a body that is not an array, or a timeout counts as a failed poll.

## Choosing an interval

`pull_interval_seconds` is clamped to `[30, 3600]`. Pick it from how fast your data actually changes — a 311 portal that updates every ten minutes gains nothing from a 30-second poll, and codriver ingests the same rows over and over.

Polling is **not** driver-driven: codriver fetches your feed on its own schedule whether or not anyone is nearby, so an entity you publish is in the database and on drivers' maps before they arrive. That is the point — your feed does not have to answer a per-driver query, and does not need a spatial index.

## Snapshot semantics

Each poll is a complete replacement of *what you are currently claiming*, not a delta:

- Every entity in the array is upserted on `(your feed, external_id)`. `last_seen_at` and `expires_at` are refreshed, so a row you keep publishing stays alive.
- An entity you **stop** including is not deleted. It ages out on its own TTL. To retract something faster than its TTL, publish it once more with `"ttl_seconds": 1`.
- There is no "delete" call, and no full-snapshot reconciliation mode. If you need something gone now, `ttl_seconds: 1` is the mechanism.

## Failure handling

codriver tracks consecutive failures per feed:

| Failures | Behaviour |
|---|---|
| 1+ | The wait until the next attempt doubles with each consecutive failure (`interval × 2ⁿ`), capped at 1 hour. |
| 20 | The feed is **deactivated**. Polling stops entirely. |

A single success resets the counter and the backoff. To bring a deactivated feed back after you have fixed the cause:

```bash
curl -X PATCH 'https://app.codriver.io/v2/feeds/<feed-id>' \
  -H 'Content-Type: application/json' \
  --cookie /tmp/codriver-cookies.txt \
  -d '{ "active": true }'
```

You can inspect the last outcome at any time:

```bash
curl 'https://app.codriver.io/v2/feeds' --cookie /tmp/codriver-cookies.txt \
  | jq '.feeds[] | {layer_name, active, last_fetched_at, last_fetch_outcome, consecutive_failures}'
```

The listing (`{ "feeds": [ … ] }`) returns your own feeds plus the public approved catalogue. Secrets are never returned on read — neither `pull_auth_header` nor a push token comes back once stored.

Updatable via `PATCH`: `active`, `pull_url`, `pull_auth_header`, `pull_interval_seconds`, `spec_url`. A new `pull_url` is validated exactly as at registration.

## Pending review

A newly registered feed is inactive to the outside world until a codriver curator reviews it. Until then codriver **does poll your endpoint** (so you can confirm the wiring works and see the outcome in `GET /v2/feeds`) but the entities are not published to drivers.

You get an email when the decision lands, usually within 24 h. If a week goes by, email <support@codriver.io>.

Once approved, a `public` feed appears in the catalogue at `GET /v2/sources` and its entities are served from the [read API](/reference/read-api). A `private` feed's data stays visible only to you.

## Checklist

- [ ] https URL on a public hostname, valid certificate
- [ ] Returns a top-level JSON array of v1 entities
- [ ] Answers in well under 15 s
- [ ] `external_id` is stable per real-world thing, and namespaced to you
- [ ] Every `kind` is in the [catalog](/reference/kinds) — anything else is rejected row-by-row
- [ ] The interval matches how often your data really changes

## See also

- **[Entities and kinds](/concepts/entities-and-kinds)** — the shape of each array element
- **[Kind catalog](/reference/kinds)** — every `kind` you may publish
- **[Push protocol](/protocols/push)** — when you would rather POST than be polled
- **[Walkthrough](/examples/build-a-provider)** — an end-to-end feed service
