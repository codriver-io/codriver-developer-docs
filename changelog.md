# Changelog

Changes to the codriver developer surface and to this documentation. Newest first.

## 2026-08-25 — apps: a second way to extend codriver

Until now the only extension point was data: publish a feed, get pins on the map. **Apps** add a second one — a catalogue entry a driver installs on their account, which can extend either plane.

**Nothing in this section is live yet.** There is no catalogue, no submission form, and no install button on the account page. The contracts are settled and the implementation is being built against them, which is why the documentation is going up first; every new page carries a dated status note saying the same thing. This changelog gets another entry, with a date, when the surface actually ships — that is the one to trust.

What the platform is:

- Four **integration types**. `pins` and `custom_layer` are the [feed mechanism](/protocols/pull) that already exists, surfaced in the catalogue. `widget` and `notifications` are new: your own web page, rendered in a slot beside the map. The two new ones are **mechanically identical in v1** and differ only as catalogue intent.
- **A `pins` or `custom_layer` app does not create its feed.** In this release there is no automatic joining: you register the feed through the ordinary feed flow *and* submit a catalogue entry pointing at it. [Details](/guides/build-an-app#data-plane-apps-need-a-feed-as-well-for-now).
- A page in a `widget` or `notifications` slot runs in a **sandboxed cross-origin iframe on your origin**. codriver never runs your JavaScript in its own page, and your page cannot read the driver's session, location, speed or heading. Nothing location-shaped is passed to a widget in v1. That is a permanent property of the design, not a v1 limitation. See [isolation](/guides/build-an-app#isolation).
- The host sends your page one message, `context`, carrying `theme`, `units`, `uiSize`, `slot`, `size`, `device` and the driver's `config`. It arrives on load, whenever your page posts `ready`, on any change to theme / units / density, and whenever your slot's rendered size changes — so pages must handle it repeatedly. `uiSize` is a **density preference, not a scale factor**: lay out against `size` and use it only as a nudge, because the host has already applied its own zoom. An optional config field the driver left blank is **omitted** from `config`, never `null`. [Contract](/guides/build-an-app#the-context-message).
- **Once mounted, your iframe stays loaded.** Hiding it sets the `hidden` attribute rather than unmounting, and an unchanged install is never re-created — but Chromium throttles timers in hidden frames, so a long-lived stream needs a resume mechanism rather than an assumption of continuity. [Details](/guides/build-an-app#your-frame-stays-loaded).
- **Config arrives in that message, never in your URL**, so a topic, token or account name never lands in browser history, referrers or logs.
- You declare the inputs you need as a **`config_schema`** — at most 12 fields, keys matching `^[a-z][a-z0-9_]{0,31}$`, with `secret: true` for anything that should be masked on the account page and kept out of logs. codriver renders the form and stores the answers. A `secret` value is still delivered to your page in full; `secret` governs the form and the logs, not the delivery.
- The page codriver embeds is a distinct submission field, **`widget_url`**, required if and only if you declare `widget` or `notifications`. It is not `website_url`, which is your product page and is never framed.
- Submissions are `pending` until a curator approves them, and **resubmitting creates a new pending version while the approved one keeps serving** — review is never an outage. New versions must stay backward compatible with the config drivers have already saved. [Rules](/guides/build-an-app#versioning-and-backward-compatibility).
- Occupying a widget slot is a Premium feature for the driver. Browsing the catalogue is public.
- **codriver takes no payment and brokers nothing.** The `cost` field is disclosure shown in the catalogue; anything an app charges is collected by its developer, directly from the driver.

New pages:

- **[Build an app](/guides/build-an-app)** — the developer contract end to end: the isolation model and why it is that way, the context message with a working listener, `config_schema`, the embeddability and performance requirements, designing for a glance, a local test harness, submission, review and versioning.
- **[The ntfy app](/guides/ntfy-app)** — a worked example built on the first real app, an ntfy.sh client that shows phone notifications in the car. Its repository is the reference implementation to copy; neither it nor its deployed page resolves yet.
- **[Install an app](/guides/install-an-app)** — the driver-facing guide: what an app is, what codriver does and does not vouch for, installing, slots, removing, and what a blank panel means.

The [home page](/home) is reframed around both paths. Nothing about the feed protocols changed.

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
