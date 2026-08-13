# Network V1 — overnight build ledger

Live state for the "make the real-boba reward trustworthy" mission. Updated at the
end of every work loop so the next loop (or the next session) can pick up cold.

**Guardrails in force:** no git commits or pushes, no deploys, no App Store upload,
no merchant contact, no change to live merchant offers, no touching RampUp, no
rebuilding the focus timer / Screen Time blocking / streaks / quests / mini-games /
skins / Boba Map / Study Squad wholesale. Existing outreach + marketing files are
read-only.

Ground truth for every decision here: **`docs/network-v1/GROUNDING.md`** (43-agent
inspection, 31 defects that survived adversarial verification, 5 refuted). Read it
before changing anything; it carries file:line for every claim.

## Release context (from the founder, 2026-08-13) — overrides the docs

- **1.1.0 is in App Store review right now.** CLAUDE.md's "nothing is in review" line and
  GROUNDING.md §10 item 1 both predate this. This statement is authoritative.
- **Partner rewards are planned for the NEXT version after 1.1.0, on purpose.** The
  shipping and reviewing builds not carrying partner rewards is **intentional, not a
  defect and not a blocker.** Nothing gets redesigned to reach 1.1.0, and the staged iOS
  bundle lacking `reward-config.js` / `reward-v2.js` is simply next build's work.
- **All Reward V2 behaviour stays feature-flagged and local until explicitly approved.**

## Standing priority order (from the founder)

Highest yield first. Secondary work must not consume the loop while these have real work
left:

1. Reward V2 server authority → eligibility → unique issuance → atomic redemption →
   replay resistance → cashier verification → merchant event records → merchant
   reporting → product analytics → safe next-build client integration → adversarial
   testing.
2. Explicitly deprioritised below that: website polish, App Store copy polish,
   speculative acquisition work, merchant dashboard aesthetics, and economy changes that
   are taste rather than defect.

**Reward policy:** do not block on shared-passport vs per-shop. Support both cleanly in
architecture and tests, use explicit fixtures where a test needs a policy, and never
activate ambiguous issuance in production. The choice stays with the founder.

**Economy:** objective exploits get fixed, subjective tuning does not. One persona
earning more pearls than another is not by itself a failure.

## Status

| # | Priority | State |
|---|----------|-------|
| 0 | Inspection + ground truth | **done** — GROUNDING.md |
| 1 | Reward V2 (server sessions, policy, issuance, atomic redemption) | **client wired + cashier page built**; adversarial pass running |
| 2 | Partner + offer model | **done (config layer)** — reward-config.js + 26 tests |
| 3 | Merchant proof / funnel analytics | **done** — event log, report RPC, offer-wording snapshot, generator + sample |
| 4 | Product analytics | `analytics.js` + METRICS-SPEC.md built; **not yet wired into app.js** |
| 5 | Economy correction | **simulator done + two exploits closed**; cap rebalance left as a founder call |
| 6 | Shorter reward-aware onboarding | stale "stay tuned" slide replaced; step-count reduction not done |
| 7 | Local notifications | not started |
| 8 | Reward sharing + Squad completion | not started |
| 9 | Reward-first acquisition surfaces (local only) | both local concepts built; **deprioritised by the founder** |
| 10 | Next-build readiness | checker + checklist in progress |

## Built so far

| File | What it is |
|---|---|
| `supabase-reward-v2.sql` | The migration. Append-only server-clock session ledger, explicit reward policies, versioned partner offers, reward instances, atomic `redeem_by_code`, redemption event log, merchant report. **Not run** — see limitations. |
| `reward-config.js` | Partner/offer/policy parsing + validation. Replaces the implicit `Math.min` bar with a declared policy, and refuses ambiguous configs instead of guessing. |
| `reward-mock.js` | A second, independent implementation of the same RPC contract. Lets the client be built and the nasty cases be tested with no database, and lets QA screenshot valid/consumed/rejected states. |
| `tools/qa/cdp.mjs` | Zero-dependency Chrome DevTools Protocol driver (Node 22's built-in WebSocket). Replaces the puppeteer dependency the old QA scripts needed. |
| `tools/qa/serve.mjs` | Zero-dependency static server on an ephemeral port, so a stale service worker cannot leak into a QA capture. |
| `tools/check-sql.py` | Parse-checks every `.sql` with the real Postgres grammar (pglast/libpg_query), **including plpgsql bodies**. |
| `reward-v2.js` | The client. Server session lifecycle, offline queue, issuance, redemption. Feature-flagged OFF; returns immediately with the flag down. |
| `tests/*.test.js` | 85 tests, `npm test`. All passing. |

### Wiring done (all behind the flag)

- `config.js` — added `window.MRTAP_FLAGS = { rewardV2: false }` with the three
  preconditions written next to it.
- `squad-cloud.js` — added `SquadCloud.client()`, one accessor, so RewardV2 reuses the
  SAME anonymous account. Two racing `signInAnonymously()` calls would mint two users
  and split one student's minutes across both.
- `index.html` — two script tags before `app.js`.
- `sw.js` — both files added to SHELL, `CACHE` bumped v185 → **v186**.
- `package.json` — `copyweb` now copies both files; added `npm test`.

### Verification actually run

- `npm test` → **85/85 pass**.
- `python3 tools/check-shell.py` → **PASS**, 65 precached paths, every one exists.
- `tools/check-sql.py` → both SQL files parse clean: 54 + 61 statements, 15 plpgsql
  bodies, 0 problems.
- **Flag-off regression, in a real browser:** `RewardV2.enabled === false`, the module
  early-returns (7 keys, no methods attached), app boots, nav intact, **zero console
  errors**, and the screenshot is pixel-identical to the pre-change baseline.

## Known limitations to state honestly

1. **The migration has never been executed.** There is no Postgres and no Docker on
   this machine. It is syntax-verified with the real Postgres parser and reviewed,
   not run. Semantics against a live catalog (column names, RLS, grants) still need
   one paste into the Supabase SQL editor.
2. **The tests run against `reward-mock.js`, not Postgres.** They prove the contract
   and the client. Where a guarantee comes from the database (the partial unique
   index on one active session; the conditional `UPDATE … WHERE status='issued'`),
   the test names it so the two can be read side by side — but the SQL itself is
   unexecuted.
3. **`platform` and `shield_claimed` are client assertions.** Reward V2 refuses web
   sessions, which removes the easy case. A scripted client can still claim `ios`.
   App Attest is the fix and is documented, not implemented.
4. **Anonymous accounts are free and unlimited**, so one person can farm accounts.
   The only real brake is that a threshold costs 4 h of wall clock. Per-shop caps
   bound the damage.

## Open decisions for the founder

1. **Which reward policy?** `reward-config.js` will not guess. Today's
   `partners.json` declares none, so Reward V2 issuance stays off. The two options
   are written up in the config header:
   - `global_passport` — one shared 240-minute bar, a reward earned anywhere is
     spendable at any partner. This is what v1 behaves like today.
   - `partner_specific` — the bar and the reward belong to one shop.
   Declaring it is a business decision, not a migration detail.
2. **U Tea and Dream Tea are both at 240 today**, so the two models are
   indistinguishable right now. The decision only bites when a third shop signs at a
   different number.

## The defects that most change the plan

Full list in GROUNDING.md §9. The ones driving the remaining priorities:

- **D1** the counter card can be shown unlimited times; "Not now" consumes nothing,
  and the card renders at full strength even at a zero balance. This is the reason
  Reward V2 exists.
- **D2** one localStorage write mints unlimited perks. Reproduced live in Chrome:
  `bobaFocusCollection = [{minutes:100000}]` → **416 rewards ready**, confirm button
  enabled. Also mints 6,666 pearls.
- **D3** deleting `bobaFocusPerkRedemptions` replays every perk already spent.
- **D6** the global `Math.min` bar means one lenient partner unlocks every other
  partner's offer. Latent today (both shops 240). Addressed by `reward-config.js`.
- **D7** the reward card over-states pearls on unblocked native sessions: cards
  promise 4, wallet gets 2.
- **D8** `privacy.html` says focus data never leaves the device; `metrics.js` POSTs
  a per-install device id, size and minutes on every finished drink. It also says
  Study Squad is off until you turn it on; an anonymous account is created on first
  launch. App Store review risk, not just copy.
- **D9** no notification capability of any kind exists.
- **D10** the 7-tap dev unlock ships in production and mints pearls, drinks and
  telemetry rows.
- **D11** economy inversion: a maxed non-focus day is worth 11.5 h of focus
  (23 h on native unblocked).
- **D18** the growth loop is unclickable: the share card carries no URL, QR or
  handle, and `navigator.share` payloads have no `url`.

## Measured economy (before any change)

Per GROUNDING.md §5. Pearls are derived, not stored:
`floor(totalMinutes()/15) + bonusPearls − spent − blockPenalty`.

| Source | Rate | Daily max |
|---|---|---|
| Focus, blocked or web | 4/hr | uncapped |
| Focus, native unblocked | 2/hr | uncapped |
| Daily goal / streaks / achievements | **0** | — |
| Quests (3/day, one per pool) | — | 8–13 |
| Catch the Pearls | 20 s run | 10 |
| Boba Plinko (3 drops) | EV ~6.2 | 15 |
| Cup Pong (4 throws) | 2/make | 8 |
| **Non-focus ceiling** | — | **46** |

46 pearls = 11.5 h of focus at 4/hr. Every pearl-priced cosmetic costs 840 total.

`tools/economy-sim.mjs` simulates 14 days deterministically. The headline:

| profile | focus | quest | game | total | focus share |
|---|---|---|---|---|---|
| light (20-30 min/day) | 24 | 41 | 23 | 88 | 27.3% |
| normal (60-90 min/day) | 67 | 75 | 119 | 261 | 25.7% |
| heavy (2-4 h/day) | 181 | 134 | 185 | 500 | 36.2% |
| game-maximizer | 30 | 145 | 344 | **519** | **5.8%** |

**The game-maximizer out-earns the heavy student** (519 vs 500) on 7.5 focus hours
against 45.4. Focus is a minority of income for every profile.

### Correction applied (two exploits, not a rebalance)

1. **The web game gate.** `gamesUnlockedForBreak()` returned `true` outright whenever
   `FocusBlocker` was unavailable, so the web build had no minute gate at all: one
   15-minute cup paid 1 pearl and unlocked up to 33 more the same day. 33x leverage on
   the shortest legal session. The 30-minute rule that already existed on iPhone now
   applies everywhere. Nothing else about the games changed.
2. **Dev mode earns nothing.** Every non-focus pearl now goes through one
   `awardPearls()` door that returns 0 in dev mode, and the drink-counter ping is
   skipped there too. Dev mode removes every limit at once (5-second sessions,
   unlimited game replays, no gate), which printed about 720 pearls an hour against an
   honest 4, bought all 840 pearls of cosmetics in ~70 minutes, and posted a fake row
   into the anonymous drink counter every five seconds. Dev mode still reaches every
   flow; the wallet just does not move.

**Verified in a real browser:** gate returns false at 0 and 15 minutes and true at 30;
`awardPearls(5)` returns 0 and moves nothing in dev mode, returns 5 and moves 5
normally; junk inputs return 0; zero console errors.

**Left for the founder, deliberately not changed:** the daily game caps themselves
(Catch 10, Plinko 15, Pong 8) and the quest values. The simulation shows games are 66%
of the maximizer's income, so caps are the highest-leverage remaining dial, but lowering
them makes the games less fun for honest users too. That is a taste call, not a defect.


## Session lifecycle wiring (Reward V2, behind the flag)

`app.js` now calls three RewardV2 hooks, each guarded by `RewardV2.enabled`:

| Where | Call | Why there |
|---|---|---|
| `beginFocus()` | `startSession(plannedMinutes)` | After the timer is already running. The drink is what the user pressed the button for; the merchant reward is the optional half. |
| `completeSession()` | `completeSession()` | When the SESSION ended, not when the user tapped Save, so the server's clock stops at the right moment. |
| boot | `init()` | After `SquadCloud.init()`, so RewardV2 restores the anonymous account Squad established rather than racing to create a second one. |

**Proved in a real browser, two isolated Chrome profiles, identical pinned quest draw:**

| | flag OFF | flag ON |
|---|---|---|
| pearls | 4 | 4 |
| drinks | 1 | 1 |
| bonus pearls | 3 | 3 |
| total minutes | 15 | 15 |
| perk bar / earned | 240 / 0 | 240 / 0 |
| console errors | none | none |

Byte-identical. Turning Reward V2 on changes no local outcome, and an unreachable
backend does not disturb the timer, the drink, the pearls or the reward dialog.

## Live-claim corrections applied

- **`privacy.html`** was materially wrong and is live. Corrected: it no longer says focus
  sessions never leave the device (a per-install random id, drink size and minutes are
  posted on every finished drink); the anonymous account is described as created on first
  launch rather than opt-in; the "current status" claim is qualified (the app always sends
  `idle`); a new section 3 discloses the drink counter in full; sections renumbered to 10;
  all five em-dashes removed. Verified rendering at both widths with zero console errors.
- **Onboarding slide 6** said "Real Rewards Await! ... Stay tuned to unlock discounts."
  Two shops have signed, so that told a new user the one real thing about the app was
  still hypothetical. Now "Real boba, not just points", with no invented number and no
  implied local coverage.
- **Consumer landing concept** claimed "Only the two shops named above are starred."
  `partnerFor()` stars any pin within 40 m on proximity alone, so that was false and is
  the exact failure that sends a student to the wrong business. Now "have a deal with us".
