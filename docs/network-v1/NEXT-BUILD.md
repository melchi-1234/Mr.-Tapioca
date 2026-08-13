# Next iOS build: readiness checklist

The human half of shipping the build **after 1.1.0**. Priority 10 in
`docs/network-v1/LEDGER.md`.

**Where things stand.** 1.1.0 is in App Store review right now. The partner
reward system is deliberately the next version's feature, not 1.1.0's, so the
fact that the build in review has no partner rewards is on purpose and is not
something to fix. Nothing in this document asks you to change 1.1.0.

Half of a release is mechanical and gets checked by a script. The other half
needs Xcode, your iPhone, and your Apple ID, and only you can do it. This file
is the line between the two.

---

## Step 0. Run the checker

```bash
cd "/Users/melchiorgoldfarb/Documents/Mr. Tapioca"
node tools/check-release.mjs
```

It prints seven sections and exits `1` if anything is wrong. Run it, fix what it
names, run it again until it exits `0`. Add `--quiet` if you only want the
verdicts.

It only reads files. It never edits anything, never touches the network, and
never talks to Apple.

---

## What the checker actually checks

Each of these was proven by breaking it on purpose in a scratch copy of the repo
and confirming the checker caught it.

| # | Check | The failure it catches |
|---|-------|------------------------|
| 1 | **Staged bundle vs repo root.** Hashes every file `npm run copyweb` ships, plus the whole `assets/` tree, and compares root against `ios/App/App/public`. | Archiving an old copy of the app. Xcode builds from `ios/App/App/public`, which only updates when someone runs `copyweb` by hand. There is no error when it is skipped. The app just ships as whatever it was the last time you remembered. |
| 2 | **Service worker.** Calls `tools/check-shell.py` for the repo root, then repeats the check against the staged bundle, then compares the `CACHE` version in both. | One missing file in the `SHELL` list stops updates for every installed user, silently and app-wide. Separately: if the staged `sw.js` carries an older `mr-tapioca-vNNN` than the root, the update ships a shell users already have, so it installs and changes nothing. |
| 3 | **`reward-config.js` and `reward-v2.js` are wired in both places.** They must be in the `copyweb` script AND in the `sw.js` SHELL AND loaded by `index.html`. | Those three lists are edited by hand in three files. Dropping a file from one and not the others gives you a bundle that loads a script that is not there, or an app that breaks the moment it goes offline. |
| 4 | **Development URLs and credentials.** Scans every shipped text file in both the root and the staged bundle for tunnel hosts (ngrok and friends), localhost, loopback and LAN addresses, private key blocks, and API tokens. Also checks both `capacitor.config.json` files for a live-reload `server` block. | Shipping an app pointed at your laptop, or shipping a key that should never leave this machine. The public Supabase publishable key is recognised as expected and safe. A `service_role` key is a hard failure: it bypasses every database rule and would hand full write access to anyone who unzips the app. **The checker prints the kind of thing it found and the file and line, never the value**, so its output stays safe to paste anywhere. |
| 5 | **`window.MRTAP_FLAGS.rewardV2` is `false`** in the root `config.js` and in the staged one. | Shipping the server-backed reward on. `supabase-reward-v2.sql` has never been run against the live database, so a client with this flag up would be asking a server for rewards it has no tables to issue, in a build already on students' phones and in front of two real shops. Hard failure. |
| 6 | **`MARKETING_VERSION` and `CURRENT_PROJECT_VERSION`**, read out of `project.pbxproj` and printed. Confirms all ten build configurations agree with each other. | The app and its four extensions carrying different version numbers, which Apple rejects at upload. **The checker does not decide whether to bump.** It cannot see App Store Connect, so it does not know what has already been uploaded. That call is yours. |
| 7 | **`partners.json` parsed through `reward-config.js`.** Reports the error count and the policy state, and prints each shop's perk verbatim. | A typo in a shop entry. The app silently drops a malformed shop rather than guessing, so the first symptom is a student standing at a counter with nothing on screen. The perks are printed word for word so you can read them and confirm nothing changed. |

### What it says today

Run on 2026-08-13, exit code `1`, two failures:

```
[1/7] Staged iOS bundle vs repo root
        !!  index.html       root   51.1K   staged   50.6K
        !!  styles.css       root  197.7K   staged  191.1K
        !!  app.js           root  309.5K   staged  302.0K
        !!  config.js        root    2.4K   staged    763B
        !!  squad-cloud.js   root    5.2K   staged    4.8K
        ok  metrics.js       root    2.6K   staged    2.6K
        --  analytics.js     root   35.6K   staged missing
        --  reward-config.js root   11.9K   staged missing
        --  reward-v2.js     root   16.2K   staged missing
        !!  sw.js            root    5.7K   staged    5.1K
        ok  manifest.json    root    568B   staged    568B
        assets/  158 in root, 150 staged   (8 missing)
      FAIL  staged bundle is out of sync: 6 changed, 3 missing,
            0 assets changed, 8 assets missing

[2/7] Service worker SHELL + cache generation
      PASS  tools/check-shell.py: every precached path exists in the repo root
      PASS  staged SHELL: 55 precached paths, all present in the bundle
      FAIL  staged CACHE (mr-tapioca-v181) is 6 generation(s) BEHIND
            the root (mr-tapioca-v187).

[3/7] PASS  both reward files are on disk, in copyweb, and in the sw.js SHELL
[4/7] PASS  no development URL, tunnel host, loopback address or private key
            found in shipped code
[5/7] PASS  rewardV2 is not enabled in any bundle
[6/7] PASS  all 10 configurations agree on 1.1.0 (build 7)
[7/7] PASS  partners.json parses cleanly with 0 errors (2 shops)
```

Both failures are the same single cause: **nobody has run `copyweb` since Aug 9.**
One command fixes both, and it is step 1 below. Nothing is broken.

Expect the exact counts to drift as the repo moves. The checker reads the real
`copyweb` script instead of keeping its own copy of the file list, so a file
added to the build shows up here automatically. `analytics.js` above arrived that
way, mid-session, with no edit to the checker.

The two shops it printed, unchanged:

```
u-tea-collegetown       U Tea               10% off your drink    240 min
dream-tea-poke-ithaca   Dream Tea & Poké    5% off your drink     240 min
```

---

## What the checker cannot see

Be clear-eyed about this. Everything below is invisible to any script running on
this Mac, so none of it is covered and all of it is on you.

**Needs Xcode**
- Whether the project actually compiles, and whether the four extensions
  (ShieldConfiguration, ShieldAction, DeviceActivityMonitor, FocusWidget) build
  and get embedded.
- Code signing, provisioning profiles, and the Family Controls entitlement.
  Nothing about signing lives in this repo.
- Whether the archive contains what you think it contains.

**Needs a real iPhone**
- Whether Screen Time blocking works. This has died silently before and there is
  no API that detects it. See `SETUP_NATIVE.md`. Test against apps that have
  their own personal Screen Time limits, because tapping "Ignore Limit" on an app
  can suppress our shield for the rest of the day.
- Whether the Live Activity appears and counts down.
- Whether in-app purchases work, which needs a sandbox Apple ID.
- Whether the Boba Map finds shops, which needs real GPS.
- Whether anything looks wrong on a real screen. The simulator lies about size.

**Needs App Store Connect**
- Whether build 7 has already been uploaded. If it has, the next archive needs a
  higher `CURRENT_PROJECT_VERSION`. Apple rejects a repeat.
- Which App Privacy answers are actually on file. Nothing in this repo records
  what was submitted. `GROUNDING.md` §8 items 6 through 10 flag that the current
  answers omit Usage Data while `metrics.js` sends a per-install device id, size
  and minutes on every finished drink. That is a review-risk surface and worth
  settling before the next submission.
- Review status, rejections, and anything Apple says back.

**Also not covered**
- Anything about the live database. `supabase-reward-v2.sql` has never been
  executed. It is syntax-checked with a real Postgres parser, not run.
- Whether `mrtapioca.me` is serving the `partners.json` you think it is. The
  checker reads the local file only.

---

## The ordered steps, the ones you do yourself

**Claude does not do the Apple ID steps.** Not Archive, not Upload, not App Store
Connect, not the privacy questionnaire, not Submit. Those are your account and
your signature on what the app does. Claude can prepare the tree and tell you
exactly what it found, which is steps 1 and 2.

### 1. Sync the web bundle into the native project

```bash
cd "/Users/melchiorgoldfarb/Documents/Mr. Tapioca"
npm run copyweb && npx cap copy ios && node tools/register-ios-plugins.mjs
```

The third command is not optional. Capacitor 6 wipes the plugin registration
list on every sync, so without it `FocusShield` never registers and app blocking
is simply gone with no error.

### 2. Run the checker until it exits 0

```bash
node tools/check-release.mjs
```

If it still fails, read the FAIL lines. Each one names the fix.

### 3. Decide the version numbers

Open `ios/App/App.xcodeproj/project.pbxproj` in Xcode (the General tab of the App
target, not the raw file). The checker printed what is there now.

- If that build number was already uploaded, raise `CURRENT_PROJECT_VERSION` by
  one. Apple will not accept the same number twice.
- Raise `MARKETING_VERSION` only if this is a user-visible new version.
- Whatever you change, it has to change for the app **and all four extensions**.
  Re-run the checker afterwards; check 6 catches a mismatch.

### 4. Open the project and build

```bash
npx cap open ios
```

Pick a real device as the destination, then Product > Build. Fix any compile
error before archiving.

### 5. Test on your own iPhone before archiving

Run it on your phone, not the simulator, and confirm by hand:

- Start a focus session and confirm the blocked apps are actually shielded.
- Lock the phone, wait, come back, and confirm the timer is still right.
- Open the Boba Map and confirm U Tea and Dream Tea & Poké appear with the perks
  printed above, word for word.
- Finish a session and confirm the drink lands on the shelf.

### 6. Archive

Xcode > Product > Archive, with "Any iOS Device" as the destination. This is your
Apple ID from here on.

### 7. Upload

In the Organizer window that opens: Distribute App > App Store Connect > Upload.

### 8. App Store Connect

- Wait for the build to finish processing. It takes a few minutes to an hour.
- Attach the build to the version.
- Review the App Privacy answers before submitting. See the note above about
  Usage Data.
- Submit for review.

### 9. Write down what you shipped

Update the "Current status" section at the bottom of `CLAUDE.md` with the version
and build you uploaded and the date. That block is how the next session knows
what is live, and it has been wrong before.

---

## One thing to keep straight

**Adding or removing a partner shop never needs any of this.** Edit
`partners.json`, push, and mrtapioca.me redeploys in about a minute. Every client
that has the partner code picks it up the next time the Boba Map is opened.

The catch is which clients have that code. Per `CLAUDE.md`, the builds archived
before the partner system ignore `partners.json` entirely. Check
`CURRENT_PROJECT_VERSION` against the build that has partners before telling
anyone a new shop is live on their phone.

## Reward V2 stays off

`window.MRTAP_FLAGS.rewardV2` is `false` and stays `false` through this build.
The three preconditions are written next to the flag in `config.js`, and none of
them are met yet:

1. `supabase-reward-v2.sql` has never been run.
2. `partners.json` declares no reward policy, so `reward-config.js` reports
   `undeclared` and refuses to issue rather than guess. Choosing between one
   shared bar and per-shop bars is a business decision and it is yours to make.
   Both live shops sit at 240 minutes today, so the two models behave identically
   right now. It only starts to matter when a third shop signs at a different
   number.
3. The live shops' offers have not been mirrored into the server.

Check 5 fails the build if that flag is ever `true`, which is deliberate.
