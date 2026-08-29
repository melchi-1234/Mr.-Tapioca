// Internal Reward V2 helpers must not inherit PostgreSQL's default PUBLIC
// EXECUTE privilege. They accept caller-controlled identifiers or bypass the
// normal owner-facing RPC contracts.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "..", "supabase-reward-v2.sql"), "utf8");

test("arbitrary-user eligibility helper is callable only from trusted definer RPCs", () => {
  assert.match(sql,
    /revoke\s+all\s+on\s+function\s+public\.reward_eligible_minutes\(uuid\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i);
  assert.doesNotMatch(sql,
    /grant\s+execute\s+on\s+function\s+public\.reward_eligible_minutes\(uuid\)/i);

  // These wrappers derive the user from auth.uid() and remain the supported API.
  assert.match(sql,
    /grant\s+execute\s+on\s+function\s+public\.my_reward_state\(\)\s+to\s+authenticated\s*;/i);
  assert.match(sql,
    /grant\s+execute\s+on\s+function\s+public\.complete_reward_session\(uuid\s*,\s*boolean\)\s+to\s+authenticated\s*;/i);
});

test("the shared cap/window gate stays internal to the definer RPCs", () => {
  // redemption_gate takes a user id as a plain argument, so a caller who could
  // reach it directly could probe another account's cap position at a shop.
  assert.match(sql,
    /revoke\s+all\s+on\s+function\s+public\.redemption_gate\(uuid\s*,\s*text\s*,\s*uuid\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i);
  assert.doesNotMatch(sql,
    /grant\s+execute\s+on\s+function\s+public\.redemption_gate\(/i);
});

test("the one redemption RPC derives its user from auth.uid() and checks ownership", () => {
  const start = sql.toLowerCase().indexOf("create or replace function public.redeem_reward(");
  assert.notEqual(start, -1, "missing redeem_reward RPC in canonical reward SQL");
  const fn = sql.slice(start, sql.indexOf("$$;", start) + 3);

  assert.match(fn, /language\s+plpgsql\s+security\s+definer\s+set\s+search_path\s*=\s*public/i);
  assert.match(fn, /v_me\s+uuid\s*:=\s*auth\.uid\(\)/i);
  assert.match(fn, /if\s+v_me\s+is\s+null\s+then[\s\S]*?errcode\s*=\s*'28000'/i,
    "an unauthenticated caller must be refused before anything is read");

  // THE highest-severity invariant of the 1.2.0 merge. redeem_by_code could not
  // check ownership (it was anon-callable and the code was the credential). The
  // merged RPC is authenticated, so without this check any signed-in user could
  // spend any reward id they can guess.
  const ownership = fn.search(
    /if\s+not\s+found\s+or\s+v_r\.user_id\s*<>\s*v_me\s+then/i);
  const spend = fn.search(/update\s+public\.reward_instances\s+r/i);
  assert.notEqual(ownership, -1, "only the reward's owner may spend it");
  assert.ok(ownership < spend, "ownership must be established before the spend");
});
