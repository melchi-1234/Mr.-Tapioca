// ── Mr. Tapioca cloud config ──────────────────────────────────────────────────
// Paste your free Supabase values here to turn ON live accounts + a real, syncing
// Study Squad. Leave them BLANK to keep the app fully offline (on-device Squad).
//
// These are PUBLIC client values — safe to ship in the app. Security comes from
// the database's Row-Level Security rules, NOT from hiding this key.
// NEVER paste the Supabase "service_role" key here. Only the "anon public" key.
//
// Setup guide: SUPABASE_SETUP.md
window.MRTAP_CLOUD = {
  url: "https://gpayncloeslimhpyskva.supabase.co",
  anonKey: "sb_publishable_XJArJY06LrUpIluDYfIOkg_C-2b79B4",
};

// ── Feature flags ────────────────────────────────────────────────────────────
// rewardV2: the server-backed merchant reward (reward-v2.js). OFF.
//
// Do NOT turn this on until all three are true:
//   1. supabase-reward-v2.sql has been run in the Supabase SQL editor. It has
//      never been executed anywhere; it is syntax-checked, not run.
//   2. partners.json declares a rewardPolicy. Without one, reward-config.js
//      reports "undeclared" and refuses to issue, because choosing between a
//      shared passport and per-shop bars is a business decision, not a default.
//   3. The two live shops' offers have been mirrored into the server `partners`
//      table (tools/partners-to-sql.mjs), because the server, not the client,
//      is what a redemption is checked against.
//
// With the flag down, reward-v2.js returns immediately and the live v1 perk
// system is completely untouched. Checklist: docs/network-v1/REWARD-V2.md
// analytics: the product-event stream (analytics.js). OFF.
//
// Separate from the drink counter in metrics.js, which stays on and is disclosed
// in privacy.html section 3. Do NOT turn this on until all three are true:
//   1. The app_events table from docs/network-v1/METRICS-SPEC.md has been run.
//   2. privacy.html describes what this collects.
//   3. The App Store privacy answers declare Usage Data (not linked to identity).
// Starting collection before 2 and 3 is how the current privacy copy became
// wrong in the first place. Spec: docs/network-v1/METRICS-SPEC.md
window.MRTAP_FLAGS = {
  rewardV2: false,
  analytics: false,
};
