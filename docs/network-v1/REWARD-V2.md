# Reward V2: deployment and contract

The single document to read before setting `window.MRTAP_FLAGS.rewardV2 = true`.
`config.js:29` points here by name, and `supabase-reward-v2.sql:669` defers the
rate-limit question here.

**Status as of 2026-08-13.** Flag OFF (`config.js:31`). Migration written, never
executed. `partners.json` declares no `rewardPolicy`, so `reward-config.js` reports
`policyState: "undeclared"` and issuance would stay off even with the flag up.
Nothing in this system has ever touched the live database or a real counter.

**Release context.** Version 1.1.0 is in App Store review. The partner-reward
system is the build after it, on purpose. The reviewing build does not contain
`reward-config.js` or `reward-v2.js`, and that is the plan, not a gap. Every step
below that touches an iPhone belongs to the next build.

**A note on line numbers.** Citations into `GROUNDING.md` are exact. The `app.js`
line numbers that `GROUNDING.md` quotes are from its 2026-08-12 inspection snapshot
and `app.js` has changed since (its `perkMinMinutes` is at `app.js:4633` today,
`GROUNDING.md:20` records it at `app.js:4578-4582`). Trust the `GROUNDING.md`
anchors; re-grep before trusting an `app.js` number.

---

## 1. What problem this solves

Six v1 defects, all live today with two real signed shops.

| # | Defect | Anchor |
|---|--------|--------|
| 1 | **Perks are derived from unsigned localStorage.** `bobaFocusCollection` is read with an `Array.isArray` check and nothing else, then reduced over `drink.minutes` with no cap and no cross-check. **Measured in a live browser:** one write of `[{minutes:100000}]` produced `perksEarnedTotal()` 416, `earnedPerkCount()` 416, the banner "416 rewards ready. U Tea gives 10% off your drink.", and an enabled confirm button. The same write mints 6,666 pearls. | `GROUNDING.md:50`, `GROUNDING.md:449-451` (D2) |
| 2 | **Redemption is confirmed by the student.** Redeemed count is a bare array length; spendable is `max(0, earned - redeemed)`; "Use one reward" appends `{at, shop, perk}` to that array and saves. The barista is a witness, not a party. No network call carries redemption data. | `GROUNDING.md:22`, `:23`, `:29`, `:32`, `:446-448` (D1) |
| 3 | **"Not now" consumes nothing.** The dismiss path is a `<form method="dialog">` submit whose close handler does one `clearInterval`. A student who banks one perk in four hours can present an identical fully-lit card at U Tea every day forever and tap "Not now" each time. | `GROUNDING.md:28`, `:446-448` (D1) |
| 4 | **The card renders at full strength at a zero balance.** Only the confirm button is disabled and one CSS rule dims the perk chip at 45% opacity. Shop name, perk text and the ticking clock render identically whether the balance is 0 or 416. | `GROUNDING.md:25`, `:26` (`styles.css:3124-3125`), `:446-448` |
| 5 | **One global `Math.min` bar.** The eligibility bar is the minimum `minMinutes` across live partners, applied to every shop. Sign a third shop at 60 minutes and U Tea's 240-minute offer becomes redeemable after one hour, for everyone, without anyone deciding that. Lowering the bar also retroactively re-scores lifetime history, and raising it can clamp a user with banked rewards to zero with no explanation. | `GROUNDING.md:20`, `:126-148` (§3), `:461-462` (D6) |
| 6 | **Deleting `bobaFocusPerkRedemptions` replays every perk already handed over a counter.** `readJSON` returns `[]` on null and the boot `saveState()` cements it, so the reset is permanent, not transient. | `GROUNDING.md:51`, `:452-453` (D3) |

Two structural facts that shape the fix:

- **No integrity protection exists anywhere in v1.** A grep for
  `hmac|checksum|tamper|signature|integrity` across `app.js`, `squad-cloud.js`,
  `metrics.js` and `supabase-setup.sql` returns one unrelated hit
  (`GROUNDING.md:62`).
- **The only server-side identity is the anonymous Supabase `auth.users.id`.**
  There is no email, phone, DeviceCheck, receipt or StoreKit identifier persisted
  server-side, so any server-side reward has to hang off the anonymous uid
  (`GROUNDING.md:184`, `:186`).

Reward V2 does not harden `profiles.focus_minutes`. It leaves that column as the
soft client-pushed leaderboard stat it is and adds a separate append-only
server-clock ledger that merchant rewards hang off
(`supabase-reward-v2.sql:4-14`). Pearls and cosmetics never read the new ledger;
a real discount never reads the old column.

---

## 2. The data model

Seven tables in `supabase-reward-v2.sql`. All are RLS-on. Only two are readable by
a client; the rest are reachable only through security-definer RPCs.

### 2.1 `reward_policies` (`:48-60`)

The written-down answer to "how much focus buys a reward, and is that bar shared
across shops or owned by one shop?".

| Column | Notes |
|---|---|
| `id` | text PK, slug regex `^[a-z0-9][a-z0-9-]{1,62}$` |
| `kind` | `global_passport` or `partner_specific` |
| `required_minutes` | 15 to 1440 |
| `partner_id` | names the shop for `partner_specific`; must be NULL for `global_passport` |
| `expires_days` | 1 to 3650, or NULL for no expiry |
| `active` | false stops issuance under this policy |

The `check ((kind = 'partner_specific') = (partner_id is not null))` at `:59` is
what makes the two kinds impossible to mix up at the row level. Readable by `anon`
and `authenticated` (`:101-103`).

### 2.2 `partners` (`:73-91`)

The server's authoritative copy of what a shop agreed to. `partners.json` stays the
human-edited source of truth and the map's display list; the server copy is what a
redemption is checked against.

| Column | Notes |
|---|---|
| `id`, `name`, `address`, `market` | identity and display |
| `active` | **false is a pause**, not a removal: redemptions are refused, the shop stays on the map (`:78`) |
| `offer_text` | what staff honour, 1 to 200 chars |
| `offer_version` | **load-bearing** (`:68-72`). A reward is issued against the offer live when it was earned; redemption checks the version has not moved. Bump it whenever `offer_text` changes and a student holding the old wording is told the offer changed rather than being handed something the shop never agreed to |
| `policy_id` | FK to `reward_policies` |
| `per_user_limit`, `pilot_cap` | optional caps, NULL means the shop set no limit |
| `valid_days`, `valid_from_minute`, `valid_to_minute` | optional redemption window local to the shop |
| `cashier_note` | free text shown on the verification page |

Readable by `anon` and `authenticated` (`:97-99`), because it is the same data
already public in `partners.json` and the app needs a bar and an offer without an
RPC round trip per shop.

### 2.3 `reward_sessions` (`:112-127`)

One row per focus session allowed to count toward a merchant reward. Append-only,
server clock.

| Column | Notes |
|---|---|
| `id` | uuid PK, **supplied by the client as the idempotency key**. A retried start reuses the same uuid and gets the same row back instead of opening a second session (`:108-111`) |
| `started_at`, `ended_at` | server clock, never the client's (`:115`) |
| `planned_minutes` | 5 to 480 |
| `credited_minutes` | set only on completion: `least(planned, actual elapsed)`, so a session can never credit more time than really passed nor more than it asked for (`:118-120`) |
| `platform` | `ios` or `web`. **Client assertion** |
| `shield_claimed` | **Client assertion** |
| `state` | `active`, `completed`, `abandoned` |

### 2.4 `reward_instances` (`:141-167`)

A reward the user actually holds. Issued by the server, never by the client.

`seq` is the nth reward this user has earned under this policy. `minutes_basis`
records eligible minutes at issuance. `offer_version` records the version live when
earned. `redeemed_offer_text` (`:158-166`) snapshots the offer **wording** at the
moment it was honoured, because `partners.offer_text` is mutable and holds only
today's wording, so a report built from a join would silently relabel every
historical redemption with the current offer.

### 2.5 `redemption_handoffs` (`:184-192`)

The cashier-facing half. `code` is the PK with a `^[A-Z2-9]{6}$` check, minted per
handoff, with `expires_at` five minutes out and a `consumed_at` burn. **A handoff is
not a redemption** (`:182-183`). The code is what makes the screen hard to fake with
a screenshot: server-issued, different every time, and it stops working on its own.

### 2.6 `redemption_events` (`:201-213`)

Every outcome including the failures, across ten `outcome` values. A pilot report
that only counted successes could not answer "did anything go wrong at the
counter", which is the first thing a shop asks. Carries `user_id` so unique and
repeat redeemers are countable. No name, no email, no location.

### 2.7 `code_rate` (`:661-665`)

Declared and deliberately not wired. Supabase does not expose a client IP to SQL by
default, so the limit belongs in the verification page's edge function or the
dashboard's API rate limits (`:667-669`). Documented rather than faked.

### 2.8 Which guarantee comes from which database feature

| Guarantee | Mechanism | Line |
|---|---|---|
| **One active session per user** | The **partial unique index** `reward_sessions_one_active on public.reward_sessions (user_id) where (state = 'active')`. It is in the database rather than as a check inside the RPC so two simultaneous starts cannot both win. `start_reward_session` catches the `unique_violation` and refuses rather than merging, because overlapping sessions are the cheapest way to farm minutes | `:130-133`, caught at `:319-322` |
| **Exactly one reward per (user, policy, seq)** | The **unique index** `reward_instances_seq on (user_id, policy_id, seq)`, plus `on conflict (user_id, policy_id, seq) do nothing` in the issue loop. Two racing issue calls both try to insert `seq=3` and exactly one succeeds; the loser is a lost insert, not a duplicate reward | `:169-170`, `:266-271` |
| **Exactly one redemption per reward, under simultaneous requests** | The **conditional UPDATE**: `update public.reward_instances r set status = 'redeemed' ... where r.id = v_h.reward_id and r.status = 'issued'`, then `get diagnostics v_hit = row_count` and a zero-row branch that reports `failed_already_redeemed`. Postgres takes a row lock on the matching reward and re-checks `status = 'issued'` under that lock, so there is no read-then-write window to race | `:593-598`, zero-row branch `:600-605`, rationale `:546-551` |
| **A code cannot be presented twice** | `consumed_at` is stamped in the same transaction as the redemption, so the same slip of paper fails even if a second reward exists on the account | `:607-609` |
| **A code cannot be reused after five minutes** | `expires_at = now() + interval '5 minutes'` at mint, checked in both `redeem_by_code` and `check_code` | `:528`, `:575`, `:644` |

### 2.9 Housekeeping

Two pg_cron jobs (`:720-726`): `prune_handoffs` at `'41 * * * *'` deletes handoffs
more than 7 days past expiry; `sweep_stale_sessions` at `'7 * * * *'` abandons
`active` sessions older than 12 hours with zero credit.

§13 (`:728-757`) is a commented-out, optional, unrelated fix to the
`gen_friend_code()` alphabet off-by-one in the live Squad schema (the alphabet is
32 characters, `n` is 31, so no friend code issued since launch contains a `9`).
It is left out of the migration on purpose. Nothing is broken; existing codes stay
valid. Run it only if you want it.

---

## 3. The RPC contract

Ten functions. Every one is `security definer` with `set search_path`. Execute is
revoked and re-granted explicitly, except where noted in 3.11.

### 3.1 `reward_eligible_minutes(p_user uuid) -> integer` (`:223-228`)

`language sql stable`. Sums `credited_minutes` over `reward_sessions` where
`user_id = p_user and state = 'completed' and platform = 'ios'`. Native only by
policy: a browser tab cannot block anything, so a web session is honest in-app
progress and is deliberately not redeemable (`:219-222`). Raises nothing.

### 3.2 `issue_my_rewards() -> table(...)` (`:234-280`)

Returns `(id uuid, policy_id text, partner_id text, seq integer, offer_version
integer, issued_at timestamptz, expires_at timestamptz, status text)`, every reward
this user holds, newest first.

Issues every reward the caller has earned and does not yet hold, **for every active
policy**. Entitlement is integer division: `v_entitled := v_minutes /
v_pol.required_minutes` (`:252`), so whole bars only. Safe to call as often as you
like; it is a no-op once caught up.

Failures: raises `not authenticated` (errcode `28000`) when `auth.uid()` is null
(`:248`). No other failure path.

Execute: `authenticated` only (`:281-282`).

### 3.3 `start_reward_session(p_session_id uuid, p_planned_minutes integer, p_platform text, p_shield boolean default false)` (`:288-327`)

Returns `table(id uuid, started_at timestamptz, state text, planned_minutes
integer)`.

Idempotent. Re-calling with the same `p_session_id` returns the existing row rather
than opening a second session (`:301-307`). Before inserting it sweeps the caller's
own `active` sessions older than 12 hours, because a session abandoned by an app
kill would otherwise block every future one through the one-active index
(`:309-314`).

| Failure | errcode | Line |
|---|---|---|
| `not authenticated` | `28000` | `:294` |
| `bad platform` (not `ios` or `web`) | `P0001` | `:295` |
| `planned_minutes out of range` (null, <5, >480) | `P0001` | `:296-298` |
| `not your session` (the id exists and belongs to someone else, a hard error so it never leaks whose) | `42501` | `:302-304` |
| `a focus session is already open` | `P0003` | `:319-322` |

All five are raised exceptions, not return values.

Execute: `authenticated` only (`:328-329`).

### 3.4 `complete_reward_session(p_session_id uuid, p_shield_held boolean default null)` (`:334-385`)

Returns `table(id uuid, state text, credited_minutes integer, eligible_minutes
integer)`.

Credit is computed in three steps: `v_elapsed` from the **server's** own
`started_at` (`:359`), then `v_credit := least(v_elapsed, planned_minutes)`
(`:371`), then clamped by a daily ceiling of 720 minutes minus what today already
used (`:373-377`, `DAILY_CAP` at `:344`).

| Outcome | Behaviour | Line |
|---|---|---|
| `not authenticated` | raises, errcode `28000` | `:346` |
| `no such session` | raises, errcode `P0002` | `:348` |
| `not your session` | raises, errcode `42501` | `:349` |
| already non-`active` | returns the same answer, no second credit. A double tap, a retry and a replayed request all land here | `:351-357` |
| elapsed <5 or >720 minutes | state becomes `abandoned`, `credited_minutes` 0. Under 5 real minutes is not a session; over 12 hours means the app was killed and the row is stale | `:361-369` |
| normal | state `completed`, credit as above | `:379-384` |

Execute: `authenticated` only (`:386-387`).

### 3.5 `my_reward_state() -> jsonb` (`:390-412`)

One call, no client arithmetic. Keys: `eligible_minutes`, `rewards[]` (`id`,
`policy_id`, `partner_id`, `seq`, `status`, `issued_at`, `expires_at`,
`offer_version`, `redeemed_at`, `redeemed_partner_id`), `policies[]` (`id`, `kind`,
`required_minutes`, `partner_id`, `expires_days`), active policies only.

Failure: raises `not authenticated`, errcode `28000` (`:394`).

Execute: `authenticated` only (`:413-414`).

### 3.6 `gen_handoff_code() -> text` (`:430-447`)

Internal helper for `open_redemption`. Not `security definer`, no explicit grant.
Alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, 32 characters with no `0/O/1/I` to
misread across a counter. 256 is exactly divisible by 32, so `b % 32` is already
uniform and no rejection sampling is needed (`:427-429`). Loops until it finds a
code with no live unconsumed handoff.

### 3.7 `open_redemption(p_reward_id uuid, p_partner_id text) -> jsonb` (`:453-540`)

Step 1 at the counter. Validates everything it can **before** the cashier is
involved, so a refusal happens on the student's screen rather than in front of a
queue. It does not consume anything: the reward is still redeemable if the student
walks away.

Success payload: `{ok: true, code, expires_at, server_time, partner_name,
offer_text, offer_version, cashier_note}` (`:534-539`). Reuses a live handoff with
more than 30 seconds left rather than minting a new code every time the sheet is
reopened, so the cashier is not looking at a code that changed mid-glance
(`:518-529`). Logs `opened` to `redemption_events` (`:531-532`).

Failure payload: `{ok: false, reason}`, and every refusal is logged with the same
reason (`:512-516`).

| `reason` | Cause | Line |
|---|---|---|
| `failed_not_found` | reward missing or not yours | `:470` |
| `failed_not_found` | partner id unknown | `:473` |
| `failed_not_found` | reward status is neither `issued` nor `redeemed` (that is, `void`) | `:476` |
| `failed_partner_paused` | `partners.active = false` | `:474` |
| `failed_already_redeemed` | reward status `redeemed` | `:475` |
| `failed_expired` | the reward's own `expires_at` has passed | `:477-478` |
| `failed_wrong_partner` | a partner-scoped reward presented at another shop | `:481-482` |
| `failed_wrong_partner` | a passport reward presented at a shop on a different policy | `:483-484` |
| `failed_offer_changed` | `reward.offer_version <> partners.offer_version`. The offer moved after the reward was earned; honouring the new wording would hand the shop a bill it never agreed to | `:485-488` |
| `failed_capped` | `per_user_limit` or `pilot_cap` reached | `:492-501` |
| `failed_capped` | today is not in `valid_days` | `:503-506` |
| `failed_capped` | now is outside `valid_from_minute`..`valid_to_minute` | `:507-510` |

Exception: `not authenticated`, errcode `28000` (`:467`).

Execute: `authenticated` only (`:541-542`).

### 3.8 `redeem_by_code(p_code text) -> jsonb` (`:555-617`)

**The only function in the system that consumes a reward, and it consumes exactly
one.** Input is upper-cased and trimmed (`:565`).

Success payload: `{ok: true, partner_name, offer_text, cashier_note, redeemed_at,
server_time}` (`:614-616`).

| `reason` | Cause | Line |
|---|---|---|
| `failed_not_found` | no such code (logged with no user or partner, because none is known) | `:566-569` |
| `failed_not_found` | reward status is `void` | `:578` |
| `failed_already_redeemed` | handoff already consumed | `:574` |
| `failed_already_redeemed` | reward already `redeemed` | `:577` |
| `failed_already_redeemed` | the conditional UPDATE matched zero rows, that is, someone else redeemed it between the check and the write | `:600-605` |
| `failed_code_expired` | handoff past its 5 minutes | `:575` |
| `failed_partner_paused` | `partners.active = false` | `:576` |
| `failed_expired` | the reward's own `expires_at` has passed | `:579-580` |
| `failed_offer_changed` | version mismatch | `:581-582` |

Failure payloads also carry `partner_name` and `offer_text` so the page can name the
shop while refusing (`:588-589`).

**Execute: `anon` and `authenticated`** (`:621-622`).

### 3.9 `check_code(p_code text) -> jsonb` (`:626-653`)

Read-only peek for the verification page, so a cashier sees VALID or ALREADY USED
before deciding to spend. `stable`. Returns no user identity.

Payload: `{ok, reason, partner_name, offer_text, cashier_note, server_time,
expires_at}`. `ok` is a single boolean expression over handoff state, reward status,
reward expiry, partner active and offer version (`:639-642`); `reason` is a `case`
covering `failed_already_redeemed`, `failed_code_expired`, `failed_expired`,
`failed_partner_paused`, `failed_offer_changed` (`:643-649`), plus
`failed_not_found` on an unknown code (`:631`).

Every refusal `redeem_by_code` can raise is reachable here too, deliberately
(`:634-637`). If the read-only check said VALID and the spend then refused, the
cashier would find out in front of a queue. The reward's own expiry and the offer
version are the easy ones to forget: a handoff code can be perfectly fresh while the
reward behind it is not.

**Execute: `anon` and `authenticated`** (`:654-655`).

### 3.10 `partner_report(p_partner_id text, p_days integer default 30) -> jsonb` (`:677-714`)

`language sql stable`. Window clamped to 1..365 days.

Keys: `partner_id`, `partner_name`, `window_days`, `offer_text`, `offer_version`,
`active`, `offers_honoured[]` (grouped by the wording actually honoured, so a shop
that changed its offer mid-pilot sees both lines with their own counts instead of
one line relabelled with today's wording), `redemptions`, `unique_redeemers`,
`repeat_redeemers`, `first_redemption`, `last_redemption`, `by_day[]`,
`rejected[]` (failure reasons with counts).

**Execute: revoked from `public`, `anon` AND `authenticated`** (`:717`). Owner only.
A shop gets a report from the founder, not a login, and this stays unreachable from
the publishable key until there is a merchant account model.

It cannot report revenue, incremental sales, average order value, first-time
visitors or ROI, because the product has never collected any of that (`:671-676`).

### 3.11 Who may execute what

| Function | `anon` | `authenticated` | Owner only |
|---|---|---|---|
| `reward_eligible_minutes(uuid)` | see note | see note | |
| `issue_my_rewards()` | no | yes | |
| `start_reward_session(uuid,integer,text,boolean)` | no | yes | |
| `complete_reward_session(uuid,boolean)` | no | yes | |
| `my_reward_state()` | no | yes | |
| `open_redemption(uuid,text)` | no | yes | |
| **`redeem_by_code(text)`** | **yes** | yes | |
| **`check_code(text)`** | **yes** | yes | |
| `partner_report(text,integer)` | no | no | yes |

**Why exactly those two are callable by `anon`:** the cashier has no account and
installs nothing (`:618-620`). The promise made to every shop is that there is
nothing to install and no login (`verify/index.html:19-22`). A barista opens a link
on the till browser or their own phone, types six characters, and gets one word.
That means the request arrives with the publishable key and no user, so both
functions have to be reachable by `anon`. **Holding an unexpired 6-character code IS
the credential**, which is why codes live 5 minutes and die on first use. The
verification page loads `../config.js` and calls both over PostgREST with that key
(`verify/index.html:437`, `:788-793`).

**Note on `reward_eligible_minutes`.** It is the one function in the file with **no
`revoke` and no `grant`** after its definition (`:228`, compare `:281`, `:328`,
`:386`, `:413`, `:541`, `:621`, `:654`, `:717`). It therefore keeps Postgres's
default `EXECUTE` to `PUBLIC`, and it is `security definer` taking an arbitrary
uuid. Consequence: anyone holding the publishable key can call
`reward_eligible_minutes('<some-uuid>')` and get back a minute total. It leaks one
integer for a uuid the caller would have to already know, and it writes nothing, so
it is not a redemption risk. It is still an unintended grant. **Decide before or
just after the migration run:** add
`revoke all on function public.reward_eligible_minutes(uuid) from public, anon;`
in the SQL editor, since it is only ever called from inside other definer functions
(`:249`, `:355`, `:367`, `:384`, `:395`) which run with the definer's rights
regardless. This document does not change the migration file.

---

## 4. The client

`reward-v2.js`, loaded from `index.html:795-796` after `config.js`,
`squad-cloud.js` and `metrics.js`. `reward-config.js` must load first because
`reward-v2.js` has no opinion about what a threshold means (`index.html:791-794`).
Both are precached in the `sw.js` SHELL (`sw.js:21-22`); `const CACHE` at `sw.js:10`
is bumped every release and is moving under active work, so re-grep it rather than
quoting a generation from this document.

### 4.1 The gate

`RewardV2.enabled` is `HAS_KEYS && flagOn()` (`reward-v2.js:50-51`). `flagOn()`
returns true for `MRTAP_FLAGS.rewardV2 === true` or a localStorage
`bobaRewardV2 === "on"` override (`:34-37`). The override exists so QA can exercise
this without editing `config.js`, and it can only turn the flag **on** for a client
that already has cloud keys, so it cannot conjure a backend that is not there.

With the gate closed the module returns at `:52`. `window.RewardV2` exists with
seven data keys and no methods.

### 4.2 Transport

`loadSupabase()` reuses `SquadCloud.client()` rather than signing in a second time
(`:92-103`). Two racing `signInAnonymously()` calls on a cold start would mint two
accounts and split one student's focus minutes across both, which surfaces to the
user as "my reward disappeared" (`:86-89`). `ownClient()` is the fallback and uses
the same pinned SDK version and the same localStorage session store, so it restores
the same anonymous user (`:105-125`).

Every server call funnels through `rpc()` (`:135-149`), which returns
`{ok:false, offline:true, ...}` for a transport failure and
`{ok:false, reason:"rpc_error", ...}` for a server refusal. It never throws into the
app and never silently succeeds. The distinction is what the queue depends on.

### 4.3 Session lifecycle

| Call | Behaviour | Line |
|---|---|---|
| `startSession(plannedMinutes)` | rounds, refuses <5 or >480, closes any locally-open session first (app kill mid-session would otherwise trip the server's one-active rule), writes `bobaRewardSession`, calls `start_reward_session`, sets `serverAck` only on success. **Returns false when the session will not earn merchant credit**, so the UI can say so honestly rather than promising progress that will not appear | `:200-232` |
| `completeSession()` | reads and removes `bobaRewardSession`, returns false immediately if `!serverAck` (never opened on the server means nothing to close and nothing was ever credited), calls `complete_reward_session`, enqueues **only on `res.offline`**, refreshes on success | `:238-257` |
| `refresh()` | flush, then `issue_my_rewards`, then `my_reward_state`. Issue before read so a threshold crossed by the completion that just landed is already a held reward by the time the UI renders | `:261-278` |
| `init()` | closes a session left open by an app kill, then refreshes. The server caps its credit at the minutes it asked for, so this cannot over-credit, and leaving it open would block the next session | `:349-357` |

### 4.4 The offline queue

`bobaRewardQueue`, bounded at `QUEUE_MAX = 50` so a dead network cannot grow it
forever (`:55-57`, `:174`). `enqueue` de-dupes on `(fn, key)` where `key` is the
session id, so a retry loop can never stack (`:169-176`). `flush` retries only items
that failed with `res.offline`; a server **refusal** is dropped, because replaying a
call the server already rejected just burns battery and floods the log (`:186-189`).
Flushed on the `online` event and on `visibilitychange` to visible (`:362-369`).

### 4.5 The asymmetry that matters

Only two calls are ever queued, and the difference between them is the whole
integrity story (`:151-166`).

**`complete_reward_session` is safe to replay late.** The server credits
`least(planned_minutes, elapsed since ITS OWN started_at)`
(`supabase-reward-v2.sql:371`, with `v_elapsed` computed from the row's own
`started_at` at `:359`). A completion that arrives three hours after the fact still
credits at most the minutes the session asked for. Arriving late cannot inflate
anything.

**`start_reward_session` is NOT backdated.** The server stamps `started_at` on
arrival (`supabase-reward-v2.sql:115`), so a start queued offline and flushed an
hour later would begin counting from the flush. The client therefore does not queue
starts at all. **A session whose start never reached the server earns no merchant
credit.** The user still gets their drink, their pearls, their streak and their
shelf entry, because all of those run off local state that this module does not
touch (`reward-v2.js:16-20`). Only the real-world discount, the one a business pays
for, requires the server to have watched the clock.

### 4.6 Redemption from the client

`openRedemption(rewardId, partnerId)` **fails closed** (`:317-326`). If the server
cannot be reached, the client does not know whether the reward is still unspent, so
it must not draw a valid card. `redeemByCode(code)` exists for the fallback where a
shop would rather the student tap it (`:328-339`); it hits the identical atomic RPC
either way. `checkCode(code)` is the read-only variant (`:342-346`).

---

## 5. What is proven and what is not

### 5.1 The migration has never been executed

There is no Postgres and no Docker on this machine (`LEDGER.md`, "Known limitations to state honestly" item 1). It is
syntax-verified and reviewed, not run.

Verified with the real Postgres grammar via `tools/check-sql.py`, which wraps
pglast/libpg_query (Postgres's own grammar compiled as a library) and checks the
**plpgsql function bodies** too, which a plain statement parse skips (to the outer
grammar a `$$...$$` body is just a string, so a typo in one is invisible until you
run it). Run 2026-08-13 against pglast v8.4:

```
OK   supabase-reward-v2.sql: 54 statements, 8 plpgsql bodies
OK   supabase-setup.sql: 61 statements, 7 plpgsql bodies

2 file(s), 0 problem(s)
```

A file that passes here will not fail on a syntax error in the dashboard. What it
**cannot** catch, from its own docstring (`tools/check-sql.py:24-26`): a missing
table, a wrong column name, a bad type, an RLS mistake, or anything else that needs
a live catalog.

pglast is not installed in the repo tree. That run used a virtualenv created outside
it. To reproduce in-tree: `python3 -m venv .sqlvenv && .sqlvenv/bin/pip install
pglast && .sqlvenv/bin/python tools/check-sql.py`.

### 5.2 The tests run against `reward-mock.js`, not Postgres

`reward-mock.js` is a second, independent implementation of exactly the RPC contract
above (`reward-mock.js:1-18`), with a settable clock so a test can advance four
hours without waiting four hours. Its RPC surface is named exactly as the SQL
functions are (`reward-mock.js:426-435`), so the client can be pointed at either
one.

`npm test`, run 2026-08-13:

```
1..90
# tests 90
# suites 0
# pass 90
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Per file: `tests/reward-config.test.js` 26, `tests/reward-redemption.test.js` 42,
`tests/reward-session.test.js` 22.

**These prove the contract and the client. They do not prove the SQL semantics.**
Where a guarantee comes from the database (the partial unique index on one active
session, the conditional `UPDATE ... WHERE status = 'issued'`), the mock's comments
name it so the two can be read side by side (`reward-mock.js:130-136`, `:199-202`,
`:324-327`), but the SQL itself is unexecuted.

`LEDGER.md`'s "Built so far" table records 85 tests. The tree runs 90 today.

### 5.3 What has been checked in a browser, and by whom

`LEDGER.md` records a flag-off regression run in a real browser:
`RewardV2.enabled === false`, the module early-returns with seven keys and no
methods, the app boots, nav intact, zero console errors, screenshot pixel-identical
to the pre-change baseline. **That was a previous session's verification and was not
re-run for this document.** `python3 tools/check-shell.py` was re-run here and
reports `mr-tapioca-v187: 66 precached paths` / `PASS, every precached path exists`.

### 5.4 Nothing here has met a counter

No redemption has ever been performed against a live database, by a cashier or by
anyone. `verify/index.html` has a demo backend and a loud sticky demo banner
(`verify/index.html:375-377`, `:672-678`) precisely so a preview can never be
mistaken for a live check.

---

## 6. What remains forgeable

Say this plainly and never imply otherwise. The migration states the same list at
`supabase-reward-v2.sql:759-770`.

1. **`platform` and `shield_claimed` are client assertions.** Reward V2 refuses web
   sessions, which removes the easy case. A scripted client can still claim `ios`
   and wait four hours of real time. **App Attest / DeviceCheck is the fix and is
   NOT implemented** (`supabase-reward-v2.sql:21-26`, `:761-762`,
   `LEDGER.md`, "Known limitations" item 3).
2. **Anonymous accounts are free and unlimited**, so one person can farm accounts.
   The only real brake is that a threshold costs 240 minutes of wall clock at
   today's numbers. `per_user_limit` and `pilot_cap` on `partners` bound the damage
   per shop (`supabase-reward-v2.sql:763-765`, `LEDGER.md`, "Known limitations" item 4).
3. **Elapsed wall-clock is not attention.** Nothing in this system knows a human was
   there, that a phone was face down, or that Screen Time was actually shielding
   anything (`supabase-reward-v2.sql:21-23`, `:766`).
4. **A live screen share within the 5-minute code window works.** A screenshot is
   useless after five minutes, but a student sharing their screen to a friend inside
   that window can get the code honoured. **The reward is still spent exactly once**
   (`supabase-reward-v2.sql:767-769`).
5. **`reward_eligible_minutes` is granted to PUBLIC by omission.** See 3.11.

**Nobody may describe this system as fraud-proof or as "verified study time."** The
migration says so in its own header (`supabase-reward-v2.sql:25-26`). The phrase
"verified study time" already appears in `marketing/doug-one-pager.html:61` and
`GROUNDING.md:419` records it as false: minutes come from the device clock, are
summed on-device and persist in plain localStorage, with no server clock and no
attestation. Reward V2 adds a server clock. It does not add attestation, and a
server clock is not verification of study.

**What a merchant report can never contain**, because the product has never
collected it: revenue, incremental sales, average order value, first-time visitors,
ROI (`supabase-reward-v2.sql:671-676`). `GROUNDING.md:417-418` records the two
one-pager claims in this family that are not producible today: a first-visit
trigger and a "how many first-time visitors" line.

---

## 7. Deployment checklist

In order. **FOUNDER** marks a step that touches the live database, a live deploy,
or an Apple ID. Claude does not do those.

### Step 0. Re-run the local verifications (either of us)

```bash
cd "/Users/melchiorgoldfarb/Documents/Mr. Tapioca"
npm test                                            # expect 90/90
python3 -m venv .sqlvenv && .sqlvenv/bin/pip install pglast
.sqlvenv/bin/python tools/check-sql.py              # expect 0 problems
python3 tools/check-shell.py                        # expect PASS
node tools/partners-to-sql.mjs --check              # expect REFUSED until Step 2
```

`.sqlvenv/` is a local tool directory and belongs in `.gitignore` before any commit.

### Step 1. FOUNDER: run the migration

Open the Supabase SQL editor for project `gpayncloeslimhpyskva` (`config.js:11`),
paste **all** of `supabase-reward-v2.sql`, run it once. It is written to run **after**
`supabase-setup.sql`, which must already be applied.

- §13 (`:728-757`) is commented out. It is optional and unrelated. Leave it.
- §12 (`:720-726`) schedules two pg_cron jobs. `supabase-setup.sql:252-261` already
  schedules two, so pg_cron is known to be available on this project.
- After the run, decide on the `reward_eligible_minutes` grant (3.11).
- Confirm the run by checking that `select count(*) from public.reward_policies;`
  returns 0 rather than an error.

This is the step that turns a syntax-checked file into semantics. Column names, RLS
and grants are only real after it.

### Step 2. Declare a `rewardPolicy` in `partners.json` (either of us; FOUNDER decides which)

Today the file has no such block. `node tools/partners-to-sql.mjs --check` refuses,
verbatim:

```
REFUSED: this config cannot decide its own reward policy
  policyState is "undeclared"; only "declared" may seed a server.
```

With `policyState: "undeclared"`, Reward V2 issuance stays off by design
(`reward-config.js:23-25`, `:142-157`). The two shapes `reward-config.js` accepts,
using today's real numbers and nothing invented:

**Option A, `global_passport`.** One shared bar, one reward, spendable at either
shop.

```json
"rewardPolicy": {
  "policies": [
    { "id": "ithaca-passport", "kind": "global_passport",
      "requiredMinutes": 240, "expiresDays": null }
  ]
}
```
and add `"policyId": "ithaca-passport"` to both shops.

**Option B, `partner_specific`.** One policy per shop, one reward per shop.

```json
"rewardPolicy": {
  "policies": [
    { "id": "u-tea-only", "kind": "partner_specific",
      "requiredMinutes": 240, "partnerId": "u-tea-collegetown", "expiresDays": null },
    { "id": "dream-tea-only", "kind": "partner_specific",
      "requiredMinutes": 240, "partnerId": "dream-tea-poke-ithaca", "expiresDays": null }
  ]
}
```
and add each shop's own `policyId`.

Rules the parser enforces: every shop needs a `policyId`; a shop's `minMinutes` must
equal its policy's `requiredMinutes` or the config is `ambiguous` and refuses; a
`partner_specific` policy must name a `partnerId` that exists in `shops[]`; a
`global_passport` policy must not name one (`reward-config.js:185-208`). Re-run
`--check` and require `policyState declared` before going further. Against an
Option A copy of today's file it prints the two shops, their bars and their offer
versions, and exits 0. See §9 for the decision itself.

### Step 3. Mirror the shops into the server `partners` table

`tools/partners-to-sql.mjs` is the generator named by `config.js:25`,
`reward-config.js:4`, `reward-mock.js:80` and `supabase-reward-v2.sql:65`. It reads
`partners.json` through `reward-config.js` rather than reimplementing the rules, so
the client, the exporter and the server cannot drift.

```bash
node tools/partners-to-sql.mjs --check                     # validate, no SQL
node tools/partners-to-sql.mjs > /tmp/partners-seed.sql    # emit, then review
```

It **refuses to emit** while `policyState` is anything but `declared`, which is why
Step 2 comes first. Diagnostics go to stderr and only SQL goes to stdout, so a
refusal cannot leave a half-written file full of error text behind a `>`. The output
is deterministic (no timestamp, file order preserved), so `diff` is a truthful answer
to "did anything actually change?".

Emitted shape, confirmed by running it against an Option A copy of `partners.json`:
one `begin;`, a `do $guard$` block that aborts the whole transaction if the server's
existing rows disagree with the file, an upsert into `reward_policies`, an upsert
into `partners`, one `commit;`. Fields `partners.json` carries that the server has
no column for and which are therefore not in the seed: `lat`, `lng`, `perk` (the
student-facing wording; `offer_text` is what staff honour), `since`, `terms`,
`verification`.

**FOUNDER: paste the reviewed output into the SQL editor and run it.**

Those are the only two partner shops and the only two offers. U Tea is 10% off your
drink; Dream Tea & Poké is 5% off your drink; both at 240 cumulative focus minutes.
Never add a third or change a number without the shop's written agreement, per
`CLAUDE.md` and `partners.json:22-24`.

**Never bump `offer_version` casually.** The exporter will not bump it for you, on
purpose. Bumping it is what invalidates the rewards students are already holding:
`open_redemption` and `redeem_by_code` both refuse a reward whose stored version no
longer matches (`:487-488`, `:581-582`). Reword the same deal, leave the version
alone. Change what the shop actually gives, bump it by hand in `partners.json` and
regenerate. Changing `offer_text` without bumping silently relabels rewards already
out in the world, because redemption compares the integer and not the string.

### Step 4. FOUNDER: deploy the cashier page

`verify/index.html` is one file, no build step, no framework, no login, no service
worker of its own (`verify/index.html:19-22`). It loads `../config.js` as a plain
script (`:437`) so it and the app can never point at two different projects, which
means it has to sit at `/verify/` next to the root `config.js`.

Deploy is a push to `feature-work`; GitHub Pages redeploys `mrtapioca.me` in about a
minute. Before that push: bump `const CACHE` in `sw.js` and run
`python3 tools/check-shell.py` (`CLAUDE.md` gotcha 1; one missing SHELL path blocks
all updates app-wide with no error anywhere).

Then, per shop:

- Bookmark `https://mrtapioca.me/verify/?shop=U%20Tea` on the till, so the page does
  the shop-name comparison instead of the cashier and a Dream Tea reward stops at
  the door (`verify/index.html:459-469`).
- `?demo=1` forces the demo backend for training. The demo banner is sticky on
  purpose, so a demo screen that scrolled cannot look live
  (`verify/index.html:124-132`).
- The page is `noindex, nofollow` (`verify/index.html:5-8`) so a stray search result
  cannot put a cashier on a stale cached copy.

### Step 5. Flip the flag

Set `rewardV2: true` at `config.js:31`. The three preconditions are already written
beside it at `config.js:18-26` and they are steps 1, 2 and 3 above.

- **Web: FOUNDER**, because it is a push to `feature-work` and therefore a deploy.
  Bump `sw.js` `CACHE` again and re-run `tools/check-shell.py`.
- **iPhone: the build after 1.1.0.** The flag ships inside `config.js`, which is
  bundled into the app, so flipping it on the web does not flip it on a phone. That
  next build also needs `npm run copyweb && npx cap copy ios && node
  tools/register-ios-plugins.mjs`; `copyweb` already copies `reward-config.js` and
  `reward-v2.js` (`package.json:7`). Run `node tools/check-release.mjs` before
  archiving: it fails the release while `ios/App/App/public` is behind the repo,
  which is the exact silent staleness `GROUNDING.md:377-399` caught at three days
  and a service-worker generation installed users already had. Archive and upload
  are the founder's Apple ID steps, checklisted in `docs/network-v1/NEXT-BUILD.md`.
- For a single QA device without any deploy, use the localStorage override:
  `localStorage.setItem("bobaRewardV2", "on")` (`reward-v2.js:36`). Clear it
  afterwards. See §8.

### Step 6. Prove one end-to-end redemption before telling a shop anything

On a native build with the flag on: complete a real session past the bar, open the
card, read the six characters onto a second device at `/verify/`, press Check code,
press Mark as used, then press it again and confirm the second press reports already
used. Until that has happened against the live database, the only honest description
of this system is "built and untested in production".

---

## 8. Rollback

**Set `config.js:31` back to `rewardV2: false`, redeploy.** That is the whole
rollback for the client.

What happens: `RewardV2.enabled` evaluates false at `reward-v2.js:51` and the module
returns at `:52`. `window.RewardV2` still exists with seven data keys (`enabled`,
`ready`, `eligibleMinutes`, `rewards`, `policies`, `lastError`, `lastSyncAt`) and no
methods. No RPC is ever called. No session is opened. Nothing is written to
`bobaRewardSession` or `bobaRewardQueue`. No listener is registered, because both
`addEventListener` calls are below the early return (`:362-369`).

**v1 is untouched by any of this.** Confirmed two ways:

1. **No shared storage.** V2 writes exactly three localStorage keys, all prefixed
   `bobaReward`: `bobaRewardSession`, `bobaRewardQueue`, and the QA override
   `bobaRewardV2` (grep of `app.js`, `reward-v2.js`, `verify/index.html`). Every v1
   key is `bobaFocus*`, `bobaPartners1`, `bobaShops*` or `bobaMetricsDevice`. There
   is no overlap, so V2 cannot corrupt a v1 value even while running.
2. **No shared code path.** `app.js` never reads `window.RewardV2`; the v1 perk
   chain is the one documented at `GROUNDING.md:13-30` and it is unchanged. The only
   edits made for V2 outside the new files were two script tags
   (`index.html:795-796`), a `SquadCloud.client()` accessor, two SHELL entries and a
   `CACHE` bump (`sw.js:20-21`, `:10`), and the flags block in `config.js`
   (`LEDGER.md`, "Wiring done (all behind the flag)").

**The one trap.** Any device where QA ran `localStorage.setItem("bobaRewardV2",
"on")` stays on V2 after the flag goes down, because `flagOn()` accepts either
(`reward-v2.js:34-37`). Clear it explicitly:
`localStorage.removeItem("bobaRewardV2")`.

**Server-side rollback is not required and not recommended.** Rows already written
are inert once no client calls the RPCs. If something needs stopping without a
deploy, there are two softer levers that take effect immediately and reverse
cleanly:

- `update public.partners set active = false where id = '<shop>';` refuses every
  redemption at that shop with `failed_partner_paused` (`:474`, `:576`) while
  leaving the shop and its rewards intact.
- `update public.reward_policies set active = false where id = '<policy>';` stops
  issuance under that policy (`:251`) and drops it from `my_reward_state`
  (`:406-410`). Rewards already issued stay redeemable.

Dropping tables loses the redemption history a merchant report is built from. Do not
do it as a rollback.

---

## 9. The open decision: `global_passport` vs `partner_specific`

`reward-config.js` will not guess, and `config.js:21-23` names this as precondition
2. This is a business decision, not a migration detail.

**What each means.**

| | `global_passport` | `partner_specific` |
|---|---|---|
| Policies needed | one, shared | one per shop |
| `reward_instances.partner_id` | NULL | the shop's id |
| Where a reward can be spent | any active partner on that policy | only its own shop |
| `offer_version` recorded at issuance | none (NULL) | the shop's version at that moment |
| Refusal at the wrong shop | `failed_wrong_partner` only if the shop is on a different policy (`:483-484`) | `failed_wrong_partner` at any other shop (`:481-482`) |
| Matches v1 behaviour | yes | no |

**The consequence that decides it.** `issue_my_rewards` loops over **every** active
policy and computes `v_minutes / v_pol.required_minutes` against the same total
(`supabase-reward-v2.sql:251-252`). So the same minutes are counted once per policy.
Measured against `reward-mock.js`, one completed 240-minute native session:

```
global_passport (1 policy) : | eligible: 240 | rewards issued: 1 | ithaca-passport/partner=NULL
partner_specific (2 policies): | eligible: 240 | rewards issued: 2 | u-tea-only/partner=u-tea-collegetown, dream-only/partner=dream-tea-poke-ithaca
```

**Four hours of focus buys one discount under a passport, and one discount at every
partner-specific shop under the other model.** With two shops that is 10% off at
U Tea *and* 5% off at Dream Tea & Poké for the same four hours. That is a real cost
to real businesses and it is the number to put in front of a shop owner before
choosing.

**What each means for the two current shops.** U Tea (`u-tea-collegetown`, 10% off
your drink) and Dream Tea & Poké (`dream-tea-poke-ithaca`, 5% off your drink) are
both at `minMinutes: 240` (`partners.json:33`, `:43`). Because the bars agree, the
two models are indistinguishable from a student's progress bar today: either way the
bar reads 240 (`RewardConfig.nextBarAcross` returns 240 on the current file). They
differ only in how many rewards those 240 minutes produce, and in what happens when
a third shop signs.

**Why the config refuses to guess.** With no `rewardPolicy` block the parser returns
`policyState: "undeclared"` and V2 issuance stays off (`reward-config.js:23-25`,
`:156`). If shops ever disagree on `minMinutes` with no policy declared, it returns
`"ambiguous"` with a warning naming the exact v1 failure (`:142-155`). If a declared
config contradicts itself, a shop's own bar fighting its policy's bar, a missing
policy, a policy naming a shop that is not in the list, it returns `"ambiguous"` with
errors (`:185-215`). Guessing here is how a display default became an eligibility
rule in v1 (`reward-config.js:229-237`).

**When the decision bites.** The moment a third shop signs at a number other than
240 (`LEDGER.md`, "Open decisions for the founder" item 2). Under `global_passport` a single shared policy at a lower
bar drags every shop on it, which is precisely the `Math.min` failure V2 exists to
end; the fix is to give the new shop its own policy, at which point the model is
mixed anyway. Under `partner_specific` each shop's bar is its own and the arithmetic
above applies per shop.

**Recommended sequencing, not a decision.** Pilot terms are per shop by design:
`app.js:4579` states "The deal is negotiated shop by shop", and `CLAUDE.md` requires
that `perk` be that shop's own words, that perks per shop will not look alike, and
that nobody invent a perk or a number. Whichever
kind is chosen, decide it before Step 2, write it into `partners.json`, run the
parser, and require `declared` before the flag moves.
