// On the web (mrtapioca.me) index.html is the marketing landing page and the
// actual app lives at app.html. But the native app (Capacitor) loads index.html
// as its WKWebView entry, so the shipped bundle is built with app.html copied in
// AS index.html. copy-web.mjs does that rename; check-release.mjs compares the
// bundled index.html against the repo's app.html (the real source of the app),
// not against the landing index.html.
export const PUBLIC_ENTRY = Object.freeze({ source: "app.html", dest: "index.html" });

export const PUBLIC_ROOT_FILES = Object.freeze([
  "styles.css", "app.js", "config.js", "squad-cloud.js",
  "metrics.js", "analytics.js", "notifications.js", "reward-config.js",
  "reward-v2.js", "sw.js", "manifest.json",
]);

export const PUBLIC_ASSET_DIRECTORY = "assets";
