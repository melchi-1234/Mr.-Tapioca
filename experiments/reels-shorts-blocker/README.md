# Reels / Shorts blocker — experiment (NOT wired into the app)

Goal: block *just* Instagram Reels or *just* YouTube Shorts during a focus
session, the way people expect from apps like SocialLite.

## The honest finding (research, Aug 20 2026)

**On iOS you cannot block one screen inside the real Instagram or YouTube app.**
Every Apple Screen Time / Family Controls primitive works at whole-app,
app-category, or whole-website granularity, never a URL path or an in-app tab:

- `ManagedSettings` shields cover `applications` / `applicationCategories` /
  `webDomains` only.
- `WebDomain` is a bare domain string (`youtube.com`), with no path, so a
  Screen Time web filter cannot express "youtube.com/shorts but not /watch".
- A `DeviceActivity` "5-minute Reels limit" is really a whole-Instagram time
  budget. There is no Reels token to threshold against.
- Network-extension / VPN / DNS filters see only the remote host inside a
  native app (the path is inside encrypted TLS), and Reels and the rest of
  Instagram ride the same hosts, so a filter can only take down the whole app.
  It also drags in the org-only VPN entitlement (App Review guideline 5.4).
- iOS has no cross-app accessibility/screen-reading API (that is the Android
  trick), so nothing can watch the native app and bounce you off the Reels tab.

**How SocialLite / Noreel / Friendly actually do it:** they are not blockers at
all. They are WebKit *replacement clients*. You log into Instagram/YouTube
*inside their app*, which renders the mobile-web site with the short-form
surfaces stripped out. That is a separate product with real fragility (breaks
whenever the sites change their markup), account-security and platform-ToS
exposure, and it is trivially bypassed (the real app is one tap away). It is the
wrong shape for a cozy study timer, so we are not cloning it.

## What this experiment IS

A **Safari Content Blocker** rule list (`rules.json`). This is the only
mechanism that genuinely targets the Shorts/Reels *path* specifically rather
than the whole app. It:

- hard-blocks navigation to `youtube.com/shorts...` and `instagram.com/reels...`
- hides the Shorts shelf + nav entry and the Reels tab on the web versions.

### The honest limit, which must be on the label

**It only works in Safari (and in-app web views that adopt the same rules). It
does nothing to the native Instagram or YouTube apps.** Most people watch
Reels/Shorts in the native app, so on its own this is a bonus, not a headline.
If we ship it, the toggle has to read something like **"Hide Reels & Shorts in
Safari while focusing"**, never "Block Reels", because the mechanism cannot
honor the broader claim.

## Recommended product direction

1. **Primary, already shippable:** lean on the existing whole-app shield
   (FocusShieldPlugin). During a session the user picks their distraction apps
   and they are shielded. Frame it as "no doomscrolling during a brew." (Note:
   Apple returns opaque app tokens from the Family Activity picker, so we cannot
   auto-select Instagram/YouTube for them, only prompt them to pick.)
2. **Optional, feature-level, after 1.1.1 ships:** add this Safari content
   blocker as a clearly Safari-scoped "hide Reels/Shorts in the browser" toggle.

Do NOT add the extension target while a build is mid-submission: it is a new
signed target and would put the 1.1.1 review at risk for a low-impact feature.

## Wiring plan (when we build it, post-1.1.1)

1. Add a **Content Blocker Extension** target to `ios/App` (bundle e.g.
   `com.melchior.mrtapioca.ShortsBlocker`), sharing the App Group.
2. Ship `rules.json` inside the extension; return it from
   `beginRequest(with:)` via `NSItemProvider` (`attachmentsFileURL`).
3. To make it a *focus-session* toggle rather than always-on, gate it with
   `SFContentBlockerManager.reloadContentBlocker(withIdentifier:)` on session
   start/stop, swapping between the real rules and an empty `[]` list.
4. User enables the blocker once in Settings > Safari > Extensions.

## Testing notes / caveats

- `rules.json` is valid Safari Content Blocker syntax (each rule is exactly
  `action` + `trigger`; no comments, which the compiler rejects). The two
  `block` rules on the `/shorts` and `/reels` paths are the reliable core.
- The `css-display-none` selectors target current (Aug 2026) YouTube/Instagram
  web markup and WILL need re-tuning on a real device against the live sites;
  treat them as a starting point, not a guarantee. Verify on-device in Safari
  with a real logged-in account before shipping.
- `:has()` and other newer selectors are avoided here because content-blocker
  selector support is narrower than a normal browser's.
