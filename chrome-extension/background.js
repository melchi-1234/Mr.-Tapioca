// Mr. Tapioca Focus — background service worker (Manifest V3).
// Blocks distracting sites during a focus session by redirecting them to a cozy
// "stay focused" page, then unblocks and pings you when your drink is ready.

const DEFAULT_SITES = [
  "youtube.com", "instagram.com", "tiktok.com", "twitter.com", "x.com",
  "reddit.com", "facebook.com", "netflix.com", "twitch.tv", "snapchat.com"
];

const RULE_OFFSET = 1000; // dynamic rule ids live above this so we can clear ours cleanly

async function getSites() {
  const { sites } = await chrome.storage.local.get("sites");
  return Array.isArray(sites) && sites.length ? sites : DEFAULT_SITES;
}

function rulesFor(sites) {
  return sites.map((domain, i) => ({
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
  const sites = await getSites();
  await clearRules();
  await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rulesFor(sites) });
}

async function startSession(minutes) {
  const endsAt = Date.now() + minutes * 60 * 1000;
  await chrome.storage.local.set({ active: true, endsAt, plannedMinutes: minutes });
  await applyRules();
  await chrome.alarms.create("focus-end", { when: endsAt });
  setBadge(minutes);
}

async function stopSession(finished) {
  await chrome.storage.local.set({ active: false, endsAt: 0 });
  await clearRules();
  await chrome.alarms.clear("focus-end");
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
chrome.alarms.create("tick", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "tick") return;
  const { active, endsAt } = await chrome.storage.local.get(["active", "endsAt"]);
  if (!active || !endsAt) return;
  const mins = Math.max(0, Math.ceil((endsAt - Date.now()) / 60000));
  setBadge(mins);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "start") { await startSession(msg.minutes); sendResponse({ ok: true }); }
    else if (msg.type === "stop") { await stopSession(false); sendResponse({ ok: true }); }
    else if (msg.type === "state") {
      const s = await chrome.storage.local.get(["active", "endsAt", "plannedMinutes"]);
      const sites = await getSites();
      sendResponse({ ...s, sites });
    }
    else if (msg.type === "setSites") { await chrome.storage.local.set({ sites: msg.sites }); if (msg.sites) { const { active } = await chrome.storage.local.get("active"); if (active) await applyRules(); } sendResponse({ ok: true }); }
  })();
  return true; // async response
});

// Safety: if the worker restarts while a session is somehow inconsistent, reconcile.
chrome.runtime.onStartup.addListener(async () => {
  const { active, endsAt } = await chrome.storage.local.get(["active", "endsAt"]);
  if (active && endsAt && endsAt > Date.now()) await applyRules();
  else await stopSession(false);
});
