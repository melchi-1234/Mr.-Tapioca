const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const vm = require("node:vm");

const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "..", "reward-v2.js"), "utf8");

function loadRewardV2({ native, flag = true, override = null }) {
  const storage = new Map();
  if (override) storage.set("bobaRewardV2", override);
  const context = {
    window: {
      MRTAP_CLOUD: { url: "https://example.supabase.co", anonKey: "public-key" },
      MRTAP_FLAGS: { rewardV2: flag },
      Capacitor: { isNativePlatform: () => native },
      addEventListener: () => {},
    },
    localStorage: {
      getItem: (key) => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    console,
    document: { visibilityState: "visible", addEventListener: () => {} },
  };
  vm.runInNewContext(source, context);
  return context.window.RewardV2;
}

test("production Reward V2 flag enables server rewards on native iOS", () => {
  assert.equal(loadRewardV2({ native: true }).enabled, true);
});

test("the same production flag leaves web on the local v1 reward path", () => {
  assert.equal(loadRewardV2({ native: false }).enabled, false);
});

test("the QA localStorage override can never enable server rewards on web", () => {
  assert.equal(loadRewardV2({ native: false, flag: false, override: "on" }).enabled, false);
});
