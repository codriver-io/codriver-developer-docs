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

### Field reference

| Field | Required | Type | Notes |
|---|---|---|---|
| `external_id` | yes | string | **Must be stable** across re-publishes of the same real-world thing. Used for upserts. Max 200 chars. Namespace it (`my-feed-alert-<id>`) so other feeds don't collide on raw upstream ids. |
| `kind` | yes | string | One of the canonical kind ids in [the catalog](/reference/kinds). Anything outside the catalog is rejected. |
| `lat` | yes | number | WGS84 latitude in degrees, `[-90, 90]`. |
| `lng` | yes | number | WGS84 longitude in degrees, `[-180, 180]`. |
| `properties` | no | object | Free-form per-kind metadata. Plain object only (not array). Strings, numbers, booleans, nested objects, and arrays all fine. ≤16 KB. |
| `ttl_seconds` | no | number \| null | `null` = persistent. Omitted = use the kind's [default TTL](/concepts/entities-and-kinds#ttl). `0..2592000` (max 30 days). |
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
│   public sources    public sources         your /relay         │
└────────────────────────────────────────────────────────────────┘
```

You don't see other providers' raw data. Your layer is yours; codriver merges it on the read path.

## TTL semantics

Entities have a lifetime. After `expires_at` (= `observed_at + ttl_seconds`) passes, codriver soft-retires the entity — it stops appearing in driver responses, but is retained for audit purposes.

| Kind family | Default TTL |
|---|---|
| `alert.police` / `alert.accident` / most `alert.hazard.*` | 5 min |
| `alert.hazard.pothole` | 15 min |
| `alert.road_closed` / `alert.construction` | 15 min |
| `traffic.jam` | 15 min |
| `camera.*` / `charger.*` | persistent (no TTL) |

If you keep publishing the same `external_id`, codriver refreshes `last_seen_at` and `expires_at` on each push/pull — the row stays alive as long as you keep claiming it.

If you stop publishing, the row dies naturally at `expires_at`. No retraction call needed.

## Reconciliation

codriver dedupes by `(your-feed, external_id)`. Two consequences:

- **Re-publishing is idempotent.** Same `external_id` → same row, properties refreshed, expires_at extended.
- **`external_id` must be stable per real-world thing.** If your upstream changes their id every fetch, the entity flickers in/out instead of refreshing. Wrap with your own stable id (`sha256(name + lat + lng).slice(0,16)`).

## Submitter trust

Every observation is recorded with the submitting feed's id (forensic rollback if a feed misbehaves). Community feeds default to private until reviewed; approved feeds appear in the public catalog for any user to subscribe.

## See also

- **[Pull protocol](/protocols/pull)** — the canonical integration
- **[Push protocol](/protocols/push)** — alternative integration mode
- **[Kind catalog reference](/reference/kinds)** — every kind + properties
