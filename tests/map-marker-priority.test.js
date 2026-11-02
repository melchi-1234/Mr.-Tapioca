const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

test("partner pins stack above ordinary boba pins on the map", () => {
  assert.match(app, /zIndexOffset:\s*p\s*\?\s*500\s*:\s*0/);
});

// Nov 2026 partner-flow audit. Each of these was a way a student holding a
// reward could not reach the counter card for a shop that had agreed to honour it.
test("a partner in range is placed even when OpenStreetMap returns nothing", () => {
  const load = app.slice(app.indexOf("function loadNearbyShops"), app.indexOf("function placeShopMarkers"));
  // The empty check reads the count placeShopMarkers returns. An early return on
  // an empty OSM answer is what dropped Uni Uni from Jersey City.
  assert.match(load, /const placed = placeShopMarkers\(shops, lat, lng\);\s*if \(!placed\)/);
  assert.match(load, /if \(placeShopMarkers\(fallback, lat, lng\)\)/);
  assert.doesNotMatch(load, /if \(!shops\.length\)/);
});

test("location off still lists every partner with a counter button", () => {
  const build = app.slice(app.indexOf("function buildMap"), app.indexOf("function loadNearbyShops"));
  assert.match(build, /loadPartners\(\)\.then/);
  assert.match(app, /function renderOtherPartners\(/);
  // renderShopList is the one place every map path goes through, so it owns the
  // partner list too and the two lists can never disagree.
  const list = app.slice(app.indexOf("function renderShopList"), app.indexOf("// ── REDEEMING A PERK"));
  assert.match(list, /renderOtherPartners\(/);
  const html = fs.readFileSync(path.join(__dirname, "..", "app.html"), "utf8");
  assert.match(html, /id="mapPartnerList"/);
});

test("the map intro states the cumulative rule, not a single long drink", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "app.html"), "utf8");
  assert.doesNotMatch(html, /finish a long drink/);
  assert.match(html, /added up across your sessions/);
});
