# Mr. Tapioca

A cozy boba-themed focus timer. Start a session and a round tapioca-pearl mascot
brews your bubble tea while you work. Finish the session and the drink joins your
collection and earns you pearls.

**Live on the App Store:** https://apps.apple.com/app/id6786023560
**Live on the web:** https://mrtapioca.me

The headline iPhone feature is real app blocking during a focus session, using
Apple's Screen Time (Family Controls) frameworks.

## The loop

1. Set a Custom Cup (15 min to 4 hr) or pull up your Goal Cup for the day.
2. Start focusing. Mr. Tapioca mixes while the cup fills in real time.
3. Blocked apps stay shielded on iPhone until the session ends.
4. Finish the drink, bank it to your shelf, and collect pearls (~4 per hour).
5. Take a break: he heads to his bedroom, and you can play a mini game.

## Run it locally

No build step. Serve the folder:

```sh
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

The app registers a service worker, so **clear the SW and its caches when you are
testing CSS or JS edits**, or the browser will keep serving the old bundle.

## What's in it

- **Focus timer** with Custom Cup and Goal Cup modes, resumable across app closes
  and app kills (away time is credited, capped at the session length).
- **Real app blocking on iPhone** via Screen Time. Native Swift plugins handle the
  shield, a Live Activity countdown, and StoreKit 2 purchases.
- **Pearl economy.** Pearls come only from real focus time. The drink shelf, treat
  jar, and quest list all persist locally.
- **Shop** with drink bases, toppings, stickers, 14 mascot skins, and shop themes.
  Premium cosmetics are real in-app purchases, not mocks.
- **Three break-time mini games:** Catch the Pearls, Boba Plinko, and Pong, each on
  a purpose-drawn board.
- **Study Squad**, an optional live shared-session feature backed by Supabase. The
  app works fully without it.
- **Boba map** for finding real shops nearby.
- **Step away and keep your spot.** Leaving mid-session pauses and banks progress
  rather than spilling the drink, because long drinks are meant to be filled
  across several sittings. (The old spill-on-quit mechanic was removed; the
  `spill-*.png` art is a leftover.)

## Tech

Plain HTML, CSS, and JS with no build step, wrapped for iOS with Capacitor. The
whole app is `index.html`, `app.js`, `styles.css`, and `sw.js`. Character art is a
set of 500x500 pose PNGs under `assets/poses/`; all motion is CSS keyframes.

See `CLAUDE.md` for the working guide, layout, conventions, and the gotchas that
bite everyone who edits this repo.
