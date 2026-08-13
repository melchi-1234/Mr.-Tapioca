// ── Local notifications ──────────────────────────────────────────────────────
// The app had NO notification capability of any kind. That is a real gap for a
// 15-minute-to-4-hour timer whose entire premise is that you put the phone down:
// completion does not even fire until the app is reopened (app.js calls tick() on
// return to visible), so a student who focuses for four hours with the phone face
// down learns their drink is ready when they next unlock it.
//
// TWO NOTIFICATIONS. That is the whole feature, on purpose.
//   1. Your focus session finished.
//   2. An optional daily reminder, at a time the user picks.
//
// Deliberately NOT built, and the reason matters more than the code:
//   * No streak-loss warnings. "Your 12 day streak ends in 2 hours" is a threat,
//     and the app's own tone is a cozy boba shop, not a collections agency.
//   * No "we miss you" re-engagement. Nobody ever wanted one.
//   * No reward-ready nudge. It could only be honest at the moment a threshold is
//     crossed, which is a moment the user is already looking at the app, so it
//     would be noise. If it ever ships it belongs on a real server-side trigger.
//
// HOW COMPLETION ACTUALLY WORKS. You cannot run code at the end of a timer while
// backgrounded, so nothing "fires on completion". The notification is SCHEDULED at
// the moment the session starts, for the moment it will end, and CANCELLED if the
// user pauses, resets, or is still in the app when it lands. Anything else either
// lies about the time or fires after a session the user already abandoned.
(function (root, factory) {
  const api = factory(root);
  root.MrTNotify = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const PREF_KEY = "bobaNotifyPrefs";   // { done: bool, daily: bool, dailyMin: 0-1439 }
  const ID_DONE = 1001;                 // stable ids so a reschedule replaces rather than stacks
  const ID_DAILY = 1002;

  const N = {
    // "capacitor" (native), "web" (Notification API), or "" when neither exists.
    backend: "",
    permission: "default",              // default | granted | denied | unsupported
  };

  function cap() {
    const C = root.Capacitor;
    if (!C || !C.Plugins || !C.Plugins.LocalNotifications) return null;
    if (C.isNativePlatform && !C.isNativePlatform()) return null;
    return C.Plugins.LocalNotifications;
  }
  function webOK() {
    return typeof root.Notification === "function" && "serviceWorker" in (root.navigator || {});
  }

  N.backend = cap() ? "capacitor" : (webOK() ? "web" : "");
  N.available = function () { return N.backend !== ""; };

  // ── prefs ──────────────────────────────────────────────────────────────────
  function readPrefs() {
    const base = { done: false, daily: false, dailyMin: 20 * 60 };   // 8pm if they turn it on
    try {
      const raw = root.localStorage && localStorage.getItem(PREF_KEY);
      if (!raw) return base;
      const v = JSON.parse(raw);
      return {
        done: v.done === true,
        daily: v.daily === true,
        dailyMin: (typeof v.dailyMin === "number" && v.dailyMin >= 0 && v.dailyMin <= 1439)
          ? Math.floor(v.dailyMin) : base.dailyMin,
      };
    } catch (e) { return base; }
  }
  function writePrefs(p) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) {}
  }
  N.prefs = readPrefs;

  // ── permission ─────────────────────────────────────────────────────────────
  N.checkPermission = async function () {
    if (!N.available()) { N.permission = "unsupported"; return N.permission; }
    try {
      if (N.backend === "capacitor") {
        const r = await cap().checkPermissions();
        N.permission = (r && r.display) || "default";
      } else {
        N.permission = Notification.permission;
      }
    } catch (e) { N.permission = "default"; }
    return N.permission;
  };

  /**
   * Ask for permission. The CALLER must have explained why first: iOS gives one
   * prompt per install, and spending it before the user knows what it is for is
   * how an app ends up permanently unable to tell someone their timer finished.
   *
   * Returns "granted" | "denied" | "unsupported". Never throws.
   */
  N.requestPermission = async function () {
    if (!N.available()) return "unsupported";
    try {
      if (N.backend === "capacitor") {
        const r = await cap().requestPermissions();
        N.permission = (r && r.display) || "denied";
      } else {
        N.permission = await Notification.requestPermission();
      }
    } catch (e) { N.permission = "denied"; }
    return N.permission;
  };

  // ── scheduling ─────────────────────────────────────────────────────────────
  async function schedule(id, title, body, at, repeatDaily) {
    if (!N.available() || N.permission !== "granted") return false;
    try {
      if (N.backend === "capacitor") {
        await cap().schedule({
          notifications: [{
            id: id, title: title, body: body,
            schedule: repeatDaily ? { at: at, repeats: true, every: "day" } : { at: at },
          }],
        });
        return true;
      }
      // Web has no OS-level scheduler, so a timer in the page is the only option.
      // It therefore only survives while the tab is alive, which is exactly why
      // the native plugin is the one that matters. Stated plainly rather than
      // pretended around.
      const delay = at.getTime() - Date.now();
      if (delay < 0 || delay > 24 * 60 * 60 * 1000) return false;
      clearTimeout(webTimers[id]);
      webTimers[id] = setTimeout(function () {
        try { new Notification(title, { body: body, icon: "assets/icon-192.png", tag: "mrt-" + id }); }
        catch (e) {}
        if (repeatDaily) schedule(id, title, body, new Date(at.getTime() + 86400000), true);
      }, delay);
      return true;
    } catch (e) { return false; }
  }
  const webTimers = {};

  async function cancel(id) {
    try {
      if (N.backend === "capacitor") await cap().cancel({ notifications: [{ id: id }] });
      else clearTimeout(webTimers[id]);
    } catch (e) {}
  }

  // ── the two notifications ──────────────────────────────────────────────────
  /**
   * Schedule "your drink is ready" for when this session will end.
   * Call at session START. Safe to call repeatedly: the id is stable, so a
   * reschedule replaces rather than stacks.
   */
  N.scheduleSessionDone = async function (endsAtMs, drinkName) {
    const p = readPrefs();
    if (!p.done) return false;
    if (!(endsAtMs > Date.now())) return false;
    return schedule(ID_DONE, "Your drink is ready 🧋",
      drinkName ? `${drinkName} is done brewing. Nice focus.` : "Your focus session is done. Nice work.",
      new Date(endsAtMs), false);
  };

  /** Call on pause, reset, or in-app completion. The session is no longer going to end when it said. */
  N.cancelSessionDone = function () { return cancel(ID_DONE); };

  /** Re-apply the daily reminder from prefs. Call after any pref change and at boot. */
  N.applyDaily = async function () {
    const p = readPrefs();
    await cancel(ID_DAILY);
    if (!p.daily) return false;
    const now = new Date();
    const at = new Date(now);
    at.setHours(Math.floor(p.dailyMin / 60), p.dailyMin % 60, 0, 0);
    if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);   // today's time already passed
    return schedule(ID_DAILY, "Time to focus 🧋", "A short session still counts.", at, true);
  };

  /**
   * Turn a preference on or off. Requesting permission is the CALLER's job, so a
   * toggle cannot silently burn the one prompt iOS allows.
   * Returns the prefs actually stored.
   */
  N.setPref = async function (key, value) {
    const p = readPrefs();
    if (key === "done") p.done = !!value;
    else if (key === "daily") p.daily = !!value;
    else if (key === "dailyMin") {
      const v = Number(value);
      if (isFinite(v) && v >= 0 && v <= 1439) p.dailyMin = Math.floor(v);
    }
    writePrefs(p);
    if (key !== "done") await N.applyDaily();
    if (key === "done" && !p.done) await N.cancelSessionDone();
    return p;
  };

  N.init = async function () {
    if (!N.available()) return;
    await N.checkPermission();
    // Only re-arm what the user already asked for. Never schedule anything on a
    // fresh install: a notification nobody opted into is spam by definition.
    if (N.permission === "granted") await N.applyDaily();
  };

  // Exposed for tests.
  N._ids = { done: ID_DONE, daily: ID_DAILY };
  N._readPrefs = readPrefs;
  N._writePrefs = writePrefs;
  return N;
});
