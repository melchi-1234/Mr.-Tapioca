// ── MrTMetrics: anonymous finished-drink counter ─────────────────────────────
// One tiny fire-and-forget row per finished drink, so "how many drinks has the
// app brewed?" (the eLab Demo Day metric) has a real answer. Loads after
// config.js; with no Supabase keys it stays inert, same deal as SquadCloud.
// Never throws into the app: losing a ping must never cost a user their drink.
//
// Privacy: no name, no email, no location. `device` is a random id minted on
// this install so unique devices are countable; it links to nothing else. The
// iOS privacy label must declare Usage Data (not linked to identity) on the
// next submission.
//
// Security: inserts are open to the public key by design (supabase-setup.sql
// §18) and reads are dashboard-only. Counts are best-effort and forgeable by a
// determined client. Fine for a progress counter; NEVER wire money or partner
// discounts to this table (see the FUTURE HARDENING note in the SQL).
(function () {
  const CLOUD = window.MRTAP_CLOUD || {};
  const ENABLED = !!(CLOUD.url && CLOUD.anonKey);
  const MrTMetrics = { enabled: ENABLED, drinkFinished: function () {} };
  window.MrTMetrics = MrTMetrics;
  if (!ENABLED) return;   // offline app — stay inert

  function deviceId() {
    let id = null;
    try { id = localStorage.getItem("bobaMetricsDevice"); } catch (e) {}
    if (!id) {
      id = (crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now()) + "-" + Math.random().toString(16).slice(2));
      try { localStorage.setItem("bobaMetricsDevice", id); } catch (e) {}
    }
    return id;
  }

  MrTMetrics.drinkFinished = function (size, minutes) {
    try {
      const row = {
        device: deviceId(),
        size: String(size || "").slice(0, 24),
        minutes: Math.max(1, Math.min(1440, Math.round(minutes || 0))),
        platform: (window.Capacitor && window.Capacitor.isNativePlatform &&
                   window.Capacitor.isNativePlatform()) ? "ios" : "web",
      };
      // keepalive lets the ping survive the tab closing right after a finish;
      // errors (offline, table not created yet) are swallowed on purpose.
      fetch(CLOUD.url + "/rest/v1/drink_events", {
        method: "POST",
        keepalive: true,
        headers: {
          "content-type": "application/json",
          apikey: CLOUD.anonKey,
          authorization: "Bearer " + CLOUD.anonKey,
          prefer: "return=minimal",
        },
        body: JSON.stringify(row),
      }).catch(function () {});
    } catch (e) { /* metrics must never break a finished drink */ }
  };
})();
