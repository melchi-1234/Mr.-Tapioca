// Seasonal drops, the weekly quest tier, and the new badges (1.2.0 feature 7).
//
// The fairness line is the thing worth defending here and it is stated in
// CLAUDE.md: pearls and the 240-minute merchant bar come from REAL FOCUS MINUTES.
// A quest, a streak or a badge may pay in pearls and cosmetics and must never
// move a student closer to a discount a shop has to honour. Most of this file
// exists to make that rule mechanical instead of remembered.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

function between(start, end) {
  const i = app.indexOf(start);
  assert.notEqual(i, -1, `missing ${start}`);
  const j = app.indexOf(end, i + start.length);
  assert.notEqual(j, -1, `missing ${end}`);
  return app.slice(i, j);
}

function loadSeasons() {
  const src = between("function seasonWindowOpen(season, now)", "// The student year, as a drink menu.");
  const context = { Math, Date, String, Number };
  vm.createContext(context);
  vm.runInContext(src, context);
  return context;
}

test("a seasonal window is inclusive at both ends", () => {
  const { seasonWindowOpen } = loadSeasons();
  const autumn = { from: "09-20", until: "11-20" };
  const at = (iso) => new Date(`${iso}T12:00:00`);
  assert.equal(seasonWindowOpen(autumn, at("2026-09-19")), false, "the day before is closed");
  assert.equal(seasonWindowOpen(autumn, at("2026-09-20")), true, "the first day is open");
  assert.equal(seasonWindowOpen(autumn, at("2026-10-15")), true);
  assert.equal(seasonWindowOpen(autumn, at("2026-11-20")), true, "the last day is open");
  assert.equal(seasonWindowOpen(autumn, at("2026-11-21")), false, "the day after is closed");
  // No window at all means always available: this is what every pre-existing
  // cosmetic relies on.
  assert.equal(seasonWindowOpen(null, at("2026-06-01")), true);
  assert.equal(seasonWindowOpen({}, at("2026-06-01")), true);
});

test("a window may wrap the new year", () => {
  // Winter break is the reason the whole comparison is month-day rather than a
  // pair of dates, and a naive from<=x<=until would leave it shut all year.
  const { seasonWindowOpen } = loadSeasons();
  const winter = { from: "12-01", until: "01-05" };
  const at = (iso) => new Date(`${iso}T12:00:00`);
  assert.equal(seasonWindowOpen(winter, at("2026-11-30")), false);
  assert.equal(seasonWindowOpen(winter, at("2026-12-01")), true);
  assert.equal(seasonWindowOpen(winter, at("2026-12-25")), true);
  assert.equal(seasonWindowOpen(winter, at("2027-01-05")), true);
  assert.equal(seasonWindowOpen(winter, at("2027-01-06")), false);
  assert.equal(seasonWindowOpen(winter, at("2026-07-04")), false);
});

test("a drop recurs every year instead of expiring once", () => {
  const { seasonWindowOpen, seasonDaysLeft } = loadSeasons();
  const autumn = { from: "09-20", until: "11-20" };
  for (const year of [2026, 2027, 2030, 2044]) {
    assert.equal(seasonWindowOpen(autumn, new Date(`${year}-10-01T12:00:00`)), true,
      `autumn must come back in ${year}`);
  }
  // And the countdown rolls forward to next year's window rather than going
  // negative once this year's has passed.
  const after = seasonDaysLeft(autumn, new Date("2026-12-01T12:00:00"));
  assert.ok(after > 300 && after <= 366, `expected next year's window, got ${after}`);
  assert.ok(seasonDaysLeft(autumn, new Date("2026-11-20T09:00:00")) >= 0);
});

test("the countdown never reads as a threat", () => {
  const { seasonLabel } = loadSeasons();
  const autumn = { from: "09-20", until: "11-20" };
  const last = seasonLabel(autumn, new Date("2026-11-20T09:00:00"));
  assert.equal(last, "Last day");
  assert.match(seasonLabel(autumn, new Date("2026-11-17T12:00:00")), /^\d+ days left$/);
  assert.match(seasonLabel(autumn, new Date("2026-09-25T12:00:00")), /^Until Nov 20$/);
});

test("an item you already own survives its window closing", () => {
  // The scarcity is on BUYING, never on owning. An item that disappeared from
  // your own collection after Halloween would be the kind of limited-time
  // mechanic people resent, and it would also silently un-equip a live drink.
  const src = between("function seasonVisible(", "function renderCustomizeOptions()");
  assert.match(src, /unlocked \|\| equipped/,
    "an owned or currently-equipped seasonal item must stay visible out of season");
  const render = between("function renderCustomizeOptions()", "// Buy a locked customization");
  assert.match(render, /seasonVisible\(key, b, isBaseUnlocked\(key\), state\.base === key\)/);
  assert.match(render, /seasonVisible\(key, t, isToppingUnlocked\(key\), state\.topping === key\)/);
  // And the "3 days left" note is suppressed once you own it.
  const card = between("function customizeCard(", "function renderCustomizeOptions()");
  assert.match(card, /season && locked && seasonWindowOpen\(season\)/,
    "telling an owner their item has three days left reads as a threat to take it away");
});

test("the window is re-checked at the transaction, not only at the render", () => {
  // A card can be on screen when a window closes at midnight. The render is a
  // view; this is where value moves.
  const unlock = between("async function tryUnlock(", "async function setBase(");
  assert.match(unlock, /if \(item && item\.season && !seasonWindowOpen\(item\.season\)\)/);
  const buy = between("function buyItem(itemId)", "// ── Consumables");
  assert.match(buy, /if \(item\.season && !seasonWindowOpen\(item\.season\)\) return;/);
});

test("buyItem cannot grant a premium item for nothing", () => {
  // `currentPearls() < item.price` is FALSE when price is undefined, which is
  // exactly what a premium (IAP) item has: the old guard would have granted one
  // free and written NaN into state.spent, poisoning every pearl total after it.
  const buy = between("function buyItem(itemId)", "// ── Consumables");
  assert.match(buy, /if \(!item \|\| item\.premium \|\| !Number\.isFinite\(item\.price\)\) return;/);
});

test("every seasonal item is cosmetic and pearl-priced", () => {
  const bases = between("const BASES = {", "\n};");
  const toppings = between("const TOPPINGS = {", "\n};");
  const seasonalLines = (bases + toppings).split("\n").filter((l) => l.includes("season:"));
  assert.ok(seasonalLines.length >= 4, "expected a real seasonal calendar, not one item");
  for (const line of seasonalLines) {
    assert.match(line, /price:\s*\d+/, `${line.trim()} must have a pearl price`);
    assert.doesNotMatch(line, /premium/, `${line.trim()} must not be an IAP`);
  }
});

test("quests and badges pay pearls and never touch the merchant bar", () => {
  // THE FAIRNESS LINE. onQuestComplete is the only payout path for a quest, and
  // awardPearls writes state.bonusPearls. The 240-minute bar is derived from
  // totalMinutes() (the sum of real finished-drink minutes) or from the server,
  // and nothing here may write to either.
  const complete = between("function onQuestComplete(def)", "function questsRemaining()");
  assert.match(complete, /awardPearls\(def\.reward\)/);
  assert.doesNotMatch(complete, /state\.collection|totalMinutes|RewardV2|perkProgress|rewardProgress/,
    "a quest reward must not touch anything the real-shop reward bar reads");

  const award = between("function awardPearls(", "\n}");
  assert.match(award, /state\.bonusPearls/);
  assert.doesNotMatch(award, /state\.collection\.(push|unshift)/,
    "pearls must never be paid by inventing a finished drink");

  // And the same for the whole weekly tier: it shares onQuestComplete.
  const bump = between("function bumpQuest(track, amount = 1)", "function onQuestComplete");
  assert.match(bump, /state\.quests\.active\.concat\(state\.weeklyQuest\.active\)/);
  assert.doesNotMatch(bump, /state\.collection|RewardV2/);
});

test("the weekly tier is separate state so it does not reset at midnight", () => {
  // Folded into the same object as the dailies, a weekly quest would be wiped
  // every night by ensureTodayQuests and could never be completed.
  assert.match(app, /weeklyQuest: null,/);
  assert.match(app, /localStorage\.setItem\("bobaFocusWeeklyQuest",\s*JSON\.stringify\(state\.weeklyQuest\)\);/);
  const ensure = between("function ensureThisWeekQuests()", "// Advance any active quest");
  assert.match(ensure, /const week = weekStartOrdinal\(\);/,
    "the weekly quest and the squad leaderboard must reset on the same Monday");
  assert.match(ensure, /q\.week === week/);

  // Every weekly key must be resolvable by the single questDef lookup, which is
  // what lets bumpQuest feed both tiers from the existing call sites.
  const pool = between("const WEEKLY_QUEST_POOL = [", "\n];");
  const keys = [...pool.matchAll(/key: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 4);
  // Ends at the weekly pool, which now sits between the dailies and ALL_QUESTS.
  const dailyPool = between("const QUEST_POOL = {", "const WEEKLY_QUEST_POOL");
  for (const k of keys) {
    assert.ok(!dailyPool.includes(`"${k}"`), `${k} collides with a daily quest key`);
  }
  assert.match(app, /const ALL_QUESTS = \[\.\.\.QUEST_POOL\.focus, \.\.\.QUEST_POOL\.make, \.\.\.QUEST_POOL\.play, \.\.\.WEEKLY_QUEST_POOL\];/);

  // Every track a weekly quest reads must have a producer somewhere in the app,
  // or the quest can never complete and the pearls are unreachable.
  const tracks = [...pool.matchAll(/track: "([^"]+)"/g)].map((m) => m[1]);
  for (const t of tracks) {
    assert.ok(app.includes(`bumpQuest("${t}"`), `nothing ever calls bumpQuest("${t}")`);
  }
});

test("the new badges are earnable and read state that exists", () => {
  const badges = between("const BADGES = [", "\n];");
  const ids = [...badges.matchAll(/id: "([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "duplicate badge id");
  assert.ok(ids.length >= 19, `expected the new badges, found ${ids.length}`);
  for (const id of ["century", "cyclist", "seasonal", "squad-up", "real-boba", "night-owl", "collector"]) {
    assert.ok(ids.includes(id), `${id} badge is missing`);
  }
  // The two badges that read fields added in this release: those fields have to
  // actually be written onto a drink, or the badges are dead.
  const drink = between("  const drink = {", "  };");
  assert.match(drink, /at: now\.getTime\(\)/, "night-owl reads drink.at");
  assert.match(drink, /mode: modeLabel\(\)/, "cyclist reads drink.mode");
  // And the readers tolerate drinks banked before this release, which have neither.
  assert.match(badges, /const t = d\.at \? new Date\(d\.at\) : null;/);
  assert.match(badges, /String\(d\.mode \|\| ""\)\.startsWith\("Pomodoro"\)/);
  assert.match(app, /return `Pomodoro · \$\{Math\.round\(pomoWork\(\) \/ 60\)\}/,
    "modeLabel must actually start with the string the cyclist badge tests for");
});
