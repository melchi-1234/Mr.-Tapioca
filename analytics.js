// ── MrTAnalytics: privacy-conscious product analytics ────────────────────────
//
// WHAT PROBLEM THIS SOLVES. Today the only product signal that leaves a phone is
// metrics.js: one row per finished drink, {device, size, minutes, platform}. That
// answers exactly one question ("how many drinks has the app brewed?") and cannot
// answer a single activation, retention or funnel question. It cannot say how many
// people who saw onboarding ever finished a first focus session, whether anyone
// comes back on day 7, or whether the partner map is ever opened. This module adds
// that layer. metrics.js STAYS — it is the Demo Day drink counter and this file
// does not replace it or read from it.
//
// Load order: after config.js (it reads window.MRTAP_CLOUD). It never calls into
// app.js and app.js does not have to exist for this file to load.
//
// FIVE RULES THIS FILE IS BUILT AROUND
//
//   1. Inert with no keys. With config.js blank this module makes zero network
//      requests AND zero localStorage writes. Not "writes but never sends" —
//      nothing touches the disk, so a fork with the keys removed leaves no trace.
//      Same deal as squad-cloud.js and metrics.js.
//   2. Never throws into the app. Every public method is wrapped. Losing an event
//      must never cost a user their drink. This is the same promise metrics.js
//      makes at its line 5, and it is the reason for the un-idiomatic try/catch
//      density below.
//   3. Once-only events fire once, and are not silently lost. first_open,
//      onboarding_started, onboarding_completed, first_focus_started and
//      first_focus_completed go through a persisted dedup map no matter which
//      method calls them, so a reload, a crash-and-restart, or app.js calling
//      track() twice by mistake all produce one row. Two things keep that true
//      under queue pressure: the permanent mark is written only AFTER the row is
//      sitting in the persisted queue, and those rows ride a priority lane so a
//      flood of session_started cannot evict one. If a queued funnel row does
//      die anyway (the queue holds nothing but funnel rows, or the server keeps
//      rejecting the batch) its mark is handed back so the event can fire again.
//      The honest residual: a crash in the microseconds between the queue write
//      and the mark write re-fires the event on the next launch and the funnel
//      gets one duplicate row. Every query in METRICS-SPEC.md §6 survives that,
//      because they aggregate per device with bool_or. Zero rows is the failure
//      that cannot be recovered from, and that is the one this order rules out.
//      See ALWAYS_ONCE, evictOne() and trackOnce().
//   4. A retry must not double-count. Every row carries a client-generated uuid
//      and the server has a unique constraint on it (see METRICS-SPEC.md §SQL).
//      A flush that succeeds but whose response is lost is re-sent and lands as a
//      no-op, so the queue can be dumb and pessimistic.
//   5. Nothing personal is collectable, not merely uncollected. Property keys go
//      through a hard allowlist (NUM_PROPS / BOOL_PROPS / SLUG_PROPS / ENUM_PROPS).
//      There is NO free-text property anywhere in the schema. A future caller
//      cannot accidentally ship a name, an email or a note, because there is no
//      key for one and unknown keys are dropped before the row is built.
//
// WHAT IS DELIBERATELY NOT COLLECTED
//   · names, emails, friend codes, display names, squad membership
//   · location of any kind — no lat/lng, no city, no "shops near you" geometry
//   · the identity of blocked apps. `apps_selected_count` is a COUNT. The Screen
//     Time selection never leaves the device and there is no property that could
//     carry it (FamilyActivitySelection tokens are opaque on-device by design and
//     this module has no key that would accept one).
//   · any cross-app advertising identifier. No IDFA, no ATT prompt, no SDK.
//   · money. purchase_completed carries a product id and NO price or amount.
//     StoreKit / App Store Connect is the revenue ledger; this table must never
//     be used as one and cannot be, because the number is not in it.
//
// The device id is the SAME random per-install UUID metrics.js already mints
// (`bobaMetricsDevice`). Reusing it is deliberate: two ids per install would be a
// second identifier to disclose on the App Store privacy label AND would make
// "devices" disagree between the two tables, which reads as double the installs.
// It links to nothing — no account, no auth uid, no contact detail.
//
// ⚠ COMPLIANCE BLOCKER, read before wiring this up. privacy.html:59-61 currently
// says focus sessions and progress never leave the device, and APP_STORE_LISTING.md
// §8 does not declare Usage Data. Both are already wrong because of metrics.js
// (GROUNDING.md §8 items 6, 7, 9, 10). Shipping this module makes an existing false
// statement worse, not better. The privacy copy and the App Privacy answers have to
// land in the SAME release. That is a hard gate, not a nice-to-have.
(function (root, factory) {
  const api = factory(root);
  root.MrTAnalytics = api;
  // CommonJS export so the QA scripts and tests can require() this file with a
  // fake localStorage and a fake fetch. Same wrapper reward-config.js uses.
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const CLOUD = root.MRTAP_CLOUD || {};
  const FLAGS = root.MRTAP_FLAGS || {};

  // TWO gates, and the flag is the important one.
  //
  // Keys alone are not enough. config.js ships real Supabase keys, so gating on
  // keys the way metrics.js does would have switched a 31-event product-analytics
  // stream ON for every live user the moment this file was added to index.html.
  // That is new data collection starting before privacy.html discloses it and
  // before the App Store privacy answers say Usage Data, which is exactly the
  // mismatch that made the CURRENT privacy copy wrong (GROUNDING.md section 8,
  // items 6, 7, 9 and 10). Shipping the wiring with the collection switched off
  // means the disclosure and the behaviour can be turned on in the same release.
  //
  // Turn it on by setting MRTAP_FLAGS.analytics = true in config.js, but only
  // once: the app_events table exists, privacy.html describes what is collected,
  // and the App Store privacy answers declare Usage Data (not linked to identity).
  // The localStorage override is for QA and cannot conjure a backend.
  function flagOn() {
    if (FLAGS.analytics === true) return true;
    try { return root.localStorage && localStorage.getItem("bobaAnalytics") === "on"; }
    catch (e) { return false; }
  }
  const ENABLED = !!(CLOUD.url && CLOUD.anonKey) && flagOn();

  const TABLE = "/rest/v1/app_events";

  // Storage keys. `bobaMetricsDevice` is shared with metrics.js on purpose (see
  // header); every other key is new and namespaced so nothing here can collide
  // with the bobaFocus* keys app.js owns.
  const DEVICE_KEY  = "bobaMetricsDevice";
  const QUEUE_KEY   = "bobaAnalyticsQueue";
  const ONCE_KEY    = "bobaAnalyticsOnce";      // permanent dedup: {key: 1}
  const DAY_KEY     = "bobaAnalyticsDay";       // daily dedup:     {name: "YYYY-MM-DD"}
  const INSTALL_KEY = "bobaAnalyticsInstalled"; // "YYYY-MM-DD", local, day 0
  const RING_KEY    = "bobaAnalyticsRing";      // local debug log, NEVER uploaded

  const MAX_QUEUE = 200;          // rows (ordinary rows are evicted first, see evictOne)
  const MAX_BYTES = 64 * 1024;    // serialized queue ceiling
  const BATCH     = 20;           // rows per POST
  const RING_MAX  = 50;           // debug ring depth
  const FLUSH_MS  = 4000;         // debounce after an event
  const MAX_TRIES = 3;            // per batch, before a poison batch is dropped
  const MAX_ONCE  = 500;          // ceiling on the permanent dedup map

  // This module's own version, and the FLOOR for the app_version column. A row can
  // always say which analytics.js produced it. Bump it whenever this file changes
  // shape. It is not the app build; see appVersion().
  const MODULE_VERSION = "analytics-1";

  // ── Event catalogue ────────────────────────────────────────────────────────
  // The name list is duplicated as a CHECK constraint on the server, so adding an
  // event means editing this object AND running a migration. That is the price of
  // making it impossible for a rogue or buggy client to invent event names and
  // pollute every GROUP BY the founder metrics run. Worth it at this size.
  const EVENTS = {
    // activation
    first_open: "activation",
    onboarding_started: "activation",
    onboarding_completed: "activation",
    screentime_explainer_viewed: "activation",
    permission_granted: "activation",
    permission_denied: "activation",
    apps_selected: "activation",
    first_focus_started: "activation",
    first_focus_completed: "activation",
    // focus
    session_started: "focus",
    session_completed: "focus",
    session_abandoned: "focus",
    // retention
    daily_goal_completed: "retention",
    streak_continued: "retention",
    return_day: "retention",
    quest_completed: "retention",
    // rewards
    partner_discovered: "rewards",
    offer_viewed: "rewards",
    progress_viewed: "rewards",
    reward_issued: "rewards",
    redemption_started: "rewards",
    redemption_completed: "rewards",
    redemption_failed: "rewards",
    // growth
    focus_card_shared: "growth",
    reward_card_shared: "growth",
    squad_invite_shared: "growth",
    install_link_opened: "growth",
    // commerce
    cosmetic_viewed: "commerce",
    purchase_initiated: "commerce",
    purchase_completed: "commerce",
    restore_completed: "commerce",
  };

  // Routed through the permanent dedup map whatever method calls them. Note the
  // consequence: onboarding and the tour are replayable from Settings
  // (index.html:453-461), and a replay produces NO second row. That is correct for
  // a funnel denominator and wrong for "how many people replay onboarding" — if
  // that question ever matters it needs its own event name, not a loosening here.
  const ALWAYS_ONCE = [
    "first_open",
    "onboarding_started",
    "onboarding_completed",
    "first_focus_started",
    "first_focus_completed",
  ];

  // ── Property allowlist ─────────────────────────────────────────────────────
  // Anything not named here is dropped before the row exists. This is the privacy
  // control; the comment block at the top is only the explanation of it.
  const NUM_PROPS = {
    planned_minutes:     { min: 1, max: 1440 },
    actual_minutes:      { min: 0, max: 1440 },
    apps_selected_count: { min: 0, max: 500 },   // COUNT ONLY — never which apps
    streak_days:         { min: 0, max: 100000 },
  };
  const BOOL_PROPS = ["native_blocking_enabled"];
  const SLUG_PROPS = {
    partner_id: 64,   // the id from partners.json, e.g. "u-tea-collegetown"
    quest_id:   40,
    product_id: 64,   // cosmetic id. NOT a price — there is no price key.
    source:     24,   // aggregate install attribution slug, e.g. "share_reward"
  };
  const ENUM_PROPS = {
    block_failure: ["none", "not_authorized", "no_apps_picked", "shield_not_applied", "ignore_limit", "unknown"],
    reason:        ["no_reward", "expired", "already_used", "wrong_shop", "network", "cancelled", "unknown"],
  };
  const SLUG_RE = /^[a-z0-9][a-z0-9_.-]*$/;

  // ── Storage ────────────────────────────────────────────────────────────────
  // One abstraction so every code path below is identical whether keys are present
  // or not. With no keys it is a plain in-memory object, which is what makes
  // "inert" literal: not one localStorage call is issued.
  const mem = Object.create(null);
  const store = {
    get: function (k) {
      if (!ENABLED) return (k in mem) ? mem[k] : null;
      // Safari private mode throws on BOTH getItem and setItem, not just setItem.
      try { return root.localStorage ? root.localStorage.getItem(k) : null; } catch (e) { return null; }
    },
    set: function (k, v) {
      if (!ENABLED) { mem[k] = v; return; }
      try { if (root.localStorage) root.localStorage.setItem(k, v); } catch (e) { /* quota / private mode */ }
    },
  };

  function readJSON(key, fallback) {
    try {
      const raw = store.get(key);
      if (!raw) return fallback;
      const v = JSON.parse(raw);
      return (v == null) ? fallback : v;
    } catch (e) { return fallback; }
  }

  function warn(msg) {
    // GROUNDING.md §3 lists "malformed entries silently dropped, no console
    // warning" as a real gap in the partner loader. Do not repeat it here.
    try { if (root.console && root.console.warn) root.console.warn("[analytics] " + msg); } catch (e) {}
  }

  // ── Identity + time ────────────────────────────────────────────────────────

  function uuid4() {
    try { if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID(); } catch (e) {}
    // The event_id column is typed `uuid`, so the fallback has to be a
    // syntactically valid v4. metrics.js's `Date.now() + "-" + random` shape would
    // be rejected by Postgres and take the whole 20-row batch down with it.
    const h = "0123456789abcdef";
    let s = "";
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) { s += "-"; continue; }
      if (i === 14) { s += "4"; continue; }
      const r = Math.floor(Math.random() * 16);
      s += (i === 19) ? h[(r & 0x3) | 0x8] : h[r];
    }
    return s;
  }

  let cachedDevice = null;
  function deviceId() {
    if (cachedDevice) return cachedDevice;
    let id = store.get(DEVICE_KEY);
    // Accept whatever metrics.js already minted, including its pre-uuid fallback
    // shape — `device` is a text column with the same 8..64 bound drink_events
    // uses, so legacy ids are valid and re-minting one would fork the install.
    if (typeof id !== "string" || id.length < 8 || id.length > 64) {
      id = uuid4();
      store.set(DEVICE_KEY, id);
    }
    cachedDevice = id;
    return id;
  }

  function localDateKey(d) {
    const dt = d || new Date();
    const m = String(dt.getMonth() + 1);
    const day = String(dt.getDate());
    return dt.getFullYear() + "-" + (m.length < 2 ? "0" + m : m) + "-" + (day.length < 2 ? "0" + day : day);
  }

  function installDateKey() {
    let k = store.get(INSTALL_KEY);
    if (typeof k !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(k)) {
      k = localDateKey();
      store.set(INSTALL_KEY, k);
    }
    return k;
  }

  // Cohort day is computed on the DEVICE, in LOCAL time, and stamped onto every
  // row. Two reasons, both load-bearing:
  //   · Local, because a 7pm-Ithaca install bucketed in UTC lands three hours
  //     later on "the next day" and D1 retention quietly counts the same evening.
  //   · On the device, because a row queued offline and flushed three days later
  //     has a server created_at three days late. If retention were derived from
  //     created_at, one subway ride would move a user between cohorts.
  function cohortDay() {
    const a = Date.parse(installDateKey() + "T00:00:00");
    const b = Date.parse(localDateKey() + "T00:00:00");
    if (!isFinite(a) || !isFinite(b)) return 0;
    const d = Math.round((b - a) / 86400000);
    if (d < 0) return 0;              // user moved their clock backwards
    return d > 3650 ? 3650 : d;
  }

  const TS_MIN = Date.UTC(2026, 0, 1);
  const TS_MAX = Date.UTC(2100, 0, 1);
  function nowIso() {
    let t = Date.now();
    if (!isFinite(t)) t = TS_MIN;
    // The server CHECK is this same window. Clamping here rather than letting the
    // server reject is the whole point: one user with a 1970 clock would 400 the
    // batch and take the 19 good rows riding with it down forever.
    if (t < TS_MIN) t = TS_MIN;
    if (t >= TS_MAX) t = TS_MAX - 1;
    return new Date(t).toISOString();
  }

  function platform() {
    try {
      return (root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform())
        ? "ios" : "web";
    } catch (e) { return "web"; }
  }

  // The APP build has to be handed in, because this file cannot work it out: there
  // is no build constant anywhere in the web bundle (sw.js has CACHE, but that is
  // the worker's, not the page's, and the Capacitor App plugin only answers async
  // and only on iOS). METRICS-SPEC.md §5 step 1 is the one line that supplies it:
  //
  //     <script>window.MRTAP_VERSION = "1.1.1-8";</script>   // before analytics.js
  //
  // Skip that line and every row reads "analytics-1". That is honest — it names
  // the module, not the build — and METRICS-SPEC.md §6.10 says to read it as "the
  // version line was never wired", not as a bug.
  function appVersion() {
    const v = root.MRTAP_VERSION;
    if (typeof v !== "string") return MODULE_VERSION;
    const s = v.trim().slice(0, 24);
    return s || MODULE_VERSION;
  }

  // ── Sanitizing ─────────────────────────────────────────────────────────────

  function num(v, r) {
    if (typeof v !== "number" || !isFinite(v)) return null;
    const n = Math.round(v);
    // Out of range is DROPPED, not clamped. A 9999-minute session is a bug in the
    // caller and clamping it to 1440 would bury the bug inside a plausible total.
    return (n < r.min || n > r.max) ? null : n;
  }

  function slug(v, max) {
    if (typeof v !== "string") return null;
    const s = v.trim().toLowerCase();
    if (!s || s.length > max || !SLUG_RE.test(s)) return null;
    return s;
  }

  function sanitize(props) {
    const cols = { planned_minutes: null, actual_minutes: null, blocking: null, partner_id: null };
    const rest = {};
    if (!props || typeof props !== "object") return { cols: cols, rest: rest };
    for (const k in props) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
      const v = props[k];
      let out;
      if (NUM_PROPS[k]) out = num(v, NUM_PROPS[k]);
      else if (BOOL_PROPS.indexOf(k) >= 0) out = (typeof v === "boolean") ? v : null;
      else if (SLUG_PROPS[k]) out = slug(v, SLUG_PROPS[k]);
      else if (ENUM_PROPS[k]) out = (ENUM_PROPS[k].indexOf(v) >= 0) ? v : null;
      else { warn('dropped unknown property "' + k + '" (not in the allowlist)'); continue; }
      if (out === null) { warn('dropped invalid value for "' + k + '"'); continue; }
      if (k === "planned_minutes") cols.planned_minutes = out;
      else if (k === "actual_minutes") cols.actual_minutes = out;
      else if (k === "native_blocking_enabled") cols.blocking = out;
      else if (k === "partner_id") cols.partner_id = out;
      else rest[k] = out;
    }
    return { cols: cols, rest: rest };
  }

  // ── Debug ring buffer (local only, never uploaded) ─────────────────────────

  function pushRing(row) {
    const r = readJSON(RING_KEY, []);
    const list = Array.isArray(r) ? r : [];
    list.push({ name: row.name, ts: row.ts, day: row.cohort_day, props: row.props });
    while (list.length > RING_MAX) list.shift();
    store.set(RING_KEY, JSON.stringify(list));
  }

  // ── Queue ──────────────────────────────────────────────────────────────────
  // Entries are {r: row, t: tries, p?: 1, k?: onceKey}. Only `r` is ever sent.
  // `t` is the poison-batch counter, `p` marks the priority lane, and `k` is the
  // permanent dedup key this row is standing for, so a row that dies can hand its
  // mark back. None of the three is a column.

  function readQueue() {
    const q = readJSON(QUEUE_KEY, []);
    return Array.isArray(q) ? q : [];
  }

  // Spend an ORDINARY row before a once-only one. The funnel rows are the whole
  // reason this table exists (METRICS-SPEC.md §6.1, §6.2, and the "activated"
  // denominator in §6.4 and §6.6 all read them), and one busy afternoon of
  // session_started must not be able to push one out. A funnel row is only
  // dropped when the queue holds nothing else, and then its permanent mark goes
  // back so the event can fire again rather than vanishing for this install.
  // Unreadable entries go first of all: they can never be sent anyway.
  function evictOne(q) {
    for (let i = 0; i < q.length; i++) {
      if (!q[i] || !q[i].p) { q.splice(i, 1); return; }
    }
    const gone = q.shift();
    warn("queue holds nothing but once-only rows; dropping the oldest");
    if (gone && gone.k) releaseOnce(gone.k);
  }

  function writeQueue(q) {
    // Bounded two ways on purpose. The row cap is the stated requirement; the byte
    // cap is the one that actually protects the user, because localStorage is
    // shared with bobaFocusCollection and a quota exception thrown while saving a
    // finished drink would cost them the drink. Both bounds evict through
    // evictOne, so both respect the priority lane.
    while (q.length > MAX_QUEUE) evictOne(q);
    let s = JSON.stringify(q);
    while (s.length > MAX_BYTES && q.length > 1) { evictOne(q); s = JSON.stringify(q); }
    store.set(QUEUE_KEY, s);
    return q;
  }

  // Returns whether the row is actually SITTING in the persisted queue afterwards,
  // rather than whether it was pushed. That distinction is the fix for the funnel
  // hole: trackOnce() will not spend a permanent mark on a row the caps just threw
  // away, because this returns false in exactly that case.
  function enqueue(row, priority, onceKey) {
    const q = readQueue();
    const e = { r: row, t: 0 };
    if (priority) e.p = 1;
    if (onceKey) e.k = onceKey;
    q.push(e);
    const kept = writeQueue(q);
    for (let i = kept.length - 1; i >= 0; i--) {
      if (kept[i] && kept[i].r && kept[i].r.event_id === row.event_id) return true;
    }
    return false;
  }

  // Remove the rows a successful flush delivered. Re-reads from storage instead of
  // trusting the in-memory copy the flush started with: events fired WHILE the
  // request was in flight are already appended, and writing back a stale slice
  // would drop them silently.
  function dropSent(ids) {
    const q = readQueue();
    const keep = [];
    for (let i = 0; i < q.length; i++) {
      const e = q[i];
      if (!e || !e.r || !ids[e.r.event_id]) keep.push(e);
    }
    writeQueue(keep);
  }

  function penalise(ids) {
    const q = readQueue();
    const keep = [];
    for (let i = 0; i < q.length; i++) {
      const e = q[i];
      if (!e || !e.r) continue;
      if (ids[e.r.event_id]) {
        e.t = (e.t || 0) + 1;
        // Drop a batch the server will never accept. Without this, a 404 (the SQL
        // in METRICS-SPEC.md not run yet — SUPABASE_SETUP.md:100-102 documents the
        // same silent 404 for drink_events) or one CHECK violation wedges the
        // queue forever and every later event piles up behind it.
        if (e.t >= MAX_TRIES) {
          warn("dropping a batch the server keeps rejecting");
          // A funnel row dying here hands its permanent mark back. The realistic
          // case is the migration not having been run yet, so every POST 404s:
          // without this the first install to boot before the table existed would
          // be missing from the activation funnel forever, even after §7 is run.
          if (e.k) releaseOnce(e.k);
          continue;
        }
      }
      keep.push(e);
    }
    writeQueue(keep);
  }

  // ── Flush ──────────────────────────────────────────────────────────────────

  let flushT = null;
  let inFlight = false;

  function scheduleFlush() {
    if (!ENABLED) return;
    if (flushT) return;
    try {
      flushT = setTimeout(function () { flushT = null; flush(); }, FLUSH_MS);
    } catch (e) { flushT = null; }
  }

  // 4xx codes that mean "this body will never be accepted". 408 and 429 are
  // deliberately absent — those are worth retrying and must not burn a try.
  const FATAL = { 400: 1, 401: 1, 403: 1, 404: 1, 405: 1, 413: 1, 422: 1 };

  function flush() {
    if (!ENABLED || inFlight) return Promise.resolve(false);
    const q = readQueue();
    if (!q.length) return Promise.resolve(true);

    const batch = q.slice(0, BATCH);
    const rows = [];
    const ids = {};
    for (let i = 0; i < batch.length; i++) {
      if (!batch[i] || !batch[i].r) continue;
      rows.push(batch[i].r);
      ids[batch[i].r.event_id] = 1;
    }
    if (!rows.length) {
      // Every entry at the head of the queue was unreadable (a corrupt or
      // half-written bobaAnalyticsQueue value). Drop ONLY those, never the good
      // rows queued behind them: this used to clear the whole queue, which spent
      // ~180 valid rows to get rid of 20 bad ones. Same care dropSent() takes.
      const cur = readQueue();
      const keep = [];
      for (let i = 0; i < cur.length; i++) { if (cur[i] && cur[i].r) keep.push(cur[i]); }
      if (keep.length !== cur.length) warn("dropped " + (cur.length - keep.length) + " unreadable queue entries");
      writeQueue(keep);
      if (keep.length) scheduleFlush();
      return Promise.resolve(true);
    }

    inFlight = true;
    let p;
    try {
      p = root.fetch(CLOUD.url + TABLE, {
        method: "POST",
        // keepalive is what lets the batch survive the tab closing on the last
        // event of a session. Trap: the fetch spec caps keepalive bodies at 64 KB
        // ACROSS all in-flight keepalive requests, so BATCH stays small and
        // inFlight stops two triggers from spending the budget twice.
        keepalive: true,
        headers: {
          "content-type": "application/json",
          apikey: CLOUD.anonKey,
          authorization: "Bearer " + CLOUD.anonKey,
          // ignore-duplicates turns the insert into ON CONFLICT DO NOTHING against
          // the unique index on event_id. Belt and braces: a plain 409 is treated
          // as success below, so idempotency holds even if this hint is ignored.
          prefer: "return=minimal,resolution=ignore-duplicates",
        },
        body: JSON.stringify(rows),
      });
    } catch (e) {
      inFlight = false;
      return Promise.resolve(false);
    }

    return Promise.resolve(p).then(function (res) {
      const status = (res && typeof res.status === "number") ? res.status : 0;
      const ok = !!res && (res.ok === true || status === 409);
      if (ok) dropSent(ids);
      else if (FATAL[status]) penalise(ids);
      inFlight = false;
      if (ok && readQueue().length) scheduleFlush();
      return ok;
    }, function () {
      // Network failure. No try is burned: offline is not the server saying no.
      inFlight = false;
      return false;
    });
  }

  // ── Recording ──────────────────────────────────────────────────────────────

  // Returns true only when the row is safely persisted, or when the module is
  // inert and there is nothing to persist. trackOnce() leans on that: it will not
  // write a permanent dedup mark for a row this said no to.
  function record(name, props, priority, onceKey) {
    const s = sanitize(props);
    const row = {
      event_id: uuid4(),
      device: deviceId(),
      name: name,
      ts: nowIso(),
      cohort_day: cohortDay(),
      platform: platform(),
      app_version: appVersion(),
      planned_minutes: s.cols.planned_minutes,
      actual_minutes: s.cols.actual_minutes,
      blocking: s.cols.blocking,
      partner_id: s.cols.partner_id,
      props: s.rest,
    };
    pushRing(row);
    if (!ENABLED) return true;   // inert: recorded for the local ring, never queued
    if (!enqueue(row, priority, onceKey)) {
      warn('queue is full; dropped "' + name + '"');
      return false;
    }
    scheduleFlush();
    return true;
  }

  // ── Permanent dedup map ────────────────────────────────────────────────────
  // Split into read / commit / release instead of one markOnce(), because the mark
  // and the row it stands for are two separate localStorage writes and the order
  // between them is load-bearing. See trackOnce().

  function onceMap() {
    const m = readJSON(ONCE_KEY, {});
    return (m && typeof m === "object") ? m : {};
  }

  // "seen" = already fired, nothing to do · "full" = the map is at its ceiling, so
  // record but do not mark · "ok" = go ahead.
  function onceState(key) {
    const m = onceMap();
    if (m[key]) return "seen";
    // Only reachable with hundreds of scoped keys (partner ids). Warn rather than
    // evict: evicting would re-fire an event that is supposed to be unique.
    if (Object.keys(m).length >= MAX_ONCE) return "full";
    return "ok";
  }

  function commitOnce(key) {
    const m = onceMap();
    if (m[key]) return;
    m[key] = 1;
    store.set(ONCE_KEY, JSON.stringify(m));
  }

  // Hand a mark back when the row it stood for never made it out. Called from the
  // only two places a queued row can die: eviction under pressure (evictOne) and
  // the poison-batch guard (penalise). Both mean the server never saw the row, so
  // firing again later is a recovery and not a duplicate.
  function releaseOnce(key) {
    if (!key) return;
    const m = onceMap();
    if (!m[key]) return;
    delete m[key];
    store.set(ONCE_KEY, JSON.stringify(m));
  }

  function markDay(name) {
    const today = localDateKey();
    const m = readJSON(DAY_KEY, {}) || {};
    if (m[name] === today) return false;
    m[name] = today;
    // Keyed by NAME, not by date, so this map is bounded by the event catalogue
    // and not by how long the app has been installed. A {name: date} entry per day
    // would grow forever in localStorage.
    store.set(DAY_KEY, JSON.stringify(m));
    return true;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  const A = {
    enabled: ENABLED,
    EVENTS: EVENTS,
    ALWAYS_ONCE: ALWAYS_ONCE.slice(),
  };

  A.track = function (name, props) {
    try {
      if (!EVENTS[name]) { warn('unknown event "' + name + '", not sent'); return false; }
      if (ALWAYS_ONCE.indexOf(name) >= 0) return A.trackOnce(name, props);
      return record(name, props);
    } catch (e) { return false; }   // an analytics bug must never end a session
  };

  // Exactly once per install, forever. `scope` narrows the key for things that are
  // once-per-thing rather than once-per-install, e.g.
  //   trackOnce("partner_discovered", {partner_id: id}, id)
  A.trackOnce = function (name, props, scope) {
    try {
      if (!EVENTS[name]) { warn('unknown event "' + name + '", not sent'); return false; }
      const key = scope ? (name + ":" + String(scope)) : name;
      const st = onceState(key);
      if (st === "seen") return false;
      if (st === "full") warn("dedup map is full; " + key + " may repeat");
      // RECORD FIRST, mark second, and put the row in the priority lane.
      //
      // The mark is permanent, so it must not be spent until the row it stands
      // for is actually in the persisted queue. Marking first let writeQueue
      // evict the row under pressure while the mark stood, and the event then
      // produced ZERO rows and could never fire again. That is the one failure
      // the header's "exactly once" promise cannot absorb.
      //
      // Reversing the order trades it for a smaller one: a crash in the
      // microseconds between the queue write and the mark write re-fires the
      // event on the next launch, so the funnel gets one duplicate row. Every
      // query in METRICS-SPEC.md §6 aggregates per device with bool_or, so a
      // second first_focus_completed changes no number the founder reads.
      if (!record(name, props, true, st === "ok" ? key : null)) return false;
      if (st === "ok") commitOnce(key);
      return true;
    } catch (e) { return false; }
  };

  // Once per local calendar day. The right call for return_day, streak_continued
  // and daily_goal_completed, all of which app.js can reach more than once a day.
  A.trackDaily = function (name, props) {
    try {
      if (!EVENTS[name]) { warn('unknown event "' + name + '", not sent'); return false; }
      if (!markDay(name)) return false;
      return record(name, props);
    } catch (e) { return false; }
  };

  A.flush = function () {
    try { return flush(); } catch (e) { return Promise.resolve(false); }
  };

  A.recent = function (n) {
    try {
      const r = readJSON(RING_KEY, []);
      const list = Array.isArray(r) ? r : [];
      const k = (typeof n === "number" && n > 0) ? Math.min(n, list.length) : list.length;
      return list.slice(list.length - k);
    } catch (e) { return []; }
  };

  A.queueLength = function () { try { return readQueue().length; } catch (e) { return 0; } };
  A.deviceId = function () { try { return deviceId(); } catch (e) { return null; } };
  A.cohortDay = function () { try { return cohortDay(); } catch (e) { return 0; } };
  // What every row will stamp as app_version. Reading "analytics-1" back means the
  // MRTAP_VERSION line in METRICS-SPEC.md §5 step 1 was never added, so §6.10's
  // by-build query has only the module version to group on.
  A.appVersion = function () { try { return appVersion(); } catch (e) { return MODULE_VERSION; } };

  // QA only, and gated. GROUNDING.md D10 is the 7-tap dev unlock that ships in
  // production and mints pearls; an ungated reset here would be the same mistake
  // in a smaller costume, because clearing the dedup map lets one install replay
  // its whole activation funnel into the founder metrics.
  A.debugReset = function () {
    try {
      if (root.MRTAP_ANALYTICS_DEBUG !== true) { warn("debugReset is off; set MRTAP_ANALYTICS_DEBUG = true"); return false; }
      store.set(QUEUE_KEY, "[]");
      store.set(ONCE_KEY, "{}");
      store.set(DAY_KEY, "{}");
      store.set(RING_KEY, "[]");
      return true;
    } catch (e) { return false; }
  };

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  function wireLifecycle() {
    if (!ENABLED) return;
    const doc = root.document;
    try {
      if (doc && doc.addEventListener) {
        doc.addEventListener("visibilitychange", function () {
          if (doc.visibilityState === "hidden") flush();
        });
      }
      // pagehide, not beforeunload/unload: iOS Safari and the WKWebView fire
      // pagehide reliably and the other two are not guaranteed to run at all.
      if (root.addEventListener) root.addEventListener("pagehide", function () { flush(); });
    } catch (e) {}
  }

  (function init() {
    try {
      installDateKey();          // stamps day 0 on the first ever load
      A.track("first_open");     // ALWAYS_ONCE, so this is safe on every load
      A.trackDaily("return_day");
      // Drain anything a crash or a closed tab left behind. Deferred rather than
      // immediate so a cold start is not competing with the app's own boot work.
      if (ENABLED && readQueue().length) scheduleFlush();
      wireLifecycle();
    } catch (e) { /* analytics must never break boot */ }
  })();

  return A;
});
