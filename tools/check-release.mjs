#!/usr/bin/env node
// ── check-release.mjs ── is the NEXT iOS build safe to archive? ──────────────
//
//   node tools/check-release.mjs          (exit 1 if anything is wrong)
//   node tools/check-release.mjs --quiet   only the section verdicts + summary
//
// WHY THIS EXISTS. Everything an iOS archive ships comes out of
// `ios/App/App/public`, which is a COPY. It is refreshed only when a human
// remembers to run:
//
//   npm run copyweb && npx cap copy ios && node tools/register-ios-plugins.mjs
//
// Nothing enforces that, nothing warns when it is skipped, and Xcode will
// happily archive a month-old bundle without a single error. That has already
// happened here: docs/network-v1/GROUNDING.md §7 caught the staged bundle three
// days behind the repo, including a service-worker CACHE generation (v181) that
// installed users ALREADY HAVE, which means the update would have shipped and
// changed nothing on anyone's phone. This script is the guard for that whole
// class of silent staleness.
//
// WHAT IT DELIBERATELY DOES NOT DO. It never decides whether to bump a version,
// never edits a file, never touches the network, and never runs Xcode. It reads
// the tree, states what is true, and exits non-zero if something would ship
// wrong. The Apple-ID half of a release (Archive, Upload, App Store Connect) is
// the founder's own work and is checklisted in docs/network-v1/NEXT-BUILD.md.
//
// Note on scope: partner rewards (reward-config.js / reward-v2.js) are the NEXT
// build's feature by design. 1.1.0 shipping without them is intentional, not a
// defect. What this script checks is narrower and mechanical: if those files are
// wired in at all, they must be wired in EVERYWHERE (copyweb + sw.js SHELL) so a
// future edit cannot drop half of the wiring and leave a bundle that boots
// against a missing script.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_ASSET_DIRECTORY, PUBLIC_ROOT_FILES, PUBLIC_ENTRY } from "./public-bundle-manifest.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(REPO, "www");
const STAGED = join(REPO, "ios", "App", "App", "public");
const PBXPROJ = join(REPO, "ios", "App", "App.xcodeproj", "project.pbxproj");
const QUIET = process.argv.includes("--quiet");

const failures = [];
const warnings = [];

function head(n, title) {
  console.log(`\n[${n}/7] ${title}`);
  console.log("      " + "-".repeat(Math.max(0, 66 - title.length + title.length - 6)));
}
function say(line) { if (!QUIET) console.log("      " + line); }
function always(line) { console.log("      " + line); }
function pass(msg) { console.log("      PASS  " + msg); }
function fail(section, msg) { console.log("      FAIL  " + msg); failures.push(`[${section}] ${msg}`); }
function warn(section, msg) { console.log("      WARN  " + msg); warnings.push(`[${section}] ${msg}`); }
function note(msg) { console.log("      note  " + msg); }

function readText(p) {
  try { return readFileSync(p, "utf8"); } catch { return null; }
}
function sha(p) {
  try { return createHash("sha256").update(readFileSync(p)).digest("hex"); } catch { return null; }
}
// ── 1. Staged bundle vs repo root ────────────────────────────────────────────
//
// The file list is READ OUT OF package.json rather than duplicated here. If the
// two lists lived in two places they would drift, and the drift would be exactly
// the failure this script is supposed to catch. Parsing the real script is the
// only version that cannot go stale.
function copywebManifest() {
  return { files: [...PUBLIC_ROOT_FILES], entry: PUBLIC_ENTRY, assets: PUBLIC_ASSET_DIRECTORY === "assets", error: null };
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => relative(dir, join(d.parentPath || d.path, d.name)))
    // copyweb deletes .DS_Store on the way through, so it is never a real diff.
    .filter((p) => !p.endsWith(".DS_Store"))
    .sort();
}

function compareBundle(directory, label, manifest, allowedExtra = new Set()) {
  const missing = [];
  const differs = [];
  const same = [];
  if (!existsSync(directory)) return { label, missing: ["(bundle directory)"], differs, extra: [], assetMissing: [], assetDiffer: [], assetExtra: [] };

  for (const f of manifest.files) {
    const rootPath = join(REPO, f);
    const bundlePath = join(directory, f);
    const rootHash = sha(rootPath);
    const bundleHash = sha(bundlePath);
    if (rootHash == null) {
      fail(1, `public manifest lists ${f} but it is not in the repo root`);
      continue;
    }
    if (bundleHash == null) missing.push(f);
    else (rootHash === bundleHash ? same : differs).push(f);
  }

  // The native entry (index.html) is built from app.html, so compare the bundled
  // index.html against the repo's app.html, not against the landing index.html.
  if (manifest.entry) {
    const srcHash = sha(join(REPO, manifest.entry.source));
    const bundleHash = sha(join(directory, manifest.entry.dest));
    if (srcHash == null) fail(1, `public entry source ${manifest.entry.source} is not in the repo root`);
    else if (bundleHash == null) missing.push(manifest.entry.dest);
    else (srcHash === bundleHash ? same : differs).push(manifest.entry.dest);
  }

  const rootAssets = manifest.assets ? walk(join(REPO, PUBLIC_ASSET_DIRECTORY)) : [];
  const bundleAssets = manifest.assets ? walk(join(directory, PUBLIC_ASSET_DIRECTORY)) : [];
  const rootAssetSet = new Set(rootAssets);
  const bundleAssetSet = new Set(bundleAssets);
  const assetMissing = rootAssets.filter((name) => !bundleAssetSet.has(name));
  const assetExtra = bundleAssets.filter((name) => !rootAssetSet.has(name));
  const assetDiffer = rootAssets.filter((name) => bundleAssetSet.has(name)
    && sha(join(REPO, PUBLIC_ASSET_DIRECTORY, name)) !== sha(join(directory, PUBLIC_ASSET_DIRECTORY, name)));

  const shipped = new Set([...manifest.files, ...(manifest.entry ? [manifest.entry.dest] : [])]);
  const extra = walk(directory).filter((name) => !name.startsWith(`${PUBLIC_ASSET_DIRECTORY}/`)
    && !shipped.has(name) && !allowedExtra.has(name));
  return { label, missing, differs, same, extra, assetMissing, assetDiffer, assetExtra };
}

function checkBundleSync(manifest) {
  head(1, "Repo → www → staged iOS bundle parity");
  say(`root:   ${REPO}`);
  say(`www:    ${relative(REPO, WEB)}`);
  say(`staged: ${relative(REPO, STAGED)}`);
  if (manifest.error) { fail(1, manifest.error); return; }

  const generatedByCapacitor = new Set(["cordova.js", "cordova_plugins.js"]);
  const comparisons = [
    compareBundle(WEB, "www", manifest),
    compareBundle(STAGED, "staged iOS", manifest, generatedByCapacitor),
  ];
  let bad = 0;
  for (const result of comparisons) {
    const count = result.missing.length + result.differs.length + result.extra.length
      + result.assetMissing.length + result.assetDiffer.length + result.assetExtra.length;
    bad += count;
    say("");
    say(`  ${result.label}: ${result.same.length}/${manifest.files.length + (manifest.entry ? 1 : 0)} shell files match; ` +
      `${walk(join(result.label === "www" ? WEB : STAGED, PUBLIC_ASSET_DIRECTORY)).length} assets`);
    for (const name of result.missing) say(`    --  ${name}`);
    for (const name of result.differs) say(`    !!  ${name}`);
    for (const name of result.assetMissing) say(`    --  ${PUBLIC_ASSET_DIRECTORY}/${name}`);
    for (const name of result.assetDiffer) say(`    !!  ${PUBLIC_ASSET_DIRECTORY}/${name}`);
    for (const name of result.assetExtra) say(`    ++  ${PUBLIC_ASSET_DIRECTORY}/${name}`);
    for (const name of result.extra) say(`    ++  ${name}`);
  }

  say("");
  if (bad === 0) {
    pass(`root, www and staged iOS public bundle are byte-identical (${manifest.files.length + (manifest.entry ? 1 : 0)} files + ${PUBLIC_ASSET_DIRECTORY}/)`);
  } else {
    fail(1, `public bundle parity failed with ${bad} missing, changed or unexpected path(s)`);
    always("      fix:  npm run ios:sync");
    always("      why:  an archive taken now would not match the reviewed source tree.");
  }
}

// ── 2. Service worker: SHELL completeness + cache generation ─────────────────
//
// One missing SHELL path makes cache.addAll reject, so install fails, activate
// never runs, and EVERY installed user keeps the previous release forever with
// no error anywhere. tools/check-shell.py already owns the root half of this and
// is called rather than reimplemented, so there is one source of truth.
function shellOf(swSrc) {
  const block = /const SHELL = \[(.*?)\];/s.exec(swSrc || "");
  return block ? [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : null;
}
function cacheOf(swSrc) {
  const m = /const CACHE = "([^"]+)"/.exec(swSrc || "");
  return m ? m[1] : null;
}
function cacheNum(name) {
  const m = /-v(\d+)\b/.exec(name || "");
  return m ? Number(m[1]) : null;
}

function checkServiceWorker() {
  head(2, "Service worker SHELL + cache generation");

  const rootSw = readText(join(REPO, "sw.js"));
  const stagedSw = readText(join(STAGED, "sw.js"));
  if (!rootSw) { fail(2, "root sw.js unreadable"); return {}; }

  // Root half: delegate to the existing guard so the two can never disagree.
  const py = spawnSync("python3", ["tools/check-shell.py"], { cwd: REPO, encoding: "utf8" });
  if (py.error || py.status === null) {
    warn(2, "could not run tools/check-shell.py (" + (py.error ? py.error.code : "no exit status") + "); using the built-in fallback");
    const paths = shellOf(rootSw);
    if (!paths) { fail(2, "could not find the SHELL list in root sw.js"); return {}; }
    const gone = paths.filter((p) => p !== "./" && !existsSync(join(REPO, p)));
    if (gone.length) fail(2, `root sw.js SHELL lists ${gone.length} path(s) not on disk: ${gone.join(", ")}`);
    else pass(`root SHELL: ${paths.length} precached paths, all present`);
  } else {
    for (const line of py.stdout.trim().split("\n")) say("  check-shell.py | " + line);
    if (py.status !== 0) fail(2, `tools/check-shell.py exited ${py.status}: a listed SHELL path is missing, which blocks updates app-wide`);
    else pass("tools/check-shell.py: every precached path exists in the repo root");
  }

  // Staged half: check-shell.py only knows about the repo root, but the STAGED
  // bundle is the thing that actually ships. A SHELL entry that exists in the
  // root and not in the bundle bricks updates for installed iPhone users only,
  // which is the hardest version of this bug to notice.
  if (!stagedSw) {
    fail(2, "staged bundle has no sw.js");
  } else {
    const stagedPaths = shellOf(stagedSw);
    if (!stagedPaths) {
      fail(2, "could not find the SHELL list in the staged sw.js");
    } else {
      const gone = stagedPaths.filter((p) => p !== "./" && !existsSync(join(STAGED, p)));
      if (gone.length) {
        fail(2, `staged sw.js SHELL lists ${gone.length} path(s) missing from the staged bundle: ${gone.join(", ")}`);
      } else {
        pass(`staged SHELL: ${stagedPaths.length} precached paths, all present in the bundle`);
      }
    }
  }

  const rootCache = cacheOf(rootSw);
  const stagedCache = cacheOf(stagedSw);
  say("");
  say(`  root sw.js   CACHE = ${rootCache || "(not found)"}`);
  say(`  staged sw.js CACHE = ${stagedCache || "(not found)"}`);

  const rn = cacheNum(rootCache), sn = cacheNum(stagedCache);
  if (rn == null || sn == null) {
    fail(2, "could not read a mr-tapioca-vNN generation out of one of the sw.js files");
  } else if (rn > sn) {
    // This is the release-blocking direction. The staged copy is what archives.
    fail(2, `staged CACHE (${stagedCache}) is ${rn - sn} generation(s) BEHIND the root (${rootCache}). ` +
      `An archive taken now ships a shell installed users already have, so the update lands and changes nothing.`);
  } else if (rn < sn) {
    fail(2, `root CACHE (${rootCache}) is BEHIND the staged bundle (${stagedCache}). The root sw.js has regressed.`);
  } else {
    pass(`root and staged agree on ${rootCache}`);
    // Equality is necessary, not sufficient, and this script genuinely cannot
    // know what generation is live on the App Store. Say so rather than imply a
    // guarantee it does not have.
    warn(2, `both are ${rootCache}. This script cannot see what is already installed on users' phones. ` +
      `Confirm by hand that this number is HIGHER than the last release's before archiving.`);
  }
  return { rootCache, stagedCache };
}

// ── 3. Reward files wired into BOTH the SHELL and copyweb ────────────────────
//
// index.html loads reward-config.js and reward-v2.js before app.js. If either
// is dropped from copyweb the bundle 404s a script tag; if either is dropped
// from the SHELL the app stops working offline in exactly the wrong place. The
// two lists are edited by hand in two files, so assert them together.
const REWARD_FILES = ["reward-config.js", "reward-v2.js"];

function checkRewardWiring(manifest) {
  head(3, "reward-config.js / reward-v2.js wiring");

  const shell = shellOf(readText(join(REPO, "sw.js"))) || [];
  const inCopyweb = new Set(manifest.files);
  // The reward scripts live in the app, which is app.html (index.html is now the
  // marketing landing page). The native bundle ships app.html AS index.html.
  const indexSrc = readText(join(REPO, (manifest.entry && manifest.entry.source) || "index.html")) || "";

  let ok = true;
  for (const f of REWARD_FILES) {
    const s = shell.includes(f);
    const c = inCopyweb.has(f);
    const h = new RegExp(`src=["']\\.?/?${f.replace(".", "\\.")}["']`).test(indexSrc);
    const d = existsSync(join(REPO, f));
    say(`  ${f.padEnd(18)} on disk ${d ? "yes" : "NO "}   copyweb ${c ? "yes" : "NO "}   sw SHELL ${s ? "yes" : "NO "}   index.html ${h ? "yes" : "NO "}`);
    if (!d) { fail(3, `${f} is referenced by the build but is not in the repo root`); ok = false; }
    if (!c) { fail(3, `${f} is NOT in the copyweb script, so it never reaches the iOS bundle`); ok = false; }
    if (!s) { fail(3, `${f} is NOT in the sw.js SHELL, so it is not precached and the app breaks offline`); ok = false; }
    if (!h) { warn(3, `${f} is not referenced by a <script src> in index.html`); }
  }
  if (ok) pass("both reward files are on disk, in copyweb, and in the sw.js SHELL");
}

// ── 4. Development URLs and credentials in the shipped bundle ────────────────
//
// Reports the KIND and the file:line only. A scanner that echoes the matched
// text turns every log, screenshot and pasted terminal into a second leak, so
// the value is never printed even when the value is harmless.
//
// The publishable Supabase key is SUPPOSED to be here (config.js:12) and is
// recognised as fine. A service_role key is the opposite: it bypasses every RLS
// policy in supabase-setup.sql, and shipping one inside a client bundle hands
// full database write access to anyone who unzips the .ipa. Hard failure.
const FATAL_SECRETS = [
  { kind: "Supabase secret (service_role) key", re: /\bsb_secret_[A-Za-z0-9_-]{8,}/ },
  { kind: "Supabase personal access token", re: /\bsbp_[A-Za-z0-9]{16,}/ },
  { kind: "signed JSON Web Token", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./ },
  { kind: "PEM private key block", re: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/ },
  { kind: "OpenAI-style secret key", re: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}/ },
  { kind: "Stripe live secret key", re: /\b[rs]k_live_[A-Za-z0-9]{16,}/ },
  { kind: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: "GitHub token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{20,}/ },
  { kind: "Google API key", re: /\bAIza[0-9A-Za-z_-]{30,}/ },
];

const FATAL_DEV_URLS = [
  { kind: "ngrok tunnel URL", re: /\bngrok\b/i },
  { kind: "ephemeral tunnel URL", re: /\b[a-z0-9-]+\.(?:trycloudflare\.com|loca\.lt|serveo\.net)\b/i },
  { kind: "loopback address", re: /\b127\.0\.0\.1\b|\[::1\]|\b0\.0\.0\.0\b/ },
  { kind: "private LAN URL", re: /\bhttps?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/ },
  { kind: "file:// path into a local home directory", re: /file:\/\/\/(?:Users|home)\// },
  // capacitor://localhost is the WKWebView's own origin, not a dev server, so it
  // is subtracted before this test rather than special-cased inside it.
  { kind: "localhost reference", re: /\blocalhost\b/i },
];

const RECOGNISED_OK = [
  { kind: "Supabase publishable (anon) key, expected and safe to ship", re: /\bsb_publishable_[A-Za-z0-9_-]+/ },
];

// Conservative on purpose: a line only counts as a comment when its first
// non-space characters are a comment opener, or when it sits inside a block
// comment that itself began at the start of a line. Never strip mid-line, since
// "https://" contains "//" and a naive stripper would hide real hits inside URLs.
function commentLineFlags(src, ext) {
  const lines = src.split("\n");
  const flags = new Array(lines.length).fill(false);
  let inBlock = false;
  const blocky = ext === "js" || ext === "css";
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (inBlock) {
      flags[i] = true;
      if (t.includes("*/")) inBlock = false;
      continue;
    }
    if (blocky && (t.startsWith("//") || t.startsWith("*"))) { flags[i] = true; continue; }
    if (blocky && t.startsWith("/*")) { flags[i] = true; if (!t.includes("*/")) inBlock = true; continue; }
    if (ext === "html" && t.startsWith("<!--")) { flags[i] = true; continue; }
  }
  return flags;
}

function scanOne(label, absPath) {
  const src = readText(absPath);
  if (src == null) return { hits: [], ok: [] };
  const ext = (absPath.split(".").pop() || "").toLowerCase();
  const isComment = commentLineFlags(src, ext);
  const lines = src.split("\n");
  const hits = [], ok = [];

  lines.forEach((raw, i) => {
    // Subtract the strings that are legitimately part of shipping before testing.
    const line = raw
      .replace(/capacitor:\/\/localhost/gi, "")
      .replace(/\bsb_publishable_[A-Za-z0-9_-]+/g, "");

    for (const p of RECOGNISED_OK) if (p.re.test(raw)) ok.push({ kind: p.kind, at: `${label}:${i + 1}` });

    for (const p of FATAL_SECRETS) {
      if (p.re.test(line)) hits.push({ kind: p.kind, at: `${label}:${i + 1}`, fatal: true });
    }
    // "service_role" as prohibition text in a comment (config.js:7 says never to
    // paste one) is the opposite of a leak. Only a live code line is a failure.
    if (/\bservice_role\b/.test(line)) {
      if (isComment[i]) ok.push({ kind: "the words service_role in a comment (prohibition text, not a key)", at: `${label}:${i + 1}` });
      else hits.push({ kind: "service_role referenced outside a comment", at: `${label}:${i + 1}`, fatal: true });
    }
    for (const p of FATAL_DEV_URLS) {
      if (p.re.test(line)) {
        hits.push({ kind: p.kind, at: `${label}:${i + 1}`, fatal: !isComment[i] });
      }
    }
  });
  return { hits, ok };
}

function checkSecrets(manifest) {
  head(4, "Development URLs and credentials in the shipped bundle");

  const TEXT = /\.(js|css|html|json|mjs)$/i;
  const targets = [];
  for (const f of manifest.files) {
    if (!TEXT.test(f)) continue;
    targets.push([`root/${f}`, join(REPO, f)]);
    if (existsSync(join(STAGED, f))) targets.push([`staged/${f}`, join(STAGED, f)]);
  }
  // capacitor.config.json is not part of copyweb but it IS part of the build,
  // and a live-reload "server" block is the single most common way a dev URL
  // reaches the App Store. Worth scanning even though it never has one here.
  for (const p of ["capacitor.config.json", "ios/App/App/capacitor.config.json"]) {
    if (existsSync(join(REPO, p))) targets.push([p, join(REPO, p)]);
  }

  const allHits = [], allOk = [];
  for (const [label, abs] of targets) {
    const { hits, ok } = scanOne(label, abs);
    allHits.push(...hits); allOk.push(...ok);
  }

  // The Capacitor live-reload trap, checked structurally rather than by regex.
  for (const p of ["capacitor.config.json", "ios/App/App/capacitor.config.json"]) {
    const src = readText(join(REPO, p));
    if (!src) continue;
    try {
      const cfg = JSON.parse(src);
      if (cfg.server) {
        fail(4, `${p} declares a "server" block. Capacitor live-reload points the shipped app at a dev machine.`);
      } else {
        say(`  ${p}: no "server" block (no live-reload URL can ship)`);
      }
    } catch { fail(4, `${p} is not valid JSON`); }
  }

  say(`  scanned ${targets.length} text files across the root and staged bundles`);

  const seenOk = new Set();
  for (const o of allOk) {
    const key = o.kind;
    if (seenOk.has(key)) continue;
    seenOk.add(key);
    const where = allOk.filter((x) => x.kind === key).map((x) => x.at);
    note(`recognised as fine: ${key}  (${where.length} site(s), e.g. ${where.slice(0, 3).join(", ")})`);
  }

  const fatal = allHits.filter((h) => h.fatal);
  const soft = allHits.filter((h) => !h.fatal);
  for (const h of soft) note(`in a comment only, not shipped code: ${h.kind}  at ${h.at}`);
  for (const h of fatal) fail(4, `${h.kind}  at ${h.at}   (value deliberately not printed)`);

  if (!fatal.length) pass("no development URL, tunnel host, loopback address or private key found in shipped code");
}

// ── 5. The rewardV2 feature flag ─────────────────────────────────────────────
//
// The Reward V2 database and RPCs are live and runtime-tested. A true production
// flag is now safe only when reward-v2.js also enforces the native-platform
// boundary: browser sessions cannot block apps and must stay on the local V1
// path. This check proves that boundary from behavior, rather than trusting a
// source comment that can drift.
// Read the flag out of the REAL assignment, not out of prose. The first version
// of this grepped the whole file for /rewardV2\s*:\s*(\w+)/ and matched
// config.js:15, the comment line "// rewardV2: the server-backed merchant
// reward", reporting the flag's value as the word "the" and failing a clean
// tree. Comment lines are blanked first, then only the object literal assigned
// to MRTAP_FLAGS is searched.
function flagState(src) {
  if (src == null) return { blockPresent: false, present: false, raw: null };
  const isComment = commentLineFlags(src, "js");
  const code = src.split("\n").map((l, i) => (isComment[i] ? "" : l)).join("\n");

  const block = /MRTAP_FLAGS\s*=\s*\{([\s\S]*?)\}/.exec(code);
  if (!block) return { blockPresent: false, present: false, raw: null };

  const m = /\brewardV2\s*:\s*([A-Za-z0-9_.$]+)/.exec(block[1]);
  return { blockPresent: true, present: !!m, raw: m ? m[1] : null };
}

function rewardGateBehavior(cfgPath, rewardPath, native) {
  const cfgSrc = readText(cfgPath);
  const rewardSrc = readText(rewardPath);
  if (cfgSrc == null || rewardSrc == null) return { ok: false, reason: "bundle files are unreadable" };

  const script = `
    const vm = require("node:vm");
    const fs = require("node:fs");
    const cfg = fs.readFileSync(process.argv[1], "utf8");
    const reward = fs.readFileSync(process.argv[2], "utf8");
    const native = process.argv[3] === "true";
    const window = {
      Capacitor: { isNativePlatform: () => native },
      addEventListener() {},
    };
    const context = {
      window,
      localStorage: { getItem() { return null; }, setItem() {} },
      document: { visibilityState: "visible", addEventListener() {} },
      console,
    };
    vm.runInNewContext(cfg, context);
    vm.runInNewContext(reward, context);
    process.stdout.write(String(!!context.window.RewardV2?.enabled));
  `;
  const run = spawnSync(process.execPath, ["-e", script, cfgPath, rewardPath, String(native)], { encoding: "utf8" });
  if (run.status !== 0) return { ok: false, reason: (run.stderr || "gate evaluation failed").trim() };
  return { ok: true, enabled: run.stdout.trim() === "true" };
}

function checkFlag() {
  head(5, "window.MRTAP_FLAGS.rewardV2");

  const pairs = [
    ["root config.js", join(REPO, "config.js"), join(REPO, "reward-v2.js")],
    ["staged config.js", join(STAGED, "config.js"), join(STAGED, "reward-v2.js")],
  ];

  let bad = false;
  for (const [label, cfgPath, rewardPath] of pairs) {
    const st = flagState(readText(cfgPath));
    const hasReward = existsSync(rewardPath);
    const shown = st.present ? st.raw : st.blockPresent ? "(flag block, but no rewardV2 key)" : "(no flag block)";
    say(`  ${label.padEnd(18)} rewardV2 = ${shown}   reward-v2.js in bundle: ${hasReward ? "yes" : "no"}`);

    if (st.present && st.raw === "true") {
      const native = rewardGateBehavior(cfgPath, rewardPath, true);
      const web = rewardGateBehavior(cfgPath, rewardPath, false);
      if (!native.ok || !web.ok) {
        fail(5, `${label} could not evaluate the Reward V2 platform gate: ${native.reason || web.reason}`);
        bad = true;
      } else if (!native.enabled || web.enabled) {
        fail(5, `${label} must enable Reward V2 on native iOS and disable it on web (native=${native.enabled}, web=${web.enabled}).`);
        bad = true;
      } else {
        pass(`${label} enables Reward V2 native-only (native on, web off)`);
      }
    } else if (st.present && st.raw !== "false") {
      fail(5, `${label} sets rewardV2 to "${st.raw}", which this check cannot prove is off. It must be the literal false.`);
      bad = true;
    } else if (st.blockPresent && !st.present) {
      // Reads as undefined, so it is off, but silently and by accident. The flag
      // is the only thing standing between a live client and an unrun migration,
      // so it should be off on purpose and in writing.
      warn(5, `${label} has a MRTAP_FLAGS block with no rewardV2 key. It evaluates to undefined (off), but state it explicitly as false.`);
    } else if (!st.blockPresent && hasReward) {
      // Half-wired bundle: the module is there and its switch is not.
      fail(5, `${label} has no rewardV2 flag but reward-v2.js is in that bundle. The module would read an undefined flag.`);
      bad = true;
    } else if (!st.blockPresent) {
      note(`${label} has no MRTAP_FLAGS block, and no reward-v2.js sits beside it, so nothing reads the flag. ` +
        `Consistent, and it resolves the moment copyweb is re-run.`);
    }
  }
  if (!bad && pairs.every(([, cfgPath]) => flagState(readText(cfgPath)).raw === "false")) {
    pass("rewardV2 is explicitly disabled in every bundle");
  }
}

// ── 6. Version numbers, printed and not judged ───────────────────────────────
//
// Whether to bump is a release decision that depends on what is in App Store
// Connect, which nothing in this repo can see. So: print the truth, verify the
// ten build configurations agree with each other (a mismatch between the app and
// its four extensions is rejected at upload), and stop there.
function checkVersions() {
  head(6, "iOS version numbers (for a human to decide on)");

  const src = readText(PBXPROJ);
  if (!src) { fail(6, `cannot read ${relative(REPO, PBXPROJ)}`); return; }

  const marketing = [...src.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1].trim());
  const build = [...src.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((m) => m[1].trim());
  const uniqM = [...new Set(marketing)];
  const uniqB = [...new Set(build)];

  always(`MARKETING_VERSION        = ${uniqM.join(", ") || "(none found)"}   (${marketing.length} build configurations)`);
  always(`CURRENT_PROJECT_VERSION  = ${uniqB.join(", ") || "(none found)"}   (${build.length} build configurations)`);

  if (!marketing.length || !build.length) { fail(6, "no version settings found in project.pbxproj"); return; }
  if (marketing.length !== 10 || build.length !== 10) {
    fail(6, `expected 10 marketing/build settings for App plus four extensions; found ${marketing.length}/${build.length}`);
  }
  if (uniqM.length > 1) fail(6, `MARKETING_VERSION disagrees across build configurations (${uniqM.join(" vs ")}). The app and its four extensions must match.`);
  if (uniqB.length > 1) fail(6, `CURRENT_PROJECT_VERSION disagrees across build configurations (${uniqB.join(" vs ")}). The app and its four extensions must match.`);
  if (uniqM.length === 1 && uniqB.length === 1) pass(`all ${marketing.length} configurations agree on ${uniqM[0]} (build ${uniqB[0]})`);

  say("");
  say("  This script does NOT decide whether to bump. It cannot see App Store Connect,");
  say("  so it cannot know whether this build number has already been uploaded. Check the");
  say("  Activity tab and bump CURRENT_PROJECT_VERSION only if this one is taken.");
}

// ── 7. partners.json through reward-config.js ────────────────────────────────
//
// partners.json is not bundled (copyweb does not copy it and sw.js exempts it
// from the cache handler on purpose), so it can change without a build. It is
// still checked here because it is the one file where a typo costs a real
// business real money: a malformed shop is silently DROPPED by the app, and the
// first symptom is a student standing at a counter with nothing on screen.
function checkPartners() {
  head(7, "partners.json parsed through reward-config.js");

  const p = join(REPO, "partners.json");
  const src = readText(p);
  if (!src) { fail(7, "partners.json is unreadable"); return; }

  let payload;
  try { payload = JSON.parse(src); } catch (e) { fail(7, "partners.json is not valid JSON: " + e.message); return; }

  let RewardConfig;
  try {
    RewardConfig = createRequire(import.meta.url)(join(REPO, "reward-config.js"));
  } catch (e) { fail(7, "could not load reward-config.js: " + e.message); return; }

  const res = RewardConfig.parse(payload);
  always(`policyState = ${res.policyState}    shops parsed = ${res.shops.length}    errors = ${res.errors.length}    warnings = ${res.warnings.length}`);

  say("");
  for (const s of res.shops) {
    // Printed verbatim on purpose. These strings are what a barista is asked to
    // honour, so the check is a human reading them, not a regex approving them.
    always(`  ${s.id || "(no id)"}`);
    always(`      name       ${s.name}`);
    always(`      address    ${s.address}`);
    always(`      perk       ${s.perk}`);
    always(`      minMinutes ${s.minMinutes}`);
    always(`      since      ${s.since || "(unset)"}`);
  }
  say("");

  for (const w of res.warnings) warn(7, "reward-config: " + w);
  for (const e of res.errors) fail(7, "reward-config: " + e);

  if (res.policyState === "ambiguous") {
    fail(7, 'policyState is "ambiguous": the config contradicts itself, and issuing against it could hand a shop a reward it never agreed to.');
  } else if (res.policyState === "undeclared") {
    // Expected today. docs/network-v1/LEDGER.md lists the policy choice as an
    // open founder decision, and reward-config.js refuses to guess it.
    note('policyState is "undeclared": no rewardPolicy block in partners.json. Expected right now. ' +
      "Reward V2 issuance must stay off until a policy is declared, which is a business decision, not a migration detail.");
  }

  // The two signed shops as of Aug 2026. A shop leaving the file is a legitimate
  // one-line edit (the pitch promises they come off the day they ask), so this
  // is a WARN that asks for confirmation, never a failure that blocks a release.
  const EXPECTED = [
    ["u-tea-collegetown", "U Tea"],
    ["dream-tea-poke-ithaca", "Dream Tea & Poké"],
  ];
  for (const [id, name] of EXPECTED) {
    if (!res.shops.some((s) => s.id === id)) {
      warn(7, `${name} (${id}) is no longer in partners.json. Intentional? Pulling a shop is a legitimate edit; confirm it was yours.`);
    }
  }
  if (!res.errors.length && res.policyState !== "ambiguous") {
    pass(`partners.json parses cleanly with 0 errors (${res.shops.length} shops)`);
  }
}

// ── run ──────────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(78));
console.log("  Mr. Tapioca " + String.fromCharCode(0x2500).repeat(2) + " next iOS build readiness");
console.log("  repo: " + REPO);
console.log("  run:  " + new Date().toISOString());
console.log("=".repeat(78));

const manifest = copywebManifest();
checkBundleSync(manifest);
checkServiceWorker();
checkRewardWiring(manifest);
checkSecrets(manifest);
checkFlag();
checkVersions();
checkPartners();

console.log("\n" + "=".repeat(78));
if (warnings.length) {
  console.log(`  ${warnings.length} warning(s) (do not block a release, do need a human eye):`);
  for (const w of warnings) console.log("    - " + w);
}
if (failures.length) {
  console.log(`\n  ${failures.length} FAILURE(S). Do not archive until these are clear:`);
  for (const f of failures) console.log("    - " + f);
  console.log("\n  Human checklist for the rest of the release: docs/network-v1/NEXT-BUILD.md");
  console.log("=".repeat(78) + "\n");
  process.exit(1);
}
console.log("\n  ALL CHECKS PASSED. Everything this script can verify is ready.");
console.log("  It cannot verify anything that needs Xcode, a device, or App Store Connect.");
console.log("  Those steps are in docs/network-v1/NEXT-BUILD.md and are the founder's own.");
console.log("=".repeat(78) + "\n");
