// Mr. Tapioca Focus — background service worker (Manifest V3).
// Blocks distracting sites during a focus session by redirecting them to a cozy
// "stay focused" page, then unblocks and pings you when your drink is ready.

const DEFAULT_SITES = [
  "youtube.com", "instagram.com", "tiktok.com", "twitter.com", "x.com",
  "reddit.com", "facebook.com", "netflix.com", "twitch.tv", "snapchat.com"
];

const RULE_OFFSET = 1000; // dynamic rule ids live above this so we can clear ours cleanly

// A declarativeNetRequest urlFilter must be ASCII. One bad entry rejects the WHOLE
// batch of rules (nothing gets blocked, silently), so every entry is sanitized down
// to a plausible ASCII hostname and anything else is skipped.
const HOST_RE = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

function cleanSite(raw) {
  let s = String(raw || "").trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  if (!s) return "";
  let host;
  try { host = new URL("https://" + s).hostname; } // drops path/query/port, punycodes IDN
  catch (_) { return ""; }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  return HOST_RE.test(host) ? host : "";
}

async function getSites() {
  const { sites } = await chrome.storage.local.get("sites");
  // A saved list is respected even when empty (blocks nothing); only a
  // never-configured install falls back to the defaults.
  return Array.isArray(sites) ? sites : DEFAULT_SITES;
}

async function getCleanSites() {
  const hosts = [];
  for (const s of await getSites()) {
    const host = cleanSite(s);
    if (host && !hosts.includes(host)) hosts.push(host);
  }
  return hosts;
}

function rulesFor(hosts) {
  return hosts.map((domain, i) => ({
    id: RULE_OFFSET + i,
    priority: 1,
    action: { type: "redirect", redirect: { extensionPath: "/blocked.html?from=" + encodeURIComponent(domain) } },
    condition: { urlFilter: "||" + domain + "^", resourceTypes: ["main_frame"] }
  }));
}

async function clearRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const ids = existing.map(r => r.id).filter(id => id >= RULE_OFFSET);
  if (ids.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
}

async function applyRules() {
  const hosts = await getCleanSites();
  await clearRules();
  if (!hosts.length) return;
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rulesFor(hosts) });
  } catch (err) {
    // Never fail silently: log it, tell the user, and let callers know.
    console.error("Mr. Tapioca Focus: could not apply blocking rules", err);
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: "Blocking hit a snag",
      message: "Mr. Tapioca could not lock your sites. Open the popup and check your blocked list.",
      priority: 2
    });
    throw err;
  }
}

// declarativeNetRequest only catches NEW navigations, so tabs already sitting on a
// blocked site get walked over to the blocked page when a session starts.
async function redirectOpenTabs(hosts) {
  if (!hosts.length) return;
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    try {
      const tabHost = new URL(tab.url).hostname.toLowerCase();
      const match = hosts.find(h => tabHost === h || tabHost.endsWith("." + h));
      if (match) {
        await chrome.tabs.update(tab.id, {
          url: chrome.runtime.getURL("blocked.html?from=" + encodeURIComponent(match))
        });
      }
    } catch (_) { /* tab may have closed mid-loop; skip it */ }
  }
}

async function startSession(minutes) {
  const endsAt = Date.now() + minutes * 60 * 1000;
  await applyRules(); // throws if blocking fails, so we never show a session that blocks nothing
  await chrome.storage.local.set({ active: true, endsAt, plannedMinutes: minutes });
  await chrome.alarms.create("focus-end", { when: endsAt });
  await chrome.alarms.create("tick", { periodInMinutes: 1 });
  setBadge(minutes);
  await redirectOpenTabs(await getCleanSites());
}

async function stopSession(finished) {
  await chrome.storage.local.set({ active: false, endsAt: 0 });
  await clearRules();
  await chrome.alarms.clear("focus-end");
  await chrome.alarms.clear("tick");
  chrome.action.setBadgeText({ text: "" });
  if (finished) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: "Your drink is ready 🧋",
      message: "Nice focus session. Your sites are unlocked again.",
      priority: 2
    });
  }
}

function setBadge(minutesLeft) {
  chrome.action.setBadgeBackgroundColor({ color: "#3c2018" });
  chrome.action.setBadgeText({ text: minutesLeft > 0 ? String(minutesLeft) + "m" : "" });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "focus-end") stopSession(true);
});

// Keep the toolbar badge roughly in sync with time left, even without the popup open.
// (The "tick" alarm only exists while a session is running; see startSession/stopSession.)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "tick") return;
  const { active, endsAt } = await chrome.storage.local.get(["active", "endsAt"]);
  if (!active || !endsAt) return;
  const mins = Math.max(0, Math.ceil((endsAt - Date.now()) / 60000));
  setBadge(mins);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "start") {
      try { await startSession(msg.minutes); sendResponse({ ok: true }); }
      catch (err) { sendResponse({ ok: false, error: String((err && err.message) || err) }); }
    }
    else if (msg.type === "stop") { await stopSession(false); sendResponse({ ok: true }); }
    else if (msg.type === "state") {
      const s = await chrome.storage.local.get(["active", "endsAt", "plannedMinutes"]);
      const sites = await getSites();
      sendResponse({ ...s, sites });
    }
    else if (msg.type === "setSites") {
      await chrome.storage.local.set({ sites: Array.isArray(msg.sites) ? msg.sites : [] });
      try {
        const { active } = await chrome.storage.local.get("active");
        if (active) await applyRules();
        sendResponse({ ok: true });
      } catch (err) { sendResponse({ ok: false, error: String((err && err.message) || err) }); }
    }
  })();
  return true; // async response
});

// Reconcile after any worker (re)start. Dynamic rules survive an extension reload or
// update but alarms do NOT, and onStartup only fires on browser launch. Without
// onInstalled here, a reload mid-session would leave sites blocked forever.
async function reconcile() {
  const { active, endsAt } = await chrome.storage.local.get(["active", "endsAt"]);
  if (active && endsAt && endsAt > Date.now()) {
    try { await applyRules(); } catch (_) { /* already logged + notified in applyRules */ }
    await chrome.alarms.create("focus-end", { when: endsAt });
    await chrome.alarms.create("tick", { periodInMinutes: 1 });
    setBadge(Math.max(0, Math.ceil((endsAt - Date.now()) / 60000)));
  } else {
    await stopSession(false);
  }
}

chrome.runtime.onStartup.addListener(reconcile);
chrome.runtime.onInstalled.addListener(reconcile);
