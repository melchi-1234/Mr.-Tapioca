const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const privacy = fs.readFileSync(path.join(__dirname, "..", "privacy.html"), "utf8");
const rewardSql = fs.readFileSync(path.join(__dirname, "..", "supabase-reward-v2.sql"), "utf8");

test("privacy policy discloses anonymous server-backed reward records", () => {
  assert.match(privacy, /Partner rewards/);
  assert.match(privacy, /session start and end times/i);
  assert.match(privacy, /redemption code/i);
  assert.match(privacy, /not.*advertising/i);
});

test("privacy policy accurately distinguishes deleted reward data from retained shop audit rows", () => {
  const eventTable = rewardSql.match(/create table if not exists public\.redemption_events \(([\s\S]*?)\n\);/i);
  assert.ok(eventTable, "redemption_events table is missing");
  assert.doesNotMatch(eventTable[1], /references auth\.users|references public\.reward_instances/i,
    "this disclosure test must change if deletion begins cascading into redemption_events");

  assert.match(privacy, /session records[\s\S]*rewards that have not been used[\s\S]*active[\s\S]*redemption codes are deleted/i);
  assert.match(privacy, /past anonymous redemption attempt records[\s\S]*remain/i);
  assert.match(privacy, /no longer linked to an account or Study[\s\S]*Squad profile/i);
});
