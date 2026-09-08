# Build an app for codriver

An **app** is a catalogue entry a driver installs on their codriver account. Until now the only way to extend codriver was to publish [data](/protocols/pull) — entities that render as pins on the map. Apps add a second option: your own web page, rendered beside the map in the car.

> **Status — 2026-08-26. The app platform is live.** The [marketplace](https://codriver.io/marketplace) lists approved apps, the submission form takes new ones, and drivers install them from their account page. Everything on this page describes shipped behaviour.
>
> Two caveats worth having up front. Occupying a screen slot is a **Premium** feature for the driver, and a driver has **two** slots. And the in-car side has not yet been measured on an MCU2 car (the eight-year-old hardware), so the slot count there may end up lower than two.

## Start from an app template

These public repositories are working examples you can fork or clone and adapt.
They use plain HTML, CSS and JavaScript, with no frontend framework or build step.

| Template | What it displays | What you can learn |
|---|---|---|
| [Weather](https://github.com/codriver-io/codriver-app-weather) | Current conditions and the next four hours for a chosen city. | City configuration, metric/imperial units, periodic refreshes, and keeping the last forecast visible when a request fails. |
| [Crypto prices](https://github.com/codriver-io/codriver-app-crypto) | Prices and 24-hour changes for up to three coins. | Coin and currency settings, compact rows, periodic refreshes, and stale-data states. |
| [ntfy notifications](https://github.com/codriver-io/codriver-app-ntfy) | Messages from a configured notification topic. | Streaming updates, reconnecting after an outage, and handling optional authentication. See the [ntfy walkthrough](/guides/ntfy-app). |
| [Codriver Radio / Playlist](https://github.com/codriver-io/codriver-app-playlist) | A compact player for two original Codriver tracks. | User-initiated audio playback, track switching, themes and text sizing, with no configuration or external API. |

Codriver Radio is an audio example: playback starts with a tap, and its play
and next-track controls are for use **while parked**. It is not an example of
the passive, silent widgets described in the driving requirements below.

Each example includes the widget page (`public/index.html`), a local host
simulator (`public/dev.html`), and a manifest (`codriver-app.json`) describing
its catalogue entry and configuration fields. The simulator lets you change
settings, theme, units and text size without running codriver in a car.

### Run a template locally

For example, start with Weather. You need Git and Python 3:

```bash
git clone https://github.com/codriver-io/codriver-app-weather.git
cd codriver-app-weather
python3 -m http.server 8792 -d public
```

Open `http://localhost:8792/dev.html` and use **Send context** to apply settings.
Resize the preview to check the layout. The same static-server approach works
with the other repositories; their READMEs include app-specific instructions.

### Make it your own

1. Replace the example's content and data source with your own, keeping the
   `ready` / `context` handshake described below.
2. Update the name, description, URLs and `config_schema` in the manifest.
3. Test both themes, text sizes, configuration changes and network failures in
   the local simulator, then check the app in codriver.
4. Host your page at your own public HTTPS URL. If you use an example's
   deployment script, change its hosting project name before deploying.
5. Add the URL as a **Custom page** to try it in a slot, or submit your own
   catalogue entry for review. Forking a repository does not register an app.

The source code is MIT licensed. Codriver Radio’s songs and cover artwork are
copyright Codriver and are **not** covered by its MIT code license; use your own
media or obtain permission when adapting that example. External data and services have separate
licenses, attribution requirements and usage limits; check those before
publishing your adaptation. Keep tokens and other secrets out of your source
code and widget URL.

## What an app is

Four things, in the order they matter:

1. A **page on your own origin**. You host it, you deploy it, you own its uptime. codriver never gets a copy of it.
2. A **catalogue entry** — name, icon, description, cost, links — that a driver browses and installs.
3. A **`config_schema`**: the list of inputs your app needs from the driver (a server URL, a topic, a token). codriver renders the form, stores the answers, and hands them to your page.
4. An **integration type**, or several, saying which part of codriver you extend.

## The two planes

| Integration type | What it does | How it works |
|---|---|---|
| `pins` | Your data renders as pins on the map. | The existing [feed mechanism](/protocols/pull) — nothing new. |
| `custom_layer` | Your data renders as its own toggleable layer. | The same feed mechanism, listed as its own source. |
| `widget` | Your page renders in a slot beside the map. | A sandboxed cross-origin iframe. New in this release. |
| `notifications` | Your page surfaces incoming messages to the driver. | The same iframe. New in this release. |

An app can declare more than one. A charger network could publish `pins` for its stations and a `widget` showing the driver's current session.

**`widget` and `notifications` are mechanically identical in v1** — the same iframe, the same context message, the same requirements, the same everything on this page. They differ only as catalogue intent: which one you declare changes how your app is listed and filtered, not how it runs. Declare `notifications` if the app's job is to surface incoming messages, `widget` otherwise. A host-rendered delivery path for `notifications` — codriver drawing the notification itself rather than framing your page — is possible later, but it is not promised and nothing about it is designed.

If you only have data to publish, you do not need an app at all — register a feed and you are done. Start at [entities and kinds](/concepts/entities-and-kinds), then the [pull protocol](/protocols/pull). The rest of this page is about the interface plane.

### Data-plane apps need a feed as well, for now

**As of 2026-08-25 there is no automatic joining between a catalogue entry and a feed.** If you declare `pins` or `custom_layer`, you do two separate things:

1. **Register the feed** through the ordinary feed flow — [pull protocol](/protocols/pull), or [push](/protocols/push) — and get it approved. This is what actually puts your data on the map, and it works today whether or not you ever submit an app.
2. **Submit a catalogue entry** pointing at that feed, so drivers can find you by browsing rather than by knowing your URL.

Approving your app does **not** create the feed, and registering the feed does not create a catalogue entry. Skipping step 1 gets you a listing that shows nothing. This is a limitation of the first release, not the intended end state.

## Isolation

**codriver never runs your JavaScript in its own page.** Your app is loaded in a cross-origin iframe, sandboxed, on your origin. This is deliberate and it is permanent — do not build anything that assumes it will be relaxed.

What that means concretely:

- Your page **cannot** read the driver's codriver session, cookies, or account.
- Your page **cannot** read the car's location, speed or heading. Nothing location-, speed- or heading-shaped is passed to a widget in v1, by any route.
- Your page **cannot** read or change anything on the map — the route, the pins, the camera.
- Your page **cannot** reach into the host page's DOM, and the host page cannot reach into yours.
- The only thing you learn about the driver is what they typed into your own config form, plus the four presentation fields in the [context message](#the-context-message).

The trade you get for that is a low bar to entry: no review of your source code, no SDK to adopt, no build step, no runtime of ours in your page. A single HTML file is a complete app.

Users get the matching guarantee, written down for them in [Install an app](/guides/install-an-app): installing an app cannot hand a third party their location or their account.

## The context message

The host sends your page exactly one kind of message. It arrives by `postMessage`, targeted at your origin.

```jsonc
{
  "codriver": 1,
  "type":     "context",
  "theme":    "dark",        // "dark" | "light"
  "units":    "metric",      // "metric" | "imperial"
  "uiSize":   6,             // 1..10 density preference; 6 is the default
  "slot":     1,             // 1 | 2 — which slot you are in
  "size":     { "w": 300, "h": 130 },   // CSS pixels
  "device":   "tesla",       // "tesla" | "other"
  "config":   { }            // the driver's answers to your config_schema
}
```

| Field | Notes |
|---|---|
| `codriver` | Protocol version. Always `1` today. **Check it before you trust anything else in the message.** |
| `type` | `"context"` is the only host → page message in v1. |
| `theme` | Follow it. A light-theme widget in a dark cockpit at night is a flashlight in the driver's face. |
| `units` | Format distances and speeds accordingly. If your app has nothing unit-shaped, ignore it. |
| `uiSize` | The driver's **density preference**: 1 is compact, 10 is largest, 6 is the default. Not a scale factor — see below. |
| `slot` | Which of the two widget slots you were installed into. Presentation only; do not change behaviour on it. |
| `size` | The **iframe's content box, in CSS pixels**. Today that is about 300 × 130 and fixed. |
| `device` | `"tesla"` in the car, `"other"` anywhere else — a phone or a desktop browser signed in to codriver. |
| `config` | Whatever the driver filled in, keyed by your `config_schema` keys. An optional field the driver left blank is **omitted from the object**, never present as `null` — that is a guarantee, so `'topic' in config` and `config.topic` agree. |

**Config arrives in the message, never in your URL.** codriver loads your page URL as you submitted it, with no query string appended. That is on purpose: a topic name, an access token or an account handle in a URL ends up in browser history, in `Referer` headers, and in the access log of every asset your page loads. Do not defeat this by copying `config` into `location.search` once you have it.

### uiSize is a preference, not a multiplier

**Do not scale your layout by `uiSize`.** The host has already applied its own zoom before your frame is laid out, so a widget that multiplied its geometry by the driver's preference would apply that preference twice and end up either unreadable or clipped. Lay out against `size`, which is real pixels and already reflects everything the host has done.

Where `uiSize` does belong is your **base type size** — and there, a shared answer is worth more than a clever one. Two panels sitting side by side in the same car, each interpreting a bare 1–10 range its own way, visibly disagree. So if you have no better idea, use this scale:

```js
const fontSizePx = 10.5 + ctx.uiSize * 0.6;   // ≈11px at 1, 14px at the default 6, 16.5px at 10
```

**Suggested, not enforced.** The host does not check it and nothing breaks if you deviate — a widget whose content genuinely needs bigger numbers should use bigger numbers. It exists so that independent widgets land in the same neighbourhood rather than each picking a different one. The [reference app](/guides/ntfy-app) uses exactly this line.

### When it arrives

Four times, at least:

1. On the iframe's `load` event — possibly **before** your listener is attached.
2. Whenever your page posts `{ codriver: 1, type: 'ready' }` to `window.parent`.
3. On any change to `theme`, `units` or `uiSize` while your page is open.
4. Whenever the rendered size of your slot changes.

So **handle it arriving more than once**. Make your render function idempotent: take the latest context, redraw, do not accumulate listeners or connections. A theme flip must not open a second connection to your backend.

`ready` is the only message the host accepts from your page. Anything else is ignored.

**Posting `ready` more than once is legal.** It is the supported way to ask for a fresh `context` — after recovering from an error, say, when you want to be certain the config in hand is current. The host re-answers every time, one `context` per `ready`. It is not a subscription you can double up by asking twice.

**Ignore fields you do not recognise.** Later protocol versions may add fields to `context`. A page that exhaustively switches over today's field list, or rejects a message carrying anything it was not written for, breaks on the next addition — for a payload that was, by construction, safe to skip. Read the keys you need and leave the rest alone. `units` is the live example: an app with nothing unit-shaped in it should accept the field and do nothing with it, which is what the reference app does.

### Your frame stays loaded

Once mounted, your iframe **stays loaded** for as long as the app is installed. codriver does not tear it down and rebuild it:

- Hiding your widget — a drawer opens over it, a modal takes the screen, the tab goes to the background — sets the frame's `hidden` attribute. It does not unmount you.
- An install whose config has not changed is never re-created.

That is what makes a long-lived connection a reasonable design here. It is not a promise that the connection survives, though, and this is the trap: **Chromium throttles timers in hidden frames.** Your reconnect timer, your keepalive check and your poll all slow to a crawl while you are hidden, and can be minutes late catching up. A stream can be dead for a while before your code notices.

So build for **resumption** rather than for continuity. Track the last thing you saw, and on reconnect ask your backend for everything since — ntfy's `since` parameter is exactly this, and the [ntfy app](/guides/ntfy-app#reconnects-and-errors) shows the shape. An app that assumes an unbroken socket works beautifully on a desk and comes back blank after a tunnel.

### A minimal listener

This is a complete, working app. Save it as `index.html`, serve it over https, and it renders.

```html
<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; height: 100%; font: 16px/1.3 system-ui, sans-serif; }
  body { display: grid; place-content: center; text-align: center;
         background: #111; color: #eee; }
  body.light { background: #fff; color: #111; }
</style>
<div id="out">Waiting…</div>
<script>
  let ctx = null;

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg?.codriver !== 1 || msg.type !== 'context') return;   // required
    ctx = msg;
    render();
  });

  function render() {
    if (!ctx) return;
    document.body.classList.toggle('light', ctx.theme === 'light');
    document.documentElement.style.colorScheme = ctx.theme;
    document.body.style.fontSize = (10.5 + ctx.uiSize * 0.6) + 'px';   // suggested scale
    document.getElementById('out').textContent =
      ctx.config.topic ? 'Watching ' + ctx.config.topic : 'Not configured';
  }

  // Attach the listener first, then ask for a context — in case the one sent
  // on load arrived before this script ran.
  window.parent.postMessage({ codriver: 1, type: 'ready' }, '*');
</script>
```

Two notes on that code:

- **Order matters.** Add the listener, then post `ready`. The reverse races.
- It reads `theme`, `uiSize` and `config`, and silently ignores `units`, `slot`, `size` and `device` — along with anything a later version adds. That is the behaviour you want.
- `'*'` as the target origin for `ready` is fine: the message carries nothing but a request to be told the context. Pinning `event.origin` on the way in is good hygiene if you want it, but `msg.codriver === 1` is the check that is **required** and the one the contract guarantees — an origin you hard-code today is an origin that can strand you when codriver's hosts change.
- `config.topic` is read without a `null` check because there is no `null` to check for: an optional field the driver left blank is absent from `config`.

Lay your page out with `100%` / viewport units rather than the numbers in `size`. Treat `size` as the hint that tells you which layout variant to pick, not as a value to hard-code — and note that during a resize your own measurement and the last `size` you were sent can briefly disagree, because they are two observations of a change in flight. **Trust your own measurement for layout; treat `size` as the host's statement of intent.**

## Declaring your inputs

`config_schema` is how you tell codriver what to ask the driver for. codriver renders the form on the account page, validates it, stores the answers, and delivers them in the context message. You never see the driver's credentials for anything else, and they never paste them into a page of yours.

```jsonc
{
  "fields": [
    { "key": "server", "label": "ntfy server", "type": "url", "required": true,
      "default": "https://ntfy.sh", "help": "Self-hosted? Put its URL here." },
    { "key": "topic",  "label": "Topic", "type": "string", "required": true,
      "maxLength": 64 },
    { "key": "token",  "label": "Access token", "type": "string",
      "required": false, "secret": true }
  ]
}
```

| Attribute | Notes |
|---|---|
| `key` | Matches `^[a-z][a-z0-9_]{0,31}$`. This is the key you read out of `config`. |
| `label` | What the driver sees above the input. Short, plain, no jargon. |
| `type` | One of `string`, `url`, `number`, `boolean`, `select`. |
| `options` | `select` only: `[{ "value": …, "label": … }]`. |
| `required` | Whether the form refuses to save without it. |
| `default` | Prefilled. A sensible default is the difference between an app people install and one they abandon. |
| `help` | One line under the input. Use it for the thing that will otherwise generate your support mail. |
| `maxLength` | `string` and `url`. |
| `secret` | `true` never shows the stored value back to the driver in full. |

At most **12 fields**. If you need more than twelve, you are asking the driver to do configuration that belongs on your own side.

`secret: true` governs the **account form and codriver's logging**, nothing else. The value is masked when the form is re-rendered, so the driver can replace it but cannot read it back, and it is kept out of logs. It is **not** withheld from your page — the whole point of an access token is that your page uses it, so it arrives in `config` in full, like any other value.

### What v1 does not validate

`config_schema` has no numeric range, no regex pattern, no cross-field conditionals. A `number` field accepts any number; a `string` field accepts anything up to `maxLength`. Validate in your own page and **fail visibly**: a widget that renders "Topic looks wrong" is debuggable by the driver, and one that renders nothing is not.

## Requirements on your page

### It must be embeddable

This is the single most common way an app fails, and it fails silently: the frame renders blank, and **the driver cannot tell why**.

Your page must not send either of:

- `X-Frame-Options`, in any form — `DENY` and `SAMEORIGIN` both block codriver
- a Content-Security-Policy `frame-ancestors` directive

**Send neither header.** That is not a shortcut, it is the correct configuration: an allowlist you pin today is an allowlist that goes stale when codriver's hosts change, and the failure mode of a stale one is a blank widget in every car with no error anywhere. Not restricting `frame-ancestors` at all keeps working through host changes without you touching anything.

If your organisation genuinely requires an explicit allowlist, **ask <support@codriver.io> for the current list of origins** rather than guessing from what you see in a browser — and expect to update it when you are told to.

Check what you actually send, from outside your network:

```bash
curl -sI https://your-app.example/ | grep -iE 'x-frame-options|content-security-policy'
```

You want that to print nothing. If you send a Content-Security-Policy for other reasons, the line that comes back must have no `frame-ancestors` in it. Self-hosted dashboards very commonly ship `X-Frame-Options: SAMEORIGIN` by default — as do a lot of copied-and-pasted nginx hardening snippets, several platform "security headers" toggles, and some reverse proxies. If you are wrapping an existing dashboard, assume it is set until you have proved otherwise.

codriver probes this at submission time and will tell you if your page refuses to be framed. It is a probe of one URL at one moment, though — a header you add later is not caught, and the failure shows up as blank widgets in cars.

### It must be reachable from a car

`https`, on a public hostname, with a valid certificate.

A LAN address will **never** work. `http://something.local:8123`, `http://192.168.1.40:3000`, `http://localhost:8123` — all of them fail twice over: they are plain http inside an https page, which the browser blocks as mixed content, and the car is not on your LAN in the first place. If you are putting a home dashboard in the car, it needs a public https endpoint (a tunnel, a reverse proxy, a hosted relay). There is no exception and no flag.

### The sandbox

Your frame runs with `allow-scripts allow-same-origin allow-forms`. In practice:

- **No popups.** `window.open` does nothing.
- **No top-level navigation.** You cannot navigate the car away from codriver. Links must be `target="_blank"`-less and in-frame, or they do nothing.
- **No downloads.**
- **No modal dialogs.** `alert`, `confirm`, `prompt` and `print` are unavailable. Render your message into the page instead.
- Your page keeps **its own origin**, so `fetch`, WebSockets, `localStorage` and IndexedDB all work against your backend. Cross-origin requests still need the usual CORS headers from whatever you call.
- Browser storage in a third-party frame is **partitioned** by the embedding site. Whatever your origin has stored in one of the driver's ordinary tabs is not visible here, and an existing login on your site does not carry over. Third-party cookies may be blocked outright. Take what you need through `config_schema` and do not plan on an ambient session.

### It must be cheap to run

The car may be an eight-year-old MCU2 with an Intel HD 505, already rendering a 3D map at about 25 fps in a separate process. Your widget is not the main event and must not act like it.

- **No animation.** No looping transitions, no spinners that spin forever, no `requestAnimationFrame` loop. A static "connecting…" is better than a spinner.
- **No video, no canvas redraw loop, no WebGL.**
- Repaint when data changes, and not otherwise.
- Ship a small page. Tens of kilobytes, not megabytes; a framework and its runtime buy you nothing in a 300 × 130 box.
- Prefer one long-lived connection over fast polling. If you must poll, 30 s is fast.
- Skip web fonts. A system stack renders instantly and costs no fetch.
- Assume the connection is a car's: intermittent, occasionally very slow, sometimes gone for a tunnel.

## Designing for a glance

The audience is **driving**. Everything below follows from that.

- **One idea per widget.** A number, a line of text, a state. If a driver has to read a second line to understand the first, it is too much.
- **Readable at arm's length.** Large type, high contrast, generous weight. The screen is further away than a phone and the driver is looking at it for well under a second.
- **Both themes, properly.** Follow `theme`. Dark is the common case at the times a driver most needs a glance to not blind them.
- **Quiet.** No sound, no flashing, no colour that shouts unless something genuinely warrants it. A widget that cries wolf gets uninstalled.
- **Never require interaction.** Assume the driver will never tap you. If your app only works after a tap, it does not work.
- **Say what is wrong in a few words.** "Can't reach server", "Wrong token", "No messages yet". Not a stack trace, not an error code, not silence.
- **Empty is a state you must design.** Most of the time nothing is happening. That view is the one the driver sees most.

## Testing locally

You do not need a car, and you do not need to be in the catalogue. The context message is three lines of JavaScript to fake. Save this as `harness.html` next to your app and open it:

```html
<!doctype html>
<meta charset="utf-8">
<title>codriver widget harness</title>
<style>
  body { font: 14px system-ui, sans-serif; padding: 24px; background: #222; color: #ddd; }
  iframe { width: 300px; height: 130px; border: 1px solid #555; background: #000; }
  label { margin-right: 12px; }
</style>

<p>
  <label>theme
    <select id="theme"><option>dark</option><option>light</option></select></label>
  <label>units
    <select id="units"><option>metric</option><option>imperial</option></select></label>
  <label>uiSize <input id="uiSize" type="number" min="1" max="10" value="5"></label>
  <button id="send">send context</button>
</p>

<iframe id="app" src="http://localhost:8080/" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>

<script>
  const app = document.getElementById('app');
  const config = { server: 'https://ntfy.sh', topic: 'my-test-topic' };

  function context() {
    return {
      codriver: 1, type: 'context',
      theme:  document.getElementById('theme').value,
      units:  document.getElementById('units').value,
      uiSize: Number(document.getElementById('uiSize').value),
      slot: 1, size: { w: 300, h: 130 }, device: 'other', config,
    };
  }

  const send = () => app.contentWindow.postMessage(context(), '*');
  app.addEventListener('load', send);
  document.getElementById('send').addEventListener('click', send);

  // Answer the app's ready ping, exactly as the host does.
  window.addEventListener('message', (e) => {
    if (e.data?.codriver === 1 && e.data.type === 'ready') send();
  });
</script>
```

Then work through this list before you submit:

- Load it **cold** — does it render before any interaction?
- Click **send context** three times — does it render the same, with one connection, not three?
- Flip **theme** and **uiSize** — does it follow, changing type size without rescaling its layout?
- Resize the iframe in devtools and re-send — does it re-lay-out from `size`?
- Hide the tab for five minutes, then come back — does it reconnect, and is the data current rather than stale?
- Set `config` to garbage — does it say so, legibly?
- Kill your backend — does it say so, and recover when the backend returns?
- Look at it from two metres away for one second. Can you read it?
- Then deploy and run the `curl -sI` header check above against the **deployed** URL. That is the check the harness cannot do for you, because it depends on headers only your real host sends.

## Submitting

Submission is a form, not an API. You will be asked for:

| Field | Limit |
|---|---|
| Name | ≤ 80 characters |
| Icon | Square PNG or SVG |
| Description | ≤ 255 characters |
| Installation instructions | ≤ 512 characters — what the driver has to do on **your** side first |
| `config_schema` | The JSON above; ≤ 12 fields |
| Integration types | One or more of `pins`, `custom_layer`, `notifications`, `widget` |
| `widget_url` | The https page codriver embeds. **Required if and only if** your integration types include `widget` or `notifications`. |
| `website_url` | Your own link, shown in the catalogue. Not what gets embedded — see above. |
| Docs | Where a driver reads more |
| Cost | Free, one-time fee, or recurring subscription |
| Version | Semver, e.g. `1.0.0` |

`widget_url` and `website_url` are separate fields and are not interchangeable. `widget_url` is the page that renders in the car and must satisfy every requirement above; `website_url` is your product page, and codriver never frames it.

Write the **installation instructions** for someone who has never used your product. "Create a topic at ntfy.sh, then send test notifications to it from your phone" is the kind of sentence that saves you the support mail.

The **cost** field is disclosure and nothing more: it is shown in the catalogue so a driver knows what they are getting into before installing. **codriver takes no payment and brokers nothing.** There is no billing integration, no revenue share, no checkout — if you charge for your app, you collect it yourself, on your own side, and the commercial relationship is strictly between you and the driver.

## Review

A submission is `pending` until a codriver curator approves it. Only approved apps are listed publicly.

**Resubmitting creates a new pending version. The approved version keeps serving until the new one is approved** — review is never an outage, so there is no reason to sit on a fix. Drivers with your app installed stay on the approved version until the new one clears.

A rejection tells you why. For a compatibility violation it names the offending key.

## Versioning and backward compatibility

Bump the semver on every submission. Between versions, drivers keep the config they already saved, so a new `config_schema` must not invalidate it.

**Allowed:**

- Add a field that is **optional**.
- Add a field that is required **and has a `default`**.
- Relax a field from `required: true` to `required: false`.
- Change a `label`, `help`, `default` or field order.

**Rejected:**

- Removing a field.
- Changing a field's `key`.
- Changing a field's `type`.
- Adding a required field with no `default`.

Two things the check does not catch that will still break drivers: removing an option from a `select` that people have already chosen, and quietly changing what a value *means* while keeping its key. Treat a config key like a public API — because to every driver who has installed you, it is one.

If you genuinely need a breaking change, add the new field alongside the old one, read either, and let the old one go unused. Nothing forces you to keep using a field you have stopped reading.

## Checklist

- [ ] https, public hostname, valid certificate
- [ ] No `X-Frame-Options`, no `frame-ancestors` — verified with `curl -sI` against the deployed URL
- [ ] Validates `event.data.codriver === 1` before trusting a message
- [ ] Posts `ready` **after** attaching its listener
- [ ] Handles the context message arriving repeatedly, idempotently — including on resize
- [ ] Ignores context fields it does not recognise, rather than rejecting the message
- [ ] Follows `theme`, formats to `units`, and sets its **base type size** from `uiSize` rather than scaling its layout
- [ ] Renders in a 300 × 130 box with no scrolling and no interaction
- [ ] No animation, no popups, no dialogs, no downloads
- [ ] Every failure mode renders a short human sentence, and recovers after being hidden and throttled
- [ ] ≤ 12 config fields, keys matching `^[a-z][a-z0-9_]{0,31}$`, secrets marked `secret: true`
- [ ] `widget_url` set, and distinct from `website_url`
- [ ] Installation instructions a stranger can follow

## See also

- **[The ntfy app](/guides/ntfy-app)** — a worked example, and the reference implementation to copy
- **[Install an app](/guides/install-an-app)** — the driver's side of this, worth reading before you design the config form
- **[Entities and kinds](/concepts/entities-and-kinds)** — the data plane's shape, for `pins` and `custom_layer`
- **[Pull protocol](/protocols/pull)** — how the data plane is wired
- **[Read API](/reference/read-api)** — reading what is on the map
