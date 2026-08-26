# Install an app

Apps add things to codriver that codriver does not do itself. Some add pins to the map. Some add a small panel next to the map — your notifications, your charge session, whatever the app is for. You choose them from a catalogue and install them on your account.

> **Status — 2026-08-25.** Apps are being built. There is no catalogue and no install button on the account page yet. This page describes how it will work; the [changelog](/changelog) will carry the date it goes live.

## What an app is

An app is **someone else's web page**, made by a developer who is not codriver, that codriver shows you in a small box beside the map.

That is worth saying plainly, because it explains everything else on this page:

- codriver does not write these apps and does not vouch for them. A codriver reviewer checks each one before it is listed — that it works, that it is what it claims to be, that it behaves in a car. That is a check, not an endorsement, and it is not an audit of the company behind it.
- The app runs walled off from codriver. It **cannot** see where you are, how fast you are going, where you are headed, or anything about your codriver account. It cannot read your map or change your route. This is built into how apps are shown and is not a setting anyone can turn off — not the developer, not you, not codriver.
- The only thing an app knows about you is **what you type into its own settings**, plus a few cosmetic details: light or dark theme, metric or imperial, your interface density, and whether you are in a car.
- Some apps cost money. **codriver does not take that payment and is not part of it** — there is no checkout here and nothing is charged to your codriver account. If an app charges, you pay its developer directly, on their side, and any refund or cancellation is with them too. The catalogue says whether an app is free, a one-time purchase or a subscription so you know before you install.

So the question to ask before installing an app is not "can this see my location" — it cannot. It is the ordinary question you would ask of any website: do I trust these people with the account details I am about to give them?

## Installing one

1. Sign in at <https://codriver.io> and open your account page.
2. Open the app catalogue and find the app you want. Browsing is free and open to anyone.
3. Read what it needs from you. Apps list installation instructions — often there is something to do on their side first, like creating an account or a topic.
4. Install it. You will be asked to fill in whatever that app needs.

## Filling in its settings

Every app declares the details it needs, and codriver builds the form. A notifications app might ask for a server address, a topic name and an access token. A charger app might ask for your account name there.

- Fields marked required have to be filled in before you can save.
- Some fields come prefilled with a sensible answer. If you do not know better, leave them.
- Fields for passwords or access tokens are hidden after you save them. You can replace one, but you cannot read it back — so keep your own copy somewhere.
- What you type is stored by codriver and handed to that app, and to no one else. It never appears in a web address, so it does not end up in browsing history or in anyone's logs along the way.

You can change any of it later from the same place. Changes reach the app immediately — there is nothing to restart.

## Slots

There are **two slots** beside the map. One app to a slot, so you can have two panels running at once.

Slots are small and fixed — about the size of a business card. You cannot resize one, move it, or stack apps in it. That is a driving decision, not a technical limit: something that changes size or position is something you have to hunt for at speed.

Filling a slot is part of **Premium**. Browsing the catalogue and installing an app that only adds pins to the map is free.

## Removing an app

Go back to your account page, find the app, and remove it. The panel disappears from the car on the next load.

Removing an app deletes the settings you gave it from codriver. It does **not** delete anything from the app's own side — if you made an account with them, close it with them.

## When something looks wrong

**The panel is blank, or stays empty.**
Almost always the app's own page refusing to be displayed inside another page. There is nothing you can do about it from your side and nothing codriver can do either — it has to be fixed by whoever makes the app. Every catalogue entry has a link to its documentation and its website; that is where to report it.

**It says it is not configured, or something about a topic or a token.**
A setting is missing or wrong. Go to your account page, open that app's settings and fix it. Access tokens are the usual culprit — they are easy to paste with a stray space, and some expire.

**It worked yesterday and does not today.**
Check the app's own service first, from your phone. Most of these panels are a window onto something that lives elsewhere, and when the something is down the window is empty.

**It shows nothing while I am driving but works at home.**
The car's connection drops in tunnels, in garages and in dead zones. A well-built app says "reconnecting" and picks up again on its own. If it stays stuck after you are back in coverage, that is worth reporting to the app's developer.

**Everything is broken and I want out.**
Remove the app. Nothing an app does can affect the map, your route, or the rest of codriver — removing it puts you exactly back where you were.

## Questions

Something wrong with an **app**: the developer, via the links on its catalogue entry.

Something wrong with **codriver**, or an app that should not be listed at all: <support@codriver.io>.

Building one yourself: [Build an app](/guides/build-an-app).
