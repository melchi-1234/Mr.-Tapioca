#!/usr/bin/env node
// ── merchant-report.mjs — the local pilot report a shop actually gets ─────────
//
// Takes the JSON that `partner_report(text,integer)` returns (supabase-reward-v2.sql
// §11) and renders ONE self-contained HTML page. `reward-mock.js`'s partnerReport()
// returns the identical shape on purpose, so this generator can be driven with no
// database at all — that is what `--demo` does.
//
//   node tools/merchant-report.mjs --demo        > out.html
//   node tools/merchant-report.mjs report.json   > out.html
//
// WHAT THIS PAGE IS ALLOWED TO SAY. Exactly six questions, and nothing else:
//   1. how many rewards were redeemed
//   2. how many unique anonymous accounts redeemed
//   3. how many of those came back a second time
//   4. which offer was active, at what version
//   5. when the redemptions happened (a by-day bar)
//   6. whether any attempts were rejected, and why
//
// WHAT IT MUST NEVER SAY, and the reason the refusal is hard-coded here rather
// than left to whoever writes the copy later: docs/network-v1/GROUNDING.md §8
// records that marketing/doug-one-pager.html already claims first-visit
// identification ("The app knows") and "verified study time", and that BOTH are
// false against the code. A generated report is exactly the artifact that would
// launder those claims into something a shop owner treats as data. So there is no
// revenue field, no order-value field, no first-time-visitor field, no ROI field
// and no foot-traffic field anywhere in this file, and the page carries a plain
// "what this cannot tell you" block instead. If someone adds one of those numbers
// later, they have to add the plumbing to collect it first, which is the point.
//
// The generator renders only what is in the JSON. It computes no derived business
// metric of any kind. The only arithmetic it does is laying out the chart: calendar
// zero-fill (a bar chart that silently skips empty days reads as steady daily
// traffic when it was actually a burst) and, on a window too long for one bar per
// day, summing those days into 7 day buckets. Both are stated on the page, because
// a bar the reader thinks is a day and is really a week is its own kind of lie.
//
// Zero dependencies, matching the rest of tools/ and the repo's no-build-step rule.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ── plain-English labels for the machine reason codes ────────────────────────
// Keys are the exact `outcome` strings written by redeem_reward() in both
// implementations. A shop owner should never be shown a raw slug like
// `failed_offer_changed`. Anything unknown falls through to a de-slugged label
// rather than being dropped, so a new reason code cannot silently vanish from a
// report a merchant is reading.
const REASON_LABELS = {

  failed_already_redeemed: "The reward had already been used",
  failed_expired: "The reward itself had expired",
  failed_partner_paused: "The offer was paused at that moment",
  failed_wrong_partner: "The reward belonged to a different shop",
  failed_offer_changed: "The offer had changed since the reward was issued",
  failed_capped: "A limit set for this shop was already reached",
  failed_not_found: "The code was not recognised",
};

// Short "so what" line per reason. Kept separate from the label so the table can
// stay scannable and the explanation can be honest about the boring cause.
const REASON_NOTES = {

  failed_already_redeemed: "A second attempt on a reward that was already spent. It was refused.",
  failed_expired: "The reward passed its own expiry date before it was used.",
  failed_partner_paused: "The shop was paused in the app, so nothing could be redeemed.",
  failed_wrong_partner: "The reward was tied to another shop's offer.",
  failed_offer_changed: "The wording on file changed, so the old reward would not match it.",
  failed_capped: "A per person or pilot total limit was in force.",
  failed_not_found: "No matching code. Usually a typo at the counter.",
};

function reasonLabel(code) {
  if (REASON_LABELS[code]) return REASON_LABELS[code];
  return String(code || "").replace(/^failed_/, "").replace(/_/g, " ") || "Unknown reason";
}

// ── html safety ──────────────────────────────────────────────────────────────
// Every string that reaches the page goes through this. Shop names and offer text
// are founder-entered, but the report can also be handed over as a file by
// someone else, and a report page is not the place to find out.
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmtInt = (n) => num(n).toLocaleString("en-US");

// ── dates ────────────────────────────────────────────────────────────────────
// TRAP, and the reason these are hand-rolled: `by_day[].day` is a calendar date
// string ("2026-08-03"), not an instant. `new Date("2026-08-03")` parses as UTC
// midnight, and formatting that in any negative-offset timezone prints August 2.
// Every bar and every axis label would be one day early. So calendar strings are
// split by hand and only ever rebuilt with Date.UTC + timeZone:"UTC", which is
// the one combination that cannot shift.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseDayKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key || ""));
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3] };
}
function dayKeyToUTC(key) {
  const p = parseDayKey(key);
  return p ? Date.UTC(p.y, p.m - 1, p.d) : null;
}
function utcToDayKey(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
function shortDay(key) {
  const p = parseDayKey(key);
  return p ? `${MONTHS[p.m - 1]} ${p.d}` : String(key);
}
// The two ends of an axis, written against each other. "Aug 3 to Aug 10" reads fine
// inside one year; a full 365 day window would otherwise print "Aug 13 to Aug 12",
// which reads as a one day axis running backwards. The year is added only when the
// span actually crosses one, so short pilots are unchanged.
function axisDay(key, otherKey) {
  const a = parseDayKey(key), b = parseDayKey(otherKey);
  if (a && b && a.y !== b.y) return `${shortDay(key)}, ${a.y}`;
  return shortDay(key);
}
function longDay(key) {
  const ms = dayKeyToUTC(key);
  if (ms == null) return String(key);
  return new Date(ms).toLocaleDateString("en-US", {
    timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}
// Instants (first_redemption, last_redemption, generated_at) arrive as epoch ms
// from reward-mock.js and as an ISO timestamptz string from Postgres. Both parse.
function toMs(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}
function fmtInstantDate(ms) {
  if (ms == null) return "";
  return new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// ── input normalisation ──────────────────────────────────────────────────────
// The same six answers arrive from two places. Postgres hands back jsonb (numbers
// are numbers, timestamps are ISO strings); the mock hands back epoch millis. The
// page is written against ONE normalised shape so no renderer has to branch.
function normalise(input) {
  // supabase-js returns { data, error }. Unwrapping it here means a founder can
  // pipe the raw rpc response straight to a file without editing it first.
  let r = input;
  if (r && typeof r === "object" && !Array.isArray(r) && r.data && typeof r.data === "object"
      && r.redemptions === undefined) {
    r = r.data;
  }
  if (!r || typeof r !== "object" || Array.isArray(r)) {
    throw new Error("not a partner_report payload: expected a JSON object");
  }
  // Guard against the wrong file. Rendering partners.json (or any other object)
  // would produce a clean page reading "0 redemptions", and a shop owner shown a
  // confident zero has been misinformed just as badly as by an invented number.
  if (r.redemptions === undefined || r.unique_redeemers === undefined) {
    throw new Error(
      "not a partner_report payload: missing `redemptions` / `unique_redeemers`. " +
      "Expected the JSON returned by partner_report(partner_id, days)."
    );
  }

  const byDay = (Array.isArray(r.by_day) ? r.by_day : [])
    .map((row) => ({ day: String(row && row.day != null ? row.day : ""), n: num(row && row.n) }))
    .filter((row) => parseDayKey(row.day))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  const rejected = (Array.isArray(r.rejected) ? r.rejected : [])
    .map((row) => ({ reason: String(row && row.reason != null ? row.reason : ""), n: num(row && row.n) }))
    .filter((row) => row.n > 0)
    .sort((a, b) => b.n - a.n);

  return {
    partnerId: r.partner_id == null ? "" : String(r.partner_id),
    partnerName: r.partner_name == null ? "" : String(r.partner_name),
    windowDays: num(r.window_days) || 30,
    offerText: r.offer_text == null ? "" : String(r.offer_text),
    // `active` absent is not the same as false. Only an explicit false is a pause.
    offerVersion: r.offer_version == null ? null : num(r.offer_version),
    active: r.active === false ? false : true,
    redemptions: num(r.redemptions),
    uniqueRedeemers: num(r.unique_redeemers),
    repeatRedeemers: num(r.repeat_redeemers),
    firstRedemption: toMs(r.first_redemption),
    lastRedemption: toMs(r.last_redemption),
    byDay,
    rejected,
    rejectedTotal: rejected.reduce((s, x) => s + x.n, 0),
    generatedAt: toMs(r.generated_at) ?? Date.now(),
    sample: r.sample === true,
  };
}

// ── icons ────────────────────────────────────────────────────────────────────
// House style, no exceptions: inline SVG, viewBox 0 0 24 24, fill none, stroke
// currentColor, stroke-width 2, round caps and joins. No emoji is ever used as an
// icon (CLAUDE.md, design system).
function icon(paths, cls) {
  return `<svg class="${cls || "ico"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
const ICON = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  tag: '<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><path d="M7 7h.01"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  beaker: '<path d="M9 3h6"/><path d="M10 3v6l-5.5 9A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 15h9"/>',
  cup: '<path d="M5 8h14l-1.2 11.2A2 2 0 0 1 15.8 21H8.2a2 2 0 0 1-2-1.8Z"/><path d="M4 8h16"/><path d="M9 4v2M15 4v2"/>',
};

// ── the by-day bar chart ─────────────────────────────────────────────────────
// Inline SVG, no libraries, per the brief. The important decision is the
// zero-fill: partner_report only returns days that HAD a redemption, so plotting
// the array as-is puts Aug 3 next to Aug 9 at equal spacing and turns two bursts
// into what looks like steady daily traffic. Every calendar day between the first
// and the last redemption gets a slot, and days with nothing get a flat stub so a
// reader can see the day existed and was empty.
//
// The axis deliberately spans first-to-last redemption rather than the whole
// window: a 30 day window with 8 days of activity would otherwise be 22 bars of
// nothing, which reads as decline rather than as "the pilot started on the 3rd".
// The caption states plainly what the axis covers, and the window length is
// printed next to it, so neither reading is available by accident.

// partner_report clamps its window to 1..365 days (supabase-reward-v2.sql:669,
// :679), and reward-mock.js does the same, so a legitimate axis is never longer
// than a year. A corrupt or far-future day key (a typo, a bad hand-edited export,
// a 2999 date) used to zero-fill hundreds of thousands of slots and die inside the
// chart with "Maximum call stack size exceeded", which tells the person holding the
// broken file nothing. Bound the fill and name the actual problem instead.
const MAX_SPAN_DAYS = 366;

// Past twelve weeks of daily bars the slot is thinner than the minimum bar drawn
// in it (at 365 days the slot is 1.9 units against a 4 unit floor), so the bars
// overlap into one grey smear. Beyond this the days are grouped into 7 day
// buckets, and the lead line, the figcaption and the accessible label all say so
// rather than letting a week's bar be read as a day's.
const MAX_DAILY_BARS = 84;

// Zero-fill every calendar day from the first redemption to the last.
function calendarFill(byDay) {
  const firstKey = byDay[0].day;
  const lastKey = byDay[byDay.length - 1].day;
  const startMs = dayKeyToUTC(firstKey);
  const endMs = dayKeyToUTC(lastKey);
  const span = Math.round((endMs - startMs) / 86400000) + 1;
  if (span > MAX_SPAN_DAYS) {
    throw new Error(
      `by_day covers ${fmtInt(span)} days, from ${firstKey} to ${lastKey}. ` +
      `partner_report never returns a window longer than 365 days, so one of those two ` +
      `dates is wrong. Fix the payload rather than plotting it.`
    );
  }
  const counts = new Map(byDay.map((r) => [r.day, r.n]));
  const days = [];
  for (let t = startMs; t <= endMs; t += 86400000) {
    const key = utcToDayKey(t);
    days.push({ day: key, endDay: key, n: counts.get(key) || 0 });
  }
  return days;
}

// Group the zero-filled days into 7 day buckets, starting at the first day rather
// than at a calendar Monday: the axis already starts at the first redemption, and
// a part-empty leading bucket would misread as a slow first week.
function weekBuckets(days) {
  const out = [];
  for (let i = 0; i < days.length; i += 7) {
    const wk = days.slice(i, i + 7);
    out.push({
      day: wk[0].day,
      endDay: wk[wk.length - 1].day,
      n: wk.reduce((s, d) => s + d.n, 0),
    });
  }
  return out;
}

// Everything the chart and its surrounding copy need, computed once, so the lead
// line and the caption cannot describe a different chart than the one drawn.
function chartModel(byDay) {
  if (!byDay.length) return null;
  const days = calendarFill(byDay);
  const weekly = days.length > MAX_DAILY_BARS;
  const bars = weekly ? weekBuckets(days) : days;
  // reduce, not Math.max(...spread): a spread of one argument per bar is what blew
  // the call stack on the corrupt-date payload above.
  const maxN = bars.reduce((m, b) => (b.n > m ? b.n : m), 1);
  const active = bars.reduce((s, b) => s + (b.n > 0 ? 1 : 0), 0);
  return {
    bars, weekly, maxN, active,
    unit: weekly ? "week" : "day",
    empty: bars.length - active,
    total: bars.reduce((s, b) => s + b.n, 0),
  };
}

function barChart(model) {
  if (!model) {
    return `<p class="empty">No redemptions in this window, so there is nothing to plot yet.</p>`;
  }
  const { bars, weekly, maxN } = model;

  const W = 720, H = 230;
  const padL = 30, padR = 12, padT = 24, padB = 42;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const baseY = padT + plotH;
  const slot = plotW / bars.length;
  // 60% of the slot, capped at 40 units. There used to be a `Math.max(4, …)` floor
  // here to keep a bar visible on a long axis, and that floor was the smear: at 365
  // daily bars the slot is 1.9 units, so a 4 unit bar was more than twice its own
  // slot and every bar overlapped its neighbours. The floor is gone and the width
  // is now always a fraction of the slot, which cannot overlap by construction. The
  // long axis is handled by bucketing into weeks instead (MAX_DAILY_BARS), so the
  // narrowest bar this can now produce is 4.8 units at 84 days.
  const barW = Math.min(40, slot * 0.6);

  // Integer counts only, so integer gridlines. Small pilots get one line per
  // redemption; bigger numbers get about four lines instead of a comb.
  const step = maxN <= 6 ? 1 : Math.ceil(maxN / 4);
  const ticks = [];
  for (let v = step; v <= maxN; v += step) ticks.push(v);
  const y = (v) => baseY - (v / maxN) * plotH;

  // At most ~9 x labels, whatever the span, so they never collide.
  const stride = Math.max(1, Math.ceil(bars.length / 9));
  const showValues = slot >= 24;

  const parts = [];
  ticks.forEach((v) => {
    parts.push(`<line class="grid" x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W - padR}" y2="${y(v).toFixed(1)}"/>`);
    parts.push(`<text class="tick" x="${padL - 7}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${v}</text>`);
  });
  parts.push(`<line class="axis" x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}"/>`);

  // "Monday, August 3, 2026" for a day; "August 3 to August 9" for a week, so a
  // screen reader is never told a week's total under a single date.
  const barWhen = (b) => (weekly && b.endDay !== b.day)
    ? `${longDay(b.day)} to ${longDay(b.endDay)}`
    : longDay(b.day);

  bars.forEach((b, i) => {
    const cx = padL + slot * (i + 0.5);
    const x = (cx - barW / 2).toFixed(1);
    if (b.n > 0) {
      const top = y(b.n);
      const h = Math.max(3, baseY - top);
      parts.push(`<rect class="bar" x="${x}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" ` +
        `height="${h.toFixed(1)}" rx="${Math.min(5, barW / 2).toFixed(1)}"><title>${esc(barWhen(b))}: ` +
        `${b.n} ${b.n === 1 ? "redemption" : "redemptions"}</title></rect>`);
      if (showValues) {
        parts.push(`<text class="val" x="${cx.toFixed(1)}" y="${(top - 7).toFixed(1)}" text-anchor="middle">${b.n}</text>`);
      }
    } else {
      // The empty stub. Without it the gap is invisible and the reader assumes
      // the day simply was not in the data.
      parts.push(`<rect class="bar zero" x="${x}" y="${(baseY - 3).toFixed(1)}" width="${barW.toFixed(1)}" ` +
        `height="3" rx="1.5"><title>${esc(barWhen(b))}: no redemptions</title></rect>`);
    }
    if (i % stride === 0 || i === bars.length - 1) {
      parts.push(`<text class="xlab" x="${cx.toFixed(1)}" y="${baseY + 20}" text-anchor="middle">${esc(shortDay(b.day))}</text>`);
    }
  });

  const label = esc(chartLabel(model));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}" ` +
    `preserveAspectRatio="xMidYMid meet"><title>${label}</title>${parts.join("")}</svg>`;
}

// The accessible summary. It used to say "8 redemptions across 8 days" when only 7
// of those days had one, which is the exact smoothing the grey stubs exist to
// prevent: a sighted reader sees the gap, a screen reader heard steady traffic.
// The empty count is now stated outright.
function chartLabel(model) {
  const { bars, total, active, empty, maxN, unit } = model;
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const firstKey = bars[0].day;
  const lastKey = bars[bars.length - 1].endDay || bars[bars.length - 1].day;
  const first = axisDay(firstKey, lastKey);
  const last = axisDay(lastKey, firstKey);
  const gap = empty > 0
    ? `${plural(active, unit)} had at least one redemption and ${plural(empty, unit)} had none.`
    : `Every ${unit} had at least one.`;
  return `Bar chart. ${plural(total, "redemption")} across ${plural(bars.length, unit)}, ` +
    `${first} to ${last}. ${gap} The busiest ${unit} had ${maxN}.`;
}

function rejectedBlock(r) {
  if (!r.rejected.length) {
    return `<p class="empty">No attempt was rejected in this window. Every code that reached ` +
      `the counter was good.</p>`;
  }
  const rows = r.rejected.map((row) => `
        <tr>
          <td class="rcount">${fmtInt(row.n)}</td>
          <td>
            <span class="rlabel">${esc(reasonLabel(row.reason))}</span>
            ${REASON_NOTES[row.reason] ? `<span class="rnote">${esc(REASON_NOTES[row.reason])}</span>` : ""}
            <code class="rcode">${esc(row.reason)}</code>
          </td>
        </tr>`).join("");
  return `
      <table class="rtable">
        <caption class="sr-only">Rejected redemption attempts by reason</caption>
        <thead><tr><th scope="col">Times</th><th scope="col">Reason</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="fine">A rejected attempt is almost always a timing problem, not someone trying it
      on. Nothing was given away in any of these, and the reward stayed with the student unless
      the reason above says it was already spent.</p>`;
}

// ── the page ─────────────────────────────────────────────────────────────────
function render(input) {
  const r = normalise(input);
  // Built before a single tag is composed. A payload with an impossible date range
  // throws here, so the tool exits with a readable message and writes nothing,
  // rather than emitting most of a page and then dying mid-chart.
  const chart = chartModel(r.byDay);

  const shop = r.partnerName || r.partnerId || "This shop";
  // The header date range is derived from by_day, the SAME array the chart is
  // drawn from, rather than from first_redemption / last_redemption. Those are
  // instants bucketed in the database's timezone; formatting them here in the
  // reader's timezone can print a first date one day before the first bar. Same
  // source, same answer. The instants are only the fallback.
  const firstKey = r.byDay.length ? r.byDay[0].day : null;
  const lastKey = r.byDay.length ? r.byDay[r.byDay.length - 1].day : null;
  const spanLine = firstKey
    ? (firstKey === lastKey
        ? `All of it on ${longDay(firstKey)}.`
        : `From ${longDay(firstKey)} to ${longDay(lastKey)}.`)
    : (r.firstRedemption
        ? `Recorded ${fmtInstantDate(r.firstRedemption)}.`
        : "");

  const offerVersionLine = r.offerVersion == null
    ? ""
    : `<span class="ver">version ${fmtInt(r.offerVersion)}</span>`;

  const sampleBanner = r.sample ? `
    <div class="sample" role="note">
      ${icon(ICON.beaker, "ico big")}
      <div>
        <strong>This is sample output, built from test data.</strong>
        <span>Nobody in it is a real customer and no real redemption happened. It exists to show
        the shape of the report before a pilot starts.</span>
      </div>
    </div>` : "";

  // The redemption ledger is written but has never been switched on in the live app
  // (LEDGER.md limitation 1: the migration has never been executed; config.js ships
  // rewardV2:false). A real payload could only have come from a ledger that IS
  // running, so the present tense is true there. On the sample it is not, and the
  // dashed banner at the top is not enough on its own: this page gets forwarded, and
  // a forwarded page can arrive with the banner cropped off. So the two sentences
  // that describe the ledger say which of the two they are looking at.
  const stats = [
    { k: "Rewards redeemed", v: r.redemptions, i: ICON.check,
      sub: r.sample
        ? "One row per code spent at the counter. In this sample those rows are test data."
        : "One row written the moment a code was spent at your counter." },
    { k: "Unique students", v: r.uniqueRedeemers, i: ICON.users,
      sub: "Distinct anonymous accounts. See the note below." },
    { k: "Came back again", v: r.repeatRedeemers, i: ICON.repeat,
      sub: "Accounts that redeemed more than once in this window." },
  ].map((s) => `
        <div class="stat">
          <div class="stat-top">${icon(s.i)}<span>${esc(s.k)}</span></div>
          <div class="stat-n">${fmtInt(s.v)}</div>
          <div class="stat-sub">${esc(s.sub)}</div>
        </div>`).join("");

  const ledgerLine = r.sample
    ? `Generated from the redemption ledger this report is built on. That ledger is not
      switched on in the live app yet, so every row behind this page is test data.
      Nothing here is estimated or filled in.`
    : `Generated from the app's redemption ledger. One row is written the moment a code is
      spent, and nothing in this page is estimated or filled in.`;

  const title = `${shop} pilot report`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="robots" content="noindex">
<style>
/* Same palette and the same one UI material as the app (styles.css :root), copied
   in rather than linked: this file gets emailed, printed and opened offline, so it
   cannot depend on anything it did not bring with it. Inter is the house font; the
   fallback chain is the app's, and no webfont is fetched. */
:root {
  --bark:#3c2018; --bark-mid:#8b5e4a; --bark-light:#c4956a;
  --cream:#fdf5ec; --line:rgba(60,32,24,0.12);
  --rose:#ef6f8d; --teal:#158f92; --mint:#d9f3ea; --gold:#f0bb4f; --danger:#dc4c64;
  --ui-paper:linear-gradient(180deg,#fffbf3 0%,#fdf4e6 58%,#f8ecda 100%);
  --ui-edge:rgba(96,58,36,0.20);
  --ui-sheen:inset 0 1.5px 0 rgba(255,255,255,0.95);
  --ui-lift:0 1px 0 rgba(96,58,36,0.10),0 6px 14px -6px rgba(60,32,24,0.26),
            0 16px 32px -20px rgba(60,32,24,0.34);
}
* { box-sizing:border-box; }
body, h1, h2, h3, p, figure { margin:0; }
body {
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  background:#f6e7d3;
  color:var(--bark);
  line-height:1.5;
  -webkit-text-size-adjust:100%;
  padding:26px 16px 44px;
}
.sheet { max-width:760px; margin:0 auto; }
.ico { width:1em; height:1em; flex:0 0 auto; }
.ico.big { width:1.4em; height:1.4em; }
.sr-only {
  position:absolute; width:1px; height:1px; padding:0; margin:-1px;
  overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0;
}

.card {
  background:var(--ui-paper);
  border:2px solid var(--ui-edge);
  border-radius:20px;
  box-shadow:var(--ui-sheen),var(--ui-lift);
  padding:20px 20px 22px;
  margin-bottom:16px;
}

/* Sample banner. Deliberately loud: a test-data page that gets forwarded and
   mistaken for a real one is the worst thing this generator could produce. */
.sample {
  display:flex; gap:11px; align-items:flex-start;
  background:#fff4d6; border:2px dashed rgba(180,120,30,0.55);
  color:#6b4409; border-radius:16px; padding:13px 15px; margin-bottom:16px;
  font-size:0.86rem;
}
.sample strong { display:block; font-weight:900; }
.sample span { display:block; margin-top:2px; }

.eyebrow {
  display:flex; align-items:center; gap:7px;
  font-size:0.72rem; font-weight:900; letter-spacing:0.09em; text-transform:uppercase;
  color:var(--bark-mid);
}
h1 { font-size:1.6rem; font-weight:950; line-height:1.18; margin-top:7px; letter-spacing:-0.01em; }
.window { margin-top:7px; font-size:0.88rem; color:var(--bark-mid); font-weight:600; }

.offer {
  margin-top:15px; padding:13px 15px; border-radius:15px;
  background:var(--mint); border:2px solid rgba(21,143,146,0.22);
}
.offer .lab {
  display:flex; align-items:center; gap:7px;
  font-size:0.7rem; font-weight:900; letter-spacing:0.08em;
  text-transform:uppercase; color:#0f6f72;
}
.offer .txt { font-size:1.08rem; font-weight:900; margin-top:5px; }
.offer .meta { margin-top:5px; font-size:0.78rem; color:#0f6f72; font-weight:700; }
.ver {
  display:inline-block; background:rgba(21,143,146,0.14); border-radius:999px;
  padding:1px 9px; margin-right:7px;
}
.paused { background:rgba(220,76,100,0.14); color:var(--danger); }

.stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(100px,1fr)); gap:11px; }
.stat {
  background:rgba(255,255,255,0.62); border:2px solid var(--ui-edge);
  border-radius:16px; padding:12px 13px 13px;
}
.stat-top {
  display:flex; align-items:center; gap:6px;
  font-size:0.72rem; font-weight:900; letter-spacing:0.03em;
  text-transform:uppercase; color:var(--bark-mid);
}
.stat-n { font-size:2.3rem; font-weight:950; line-height:1.05; margin-top:5px; letter-spacing:-0.02em; }
.stat-sub { font-size:0.73rem; color:var(--bark-mid); margin-top:5px; line-height:1.4; }

h2 {
  display:flex; align-items:center; gap:8px;
  font-size:1.02rem; font-weight:950; letter-spacing:-0.01em;
}
.lead { font-size:0.85rem; color:var(--bark-mid); margin-top:5px; }

figure { margin-top:13px; }
.chart { display:block; width:100%; height:auto; }
.chart .bar { fill:var(--teal); }
.chart .bar.zero { fill:rgba(60,32,24,0.16); }
.chart .grid { stroke:rgba(60,32,24,0.10); stroke-width:1; }
.chart .axis { stroke:rgba(60,32,24,0.30); stroke-width:1.5; }
.chart .tick, .chart .xlab { fill:#8b5e4a; font-size:11px; font-weight:700; }
.chart .val { fill:var(--bark); font-size:12px; font-weight:900; }
/* The chart is one fixed 720-unit viewBox that scales down to the container. On a
   phone that is roughly a 0.45x shrink, and 11px labels land at 5px on glass, which
   is not a chart any more. SVG font-size in CSS is in USER SPACE, so raising it
   under a media query enlarges the type inside the drawing instead of the drawing
   itself. That keeps the bars where they are and no horizontal scrolling appears. */
@media (max-width:700px) {
  .chart .tick, .chart .xlab { font-size:15px; }
  .chart .val { font-size:16px; }
}
@media (max-width:460px) {
  .chart .tick, .chart .xlab { font-size:20px; }
  .chart .val { font-size:22px; }
}
figcaption { margin-top:9px; font-size:0.78rem; color:var(--bark-mid); }

.rtable { width:100%; border-collapse:collapse; margin-top:12px; font-size:0.86rem; }
.rtable th {
  text-align:left; font-size:0.68rem; letter-spacing:0.08em; text-transform:uppercase;
  color:var(--bark-mid); font-weight:900; padding:0 0 6px;
}
.rtable td { padding:9px 0; border-top:1px solid var(--line); vertical-align:top; }
.rcount { font-weight:950; font-size:1.15rem; width:3.2em; padding-right:12px; }
.rlabel { display:block; font-weight:800; }
.rnote { display:block; color:var(--bark-mid); font-size:0.79rem; margin-top:1px; }
.rcode {
  display:inline-block; margin-top:4px; font-size:0.68rem; color:var(--bark-mid);
  background:rgba(60,32,24,0.06); border-radius:6px; padding:1px 6px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
}
.empty {
  margin-top:12px; padding:13px 15px; border-radius:14px;
  background:rgba(60,32,24,0.045); font-size:0.87rem; color:var(--bark-mid);
}
.fine { margin-top:11px; font-size:0.79rem; color:var(--bark-mid); }

.limits { background:#fff; border-color:rgba(60,32,24,0.16); }
.limits p { margin-top:9px; font-size:0.9rem; }
.privacy { background:rgba(255,255,255,0.5); }
.privacy p { margin-top:9px; font-size:0.86rem; }

footer {
  text-align:center; font-size:0.76rem; color:var(--bark-mid);
  padding:6px 4px 0; line-height:1.6;
}
footer .made { display:inline-flex; align-items:center; gap:6px; font-weight:800; color:var(--bark); }

@media (max-width:420px) {
  body { padding:16px 11px 34px; }
  .card { padding:16px 15px 18px; border-radius:17px; }
  h1 { font-size:1.32rem; }
  h2 { font-size:0.98rem; }
  /* Three tiles side by side at 375px wraps "Came back again" onto three lines and
     leaves the number stranded. One tile per row, number on the left, reads at a
     glance instead. Placement is by explicit row/column so the source order (label,
     number, caption) can stay the order a screen reader should hear. */
  .stats { grid-template-columns:1fr; gap:9px; }
  .stat {
    display:grid; grid-template-columns:auto 1fr;
    column-gap:13px; align-items:center; padding:11px 13px 12px;
  }
  .stat-top { grid-column:2; grid-row:1; }
  .stat-n { grid-column:1; grid-row:1 / span 2; font-size:2.1rem; margin-top:0; min-width:1.5em; text-align:center; }
  .stat-sub { grid-column:2; grid-row:2; margin-top:2px; }
}

/* Printed and handed over in person is a real delivery path for this page, so the
   paper version is not an afterthought: shadows off, nothing clipped, no dead ink. */
@media print {
  @page { margin:14mm; }
  body { background:#fff; padding:0; }
  .card, .stat { box-shadow:none; }
  .sheet { max-width:none; }
}
</style>
</head>
<body>
<main class="sheet">
${sampleBanner}
  <section class="card">
    <div class="eyebrow">${icon(ICON.cup)}<span>Mr. Tapioca pilot report</span></div>
    <h1>${esc(shop)}</h1>
    <p class="window">Last ${fmtInt(r.windowDays)} days, prepared ${esc(fmtInstantDate(r.generatedAt))}.${
      spanLine ? " " + esc(spanLine) : ""}</p>

    <div class="offer">
      <div class="lab">${icon(ICON.tag)}<span>The offer students saw</span></div>
      <div class="txt">${esc(r.offerText || "Not recorded in this report")}</div>
      <div class="meta">
        ${offerVersionLine}${r.active
          ? "Live in the app right now."
          : '<span class="ver paused">Paused</span>Not redeemable in the app right now.'}
      </div>
    </div>
    <p class="fine">Version is the wording on file today. If the offer was reworded partway
      through, this report shows the current version and does not split the counts by version.</p>
  </section>

  <section class="card">
    <div class="stats">${stats}</div>
  </section>

  <section class="card">
    <h2>${icon(ICON.calendar)}<span>When people redeemed</span></h2>
    <p class="lead">${chart && chart.weekly
      ? "This window is long enough that one bar per day would be a smear, so each bar is the " +
        "week starting on the date under it. A flat grey stub means that week had none."
      : "Every calendar day between the first and the last redemption gets a slot. " +
        "A flat grey stub means that day had none."}</p>
    <figure>
      ${barChart(chart)}
      ${chart ? `<figcaption>${esc(
        `${fmtInt(r.redemptions)} ${r.redemptions === 1 ? "redemption" : "redemptions"} plotted` +
        `${chart.weekly ? ", one bar per week" : ""}. Axis covers ${axisDay(firstKey, lastKey)} to ` +
        `${axisDay(lastKey, firstKey)}, inside a ${fmtInt(r.windowDays)} day report window.`
      )}</figcaption>` : ""}
    </figure>
  </section>

  <section class="card">
    <h2>${icon(ICON.alert)}<span>Attempts that were turned down</span></h2>
    <p class="lead">${r.rejectedTotal
      ? esc(`${fmtInt(r.rejectedTotal)} ${r.rejectedTotal === 1 ? "attempt" : "attempts"} did not go through.`)
      : "Nothing was refused."}</p>
    ${rejectedBlock(r)}
  </section>

  <section class="card limits">
    <h2>${icon(ICON.info)}<span>What this report cannot tell you</span></h2>
    <p>This counts redemptions and nothing else. It cannot tell you revenue, average order value,
      or whether a sale would have happened anyway, because the app never sees your register. It
      cannot tell you who walked in for the first time, because it has never known that about
      anyone. And it is not verified study time: a redeemed reward means a timer ran for the
      required minutes, not that anybody proved they were studying. If you want those numbers,
      they have to come from your own till, and I would rather say that plainly than hand you a
      figure I made up.</p>
  </section>

  <section class="card privacy">
    <h2>${icon(ICON.lock)}<span>Where the student counts come from</span></h2>
    <p>The unique and repeat numbers come from an anonymous account id the app creates on the
      device. It is a random string. It carries no name, no email, no phone number and no
      location, and it links to nothing you can see or look up. All it does is let this report
      say the same account came back, instead of counting every visit as a new person.</p>
    <p>One more honest caveat: those accounts are free and anonymous, so in principle one person
      could hold two. Read "unique students" as "unique accounts".</p>
  </section>

  <footer>
    <span class="made">${icon(ICON.cup)}Made by Mr. Tapioca</span><br>
    ${ledgerLine}
  </footer>
</main>
</body>
</html>
`;
}

// ── the demo fixture ─────────────────────────────────────────────────────────
// The sample page has to be REAL output of this generator, not hand-written HTML,
// or it stops matching the code the first time either changes. So the fixture
// drives reward-mock.js through the actual RPC surface: sessions are banked, the
// threshold is reached, rewards are issued, codes are opened and spent. The report
// is then read back with partner_report, exactly as it would be from Postgres.
//
// The clock is set explicitly at every step. reward-mock takes `now` from a
// settable clock for the same reason the SQL takes it from now(): nothing in the
// reward path is allowed to read a client's own clock, and a fixture that used
// Date.now() would produce a different page every run.
const HOUR = 3600000;
const DAY = 86400000;
const U_TEA = "u-tea-collegetown";

// Anonymous account ids. In production these are Supabase anonymous auth uids;
// they never appear in the report, which is the point of the privacy note.
const STUDENTS = ["anon-a1", "anon-b2", "anon-c3", "anon-d4", "anon-e5", "anon-f6"];

function demoReport() {
  const RewardMock = require("../reward-mock.js");
  // Pilot week: Monday 2026-08-03 through Monday 2026-08-10, reported on the 12th.
  // Times sit in the middle of the US day so the server-side day buckets and the
  // dates a reader expects agree.
  const D0 = Date.UTC(2026, 7, 3, 11, 0, 0);
  const b = RewardMock.createBackend({ now: D0 });

  // The live config, verbatim from partners.json. Never invent a perk or a number:
  // U Tea agreed to 10% off your drink at 240 cumulative minutes, and that is the
  // only offer this sample is allowed to show.
  b.loadConfig({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240, expires_days: null }],
    partners: [
      { id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "ithaca-passport",
        address: "205 Dryden Rd, Collegetown", offer_version: 1,
        cashier_note: "Ring up 10% off. Nothing to scan." },
    ],
  });

  const at = (dayOffset, h, m) => D0 + dayOffset * DAY + (h - 11) * HOUR + (m || 0) * 60000;

  /** Bank `hours` of eligible focus for one account, one 60 minute session at a time. */
  function bank(user, hours, startMs) {
    b.setUser(user);
    b.setNow(startMs);
    for (let i = 0; i < hours; i++) {
      const id = RewardMock.uuid();
      const s = b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "ios" });
      if (!s.ok) throw new Error("fixture: start_reward_session refused: " + s.reason);
      b.advance(HOUR);
      const c = b.rpc.complete_reward_session({ session_id: id });
      if (!c.ok) throw new Error("fixture: complete_reward_session refused: " + c.reason);
    }
  }

  // Pick the reward this student is about to spend. There is no separate open step
  // any more (1.2.0 removed the handoff code), so this only resolves the id that
  // the one-tap spend will name.
  function heldReward(user, whenMs) {
    b.setUser(user);
    b.setNow(whenMs);
    b.rpc.issue_my_rewards();
    const held = b.rpc.my_reward_state().rewards.find((x) => x.status === "issued");
    if (!held) throw new Error("fixture: " + user + " has no issued reward to spend");
    return held;
  }

  function redeem(user, whenMs) {
    const held = heldReward(user, whenMs);
    const done = b.rpc.redeem_reward({ reward_id: held.id, partner_id: U_TEA });
    if (!done.ok) throw new Error("fixture: redeem_reward refused: " + done.reason);
    return held;
  }

  function expectRefused(res, reason) {
    if (res.ok || res.reason !== reason) {
      throw new Error("fixture expected " + reason + ", got " + (res.ok ? "success" : res.reason));
    }
  }

  // Mon Aug 3 — the first student over the line.
  bank(STUDENTS[0], 8, at(0, 11));
  redeem(STUDENTS[0], at(0, 20));

  // Tue Aug 4 — two redemptions.
  bank(STUDENTS[1], 8, at(1, 10));
  redeem(STUDENTS[1], at(1, 18, 15));
  bank(STUDENTS[2], 4, at(1, 18, 30));
  redeem(STUDENTS[2], at(1, 22, 45));

  // Wed Aug 5 — the shop had itself paused in the app for half an hour (a rush, a
  // staffing gap, whatever it was), so the tap is refused and the student comes
  // back once it is live again. A sample report should show a real refusal day
  // rather than only clean ones: "did anything go wrong at the counter" is the
  // first question a shop asks. (This used to be a timed-out handoff code, which is
  // no longer a thing that can happen.)
  //
  // NOTE for anyone tempted to make this a reworded-offer refusal instead: it will
  // not fire here. U Tea's policy is a global_passport, so its rewards carry a NULL
  // offer_version and the failed_offer_changed rung never applies to them. That is
  // a real property of the passport model, not a bug in this fixture.
  bank(STUDENTS[3], 4, at(2, 13));
  const paused = heldReward(STUDENTS[3], at(2, 18));
  const uTea = b.db.partners.get(U_TEA);
  uTea.active = false;
  expectRefused(b.rpc.redeem_reward({ reward_id: paused.id, partner_id: U_TEA }),
                "failed_partner_paused");
  uTea.active = true;
  redeem(STUDENTS[3], at(2, 18, 30));

  // Thu Aug 6 — the first student's second reward.
  redeem(STUDENTS[0], at(3, 20));

  // Fri Aug 7 — a reward already spent is tapped a second time and is refused.
  // This is the double-spend case the whole server ledger exists to stop.
  bank(STUDENTS[4], 4, at(4, 12));
  const spent = redeem(STUDENTS[4], at(4, 20));
  b.setNow(at(4, 20, 5));
  expectRefused(b.rpc.redeem_reward({ reward_id: spent.id, partner_id: U_TEA }),
                "failed_already_redeemed");

  // Sat Aug 8 — nothing. Left empty on purpose so the sample exercises the
  // chart's zero-fill instead of only ever showing consecutive busy days.

  // Sun Aug 9 — a student taps outside the hours the shop agreed to, then comes
  // back inside them. The window is the other refusal a shop actually cares about.
  bank(STUDENTS[5], 4, at(6, 12));
  const early = heldReward(STUDENTS[5], at(6, 6));
  const shop = b.db.partners.get(U_TEA);
  const fromWas = shop.valid_from_minute, toWas = shop.valid_to_minute;
  shop.valid_from_minute = 10 * 60;   // 10:00
  shop.valid_to_minute = 22 * 60;     // 22:00
  expectRefused(b.rpc.redeem_reward({ reward_id: early.id, partner_id: U_TEA }),
                "failed_outside_window");
  shop.valid_from_minute = fromWas;
  shop.valid_to_minute = toWas;
  redeem(STUDENTS[5], at(6, 18, 20));

  // Mon Aug 10 — a returning student's second reward, a week after their first.
  redeem(STUDENTS[1], at(7, 21));

  // Read the report back through the RPC, on the day the founder would run it.
  b.setNow(Date.UTC(2026, 7, 12, 16, 0, 0));
  const report = b.rpc.partner_report({ partner_id: U_TEA, days: 30 });

  // A silently-drifted fixture would ship a sample that no longer demonstrates what
  // the page is for, so the shape is asserted here rather than eyeballed later.
  const expect = (got, want, what) => {
    if (got !== want) throw new Error(`fixture: ${what} is ${got}, expected ${want}`);
  };
  expect(report.redemptions, 8, "redemptions");
  expect(report.unique_redeemers, 6, "unique redeemers");
  expect(report.repeat_redeemers, 2, "repeat redeemers");
  expect(report.by_day.length, 7, "days with at least one redemption");
  expect(report.rejected.reduce((s, x) => s + x.n, 0), 3, "rejected attempts");

  // generated_at is pinned so the committed sample is byte-stable across runs.
  return Object.assign({ generated_at: b.now(), sample: true }, report);
}

// ── cli ──────────────────────────────────────────────────────────────────────
const USAGE = `merchant-report.mjs — render a partner_report payload as one HTML page

  node tools/merchant-report.mjs --demo             > out.html
  node tools/merchant-report.mjs report.json        > out.html
  node tools/merchant-report.mjs report.json --out out.html

report.json is whatever partner_report(partner_id, days) returned, from Postgres
or from reward-mock.js. A { data, error } wrapper from supabase-js is unwrapped.
--demo builds a fixture by driving reward-mock.js and labels the page as test data.
`;

function main(argv) {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(USAGE);
    return 0;
  }

  let outPath = null;
  const outAt = args.indexOf("--out");
  if (outAt >= 0) {
    outPath = args[outAt + 1];
    if (!outPath) throw new Error("--out needs a file path");
    args.splice(outAt, 2);
  }

  const demo = args.includes("--demo");
  const file = args.find((a) => !a.startsWith("-"));
  if (!demo && !file) {
    process.stderr.write(USAGE);
    return 2;
  }

  const payload = demo ? demoReport() : JSON.parse(readFileSync(file, "utf8"));
  const html = render(payload);

  if (outPath) writeFileSync(outPath, html);
  else process.stdout.write(html);
  return 0;
}

// Only run as a CLI. Importing this file gives you render() without side effects.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    process.exit(main(process.argv));
  } catch (err) {
    // Diagnostics go to stderr, never stdout: stdout IS the HTML, and a warning
    // printed into it would be silently baked into a page a shop owner reads.
    process.stderr.write("merchant-report: " + (err && err.message ? err.message : String(err)) + "\n");
    process.exit(1);
  }
}

export { render, normalise, demoReport, reasonLabel };
