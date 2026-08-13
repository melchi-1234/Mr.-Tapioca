# Product analytics — spec for `analytics.js` and `public.app_events`

Companion to `analytics.js` (repo root). Priority 4 in `docs/network-v1/LEDGER.md`.
Ground truth for every claim about current behaviour is `docs/network-v1/GROUNDING.md`.

**The problem this closes.** Today the only product signal that leaves a phone is
`metrics.js`: one row per finished drink, `{device, size, minutes, platform}`
(`supabase-setup.sql:279-293`). That answers "how many drinks has the app brewed?"
and nothing else. It cannot tell you how many people who opened the app ever
finished a first session, whether anyone comes back on day 7, whether the Boba Map
is ever opened, or where the funnel leaks. `metrics.js` **stays** — it is the Demo
Day drink counter and `analytics.js` neither replaces it nor reads from it.

---

## 1. What these numbers are NOT

Read this before quoting any figure in this document to anybody.

| Not this | Why not |
|---|---|
| **Fraud prevention** | Every row is a client assertion with nothing signing it. The public key can insert. `supabase-setup.sql:277-278` already says this about `drink_events` and it applies here identically. |
| **Merchant ROI, revenue, incremental sales, or average order value** | There is no money in this table by construction. `purchase_completed` carries a product id and no price. App Store Connect is the revenue ledger. |
| **First-time visitors at a shop** | The app has no shop-side identity of any kind. `marketing/doug-one-pager.html:67` claims a first-visit trigger; GROUNDING.md §8 item 1 shows nothing in the codebase implements or could implement it. This table does not change that. |
| **Verified study time** | Minutes come from the device clock (`tick()`, `app.js:1861-1874`), are summed on-device, and live in plain `localStorage`. GROUNDING.md §8 item 3. `actual_minutes` here is a copy of that number, not a check on it. |
| **A completed redemption at a counter** | `redemption_completed` means "the student tapped *Use one reward* inside the app". It does not mean a barista honoured anything, and it does not mean a drink was sold. |
| **A statistically meaningful percentage** | Traction is early: friends and family plus a few test purchases. Under roughly 30 devices in a denominator, every percentage in §6 is noise. **Print the raw counts next to every percentage, always.** Each query below returns both on purpose. |

---

## 2. Privacy contract

The module enforces this in code, not in policy. `analytics.js` runs every property
through a hard allowlist (`NUM_PROPS`, `BOOL_PROPS`, `SLUG_PROPS`, `ENUM_PROPS`) and
drops any key it does not name **before the row object exists**.

**Never collected, and not collectable:**

- names, emails, friend codes, display names, squad membership
- location of any kind. No lat/lng, no city, no map geometry
- the identity of Screen Time selections. `apps_selected_count` is a **count**.
  There is no property key that would accept a bundle id or a `FamilyActivitySelection`
  token, so a future caller cannot add one by accident
- any cross-app advertising identifier. No IDFA, no ATT prompt, no third-party SDK
- money. No price, no amount, no currency
- **free text of any kind.** The schema has no free-text property. Every string
  property is either a fixed enum or a slug matching `^[a-z0-9][a-z0-9_.-]*$`

**The device id** is the same random per-install UUID `metrics.js` already mints
(`bobaMetricsDevice`, `metrics.js:23-33`). Reuse is deliberate: two ids per install
would be a second identifier to declare on the App Store privacy label, and would
make the device counts in `drink_events` and `app_events` disagree, which reads as
double the installs. It links to nothing — no account, no auth uid, no contact detail.

**Server retention is 400 days** (§7 cron), which is D365 plus slack and bounds how
long an anonymous device id lives on the server. That bound is real only once the
cron job exists: it is the one statement in §7 that needs pg_cron turned on, and
until it runs nothing prunes the table. Check it before repeating the number to
anyone.

### ⚠ Compliance gate — do not ship without this

`privacy.html:59-61` says focus sessions and progress never leave the device.
`APP_STORE_LISTING.md:143-176` declares four data types and **omits Usage Data**.
Both are already wrong because of `metrics.js` (GROUNDING.md §8 items 6, 7, 9, 10 →
defect D8). Shipping `analytics.js` makes an existing false statement worse, not
better.

The privacy copy and the App Privacy questionnaire answers must land in the **same
release** as the `<script>` tag. That is a hard gate. Those files belong to the
founder and are not edited by this spec.

---

## 3. Event catalogue

31 events. The list is duplicated as a `CHECK` constraint on the server (§7), so
adding one means editing `EVENTS` in `analytics.js` **and** running a migration.
That is the price of making it impossible for a buggy client to invent event names
and pollute every `GROUP BY` in §6.

**Dedup column:**
`once` = exactly once per install, forever, enforced by `analytics.js` no matter
which method calls it · `once/scope` = once per install per scoped thing ·
`daily` = once per local calendar day · `each` = every occurrence.

**Read the function name, not the line number.** Every `app.js:NNNN` below was
re-checked against the working tree on 2026-08-13, but `app.js` is about 6,300
lines and moves: these same cites drifted by roughly 37 lines in a single day of
editing. The function name is the durable anchor. If a number does not land where
this table says, `grep -n` the function and trust that.

### activation

| Event | Dedup | Properties | Fire it at |
|---|---|---|---|
| `first_open` | **once** | — | automatic, `analytics.js` init. Do not call it. |
| `onboarding_started` | **once** | — | `showOnboarding()` (`app.js:5426`), where the first slide is shown |
| `onboarding_completed` | **once** | — | where `bobaFocusOnboarded` is written (`app.js:5503`) |
| `screentime_explainer_viewed` | each | — | `showBlockingPrompt()` (`app.js:2190`) |
| `permission_granted` | each | — | after `FocusBlocker.requestAuthorization()` resolves (`app.js:2208`, `:6265`, `:6276`, `:6292`) |
| `permission_denied` | each | — | same four sites, rejection path |
| `apps_selected` | each | `apps_selected_count` | after `FocusBlocker.pickApps()` returns (`app.js:2209`, `:6266`, `:6277`, `:6293`). **Count only.** |
| `first_focus_started` | **once** | `planned_minutes`, `native_blocking_enabled` | `beginFocus()` (`app.js:2154`) |
| `first_focus_completed` | **once** | `actual_minutes` | `completeSession()` (`app.js:2346`) |

Onboarding and the tour are replayable from Settings (`index.html:453-461`). A
replay produces **no second row** — correct for a funnel denominator, and it means
this table cannot answer "how many people replay onboarding". That would need its
own event name, not a loosening of the dedup.

### focus

| Event | Dedup | Properties | Fire it at |
|---|---|---|---|
| `session_started` | each | `planned_minutes`, `native_blocking_enabled` | `beginFocus()` (`app.js:2154`) |
| `session_completed` | each | `planned_minutes`, `actual_minutes`, `native_blocking_enabled` | `completeSession()` (`app.js:2346`), next to the existing `MrTMetrics.drinkFinished` call at `app.js:2393` |
| `session_abandoned` | each | `planned_minutes`, `actual_minutes`, `native_blocking_enabled`, `block_failure` | reset / give-up path |

`block_failure` is an enum: `none`, `not_authorized`, `no_apps_picked`,
`shield_not_applied`, `ignore_limit`, `unknown`. Only set it where the failure is
actually detectable. Per CLAUDE.md gotcha 5 and GROUNDING.md, a user tapping
"Ignore Limit" or reinstalling a blocked app kills the shield with **no API that
detects it**, so `ignore_limit` will be under-reported and must never be read as a
complete count of shield failures.

### retention

| Event | Dedup | Properties | Fire it at |
|---|---|---|---|
| `daily_goal_completed` | **daily** | `goal` minutes via `planned_minutes` | the goal-reached branch in `completeSession()` (`app.js:2473-2477`) |
| `streak_continued` | **daily** | `streak_days` | streak increment |
| `return_day` | **daily** | — | automatic, `analytics.js` init |
| `quest_completed` | each | `quest_id` | `onQuestComplete()` (`app.js:5086`) |

`return_day` fires on day 0 too, so `cohort_day = 0` is the retention denominator.

### rewards

| Event | Dedup | Properties | Fire it at |
|---|---|---|---|
| `partner_discovered` | **once/partner_id** | `partner_id` | `withPartners()` stamps a partner onto the shop list (`app.js:4645-4655`) |
| `offer_viewed` | each | `partner_id` | `openRedeem()` (`app.js:4952`) |
| `progress_viewed` | each | — | `renderPerkBanner()` writes a non-empty message (`app.js:4869-4890`) |
| `reward_issued` | each | `partner_id` (optional) | see the note below |
| `redemption_started` | each | `partner_id` | `openRedeem()` |
| `redemption_completed` | each | `partner_id` | `confirmRedeem()` (`app.js:4991`) |
| `redemption_failed` | each | `partner_id`, `reason` | wherever a redemption is refused |

`reason` is an enum: `no_reward`, `expired`, `already_used`, `wrong_shop`,
`network`, `cancelled`, `unknown`.

**`reward_issued` has no natural call site in v1.** v1 does not issue rewards; it
*derives* a count on every read — `Math.floor(totalMinutes() / bar)` in
`perksEarnedTotal()` (`app.js:4362-4365`) — with no stored bar and no high-water mark, so lowering the
bar retroactively inflates history (GROUNDING.md §3, defect D6). Either fire it
when `earnedPerkCount()` crosses upward and accept that it is a client-side edge
detection, or leave it unwired until Reward V2's `issue_my_rewards()` gives a real
issuance moment. **Do not backfill it.** Prefer the second option.

Use the scoped form for discovery so a repeat map open does not inflate the number:

```js
MrTAnalytics.trackOnce("partner_discovered", { partner_id: id }, id);
```

`partner_id` is the `id` slug from `partners.json` (`u-tea-collegetown`,
`dream-tea-poke-ithaca`), not the shop name. `validPartner()` (`app.js:4579`) does not require `id`
today (GROUNDING.md D14), so an id-less partner will simply produce no `partner_id`
and land in the `(none)` bucket in §6.

### growth

| Event | Dedup | Properties | Fire it at |
|---|---|---|---|
| `focus_card_shared` | each | — | `shareDrink()` (`app.js:2603`) |
| `reward_card_shared` | each | `partner_id` | not built yet |
| `squad_invite_shared` | each | — | `shareSquadCode()` (`app.js:5283`) |
| `install_link_opened` | **once** | `source` | inbound link handler |

**`install_link_opened` will read zero until the growth loop is clickable.** Today
the share card carries no URL, QR or handle, and neither `navigator.share` payload
has a `url` key (GROUNDING.md §6, defect D18). `/get` is linked from nowhere. There
is nothing for anyone to open. Wire the event anyway so the number is real the day
that ships; just do not present a zero as a measurement.

`source` is a slug, max 24 chars, e.g. `share_focus`, `share_reward`,
`share_squad`, `flyer`, `qr`. It is an **aggregate campaign bucket, deliberately
not a per-share token** — a unique token per share would join two people's
anonymous devices into a social edge, which is exactly the kind of linkage this
module refuses to build.

### commerce

| Event | Dedup | Properties | Fire it at |
|---|---|---|---|
| `cosmetic_viewed` | each | `product_id` | shop item opened |
| `purchase_initiated` | each | `product_id` | StoreKit purchase started (`IAPPlugin`) |
| `purchase_completed` | each | `product_id` | purchase resolved successfully |
| `restore_completed` | each | — | restore purchases resolved |

No price, ever. See §1.

---

## 4. Module API

```js
MrTAnalytics.enabled                          // false with no Supabase keys
MrTAnalytics.track(name, props)                // normal event
MrTAnalytics.trackOnce(name, props, scope)     // exactly once per install (per scope)
MrTAnalytics.trackDaily(name, props)           // once per local calendar day
MrTAnalytics.flush()                           // Promise<boolean>, force a send now
MrTAnalytics.recent(n)                         // local debug ring, last <=50 events
MrTAnalytics.queueLength()                     // pending rows
MrTAnalytics.deviceId() / .cohortDay()
MrTAnalytics.appVersion()                      // what every row will stamp
MrTAnalytics.EVENTS / .ALWAYS_ONCE             // the catalogue, for reference
MrTAnalytics.debugReset()                      // gated on MRTAP_ANALYTICS_DEBUG === true
```

Every method is wrapped and returns `false` rather than throwing. Calling `track()`
on one of the `ALWAYS_ONCE` names is automatically routed through `trackOnce()`, so
a double call from `app.js` cannot duplicate a funnel row.

`trackOnce()` returns `false` for two different reasons and the caller does not
need to tell them apart: the event already fired, or the row could not be queued
(in which case no permanent mark was written, so a later call can still succeed).
`appVersion()` returning `analytics-1` means §5 step 2 was skipped.

**Behaviour with no keys:** zero network requests **and** zero `localStorage`
writes. Not "writes but never sends" — nothing touches the disk, so a fork with
`config.js` blanked leaves no trace. The debug ring still works, in memory.

**`debugReset()` is gated** on `window.MRTAP_ANALYTICS_DEBUG === true`. Clearing the
dedup map lets one install replay its whole activation funnel; an ungated reset
would be GROUNDING.md D10 (the shipped 7-tap dev unlock) in a smaller costume.

### Reliability design

| Concern | How it is handled |
|---|---|
| Tab closes mid-session | `keepalive: true` on the POST. Batch stays at 20 rows because the fetch spec caps keepalive bodies at 64 KB across all in-flight keepalive requests. |
| Crash with events pending | The queue is in `localStorage`; init drains it on the next launch. |
| Unbounded growth | Two caps: 200 rows **and** 64 KB serialized. The byte cap is the one that matters: `localStorage` is shared with `bobaFocusCollection`, and a quota exception thrown while saving a finished drink would cost the user the drink. With larger `props` the byte cap bites first, so 200 is a ceiling and not a guarantee. |
| A queue overflow eats a funnel row | Once-per-install rows sit in a **priority lane**. Eviction spends unreadable entries first, then ordinary rows, and only reaches a funnel row when the queue holds nothing else. Measured: 400 `session_started` fired while offline no longer displaces a `first_focus_completed` queued either before or during the flood. |
| A funnel row is lost but its dedup mark stands | The permanent mark is written **after** the row is in the persisted queue, never before, and it is handed back if the row is later evicted or discarded by the poison-batch guard. So the event fires again instead of the install going missing from the funnel forever. The residual is the opposite failure: a crash between the queue write and the mark write costs one duplicate row, which every query in §6 absorbs because they aggregate per device with `bool_or`. |
| Retry duplicates a row | Client-generated `event_id` uuid + a unique constraint + `Prefer: resolution=ignore-duplicates`. A plain `409` is also treated as success, so idempotency holds even if PostgREST ignores the hint. |
| Events fired mid-flush get dropped | On success the queue is re-read from storage and filtered by `event_id`, never overwritten with the stale slice the flush started from. |
| Server permanently rejects a batch | Non-retryable statuses (400/401/403/404/405/413/422) burn a try; after 3 the batch is dropped. Without this, the table not existing yet — the same silent 404 `SUPABASE_SETUP.md:100-102` documents for `drink_events` — would wedge the queue forever. 408/429/5xx and network errors do **not** burn a try. |
| One bad device clock 400s the whole batch | `ts` is clamped client-side to the same window the server `CHECK` allows. |
| Flush lag corrupts retention | `cohort_day` is computed on the device, in local time, and stamped on every row. Retention never reads `created_at`, so a row queued offline and flushed three days later stays in the right cohort. |

---

## 5. Wiring checklist

`analytics.js` is **not** wired in. These files belong to other owners:

1. **`index.html`** — add `<script src="analytics.js"></script>` after `metrics.js`
   (currently `index.html:788-790`). It must load after `config.js`.
2. **`index.html`, one line above that** — declare the build, because nothing in
   the web bundle knows it:

   ```html
   <script>window.MRTAP_VERSION = "1.1.1-8";</script>
   <script src="analytics.js"></script>
   ```

   Use `MARKETING_VERSION-CURRENT_PROJECT_VERSION` from
   `ios/App/App.xcodeproj/project.pbxproj`, max 24 characters. **Bump it in the
   same commit you bump `sw.js` `CACHE`**, or every release reports as the last
   one. Skip this step entirely and nothing breaks: `analytics.js` falls back to
   its own `MODULE_VERSION` (`analytics-1`) so the column is never empty and
   never lies about a build. But §6.10's by-build query then has only that one
   value to group on, which is the point of doing it.
3. **`sw.js`** — add `"analytics.js"` to `SHELL` and bump `CACHE`. Then run
   `python3 tools/check-shell.py`. CLAUDE.md gotcha 1: one missing SHELL path blocks
   **all** updates app-wide with no error anywhere.
4. **`package.json`** — add `analytics.js` to the `copyweb` file list. It is an
   explicit list (`package.json:7`), so a file missing from it never reaches `www/`
   or the iOS bundle and the native build silently ships without analytics.
5. **`app.js`** — the call sites in §3.
6. **`privacy.html` + `APP_STORE_LISTING.md` §8** — the compliance gate in §2.
7. **Supabase SQL editor** — paste §7 and run it. Until then every POST 404s and
   the client drops each batch after 3 tries. Rows fired before that are not lost
   in the funnel sense: when the poison guard finally discards a 404'd batch it
   hands the once-per-install marks back, so `first_focus_completed` and friends
   fire again on the next real one rather than being missing forever.

---

## 6. Founder metrics

Each query is self-contained so any one can be pasted into the Supabase SQL editor
on its own. Every one returns raw counts alongside percentages, because with the
current sample size the counts are the honest number (§1).

### 6.1 Onboarding → first focus conversion

```sql
with d as (
  select device,
         bool_or(name = 'first_open')            as opened,
         bool_or(name = 'onboarding_started')    as onb_started,
         bool_or(name = 'onboarding_completed')  as onb_done,
         bool_or(name = 'first_focus_started')   as focus_started,
         bool_or(name = 'first_focus_completed') as focus_done
  from public.app_events
  group by device
)
select
  count(*) filter (where opened)                                                        as installs,
  count(*) filter (where onb_started)                                                   as onboarding_started,
  count(*) filter (where onb_done)                                                      as onboarding_completed,
  count(*) filter (where focus_started)                                                 as first_focus_started,
  count(*) filter (where focus_done)                                                    as first_focus_completed,
  round(100.0 * count(*) filter (where onb_done)
        / nullif(count(*) filter (where onb_started), 0), 1)                            as pct_finished_onboarding,
  round(100.0 * count(*) filter (where focus_started)
        / nullif(count(*) filter (where onb_done), 0), 1)                               as pct_onboarded_to_focus_start,
  round(100.0 * count(*) filter (where focus_done)
        / nullif(count(*) filter (where onb_done), 0), 1)                               as pct_onboarded_to_focus_done
from d;
```

The headline number is `pct_onboarded_to_focus_done`: of the people who finished the
7-slide story onboarding, how many ever finished one focus session. Note the shape
of the funnel it is measuring — 16 steps on web and 17 on iPhone before the first
Start press (GROUNDING.md §6), which is what Priority 6 in the ledger exists to fix.

### 6.2 First-focus completion rate

Per device, the one that matters for activation:

```sql
with d as (
  select device,
         bool_or(name = 'first_focus_started')   as started,
         bool_or(name = 'first_focus_completed') as completed
  from public.app_events
  group by device
)
select count(*) filter (where started)   as devices_started_first_focus,
       count(*) filter (where completed) as devices_completed_first_focus,
       round(100.0 * count(*) filter (where completed)
             / nullif(count(*) filter (where started), 0), 1) as pct_completed
from d;
```

Per session, weekly, with abandonment and the blocking split:

```sql
select date_trunc('week', ts)::date                       as week,
       count(*) filter (where name = 'session_started')   as started,
       count(*) filter (where name = 'session_completed') as completed,
       count(*) filter (where name = 'session_abandoned') as abandoned,
       count(*) filter (where name = 'session_completed' and blocking)     as completed_with_shield,
       count(*) filter (where name = 'session_completed' and not blocking) as completed_no_shield,
       round(100.0 * count(*) filter (where name = 'session_completed')
             / nullif(count(*) filter (where name = 'session_started'), 0), 1) as pct_completed
from public.app_events
where name in ('session_started', 'session_completed', 'session_abandoned')
group by 1
order by 1;
```

### 6.3 D1 / D7 / D30 retention

Cohort = install date. Return = any event stamped with that `cohort_day`. The
immature-cohort columns are nulled rather than reported as zero, because a cohort
installed four days ago cannot have a D7 and averaging a structural zero into the
number is how retention gets understated.

```sql
with cohort as (
  select device,
         coalesce(min(ts) filter (where name = 'first_open'), min(ts))::date as install_date
  from public.app_events
  group by device
),
days as (
  select distinct device, cohort_day from public.app_events
)
select c.install_date,
       count(distinct c.device)   as installs,
       count(distinct d1.device)  as returned_d1,
       count(distinct d7.device)  as returned_d7,
       count(distinct d30.device) as returned_d30,
       case when current_date - c.install_date >= 1 then
         round(100.0 * count(distinct d1.device)  / nullif(count(distinct c.device), 0), 1) end as d1_pct,
       case when current_date - c.install_date >= 7 then
         round(100.0 * count(distinct d7.device)  / nullif(count(distinct c.device), 0), 1) end as d7_pct,
       case when current_date - c.install_date >= 30 then
         round(100.0 * count(distinct d30.device) / nullif(count(distinct c.device), 0), 1) end as d30_pct
from cohort c
left join days d1  on d1.device  = c.device and d1.cohort_day  = 1
left join days d7  on d7.device  = c.device and d7.cohort_day  = 7
left join days d30 on d30.device = c.device and d30.cohort_day = 30
group by c.install_date
order by c.install_date;
```

All-cohorts roll-up (only mature cohorts count toward each column):

```sql
with cohort as (
  select device,
         coalesce(min(ts) filter (where name = 'first_open'), min(ts))::date as install_date
  from public.app_events
  group by device
),
days as (select distinct device, cohort_day from public.app_events)
select
  count(*) filter (where current_date - install_date >= 1)  as eligible_d1,
  count(*) filter (where current_date - install_date >= 1
                     and exists (select 1 from days x where x.device = c.device and x.cohort_day = 1))  as kept_d1,
  count(*) filter (where current_date - install_date >= 7)  as eligible_d7,
  count(*) filter (where current_date - install_date >= 7
                     and exists (select 1 from days x where x.device = c.device and x.cohort_day = 7))  as kept_d7,
  count(*) filter (where current_date - install_date >= 30) as eligible_d30,
  count(*) filter (where current_date - install_date >= 30
                     and exists (select 1 from days x where x.device = c.device and x.cohort_day = 30)) as kept_d30
from cohort c;
```

`cohort_day` is derived from the **device's local clock**, so a user who changes
their date changes their own cohort day. That is noise, not fraud, and it is the
price of retention that survives offline flush lag.

### 6.4 Completed focus minutes per activated user

Activated = the device has a `first_focus_completed`. Mean and median are both
reported: with a handful of devices, one heavy user moves the mean and tells you
nothing about the typical one.

```sql
with activated as (
  select distinct device from public.app_events where name = 'first_focus_completed'
),
mins as (
  select device,
         sum(actual_minutes) as minutes,
         count(*)            as sessions
  from public.app_events
  where name = 'session_completed' and actual_minutes is not null
  group by device
)
select count(*)                                       as activated_users,
       coalesce(sum(m.minutes), 0)                    as total_completed_minutes,
       round(avg(coalesce(m.minutes, 0)), 1)          as mean_minutes_per_activated_user,
       percentile_cont(0.5) within group (order by coalesce(m.minutes, 0)::double precision) as median_minutes,
       percentile_cont(0.9) within group (order by coalesce(m.minutes, 0)::double precision) as p90_minutes,
       round(avg(coalesce(m.sessions, 0)), 2)         as mean_completed_sessions
from activated a
left join mins m using (device);
```

Cross-check against the older counter — the two are independent code paths and
should be in the same ballpark; a large gap means one of them is mis-wired:

```sql
select (select sum(minutes) from public.drink_events)                                  as drink_events_minutes,
       (select sum(actual_minutes) from public.app_events where name='session_completed') as app_events_minutes;
```

### 6.5 Partner discovery

```sql
select coalesce(partner_id, '(none)')                                     as partner_id,
       count(distinct device) filter (where name = 'partner_discovered')  as devices_discovered,
       count(distinct device) filter (where name = 'offer_viewed')        as devices_viewed_offer,
       count(*)               filter (where name = 'offer_viewed')        as offer_views
from public.app_events
where name in ('partner_discovered', 'offer_viewed')
group by 1
order by devices_discovered desc;
```

Reach — what share of all devices ever saw a partner at all:

```sql
select count(distinct device)                                                    as devices_total,
       count(distinct device) filter (where name = 'partner_discovered')         as devices_that_saw_a_partner,
       count(distinct device) filter (where name = 'progress_viewed')            as devices_that_saw_progress,
       round(100.0 * count(distinct device) filter (where name = 'partner_discovered')
             / nullif(count(distinct device), 0), 1)                             as pct_reach
from public.app_events;
```

The two live partners are U Tea (10% off your drink) and Dream Tea & Poké (5% off
your drink), both at 240 cumulative focus minutes (`partners.json:27-44`). Partner
list membership is a `partners.json` fact, never something to infer from this table.

### 6.6 Reward issuance

Only meaningful once `reward_issued` has a real call site (§3).

```sql
select date_trunc('week', ts)::date as week,
       count(*)                     as rewards_issued,
       count(distinct device)       as devices_issued
from public.app_events
where name = 'reward_issued'
group by 1
order by 1;
```

Share of activated users who ever earned one, and how many each:

```sql
with activated as (
  select distinct device from public.app_events where name = 'first_focus_completed'
),
issued as (
  select device, count(*) as n from public.app_events where name = 'reward_issued' group by device
)
select count(*)                                        as activated_users,
       count(i.device)                                 as ever_issued_a_reward,
       round(100.0 * count(i.device) / nullif(count(*), 0), 1) as pct_ever_issued,
       round(avg(coalesce(i.n, 0)), 2)                 as mean_rewards_per_activated_user,
       max(coalesce(i.n, 0))                           as max_rewards_one_device
from activated a
left join issued i using (device);
```

`max_rewards_one_device` is a data-quality tripwire, not a success metric. 240
minutes is four hours of wall clock, so a device with a large count either studies
a great deal or has a forged `bobaFocusCollection` (GROUNDING.md D2, reproduced live:
one localStorage write yielded 416 rewards ready).

### 6.7 Reward redemption

```sql
select coalesce(partner_id, '(none)')                                      as partner_id,
       count(*) filter (where name = 'redemption_started')                 as started,
       count(*) filter (where name = 'redemption_completed')               as completed,
       count(*) filter (where name = 'redemption_failed')                  as failed,
       count(distinct device) filter (where name = 'redemption_completed') as devices_completed,
       round(100.0 * count(*) filter (where name = 'redemption_completed')
             / nullif(count(*) filter (where name = 'redemption_started'), 0), 1) as pct_started_to_completed
from public.app_events
where name in ('redemption_started', 'redemption_completed', 'redemption_failed')
group by 1
order by completed desc;
```

Failure reasons:

```sql
select coalesce(props->>'reason', '(unset)') as reason,
       coalesce(partner_id, '(none)')        as partner_id,
       count(*)                              as failures
from public.app_events
where name = 'redemption_failed'
group by 1, 2
order by failures desc;
```

`started` minus `completed` is the "Not now" gap and it is worth watching, because
in v1 the counter card can be opened unlimited times and "Not now" consumes nothing
(GROUNDING.md D1). A large gap on one partner is the shape that defect makes in the
data. It is a signal to investigate, **not** evidence of abuse.

### 6.8 Share-to-install performance

Aggregate only. There is no join key between a share and an install, by design (§3).

```sql
with map(share_event, source) as (values
  ('focus_card_shared',   'share_focus'),
  ('reward_card_shared',  'share_reward'),
  ('squad_invite_shared', 'share_squad')
),
s as (
  select name, count(*) as shares, count(distinct device) as sharers
  from public.app_events
  where name in ('focus_card_shared', 'reward_card_shared', 'squad_invite_shared')
  group by name
),
i as (
  select props->>'source' as src, count(distinct device) as installs
  from public.app_events
  where name = 'install_link_opened'
  group by 1
)
select m.share_event,
       coalesce(s.shares, 0)   as shares,
       coalesce(s.sharers, 0)  as sharers,
       coalesce(i.installs, 0) as installs_attributed,
       round(coalesce(i.installs, 0)::numeric / nullif(s.shares, 0), 3) as installs_per_share
from map m
left join s on s.name = m.share_event
left join i on i.src  = m.source;
```

Three things this cannot do, all of which must be said out loud whenever it is quoted:

1. **It reads zero today.** Nothing in the app builds a shareable link (GROUNDING.md
   D18). A zero here is a missing feature, not a measured failure.
2. **It undercounts even once links ship.** The App Store hop drops referrers, and
   `get/index.html:81-82` forwards `?src=` into Apple's `ct=` token, which is Apple's
   number and not this table's. Anything not attributed lands nowhere.
3. **It never matches a specific share to a specific install.** Aggregate buckets
   only, on purpose.

### 6.9 Merchant redemption totals

**Read §1 before showing this to a shop.** This is a count of in-app taps, self
reported by the app. It is not proof a discount was honoured, not a sale, not
revenue, and it cannot distinguish a first-time visitor from a regular.

```sql
select partner_id,
       date_trunc('month', ts)::date as month,
       count(*)                      as redemptions_reported,
       count(distinct device)        as devices,
       min(ts)::date                 as first_reported,
       max(ts)::date                 as last_reported
from public.app_events
where name = 'redemption_completed' and partner_id is not null
group by 1, 2
order by 1, 2;
```

Lifetime per shop:

```sql
select partner_id,
       count(*)               as redemptions_reported,
       count(distinct device) as devices
from public.app_events
where name = 'redemption_completed' and partner_id is not null
group by 1
order by redemptions_reported desc;
```

An honest sentence to a merchant looks like: *"Students told the app they used the
U Tea perk N times, across M devices, since <date>."* Not "we drove N visits" and
not "we drove N sales."

### 6.10 Data quality

Run these before trusting anything above.

```sql
-- Duplicate client ids. Must be 0; the unique constraint makes it structural.
select count(*) as duplicate_event_ids
from (select event_id from public.app_events group by event_id having count(*) > 1) x;

-- Flush lag, in seconds. A large p95 means offline batching, which is fine;
-- it is only a problem if anything is keyed on created_at instead of ts.
select round(avg(extract(epoch from created_at - ts))::numeric, 1) as mean_lag_s,
       round(percentile_cont(0.95) within group (
         order by extract(epoch from created_at - ts))::numeric, 1) as p95_lag_s
from public.app_events;

-- Outlier devices: dev builds, the 7-tap dev unlock (GROUNDING.md D10), test rigs.
select device, count(*) as events, min(ts)::date as first_seen, max(ts)::date as last_seen
from public.app_events
group by device
order by events desc
limit 20;

-- Devices with events but no first_open. This should be 0, and it is a wiring
-- check, not a cohort filter: a row can only exist without first_open if some
-- caller reached track() before analytics.js init ran, or the queue lost the
-- first_open row. It does NOT find installs that predate the module. See the
-- release-week spike caveat under this block.
select count(*) as devices_missing_first_open
from (
  select device from public.app_events
  group by device having bool_or(name = 'first_open') = false
) x;

-- Which build is sending. 'analytics-1' is the module's own version and means
-- the MRTAP_VERSION line (§5 step 2) is not in that client's index.html, so the
-- app build is genuinely unknown for those rows rather than mislabelled. If
-- every row reads 'analytics-1', that is the answer: nobody wired step 2.
select app_version, platform, count(distinct device) as devices, count(*) as events
from public.app_events
group by 1, 2
order by devices desc;
```

**The release week will look like an install spike, and there is no query that
can undo it.** Every existing install has an empty `bobaAnalyticsOnce` map the
first time it loads a build carrying `analytics.js`, so it fires `first_open`
like a brand-new device, and `installDateKey()` stamps that same day as its day
0. A phone that has had Mr. Tapioca since July is indistinguishable from one that
installed this morning. Nothing on the device knows better: the module has no
prior state to read and `metrics.js` never wrote an install date.

What to do about it: treat the cohorts whose day 0 falls in the first week after
the release as contaminated and exclude them from §6.1 and §6.3 by date, using
the release date you actually shipped on. Do not reach for the
`devices_missing_first_open` query above; it returns 0 in this case, correctly,
because these devices do send `first_open`. From the second week on the cohorts
are clean. Cross-check against `drink_events` if you want a floor on how many of
those devices are old: a device id already in `drink_events` before release week
was not a new install.

---

## 7. SQL — `public.app_events`

House style of `supabase-setup.sql` §18. Append this to `supabase-setup.sql` as
section 19, or paste it straight into the Supabase SQL editor.

**Re-running it is safe.** Every statement is either `if not exists`, a
`revoke`/`grant`, or preceded by its own `drop ... if exists`. That matters
because §8 limitation 1 is that nobody has run this yet, and the person who runs
it first is the person most likely to hit an unrelated error and paste the whole
block again. The one line that can still fail on a fresh project is the
`cron.schedule` at the end, and only when pg_cron is not turned on. See the note
above it.

```sql
-- 19. PRODUCT ANALYTICS — app_events (analytics.js) --------------------------
--   Activation, focus, retention, reward and growth events, so the funnel
--   questions §18's drink counter cannot answer have an answer. Clients may
--   only INSERT; read the numbers in the dashboard with your owner login.
--
--   PRIVACY: no name, email, location, Screen Time app identity, or advertising
--   identifier is collectable here. `device` is the same random per-install id
--   metrics.js mints (bobaMetricsDevice) and links to nothing. There is no
--   free-text column: every string is an enum or a slug. `props` is a bounded
--   jsonb for the low-cardinality extras. No price or amount column exists, on
--   purpose — this table must never become a revenue ledger.
--
--   Best-effort and client-forgeable, exactly like drink_events: fine for
--   product decisions, NEVER for money or partner discounts (see the FUTURE
--   HARDENING note above §18).
create table if not exists public.app_events (
  id          bigint generated always as identity primary key,
  -- Client-generated, unique. This is what makes a retried flush idempotent:
  -- a batch that committed but whose response was lost is re-sent and lands as
  -- ON CONFLICT DO NOTHING instead of double-counting the funnel.
  event_id    uuid        not null unique,
  created_at  timestamptz not null default now(),
  -- ts is the CLIENT's event time; created_at is the server's receive time. They
  -- differ by however long the device was offline. Every query in METRICS-SPEC.md
  -- uses ts (or cohort_day) for behaviour and created_at only for plumbing.
  ts          timestamptz not null check (ts >= timestamptz '2026-01-01 00:00:00+00'
                                      and ts <  timestamptz '2100-01-01 00:00:00+00'),
  device      text not null check (char_length(device) between 8 and 64),
  -- Closed list. A migration is the price of a new event name, and it buys
  -- immunity from a buggy client polluting every GROUP BY with typos.
  name        text not null check (name in (
                'first_open','onboarding_started','onboarding_completed',
                'screentime_explainer_viewed','permission_granted','permission_denied',
                'apps_selected','first_focus_started','first_focus_completed',
                'session_started','session_completed','session_abandoned',
                'daily_goal_completed','streak_continued','return_day','quest_completed',
                'partner_discovered','offer_viewed','progress_viewed','reward_issued',
                'redemption_started','redemption_completed','redemption_failed',
                'focus_card_shared','reward_card_shared','squad_invite_shared',
                'install_link_opened',
                'cosmetic_viewed','purchase_initiated','purchase_completed','restore_completed'
              )),
  -- Days since install, computed on the device in LOCAL time and stamped at
  -- track() time. Retention must not be derived from created_at: a row queued
  -- offline and flushed three days later would otherwise change cohorts.
  cohort_day  int  not null check (cohort_day between 0 and 3650),
  platform    text not null check (platform in ('ios','web')),
  -- The default is only for a row inserted by hand. analytics.js always sends a
  -- value: the build from window.MRTAP_VERSION (§5 step 2), or its own
  -- MODULE_VERSION ('analytics-1') when that line was never added.
  app_version text not null default 'unknown' check (char_length(app_version) between 1 and 24),
  -- The four fields the founder metrics actually SUM and GROUP BY get real typed
  -- columns with real bounds, so one bad client cannot poison a total. Everything
  -- else rides in props.
  planned_minutes int     check (planned_minutes between 1 and 1440),
  actual_minutes  int     check (actual_minutes  between 0 and 1440),
  blocking        boolean,
  partner_id      text    check (partner_id ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'),
  -- Bounded on purpose. length(props::text) is immutable (jsonb_out then length),
  -- unlike pg_column_size, which is not allowed in a CHECK.
  props       jsonb not null default '{}'::jsonb check (length(props::text) <= 1024)
);

alter table public.app_events enable row level security;
revoke all on public.app_events from public, anon, authenticated;
grant insert on public.app_events to anon, authenticated;
-- Insert-only by design: no select/update/delete policy exists, so the public key
-- can add rows but never read, change or remove them. RLS is enabled but NOT
-- forced, same as drink_events — forcing it would lock the table owner out of the
-- dashboard reads that are the entire point of collecting this.
--
-- The drop is what makes a second paste safe. Postgres has no CREATE POLICY IF
-- NOT EXISTS at any version, so a bare create fails with 42710 the second time,
-- and the second time is likely: whoever runs this first is exactly the person
-- who will hit an unrelated error and paste the block again. Same shape as the
-- policies in supabase-setup.sql:117-138.
drop policy if exists app_events_insert on public.app_events;
create policy app_events_insert on public.app_events
  for insert to anon, authenticated with check (true);

-- Two indexes because every query in METRICS-SPEC.md §6 filters on name and time,
-- or groups by device and cohort day. Without them the retention query is a full
-- scan per cohort.
create index if not exists app_events_name_ts_idx    on public.app_events (name, ts);
create index if not exists app_events_device_day_idx on public.app_events (device, cohort_day);
create index if not exists app_events_partner_idx    on public.app_events (partner_id, ts)
  where partner_id is not null;

-- Retention: 400 days is D365 plus slack, and it bounds how long an anonymous
-- per-install id lives on the server. Keyed on created_at, NOT ts — ts is a client
-- assertion and a device with a far-future clock would otherwise never be pruned.
--
-- NEEDS pg_cron, which is off by default. Enable it at Dashboard > Database >
-- Extensions (supabase-setup.sql:16 says the same for §17's jobs). Without it
-- this one statement errors and everything above it is already committed, which
-- is fine: the table works, but nothing prunes it, so the "400 days" promise in
-- §2 does not exist until you either enable pg_cron and re-run this line or run
-- the delete by hand. Skipping it is safe at this data volume; forgetting you
-- skipped it is not, so it is written down in §8.
select cron.schedule('prune_app_events', '41 4 * * *', $cron$
  delete from public.app_events where created_at < now() - interval '400 days';
$cron$);

-- Quick totals for your dashboard:
--   select count(*) as events, count(distinct device) as devices,
--          min(ts)::date as first_event, max(ts)::date as last_event
--   from public.app_events;
```

---

## 8. Limitations a reader must know

1. **The SQL in §7 is parse-checked, not executed.** Every SQL block in this file,
   §6 and §7, was run through `tools/check-sql.py` on 2026-08-13 and came back
   clean (18 blocks, 0 problems; §7 is 10 statements). That tool wraps libpg_query,
   which is Postgres's own grammar, so a syntax error would have shown up. It
   cannot catch a missing table, a wrong column name or an RLS mistake, because
   those need a live catalog. Nothing has been run against a real database. Until
   §7 is run in the Supabase editor, every POST 404s and `analytics.js` drops each
   batch after three tries — the app is unaffected, the data is simply not
   collected, and the once-per-install marks are handed back so the funnel events
   can fire again after the table exists.
2. **`ON CONFLICT DO NOTHING` under RLS with insert-only grants is reasoned, not
   executed.** `DO NOTHING` needs only the INSERT privilege (unlike `DO UPDATE`,
   which needs SELECT), so the grants in §7 should be sufficient. The client does
   not depend on it: a `409` is treated as success, so a retry is idempotent either
   way. Confirm on the first real run.
3. **`analytics.js` is not wired in.** No `<script>` tag, no `MRTAP_VERSION`, no
   `sw.js` SHELL entry, no `package.json` copyweb entry, no `app.js` call sites. §5.
4. **`app_version` says `analytics-1` until §5 step 2 is done.** The module has no
   way to learn the build on its own, so the version is handed in by one line of
   `index.html`. Skipping it costs exactly one thing: §6.10's by-build query has a
   single value to group on, so it cannot tell you whether a given release
   actually shipped the module. `platform` still separates `ios` from `web`.
5. **The release week reads as an install spike, and no query can undo it.** Every
   install that predates the module fires `first_open` on its first load and gets
   that day as its cohort day 0. Exclude the first week's cohorts by date. §6.10.
6. **Everything here is a client assertion.** Same trust model as `drink_events`.
   §1.
7. **`reward_issued` and `install_link_opened` have no honest call site today.** §3.
8. **Retention is device-local-clock derived.** §6.3.
9. **A crash between the queue write and the dedup write costs a duplicate row.**
   That is the deliberate trade for never losing a funnel row outright; §4 has the
   reasoning and the §6 queries absorb it. The queue caps are still caps: with
   larger `props` the 64 KB bound bites before the 200-row one, so 200 is a
   ceiling and not a guarantee.
10. **The `cron.schedule` in §7 needs pg_cron turned on.** If it is not, that one
    statement errors, the table is still fine, and the 400-day retention promise in
    §2 does not exist until you enable the extension and re-run the line.
11. **The compliance gate in §2 is a blocker, not a note.**
