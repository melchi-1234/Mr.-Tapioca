// The spilled-cup reaction (1.2.0 "Your Boba Buddy Reacts").
//
// Ending a session tips the cup over, and the mascot now reacts to it: the
// already-drawn `-shocked` pose plus one warm line. This suite exists mostly to
// pin the two things that are easy to break silently and impossible to see in a
// diff: the ORDER (a reaction fired before resetSession is erased by it) and the
// TONE (a pet that makes you feel judged for stopping is worse than no pet).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

// Comments in this file explain the reaction by name, so a bare substring search
// for "reactToBail" inside resetSession would match prose rather than a call.
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function sourceBetween(startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `missing ${endNeedle}`);
  return source.slice(start, end);
}

const SKINS = ["grad-cap", "flower", "scarf", "shades", "strawberry", "astro-blue",
  "dragon", "cat-hoodie", "royal", "ninja", "angel", "devil", "wizard", "base"];

test("every skin has a shocked pose on disk and in the precache list", () => {
  for (const skin of SKINS) {
    const rel = `assets/poses/${skin}-shocked.png`;
    assert.ok(fs.existsSync(path.join(root, rel)), `${rel} is missing`);
    assert.ok(sw.includes(`"${rel}"`),
      `${rel} must be in the sw.js SHELL or the reaction 404s for an installed user`);
  }
});

test("the shocked pose is reachable at runtime", () => {
  // It was drawn in August and never once passed to setMakerState. This asserts
  // the wire exists, not just the art.
  assert.match(source, /setMakerState\("shocked"\)/,
    "nothing puts the mascot into the shocked pose");
  assert.match(source, /shocked:\s*"assets\/poses\/" \+ skin \+ "-shocked\.png"/);
});

test("the reaction fires from the bail path and AFTER the teardown", () => {
  const end = sourceBetween("async function endFocusSession()", "// ── App-blocking discoverability");
  const resetIndex = end.indexOf("resetSession();");
  const reactIndex = end.indexOf("reactToBail();");
  assert.notEqual(resetIndex, -1, "endFocusSession must still tear the session down");
  assert.notEqual(reactIndex, -1, "endFocusSession must fire the reaction");
  // resetSession ends with setMakerState("idle"); a reaction before it is erased.
  assert.ok(resetIndex < reactIndex,
    "reactToBail must run after resetSession or the pose is immediately overwritten");
  assert.ok(end.indexOf("state.spillPending = true;") < resetIndex,
    "the latch has to be set before resetSession reads it");
});

test("resetSession stays free of the reaction, for its four non-bail callers", () => {
  const reset = stripComments(
    sourceBetween("function resetSession()", "function completeSession(options)"));
  assert.doesNotMatch(reset, /reactToBail|playSfx|makerSpeech|pulseMaker/,
    "resetSession is also called by mode and duration changes, which are not bails "
    + "(and it is vm-evaluated as raw text by reward-app-authority with almost nothing stubbed)");
  // It must CONSUME the latch, not just read it: a reaction that never finishes
  // would otherwise leave the flag set and suppress the walk home on the next
  // unrelated reset.
  assert.match(reset, /state\.spillPending = false;/, "the latch must be cleared here");
  assert.match(reset, /if \(!spilling\) \{[\s\S]*?setMakerState\("idle"\)/,
    "a pending spill must skip the glide home and the idle pose");
});

test("the held pose is released again", () => {
  // maker-shock uses `forwards`, so it holds until something changes state. If the
  // release is dropped he stays wide-eyed on the home screen indefinitely.
  assert.match(styles, /\.maker-img\[data-state="shocked"\]\s*\{[^}]*maker-shock/);
  assert.match(styles, /@keyframes maker-shock/);
  const react = sourceBetween("function reactToBail()", "// SVG interior y-range");
  assert.match(react, /bailPoseTimer = setTimeout/, "nothing releases the held pose");
  assert.match(react, /refreshMaker\(\)/);
  assert.match(react, /if \(currentMakerState !== "shocked"\) return;/,
    "the release must not stomp a state something else has since set");
  assert.match(react, /currentMakerState = "";\s*\n\s*setMakerState\("shocked"\)/,
    "setMakerState early-returns on an unchanged state, so it has to be cleared first");
});

test("one shared bubble timer, so a tap and the reaction cannot cut each other short", () => {
  const react = stripComments(
    sourceBetween("function reactToBail()", "// SVG interior y-range"));
  assert.match(react, /clearTimeout\(tapLineTimer\);/);
  assert.match(react, /tapLineTimer = setTimeout/);
  assert.doesNotMatch(react, /let \w+Timer = setTimeout/,
    "a second bubble timer races the tap handler's");
});

test("nothing the mascot says about a spill is aimed at the person", () => {
  const block = sourceBetween("const BAIL_LINES = [", "];");
  const lines = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(lines.length >= 4, "needs enough lines that it does not read as a canned response");

  // The failure this guards against is a well-meaning edit that adds "you were so
  // close!" or "don't lose your streak!" — either turns a warm moment into a
  // guilt trip, and neither would look wrong in a diff.
  const shaming = /\bstreak\b|\bfail|\bgave up\b|\bquit\b|\bdisappoint|\byou were so close\b|\bwasted\b|\btry harder\b|\blost\b/i;
  for (const line of lines) {
    assert.doesNotMatch(line, shaming, `"${line}" reads as a reproach, not an "aw, come back"`);
  }
  // House style: user-facing copy avoids em-dashes.
  for (const line of lines) assert.doesNotMatch(line, /—/, `"${line}" uses an em-dash`);

  // The sound must be the oops, not the penalty. "buzz" is a 180->80Hz sawtooth.
  const react = sourceBetween("function reactToBail()", "// SVG interior y-range");
  assert.match(react, /playSfx\("drop"\)/);
  assert.doesNotMatch(react, /playSfx\("buzz"\)/, "a buzzer reads as a punishment");
});

test("reactToBail actually runs and paints, on a real state object", () => {
  // Executed rather than only grepped: the ordering assertions above are text, and
  // text cannot catch a typo in an element name.
  const react = sourceBetween("function reactToBail()", "// SVG interior y-range");
  // Just the array. lastBailLine and bailPoseTimer are declared on the context
  // below so the slice does not redeclare them.
  const lines = sourceBetween("const BAIL_LINES = [", "];") + "];";
  const classList = () => {
    const set = new Set();
    return { add: (c) => set.add(c), remove: (c) => set.delete(c),
             contains: (c) => set.has(c), _set: set };
  };
  const speech = { textContent: "", classList: classList() };
  const calls = { sfx: [], haptics: [], refresh: 0, walk: [] };
  const context = {
    state: { spillPending: true },
    els: { makerSpeech: speech },
    currentMakerState: "mixing",
    tapLineTimer: null,
    walkTimer: null,
    setMakerState(name) { context.currentMakerState = name; },
    refreshMaker() { calls.refresh++; context.currentMakerState = "idle"; },
    setWalk(v) { calls.walk.push(v); },
    playSfx(n) { calls.sfx.push(n); },
    haptic(ms) { calls.haptics.push(ms); },
    bailPoseTimer: null,
    lastBailLine: "",
    setTimeout, clearTimeout, Math, console,
  };
  vm.createContext(context);
  vm.runInContext(`${lines}\n${react}\nreactToBail();`, context);

  assert.equal(context.currentMakerState, "shocked", "he must actually change pose");
  assert.ok(speech.classList.contains("show"), "the line must actually be shown");
  assert.ok(speech.textContent.length > 0);
  assert.deepEqual(calls.sfx, ["drop"]);
  assert.deepEqual(calls.haptics, [8]);
  assert.equal(calls.refresh, 0, "he holds the pose for a beat before recovering");
});
