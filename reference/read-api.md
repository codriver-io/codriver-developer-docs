# Read API

Everything on the codriver map is readable over HTTP: community reports, incidents, speed cameras, chargers and every approved feed's entities.

Two endpoints:

- `GET /v2/entities/nearby` — entities in a circle.
- `GET /v2/sources` — the catalogue of sources you can ask for.

Base URL is `https://app.codriver.io`.

## `GET /v2/entities/nearby`

```bash
curl 'https://app.codriver.io/v2/entities/nearby?lat=45.4699&lng=-73.5461&radius=3000&sources[]=community-cameras'
```

### Parameters

| Param | Required | Notes |
|---|---|---|
| `lat` | yes | WGS84 degrees, `[-90, 90]`. |
| `lng` | yes | WGS84 degrees, `[-180, 180]`. |
| `radius` | yes | Metres. **A bounding box is not accepted** — `bbox` returns `400`. |
| `sources[]` | no | Repeatable, or a CSV in `sources=`. Omit for everything. An unknown id returns `400` with the valid list. |
| `kinds` | no | CSV of kind ids, e.g. `alert.police,alert.accident`. |
| `layers` | no | CSV of layer slugs. Prefer `sources[]`. |
| `networks` | no | CSV of charger operator ids. Tesla is always included; how many *additional* networks you get depends on the account (see below). |
| `since` | no | ISO-8601; only entities updated after it. |
| `limit` | no | Cap on rows returned. |

### Response

```jsonc
{
  "entities": [
    {
      "id":            "…",
      "layer_slug":    "osm-cameras",
      "kind_id":       "camera.speed",
      "external_id":   "osm-node-1234567",
      "geom":          { "type": "Point", "coordinates": [-73.5461, 45.4699] },
      "geom_line":     null,          // GeoJSON LineString on entities that have a shape
      "first_seen_at": "2026-08-01T09:12:00.000Z",
      "last_seen_at":  "2026-08-25T17:31:15.378Z",
      "expires_at":    null,          // null = persistent
      "status":        "confirmed",
      "confidence":    0.82,
      "confirm_count": 3,
      "dispute_count": 0,
      "properties":    { "maxspeed": "50" }
    }
  ],
  "sources": [
    {
      "id":              "community-cameras",
      "status":          "online",     // online | degraded | offline
      "last_success_at": "2026-08-25T17:31:15.378Z",
      "recent":          { "ok": 12, "fail": 0, "total": 12 }
    }
  ],
  "networks_applied": ["23", "3534"],
  "fetched_at_utc":   "2026-08-25T18:03:52.683Z"
}
```

Coordinates are GeoJSON order — `[lng, lat]`.

`sources[]` reports per-source health, so a caller can tell "nothing here" apart from "that source is down".

### Access and limits

| | |
|---|---|
| Auth | None required. Without an account you are rate-limited as a guest. |
| Rate limit | 120 requests/minute with an account, 60 as a guest. |
| CORS | **Not enabled.** Browser calls from another origin will fail; call it from a server, a script or a shell. |
| Caching | `Cache-Control: public, max-age=10`. Do not poll faster than that; you will get the same bytes. |

Charger networks are tiered: a guest sees Tesla only, an account adds one more network, a Premium account has no cap. Whatever you ask for, `networks_applied` tells you what you actually got.

## `GET /v2/sources`

The list of source ids valid in `sources[]`, including approved public feeds:

```bash
curl 'https://app.codriver.io/v2/sources' | jq '.sources[] | {id, label, source_type}'
```

```jsonc
{
  "sources": [
    {
      "id":          "community-cameras",
      "label":       "Speed cameras (community)",
      "attribution": "OpenStreetMap",
      "layer_slugs": ["osm-cameras"],
      "kind_ids":    null,             // null = every kind on those layers
      "default_on":  true,
      "source_type": "builtin"         // builtin | feed-pull | feed-push
    }
  ]
}
```

An approved public feed appears here as `feed:<feed-id>` with `source_type` `feed-pull` or `feed-push`. A feed that is unapproved, deactivated or private is not listed.

Cached for 60 s.

## Terms

Read access is provided for personal and non-commercial use; bulk or commercial reuse needs a separate agreement (<support@codriver.io>). Attribution for each source is in the `attribution` field of `/v2/sources` — carry it if you display the data.

## See also

- **[Entities and kinds](/concepts/entities-and-kinds)** — what the fields mean
- **[Kind catalog](/reference/kinds)** — every `kind_id` you may encounter
- **[Pull protocol](/protocols/pull)** — putting your own data in
