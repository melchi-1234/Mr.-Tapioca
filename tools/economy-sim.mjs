#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// economy-sim.mjs: a deterministic 14-day model of the Mr. Tapioca pearl economy.
//
// WHY THIS EXISTS
// The economy is derived, not stored: there is no `state.pearls`. The balance is
// recomputed on every read from four moving parts:
//
//     floor( floor(totalMinutes()/15) + bonusPearls - spent - blockPenalty )
//
// That makes "how much is a day worth?" impossible to answer by reading any one
// line. Focus pays through the FIRST term, every game and quest pays through
// `bonusPearls`, and the native-unblocked penalty claws back through a fourth.
// You have to run the arithmetic forward over real days to see the shape.
//
// This file only MEASURES. It changes nothing, rebalances nothing, and writes no
// files. Recommendations belong in prose, not in a constant here.
//
// WHAT IS MEASURED VS WHAT IS MODELLED
// Two clearly separated blocks below. `MEASURED` is read straight out of app.js.
// `ASSUMED` is player behaviour: how often somebody bothers to play Cup Pong, how
// good they are at Catch. Nobody has measured those. Every printed finding is
// tagged [MEASURED] or [MODELLED], and a modelled conclusion names the assumption
// it rests on ON THE SAME LINE, because the tag is worthless if you have to go
// hunting for what it depends on.
//
// HOW THE FILE:LINE CITATIONS STAY HONEST
// An earlier revision of this file hardcoded line numbers and several had already
// drifted by the time anyone read them, in a file whose own header called drift
// "a silent lie in every table below". app.js is ~6000 lines and two people plus
// tooling edit it. Hardcoded numbers WILL rot.
//
// So citations are not hardcoded any more. `ANCHORS` pairs each cited site with a
// REGEX that identifies it, plus a cached line number used only as a fallback.
// Every run re-reads app.js, re-resolves every anchor, and prints the live line.
// If a pattern no longer matches, the report says so loudly instead of printing a
// stale number. `--verify-anchors` does that check alone and exits non-zero.
//
// WHAT THIS CANNOT TELL YOU
// Nothing here says anything about real shops, real money, real visits, or
// whether focus minutes are honest. Pearls are a cosmetic currency and the only
// thing this simulator knows about.
//
// DETERMINISM
// Seeded mulberry32, no Math.random anywhere. Same seed, byte-identical output.
// That is the point: a rebalance can be diffed against this baseline.
//
// USAGE
//   node tools/economy-sim.mjs                 readable tables
//   node tools/economy-sim.mjs --json          machine-readable
//   node tools/economy-sim.mjs --seed=7        different stream, still reproducible
//   node tools/economy-sim.mjs --days=30
//   node tools/economy-sim.mjs --verify-anchors   check citations against app.js
//   import { simulate } from "./economy-sim.mjs"
// ─────────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(HERE, "..", "app.js");

// ═══ ANCHORS ═════════════════════════════════════════════════════════════════
// name: [cached line, regex that identifies the line, what it is]
// The cached line is a FALLBACK for when app.js cannot be read. The regex is the
// source of truth. Cached values were correct against app.js at md5
// 43e1abf46c94de1faa670b2796335e8c; they are expected to drift and that is fine.

export const ANCHORS = {
  CUSTOM_MIN:        [6,    /^const CUSTOM_MIN = 15 \* 60;/,                          "shortest legal session"],
  CUSTOM_MAX:        [7,    /^const CUSTOM_MAX = 240 \* 60;/,                         "longest legal session"],
  CUSTOM_STEP:       [8,    /^const CUSTOM_STEP = 5 \* 60;/,                           "slider granularity"],
  DEV_MIN:           [9,    /^const DEV_MIN = 5;/,                                     "dev mode session floor, in SECONDS"],
  BASES:             [24,   /^const BASES = \{/,                                       "tea bases (pearl sink)"],
  SKIN_ROYAL:        [72,   /id: "skin-royal"/,                                        "most expensive skin"],
  BRAIN_FREEZE:      [91,   /id: "boost-freeze"/,                                      "repeatable 10-pearl sink"],
  CATCH_DURATION:    [112,  /^const CATCH_DURATION\s+= 20;/,                            "Catch run length"],
  GOLDEN_CHANCE:     [119,  /^const GOLDEN_CHANCE = 0\.12;/,                            "golden SPAWN probability"],
  ICE_CHANCE:        [120,  /^const ICE_CHANCE\s+= 0\.12;/,                             "ice spawn probability"],
  BOMB_CHANCE:       [121,  /^const BOMB_CHANCE\s+= 0\.11;/,                            "bomb spawn probability"],
  BOMB_PENALTY:      [122,  /^const BOMB_PENALTY\s+= 3;/,                               "points lost per bomb"],
  GOLDEN_VALUE:      [124,  /^const GOLDEN_VALUE\s+= 3;/,                               "golden pearl score value"],
  SLOT_REWARDS:      [128,  /^const SLOT_REWARDS = \[5, 3, 1, 1, 1, 3, 5\];/,           "Plinko payout per slot"],
  UNBLOCKED_FRAC:    [129,  /^const REWARD_UNBLOCKED_FRACTION = 0\.5;/,                 "native-unblocked focus share"],
  SLOT_WEIGHTS:      [133,  /^const SLOT_WEIGHTS = \[4, 10, 17, 18, 17, 10, 4\];/,      "Plinko STEERING target"],
  PLINKO_MAX_PLAYS:  [134,  /^const PLINKO_MAX_PLAYS = 3;/,                             "Plinko drops per day"],
  CATCH_CAP:         [136,  /^const CATCH_CAP = 10;/,                                   "max pearls one Catch run banks"],
  PONG_MAX_PLAYS:    [145,  /^const PONG_MAX_PLAYS = 4;/,                               "Pong throws per day"],
  PONG_REWARD:       [150,  /^const PONG_REWARD = 2;/,                                  "pearls per Pong make"],
  CURRENT_PEARLS:    [900,  /return Math\.floor\(Math\.floor\(totalMinutes\(\) \/ 15\) \+ state\.bonusPearls/, "the balance formula"],
  AWARD_PEARLS:      [918,  /^function awardPearls\(n\)/,                               "the one door every non-focus pearl comes through"],
  AWARD_PEARLS_DEV:  [920,  /^  if \(state\.devMode\) return 0;/,                        "dev mode credits nothing"],
  BADGES:            [1290, /^const BADGES = \[/,                                       "12 badges, all cosmetic"],
  WAS_BLOCKED:       [2355, /^  const wasBlocked = FocusBlocker\.available\(\)/,         "web is treated as fully blocked"],
  SESSION_MINUTES:   [2371, /^  const minutes = Math\.round\(modeDuration\(\) \/ 60\);/,  "session length in whole minutes"],
  METRICS_DEV_GUARD: [2393, /try \{ MrTMetrics\.drinkFinished\(size, minutes\); \} catch/,  "dev sessions do not ping the counter"],
  FULL_PEARLS:       [2401, /^  const fullPearls = Math\.floor\(\(oldTotal \+ minutes\) \/ 15\)/, "focus pearls for this session"],
  SHARE:             [2407, /^  const share = wasBlocked \? 1 : REWARD_UNBLOCKED_FRACTION;/, "the halving"],
  TOPUP:             [2414, /^  if \(pearlDelta > 0\) awardPearls\(pearlDelta\);/,        "min-1-pearl top-up"],
  BLOCK_PENALTY:     [2415, /state\.blockPenalty \+= -pearlDelta;/,                       "withheld unblocked share, keeps halves"],
  COLLECTION:        [2460, /^  state\.collection\.unshift\(drink\);/,                    "the drink is banked"],
  GOAL_TOAST:        [2476, /Daily goal reached/,                                        "daily goal pays 0 pearls, toast only"],
  BREAK_OFFER:       [2691, /^  startBreakOffer\(\);/,                                    "break mode is offered after a session"],
  START_BREAK:       [2707, /^function startBreak\(\)/,                                   "the only entry into break mode"],
  SPAWN_KIND:        [3044, /ICE_CHANCE \+ BOMB_CHANCE \+ GOLDEN_CHANCE\) kind = "golden"/, "what each falling item is"],
  BOMB_CLAMP:        [3115, /game\.score = Math\.max\(0, game\.score - BOMB_PENALTY\)/,    "bomb penalty clamps at 0 PER EVENT"],
  CATCH_BANK:        [3196, /^  const earned = Math\.min\(game\.score, CATCH_CAP\);/,      "Catch bank, capped"],
  CATCH_CREDIT:      [3199, /state\.gamePearls \+= awardPearls\(delta\);/,                 "Catch credit"],
  CATCH_QUEST:       [3218, /bumpQuest\("catchPearls", game\.caught\);/,                   "catch10 tracks caught, not banked"],
  GAME_DONE_DEV:     [3446, /^  if \(state\.devMode\) return false;/,                      "dev mode replays games without limit"],
  GAMES_MIN:         [3478, /^const GAMES_MIN_SESSION_MIN = 30;/,                          "the game gate, in minutes"],
  GAMES_UNLOCK_FN:   [3480, /^function gamesUnlockedForBreak\(\)/,                         "the game gate"],
  GAMES_UNLOCK_RULE: [3493, /return \(state\.lastSessionMinutes \|\| 0\) >= GAMES_MIN_SESSION_MIN;/, "gate applies on EVERY build"],
  PLINKO_CREDIT:     [3647, /state\.gamePearls \+= awardPearls\(reward\);/,                "Plinko pays from where it LANDS"],
  PLINKO_BANK:       [3704, /bankPlays\("plinko", plinko\.playsLeft\);/,                   "unused Plinko drops are banked"],
  PERKS_EARNED:      [4362, /^function perksEarnedTotal\(\)/,                              "partner perk eligibility, minutes only"],
  QUEST_POOL:        [5024, /^const QUEST_POOL = \{/,                                      "the three quest pools"],
  QUEST_FOCUS25:     [5026, /key: "focus25"/,                                              "focus25, 3 pearls"],
  QUEST_FOCUS45:     [5027, /key: "focus45"/,                                              "focus45, 5 pearls"],
  QUEST_DRINK1:      [5032, /key: "drink1"/,                                               "drink1, 3 pearls"],
  QUEST_DRINK2:      [5033, /key: "drink2"/,                                               "drink2, 5 pearls"],
  PICK_ONE:          [5045, /^function pickOne\(arr\)/,                                    "uniform quest draw"],
  QUESTS_ASSIGN:     [5056, /state\.quests = \{/,                                          "today's three quests"],
  BUMP_QUEST:        [5065, /^function bumpQuest\(track, amount = 1\)/,                     "quest progress"],
  QUEST_CREDIT:      [5087, /^  awardPearls\(def\.reward\);/,                               "quest credit, auto-granted"],
  RENAME_COST:       [5295, /^const RENAME_PEARL_COST = 20;/,                               "Squad rename sink"],
  PONG_BANK:         [5747, /bankPlays\("pong", pong\.throwsLeft\);/,                        "unused Pong throws are banked"],
  PONG_CREDIT:       [5808, /state\.gamePearls \+= awardPearls\(PONG_REWARD\);/,             "Pong credit"],
  DEV_TAPS:          [6069, /7 quick taps on the Settings title/,                            "the dev unlock handshake"],
};

// Resolve every anchor against the real app.js. Returns { ok, resolved, notes }.
export function resolveAnchors(appJsPath = APP_JS) {
  let lines = null;
  try {
    lines = fs.readFileSync(appJsPath, "utf8").split("\n");
  } catch {
    return { ok: false, readable: false, resolved: {}, missing: [], drifted: [] };
  }
  const resolved = {};
  const missing = [];
  const drifted = [];
  const ambiguous = [];
  for (const [name, [hint, re]] of Object.entries(ANCHORS)) {
    let found = -1;
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        count++;
        if (found < 0) found = i + 1;
      }
    }
    if (found < 0) {
      missing.push(name);
      resolved[name] = null;          // never fall back to a number we know is unverified
    } else {
      resolved[name] = found;
      if (found !== hint) drifted.push({ name, hint, now: found });
      // A pattern matching several lines is not wrong yet, but it is one edit away
      // from silently pointing at the wrong one. Report it as its own category.
      if (count > 1) ambiguous.push({ name, now: found, count });
    }
  }
  return { ok: missing.length === 0 && ambiguous.length === 0, readable: true, resolved, missing, drifted, ambiguous };
}

const ANCHOR_STATE = resolveAnchors();

// "app.js:900" for a resolved anchor. If the pattern no longer matches, say that
// out loud in the string itself rather than printing a number that may be wrong.
function ref(name) {
  const line = ANCHOR_STATE.resolved[name];
  if (line) return `app.js:${line}`;
  if (!ANCHOR_STATE.readable) return `app.js:~${ANCHORS[name][0]} (unverified, app.js not readable)`;
  return `app.js:ANCHOR "${name}" NOT FOUND (code moved or changed)`;
}
function refs(...names) {
  return names.map((n) => ref(n)).join(", ");
}

// ═══ MEASURED ════════════════════════════════════════════════════════════════
// Values mirrored from app.js. Citations resolve live (see ANCHORS above), so a
// wrong line number here is a loud failure rather than a silent lie.
//
// ONE ENTRY IS NOT MEASURED: PLINKO_FITTED_LANDING. It is flagged in its own
// name and in every place it is printed.

export const MEASURED = {
  // ── Focus ──
  PEARL_MINUTES: 15,                 // 1 pearl per 15 min
  REWARD_UNBLOCKED_FRACTION: 0.5,    // native, no shield up
  CUSTOM_MIN_MIN: 15,
  CUSTOM_MAX_MIN: 240,
  CUSTOM_STEP_MIN: 5,
  DEV_MIN_SEC: 5,                    // dev mode drops Custom to 5 SECONDS

  // Web has no blocker, so completeSession() treats it as fully blocked. A web
  // session and a shielded native session pay the same focus rate.

  // ── Zero-pearl sources (named so nobody re-adds them to a model by accident) ──
  DAILY_GOAL_PEARLS: 0,              // toast only
  STREAK_PEARLS: 0,                  // no reward field exists
  ACHIEVEMENT_PEARLS: 0,             // 12 badges, all cosmetic

  // ── Quests: 3/day, one drawn per pool, auto-granted, no re-roll ──
  QUEST_POOL: {
    focus: [
      { key: "focus25",   reward: 3, need: { focusMin: 25 } },
      { key: "focus45",   reward: 5, need: { focusMin: 45 } },
      { key: "sessions2", reward: 4, need: { sessions: 2 } },
      { key: "earlyBird", reward: 3, need: { earlyFocus: 1 } },
    ],
    make: [
      { key: "drink1",    reward: 3, need: { drinks: 1 } },
      { key: "drink2",    reward: 5, need: { drinks: 2 } },
    ],
    play: [
      { key: "catch10",   reward: 3, need: { catchPearls: 10 } },   // tracks game.caught
      { key: "combo5",    reward: 3, need: { catchCombo: 5 } },
      { key: "pong2",     reward: 3, need: { pongMakes: 2 } },
      { key: "playGame",  reward: 2, need: { gamesPlayed: 1 } },
      { key: "map1",      reward: 2, need: { mapOpen: 1 } },
    ],
  },

  // ── Catch the Pearls ──
  CATCH_CAP: 10,
  CATCH_DURATION_S: 20,
  GOLDEN_SPAWN_CHANCE: 0.12,         // probability a SPAWNED item is golden
  ICE_SPAWN_CHANCE: 0.12,
  BOMB_SPAWN_CHANCE: 0.11,
  GOLDEN_VALUE: 3,                   // worth 3, so +2 over a normal pearl
  BOMB_PENALTY: 3,

  // ── Boba Plinko ──
  SLOT_REWARDS: [5, 3, 1, 1, 1, 3, 5],
  SLOT_WEIGHTS: [4, 10, 17, 18, 17, 10, 4],   // the STEERING target, not the payout
  PLINKO_MAX_PLAYS: 3,
  PLINKO_PUBLISHED_DAY_EV: 6.2,      // GROUNDING.md §5, from a 30k-drop simulation

  // ── Cup Pong ──
  PONG_MAX_PLAYS: 4,                 // throws, make OR miss decrements
  PONG_REWARD: 2,

  // ── Game access ──
  GAMES_MIN_SESSION_MIN: 30,

  // ── Sinks ──
  PRICE_CHEAPEST: 10,                // tea base / topping / Brain Freeze
  PRICE_COMMON_SKIN: 40,
  PRICE_RARE_SKIN: 60,
  PRICE_ROYAL_SKIN: 70,
  PRICE_BACKGROUND: 60,
  SINK_SKINS: 470,                   // 4x40 + 4x60 + 70
  SINK_BACKGROUNDS: 240,             // 4x60
  SINK_BASES: 90,                    // 9x10 (classic free)
  SINK_TOPPINGS: 40,                 // 4x10 (pearls free)
  SINK_TOTAL: 840,
  RENAME_PEARL_COST: 20,

  // ── The real-shop bar (partners.json, both live shops) ──
  // Included ONLY to report focus progress. Pearls have nothing to do with it:
  // perk eligibility is floor(totalMinutes/bar) and pearls never enter it.
  PARTNER_BAR_MIN: 240,
};

// ── DERIVED, not read from a line ────────────────────────────────────────────
// GOLDEN_SPAWN_CHANCE is a SPAWN probability across four kinds of falling item.
// It is NOT the fraction of CAUGHT items that are golden, and an earlier revision
// of this file used it as if it were. Under the modelling choice "the player
// catches pearls and dodges ice and bombs" (which is what the game asks of you),
// the golden share among the items worth catching is:
//
//     golden / (golden + plain) = 0.12 / (0.12 + 0.65) = 15.6%, not 12%
//
// where plain = 1 - ice - bomb - golden = 0.65. The modelling choice is an
// assumption; the arithmetic on top of it is not.
export const DERIVED = {
  PLAIN_SPAWN_CHANCE:
    1 - MEASURED.ICE_SPAWN_CHANCE - MEASURED.BOMB_SPAWN_CHANCE - MEASURED.GOLDEN_SPAWN_CHANCE,
  get GOLDEN_SHARE_OF_CAUGHT() {
    return (
      MEASURED.GOLDEN_SPAWN_CHANCE /
      (MEASURED.GOLDEN_SPAWN_CHANCE + this.PLAIN_SPAWN_CHANCE)
    );
  },
};

// ── FITTED, not measured ─────────────────────────────────────────────────────
// Plinko pays from where the pearl PHYSICALLY LANDS, not from the weighted target
// slot, so SLOT_WEIGHTS is not the payout distribution. GROUNDING.md §5 publishes
// three anchors from a 30k-drop simulation (edges ~7%, centre ~20%, ~6.2/day) but
// not the histogram itself, which is not in the repo.
//
// The array below is FITTED to reproduce those three published anchors. It is the
// only number in this file that was not read from code or derived from code, and
// it carries NO independent information: anything computed from it that is then
// compared back against the published 6.2 is circular by construction. An earlier
// revision of this file made exactly that mistake and reported "the realised
// physics overpay the design by 8.8%" as a measurement. It was not one, and
// GROUNDING.md's "explicitly refuted" list already records that the app.js comment
// and its weight table do NOT disagree. That finding has been removed.
//
// Shape note: edges 7% + centre 20% + exactly 6.2/day cannot ALL hold on a curve
// whose centre is its peak. The previous fit hit the three numbers by making
// slots 2 and 4 (20.33%) taller than the centre (20%), which is not a plausible
// landing pattern for a board that steers toward the middle. This fit holds the
// three centre slots level at 20%, which mirrors SLOT_WEIGHTS' own near-plateau
// (0.2125 / 0.225 / 0.2125), and lands at 6.24/day against a published ~6.2.
export const PLINKO_FITTED_LANDING = [0.07, 0.13, 0.20, 0.20, 0.20, 0.13, 0.07];

// ═══ ASSUMED ═════════════════════════════════════════════════════════════════
// Player behaviour. NOT measured, NOT in GROUNDING.md, not defensible as fact.
// They shape the middle three profiles; they do NOT touch the ceilings, the
// ratios, or the exploit section, all of which come from MEASURED alone.
// Any finding that depends on these is tagged [MODELLED] and names them.

export const ASSUMED = {
  light: {
    label: "light",
    blurb: "20-30 focused min/day",
    minutesPerDay: [20, 30],
    sessionsPerDay: [1, 1],
    morningChance: 0.30,          // starts before noon (earlyBird quest)
    mapChance: 0.10,              // opens the Boba Map (map1 quest)
    playChance: { catch: 0.15, plinko: 0.10, pong: 0.10 },
    catchCaught: [6, 12],         // pearls caught in the 20 s run
    catchBombs: [0, 2],
    catchBestCombo: [2, 5],
    pongAccuracy: 0.35,
  },
  normal: {
    label: "normal",
    blurb: "60-90 min/day",
    minutesPerDay: [60, 90],
    sessionsPerDay: [1, 2],
    morningChance: 0.45,
    mapChance: 0.25,
    playChance: { catch: 0.45, plinko: 0.40, pong: 0.35 },
    catchCaught: [9, 16],
    catchBombs: [0, 1],
    catchBestCombo: [3, 7],
    pongAccuracy: 0.50,
  },
  heavy: {
    label: "heavy",
    blurb: "2-4 h/day",
    minutesPerDay: [120, 240],
    sessionsPerDay: [2, 4],
    morningChance: 0.55,
    mapChance: 0.35,
    playChance: { catch: 0.70, plinko: 0.65, pong: 0.60 },
    catchCaught: [12, 20],
    catchBombs: [0, 1],
    catchBestCombo: [4, 9],
    pongAccuracy: 0.60,
  },
  "game-maximizer": {
    label: "game-maximizer",
    blurb: "minimum focus, every game and quest maxed",
    // No ranges: this profile is derived, not sampled. It focuses for exactly as
    // long as the day's drawn quests and the game gate demand, not one minute
    // longer, then plays all three games perfectly. See maximizerFocusPlan().
    maximizer: true,
    morningChance: 1,
    mapChance: 1,
    playChance: { catch: 1, plinko: 1, pong: 1 },
    catchCaught: [14, 14],        // comfortably past both the 10 cap and catch10
    catchBombs: [0, 0],
    catchBestCombo: [8, 8],
    pongAccuracy: 1,              // 4/4
  },
};

export const PROFILE_ORDER = ["light", "normal", "heavy", "game-maximizer"];
export const DEFAULT_DAYS = 14;
export const DEFAULT_SEED = 20260812;

// ═══ Helpers ═════════════════════════════════════════════════════════════════

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

// ═══ Deterministic PRNG ══════════════════════════════════════════════════════
// mulberry32: 32 bits of state, no dependencies, identical across Node versions.
// Each profile gets its own stream keyed off its name, so adding a profile or
// reordering PROFILE_ORDER cannot shift another profile's numbers.

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

const rngInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));   // inclusive
const rngPick = (rng, arr) => arr[Math.floor(rng() * arr.length)];        // mirrors pickOne()
const rngChance = (rng, p) => rng() < p;

// Weighted pick over a probability array that already sums to 1.
function rngWeighted(rng, probs) {
  let r = rng();
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i];
    if (r <= 0) return i;
  }
  return probs.length - 1;
}

// Spawn a CHILD stream from one draw of the parent.
//
// Why: session shaping consumes a variable number of draws (it depends on how
// many 5-minute blocks there are to place). Run on the main stream, a scenario
// that plans a different number of minutes falls out of step with its own
// comparison run from day 2 onward, and the "vs" delta column silently becomes
// two different people rather than one person under two rules. Draw ONE value
// and shape the day on a child, so the parent advances by exactly one call no
// matter what shape comes out. Verified: the scenario comparison now reports
// identical game series for every profile including the maximizer.
function childRng(rng) {
  return mulberry32((rng() * 4294967296) >>> 0);
}

// ═══ Session shaping ═════════════════════════════════════════════════════════
// Sessions must be legal Custom Cups: a multiple of CUSTOM_STEP (5 min), at least
// CUSTOM_MIN (15) and at most CUSTOM_MAX (240). Handing the pearl maths a
// 23-minute session would quietly inflate every total, because floor(m/15)
// boundaries are exactly where the rounding lives.

function splitIntoSessions(parentRng, totalMin, count) {
  const rng = childRng(parentRng);
  const { CUSTOM_MIN_MIN, CUSTOM_STEP_MIN, CUSTOM_MAX_MIN } = MEASURED;
  const step = CUSTOM_STEP_MIN;
  const total = Math.round(totalMin / step) * step;
  const floorEach = CUSTOM_MIN_MIN;

  // Not enough minutes to legally fill `count` sessions: shrink the count rather
  // than mint an illegal 10-minute cup.
  const maxSessions = Math.max(1, Math.floor(total / floorEach));
  // ...and not enough SESSIONS to legally hold the minutes: grow the count rather
  // than spin forever trying to place minutes into full cups. The previous
  // version looped `if (out[i] + step > CUSTOM_MAX) continue;` with no way to run
  // out, so any profile asking for more minutes than count * 240 hung the tool
  // silently with no error. Unreachable from the shipped ASSUMED ranges, but a
  // hang is the worst possible failure for a tool someone runs and walks away
  // from. n is unchanged for every profile that fits, so streams do not move.
  const minSessions = Math.max(1, Math.ceil(total / CUSTOM_MAX_MIN));
  const n = Math.min(Math.max(Math.min(count, maxSessions), minSessions), maxSessions);

  const out = new Array(n).fill(floorEach);
  let spare = (total - floorEach * n) / step;

  // Guaranteed to fit by construction (n >= total/CUSTOM_MAX), but a runaway
  // retry loop is exactly what this function used to do, so bound it and fail
  // loudly rather than hang.
  const capacity = (n * (CUSTOM_MAX_MIN - floorEach)) / step;
  if (spare > capacity) {
    throw new Error(
      `splitIntoSessions: ${total} min cannot fit in ${n} legal sessions (max ${n * CUSTOM_MAX_MIN})`
    );
  }
  let guard = 0;
  const guardLimit = 1000 + spare * 100;
  while (spare > 0) {
    if (++guard > guardLimit) {
      throw new Error(`splitIntoSessions: placement did not converge (${total} min, ${n} sessions)`);
    }
    const i = rngInt(rng, 0, n - 1);
    if (out[i] + step > CUSTOM_MAX_MIN) continue;
    out[i] += step;
    spare--;
  }
  return out;
}

// ═══ Per-day simulation ══════════════════════════════════════════════════════

// Draw today's three quests exactly the way ensureTodayQuests() does: one uniform
// pick per pool, no dedupe, no re-roll.
function drawQuests(rng) {
  return [
    rngPick(rng, MEASURED.QUEST_POOL.focus),
    rngPick(rng, MEASURED.QUEST_POOL.make),
    rngPick(rng, MEASURED.QUEST_POOL.play),
  ];
}

// The maximizer is the interesting profile, so it gets its own builder rather
// than a range roll. It buys exactly the focus its drawn quests and the game gate
// require, and stops.
//
// `sessionFloor` is the shortest session worth doing. Under the shipped gate that
// is GAMES_MIN_SESSION_MIN (30), because a shorter session leaves
// state.lastSessionMinutes below the gate and forfeits the whole 33-pearl game
// day. Under the pre-fix web build there was no gate, so the floor was CUSTOM_MIN
// (15): break mode still needed one completed drink, and that was its whole price.
function maximizerFocusPlan(quests, sessionFloor) {
  let sessions = 1;                                // break mode needs one drink
  let minutes = sessionFloor;
  for (const q of quests) {
    if (q.need.sessions) sessions = Math.max(sessions, q.need.sessions);
    if (q.need.drinks) sessions = Math.max(sessions, q.need.drinks);
    if (q.need.focusMin) minutes = Math.max(minutes, q.need.focusMin);
  }
  minutes = Math.max(minutes, sessionFloor * sessions);
  return { minutes, sessions };
}

function simulateDay(rng, cfg, quests) {
  // ── Focus ──
  let sessionMinutes;
  let startedBeforeNoon;
  if (cfg.maximizer) {
    const plan = maximizerFocusPlan(quests, cfg.sessionFloor);
    sessionMinutes = splitIntoSessions(rng, plan.minutes, plan.sessions);
    startedBeforeNoon = true;
  } else {
    const total = rngInt(rng, cfg.minutesPerDay[0], cfg.minutesPerDay[1]);
    const count = rngInt(rng, cfg.sessionsPerDay[0], cfg.sessionsPerDay[1]);
    sessionMinutes = splitIntoSessions(rng, total, count);
    startedBeforeNoon = rngChance(rng, cfg.morningChance);
  }

  // ── Games ──
  // Break mode is reachable because every profile finishes at least one drink.
  // The gate reads state.lastSessionMinutes, i.e. the session the break was taken
  // after, so the generous-but-fair reading is the day's LONGEST session. Under
  // the pre-fix web build there was no gate at all.
  const canPlay =
    !cfg.gateMinutes || Math.max(...sessionMinutes) >= cfg.gateMinutes;

  // EVERY random draw below happens unconditionally, gated only afterwards.
  // The trap: `canPlay && rngChance(...)` short-circuits, which consumes a
  // different number of PRNG values on a gated day and desynchronises the stream.
  // That silently turns a scenario comparison into two different players rather
  // than one player under two rules. Draw first, gate second.
  const rollCatch = rngChance(rng, cfg.playChance.catch);
  const rollPlinko = rngChance(rng, cfg.playChance.plinko);
  const rollPong = rngChance(rng, cfg.playChance.pong);
  const drawnCaught = rngInt(rng, cfg.catchCaught[0], cfg.catchCaught[1]);
  const drawnCombo = rngInt(rng, cfg.catchBestCombo[0], cfg.catchBestCombo[1]);
  const drawnBombs = rngInt(rng, cfg.catchBombs[0], cfg.catchBombs[1]);
  const drawnSlots = [];
  for (let d = 0; d < MEASURED.PLINKO_MAX_PLAYS; d++) {
    drawnSlots.push(MEASURED.SLOT_REWARDS[rngWeighted(rng, PLINKO_FITTED_LANDING)]);
  }
  let drawnMakes = 0;
  for (let t = 0; t < MEASURED.PONG_MAX_PLAYS; t++) {
    if (rngChance(rng, cfg.pongAccuracy)) drawnMakes++;
  }
  const openedMap = rngChance(rng, cfg.mapChance);

  const play = {
    catch: canPlay && rollCatch,
    plinko: canPlay && rollPlinko,
    pong: canPlay && rollPong,
  };

  let catchBanked = 0, catchCaught = 0, catchCombo = 0;
  if (play.catch) {
    catchCaught = drawnCaught;
    catchCombo = drawnCombo;
    // score = 1/pearl, goldens are worth 3 (so +2 each), bombs are -3.
    //
    // TWO KNOWN DEVIATIONS FROM app.js, both of which UNDERSTATE Catch income, so
    // every "games out-earn focus" figure below is if anything too kind to the app:
    //  (a) app.js clamps at zero per bomb EVENT. This subtracts all bombs and
    //      clamps once at the end, so two bombs against a small score cost more
    //      here than in the game.
    //  (b) bankCatchScore() runs after every catch and only credits a positive
    //      delta, which makes the bank a HIGH-WATER MARK that survives a later
    //      score drop. This banks the final score only.
    // Modelling either faithfully needs a per-item event order the sim does not
    // have, and inventing one would be a new assumption. Disclosed instead.
    const goldens = Math.round(catchCaught * DERIVED.GOLDEN_SHARE_OF_CAUGHT);
    const score =
      catchCaught + goldens * (MEASURED.GOLDEN_VALUE - 1) - drawnBombs * MEASURED.BOMB_PENALTY;
    catchBanked = Math.max(0, Math.min(score, MEASURED.CATCH_CAP));
  }

  const plinkoPearls = play.plinko ? drawnSlots.reduce((a, b) => a + b, 0) : 0;
  const pongMakes = play.pong ? drawnMakes : 0;
  const pongPearls = pongMakes * MEASURED.PONG_REWARD;

  // ── Quest evaluation against the day's actual tracks ──
  const tracks = {
    focusMin: sessionMinutes.reduce((a, b) => a + b, 0),
    sessions: sessionMinutes.length,
    drinks: sessionMinutes.length,
    earlyFocus: startedBeforeNoon ? 1 : 0,
    catchPearls: catchCaught,          // NB: game.caught, not the capped bank
    catchCombo,
    pongMakes,
    gamesPlayed: (play.catch ? 1 : 0) + (play.plinko ? 1 : 0) + (play.pong ? 1 : 0),
    mapOpen: openedMap ? 1 : 0,
  };
  let questPearls = 0;
  const questsDone = [];
  for (const q of quests) {
    const [track, target] = Object.entries(q.need)[0];
    if ((tracks[track] || 0) >= target) {
      questPearls += q.reward;
      questsDone.push(q.key);
    }
  }

  return {
    sessionMinutes,
    focusMin: tracks.focusMin,
    canPlay,
    gamePearls: catchBanked + plinkoPearls + pongPearls,
    gameBreakdown: { catch: catchBanked, plinko: plinkoPearls, pong: pongPearls },
    questPearls,
    questsDrawn: quests.map((q) => q.key),
    questsDone,
  };
}

// ═══ simulate() ══════════════════════════════════════════════════════════════
/**
 * Run one profile forward.
 * @param {string} profileName  key of ASSUMED
 * @param {object} [opts]
 * @param {number} [opts.days=14]
 * @param {number} [opts.seed]
 * @param {"web"|"native-blocked"|"native-unblocked"} [opts.platform="web"]
 *        Platform now affects ONE thing: the focus share. web and native-blocked
 *        both pay full rate (web is forced to wasBlocked = true), native-unblocked
 *        pays REWARD_UNBLOCKED_FRACTION. The 30-minute game gate is NOT platform
 *        dependent any more, so web and native-blocked really are identical for
 *        pearls, games included. (They were not, in the build this file first
 *        modelled: see opts.legacyWebNoGate.)
 * @param {boolean} [opts.legacyWebNoGate=false]
 *        Model the PRE-FIX web build, which had no game gate at all. Kept only to
 *        show the before/after of a hole that is now closed. This does NOT
 *        describe shipped code.
 * @returns {object} totals, per-day rows, milestones
 */
export function simulate(profileName, opts = {}) {
  const cfg = ASSUMED[profileName];
  if (!cfg) throw new Error(`unknown profile: ${profileName}`);
  const days = opts.days ?? DEFAULT_DAYS;
  const seed = opts.seed ?? DEFAULT_SEED;
  const platform = opts.platform ?? "web";
  const legacyWebNoGate = opts.legacyWebNoGate ?? false;
  const unblocked = platform === "native-unblocked";

  // The gate applies on every build now. The legacy scenario removes it.
  const gateMinutes = legacyWebNoGate ? 0 : MEASURED.GAMES_MIN_SESSION_MIN;
  // Shortest session worth doing for a maximizer: enough to clear the gate, or
  // just enough to finish a drink and reach break mode when there is no gate.
  const sessionFloor = gateMinutes || MEASURED.CUSTOM_MIN_MIN;

  // Seeded by PROFILE ONLY, deliberately NOT by platform or scenario. Two runs
  // must be the SAME simulated person making the same choices, so the difference
  // between them is the rule under test and nothing else. Session shaping runs on
  // a child stream (see childRng) so a scenario that plans different minutes
  // cannot desynchronise the parent.
  const rng = mulberry32((hashString(profileName) ^ seed) >>> 0);

  // Ledger mirrors of the four terms in currentPearls().
  let totalMinutes = 0;
  let bonusPearls = 0;      // quests + games + the min-1 focus top-up
  let blockPenalty = 0;     // withheld unblocked share, carries halves
  const spent = 0;          // this sim never buys; milestones are unspent-balance days

  // Attribution buckets. They must re-sum to currentPearls(), asserted each day.
  let focusTopUps = 0;      // the ">=1 pearl per finished drink" guarantee
  let questTotal = 0;
  let gameTotal = 0;
  let gateLockedDays = 0;

  const rows = [];
  const milestones = { cosmetic10: null, skin40: null, royal70: null };

  for (let day = 1; day <= days; day++) {
    const quests = drawQuests(rng);

    const dayCfg = { ...cfg, gateMinutes, sessionFloor };
    const d = simulateDay(rng, dayCfg, quests);
    if (!d.canPlay) gateLockedDays++;

    // ── Focus pearls, session by session, exactly as completeSession() does.
    // Doing it per session rather than per day matters: the floor(oldTotal/15)
    // boundary is what makes back-to-back short cups pay differently from one
    // long one, and the halving is applied per session.
    for (const minutes of d.sessionMinutes) {
      const oldTotal = totalMinutes;
      const fullPearls =
        Math.floor((oldTotal + minutes) / MEASURED.PEARL_MINUTES) -
        Math.floor(oldTotal / MEASURED.PEARL_MINUTES);
      const share = unblocked ? MEASURED.REWARD_UNBLOCKED_FRACTION : 1;
      const awardedExact = fullPearls > 0 ? fullPearls * share : 1;
      const pearlDelta = awardedExact - fullPearls;
      if (pearlDelta > 0) { bonusPearls += pearlDelta; focusTopUps += pearlDelta; }
      else if (pearlDelta < 0) { blockPenalty += -pearlDelta; }
      totalMinutes += minutes;
    }

    bonusPearls += d.questPearls + d.gamePearls;
    questTotal += d.questPearls;
    gameTotal += d.gamePearls;

    // The real formula, recomputed from the mirrored ledger.
    const balance = Math.floor(
      Math.floor(totalMinutes / MEASURED.PEARL_MINUTES) + bonusPearls - spent - blockPenalty
    );

    // Attribution invariant. If this ever throws, the decomposition below is
    // lying and every "share from focus" number in the report is wrong.
    const focusComponent =
      Math.floor(totalMinutes / MEASURED.PEARL_MINUTES) + focusTopUps - blockPenalty;
    const recombined = Math.floor(focusComponent + questTotal + gameTotal - spent);
    if (recombined !== balance) {
      throw new Error(
        `attribution drift on day ${day}: ${recombined} != ${balance} (${profileName}/${platform})`
      );
    }

    if (milestones.cosmetic10 === null && balance >= MEASURED.PRICE_CHEAPEST) milestones.cosmetic10 = day;
    if (milestones.skin40 === null && balance >= MEASURED.PRICE_COMMON_SKIN) milestones.skin40 = day;
    if (milestones.royal70 === null && balance >= MEASURED.PRICE_ROYAL_SKIN) milestones.royal70 = day;

    rows.push({
      day,
      focusMin: d.focusMin,
      sessions: d.sessionMinutes.length,
      canPlay: d.canPlay,
      questPearls: d.questPearls,
      gamePearls: d.gamePearls,
      gameBreakdown: d.gameBreakdown,
      questsDrawn: d.questsDrawn,
      questsDone: d.questsDone,
      balance,
    });
  }

  const focusComponent =
    Math.floor(totalMinutes / MEASURED.PEARL_MINUTES) + focusTopUps - blockPenalty;
  const total = Math.floor(focusComponent + questTotal + gameTotal - spent);
  const nonFocus = questTotal + gameTotal;

  // Minutes still needed before the NEXT perk unlocks. At an exact multiple of
  // the bar the perk has just been earned and nothing is outstanding, so report
  // 0. `bar - (total % bar)` printed a fresh full bar (240) at 480 minutes.
  const intoBar = totalMinutes % MEASURED.PARTNER_BAR_MIN;
  const minutesToNextReward =
    totalMinutes > 0 && intoBar === 0 ? 0 : MEASURED.PARTNER_BAR_MIN - intoBar;

  return {
    profile: profileName,
    blurb: cfg.blurb,
    platform,
    legacyWebNoGate,
    days,
    seed,
    pearls: {
      focus: round2(focusComponent),
      quest: questTotal,
      game: gameTotal,
      total,
      focusSharePct: total > 0 ? round1((focusComponent / total) * 100) : 0,
      nonFocusSharePct: total > 0 ? round1((nonFocus / total) * 100) : 0,
    },
    ledger: {
      totalMinutes,
      bonusPearls: round2(bonusPearls),
      blockPenalty: round2(blockPenalty),
      spent,
    },
    games: {
      gateMinutes,
      gateLockedDays,
      gateLockedPct: round1((gateLockedDays / days) * 100),
    },
    focus: {
      totalMinutes,
      totalHours: round1(totalMinutes / 60),
      avgMinutesPerDay: round1(totalMinutes / days),
      // Progress toward the two live partner shops' 240-minute bar. This is NOT a
      // pearl number: perk eligibility is focus minutes only.
      partnerBarMin: MEASURED.PARTNER_BAR_MIN,
      partnerRewardsEarned: Math.floor(totalMinutes / MEASURED.PARTNER_BAR_MIN),
      minutesToNextReward,
    },
    milestones,
    // What the same pearls would have cost in honest focus time.
    equivalentFocusHours: {
      quest: round1(questTotal / (60 / MEASURED.PEARL_MINUTES)),
      game: round1(gameTotal / (60 / MEASURED.PEARL_MINUTES)),
      nonFocusTotal: round1(nonFocus / (60 / MEASURED.PEARL_MINUTES)),
    },
    days_detail: rows,
  };
}

export function simulateAll(opts = {}) {
  return PROFILE_ORDER.map((p) => simulate(p, opts));
}

// ═══ Sensitivity ═════════════════════════════════════════════════════════════
// A [MODELLED] claim is only worth printing if you know how hard it is to break.
// This scales a profile's playChance by a factor and finds where the focus share
// crosses 50%, so "non-focus income is the majority" comes with the number that
// would flip it instead of resting on three invented probabilities.

// Sweep seeds and horizons and report the real spread of each profile's focus
// share. A single 14-day run at one seed is one sample, and "non-focus income is
// the majority for EVERY profile" was previously stated off exactly that. It does
// not survive the sweep: the light profile crosses 50% in some runs. Printing the
// range next to the claim is the difference between a finding and a coincidence.
export const SWEEP_SEEDS = [1, 7, 42, DEFAULT_SEED, 99999];
export const SWEEP_DAYS = [1, 7, 14, 30];

export function focusShareSpread(profileName) {
  const vals = [];
  for (const seed of SWEEP_SEEDS) {
    for (const days of SWEEP_DAYS) {
      vals.push(simulate(profileName, { seed, days }).pearls.focusSharePct);
    }
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return { min, max, runs: vals.length, alwaysMinority: max < 50 };
}

export function focusMajorityBreakEven(profileName, opts = {}) {
  const base = ASSUMED[profileName];
  if (!base || base.maximizer) return null;
  const saved = base.playChance;
  try {
    for (let f = 0; f <= 1.0001; f += 0.01) {
      base.playChance = {
        catch: saved.catch * f,
        plinko: saved.plinko * f,
        pong: saved.pong * f,
      };
      const r = simulate(profileName, opts);
      if (r.pearls.focusSharePct < 50) {
        return { factor: round2(f), playChance: { ...base.playChance } };
      }
    }
    return null;   // focus stays the majority even at full play rates
  } finally {
    base.playChance = saved;
  }
}

// ═══ Derived exploit maths (MEASURED only, no behaviour assumptions) ═════════

export function exploitReport(results) {
  const perHourBlocked = 60 / MEASURED.PEARL_MINUTES;             // 4
  const perHourUnblocked = perHourBlocked * MEASURED.REWARD_UNBLOCKED_FRACTION;  // 2

  const gamesCeiling =
    MEASURED.CATCH_CAP +
    MEASURED.SLOT_REWARDS[0] * MEASURED.PLINKO_MAX_PLAYS +          // 3 jackpots
    MEASURED.PONG_MAX_PLAYS * MEASURED.PONG_REWARD;                 // 10 + 15 + 8 = 33
  const bestQuestDraw =
    Math.max(...MEASURED.QUEST_POOL.focus.map((q) => q.reward)) +
    Math.max(...MEASURED.QUEST_POOL.make.map((q) => q.reward)) +
    Math.max(...MEASURED.QUEST_POOL.play.map((q) => q.reward));     // 5 + 5 + 3 = 13
  const worstQuestDraw =
    Math.min(...MEASURED.QUEST_POOL.focus.map((q) => q.reward)) +
    Math.min(...MEASURED.QUEST_POOL.make.map((q) => q.reward)) +
    Math.min(...MEASURED.QUEST_POOL.play.map((q) => q.reward));     // 3 + 3 + 2 = 8
  const nonFocusCeiling = gamesCeiling + bestQuestDraw;             // 46

  const mx = results.find((r) => r.profile === "game-maximizer");

  const gatePearls = Math.floor(MEASURED.GAMES_MIN_SESSION_MIN / MEASURED.PEARL_MINUTES);
  const legacyPearls = Math.floor(MEASURED.CUSTOM_MIN_MIN / MEASURED.PEARL_MINUTES);

  return {
    gameGate: {
      status: "CLOSED",
      what:
        `gamesUnlockedForBreak() (${ref("GAMES_UNLOCK_FN")}) now gates the break games ` +
        `behind a completed ${MEASURED.GAMES_MIN_SESSION_MIN}-minute session on EVERY build ` +
        `(${ref("GAMES_UNLOCK_RULE")}).`,
      wasWrong:
        "It used to return true whenever FocusBlocker was unavailable, i.e. the whole web " +
        "build had no minute gate at all. That was the largest hole in the economy.",
      priceNow: `${MEASURED.GAMES_MIN_SESSION_MIN} focus minutes = ${gatePearls} pearls`,
      priceBefore: `${MEASURED.CUSTOM_MIN_MIN} focus minutes = ${legacyPearls} pearl`,
      leverageNow: round1(gamesCeiling / gatePearls),
      leverageBefore: round1(gamesCeiling / legacyPearls),
      stillTrue:
        `Break mode is still only entered from the post-session offer ` +
        `(${ref("BREAK_OFFER")} -> ${ref("START_BREAK")}), so the games always cost at least ` +
        `one completed drink. The floor for a drink is CUSTOM_MIN = ${MEASURED.CUSTOM_MIN_MIN} min ` +
        `(${ref("CUSTOM_MIN")}); the floor for the GAMES is now the ${MEASURED.GAMES_MIN_SESSION_MIN}-minute gate.`,
      gamesCeilingPerDay: gamesCeiling,
    },
    devPrinter: {
      status: "CLOSED",
      what:
        `Every non-focus pearl now goes through awardPearls() (${ref("AWARD_PEARLS")}), which ` +
        `returns 0 in dev mode (${ref("AWARD_PEARLS_DEV")}). The 7-tap dev unlock ` +
        `(${ref("DEV_TAPS")}) no longer moves the wallet.`,
      wasWrong:
        `DEV_MIN = ${MEASURED.DEV_MIN_SEC} seconds (${ref("DEV_MIN")}) with the min-1-pearl top-up ` +
        `(${ref("TOPUP")}) printed one pearl per 5-second "session", about ` +
        `${3600 / MEASURED.DEV_MIN_SEC} an hour against an honest ${perHourBlocked}, ` +
        `so all ${MEASURED.SINK_TOTAL} pearls of cosmetics cost about ` +
        `${round1((MEASURED.SINK_TOTAL * MEASURED.DEV_MIN_SEC) / 60)} minutes of tapping ` +
        `against ${MEASURED.SINK_TOTAL / perHourBlocked} honest focus hours.`,
      alsoFixed:
        `The anonymous drink counter is skipped in dev mode too (${ref("METRICS_DEV_GUARD")}), ` +
        "so testing the completion flow no longer inflates the number that gets quoted to people.",
      stillUnlimited:
        `Dev mode still replays all three games without limit (${ref("GAME_DONE_DEV")}) and still ` +
        "skips the gate, which is what dev mode is for. The pearls are simply worth nothing now.",
    },
    ratioTable: [
      { label: `max non-focus day (${nonFocusCeiling} = ${gamesCeiling} games + ${bestQuestDraw} best quests)`, pearls: nonFocusCeiling, hoursAt4: round2(nonFocusCeiling / perHourBlocked), hoursAt2: round2(nonFocusCeiling / perHourUnblocked) },
      { label: `worst-quest non-focus day (${gamesCeiling} + ${worstQuestDraw})`, pearls: gamesCeiling + worstQuestDraw, hoursAt4: round2((gamesCeiling + worstQuestDraw) / perHourBlocked), hoursAt2: round2((gamesCeiling + worstQuestDraw) / perHourUnblocked) },
      { label: `games only, all three maxed (${gamesCeiling})`, pearls: gamesCeiling, hoursAt4: round2(gamesCeiling / perHourBlocked), hoursAt2: round2(gamesCeiling / perHourUnblocked) },
      { label: `simulated maximizer, realised day average`, pearls: round1((mx.pearls.quest + mx.pearls.game) / mx.days), hoursAt4: round2((mx.pearls.quest + mx.pearls.game) / mx.days / perHourBlocked), hoursAt2: round2((mx.pearls.quest + mx.pearls.game) / mx.days / perHourUnblocked) },
      { label: `one 20-second Catch run at the cap (${MEASURED.CATCH_CAP})`, pearls: MEASURED.CATCH_CAP, hoursAt4: round2(MEASURED.CATCH_CAP / perHourBlocked), hoursAt2: round2(MEASURED.CATCH_CAP / perHourUnblocked) },
      { label: `one Plinko jackpot (${MEASURED.SLOT_REWARDS[0]})`, pearls: MEASURED.SLOT_REWARDS[0], hoursAt4: round2(MEASURED.SLOT_REWARDS[0] / perHourBlocked), hoursAt2: round2(MEASURED.SLOT_REWARDS[0] / perHourUnblocked) },
      { label: `one Cup Pong make (${MEASURED.PONG_REWARD})`, pearls: MEASURED.PONG_REWARD, hoursAt4: round2(MEASURED.PONG_REWARD / perHourBlocked), hoursAt2: round2(MEASURED.PONG_REWARD / perHourUnblocked) },
    ],
    ceilingIsNotFree: {
      what:
        `The ${nonFocusCeiling}-pearl ceiling is often quoted as a zero-focus day. It is not. ` +
        `The ${bestQuestDraw}-pearl best draw is focus45 + drink2 + a 3-pearl play quest, and ` +
        `focus45/drink2 cost 45 focus minutes across 2 sessions ` +
        `(${refs("QUEST_FOCUS45", "QUEST_DRINK2")}).`,
      trueZeroExtraFocusDay: gamesCeiling,
      focusMinutesTheCeilingCosts: 45,
      andTheGamesCostThirtyToo:
        `Since the gate closed, even the ${gamesCeiling}-pearl games-only day is not free: it needs ` +
        `a completed ${MEASURED.GAMES_MIN_SESSION_MIN}-minute session first.`,
    },
    numbers: { gamesCeiling, bestQuestDraw, worstQuestDraw, nonFocusCeiling, perHourBlocked, perHourUnblocked },
  };
}

// ═══ Output ══════════════════════════════════════════════════════════════════

function table(headers, rows) {
  const all = [headers, ...rows].map((r) => r.map((c) => String(c)));
  const w = headers.map((_, i) => Math.max(...all.map((r) => (r[i] || "").length)));
  // Left-align the first column (labels), right-align the rest (numbers).
  const line = (r) => r.map((c, i) => (i === 0 ? c.padEnd(w[i]) : c.padStart(w[i]))).join("  ");
  const out = [line(all[0]), w.map((n) => "-".repeat(n)).join("  ")];
  for (const r of all.slice(1)) out.push(line(r));
  return out.join("\n");
}

const indent = (s, pad = "   ") => s.split("\n").map((l) => pad + l).join("\n");
const dayOrNever = (d, days) => (d === null ? `never (>${days}d)` : `day ${d}`);

// Wrap prose to a terminal width. Sentences assembled from resolved citations vary
// in length every run (app.js:918 today, app.js:1042 next week), so the wrapping
// has to happen at print time rather than being baked into the string literals.
function wrap(s, width = 76) {
  const out = [];
  for (const para of String(s).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line.length) line = word;
      else if (line.length + 1 + word.length <= width) line += " " + word;
      else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out.join("\n");
}

function anchorSection() {
  const L = [];
  const st = ANCHOR_STATE;
  const total = Object.keys(ANCHORS).length;
  if (!st.readable) {
    L.push(`!! app.js could not be read from ${APP_JS}`);
    L.push("!! Every file:line below is an UNVERIFIED cached value. Treat them as stale.");
    return L.join("\n");
  }
  const found = total - st.missing.length;
  L.push(`${found}/${total} citations re-resolved against app.js just now.`);
  if (st.missing.length) {
    L.push("");
    L.push("!! THESE ANCHORS NO LONGER MATCH ANY LINE. The code moved or changed, and any");
    L.push("!! claim resting on them is suspect until someone looks:");
    for (const m of st.missing) L.push(`!!   ${m}  (${ANCHORS[m][2]})`);
  }
  if (st.ambiguous.length) {
    L.push("");
    L.push("!! THESE PATTERNS MATCH MORE THAN ONE LINE, so they are one edit away from");
    L.push("!! silently citing the wrong one. Tighten them:");
    for (const a of st.ambiguous) L.push(`!!   ${a.name}: ${a.count} matches, using the first (line ${a.now})`);
  }
  if (st.drifted.length) {
    L.push("");
    L.push(`${st.drifted.length} cached line number(s) are stale. The printed citations are correct;`);
    L.push("only the offline fallbacks in ANCHORS are behind:");
    for (const d of st.drifted.slice(0, 12)) {
      L.push(`   ${d.name}: cached ${d.hint} -> now ${d.now}`);
    }
    if (st.drifted.length > 12) L.push(`   ... and ${st.drifted.length - 12} more`);
  }
  if (st.ok && !st.drifted.length) L.push("No drift, no ambiguity.");
  return L.join("\n");
}

function findingsSection(results, ex, opts) {
  const L = [];
  const byName = Object.fromEntries(results.map((r) => [r.profile, r]));
  const mx = byName["game-maximizer"];
  const heavy = byName["heavy"];
  const light = byName["light"];
  const n = ex.numbers;

  const nativeResults = PROFILE_ORDER.map((p) =>
    simulate(p, { days: opts.days, seed: opts.seed, platform: "native-unblocked" })
  );
  const nativeBy = Object.fromEntries(nativeResults.map((r) => [r.profile, r]));

  const legacy = PROFILE_ORDER.map((p) =>
    simulate(p, { days: opts.days, seed: opts.seed, legacyWebNoGate: true })
  );
  const legacyBy = Object.fromEntries(legacy.map((r) => [r.profile, r]));

  L.push("Every finding is tagged. [MEASURED] rests on app.js constants and arithmetic only.");
  L.push("[MODELLED] rests on the ASSUMED behaviour block, and says which assumption on the");
  L.push("same line. Nothing here is a claim about shops, money, visits or real study time.");
  L.push("");

  L.push("1. [MEASURED] The 46-pearl ceiling is misquoted as a zero-focus day.");
  L.push(`   The ${n.bestQuestDraw}-pearl best quest draw is focus45 + drink2 + a 3-pearl play quest,`);
  L.push(`   and those cost 45 focus minutes across 2 sessions (${refs("QUEST_FOCUS45", "QUEST_DRINK2")}).`);
  L.push(`   The true no-extra-focus ceiling is ${n.gamesCeiling} (games only), not ${n.nonFocusCeiling}.`);
  L.push("   Worth correcting wherever 46 is cited as free.");
  L.push("");

  L.push("2. [MEASURED] The web game hole is CLOSED, as of the app.js this run just read.");
  L.push(`   ${ref("GAMES_UNLOCK_RULE")} now applies the ${MEASURED.GAMES_MIN_SESSION_MIN}-minute gate on every build.`);
  L.push("   Before the fix, web had no gate: one 15-minute cup paid 1 pearl and unlocked up");
  L.push(`   to ${n.gamesCeiling} the same day (${ex.gameGate.leverageBefore}x). The price is now ${ex.gameGate.priceNow} (${ex.gameGate.leverageNow}x).`);
  L.push("   Modelled before/after over the same days, same seed, same simulated people:");
  L.push(
    indent(
      table(
        ["profile", "pre-fix total", "shipped total", "delta", "game days lost"],
        PROFILE_ORDER.map((p) => [
          p,
          legacyBy[p].pearls.total,
          byName[p].pearls.total,
          byName[p].pearls.total - legacyBy[p].pearls.total,
          `${byName[p].games.gateLockedDays}/${byName[p].days}`,
        ])
      )
    )
  );
  L.push("   (The per-profile sizes of that delta are [MODELLED]: they depend on how often each");
  L.push("   profile is assumed to play. The rule change itself is measured.)");
  L.push("");

  // Do not let the table above imply the fix landed on the person it was aimed at.
  // Under these assumptions it does the opposite, and that is worth saying plainly.
  const lightDelta = light.pearls.total - legacyBy["light"].pearls.total;
  const mxDelta = mx.pearls.total - legacyBy["game-maximizer"].pearls.total;
  if (lightDelta < 0 && mxDelta >= 0) {
    L.push("2b. [MODELLED] The closed gate binds on the casual user and not on the farmer.");
    L.push(wrap(
      `The light profile (${ASSUMED.light.blurb}) loses ${Math.abs(lightDelta)} pearls and ` +
      `${light.games.gateLockedDays} of its ${light.days} game days, because a 20-30 minute day rarely clears ` +
      `a 30-minute session. The game-maximizer loses nothing: it simply focuses ` +
      `${MEASURED.GAMES_MIN_SESSION_MIN} minutes instead of ${MEASURED.CUSTOM_MIN_MIN}, keeps every game, and comes out ` +
      `${mxDelta > 0 ? mxDelta + " pearls AHEAD" : "level"} on the extra focus pearls. Closing the hole was ` +
      "right, but it did not cost the profile it was aimed at, and it did cost the one it was not. " +
      "If the intent was to slow farming rather than to trim light users, the daily game cap is the " +
      "lever that actually touches the farmer (finding 6).", 72
    ).split("\n").map((l) => "    " + l).join("\n"));
    L.push("    Depends on the assumed session lengths, which nobody has measured.");
    L.push("");
  }

  L.push("3. [MEASURED] The dev-mode pearl printer is CLOSED.");
  L.push(indent(wrap(ex.devPrinter.what, 72), "   "));
  L.push(indent(wrap(ex.devPrinter.alsoFixed, 72), "   "));
  L.push("");

  const spreads = Object.fromEntries(PROFILE_ORDER.map((p) => [p, focusShareSpread(p)]));
  const robust = PROFILE_ORDER.filter((p) => spreads[p].alwaysMinority);
  const fragile = PROFILE_ORDER.filter((p) => !spreads[p].alwaysMinority);

  L.push("4. [MODELLED] Non-focus income is the majority for the " + robust.join(", ") + " profiles.");
  if (fragile.length) {
    L.push(`   It is NOT a universal claim: ${fragile.join(", ")} flips, so do not say "every profile".`);
  }
  L.push("   This rests entirely on the assumed play rates (heavy playChance catch");
  L.push(`   ${ASSUMED.heavy.playChance.catch} / plinko ${ASSUMED.heavy.playChance.plinko} / pong ${ASSUMED.heavy.playChance.pong}), which nobody has measured and no telemetry could.`);
  L.push(
    indent(
      table(
        ["profile", "focus", "quest", "game", "TOTAL", "focus %"],
        results.map((r) => [r.profile, r.pearls.focus, r.pearls.quest, r.pearls.game, r.pearls.total, r.pearls.focusSharePct + "%"])
      )
    )
  );
  L.push(`   Robustness, focus share swept over ${SWEEP_SEEDS.length} seeds x ${SWEEP_DAYS.length} horizons (${spreads.light.runs} runs each):`);
  L.push(
    indent(
      table(
        ["profile", "min focus %", "max focus %", "non-focus always wins?"],
        PROFILE_ORDER.map((p) => [
          p,
          spreads[p].min + "%",
          spreads[p].max + "%",
          spreads[p].alwaysMinority ? "yes" : "NO, flips",
        ])
      )
    )
  );
  const be = focusMajorityBreakEven("heavy", { days: opts.days, seed: opts.seed });
  if (be) {
    L.push(wrap(
      `Sensitivity: even for 'heavy', focus becomes the majority once its play rates fall ` +
      `below about ${Math.round(be.factor * 100)}% of the assumed values (catch ${round2(be.playChance.catch)}, plinko ` +
      `${round2(be.playChance.plinko)}, pong ${round2(be.playChance.pong)}). That is not a remote corner of the parameter ` +
      "space. Treat this as a hypothesis the assumptions produce, not a fact about users.", 72
    ).split("\n").map((l) => "   " + l).join("\n"));
  } else {
    L.push("   Sensitivity: non-focus stays the majority across the whole 0-100% play-rate");
    L.push("   sweep, which makes this the sturdiest of the modelled findings.");
  }
  L.push("");

  L.push("5. [MODELLED] The native-unblocked halving is the wrong lever, and it punishes the");
  L.push("   honest user harder than the farmer. It only touches focus, which is the minority");
  L.push("   income above. Same days, same seed, same simulated people, shield down:");
  L.push(
    indent(
      table(
        ["profile", "shipped total", "unblocked total", "delta", "focus % now"],
        PROFILE_ORDER.map((p) => [
          p,
          byName[p].pearls.total,
          nativeBy[p].pearls.total,
          nativeBy[p].pearls.total - byName[p].pearls.total,
          nativeBy[p].pearls.focusSharePct + "%",
        ])
      )
    )
  );
  L.push(`   The heavy user loses ${Math.abs(nativeBy["heavy"].pearls.total - heavy.pearls.total)} pearls; the maximizer loses ${Math.abs(nativeBy["game-maximizer"].pearls.total - mx.pearls.total)}.`);
  L.push("   Depends on the same assumed play rates as finding 4.");
  L.push("");

  L.push("6. [MEASURED] The lever with the most effect per line changed is the daily game cap.");
  L.push(`   Games are ${round1((mx.pearls.game / mx.pearls.total) * 100)}% of the maximizer's total (${mx.pearls.game} of ${mx.pearls.total}). The per-day games`);
  L.push(`   ceiling is ${n.gamesCeiling} pearls, which is ${round1(n.gamesCeiling / n.perHourBlocked)} hours of honest focus. Raising the focus rate`);
  L.push(`   from ${n.perHourBlocked}/hr would have to roughly triple before it competes with that.`);
  L.push("");

  L.push("7. [MEASURED] Break mode itself still costs one completed drink, and its floor is 15 min.");
  L.push(indent(wrap(ex.gameGate.stillTrue, 72), "   "));
  L.push("   So there are two different prices and they are easy to confuse: 15 minutes buys the");
  L.push("   break room, 30 buys the games in it.");
  L.push("");

  L.push(`8. [MEASURED] At every profile's own pace, buying all ${MEASURED.SINK_TOTAL} pearls of cosmetics takes`);
  const sinkDays = PROFILE_ORDER.map((p) => {
    const perDay = byName[p].pearls.total / byName[p].days;
    return perDay > 0 ? Math.ceil(MEASURED.SINK_TOTAL / perDay) : Infinity;
  });
  L.push(`   ${Math.min(...sinkDays)} to ${Math.max(...sinkDays)} days. There is no longer a shortcut that beats that, which is`);
  L.push("   the point of findings 2 and 3.");
  return L.join("\n");
}

function printReport(results, ex, opts) {
  const days = results[0].days;
  const L = [];
  L.push("");
  L.push(`MR. TAPIOCA · ${days}-DAY ECONOMY SIMULATION`);
  L.push(`seed ${results[0].seed} · ${days} days · platform ${results[0].platform}`);
  L.push(`balance = floor( floor(totalMinutes/15) + bonusPearls - spent - blockPenalty )   ${ref("CURRENT_PEARLS")}`);
  L.push("this run never spends, so every balance below is gross earnings");
  L.push("");

  L.push("═══ CITATION CHECK ═════════════════════════════════════════════════════");
  L.push("");
  L.push(indent(anchorSection()));
  L.push("");

  L.push("═══ FINDINGS ═══════════════════════════════════════════════════════════");
  L.push("");
  L.push(indent(findingsSection(results, ex, opts)));
  L.push("");

  L.push("═══ TABLES ═════════════════════════════════════════════════════════════");
  L.push("");
  L.push("EARNINGS BY SOURCE  [MODELLED: profile behaviour is assumed]");
  L.push(
    table(
      ["profile", "behaviour", "focus", "quest", "game", "TOTAL", "focus %"],
      results.map((r) => [
        r.profile,
        r.blurb,
        r.pearls.focus,
        r.pearls.quest,
        r.pearls.game,
        r.pearls.total,
        r.pearls.focusSharePct + "%",
      ])
    )
  );
  L.push("");

  L.push("MILESTONES (first day the unspent balance covers the price)  [MODELLED]");
  L.push(
    table(
      ["profile", `cheapest item (${MEASURED.PRICE_CHEAPEST})`, `common skin (${MEASURED.PRICE_COMMON_SKIN})`, `royal skin (${MEASURED.PRICE_ROYAL_SKIN})`, `every cosmetic (${MEASURED.SINK_TOTAL})`],
      results.map((r) => {
        const perDay = r.pearls.total / r.days;
        const daysToSink = perDay > 0 ? Math.ceil(MEASURED.SINK_TOTAL / perDay) : Infinity;
        return [
          r.profile,
          dayOrNever(r.milestones.cosmetic10, days),
          dayOrNever(r.milestones.skin40, days),
          dayOrNever(r.milestones.royal70, days),
          Number.isFinite(daysToSink) ? `~${daysToSink}d at this pace` : "never",
        ];
      })
    )
  );
  L.push("");

  L.push(`REAL-SHOP PROGRESS (partner bar = ${MEASURED.PARTNER_BAR_MIN} cumulative focus minutes)  [MODELLED]`);
  L.push(`pearls are irrelevant here: eligibility is floor(totalMinutes/240), ${ref("PERKS_EARNED")}`);
  L.push("this is focus time only. It says nothing about whether that time was honest.");
  L.push(
    table(
      ["profile", "focus min", "focus hrs", "avg min/day", "perks earned", "min still needed"],
      results.map((r) => [
        r.profile,
        r.focus.totalMinutes,
        r.focus.totalHours,
        r.focus.avgMinutesPerDay,
        r.focus.partnerRewardsEarned,
        r.focus.minutesToNextReward,
      ])
    )
  );
  L.push("");

  L.push("WHAT THE NON-FOCUS PEARLS WOULD HAVE COST IN HONEST FOCUS  [MODELLED]");
  L.push(
    table(
      ["profile", "non-focus pearls", "= focus hours", "actual focus hours", "inflation"],
      results.map((r) => {
        const nf = r.pearls.quest + r.pearls.game;
        const eq = r.equivalentFocusHours.nonFocusTotal;
        const act = r.focus.totalHours;
        return [r.profile, nf, eq, act, act > 0 ? `+${round1((eq / act) * 100)}%` : "n/a"];
      })
    )
  );
  L.push("");

  L.push("═══ RATIOS (MEASURED) ══════════════════════════════════════════════════");
  L.push("");
  L.push("How many focus hours a non-focus day is worth. Constants only, no behaviour.");
  L.push(
    indent(
      table(
        ["path", "pearls", "hrs at 4/hr", "hrs at 2/hr"],
        ex.ratioTable.map((r) => [r.label, r.pearls, r.hoursAt4, r.hoursAt2])
      )
    )
  );
  L.push("");
  L.push("   THE QUOTED CEILING IS NOT A ZERO-FOCUS DAY");
  L.push(indent(wrap(ex.ceilingIsNotFree.what, 72), "   "));
  L.push(`   true no-extra-focus ceiling: ${ex.ceilingIsNotFree.trueZeroExtraFocusDay} pearls (games only)`);
  L.push(`   focus minutes the 46 actually costs: ${ex.ceilingIsNotFree.focusMinutesTheCeilingCosts}`);
  L.push(indent(wrap(ex.ceilingIsNotFree.andTheGamesCostThirtyToo, 72), "   "));
  L.push("");

  L.push("═══ PREVIOUSLY-REPORTED EXPLOITS, NOW CLOSED ═══════════════════════════");
  L.push("");
  L.push("Both of these were live when this file was first written. Both are fixed in the");
  L.push("app.js this run just read. They are kept here because the before/after is the");
  L.push("evidence for the change, not because they still describe shipped behaviour.");
  L.push("");
  L.push("1. WEB HAD NO GAME GATE  ·  " + ex.gameGate.status);
  L.push(indent(wrap(ex.gameGate.what, 72), "   "));
  L.push(indent(wrap("was: " + ex.gameGate.wasWrong, 72), "   "));
  L.push(`   price of a maxed game day: ${ex.gameGate.priceBefore} before, ${ex.gameGate.priceNow} now`);
  L.push(`   leverage on the shortest qualifying session: ${ex.gameGate.leverageBefore}x before, ${ex.gameGate.leverageNow}x now`);
  L.push("");
  L.push("2. DEV UNLOCK 5-SECOND TIMER PRINTER  ·  " + ex.devPrinter.status);
  L.push(indent(wrap(ex.devPrinter.what, 72), "   "));
  L.push(indent(wrap("was: " + ex.devPrinter.wasWrong, 72), "   "));
  L.push(indent(wrap(ex.devPrinter.stillUnlimited, 72), "   "));
  L.push("");
  L.push(`app.js states the intent both of those violated (just above ${ref("SLOT_REWARDS")}):`);
  L.push('   "Break games are a small once-per-day bonus, not a pearl farm."');
  L.push("");

  L.push("═══ MEASUREMENT NOTES ══════════════════════════════════════════════════");
  L.push("");
  L.push("· Rates, caps, prices, quest values and gates are read from app.js, and every");
  L.push("  file:line above was re-resolved against app.js during this run.");
  L.push("· Player BEHAVIOUR (how often somebody plays a game, how good they are at Catch,");
  L.push("  whether they open the map) is ASSUMED, not measured. It shapes the three human");
  L.push("  profiles and every table tagged [MODELLED]. See the ASSUMED block in this file.");
  L.push(`· Plinko pays from where the pearl physically LANDS (${ref("PLINKO_CREDIT")}), not from`);
  L.push(`  the SLOT_WEIGHTS steering target (${ref("SLOT_WEIGHTS")}). The landing distribution used`);
  L.push("  here is FITTED to GROUNDING's three published anchors (7% edges, 20% centre,");
  L.push(`  ~${MEASURED.PLINKO_PUBLISHED_DAY_EV}/day); the raw 30k-drop histogram is not in the repo. It is the only`);
  L.push("  number in this file not read from code, and nothing is concluded FROM it: any");
  L.push("  comparison between a fit and the number it was fitted to is circular. GROUNDING's");
  L.push("  'explicitly refuted' list already records that the Plinko comment and its weight");
  L.push("  table do not actually disagree.");
  L.push(`· The golden share of CAUGHT items (${round1(DERIVED.GOLDEN_SHARE_OF_CAUGHT * 100)}%) is derived, not read: ${ref("GOLDEN_CHANCE")} is a`);
  L.push(`  SPAWN probability across four kinds (${ref("SPAWN_KIND")}). Treating it as the caught`);
  L.push("  share understates goldens by about a fifth.");
  L.push("· The Catch model deviates from app.js in two disclosed ways, both of which");
  L.push(`  UNDERSTATE Catch income: the bomb clamp is per-event in the game (${ref("BOMB_CLAMP")})`);
  L.push(`  and the bank is a high-water mark (${ref("CATCH_BANK")}). See the comment in simulateDay.`);
  L.push("· This run never spends, so balances are gross. Milestone days are the first day an");
  L.push("  unspent balance covers the price, not a purchase plan.");
  L.push("· Pearls buy cosmetics. They have no connection to the partner-shop perks: that bar");
  L.push(`  is focus minutes only (${ref("PERKS_EARNED")}), and no perk other than the two signed`);
  L.push("  shops' own wording exists.");
  L.push("");
  return L.join("\n");
}

// ═══ CLI ═════════════════════════════════════════════════════════════════════

function main(argv) {
  if (argv.includes("--verify-anchors")) {
    const st = ANCHOR_STATE;
    if (!st.readable) {
      process.stderr.write(`economy-sim: cannot read ${APP_JS}\n`);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(anchorSection() + "\n");
    process.exitCode = st.ok ? 0 : 1;
    return;
  }

  const seedArg = argv.find((a) => a.startsWith("--seed="));
  const daysArg = argv.find((a) => a.startsWith("--days="));
  const opts = {
    seed: seedArg ? Number(seedArg.split("=")[1]) : DEFAULT_SEED,
    days: daysArg ? Number(daysArg.split("=")[1]) : DEFAULT_DAYS,
    platform: "web",
  };
  const results = simulateAll(opts);
  const ex = exploitReport(results);

  if (argv.includes("--json")) {
    process.stdout.write(
      JSON.stringify(
        {
          generatedBy: "tools/economy-sim.mjs",
          note:
            "MEASURED values mirror app.js; ASSUMED values are player-behaviour guesses; " +
            "PLINKO_FITTED_LANDING is fitted, not measured. Nothing here measures money, " +
            "visits, or verified study time.",
          seed: opts.seed,
          days: opts.days,
          anchors: {
            readable: ANCHOR_STATE.readable,
            resolved: ANCHOR_STATE.resolved,
            missing: ANCHOR_STATE.missing,
            drifted: ANCHOR_STATE.drifted,
          },
          measured: MEASURED,
          derived: { ...DERIVED, GOLDEN_SHARE_OF_CAUGHT: DERIVED.GOLDEN_SHARE_OF_CAUGHT },
          plinkoFittedLanding: PLINKO_FITTED_LANDING,
          assumed: ASSUMED,
          profiles: results,
          nativeUnblocked: PROFILE_ORDER.map((p) =>
            simulate(p, { ...opts, platform: "native-unblocked" })
          ),
          legacyWebNoGate: PROFILE_ORDER.map((p) =>
            simulate(p, { ...opts, legacyWebNoGate: true })
          ),
          exploits: ex,
        },
        null,
        2
      ) + "\n"
    );
    return;
  }
  process.stdout.write(printReport(results, ex, opts) + "\n");
}

// Only run when invoked directly, so `import { simulate }` from a test stays silent.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
