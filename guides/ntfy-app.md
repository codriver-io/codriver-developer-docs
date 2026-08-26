# The ntfy app

A worked example: a widget that shows the notifications from your phone on the car screen. It is the first app built on the platform, it is open source, and it is the thing to copy when you build your own.

> **Status — 2026-08-25.** Being built alongside the platform itself. Neither the repository at <https://github.com/gauthiergarnier/codriver-app-ntfy> nor the deployed page at <https://ntfy-client-codriver.pages.dev> resolves yet — as of today both return nothing. This page describes what is being built so you can read the design before the code lands. The [changelog](/changelog) gets a dated entry when they are public.

Read [Build an app](/guides/build-an-app) first. This page assumes the [context message](/guides/build-an-app#the-context-message) and the [embeddability requirements](/guides/build-an-app#it-must-be-embeddable) rather than repeating them.

## What it does

[ntfy](https://ntfy.sh) is a pub-sub notification service: you publish a message to a **topic** over plain HTTP, and everyone subscribed to that topic receives it. It is the simplest widely-used way to get "something happened" from one machine to another, and a lot of people already route their phone notifications, their home automation and their server alerts through it.

The codriver app subscribes to one topic and renders the most recent message. That is the whole product:

```
  your phone / server ──▶ ntfy.sh/your-topic ──▶ the widget in the car
       publishes                  streams              renders the last one
```

It declares the `notifications` integration type, which in v1 is mechanically identical to `widget` — the same iframe, the same context message. The declaration only affects how it is listed in the catalogue.

It is a good first app for the platform because it exercises everything awkward: a long-lived connection over a car's flaky network, a secret in the config, a genuinely empty default state, and a hard limit of one glance to read the result.

## Its config schema

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

Three fields, and each one earns its place:

- **`server` has a default that works.** Most people use the public `ntfy.sh`, so the common case is a field the driver never touches. The `help` line exists only for the minority who self-host, which is exactly what `help` is for.
- **`topic` is the only thing that is genuinely required of the driver.** Keep the number of those as close to one as you can.
- **`token` is optional and `secret: true`.** Public ntfy topics need no auth; private ones and self-hosted servers do. `secret` governs the account form and codriver's logging: the field is masked once saved, so the driver can replace it but not read it back. The value itself arrives in `config` in full — your page cannot subscribe without it.

Because `token` is optional, a driver on a public topic leaves it blank and the key is then **absent from `config` entirely**, not present as `null`. That is why the code below tests `if (config.token)` and needs nothing more careful.

Note what is *not* in the schema: no "refresh interval", no "max messages", no theme picker. codriver already tells you the theme, and every other knob is a decision the app should make instead of delegating.

## Subscribing

ntfy streams a topic as newline-delimited JSON at `GET {server}/{topic}/json`. The widget reads it with `fetch` and a streaming body, which is the one approach that lets you send the `Authorization` header directly:

```js
async function subscribe(config, signal, onMessage) {
  const url = new URL(`${config.topic}/json`, config.server);
  url.searchParams.set('since', String(lastId || '10m'));

  const headers = { Accept: 'application/x-ndjson' };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;

  const res = await fetch(url, { headers, signal });
  if (!res.ok) throw new HttpError(res.status);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;                       // stream ended — reconnect
    buffer += value;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onMessage(JSON.parse(line));
    }
  }
}
```

Three things that are easy to get wrong here:

- **Not every line is a notification.** ntfy interleaves `open` and `keepalive` events into the same stream. Filter on `event === 'message'` and ignore the rest — but treat a `keepalive` as proof the connection is alive, because on a car's connection that is the only proof you get.
- **`since` is what makes a reconnect seamless.** Remember the `id` of the last message you rendered and pass it back on reconnect, so a tunnel does not cost you the message that arrived inside it. Before you have seen anything, `since=10m` gives the driver something to look at on first load instead of an empty box.

  This is also what makes the widget survive being hidden. codriver keeps the frame loaded rather than unmounting it, but Chromium throttles timers in a hidden frame, so a stream can be dead for minutes before the reconnect loop notices — see [your frame stays loaded](/guides/build-an-app#your-frame-stays-loaded). `since` turns that from data loss into a slightly late catch-up.
- **Cross-origin works.** ntfy allows any origin, so the widget calls it directly from the frame — there is no relay in the middle and no server of ours in the path. Your config, including your token, goes from the account page to your car and nowhere else.

## Reconnects and errors

A car loses its connection constantly. Reconnection is not an edge case in this app, it is the main loop.

```js
let attempt = 0;

async function run(config, signal) {
  while (!signal.aborted) {
    try {
      await subscribe(config, signal, render);
      attempt = 0;                       // clean end of stream: reconnect at once
    } catch (err) {
      if (signal.aborted) return;
      if (err.status === 401 || err.status === 403) return showFatal('Wrong or missing token');
      if (err.status === 404) return showFatal('Topic not found');
      attempt++;
    }
    const wait = Math.min(1000 * 2 ** attempt, 60_000);
    showTransient(attempt > 2 ? 'Reconnecting…' : null);
    await sleep(wait * (0.5 + Math.random()));   // jitter
  }
}
```

The rules behind that shape:

- **Back off exponentially, cap at a minute, add jitter.** A widget that retries every second for the length of a tunnel is a widget that drains the car's connection and your server.
- **Separate fatal from transient.** A `401` will never fix itself — say so once, plainly, and stop hammering. A dropped socket will fix itself — say nothing for the first few seconds, because a driver does not need to know about a two-second gap.
- **Never render a spinner.** A stalled widget and a working one must not look the same, but the way to distinguish them is a word, not an animation. See [designing for a glance](/guides/build-an-app#designing-for-a-glance).
- **One connection.** The context message arrives again on every theme change. Re-render on all of them; re-subscribe only when `config` actually changed. The `AbortController` in the code above is what makes that a one-liner.

## What it renders

Four states, and each was designed before the code was:

| State | What the driver sees |
|---|---|
| No config yet | `Set a topic on your account page` |
| Connected, nothing yet | The topic name, dimmed |
| A message | Title in large type, body in one line under it, both clipped rather than scrolled |
| Fatal error | `Wrong or missing token` — one short sentence |

The last message stays on screen. There is no dismiss button and no list to scroll: the driver gets the most recent thing and nothing else, because the alternative is asking a driver to read a list at 100 km/h.

Priority and tags from ntfy are available, and the app uses them for one thing only — a colour accent at high priority. It never makes a sound. codriver's audience is behind the wheel and something that beeps unpredictably from the dashboard is worse than useless.

## Copy it

**The repository is the reference implementation.** It is deliberately small — a single page, no framework, no build step — so that reading it end to end is a reasonable way to spend ten minutes before writing your own.

- Source: <https://github.com/gauthiergarnier/codriver-app-ntfy>
- Live page: <https://ntfy-client-codriver.pages.dev>

Fork it, replace the ntfy-specific parts, keep the scaffolding: the context listener, the `ready` ping, the idempotent render, the reconnect loop, the state table. Those four are the same in every widget and they are where the platform's sharp edges are.

## See also

- **[Build an app](/guides/build-an-app)** — the full contract
- **[Install an app](/guides/install-an-app)** — what a driver does with this
- **[Changelog](/changelog)** — when the repo and the page go live
