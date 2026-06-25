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

const BASES = {
  classic:    { label: "Classic Milk Tea",   color: "#c98555" },
  taro:       { label: "Taro Milk Tea",       color: "#b58bdc" },
  matcha:     { label: "Matcha Milk Tea",     color: "#76a86a" },
  strawberry: { label: "Strawberry Milk Tea", color: "#f07c93" },
  brownsugar: { label: "Brown Sugar Tiger",   color: "#8b4513" },
  ube:        { label: "Ube Dream",           color: "#6b3d9a" },
  lavender:   { label: "Lavender Mist",       color: "#c4b5e8" }
};

const TOPPINGS = {
  pearls:  "Tapioca Pearls",
  jelly:   "Lychee Jelly",
  pudding: "Egg Pudding",
  foam:    "Cheese Foam",
  coconut: "Coconut Jelly"
};

const SHOP_CATEGORIES = ["Tea Base", "Topping", "Cup Sticker", "Character Skin", "Shop Theme"];

const DEFAULTS = {
  base: "classic", topping: "pearls", sticker: "Focus",
  skin: "", shopTheme: "cozy"
};

const SHOP_ITEMS = [
  { id: "base-taro",       name: "Taro Milk Tea",      desc: "The classic purple",                  category: "Tea Base",    type: "base",      value: "taro",       price: 20, color: "#b58bdc" },
  { id: "base-matcha",     name: "Matcha Milk Tea",     desc: "Earthy green",                        category: "Tea Base",    type: "base",      value: "matcha",     price: 20, color: "#76a86a" },
  { id: "base-strawberry", name: "Strawberry Milk Tea", desc: "Sweet pink",                          category: "Tea Base",    type: "base",      value: "strawberry", price: 25, color: "#f07c93" },
  { id: "base-brownsugar", name: "Brown Sugar Tiger",   desc: "Dark caramel swirl, the trendy one",  category: "Tea Base",    type: "base",      value: "brownsugar", price: 40, color: "#8b4513" },
  { id: "base-ube",        name: "Ube Dream",           desc: "Deep jewel purple, very aesthetic",   category: "Tea Base",    type: "base",      value: "ube",        price: 40, color: "#6b3d9a" },
  { id: "base-lavender",   name: "Lavender Mist",       desc: "Soft lilac, feels cottagecore",       category: "Tea Base",    type: "base",      value: "lavender",   price: 45, color: "#c4b5e8" },

  { id: "topping-jelly",   name: "Lychee Jelly",        desc: "Wobbly pink bits",                    category: "Topping",     type: "topping",   value: "jelly",      price: 15, color: "#ee5b7f" },
  { id: "topping-pudding", name: "Egg Pudding",          desc: "Soft golden cubes",                   category: "Topping",     type: "topping",   value: "pudding",    price: 15, color: "#f7cb59" },
  { id: "topping-foam",    name: "Cheese Foam",          desc: "The fancy top-tier one",              category: "Topping",     type: "topping",   value: "foam",       price: 25, color: "#fff0c8" },
  { id: "topping-coconut", name: "Coconut Jelly",        desc: "White, translucent, tropical",        category: "Topping",     type: "topping",   value: "coconut",    price: 30, color: "#e8f5e2" },

  { id: "sticker-finals",  name: "Finals",               desc: "For the grind season",                category: "Cup Sticker", type: "sticker",   value: "Finals",     price: 10, color: "#fff3d4" },
  { id: "sticker-library", name: "Library",              desc: "Main library character",              category: "Cup Sticker", type: "sticker",   value: "Library",    price: 10, color: "#d4eeff" },
  { id: "sticker-thesis",  name: "Thesis Era",           desc: "For the real ones",                   category: "Cup Sticker", type: "sticker",   value: "Thesis Era", price: 15, color: "#ffd4ec" },
  { id: "sticker-main",    name: "Main Character",       desc: "No explanation needed",               category: "Cup Sticker", type: "sticker",   value: "Main Char",  price: 15, color: "#ffe4d4" },
  { id: "sticker-dnd",     name: "Do Not Disturb",       desc: "Actually leave me alone",             category: "Cup Sticker", type: "sticker",   value: "DND",        price: 15, color: "#f0d4ff" },
  { id: "sticker-szn",     name: "Study Szn",            desc: "It's giving seasonal",                category: "Cup Sticker", type: "sticker",   value: "Study Szn",  price: 15, color: "#d4ffec" },

  // Default skin
  { id: "skin-default",    name: "Mr. Tapioca",    desc: "The original",          category: "Character Skin", type: "skin", value: "",           price: 0,  img: "assets/Mr. Tapioca.png"      },

  // 20-pearl skins
  { id: "skin-grad-cap",   name: "Graduation Cap", desc: "Scholar energy",        category: "Character Skin", type: "skin", value: "grad-cap",   price: 20, img: "assets/Graduation Cap.png"   },
  { id: "skin-flower",     name: "Flower Crown",   desc: "In full bloom",         category: "Character Skin", type: "skin", value: "flower",     price: 20, img: "assets/Flower Crown.png"     },
  { id: "skin-scarf",      name: "Scarf",          desc: "Cozy and warm",         category: "Character Skin", type: "skin", value: "scarf",      price: 20, img: "assets/Scarf.png"            },
  { id: "skin-shades",     name: "Sunglasses",     desc: "Too cool for school",   category: "Character Skin", type: "skin", value: "shades",     price: 20, img: "assets/Sunglasses.png"       },

  // 35-pearl skins
  { id: "skin-strawberry", name: "Strawberry",     desc: "Sweet and cute",        category: "Character Skin", type: "skin", value: "strawberry", price: 35, img: "assets/Strawberry.png"       },
  { id: "skin-astro-blue", name: "Astronaut",      desc: "Space mode on",         category: "Character Skin", type: "skin", value: "astro-blue", price: 35, img: "assets/Astronaut, blue.png"  },
  { id: "skin-dragon",     name: "Dragon",         desc: "Breathe fire, focus",   category: "Character Skin", type: "skin", value: "dragon",     price: 35, img: "assets/Dragon.png"           },

  // Premium skins (future IAP)
  { id: "skin-ninja",      name: "Ninja",          desc: "Silent focus mode",     category: "Character Skin", type: "skin", value: "ninja",      premium: true, img: "assets/Ninja.png"            },
  { id: "skin-wizard",     name: "Wizard",         desc: "Cast your focus spell", category: "Character Skin", type: "skin", value: "wizard",     premium: true, img: "assets/Wizard.png"           },
  { id: "skin-angel",      name: "Angel",          desc: "Wings and a halo",      category: "Character Skin", type: "skin", value: "angel",      premium: true, img: "assets/Angel.png"            },
  { id: "skin-devil",      name: "Devil",          desc: "Horns and mischief",    category: "Character Skin", type: "skin", value: "devil",      premium: true, img: "assets/Devil.png"            },

  { id: "theme-cozy",      name: "Cozy",                 desc: "The classic warm shop",               category: "Backgrounds", type: "shopTheme", value: "cozy",       price: 0,  color: "#f3d8b7" },
  { id: "theme-night",     name: "Night Market",         desc: "Dark, warm lights, cozy late-night",  category: "Backgrounds", type: "shopTheme", value: "night",      price: 70, color: "#36476b" },
  { id: "theme-sakura",    name: "Sakura",               desc: "Cherry blossoms, soft pink, spring",  category: "Backgrounds", type: "shopTheme", value: "sakura",     price: 70, color: "#ffdfe8" },
  { id: "theme-autumn",    name: "Autumn Harvest",       desc: "Pumpkin spice, warm oranges, fall",   category: "Backgrounds", type: "shopTheme", value: "autumn",     price: 70, color: "#c4873a" },
  { id: "theme-rainy",     name: "Rainy Day Café",       desc: "Cool grey-blue, lo-fi, window rain",  category: "Backgrounds", type: "shopTheme", value: "rainy",      price: 70, color: "#7a9ab8" },
];

const UNLOCKS = [
  { minutes: 25, label: "Tapioca pearls" },
  { minutes: 50, label: "Lychee jelly" },
  { minutes: 90, label: "Egg pudding" },
  { minutes: 180, label: "Brown sugar syrup" },
  { minutes: 360, label: "Cheese foam" }
];

const PEARL_SIZE = 20;
const GAME_CUP_W = 80;
const GAME_CUP_H = 44;

const SLOT_REWARDS = [10, 5, 2, 1, 2, 5, 10];
const PLINKO_MAX_PLAYS = 5;
const PLINKO_ROWS = 6;

const plinko = {
  playsLeft: PLINKO_MAX_PLAYS,
  dropping: false,
  animId: null
};

const game = {
  active: false,
  score: 0,
  timeLeft: 60,
  lastTime: null,
  spawnTimer: 0,
  spawnInterval: 1.2,
  pearls: [],
  cupX: 0,
  cupSpeed: 220,
  pearlSpeed: 110,
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
  sticker: "Focus",
  skin: "",
  shopTheme: "cozy",
  soundOn: true,
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
  shopBtn:              document.querySelector("#shopBtn"),
  customizeBtn:         document.querySelector("#customizeBtn"),
  settingsBtn:          document.querySelector("#settingsBtn"),
  shopSheet:            document.querySelector("#shopSheet"),
  shopClose:            document.querySelector("#shopClose"),
  shopGrid:             document.querySelector("#shopGrid"),
  shopPearlCount:       document.querySelector("#shopPearlCount"),
  customizeSheet:       document.querySelector("#customizeSheet"),
  customizeClose:       document.querySelector("#customizeClose"),
  settingsSheet:        document.querySelector("#settingsSheet"),
  settingsClose:        document.querySelector("#settingsClose"),
  mapBtn:               document.querySelector("#mapBtn"),
  mapClose:             document.querySelector("#mapClose"),
  mapPerkBanner:        document.querySelector("#mapPerkBanner"),
  sheetBackdrop:        document.querySelector("#sheetBackdrop"),
  customStepper:        document.querySelector("#customStepper"),
  customDurationDisplay:document.querySelector("#customDurationDisplay"),
  customMinus:          document.querySelector("#customMinus"),
  customPlus:           document.querySelector("#customPlus"),
  soundToggle:          document.querySelector("#soundToggle"),
  devToggle:            document.querySelector("#devToggle"),
  statStreak:           document.querySelector("#statStreak"),
  statTotalTime:        document.querySelector("#statTotalTime"),
  statToday:            document.querySelector("#statToday"),
  statWeek:             document.querySelector("#statWeek"),
  statBest:             document.querySelector("#statBest")
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

// Every state uses a single high-res still image; bounce/stir/sleep motion
// is driven by CSS keyframes that key off the img's data-state attribute.
// (Earlier we cycled cropped frames here; one of the idle crops was mid-blink,
// which made the eye look like it disappeared.)
const MAKER_STATIC = {
  idle:     "assets/Mr. Tapioca.png",
  mixing:   "assets/Mixing.png",
  sleeping: "assets/Sleeping.png",
  shocked:  "assets/Startled.png",
  drinking: "assets/Surprised-Happy.png"
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
    img.src = SKIN_IMAGES[state.skin];
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

// ── Walk-to-the-cup choreography ──────────────────────────────────────────────
// How far right the maker glides so he stands beside the cup. ~720ms matches the
// CSS transition on .maker-wrap; tweak MIX_WALK_X if he stops short of the cup.
const MIX_WALK_X = 158;
const WALK_MS = 1050;   // keep in sync with the .maker-wrap CSS transition
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
  setWalk(0);
  // only show the walk waddle if he actually has distance to cover
  const current = parseFloat(getComputedStyle(els.makerWrap).getPropertyValue("--walk")) || 0;
  if (current !== 0) setMakerState("walking");
  walkTimer = setTimeout(() => {
    if (!state.running) setMakerState(restState);
  }, WALK_MS);
}

// ─────────────────────────────────────────────────────────────────────────────

function loadState() {
  state.collection  = JSON.parse(localStorage.getItem("bobaFocusCollection")  || "[]");
  state.rewards     = JSON.parse(localStorage.getItem("bobaFocusRewards")     || "[]");
  state.owned       = JSON.parse(localStorage.getItem("bobaFocusOwned")       || "[]");
  state.spent       = JSON.parse(localStorage.getItem("bobaFocusSpent")       || "0");
  state.bonusPearls = JSON.parse(localStorage.getItem("bobaFocusBonusPearls") || "0");
  state.skin        = localStorage.getItem("bobaFocusSkin") || "";
  state.customDuration = JSON.parse(localStorage.getItem("bobaFocusCustomDuration") || String(30 * 60));
  state.soundOn     = JSON.parse(localStorage.getItem("bobaFocusSoundOn") || "true");
  state.devMode     = JSON.parse(localStorage.getItem("bobaFocusDevMode") || "false");
  // Resume an in-progress drink across app closes
  state.mode        = localStorage.getItem("bobaFocusMode") || "small";
  state.elapsed     = JSON.parse(localStorage.getItem("bobaFocusElapsed") || "0");
}

function saveState() {
  localStorage.setItem("bobaFocusCollection",  JSON.stringify(state.collection));
  localStorage.setItem("bobaFocusRewards",      JSON.stringify(state.rewards));
  localStorage.setItem("bobaFocusOwned",        JSON.stringify(state.owned));
  localStorage.setItem("bobaFocusSpent",        JSON.stringify(state.spent));
  localStorage.setItem("bobaFocusBonusPearls",  JSON.stringify(state.bonusPearls));
  localStorage.setItem("bobaFocusSkin",         state.skin);
  localStorage.setItem("bobaFocusCustomDuration", JSON.stringify(state.customDuration));
  localStorage.setItem("bobaFocusSoundOn",      JSON.stringify(state.soundOn));
  localStorage.setItem("bobaFocusDevMode",      JSON.stringify(state.devMode));
  localStorage.setItem("bobaFocusMode",         state.mode);
  localStorage.setItem("bobaFocusElapsed",      JSON.stringify(state.elapsed));
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
  return `${BASES[state.base].label} + ${TOPPINGS[state.topping]}`;
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

function updateCup() {
  const pct = Math.round(progress() * 100);
  const remaining = modeDuration() - state.elapsed;
  els.liquid.style.setProperty("--fill", `${pct}%`);
  els.liquid.style.setProperty("--drink-color", BASES[state.base].color);
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
  els.makerSpeech.textContent = speechForState();
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

function renderShelf() {
  if (state.collection.length === 0) {
    els.shelfGrid.innerHTML = `<div class="empty-state">Finish a focus session to start your collection 🧋</div>`;
    return;
  }

  els.shelfGrid.innerHTML = state.collection
    .map((drink) => {
      return `
        <article class="shelf-item">
          <div class="shelf-cup" style="background:${drink.color}"></div>
          <div>
            <strong>${drink.name}</strong>
            <small>${minuteLabel(drink.minutes)} - ${drink.size}</small>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderRewards() {
  if (state.rewards.length === 0) {
    els.rewardList.innerHTML = `<div class="empty-state">Treat cards earned from focus sessions show up here.</div>`;
    return;
  }

  els.rewardList.innerHTML = state.rewards
    .map((reward) => {
      return `
        <article class="reward-item">
          <strong>${reward.title}</strong>
          <small>${reward.copy}</small>
        </article>
      `;
    })
    .join("");
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
  equipItem(itemId);
}

// Re-apply the maker image for the current resting/working state. Needed after
// a skin change because updateCup no longer drives maker state every tick.
function refreshMaker() {
  currentMakerState = "";
  setMakerState(state.running ? "mixing" : "idle");
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
  els.makerSpeech.textContent = item.type === "shopTheme"
    ? "Ooh, fresh backdrop."
    : "Ooh, nice pick.";
}

function unequipItem(type) {
  state[type] = DEFAULTS[type];
  saveState();
  if (type === "skin") refreshMaker();
  renderAll();
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

function startPause() {
  if (progress() >= 1 && !state.running) {
    completeSession();
    return;
  }

  state.running = !state.running;
  state.lastTick = state.running ? Date.now() : null;
  updateCup();

  if (state.running) {
    maybeRequestNotify();
    walkToCupAndMix();        // glide over to the cup, then mix
    stopTicker();
    state.timerId = setInterval(tick, 250);
  } else {
    stopTicker();
    walkToStation("idle");    // walk back to his spot
    saveState();              // bank progress whenever the user pauses
  }
}

function resetSession() {
  closePlinko();
  stopGame();
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
  state.running = false;
  state.elapsed = modeDuration();
  state.lastTick = null;
  clearTimeout(walkTimer); setWalk(0);   // step back to his station to finish up
  currentMakerState = ""; setMakerState("idle");

  const minutes = Math.round(modeDuration() / 60);
  const size    = modeLabel();
  const now = new Date();
  const drink = {
    id: crypto.randomUUID(),
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

  // Bigger drinks (more study time) map to bigger real-world partner perks
  let partner;
  if (minutes >= 300)      partner = "🌟 20% off at a partner boba shop";
  else if (minutes >= 90)  partner = "🌟 10% off at a partner boba shop";
  else                     partner = "Save this treat for later";

  const reward = {
    id: crypto.randomUUID(),
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
  notifyComplete(size);
  showReward(reward);
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
  updatePhaseUI();
}

function startBreak() {
  state.phase = "break";
  state.breakElapsed = 0;
  state.breakLastTick = Date.now();
  state.breakTimerId = setInterval(tickBreak, 250);
  scheduleMakerBreakCycle();
  plinko.playsLeft = PLINKO_MAX_PLAYS;
  updatePlinkoBtnState();
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
  stopGame();
  clearInterval(state.breakTimerId);
  state.breakTimerId = null;
  clearTimeout(state.breakMakerCycleId);
  state.breakMakerCycleId = null;
  state.breakElapsed = 0;
  state.phase = "focus";
  els.shopScene.classList.remove("is-on-break");
  currentMakerState = ""; setMakerState("idle");
  updatePhaseUI();
  renderAll();
  els.makerSpeech.textContent = "Break over. Ready for another round?";
}

function skipBreak() {
  closePlinko();
  stopGame();
  clearInterval(state.breakTimerId);
  state.breakTimerId = null;
  clearTimeout(state.breakMakerCycleId);
  state.breakMakerCycleId = null;
  state.breakElapsed = 0;
  state.phase = "focus";
  els.shopScene.classList.remove("is-on-break");
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
  const makerStates = ["drinking", "sleeping"];
  let idx = 0;

  function cycle() {
    setMakerState(makerStates[idx % makerStates.length]);
    idx++;
    state.breakMakerCycleId = setTimeout(cycle, 8000);
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

function setBase(base) {
  state.base = base;
  document.querySelectorAll(".swatch").forEach((button) => {
    button.classList.toggle("active", button.dataset.base === base);
  });
  renderAll();
  els.makerSpeech.textContent = "Fresh tea base selected.";
}

function setChoice(type, value) {
  state[type] = value;
  document.querySelectorAll(`[data-${type}]`).forEach((button) => {
    button.classList.toggle("active", button.dataset[type] === value);
  });
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
  if (!game.active) return;
  cancelAnimationFrame(game.animId);
  game.active = false;
  for (const p of game.pearls) p.el.remove();
  game.pearls = [];
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

  const areaW = els.gameArea.offsetWidth;
  const areaH = els.gameArea.offsetHeight;
  const cupTop = areaH - GAME_CUP_H - 10;

  if (game.keysLeft)  game.cupX = Math.max(0, game.cupX - game.cupSpeed * dt);
  if (game.keysRight) game.cupX = Math.min(areaW - GAME_CUP_W, game.cupX + game.cupSpeed * dt);
  els.gameCup.style.left = Math.round(game.cupX) + "px";

  const caught = [];
  const missed = [];
  for (const p of game.pearls) {
    p.y += game.pearlSpeed * dt;
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
  }

  game.spawnTimer += dt;
  if (game.spawnTimer >= game.spawnInterval) {
    game.spawnTimer -= game.spawnInterval;
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
  game.active = true;
  game.score = 0;
  game.timeLeft = 60;
  game.lastTime = null;
  game.spawnTimer = 0;
  game.pearls = [];
  game.keysLeft = false;
  game.keysRight = false;
  game.cupX = (els.gameArea.offsetWidth - GAME_CUP_W) / 2;
  els.gameCup.style.left = Math.round(game.cupX) + "px";
  els.gameScore.textContent = "⬡ 0";
  els.gameTimer.textContent = "1:00";
  els.gameResult.style.display = "none";
  els.pearlGame.style.display = "flex";
  game.animId = requestAnimationFrame(gameLoop);
}

function endPearlGame() {
  cancelAnimationFrame(game.animId);
  game.active = false;
  for (const p of game.pearls) p.el.remove();
  game.pearls = [];
  state.bonusPearls += game.score;
  saveState();
  renderAll();
  els.gameResultText.textContent = "You caught " + game.score + " pearl" + (game.score !== 1 ? "s" : "") + "! +" + game.score + " added to your stash.";
  els.gameResult.style.display = "flex";
}

// Leaving mid-session no longer spills the whole drink (long drinks are meant
// to be filled across multiple sittings). Instead we pause and bank progress,
// with a startled reaction, so the user can resume right where they left off.
function pauseAndBank() {
  stopTicker();
  state.running = false;
  state.lastTick = null;
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

function buildPlinkoWaypoints(decisions, geo) {
  const { W, slotW, topPad, rowSpacing, H, slotH } = geo;
  const waypoints = [{ x: W / 2, y: topPad - 8 }];
  let offset = 0;
  for (let r = 0; r < PLINKO_ROWS; r++) {
    offset += decisions[r] ? slotW / 2 : -slotW / 2;
    waypoints.push({ x: W / 2 + offset, y: topPad + (r + 1) * rowSpacing });
  }
  waypoints.push({ x: W / 2 + offset, y: H - slotH / 2 });
  return waypoints;
}

function updatePlinkoBtnState() {
  const left = plinko.playsLeft;
  if (left > 0) {
    els.playPlinkoBtn.textContent = `Play: Boba Plinko (${left} left)`;
    els.playPlinkoBtn.disabled = false;
  } else {
    els.playPlinkoBtn.textContent = "Boba Plinko (done for break)";
    els.playPlinkoBtn.disabled = true;
  }
}

function openPlinko() {
  if (plinko.dropping) return;
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

function dropPearl() {
  if (plinko.dropping || plinko.playsLeft <= 0) return;
  plinko.dropping = true;
  plinko.playsLeft--;
  els.plinkoDropBtn.disabled = true;
  els.plinkoResult.style.display = "none";
  updatePlinkoHUD();
  updatePlinkoBtnState();

  const geo = getPlinkoGeo();
  const decisions = Array.from({ length: PLINKO_ROWS }, () => Math.random() < 0.5);
  const slotIndex = decisions.filter(Boolean).length;
  const waypoints = buildPlinkoWaypoints(decisions, geo);

  const SEG_MS = 170;
  const totalMs = SEG_MS * (waypoints.length - 1);
  const segCount = waypoints.length - 1;
  const t0 = performance.now();

  function frame(ts) {
    const elapsed = ts - t0;
    const rawSeg = Math.min(elapsed / SEG_MS, segCount);
    const seg = Math.min(Math.floor(rawSeg), segCount - 1);
    const segT = rawSeg - seg;
    const eased = segT < 0.5 ? 2 * segT * segT : 1 - Math.pow(-2 * segT + 2, 2) / 2;
    const from = waypoints[seg];
    const to = waypoints[seg + 1];
    drawPlinkoBoard(-1);
    drawPlinkoPearl(from.x + (to.x - from.x) * eased, from.y + (to.y - from.y) * eased);

    if (elapsed < totalMs) {
      plinko.animId = requestAnimationFrame(frame);
    } else {
      plinko.dropping = false;
      plinko.animId = null;
      drawPlinkoBoard(slotIndex);
      drawPlinkoPearl(waypoints[waypoints.length - 1].x, waypoints[waypoints.length - 1].y);
      const reward = SLOT_REWARDS[slotIndex];
      state.bonusPearls += reward;
      saveState();
      renderAll();
      setTimeout(() => showPlinkoResult(reward), 600);
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
}

// ── Completion feedback: tab title, chime, notification ───────────────────────

function updateTabTitle(remainingSeconds) {
  if (state.running && state.phase === "focus") {
    document.title = `${formatTime(remainingSeconds)} · Mr. Tapioca`;
  } else {
    document.title = "Mr. Tapioca";
  }
}

// A short, gentle two-note chime synthesised with the Web Audio API (no asset).
let audioCtx = null;
function sessionChime() {
  if (!state.soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const now = audioCtx.currentTime;
    const notes = [523.25, 659.25, 783.99];  // C5, E5, G5 — a soft major arpeggio
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.14;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  } catch (e) {
    /* audio not available — fail silently */
  }
}

function renderSoundToggle() {
  els.soundToggle.classList.toggle("on", state.soundOn);
  els.soundToggle.setAttribute("aria-checked", String(state.soundOn));
}

function renderDevToggle() {
  els.devToggle.classList.toggle("on", state.devMode);
  els.devToggle.setAttribute("aria-checked", String(state.devMode));
}

// Ask for notification permission the first time a session starts (gesture-driven)
let askedNotify = false;
function maybeRequestNotify() {
  if (askedNotify) return;
  askedNotify = true;
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function notifyComplete(size) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;  // only notify if they're away
  try {
    new Notification("Your drink is ready! 🧋", {
      body: `${size} complete — great focus. Come grab it.`,
      icon: "assets/Tapioca Currency.png"
    });
  } catch (e) { /* ignore */ }
}

// ── Boba map (Leaflet + free OpenStreetMap tiles, lazy-loaded) ────────────────

// Sample shops placed as small offsets from the user's location, so the map
// looks populated wherever they are. Starred ones are "partners" with perks.
const SAMPLE_SHOPS = [
  { name: "Boba Guys",    dy:  0.0040, dx:  0.0025, partner: true,  perk: "20% off",       unlock: "Finish a Large drink" },
  { name: "Sharetea",     dy: -0.0032, dx:  0.0041, partner: true,  perk: "10% off",       unlock: "Finish a Small drink" },
  { name: "Tiger Sugar",  dy: -0.0050, dx: -0.0038, partner: true,  perk: "Free topping",  unlock: "Finish any drink" },
  { name: "Gong Cha",     dy:  0.0052, dx: -0.0030, partner: false },
  { name: "Happy Lemon",  dy:  0.0018, dx:  0.0060, partner: false },
  { name: "CoCo Fresh",   dy: -0.0061, dx:  0.0012, partner: false }
];

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
      : `<div class="map-pop-name">Example area</div><div class="map-pop-meta">Allow location to see shops near you</div>`);

  const earned = earnedPerkCount();
  SAMPLE_SHOPS.forEach(shop => {
    const slat = lat + shop.dy, slng = lng + shop.dx;
    const dist = formatDistance(haversine(lat, lng, slat, slng));
    let perkHtml = "";
    if (shop.partner) {
      perkHtml = earned > 0
        ? `<div class="map-pop-perk">✓ ${shop.perk} — you have a reward to redeem!</div>`
        : `<div class="map-pop-perk locked">${shop.perk} · ${shop.unlock}</div>`;
    }
    L.marker([slat, slng], { icon: bobaPin(shop.partner ? "⭐" : "🧋", shop.partner ? "partner" : "") })
      .addTo(mapObj)
      .bindPopup(
        `<div class="map-pop-name">${shop.partner ? "⭐ " : ""}${shop.name}</div>` +
        `<div class="map-pop-meta">${dist} away${shop.partner ? " · partner" : ""}</div>` +
        perkHtml
      );
  });

  if (earned > 0) {
    els.mapPerkBanner.textContent = `🎉 You have ${earned} reward${earned !== 1 ? "s" : ""} ready to redeem at partner shops!`;
    els.mapPerkBanner.classList.remove("hidden");
  } else {
    els.mapPerkBanner.classList.add("hidden");
  }

  setTimeout(() => mapObj.invalidateSize(), 250);
}

function wireEvents() {
  // ── Main timer controls ──────────────────────────────────────────────────
  els.startPauseBtn.addEventListener("click", startPause);
  els.resetBtn.addEventListener("click", resetSession);

  // ── Mode / size picker ───────────────────────────────────────────────────
  document.querySelectorAll(".size-btn").forEach(btn => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });
  els.customMinus.addEventListener("click", () => adjustCustomDuration(-CUSTOM_STEP));
  els.customPlus.addEventListener("click",  () => adjustCustomDuration(CUSTOM_STEP));

  // ── Sound toggle (Settings) ──────────────────────────────────────────────
  els.soundToggle.addEventListener("click", () => {
    state.soundOn = !state.soundOn;
    saveState();
    renderSoundToggle();
    if (state.soundOn) sessionChime();  // little preview when turning on
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
    els.makerSpeech.textContent = state.devMode ? "Dev mode on — everything unlocked." : "Dev mode off.";
  });

  // ── Bottom bar sheets ────────────────────────────────────────────────────
  els.shopBtn.addEventListener("click",       () => openSheet("shopSheet"));
  els.customizeBtn.addEventListener("click",  () => openSheet("customizeSheet"));
  els.settingsBtn.addEventListener("click",   () => openSheet("settingsSheet"));
  els.mapBtn.addEventListener("click",        openMap);
  els.shopClose.addEventListener("click",     closeSheets);
  els.customizeClose.addEventListener("click",closeSheets);
  els.settingsClose.addEventListener("click", closeSheets);
  els.mapClose.addEventListener("click",      closeSheets);
  els.sheetBackdrop.addEventListener("click", closeSheets);

  // ── Customize sheet: tea base, topping, shop theme ───────────────────────
  document.querySelectorAll(".swatch").forEach(button => {
    button.addEventListener("click", () => setBase(button.dataset.base));
  });
  document.querySelectorAll("[data-topping]").forEach(button => {
    button.addEventListener("click", () => setChoice("topping", button.dataset.topping));
  });

  // ── Blocked apps preview (inside settings sheet) ─────────────────────────
  els.previewRestrictionBtn.addEventListener("click", () => {
    els.restrictionPreview.classList.toggle("hidden");
  });

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

  // ── Pause + bank progress when the app is backgrounded mid-session ────────
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && state.running && state.phase === "focus") {
      pauseAndBank();
    }
  });
  // Last-chance save if the tab/app is actually closed
  window.addEventListener("pagehide", () => { if (state.phase === "focus") saveState(); });
}

loadState();
wireEvents();

// Reflect persisted prefs in the UI before first paint
document.querySelectorAll(".size-btn").forEach(b => {
  b.classList.toggle("active", b.dataset.mode === state.mode);
});
if (els.customStepper) els.customStepper.classList.toggle("hidden", state.mode !== "custom");
updateCustomDisplay();
renderSoundToggle();
renderDevToggle();

renderAll();
setMakerState("idle");

// ── PWA: register the service worker so the app installs + works offline ──────
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
