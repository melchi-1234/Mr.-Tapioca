// Static contract for the production Postgres transition that closes a paused
// or reset focus session without converting server wall time into reward time.
//
// These checks cannot replace executing the RPC against Supabase. They do make
// the canonical SQL fail closed if the owner predicate, zero-credit transition,
// row lock, or grants are accidentally weakened before deployment.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "..", "supabase-reward-v2.sql"), "utf8");

function functionDefinition(name) {
  const startNeedle = `create or replace function public.${name}(`;
  const start = sql.toLowerCase().indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${name} RPC in canonical reward SQL`);
  const end = sql.indexOf("$$;", start);
  assert.notEqual(end, -1, `unterminated ${name} RPC in canonical reward SQL`);
  return sql.slice(start, end + 3);
}

test("abandon RPC is an authenticated security-definer with a locked owner lookup", () => {
  const fn = functionDefinition("abandon_reward_session");

  assert.match(fn, /p_session_id\s+uuid/i);
  assert.match(fn, /language\s+plpgsql\s+security\s+definer\s+set\s+search_path\s*=\s*''/i);
  assert.match(fn, /v_me\s+uuid\s*:=\s*auth\.uid\(\)/i);
  assert.match(fn, /if\s+v_me\s+is\s+null\s+then[\s\S]*errcode\s*=\s*'28000'/i);
  assert.match(fn,
    /from\s+public\.reward_sessions\s+s\s+where\s+s\.id\s*=\s*p_session_id\s+and\s+s\.user_id\s*=\s*v_me\s+for\s+update/i,
    "the RPC must lock only the caller's session row");
  assert.match(fn, /if\s+not\s+found\s+then[\s\S]*errcode\s*=\s*'P0002'/i);
});

test("abandon RPC changes only an owned active session and always assigns zero credit", () => {
  const fn = functionDefinition("abandon_reward_session");
  const activeBranch = fn.match(/if\s+v_row\.state\s*=\s*'active'\s+then([\s\S]*?)end\s+if\s*;/i);

  assert.ok(activeBranch, "active-to-abandoned transition must be explicit");
  assert.match(activeBranch[1],
    /update\s+public\.reward_sessions\s+s\s+set\s+state\s*=\s*'abandoned'\s*,\s*ended_at\s*=\s*now\(\)\s*,\s*credited_minutes\s*=\s*0/i);
  assert.match(activeBranch[1],
    /where\s+s\.id\s*=\s*p_session_id\s+and\s+s\.user_id\s*=\s*v_me\s+and\s+s\.state\s*=\s*'active'/i,
    "the update must remain scoped to the caller and the active state");
  assert.doesNotMatch(fn, /issue_my_rewards|insert\s+into\s+public\.reward_instances/i,
    "abandoning must never issue a reward");
});

test("abandon RPC is idempotent and returns the persisted session and eligibility state", () => {
  const fn = functionDefinition("abandon_reward_session");

  assert.match(fn,
    /returns\s+table\s*\(\s*id\s+uuid\s*,\s*state\s+text\s*,\s*credited_minutes\s+integer\s*,\s*eligible_minutes\s+integer\s*\)/i);
  assert.match(fn,
    /return\s+query\s+select\s+v_row\.id\s*,\s*v_row\.state\s*,\s*v_row\.credited_minutes\s*,\s*public\.reward_eligible_minutes\(v_me\)/i,
    "replays must return the stored terminal row instead of overwriting it");
});

test("completion locks the session before its terminal-state check and only updates active rows", () => {
  const fn = functionDefinition("complete_reward_session");

  assert.match(fn,
    /select\s+\*\s+into\s+v_row\s+from\s+public\.reward_sessions\s+s\s+where\s+s\.id\s*=\s*p_session_id\s+for\s+update/i,
    "completion must share the same row lock as abandon before either reads state");

  const updates = Array.from(fn.matchAll(
    /update\s+public\.reward_sessions\s+s\s+set[\s\S]*?where[\s\S]*?;/gi),
    (match) => match[0]);
  assert.equal(updates.length, 2,
    "completion has exactly the zero-credit stale branch and credited completion branch");
  for (const update of updates) {
    assert.match(update,
      /where\s+s\.id\s*=\s*p_session_id\s+and\s+s\.user_id\s*=\s*v_me\s+and\s+s\.state\s*=\s*'active'/i,
      "neither completion write may overwrite an already-terminal row");
  }
});

test("start-session stale sweep records the same explicit zero credit as abandon", () => {
  const fn = functionDefinition("start_reward_session");

  assert.match(fn,
    /update\s+public\.reward_sessions\s+s\s+set\s+state\s*=\s*'abandoned'\s*,\s*ended_at\s*=\s*now\(\)\s*,\s*credited_minutes\s*=\s*0\s+where\s+s\.user_id\s*=\s*v_me\s+and\s+s\.state\s*=\s*'active'[\s\S]*?s\.started_at\s*<\s*now\(\)\s*-\s*interval\s*'12 hours'/i,
    "every abandoned session must persist zero rather than a nullable credit result");
});

test("only authenticated clients receive execute permission on abandon RPC", () => {
  assert.match(sql,
    /revoke\s+all\s+on\s+function\s+public\.abandon_reward_session\(uuid\)\s+from\s+public\s*,\s*anon\s*;/i);
  assert.match(sql,
    /grant\s+execute\s+on\s+function\s+public\.abandon_reward_session\(uuid\)\s+to\s+authenticated\s*;/i);
  assert.doesNotMatch(sql,
    /grant\s+execute\s+on\s+function\s+public\.abandon_reward_session\(uuid\)\s+to\s+(?:public|anon)\b/i);
});
