# Mr. Tapioca — Overnight Build Grounding Document

**Repo root:** `/Users/melchiorgoldfarb/Documents/Mr. Tapioca`
**Date of inspection:** 2026-08-12
Every claim below is anchored to `file:line`. Statements that could not be verified from the tree are collected in §10.

---

## 1. HOW THE REWARD SYSTEM WORKS TODAY

The chain from a focused minute to a barista honoring a discount, in order. Every step is on-device.

| # | Step | Code |
|---|---|---|
| 1 | Timer accrues wall-clock seconds from the device clock | `app.js:1842-1851` `delta = (Date.now() - state.lastTick)/1000`; background credit at `app.js:684-685` from `bobaFocusRunningSince` |
| 2 | Session ends, minutes computed | `app.js:2349` `const minutes = Math.round(modeDuration() / 60);` |
| 3 | Drink object built and unshifted onto the shelf | `app.js:2354-2361`, pushed at `app.js:2431` `state.collection.unshift(drink);` |
| 4 | Shelf persisted as plain JSON | `app.js:761` `localStorage.setItem("bobaFocusCollection", JSON.stringify(state.collection));` |
| 5 | Lifetime minutes = sum over the shelf | `app.js:839-841` `state.collection.reduce((sum, drink) => sum + drink.minutes, 0)` |
| 6 | Eligibility bar = **global minimum** `minMinutes` across live partners, else 180 | `app.js:4578-4582` `Math.min(...livePartners.map(p => p.minMinutes))` |
| 7 | Earned rewards = whole bars of lifetime focus | `app.js:4325-4328` `Math.floor(totalMinutes() / bar)` |
| 8 | Redeemed = **array length**, nothing more | `app.js:4330-4332` `state.perkRedemptions.length` |
| 9 | Spendable = `max(0, earned − redeemed)` — the only gate | `app.js:4334-4336` |
| 10 | Map row renders "Show at the counter" for every partner, unconditionally | `app.js:4879`, entry `app.js:4882-4887` `openRedeem(it.shop.partner)` |
| 11 | Counter card renders shop/address/perk + live ticking clock, gated only cosmetically | `app.js:4915-4947`; confirm gate `app.js:4925` `els.redeemConfirmBtn.disabled = !ready;`; class toggle `app.js:4931` |
| 12 | Ineligible state = greyed chip + 45% button opacity; name, perk and clock still full strength | `styles.css:3124-3125` |
| 13 | Anti-screenshot = `new Date().toLocaleString()` on a 1s interval, device clock | `app.js:4933-4943` |
| 14 | "Not now" closes the dialog; handler only clears the interval | `index.html:736-738` `<form method="dialog">…<button value="cancel">Not now</button>`; `app.js:4949-4952` `function closeRedeem() { clearInterval(redeemClock); redeemClock = null; }` |
| 15 | "Use one reward" appends `{at, shop, perk}` and saves | `app.js:4954-4962` |
| 16 | Persist to localStorage | `app.js:763` `localStorage.setItem("bobaFocusPerkRedemptions", …)` |

**What leaves the device on this path:** nothing perk-related. `confirmRedeem()` issues no fetch. It does call `saveState()` (`app.js:4962`), which ends at `app.js:815` with `SquadCloud.pushProfile()` — an RPC carrying `display_name, skin, focus_minutes, drinks, streak, status` only (`squad-cloud.js:68-75`). No perk, no shop id, no redemption.

**Design intent is documented in-code:** `app.js:4906-4911` — "it has to be hard to fake with a screenshot, which is what the ticking timestamp is for… There is no scanner and no account on the shop's side."

**Reward-card copy at drink completion** has exactly two states and never names a discount (`app.js:2405-2417`): `"🌟 Partner perk unlocked. Check the Boba Map"` or `"<X> of focus until your next partner perk"`. It is rendered as text and styled as a coupon by testing for the star emoji (`app.js:2641-2646`).

**Native vs web:** the reward path is byte-identical. The only platform branch touching rewards is `REWARD_UNBLOCKED_FRACTION` (`app.js:129`), which scales **pearls only** (`app.js:2378-2380`). `drink.minutes` — the sole input to perk eligibility — is written unconditionally, so a web session earns partner perks at exactly the native rate.

**An untracked server-side design exists and is inert:** `/Users/melchiorgoldfarb/Documents/Mr. Tapioca/supabase-reward-v2.sql` defines `reward_policies`, `partners` with `offer_version`, `reward_instances` (issued/redeemed/void), `redemption_handoffs`, `redemption_events`, `open_redemption(uuid,text)`, `redeem_by_code(text)`. `git status --porcelain` reports `?? supabase-reward-v2.sql`. Grep for `open_redemption|redeem_by_code|reward_instances|redemption_handoffs|RewardsCloud` across all `*.js` and `*.html` returns **zero** hits. `index.html:788-791` loads only `config.js`, `squad-cloud.js`, `metrics.js`, `app.js`.

---

## 2. THE EXACT TAMPER SURFACE

Everything in the reward and economy path lives in unsigned, unvalidated `localStorage`. `loadState()` runs at `app.js:6441` immediately followed by `saveState()` at `app.js:6442` ("self-heal"), so a hand-edited value is re-persisted as if the app wrote it. A `storage` listener re-runs `loadState` in any idle tab within 350ms (`app.js:6417-6427`), so an edit propagates live without a reload.

| localStorage key | Read at | Written at | Validation | What forging it buys |
|---|---|---|---|---|
| `bobaFocusCollection` | `app.js:616` | `app.js:761` | `Array.isArray` only (`app.js:632`) — **no element shape or magnitude check** | Unlimited partner perks **and** unlimited pearls. Measured in a live browser: `[{minutes:100000}]` → `totalMinutes()` 100000, `perkMinMinutes()` 240, `perksEarnedTotal()` 416, `earnedPerkCount()` 416, banner "🌟 416 rewards ready. U Tea gives 10% off your drink.", confirm button enabled. Also mints 6,666 pearls via `app.js:900`. |
| `bobaFocusPerkRedemptions` | `app.js:618-619` | `app.js:763` | `Array.isArray` only | Deleting or setting to `[]` returns redeemed count to 0, replaying every perk already handed over a counter. `readJSON` (`app.js:755-762`) returns the fallback on `null`, and the boot `saveState()` cements `"[]"`. |
| `bobaPartners1` | `app.js:4554-4556` (seeded **before** the network fetch) | `app.js:4570` (success path only) | `validPartner()` shape-only (`app.js:4542-4549`) | Sets both the eligibility bar and the perk text a merchant reads. A forged `{name:"U Tea", address:"205 Dryden Rd", lat:42.44153, lng:-76.48486, perk:"One free large drink", minMinutes:15}` passes validation: `perkMinMinutes()` drops to 15 **and** the counter card prints a perk the shop never agreed to. Offline / unreachable `mrtapioca.me` is the reliable path — the fetch failure lands in `app.js:4572` `.catch(() => {});   // cached or bundled list stands`. `withPartners()` pushes any in-radius partner as its own map pin even if no real shop record exists (`app.js:4616`). |
| `bobaFocusBonusPearls` | `app.js:622` | `app.js:766` | `num()` sanitize, non-finite/negative → 0 (`app.js:717`) | Direct pearl balance; sole additive ledger for all non-focus income. |
| `bobaFocusSpent` | — | `app.js:765` | `num()` | Subtracted in `currentPearls()`; zeroing it refunds every purchase. |
| `bobaFocusBlockPenalty` | `app.js:623` | `app.js:767` | `num()`, floats survive round-trip | Zeroing it removes the unblocked-session halving. |
| `bobaFocusDevUnlock` | `app.js:4163-4166` | `app.js:6044` | none | Reveals the dev row without the 7-tap gesture. See §9. |
| `bobaFocusGameDays` / `bobaFocusGamePlays` | `app.js:3419`, `3427` | `app.js:783-784` | — | Resets daily game caps. |
| `bobaFocusRenames` | — | `app.js:774` | — | Re-arms the 20-pearl rename price. |
| `bobaMetricsDevice` | `metrics.js:23-33` | same | none | New device identity for the `drink_events` counter. |
| `bobaShops:` / `bobaShops2:` | `app.js:4688-4696` | — | 24h TTL, pruned **only** on a successful Overpass fetch | Map geometry cache. Note: `bobaPartners1` is **not** covered by this sweeper. |

**No integrity protection anywhere:** grep for `hmac|checksum|tamper|signature|integrity` across `app.js`, `squad-cloud.js`, `metrics.js`, `supabase-setup.sql` returns one unrelated hit (`app.js:37`, "pearls are free (the signature)").

**Boot-crash nuance on the collection forgery:** the minimal payload `[{minutes:100000}]` throws at `app.js:1059` `keyToOrdinal` (called from `app.js:1554` inside `reconcileStreakFreezes`, invoked at `app.js:6458`), so `renderAll()` never runs. But `wireEvents()` already ran at `app.js:6440`, so the map, the perk banner and the redeem sheet still work and still show 416. Adding a `dateKey` field makes the boot clean.

---

## 3. PARTNER CONFIG TRUTH

### The file

`partners.json` is `{ "_comment": [...], "shops": [...] }`. `_comment` is documentation only and is never read by code. Per-shop fields are exactly: `id, name, address, lat, lng, perk, minMinutes, since` (`partners.json:1-24`).

### The two live shops, verbatim

```
partners.json:27-34
  "id": "u-tea-collegetown"
  "name": "U Tea"
  "address": "205 Dryden Rd, Collegetown"
  "lat": 42.44153, "lng": -76.48486
  "perk": "10% off your drink"
  "minMinutes": 240
  "since": "2026-08-09"

partners.json:37-44
  "id": "dream-tea-poke-ithaca"
  "name": "Dream Tea & Poké"
  "address": "130 E Seneca St, Ithaca"
  "lat": 42.44064, "lng": -76.49722
  "perk": "5% off your drink"
  "minMinutes": 240
  "since": "2026-08-10"
```

Both are at `minMinutes: 240` (`partners.json:33`, `:43`), which is why every divergent-threshold defect below is **latent, not currently firing**.

### Delivery

- URL is hardcoded absolute: `app.js:4533` `const PARTNERS_URL = "https://mrtapioca.me/partners.json";`, fetched with `?t=Date.now()` and `cache: "no-store"` (`app.js:4559`) so the native `capacitor://localhost` origin can reach it.
- `sw.js:118-122` early-returns on any path ending `/partners.json` — the cache-first handler uses `ignoreSearch` and would pin the first copy forever. It is **not** in the SHELL precache list.
- **Exactly one call site:** `app.js:4763` `Promise.all([loadPartners(), fetchRealBobaShops(lat, lng)])` inside `loadNearbyShops()`. Grep confirms the only other occurrences are the definition (`app.js:4552`) and a comment (`app.js:4761`).
- Bundled offline floor `PARTNER_SHOPS` (`app.js:4502-4516`) is a **single-element array** containing only U Tea. Dream Tea & Poké is missing from it.
- `livePartners` initializes as `PARTNER_SHOPS.slice()` (`app.js:4536`) and is reassigned in exactly two places, both inside `loadPartners()` (`app.js:4556`, `:4569`).

### Validation gaps — `validPartner()` at `app.js:4542-4549`

Validates **five** fields only: `name` (non-empty string), `perk` (non-empty string), `lat` (finite, ≤90), `lng` (finite, ≤180), `minMinutes` (finite, 15–1440).

| Gap | Consequence |
|---|---|
| `id` unvalidated and unrequired | `withPartners()` de-dupes with `out.some(s => s.partner && s.partner.id === p.id)` (`app.js:4615`). Two id-less partners → `undefined === undefined` → the second is skipped and never reaches the map or list. Same for two entries sharing an id. `partners.json:14` declares id "stable slug, never reused". |
| No id-uniqueness check | Same collapse. |
| `address` unvalidated | Arbitrary text renders on the counter card (`app.js:4919`). |
| `since` unvalidated **and never read** — only occurrence in `app.js` is the literal at `:4514` | No way to schedule a partnership start. |
| No `paused`, `active`, `startsAt`, `endsAt`, or offer `version` field anywhere | Removal from the file is the only kill switch. `grep -i "paused\|active\|startsAt\|endsAt\|expire\|version"` on `partners.json` exits 1. The word "paused" appears only in the comment at `app.js:4565`. |
| Malformed entries silently dropped | No console warning, no user signal (`app.js:4564`). |
| No TTL on the cache | `app.js:4570` writes `{t: Date.now(), shops}`; `app.js:4554-4556` never reads `c.t`. The `bobaShops:` sweeper at `app.js:4688-4696` does not match this key, and only runs on a successful Overpass fetch. |

Empty-list rule: `"shops": []` is **accepted** as legitimate; a non-empty list where every entry fails validation throws `"all invalid"` and the previous list stands (`app.js:4565-4569`). A per-shop "pause" via deliberately invalidating a row therefore **silently fails** when it is the last valid shop — the throw is swallowed by `app.js:4572` and the cached list keeps its star.

Partner text is safely escaped everywhere: `app.js:4821` `escapeHtml(p.perk)` in map popups, `app.js:4851` `el.textContent` for the banner, `app.js:4920` `textContent` for the redeem card. HTML injection is not possible.

Mis-star geometry: `partnerFor()` matches on ≤40 m proximity alone, **or** a 9-character case-folded name-prefix match in either direction within 400 m (`app.js:4596-4602`). The 150 m radius was already reduced after U Tea's star was handed to Kung Fu Tea 92 m away. The code names this as the feature's worst failure: `app.js:4594-4595` — "Starring the wrong shop is the worst failure this feature has, because a student walks in and asks a business for a discount it never agreed to."

### The `perkMinMinutes` global-minimum problem

`app.js:4578-4582`:
```js
function perkMinMinutes() {
  return livePartners.length
    ? Math.min(...livePartners.map(p => p.minMinutes))
    : 180;
}
```

`p.minMinutes` is read in **exactly two places in all of app.js**: `validPartner()` (`app.js:4547-4548`) and this function (`app.js:4580`). Repo-wide grep for `minMinutes` returns only `partners.json:17,23,33,43`, `app.js:4500` (comment), `:4513` (bundled literal), `:4539` (comment), `:4547-4548`, `:4580`, and `CLAUDE.md:108`. **No shop-specific threshold is ever consulted at redemption time.**

Consequences:

1. **`openRedeem(partner)` never reads `partner.minMinutes`.** It uses the partner only for display (`app.js:4918-4920`); readiness is `earnedPerkCount() > 0` (`app.js:4922-4925`). `confirmRedeem()` likewise (`app.js:4955`).
2. **Direction matters.** Because it is `Math.min`, adding a *stricter* partner only makes that shop's own perk redeemable early. Adding a *more lenient* partner drops the bar globally — sign a shop at 60 minutes and U Tea's 240-minute 10% off becomes redeemable after one hour.
3. **Retroactive re-scoring.** `perksEarnedTotal()` recomputes `floor(lifetime / current bar)` (`app.js:4325-4328`) with no stored bar and no high-water mark. Lowering the bar inflates past minutes; raising it can drop a user with banked rewards to zero via the `Math.max(0, …)` clamp (`app.js:4336`), with no explanation in the UI (`app.js:4835-4849`, `app.js:4922-4931`).
4. **Redemptions are not bar-aware.** `perksRedeemedTotal()` is a flat length (`app.js:4330-4332`) and the stored row carries `{at, shop, perk}` with no bar recorded (`app.js:4957-4961`), so the subtraction compares counts scored at different bars.
5. **The stored row uses the shop NAME, not the id** (`app.js:4959`), so shop identity is not durable across a rename. Those two strings are write-only — nothing reads `.shop` or `.perk` back.
6. **Off-map staleness.** Because `loadPartners()` is only called from `loadNearbyShops()`, `livePartners` reverts to the bundled 240-minute floor on **every cold start**. The drink-complete card at `app.js:2405` (`const perkBar = perkMinMinutes();`) is the one perk consumer outside the map, so its copy runs on bundled data until the map is opened this session.

Design intent, stated in code and contradicted by the implementation: `app.js:4494-4496` — "The deal is negotiated shop by shop, so `perk` is whatever THAT shop offered and nothing here is a shared default." Repeated at `CLAUDE.md:106-107`.

---

## 4. BACKEND TRUTH

One Supabase project, reached from three files loaded in order at `index.html:788-790` (`config.js`, `squad-cloud.js`, `metrics.js`), all precached at `sw.js:17-19`.

### Tables (4, all of them)

`grep "create table" supabase-setup.sql` → exactly four.

| Table | Line | Columns | RLS |
|---|---|---|---|
| `public.profiles` | `:19-31` | `id` uuid PK → `auth.users(id)` cascade; `display_name` (1-24); `skin` (≤40); `focus_minutes` int (0–100000000); `drinks` int (0–100000); `streak` int (0–100000); `status` in (`idle`,`focusing`,`break`); `friend_code` unique `^[A-Z2-9]{6}$`; `created_at`; `updated_at` | enable + **force** (`:99-102`) |
| `public.friendships` | `:34-41` | `follower_id`, `friend_id` → profiles cascade; `created_at`; PK (follower, friend); CHECK follower ≠ friend. Only explicit index in the file: `friendships_friend_id_idx` | enable + **force** |
| `public.add_rate` | `:44-49` | `user_id` PK, `window_start`, `count` | enable, **zero policies** → RPC-only |
| `public.drink_events` | `:279-293` | `id` identity; `created_at`; `device` (8-64); `size` (1-24); `minutes` (1-1440); `platform` in (`ios`,`web`) | enable only (**not forced**, `:287`) |

**There is no redemption, partner, perk, or reward table.** `grep -i "redeem\|partner\|perk"` on `supabase-setup.sql` hits only comment lines `:9`, `:267`, `:278`.

### RLS and grants (the real access control)

- `profiles`: three policies — `profiles_select_self_or_followed` (`:117-118`, `id = auth.uid() or public.is_following(id)`), `profiles_update_self` (`:121-122`), `profiles_insert_self` (`:124-125`).
- Column grants (`:127-131`): all DML revoked, then `SELECT` on `(id, display_name, skin, focus_minutes, drinks, streak, created_at, updated_at)` — **`friend_code` and `status` excluded**; `UPDATE` on `(display_name, skin, drinks, streak)` — **`focus_minutes` and `status` excluded**; `INSERT` on `(id)` only.
- `friendships` (`:134-141`): `SELECT`/`DELETE` scoped to `follower_id = auth.uid()`, granted `select, delete` only. **No INSERT policy or grant** — follows only via RPC.
- `drink_events` (`:288-293`): `grant insert` to `anon, authenticated`; one policy `for insert … with check (true)`. No SELECT/UPDATE/DELETE policy exists.

### RPCs (8)

`gen_friend_code()` (`:52-69`, rejection sampling against maxfair 248, no modulo bias) · `handle_new_user()` (`:72-88`, SECURITY DEFINER, 5 retries, trigger `on_auth_user_created`) · `touch_updated_at()` (`:91-96`) · `is_following(uuid)` (`:105-111`) · `get_my_friend_code()` (`:144-149`) · `add_friend_by_code(text)` (`:152-181`, 10-per-rolling-hour via `add_rate` with `FOR UPDATE`) · `get_my_friends()` (`:184-196`, orders by `focus_minutes desc, display_name asc`) · `set_my_profile(...)` (`:206-222`) · `rotate_friend_code()` (`:15x`) · `delete_my_account()` (`:245`, deletes from `auth.users`, FK cascade).

Two pg_cron jobs (`:252-261`): `prune_dead_anon` `'17 4 * * *'`, `prune_add_rate` `'23 * * * *'`.

### Identifiers available for a server-side reward

The **only** server-side identity that exists is the anonymous Supabase `auth.users.id`, mirrored as `profiles.id` (`supabase-setup.sql:20`), created by `sb.auth.signInAnonymously()` (`squad-cloud.js:39`). There is no signUp, no email OTP, no OAuth, no `linkIdentity`/`updateUser` anywhere in `squad-cloud.js` — the account is bound to that install's localStorage and is unrecoverable if storage is cleared or the app is reinstalled. The human-facing handle is the 6-char rotatable `friend_code`.

The `metrics.js` device id (`metrics.js:23-33`, key `bobaMetricsDevice`) is deliberately linked to nothing (`metrics.js:8-10`). There is no email, phone, DeviceCheck, receipt, or StoreKit identifier persisted server-side. **Any server-side reward would have to hang off the anonymous uid.**

### `focus_minutes` integrity

`supabase-setup.sql:214-217`:
```sql
focus_minutes = coalesce(
    case when v_fm = 0 then greatest(0, least(p_focus_minutes, 100000000))
         else least(greatest(p_focus_minutes, v_fm), v_fm + 1440) end,
    v_fm),
```
Seed branch accepts any value up to 100,000,000 (~190 years) on a fresh account; steady state is monotonic, +1440/call. There is **no `add_rate` check on `set_my_profile`** (compare `add_friend_by_code` at `:160-169`), so the clamp bounds per-call size, not rate. The file labels it honestly at `:199-201` ("a sanity clamp, not anti-forgery").

**Additional, unexecuted:** PostgreSQL `LEAST`/`GREATEST` ignore NULLs. At `:215`, a caller passing only `p_display_name` (leaving `p_focus_minutes` NULL) on a zero-valued row yields `least(NULL, 100000000)` = 100000000 → `focus_minutes` set to 100,000,000. Same shape at `:219` for `streak` → 100000. The shipped client always passes all six params (`squad-cloud.js:68-75`), so the app never trips this; any direct RPC call does. No postgres binary on this machine — **not executed**, high-confidence from documented semantics.

Also note: `supabase-setup.sql:130` grants direct `UPDATE (display_name, skin, drinks, streak)` to `authenticated`, so `drinks` and `streak` are settable by direct PostgREST PATCH without touching the RPC at all. Only `focus_minutes` and `status` are RPC-gated.

### Secrets posture verdict — **CLEAN**

- `config.js:12` holds a **publishable** key (literal prefix `sb_publishable_`). `config.js:7` carries the prohibition: "NEVER paste the Supabase `service_role` key here."
- Full-tree sweep (excluding `node_modules`, `.git`) for `service_role`, `sk-`, `secret`, `private_key`, `Bearer`, `password`, `token`, `apikey`, `api_key`, `eyJ`, `sb_secret`, `sbp_`: **no privileged key of any kind**. `service_role` appears only as prohibition text (`config.js:7`, `SUPABASE_SETUP.md:56`); `Bearer` only at `metrics.js:52` (publishable key) and `tools/openai-image.mjs:45,52` (key read at runtime from `~/.openai-mrtapioca` or `$OPENAI_API_KEY`). Zero JWT-format strings. No `.env`, `.pem`, `.p8`, `.p12`, `.key`, `.keystore`, `.mobileprovision` in the repo.
- Git history is also clean: `git log --all -S service_role` hits one commit (`5f4a821`, the one that added the warning). Every historical revision of `config.js` scanned; none contains a JWT key.
- `ios/App/App/public/config.js`, `www/config.js` and root `config.js` are byte-identical (md5 `f236ec6f1150b6d169ab8aeb88878820`). Only the root copy is git-tracked; `www/` and `ios/` are gitignored.
- No dev/staging URL can ship: shipped files reference only the Supabase project URL (`config.js:11`), the pinned `esm.sh@2.110.0` SDK (`squad-cloud.js:26`), and four Overpass mirrors (`app.js:4379-4384`). `capacitor.config.json` has **no `server` block**.

---

## 5. ECONOMY NUMBERS

There is **no `state.pearls`**. The balance is derived on every read (`app.js:900`):
```js
return Math.floor(Math.floor(totalMinutes() / 15) + state.bonusPearls - state.spent - state.blockPenalty);
```

### Income sources

| Source | Rate | Daily cap | Evidence |
|---|---|---|---|
| Focus (blocked, or any web session) | 1 pearl / 15 min = **4/hr** | none | `app.js:900`; `app.js:2333-2335` forces `wasBlocked = true` when no blocker exists |
| Focus (native, no shield up) | **2/hr** (`share = 0.5`) | none | `app.js:129` `REWARD_UNBLOCKED_FRACTION = 0.5`; `app.js:2378` |
| Session minimum | ≥1 pearl per completed session | none | `app.js:2379` `awardedExact = fullPearls > 0 ? fullPearls * share : 1;` topped up at `app.js:2385` |
| Daily goal reached | **0 pearls** (toast only) | — | `app.js:2444-2447` |
| Streak | **0 pearls** | — | no reward field anywhere |
| Achievements (12 BADGES) | **0 pearls** — all cosmetic `{id, icon, name, desc, test}` | — | `app.js:1268-1281` |
| Quests — focus pool | focus25=3, focus45=5, sessions2=4, earlyBird=3 | 1 drawn | `app.js:4987-5005` |
| Quests — make pool | drink1=3, drink2=5 | 1 drawn | same |
| Quests — play pool | catch10=3, combo5=3, pong2=3, playGame=2, map1=2 | 1 drawn | same |
| **Quests total** | 3/day, random one per pool, midnight rollover, auto-grant, no re-roll | **8 worst draw – 13 best** | `app.js:5019-5023`, `app.js:5050` |
| Catch the Pearls | 1/normal, 3/golden, −3/bomb; 20 s run; banks `min(score, 10)` | **10** | `app.js:136` `CATCH_CAP = 10`; `:112` `CATCH_DURATION = 20`; `:124`, `:122`; `app.js:3167` |
| Boba Plinko | `SLOT_REWARDS = [5,3,1,1,1,3,5]`, 3 drops | **15** (measured EV ~6.2) | `app.js:128`, `:134`; `app.js:3609` |
| Cup Pong | 2 pearls/make, 4 throws (make or miss decrements) | **8** | `app.js:150`, `:145`; `app.js:5709`, `:5771` |

Only **five** code sites ever add pearls: `app.js:2385` (min-1 top-up), `3170` (Catch), `3609` (Plinko), `5050` (quests), `5771` (Pong). All are `state.bonusPearls += …`.

**Plinko payout note:** the reward comes from where the pearl *physically lands* (`app.js:3603-3605`), not the weighted target slot. `SLOT_WEIGHTS = [4,10,17,18,17,10,4]` (`app.js:133`) is a homing target. Measured realised distribution (30k drops per geometry at phone canvas sizes): edges ~7%, centre ~20%, ~6.2 pearls/day — matching the code comment at `app.js:130-133`.

**Game gate:** native requires a completed ≥30-minute session (`app.js:3450-3456` `GAMES_MIN_SESSION_MIN = 30`); **on web there is no gate at all** (`if (!FocusBlocker.available()) return true;`), so the full 33/day is reachable with zero focus.

### Focus vs non-focus daily totals

| Scenario | Pearls |
|---|---|
| 1 hour of pure focus (blocked / web) | **4** |
| 1 hour of pure focus (native, unblocked) | **2** |
| Games only, all maxed | 10 + 15 + 8 = **33** |
| Games + best quest draw | 33 + 13 = **46** |
| Games + worst quest draw | 33 + 8 = **41** |
| Realistic day (perfect Catch, average Plinko, perfect Pong, mid quests) | **≈34** |

### The ratio

| Comparison | Equivalent focus hours |
|---|---|
| 46 pearls (max non-focus day) vs 4/hr | **11.5 h** |
| 33 pearls (games only) vs 4/hr | **8.25 h** |
| 46 vs 2/hr (native unblocked) | **23 h** |
| 33 vs 2/hr | **16.5 h** |
| One 20-second Catch run at cap (10) | 2.5 h |
| One Plinko jackpot (5) | 75 min |
| One Pong make (2) | 30 min |

This inverts the app's own stated design: `app.js:126` — "Break games are a small once-per-day bonus, not a pearl farm."

### Sinks

| Sink | Price | Total |
|---|---|---|
| Skins: grad-cap, flower, scarf, shades ×40; strawberry, astro-blue, dragon, cat-hoodie ×60; royal ×70 (`app.js:59-72`) | — | **470** |
| Backgrounds: night, sakura, autumn, rainy ×60 (`app.js:81-84`) | — | **240** |
| Tea bases ×9 @10 (`app.js:24-34`) | — | **90** |
| Toppings ×4 @10 (`app.js:39-44`) | — | **40** |
| Squad rename, first change only (`app.js:5258` `RENAME_PEARL_COST = 20`) | 20 | 20 |
| Brain Freeze, repeatable, hold max 3 (`app.js:91`, `app.js:1527` `FREEZE_CAP = 3`) | 10 | repeatable |
| **Total for every pearl-priced cosmetic once** | — | **840** (860 with rename) |

840 pearls = **210 hours** of focus at 4/hr, or **~26 days** of never focusing at 33/day.

**Real money:** 8 items are `premium: true` with **no `price` field** — skins ninja/wizard/angel/devil (`app.js:75-78`) and backgrounds winter/galaxy/library/sunset (`app.js:85-89`). They render a StoreKit button with a hardcoded `"$1.99"` fallback (`app.js:1702`). `IAP_SETUP.md` specifies $1.99 Tier 2 non-consumables.

**Dead counter:** `state.gamePearls` (key `bobaFocusGamePearls`, `app.js:233`) is write-only cumulative; it never enters `currentPearls()` and is never spent. Its only consumer is the "Break Champ" badge test (`app.js:1280`).

**No server mirroring:** `grep -n "pearl" squad-cloud.js metrics.js supabase-setup.sql` returns **zero** matches.

---

## 6. GROWTH SURFACE TRUTH

### Onboarding step count: 16 on web, 17 on iPhone

| Sequence | Steps | Gate |
|---|---|---|
| Story onboarding `ONBOARD_STEPS` | **7** (`app.js:5348-5385`) | `bobaFocusOnboarded` (`app.js:694`, written `app.js:5466`) |
| Feature tour `TOUR_STEPS` | **9** (`app.js:5479-5498`), auto-started 700 ms after onboarding (`app.js:5473`) | `bobaFocusTourDone`: unset / `"1"` / `"skipped"`; plus `bobaFocusTourOffered` for one auto-resume |
| `#blockPrompt` dialog | **+1 on native**, interposed before `beginFocus()` on the first Start press (`app.js:2121-2127`) | `state.blockPromptDismissed` |

Onboarding slides in order (`app.js:5348-5385`): 1 "Say Hello to Mr. Tapioca!" · 2 "Work Hard, Play Hard!" · 3 "Focus Fills your Cup!" · 4 "Earn Pearls as You Go!" ("Every 15 minutes = 1 pearl earned.") · 5 "Share with Friends!" · 6 "Real Rewards Await!" · 7 name entry.

Tour steps (`app.js:5479-5498`): welcome card, `.size-picker`, `#startPauseBtn`, `.pearl-chip`, `.streak-chip`, `#questsBtn`, `#shopBtn`, `#mapBtn`, `#friendsBtn`. **None mentions app blocking or Screen Time.** Both sequences are replayable from Settings (`index.html:453-461`, `app.js:6191-6201`).

Screen Time's **only** explanation surface is `#blockPrompt` (`index.html:743-756`): "Block distractions?" / "Mr. Tapioca can shield your distracting apps while you focus, so nothing pulls you away. You will also earn full pearls." It never names Screen Time or Family Controls. Four JS sites request authorization with no interstitial (`app.js:2186`, `6229`, `6240`, `6256`), each `await FocusBlocker.requestAuthorization(); await FocusBlocker.pickApps();`. Native path: `native-ios/FocusShieldPlugin.swift:66-69` `AuthorizationCenter.shared.requestAuthorization(for: .individual)`, picker at `:190` `FamilyActivityPicker`.

### Notification capability: **ZERO**

Repo-wide grep for `UNUserNotificationCenter|LocalNotifications|PushNotifications|new Notification|Notification.requestPermission|showNotification|registerForRemoteNotifications|aps-environment|UIBackgroundModes|AVAudioSession` returns **zero hits**, excluding `node_modules`/`.git`. A broader case-insensitive `grep -i "notif"` returns 9 lines, none an API call:
- `native-ios/FocusShieldPlugin.swift:34-35` — `NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification` (in-process observer)
- `app.js:3732` — `// ── Completion feedback: tab title, chime, notification ───`, followed by exactly one function, `updateTabTitle` (`app.js:3734-3740`)
- `APP_BLOCKER_DECISION.md:35,104` — prose
- `docs/network-v1/LEDGER.md:23` — `| 7 | Local notifications | not started |`

`package.json:13-18`: only `@capacitor/core`, `@capacitor/ios` (deps), `@capacitor/cli` (dev). `ios/App/App/capacitor.config.json` `packageClassList: ["FocusShieldPlugin","FocusActivityPlugin","IAPPlugin"]`. All four entitlements files contain only `com.apple.developer.family-controls` + the app group — **no `aps-environment`**. `Info.plist` has `NSSupportsLiveActivities` but **no `UIBackgroundModes`**. `sw.js` has no `push` or `notificationclick` listener.

**Worse than silent:** completion does not happen while backgrounded. `app.js:1875-1878` completes from `tick()`; `app.js:6390-6398` only banks state when hidden; `app.js:6400-6402` calls `tick()` on return to visible. The drink completes, the chime plays (`sessionChime()` `app.js:3843`, called `app.js:2440`) and `showReward()` runs **at the moment the user reopens the app**. Both feedback channels are foreground-only (Web Audio + `haptic()` at `app.js:2441`).

The Live Activity is the only out-of-app surface and cannot alert: `native-ios/FocusActivityPlugin.swift:6-7` — the countdown views "tick on their own, so the activity needs NO updates while running". It calls `Activity.request(...)` (`:41-42`) and never `update(...)`; there is no `alertConfiguration` anywhere. Nothing ends the activity at the end time; `endAll()` runs only when JS calls `stop()` (`:53-62`).

Session range that this affects: `app.js:6-7` `CUSTOM_MIN = 15 * 60`, `CUSTOM_MAX = 240 * 60`.

### Share card contents

`buildShareCard(reward)` (`app.js:2476-2565`), 1080×1350 (`app.js:2477`): warm gradient + decorative pearls, cream card, eyebrow `"FOCUS COMPLETE"` (`app.js:2509`), the user's skin PNG (`app.js:2513-2516`, fallback `assets/Mr. Tapioca.png`), large time headline, subline `"of focus, one boba at a time"` (`app.js:2526`), drink-name chip, stats row `🔥 {streak} day streak` + `🧋 {collection.length} drinks brewed` (`app.js:2549-2554`), footer `"Mr. Tapioca 🧋"` (`app.js:2559`) / `"the focus timer that brews boba"` (`app.js:2562`).

**No URL, no QR, no handle, no App Store mark is drawn.** The only `drawImage` in the function is the character art.

`shareDrink()` (`app.js:2581-2583`):
```js
const text = `${shareTimePhrase(reward.minutes)} of focus with Mr. Tapioca 🧋`;
await navigator.share({ files: [file], title: "Mr. Tapioca", text });
```
Three keys — **no `url`**. Desktop fallback downloads `mr-tapioca-focus.png` and toasts "Saved your card — post it anywhere 🧋" (`app.js:2585-2590`).

Only two `navigator.share` call sites exist in the repo: `app.js:2583` and the squad invite `app.js:5251`. Grep of `app.js` for `apps.apple`, `mrtapioca.me`, `?src=`, `ct=`, `utm_` returns only `app.js:2009` (`APP_STORE_REVIEW_URL`, used solely to open the review page at `app.js:2024`/`:2026`) and `app.js:4533` (`PARTNERS_URL`, a data fetch).

Squad invite (`app.js:5246-5251`): text-only, no `url`, no files —
```
Add me on Mr. Tapioca! Paste my Study Squad code in the app (Squad, then Add):\n\n{code}
```
Clipboard fallback copies the bare code (`app.js:5253`). The app **ships an inbound `#sq=CODE` handler** with a confirm dialog and URL cleanup (`app.js:6501-6513`), and `parseSquadCode` strips `sq=` out of a full link (`app.js:5119-5123`) — but **nothing anywhere builds such a link** (`grep "sq="` returns only `app.js:5122`, `6501` comment, `6504`). On native it would not work anyway: `Info.plist` has no `CFBundleURLTypes` and `App.entitlements` has no `applinks`.

`/get` (the in-app-browser escape page, `get/index.html`) forwards `?src=` into Apple's `ct=` token (`get/index.html:81-82`) — the **only** attribution parameter in the repo; zero `utm_` anywhere. Exhaustive `grep -- "/get"` returns exactly two hits: `get/index.html:22` (its own comment) and `OUTREACH_DRAFTS_ROUND2.md:98`. Nothing links to it. `index.html:44` links straight to `apps.apple.com` — but that button is **desktop-only** (`styles.css:144-145` `.site-rail { display: none; }`, restored only ≥1180px), so on mobile `mrtapioca.me` presents **no App Store link at all**. `get/` is also absent from `www/` and `ios/App/App/public`, so it never ships in the native app.

### Squad presence reality: the pipeline is complete and permanently inert

| Layer | State |
|---|---|
| DB column | `supabase-setup.sql:27` `status text not null default 'idle' check (status in ('idle','focusing','break'))` |
| RPC return | `supabase-setup.sql:186` declares it, `:188` selects `pr.status` |
| RPC param | `supabase-setup.sql:205` `p_status text default null`; applied `:220` |
| Client send | `squad-cloud.js:74` `p_status: me.status \|\| "idle",` — the only `set_my_profile` call site |
| **Producer** | `app.js:5106-5111` `mySquadStats()` returns `{name, mins, drinks, streak, skin}` — **no status key**, with the comment "activity presence is deliberately NOT broadcast" |
| Client receive | `squad-cloud.js:92` `status: r.status` |
| **Consumer** | `app.js:5222` re-maps rows to `{id, name, mins, drinks, streak, skin, ts, me}` — status discarded. Template `app.js:5229-5241` renders rank, avatar, name, minutes, streak only |

`me.status` is `undefined` on every call, so every row in production is the literal `'idle'` forever. Grep for `\.status *=` in `app.js`: zero hits.

**Git history:** commit `8b55ae7` "Study Squad: live activity statuses" built the whole feature (`myStatusKey()`, `squadPresence()`, an `st:` share-code field, a coloured presence line). Commit `6475339` "UX overhaul: Custom+Goal timer, 5-tab nav, shop re-theme, de-emoji" removed the entire client half and left `squad-cloud.js` and `supabase-setup.sql` untouched. `grep "squadPresence\|myStatusKey"` returns zero hits today.

The 12-second poll while the sheet is open is real (`app.js:5340-5342`) but has no status to refresh.

Every shipped Squad string is about a leaderboard, not live activity: `index.html:568`, `app.js:5497`, `app.js:5372`. No user-facing string claims a friend is focusing right now.

---

## 7. NATIVE BUILD TRUTH

### Versions

- `ios/App/App.xcodeproj/project.pbxproj:719` `CURRENT_PROJECT_VERSION = 7;` and `:727` `MARKETING_VERSION = 1.1.0;` — identical across all **10** build configurations (5 targets × Debug/Release).
- Main bundle id `com.melchior.mrtapioca` (`project.pbxproj:729`); four extensions: `.ShieldConfiguration` (`:790`), `.ShieldAction` (`:872`), `.DeviceActivityMonitor` (`:954`), `.FocusWidget` (`:1038`). `capacitor.config.json:2` declares the same appId.
- Capacitor **6.x**, zero third-party plugins: `package.json:13-14` `@capacitor/core ^6.1.0`, `@capacitor/ios ^6.1.0`. `ios/App/Podfile:12-13` declares only `Capacitor` and `CapacitorCordova`; `Podfile.lock:2` pins 6.2.1, CocoaPods 1.16.2. `node_modules/@capacitor` contains only `cli`, `core`, `ios`.
- Three local plugin classes registered, matching `tools/register-ios-plugins.mjs:14`: `FocusShieldPlugin`, `FocusActivityPlugin`, `IAPPlugin`.

### Bundle sync state: **STALE by three days**

Every file in `ios/App/App/public` is dated **Aug 9 16:48**; repo root is **Aug 12**.

| File | Root | Staged |
|---|---|---|
| `app.js` | 310798 B | 309210 B |
| `styles.css` | 202436 B | 195651 B |
| `sw.js` | 5761 B, `CACHE = "mr-tapioca-v185"` (`sw.js:10`) | 5213 B, `"mr-tapioca-v181"` (`ios/App/App/public/sw.js:10`) |

`index.html`, `config.js`, `metrics.js`, `squad-cloud.js`, `manifest.json` are **byte-identical** between root and staged (md5 `index.html` = `7652341ec943010c464379379773c596`; `config.js` = `f236ec6f1150b6d169ab8aeb88878820`).

Eight assets present in root `assets/` (98 files) are absent from the staged `assets/` (90 files): `bg-winter-front.webp`, `bg-library-front.webp`, `bg-sunset-front.webp`, `win-mask-winter.webp`, `win-mask-library.webp`, `win-mask-sunset.webp`, `win-sunset.webp`, `win-sunset.mp4`.

### What the staged build contains

**Self-consistent, not broken.** Zero references to any of those 8 missing assets exist in the staged `app.js`, `styles.css`, `index.html` or `sw.js`; the staged SHELL omits them and staged `app.js:2214` is `const WINDOW_LOOPS = { galaxy: "assets/win-galaxy.mp4" };`. An archive from it would build and run — as the **Aug 9** app.

Specifically missing from the staged bundle:
- The `v.load()` galaxy-window fix (diff `@@ -2240,17 +2235,6 @@` removes `v.load();` and its 10-line comment). CLAUDE.md documents this as the Aug-12 root cause of the galaxy window rendering as a static CSS swirl until a button is tapped.
- The sunset window video.
- The second Taichi Bubble Tea curated location (diff `@@ -4424,7 +4408,6 @@` removes `{ name: "Taichi Bubble Tea", lat: 42.43940, lng: -76.49602 }`).
- The `sw.js` cache generation bump — v181 vs v185 is the release-blocking one: an archive from it ships a shell installed users already have.

**What the staged bundle DOES contain:** the full partner code. `ios/App/App/public/app.js:4516` `const PARTNERS_URL = "https://mrtapioca.me/partners.json";` and the identical `validPartner`/`perkMinMinutes`/`openRedeem`/`confirmRedeem` logic (`:4525-4532`, `:4563`, `:4905`, `:4932-4935`). `partners.json` is **not** bundled by design — `package.json:7` `copyweb` copies only `index.html styles.css app.js config.js squad-cloud.js metrics.js sw.js manifest.json` + `assets/`, and `find ios -name partners.json` returns nothing. Both root and staged `sw.js` exempt `partners.json` from the cache handler (`sw.js:122`, staged `:110`). So a staged-bundle archive **would honor live partner edits without an app update**.

### Swift parity

All 10 `native-ios/` Swift files have a counterpart in `ios/App`. 8 of 10 byte-identical (FocusActivityPlugin, FocusWidgetLiveActivity, FocusActivityAttributes, IAPPlugin, DeviceActivityMonitorExtension, FocusWidgetBundle, FocusShieldPlugin, SharedSelection). The 2 that drift — `ShieldActionExtension`, `ShieldConfigurationExtension` — differ in **comment text only**; no executable line differs. `ios/App` additionally has `AppDelegate.swift` with no `native-ios/` mirror.

### Tooling

`python3 tools/check-shell.py` on root `sw.js` → `mr-tapioca-v185: 63 precached paths` / `PASS — every precached path exists` / exit 0.

---

## 8. CLAIMS THAT ARE CURRENTLY FALSE

| # | Claim (file:line) | Verbatim | Contradicting code fact |
|---|---|---|---|
| 1 | `marketing/doug-one-pager.html:67` | "**First-visit trigger.** The big reward only fires the first time a student ever redeems at that shop. The app knows." | The app does not know. The only consumer of `state.perkRedemptions` is `perksRedeemedTotal()`, which reads `.length` (`app.js:4330-4332`). Nothing reads the `.shop` field written at `app.js:4959`. `openRedeem` gates on the global `earnedPerkCount()` (`app.js:4922-4925`), `confirmRedeem` likewise (`app.js:4955`). Case-insensitive grep for `firstVisit|first_visit|first-visit|firstRedeem|visitedShops|newCustomer|redemptionsByShop` over `*.js/*.json/*.sql/*.swift/*.html` returns **one** hit: the one-pager sentence itself. There is also no "big reward" tier to switch to — each shop has a single `perk` string. |
| 2 | `marketing/doug-one-pager.html:70` | "the shop gets a simple report: how many redemptions, how many first-time visitors." | Neither number is producible. Redemptions never leave the device (`app.js:763`, no fetch in `confirmRedeem` at `app.js:4954-4971`). `app.js` contains exactly two `fetch()` calls — `:4559` (partners.json) and `:4644` (Overpass) — both reads. `supabase-setup.sql` has four tables, none for redemptions. `drink_events` (`supabase-setup.sql:279-286`) carries `device/size/minutes/platform` and **no shop identity**, and fires on drink finish (`app.js:2365`), not redemption. |
| 3 | `marketing/doug-one-pager.html:61` | "nobody anywhere ties boba rewards to **verified** study time." | Nothing is verified. Minutes come from the device clock (`app.js:1842-1851`, `app.js:684-685`), are summed on-device (`app.js:839-841`), and persist in plain localStorage (`app.js:761`). No server clock, no attestation. `REWARD_UNBLOCKED_FRACTION` (`app.js:129`) scales **pearls only** — an unblocked session earns identical progress toward a real discount. On web, `app.js:2333-2335` treats "no blocker" as fully blocked. The repo warns itself three times: `supabase-setup.sql:8-11`, `:264-270`, `:277`. |
| 4 | `marketing/doug-one-pager.html:42` | "A big drink is about six hours of real focus" | Longest possible session is 240 min (`app.js:7` `CUSTOM_MAX = 240 * 60`; goal mode capped at `app.js:1131` `GOAL_MAX = 240`). Partner bar is 240 cumulative minutes. The only 360-minute reference left is a stale badge, `app.js:1272` `test: () => state.collection.some(d => d.minutes >= 360)`. |
| 5 | `privacy.html:69-70` | "2. Study Squad (optional social feature — **off unless you turn it on**)" / "If you choose to use Study Squad, the app creates an anonymous account" | `app.js:6438-6447` runs `SquadCloud.init()` unconditionally at top level whenever `config.js` has keys — and it does (`squad-cloud.js:10` `ENABLED = !!(CLOUD.url && CLOUD.anonKey)`, `config.js:10-12` populated). `init()` calls `signInAnonymously()` (`squad-cloud.js:39`) then `pushProfileNow()` (`squad-cloud.js:52`) before the user opens the sheet. Grep of `app.js`+`index.html` for `opt-in\|optIn\|consent\|squadToggle\|cloudEnabled\|useCloud` → zero. `SUPABASE_SETUP.md:89` states the real behaviour: "First launch creates an anonymous account". Same in the iOS bundle (`ios/App/App/public/app.js:6426-6430`). |
| 6 | `privacy.html:59-61` | "The following never leaves your iPhone and is not sent to us: Your focus sessions, progress…" | `metrics.js:46` POSTs `{device, size, minutes, platform}` (`metrics.js:37-43`) to `/rest/v1/drink_events` on every finished drink, fired from `app.js:2365`. `device` is a persistent per-install UUID (`metrics.js:23-33`, key `bobaMetricsDevice`). Loaded at `index.html:790`, cached at `sw.js:19`, present in `ios/App/App/public/`. `privacy.html:46` is dated June 29, 2026; `metrics.js` mtime Aug 3. |
| 7 | `privacy.html` (whole file, 118 lines) | No mention of the drink counter, device id, usage data, or metrics anywhere. `grep -i drink` → one hit, `privacy.html:76`, scoped to the opt-in Study Squad bullet. | The `drink_events` telemetry above. `privacy.html:87-93` "4. What we do NOT collect" reads as an exhaustive negative, and `:91` "No third-party analytics or tracking SDKs" is technically true (first-party fetch) and therefore misleading. Disclosure copy was drafted at `SUPABASE_SETUP.md:78-80` and never merged. |
| 8 | `privacy.html:77` | "...and your current status (e.g. 'focusing,' 'on a break')." | Status is never sent: `mySquadStats()` omits it (`app.js:5106-5111`), so `squad-cloud.js:74` always sends `"idle"`. The policy claims collection of data the code does not collect. |
| 9 | `APP_STORE_LISTING.md:178` | "If someone never touches Study Squad cloud, the only thing the app ever sends anywhere is a map query." | False as shipped, for the same `metrics.js` reason. `metrics.js` reads `window.MRTAP_CLOUD` directly (`metrics.js:17`) with no reference to squad state in either direction. This text feeds Apple's App Privacy questionnaire. |
| 10 | `APP_STORE_LISTING.md:143-176` | §8 declares exactly four data types (Precise Location `:145`, User Content `:151`, Identifiers>User ID `:159`, Purchases `:164`) and prescribes "Data Not Linked to You: Precise Location, Purchase History" `:174-176`. | **Usage Data is absent.** `metrics.js:9-10` flags it against itself: "iOS privacy label must declare Usage Data (not linked to identity) on the next submission." Also `SUPABASE_SETUP.md:107-108`. And §8 scopes User ID to "only with Study Squad cloud" while `bobaMetricsDevice` is minted regardless. |
| 11 | `APP_STORE_LISTING.md:56` | "Pick a drink size (a 5 minute taste, a 2 hour small, a 6 hour large, or a custom brew)" | `app.js:1-4` `const MODES = { custom: {...}, goal: {...} };` — two modes. `index.html:256-262` renders two buttons: "Custom" and "Goal". Ceiling 240 min on both paths (`app.js:7`, `app.js:1131`). Floor 15 min (`app.js:6` `CUSTOM_MIN`, `GOAL_MIN = 15`); the only 5-minute path is `DEV_MIN = 5` **seconds** (`app.js:9`). Removal is documented at `app.js:664` "Also migrates pre-redesign modes (tasting/small/large) to custom." Repeated at `marketing/MARKETING.md:43` "pick Large (6 hr)". |
| 12 | `app.js:6475-6476` | "// the tour is the only / thing that points at app-blocking, so a new user must not silently miss it." | None of the 9 `TOUR_STEPS` (`app.js:5479-5498`) mentions blocking; the array is never mutated (only reads at `:5552`, `:5582`, `:5584`, `:5604`). Blocking IS surfaced elsewhere: `#blockPill` (`index.html:289-291`, `app.js:2273-2294`), `#blockPrompt` (`index.html:743-748`), Settings (`index.html:478`). Related: `app.js:5470` calls it "the 10-step tour" for a 9-element array. |
| 13 | `app.js:2144` | `saveState();                // persist running state + push "🟢 Focusing" status to the Squad` | Pushes the literal `"idle"` (`squad-cloud.js:74`, `app.js:5106-5111`). Directly contradicted by `app.js:5108-5109` in the same file. |
| 14 | `app.js:5337-5338` | "// friends' current statuses (🟢 Focusing / 🌸 break / Online) update live without reopening." | No status is rendered anywhere (`app.js:5222`, `:5229-5241`). Grep for 🟢/🌸/"Online"/"Focusing" across `app.js`, `index.html`, `styles.css`, `squad-cloud.js` finds those emoji **only** inside these two comments. |
| 15 | `app.js:5375-5378` (onboarding slide 6) | "Real Rewards Await!" / "Mr. Tapioca wants to work at real shops. **Stay tuned** to unlock discounts at boba shops near you." | Stale: `partners.json:26-45` already carries two signed live shops. |
| 16 | `app.js:237` and `app.js:5278` | `// paid name changes done (0 = next costs 500 pearls…)` and `// First change → costs 500 pearls.` | `app.js:5258` `const RENAME_PEARL_COST = 20;`. `grep -rn "500 pearls"` returns exactly those two comment lines. No user-visible surface shows 500 — every display reads the constant (`:5280`, `:5281`, `:5284`, `:5285`, `:5291`, `:5296`, `:5315`). |
| 17 | `catch-up.html:168` | "see each other's live focus stats & status (🟢 focusing / 🌸 on a break)." | Same inert-status pipeline. |
| 18 | `support.html:106` | "focus stats sync so friends can see you focusing." | Same. |
| 19 | `app.js:4500` | `minMinutes  focus time in ONE drink that unlocks it` | Perks are cumulative lifetime minutes (`app.js:839-841` → `:4325-4328`), not per-drink. The header at `app.js:4492-4505` says cumulative. |
| 20 | `get/index.html:22-23` | "Point the Instagram bio link at https://mrtapioca.me/get - never at apps.apple.com directly." | Nothing in the repo links to `/get`; exhaustive grep returns only that comment and `OUTREACH_DRAFTS_ROUND2.md:98`. |

**Claims that hold up** (checked, supported): `APP_STORE_LISTING.md:66` "A boba map with actual bubble tea shops near you" (promises no discount); the pearl rate claim (`app.js:2372`); the blocked-vs-unblocked pearl split (`app.js:129`); "Big drinks are resumable" (`app.js:661`, `:669-681`) — only the word "large" in that sentence is wrong.

---

## 9. CONFIRMED DEFECTS, RANKED

### Tier 1 — a real business can be shown a discount it never agreed to

**D1. The counter card can be shown unlimited times; confirming is voluntary.**
`openRedeem()` renders the full card and starts the live clock (`app.js:4915-4947`). The only thing that decrements the balance is the student tapping "Use one reward". "Not now" is a `<form method="dialog">` submit (`index.html:736-738`) whose close handler does nothing but `clearInterval` (`app.js:4949-4952`, bound at `app.js:6263`; `confirmRedeem` bound separately at `app.js:6264`). A student who banks one perk in four hours can walk into U Tea every day forever, show an identical fully-lit card, and tap "Not now". Exposure is wider than stated: the card also opens at a **zero** balance — only the button is disabled (`app.js:4925`) and one CSS rule dims the perk chip (`styles.css:3124`); shop name, perk text and ticking clock render at full strength. And the balance is global, so a "Not now" preserves the perk across both shops. Present in the staged native bundle (`ios/App/App/public/app.js:4932-4935`).

**D2. One localStorage write mints unlimited perks.** *(reproduced end-to-end in Chrome)*
`app.js:616` reads `bobaFocusCollection`; `app.js:632` checks only `Array.isArray`; `app.js:840` reduces over `drink.minutes` with no cap or cross-check. Measured live: `[{minutes:100000}]` → `earnedPerkCount()` **416**, banner "🌟 416 rewards ready. U Tea gives 10% off your drink.", confirm button enabled, note "You have 416 rewards saved." Also mints 6,666 pearls (`app.js:900`). Contrast the careful sanitizing done for scalars at `app.js:715-724` and for `dailyGoal`/`elapsed`/`breakDuration` at `:670`/`:675`/`:698` — the collection array got none of it. Note the irony: `app.js:4538-4548` hardens the *remote* partner list because "a partner list is the one piece of remote data that can cost a real business real money", while the local ledger the same arithmetic divides is unguarded.

**D3. Deleting `bobaFocusPerkRedemptions` replays every perk already spent.**
`perksRedeemedTotal()` is a bare array length (`app.js:4330-4332`). `readJSON` returns `[]` on `null` (`app.js:755-762`), and the boot `saveState()` at `app.js:6442` re-persists `"[]"` — the reset is cemented, not transient. No second ledger exists: repo-wide grep for `perkRedemptions` returns only `app.js:216, 618, 619, 763, 4331, 4956, 4957`. Nothing in `squad-cloud.js`, `metrics.js`, `supabase-setup.sql`, `native-ios/`, `ios/`.

**D4. The user-writable `bobaPartners1` cache controls both the bar and the perk text.**
`loadPartners()` seeds `livePartners` from localStorage **before** the network call (`app.js:4554-4556`); `validPartner()` is shape-only (`app.js:4542-4549`). A forged entry with `minMinutes: 15` drops the global bar to 15 minutes **and** prints an arbitrary perk on the counter card (`app.js:4917-4920`). `withPartners()` will push it as its own map pin even with no matching shop record (`app.js:4616`). Offline is the reliable path — a rejected fetch lands in `app.js:4572` `.catch(() => {});`. Correction to earlier reporting: the forgery is **not** re-persisted (the only `setItem` is at `app.js:4570`, inside the success branch); it survives by omission. Scope: `loadPartners()` runs only on map open (`app.js:4763`), which is the same action the attack already requires. Same code at `ios/App/App/public/app.js:4517, 4531, 4538, 4553`.

**D5. Perks are earned and redeemed entirely in localStorage — there is no server-side reward to hang integrity off.**
Entitlement is `Math.floor(totalMinutes() / bar)` over user-writable storage; redemption is a local array push; the barista's only verification is a clock he cannot check against anything. This is the exact scenario `metrics.js:13-15` and `supabase-setup.sql:264-267`/`:277-278` warn against, and it is live with two signed shops. **Correction:** `confirmRedeem()` does transitively produce a network write — `app.js:4962` `saveState()` ends at `app.js:815` with `SquadCloud.pushProfile()`. The payload carries no perk data, so the conclusion stands: *no network call carrying redemption data*.

**D6. A single global perk bar means a lenient partner unlocks every other partner's offer, and changing the bar retroactively re-scores lifetime history.**
See §3. Latent today (both shops at 240) but the system is explicitly designed for per-shop terms (`app.js:4494-4496`). Reachable erasure example: shop at 60 min live → user with 300 lifetime minutes has 5 earned, redeems 4, shows 1; shop comes off → bar 240 → 1 earned − 4 redeemed = −3 → clamped to 0 (`app.js:4336`) with no explanation. Note that with *today's* list, pulling **all** shops falls to the 180 fallback (`app.js:4581`), which lowers rather than raises the bar — erasure requires a sub-240 shop to have existed.

### Tier 2 — user-visible correctness and compliance

**D7. The reward card over-states pearls on every unblocked native session with an odd `fullPearls`.**
Displayed: `app.js:2380` `const pearlsEarned = Math.max(1, Math.round(awardedExact));`. Banked: `awardedExact` (`app.js:2379`), with the shortfall accruing in `blockPenalty` (`app.js:2384-2386`) which `currentPearls()` subtracts before flooring (`app.js:900`). `pearlsEarned` is display-only — used at `app.js:2426`, rendered at `app.js:2639`, fallback toast `app.js:2653`. Measured: four 15-minute cups on native with no shield → cards promise **4** pearls, `currentPearls()` returns **2**. Four 45-minute cups → cards promise 8, wallet 6. Even `fullPearls` is clean. `CUSTOM_MIN = 15 * 60` (`app.js:6`) makes the odd case the common one, and `FocusBlocker._active` is true only if apps were actually picked (`app.js:1917-1919`), so the half path is the default for any native user who skips app selection. The halves persist as floats (`app.js:623`, `:767`, sanitizer `:715-718`).

**D8. `privacy.html` and `APP_STORE_LISTING.md` misstate account creation and omit the telemetry.**
Items 5, 6, 7, 8, 9, 10 in §8. This is an App Store review-risk surface, not marketing copy: `APP_STORE_LISTING.md` §8 is the source for the next submission's questionnaire, and `privacy.html` is live today.

**D9. No notification capability of any kind.**
See §6. A 15-minute-to-4-hour timer whose entire premise is that the user puts the phone down cannot signal completion — and completion itself does not fire until the app is reopened (`app.js:6390-6402`).

**D10. Shipped 7-tap dev unlock farms pearls, drinks and the `drink_events` counter.**
`index.html:446` ships `#devRow` hidden; 7 taps on `#settingsSheet h2` (`index.html:407`) sets `bobaFocusDevUnlock` (`app.js:6033-6047`) and `app.js:4164-4166` unhides it; `app.js:5999-6000` flips `state.devMode` directly with no second gate. Present in `www/app.js` and `ios/App/App/public/app.js` (2 occurrences each).
- **Timer printer:** dev drops Custom to 5 s (`app.js:9`, `app.js:2825-2830`); `minutes = Math.round(5/60) = 0` (`app.js:2349`) → `fullPearls = 0` → `awardedExact = 1` (`app.js:2379`) → `state.bonusPearls += 1` per 5-second session (`app.js:2384-2385`). No devMode guard in `completeSession()`.
- **Games:** plays are MAX per sheet-open with unlimited reopens — `gameDoneToday` returns false in dev (`app.js:3418`), `bankPlays` is skipped (`app.js:3667`, `:5710`), the native 30-min gate is bypassed (`app.js:3453`). Rewards have no devMode guard (`app.js:3609`, `:5771`, `:3170`).
- **Drinks + telemetry:** `state.collection.unshift(drink)` (`app.js:2431`) and `MrTMetrics.drinkFinished` (`app.js:2365`) are unguarded; `metrics.js:40` floors 0 minutes up to 1, inflating the counter at ~12 drinks/minute per device.
- **Correctly fenced:** premium IAP (`app.js:1496-1508` — `return !(typeof IAP !== "undefined" && IAP.available());`). Focus minutes are **not** farmable this way (`Math.round(5/60) = 0`).
- **Not** leaderboard-farmable in the way sometimes stated: pearls are never uploaded (`app.js:5106-5111`, `squad-cloud.js:64-77`); the 5-second exploit inflates `drinks`, not minutes.
- The code concedes it: `app.js:4161-4163` — "Dev mode mints unlimited pearls/unlocks, so the row is hidden from normal users (TestFlight included — Squad leaderboards must stay honest)." Obscurity is the only control, and this contradicts CLAUDE.md's rule "Never introduce a way to farm or double-credit pearls."

**D11. Economy inversion.** §5: a maxed non-focus day (46) is worth 11.5 h of focus, or 23 h on native unblocked. `app.js:126` states the intent this violates.

### Tier 3 — latent, structural, or cosmetic

**D12. No pause / expiry / effective-date / offer-version mechanism.** Removal from the file is the only kill switch. Suppressing a single shop by deliberately failing `validPartner` is an abuse of a safety validator and **silently fails** on the last valid shop (`app.js:4568` throws, `app.js:4572` swallows, cached list stands). `since` exists in the data and is never read. Redemption rows store a free-text `perk` snapshot and the shop **name** (`app.js:4957-4961`), so wording changes and renames are indistinguishable — latent only, since nothing reads those fields back.

**D13. `bobaPartners1` has no TTL.** `{t, shops}` written at `app.js:4570`, `c.t` never read (`app.js:4554-4557`). The only sweeper (`app.js:4688-4696`) matches `bobaShops:`/`bobaShops2:` and runs only on a successful Overpass fetch. A persistently-offline client keeps starring a pulled shop, breaking the pitch promise at `partners.json:9-10` ("it comes off the app the day they ask"). **A TTL alone would not fix it** — expiry falls back to `PARTNER_SHOPS` (`app.js:4536`), which hardcodes U Tea's 10% off (`app.js:4502-4516`) and only changes with an App Store build.

**D14. `validPartner()` ignores `id`, so two id-less partners collapse.** `app.js:4615` `out.some(s => s.partner && s.partner.id === p.id)` evaluates `undefined === undefined`. Latent today (both live shops have distinct ids). Only affects the synthetic-push path — a partner matched to a real OSM record by `partnerFor()` is already on the map. Note the guard is also unnecessarily indirect: `partnerFor()` returns the actual object out of `livePartners` (`app.js:4589`), so `s.partner === p` would be identity-safe regardless of `id`.

**D15. `focus_minutes` unlimited seed + no rate limit on `set_my_profile`.** §4. Leaderboard-integrity only today — nothing in `app.js` reads `profiles.focus_minutes`; its only consumer is the leaderboard render (`squad-cloud.js:91`). Fold in the NULL-argument bug at `supabase-setup.sql:215` and `:219`, which is the more actionable half.

**D16. The Squad status pipeline is dead weight** across schema, RPC signature and client. §6.

**D17. Stale comments** documenting behaviour the code does not have: `app.js:237`, `:2144`, `:4500`, `:5337-5338`, `:5470`, `:5278`, `:6475-6476`.

**D18. Growth loop is unclickable and unattributed.** Share card has no URL/QR/handle; `navigator.share` payloads have no `url` key (`app.js:2583`, `:5251`); the `#sq=` handler is unreachable because nothing constructs the link, and on native it would fail anyway (no `CFBundleURLTypes`, no `applinks`); `/get` is linked from nowhere and mobile `mrtapioca.me` shows no store link at all.

**D19. Staged native bundle is 3 days stale**, most importantly `sw.js` v181 vs v185. §7.

**D20. Latent fragility (no current symptom):** `state.lastSessionMinutes` (`app.js:2350`, `:3455`) is never persisted, and neither is `state.phase`. The games gate is safe today only because break mode is unreachable after a relaunch — the invariant is implicit and unguarded. If `phase` were ever persisted, or a "start a break any time" entry added, the padlock-after-relaunch bug becomes real.

**D21. `clearProgress()` is unreachable and would leave `perkRedemptions` behind.** `grep -c "clearProgress"` = 1 across the whole repo (its own definition, `app.js:1594`); `index.html` has zero `onclick` attributes and no dynamic dispatch. It correctly resets `gameDays`, `gamePlays` and `renames` (`app.js:1619-1621`) but **not** `state.perkRedemptions` — a latent bug that becomes real the moment it is wired to a button. The fix belongs next to `app.js:1612`.

### Explicitly refuted — do not act on these

`clearProgress()` leaving the game ledger and rename counter intact (**refuted**, `app.js:1619-1621` resets all three) · `streak` lacking a monotonic clamp in `set_my_profile` (**refuted** — monotonic streak would freeze every user at their peak; streak is not a ranking key, `supabase-setup.sql:193`, `app.js:5228`) · `lastSessionMinutes` re-locking games on launch (**refuted on reachability**) · Plinko's comment mismatching its weight table (**refuted by simulation** — the comment documents realised pick-and-steer odds, measured at ~7% / ~20% / 6.2 per day, matching) · `clearProgress` permanently debiting spent perks (**refuted on reachability**, see D21).

---

## 10. WHAT REMAINS UNCONFIRMED

1. **Whether the live App Store binary (1.0.1 / build 6) contains `metrics.js`, the dev unlock, or the partner code.** Only `ios/App/App/public/` (a working staging copy) was inspected; no archived IPA was opened. `CLAUDE.md:91-97` states builds 6 and 7 predate the partner code and ignore `partners.json` entirely, with partners reaching phones only at 1.1.1 / build 8 — that is **doc prose**, corroborated by `project.pbxproj:719,727` showing 1.1.0/7 today, not by binary inspection.
2. **What App Privacy label is actually filed in App Store Connect.** Nothing in this repo records the submitted answers.
3. **Whether the live App Store product page still carries the four-drink-size description.** `APP_STORE_LISTING.md:1` is headed "(v1.0)"; the live listing was not fetched.
4. **Whether `supabase-setup.sql` §18 (`drink_events`) has actually been run in the dashboard.** `SUPABASE_SETUP.md:100-102` says the ping 404s silently until it is. The live database was not queried.
5. **Whether `supabase-reward-v2.sql` has been applied to the live database.** It is untracked (`?? supabase-reward-v2.sql`), has zero client wiring, and `docs/network-v1/LEDGER.md` lists "Reward V2 … not started".
6. **The NULL-argument behaviour of `supabase-setup.sql:215` and `:219`.** No postgres binary on this machine; conclusion rests on documented `LEAST`/`GREATEST` NULL semantics, not execution.
7. **Whether `authenticated` can PATCH `profiles.drinks`/`streak` directly via PostgREST.** Read from the grant at `supabase-setup.sql:130`; no live request was made.
8. **How an attacker would write `localStorage['bobaPartners1']` on a shipped iOS build.** No in-app path found; would require Safari Web Inspector against the WKWebView, or any in-origin script on mrtapioca.me. The write vector is outside what the code shows.
9. **Whether any future or existing partner was verbally offered a different `minMinutes`.** Only code and `partners.json` were read.
10. **Whether an id-less or duplicate-id entry has ever been pushed to the live `mrtapioca.me/partners.json`.** Only the repo copy is visible.
11. **Whether any live Instagram/Threads bio actually points at `mrtapioca.me/get`.** `OUTREACH_DRAFTS_ROUND2.md:98` references it as the link to hand an influencer; nothing in the repo confirms deployment.
12. **Whether `marketing/doug-one-pager.html` was ever shown to a shop owner.** The document is addressed to a mentor (`:39`, `:73` "This is the sheet I'd eventually adapt for shop owners. Be honest, what's wrong with it?").
13. **Whether the Squad status removal in commit `6475339` was an intentional privacy decision or collateral damage from the de-emoji sweep.** The comment asserting intent (`app.js:5108-5109`) was added by the same removal commit.
14. **Whether the Plinko comment's figures were measured at a specific viewport.** Realised day-average drifts to ~7.0 at desktop-ish canvas sizes (500×520); `plinko.targetSlot` (`app.js:3680`, initialiser `app.js:142`) appears vestigial but was not exhaustively traced.
15. **Runtime behaviour of the share and squad paths.** §6's share findings are a static read of `app.js`, `index.html` and the iOS public bundle; nothing was executed or rendered.
16. **Whether `clearProgress()` was reachable in a previously shipped build.** Git history for that function was not traced.
17. **Whether `state.blockPenalty` is re-floored anywhere outside `currentPearls()`.** Every reference was grepped (`app.js:226, 229, 622-623, 717-718, 766-767, 897-900, 1606-1607, 2376, 2384-2386`) and none does, but all 6,600 lines were not read.