// Production-SQL contract for the historical issuance bar returned when an
// authenticated owner spends a reward at the counter.
//
// bar_minutes reaches the client through exactly one door — this RPC's success
// payload — and the post-redemption share card refuses to render without it, so
// dropping it from the merged 1.2.0 function would silently kill that share.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "..", "supabase-reward-v2.sql"), "utf8");

function functionDefinition(name) {
  const start = sql.toLowerCase().indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `missing ${name} RPC in canonical reward SQL`);
  const end = sql.indexOf("$$;", start);
  assert.notEqual(end, -1, `unterminated ${name} RPC in canonical reward SQL`);
  return sql.slice(start, end + 3);
}

test("redeem_reward success returns the owned reward's issuance-time bar", () => {
  const fn = functionDefinition("redeem_reward");
  const success = fn.match(
    /return\s+jsonb_build_object\s*\(\s*'ok'\s*,\s*true\b([\s\S]*?)\)\s*;/i);

  assert.ok(success, "missing successful redemption response");
  assert.match(success[0], /'bar_minutes'\s*,\s*v_r\.bar_minutes\b/i,
    "the spender must return the immutable bar stored on this reward instance");
  assert.doesNotMatch(success[0],
    /'bar_minutes'\s*,\s*(?:v_p\.required_minutes|v_pol\.required_minutes)/i,
    "today's partner or policy bar must not relabel historical issuance");

  assert.match(fn,
    /select\s+\*\s+into\s+v_r\s+from\s+public\.reward_instances\s+r\s+where\s+r\.id\s*=\s*p_reward_id/i);
  assert.match(fn,
    /if\s+not\s+found\s+or\s+v_r\.user_id\s*<>\s*v_me\s+then\s+v_fail\s*:=\s*'failed_not_found'/i,
    "only the reward owner may spend it or receive its stored bar");
  assert.match(sql,
    /bar_minutes\s+integer\s+not\s+null\s+check\s*\(\s*bar_minutes\s+between\s+15\s+and\s+1440\s*\)/i,
    "the returned ledger value must retain its database integer range invariant");
});

test("redeem_reward refusals retain the minimal ok/reason shape", () => {
  const fn = functionDefinition("redeem_reward");
  const refusalReturns = Array.from(fn.matchAll(
    /return\s+jsonb_build_object\s*\(\s*'ok'\s*,\s*false\s*,\s*'reason'\s*,\s*(?:v_fail|'failed_already_redeemed')\s*\)\s*;/gi),
    (match) => match[0]);

  // Two: the validation/gate ladder, and losing the conditional-spend race.
  assert.equal(refusalReturns.length, 2,
    "both the validation refusal and the lost-race refusal must use the minimal shape");
  for (const refusal of refusalReturns) {
    assert.doesNotMatch(refusal, /bar_minutes|partner_name|offer_text|cashier_note/i,
      "a refusal must not disclose reward or merchant details");
  }
  // No other return shape may exist in the function: an added branch that leaked
  // the shop's wording on a refusal would otherwise pass the two checks above.
  const allReturns = Array.from(fn.matchAll(/return\s+jsonb_build_object/gi)).length;
  assert.equal(allReturns, 3, "expected exactly two refusal returns and one success return");
});

test("redeem_reward carries every refusal the two old RPCs raised between them", () => {
  const fn = functionDefinition("redeem_reward");
  // Each of these is a real promise to a shop. Dropping any one on the floor
  // while merging hands out a discount the shop never agreed to.
  for (const reason of ["failed_not_found", "failed_partner_paused",
                        "failed_already_redeemed", "failed_expired",
                        "failed_wrong_partner", "failed_offer_changed"]) {
    assert.ok(fn.includes(`'${reason}'`), `${reason} is no longer reachable`);
  }
  // Caps and the agreed window arrive through the shared gate rather than inline.
  assert.match(fn, /public\.redemption_gate\(/i, "caps and window must come from the shared gate");

  // failed_wrong_partner has TWO branches: a partner-scoped reward at the wrong
  // shop, and a passport reward whose policy the shop does not carry.
  assert.match(fn,
    /v_r\.partner_id\s+is\s+not\s+null[\s\S]{0,120}v_r\.partner_id\s*<>\s*v_p\.id[\s\S]{0,80}failed_wrong_partner/i);
  assert.match(fn,
    /v_r\.partner_id\s+is\s+null[\s\S]{0,120}v_p\.policy_id\s*<>\s*v_r\.policy_id[\s\S]{0,80}failed_wrong_partner/i);

  // Every outcome is logged, success and failure alike, or the merchant report
  // can no longer answer "did anything go wrong at the counter".
  const inserts = Array.from(fn.matchAll(/insert\s+into\s+public\.redemption_events/gi)).length;
  assert.equal(inserts, 3, "refusal, lost race and completion must each be logged");
});

test("the code-era surface is gone from the canonical SQL", () => {
  for (const gone of ["gen_handoff_code()", "open_redemption(uuid, text)",
                      "redeem_by_code(text)", "check_code(text)"]) {
    const name = gone.slice(0, gone.indexOf("("));
    assert.doesNotMatch(sql,
      new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\s*\\(`, "i"),
      `${name} must no longer be defined`);
  }
  assert.doesNotMatch(sql, /create\s+table\s+if\s+not\s+exists\s+public\.redemption_handoffs/i);
  assert.doesNotMatch(sql, /create\s+table\s+if\s+not\s+exists\s+public\.code_rate/i);
  assert.doesNotMatch(sql, /cron\.schedule\(\s*'prune_handoffs'/i,
    "a cron job must not be left sweeping a table that no longer exists");
});
