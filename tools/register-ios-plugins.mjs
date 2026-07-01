// Re-registers the in-app native plugins after `npx cap sync`.
//
// Capacitor 6 only instantiates iOS plugin classes listed in
// ios/App/App/capacitor.config.json -> "packageClassList". `cap sync` regenerates
// that file and leaves the list EMPTY for plugins that live inside the app (not
// npm packages) — a known Capacitor 6 bug — so our FocusShield Screen Time plugin
// never registers and window.Capacitor.Plugins.FocusShield is undefined.
//
// This script re-adds our local plugin class(es) to the list after every sync.
import { readFileSync, writeFileSync, existsSync } from "fs";

const CONFIG = "ios/App/App/capacitor.config.json";
const LOCAL_PLUGIN_CLASSES = ["FocusShieldPlugin", "FocusActivityPlugin"];

if (!existsSync(CONFIG)) {
  console.log("[register-ios-plugins] no iOS project yet — skipping");
  process.exit(0);
}

const cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
const list = new Set(cfg.packageClassList || []);
let added = 0;
for (const cls of LOCAL_PLUGIN_CLASSES) {
  if (!list.has(cls)) { list.add(cls); added++; }
}
cfg.packageClassList = [...list];
writeFileSync(CONFIG, JSON.stringify(cfg, null, "\t") + "\n");
console.log(`[register-ios-plugins] packageClassList = ${JSON.stringify(cfg.packageClassList)} (${added} added)`);
