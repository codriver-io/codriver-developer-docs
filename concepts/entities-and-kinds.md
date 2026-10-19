# Entities and kinds

The data model is intentionally small: every pin on the codriver map is an **entity**. Providers publish entities; codriver renders them.

## The entity shape

```jsonc
{
  "external_id": "your-stable-id-123",   // unique per (your-feed, external_id)
  "kind":        "alert.hazard.car_stopped",
  "lat":         45.5017,
  "lng":         -73.5673,
  "properties":  {                       // free-form per-kind
    "street":   "Boulevard René-Lévesque",
    "severity": "high"
  },
  "ttl_seconds": 600,                    // optional; null = persistent
  "observed_at": "2026-05-23T18:30:00Z"  // optional; defaults to ingest time
}
```

Entities published by a feed are **points**. `lat`/`lng` is the whole geometry — a feed cannot publish a line or a polygon, and a `properties` key holding a coordinate array (`line_coordinates` and friends) is stored as data but is not drawn as a shape. Shaped entities on the map, such as road closures spanning a stretch of road, are produced by codriver itself.

### Field reference

| Field | Required | Type | Notes |
|---|---|---|---|
| `external_id` | yes | string | **Must be stable** across re-publishes of the same real-world thing. Used for upserts. Max 200 chars. Namespace it (`my-feed-alert-<id>`) so other feeds don't collide on raw upstream ids. |
| `kind` | yes | string | One of the canonical kind ids in [the catalog](/reference/kinds). Anything outside the catalog is rejected. |
| `lat` | yes | number | WGS84 latitude in degrees, `[-90, 90]`. |
| `lng` | yes | number | WGS84 longitude in degrees, `[-180, 180]`. |
| `properties` | no | object | Free-form per-kind metadata. Plain object only (not array). Strings, numbers, booleans, nested objects, and arrays all fine. ≤16 KB. A short list of keys is [reserved](#reserved-property-keys) and silently dropped. |
| `ttl_seconds` | no | number \| null | `null` = persistent. Omitted = use the kind's [default TTL](/concepts/entities-and-kinds#ttl-semantics). `0..2592000` (max 30 days). |
| `observed_at` | no | ISO-8601 string | When the real-world thing was observed. Omitted = `now()`. |

## Kinds

A **kind** is a string id that describes what an entity is. codriver picks the icon, the rendering layer, and the default decay rule from the kind. Providers map their upstream's vocabulary to this taxonomy on output — codriver doesn't accept arbitrary kind strings.

| Category | Examples |
|---|---|
| `alert.*` | `alert.police`, `alert.accident`, `alert.hazard.car_stopped`, `alert.road_closed`, `alert.construction` |
| `traffic.*` | `traffic.jam` |
| `camera.*` | `camera.speed`, `camera.red_light`, `camera.avg_speed` |
| `charger.*` | `charger.supercharger`, `charger.destination` |

Full list (with default TTLs and expected properties): see **[Kind catalog reference](/reference/kinds)**.

## Layers

Each entity belongs to exactly one **layer**. A layer is codriver's grouping unit — every provider gets its own layer at registration. Layer ownership controls who can write to it; layer visibility controls who sees its data on the map.

```
┌────────────────────────────────────────────────────────────────┐
│ codriver                                                        │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │
│ │ camera-layer │ │ charger-layer│ │ my-traffic-feed (yours)  │ │
│ │ (first-party)│ │ (first-party)│ │ (community, public)      │ │
│ └──────────────┘ └──────────────┘ └──────────────────────────┘ │
│        ▲                ▲                       ▲              │
│        │                │                       │              │
│   public sources    public sources          your feed URL       │
└────────────────────────────────────────────────────────────────┘
```

You don't see other providers' raw data. Your layer is yours; codriver merges it on the read path.

## TTL semantics

This policy applies to durable Codriver reports and third-party feed entities.
The built-in incident source has the separate lifecycle below. Seeded defaults
are listed here; an explicit feed `ttl_seconds` overrides them.

| Kind family | Default TTL |
|---|---|
| `traffic.jam` | 5 min |
| `alert.police` / `alert.accident` / generic hazard, stopped car, object, fog, ice | 10 min |
| `alert.hazard.flooding` / `alert.road_closed` | 2 h |
| `alert.hazard.animal` | 4 h |
| `alert.hazard.pothole` / `alert.construction` | 7 d |
| `camera.*` / `charger.*` | 30 d |

Durable ingestion sets `expires_at` from ingestion time plus the effective TTL;
`observed_at` records the observation time, rather than setting that expiry.
An explicit `null` (or `0`) TTL is persistent. Reads exclude expired rows before
the retirement cron marks them retired. Eligible retired rows and their dependent
observations are purged after the retention window (seven days by default);
saved built-in source histories with confirms/disputes are excluded from that purge.

Re-publishing the same `external_id` refreshes the row, subject to consensus and
suppression. Unchanged repeats seen within the last sixty seconds skip the DB
write. A dispute stamp survives re-ingestion; feed data cannot erase a driver's
vote. If publishing stops, a time-limited row expires naturally.

## Built-in incident lifecycle

The `community-incidents` source uses a shared Redis live store rather than
writing every Waze alert, reported jam pin or closure span to Postgres. A real
upstream response in the requested area establishes five minutes of freshness
from request start. Replay cannot extend it; explicit removals are timestamped
so late responses cannot resurrect a removed record. An empty upstream delta
is not proof of removal.

A driver's first confirm or dispute saves the trusted snapshot and observation
in one Postgres transaction. The `incident:v1:` public ID stays stable. Saved
consensus/suppression is joined onto live records at read time, before the usual
cross-source merge. Driver history remains after Redis expiry/removal, but does
not keep the source pin visible. A confirm never renews Redis freshness.

An app redeploy preserves the separate Redis service while TTLs advance.
Redis crash recovery depends on persistence; memory pressure can evict live
records before expiry. Five minutes is a freshness bound, not a minimum
retention guarantee. Losing removal-ordering metadata can also allow a delayed
older response within that original freshness window. Driver observations remain
in Postgres. With Redis unavailable, unsaved source votes return a retryable 503;
an expired cache-only ID returns 409 and requires a refreshed map. Saved source
rows can still receive observations. This lifecycle does not change third-party
feed ingestion, and it is separate from congestion ribbons.

## Reserved property keys

`properties` is free-form with one exception: a few keys are read back by codriver itself and are **removed from anything you submit**, silently, on every ingest path. Today that is:

| Key | Owned by |
|---|---|
| `disputed_until` | the consensus engine — it is how a disputed pin is suppressed |

The list can grow when codriver starts interpreting a new key. Two consequences worth internalising: do not use these names for your own data (your value will vanish), and do not expect to influence codriver's consensus state through `properties` — confirmations and disputes come from drivers, not from feeds.

## Reconciliation

codriver dedupes by `(your-feed, external_id)`. Two consequences:

- **Re-publishing is idempotent.** Same `external_id` → same row, subject to consensus, suppression and unchanged-repeat write suppression.
- **`external_id` must be stable per real-world thing.** If your upstream changes their id every fetch, the entity flickers in/out instead of refreshing. Wrap with your own stable id (`sha256(name + lat + lng).slice(0,16)`).

## Visibility and trust

Every entity carries the id of the feed that submitted it, so a misbehaving feed can be rolled back after the fact.

A new feed is **unapproved** and **private**. codriver polls a pull feed and accepts pushes straight away — so you can verify the wiring — but the entities are not served to drivers, and the feed does not appear in the source catalogue. A curator reviews it and you get an email either way.

After approval:

- **public** — the feed appears in `GET /v2/sources` as `feed:<feed-id>`, and its entities are served from the [read API](/reference/read-api) like any other source.
- **private** — the data stays yours.

## See also

- **[Pull protocol](/protocols/pull)** — the canonical integration
- **[Push protocol](/protocols/push)** — alternative integration mode
- **[Kind catalog reference](/reference/kinds)** — every kind + properties
- **[Read API](/reference/read-api)** — reading entities back out
