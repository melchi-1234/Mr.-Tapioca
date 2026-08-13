// Reward configuration: policy validation, the ambiguity refusal, and proof that
// the LIVE partners.json is unchanged by any of it.
//
// Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const RC = require("../reward-config.js");
const LIVE = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "partners.json"), "utf8"));

const shop = (over) => Object.assign({
  id: "test-shop", name: "Test Shop", address: "1 Main St",
  lat: 42.44, lng: -76.49, perk: "10% off your drink", minMinutes: 240, since: "2026-01-01",
}, over || {});

// ── The live file must survive, byte for byte in meaning ─────────────────────
test("live partners.json parses and keeps both real shops", () => {
  const cfg = RC.parse(LIVE);
  assert.deepEqual(cfg.errors, []);
  assert.equal(cfg.shops.length, 2);
  assert.deepEqual(cfg.shops.map((s) => s.id).sort(),
    ["dream-tea-poke-ithaca", "u-tea-collegetown"]);
});

test("live shops keep their exact agreed perks and bars", () => {
  const cfg = RC.parse(LIVE);
  const u = cfg.shops.find((s) => s.id === "u-tea-collegetown");
  const d = cfg.shops.find((s) => s.id === "dream-tea-poke-ithaca");
  // These are what two real businesses agreed to in writing. A parser change
  // that alters either of these numbers or strings is a bug, not a refactor.
  assert.equal(u.perk, "10% off your drink");
  assert.equal(u.minMinutes, 240);
  assert.equal(d.perk, "5% off your drink");
  assert.equal(d.minMinutes, 240);
});

test("live config has no reward policy declared, so V2 issuance stays off", () => {
  const cfg = RC.parse(LIVE);
  assert.equal(cfg.policyState, "undeclared");
  assert.deepEqual(cfg.policies, []);
});

test("new optional fields default to today's behaviour, not to new promises", () => {
  const cfg = RC.parse(LIVE);
  for (const s of cfg.shops) {
    assert.equal(s.active, true, "a shop with no active flag is live");
    assert.equal(s.offerVersion, 1, "unversioned offers start at 1");
    assert.equal(s.offerText, s.perk, "staff-facing text falls back to the agreed perk");
    assert.equal(s.perUserLimit, null, "no cap was agreed, so none is invented");
    assert.equal(s.pilotCap, null);
    assert.equal(s.validDays, null, "no day restriction was agreed");
  }
});

test("per-shop bar equals the old global minimum on the live config", () => {
  // The whole point of replacing Math.min: on TODAY's data the answer must not
  // move. Both live shops are 240, so per-shop and global agree exactly.
  const cfg = RC.parse(LIVE);
  const oldGlobal = Math.min.apply(null, cfg.shops.map((s) => s.minMinutes));
  for (const s of cfg.shops) assert.equal(RC.barFor(s), oldGlobal);
  assert.equal(RC.nextBarAcross(cfg.shops), 240);
});

// ── The defect the policy model exists to stop ───────────────────────────────
test("a cheaper new shop does NOT lower an existing shop's bar", () => {
  const cfg = RC.parse({ shops: [
    shop({ id: "u-tea-collegetown", minMinutes: 240 }),
    shop({ id: "cheap-cafe", name: "Cheap Cafe", minMinutes: 60 }),
  ] });
  const u = cfg.shops.find((s) => s.id === "u-tea-collegetown");
  // v1's perkMinMinutes() would return 60 here and every screen would treat U Tea
  // as unlockable in one hour, which U Tea never agreed to.
  assert.equal(RC.barFor(u), 240);
  assert.equal(Math.min.apply(null, cfg.shops.map((s) => s.minMinutes)), 60);
});

test("conflicting bars with no declared policy is ambiguous, not resolved", () => {
  const cfg = RC.parse({ shops: [
    shop({ id: "a", minMinutes: 240 }),
    shop({ id: "b", name: "B", minMinutes: 60 }),
  ] });
  assert.equal(cfg.policyState, "ambiguous");
  assert.match(cfg.warnings.join(" "), /disagree on minMinutes/);
});

// ── Declared policies ────────────────────────────────────────────────────────
const passport = {
  rewardPolicy: { policies: [
    { id: "ithaca-passport", kind: "global_passport", requiredMinutes: 240, expiresDays: null },
  ] },
  shops: [
    shop({ id: "u-tea-collegetown", policyId: "ithaca-passport" }),
    shop({ id: "dream-tea-poke-ithaca", name: "Dream Tea & Poké",
           perk: "5% off your drink", policyId: "ithaca-passport" }),
  ],
};

test("an explicit shared 240-minute passport is accepted", () => {
  const cfg = RC.parse(passport);
  assert.deepEqual(cfg.errors, []);
  assert.equal(cfg.policyState, "declared");
  assert.equal(cfg.policies[0].kind, "global_passport");
  assert.equal(cfg.policies[0].requiredMinutes, 240);
});

test("a shop whose own bar fights its policy's bar is rejected, not averaged", () => {
  const bad = JSON.parse(JSON.stringify(passport));
  bad.shops[1].minMinutes = 120;
  const cfg = RC.parse(bad);
  assert.equal(cfg.policyState, "ambiguous");
  assert.match(cfg.errors.join(" "), /sets minMinutes 120 but policy .* requires 240/);
});

test("partner-specific policies must name their own shop", () => {
  const cfg = RC.parse({
    rewardPolicy: { policies: [
      { id: "u-tea-only", kind: "partner_specific", requiredMinutes: 180, partnerId: "u-tea-collegetown" },
    ] },
    shops: [shop({ id: "u-tea-collegetown", minMinutes: 180, policyId: "u-tea-only" })],
  });
  assert.deepEqual(cfg.errors, []);
  assert.equal(cfg.policies[0].partnerId, "u-tea-collegetown");
});

test("a partner-specific policy pointing at a missing shop is rejected", () => {
  const cfg = RC.parse({
    rewardPolicy: { policies: [
      { id: "ghost", kind: "partner_specific", requiredMinutes: 180, partnerId: "not-a-shop" },
    ] },
    shops: [shop({ id: "u-tea-collegetown", minMinutes: 180, policyId: "ghost" })],
  });
  assert.equal(cfg.policyState, "ambiguous");
  assert.match(cfg.errors.join(" "), /names partner not-a-shop/);
});

test("a global policy may not name a partner, and vice versa", () => {
  const a = RC.parse({ rewardPolicy: { policies: [
    { id: "passport", kind: "global_passport", requiredMinutes: 240, partnerId: "x" }] }, shops: [] });
  assert.match(a.errors.join(" "), /global_passport but names a partnerId/);
  const b = RC.parse({ rewardPolicy: { policies: [
    { id: "shop-only", kind: "partner_specific", requiredMinutes: 240 }] }, shops: [] });
  assert.match(b.errors.join(" "), /names no partnerId/);
});

test("policy ids must be slugs", () => {
  const bad = ["", "p", "Has Caps", "-leading", "with_underscore", "x".repeat(64)];
  for (const id of bad) {
    const cfg = RC.parse({ rewardPolicy: { policies: [
      { id, kind: "global_passport", requiredMinutes: 240 }] }, shops: [] });
    assert.match(cfg.errors.join(" "), /policy id must be a slug/, "should reject id: " + JSON.stringify(id));
  }
});

test("a shop referencing an unknown policy is rejected", () => {
  const cfg = RC.parse({
    rewardPolicy: { policies: [{ id: "real", kind: "global_passport", requiredMinutes: 240 }] },
    shops: [shop({ policyId: "imaginary" })],
  });
  assert.match(cfg.errors.join(" "), /unknown policy imaginary/);
});

// ── Malformed data is dropped, never guessed at ──────────────────────────────
test("malformed shops are dropped and reported, not repaired", () => {
  const cfg = RC.parse({ shops: [
    shop(),
    { name: "No perk", lat: 1, lng: 1, minMinutes: 240 },       // missing perk
    shop({ id: "zero", minMinutes: 0 }),                         // the dangerous one
    shop({ id: "nolat", lat: "42.4" }),
    shop({ id: "wild", lat: 999 }),
  ] });
  assert.equal(cfg.shops.length, 1);
  assert.equal(cfg.warnings.filter((w) => /dropped/.test(w)).length, 4);
});

test("minMinutes of 0 can never produce an instantly redeemable shop", () => {
  // A zero here would hand every user a live reward the moment they open the map.
  const cfg = RC.parse({ shops: [shop({ minMinutes: 0 })] });
  assert.equal(cfg.shops.length, 0);
});

test("minMinutes below the 15-minute floor is dropped", () => {
  assert.equal(RC.parse({ shops: [shop({ minMinutes: 14 })] }).shops.length, 0);
  assert.equal(RC.parse({ shops: [shop({ minMinutes: 15 })] }).shops.length, 1);
});

test("duplicate shop ids are an error, not a silent overwrite", () => {
  const cfg = RC.parse({ shops: [shop({ id: "dup" }), shop({ id: "dup", name: "Other" })] });
  assert.equal(cfg.shops.length, 1);
  assert.match(cfg.errors.join(" "), /duplicate shop id: dup/);
});

test("a totally malformed payload yields no shops rather than throwing", () => {
  for (const junk of [null, undefined, 42, "nope", {}, { shops: "no" }, []]) {
    const cfg = RC.parse(junk);
    assert.deepEqual(cfg.shops, []);
  }
});

test("a paused shop is kept but marked inactive", () => {
  const cfg = RC.parse({ shops: [shop({ active: false })] });
  assert.equal(cfg.shops.length, 1);
  assert.equal(cfg.shops[0].active, false);
});

// ── nextBarAcross is a progress display, never an eligibility decision ───────
test("nextBarAcross ignores paused shops", () => {
  const cfg = RC.parse({ shops: [
    shop({ id: "open", minMinutes: 240 }),
    shop({ id: "paused", minMinutes: 60, active: false }),
  ] });
  assert.equal(RC.nextBarAcross(cfg.shops), 240);
});

test("nextBarAcross falls back when there are no shops at all", () => {
  assert.equal(RC.nextBarAcross([], 180), 180);
  assert.equal(RC.nextBarAcross([]), 180);
});

// ── eligibleAt ───────────────────────────────────────────────────────────────
test("a partner-scoped reward is refused at a different shop", () => {
  const cfg = RC.parse(passport);
  const r = { policy_id: "ithaca-passport", partner_id: "u-tea-collegetown", offer_version: 1 };
  const other = cfg.shops.find((s) => s.id === "dream-tea-poke-ithaca");
  assert.equal(RC.eligibleAt(r, other, cfg.policies), "failed_wrong_partner");
});

test("a passport reward is accepted at any shop on that policy", () => {
  const cfg = RC.parse(passport);
  const r = { policy_id: "ithaca-passport", partner_id: null, offer_version: null };
  for (const s of cfg.shops) assert.equal(RC.eligibleAt(r, s, cfg.policies), null);
});

test("a bumped offer version refuses the reward instead of honouring new terms", () => {
  const cfg = RC.parse(passport);
  const s = cfg.shops[0];
  s.offerVersion = 2;
  const r = { policy_id: "ithaca-passport", partner_id: s.id, offer_version: 1 };
  assert.equal(RC.eligibleAt(r, s, cfg.policies), "failed_offer_changed");
});

test("a paused shop refuses before anything else is considered", () => {
  const cfg = RC.parse(passport);
  const s = Object.assign({}, cfg.shops[0], { active: false });
  const r = { policy_id: "ithaca-passport", partner_id: null, offer_version: null };
  assert.equal(RC.eligibleAt(r, s, cfg.policies), "failed_partner_paused");
});
