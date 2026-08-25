# Build a provider for codriver

codriver is a driving overlay for the Tesla in-car browser. The map renders incidents (police, accidents, hazards, road closures, jams), speed cameras, and Tesla chargers as pins over a Mapbox basemap, plus turn-by-turn navigation. Every pin on the map comes from a **provider** — a small service that publishes data in codriver's canonical entity format. codriver itself owns the schema, kind taxonomy, icons, and decay rules; providers fill in the data.

This site is the developer reference for becoming one. Read it if you want codriver to render your traffic data, charger network, snow-removal feed, hazard reports — anything that fits a (lat, lng, kind, properties) shape.

## How it works

```
┌──────────────┐    GET /alerts        ┌──────────────────┐    GET /relay/incidents   ┌──────────────────────┐
│   Tesla      │ ────────────────────▶ │  app.codriver.io │ ────────────────────────▶ │  your provider       │
│   browser    │ ◀──────────────────── │                  │ ◀──────────────────────── │  (this is you)       │
└──────────────┘  v1 entities + jams   └──────────────────┘   { entities: [...] }     └──────────┬───────────┘
                                                                                                  │
                                                                                                  ▼
                                                                                       ┌──────────────────────┐
                                                                                       │  upstream data       │
                                                                                       │  source              │
                                                                                       │  (OpenWebNinja,      │
                                                                                       │   municipal feeds,   │
                                                                                       │   your own scrape,…) │
                                                                                       └──────────────────────┘
```

Every time a driver's Tesla polls codriver for nearby incidents, codriver pulls from every registered provider matching the driver's bbox, merges the results, and returns them to the Tesla. Caching at codriver's edge limits the call rate per provider to ~1 RPS per Tesla. Your provider stays idle when nobody's driving in your coverage.

## 5-minute quickstart

```bash
# 1. Set up a small HTTP service that returns codriver v1 entities for
#    a (lat, lng, radius, tenant) tuple. The simplest possible version:

cat > server.js <<'JS'
import Fastify from 'fastify';
const app = Fastify();
const SECRET = process.env.RELAY_SHARED_SECRET;

app.get('/relay/incidents', async (req, reply) => {
  if (req.headers['x-codriver-auth'] !== SECRET) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
  const { lat, lng, radius, tenant } = req.query;

  // …call your upstream here…
  const entities = [
    {
      external_id: 'demo-1',
      kind:        'alert.police',
      lat:         Number(lat) + 0.001,
      lng:         Number(lng),
      properties:  { street: 'Demo Avenue' },
      observed_at: new Date().toISOString(),
    },
  ];

  return { entities, fetched_at_utc: new Date().toISOString() };
});

await app.listen({ host: '0.0.0.0', port: 3000 });
JS

# 2. Run it
RELAY_SHARED_SECRET=$(openssl rand -hex 32) node server.js

# 3. Tell codriver about it (one-time, while signed in at codriver.io)
curl -X POST 'https://app.codriver.io/v2/feeds' \
  -H 'Content-Type: application/json' \
  --cookie /tmp/codriver-cookies.txt \
  -d "{
    \"name\":             \"My traffic provider\",
    \"direction\":        \"pull\",
    \"pull_url\":         \"https://my-provider.example.com/relay/incidents\",
    \"pull_auth_header\": \"X-Codriver-Auth: $RELAY_SHARED_SECRET\",
    \"visibility\":       \"public\"
  }"
```

That's it — codriver now pulls from your endpoint on every driver request and renders the entities on the map.

## What to read next

If you're going to build a provider, in order:

1. [Entities and kinds](/concepts/entities-and-kinds) — the data shape.
2. [Pull protocol](/protocols/pull) — the canonical integration.
3. [Authentication](/protocols/pull#authentication) — the shared-secret header.
4. [Kind catalog reference](/reference/kinds) — every kind you can publish.
5. [Walkthrough: building a provider](/examples/build-a-provider) — end-to-end reference, ~200 LOC.

If you'd rather **push** data instead of being polled, see [Push protocol](/protocols/push) (alternative integration mode).

## Status of this site

- **MVP** — only 6 pages. The protocol is stable; the documentation will grow as integrators ask questions.
- Issues, ambiguity, missing kinds: <support@codriver.io>.
