const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

test("partner pins stack above ordinary boba pins on the map", () => {
  assert.match(app, /zIndexOffset:\s*p\s*\?\s*500\s*:\s*0/);
});
