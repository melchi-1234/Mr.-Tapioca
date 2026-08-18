// Production-SQL contract for authoritative per-policy reward progress and the
// abandoned-session credit invariant. The client must consume these returned
// fields rather than recomputing progress from lifetime eligible minutes.
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

function expectedAccounting(eligibleMinutes, policies, rewardInstances) {
  return policies.map((policy) => {
    const spentMinutes = rewardInstances
      .filter((reward) => reward.policy_id === policy.id)
      .reduce((sum, reward) => sum + reward.bar_minutes, 0);
    const unspentMinutes = Math.max(eligibleMinutes - spentMinutes, 0);
    return {
      id: policy.id,
      spent_minutes: spentMinutes,
      unspent_minutes: unspentMinutes,
      progress_minutes: unspentMinutes % policy.required_minutes,
    };
  });
}

test("my_reward_state returns integer per-policy accounting from every reward instance", () => {
  const fn = functionDefinition("my_reward_state");
  const spentQuery = fn.match(
    /coalesce\s*\(\s*\(\s*select\s+sum\s*\(\s*r\.bar_minutes\s*\)::int([\s\S]*?)\)\s*,\s*0\s*\)::int\s+as\s+spent_minutes/i);

  assert.ok(spentQuery, "spent_minutes must sum the issuance-time bar_minutes ledger");
  assert.match(spentQuery[0],
    /from\s+public\.reward_instances\s+r[\s\S]*?r\.user_id\s*=\s*v_me[\s\S]*?r\.policy_id\s*=\s*p\.id/i,
    "the spend ledger must be isolated to this user and this policy");
  assert.doesNotMatch(spentQuery[0], /r\.status\s*=/i,
    "issued, redeemed, and void reward instances all consumed minutes at issuance");

  assert.match(fn,
    /greatest\s*\(\s*a\.eligible_minutes\s*-\s*a\.spent_minutes\s*,\s*0\s*\)::int\s+as\s+unspent_minutes/i);
  assert.match(fn,
    /\(\s*greatest\s*\(\s*a\.eligible_minutes\s*-\s*a\.spent_minutes\s*,\s*0\s*\)\s*%\s*a\.required_minutes\s*\)::int\s+as\s+progress_minutes/i);
  assert.match(fn, /'spent_minutes'\s*,\s*a\.spent_minutes/i);
  assert.match(fn, /'unspent_minutes'\s*,\s*a\.unspent_minutes/i);
  assert.match(fn, /'progress_minutes'\s*,\s*a\.progress_minutes/i);
});

test("policy bar changes use unspent issuance balance rather than lifetime-total modulo", () => {
  const fn = functionDefinition("my_reward_state");
  assert.match(fn,
    /greatest\s*\(\s*a\.eligible_minutes\s*-\s*a\.spent_minutes\s*,\s*0\s*\)/i,
    "progress must start from eligible minus minutes already converted into rewards");

  const [changedPolicy] = expectedAccounting(
    130,
    [{ id: "changed-policy", required_minutes: 60 }],
    [{ policy_id: "changed-policy", bar_minutes: 100, status: "redeemed" }],
  );

  assert.deepEqual(changedPolicy, {
    id: "changed-policy",
    spent_minutes: 100,
    unspent_minutes: 30,
    progress_minutes: 30,
  });
  assert.notEqual(changedPolicy.progress_minutes, 130 % 60,
    "lifetime-total modulo would incorrectly report 10 minutes");
});

test("policy accounting remains separate and ignores reward status", () => {
  const fn = functionDefinition("my_reward_state");
  assert.match(fn, /r\.policy_id\s*=\s*p\.id/i,
    "each policy must sum only its own issuance ledger");

  const accounting = expectedAccounting(
    130,
    [
      { id: "policy-a", required_minutes: 60 },
      { id: "policy-b", required_minutes: 90 },
    ],
    [
      { policy_id: "policy-a", bar_minutes: 100, status: "redeemed" },
      { policy_id: "policy-b", bar_minutes: 40, status: "void" },
      { policy_id: "policy-b", bar_minutes: 20, status: "issued" },
    ],
  );

  assert.deepEqual(accounting, [
    { id: "policy-a", spent_minutes: 100, unspent_minutes: 30, progress_minutes: 30 },
    { id: "policy-b", spent_minutes: 60, unspent_minutes: 70, progress_minutes: 70 },
  ]);
  for (const policy of accounting) {
    assert.ok(Number.isInteger(policy.spent_minutes));
    assert.ok(Number.isInteger(policy.unspent_minutes));
    assert.ok(Number.isInteger(policy.progress_minutes));
    assert.ok(policy.spent_minutes >= 0);
    assert.ok(policy.unspent_minutes >= 0);
    assert.ok(policy.progress_minutes >= 0);
  }
});

test("my_reward_state keeps policy inclusion and reads one stable accounting snapshot", () => {
  const fn = functionDefinition("my_reward_state");

  assert.match(fn,
    /where\s+p\.active\s+or\s+exists\s*\([\s\S]*?held\.user_id\s*=\s*v_me[\s\S]*?held\.policy_id\s*=\s*p\.id[\s\S]*?held\.status\s*=\s*'issued'[\s\S]*?\)/i,
    "return active policies plus inactive policies with an issued held reward");
  assert.match(fn,
    /with\s+eligible\s+as\s*\([\s\S]*?policy_accounting\s+as\s*\([\s\S]*?select\s+jsonb_build_object\s*\([\s\S]*?into\s+v_state/i,
    "eligibility, rewards, and policy accounting must share one SELECT snapshot");
  assert.match(fn, /language\s+plpgsql\s+security\s+definer\s+stable\s+set\s+search_path\s*=\s*public/i);
});

test("canonical bootstrap backfills abandoned nulls before adding an idempotent zero-credit constraint", () => {
  const table = sql.search(/create\s+table\s+if\s+not\s+exists\s+public\.reward_sessions/i);
  const backfill = sql.search(
    /update\s+public\.reward_sessions\s+s\s+set\s+credited_minutes\s*=\s*0\s+where\s+s\.state\s*=\s*'abandoned'\s+and\s+s\.credited_minutes\s+is\s+null\s*;/i);
  const idempotentGuard = sql.search(
    /if\s+not\s+exists\s*\([\s\S]*?from\s+pg_constraint[\s\S]*?conrelid\s*=\s*'public\.reward_sessions'::regclass[\s\S]*?conname\s*=\s*'reward_sessions_abandoned_zero'[\s\S]*?\)\s+then/i);
  const constraint = sql.search(
    /add\s+constraint\s+reward_sessions_abandoned_zero\s+check\s*\(\s*state\s*<>\s*'abandoned'\s+or\s+credited_minutes\s+is\s+not\s+distinct\s+from\s+0\s*\)/i);

  assert.notEqual(table, -1);
  assert.notEqual(backfill, -1, "existing abandoned NULL rows must be repaired");
  assert.notEqual(idempotentGuard, -1, "canonical SQL must be safe to rerun");
  assert.notEqual(constraint, -1,
    "IS NOT DISTINCT FROM must reject NULL as well as nonzero abandoned credit");
  assert.ok(table < backfill && backfill < constraint,
    "the table must exist and dirty rows must be repaired before validation");

  const invariantAllows = (state, creditedMinutes) =>
    state !== "abandoned" || creditedMinutes === 0;
  assert.equal(invariantAllows("abandoned", null), false);
  assert.equal(invariantAllows("abandoned", 1), false);
  assert.equal(invariantAllows("abandoned", 0), true);
  assert.equal(invariantAllows("active", null), true);
  assert.equal(invariantAllows("completed", 60), true);
});

test("my_reward_state privilege boundary remains authenticated-only", () => {
  const fn = functionDefinition("my_reward_state");
  assert.match(fn, /if\s+v_me\s+is\s+null\s+then[\s\S]*?errcode\s*=\s*'28000'/i);
  assert.match(sql,
    /revoke\s+all\s+on\s+function\s+public\.my_reward_state\(\)\s+from\s+public\s*,\s*anon\s*;/i);
  assert.match(sql,
    /grant\s+execute\s+on\s+function\s+public\.my_reward_state\(\)\s+to\s+authenticated\s*;/i);
  assert.doesNotMatch(sql,
    /grant\s+execute\s+on\s+function\s+public\.my_reward_state\(\)\s+to\s+(?:public|anon)\b/i);
});
