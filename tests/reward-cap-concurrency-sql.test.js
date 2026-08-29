// Production-SQL concurrency contract for merchant redemption caps. The JS
// reward model is deliberately single-threaded, so only the canonical Postgres
// function can prove that two different rewards at one partner share a lock.
//
// 1.2.0 collapsed open_redemption + redeem_by_code into one authenticated
// redeem_reward. The two invariants below did not move with it, so they are
// asserted here against the merged function: the partner row lock must be taken
// BEFORE the cap counts are read and must still be held when the spend writes.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sql = fs.readFileSync(path.join(__dirname, "..", "supabase-reward-v2.sql"), "utf8");

function functionDefinition(name) {
  const start = sql.toLowerCase().indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `missing ${name} RPC in canonical reward SQL`);
  // Plain $$ delimiters throughout this file on purpose: a named dollar-quote
  // would make this slice overshoot into the next function and every ordering
  // assertion below would still pass while meaning nothing.
  const end = sql.indexOf("$$;", start);
  assert.notEqual(end, -1, `unterminated ${name} RPC in canonical reward SQL`);
  return sql.slice(start, end + 3);
}

test("redeem_reward serializes cap checks and spends on the selected partner", () => {
  const fn = functionDefinition("redeem_reward");
  const partnerLock = fn.search(
    /select\s+\*\s+into\s+v_p\s+from\s+public\.partners\s+p\s+where\s+p\.id\s*=\s*p_partner_id\s+for\s+update/i);
  const sharedGate = fn.search(
    /v_fail\s*:=\s*public\.redemption_gate\(v_me\s*,\s*p_partner_id\s*,\s*p_reward_id\)/i);
  const conditionalSpend = fn.search(
    /update\s+public\.reward_instances\s+r[\s\S]*?where\s+r\.id\s*=\s*p_reward_id\s+and\s+r\.status\s*=\s*'issued'/i);

  assert.notEqual(partnerLock, -1,
    "the spender must lock one shared row for every redemption at that partner");
  assert.notEqual(sharedGate, -1, "the shared cap/window gate is missing");
  assert.notEqual(conditionalSpend, -1, "same-reward conditional spend protection is missing");
  assert.ok(partnerLock < sharedGate,
    "the partner lock must be held before per-user and pilot cap counts are read");
  assert.ok(sharedGate < conditionalSpend,
    "the partner lock must remain held from the cap decision through the spend");

  // The one-time guarantee is the conditional UPDATE plus the row_count read. A
  // refactor that loads the status into a variable first and then updates
  // unconditionally looks identical and silently permits a double spend.
  assert.match(fn, /get\s+diagnostics\s+v_hit\s*=\s*row_count\s*;/i,
    "the spend must prove which caller won by reading row_count");
  assert.match(fn, /if\s+v_hit\s*=\s*0\s+then[\s\S]*?'failed_already_redeemed'/i,
    "losing the race must be reported as already redeemed, not as success");
});

test("the spend is authenticated-only and the cashier surface is gone", () => {
  // The credential is the account, not a code held by whoever is standing there.
  assert.match(sql,
    /revoke\s+all\s+on\s+function\s+public\.redeem_reward\(uuid\s*,\s*text\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i);
  assert.match(sql,
    /grant\s+execute\s+on\s+function\s+public\.redeem_reward\(uuid\s*,\s*text\)\s+to\s+authenticated\s*;/i);

  // No RPC in this file may be executable by anon. This is the single strongest
  // guard that the anon-callable spender did not survive the merge in some other
  // shape. (Table SELECT grants to anon are unrelated and still required.)
  assert.doesNotMatch(sql, /grant\s+execute\s+on\s+function\s+public\.[a-z_]+\s*\([^)]*\)\s+to\s+[^;]*\banon\b/i,
    "no reward RPC may be executable by anon: there is no cashier device to authorize");

  // create or replace cannot remove a function, so a database the old migration
  // already ran on keeps the anon-callable spender unless it is dropped by name.
  for (const dropped of ["open_redemption(uuid,text)", "redeem_by_code(text)",
                         "check_code(text)", "gen_handoff_code()"]) {
    const escaped = dropped.replace(/[()]/g, "\\$&").replace(/,/g, "\\s*,\\s*");
    assert.match(sql, new RegExp(`drop\\s+function\\s+if\\s+exists\\s+public\\.${escaped}\\s*;`, "i"),
      `${dropped} must be dropped by name, not merely deleted from this file`);
  }
  assert.match(sql, /drop\s+table\s+if\s+exists\s+public\.redemption_handoffs\s+cascade\s*;/i,
    "the handoff table must be dropped on an already-migrated database");
});
