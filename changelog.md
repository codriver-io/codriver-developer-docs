# Changelog

Changes to the codriver developer surface and to this documentation. Newest first.

## 2026-08-25 — documentation catch-up, and two limits that now bite

This site had not been touched since May. Several pages described an integration shape that was never the one `POST /v2/feeds` actually gives you. Everything below is either a correction to the docs or a change to the service; both are called out.

### Corrections (the service did not change)

- **The pull protocol is a scheduled poll of a JSON URL**, not a per-driver query. Earlier pages described codriver calling your endpoint with `lat`, `lng`, `radius` and an opaque per-car parameter on every driver request, with a short-lived cache in front. That is not what a registered pull feed gets. codriver fetches your `pull_url` every `pull_interval_seconds` with no parameters, and expects a **top-level JSON array**. [Pull protocol](/protocols/pull) is rewritten; so is the [walkthrough](/examples/build-a-provider).
- **Feed entities are points.** A `properties` key holding a coordinate array is stored, but no shape is drawn from it. The jam example previously implied otherwise. See [entities and kinds](/concepts/entities-and-kinds).
- **Reserved property keys.** A few `properties` keys are read back by codriver and are stripped from anything you submit — today, `disputed_until`. [Documented here](/concepts/entities-and-kinds#reserved-property-keys).
- **No per-user opt-in step.** Earlier text said drivers would find approved feeds in a settings panel and subscribe individually. There is no such panel; an approved public feed is available through the source catalogue and the read API. The [visibility model](/concepts/entities-and-kinds#visibility-and-trust) is described as it actually behaves.
- **The push rate limit is real now** (below), but the "10 000 entities/minute" figure never existed and has been removed. The per-request cap of 5 000 entities is unchanged and enforced.

### Changes to the service

- **Push is rate-limited to 60 requests/minute per token.** This was documented since May and never enforced; it is now. Over the limit you get `429` with a `Retry-After` header. The 5 000-entities-per-request cap is unchanged.
- **`pull_url` must be https, on a public hostname.** Plain `http://` is now rejected at registration, as are IP literals and `localhost` / `.local` / `.internal` hosts. Your auth header is replayed on every poll and should not travel in clear text. Existing feeds are unaffected until you next change the URL. The same validation now also runs on `PATCH`, which previously skipped it.
- **Unapproved feeds no longer appear in `GET /v2/sources`.** The catalogue listed a feed's layer as soon as it was created. It now lists a feed only once a curator has approved it, which is what the docs always claimed.

### New pages

- **[Read API](/reference/read-api)** — `GET /v2/entities/nearby` and `GET /v2/sources`: real parameters, response shape, rate limits, and the fact that CORS is not enabled.
- **This changelog.**

## 2026-05-24 — this site

Six pages published: overview, entities and kinds, pull, push, the kind catalog, and a walkthrough.
