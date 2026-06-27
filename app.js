const MODES = {
  tasting: { label: "Tasting Cup", duration: 5 * 60 },        // quick single sitting
  small:   { label: "Small Drink", duration: 2 * 60 * 60 },   // ~2 hr, fillable in segments
  large:   { label: "Large Drink", duration: 6 * 60 * 60 },   // ~6 hr, fillable in segments
  custom:  { label: "Custom Cup",  duration: null }           // uses state.customDuration
};

const CUSTOM_MIN = 5 * 60;
const CUSTOM_MAX = 120 * 60;
const CUSTOM_STEP = 5 * 60;
const DEV_MIN = 5;            // dev mode lets Custom drop to 5 seconds for quick testing

function fmtDuration(seconds) {
  return seconds < 60 ? `${seconds} sec` : `${Math.round(seconds / 60)} min`;
}

// Resolve the active session length in seconds (custom mode reads its own value)
function modeDuration() {
  return state.mode === "custom" ? state.customDuration : MODES[state.mode].duration;
}

// Tea bases: classic is free; the rest are one-time pearl unlocks (price).
const BASES = {
  classic:    { label: "Classic Milk Tea",     color: "#c98555", price: 0 },
  brownsugar: { label: "Brown Sugar Milk Tea", color: "#8b4513", price: 12 },
  taro:       { label: "Taro Milk Tea",         color: "#b58bdc", price: 12 },
  matcha:     { label: "Matcha Latte",          color: "#76a86a", price: 12 },
  strawberry: { label: "Strawberry Milk Tea",   color: "#f07c93", price: 14 },
  earlgrey:   { label: "Earl Grey Milk Tea",    color: "#b08d63", price: 14 },
  thai:       { label: "Thai Tea",              color: "#e08a3c", price: 16 },
  ube:        { label: "Ube Milk Tea",          color: "#6b3d9a", price: 16 },
  lavender:   { label: "Lavender Milk Tea",     color: "#c4b5e8", price: 18 },
  honeydew:   { label: "Honeydew Milk Tea",     color: "#b6d67e", price: 18 }
};

// Toppings: pearls are free (the signature); others are one-time pearl unlocks.
const TOPPINGS = {
  pearls:  { label: "Tapioca Pearls", price: 0 },
  jelly:   { label: "Lychee Jelly",   price: 10 },
  pudding: { label: "Egg Pudding",    price: 10 },
  foam:    { label: "Cheese Foam",    price: 12 },
  coconut: { label: "Coconut Jelly",  price: 10 }
};

const DEFAULTS = {
  base: "classic", topping: "pearls", sticker: "Focus",
  skin: "", shopTheme: "cozy"
};

// The shop sells character skins + backgrounds only. Tea base & toppings are
// free personalization in the Customize sheet (not purchasable); cup stickers
// were cut. (Earlier those lived here as paid items and became orphaned.)
const SHOP_ITEMS = [
  // Default skin
  { id: "skin-default",    name: "Mr. Tapioca",    desc: "The original",          category: "Character Skin", type: "skin", value: "",           price: 0,  img: "assets/Mr. Tapioca.png"      },

  // common skins
  { id: "skin-grad-cap",   name: "Graduation Cap", desc: "Scholar energy",        category: "Character Skin", type: "skin", value: "grad-cap",   price: 45, img: "assets/Graduation Cap.png"   },
  { id: "skin-flower",     name: "Flower Crown",   desc: "In full bloom",         category: "Character Skin", type: "skin", value: "flower",     price: 45, img: "assets/Flower Crown.png"     },
  { id: "skin-scarf",      name: "Scarf",          desc: "Cozy and warm",         category: "Character Skin", type: "skin", value: "scarf",      price: 45, img: "assets/Scarf.png"            },
  { id: "skin-shades",     name: "Sunglasses",     desc: "Too cool for school",   category: "Character Skin", type: "skin", value: "shades",     price: 45, img: "assets/Sunglasses.png"       },

  // rare skins
  { id: "skin-strawberry", name: "Strawberry",     desc: "Sweet and cute",        category: "Character Skin", type: "skin", value: "strawberry", price: 85, img: "assets/Strawberry.png"       },
  { id: "skin-astro-blue", name: "Astronaut",      desc: "Space mode on",         category: "Character Skin", type: "skin", value: "astro-blue", price: 85, img: "assets/Astronaut, blue.png"  },
  { id: "skin-dragon",     name: "Dragon",         desc: "Breathe fire, focus",   category: "Character Skin", type: "skin", value: "dragon",     price: 85, img: "assets/Dragon.png"           },

  // Premium skins (future IAP)
  { id: "skin-ninja",      name: "Ninja",          desc: "Silent focus mode",     category: "Character Skin", type: "skin", value: "ninja",      premium: true, img: "assets/Ninja.png"            },
  { id: "skin-wizard",     name: "Wizard",         desc: "Cast your focus spell", category: "Character Skin", type: "skin", value: "wizard",     premium: true, img: "assets/Wizard.png"           },
  { id: "skin-angel",      name: "Angel",          desc: "Wings and a halo",      category: "Character Skin", type: "skin", value: "angel",      premium: true, img: "assets/Angel.png"            },
  { id: "skin-devil",      name: "Devil",          desc: "Horns and mischief",    category: "Character Skin", type: "skin", value: "devil",      premium: true, img: "assets/Devil.png"            },

  { id: "theme-cozy",      name: "Cozy",                 desc: "The classic warm shop",               category: "Backgrounds", type: "shopTheme", value: "cozy",       price: 0,   color: "#f3d8b7" },
  { id: "theme-night",     name: "Night Market",         desc: "Dark, warm lights, cozy late-night",  category: "Backgrounds", type: "shopTheme", value: "night",      price: 130, color: "#36476b" },
  { id: "theme-sakura",    name: "Sakura",               desc: "Cherry blossoms, soft pink, spring",  category: "Backgrounds", type: "shopTheme", value: "sakura",     price: 130, color: "#ffdfe8" },
  { id: "theme-autumn",    name: "Autumn Harvest",       desc: "Pumpkin spice, warm oranges, fall",   category: "Backgrounds", type: "shopTheme", value: "autumn",     price: 130, color: "#c4873a" },
  { id: "theme-rainy",     name: "Rainy Day Café",       desc: "Cool grey-blue, lo-fi, window rain",  category: "Backgrounds", type: "shopTheme", value: "rainy",      price: 130, color: "#7a9ab8" },
];

const UNLOCKS = [
  { minutes: 25, label: "Tapioca pearls" },
  { minutes: 50, label: "Lychee jelly" },
  { minutes: 90, label: "Egg pudding" },
  { minutes: 180, label: "Brown sugar syrup" },
  { minutes: 360, label: "Cheese foam" }
];

const PEARL_SIZE = 20;
const GAME_CUP_W = 72;
const GAME_CUP_H = 88;

// Break games are a small once-per-day bonus, not a pearl farm (see CATCH_CAP,
// gameDoneToday). Rewards are intentionally modest vs. honest focus earning.
const SLOT_REWARDS = [5, 3, 1, 1, 1, 3, 5];   // edges rare & rewarding, center likely & small
const PLINKO_MAX_PLAYS = 3;
const PLINKO_ROWS = 6;
const CATCH_CAP = 10;   // max pearls a single Catch session can bank

const plinko = {
  playsLeft: PLINKO_MAX_PLAYS,
  dropping: false,
  animId: null
};

const PONG_MAX_PLAYS = 4;
const PONG_R = 12;
const PONG_GRAV = 1150;
const PONG_POWER = 9;      // swipe distance → launch velocity
const PONG_MAXV = 2500;    // velocity cap
const PONG_REWARD = 2;     // pearls per successful toss
const pong = {
  active: false,
  throwsLeft: PONG_MAX_PLAYS,
  score: 0,
  phase: "aim",           // "aim" | "fly" | "wait" | "done"
  pearl: null,            // {x, y, vx, vy, prevY}
  dragStart: null,        // where the flick began
  drag: null,             // current pointer while flicking
  cupX: 0,
  cupDir: 1,
  animId: null,
  lastTs: null
};

const game = {
  active: false,
  score: 0,
  timeLeft: 45,
  elapsed: 0,
  lastTime: null,
  spawnTimer: 0,
  pearls: [],
  cupX: 0,
  cupSpeed: 360,
  animId: null,
  keysLeft: false,
  keysRight: false,
  touchStartX: 0,
  touchStartCupX: 0
};

const state = {
  mode: "small",
  customDuration: 30 * 60,
  base: "classic",
  topping: "pearls",
  unlockedBases: ["classic"],
  unlockedToppings: ["pearls"],
  sticker: "Focus",
  skin: "",
  shopTheme: "cozy",
  soundOn: true,
  musicOn: true,
  musicVolume: 0.8,
  sfxVolume: 0.9,
  ambVolume: 0.5,
  gameDays: {},          // { catch|plinko|pong: "YYYY-MM-DD" } last-played day
  devMode: false,
  running: false,
  elapsed: 0,
  lastTick: null,
  timerId: null,
  collection: [],
  rewards: [],
  owned: [],
  spent: 0,
  phase: "focus",
  breakDuration: 600,
  breakElapsed: 0,
  breakTimerId: null,
  breakLastTick: null,
  breakMakerCycleId: null,
  spillPending: false,
  bonusPearls: 0
};

const els = {
  shopScene:            document.querySelector("#shopScene"),
  focusCup:             document.querySelector("#focusCup"),
  liquid:               document.querySelector("#liquid"),
  focusSticker:         document.querySelector("#focusSticker"),
  focusMakerCharacter:  document.querySelector("#focusMakerCharacter"),
  makerWrap:            document.querySelector("#makerWrap"),
  makerSpeech:          document.querySelector("#makerSpeech"),
  progressBar:          document.querySelector("#progressBar"),
  sessionLabel:         document.querySelector("#sessionLabel"),
  progressLabel:        document.querySelector("#progressLabel"),
  timerText:            document.querySelector("#timerText"),
  startPauseBtn:        document.querySelector("#startPauseBtn"),
  resetBtn:             document.querySelector("#resetBtn"),
  drinkName:            document.querySelector("#drinkName"),
  baseGrid:             document.querySelector("#baseGrid"),
  toppingRow:           document.querySelector("#toppingRow"),
  focusControls:        document.querySelector("#focusControls"),
  shelfGrid:            document.querySelector("#shelfGrid"),
  totalTime:            document.querySelector("#totalTime"),
  pearlCount:           document.querySelector("#pearlCount"),
  completedCount:       document.querySelector("#completedCount"),
  rewardList:           document.querySelector("#rewardList"),
  rewardDialog:         document.querySelector("#rewardDialog"),
  rewardTitle:          document.querySelector("#rewardTitle"),
  rewardCopy:           document.querySelector("#rewardCopy"),
  rewardPearls:         document.querySelector("#rewardPearls"),
  rewardDrink:          document.querySelector("#rewardDrink"),
  partnerReward:        document.querySelector("#partnerReward"),
  premiumDialog:        document.querySelector("#premiumDialog"),
  premiumTitle:         document.querySelector("#premiumTitle"),
  premiumCopy:          document.querySelector("#premiumCopy"),
  saveRewardBtn:        document.querySelector("#saveRewardBtn"),
  previewRestrictionBtn:document.querySelector("#previewRestrictionBtn"),
  chooseAppsBtn:        document.querySelector("#chooseAppsBtn"),
  restrictionPreview:   document.querySelector("#restrictionPreview"),
  breakOffer:           document.querySelector("#breakOffer"),
  breakRunningPanel:    document.querySelector("#breakRunningPanel"),
  breakDurationDisplay: document.querySelector("#breakDurationDisplay"),
  breakTimerText:       document.querySelector("#breakTimerText"),
  breakProgressBar:     document.querySelector("#breakProgressBar"),
  breakProgressLabel:   document.querySelector("#breakProgressLabel"),
  startBreakBtn:        document.querySelector("#startBreakBtn"),
  skipBreakBtn:         document.querySelector("#skipBreakBtn"),
  skipBreakRunningBtn:  document.querySelector("#skipBreakRunningBtn"),
  breakMinus:           document.querySelector("#breakMinus"),
  breakPlus:            document.querySelector("#breakPlus"),
  pearlGame:            document.querySelector("#pearlGame"),
  gameArea:             document.querySelector("#gameArea"),
  gameCup:              document.querySelector("#gameCup"),
  gameScore:            document.querySelector("#gameScore"),
  gameTimer:            document.querySelector("#gameTimer"),
  gameResult:           document.querySelector("#gameResult"),
  gameResultText:       document.querySelector("#gameResultText"),
  playGameBtn:          document.querySelector("#playGameBtn"),
  quitGameBtn:          document.querySelector("#quitGameBtn"),
  gameCloseBtn:         document.querySelector("#gameCloseBtn"),
  playPlinkoBtn:        document.querySelector("#playPlinkoBtn"),
  plinkoGame:           document.querySelector("#plinkoGame"),
  plinkoCanvas:         document.querySelector("#plinkoCanvas"),
  plinkoPlaysLeft:      document.querySelector("#plinkoPlaysLeft"),
  quitPlinkoBtn:        document.querySelector("#quitPlinkoBtn"),
  plinkoDropBtn:        document.querySelector("#plinkoDropBtn"),
  plinkoResult:         document.querySelector("#plinkoResult"),
  plinkoResultEyebrow:  document.querySelector("#plinkoResultEyebrow"),
  plinkoResultText:     document.querySelector("#plinkoResultText"),
  plinkoAgainBtn:       document.querySelector("#plinkoAgainBtn"),
  plinkoDoneBtn:        document.querySelector("#plinkoDoneBtn"),
  playPongBtn:          document.querySelector("#playPongBtn"),
  pongGame:             document.querySelector("#pongGame"),
  pongCanvas:           document.querySelector("#pongCanvas"),
  pongScore:            document.querySelector("#pongScore"),
  pongThrows:           document.querySelector("#pongThrows"),
  quitPongBtn:          document.querySelector("#quitPongBtn"),
  pongHint:             document.querySelector("#pongHint"),
  pongResult:           document.querySelector("#pongResult"),
  pongResultEyebrow:    document.querySelector("#pongResultEyebrow"),
  pongResultText:       document.querySelector("#pongResultText"),
  pongCloseBtn:         document.querySelector("#pongCloseBtn"),
  shopBtn:              document.querySelector("#shopBtn"),
  customizeBtn:         document.querySelector("#customizeBtn"),
  settingsBtn:          document.querySelector("#settingsBtn"),
  shopSheet:            document.querySelector("#shopSheet"),
  shopClose:            document.querySelector("#shopClose"),
  shopGrid:             document.querySelector("#shopGrid"),
  shopPearlCount:       document.querySelector("#shopPearlCount"),
  customizePearlCount:  document.querySelector("#customizePearlCount"),
  customizeSheet:       document.querySelector("#customizeSheet"),
  customizeClose:       document.querySelector("#customizeClose"),
  settingsSheet:        document.querySelector("#settingsSheet"),
  settingsClose:        document.querySelector("#settingsClose"),
  mapBtn:               document.querySelector("#mapBtn"),
  mapClose:             document.querySelector("#mapClose"),
  mapPerkBanner:        document.querySelector("#mapPerkBanner"),
  sheetBackdrop:        document.querySelector("#sheetBackdrop"),
  onboarding:           document.querySelector("#onboarding"),
  onboardImg:           document.querySelector("#onboardImg"),
  onboardEmoji:         document.querySelector("#onboardEmoji"),
  onboardTitle:         document.querySelector("#onboardTitle"),
  onboardBody:          document.querySelector("#onboardBody"),
  onboardDots:          document.querySelector("#onboardDots"),
  onboardBack:          document.querySelector("#onboardBack"),
  onboardNext:          document.querySelector("#onboardNext"),
  onboardSkip:          document.querySelector("#onboardSkip"),
  replayIntroBtn:       document.querySelector("#replayIntroBtn"),
  clearProgressBtn:     document.querySelector("#clearProgressBtn"),
  customStepper:        document.querySelector("#customStepper"),
  customDurationDisplay:document.querySelector("#customDurationDisplay"),
  customMinus:          document.querySelector("#customMinus"),
  customPlus:           document.querySelector("#customPlus"),
  musicVol:             document.querySelector("#musicVol"),
  musicVolLabel:        document.querySelector("#musicVolLabel"),
  sfxVol:               document.querySelector("#sfxVol"),
  sfxVolLabel:          document.querySelector("#sfxVolLabel"),
  ambVol:               document.querySelector("#ambVol"),
  ambVolLabel:          document.querySelector("#ambVolLabel"),
  installBanner:        document.querySelector("#installBanner"),
  installText:          document.querySelector("#installText"),
  installBtn:           document.querySelector("#installBtn"),
  installDismiss:       document.querySelector("#installDismiss"),
  devToggle:            document.querySelector("#devToggle"),
  statStreak:           document.querySelector("#statStreak"),
  statTotalTime:        document.querySelector("#statTotalTime"),
  statToday:            document.querySelector("#statToday"),
  statWeek:             document.querySelector("#statWeek"),
  statBest:             document.querySelector("#statBest"),
  badgeGrid:            document.querySelector("#badgeGrid"),
  badgeCount:           document.querySelector("#badgeCount"),
  weekChart:            document.querySelector("#weekChart"),
  weekTotal:            document.querySelector("#weekTotal"),
  dailyGoal:            document.querySelector("#dailyGoal"),
  dgFill:               document.querySelector("#dgFill"),
  dgLabel:              document.querySelector("#dgLabel"),
  goalMinus:            document.querySelector("#goalMinus"),
  goalPlus:             document.querySelector("#goalPlus"),
  goalDisplay:          document.querySelector("#goalDisplay"),
  toast:                document.querySelector("#toast")
};

// ── Character animation ──────────────────────────────────────────────────────

const SKIN_IMAGES = {
  "grad-cap":   "assets/Graduation Cap.png",
  "flower":     "assets/Flower Crown.png",
  "scarf":      "assets/Scarf.png",
  "shades":     "assets/Sunglasses.png",
  "angel":      "assets/Angel.png",
  "devil":      "assets/Devil.png",
  "dragon":     "assets/Dragon.png",
  "astro-blue": "assets/Astronaut, blue.png",
  "ninja":      "assets/Ninja.png",
  "strawberry": "assets/Strawberry.png",
  "wizard":     "assets/Wizard.png"
};

// Per-skin pose sets — each generated as a single 2x2 sprite sheet (one render,
// so the 4 poses share the exact same color) from that skin + the base
// Mr. Tapioca as references, then sliced (see tools/slice-sheet.py). Keyed by
// skin value → { mixing, sleeping, drinking }; any missing state falls back to
// the skin's single portrait above.
const SKIN_POSES = {};   // reverted: skins use their original portrait + code motion (no drift)

// Every state uses a single high-res still image; bounce/stir/sleep motion
// is driven by CSS keyframes that key off the img's data-state attribute.
// (Earlier we cycled cropped frames here; one of the idle crops was mid-blink,
// which made the eye look like it disappeared.)
// Every state uses the REAL original portrait; the CSS keyframes supply the
// motion (bob / lean / wiggle / hop). This is uniform for the base AND all skins
// (see SKIN_POSES = {} below) and never drifts off-model. Drawn pose PNGs are
// parked in assets/poses/ if we ever wire faithful ones in.
const MAKER_STATIC = {
  idle:     "assets/Mr. Tapioca.png",
  mixing:   "assets/Mr. Tapioca.png",
  sleeping: "assets/Mr. Tapioca.png",
  drinking: "assets/Mr. Tapioca.png",
  shocked:  "assets/Mr. Tapioca.png"
};

let currentMakerState = "";

function setMakerState(stateName) {
  if (stateName === currentMakerState) return;
  currentMakerState = stateName;

  const img = els.focusMakerCharacter;
  img.dataset.state = stateName;

  // The CSS keyframes (keyed off data-state) animate whatever image is shown,
  // so motion works for every skin. An equipped skin is a single portrait, so
  // it keeps that portrait across ALL states and relies on the motion; only the
  // base character has dedicated pose art (mixing arms, sleeping eyes, etc.).
  if (state.skin && SKIN_IMAGES[state.skin]) {
    const poses = SKIN_POSES[state.skin];
    img.src = (poses && poses[stateName]) ? poses[stateName] : SKIN_IMAGES[state.skin];
    return;
  }

  img.src = MAKER_STATIC[stateName] || "assets/Mr. Tapioca.png";
}

// Play a one-shot reaction class on the maker (pop / celebrate) without
// disturbing its looping idle/mixing animation.
function pulseMaker(cls, ms) {
  const img = els.focusMakerCharacter;
  img.classList.remove(cls);
  void img.offsetWidth;        // force reflow so the animation restarts
  img.classList.add(cls);
  setTimeout(() => img.classList.remove(cls), ms);
}

// Happy hop + a burst of treats over the scene
function celebrate() {
  els.shopScene.classList.add("celebrating");
  pulseMaker("celebrate", 1200);
  setTimeout(() => els.shopScene.classList.remove("celebrating"), 1500);
}

// Idle "fidgets": every so often while he's calmly standing around, he does a
// little look-around wiggle so he feels alive even when you're not touching him.
let fidgetTimer = null;
function scheduleFidget() {
  clearTimeout(fidgetTimer);
  fidgetTimer = setTimeout(() => {
    if (!document.hidden && !prefersReducedMotion() &&
        currentMakerState === "idle" && !state.running) {
      pulseMaker("wiggle", 820);
    }
    scheduleFidget();
  }, 6000 + Math.random() * 7000);   // every 6–13s
}

// ── Walk-to-the-cup choreography ──────────────────────────────────────────────
// How far right the maker glides so he stands beside the cup. WALK_MS must match
// the .maker-wrap CSS transition (1050ms); tweak MIX_WALK_X if he stops short.
const MIX_WALK_X = 158;
const WALK_MS = 1050;   // keep in sync with the .maker-wrap CSS transition (1050ms)
let walkTimer = null;

function setWalk(px) {
  els.makerWrap.style.setProperty("--walk", px + "px");
}

// Walk over to the cup, then start mixing once he arrives
function walkToCupAndMix() {
  clearTimeout(walkTimer);
  setWalk(MIX_WALK_X);
  setMakerState("walking");
  walkTimer = setTimeout(() => {
    if (state.running && state.phase === "focus") setMakerState("mixing");
  }, WALK_MS);
}

// Walk back to his station, then settle into the given resting state
function walkToStation(restState = "idle") {
  clearTimeout(walkTimer);
  // Capture how far out he is BEFORE zeroing it, so the waddle only plays when
  // he actually has ground to cover (reading after setWalk(0) always saw 0).
  const current = parseFloat(getComputedStyle(els.makerWrap).getPropertyValue("--walk")) || 0;
  setWalk(0);
  if (current !== 0) {
    setMakerState("walking");
    walkTimer = setTimeout(() => { if (!state.running) setMakerState(restState); }, WALK_MS);
  } else {
    setMakerState(restState);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function loadState() {
  state.collection  = JSON.parse(localStorage.getItem("bobaFocusCollection")  || "[]");
  state.rewards     = JSON.parse(localStorage.getItem("bobaFocusRewards")     || "[]");
  state.owned       = JSON.parse(localStorage.getItem("bobaFocusOwned")       || "[]");
  state.spent       = JSON.parse(localStorage.getItem("bobaFocusSpent")       || "0");
  state.bonusPearls = JSON.parse(localStorage.getItem("bobaFocusBonusPearls") || "0");
  state.skin        = localStorage.getItem("bobaFocusSkin") || "";
  // Drink customization + equipped background — persist so they survive reloads.
  state.base        = localStorage.getItem("bobaFocusBase")    || "classic";
  state.topping     = localStorage.getItem("bobaFocusTopping") || "pearls";
  state.shopTheme   = localStorage.getItem("bobaFocusTheme")   || "cozy";
  state.sticker     = localStorage.getItem("bobaFocusSticker") || "Focus";
  if (!BASES[state.base])       state.base = "classic";       // guard stale/removed keys
  if (!TOPPINGS[state.topping]) state.topping = "pearls";
  // Unlocked customizations + per-day game limits.
  state.unlockedBases    = readJSON("bobaFocusUnlockedBases", ["classic"]);
  state.unlockedToppings = readJSON("bobaFocusUnlockedToppings", ["pearls"]);
  if (!state.unlockedBases.includes("classic")) state.unlockedBases.push("classic");
  if (!state.unlockedToppings.includes("pearls")) state.unlockedToppings.push("pearls");
  state.gameDays = readJSON("bobaFocusGameDays", {});
  if (!state.gameDays || typeof state.gameDays !== "object") state.gameDays = {};
  state.customDuration = JSON.parse(localStorage.getItem("bobaFocusCustomDuration") || String(30 * 60));
  state.soundOn     = JSON.parse(localStorage.getItem("bobaFocusSoundOn") || "true");
  state.devMode     = JSON.parse(localStorage.getItem("bobaFocusDevMode") || "false");
  // Resume an in-progress drink across app closes
  state.mode        = localStorage.getItem("bobaFocusMode") || "small";
  state.elapsed     = JSON.parse(localStorage.getItem("bobaFocusElapsed") || "0");
  state.onboarded   = JSON.parse(localStorage.getItem("bobaFocusOnboarded") || "false");
  state.badges      = JSON.parse(localStorage.getItem("bobaFocusBadges") || "[]");
  state.dailyGoal   = JSON.parse(localStorage.getItem("bobaFocusDailyGoal") || "60");
  state.ambience    = localStorage.getItem("bobaFocusAmbience") || "off";
  state.musicOn     = JSON.parse(localStorage.getItem("bobaFocusMusicOn") || "true");
  // Volumes (0–1). Fall back to the legacy on/off toggles for returning users.
  const mv = localStorage.getItem("bobaFocusMusicVol");
  const sv = localStorage.getItem("bobaFocusSfxVol");
  state.musicVolume = mv !== null ? clampVol01(JSON.parse(mv)) : (state.musicOn ? 0.8 : 0);
  state.sfxVolume   = sv !== null ? clampVol01(JSON.parse(sv)) : (state.soundOn ? 0.9 : 0);
  const av = localStorage.getItem("bobaFocusAmbVol");
  state.ambVolume   = av !== null ? clampVol01(JSON.parse(av)) : 0.5;
  state.musicOn = state.musicVolume > 0;   // toggles are now derived from volume
  state.soundOn = state.sfxVolume > 0;
}

// Clamp a stored/parsed volume to a safe 0–1 range.
function clampVol01(v) {
  v = Number(v);
  if (!isFinite(v)) return 0.8;
  return Math.max(0, Math.min(1, v));
}

// Unique id that works EVERYWHERE. crypto.randomUUID only exists in a secure
// context (https or localhost) — on a plain-http LAN address (e.g. testing on a
// phone via http://192.168.x.x) it's undefined and throws, which used to freeze
// session completion. This falls back to a good-enough random id.
function uuid() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) { /* fall through */ }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// Parse a JSON localStorage value, returning a fallback on missing/corrupt data.
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch (e) { return fallback; }
}

function saveState() {
  localStorage.setItem("bobaFocusCollection",  JSON.stringify(state.collection));
  localStorage.setItem("bobaFocusRewards",      JSON.stringify(state.rewards));
  localStorage.setItem("bobaFocusOwned",        JSON.stringify(state.owned));
  localStorage.setItem("bobaFocusSpent",        JSON.stringify(state.spent));
  localStorage.setItem("bobaFocusBonusPearls",  JSON.stringify(state.bonusPearls));
  localStorage.setItem("bobaFocusSkin",         state.skin);
  localStorage.setItem("bobaFocusBase",         state.base);
  localStorage.setItem("bobaFocusTopping",      state.topping);
  localStorage.setItem("bobaFocusUnlockedBases",    JSON.stringify(state.unlockedBases));
  localStorage.setItem("bobaFocusUnlockedToppings", JSON.stringify(state.unlockedToppings));
  localStorage.setItem("bobaFocusGameDays",     JSON.stringify(state.gameDays));
  localStorage.setItem("bobaFocusTheme",        state.shopTheme);
  localStorage.setItem("bobaFocusSticker",      state.sticker);
  localStorage.setItem("bobaFocusCustomDuration", JSON.stringify(state.customDuration));
  localStorage.setItem("bobaFocusSoundOn",      JSON.stringify(state.soundOn));
  localStorage.setItem("bobaFocusDevMode",      JSON.stringify(state.devMode));
  localStorage.setItem("bobaFocusMode",         state.mode);
  localStorage.setItem("bobaFocusElapsed",      JSON.stringify(state.elapsed));
  localStorage.setItem("bobaFocusBadges",       JSON.stringify(state.badges || []));
  localStorage.setItem("bobaFocusDailyGoal",    JSON.stringify(state.dailyGoal));
  localStorage.setItem("bobaFocusAmbience",     state.ambience);
  localStorage.setItem("bobaFocusMusicOn",      JSON.stringify(state.musicOn));
  localStorage.setItem("bobaFocusMusicVol",     JSON.stringify(state.musicVolume));
  localStorage.setItem("bobaFocusSfxVol",       JSON.stringify(state.sfxVolume));
  localStorage.setItem("bobaFocusAmbVol",       JSON.stringify(state.ambVolume));
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":");
  }

  return [minutes, secs].map((part) => String(part).padStart(2, "0")).join(":");
}

// Local (not UTC) YYYY-MM-DD so streaks line up with the user's calendar day
function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function totalMinutes() {
  return state.collection.reduce((sum, drink) => sum + drink.minutes, 0);
}

function minuteLabel(minutes) {
  return `${minutes} focused ${minutes === 1 ? "minute" : "minutes"}`;
}

function currentDrinkName() {
  return `${BASES[state.base].label} + ${TOPPINGS[state.topping].label}`;
}

// The colour at the very top of each scene (the "sky"), so the phone status-bar
// area can be tinted to match — no white gap above the app.
const THEME_SKY = {
  cozy:   "#f3e4cf",
  night:  "#2e3b57",
  sakura: "#f6e0e6",
  autumn: "#f0dcb8",
  rainy:  "#d6dee6"
};
function updateThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const color = state.phase === "break" ? "#c9bfe0" : (THEME_SKY[state.shopTheme] || "#f3e4cf");
  if (meta.content !== color) meta.content = color;
}

function progress() {
  return Math.min(1, state.elapsed / modeDuration());
}

function modeLabel() {
  if (state.mode === "custom") {
    return `Custom · ${fmtDuration(state.customDuration)}`;
  }
  return MODES[state.mode].label;
}

function currentPearls() {
  return Math.floor(totalMinutes() / 15) + state.bonusPearls - state.spent;
}

function speechForState() {
  if (state.running) {
    return "Mixing your drink — stay focused! 🧋";
  }

  if (state.elapsed > 0) {
    return "Paused. Your drink is waiting for you.";
  }

  if (state.collection.length > 5) {
    return "Welcome back! The shelf is looking full ✨";
  }

  if (state.collection.length > 0) {
    return "Ready for another round?";
  }

  return "Hi! Pick a size and I'll start mixing.";
}

// Tap-to-talk: little personality lines Mr. Tapioca says when you tap him.
// Keyed by what he's currently doing so it always feels in-context.
// Lines are keyed to what he's actually DOING (his current pose) so a tap always
// fits the moment — nap lines while sleeping, sip lines while drinking, etc.
const TAP_LINES = {
  mixing: [
    "Shaking up something good 🥤", "Stir, stir, stir…", "Mixing your focus potion ✨",
    "Eyes on the prize, friend.", "One pearl at a time!", "Almost perfect…",
    "Future you says thank you.", "We've got a rhythm going 🎧"
  ],
  walking: [
    "Just stretching my legs!", "Wander wander 🚶", "Off to find more boba…",
    "Taking a little stroll.", "Don't mind me, just pacing."
  ],
  sleeping: [
    "Shhh… don't wake me 😴", "Nappy nap nap 💤", "Five more minutes…",
    "Recharging my boba batteries 🔋", "Zzz… so cozy.", "Dreaming of tapioca…"
  ],
  drinking: [
    "Sip sip, hooray 🧋", "Ahh, that hits the spot.", "Break vibes only 💕",
    "Treat yourself!", "So refreshing 💧", "Best part of the day."
  ],
  focus: [
    "Deep focus mode… shhh 🤫", "Eyes on the prize, friend.", "One pearl at a time!",
    "Future you says thank you.", "Don't quit — almost there.", "You + me = unstoppable."
  ],
  paused: [
    "Take your time, I'll keep it cold.", "Psst… your drink's waiting 🧋",
    "Ready when you are.", "A little break is okay. Then back to it!"
  ],
  break: [
    "Stretch those legs! 🧋", "Break time is sacred.", "You earned this one.",
    "Wanna play a quick game? 🎮", "Hydrate, superstar 💧"
  ],
  idle: [
    "Tap tap! Hi there 👋", "What are we sipping today?", "Pick a size, let's brew ✨",
    "I live for a good study sesh.", "Boba makes everything better.", "Big drinks = big rewards 🌟",
    "I believe in you, you know.", "Let's make today count!"
  ]
};

let lastTapLine = "";
let tapLineTimer = null;

function tapLineStateKey() {
  // Prefer the actual pose he's in so the line matches what he's doing.
  if (state.phase === "break" || state.phase === "break-offer") {
    return TAP_LINES[currentMakerState] ? currentMakerState : "break";  // sleeping / drinking
  }
  if (state.running) {
    return TAP_LINES[currentMakerState] ? currentMakerState : "focus";  // mixing / walking
  }
  if (state.elapsed > 0) return "paused";
  return "idle";
}

// Show a random in-context line in the speech bubble, then auto-hide it.
function showMakerLine() {
  const pool = TAP_LINES[tapLineStateKey()] || TAP_LINES.idle;
  let line = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && line === lastTapLine) {            // avoid immediate repeats
    line = pool[(pool.indexOf(line) + 1) % pool.length];
  }
  lastTapLine = line;
  els.makerSpeech.textContent = line;
  els.makerSpeech.classList.add("show");
  pulseMaker("pop", 420);   // a little hop when tapped
  playSfx("blip");
  haptic(8);
  clearTimeout(tapLineTimer);
  tapLineTimer = setTimeout(() => els.makerSpeech.classList.remove("show"), 3000);
}

function updateCup() {
  const pct = Math.round(progress() * 100);
  const remaining = modeDuration() - state.elapsed;
  // --fill lives on the cup-frame so BOTH the liquid (height) and the foam cap
  // (which rides the surface at bottom:var(--fill)) can read it.
  els.focusCup.style.setProperty("--fill", `${pct}%`);
  els.liquid.style.setProperty("--drink-color", BASES[state.base].color);
  els.focusCup.classList.toggle("has-fill", pct > 0);
  els.progressBar.style.width = `${pct}%`;
  els.focusCup.dataset.topping = state.topping;
  els.focusSticker.textContent = state.sticker;
  // Maker state is driven by the walk choreography (startPause/reset/break),
  // not here — updateCup runs every tick and would override the walk.
  // Skins are single "awake" portraits, so hide the sleepy zzz when one is on
  // (only the base character has a real eyes-closed sleeping pose).
  els.shopScene.classList.toggle("skin-awake", !!state.skin);
  els.shopScene.dataset.theme = state.shopTheme;
  els.shopScene.classList.toggle("is-focusing", state.running);
  updateThemeColor();   // tint the phone status-bar area to match the scene's sky
  // Don't clobber a tap-to-talk line while it's visible.
  if (!els.makerSpeech.classList.contains("show")) els.makerSpeech.textContent = speechForState();
  els.timerText.textContent = formatTime(remaining);
  els.sessionLabel.textContent = modeLabel();
  els.progressLabel.textContent = `${pct}%`;
  els.startPauseBtn.textContent = state.running ? "Pause"
    : pct === 100 ? "Seal & Save"
    : state.elapsed > 0 ? "Resume"
    : "Start Focus";
  els.startPauseBtn.classList.toggle("is-running", state.running);
  els.drinkName.textContent = currentDrinkName();
  updateTabTitle(remaining);
}


function updateStats() {
  const minutes = totalMinutes();
  const pearls = currentPearls();
  els.pearlCount.textContent  = String(pearls);
  if (els.customizePearlCount) els.customizePearlCount.textContent = `${pearls} pearls`;
  els.totalTime.textContent   = `${minutes} min`;
  els.completedCount.textContent = `${state.collection.length} ${state.collection.length === 1 ? "drink" : "drinks"}`;
}

// Convert a YYYY-MM-DD key to a whole-day ordinal so we can compare/streak them
function keyToOrdinal(k) {
  const [y, m, d] = k.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function computeStats() {
  const ordinals = new Set(state.collection.map(d => keyToOrdinal(d.dateKey)));
  const todayOrd = keyToOrdinal(localDateKey(new Date()));

  // Current streak: must include today or yesterday, then count backwards
  let current = 0;
  let cursor = ordinals.has(todayOrd) ? todayOrd
             : ordinals.has(todayOrd - 1) ? todayOrd - 1 : null;
  while (cursor !== null && ordinals.has(cursor)) { current++; cursor--; }

  // Longest streak across all history
  let longest = 0;
  const sorted = [...ordinals].sort((a, b) => a - b);
  let run = 0, prev = null;
  for (const o of sorted) {
    run = (prev !== null && o === prev + 1) ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = o;
  }

  const todayCount = state.collection.filter(d => keyToOrdinal(d.dateKey) === todayOrd).length;
  const weekCount  = state.collection.filter(d => keyToOrdinal(d.dateKey) > todayOrd - 7).length;

  return { current, longest, todayCount, weekCount, totalMin: totalMinutes() };
}

function formatFocusTotal(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function renderStats() {
  const s = computeStats();
  els.statStreak.textContent    = String(s.current);
  els.statTotalTime.textContent = formatFocusTotal(s.totalMin);
  els.statToday.textContent     = String(s.todayCount);
  els.statWeek.textContent      = String(s.weekCount);
  els.statBest.textContent      = String(s.longest);
}

// ── Daily focus goal ──────────────────────────────────────────────────────────
const GOAL_MIN = 15;
const GOAL_MAX = 240;
const GOAL_STEP = 15;

function todayMinutes() {
  const todayOrd = keyToOrdinal(localDateKey(new Date()));
  return state.collection
    .filter(d => keyToOrdinal(d.dateKey) === todayOrd)
    .reduce((sum, d) => sum + d.minutes, 0);
}

function renderDailyGoal() {
  const today = todayMinutes();
  const goal = state.dailyGoal;
  const pct = Math.min(100, Math.round((today / goal) * 100));
  const met = today >= goal;
  els.dgFill.style.width = `${pct}%`;
  els.dgLabel.textContent = met ? `${today}/${goal} ✓` : `${today}/${goal}`;
  els.dailyGoal.classList.toggle("met", met);
  if (els.goalDisplay) els.goalDisplay.textContent = `${goal} min`;
}

function adjustDailyGoal(delta) {
  state.dailyGoal = Math.min(GOAL_MAX, Math.max(GOAL_MIN, state.dailyGoal + delta));
  saveState();
  renderDailyGoal();
}

// ── Weekly focus chart (last 7 days of focus minutes) ─────────────────────────
const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

function renderWeekChart() {
  const todayOrd = keyToOrdinal(localDateKey(new Date()));
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const ord = todayOrd - i;
    const mins = state.collection
      .filter(d => keyToOrdinal(d.dateKey) === ord)
      .reduce((sum, d) => sum + d.minutes, 0);
    days.push({ ord, mins });
  }
  const max = Math.max(60, ...days.map(d => d.mins));   // floor so tiny days aren't huge

  els.weekChart.innerHTML = days.map(d => {
    const h = Math.round((d.mins / max) * 100);
    const isToday = d.ord === todayOrd;
    const cls = `week-bar ${d.mins === 0 ? "empty" : ""} ${isToday ? "today" : ""}`.trim();
    const wd = WEEKDAY[new Date(d.ord * 86400000).getUTCDay()];
    return `
      <div class="week-col ${isToday ? "is-today" : ""}">
        <div class="week-bar-wrap"><div class="${cls}" style="height:${h}%"></div></div>
        <span class="week-day">${wd}</span>
      </div>`;
  }).join("");

  const total = days.reduce((sum, d) => sum + d.mins, 0);
  els.weekTotal.textContent = formatFocusTotal(total);
}

// ── Achievements / badges ────────────────────────────────────────────────────
const BADGES = [
  { id: "first-sip",   icon: "🧋", name: "First Sip",      desc: "Finish a drink",        test: () => state.collection.length >= 1 },
  { id: "regular",     icon: "🥤", name: "Regular",        desc: "Finish 5 drinks",       test: () => state.collection.length >= 5 },
  { id: "connoisseur", icon: "🏆", name: "Connoisseur",    desc: "Finish 25 drinks",      test: () => state.collection.length >= 25 },
  { id: "deep-work",   icon: "🌟", name: "Deep Work",      desc: "Finish a Large drink",  test: () => state.collection.some(d => d.minutes >= 360) },
  { id: "roll",        icon: "🔥", name: "On a Roll",      desc: "3-day streak",          test: () => computeStats().longest >= 3 },
  { id: "unstoppable", icon: "⚡", name: "Unstoppable",    desc: "7-day streak",          test: () => computeStats().longest >= 7 },
  { id: "started",     icon: "⏱️", name: "Getting Going",  desc: "1 hour total",          test: () => totalMinutes() >= 60 },
  { id: "scholar",     icon: "📚", name: "Scholar",        desc: "10 hours total",        test: () => totalMinutes() >= 600 },
  { id: "master",      icon: "🎓", name: "Master Student", desc: "50 hours total",        test: () => totalMinutes() >= 3000 },
  { id: "stylish",     icon: "✨", name: "Stylish",        desc: "Equip a skin",          test: () => !!state.skin },
  { id: "decorator",   icon: "🏠", name: "Decorator",      desc: "Change the background",  test: () => state.shopTheme !== "cozy" },
  { id: "break-champ", icon: "🎮", name: "Break Champ",    desc: "Win pearls in a game",  test: () => state.bonusPearls > 0 }
];

// Returns the number of newly-unlocked badges (so callers can stagger their own toasts)
function checkBadges(celebrate) {
  const have = new Set(state.badges || []);
  const newly = BADGES.filter(b => !have.has(b.id) && b.test()).map(b => b.id);
  if (!newly.length) return 0;
  state.badges = [...have, ...newly];
  saveState();
  renderBadges();
  if (celebrate) {
    newly.forEach((id, i) => {
      const b = BADGES.find(x => x.id === id);
      setTimeout(() => { showToast(`${b.icon} Badge unlocked: ${b.name}`); playSfx("success"); haptic(10); }, i * 1500);
    });
  }
  return newly.length;
}

function renderBadges() {
  const have = new Set(state.badges || []);
  els.badgeGrid.innerHTML = BADGES.map(b => {
    const earned = have.has(b.id);
    return `
      <div class="badge-item ${earned ? "earned" : "locked"}">
        <span class="badge-emoji">${b.icon}</span>
        <span class="badge-name">${b.name}</span>
        <span class="badge-desc">${b.desc}</span>
      </div>`;
  }).join("");
  els.badgeCount.textContent = `${have.size} / ${BADGES.length}`;
}

let toastTimer = null;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  void els.toast.offsetWidth;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
    setTimeout(() => els.toast.classList.add("hidden"), 320);
  }, 2600);
}

// Celebrate pearls won from a break game: pulse the top-bar chip + toast,
// so winnings register with the same feedback as finishing a drink.
function pearlsWonFx(n, withToast = true) {
  if (n <= 0) return;
  if (withToast) showToast(`⬡ +${n} pearl${n !== 1 ? "s" : ""} added to your stash!`);
  const chip = document.querySelector(".pearl-chip");
  if (chip && !prefersReducedMotion()) {
    chip.classList.remove("pearl-pop");
    void chip.offsetWidth;
    chip.classList.add("pearl-pop");
  }
}

const SHELF_CAP = 24;   // most-recent drinks shown as chips; rest summarized as "+N"
const TREAT_CAP = 20;

function renderShelf() {
  if (state.collection.length === 0) {
    els.shelfGrid.innerHTML = `<div class="empty-state">Finish a focus session to start your collection 🧋</div>`;
    return;
  }
  const drinks = state.collection;   // already newest-first (unshift on complete)
  let html = drinks.slice(0, SHELF_CAP).map((drink) => `
        <article class="shelf-item" title="${drink.name} · ${minuteLabel(drink.minutes)} · ${drink.size}">
          <div class="shelf-cup" style="background:${drink.color}"></div>
          <strong>${drink.name}</strong>
          <small>${minuteLabel(drink.minutes)}</small>
        </article>`).join("");
  if (drinks.length > SHELF_CAP) html += `<article class="shelf-item more">+${drinks.length - SHELF_CAP}</article>`;
  els.shelfGrid.innerHTML = html;
}

function renderRewards() {
  if (state.rewards.length === 0) {
    els.rewardList.innerHTML = `<div class="empty-state">Treats from finished drinks show up here 🎟️</div>`;
    return;
  }
  let html = state.rewards.slice(0, TREAT_CAP).map((reward) => `
        <article class="reward-item" title="${reward.title}">
          <strong>${reward.title}</strong>
          <small>${reward.copy}</small>
        </article>`).join("");
  if (state.rewards.length > TREAT_CAP) html += `<article class="reward-item more">+${state.rewards.length - TREAT_CAP} more</article>`;
  els.rewardList.innerHTML = html;
}

function isOwned(itemId) {
  return state.devMode || state.owned.includes(itemId);
}

function isEquipped(item) {
  return state[item.type] === item.value;
}

function buyItem(itemId) {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item || isOwned(itemId) || currentPearls() < item.price) return;
  state.owned.push(itemId);
  state.spent += item.price;
  saveState();
  playSfx("coin");
  equipItem(itemId);
}

// Re-apply the maker image for the current resting/working state. Needed after
// a skin change because updateCup no longer drives maker state every tick.
function refreshMaker() {
  currentMakerState = "";
  setMakerState(state.running ? "mixing" : "idle");
}

// History hygiene: wipe earned progress so test/dev sessions don't skew stats
// forever. Keeps settings (sound, music, dev mode, daily goal, onboarding).
function clearProgress() {
  playSfx("tap");
  if (state.running || state.elapsed > 0) {
    alert("Finish or reset your current drink before clearing progress.");
    return;
  }
  if (!confirm("Clear all progress? This permanently deletes your drink shelf, treats, pearls, badges, and shop purchases. Settings are kept.")) return;
  state.collection = [];
  state.rewards = [];
  state.owned = [];
  state.spent = 0;
  state.bonusPearls = 0;
  state.badges = [];
  state.skin = "";
  state.shopTheme = "cozy";
  state.base = "classic";
  state.topping = "pearls";
  state.unlockedBases = ["classic"];
  state.unlockedToppings = ["pearls"];
  state.gameDays = {};
  renderCustomizeOptions();   // reflect the reset in the Customize sheet
  saveState();
  refreshMaker();
  renderAll();
  showToast("Progress cleared — fresh start! 🧋");
  playSfx("select");
}

function equipItem(itemId) {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return;
  state[item.type] = item.value;
  if (item.type === "skin") {
    saveState();
    closeSheets();  // step back so the user can see Mr. Tapioca change
    refreshMaker(); // swap his image to the new skin immediately
  } else if (item.type === "shopTheme") {
    saveState();
    closeSheets();  // step back so the user can see the new backdrop
  }
  renderAll();
  playSfx("success");
  haptic(8);
  pulseMaker("pop", 420);   // happy hop on equip
  checkBadges(true);   // "Stylish" / "Decorator"
  els.makerSpeech.textContent = item.type === "shopTheme"
    ? "Ooh, fresh backdrop."
    : "Ooh, nice pick.";
}

function unequipItem(type) {
  state[type] = DEFAULTS[type];
  saveState();
  if (type === "skin") refreshMaker();
  renderAll();
  playSfx("tap");
}

function renderShop() {
  const pearls = currentPearls();
  els.shopPearlCount.textContent = `${pearls} pearls`;

  const allSkins = SHOP_ITEMS.filter(i => i.type === "skin");
  const themes   = SHOP_ITEMS.filter(i => i.type === "shopTheme");

  function renderSkinCard(item) {
    const isDefault = item.id === "skin-default";
    const equipped  = isEquipped(item);
    const owned     = isDefault || isOwned(item.id);
    const canBuy    = pearls >= item.price;
    const img       = `<img class="shop-skin-preview" src="${item.img}" alt="${item.name}">`;
    const premiumBadge = item.premium ? `<span class="shop-premium-flag">✦</span>` : "";

    let action = "";
    if (equipped) {
      action = isDefault
        ? `<span class="shop-equipped-badge">Default</span>`
        : `<span class="shop-equipped-badge">${item.premium ? "✦ " : ""}Equipped</span>
           <button class="shop-unequip-btn" data-unequip="${item.type}">Remove</button>`;
    } else if (item.premium && !state.devMode) {
      action = `<button class="shop-preview-btn" data-premium="${item.id}">✦ $1.99</button>`;
    } else if (owned) {
      action = `<button class="shop-equip-btn" data-equip="${item.id}">Equip</button>`;
    } else {
      action = `<button class="shop-buy-btn" data-buy="${item.id}" ${canBuy ? "" : "disabled"}>⬡ ${item.price}</button>`;
    }

    return `
      <article class="shop-card">
        <div class="shop-preview" style="background:#f5f0ee">${img}${premiumBadge}</div>
        <div><strong>${item.name}</strong><small>${item.desc}</small></div>
        <div class="shop-card-action">${action}</div>
      </article>`;
  }

  function renderThemeCard(item) {
    const equipped  = isEquipped(item);
    const isDefault = item.value === "cozy";
    const owned     = isDefault || isOwned(item.id);
    const canBuy    = pearls >= item.price;
    const preview   = `<div class="shop-theme-preview" style="background:${item.color}"></div>`;

    let action = "";
    if (equipped) {
      action = isDefault
        ? `<span class="shop-equipped-badge">Default</span>`
        : `<span class="shop-equipped-badge">Equipped</span>
           <button class="shop-unequip-btn" data-unequip="${item.type}">Remove</button>`;
    } else if (owned) {
      action = `<button class="shop-equip-btn" data-equip="${item.id}">Equip</button>`;
    } else {
      action = `<button class="shop-buy-btn" data-buy="${item.id}" ${canBuy ? "" : "disabled"}>⬡ ${item.price}</button>`;
    }

    return `
      <article class="shop-card">
        <div class="shop-preview">${preview}</div>
        <div><strong>${item.name}</strong><small>${item.desc}</small></div>
        <div class="shop-card-action">${action}</div>
      </article>`;
  }

  els.shopGrid.innerHTML =
    `<h4 class="shop-category-head">Skins</h4>
     ${allSkins.map(renderSkinCard).join("")}
     <h4 class="shop-category-head">Backgrounds</h4>
     ${themes.map(renderThemeCard).join("")}`;

  els.shopGrid.querySelectorAll("[data-buy]").forEach(btn => {
    btn.addEventListener("click", () => buyItem(btn.dataset.buy));
  });
  els.shopGrid.querySelectorAll("[data-equip]").forEach(btn => {
    btn.addEventListener("click", () => equipItem(btn.dataset.equip));
  });
  els.shopGrid.querySelectorAll("[data-premium]").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = SHOP_ITEMS.find(i => i.id === btn.dataset.premium);
      if (item) showPremiumPreview(item.name, "$1.99");
    });
  });
  els.shopGrid.querySelectorAll("[data-unequip]").forEach(btn => {
    btn.addEventListener("click", () => unequipItem(btn.dataset.unequip));
  });
}

function renderAll() {
  updateCup();
  updateStats();
  renderStats();
  renderDailyGoal();
  renderWeekChart();
  renderBadges();
  renderShelf();
  renderRewards();
  renderShop();
}

let lastPersist = 0;

function stopTicker() {
  if (state.timerId !== null) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function tick() {
  if (!state.running) return;

  const now = Date.now();

  if (state.lastTick === null) {
    state.lastTick = now;
  }

  const delta = (now - state.lastTick) / 1000;
  state.lastTick = now;
  state.elapsed = Math.min(modeDuration(), state.elapsed + delta);
  updateCup();

  // Persist progress every ~10s so a long drink survives an unexpected close
  if (now - lastPersist > 10000) {
    lastPersist = now;
    saveState();
  }

  if (progress() >= 1) {
    completeSession();
    return;
  }
}

// ── Native distraction-blocker bridge ────────────────────────────────────────
// Talks to the iOS Screen Time "FocusShield" Capacitor plugin (see native-ios/).
// On the plain web build the plugin is absent, so every call safely no-ops —
// the web app keeps working unchanged; real app-blocking only happens once the
// app is wrapped with Capacitor and the native plugin is present.
const FocusBlocker = {
  plugin() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FocusShield) || null;
  },
  available() { return !!this.plugin(); },
  async requestAuthorization() {
    const p = this.plugin(); if (!p) return false;
    try { const r = await p.requestAuthorization(); return !!(r && r.granted); } catch (e) { return false; }
  },
  async pickApps() {
    const p = this.plugin();
    if (!p) { showToast("App blocking runs in the installed iPhone app 🧋"); return; }
    try { await p.pickApps(); } catch (e) {}
  },
  async start() { const p = this.plugin(); if (p) { try { await p.startBlocking(); } catch (e) {} } },
  async stop()  { const p = this.plugin(); if (p) { try { await p.stopBlocking();  } catch (e) {} } },
};

function startPause() {
  state.autoPaused = false;   // any manual press cancels a pending auto-resume
  if (progress() >= 1 && !state.running) {
    completeSession();
    return;
  }

  state.running = !state.running;
  state.lastTick = state.running ? Date.now() : null;
  updateCup();

  if (state.running) {
    walkToCupAndMix();        // glide over to the cup, then mix
    startAmbience();          // soundscape on while focusing
    startMusic("focus");      // lo-fi while focusing
    FocusBlocker.start();     // shield distracting apps for the session (native only)
    stopTicker();
    state.timerId = setInterval(tick, 250);
  } else {
    stopTicker();
    stopAmbience();
    stopMusic();
    FocusBlocker.stop();      // lift the shield when paused
    walkToStation("idle");    // walk back to his spot
    saveState();              // bank progress whenever the user pauses
  }
}

function resetSession() {
  closePlinko();
  closePong();
  stopGame();
  stopAmbience();
  stopMusic();
  FocusBlocker.stop();
  clearTimeout(state.breakMakerCycleId);
  state.breakMakerCycleId = null;
  clearInterval(state.breakTimerId);
  state.breakTimerId = null;
  stopTicker();
  state.running = false;
  state.elapsed = 0;
  state.lastTick = null;
  state.breakElapsed = 0;
  state.phase = "focus";
  state.spillPending = false;
  els.shopScene.classList.remove("is-on-break");
  clearTimeout(walkTimer); setWalk(0);
  currentMakerState = ""; setMakerState("idle");
  saveState();   // persist the cleared drink so it doesn't resume on reload
  updatePhaseUI();
  updateCup();
}

function completeSession() {
  stopTicker();
  stopAmbience();
  stopMusic();
  FocusBlocker.stop();   // session done — apps free again
  state.running = false;
  state.elapsed = modeDuration();
  state.lastTick = null;
  clearTimeout(walkTimer); setWalk(0);   // step back to his station to finish up
  currentMakerState = ""; setMakerState("idle");

  const minutes = Math.round(modeDuration() / 60);
  const size    = modeLabel();
  const now = new Date();
  const drink = {
    id: uuid(),
    name: currentDrinkName(),
    size,
    color: BASES[state.base].color,
    minutes,
    sticker: state.sticker,
    dateKey: localDateKey(now)
  };

  // Pearls are floor(totalMinutes/15); show how many THIS drink added
  const oldTotal = totalMinutes();
  const pearlsEarned = Math.floor((oldTotal + minutes) / 15) - Math.floor(oldTotal / 15);

  // Did this drink push today across the daily goal?
  const goalWasUnmet = todayMinutes() < state.dailyGoal;

  // Bigger drinks (more study time) map to bigger real-world partner perks
  let partner;
  if (minutes >= 300)      partner = "🌟 20% off at a partner boba shop";
  else if (minutes >= 90)  partner = "🌟 10% off at a partner boba shop";
  else                     partner = "Save this treat for later";

  const reward = {
    id: uuid(),
    title: "You deserve to go get one in-person!",
    copy: `${size} earned from ${minuteLabel(minutes)}.`,
    size,
    pearls: pearlsEarned,
    partner
  };

  state.collection.unshift(drink);
  state.rewards.unshift(reward);
  saveState();
  renderAll();
  sessionChime();
  haptic([14, 40, 24]);   // celebratory buzz pattern
  showReward(reward);
  const newBadges = checkBadges(true);   // toast any milestone reached by finishing this drink
  if (goalWasUnmet && todayMinutes() >= state.dailyGoal) {
    // queue the goal toast after any badge toasts (each badge toast holds ~1.5s)
    const delay = newBadges > 0 ? newBadges * 1500 + 200 : 900;
    setTimeout(() => { showToast("🎯 Daily goal reached — nice!"); playSfx("success"); }, delay);
  }
}

function showReward(reward) {
  els.rewardTitle.textContent  = `${reward.size} complete! 🎉`;
  els.rewardCopy.textContent   = reward.copy;
  els.rewardPearls.textContent = `+${reward.pearls} pearl${reward.pearls !== 1 ? "s" : ""}`;
  els.rewardDrink.style.setProperty("--drink-color", BASES[state.base].color);
  els.partnerReward.textContent = reward.partner;
  // Highlight the perk as a real reward only when there is one
  els.partnerReward.classList.toggle("has-perk", reward.partner.startsWith("🌟"));

  if (typeof els.rewardDialog.showModal === "function") {
    els.rewardDialog.showModal();
  }
}

function onRewardDialogClose() {
  state.elapsed = 0;
  saveState();   // the finished drink is banked; clear in-progress so it won't resume
  updateCup();
  celebrate();   // happy hop + treat burst now that the modal is out of the way
  startBreakOffer();
}

function startBreakOffer() {
  state.phase = "break-offer";
  els.shopScene.classList.add("is-on-break");
  els.makerSpeech.textContent = "You crushed it. Take a breather.";
  startMusic("break");   // brighter break tune
  updatePhaseUI();
}

function startBreak() {
  state.phase = "break";
  state.breakElapsed = 0;
  state.breakLastTick = Date.now();
  state.breakTimerId = setInterval(tickBreak, 250);
  scheduleMakerBreakCycle();
  renderBreakGameButtons();   // gate each game by once-per-day availability
  FocusBlocker.stop();        // breaks are free time — lift the shield
  updatePhaseUI();
}

function tickBreak() {
  const now = Date.now();
  const delta = (now - state.breakLastTick) / 1000;
  state.breakLastTick = now;
  state.breakElapsed = Math.min(state.breakDuration, state.breakElapsed + delta);
  updateBreakDisplay();

  if (state.breakElapsed >= state.breakDuration) {
    endBreak();
  }
}

function endBreak() {
  closePlinko();
  closePong();
  stopGame();
  stopMusic();
  clearInterval(state.breakTimerId);
  state.breakTimerId = null;
  clearTimeout(state.breakMakerCycleId);
  state.breakMakerCycleId = null;
  state.breakElapsed = 0;
  state.phase = "focus";
  els.shopScene.classList.remove("is-on-break");
  clearTimeout(walkTimer); setWalk(0);   // walk him back from wherever he wandered
  currentMakerState = ""; setMakerState("idle");
  updatePhaseUI();
  renderAll();
  els.makerSpeech.textContent = "Break over. Ready for another round?";
}

function skipBreak() {
  closePlinko();
  closePong();
  stopGame();
  stopMusic();
  clearInterval(state.breakTimerId);
  state.breakTimerId = null;
  clearTimeout(state.breakMakerCycleId);
  state.breakMakerCycleId = null;
  state.breakElapsed = 0;
  state.phase = "focus";
  els.shopScene.classList.remove("is-on-break");
  clearTimeout(walkTimer); setWalk(0);
  currentMakerState = ""; setMakerState("idle");
  updatePhaseUI();
  renderAll();
}

function adjustBreakDuration(delta) {
  const min = 5 * 60;
  const max = 20 * 60;
  state.breakDuration = Math.min(max, Math.max(min, state.breakDuration + delta));
  updateBreakDisplay();
}

function updateBreakDisplay() {
  const remaining = state.breakDuration - state.breakElapsed;
  const pct = Math.round((state.breakElapsed / state.breakDuration) * 100);
  els.breakDurationDisplay.textContent = formatTime(state.breakDuration);
  els.breakTimerText.textContent = formatTime(remaining);
  els.breakProgressBar.style.width = `${pct}%`;
  els.breakProgressLabel.textContent = `${pct}%`;
}

function updatePhaseUI() {
  const isFocus = state.phase === "focus";
  const isOffer = state.phase === "break-offer";
  const isBreak = state.phase === "break";

  els.focusControls.classList.toggle("hidden", !isFocus);
  els.breakOffer.classList.toggle("hidden", !isOffer);
  els.breakRunningPanel.classList.toggle("hidden", !isBreak);

  updateBreakDisplay();
}

function scheduleMakerBreakCycle() {
  const poses = ["drinking", "sleeping"];
  let idx = 0;

  function settle() {
    setMakerState(poses[idx++ % poses.length]);
    state.breakMakerCycleId = setTimeout(cycle, 5000 + Math.random() * 3500);
  }

  function cycle() {
    // Gently pace near his station (LEFT side, well away from the cup at ~158 so
    // it doesn't look like he's walking to make a drink during the break), then
    // settle into a drink/nap pose.
    if (!prefersReducedMotion() && Math.random() < 0.5) {
      setWalk(Math.round(Math.random() * 60));   // small pace, stays left of the cup
      setMakerState("walking");
      state.breakMakerCycleId = setTimeout(settle, WALK_MS);
    } else {
      setWalk(0);   // back to his spot
      settle();
    }
  }

  cycle();
}

function setMode(mode) {
  if (mode === state.mode) return;
  // Guard against wiping a drink that's partway filled
  if (state.elapsed > 0 && progress() < 1) {
    const ok = confirm("Switch drinks? Your current drink's progress will be lost.");
    if (!ok) {
      // keep the previously-active button highlighted
      document.querySelectorAll(".size-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.mode === state.mode);
      });
      return;
    }
  }
  state.mode = mode;
  document.querySelectorAll(".size-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.mode === mode);
  });
  if (els.customStepper) {
    els.customStepper.classList.toggle("hidden", mode !== "custom");
  }
  updateCustomDisplay();
  resetSession();
}

function adjustCustomDuration(delta) {
  // Don't silently wipe an in-progress custom drink (mirrors setMode's guard)
  if (state.mode === "custom" && state.elapsed > 0 && progress() < 1) {
    if (!confirm("Change cup size? Your current drink's progress will be lost.")) return;
  }
  const d = state.customDuration;
  if (delta < 0) {
    // In dev mode, "−" at the normal minimum drops to the 5-second test rung
    if (state.devMode && d <= CUSTOM_MIN) {
      state.customDuration = DEV_MIN;
    } else {
      state.customDuration = Math.max(CUSTOM_MIN, d - CUSTOM_STEP);
    }
  } else {
    // "+" from the dev rung jumps back to the normal minimum
    if (d < CUSTOM_MIN) {
      state.customDuration = CUSTOM_MIN;
    } else {
      state.customDuration = Math.min(CUSTOM_MAX, d + CUSTOM_STEP);
    }
  }
  saveState();
  updateCustomDisplay();
  if (state.mode === "custom") resetSession();
}

function updateCustomDisplay() {
  if (els.customDurationDisplay) {
    els.customDurationDisplay.textContent = fmtDuration(state.customDuration);
  }
}

function openSheet(id) {
  document.querySelectorAll(".sheet").forEach(s => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  els.sheetBackdrop.classList.remove("hidden");
}

function closeSheets() {
  document.querySelectorAll(".sheet").forEach(s => s.classList.add("hidden"));
  els.sheetBackdrop.classList.add("hidden");
}

function isBaseUnlocked(key) {
  return state.devMode || BASES[key].price === 0 || state.unlockedBases.includes(key);
}
function isToppingUnlocked(key) {
  return state.devMode || TOPPINGS[key].price === 0 || state.unlockedToppings.includes(key);
}

// Build the Customize sheet's tea-base + topping pickers from the single
// BASES/TOPPINGS source of truth. Locked items show a pearl price tag.
function renderCustomizeOptions() {
  if (els.baseGrid) {
    els.baseGrid.innerHTML = Object.entries(BASES).map(([key, b]) => {
      const locked = !isBaseUnlocked(key);
      return `<button class="base-option${state.base === key ? " active" : ""}${locked ? " locked" : ""}" data-base="${key}" aria-label="${b.label}${locked ? ` — ${b.price} pearls to unlock` : ""}">
        <span class="base-dot" style="--swatch:${b.color}"></span>
        <span class="base-name">${b.label}</span>
        ${locked ? `<span class="opt-price">⬡ ${b.price}</span>` : ""}
      </button>`;
    }).join("");
  }
  if (els.toppingRow) {
    els.toppingRow.innerHTML = Object.entries(TOPPINGS).map(([key, t]) => {
      const locked = !isToppingUnlocked(key);
      return `<button class="choice${state.topping === key ? " active" : ""}${locked ? " locked" : ""}" data-topping="${key}">${t.label}${locked ? ` <span class="opt-price">⬡${t.price}</span>` : ""}</button>`;
    }).join("");
  }
}

// Buy a locked customization with pearls. Returns true if it's now usable.
function tryUnlock(kind, key, label, price) {
  if (currentPearls() < price) {
    playSfx("tap"); haptic(8);
    showToast(`Need ${price - currentPearls()} more pearls for ${label} 🧋`);
    return false;
  }
  if (!confirm(`Unlock ${label} for ${price} pearls?`)) return false;
  (kind === "base" ? state.unlockedBases : state.unlockedToppings).push(key);
  state.spent += price;
  playSfx("coin"); haptic(10);
  showToast(`Unlocked ${label}! 🎉`);
  return true;
}

function setBase(base) {
  if (!isBaseUnlocked(base) && !tryUnlock("base", base, BASES[base].label, BASES[base].price)) return;
  state.base = base;
  saveState();
  renderCustomizeOptions();   // refresh active + lock states
  renderAll();
  els.makerSpeech.textContent = "Fresh tea base selected.";
}

function setChoice(type, value) {
  if (type === "topping" && !isToppingUnlocked(value) &&
      !tryUnlock("topping", value, TOPPINGS[value].label, TOPPINGS[value].price)) return;
  state[type] = value;
  saveState();
  renderCustomizeOptions();
  renderAll();
  els.makerSpeech.textContent = "Got it. I will make that drink next.";
}

function showPremiumPreview(title, price) {
  els.premiumTitle.textContent = `${title} preview`;
  els.premiumCopy.textContent = `Later, this could unlock as a ${price} premium cosmetic. On iPhone, this would use Apple's in-app purchase system.`;

  if (typeof els.premiumDialog.showModal === "function") {
    els.premiumDialog.showModal();
  }
}

function stopGame() {
  if (game.active) {
    cancelAnimationFrame(game.animId);
    game.active = false;
    for (const p of game.pearls) p.el.remove();
    game.pearls = [];
  }
  // Always hide the overlay, even if the game already ended and is showing its
  // result screen — otherwise it stays painted over the focus UI after a break.
  els.gameResult.style.display = "none";
  els.pearlGame.style.display = "none";
}

function spawnPearl() {
  const x = Math.random() * (els.gameArea.offsetWidth - PEARL_SIZE);
  const el = document.createElement("div");
  el.className = "falling-pearl";
  el.style.left = x + "px";
  el.style.top = (-PEARL_SIZE) + "px";
  els.gameArea.appendChild(el);
  game.pearls.push({ el, x, y: -PEARL_SIZE });
}

function gameLoop(ts) {
  if (!game.active) return;
  if (game.lastTime === null) game.lastTime = ts;
  const dt = Math.min((ts - game.lastTime) / 1000, 0.1);
  game.lastTime = ts;
  game.elapsed += dt;

  // Difficulty ramps up: pearls fall faster and spawn more often over time
  const fallSpeed = 230 + game.elapsed * 5;             // ~230 → ~450 px/s
  const spawnInterval = Math.max(0.42, 0.8 - game.elapsed * 0.008);

  const areaW = els.gameArea.offsetWidth;
  const areaH = els.gameArea.offsetHeight;
  const cupTop = areaH - GAME_CUP_H - 10;

  if (game.keysLeft)  game.cupX = Math.max(0, game.cupX - game.cupSpeed * dt);
  if (game.keysRight) game.cupX = Math.min(areaW - GAME_CUP_W, game.cupX + game.cupSpeed * dt);
  els.gameCup.style.left = Math.round(game.cupX) + "px";

  const caught = [];
  const missed = [];
  for (const p of game.pearls) {
    p.y += fallSpeed * dt;
    p.el.style.top = Math.round(p.y) + "px";
    if (p.y + PEARL_SIZE >= cupTop) {
      const cx = p.x + PEARL_SIZE / 2;
      if (cx >= game.cupX && cx <= game.cupX + GAME_CUP_W) {
        caught.push(p);
      } else if (p.y > areaH) {
        missed.push(p);
      }
    } else if (p.y > areaH) {
      missed.push(p);
    }
  }

  for (const p of caught) p.el.remove();
  for (const p of missed) p.el.remove();
  if (caught.length || missed.length) {
    game.pearls = game.pearls.filter(p => !caught.includes(p) && !missed.includes(p));
  }
  if (caught.length) {
    game.score += caught.length;
    els.gameScore.textContent = "⬡ " + game.score;
    playSfx("blip");
  }

  game.spawnTimer += dt;
  if (game.spawnTimer >= spawnInterval) {
    game.spawnTimer -= spawnInterval;
    spawnPearl();
  }

  game.timeLeft -= dt;
  if (game.timeLeft <= 0) {
    endPearlGame();
    return;
  }

  const secs = Math.ceil(game.timeLeft);
  els.gameTimer.textContent = Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");
  game.animId = requestAnimationFrame(gameLoop);
}

function startPearlGame() {
  if (gameDoneToday("catch")) return;
  markGamePlayed("catch");
  game.active = true;
  game.score = 0;
  game.timeLeft = 45;
  game.elapsed = 0;
  game.lastTime = null;
  game.spawnTimer = 0;
  game.pearls = [];
  game.keysLeft = false;
  game.keysRight = false;
  game.cupX = (els.gameArea.offsetWidth - GAME_CUP_W) / 2;
  els.gameCup.style.left = Math.round(game.cupX) + "px";
  els.gameScore.textContent = "⬡ 0";
  els.gameTimer.textContent = "0:45";
  els.gameResult.style.display = "none";
  els.pearlGame.style.display = "flex";
  game.animId = requestAnimationFrame(gameLoop);
}

function endPearlGame() {
  cancelAnimationFrame(game.animId);
  game.active = false;
  for (const p of game.pearls) p.el.remove();
  game.pearls = [];
  const earned = Math.min(game.score, CATCH_CAP);   // daily bonus is capped
  state.bonusPearls += earned;
  saveState();
  renderAll();
  if (earned > 0) { checkBadges(true); pearlsWonFx(earned); }   // "Break Champ"
  const capNote = game.score > CATCH_CAP ? ` (daily max +${CATCH_CAP})` : "";
  els.gameResultText.textContent = "You caught " + game.score + " pearl" + (game.score !== 1 ? "s" : "") + "! +" + earned + " to your stash" + capNote + ".";
  els.gameResult.style.display = "flex";
}

// Leaving mid-session no longer spills the whole drink (long drinks are meant
// to be filled across multiple sittings). Instead we pause and bank progress,
// with a startled reaction, so the user can resume right where they left off.
function pauseAndBank() {
  stopTicker();
  stopAmbience();
  stopMusic();
  FocusBlocker.stop();
  state.running = false;
  state.lastTick = null;
  state.autoPaused = true;   // so returning to the app can auto-resume
  saveState();
  clearTimeout(walkTimer); setWalk(0);   // hurry back to the station
  currentMakerState = ""; setMakerState("shocked");
  updateCup();
  els.makerSpeech.textContent = "You stepped away — saved your spot! 🧋";
  setTimeout(() => {
    if (!state.running && state.phase === "focus") {
      currentMakerState = "";
      setMakerState("idle");
    }
  }, 1600);
}

function plinkoRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function getPlinkoGeo() {
  const canvas = els.plinkoCanvas;
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  const slotH = 46;
  const topPad = 18;
  const pegAreaH = H - topPad - slotH;
  const rowSpacing = pegAreaH / PLINKO_ROWS;
  const slotW = W / 7;
  const pegR = 5;
  return { W, H, slotH, topPad, pegAreaH, rowSpacing, slotW, pegR };
}

function drawPlinkoBoard(highlightSlot) {
  const canvas = els.plinkoCanvas;
  if (!canvas.offsetWidth || !canvas.offsetHeight) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const geo = getPlinkoGeo();
  const { slotH, slotW, topPad, rowSpacing, pegR } = geo;
  const slotY = H - slotH;

  const BASE_COLORS = ["#f0bb4f", "#ef8aa0", "#d9f3ea", "#e8e0f8", "#d9f3ea", "#ef8aa0", "#f0bb4f"];
  const HIT_COLORS  = ["#ffe048", "#ff6688", "#55e8c0", "#c4b5e8", "#55e8c0", "#ff6688", "#ffe048"];

  for (let i = 0; i < 7; i++) {
    const x = i * slotW;
    const isHit = i === highlightSlot;
    ctx.fillStyle = isHit ? HIT_COLORS[i] : BASE_COLORS[i];
    plinkoRoundRect(ctx, x + 2, slotY + 4, slotW - 4, slotH - 6, 7);
    ctx.fill();
    if (isHit) {
      ctx.strokeStyle = "#3c2a2f";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = "#2d2428";
    ctx.font = "900 10.5px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`+${SLOT_REWARDS[i]}`, x + slotW / 2, slotY + slotH / 2);
  }

  ctx.strokeStyle = "rgba(45,36,40,0.15)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo(i * slotW, slotY);
    ctx.lineTo(i * slotW, H);
    ctx.stroke();
  }

  for (let r = 0; r < PLINKO_ROWS; r++) {
    for (let j = 0; j <= r + 1; j++) {
      const px = geo.W / 2 + (j - (r + 1) / 2) * slotW;
      const py = topPad + r * rowSpacing + rowSpacing / 2;
      ctx.beginPath();
      ctx.arc(px, py, pegR, 0, Math.PI * 2);
      ctx.fillStyle = "#3c2a2f";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px - 1.5, py - 1.5, 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fill();
    }
  }
}

function drawPlinkoPearl(x, y) {
  const canvas = els.plinkoCanvas;
  const ctx = canvas.getContext("2d");
  const r = 8;
  const grad = ctx.createRadialGradient(x - 2.5, y - 2.5, 1, x, y, r);
  grad.addColorStop(0, "rgba(255,255,255,0.75)");
  grad.addColorStop(0.45, "#5b3d46");
  grad.addColorStop(1, "#1a0e14");
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
}

// Peg centres — same formula the board is drawn with, so the sim matches visuals
function plinkoPegs(geo) {
  const { W, slotW, topPad, rowSpacing } = geo;
  const pegs = [];
  for (let r = 0; r < PLINKO_ROWS; r++) {
    for (let j = 0; j <= r + 1; j++) {
      pegs.push({ x: W / 2 + (j - (r + 1) / 2) * slotW, y: topPad + r * rowSpacing + rowSpacing / 2 });
    }
  }
  return pegs;
}

// ── Once-per-day break games ──────────────────────────────────────────────
// Each game can be opened once per calendar day (dev mode bypasses). Opening a
// game consumes the day; the in-game drops/throws all happen in that session.
function gameDoneToday(key) {
  return !state.devMode && state.gameDays[key] === localDateKey(new Date());
}
function markGamePlayed(key) {
  state.gameDays[key] = localDateKey(new Date());
  saveState();
  renderBreakGameButtons();
}
function renderBreakGameButtons() {
  updateCatchBtnState();
  updatePlinkoBtnState();
  updatePongBtnState();
}

function updateCatchBtnState() {
  const done = gameDoneToday("catch");
  els.playGameBtn.disabled = done;
  els.playGameBtn.textContent = done ? "Catch the Pearls ✓ back tomorrow" : "Catch the Pearls 🎮";
}
function updatePlinkoBtnState() {
  const done = gameDoneToday("plinko");
  els.playPlinkoBtn.disabled = done;
  els.playPlinkoBtn.textContent = done ? "Boba Plinko ✓ back tomorrow" : "Boba Plinko 🎟️";
}
function updatePongBtnState() {
  const done = gameDoneToday("pong");
  els.playPongBtn.disabled = done;
  els.playPongBtn.textContent = done ? "Cup Pong ✓ back tomorrow" : "Cup Pong 🥤";
}

function openPlinko() {
  if (plinko.dropping) return;
  if (gameDoneToday("plinko")) return;
  plinko.playsLeft = PLINKO_MAX_PLAYS;   // fresh session for today
  markGamePlayed("plinko");
  if (plinko.animId) { cancelAnimationFrame(plinko.animId); plinko.animId = null; }
  els.plinkoResult.style.display = "none";
  els.plinkoDropBtn.disabled = plinko.playsLeft <= 0;
  els.plinkoDropBtn.textContent = "Drop Pearl";
  updatePlinkoHUD();
  els.plinkoGame.style.display = "flex";
  requestAnimationFrame(() => drawPlinkoBoard(-1));
}

function closePlinko() {
  if (plinko.animId) { cancelAnimationFrame(plinko.animId); plinko.animId = null; }
  plinko.dropping = false;
  els.plinkoGame.style.display = "none";
}

function updatePlinkoHUD() {
  const left = plinko.playsLeft;
  els.plinkoPlaysLeft.textContent = `${left} drop${left !== 1 ? "s" : ""} left`;
}

const PLINKO_R = 8;          // pearl radius
const PLINKO_GRAV = 1200;    // px/s^2
const PLINKO_REST = 0.55;    // bounciness off pegs/walls

// Advance the pearl one physics tick (mutates p = {x,y,vx,vy}); returns true once it
// has dropped past the last peg row into the slots.
function plinkoStep(p, pegs, geo, h) {
  p.vy += PLINKO_GRAV * h;
  p.x += p.vx * h;
  p.y += p.vy * h;
  // walls
  if (p.x < PLINKO_R) { p.x = PLINKO_R; p.vx = Math.abs(p.vx) * PLINKO_REST; }
  if (p.x > geo.W - PLINKO_R) { p.x = geo.W - PLINKO_R; p.vx = -Math.abs(p.vx) * PLINKO_REST; }
  // pegs
  const min = geo.pegR + PLINKO_R;
  for (const peg of pegs) {
    const dx = p.x - peg.x, dy = p.y - peg.y;
    const d = Math.hypot(dx, dy);
    if (d < min && d > 0) {
      const nx = dx / d, ny = dy / d;
      p.x = peg.x + nx * min;
      p.y = peg.y + ny * min;
      const vn = p.vx * nx + p.vy * ny;
      if (vn < 0) {
        p.vx -= (1 + PLINKO_REST) * vn * nx;
        p.vy -= (1 + PLINKO_REST) * vn * ny;
        p.vx += (Math.random() * 2 - 1) * 45;   // a little chaos so it isn't deterministic
      }
      // anti-wedge: if it's barely moving while resting on a peg, nudge it off
      if (Math.abs(p.vx) + Math.abs(p.vy) < 30) p.vx += (Math.random() < 0.5 ? -1 : 1) * 80;
    }
  }
  return p.y + PLINKO_R >= geo.H - geo.slotH;
}

function resolvePlinko(geo, x) {
  plinko.dropping = false;
  plinko.animId = null;
  let slot = Math.floor(x / geo.slotW);
  slot = Math.max(0, Math.min(SLOT_REWARDS.length - 1, slot));
  drawPlinkoBoard(slot);
  drawPlinkoPearl((slot + 0.5) * geo.slotW, geo.H - geo.slotH / 2);
  const reward = SLOT_REWARDS[slot];
  state.bonusPearls += reward;
  saveState();
  renderAll();
  checkBadges(true);   // "Break Champ"
  pearlsWonFx(reward, false);   // pulse the chip (result overlay shows the amount)
  playSfx("blip");
  setTimeout(() => showPlinkoResult(reward), 450);
}

function dropPearl() {
  if (plinko.dropping || plinko.playsLeft <= 0) return;
  plinko.dropping = true;
  plinko.playsLeft--;
  els.plinkoDropBtn.disabled = true;
  els.plinkoResult.style.display = "none";
  updatePlinkoHUD();
  updatePlinkoBtnState();
  playSfx("drop");

  const geo = getPlinkoGeo();
  const pegs = plinkoPegs(geo);
  const p = {
    x: geo.W / 2 + (Math.random() * 2 - 1) * 8,
    y: geo.topPad - 12,
    vx: (Math.random() * 2 - 1) * 30,
    vy: 0
  };

  // Reduced motion: simulate to the result without animating (same ~6s budget as the animated path)
  if (prefersReducedMotion()) {
    let guard = 0;
    while (!plinkoStep(p, pegs, geo, 0.016) && guard++ < 400) {}
    resolvePlinko(geo, p.x);
    return;
  }

  const t0 = performance.now();
  let last = t0;
  function frame(ts) {
    if (!plinko.dropping) return;
    const dt = Math.min((ts - last) / 1000, 0.032);
    last = ts;
    let landed = false;
    // fixed sub-steps for stable collisions
    const sub = 3, h = dt / sub;
    for (let s = 0; s < sub; s++) { if (plinkoStep(p, pegs, geo, h)) { landed = true; break; } }
    drawPlinkoBoard(-1);
    drawPlinkoPearl(p.x, p.y);
    if (landed || ts - t0 > 6000) {
      resolvePlinko(geo, p.x);
    } else {
      plinko.animId = requestAnimationFrame(frame);
    }
  }
  plinko.animId = requestAnimationFrame(frame);
}

function showPlinkoResult(reward) {
  const eyebrows = { 10: "Jackpot!", 5: "Great drop!", 2: "Good drop!", 1: "So close!" };
  els.plinkoResultEyebrow.textContent = eyebrows[reward] || "Nice drop!";
  els.plinkoResultText.textContent = `+${reward} pearl${reward !== 1 ? "s" : ""}!`;
  if (plinko.playsLeft > 0) {
    els.plinkoAgainBtn.style.display = "";
    els.plinkoAgainBtn.textContent = `Drop Again (${plinko.playsLeft} left)`;
  } else {
    els.plinkoAgainBtn.style.display = "none";
  }
  els.plinkoResult.style.display = "flex";
  playSfx(reward >= 10 ? "success" : "coin");
  haptic(reward >= 10 ? [10, 30, 20] : 8);
}

// ── Completion feedback: tab title, chime, notification ───────────────────────

function updateTabTitle(remainingSeconds) {
  if (state.running && state.phase === "focus") {
    document.title = `${formatTime(remainingSeconds)} · Mr. Tapioca`;
  } else {
    document.title = "Mr. Tapioca";
  }
}

// ── Synthesised sound (Web Audio, no asset files) ─────────────────────────────
let audioCtx = null;
let masterComp = null;
function audio() {
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// Single master bus: a soft compressor so SFX + chime + music + ambience can't
// stack into clipping. Everything connects here instead of ctx.destination.
function masterOut(ctx) {
  if (!masterComp) {
    masterComp = ctx.createDynamicsCompressor();
    masterComp.threshold.value = -10;
    masterComp.knee.value = 24;
    masterComp.ratio.value = 4;
    masterComp.attack.value = 0.005;
    masterComp.release.value = 0.18;
    masterComp.connect(ctx.destination);
  }
  return masterComp;
}

// SFX volume bus: every UI sound + chime routes through this so the "Sound
// effects" slider scales them all (music has its own bus). Sits before master.
let sfxGain = null;
function sfxBus(ctx) {
  if (!sfxGain) {
    sfxGain = ctx.createGain();
    sfxGain.gain.value = state.sfxVolume;
    sfxGain.connect(masterOut(ctx));
  }
  return sfxGain;
}

// One short note with an attack/decay envelope; optional pitch glide to freq2
function tone(ctx, { freq, freq2 = null, type = "sine", t0 = 0, dur = 0.12, peak = 0.15 }) {
  const now = ctx.currentTime + t0;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (freq2) osc.frequency.exponentialRampToValueAtTime(freq2, now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(peak, now + Math.min(0.02, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(g).connect(sfxBus(ctx));
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

// Live volume setters used by the Settings sliders.
function setSfxVolume(v) {
  state.sfxVolume = clampVol01(v);
  state.soundOn = state.sfxVolume > 0;
  if (sfxGain) { try { sfxGain.gain.setTargetAtTime(state.sfxVolume, audio().currentTime, 0.02); } catch (e) {} }
}
function setMusicVolume(v) {
  state.musicVolume = clampVol01(v);
  state.musicOn = state.musicVolume > 0;
  if (musicGain && musicTimer) {   // adjust a currently-playing tune live
    try { musicGain.gain.setTargetAtTime(MUSIC_PEAK * state.musicVolume, audio().currentTime, 0.05); } catch (e) {}
  }
}

// Tiny UI sound effects, all gated by the sound toggle
function playSfx(name) {
  if (!state.soundOn) return;
  try {
    const ctx = audio();
    switch (name) {
      case "tap":     tone(ctx, { freq: 300, type: "triangle", dur: 0.06, peak: 0.09 }); break;
      case "select":  tone(ctx, { freq: 540, freq2: 680, type: "sine", dur: 0.08, peak: 0.10 }); break;
      case "open":    tone(ctx, { freq: 380, freq2: 560, type: "sine", dur: 0.14, peak: 0.10 }); break;
      case "success": tone(ctx, { freq: 659.25, dur: 0.12, peak: 0.13 });
                      tone(ctx, { freq: 880, t0: 0.10, dur: 0.16, peak: 0.13 }); break;
      case "coin":    tone(ctx, { freq: 988, type: "square", dur: 0.06, peak: 0.07 });
                      tone(ctx, { freq: 1319, type: "square", t0: 0.05, dur: 0.10, peak: 0.07 }); break;
      case "blip":    tone(ctx, { freq: 880, type: "sine", dur: 0.05, peak: 0.06 }); break;
      case "drop":    tone(ctx, { freq: 520, freq2: 300, type: "sine", dur: 0.14, peak: 0.10 }); break;
    }
  } catch (e) { /* audio unavailable — ignore */ }
}

function haptic(ms) {
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// A short, gentle major-arpeggio chime when a drink completes
function sessionChime() {
  if (!state.soundOn) return;
  try {
    const ctx = audio();
    [523.25, 659.25, 783.99].forEach((f, i) =>
      tone(ctx, { freq: f, type: "sine", t0: i * 0.14, dur: 0.5, peak: 0.18 }));
  } catch (e) { /* ignore */ }
}

// ── Focus ambience: procedural soundscapes (rain / brown noise / ocean) ───────
let amb = null;          // active ambience graph, or null
let ambPreviewTimer = null;

function makeNoiseBuffer(ctx, brown) {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  if (brown) {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

function startAmbience(type = state.ambience) {
  if (!type || type === "off") return;
  if (amb) stopAmbience(true);
  try {
    const ctx = audio();
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, type === "brown" || type === "ocean");
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    const ambGain = ctx.createGain();   // tone level (LFO-modulated for ocean)
    const master = ctx.createGain();    // fade in/out
    let lfo = null;

    if (type === "rain") {
      filter.type = "bandpass"; filter.frequency.value = 1400; filter.Q.value = 0.6;
      ambGain.gain.value = 0.10;
    } else if (type === "brown") {
      filter.type = "lowpass"; filter.frequency.value = 500;
      ambGain.gain.value = 0.13;
    } else { // ocean — slow swelling waves
      filter.type = "lowpass"; filter.frequency.value = 650;
      ambGain.gain.value = 0.10;
      lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.12;
      lfoGain.gain.value = 0.06;
      lfo.connect(lfoGain).connect(ambGain.gain);
      lfo.start();
    }

    // master = the ambience volume knob (fades in to state.ambVolume)
    const now = ctx.currentTime;
    master.gain.setValueAtTime(0.0001, now);
    master.gain.linearRampToValueAtTime(Math.max(0.0001, state.ambVolume), now + 1.2);

    src.connect(filter).connect(ambGain).connect(master).connect(masterOut(ctx));
    src.start();
    amb = { src, master, lfo };
  } catch (e) { /* audio unavailable — ignore */ }
}

function stopAmbience(immediate) {
  if (!amb) return;
  const { src, master, lfo } = amb;
  amb = null;
  try {
    const ctx = audio();
    const now = ctx.currentTime;
    if (immediate) {
      src.stop(); if (lfo) lfo.stop();
    } else {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0.0001, now + 0.5);
      src.stop(now + 0.55);
      if (lfo) lfo.stop(now + 0.55);
    }
  } catch (e) {
    try { src.stop(); } catch (_) {}
  }
}

function renderAmbiencePicker() {
  document.querySelectorAll(".amb-chip").forEach(c =>
    c.classList.toggle("active", c.dataset.amb === state.ambience));
}

function setAmbVolume(v) {
  state.ambVolume = clampVol01(v);
  if (amb) {   // adjust a currently-playing soundscape live
    try { amb.master.gain.setTargetAtTime(Math.max(0.0001, state.ambVolume), audio().currentTime, 0.05); } catch (e) {}
  }
}

function setAmbience(type) {
  state.ambience = type;
  saveState();
  renderAmbiencePicker();
  clearTimeout(ambPreviewTimer);
  if (state.running && state.phase === "focus") {
    // switch live during a session
    startAmbience(type);
  } else {
    // preview the choice for a few seconds so the user can hear it
    stopAmbience(true);
    if (type !== "off") {
      startAmbience(type);
      ambPreviewTimer = setTimeout(() => { if (!state.running) stopAmbience(); }, 4000);
    }
  }
}

// ── Generative lo-fi music (Web Audio note scheduler, no audio files) ─────────
function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

// Each mood has several SECTIONS (chord progression + pentatonic melody notes)
// that rotate every `barsPerSection` bars, so the music keeps evolving.
const FOCUS_MUSIC = {
  bpm: 68, barsPerSection: 8, beat: "soft", melodyProb: 0.32,
  sections: [
    { chords: [[50,53,57,60],[55,58,62,65],[48,52,55,59],[53,57,60,64]], pent: [50,53,55,57,60,62] }, // Dm7 Gm7 Cmaj7 Fmaj7
    { chords: [[45,48,52,55],[53,57,60,64],[50,53,57,60],[55,58,62,65]], pent: [45,48,50,52,55,57] }, // Am-ish
    { chords: [[48,52,55,59],[53,57,60,64],[50,53,57,60],[57,60,64,67]], pent: [48,52,55,57,60,64] }  // Cmaj7 Fmaj7 Dm7 Am7
  ]
};
const BREAK_MUSIC = {
  bpm: 86, barsPerSection: 8, beat: "full", melodyProb: 0.44,
  sections: [
    { chords: [[48,52,55,59],[57,60,64,67],[53,57,60,64],[55,59,62,65]], pent: [48,52,55,57,60,64] }, // Cmaj7 Am7 Fmaj7 G7
    { chords: [[50,53,57,60],[55,58,62,65],[48,52,55,59],[55,59,62,65]], pent: [50,53,55,57,60,62] }  // Dm7 Gm7 Cmaj7 G7
  ]
};

let musicTimer = null, musicNext = 0, musicStep = 0, musicTune = null;
let musicGain = null, musicNoiseBuf = null, musicPreviewTimer = null;
const MUSIC_PEAK = 0.9;   // full-volume target for the music bus (scaled by state.musicVolume)

function musicBus(ctx) {
  if (!musicGain) { musicGain = ctx.createGain(); musicGain.gain.value = 0.0001; musicGain.connect(masterOut(ctx)); }
  return musicGain;
}

function musicVoice(ctx, { freq, t, dur, type = "sine", peak = 0.05, attack = 0.01, release = 0.25, cutoff = 2600 }) {
  const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = cutoff;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
  o.connect(g).connect(lp).connect(musicBus(ctx));
  o.start(t); o.stop(t + dur + release + 0.05);
}

// Warm pad: two slightly-detuned oscillators through a soft lowpass (chorus-y)
function musicPad(ctx, midi, t, dur) {
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1100;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.03, t + 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.4);
  g.connect(lp).connect(musicBus(ctx));
  [-7, 7].forEach(det => {
    const o = ctx.createOscillator();
    o.type = "sine"; o.frequency.value = mtof(midi); o.detune.value = det;
    o.connect(g); o.start(t); o.stop(t + dur + 1.5);
  });
}

function musicKick(ctx, t, peak = 0.16) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  o.connect(g).connect(musicBus(ctx));
  o.start(t); o.stop(t + 0.24);
}

function musicHat(ctx, t, peak = 0.05) {
  if (!musicNoiseBuf) musicNoiseBuf = makeNoiseBuffer(ctx, false);
  const src = ctx.createBufferSource(); src.buffer = musicNoiseBuf;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  src.connect(hp).connect(g).connect(musicBus(ctx));
  src.start(t); src.stop(t + 0.06);
}

// Subtle vinyl crackle — a tiny filtered noise click
function musicCrackle(ctx, t) {
  if (!musicNoiseBuf) musicNoiseBuf = makeNoiseBuffer(ctx, false);
  const src = ctx.createBufferSource(); src.buffer = musicNoiseBuf;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2600; bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.018, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
  src.connect(bp).connect(g).connect(musicBus(ctx));
  src.start(t); src.stop(t + 0.03);
}

function musicScheduleStep(ctx, cfg, step, t) {
  const stepsPerBar = 8;
  const stepDur = 60 / cfg.bpm / 2;       // eighth notes
  const bar = Math.floor(step / stepsPerBar);
  const section = cfg.sections[Math.floor(bar / cfg.barsPerSection) % cfg.sections.length];
  const chord = section.chords[bar % section.chords.length];
  const inBar = step % stepsPerBar;

  if (inBar === 0) {  // new bar: warm pad chord + bass root
    const barDur = stepDur * stepsPerBar;
    chord.forEach(m => musicPad(ctx, m + 12, t, barDur * 0.9));
    musicVoice(ctx, { freq: mtof(chord[0] - 12), t, dur: barDur * 0.5, type: "triangle", peak: 0.07, attack: 0.02, release: 0.3, cutoff: 900 });
  }
  if (inBar === 4) {  // mid-bar bass note (fifth) for a little groove
    musicVoice(ctx, { freq: mtof(chord[0] - 12 + 7), t, dur: stepDur * 2, type: "triangle", peak: 0.05, attack: 0.02, release: 0.3, cutoff: 900 });
  }
  if (inBar % 2 === 0 && Math.random() < cfg.melodyProb) {  // sparse pentatonic melody on the beat
    const oct = Math.random() < 0.3 ? 24 : 12;
    const n = section.pent[Math.floor(Math.random() * section.pent.length)] + oct;
    musicVoice(ctx, { freq: mtof(n), t, dur: stepDur * 0.85, type: "triangle", peak: 0.05, attack: 0.01, release: 0.25, cutoff: 2200 });
  }
  // beat (with a touch of swing on the off-beat hats)
  const swing = stepDur * 0.18;
  if (cfg.beat === "full") {
    if (step % 4 === 0) musicKick(ctx, t);
    if (step % 2 === 1) musicHat(ctx, t + swing);
  } else if (cfg.beat === "soft") {
    if (inBar === 0 || inBar === 4) musicKick(ctx, t, 0.10);
    if (inBar === 2 || inBar === 6) musicHat(ctx, t + swing, 0.035);
  }
  if (Math.random() < 0.25) musicCrackle(ctx, t);   // vinyl texture
}

function musicScheduler() {
  try {
    const ctx = audio();
    const cfg = musicTune === "break" ? BREAK_MUSIC : FOCUS_MUSIC;
    const stepDur = 60 / cfg.bpm / 2;
    // If the tab was backgrounded the timer gets throttled and musicNext falls
    // far behind — snap forward instead of replaying a burst of stacked notes.
    if (musicNext < ctx.currentTime - 0.5) musicNext = ctx.currentTime + 0.05;
    while (musicNext < ctx.currentTime + 0.15) {
      musicScheduleStep(ctx, cfg, musicStep, musicNext);
      musicNext += stepDur;
      musicStep++;
    }
  } catch (e) { /* ignore */ }
}

function startMusic(which) {
  if (!state.musicOn) return;
  if (musicTimer && musicTune === which) return;
  stopMusic(true);
  try {
    const ctx = audio();
    musicTune = which;
    musicStep = 0;
    musicNext = ctx.currentTime + 0.1;
    const bus = musicBus(ctx);
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), ctx.currentTime);
    bus.gain.linearRampToValueAtTime(MUSIC_PEAK * state.musicVolume, ctx.currentTime + 1.0);
    musicTimer = setInterval(musicScheduler, 25);
    musicScheduler();
  } catch (e) { /* ignore */ }
}

function stopMusic(immediate) {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  musicTune = null;
  if (musicGain) {
    try {
      const ctx = audio();
      const now = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(Math.max(0.0001, musicGain.gain.value), now);
      musicGain.gain.exponentialRampToValueAtTime(0.0001, now + (immediate ? 0.05 : 0.6));
    } catch (e) { /* ignore */ }
  }
}

// Reflect current volumes onto the Settings sliders + their value labels.
function renderVolumeControls() {
  if (els.musicVol) {
    const m = Math.round(state.musicVolume * 100);
    els.musicVol.value = m;
    els.musicVolLabel.textContent = m;
  }
  if (els.sfxVol) {
    const s = Math.round(state.sfxVolume * 100);
    els.sfxVol.value = s;
    els.sfxVolLabel.textContent = s;
  }
  if (els.ambVol) {
    const a = Math.round(state.ambVolume * 100);
    els.ambVol.value = a;
    els.ambVolLabel.textContent = a;
  }
}

function renderDevToggle() {
  els.devToggle.classList.toggle("on", state.devMode);
  els.devToggle.setAttribute("aria-checked", String(state.devMode));
}


// ── Boba map (Leaflet + free OpenStreetMap tiles, lazy-loaded) ────────────────

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS  = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
let leafletPromise = null;
let mapObj = null;

function ensureLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);
    const s = document.createElement("script");
    s.src = LEAFLET_JS;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("leaflet failed to load"));
    document.head.appendChild(s);
  });
  return leafletPromise;
}

function setMapStatus(msg) {
  const el = document.getElementById("mapStatus");
  if (!el) return;
  if (msg) { el.textContent = msg; el.classList.remove("hidden"); }
  else     { el.classList.add("hidden"); }
}

function openMap() {
  openSheet("mapSheet");
  if (mapObj) { setTimeout(() => mapObj.invalidateSize(), 250); return; }
  setMapStatus("Loading the map…");
  ensureLeaflet()
    .then(locateAndBuild)
    .catch(() => setMapStatus("Couldn't load the map — check your connection and try again."));
}

function locateAndBuild() {
  const fallback = [37.7749, -122.4194];   // a real area to demo with if location is off
  if (navigator.geolocation) {
    setMapStatus("Finding boba near you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => buildMap(pos.coords.latitude, pos.coords.longitude, true),
      ()    => buildMap(fallback[0], fallback[1], false),
      { timeout: 8000, maximumAge: 600000 }
    );
  } else {
    buildMap(fallback[0], fallback[1], false);
  }
}

function bobaPin(emoji, cls) {
  return L.divIcon({
    className: "",
    html: `<div class="boba-pin ${cls}"><span>${emoji}</span></div>`,
    iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -32]
  });
}

function earnedPerkCount() {
  return state.rewards.filter(r => r.partner && r.partner.startsWith("🌟")).length;
}

function haversine(la1, lo1, la2, lo2) {
  const R = 6371000, toR = Math.PI / 180;
  const dLa = (la2 - la1) * toR, dLo = (lo2 - lo1) * toR;
  const a = Math.sin(dLa / 2) ** 2 +
            Math.cos(la1 * toR) * Math.cos(la2 * toR) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatDistance(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

// Escape untrusted text (OSM shop names) before putting it in popup HTML.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Query OpenStreetMap's free Overpass API for REAL bubble-tea shops near a
// point. CORS-enabled, no key. Returns [{name, lat, lng}] sorted by distance.
function fetchRealBobaShops(lat, lng, radius = 4000) {
  const q = `[out:json][timeout:20];(` +
    `nwr["cuisine"="bubble_tea"](around:${radius},${lat},${lng});` +
    `nwr["shop"="bubble_tea"](around:${radius},${lat},${lng});` +
    `nwr["name"~"boba|bubble tea|tapioca|milk tea",i](around:${radius},${lat},${lng});` +
    `);out center 60;`;
  return fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(q)
  })
    .then(r => { if (!r.ok) throw new Error("overpass " + r.status); return r.json(); })
    .then(data => {
      const seen = new Set(), shops = [];
      for (const el of (data.elements || [])) {
        const name = el.tags && el.tags.name;
        const slat = el.lat != null ? el.lat : (el.center && el.center.lat);
        const slng = el.lon != null ? el.lon : (el.center && el.center.lon);
        if (!name || slat == null || slng == null) continue;
        const key = name.toLowerCase() + "@" + slat.toFixed(4) + "," + slng.toFixed(4);
        if (seen.has(key)) continue;
        seen.add(key);
        shops.push({ name, lat: slat, lng: slng });
      }
      shops.sort((a, b) => haversine(lat, lng, a.lat, a.lng) - haversine(lat, lng, b.lat, b.lng));
      return shops;
    });
}

function buildMap(lat, lng, real) {
  setMapStatus("");
  mapObj = L.map("map", { zoomControl: true }).setView([lat, lng], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  }).addTo(mapObj);

  L.marker([lat, lng], { icon: bobaPin("📍", "me") })
    .addTo(mapObj)
    .bindPopup(real
      ? `<div class="map-pop-name">You are here</div>`
      : `<div class="map-pop-name">Example area</div><div class="map-pop-meta">Allow location to see real shops near you</div>`);

  // Perk banner reflects rewards you've earned (redeemable once partners sign on)
  const earned = earnedPerkCount();
  if (earned > 0) {
    els.mapPerkBanner.textContent = `🎉 You have ${earned} reward${earned !== 1 ? "s" : ""} saved for partner shops!`;
    els.mapPerkBanner.classList.remove("hidden");
  } else {
    els.mapPerkBanner.classList.add("hidden");
  }

  setTimeout(() => mapObj.invalidateSize(), 250);

  // Only pull real nearby shops when we actually have the user's location.
  if (!real) {
    setMapStatus("Turn on location to see real boba shops near you.");
    return;
  }
  setMapStatus("Finding real boba spots near you…");
  fetchRealBobaShops(lat, lng)
    .then(shops => {
      if (!shops.length) { setMapStatus("No boba spots listed within ~4 km — try a city area."); return; }
      setMapStatus("");
      shops.slice(0, 60).forEach(shop => {
        const dist = formatDistance(haversine(lat, lng, shop.lat, shop.lng));
        L.marker([shop.lat, shop.lng], { icon: bobaPin("🧋", "") })
          .addTo(mapObj)
          .bindPopup(
            `<div class="map-pop-name">${escapeHtml(shop.name)}</div>` +
            `<div class="map-pop-meta">${dist} away · real boba shop</div>`
          );
      });
    })
    .catch(() => setMapStatus("Couldn't load nearby shops — close and reopen the map to retry."));
}

// ── First-run onboarding ──────────────────────────────────────────────────────

const ONBOARD_STEPS = [
  {
    img: "assets/Mr. Tapioca.png",
    title: "Meet Mr. Tapioca",
    body: "Your cozy study buddy. He brews boba while you focus — and you can tap him anytime to say hi. 🧋"
  },
  {
    img: "assets/Cup.png",
    title: "Focus fills your cup",
    body: "Pick a size and press start. The longer you focus, the fuller your boba gets. Big drinks even pick up where you left off across sittings."
  },
  {
    img: "assets/Tapioca Currency.png",
    title: "Earn pearls",
    body: "Every 15 focused minutes = 1 pearl. Spend them on cute character skins and shop backgrounds."
  },
  {
    emoji: "🎮",
    title: "Earn your breaks",
    body: "Finish a session and take a breather — play a quick break game (Catch, Plinko, or Cup Pong) for bonus pearls."
  },
  {
    emoji: "🗺️",
    title: "Real boba rewards",
    body: "The dream: finish big drinks to unlock discounts at real boba shops near you. Tap Map to look around!"
  }
];

let onboardStep = 0;

function showOnboarding() {
  onboardStep = 0;
  renderOnboardStep();
  els.onboarding.classList.remove("hidden");
}

function renderOnboardStep() {
  const step = ONBOARD_STEPS[onboardStep];
  if (step.emoji) {
    els.onboardEmoji.textContent = step.emoji;
    els.onboardEmoji.classList.remove("hidden");
    els.onboardImg.classList.add("hidden");
  } else {
    els.onboardImg.src = step.img;
    els.onboardImg.classList.remove("hidden");
    els.onboardEmoji.classList.add("hidden");
  }
  // restart the pop animation on the active visual
  const visual = step.emoji ? els.onboardEmoji : els.onboardImg;
  visual.style.animation = "none";
  void visual.offsetWidth;
  visual.style.animation = "";

  els.onboardTitle.textContent = step.title;
  els.onboardBody.textContent = step.body;

  els.onboardDots.innerHTML = ONBOARD_STEPS
    .map((_, i) => `<span class="${i === onboardStep ? "on" : ""}"></span>`)
    .join("");

  els.onboardBack.classList.toggle("hidden", onboardStep === 0);
  els.onboardNext.textContent = onboardStep === ONBOARD_STEPS.length - 1 ? "Let's go! 🧋" : "Next";
}

function onboardAdvance() {
  if (onboardStep >= ONBOARD_STEPS.length - 1) {
    finishOnboarding();
  } else {
    onboardStep++;
    renderOnboardStep();
    playSfx("select");
  }
}

function onboardGoBack() {
  if (onboardStep > 0) {
    onboardStep--;
    renderOnboardStep();
    playSfx("tap");
  }
}

function finishOnboarding() {
  els.onboarding.classList.add("hidden");
  state.onboarded = true;
  localStorage.setItem("bobaFocusOnboarded", "true");
  playSfx("success");
  haptic(10);
}

// ── Cup Pong: flick a pearl into the cup (GamePigeon-style, projectile arc) ───
function pongDims() {
  const W = els.pongCanvas.offsetWidth, H = els.pongCanvas.offsetHeight;
  return {
    W, H,
    startX: W / 2, startY: H - 38,        // where the pearl waits
    mouthY: H * 0.32,                     // height of the cup rim
    mouthHalf: 44,                        // half the cup-mouth width
    cupH: 84,
    margin: 56
  };
}

function updatePongHUD() {
  els.pongThrows.textContent = `${pong.throwsLeft} left`;
  els.pongScore.textContent = "⬡ " + pong.score;
}

function resetPongPearl() {
  const d = pongDims();
  pong.pearl = { x: d.startX, y: d.startY, vx: 0, vy: 0, prevY: d.startY };
  pong.dragStart = null;
  pong.drag = null;
  pong.phase = "aim";
  els.pongHint.style.display = "";   // re-show the swipe hint for each throw
}

// Velocity the current flick would produce (swipe vector × power, capped)
function pongFlickVel() {
  if (!pong.dragStart || !pong.drag) return { vx: 0, vy: 0, mag: 0 };
  let vx = (pong.drag.x - pong.dragStart.x) * PONG_POWER;
  let vy = (pong.drag.y - pong.dragStart.y) * PONG_POWER;
  const mag = Math.hypot(vx, vy);
  if (mag > PONG_MAXV) { vx = vx / mag * PONG_MAXV; vy = vy / mag * PONG_MAXV; }
  return { vx, vy, mag };
}

function openPong() {
  if (gameDoneToday("pong")) return;
  pong.throwsLeft = PONG_MAX_PLAYS;    // fresh session for today
  pong.score = 0;
  markGamePlayed("pong");
  if (pong.animId) { cancelAnimationFrame(pong.animId); pong.animId = null; }
  pong.opening = true;
  pong.cupDir = 1;
  pong.splash = null;   // clear any leftover make-ring from a previous game
  els.pongResult.style.display = "none";
  els.pongHint.style.display = "";
  els.pongGame.style.display = "flex";
  updatePongHUD();
  requestAnimationFrame(() => {
    if (!pong.opening) return;         // closed again before this frame ran — don't revive
    // canvas now has real dimensions — centre the cup and place the pearl
    pong.cupX = pongDims().W / 2;
    resetPongPearl();
    pong.active = true;
    pong.lastTs = null;
    pong.animId = requestAnimationFrame(pongLoop);
  });
}

function closePong() {
  pong.opening = false;
  if (pong.animId) { cancelAnimationFrame(pong.animId); pong.animId = null; }
  pong.active = false;
  pong.splash = null;
  els.pongGame.style.display = "none";
}

function pongLaunch() {
  if (pong.phase !== "aim" || !pong.drag || pong.throwsLeft <= 0) { pong.dragStart = pong.drag = null; return; }
  const { vx, vy, mag } = pongFlickVel();
  if (mag < 250 || vy >= -60) {   // need a real upward flick
    pong.dragStart = pong.drag = null;
    return;
  }
  pong.pearl.vx = vx;
  pong.pearl.vy = vy;
  pong.pearl.prevY = pong.pearl.y;
  pong.phase = "fly";
  pong.dragStart = pong.drag = null;
  els.pongHint.style.display = "none";
  playSfx("drop");
}

function pongNextThrow(made) {
  pong.throwsLeft = Math.max(0, pong.throwsLeft - 1);
  updatePongHUD();
  updatePongBtnState();
  if (pong.throwsLeft <= 0) {
    pong.phase = "done";
    setTimeout(endPong, 700);
  } else {
    setTimeout(() => { if (pong.active) resetPongPearl(); }, 600);
    pong.phase = "wait";
  }
}

function pongLoop(ts) {
  if (!pong.active) return;
  if (pong.lastTs === null) pong.lastTs = ts;
  const dt = Math.min((ts - pong.lastTs) / 1000, 0.032);
  pong.lastTs = ts;
  const d = pongDims();

  // cup drifts side to side (held still for reduced-motion users)
  const cupSpeed = prefersReducedMotion() ? 0 : 70;
  pong.cupX += pong.cupDir * cupSpeed * dt;
  if (pong.cupX < d.margin) { pong.cupX = d.margin; pong.cupDir = 1; }
  if (pong.cupX > d.W - d.margin) { pong.cupX = d.W - d.margin; pong.cupDir = -1; }

  if (pong.phase === "fly" && pong.pearl) {
    const p = pong.pearl;
    // sub-step the integration so a fast pearl can't tunnel through the rim
    const sub = 4, h = dt / sub;
    let result = null;   // "make" | "miss"
    for (let s = 0; s < sub && !result; s++) {
      const prevX = p.x, prevY = p.y;
      p.vy += PONG_GRAV * h;
      p.x += p.vx * h;
      p.y += p.vy * h;
      if (p.x < PONG_R) { p.x = PONG_R; p.vx = Math.abs(p.vx) * 0.6; }
      if (p.x > d.W - PONG_R) { p.x = d.W - PONG_R; p.vx = -Math.abs(p.vx) * 0.6; }
      // at the moment it falls through the rim height, decide make / rim-bounce
      if (p.vy > 0 && prevY <= d.mouthY && p.y >= d.mouthY) {
        const f = (d.mouthY - prevY) / (p.y - prevY || 1);
        const crossX = prevX + (p.x - prevX) * f;
        const dx = Math.abs(crossX - pong.cupX);
        if (dx < d.mouthHalf - PONG_R) {
          result = "make";
        } else if (dx < d.mouthHalf + PONG_R && !p.bounced) {
          // clipped the rim — bounce off it (a satisfying near miss)
          p.bounced = true;
          p.y = d.mouthY - PONG_R;
          p.vy = -Math.abs(p.vy) * 0.5;
          p.vx += (crossX < pong.cupX ? -1 : 1) * 150;
          playSfx("tap");
        }
      }
      if (!result && (p.y > d.H + 40 || p.x < -40 || p.x > d.W + 40)) result = "miss";
    }
    if (result === "make") {
      pong.splash = { x: pong.cupX, y: d.mouthY, r: 0 };   // ring effect at the cup
      p.x = pong.cupX; p.y = d.mouthY + 24; p.vx = 0; p.vy = 0;   // pearl sinks in
      pong.score++;
      state.bonusPearls += PONG_REWARD;
      saveState();
      updatePongHUD();
      playSfx("coin");
      haptic(12);
      checkBadges(true);
      pearlsWonFx(PONG_REWARD, false);   // pulse the chip on each make
      pongNextThrow(true);
    } else if (result === "miss") {
      playSfx("tap");
      pongNextThrow(false);
    }
  }

  drawPong(d);
  pong.animId = requestAnimationFrame(pongLoop);
}

function drawPong(d) {
  const canvas = els.pongCanvas;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(d.W * dpr) || canvas.height !== Math.round(d.H * dpr)) {
    canvas.width = Math.round(d.W * dpr);
    canvas.height = Math.round(d.H * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, d.W, d.H);

  const cx = pong.cupX;
  const topHalf = d.mouthHalf, botHalf = d.mouthHalf - 12;
  const topY = d.mouthY, botY = d.mouthY + d.cupH;

  // ── table surface the pearl rests on ──
  const tableY = d.startY + PONG_R + 4;
  const tg = ctx.createLinearGradient(0, tableY, 0, d.H);
  tg.addColorStop(0, "#d8b48c");
  tg.addColorStop(1, "#c79a73");
  ctx.fillStyle = tg;
  ctx.fillRect(0, tableY, d.W, d.H - tableY);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(0, tableY, d.W, 3);

  // ── soft shadow grounding the cup ──
  ctx.fillStyle = "rgba(45,36,40,0.12)";
  ctx.beginPath();
  ctx.ellipse(cx, botY + 6, botHalf + 8, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── cup body ──
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.strokeStyle = "rgba(45,36,40,0.85)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - topHalf, topY);
  ctx.lineTo(cx + topHalf, topY);
  ctx.lineTo(cx + botHalf, botY);
  ctx.lineTo(cx - botHalf, botY);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // drink fill (current tea-base colour) in the lower part of the cup
  const fillTop = topY + d.cupH * 0.42;
  const ftHalf = topHalf - (topHalf - botHalf) * 0.42;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - ftHalf, fillTop);
  ctx.lineTo(cx + ftHalf, fillTop);
  ctx.lineTo(cx + botHalf, botY);
  ctx.lineTo(cx - botHalf, botY);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = BASES[state.base].color;
  ctx.globalAlpha = 0.92;
  ctx.fillRect(cx - topHalf, fillTop, topHalf * 2, d.cupH);
  // a few boba pearls at the bottom
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#2c1d16";
  for (const o of [-14, 0, 13, -6, 7]) {
    ctx.beginPath(); ctx.arc(cx + o, botY - 7 - (o % 2 ? 5 : 0), 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // rim: dark ellipse + white gloss highlight
  ctx.strokeStyle = "rgba(45,36,40,0.85)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, topY, topHalf, 6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, topY - 0.5, topHalf - 4, 4, 0, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();

  // ── make splash: expanding ring at the cup mouth ──
  if (pong.splash) {
    const s = pong.splash;
    s.r += 3.2;
    const a = Math.max(0, 1 - s.r / 46);
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * a})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.r, s.r * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (s.r >= 46) pong.splash = null;
  }

  // ── aiming guide: trajectory preview (dots fade with distance) ──
  if (pong.phase === "aim" && pong.dragStart && pong.drag) {
    let { vx, vy } = pongFlickVel();
    let px = d.startX, py = d.startY;
    for (let i = 0; i < 30; i++) {
      px += vx * 0.04; py += vy * 0.04; vy += PONG_GRAV * 0.04;
      if (py > d.H || px < 0 || px > d.W) break;
      ctx.fillStyle = `rgba(45,36,40,${Math.max(0.08, 0.45 - i * 0.013)})`;
      ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── pearl ──
  if (pong.pearl) {
    const p = pong.pearl;
    // little contact shadow when it's resting on the table
    if (pong.phase === "aim" || pong.phase === "wait") {
      ctx.fillStyle = "rgba(45,36,40,0.15)";
      ctx.beginPath(); ctx.ellipse(p.x, tableY + 2, PONG_R, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    const grad = ctx.createRadialGradient(p.x - 3, p.y - 3, 1, p.x, p.y, PONG_R);
    grad.addColorStop(0, "rgba(255,255,255,0.85)");
    grad.addColorStop(0.45, "#5b3d46");
    grad.addColorStop(1, "#1a0e14");
    ctx.beginPath(); ctx.arc(p.x, p.y, PONG_R, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
  }
}

function endPong() {
  pong.active = false;
  if (pong.animId) { cancelAnimationFrame(pong.animId); pong.animId = null; }
  const s = pong.score;
  els.pongResultEyebrow.textContent = s >= 4 ? "Sharp shooter!" : s >= 1 ? "Nice tossing!" : "Tough luck!";
  els.pongResultText.textContent = `You sank ${s} · +${s * PONG_REWARD} pearls`;
  els.pongResult.style.display = "flex";
  updatePongBtnState();   // reflect 0 throws left on the break-panel button
  if (s > 0) playSfx("success");
}

// Pointer handlers for aiming (attached once, guarded by pong.active)
function pongPoint(e) {
  const r = els.pongCanvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: t.clientX - r.left, y: t.clientY - r.top };
}

function wireEvents() {
  // ── Main timer controls ──────────────────────────────────────────────────
  els.startPauseBtn.addEventListener("click", () => { playSfx("tap"); startPause(); });
  els.resetBtn.addEventListener("click", () => {
    playSfx("tap");
    // guard against erasing a partly-filled drink (mirrors the size-switch guard)
    if (state.elapsed > 0 && progress() < 1 &&
        !confirm("Reset this drink? Your current progress will be lost.")) return;
    resetSession();
  });

  // ── Mode / size picker ───────────────────────────────────────────────────
  document.querySelectorAll(".size-btn").forEach(btn => {
    btn.addEventListener("click", () => { playSfx("select"); setMode(btn.dataset.mode); });
  });
  els.customMinus.addEventListener("click", () => { playSfx("select"); adjustCustomDuration(-CUSTOM_STEP); });
  els.customPlus.addEventListener("click",  () => { playSfx("select"); adjustCustomDuration(CUSTOM_STEP); });

  // ── Daily goal stepper (Settings) ─────────────────────────────────────────
  els.goalMinus.addEventListener("click", () => { playSfx("select"); adjustDailyGoal(-GOAL_STEP); });
  els.goalPlus.addEventListener("click",  () => { playSfx("select"); adjustDailyGoal(GOAL_STEP); });

  // ── Focus ambience picker (Settings) ──────────────────────────────────────
  document.querySelectorAll(".amb-chip").forEach(chip => {
    chip.addEventListener("click", () => { playSfx("tap"); setAmbience(chip.dataset.amb); });
  });

  // ── Sound-effects volume slider (Settings) ───────────────────────────────
  els.sfxVol.addEventListener("input", () => {
    setSfxVolume(parseInt(els.sfxVol.value, 10) / 100);
    els.sfxVolLabel.textContent = Math.round(state.sfxVolume * 100);
  });
  els.sfxVol.addEventListener("change", () => {
    saveState();
    if (state.sfxVolume > 0) playSfx("coin");   // preview the level on release
  });

  // ── Music volume slider (Settings) ───────────────────────────────────────
  els.musicVol.addEventListener("input", () => {
    setMusicVolume(parseInt(els.musicVol.value, 10) / 100);
    els.musicVolLabel.textContent = Math.round(state.musicVolume * 100);
    clearTimeout(musicPreviewTimer);
    // Start a tune (once) so the user hears the level while dragging.
    if (state.musicVolume > 0 && !musicTimer) {
      if (state.running && state.phase === "focus") startMusic("focus");
      else if (state.phase === "break" || state.phase === "break-offer") startMusic("break");
      else startMusic("focus");
    } else if (state.musicVolume === 0) {
      stopMusic(true);
    }
  });
  els.musicVol.addEventListener("change", () => {
    saveState();
    clearTimeout(musicPreviewTimer);
    // If this was just an idle preview (not an active session/break), fade it
    // back out shortly after the user lets go.
    if (state.musicVolume > 0 && !state.running &&
        state.phase !== "break" && state.phase !== "break-offer") {
      musicPreviewTimer = setTimeout(() => {
        if (!state.running && state.phase === "focus") stopMusic();
      }, 2500);
    }
  });

  // ── Ambience volume slider (Settings) ────────────────────────────────────
  els.ambVol.addEventListener("input", () => {
    setAmbVolume(parseInt(els.ambVol.value, 10) / 100);
    els.ambVolLabel.textContent = Math.round(state.ambVolume * 100);
    clearTimeout(ambPreviewTimer);
    // Preview the level if a soundscape is chosen but not currently playing.
    if (state.ambience !== "off" && !amb) startAmbience(state.ambience);
  });
  els.ambVol.addEventListener("change", () => {
    saveState();
    clearTimeout(ambPreviewTimer);
    if (state.ambience !== "off" && !state.running) {
      ambPreviewTimer = setTimeout(() => { if (!state.running) stopAmbience(); }, 2500);
    }
  });

  els.devToggle.addEventListener("click", () => {
    state.devMode = !state.devMode;
    // Leaving dev mode shouldn't strand a sub-minute custom timer
    if (!state.devMode && state.customDuration < CUSTOM_MIN) {
      state.customDuration = CUSTOM_MIN;
      updateCustomDisplay();
      if (state.mode === "custom") resetSession();
    }
    saveState();
    renderDevToggle();
    renderShop();  // every item becomes equippable / reverts to locked
    renderCustomizeOptions();   // bases/toppings unlock/relock with dev mode
    if (state.phase === "break") renderBreakGameButtons();   // games unlock/relock
    els.makerSpeech.textContent = state.devMode ? "Dev mode on — everything unlocked." : "Dev mode off.";
  });

  // ── Bottom bar sheets ────────────────────────────────────────────────────
  els.shopBtn.addEventListener("click",       () => { playSfx("open"); openSheet("shopSheet"); });
  els.customizeBtn.addEventListener("click",  () => { playSfx("open"); openSheet("customizeSheet"); });
  els.settingsBtn.addEventListener("click",   () => { playSfx("open"); openSheet("settingsSheet"); });
  els.mapBtn.addEventListener("click",        () => { playSfx("open"); openMap(); });

  // Top-HUD shortcuts: tap the drink name to Customize, tap the pearl chip for the Shop.
  const drinkLabelEl = document.querySelector(".drink-label");
  if (drinkLabelEl) {
    drinkLabelEl.style.cursor = "pointer";
    drinkLabelEl.setAttribute("role", "button");
    drinkLabelEl.setAttribute("aria-label", "Customize your drink");
    drinkLabelEl.addEventListener("click", () => { playSfx("open"); openSheet("customizeSheet"); });
  }
  const hudPearlEl = document.querySelector(".top-hud .pearl-chip");
  if (hudPearlEl) {
    hudPearlEl.style.cursor = "pointer";
    hudPearlEl.setAttribute("role", "button");
    hudPearlEl.setAttribute("aria-label", "Open shop");
    hudPearlEl.addEventListener("click", () => { playSfx("open"); openSheet("shopSheet"); });
  }
  els.shopClose.addEventListener("click",     closeSheets);
  els.customizeClose.addEventListener("click",closeSheets);
  els.settingsClose.addEventListener("click", closeSheets);
  els.mapClose.addEventListener("click",      closeSheets);
  els.sheetBackdrop.addEventListener("click", closeSheets);

  // ── Onboarding ────────────────────────────────────────────────────────────
  els.onboardNext.addEventListener("click", onboardAdvance);
  els.onboardBack.addEventListener("click", onboardGoBack);
  els.onboardSkip.addEventListener("click", finishOnboarding);
  els.replayIntroBtn.addEventListener("click", () => { closeSheets(); showOnboarding(); });
  els.clearProgressBtn.addEventListener("click", clearProgress);

  // ── Customize sheet: tea base + topping (rendered from BASES/TOPPINGS) ────
  renderCustomizeOptions();
  els.baseGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-base]");
    if (btn) setBase(btn.dataset.base);
  });
  els.toppingRow.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-topping]");
    if (btn) setChoice("topping", btn.dataset.topping);
  });

  // ── App blocking (native picker on iPhone; preview/hint on web) ───────────
  els.previewRestrictionBtn.addEventListener("click", () => {
    els.restrictionPreview.classList.toggle("hidden");
  });
  els.chooseAppsBtn.addEventListener("click", () => { playSfx("tap"); FocusBlocker.pickApps(); });

  // ── Reward dialog ────────────────────────────────────────────────────────
  els.rewardDialog.addEventListener("close", onRewardDialogClose);
  els.saveRewardBtn.addEventListener("click", () => {
    // dialog closes via form method=dialog, then onRewardDialogClose fires
  });

  // ── Break controls ───────────────────────────────────────────────────────
  els.startBreakBtn.addEventListener("click", startBreak);
  els.skipBreakBtn.addEventListener("click", skipBreak);
  els.skipBreakRunningBtn.addEventListener("click", skipBreak);
  els.breakMinus.addEventListener("click", () => adjustBreakDuration(-300));
  els.breakPlus.addEventListener("click", () => adjustBreakDuration(300));

  // ── Tap Mr. Tapioca for a little personality line ────────────────────────
  els.makerWrap.addEventListener("click", showMakerLine);

  // ── Games ────────────────────────────────────────────────────────────────
  els.playGameBtn.addEventListener("click", startPearlGame);
  els.quitGameBtn.addEventListener("click", stopGame);
  els.gameCloseBtn.addEventListener("click", () => { els.pearlGame.style.display = "none"; });

  els.playPlinkoBtn.addEventListener("click", openPlinko);
  els.quitPlinkoBtn.addEventListener("click", closePlinko);
  els.plinkoDropBtn.addEventListener("click", dropPearl);
  els.plinkoAgainBtn.addEventListener("click", () => {
    els.plinkoResult.style.display = "none";
    drawPlinkoBoard(-1);
    els.plinkoDropBtn.disabled = false;
  });
  els.plinkoDoneBtn.addEventListener("click", closePlinko);

  // ── Cup Pong ──────────────────────────────────────────────────────────────
  els.playPongBtn.addEventListener("click", openPong);
  els.quitPongBtn.addEventListener("click", closePong);
  els.pongCloseBtn.addEventListener("click", closePong);

  const pongDown = (e) => {
    if (!pong.active || pong.phase !== "aim" || pong.throwsLeft <= 0) return;
    e.preventDefault();
    pong.dragStart = pongPoint(e);
    pong.drag = pong.dragStart;
  };
  const pongMove = (e) => {
    if (!pong.active || pong.phase !== "aim" || !pong.dragStart) return;
    e.preventDefault();
    pong.drag = pongPoint(e);
  };
  const pongUp = (e) => {
    if (!pong.active) return;
    if (pong.dragStart) { e.preventDefault(); pongLaunch(); }
  };
  els.pongCanvas.addEventListener("mousedown", pongDown);
  els.pongCanvas.addEventListener("mousemove", pongMove);
  window.addEventListener("mouseup", pongUp);
  els.pongCanvas.addEventListener("touchstart", pongDown, { passive: false });
  els.pongCanvas.addEventListener("touchmove", pongMove, { passive: false });
  els.pongCanvas.addEventListener("touchend", pongUp, { passive: false });

  // ── Touch controls for pearl game ────────────────────────────────────────
  els.gameArea.addEventListener("touchstart", e => {
    e.preventDefault();
    game.touchStartX = e.touches[0].clientX;
    game.touchStartCupX = game.cupX;
  }, { passive: false });
  els.gameArea.addEventListener("touchmove", e => {
    e.preventDefault();
    if (!game.active) return;
    const dx = e.touches[0].clientX - game.touchStartX;
    game.cupX = Math.max(0, Math.min(els.gameArea.offsetWidth - GAME_CUP_W, game.touchStartCupX + dx));
    els.gameCup.style.left = Math.round(game.cupX) + "px";
  }, { passive: false });

  // ── Keyboard controls (pearl game) ───────────────────────────────────────
  document.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft")  { e.preventDefault(); game.keysLeft = true; }
    if (e.key === "ArrowRight") { e.preventDefault(); game.keysRight = true; }
  });
  document.addEventListener("keyup", e => {
    if (e.key === "ArrowLeft")  game.keysLeft = false;
    if (e.key === "ArrowRight") game.keysRight = false;
  });

  // ── Keep the focus session running while the screen is off / app is away ──
  // (Locking your phone to study IS focusing — the time should still count, and
  // the session should complete + offer a break when you come back. Earlier this
  // paused on hide, so on a phone the auto-lock killed every session before the
  // break.) We just bank progress on hide and catch up on return.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (state.running) saveState();   // persist in case the OS kills the tab
    } else if (document.visibilityState === "visible") {
      if (state.running && state.phase === "focus") {
        tick();   // catch up the elapsed time spent away; may complete -> break offer
      }
    }
  });
  // Last-chance save + audio cleanup if the tab/app is actually closed
  window.addEventListener("pagehide", () => {
    if (state.phase === "focus") saveState();
    stopMusic(true);
    stopAmbience(true);
  });
}

loadState();
wireEvents();

// Reflect persisted prefs in the UI before first paint
document.querySelectorAll(".size-btn").forEach(b => {
  b.classList.toggle("active", b.dataset.mode === state.mode);
});
if (els.customStepper) els.customStepper.classList.toggle("hidden", state.mode !== "custom");
updateCustomDisplay();
renderVolumeControls();
renderDevToggle();
renderAmbiencePicker();

renderAll();
setMakerState("idle");
scheduleFidget();     // start the occasional idle look-around
checkBadges(false);   // baseline already-earned badges silently (no toast spam on load)

// First-time visitors get the welcome tour
if (!state.onboarded) showOnboarding();

// ── PWA: register the service worker so the app installs + works offline ──────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// ── PWA install prompt (Android real prompt + iOS Add-to-Home-Screen hint) ───
let deferredInstall = null;

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function isiOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function installDismissed() {
  return localStorage.getItem("bobaFocusInstallDismissed") === "1";
}

function showInstallBanner(kind) {
  if (!els.installBanner) return;
  if (isStandalone() || installDismissed() || !state.onboarded) return;   // don't stack on the welcome tour
  if (kind === "ios") {
    els.installText.textContent = "Add to Home Screen: tap Share, then “Add to Home Screen.”";
    els.installBtn.style.display = "none";
  } else {
    els.installText.textContent = "Install Mr. Tapioca for the full-screen app.";
    els.installBtn.style.display = "";
  }
  els.installBanner.hidden = false;
  requestAnimationFrame(() => els.installBanner.classList.add("show"));
}
function hideInstallBanner() {
  if (!els.installBanner) return;
  els.installBanner.classList.remove("show");
  setTimeout(() => { els.installBanner.hidden = true; }, 340);
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();         // suppress the mini-infobar; we show our own
  deferredInstall = e;
  showInstallBanner("android");
});
window.addEventListener("appinstalled", () => {
  deferredInstall = null;
  localStorage.setItem("bobaFocusInstallDismissed", "1");
  hideInstallBanner();
});

if (els.installBtn) {
  els.installBtn.addEventListener("click", async () => {
    if (!deferredInstall) { hideInstallBanner(); return; }
    deferredInstall.prompt();
    try { await deferredInstall.userChoice; } catch (e) {}
    deferredInstall = null;
    hideInstallBanner();
  });
}
if (els.installDismiss) {
  els.installDismiss.addEventListener("click", () => {
    localStorage.setItem("bobaFocusInstallDismissed", "1");
    hideInstallBanner();
  });
}

// iOS Safari never fires beforeinstallprompt — surface the A2HS hint ourselves.
if (isiOS() && !isStandalone() && !installDismissed()) {
  setTimeout(() => showInstallBanner("ios"), 4000);
}
