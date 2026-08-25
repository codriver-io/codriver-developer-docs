# Kind catalog

Every entity codriver renders is one of the kinds below. Providers map their upstream's vocabulary to this taxonomy on output. Anything outside this list is rejected at ingest.

## Alerts (transient incidents)

| Kind | Default TTL | Description |
|---|---|---|
| `alert.police` | 5 min | Police presence, speed trap, checkpoint |
| `alert.accident` | 5 min | Accident, crash, collision |
| `alert.hazard` | 5 min | Generic hazard — use only if no subtype below fits |
| `alert.hazard.car_stopped` | 5 min | Stopped vehicle on shoulder / lane |
| `alert.hazard.object_on_road` | 5 min | Debris, tire, fallen cargo, lost load |
| `alert.hazard.pothole` | 15 min | Pothole, lane damage |
| `alert.hazard.animal` | 5 min | Animal on road (live or roadkill) |
| `alert.hazard.fog` | 15 min | Fog patch reducing visibility |
| `alert.hazard.ice` | 15 min | Ice, freezing rain, slippery surface |
| `alert.hazard.flooding` | 15 min | Flooded road, heavy rain pooling |
| `alert.road_closed` | 15 min | Full road closure (event, accident, work) |
| `alert.construction` | 15 min | Construction zone, lane reduction, work in progress |

**Properties commonly seen on alerts**:

```jsonc
{
  "subtype":       "<upstream's subtype string, if any>",
  "street":        "Boul René-Lévesque",
  "city":          "Montréal",
  "country":       "CA",
  "reported_by":   "<username, if your upstream has it>",
  "description":   "<free-text>",
  "num_thumbs_up": 0,            // upstream confidence
  "reliability":   6,            // 0-10, optional
  "confidence":    0,            // 0-10, optional
  "observed_from": {             // for community-submitted alerts
    "course_deg": 180,           // heading of the observer
    "speed_kmh":  45
  }
}
```

## Events (transient, polyline-shaped)

| Kind | Default TTL | Description |
|---|---|---|
| `traffic.jam` | 15 min | Congestion / stand-still traffic |

**Properties on jams**:

```jsonc
{
  "severity":         3,                            // 1-5
  "speed_kmh":        12.4,                         // current avg speed
  "length_m":         850,                          // jam length in meters
  "delay_s":          240,                          // delay vs free-flow
  "street":           "Highway 40",
  "city":             "Montréal",
  "line_coordinates": [[-73.57, 45.50], [-73.56, 45.51], ...]   // [lng, lat], GeoJSON order
}
```

The entity's `lat` / `lng` is the position of the jam. `line_coordinates` is accepted and stored, but **an entity published by a feed is drawn as a point** — codriver does not render a feed-supplied polyline. Send it if you have it (it is useful data), but do not count on a shape appearing on the map.

## POIs (persistent)

| Kind | Default TTL | Description |
|---|---|---|
| `camera.speed` | persistent | Fixed speed camera |
| `camera.red_light` | persistent | Red-light enforcement camera |
| `camera.avg_speed` | persistent | Average-speed enforcement (entry/exit pair) |
| `charger.supercharger` | persistent | Tesla Supercharger (DC fast, 150-250 kW typical) |
| `charger.destination` | persistent | Tesla Destination charger (AC, 7-22 kW typical) |

**Properties on cameras**:

```jsonc
{
  "maxspeed":  "50",        // posted limit at the camera, string (some are 'variable')
  "direction": "north",     // compass / bearing if known
  "name":      "Sherbrooke St E camera",
  "ref":       "<upstream reference id>"
}
```

**Properties on chargers**:

```jsonc
{
  "name":            "Montréal-Ferrier Supercharger",
  "address":         "1234 Boul X, Montréal, QC",
  "stalls":          12,
  "max_kw":          250,
  "connector_types": ["Tesla", "CCS"],
  "last_verified":   "2025-08-14T00:00:00Z",
  "is_operational":  true,
  "usage_cost":      "$0.41/kWh"
}
```

## Rejected kinds

`kind` is validated per row at ingest. A row whose kind is not in this catalog is rejected individually — the rest of your batch or snapshot still lands. On push you see it in the `errors` array of the response; on pull it is counted as a rejection against that poll.

## Adding a new kind

The catalog grows when a real provider needs to publish something new and the existing kinds don't fit. To request: email <support@codriver.io> with:

- proposed kind id (`alert.hazard.pothole` is the naming pattern)
- the category (`alert` / `event` / `poi`)
- a default TTL recommendation
- expected `properties` shape
- 1-2 real examples from your upstream

Speculative additions ("I might use this someday") aren't added. The taxonomy stays small on purpose.

## See also

- **[Entities and kinds (concept page)](/concepts/entities-and-kinds)** — the data shape + TTL semantics
- **[Pull protocol](/protocols/pull)** — how to publish these
