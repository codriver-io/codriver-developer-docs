# Build for codriver

codriver is a driving overlay for the Tesla in-car browser. The map renders incidents (police, accidents, hazards, road closures, jams), speed cameras and chargers as pins over a 3D basemap, with turn-by-turn navigation.

This site is the developer reference for extending it. There are two ways in, and they are independent — pick either, or both.

| | **Publish data** | **Build an app** |
|---|---|---|
| What you add | Pins on the map | A panel beside the map |
| What you run | A JSON URL, or a static file | A web page on your own origin |
| How it reaches a driver | codriver polls your feed and serves it to everyone in range | A driver installs your app on their account |
| Start at | [Entities and kinds](/concepts/entities-and-kinds) | [Build an app](/guides/build-an-app) |

The rest of this page is the data path. If you are building a panel — notifications in the car, a charge session, a dashboard — go straight to [Build an app](/guides/build-an-app).

## Publishing data

Every pin comes from a **feed** — a source of data published in codriver's canonical entity format. codriver owns the schema, the kind taxonomy, the icons and the decay rules; feeds fill in the data. Read on if you want codriver to render your traffic data, charger network, snow-removal feed, hazard reports — anything that fits a `(lat, lng, kind, properties)` shape.

### How it works

```
                        every pull_interval_seconds
  ┌──────────────┐      ┌──────────────────┐  GET   ┌──────────────────────┐
  │   Tesla      │ ───▶ │  app.codriver.io │ ─────▶ │  your feed URL       │
  │   browser    │ ◀─── │   entity store   │ ◀───── │  (a JSON array)      │
  └──────────────┘      └──────────────────┘        └──────────┬───────────┘
      entities near                                            │
      the driver                                               ▼
                                                    ┌──────────────────────┐
                                                    │  your upstream data  │
                                                    │  (a city portal, a   │
                                                    │   sensor network,    │
                                                    │   your own scrape…)  │
                                                    └──────────────────────┘
```

Two independent loops. codriver polls your feed on **your** schedule and stores what it finds; drivers read from that store as they drive. Your endpoint is never on a driver's critical path, so it can be slow, cached, or a static file on a CDN — and a driver arriving in your coverage area sees your data immediately, without waiting for a fetch.

If you would rather send data than be polled, see the [push protocol](/protocols/push).

### 5-minute quickstart

**1. Publish a JSON array of entities somewhere public.** A static file is a perfectly good feed:

```jsonc
[
  {
    "external_id": "mycity-311-2026-0042",
    "kind":        "alert.road_closed",
    "lat":         45.5017,
    "lng":         -73.5673,
    "properties":  { "street": "Boul René-Lévesque", "reason": "water main" },
    "ttl_seconds": 3600,
    "observed_at": "2026-08-25T18:30:00Z"
  }
]
```

**2. Register it** (one time, signed in at <https://codriver.io> so the session cookie is in your jar):

```bash
curl -X POST 'https://app.codriver.io/v2/feeds' \
  -H 'Content-Type: application/json' \
  --cookie /tmp/codriver-cookies.txt \
  -d '{
    "name":                  "MyCity 311",
    "direction":             "pull",
    "pull_url":              "https://feeds.mycity.example/codriver.json",
    "pull_interval_seconds": 300,
    "visibility":            "public"
  }'
```

**3. Watch it land:**

```bash
curl 'https://app.codriver.io/v2/feeds' --cookie /tmp/codriver-cookies.txt \
  | jq '.feeds[] | {layer_name, active, last_fetch_outcome, last_fetched_at, consecutive_failures}'
```

Your feed is polled from now on. It reaches drivers once a curator approves it — see [pending review](/protocols/pull#pending-review).

## What to read next

In order, if you are building a feed:

1. [Entities and kinds](/concepts/entities-and-kinds) — the data shape.
2. [Pull protocol](/protocols/pull) — the canonical integration.
3. [Kind catalog](/reference/kinds) — every kind you can publish.
4. [Walkthrough](/examples/build-a-provider) — end-to-end, ~80 lines.

In order, if you are building an app:

1. [Build an app](/guides/build-an-app) — the contract, the isolation model, the requirements.
2. [The ntfy app](/guides/ntfy-app) — a worked example, and the reference implementation to copy.
3. [Install an app](/guides/install-an-app) — what your users see. Read it before you design your config form.

Also useful:

- [Push protocol](/protocols/push) — POST batches instead of being polled.
- [Read API](/reference/read-api) — reading what is on the map, including your own feed's entities.
- [Changelog](/changelog) — what has changed on this surface.

## Status of this site

- The v1 entity contract is stable: `external_id`, `kind`, `lat`, `lng`, `properties`, `ttl_seconds` and `observed_at` do not change without a 90-day notice emailed to feed owners. New kinds and additive fields ship any time.
- **The app platform is not live yet** as of 2026-08-25. Its pages are published ahead of the release so you can build against the contract; each one says so at the top, and the [changelog](/changelog) will carry the date it ships.
- Questions, ambiguity, missing kinds: <support@codriver.io>.
