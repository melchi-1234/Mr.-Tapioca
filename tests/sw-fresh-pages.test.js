const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// Guards the fix for: privacy.html / support.html were cache-first, so a
// content-only edit (e.g. correcting the privacy policy to match the published
// App Privacy labels) never reached a returning visitor who had already cached
// the page, until some unrelated release happened to bump CACHE. These are
// legal/marketing pages and MUST be served network-fresh, like "/" and
// index.html already are.
const sw = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");

// The network-fresh exemption block returns early (before the cache-first
// handler) for the marketing/legal pages. Grab it so we assert on the right code.
const exemption = sw.match(/if \(url\.pathname === "\/"[\s\S]*?return;/);
assert.ok(exemption, "could not find the network-fresh exemption block in sw.js");

for (const page of ["privacy.html", "support.html"]) {
  test(`${page} is served network-fresh (exempt from the cache-first handler)`, () => {
    assert.match(exemption[0], new RegExp(`endsWith\\("/${page.replace(".", "\\.")}"\\)`),
      `${page} must be in the network-fresh exemption so content edits reach returning visitors`);
  });
}

test("privacy.html and support.html are NOT precached in the versioned SHELL", () => {
  // If they were in SHELL they'd be pinned to the version anyway; the exemption
  // above is only meaningful while they stay out of the precache list.
  const shell = sw.match(/const SHELL\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(shell, "could not find the SHELL precache list in sw.js");
  assert.doesNotMatch(shell[1], /privacy\.html|support\.html/,
    "privacy/support pages must not be in the versioned SHELL precache");
});
