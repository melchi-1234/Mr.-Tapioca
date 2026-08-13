#!/usr/bin/env node
// ── partners-to-sql.mjs — partners.json → the server's partner + policy seed ──
//
// config.js names this file as precondition 3 for turning the `rewardV2` flag on,
// and supabase-reward-v2.sql §2 says the seed is regenerated from partners.json
// "so the two cannot drift by hand". This is that generator.
//
// WHY A GENERATOR AND NOT A HAND-WRITTEN INSERT
// partners.json is the human-edited source of truth: a shop is added, paused or
// pulled by editing it and pushing, with no app build (CLAUDE.md, "Adding or
// removing a partner shop"). Reward V2 needs the SAME facts on the server,
// because a redemption is checked against the server and not against the client.
// Two hand-maintained copies of what a business agreed to is exactly how a
// student ends up asking a shop to honour something it never signed, which the
// repo's own comments call this feature's worst failure.
//
// WHAT IT REFUSES TO DO
//   1. Emit anything while reward-config.js reports a policyState other than
//      "declared", or reports any error at all. Today's partners.json declares
//      no rewardPolicy, so running this bare REFUSES, on purpose: choosing
//      between one shared passport and per-shop bars is a business decision. A
//      config that cannot decide its own reward policy must not be able to seed
//      a server that hands out real discounts.
//   2. Bump offer_version. Ever. See offerVersionNotice() and driftGuard(), both
//      of which it writes into the SQL.
//   3. Quote a string it cannot prove is safe. Control characters and
//      backslashes are refused rather than escaped; see sqlText().
//
// WHAT IT CANNOT DO
// It opens no database connection and makes no network call, so it cannot know
// what the server currently holds. The drift check that matters most is
// therefore written INTO the emitted SQL, as a DO block that runs where the
// server can see its own rows and aborts the whole transaction if they disagree.
//
// The output is DETERMINISTIC: no timestamp, no ordering by anything but the
// file. Same partners.json in, byte-identical .sql out, so `diff` is a truthful
// answer to "did anything actually change?".
//
//   node tools/partners-to-sql.mjs --check                  # validate + summary, no SQL
//   node tools/partners-to-sql.mjs > seed.sql               # emit to stdout
//   node tools/partners-to-sql.mjs --file x.json --out x.sql
//
// Every diagnostic goes to stderr and only SQL goes to stdout, so a refusal can
// never leave a half-written file full of error text sitting behind a `>`.
//
// Zero dependencies, matching the rest of tools/ and the repo's no-build-step rule.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// REQUIRED, not reimplemented. reward-config.js is the one place that knows what
// a valid shop is, what a valid policy is, and whether the reward policy has been
// decided. A second copy of those rules in here would be a second thing to keep
// in sync, which is the precise failure mode this generator exists to prevent.
const RewardConfig = require(path.join(ROOT, "reward-config.js"));

const USAGE = `usage: node tools/partners-to-sql.mjs [--check] [--file <partners.json>] [--out <file.sql>]

  --check          validate and print a summary. Emits no SQL.
  --file, -f PATH  read this instead of <repo>/partners.json
  --out,  -o PATH  write the SQL here instead of stdout
  --help, -h       this text`;

function say(...a) { process.stderr.write(a.join(" ") + "\n"); }

// A refusal is always loud, always on stderr, always non-zero. Nothing that
// reaches this function is recoverable by guessing.
function die(headline, lines) {
  say("");
  say("REFUSED: " + headline);
  (lines || []).forEach((l) => say("  " + l));
  say("");
  process.exit(1);
}

// ── argument parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = { file: path.join(ROOT, "partners.json"), out: null, check: false, help: false };
  const need = (i, flag) => {
    if (i >= argv.length) die("missing value for " + flag, [USAGE]);
    return argv[i];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") opts.check = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--file" || a === "-f") opts.file = need(++i, a);
    else if (a === "--out" || a === "-o") opts.out = need(++i, a);
    else if (a.startsWith("--file=")) opts.file = a.slice("--file=".length);
    else if (a.startsWith("--out=")) opts.out = a.slice("--out=".length);
    else die("unknown argument: " + a, [USAGE]);
  }
  return opts;
}

// ── SQL literals ─────────────────────────────────────────────────────────────
//
// Every string that reaches the output goes through sqlText(). Nothing is
// interpolated raw, including strings this tool built itself, because the value
// of a single door is that there is only one.
//
// Doubling the single quote is the correct escape and it is sufficient WHEN
// standard_conforming_strings is on, which has been the Postgres default since
// 9.1 and is what Supabase runs. It stops being sufficient when it is off,
// because then a trailing backslash swallows the first of the doubled quotes and
// the literal breaks open. That setting cannot be fixed from inside this file: a
// multi-statement paste is parsed as one batch, so a `set` at the top of the
// emitted SQL is read too late to affect the statements below it. So instead of
// depending on a server setting, a backslash is simply refused. No shop name,
// address or offer wording has ever contained one, and "refuse the input I
// cannot prove safe" beats "escape it and hope the server agrees with me".
//
// Control characters are refused for a second, duller reason: a newline inside a
// shop name would wreck the cashier card long before it ever wrecked any SQL.
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

function sqlText(value, where) {
  if (value == null) return "null";
  const s = String(value);
  if (CONTROL_RE.test(s)) throw new Error(where + ": contains a control character");
  if (s.indexOf("\\") >= 0) throw new Error(where + ": contains a backslash");
  return "'" + s.replace(/'/g, "''") + "'";
}

function sqlInt(value, where, lo, hi) {
  if (value == null) return "null";
  if (!Number.isInteger(value)) throw new Error(where + ": not a whole number (" + JSON.stringify(value) + ")");
  if (value < lo || value > hi) throw new Error(where + ": " + value + " is outside " + lo + ".." + hi);
  return String(value);
}

function sqlBool(value) { return value ? "true" : "false"; }

// The emitted SQL carries a readable `-- <shop> · <offer>` line above each row,
// which means untrusted text ends up inside a `--` comment. That is only safe
// because a `--` comment runs to END OF LINE: one newline in a shop name and the
// rest of that name becomes executable SQL. sqlText() already refuses control
// characters, so a newline cannot reach here — this asserts it a second time
// anyway, because the two facts live 200 lines apart and only one of them looks
// load-bearing.
function sqlComment(value, where) {
  const s = String(value == null ? "" : value);
  if (CONTROL_RE.test(s)) throw new Error(where + ": contains a control character");
  return s;
}

// smallint[] is always cast explicitly, including the NULL. In a multi-row VALUES
// list an uncast bare null next to a typed array is asking the planner to resolve
// a type it does not have to resolve.
function sqlSmallintArray(arr, where) {
  if (arr == null) return "null::smallint[]";
  return "array[" + arr.map((d, i) => sqlInt(d, where + "[" + i + "]", 0, 6)).join(", ") + "]::smallint[]";
}

// ── preflight ────────────────────────────────────────────────────────────────
//
// These mirror the CHECK constraints in supabase-reward-v2.sql §1 and §2 one for
// one. reward-config.js validates the BUSINESS rules (does this shop's bar agree
// with its policy's bar?); it does not know the server's column widths or its id
// regex, and it will happily pass through a shop whose `id` is missing entirely,
// which is a null primary key on the server.
//
// Catching these here names the shop and the field. Catching them in the Supabase
// SQL editor gives you a constraint name and a row number, on a migration you are
// pasting because two real businesses are waiting on it.
const ID_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

function preflight(cfg, rawById) {
  const problems = [];
  const add = (m) => problems.push(m);

  const len = (s) => (s == null ? 0 : String(s).length);
  const safe = (label, value) => {
    try { sqlText(value, label); } catch (e) { add(e.message); }
  };

  cfg.policies.forEach((pol) => {
    const at = "policy " + pol.id;
    if (!ID_RE.test(String(pol.id || ""))) {
      add(at + ": id must match " + ID_RE + " (lowercase slug, 2-63 chars)");
    }
    if (["global_passport", "partner_specific"].indexOf(pol.kind) < 0) add(at + ": bad kind " + pol.kind);
    if (!Number.isInteger(pol.requiredMinutes) || pol.requiredMinutes < 15 || pol.requiredMinutes > 1440) {
      add(at + ": requiredMinutes must be a whole number 15..1440, got " + pol.requiredMinutes);
    }
    if (pol.expiresDays != null && (!Number.isInteger(pol.expiresDays) || pol.expiresDays < 1 || pol.expiresDays > 3650)) {
      add(at + ": expiresDays must be a whole number 1..3650 or null, got " + pol.expiresDays);
    }
    if (pol.partnerId != null && !ID_RE.test(String(pol.partnerId))) {
      add(at + ": partnerId must match " + ID_RE);
    }
  });

  cfg.shops.forEach((s) => {
    const at = "shop " + (s.id || s.name);

    // A shop with no id is the one reward-config.js cannot catch for us: it
    // normalises a missing id to null and only errors on DUPLICATE ids, so a
    // single id-less shop passes clean and then lands as a null primary key.
    if (!s.id) add(at + ": has no id. The server's partners.id is the primary key and every reward row points at it.");
    else if (!ID_RE.test(s.id)) add(at + ": id must match " + ID_RE + " (lowercase slug, 2-63 chars)");

    if (len(s.name) < 1 || len(s.name) > 80) add(at + ": name must be 1..80 chars, got " + len(s.name));
    if (len(s.address) > 200) add(at + ": address must be <= 200 chars, got " + len(s.address));
    if (len(s.market) > 60) add(at + ": market must be <= 60 chars, got " + len(s.market));
    if (len(s.offerText) < 1 || len(s.offerText) > 200) {
      add(at + ": offerText must be 1..200 chars, got " + len(s.offerText));
    }
    if (len(s.cashierNote) > 300) add(at + ": cashierNote must be <= 300 chars, got " + len(s.cashierNote));
    if (!Number.isInteger(s.offerVersion) || s.offerVersion < 1) {
      add(at + ": offerVersion must be a whole number >= 1, got " + s.offerVersion);
    }
    if (s.perUserLimit != null && (s.perUserLimit < 1 || s.perUserLimit > 1000)) {
      add(at + ": perUserLimit must be 1..1000 or absent, got " + s.perUserLimit);
    }
    if (s.pilotCap != null && (s.pilotCap < 1 || s.pilotCap > 1000000)) {
      add(at + ": pilotCap must be 1..1000000 or absent, got " + s.pilotCap);
    }

    // reward-config.js FILTERS validDays down to 0..6 rather than rejecting the
    // entry, so a typo'd list can arrive here empty. An empty smallint[] reads to
    // open_redemption() as "no day restriction at all" (it tests array_length for
    // null), which is the opposite of what somebody who typed a day list meant.
    // Silently widening a shop's redemption window is not a rounding error.
    if (Array.isArray(s.validDays) && s.validDays.length === 0) {
      add(at + ": validDays was declared but no entry is a weekday 0..6. Fix it or drop the field. " +
          "An empty list would widen this shop to every day, not narrow it.");
    }

    // open_redemption() only applies the time window when BOTH ends are present.
    // Declaring one of the two therefore does nothing whatsoever, which looks
    // exactly like a shop having asked for a window and got one.
    const from = s.validFromMinute, to = s.validToMinute;
    if ((from == null) !== (to == null)) {
      add(at + ": validFromMinute and validToMinute must be declared together. " +
          "The server ignores a half-open window, so one alone is silently no window.");
    }
    if (from != null && to != null && from > to) {
      add(at + ": validFromMinute " + from + " is after validToMinute " + to +
          ". The server's check is a single `between`, so this window is never open.");
    }

    if (s.policyId && !ID_RE.test(s.policyId)) add(at + ": policyId must match " + ID_RE);

    safe(at + ".name", s.name);
    safe(at + ".address", s.address);
    safe(at + ".market", s.market);
    safe(at + ".offerText", s.offerText);
    safe(at + ".cashierNote", s.cashierNote);
    // `perk` has no server column, but it is printed into a `--` comment in the
    // emitted SQL when it differs from offerText, so it gets the same check.
    safe(at + ".perk", s.perk);
    safe(at + ".id", s.id);
    safe(at + ".policyId", s.policyId);

    // ── the local half of the offer_version rule ──────────────────────────────
    // OPTIONAL field, per shop, in partners.json:
    //
    //   "offerVersions": { "1": "10% off your drink" }
    //
    // a record of what each version's wording actually WAS. If a shop carries it,
    // this exporter can tell locally that the wording moved while the version did
    // not, and refuses. If a shop does not carry it, this tool has no history to
    // compare against and the only drift detector is the guard in the emitted SQL,
    // which runs against the live rows. Neither one guesses; both refuse.
    const raw = rawById.get(s.id) || {};
    const log = raw.offerVersions;
    if (log != null) {
      if (typeof log !== "object" || Array.isArray(log)) {
        add(at + ": offerVersions must be an object mapping a version number to the wording it stood for");
      } else {
        const recorded = log[String(s.offerVersion)];
        if (recorded == null) {
          add(at + ": offerVersions has no entry for the current offerVersion " + s.offerVersion +
              ". Record what v" + s.offerVersion + " says before seeding a server with it.");
        } else if (String(recorded) !== s.offerText) {
          add(at + ": offer wording moved without an offerVersion bump.\n" +
              "      offerVersions[" + s.offerVersion + "] = " + JSON.stringify(String(recorded)) + "\n" +
              "      offerText          = " + JSON.stringify(s.offerText) + "\n" +
              "      Same deal, reworded? Update offerVersions[" + s.offerVersion + "] to match.\n" +
              "      Different deal? Bump offerVersion and add the new wording. That bump is what\n" +
              "      invalidates the rewards students are already holding, so it is a human call.");
        }
      }
    }
  });

  return problems;
}

// ── SQL emission ─────────────────────────────────────────────────────────────

function header(sourcePath) {
  return [
    "-- ════════════════════════════════════════════════════════════════════════════",
    "-- Mr. Tapioca — partner + reward-policy seed.",
    "-- GENERATED FILE. Do not edit it; edit partners.json and regenerate:",
    "--",
    "--     node tools/partners-to-sql.mjs --file " + sourcePath + " > seed.sql",
    "--",
    "-- Source: " + sourcePath,
    "--",
    "-- Run this in the Supabase SQL editor AFTER supabase-reward-v2.sql, which",
    "-- creates public.reward_policies and public.partners. Every statement here is",
    "-- an upsert keyed on the primary key, so re-running it is a no-op when nothing",
    "-- in partners.json changed. There is no timestamp anywhere in this file on",
    "-- purpose: the same input regenerates byte-identical output, so a plain diff",
    "-- answers \"did anything actually change?\".",
    "--",
    "-- The whole thing is one transaction. The guard below can refuse it, and a",
    "-- half-applied partner list is a shop honouring an offer next to a shop that",
    "-- cannot. (Pasting this into the Supabase SQL editor may log a harmless",
    "-- \"there is already a transaction in progress\" notice. That is fine.)",
    "--",
    "-- Fields partners.json carries that the server has no column for, and which",
    "-- are therefore NOT in this seed: lat, lng, perk (the student-facing wording;",
    "-- offer_text is what staff honour), since, terms, verification.",
    "-- ════════════════════════════════════════════════════════════════════════════",
    "",
  ];
}

// The loud comment the task of this exporter is really about. It is written into
// every generated file, not into a doc nobody opens at the counter.
function offerVersionNotice() {
  return [
    "-- ── READ THIS BEFORE CHANGING AN OFFER ──────────────────────────────────────",
    "-- offer_version is copied verbatim from partners.json. This exporter will",
    "-- NEVER bump it for you, and that refusal is the whole design:",
    "--",
    "--   BUMPING offer_version IS WHAT INVALIDATES THE REWARDS STUDENTS ARE",
    "--   ALREADY HOLDING.",
    "--",
    "-- A reward instance stores the offer_version that was live when it was earned.",
    "-- open_redemption() and redeem_by_code() both refuse a reward whose stored",
    "-- version no longer matches the shop's current one, with 'failed_offer_changed'.",
    "-- So the two cases are not the same edit:",
    "--",
    "--   * The shop reworded the SAME deal (a typo, punctuation, \"drink\" to \"boba\")",
    "--     → leave offer_version alone. Nobody holding a reward is affected.",
    "--",
    "--   * The shop changed WHAT THEY GIVE (10% became 5%, a free topping became a",
    "--     discount, the deal ended)",
    "--     → bump offer_version by hand in partners.json and regenerate. Every",
    "--       student holding an old reward is told at the counter that the offer",
    "--       changed, instead of being handed something the shop never agreed to.",
    "--       That refusal is the point of the column.",
    "--",
    "-- Changing offer_text WITHOUT bumping the version silently relabels rewards",
    "-- that are already out in the world: redemption compares the INTEGER, not the",
    "-- string, so a v1 reward earned against \"10% off your drink\" would be honoured",
    "-- against a v1 row that now reads \"5% off your drink\". Nothing errors. The",
    "-- student is simply handed a different deal than the one they were promised,",
    "-- and the shop is handed a bill it never agreed to.",
    "--",
    "-- The generator cannot see the live rows, so the guard below does that check",
    "-- on the server, where it can.",
    "",
  ];
}

// The server-side half of the same rule. It runs where the live wording is, and
// it aborts the transaction rather than warning, because a warning in a SQL editor
// scrolls off the top of a result pane.
function driftGuard(shops) {
  if (!shops.length) return [];
  const rows = shops.map((s, i) => {
    const cast = i === 0 ? ["::text", "::text", "::integer"] : ["", "", ""];
    return "           (" + sqlText(s.id, "id") + cast[0] + ", " +
      sqlText(s.offerText, "offerText") + cast[1] + ", " +
      String(s.offerVersion) + cast[2] + ")";
  }).join(",\n");

  return [
    "-- ── GUARD: refuse a seed that would rewrite an offer under a held reward ────",
    "-- Two ways this seed can be wrong in a way no CHECK constraint would notice:",
    "--",
    "--   1. Same offer_version, different offer_text. The wording moved and the",
    "--      version did not, so every reward already issued at that version now",
    "--      points at a deal nobody agreed to. See the block above.",
    "--   2. This seed's offer_version is LOWER than the live one. That is an older",
    "--      seed being replayed. Rolling the version backwards re-validates every",
    "--      reward from the previous offer, which is the same wrongful grant",
    "--      arriving from the other direction.",
    "--",
    "-- Either one raises and takes the whole transaction with it. Fix partners.json,",
    "-- regenerate, run again. Nothing is applied in the meantime.",
    "do $guard$",
    "declare",
    "  r     record;",
    "  v_msg text := '';",
    "begin",
    "  for r in",
    "    select f.id,",
    "           f.offer_text    as file_text,  f.offer_version as file_version,",
    "           p.offer_text    as live_text,  p.offer_version as live_version",
    "      from (values",
    rows,
    "           ) as f (id, offer_text, offer_version)",
    "      join public.partners p on p.id = f.id",
    "     where (p.offer_version = f.offer_version and p.offer_text is distinct from f.offer_text)",
    "        or (p.offer_version > f.offer_version)",
    "     order by f.id",
    "  loop",
    "    v_msg := v_msg || format(E'\\n  %s: live is v%s %L, this seed is v%s %L',",
    "                             r.id, r.live_version, r.live_text,",
    "                             r.file_version, r.file_text);",
    "  end loop;",
    "",
    "  if v_msg <> '' then",
    "    raise exception 'partner seed refused, offer drift:%', v_msg",
    "      using hint = 'Either the wording changed without an offer_version bump, "
      + "which would silently relabel rewards students already hold, or this seed is "
      + "older than the live row. Fix partners.json and re-run tools/partners-to-sql.mjs.';",
    "  end if;",
    "end",
    "$guard$;",
    "",
  ];
}

function policiesUpsert(policies) {
  const rows = policies.map((p) => {
    const note = "  -- " + sqlComment(p.kind, "policy.kind") + ", " + p.requiredMinutes + " min" +
      (p.partnerId ? ", " + sqlComment(p.partnerId, "policy.partnerId") : "") +
      (p.expiresDays == null ? ", no expiry" : ", expires after " + p.expiresDays + " days");
    return note + "\n  (" + [
      sqlText(p.id, "policy.id"),
      sqlText(p.kind, "policy.kind"),
      sqlInt(p.requiredMinutes, "policy.requiredMinutes", 15, 1440),
      sqlText(p.partnerId, "policy.partnerId"),
      sqlInt(p.expiresDays == null ? null : p.expiresDays, "policy.expiresDays", 1, 3650),
      sqlBool(p.active),
    ].join(", ") + ")";
  }).join(",\n");

  return [
    "-- ── 1. REWARD POLICIES ──────────────────────────────────────────────────────",
    "-- Policies go in before partners: partners.policy_id is a foreign key onto this",
    "-- table, so the other order fails on the first insert.",
    "--",
    "-- created_at is deliberately absent from the DO UPDATE. Re-running this seed",
    "-- must not restate when a policy came into existence.",
    "insert into public.reward_policies",
    "  (id, kind, required_minutes, partner_id, expires_days, active)",
    "values",
    rows,
    "on conflict (id) do update set",
    "  kind             = excluded.kind,",
    "  required_minutes = excluded.required_minutes,",
    "  partner_id       = excluded.partner_id,",
    "  expires_days     = excluded.expires_days,",
    "  active           = excluded.active;",
    "",
  ];
}

function partnersUpsert(shops) {
  if (!shops.length) {
    return [
      "-- ── 2. PARTNERS ─────────────────────────────────────────────────────────────",
      "-- partners.json declared no shops, so there is nothing to upsert. Note that",
      "-- this does NOT remove shops already on the server: see the footer.",
      "",
    ];
  }

  const rows = shops.map((s) => {
    const bits = [sqlComment(s.name, "shop.name"),
                  sqlComment(s.offerText, "shop.offerText") + " (v" + s.offerVersion + ")",
                  sqlComment(s.policyId, "shop.policyId")];
    if (!s.active) bits.push("PAUSED");
    if (s.perk && s.perk !== s.offerText) bits.push("map wording: " + sqlComment(s.perk, "shop.perk"));
    return "  -- " + bits.join(" · ") + "\n  (" + [
      sqlText(s.id, "shop.id"),
      sqlText(s.name, "shop.name"),
      sqlText(s.address, "shop.address"),
      sqlText(s.market, "shop.market"),
      sqlBool(s.active),
      sqlText(s.offerText, "shop.offerText"),
      sqlInt(s.offerVersion, "shop.offerVersion", 1, 2147483647),
      sqlText(s.policyId, "shop.policyId"),
      sqlInt(s.perUserLimit, "shop.perUserLimit", 1, 1000),
      sqlInt(s.pilotCap, "shop.pilotCap", 1, 1000000),
      sqlSmallintArray(s.validDays, "shop.validDays"),
      sqlInt(s.validFromMinute, "shop.validFromMinute", 0, 1439),
      sqlInt(s.validToMinute, "shop.validToMinute", 0, 1439),
      sqlText(s.cashierNote, "shop.cashierNote"),
    ].join(", ") + ")";
  }).join(",\n");

  return [
    "-- ── 2. PARTNERS ─────────────────────────────────────────────────────────────",
    "-- offer_version is set from the file and never computed. The guard above has",
    "-- already refused the two ways that could be wrong.",
    "--",
    "-- active=false is a PAUSE, not a removal: the shop keeps its row and its",
    "-- history, and open_redemption()/redeem_by_code() refuse it with",
    "-- 'failed_partner_paused'. That is the kill switch, and it is reversible.",
    "insert into public.partners",
    "  (id, name, address, market, active, offer_text, offer_version, policy_id,",
    "   per_user_limit, pilot_cap, valid_days, valid_from_minute, valid_to_minute,",
    "   cashier_note)",
    "values",
    rows,
    "on conflict (id) do update set",
    "  name              = excluded.name,",
    "  address           = excluded.address,",
    "  market            = excluded.market,",
    "  active            = excluded.active,",
    "  offer_text        = excluded.offer_text,",
    "  offer_version     = excluded.offer_version,",
    "  policy_id         = excluded.policy_id,",
    "  per_user_limit    = excluded.per_user_limit,",
    "  pilot_cap         = excluded.pilot_cap,",
    "  valid_days        = excluded.valid_days,",
    "  valid_from_minute = excluded.valid_from_minute,",
    "  valid_to_minute   = excluded.valid_to_minute,",
    "  cashier_note      = excluded.cashier_note,",
    "  updated_at        = now();",
    "",
  ];
}

function footer(shops) {
  const ids = shops.map((s) => sqlText(s.id, "shop.id")).join(", ");
  return [
    "commit;",
    "",
    "-- ── WHAT THIS SEED DOES NOT DO ──────────────────────────────────────────────",
    "-- It never DELETES. A shop dropped from partners.json disappears from the map",
    "-- (the client only ever renders the file) but its server row stays, so its",
    "-- redemption history and its pilot report survive. To stop a shop honouring",
    "-- rewards, set active=false in partners.json and regenerate. Deleting a partner",
    "-- row would orphan reward_instances.redeemed_partner_id and take the shop's own",
    "-- report with it.",
    "--",
    "-- It also does not issue, void or expire anything. Reward instances are the",
    "-- server's business (issue_my_rewards, supabase-reward-v2.sql §7).",
    "",
    "-- Read back what was applied:",
    shops.length
      ? "--   select id, name, active, offer_version, offer_text, policy_id\n" +
        "--     from public.partners where id in (" + ids + ") order by id;"
      : "--   select id, name, active, offer_version, offer_text, policy_id from public.partners order by id;",
    "",
  ];
}

function emit(cfg, sourcePath) {
  return []
    .concat(header(sourcePath))
    .concat(offerVersionNotice())
    .concat(["begin;", ""])
    .concat(driftGuard(cfg.shops))
    .concat(policiesUpsert(cfg.policies))
    .concat(partnersUpsert(cfg.shops))
    .concat(footer(cfg.shops))
    .join("\n");
}

// ── --check summary ──────────────────────────────────────────────────────────

function summary(cfg, sourcePath) {
  const out = [];
  // Minimum one trailing space, so an over-long shop name pushes the next column
  // right instead of welding itself to it.
  const pad = (s, n) => String(s) + " ".repeat(Math.max(1, n - String(s).length));

  out.push("source      " + sourcePath);
  out.push("policyState " + cfg.policyState);
  out.push("shops       " + cfg.shops.length);
  out.push("policies    " + cfg.policies.length);
  out.push("");

  if (cfg.policies.length) {
    out.push("POLICIES");
    cfg.policies.forEach((p) => {
      out.push("  " + pad(p.id, 26) + pad(p.kind, 18) + pad(p.requiredMinutes + " min", 10) +
        (p.partnerId ? "→ " + p.partnerId + "  " : "") +
        (p.expiresDays == null ? "no expiry" : "expires " + p.expiresDays + "d") +
        (p.active ? "" : "  [INACTIVE]"));
    });
    out.push("");
  }

  if (cfg.shops.length) {
    out.push("SHOPS");
    cfg.shops.forEach((s) => {
      out.push("  " + pad(s.id || "(no id)", 26) + pad(s.name, 20) +
        pad(s.minMinutes + " min", 10) + pad("offer v" + s.offerVersion, 12) +
        (s.active ? "" : "[PAUSED] ") + s.offerText);
      const caps = [];
      if (s.perUserLimit != null) caps.push("per-user " + s.perUserLimit);
      if (s.pilotCap != null) caps.push("pilot cap " + s.pilotCap);
      if (s.validDays) caps.push("days " + s.validDays.join(","));
      if (s.validFromMinute != null && s.validToMinute != null) {
        caps.push("window " + s.validFromMinute + "-" + s.validToMinute + " min");
      }
      if (caps.length) out.push("  " + " ".repeat(26) + caps.join(" · "));
    });
    out.push("");
  }

  // Printed on every run, not only when something is wrong. The number a human
  // has to look at before an offer changes is the one that should be in front of
  // them every single time they run this.
  out.push("OFFER VERSIONS (this exporter never bumps one; a bump invalidates held rewards)");
  cfg.shops.forEach((s) => out.push("  " + pad(s.id || s.name, 26) + "v" + s.offerVersion + "  " + s.offerText));

  return out.join("\n");
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(USAGE + "\n"); return 0; }

  const sourcePath = path.resolve(opts.file);
  let payload;
  try {
    payload = JSON.parse(readFileSync(sourcePath, "utf8"));
  } catch (e) {
    die("could not read " + sourcePath, [String(e.message)]);
  }

  const cfg = RewardConfig.parse(payload);

  // The raw entries, kept alongside the normalised ones. normaliseShop() drops
  // any field it does not know about, and the optional offerVersions history is
  // one of those.
  const rawById = new Map();
  const rawShops = Array.isArray(payload) ? payload : ((payload && payload.shops) || []);
  rawShops.forEach((s) => { if (s && typeof s.id === "string") rawById.set(s.id, s); });

  cfg.warnings.forEach((w) => say("warning: " + w));

  // Refusal 1: the policy is not decided. This is the state today's partners.json
  // is in, and it is not a bug in the file — the founder has not chosen between a
  // shared passport and per-shop bars yet, and reward-config.js will not choose
  // for him. A server seeded from an undecided config would be handing out real
  // discounts under a rule nobody wrote down.
  if (cfg.policyState !== "declared" || cfg.errors.length) {
    const lines = [];
    lines.push("policyState is \"" + cfg.policyState + "\"; only \"declared\" may seed a server.");
    lines.push("");
    if (cfg.errors.length) {
      lines.push("errors (" + cfg.errors.length + "):");
      cfg.errors.forEach((e) => lines.push("  - " + e));
      lines.push("");
    }
    if (cfg.policyState === "undeclared") {
      lines.push("partners.json declares no rewardPolicy block. Add one, of the shape:");
      lines.push("");
      lines.push("  \"rewardPolicy\": {");
      lines.push("    \"policies\": [");
      lines.push("      { \"id\": \"<slug>\", \"kind\": \"global_passport\",");
      lines.push("        \"requiredMinutes\": 240, \"expiresDays\": null }");
      lines.push("    ]");
      lines.push("  }");
      lines.push("");
      lines.push("and give every shop a \"policyId\" pointing at it. kind is the business");
      lines.push("decision: global_passport = one shared bar, a reward earned anywhere is");
      lines.push("spendable at any shop on that policy (what v1 behaves like today);");
      lines.push("partner_specific = the bar and the reward belong to one shop. The two are");
      lines.push("indistinguishable while every shop sits at the same number, and they stop");
      lines.push("being indistinguishable the day one does not.");
    }
    die("this config cannot decide its own reward policy", lines);
  }

  // Refusal 2: the config is decided but would not survive the server's own CHECK
  // constraints, or its offer wording has drifted from its declared version.
  const problems = preflight(cfg, rawById);
  if (problems.length) {
    die(problems.length + " problem(s) that the server would reject or, worse, accept",
        problems.map((p) => "- " + p));
  }

  if (opts.check) {
    process.stdout.write(summary(cfg, sourcePath) + "\n");
    say("");
    say("OK: " + cfg.shops.length + " shop(s), " + cfg.policies.length +
        " polic(ies). --check emits no SQL; drop the flag to generate the seed.");
    return 0;
  }

  let sql;
  try {
    sql = emit(cfg, sourcePath);
  } catch (e) {
    // Reaching here means a literal could not be quoted safely and preflight let
    // it through. Never emit a partial file: a half-quoted string is the one bug
    // in this tool that could execute someone else's SQL.
    die("could not build a safe literal", [String(e.message)]);
  }

  if (opts.out) {
    writeFileSync(opts.out, sql, "utf8");
    say("wrote " + path.resolve(opts.out) + " (" + sql.length + " bytes)");
  } else {
    process.stdout.write(sql);
  }
  say(summary(cfg, sourcePath));
  return 0;
}

process.exit(main());
