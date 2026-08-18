// Production-SQL contract for the historical issuance bar returned when an
// authenticated owner opens a reward at the counter.
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

test("open_redemption success returns the owned reward's issuance-time bar", () => {
  const fn = functionDefinition("open_redemption");
  const success = fn.match(
    /return\s+jsonb_build_object\s*\(\s*'ok'\s*,\s*true\b([\s\S]*?)\)\s*;/i);

  assert.ok(success, "missing successful open response");
  assert.match(success[0], /'bar_minutes'\s*,\s*v_r\.bar_minutes\b/i,
    "the opener must return the immutable bar stored on this reward instance");
  assert.doesNotMatch(success[0],
    /'bar_minutes'\s*,\s*(?:v_p\.required_minutes|v_pol\.required_minutes)/i,
    "today's partner or policy bar must not relabel historical issuance");

  assert.match(fn,
    /select\s+\*\s+into\s+v_r\s+from\s+public\.reward_instances\s+r\s+where\s+r\.id\s*=\s*p_reward_id/i);
  assert.match(fn,
    /if\s+not\s+found\s+or\s+v_r\.user_id\s*<>\s*v_me\s+then\s+v_fail\s*:=\s*'failed_not_found'/i,
    "only the reward owner may receive its stored bar");
  assert.match(sql,
    /bar_minutes\s+integer\s+not\s+null\s+check\s*\(\s*bar_minutes\s+between\s+15\s+and\s+1440\s*\)/i,
    "the returned ledger value must retain its database integer range invariant");
});

test("open_redemption refusals retain the minimal ok/reason shape", () => {
  const fn = functionDefinition("open_redemption");
  const refusalReturns = Array.from(fn.matchAll(
    /return\s+jsonb_build_object\s*\(\s*'ok'\s*,\s*false\s*,\s*'reason'\s*,\s*(?:v_fail|'failed_code_unavailable')\s*\)\s*;/gi),
    (match) => match[0]);

  assert.equal(refusalReturns.length, 2,
    "both validation and code-exhaustion refusals must use the existing shape");
  for (const refusal of refusalReturns) {
    assert.doesNotMatch(refusal, /bar_minutes|partner_name|offer_text|cashier_note/i,
      "a refusal must not disclose reward or merchant details");
  }
});

test("open_redemption remains an authenticated-only security-definer RPC", () => {
  const fn = functionDefinition("open_redemption");

  assert.match(fn,
    /language\s+plpgsql\s+security\s+definer\s+set\s+search_path\s*=\s*public\s*,\s*extensions/i);
  assert.match(fn, /v_me\s+uuid\s*:=\s*auth\.uid\(\)/i);
  assert.match(fn,
    /if\s+v_me\s+is\s+null\s+then[\s\S]*?errcode\s*=\s*'28000'/i);
  assert.match(sql,
    /revoke\s+all\s+on\s+function\s+public\.open_redemption\(uuid\s*,\s*text\)\s+from\s+public\s*,\s*anon\s*;/i);
  assert.match(sql,
    /grant\s+execute\s+on\s+function\s+public\.open_redemption\(uuid\s*,\s*text\)\s+to\s+authenticated\s*;/i);
  assert.doesNotMatch(sql,
    /grant\s+execute\s+on\s+function\s+public\.open_redemption\(uuid\s*,\s*text\)\s+to\s+(?:public|anon)\b/i);
});
