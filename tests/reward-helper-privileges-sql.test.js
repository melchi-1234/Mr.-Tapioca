// Internal Reward V2 helpers must not inherit PostgreSQL's default PUBLIC
// EXECUTE privilege. They accept caller-controlled identifiers or bypass the
// normal owner-facing/cashier-facing RPC contracts.
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

test("handoff-code generator is internal while open_redemption stays authenticated", () => {
  assert.match(sql,
    /revoke\s+all\s+on\s+function\s+public\.gen_handoff_code\(\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i);
  assert.doesNotMatch(sql,
    /grant\s+execute\s+on\s+function\s+public\.gen_handoff_code\(\)/i);
  assert.match(sql,
    /grant\s+execute\s+on\s+function\s+public\.open_redemption\(uuid\s*,\s*text\)\s+to\s+authenticated\s*;/i);
});
