// Production-SQL concurrency contract for merchant redemption caps. The JS
// reward model is deliberately single-threaded, so only the canonical Postgres
// function can prove that two different rewards at one partner share a lock.
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

test("redeem_by_code serializes cap checks and spends on the selected partner", () => {
  const fn = functionDefinition("redeem_by_code");
  const partnerLock = fn.search(
    /select\s+\*\s+into\s+v_p\s+from\s+public\.partners\s+p\s+where\s+p\.id\s*=\s*v_h\.partner_id\s+for\s+update/i);
  const sharedGate = fn.search(
    /v_fail\s*:=\s*public\.redemption_gate\(v_h\.user_id\s*,\s*v_h\.partner_id\s*,\s*v_h\.reward_id\)/i);
  const conditionalSpend = fn.search(
    /update\s+public\.reward_instances\s+r[\s\S]*?where\s+r\.id\s*=\s*v_h\.reward_id\s+and\s+r\.status\s*=\s*'issued'/i);

  assert.notEqual(partnerLock, -1,
    "the spender must lock one shared row for every redemption at that partner");
  assert.notEqual(sharedGate, -1, "the shared cap/window gate is missing");
  assert.notEqual(conditionalSpend, -1, "same-reward conditional spend protection is missing");
  assert.ok(partnerLock < sharedGate,
    "the partner lock must be held before per-user and pilot cap counts are read");
  assert.ok(sharedGate < conditionalSpend,
    "the partner lock must remain held from the cap decision through the spend");
});

test("cashier spend remains anonymous while check_code remains read-only", () => {
  const check = functionDefinition("check_code");

  assert.match(sql,
    /grant\s+execute\s+on\s+function\s+public\.redeem_by_code\(text\)\s+to\s+anon\s*,\s*authenticated\s*;/i);
  assert.match(check, /language\s+plpgsql\s+security\s+definer\s+stable/i);
  assert.doesNotMatch(check, /\bfor\s+update\b/i,
    "verification must not take the spend lock");
  assert.doesNotMatch(check,
    /\b(?:insert\s+into|update|delete\s+from)\s+public\.(?:reward_instances|redemption_handoffs|redemption_events|partners)\b/i,
    "verification must never mutate reward or merchant state");
});
