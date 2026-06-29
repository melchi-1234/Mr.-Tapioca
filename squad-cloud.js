// ── SquadCloud: optional Supabase backend for a LIVE Study Squad ──────────────
// Loads ONLY when config.js has Supabase keys. With no keys, this module stays
// inert and the app uses the on-device Study Squad (app.js) unchanged.
//
// Security note: the anon key is public by design — every read/write is gated by
// Row-Level Security in the database (see supabase-setup.sql). This file never
// throws into the app; any failure just leaves the offline Squad in place.
(function () {
  const CLOUD = window.MRTAP_CLOUD || {};
  const ENABLED = !!(CLOUD.url && CLOUD.anonKey);

  const SquadCloud = {
    enabled: ENABLED,   // keys are present
    ready: false,       // signed in + first fetch succeeded → use live data
    friends: [],        // [{id,name,mins,drinks,streak,skin,ts,me}]
  };
  window.SquadCloud = SquadCloud;
  if (!ENABLED) return;   // offline app — nothing else to do

  let sb = null, myCode = null, sbPromise = null;

  function loadSupabase() {
    if (sbPromise) return sbPromise;
    sbPromise = import("https://esm.sh/@supabase/supabase-js@2")
      .then((m) => m.createClient(CLOUD.url, CLOUD.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage },
      }))
      .catch((e) => { console.warn("[squad] supabase load failed — staying offline", e); sbPromise = null; return null; });
    return sbPromise;
  }

  async function ensureAuth() {
    sb = await loadSupabase();
    if (!sb) return null;
    let { data: { session } } = await sb.auth.getSession();   // restored from localStorage
    if (!session) {
      const { data, error } = await sb.auth.signInAnonymously();
      if (error) { console.warn("[squad] anon sign-in failed", error); return null; }
      session = data.session;
    }
    return sb;
  }

  SquadCloud.init = async function () {
    if (!ENABLED) return;
    if (!(await ensureAuth())) return;   // any failure → stay offline
    try {
      const { data } = await sb.rpc("get_my_friend_code");
      myCode = data || null;
      await SquadCloud.pushProfileNow();   // make sure our row reflects current local stats
      await SquadCloud.fetchFriends();
      SquadCloud.ready = true;             // flips ON only after success
      if (typeof renderSquad === "function") renderSquad();
    } catch (e) { console.warn("[squad] init failed — offline", e); }
  };

  SquadCloud.myCode = () => myCode;

  // Push our cosmetic + soft stats (incl. focus minutes — server clamps to a sane
  // increase). For real partner-discount redemption later, swap focus_minutes to
  // the validated focus_sessions model (see supabase-setup.sql notes).
  SquadCloud.pushProfileNow = async function () {
    if (!sb || typeof mySquadStats !== "function") return;
    const me = mySquadStats();
    try {
      await sb.rpc("set_my_profile", {
        p_display_name: String(me.name || "").slice(0, 24),
        p_skin: me.skin || "",
        p_focus_minutes: Math.max(0, Math.round(me.mins) || 0),
        p_drinks: Math.max(0, me.drinks || 0),
        p_streak: Math.max(0, me.streak || 0),
        p_status: me.status || "idle",
      });
    } catch (_) { /* keep going */ }
  };
  // Debounced version for frequent callers
  let pushT = null;
  SquadCloud.pushProfile = function () {
    if (!SquadCloud.ready) return;
    clearTimeout(pushT);
    pushT = setTimeout(() => { SquadCloud.pushProfileNow().then(() => SquadCloud.fetchFriends()); }, 1500);
  };

  SquadCloud.fetchFriends = async function () {
    if (!sb) return;
    const { data, error } = await sb.rpc("get_my_friends");
    if (error) return;   // keep last-good render
    SquadCloud.friends = (data || []).map((r) => ({
      id: r.id, name: r.display_name, mins: r.focus_minutes,
      drinks: r.drinks, streak: r.streak, skin: r.skin, ts: r.updated_at, status: r.status, me: !!r.is_me,
    }));
    if (typeof renderSquad === "function") renderSquad();
  };

  SquadCloud.follow = async function (code) {
    if (!sb) return false;
    try {
      const { data, error } = await sb.rpc("add_friend_by_code", { p_code: String(code || "").toUpperCase() });
      if (error || !data || !data.length) return false;
      await SquadCloud.fetchFriends();
      return true;
    } catch { return false; }
  };

  SquadCloud.unfollow = async function (id) {
    if (!sb) return;
    try { await sb.from("friendships").delete().eq("friend_id", id); await SquadCloud.fetchFriends(); } catch (_) {}
  };

  SquadCloud.deleteAccount = async function () {
    if (!sb) return;
    try { await sb.rpc("delete_my_account"); await sb.auth.signOut(); } catch (_) {}
    SquadCloud.ready = false; SquadCloud.friends = []; myCode = null;
  };
})();
