// Pomodoro auto-cycle (1.2.0). One protected session made of alternating work and
// break blocks.
//
// The whole feature turns on one distinction: a cycle break is INSIDE the session.
// The post-session Chill Mode break lifts the Screen Time shield on purpose,
// because it is free time. A cycle break must not, or the feature becomes four
// scheduled invitations an hour to open the app you asked to be protected from.
// That invariant, and the fact that break time never becomes focus time, are what
// this file exists to hold.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = require("node:net").createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

test("a pomodoro measures WORK, not wall clock", () => {
  // If modeDuration() returned the protected span instead, the cup would fill
  // during breaks, the banked drink's minutes would include resting, and the pearl
  // formula would pay for sitting still.
  const fn = source.slice(source.indexOf("function modeDuration()"),
                          source.indexOf("function pomoWork()"));
  assert.match(fn, /pomoWork\(\) \* pomoReps\(\)/);
  assert.doesNotMatch(fn, /pomoBreakLen\(\)/,
    "modeDuration must not include break time");

  const protectedFn = source.slice(source.indexOf("function pomoProtectedSeconds()"),
                                   source.indexOf("function protectedSecondsLeft()"));
  assert.match(protectedFn, /breaksLeft \* pomoBreakLen\(\)/,
    "the shield span, unlike the cup, MUST include the breaks still to come");
});

test("a cycle break never lifts the shield", () => {
  const start = source.slice(source.indexOf("function startCycleBreak()"),
                             source.indexOf("function endCycleBreak()"));
  const end = source.slice(source.indexOf("function endCycleBreak()"),
                           source.indexOf("function renderPomoStatus()"));
  for (const [name, body] of [["startCycleBreak", start], ["endCycleBreak", end]]) {
    assert.doesNotMatch(body, /FocusBlocker\.stop|cancelAutoUnblock|FocusActivity\.stop/,
      `${name} must not touch the shield, the auto-unblock or the Lock Screen countdown`);
    assert.doesNotMatch(body, /renderBreakGameButtons|startBreak\(/,
      `${name} must not offer the mini-games: the apps are still locked`);
  }
  // And the post-session break, which SHOULD lift it, still does.
  const chill = source.slice(source.indexOf("function startBreak()"), source.indexOf("function tickBreak"));
  assert.match(chill, /FocusBlocker\.stop\(\)/,
    "the post-session Chill Mode break is free time and must still lift the shield");
});

test("the block boundary is a crossing test, not a comparison against the current block", () => {
  // This is a REGRESSION TEST for a bug that shipped into this very file and was
  // caught only by driving a real cycle in a browser. pomoBlockIndex() is derived
  // from elapsed, so `elapsed >= pomoBlockEnd()` can never be true: the moment
  // elapsed reaches a boundary the index has already advanced and blockEnd is a
  // boundary in the future. No break ever started, and nothing errored.
  const tick = source.slice(source.indexOf("function tick()"), source.indexOf("// ── Native distraction-blocker bridge"));
  assert.match(tick, /const boundary = \(Math\.floor\(before \/ pomoWork\(\)\) \+ 1\) \* pomoWork\(\);/);
  assert.match(tick, /state\.elapsed >= boundary/);
  assert.doesNotMatch(tick, /state\.elapsed >= pomoBlockEnd\(\)/,
    "the broken comparison must not come back");
  assert.match(tick, /boundary < modeDuration\(\)/,
    "the last block must fall through to completion, not into a trailing break");
  assert.match(tick, /state\.elapsed = boundary;/,
    "elapsed must be parked on the boundary or the tick's overshoot leaks into the next block");
});

test("break seconds never become focus seconds", () => {
  const tick = source.slice(source.indexOf("function tick()"), source.indexOf("// ── Native distraction-blocker bridge"));
  const breakBranch = tick.slice(tick.indexOf("if (inCycleBreak())"), tick.indexOf("} else {"));
  assert.doesNotMatch(breakBranch, /state\.elapsed =/,
    "elapsed is the earned-focus number that pearls, the cup and the reward ledger read");
  assert.match(breakBranch, /state\.pomoBreakLeft = Math\.max\(0, state\.pomoBreakLeft - delta\)/);
});

test("crash recovery cannot pay for a break, or cross a block boundary", () => {
  const load = source.slice(source.indexOf("const runningSince = readJSON"),
                            source.indexOf("state.onboarded   = readJSON"));
  assert.match(load, /if \(state\.pomoBreakLeft > 0\) \{[\s\S]*?extra -= spent;/,
    "an away window that covered a break must spend those seconds on the break first");
  assert.match(load, /Math\.min\(modeDuration\(\), pomoBlockEnd\(\), state\.elapsed \+ extra\)/,
    "the credit must stop at the end of the block that was running");
});

test("one drink, one pearl payout, one server session per cycle", () => {
  // completeSession is where minutes become a banked drink and pearls. Called once
  // per work block instead of once per cycle, four 25-minute drinks would pay
  // floor(25/15)=1 pearl each where one 100-minute drink pays 6, and four rows
  // would land in the collection.
  const tick = source.slice(source.indexOf("function tick()"), source.indexOf("// ── Native distraction-blocker bridge"));
  const completes = tick.match(/completeSession\(\)/g) || [];
  assert.equal(completes.length, 1, "tick must complete the session exactly once");
  assert.match(tick, /if \(!inCycleBreak\(\) && progress\(\) >= 1\)/,
    "a cycle can only finish on a work second");

  const begin = source.slice(source.indexOf("function beginFocus()"), source.indexOf("function pauseFocus()"));
  const starts = begin.match(/RewardV2\.startSession/g) || [];
  assert.equal(starts.length, 1, "one server reward session for the whole cycle");
  // The server credits least(wall elapsed, planned_minutes), so planned must be the
  // WORK total: the breaks are then excluded with no server change at all.
  assert.match(begin, /RewardV2\.startSession\(Math\.round\(modeDuration\(\) \/ 60\)\)/);
});

test("the shield is armed for the whole cycle, not for the next block", () => {
  const begin = source.slice(source.indexOf("function beginFocus()"), source.indexOf("function pauseFocus()"));
  assert.match(begin, /const sessionEndsAt = Date\.now\(\) \+ protectedSecondsLeft\(\) \* 1000;/);
  assert.doesNotMatch(begin, /\(modeDuration\(\) - state\.elapsed\) \* 1000/,
    "arming against the remaining WORK would free the apps one break early");
});

test("the smallest cycle the UI can build still arms the native auto-unblock", () => {
  // FocusShieldPlugin.scheduleAutoEnd refuses under 15 min 30 s (the build-12 fix),
  // and a cycle it never arms only unblocks on the next foreground. That is exactly
  // the bug build 11 shipped, so the stepper minimums have to stay clear of it.
  const consts = {};
  for (const name of ["POMO_WORK_MIN", "POMO_BREAK_MIN", "POMO_REPS_MIN", "POMO_MIN_PROTECTED"]) {
    const m = source.match(new RegExp(`${name}\\s*=\\s*([0-9*\\s]+)[,;]`));
    assert.ok(m, `${name} is missing`);
    consts[name] = eval(m[1]);   // eslint-disable-line no-eval -- a literal like "10 * 60"
  }
  const smallest = consts.POMO_WORK_MIN * consts.POMO_REPS_MIN
    + consts.POMO_BREAK_MIN * (consts.POMO_REPS_MIN - 1);
  assert.ok(smallest >= consts.POMO_MIN_PROTECTED,
    `the smallest cycle is ${smallest}s, under the ${consts.POMO_MIN_PROTECTED}s the native auto-unblock needs`);
  assert.ok(consts.POMO_MIN_PROTECTED >= 15 * 60 + 30,
    "the floor must clear scheduleAutoEnd's own guard");

  const swift = fs.readFileSync(path.join(ROOT, "native-ios", "FocusShieldPlugin.swift"), "utf8");
  assert.match(swift, /15 \* 60 \+ 30/,
    "if this guard moves, POMO_MIN_PROTECTED has to move with it");
});

test("a real cycle runs work, break, work in a browser", { timeout: 120_000 }, async () => {
  const { serve } = await import(pathToFileURL(path.resolve(ROOT, "tools", "qa", "serve.mjs")));
  const { launchChrome, Page } = await import(pathToFileURL(path.resolve(ROOT, "tools", "qa", "cdp.mjs")));
  const server = await serve(ROOT);
  const port = await freePort();
  const chrome = await launchChrome({ port, width: 375, height: 812 });
  let page;
  try {
    page = await Page.open(chrome.port, { width: 375, height: 812, scale: 1 });
    const errors = page.collectErrors();
    await page.send("Page.addScriptToEvaluateOnNewDocument", {
      source: `try{localStorage.setItem("bobaFocusOnboarded","true");localStorage.setItem("bobaFocusTourDone","1");}catch(e){}`,
    });
    await page.goto(`${server.origin}/app.html`, { waitMs: 800 });
    await page.click('.size-btn[data-mode="pomodoro"]');

    const result = await page.eval(`(async () => {
      // Count every shield teardown for the whole run. This is the assertion that
      // matters: nothing may free the apps between the first block and the last.
      let shieldStops = 0, autoUnblockCancels = 0;
      FocusBlocker.stop = () => { shieldStops++; };
      FocusBlocker.cancelAutoUnblock = () => { autoUnblockCancels++; };
      let armedFor = null;
      FocusBlocker.start = (endsAt) => { armedFor = Math.round((endsAt - Date.now()) / 1000); };

      // A 3s x 3 cycle with 2s breaks, so the whole thing runs inside one test.
      window.pomoWork = () => 3; window.pomoBreakLen = () => 2; window.pomoReps = () => 3;
      state.mode = "pomodoro"; state.elapsed = 0; state.pomoBreakLeft = 0;
      state.collection = []; state.rewards = [];

      const phases = [];
      let lastKey = "";
      document.querySelector("#startPauseBtn").click();
      for (let i = 0; i < 80; i++) {
        await new Promise(r => setTimeout(r, 250));
        const inBreak = state.pomoBreakLeft > 0;
        const key = state.running ? (inBreak ? "break" : "work") : "done";
        if (key !== lastKey) { phases.push(key); lastKey = key; }
        if (key === "done") break;
      }
      return {
        phases, shieldStops, autoUnblockCancels, armedFor,
        drinks: state.collection.length,
        elapsed: Math.round(state.elapsed),
      };
    })()`);

    assert.deepEqual(result.phases, ["work", "break", "work", "break", "work", "done"],
      "the cycle must alternate work and break and end on work");
    assert.equal(result.shieldStops, 1,
      "the shield may only be torn down once, at the very end of the cycle");
    assert.equal(result.autoUnblockCancels, 0,
      "the closed-app auto-unblock must not be cancelled at a block boundary");
    // 3 work blocks + 2 breaks = 13s of protected time for a 9s cup.
    assert.equal(result.armedFor, 13,
      "the shield must be armed for the whole protected span, breaks included");
    assert.equal(result.drinks, 1, "one cycle banks exactly one drink");
    assert.equal(errors.length, 0, errors.join(" | "));
  } finally {
    if (page) await page.close();
    chrome.close();
    await server.close();
  }
});
