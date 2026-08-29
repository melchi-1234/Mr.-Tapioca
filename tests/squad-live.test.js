// Study Squad Live (1.2.0): opt-in presence, a weekly leaderboard, and an invite
// link that a non-user can actually act on.
//
// The presence half is a privacy feature before it is a social one, so most of
// this file is about the ways it could leak: a default that is on, a client-only
// opt-out that leaves a stale "focusing" in the row forever, a status that keeps
// looking fresh because an unrelated write bumped a timestamp, or a phone that
// dies mid-session and shows its owner as studying until they open the app again.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const cloud = fs.readFileSync(path.join(ROOT, "squad-cloud.js"), "utf8");
const sql = fs.readFileSync(path.join(ROOT, "supabase-setup.sql"), "utf8");
const invite = fs.readFileSync(path.join(ROOT, "squad", "index.html"), "utf8");
const privacy = fs.readFileSync(path.join(ROOT, "privacy.html"), "utf8");
const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");

function between(text, start, end) {
  const i = text.indexOf(start);
  assert.notEqual(i, -1, `missing ${start}`);
  const j = text.indexOf(end, i + start.length);
  assert.notEqual(j, -1, `missing ${end}`);
  return text.slice(i, j);
}

test("presence is opt-in and starts off", () => {
  assert.match(app, /sharePresence: false,/, "the client default must be off");
  // The client default alone is not the guarantee: it is the server that decides
  // what other people can read.
  assert.match(sql, /share_presence boolean\s+not null default false/,
    "the stored default must be off too");
  assert.match(sql, /alter table public\.profiles add column if not exists share_presence boolean not null default false;/,
    "existing rows must be migrated to off, not left without the column");
});

test("opting out is enforced by the server, not just by the client", () => {
  // set_my_profile leaves `status` alone when handed a value it does not
  // recognise, so a client that merely STOPS sending a status would freeze
  // whatever was last stored. Someone who opts out mid-session would broadcast
  // "focusing" to their squad forever.
  const fn = between(sql, "create or replace function public.set_my_profile(",
                     "revoke all on function public.set_my_profile");
  assert.match(fn, /when not v_next_share then 'idle'/,
    "opting out must force the stored status back to idle in the same statement");
  assert.match(fn, /v_next_share := coalesce\(p_share_presence, v_share\);/);

  // And the read side refuses to disclose it regardless of what is stored.
  const read = between(sql, "create or replace function public.get_my_friends()",
                       "revoke all on function public.get_my_friends");
  assert.match(read, /case when pr\.share_presence then pr\.status else 'idle' end as status/,
    "a row that has not opted in must read as idle no matter what it holds");
  assert.match(read, /case when pr\.share_presence then pr\.status_at else null end as status_at/);

  // The switch travels on every push, so flipping it off lands on the next sync.
  assert.match(cloud, /p_share_presence: me\.sharePresence === true,/);
});

test("freshness rides on a dedicated stamp, not on updated_at", () => {
  // profiles_touch_updated_at bumps updated_at on ANY write, so a routine pearls
  // sync would keep an hours-old "focusing" looking a second old.
  assert.match(sql, /status_at\s+timestamptz not null default now\(\)/);
  const fn = between(sql, "create or replace function public.set_my_profile(",
                     "revoke all on function public.set_my_profile");
  assert.match(fn, /status_at\s*=\s*case when v_next_status <> v_status then now\(\) else status_at end/,
    "the stamp must move only when the status actually changes");
});

test("a phone that dies mid-session stops broadcasting on its own", () => {
  assert.match(sql, /cron\.schedule\('expire_stale_presence'/,
    "nothing else can clear a status for a client that never comes back");
  assert.match(sql, /set status = 'idle'[\s\S]{0,200}status_at < now\(\) - interval '20 minutes'/);
  // The client independently refuses to render a stale one, because a cron job
  // that has not run yet is not a guarantee either.
  assert.match(app, /const PRESENCE_FRESH_MS = \d+ \* 60 \* 1000;/);
  const render = between(app, "function squadPresence(", "function renderSquad()");
  assert.match(render, /Date\.now\(\) - t > PRESENCE_FRESH_MS/);
  assert.match(render, /if \(status !== "focusing" && status !== "break"\) return "";/);
});

test("presence renders with an icon, not an emoji", () => {
  // The earlier presence implementation used coloured emoji as status icons and
  // was deleted in the de-emoji pass. The design system forbids emoji AS ICONS.
  const render = between(app, "const PRESENCE_DOT", "function renderSquad()");
  assert.match(app, /const PRESENCE_DOT = '<svg class="squad-pres-dot"/);
  assert.doesNotMatch(render, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u,
    "no emoji in the presence label");
});

test("the leaderboard is weekly and resets on the same Monday everywhere", () => {
  // Two implementations of "this week" that disagree would put two friends on two
  // different boards, so the client's Monday has to be the server's Monday.
  assert.match(app, /function weekStartOrdinal\(\)/);
  assert.match(app, /return ord - \(\(ord % 7\) \+ 3\) % 7;/);
  assert.match(sql, /date_trunc\('week', now\(\) at time zone 'utc'\)/,
    "the server must use an explicit UTC week boundary");

  // Verify the client's arithmetic actually lands on Mondays.
  const keyToOrdinal = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  };
  const weekStart = (ord) => ord - ((ord % 7) + 3) % 7;
  for (const day of ["2026-08-24", "2026-08-25", "2026-08-30", "2026-08-31",
                     "2026-01-01", "2027-03-07", "1971-01-01"]) {
    const start = weekStart(keyToOrdinal(day));
    assert.equal(new Date(start * 86400000).getUTCDay(), 1,
      `${day} resolves to a week starting on a ${new Date(start * 86400000).toUTCString()}`);
    assert.ok(start <= keyToOrdinal(day) && keyToOrdinal(day) - start < 7);
  }

  // And the board sorts on it.
  const render = between(app, "function renderSquad()", "function shareSquadCode");
  assert.match(render, /rows\.sort\(\(a, b\) => \(b\.weekMins - a\.weekMins\)/);
  assert.match(render, /this week/);
});

test("a stale week reads as zero rather than as last week's champion", () => {
  const read = between(sql, "create or replace function public.get_my_friends()",
                       "revoke all on function public.get_my_friends");
  assert.match(read, /case when pr\.week_start = \(date_trunc\('week', now\(\) at time zone 'utc'\)\)::date\s*\n?\s*then pr\.week_minutes else 0 end as week_minutes/);
  // The rollover happens on WRITE as well, so it cannot race the cron sweep.
  const write = between(sql, "create or replace function public.set_my_profile(",
                        "revoke all on function public.set_my_profile");
  assert.match(write, /when v_ws <> v_week then greatest\(0, least\(coalesce\(p_week_minutes, 0\), 10080\)\)/,
    "a new week replaces the number outright; the usual monotonic clamp would pin it to last week's total");
});

test("the invite link is real, tappable, and carries the code", () => {
  const share = between(app, "function squadInviteUrl(", "const RENAME_PEARL_COST");
  assert.match(share, /https:\/\/mrtapioca\.me\/squad\/\?/);
  assert.match(share, /params\.set\("n", name\.slice\(0, 24\)\)/,
    "the inviter's name rides in the link so nothing has to look a code up");
  // An offline base64 snapshot must never be pushed into a URL: the landing page
  // cannot act on one, and it carries stats.
  assert.match(share, /const serverCode = squadCloudLive\(\) && SquadCloud\.myCode\(\) \? SquadCloud\.myCode\(\) : null;/);

  assert.ok(fs.existsSync(path.join(ROOT, "squad", "index.html")));
  assert.match(invite, /new URLSearchParams\(location\.search\)/);
  assert.match(invite, /\/\^\[A-Z2-9\]\{6\}\$\/\.test\(raw\)/,
    "the code must be validated before it is echoed into the page");
  assert.match(invite, /textContent =/, "untrusted URL text must be inserted as text");
  assert.doesNotMatch(invite, /innerHTML\s*=/, "never innerHTML with a value from the query string");
});

test("the app picks the code up from the link it now produces", () => {
  const receiver = between(app, "// Opened from a friend's invite.", "// ── PWA: register the service worker");
  assert.match(receiver, /search\.match\(\/\[\?&\]c=/, "?c= is the shape the invite page hands over");
  assert.match(receiver, /hash\.match\(\/sq=/, "an old share link must keep working");
  assert.match(receiver, /askConfirm\(/,
    "a crafted link must never silently add a friend or burn a follow-rate slot");
  assert.match(receiver, /url\.searchParams\.delete\("c"\)/,
    "the code must be stripped or a refresh re-offers it");
});

test("the invite page is served fresh, not from the app shell cache", () => {
  const exemption = sw.match(/if \(url\.pathname === "\/"[\s\S]*?return;/);
  assert.ok(exemption, "network-fresh exemption block not found");
  assert.match(exemption[0], /url\.pathname\.startsWith\("\/squad\/"\)/,
    "matched by directory: Pages serves this at /squad/, where nothing ends in index.html");
  assert.match(exemption[0], /url\.pathname\.startsWith\("\/get\/"\)/);
  const shell = sw.match(/const SHELL\s*=\s*\[([\s\S]*?)\]/);
  assert.doesNotMatch(shell[1], /squad\/index\.html/,
    "the invite page must not be pinned into the versioned precache");
});

test("presence and the weekly total are disclosed in the privacy policy", () => {
  assert.match(privacy, /off unless you turn it on/i);
  assert.match(privacy, /minutes focused this\s+calendar week/i);
  const manifest = fs.readFileSync(path.join(ROOT, "ios", "App", "App", "PrivacyInfo.xcprivacy"), "utf8");
  assert.match(manifest, /NSPrivacyCollectedDataTypeProductInteraction/,
    "presence is Product Interaction and must be declared");
  assert.match(manifest, /<key>NSPrivacyTracking<\/key>\s*<false\/>/,
    "none of this is tracking and the manifest must keep saying so");
});

test("myStatusKey reports idle whenever the switch is off", () => {
  const src = between(app, "function myStatusKey()", "function mySquadStats()");
  const context = { state: {} };
  vm.createContext(context);
  vm.runInContext(`${src}\nglobalThis.__run = myStatusKey;`, context);
  const run = (s) => { Object.assign(context.state, s); return context.__run(); };

  assert.equal(run({ sharePresence: false, running: true, phase: "focus" }), "idle",
    "a running session must NOT broadcast while sharing is off");
  assert.equal(run({ sharePresence: false, running: false, phase: "break" }), "idle");
  assert.equal(run({ sharePresence: true, running: true, phase: "focus" }), "focusing");
  assert.equal(run({ sharePresence: true, running: false, phase: "break" }), "break");
  assert.equal(run({ sharePresence: true, running: false, phase: "break-offer" }), "break");
  assert.equal(run({ sharePresence: true, running: false, phase: "focus" }), "idle");
});
