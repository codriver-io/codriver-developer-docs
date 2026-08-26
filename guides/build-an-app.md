# Build an app for codriver

An **app** is a catalogue entry a driver installs on their codriver account. Until now the only way to extend codriver was to publish [data](/protocols/pull) — entities that render as pins on the map. Apps add a second option: your own web page, rendered beside the map in the car.

> **Status — 2026-08-25.** The app platform is being built. The contracts on this page are settled and are what the implementation targets, so you can start building against them today, but nothing here is live yet: there is no catalogue to browse, no submission form, and no install button on the account page. This page is published ahead of the release rather than after it. The [changelog](/changelog) gets a dated entry when the surface goes live, and that is the date to trust.

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

If you only have data to publish, you do not need an app at all — register a feed and you are done. Start at [entities and kinds](/concepts/entities-and-kinds), then the [pull protocol](/protocols/pull). The rest of this page is about the interface plane.

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
  "uiSize":   5,             // 1..10, the driver's UI scale
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
| `uiSize` | The driver's chosen interface scale, 1 (smallest) to 10 (largest). Scale your type off it. |
| `slot` | Which of the two widget slots you were installed into. Presentation only; do not change behaviour on it. |
| `size` | The frame's content box in CSS pixels. Today that is about 300 × 130 and fixed. |
| `device` | `"tesla"` in the car, `"other"` anywhere else — a phone or a desktop browser signed in to codriver. |
| `config` | Whatever the driver filled in, keyed by your `config_schema` keys. Missing optional fields are absent, not `null`. |

**Config arrives in the message, never in your URL.** codriver loads your page URL as you submitted it, with no query string appended. That is on purpose: a topic name, an access token or an account handle in a URL ends up in browser history, in `Referer` headers, and in the access log of every asset your page loads. Do not defeat this by copying `config` into `location.search` once you have it.

### When it arrives

Three times, at least:

1. On the iframe's `load` event — possibly **before** your listener is attached.
2. Whenever your page posts `{ codriver: 1, type: 'ready' }` to `window.parent`.
3. On any change to `theme`, `units` or `uiSize` while your page is open.

So **handle it arriving more than once**. Make your render function idempotent: take the latest context, redraw, do not accumulate listeners or connections. A theme flip must not open a second connection to your backend.

`ready` is the only message the host accepts from your page. Anything else is ignored.

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
    document.documentElement.style.fontSize = (12 + ctx.uiSize) + 'px';
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
- `'*'` as the target origin for `ready` is fine: the message carries nothing but a request to be told the context. If you would rather pin it, the host origin is `https://app.codriver.io`. Pinning `event.origin` on the way in is likewise good hygiene, but `msg.codriver === 1` is the check that is required and the one the contract guarantees.

Lay your page out with `100%` / viewport units rather than the numbers in `size`. Treat `size` as the hint that tells you which layout variant to pick, not as a value to hard-code.

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

A `secret: true` field is masked on the account page — the driver can replace it but cannot read it back. It is **not** withheld from your page: the whole point of an access token is that your page uses it, so it arrives in `config` like any other value.

### What v1 does not validate

`config_schema` has no numeric range, no regex pattern, no cross-field conditionals. A `number` field accepts any number; a `string` field accepts anything up to `maxLength`. Validate in your own page and **fail visibly**: a widget that renders "Topic looks wrong" is debuggable by the driver, and one that renders nothing is not.

## Requirements on your page

### It must be embeddable

This is the single most common way an app fails, and it fails silently: the frame renders blank, and **the driver cannot tell why**.

Your page must not send either of:

- `X-Frame-Options: DENY` or `X-Frame-Options: SAMEORIGIN`
- a Content-Security-Policy `frame-ancestors` directive that excludes codriver

The simplest correct answer is to send neither header. If you want an explicit allowlist, use:

```
Content-Security-Policy: frame-ancestors https://app.codriver.io;
```

Check what you actually send, from outside your network:

```bash
curl -sI https://your-app.example/ | grep -iE 'x-frame-options|content-security-policy'
```

You want that to print nothing, or a `frame-ancestors` that names codriver. Self-hosted dashboards very commonly ship `X-Frame-Options: SAMEORIGIN` by default — as do a lot of copied-and-pasted nginx hardening snippets, several platform "security headers" toggles, and some reverse proxies. If you are wrapping an existing dashboard, assume it is set until you have proved otherwise.

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
- Flip **theme** and **uiSize** — does it follow?
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
| Page URL | The https page codriver embeds. Required for `widget` and `notifications`. |
| Website | Your own link |
| Docs | Where a driver reads more |
| Cost | Free, one-time fee, or recurring subscription |
| Version | Semver, e.g. `1.0.0` |

Write the **installation instructions** for someone who has never used your product. "Create a topic at ntfy.sh, then send test notifications to it from your phone" is the kind of sentence that saves you the support mail.

The **cost** field is disclosure, shown in the catalogue so a driver knows before installing. Anything you charge is between you and them.

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
- [ ] No `X-Frame-Options`; no `frame-ancestors` that excludes codriver — verified with `curl -sI` against the deployed URL
- [ ] Validates `event.data.codriver === 1` before trusting a message
- [ ] Posts `ready` **after** attaching its listener
- [ ] Handles the context message arriving repeatedly, idempotently
- [ ] Follows `theme` and `uiSize`; formats to `units`
- [ ] Renders in a 300 × 130 box with no scrolling and no interaction
- [ ] No animation, no popups, no dialogs, no downloads
- [ ] Every failure mode renders a short human sentence
- [ ] ≤ 12 config fields, keys matching `^[a-z][a-z0-9_]{0,31}$`, secrets marked `secret: true`
- [ ] Installation instructions a stranger can follow

## See also

- **[The ntfy app](/guides/ntfy-app)** — a worked example, and the reference implementation to copy
- **[Install an app](/guides/install-an-app)** — the driver's side of this, worth reading before you design the config form
- **[Entities and kinds](/concepts/entities-and-kinds)** — the data plane's shape, for `pins` and `custom_layer`
- **[Pull protocol](/protocols/pull)** — how the data plane is wired
- **[Read API](/reference/read-api)** — reading what is on the map
