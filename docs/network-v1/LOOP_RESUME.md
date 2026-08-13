# LOOP_RESUME — Mr. Tapioca network loop

**Read order on resume:** `GROUNDING.md` → `LEDGER.md` → this file. Then continue from
RESUME HERE at the bottom. Do NOT re-run the 43-agent inspection; its findings are in
GROUNDING.md and were adversarially verified.

**Last updated:** 2026-08-13, end of loop 7. Suite GREEN at 153/153. **12 of the 14 red-team findings are closed.** Local commits only, nothing pushed.

---

## STATUS VOCABULARY (used strictly below)

| Label | Means |
|---|---|
| `VERIFIED` | Executed and observed in a real browser or shell. Real output seen. |
| `PARSE-VALIDATED` | Syntax checked with the real Postgres grammar. **Never executed.** |
| `MOCK-TESTED` | Passes against `reward-mock.js`, a second implementation of the same contract. Proves the CONTRACT and the CLIENT. **Proves nothing about Postgres.** |
| `SIMULATED` | Output of a deterministic model, not of the shipped app. |
| `LIVE-DEPLOYED` | Running in production. **Nothing in this loop is LIVE-DEPLOYED.** |
| `NOT YET TESTED` | Written, unexercised. |

> **The single most important line in this file:** no Reward V2 code has ever talked to a
> real database. `MOCK-TESTED` and `PARSE-VALIDATED` are NOT a working backend. A resumed
> agent that treats them as one will ship a discount system that has never run.

---

## CURRENT NETWORK OBJECTIVE

Server-authoritative reward eligibility → unique issuance → atomic redemption → replay
resistance → cashier verification → merchant evidence → analytics → safe next-build
integration. Everything else is secondary and the founder has said so explicitly.

## REWARD V2 STATUS

| Piece | State |
|---|---|
| Schema + RPCs (`supabase-reward-v2.sql`) | `PARSE-VALIDATED` (54 stmts, 8 plpgsql bodies, 0 problems). **NOT executed anywhere.** |
| Contract semantics | `MOCK-TESTED` — 90 tests green |
| Policy model (`reward-config.js`) | `MOCK-TESTED` — both `global_passport` and `partner_specific` supported |
| Client (`reward-v2.js`) | `VERIFIED` flag-off is a total no-op; `VERIFIED` flag-on with an unreachable backend breaks nothing. RPC round-trip against real Supabase: `NOT YET TESTED` |
| Session lifecycle wiring in `app.js` | `VERIFIED` — see CLIENT INTEGRATION |
| Cashier page (`verify/index.html`) | `VERIFIED` in demo mode via screenshots. Against a live backend: `NOT YET TESTED` |
| Adversarial/red-team pass | **LANDED.** 60 attacks in `tests/reward-adversarial.test.js`. 14 documented REAL holes. 7 now fixed (below); the rest are logged as open |

## SERVER/BACKEND STATUS

- **Nothing has been deployed. No migration has been run. No table exists.**
- Live Supabase today contains ONLY the pre-existing Study Squad schema
  (`profiles`, `friendships`, `add_rate`, `drink_events`) from `supabase-setup.sql`.
- `supabase-reward-v2.sql` adds: `reward_policies`, `partners`, `reward_sessions`,
  `reward_instances`, `redemption_handoffs`, `redemption_events`, `code_rate`.
- Guarantees that come from the DATABASE and are therefore **unproven until it runs**:
  - the partial unique index `reward_sessions_one_active` (one open session per user)
  - the unique `(user_id, policy_id, seq)` index (no double issuance under a race)
  - the conditional `UPDATE … WHERE status='issued'` (exactly-one redemption)
- No Postgres and no Docker on this machine, so it cannot be executed locally. This is a
  hard environmental limit, not an oversight.

## CLIENT INTEGRATION STATUS

Three guarded hooks in `app.js`, all behind `RewardV2.enabled`:

| Where | Call |
|---|---|
| `beginFocus()` | `startSession(plannedMinutes)`, after the timer is already running |
| `completeSession()` | `completeSession()`, at session end (not at Save) |
| boot, after `SquadCloud.init()` | `init()` — shares the ONE anonymous account |

`VERIFIED` by A/B in two isolated Chrome profiles with a pinned quest draw:
flag off vs on → pearls 4/4, drinks 1/1, bonus 3/3, minutes 15/15, perk bar 240/240,
zero console errors in both arms. **Byte-identical.**

## FEATURE FLAGS

| Flag | Value | Where |
|---|---|---|
| `window.MRTAP_FLAGS.rewardV2` | **`false`** | `config.js` |
| `window.MRTAP_FLAGS.analytics` | **`false`** | `config.js` |
| `localStorage.bobaRewardV2 === "on"` | dev/QA override, only works when cloud keys exist | `reward-v2.js` |
| `localStorage.bobaAnalytics === "on"` | dev/QA override, same constraint | `analytics.js` |

Preconditions for each flag are written beside it in `config.js`, and **none of them are
met**.

- `rewardV2` needs: migration run, a `rewardPolicy` declared in `partners.json`, and the
  server `partners` table seeded.
- `analytics` needs: `supabase-analytics.sql` run, `privacy.html` describing what it
  collects, and the App Store answers declaring Usage Data (not linked to identity).

**Do not flip either flag.** Both default false and both are inert while false.

## RED-TEAM FINDINGS AND WHAT WAS DONE

The red-team wrote 60 attacks and found 14 genuine holes in the Reward V2 design. These
were **my own bugs**, in `supabase-reward-v2.sql`. Seven are fixed and mirrored into
`reward-mock.js`; all fixes are `PARSE-VALIDATED` + `MOCK-TESTED`, never run.

**Fixed:**

1. **F1, the expensive one.** Caps (`per_user_limit`, `pilot_cap`) were checked when a
   card was OPENED and never when it was SPENT, counted from rows already marked
   redeemed. So opening every card first, while that count was still zero, passed the cap
   on all of them, and then every one spent. Reproduced: `per_user_limit 1` delivered TWO
   drinks; `pilot_cap 1` delivered two across two accounts. No tooling needed, and caps
   are the only thing bounding a pilot shop's exposure. Fixed with a shared
   `redemption_gate()` called by BOTH open and spend.
2. **F2.** `failed_offer_changed` could never fire under `global_passport`, because
   `reward_instances.offer_version` is only set for partner-specific policies, so every
   version guard was dead code. A shop could change its offer between the card opening and
   the student paying. The handoff now pins the shop's `offer_version` at open.
3. **F4.** Lowering a policy's `required_minutes` re-minted rewards out of minutes already
   spent (240 minutes that had already bought and spent one reward produced three more at
   a 60 bar). This was D6, the defect Reward V2 exists to fix, reappearing one layer up.
   Each reward now records `bar_minutes` and entitlement is
   `(eligible - sum(bar_minutes)) / required`, so each minute is spent exactly once.
4. **F7.** The agreed redemption window was enforced at open only, so a 5pm cutoff meant
   5:05. Now inside the shared gate.
5. **F8.** A window wrapping past midnight (22:00 to 02:00) was unredeemable at every hour
   and blamed `failed_capped`. Wrap-around handled; window refusals now return a distinct
   `failed_outside_window`.
6. **F9 (window half).** A half-set window meant NO restriction, failing open. Now refused.
8. **F15 (found while fixing the others, and caused by them).** `check_code` gained NONE
   of the three refusals the F1/F7/F8 fixes added to `redeem_by_code`, so the cashier's
   read-only page showed VALID and the spend then refused. That is precisely the failure
   the comment above both implementations of that function forbids. `check_code` now calls
   the shared gate and compares the handoff's pinned offer version. A standing test guards
   the parity: any refusal added to spend and not to check turns it red.
9. **F12.** A consumed handoff code could be re-minted (unhandled PK violation in SQL,
   destroyed audit row in the mock). Codes are now checked against every row, and the mint
   loop is **bounded at 60 attempts** returning `failed_code_unavailable`. The bound is
   load-bearing: never-reuse plus an unbounded retry hangs the process, which it did.

**Also fixed in loop 7 (F5, F6, F9-config, F10, F11, F13, F14):**

10. **F10.** `reward-config.js` never validated a shop id, only policy ids. So
    `"U Tea Collegetown!"`, `"U-TEA"` and `"u-tea "` all parsed with zero errors and then
    failed at seed time, one CHECK violation at a time. Worse, the trailing-space and case
    variants meant the parser saw three shops where a human sees one, so the duplicate-id
    error that exists to stop colliding server rows never fired. Ids are now trimmed and
    matched against the server's own regex; a missing id is an error too.
11. **F9 (config half).** A mistyped `validDays` normalised to `[]`, and an empty array
    means "no day restriction", so a shop that asked for weekdays and typed the numbers
    wrong was open every day with no warning. It failed OPEN, the wrong direction for a
    rule a shop asked for. The raw length is now carried through normalisation so
    "no day rule" and "a day rule that could not be read" are distinguishable, and the
    second is an error.
12. **F11.** Config accepted `perUserLimit` 5000 and `pilotCap` 9e8 where the server
    CHECKs are 1000 and 1000000. Now an error. Refused rather than clamped: silently
    lowering a cap changes what a shop agreed to without anyone deciding it.
13. **F13.** Fractional `planned_minutes` accepted for an integer column. Never
    exploitable (credit is `least(elapsed, planned)` and elapsed is floored, so a fraction
    could only lose the student time), closed anyway so the client cannot learn to send one.
14. **F14.** `nextBarAcross` used `Math.min.apply`, which threw RangeError above ~124k
    shops. Now a reduce.
15. **F5.** Deleting a shop, which CLAUDE.md documents as the kill switch, was blocked
    server-side by the `redemption_handoffs.partner_id` FK once anyone had opened a card,
    and the mock THREW on the cashier path, so a pulled shop showed a crash rather than a
    refusal. The handoff FK now CASCADEs (a handoff lives five minutes and must never be
    why a shop cannot be pulled), and both mock paths refuse with `failed_not_found`.
    **Still true by design:** a shop that has actually had a redemption cannot be DELETEd,
    because `reward_instances.redeemed_partner_id` is deliberately not cascaded. Deleting
    it would erase the merchant report proving what was honoured. `active = false` is the
    correct pull for a shop that has traded, and it is reversible.
16. **F6.** Retiring a policy stopped issuance (correct) but not redemption (also
    correct), and then `my_reward_state` filtered policies to active only, so the client
    held a live, spendable reward whose policy it could not look up and therefore could
    not describe. It now returns active policies PLUS any policy a held reward was issued
    under, each flagged with its own `active` value.

**Still open. BOTH ARE BUSINESS CALLS, not code defects** (each has a green test asserting
the true current behaviour, so closing one turns its test red on purpose):

- **F2 residue.** The handoff pin closed the mid-handoff case. A passport reward still
  carries `offer_version` NULL of its own, so an offer changed BEFORE the card is opened
  is honoured at the new wording. **The question:** a global passport promises "a perk at
  any partner", not "this exact perk". If that is the intent this is correct. If a
  passport should freeze the wording it was earned against, issuance needs a version, and
  a version needs a shop, which a passport does not have until the card is opened.
- F3 a shop joining a passport policy is instantly liable for every reward every existing
  user already banked (pilot_cap is the only brake).
  It is the same decision as `global_passport` vs `partner_specific`, i.e. open decision 1.

**What HELD UP under attack, now pinned by tests:** the core invariant (no sequence
credits more minutes than real elapsed wall clock, across three seeds of 600 interleaved
operations and across local midnight); threshold arithmetic at 239/240/241/479/480/481;
session bounds; the 720 daily ceiling; identity (user B cannot open, read or learn
anything about user A's reward, and a stolen-id refusal is byte-identical to an
invented-id one and leaks no shop name); monotonicity; a failed redemption not consuming
cap headroom; one reward buying exactly one drink even with two live codes at two shops;
prototype-pollution payloads never polluting; the merchant report carrying no account id,
no reward id, no handoff code and no revenue vocabulary.

## GROWTH / SHARING STATUS (P8, partial)

`VERIFIED` in a real browser by stubbing `navigator.share` and reading the payload:

- **Every share the app made was UNCLICKABLE.** `navigator.share` was called with a title
  and text and **no `url` at all**, so the card landed in a chat with no way to get the
  app. Both shares now carry a first-party link:
  - focus card → `https://mrtapioca.me/get?src=focus_share`
  - Squad invite → `https://mrtapioca.me/get?src=squad_invite`
- `/get` already read `?src=` and passed it through as Apple's campaign token
  (`get/index.html`), so this is real attribution, not a decorative query string. That
  path existed and was linked from nowhere.
- Desktop has no share sheet, so the card download now also copies the link to the
  clipboard and the toast says so.
- The Squad invite text now explains what the code is FOR. A friend code is useless to
  someone who does not have the app, which is most people you would send one to.

**False presence claims removed** (GROUNDING §8 items 14, 17, 18). No status is ever
sent: `mySquadStats()` has no status field so `squad-cloud.js` always pushes `idle`.
- `catch-up.html` said "see each other's live focus stats & status (🟢 focusing / 🌸 on a
  break)". Now describes the shared totals board it actually is, and says plainly it does
  not show who is focusing right now.
- `support.html` said "focus stats sync so friends can see you focusing". Same fix.
- The stale `app.js` comment claiming statuses "update live" is corrected.

**Not done in P8:** reward-earned and redemption-completed share cards, and Squad presence
itself (correctly removed rather than faked, per the brief).

**Noted, not fixed:** `catch-up.html` (26) and `support.html` (2) carry pre-existing
em-dashes against house style. Untouched by these edits; copy polish is deprioritised.

## MERCHANT/REDEMPTION STATUS

- Cashier flow: student opens a handoff → 6-char code, 5-minute life → cashier CHECKS
  (read-only) → cashier taps MARK AS USED (the single atomic spend). Nothing to install,
  no merchant account. `MOCK-TESTED` + `VERIFIED` visually in demo mode.
- `check_code` was corrected to refuse everything `redeem_by_code` refuses (reward expiry
  and offer version included), so a cashier cannot see VALID and then be refused in front
  of a queue. `MOCK-TESTED`.
- Offer wording is **snapshotted at redemption** (`redeemed_offer_text`), so a shop that
  changes its offer does not have its history relabelled. `MOCK-TESTED`.
- Merchant report answers: redemptions, unique anonymous redeemers, repeat redeemers,
  which offer wording was honoured and when, and rejected attempts with reasons.
  It **cannot** report revenue, incremental sales, first-time visitors, ROI or order
  value, and a test asserts those keys are absent.
- Live merchant offers are **UNCHANGED**: U Tea 10% off, Dream Tea & Poké 5% off, both at
  240 cumulative minutes. No merchant was contacted.

## ANALYTICS STATUS

- **WIRED and `VERIFIED`, behind its own flag `MRTAP_FLAGS.analytics` (default `false`).**
- Own flag on purpose: config.js ships real keys, so gating on keys alone (the way
  metrics.js does) would have switched a 31-event stream ON for every live user the
  moment the script tag landed. That is collection starting before privacy.html discloses
  it, which is the exact mismatch that made the current privacy copy wrong.
- Loaded from `index.html`, in the `sw.js` SHELL, in `copyweb`. Cache now **v187**.
- 10 call sites in `app.js` via two guarded one-liners (`trk` / `trkOnce`):
  `first_open`, `return_day`, `onboarding_completed`, `first_focus_started`,
  `first_focus_completed`, `session_started`, `session_completed`,
  `daily_goal_completed`, `redemption_started`, `redemption_completed`.
- `VERIFIED` A/B in isolated Chrome profiles:

  | | flag OFF | flag ON |
  |---|---|---|
  | `MrTAnalytics.enabled` | false | true |
  | queued rows | 0 | 6 |
  | localStorage keys written | **none** | 6 `bobaAnalytics*` keys |
  | `app_events` requests | **0** | 2 (they 404, the table does not exist) |
  | drinks / pearls | 1 / 4 | 1 / 4 (identical) |
  | console errors | none | none |

- `supabase-analytics.sql` extracted from METRICS-SPEC.md and now `PARSE-VALIDATED`
  (10 statements, 0 problems). Has `event_id uuid not null unique` for insert
  idempotency and `drop policy if exists` so a re-paste does not fail with 42710.
- Still `NOT YET TESTED` against a real database, and **never run**.
- The pre-existing `metrics.js` drink counter is untouched and still live, except that it
  is now skipped in dev mode (it was posting a fake row every 5 seconds).

## TEST COUNT + LAST PASS

- **153 / 153 passing.** All FINDING tests were flipped to assert the fixes and renamed to
  the invariant each now defends, with the finding number kept in the comment.
- The flip was mutation-tested: reverting each fix one at a time in a scratch copy
  reddened exactly the intended test and nothing else, so no test passes incidentally.
- Use `node --test --test-timeout=30000 tests/*.test.js`. A timeout matters: an unbounded
  code-mint retry hung the whole suite once already.
- Files: `tests/reward-config.test.js`, `reward-session.test.js`,
  `reward-redemption.test.js`. A `reward-adversarial.test.js` was in flight at last update.
- Other checks, all `VERIFIED` at last run:
  - `python3 tools/check-shell.py` → PASS, 65 precached paths all exist
  - `tools/check-sql.py` → both SQL files clean (needs the pglast venv, see below)

```bash
npm test
```

## FILES MODIFIED

**Existing files changed (8):**
`app.js`, `config.js`, `index.html`, `squad-cloud.js`, `sw.js`, `package.json`,
`privacy.html`, `analytics.js`.

`app.js` changes specifically: web game gate closed, `awardPearls()` guard added and all
5 award sites routed through it, dev-mode metrics ping skipped, onboarding slide 6 copy
replaced, three RewardV2 lifecycle hooks, `trk`/`trkOnce` helpers plus 10 analytics call
sites.

**New files:** `supabase-reward-v2.sql`, `reward-config.js`, `reward-mock.js`,
`reward-v2.js`, `analytics.js`, `verify/index.html`, `tests/`, `tools/qa/`,
`tools/check-sql.py`, `tools/economy-sim.mjs`, `tools/merchant-report.mjs`,
`docs/network-v1/`, `docs/qa-screenshots-network-v1/`.

**NOT touched, deliberately:** every `OUTREACH_*` file and everything under `marketing/`.
They were already dirty when this session started and are the founder's own work.

**No commits. No pushes. No deploys.**

## UNDEPLOYED MIGRATIONS

1. `supabase-reward-v2.sql` — the whole Reward V2 schema. `PARSE-VALIDATED`, never run.
2. `supabase-reward-v2.sql` §13 — optional one-line fix for a **real pre-existing bug** in
   the live `gen_friend_code()`: the alphabet is 32 characters but the code does `% 31`,
   so **no friend code ever issued contains a `9`**. Harmless (17% of an 887M keyspace),
   existing codes stay valid. Deliberately left unapplied.
3. `supabase-analytics.sql` — the `app_events` table. Now extracted and
   `PARSE-VALIDATED`, still **never run**. Do not run it before privacy.html describes
   what it collects and the App Store answers declare Usage Data.

## KNOWN SECURITY/FRAUD LIMITATIONS

State these plainly. Never describe the system as fraud-proof or as "verified study time".

1. `platform` and `shield_claimed` are **client assertions**. Refusing web sessions
   removes the easy forgery, not a determined one. App Attest is the fix and is
   documented, not implemented.
2. Anonymous accounts are free and unlimited; one person can farm accounts. The only real
   brake is that a threshold costs 4 hours of wall clock. Per-shop caps bound the damage.
3. Wall-clock elapsed is not attention. Nothing proves a human was present.
4. A live screen-share of a code within its 5-minute window works, though the reward is
   still spent exactly once.
5. **v1 is still what is live**, and v1 is fully forgeable: one `localStorage` write mints
   unlimited perks (measured: 416), and deleting the redemption array replays every perk
   already spent. Reward V2 does not fix live until it is deployed and flagged on.

## FOUNDER DECISIONS PENDING

1. **Reward policy: `global_passport` vs `partner_specific`.** Both are supported and
   tested. Not blocking; issuance simply refuses to run on an undeclared config. Both
   live shops are at 240 today so the models are indistinguishable until a third signs.
2. **Daily game caps** (Catch 10, Plinko 15, Pong 8) and quest values. Left alone on the
   founder's instruction: taste, not defect.
3. Whether to apply the friend-code fix to the live Squad schema.

## EXTERNAL ACTIONS REQUIRED (founder only, Claude cannot do these)

1. Run `supabase-reward-v2.sql` in the Supabase SQL editor.
2. Declare a `rewardPolicy` in `partners.json`, then run `tools/partners-to-sql.mjs` and
   apply its output to seed the server `partners` table.
3. Deploy `verify/index.html` so cashiers have a URL.
4. Only then flip `window.MRTAP_FLAGS.rewardV2`.
5. All Xcode / App Store Connect steps. 1.1.0 is in review; partner rewards are
   intentionally for the build after it.

## DO-NOT-REDO FINDINGS

Already established and adversarially verified. Do not spend agents rediscovering these.

- The full v1 defect list, with file:line: **GROUNDING.md §9** (31 confirmed, 5 refuted).
- The exact tamper surface (every localStorage key and the fake reward it buys):
  **GROUNDING.md §2**. The 416-reward mint was reproduced live in Chrome.
- Measured economy numbers and the focus-vs-non-focus ratio: **GROUNDING.md §5**, and
  `SIMULATED` 14-day profiles in `tools/economy-sim.mjs`.
- Every currently-false marketing/privacy claim: **GROUNDING.md §8** (20 items).
- Backend/secrets posture: **CLEAN**. Only the public anon/publishable key is present;
  no service-role key anywhere. GROUNDING.md §4.
- Onboarding is 16 steps on web, 17 on iPhone. Notification capability is **zero**.
  Squad live presence does not exist and the value sent is always `idle`.
- The staged iOS bundle lacking reward files is **intentional**, not a defect.

## WHAT GOES LIVE ON THE NEXT PUSH TO `feature-work`

Read this before pushing. GitHub Pages auto-deploys the web app from this branch, so a
push ships these to mrtapioca.me. The commit is local only; nothing has shipped.

**Inert (flagged off, no behaviour change):** everything Reward V2, the cashier page, and
all analytics.

**Real, user-visible changes on the live WEB app:**

1. **Break games now require a completed 30-minute session on web.** They previously had
   no gate at all there. This is the 33x pearl exploit being closed, and it is the one
   change an existing web user would notice.
2. **Dev mode earns no pearls** and no longer posts to the drink counter.
3. **`privacy.html` is materially rewritten** and is now accurate. Worth reading before it
   ships, since it is a published policy.
4. **The onboarding reward slide** no longer says "Stay tuned to unlock discounts."

Not shipped by a web push: anything iOS. 1.1.0 is in review and partner rewards are
intentionally for the build after it.

## ENVIRONMENT NOTES

- No Postgres, no Docker. SQL cannot be executed locally.
- `tools/check-sql.py` needs pglast. It was installed in a scratch venv that may not
  survive a restart. Recreate with:
  ```bash
  python3 -m venv .sqlvenv && .sqlvenv/bin/pip install pglast
  ```
- QA harness is zero-dependency (`tools/qa/cdp.mjs` + `serve.mjs`, Node 22 built-in
  WebSocket driving system Chrome). No puppeteer needed.

---

## TOP 5 NEXT TASKS

1. ~~Wire `analytics.js`~~ **DONE in loop 5** (see ANALYTICS STATUS).
2. **Land the red-team results** from workflow `wgvkzmr7y` and fix anything it broke open.
3. **Reward progress + redemption UI** in the app, reading `RewardV2` when the flag is on
   and falling through to v1 when it is off.
4. **Local notifications (P7):** focus-session-complete while backgrounded, plus an
   optional user-chosen daily reminder. No streak guilt, no "come back" spam.
5. **Sharing + Squad honesty (P8):** put a trackable first-party link on the share card
   (`mrtapioca.me/get?src=reward_share`), carry the inviter code on Squad invites, and
   remove or soften every "friends focusing live" claim, since presence does not exist.

---

## RESUME HERE

1. Read `GROUNDING.md` and `LEDGER.md`, then check `git status --porcelain` and
   `npm test` to confirm the tree is where this file says it is (90+ tests green, 7
   modified tracked files, no commits). If the tree disagrees with this file, trust the
   tree and correct this file first.
2. Check whether workflow `wgvkzmr7y` (release-check, partners-to-sql exporter,
   REWARD-V2.md, QA sweep, red-team tests) landed. Its output file is under
   `/private/tmp/claude-501/.../tasks/`. If its artifacts exist, fold in the results and
   fix any major findings before starting anything new.
3. Then start the first unfinished item in TOP 5 NEXT TASKS (analytics wiring is done;
   next is landing the red-team results, then the reward progress/redemption UI, then
   notifications, then sharing + Squad honesty). Keep this file updated after every
   substantial phase.
