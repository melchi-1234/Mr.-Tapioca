import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// App Store Connect API key authentication, so `-allowProvisioningUpdates` can
// create and download certificates and provisioning profiles WITHOUT a signed-in
// Xcode account. This is what makes the whole release headless.
//
// It lives in its own module because BOTH the archive and the export need it, and
// for a long time only the export had it. That was invisible while every target's
// entitlements were already covered by the cached wildcard team profile: nothing
// new had to be issued, so `-allowProvisioningUpdates` never actually had to talk
// to Apple. The moment 1.2.0 gave the FocusWidget extension an App Group, the
// archive needed a profile that did not exist yet and failed with
//
//     error: No Accounts: Add a new account in Accounts settings.
//     error: Provisioning profile "iOS Team Provisioning Profile: *" doesn't
//            include the App Groups capability.
//
// which reads like a Xcode-setup problem and is really a missing flag.
//
// Returns [] when the key is not set up, which leaves the account-based path
// exactly as it was.
export function ascAuthArgs(homedir = os.homedir()) {
  const cfgPath = path.join(homedir, ".appstoreconnect", "config.json");
  if (!existsSync(cfgPath)) return [];
  let cfg;
  try { cfg = JSON.parse(readFileSync(cfgPath, "utf8")); }
  catch (_) { return []; }
  const raw = String(cfg.key_path || "");
  const keyPath = raw.startsWith("~")
    ? path.join(homedir, raw.slice(1).replace(/^\/+/, ""))
    : raw;
  if (!cfg.key_id || !cfg.issuer_id || !keyPath || !existsSync(keyPath)) return [];
  return [
    "-authenticationKeyID", String(cfg.key_id),
    "-authenticationKeyIssuerID", String(cfg.issuer_id),
    "-authenticationKeyPath", keyPath,
  ];
}
