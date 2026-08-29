const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const privacy = fs.readFileSync(path.join(__dirname, "..", "privacy.html"), "utf8");
const rewardSql = fs.readFileSync(path.join(__dirname, "..", "supabase-reward-v2.sql"), "utf8");

test("privacy policy discloses anonymous server-backed reward records", () => {
  assert.match(privacy, /Partner rewards/);
  assert.match(privacy, /session start and end times/i);
  // 1.2.0 removed the cashier handoff code, so the policy must no longer describe
  // one. What replaced it is what has to be disclosed instead: the shop chosen,
  // the moment it was used, and the wording honoured.
  assert.doesNotMatch(privacy, /redemption code|short-lived code|five minutes/i,
    "the handoff code is gone; the policy must not still describe one");
  assert.match(privacy, /the partner shop you chose/i);
  assert.match(privacy, /the exact wording of the\s+offer that was honoured/i);
  assert.match(privacy, /not.*advertising/i);
});

test("privacy policy discloses live presence as opt-in and off by default", () => {
  // Presence is new social data in 1.2.0. Shipping it without saying so in the
  // policy is exactly the mismatch the App Privacy labels are checked against.
  assert.match(privacy, /whether you are focusing, on a break, or\s+idle right now/i);
  assert.match(privacy, /off unless you turn it on/i,
    "the policy must state that presence defaults to off");
  assert.match(privacy, /reports "idle" to everyone/i,
    "the policy must state what is stored while the switch is off");
  assert.match(privacy, /minutes focused this\s+calendar week/i,
    "the weekly leaderboard total is a new stored stat and must be disclosed");
});

test("privacy policy accurately distinguishes deleted reward data from retained shop audit rows", () => {
  const eventTable = rewardSql.match(/create table if not exists public\.redemption_events \(([\s\S]*?)\n\);/i);
  assert.ok(eventTable, "redemption_events table is missing");
  assert.doesNotMatch(eventTable[1], /references auth\.users|references public\.reward_instances/i,
    "this disclosure test must change if deletion begins cascading into redemption_events");

  assert.match(privacy, /session records[\s\S]*rewards that\s+have not been used are deleted/i);
  assert.match(privacy, /past anonymous redemption attempt records[\s\S]*remain/i);
  assert.match(privacy, /no longer linked to an account or Study[\s\S]*Squad profile/i);
});
