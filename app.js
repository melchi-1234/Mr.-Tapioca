const MODES = {
  custom: { label: "Custom Cup", duration: null },   // uses state.customDuration (15 min - 4 hr, matches GOAL_MAX)
  goal:   { label: "Goal Cup",   duration: null }    // mirrors the preset focus goal (state.dailyGoal)
};

const CUSTOM_MIN = 15 * 60;
const CUSTOM_MAX = 240 * 60;
const CUSTOM_STEP = 5 * 60;
const DEV_MIN = 5;            // dev mode lets Custom drop to 5 seconds for quick testing

function fmtDuration(seconds) {
  return seconds < 60 ? `${seconds} sec` : `${Math.round(seconds / 60)} min`;
}

// Resolve the active session length in seconds (custom mode reads its own value).
// Guarded against a corrupt/zero custom value so progress() can never divide by 0
// or NaN (which would render NaN% and never let the session complete).
function modeDuration() {
  const d = state.mode === "goal" ? (state.dailyGoal || 0) * 60 : state.customDuration;
  return (typeof d === "number" && isFinite(d) && d > 0) ? d : 30 * 60;
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
  { id: "skin-default",    name: "Mr. Tapioca",    desc: "The Original",          category: "Character Skin", type: "skin", value: "",           price: 0,  img: "assets/Mr. Tapioca.png"      },

  // common skins
  { id: "skin-grad-cap",   name: "Boba Cum Laude",       desc: "Graduation Cap",  category: "Character Skin", type: "skin", value: "grad-cap",   price: 40, img: "assets/Graduation Cap.png"   },
  { id: "skin-flower",     name: "Hippie Sippy",         desc: "Flower Crown",    category: "Character Skin", type: "skin", value: "flower",     price: 40, img: "assets/Flower Crown.png"     },
  { id: "skin-scarf",      name: "Hot Oolong",           desc: "Scarf",           category: "Character Skin", type: "skin", value: "scarf",      price: 40, img: "assets/Scarf.png"            },
  { id: "skin-shades",     name: "Too Cool for School",  desc: "Shades",          category: "Character Skin", type: "skin", value: "shades",     price: 40, img: "assets/Sunglasses.png"       },

  // rare skins
  { id: "skin-strawberry", name: "Berry Sweet",          desc: "Strawberry",      category: "Character Skin", type: "skin", value: "strawberry", price: 60, img: "assets/Strawberry.png"       },
  { id: "skin-astro-blue", name: "Milky Way",            desc: "Astronaut",       category: "Character Skin", type: "skin", value: "astro-blue", price: 60, img: "assets/Astronaut, blue.png"  },
  { id: "skin-dragon",     name: "Dragonfruit Tea",      desc: "Dragon",          category: "Character Skin", type: "skin", value: "dragon",     price: 60, img: "assets/Dragon.png"           },
  { id: "skin-cat-hoodie", name: "Neko Matcha",          desc: "Kitty Cat",       category: "Character Skin", type: "skin", value: "cat-hoodie", price: 60, img: "assets/Cat Hoodie.png"       },
  { id: "skin-royal",      name: "Royal Milk Tea",       desc: "Royalty",         category: "Character Skin", type: "skin", value: "royal",      price: 70, img: "assets/Royal Crown.png"      },

  // Premium skins (future IAP)
  { id: "skin-ninja",      name: "Black Tea",            desc: "Ninja",           category: "Character Skin", type: "skin", value: "ninja",      premium: true, img: "assets/Ninja.png"            },
  { id: "skin-wizard",     name: "Magical Taste",        desc: "Wizard",          category: "Character Skin", type: "skin", value: "wizard",     premium: true, img: "assets/Wizard.png"           },
  { id: "skin-angel",      name: "Holy Moly",            desc: "Angel",           category: "Character Skin", type: "skin", value: "angel",      premium: true, img: "assets/Angel.png"            },
  { id: "skin-devil",      name: "Evil Brew",            desc: "Devil",           category: "Character Skin", type: "skin", value: "devil",      premium: true, img: "assets/Devil.png"            },

  { id: "theme-cozy",      name: "Classic Brew",         desc: "The Classic, Warm Shop",                    category: "Backgrounds", type: "shopTheme", value: "cozy",       price: 0,   color: "#f3d8b7" },
  { id: "theme-night",     name: "Brown Sugar Night",    desc: "Dim Lights, Cozy Nights",                   category: "Backgrounds", type: "shopTheme", value: "night",      price: 60, color: "#36476b" },
  { id: "theme-sakura",    name: "Sakura Latte",         desc: "Soft Pink, Cherry Blossoms",                category: "Backgrounds", type: "shopTheme", value: "sakura",     price: 60, color: "#ffdfe8" },
  { id: "theme-autumn",    name: "Pumpkin Spice Chai",   desc: "Warm Orange, Fall Vibes",                   category: "Backgrounds", type: "shopTheme", value: "autumn",     price: 60, color: "#c4873a" },
  { id: "theme-rainy",     name: "Earl Grey Rain",       desc: "Cool Grey-Blue, Lo-fi",                     category: "Backgrounds", type: "shopTheme", value: "rainy",      price: 60, color: "#7a9ab8" },
  { id: "theme-winter",    name: "Frosted Milk Tea",     desc: "Falling Snow, Fairy Lights",                category: "Backgrounds", type: "shopTheme", value: "winter",     premium: true, color: "#bcd3e0" },
  { id: "theme-galaxy",    name: "Taro Galaxy",          desc: "Twinkling Cosmos, Drifting Stars",          category: "Backgrounds", type: "shopTheme", value: "galaxy",     premium: true, color: "#cdbfe6" },
  { id: "theme-library",   name: "Honeymilk Library",    desc: "Unlimited Bookshelves, Quiet Lamp-lighting", category: "Backgrounds", type: "shopTheme", value: "library",    premium: true, color: "#e8c98f" },
  { id: "theme-sunset",    name: "Mango Sunset",         desc: "Golden Hour, Ocean Air",                    category: "Backgrounds", type: "shopTheme", value: "sunset",     premium: true, color: "#f4b9a1" },

  // Boosts — repeatable CONSUMABLES (tracked by count, not one-time ownership)
  { id: "boost-freeze",    name: "Brain Freeze",         desc: "Saves your most recent focus streak", category: "Boosts", type: "consumable", consumableKey: "freezes", price: 10, icon: "🧊" },
];

const UNLOCKS = [
  { minutes: 25, label: "Tapioca pearls" },
  { minutes: 50, label: "Lychee jelly" },
  { minutes: 90, label: "Egg pudding" },
  { minutes: 180, label: "Brown sugar syrup" },
  { minutes: 360, label: "Cheese foam" }
];

const PEARL_SIZE = 26;        // bigger, reads as a real boba pearl
const ICE_SIZE   = 30;        // junk to dodge — chunky ice cube
const GAME_CUP_W = 104;       // wide cute bowl-cup (was a too-small 72px PNG)
const GAME_CUP_H = 76;
// Catch hitbox: only the OPEN MOUTH of the cup counts, inset from the rim so
// the catch reads honestly (pearl must drop INTO the cup, not graze the edge).
const CUP_CATCH_INSET = 12;   // px trimmed off each side of the visual width
const CUP_LIP_Y       = 16;   // catch line sits at the rim, not the cup bottom

// Catch tuning — a ~28s skill sprint, good run ≈ 10-18 catches (not 30+).
const CATCH_DURATION  = 20;
const CATCH_FALL_BASE = 300;  // px/s at t=0 (was 230)
const CATCH_FALL_RAMP = 16;   // px/s added per elapsed second (was 5)
const CATCH_SPAWN_BASE = 0.95;// s between spawns at start (was 0.8)
const CATCH_SPAWN_MIN  = 0.50;// fastest spawn (was 0.42)
const CATCH_SPAWN_RAMP = 0.018;// spawn tightening per second (was 0.008)
const CATCH_CUP_SPEED  = 460;  // arrow-key px/s (was 360) — cup is wider, must keep up
const GOLDEN_CHANCE = 0.12;    // golden pearl: worth 3, sparkles
const ICE_CHANCE    = 0.12;    // ice cube: catching it breaks your combo
const BOMB_CHANCE   = 0.11;    // 💣 bomb: catching it costs points + breaks combo — DODGE
const BOMB_PENALTY  = 3;       // points lost for catching a bomb
const BOMB_SIZE     = 30;      // chunky + unmistakable
const GOLDEN_VALUE  = 3;

// Break games are a small once-per-day bonus, not a pearl farm (see CATCH_CAP,
// gameDoneToday). Rewards are intentionally modest vs. honest focus earning.
const SLOT_REWARDS = [5, 3, 1, 1, 1, 3, 5];   // edges rare & rewarding, center likely & small
const REWARD_UNBLOCKED_FRACTION = 0.5;        // native focus with NO apps blocked earns half pearls (web = full)
// Designed landing odds (NOT raw physics): the old peg geometry actually funneled
// pearls to the high edges (paying ~9.4/day). We now pick a slot from this cozy
// bell curve and steer the pearl there → edges ~7-9%, center ~20%, ~6.2/day avg.
const SLOT_WEIGHTS = [4, 10, 17, 18, 17, 10, 4];
const PLINKO_MAX_PLAYS = 3;
const PLINKO_ROWS = 6;
const CATCH_CAP = 10;   // max pearls a single Catch session can bank

const plinko = {
  playsLeft: PLINKO_MAX_PLAYS,
  dropping: false,
  animId: null,
  targetSlot: 0
};

const PONG_MAX_PLAYS = 4;
const PONG_R = 11;         // smaller pearl clears the rim more easily
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
  cupSettle: 0,           // >0 = cup held still (first-throw grace)
  animId: null,
  lastTs: null
};

const game = {
  active: false,
  score: 0,            // total pearl value caught (golden counts as GOLDEN_VALUE)
  caught: 0,           // count of catches (for combo / "you caught N" copy)
  combo: 0,            // current streak of consecutive catches
  bestCombo: 0,
  timeLeft: CATCH_DURATION,
  elapsed: 0,
  lastTime: null,
  spawnTimer: 0,
  pearls: [],
  cupX: 0,
  cupSpeed: CATCH_CUP_SPEED,
  animId: null,
  keysLeft: false,
  keysRight: false,
  touchStartX: 0,
  touchStartCupX: 0,
  cupBumpUntil: 0      // ms timestamp: cup squash-pop animation end
};

const state = {
  mode: "custom",
  customDuration: 30 * 60,
  base: "classic",
  topping: "pearls",
  unlockedBases: ["classic"],
  unlockedToppings: ["pearls"],
  sticker: "Focus",
  skin: "",
  shopTheme: "cozy",
  displayName: "",       // Study Squad profile name
  friends: [],           // Study Squad: [{id,name,mins,drinks,streak,skin,ts}]
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
  bonusPearls: 0,
  blockPenalty: 0,       // pearls withheld for completing native focus sessions with no apps blocked
  blockPromptDismissed: false,  // user chose "don't ask again" on the start-focus blocking prompt
  shieldWasUp: false,    // persisted "shield engaged this session" — survives an app kill so a
                         // session that finishes while away still earns FULL pearls at boot
  gamePearls: 0,         // cumulative pearls won from break games (for the "Break Champ" badge)
  quests: null,          // daily quests: { day, active:[{key,prog,done}] }
  freezes: 0,            // Streak Reset consumables owned (storage key predates the rename)
  frozenDays: [],        // ordinals auto-protected by a consumed freeze (bridge streak gaps)
  renames: 0             // paid name changes done (0 = next costs 500 pearls, ≥1 = real money)
};

const els = {
  shopScene:            document.querySelector("#shopScene"),
  focusCup:             document.querySelector("#focusCup"),
  liquid:               document.querySelector("#liquid"),
  liqSurface:           document.querySelector("#liqSurface"),
  foamBand:             document.querySelector("#foamBand"),
  focusSticker:         document.querySelector("#focusSticker"),
  focusMakerCharacter:  document.querySelector("#focusMakerCharacter"),
  makerWrap:            document.querySelector("#makerWrap"),
  makerSpeech:          document.querySelector("#makerSpeech"),
  progressBar:          document.querySelector("#progressBar"),
  sessionLabel:         document.querySelector("#sessionLabel"),
  timerText:            document.querySelector("#timerText"),
  timerCard:            document.querySelector("#timerCard"),
  startPauseBtn:        document.querySelector("#startPauseBtn"),
  resetBtn:             document.querySelector("#resetBtn"),
  baseGrid:             document.querySelector("#baseGrid"),
  toppingRow:           document.querySelector("#toppingRow"),
  focusControls:        document.querySelector("#focusControls"),
  pearlCount:           document.querySelector("#pearlCount"),
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
  chooseAppsBtn:        document.querySelector("#chooseAppsBtn"),
  blockPrompt:          document.querySelector("#blockPrompt"),
  blockChooseBtn:       document.querySelector("#blockChooseBtn"),
  blockSkipBtn:         document.querySelector("#blockSkipBtn"),
  blockNeverBtn:        document.querySelector("#blockNeverBtn"),
  blockPill:            document.querySelector("#blockPill"),
  blockPillLabel:       document.querySelector("#blockPillLabel"),
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
  gameCombo:            document.querySelector("#gameCombo"),
  gameScore:            document.querySelector("#gameScore"),
  gameTimer:            document.querySelector("#gameTimer"),
  gameResult:           document.querySelector("#gameResult"),
  gameResultEyebrow:    document.querySelector("#gameResultEyebrow"),
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
  mapShopList:          document.querySelector("#mapShopList"),
  friendsBtn:           document.querySelector("#friendsBtn"),
  friendsClose:         document.querySelector("#friendsClose"),
  questsBtn:            document.querySelector("#questsBtn"),
  questsClose:          document.querySelector("#questsClose"),
  sheetBackdrop:        document.querySelector("#sheetBackdrop"),
  onboarding:           document.querySelector("#onboarding"),
  onboardImg:           document.querySelector("#onboardImg"),
  onboardEmoji:         document.querySelector("#onboardEmoji"),
  onboardTitle:         document.querySelector("#onboardTitle"),
  onboardBody:          document.querySelector("#onboardBody"),
  onboardNameInput:     document.querySelector("#onboardNameInput"),
  onboardDots:          document.querySelector("#onboardDots"),
  onboardBack:          document.querySelector("#onboardBack"),
  onboardNext:          document.querySelector("#onboardNext"),
  onboardSkip:          document.querySelector("#onboardSkip"),
  replayIntroBtn:       document.querySelector("#replayIntroBtn"),
  changeNameBtn:        document.querySelector("#changeNameBtn"),
  customMinus:          document.querySelector("#customMinus"),
  customPlus:           document.querySelector("#customPlus"),
  musicVol:             document.querySelector("#musicVol"),
  musicVolLabel:        document.querySelector("#musicVolLabel"),
  sfxVol:               document.querySelector("#sfxVol"),
  sfxVolLabel:          document.querySelector("#sfxVolLabel"),
  installBanner:        document.querySelector("#installBanner"),
  installText:          document.querySelector("#installText"),
  installBtn:           document.querySelector("#installBtn"),
  installDismiss:       document.querySelector("#installDismiss"),
  devToggle:            document.querySelector("#devToggle"),
  statStreak:           document.querySelector("#statStreak"),
  streakFreezeNote:     document.querySelector("#streakFreezeNote"),
  statTotalTime:        document.querySelector("#statTotalTime"),
  statWeeklyAvg:        document.querySelector("#statWeeklyAvg"),
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
  "wizard":     "assets/Wizard.png",
  "cat-hoodie": "assets/Cat Hoodie.png",
  "royal":      "assets/Royal Crown.png"
};

// Per-skin pose sets — each generated as a single 2x2 sprite sheet (one render,
// so the 4 poses share the exact same color) from that skin + the base
// Mr. Tapioca as references, then sliced (see tools/slice-sheet.py). Keyed by
// skin value → { mixing, sleeping, drinking }; any missing state falls back to
// the skin's single portrait above.
// Skins keep their ONE real portrait for every state. The drawn per-skin "sleepy"
// art in assets/poses/ was AI-generated separately and doesn't match the awake
// portraits (e.g. the astronaut's helmet is totally different), so we DON'T swap to
// it — instead skins get a consistent "dozing" CSS treatment (lean + breathe + dim +
// zzz) while napping (see .is-napping.skin-awake in styles.css). The BASE character
// still uses its real eyes-closed Sleeping.png (that one is on-model).
const SKIN_POSES = {};

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
  sleeping: "assets/Sleeping.png",        // real eyes-closed nap pose (was the awake portrait)
  drinking: "assets/Mr. Tapioca.png",
  shocked:  "assets/Mr. Tapioca.png"
};

let currentMakerState = "";

// ── Sprite engine ────────────────────────────────────────────────────────────
// OPTIONAL frame-by-frame animation. Drop a horizontal sprite-strip PNG at
// assets/sprites/<skin>/<state>.png, declare it in assets/sprites/sprites.json,
// and the maker animates real frames via a pure-CSS steps() background scroll
// (no per-frame JS). Anything not declared OR not yet decoded falls back, byte
// for byte, to the static portrait + CSS motion below — so a missing, typo'd, or
// malformed sheet degrades silently to today's behaviour. See assets/SPRITES.md.
const TRANSPARENT_1PX =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const SpriteEngine = {
  sheets: { skins: {} },
  defaults: { fps: 10, loop: true },
  ready: {},          // "skin/state" -> true once that sheet has decoded cleanly
  loaded: false,
  async load() {
    let data = null;
    try {
      const res = await fetch("assets/sprites/sprites.json", { cache: "no-cache" });
      if (res.ok) data = await res.json();
    } catch (e) { /* no manifest → stay in static mode, silently */ }
    this.loaded = true;
    if (!data || typeof data !== "object" || !data.skins) return;
    this.sheets = data;
    if (data.defaults) this.defaults = Object.assign({}, this.defaults, data.defaults);
    // Preload ONLY what can render right now: the base character + the equipped
    // skin. Decoding every skin's sheet up front was ~14MB of pixels at boot —
    // the other skins preload the moment they're equipped (ensureSkin below).
    const equipped = localStorage.getItem("bobaFocusSkin") || "";
    this.ensureSkin("base");
    if (equipped && equipped !== "base") this.ensureSkin(equipped);
  },
  // Preload + decode one skin's sheets so its first play never flashes and the
  // service worker runtime-caches them. Mark ready only on a clean load.
  _loading: {},
  ensureSkin(skin) {
    const states = (this.sheets.skins || {})[skin] || {};
    Object.keys(states).forEach((st) => {
      const entry = states[st];
      if (!entry || !entry.sheet) return;
      const key = skin + "/" + st;
      if (this.ready[key] || this._loading[key]) return;
      this._loading[key] = true;
      const img = new Image();
      const mark = () => {
        if (SpriteEngine.ready[key]) return;
        SpriteEngine.ready[key] = true;
        SpriteEngine._refresh();
      };
      img.onload = mark;                 // reliable readiness signal
      img.onerror = () => {};            // missing/broken sheet → stays unready → fallback
      img.src = "assets/sprites/" + entry.sheet;
      // decode() avoids a first-play flash, but is only an enhancement — onload
      // already marks ready, so a hung/rejected decode() never blocks animation.
      if (img.decode) img.decode().then(mark).catch(() => {});
    });
  },
  // Re-apply the live state so a just-decoded sheet upgrades in place.
  // Debounced: a burst of decodes at boot re-applied (and restarted) the live
  // animation once PER SHEET — visible stutter on slow first loads.
  _refreshT: null,
  _refresh() {
    clearTimeout(this._refreshT);
    this._refreshT = setTimeout(() => {
      const cur = currentMakerState;
      if (!cur || !els.focusMakerCharacter) return;
      currentMakerState = "";
      setMakerState(cur);
    }, 120);
  },
  _entry(skin, st) {
    const s = this.sheets.skins || {};
    return (s[skin] && s[skin][st]) || null;
  },
  // Resolve to THIS skin's own sheet only (a sprite carries the character's
  // identity, so we never substitute the base character for an equipped skin —
  // that would put it off-model). No sheet → null → caller draws the skin's
  // static portrait. "base" is just the no-skin default character's key.
  resolve(skin, st) {
    const e = this._entry(skin, st);
    return (e && e.sheet && this.ready[skin + "/" + st]) ? e : null;
  },
  apply(img, entry) {
    const frames = Math.max(1, entry.frames || 1);
    const fps = entry.fps || this.defaults.fps || 10;
    const loop = (entry.loop !== undefined) ? entry.loop : this.defaults.loop;
    img.src = TRANSPARENT_1PX;                 // blank the <img> bitmap; the bg paints frames
    img.style.backgroundImage = 'url("assets/sprites/' + entry.sheet + '")';
    img.style.backgroundSize = (frames * 100) + "% 100%";   // strip = N×element wide
    img.classList.add("is-sprite");
    // Set the animation inline (literal frame count → steps() always parses; clean
    // restart on every state change). steps(N, jump-none) lands one whole frame per
    // stop, including the last, so an N-frame strip shows all N frames evenly.
    img.style.animation = "none";
    void img.offsetWidth;                      // force reflow so it restarts from frame 0
    if (frames <= 1 || prefersReducedMotion()) {
      img.style.animation = "none";            // single frame / calm mode → hold frame 0
    } else {
      img.style.animation = "sprite-play " + (frames / fps).toFixed(3) + "s steps(" +
        frames + ", jump-none) " + (loop ? "infinite" : "1") + (loop ? "" : " forwards");
    }
  },
  clear(img) {
    if (!img.classList.contains("is-sprite")) return;
    img.classList.remove("is-sprite");
    img.style.backgroundImage = "";
    img.style.backgroundSize = "";
    img.style.animation = "";                  // hand motion back to the CSS data-state keyframes
  }
};

function setMakerState(stateName) {
  if (stateName === currentMakerState) return;
  currentMakerState = stateName;

  const img = els.focusMakerCharacter;
  img.dataset.state = stateName;
  els.shopScene.classList.toggle("is-napping", stateName === "sleeping");

  // Sprite mode: if a strip is declared + decoded for this (skin, state), animate
  // real frames. Otherwise clear sprite mode and fall through to the static art.
  const entry = SpriteEngine.resolve(state.skin || "base", stateName);
  if (entry) { SpriteEngine.apply(img, entry); return; }
  SpriteEngine.clear(img);

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
// disturbing its looping idle/mixing animation. Applied to the WRAP, not the
// img — the sprite engine sets the img's animation inline, which would
// override (i.e. silently kill) any class-based animation on the img itself.
function pulseMaker(cls, ms) {
  const wrap = els.makerWrap;
  wrap.classList.remove(cls);
  void wrap.offsetWidth;       // force reflow so the animation restarts
  wrap.classList.add(cls);
  setTimeout(() => wrap.classList.remove(cls), ms);
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
// How far right the maker walks to reach the cup and stir it. During focus the
// counter is lifted above him (.scene.is-focusing .work-counter) so he tucks
// BEHIND the counter + cup to stir, with the cup staying visible in front. Tuned
// so his face peeks out just left of the cup. WALK_MS must match the .maker-wrap
// CSS transition (1050ms).
const MIX_WALK_X = 118;
const WALK_MS = 1050;   // keep in sync with the .maker-wrap CSS transition (1050ms)
let walkTimer = null;

function setWalk(px) {
  els.makerWrap.style.setProperty("--walk", px + "px");
}

// Walk over to the cup, then start mixing once he arrives. The distance is
// computed from the cup's ACTUAL on-screen position so he reaches it on any
// viewport width (a fixed pixel walk fell short on wider phones). He stays in
// front of the counter and leans into the cup's left edge to stir.
function walkToCupAndMix() {
  clearTimeout(walkTimer);
  setMakerState("walking");
  requestAnimationFrame(() => {
    const wrap = els.makerWrap, cup = els.focusCup;
    if (wrap && cup) {
      const cupRect = cup.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      // MID-TRANSITION FIX: --walk holds the TARGET, but wrapRect reflects the
      // CURRENT visual position. Mixing the two (old code) made a pause→quick
      // resume land him short of the cup, stirring the air. Derive the actual
      // rendered translateX from the transform matrix instead, so
      // walk = currentVisualX + (gap to cup) is exact from any mid-walk point.
      let visualX = 0;
      try {
        const t = getComputedStyle(wrap).transform;
        if (t && t !== "none") visualX = new DOMMatrixReadOnly(t).m41;
      } catch (e) {
        visualX = parseFloat(getComputedStyle(wrap).getPropertyValue("--walk")) || 0;
      }
      // Land the maker box's right edge near the cup's centre so he stands right
      // beside the cup and leans in to stir (cup's right half stays visible).
      const targetRight = cupRect.left + cupRect.width * 0.45;
      const walk = Math.max(0, visualX + (targetRight - wrapRect.right));
      setWalk(walk);
    } else {
      setWalk(MIX_WALK_X);   // fallback if rects unavailable
    }
  });
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

// Cross-tab identity + sync plumbing (see the "storage" listener in wireEvents):
// two contexts sharing localStorage (browser tab + installed PWA window) used to
// silently clobber each other's saves — last writer won, banked drinks vanished.
const TAB_ID = Math.random().toString(36).slice(2, 8);
let tabEverRan = false;      // did THIS tab ever run a focus session?
let stateSyncTimer = null;

function loadState(opts) {
  const liveSync = !!(opts && opts.liveSync);
  // Every value is read through readJSON (per-key try/catch + fallback) so ONE
  // corrupt bobaFocus* key can't throw and brick the whole app at boot — the rest
  // still load. An outer try/catch is a final backstop. After a load, the call
  // site re-saves so any repaired value self-heals on disk.
  try {
    state.collection  = readJSON("bobaFocusCollection",  []);
    state.rewards     = readJSON("bobaFocusRewards",     []);
    state.owned       = readJSON("bobaFocusOwned",       []);
    state.spent       = readJSON("bobaFocusSpent",       0);
    state.bonusPearls = readJSON("bobaFocusBonusPearls", 0);
    state.blockPenalty = readJSON("bobaFocusBlockPenalty", 0);
    state.blockPromptDismissed = readJSON("bobaFocusBlockPromptDismissed", false) === true;
    state.shieldWasUp  = readJSON("bobaFocusShieldUp", false) === true;
    state.gamePearls  = readJSON("bobaFocusGamePearls", 0);
    state.quests      = readJSON("bobaFocusQuests", null);
    state.freezes     = readJSON("bobaFocusFreezes", 0);
    state.frozenDays  = readJSON("bobaFocusFrozenDays", []);
    if (!Array.isArray(state.frozenDays)) state.frozenDays = [];
    state.renames     = readJSON("bobaFocusRenames", 0);
    if (!Array.isArray(state.collection)) state.collection = [];
    if (!Array.isArray(state.rewards))    state.rewards = [];
    if (!Array.isArray(state.owned))      state.owned = [];
    state.skin        = localStorage.getItem("bobaFocusSkin") || "";
    state.displayName = localStorage.getItem("bobaFocusName") || "";
    state.friends     = readJSON("bobaFocusFriends", []);
    state.squadId     = localStorage.getItem("bobaFocusSquadId") || "";
    if (!Array.isArray(state.friends)) state.friends = [];
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
    if (!Array.isArray(state.unlockedBases))    state.unlockedBases = ["classic"];
    if (!Array.isArray(state.unlockedToppings)) state.unlockedToppings = ["pearls"];
    if (!state.unlockedBases.includes("classic")) state.unlockedBases.push("classic");
    if (!state.unlockedToppings.includes("pearls")) state.unlockedToppings.push("pearls");
    state.gameDays = readJSON("bobaFocusGameDays", {});
    if (!state.gameDays || typeof state.gameDays !== "object") state.gameDays = {};
    state.customDuration = readJSON("bobaFocusCustomDuration", 30 * 60);
    state.soundOn     = readJSON("bobaFocusSoundOn", true);
    state.devMode     = readJSON("bobaFocusDevMode", false);
    // Resume an in-progress drink across app closes
    state.mode        = localStorage.getItem("bobaFocusMode") || "custom";
    // Guard stale/removed mode keys (same treatment base/topping get above).
    // Also migrates pre-redesign modes (tasting/small/large) to custom.
    if (!MODES[state.mode]) state.mode = "custom";
    state.elapsed     = readJSON("bobaFocusElapsed", 0);
    // Heal elapsed BEFORE the away-credit below — corrupt storage here would
    // otherwise either drop the earned credit (NaN) or auto-bank a full drink
    // at boot (a huge number).
    if (!(typeof state.elapsed === "number" && isFinite(state.elapsed) && state.elapsed >= 0)) state.elapsed = 0;
    state.elapsed = Math.min(state.elapsed, modeDuration());
    // If a focus session was actively RUNNING when the app was last killed, credit
    // the wall-clock time that elapsed since (capped at the session length) so a
    // true app-kill mid-study doesn't lose progress. We reconstruct it PAUSED (no
    // surprise auto-play); init completes it if it finished while away.
    const runningSince = readJSON("bobaFocusRunningSince", 0);
    if (!liveSync &&   // on a cross-tab refresh the session is LIVE elsewhere — don't consume its anchor
        typeof runningSince === "number" && isFinite(runningSince) &&
        runningSince > 0 && runningSince <= Date.now()) {
      const extra = Math.max(0, (Date.now() - runningSince) / 1000);
      state.elapsed = Math.min(modeDuration(), state.elapsed + extra);
      pendingResume = true;
      // CONSUME the anchor: we've credited this away-time and reconstructed the
      // session PAUSED. Leaving the anchor would re-credit the same window on the
      // NEXT relaunch (and again, and again), compounding elapsed until a drink
      // auto-completes for free. Pressing Start writes a fresh anchor.
      localStorage.removeItem("bobaFocusRunningSince");
    }
    state.onboarded   = readJSON("bobaFocusOnboarded", false);
    state.badges      = readJSON("bobaFocusBadges", []);
    state.dailyGoal   = readJSON("bobaFocusDailyGoal", 60);
    state.breakDuration = readJSON("bobaFocusBreakDuration", 600);
    if (!(typeof state.breakDuration === "number" && isFinite(state.breakDuration)) ||
        state.breakDuration < 300 || state.breakDuration > 1200) state.breakDuration = 600;
    // Ambience control was removed from Settings (2026-07-18); force off so no
    // stored preference keeps playing sound the user can no longer switch off.
    state.ambience    = "off";
    state.musicOn     = readJSON("bobaFocusMusicOn", true);
    // Volumes (0–1). Fall back to the legacy on/off toggles for returning users.
    const mv = localStorage.getItem("bobaFocusMusicVol");
    const sv = localStorage.getItem("bobaFocusSfxVol");
    state.musicVolume = mv !== null ? clampVol01(readJSON("bobaFocusMusicVol", 0.8)) : (state.musicOn ? 0.8 : 0);
    state.sfxVolume   = sv !== null ? clampVol01(readJSON("bobaFocusSfxVol", 0.9))   : (state.soundOn ? 0.9 : 0);
    const av = localStorage.getItem("bobaFocusAmbVol");
    state.ambVolume   = av !== null ? clampVol01(readJSON("bobaFocusAmbVol", 0.5)) : 0.5;
    state.musicOn = state.musicVolume > 0;   // toggles are now derived from volume
    state.soundOn = state.sfxVolume > 0;
    // Heal any non-finite / negative numbers from corrupt storage so the economy +
    // timer arithmetic can never silently break (e.g. NaN pearls, NaN duration).
    const num = (v, d, min = 0) => (typeof v === "number" && isFinite(v) && v >= min) ? v : d;
    state.spent          = num(state.spent, 0);
    state.bonusPearls    = num(state.bonusPearls, 0);
    state.blockPenalty   = num(state.blockPenalty, 0);
    state.gamePearls     = num(state.gamePearls, 0);
    state.freezes        = num(state.freezes, 0);
    state.renames        = num(state.renames, 0);
    state.elapsed        = num(state.elapsed, 0);
    state.dailyGoal      = num(state.dailyGoal, 60, 1);
    state.customDuration = num(state.customDuration, 30 * 60, 1);
    // Floor a stored pre-update custom timer at the new minimum (dev mode may go lower)
    if (!state.devMode && state.customDuration < CUSTOM_MIN) state.customDuration = CUSTOM_MIN;
  } catch (e) {
    console.warn("loadState failed — using defaults", e);
  }
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
  localStorage.setItem("bobaFocusBlockPenalty", JSON.stringify(state.blockPenalty));
  localStorage.setItem("bobaFocusBlockPromptDismissed", JSON.stringify(state.blockPromptDismissed === true));
  localStorage.setItem("bobaFocusShieldUp",     JSON.stringify(state.shieldWasUp === true));
  localStorage.setItem("bobaFocusGamePearls",   JSON.stringify(state.gamePearls));
  localStorage.setItem("bobaFocusQuests",       JSON.stringify(state.quests));
  localStorage.setItem("bobaFocusFreezes",      JSON.stringify(state.freezes));
  localStorage.setItem("bobaFocusFrozenDays",   JSON.stringify(state.frozenDays));
  localStorage.setItem("bobaFocusRenames",      JSON.stringify(state.renames));
  localStorage.setItem("bobaFocusSkin",         state.skin);
  localStorage.setItem("bobaFocusName",         state.displayName || "");
  localStorage.setItem("bobaFocusFriends",      JSON.stringify(state.friends || []));
  if (state.squadId) localStorage.setItem("bobaFocusSquadId", state.squadId);
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
  localStorage.setItem("bobaFocusBreakDuration", JSON.stringify(state.breakDuration));
  // Wall-clock anchor: only present while a focus session is actively RUNNING.
  // If the OS kills the app mid-session, loadState() reads this to credit the time
  // that passed so study time isn't lost. Removed whenever we're not running.
  if (state.running && state.phase === "focus") {
    localStorage.setItem("bobaFocusRunningSince", JSON.stringify(Date.now()));
    tabEverRan = true;
  } else if (tabEverRan) {
    // Multi-tab guard: only the tab that actually RAN the session may clear the
    // anchor. A second idle tab (whose boot-save runs unconditionally) would
    // otherwise delete a live session's crash-recovery credit.
    localStorage.removeItem("bobaFocusRunningSince");
  }
  // Cross-tab sync beacon — written LAST so listeners see a settled snapshot.
  try { localStorage.setItem("bobaFocusSaveStamp", String(Date.now()) + ":" + TAB_ID); } catch (e) {}
  // Mirror my stats to the cloud Squad when live (debounced, no-op offline).
  if (window.SquadCloud && SquadCloud.ready) SquadCloud.pushProfile();
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

// The timer-card label follows the EQUIPPED BACKGROUND: every background is
// named as a flavor (Taro Galaxy, Sakura Latte...), so the drink being brewed
// reads as that flavor. Banked drinks and shares keep currentDrinkName().
function themeFlavorName() {
  const t = SHOP_ITEMS.find(i => i.type === "shopTheme" && i.value === state.shopTheme);
  return `${t ? t.name : BASES[state.base].label} + ${TOPPINGS[state.topping].label}`;
}

// The colour at the very top of each scene (the "sky"), so the phone status-bar
// area can be tinted to match — no white gap above the app.
const THEME_SKY = {
  cozy:   "#f3e4cf",
  night:  "#2e3b57",
  sakura: "#f6e0e6",
  autumn: "#f0dcb8",
  rainy:  "#d6dee6",
  winter: "#ece3d4",
  galaxy: "#efe4d2"
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
  // Belt-and-braces: never throw at banking time even if mode is somehow bad
  if (state.mode === "goal") return `Goal · ${fmtDuration((state.dailyGoal || 30) * 60)}`;
  return `Custom · ${fmtDuration(state.customDuration)}`;
}

function currentPearls() {
  return Math.floor(totalMinutes() / 15) + state.bonusPearls - state.spent - state.blockPenalty;
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

// SVG interior y-range the liquid sweeps between (matches the #cupClip path).
const CUP_LIQ_TOP = 60, CUP_LIQ_BOT = 156;
function updateCup() {
  const frac = Math.max(0, Math.min(1, progress()));
  const pct = Math.round(frac * 100);
  const remaining = modeDuration() - state.elapsed;
  // Drive the SVG liquid: surface rises from the cup base toward the rim, clipped
  // to the exact interior shape so it follows the tapered walls.
  const surfaceY = CUP_LIQ_BOT - (CUP_LIQ_BOT - CUP_LIQ_TOP) * frac;
  if (els.liquid) {
    els.liquid.setAttribute("y", surfaceY.toFixed(1));
    els.liquid.setAttribute("height", (CUP_LIQ_BOT - surfaceY).toFixed(1));
    els.liquid.setAttribute("fill", BASES[state.base].color);
  }
  if (els.liqSurface) {
    els.liqSurface.setAttribute("cy", (surfaceY + 1).toFixed(1));
    els.liqSurface.style.opacity = frac > 0.02 ? "" : "0";   // hide the meniscus when empty
  }
  if (els.foamBand) els.foamBand.setAttribute("y", Math.max(CUP_LIQ_TOP, surfaceY - 3).toFixed(1));
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
  // Collapse the size picker while running so the controls never cover the maker
  if (els.focusControls) els.focusControls.classList.toggle("session-on", state.running);
  updateThemeColor();   // tint the phone status-bar area to match the scene's sky
  // Don't clobber a tap-to-talk line while it's visible.
  if (!els.makerSpeech.classList.contains("show")) els.makerSpeech.textContent = speechForState();
  els.timerText.textContent = formatTime(remaining);
  // Declutter: the drink name lives IN the timer card now (the old top-left
  // pill is hidden — size is already shown by the active picker button).
  // The label shows the EQUIPPED BACKGROUND's flavor, not the customize base.
  els.sessionLabel.textContent = themeFlavorName();
  els.startPauseBtn.textContent = state.running ? "Pause"
    : pct === 100 ? "Seal & Save"
    : state.elapsed > 0 ? "Resume"
    : "Start Focus";
  els.startPauseBtn.classList.toggle("is-running", state.running);
  // Reset is dead weight until there's actually something to reset.
  els.resetBtn.classList.toggle("hidden", state.elapsed <= 0 && !state.running);
  updateTabTitle(remaining);
}


function updateStats() {
  const pearls = currentPearls();
  els.pearlCount.textContent  = String(pearls);
  if (els.customizePearlCount) els.customizePearlCount.textContent = `${pearls} pearls`;
}

// Convert a YYYY-MM-DD key to a whole-day ordinal so we can compare/streak them
function keyToOrdinal(k) {
  const [y, m, d] = k.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function computeStats() {
  const ordinals = new Set(state.collection.map(d => keyToOrdinal(d.dateKey)));
  const frozen   = new Set(state.frozenDays || []);   // Streak-Freeze-protected days
  const todayOrd = keyToOrdinal(localDateKey(new Date()));

  // Current streak: count consecutive FOCUSED days ending at today/yesterday. A
  // streak-freeze-protected day BRIDGES a gap (keeps the chain alive) but does not
  // add to the count — only days you actually focused increment the streak.
  let current = 0;
  let cursor = todayOrd;
  if (!ordinals.has(cursor) && !frozen.has(cursor)) cursor--;   // today not done yet → start at yesterday
  while (ordinals.has(cursor) || frozen.has(cursor)) {
    if (ordinals.has(cursor)) current++;
    cursor--;
  }

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

  // Weekly average: total focus spread over the weeks since the FIRST session
  // (minimum one week, so a brand-new user's average isn't inflated).
  const firstOrd  = sorted.length ? sorted[0] : todayOrd;
  const weeks     = Math.max(1, Math.ceil((todayOrd - firstOrd + 1) / 7));
  const weeklyAvg = Math.round(totalMinutes() / weeks);

  return { current, longest, todayCount, weekCount, weeklyAvg, totalMin: totalMinutes() };
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
  if (els.statWeeklyAvg) els.statWeeklyAvg.textContent = formatFocusTotal(s.weeklyAvg);
  // Front-page HUD: streak chip beside the pearls, name chip top-right.
  const hudStreak = document.querySelector("#hudStreak");
  if (hudStreak) hudStreak.textContent = String(s.current);
  const hudName = document.querySelector("#hudName");
  if (hudName) {
    const n = (state.displayName || "").trim();
    hudName.textContent = n;
    hudName.classList.toggle("hidden", !n);
  }
  if (els.streakFreezeNote) {
    const f = state.freezes || 0;
    els.streakFreezeNote.textContent = `${f} brain freeze${f === 1 ? "" : "s"} ready`;
    els.streakFreezeNote.classList.toggle("hidden", f === 0);
  }
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

// ── Weekly insights (narrative recap from the focus history) ──────────────────
const WEEKDAY_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function computeInsights() {
  const todayOrd = keyToOrdinal(localDateKey(new Date()));
  const byDay = {};
  for (const d of state.collection) {
    const o = keyToOrdinal(d.dateKey);
    byDay[o] = (byDay[o] || 0) + d.minutes;
  }
  let thisWeek = 0, lastWeek = 0, daysActive = 0, bestOrd = null, bestMin = 0;
  for (let o = todayOrd - 6; o <= todayOrd; o++) {
    const m = byDay[o] || 0;
    thisWeek += m;
    if (m > 0) { daysActive++; if (m > bestMin) { bestMin = m; bestOrd = o; } }
  }
  for (let o = todayOrd - 13; o <= todayOrd - 7; o++) lastWeek += (byDay[o] || 0);
  const sessions = state.collection.filter(d => {
    const o = keyToOrdinal(d.dateKey); return o >= todayOrd - 6 && o <= todayOrd;
  }).length;
  const avg = daysActive ? Math.round(thisWeek / daysActive) : 0;
  const delta = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;
  const bestDay = bestOrd != null ? WEEKDAY_FULL[new Date(bestOrd * 86400000).getUTCDay()] : null;
  return { thisWeek, lastWeek, daysActive, sessions, avg, delta, bestDay, bestMin };
}

function renderInsights() {
  const el = document.querySelector("#weekInsights");
  if (!el) return;
  const i = computeInsights();
  if (i.thisWeek === 0) {
    el.innerHTML = `<p class="insight-line">No focus yet this week. Start a session to fill your first cup!</p>`;
    return;
  }
  let deltaHtml;
  if (i.delta === null)     deltaHtml = `<span class="insight-delta neutral">first week</span>`;
  else if (i.delta > 0)     deltaHtml = `<span class="insight-delta up">▲ ${i.delta}% vs last week</span>`;
  else if (i.delta < 0)     deltaHtml = `<span class="insight-delta down">▼ ${Math.abs(i.delta)}% vs last week</span>`;
  else                      deltaHtml = `<span class="insight-delta neutral">same as last week</span>`;

  const streak = computeStats().current;
  let momentum;
  if (streak >= 5)            momentum = `${streak}-day streak, you're on a roll!`;
  else if (todayMinutes() === 0) momentum = `A quick session today keeps the momentum going`;
  else                        momentum = `Nice focus today — keep it flowing 🧋`;

  el.innerHTML =
    `<div class="insight-head"><span class="insight-title">Your week</span>${deltaHtml}</div>` +
    `<div class="insight-stats">` +
      `<div class="insight-stat"><span class="is-val">${formatFocusTotal(i.thisWeek)}</span><span class="is-lab">focused</span></div>` +
      `<div class="insight-stat"><span class="is-val">${i.daysActive}</span><span class="is-lab">day${i.daysActive !== 1 ? "s" : ""} active</span></div>` +
      `<div class="insight-stat"><span class="is-val">${formatFocusTotal(i.avg)}</span><span class="is-lab">daily avg</span></div>` +
    `</div>` +
    (i.bestDay ? `<p class="insight-line">Best day this week: <strong>${i.bestDay}</strong> · ${formatFocusTotal(i.bestMin)}</p>` : "") +
    `<p class="insight-line">${momentum}</p>`;
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
  { id: "break-champ", icon: "🎮", name: "Break Champ",    desc: "Win pearls in a game",  test: () => (state.gamePearls || 0) > 0 }
];

// Returns the number of newly-unlocked badges (so callers can stagger their own toasts)
function checkBadges(celebrate) {
  const have = new Set(state.badges || []);
  const newly = BADGES.filter(b => !have.has(b.id) && b.test()).map(b => b.id);
  if (!newly.length) return 0;
  state.badges = [...have, ...newly];
  saveState();
  if (celebrate) {
    newly.forEach((id, i) => {
      const b = BADGES.find(x => x.id === id);
      setTimeout(() => { showToast(`${b.icon} Badge unlocked: ${b.name}`); playSfx("success"); haptic(10); }, i * 1500);
    });
  }
  return newly.length;
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

// ── Consumables (Brain Freeze — internally "freezes") ────────────────────────
// Repeatable, count-based purchases — a separate path from one-time cosmetics so
// the owned-array model stays untouched.
const FREEZE_CAP = 3;   // most you can stock at once (keeps it cozy, not abusable)
function buyConsumable(itemId) {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item || item.type !== "consumable") return;
  const key = item.consumableKey;
  const have = state[key] || 0;
  if (have >= FREEZE_CAP) { showToast(`You're stocked up — ${FREEZE_CAP} ${item.name}s max 🧊`); playSfx("tap"); return; }
  if (currentPearls() < item.price) { showToast("Not enough pearls yet — keep focusing! 🧋"); playSfx("tap"); return; }
  state[key] = have + 1;
  state.spent += item.price;
  saveState();
  playSfx("coin"); haptic(10);
  showToast(`🧊 ${item.name} ready! You have ${state[key]}.`);
  renderShop();
  updateStats();   // refresh the pearl chip
  renderStats();   // refresh the "N streak freezes ready" note
}

// Auto-spend freezes to bridge missed days so the current streak survives. Runs on
// boot + when the app is re-foregrounded. Idempotent: once a gap is bridged the
// chain top advances, so re-running does nothing until another day is actually missed.
function reconcileStreakFreezes() {
  if (!Array.isArray(state.frozenDays)) state.frozenDays = [];
  if (!state.collection || !state.collection.length) {
    if (state.frozenDays.length) { state.frozenDays = []; saveState(); }   // no streak → drop orphan freezes
    return;
  }
  const focused = state.collection.map(d => keyToOrdinal(d.dateKey));
  const frozen = new Set(state.frozenDays);
  const todayOrd = keyToOrdinal(localDateKey(new Date()));
  // Top of the CONTIGUOUS chain: the most-recent FOCUSED day, extended up through
  // any adjacent frozen days. Deriving it from focused days means an orphaned /
  // non-contiguous frozen ordinal can never act as a false anchor.
  let top = focused.reduce((m, o) => (o > m ? o : m), -Infinity);
  while (frozen.has(top + 1)) top++;
  const needed = (todayOrd - 1) - top;                 // fully-missed days up to (and incl.) yesterday
  if (needed > 0 && (state.freezes || 0) >= needed) {  // only bridge if we can cover the WHOLE gap
    for (let d = top + 1; d <= todayOrd - 1; d++) state.frozenDays.push(d);
    state.freezes -= needed;
    const left = state.freezes;   // snapshot — toast fires later, after any racing decrement
    setTimeout(() => { showToast(`🧊 Brain Freeze used, your streak is safe! ${left} left`); playSfx("blip"); }, 1200);
  }
  // Keep frozenDays bounded + tidy — only recent ordinals matter to the streak walk.
  state.frozenDays = [...new Set(state.frozenDays)].filter(o => o >= todayOrd - 400 && o <= todayOrd).sort((a, b) => a - b);
  saveState();
}

// Re-apply the maker image for the current resting/working state. Needed after
// a skin change because updateCup no longer drives maker state every tick.
function refreshMaker() {
  // Lazy sprite loading: kick off this skin's sheet decode on equip (no-op if
  // already ready/loading); falls back to the static portrait until decoded.
  if (SpriteEngine.loaded) SpriteEngine.ensureSkin(state.skin || "base");
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
  state.blockPenalty = 0;
  state.gamePearls = 0;
  state.freezes = 0;
  state.frozenDays = [];
  state.quests = null;
  state.badges = [];
  state.skin = "";
  state.shopTheme = "cozy";
  state.base = "classic";
  state.topping = "pearls";
  state.unlockedBases = ["classic"];
  state.unlockedToppings = ["pearls"];
  state.gameDays = {};
  state.renames = 0;          // pearls wiped → reset the name-change economy too
  renderCustomizeOptions();   // reflect the reset in the Customize sheet
  saveState();
  refreshMaker();
  renderAll();
  showToast("Progress cleared. Fresh start!");
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
  const boosts   = SHOP_ITEMS.filter(i => i.type === "consumable");

  function renderBoostCard(item) {
    const have   = state[item.consumableKey] || 0;
    const atCap  = have >= FREEZE_CAP;
    const canBuy = pearls >= item.price && !atCap;
    const action = atCap
      ? `<span class="shop-equipped-badge">Stocked</span>`
      : `<button class="shop-buy-btn" data-buy-consumable="${item.id}" ${canBuy ? "" : "disabled"}>${item.price}</button>`;
    return `
      <article class="shop-card">
        <div class="shop-preview" style="background:#eaf4f3"><div class="shop-boost-preview">${item.icon || "🧊"}</div></div>
        <div><strong>${item.name}</strong><small>${item.desc}</small></div>
        <div class="shop-card-action">${action}</div>
      </article>`;
  }

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
      action = IAP.available()
        ? `<button class="shop-preview-btn" data-iap="${item.id}">✦ ${IAP.prices[item.id] || "$1.99"}</button>`
        : `<button class="shop-preview-btn" data-premium="${item.id}">✦ $1.99</button>`;
    } else if (owned) {
      action = `<button class="shop-equip-btn" data-equip="${item.id}">Equip</button>`;
    } else {
      action = `<button class="shop-buy-btn" data-buy="${item.id}" ${canBuy ? "" : "disabled"}>${item.price}</button>`;
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
    const THEME_BG = {
      cozy:   "assets/Shop Background.png",
      night:  "assets/Shop Background Night.png",
      sakura: "assets/Shop Background Sakura.png",
      autumn: "assets/Shop Background Autumn.png",
      rainy:  "assets/Shop Background Rainy.png",
      winter: "assets/Shop Background Winter.png",
      galaxy: "assets/Shop Background Galaxy.png",
      library: "assets/Shop Background Library.png",
      sunset: "assets/Shop Background Sunset.png",
    };
    const bg = THEME_BG[item.value];
    // Show the actual backdrop art (color stays as the load fallback).
    const preview   = `<div class="shop-theme-preview" style="background:${item.color}${bg ? ` url('${bg}') center/cover no-repeat` : ""}"></div>`;

    let action = "";
    if (equipped) {
      action = isDefault
        ? `<span class="shop-equipped-badge">Default</span>`
        : `<span class="shop-equipped-badge">${item.premium ? "✦ " : ""}Equipped</span>
           <button class="shop-unequip-btn" data-unequip="${item.type}">Remove</button>`;
    } else if (item.premium && !state.devMode) {
      action = IAP.available()
        ? `<button class="shop-preview-btn" data-iap="${item.id}">✦ ${IAP.prices[item.id] || "$1.99"}</button>`
        : `<button class="shop-preview-btn" data-premium="${item.id}">✦ $1.99</button>`;
    } else if (owned) {
      action = `<button class="shop-equip-btn" data-equip="${item.id}">Equip</button>`;
    } else {
      action = `<button class="shop-buy-btn" data-buy="${item.id}" ${canBuy ? "" : "disabled"}>${item.price}</button>`;
    }

    return `
      <article class="shop-card">
        <div class="shop-preview">${preview}${item.premium ? '<span class="shop-premium-flag">✦</span>' : ""}</div>
        <div><strong>${item.name}</strong><small>${item.desc}</small></div>
        <div class="shop-card-action">${action}</div>
      </article>`;
  }

  els.shopGrid.innerHTML =
    `<h4 class="shop-category-head">Boosts</h4>
     ${boosts.map(renderBoostCard).join("")}
     <h4 class="shop-category-head">Skins</h4>
     ${allSkins.map(renderSkinCard).join("")}
     <h4 class="shop-category-head">Backgrounds</h4>
     ${themes.map(renderThemeCard).join("")}`;

  els.shopGrid.querySelectorAll("[data-buy]").forEach(btn => {
    btn.addEventListener("click", () => buyItem(btn.dataset.buy));
  });
  els.shopGrid.querySelectorAll("[data-buy-consumable]").forEach(btn => {
    btn.addEventListener("click", () => buyConsumable(btn.dataset.buyConsumable));
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
  // Real App Store purchase (native only)
  els.shopGrid.querySelectorAll("[data-iap]").forEach(btn => {
    btn.addEventListener("click", async () => {
      playSfx("tap");
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = "…";
      try { await IAP.buy(btn.dataset.iap); }
      catch (e) { showToast("Purchase didn't go through — you weren't charged."); }
      finally { btn.disabled = false; btn.textContent = label; renderShop(); }
    });
  });
  els.shopGrid.querySelectorAll("[data-unequip]").forEach(btn => {
    btn.addEventListener("click", () => unequipItem(btn.dataset.unequip));
  });
}

function renderAll() {
  updateCup();
  updateStats();
  renderBlockPill();
  renderStats();
  renderDailyGoal();
  renderWeekChart();
  renderInsights();
  renderShop();
  renderQuests();
  updateQuestBadge();
}

let lastPersist = 0;
let pendingResume = false;   // set in loadState() if a running session needs resuming on launch

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

  // Clamp negative deltas: a backward clock change (DST, NTP sync, manual)
  // must not DRAIN focus progress the user already earned.
  const delta = Math.max(0, (now - state.lastTick) / 1000);
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
  _plugin: null,
  plugin() {
    if (this._plugin) return this._plugin;
    const cap = window.Capacitor;
    // Capacitor 6: a custom native plugin is obtained via registerPlugin() — the
    // legacy Capacitor.Plugins.<name> map no longer auto-populates custom plugins.
    if (cap && typeof cap.registerPlugin === "function") {
      try { this._plugin = cap.registerPlugin("FocusShield"); return this._plugin; } catch (e) {}
    }
    return (cap && cap.Plugins && cap.Plugins.FocusShield) || null;   // legacy fallback
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
  _want: false,
  _active: false,   // did the native shield actually engage (real apps picked) this session?
  // _want tracks the DESIRED shield state so a slow native start() that resolves
  // AFTER a stop() can't leave apps blocked once the session is over.
  async start() {
    this._want = true;
    const p = this.plugin(); if (!p) { this._active = false; return; }
    try {
      const r = await p.startBlocking();      // native returns { active } — true only if apps were picked
      this._active = !!(r && r.active) && this._want;
      if (!this._want) await p.stopBlocking();
      // Persist the engaged flag: if iOS kills the app mid-session and the
      // drink finishes while away, boot-time completeSession still knows the
      // shield was honestly up (in-memory _active resets to false on relaunch).
      if (this._active && !state.shieldWasUp) { state.shieldWasUp = true; saveState(); }
    } catch (e) { this._active = false; }
  },
  async stop()  {
    this._want = false; this._active = false;
    if (state.shieldWasUp) { state.shieldWasUp = false; saveState(); }
    const p = this.plugin(); if (!p) return; try { await p.stopBlocking(); } catch (e) {}
  },
  wasActive() { return this._active; },   // was a real shield up during this focus session?

  // Is blocking READY to use (Screen Time authorized AND apps picked)? Cached in
  // _configured so the UI can read it synchronously; refreshed via refreshStatus.
  _configured: undefined,
  _authorized: false,
  async status() {
    const p = this.plugin(); if (!p) return { authorized: false, hasSelection: false };
    try {
      const r = await p.status();   // may reject on older builds without the method
      return { authorized: !!(r && r.authorized), hasSelection: !!(r && r.hasSelection) };
    } catch (e) { return { authorized: false, hasSelection: false }; }
  },
  async isConfigured() {
    const s = await this.status();
    this._authorized = s.authorized;
    this._configured = s.authorized && s.hasSelection;
    return this._configured;
  },
  async refreshStatus() { await this.isConfigured(); return this._configured; },
};

// Lock Screen / Dynamic Island live countdown (a native iOS "Live Activity").
// Shows the remaining focus time without opening the app. No-ops on the web
// build and on iPhones where the FocusWidget extension isn't installed yet.
const FocusActivity = {
  _want: false,
  plugin() {
    const cap = window.Capacitor;
    return (cap && cap.Plugins && cap.Plugins.FocusActivity) || null;
  },
  // _want tracks the DESIRED activity state so a slow native start() that resolves
  // AFTER a stop() can't leave an orphan countdown stuck on the Lock Screen.
  async start() {
    const p = this.plugin(); if (!p) return;
    const remainingMs = Math.max(0, (modeDuration() - state.elapsed) * 1000);
    if (remainingMs <= 0) return;
    this._want = true;
    try {
      await p.start({
        endsAt: Date.now() + remainingMs,
        startedAt: Date.now() - state.elapsed * 1000,   // progress bar spans the whole drink
        drinkName: currentDrinkName()
      });
      if (!this._want) await p.stop();
    } catch (e) {}
  },
  async stop() {
    this._want = false;
    const p = this.plugin(); if (!p) return; try { await p.stop(); } catch (e) {}
  }
};

// ── Real App Store purchases (StoreKit 2 via the native IAP plugin) ──────────
// Premium skins/backgrounds are non-consumable IAPs on iPhone. On the web the
// plugin is absent → the shop keeps its "get the iPhone app" preview dialog.
const IAP = {
  PREFIX: "com.melchior.mrtapioca.",
  prices: {},          // itemId -> localized display price ("$1.99", "€1,99"…)
  plugin() {
    const cap = window.Capacitor;
    return (cap && cap.Plugins && cap.Plugins.IAP) || null;
  },
  available() { return !!this.plugin(); },
  productId(itemId) { return this.PREFIX + itemId.replace("-", "."); },
  itemId(productId) { return productId.startsWith(this.PREFIX)
    ? productId.slice(this.PREFIX.length).replace(".", "-") : null; },
  premiumItems() { return SHOP_ITEMS.filter(i => i.premium); },
  async init() {
    const p = this.plugin(); if (!p) return;
    try {
      const ids = this.premiumItems().map(i => this.productId(i.id));
      const r = await p.getProducts({ ids });
      for (const prod of (r && r.products) || []) {
        const item = this.itemId(prod.id);
        if (item && prod.price) this.prices[item] = prod.price;
      }
      renderShop();   // swap $1.99 placeholders for real localized prices
    } catch (e) {}
  },
  grant(itemId) {
    if (!SHOP_ITEMS.some(i => i.id === itemId && i.premium)) return false;
    if (state.owned.includes(itemId)) return false;
    state.owned.push(itemId);
    return true;
  },
  async buy(itemId) {
    const p = this.plugin(); if (!p) return { state: "unavailable" };
    const r = await p.purchase({ id: this.productId(itemId) });
    if (r && r.state === "purchased") {
      if (this.grant(itemId)) { saveState(); renderShop(); }
      playSfx("success"); haptic([12, 30, 18]);
      const item = SHOP_ITEMS.find(i => i.id === itemId);
      showToast(`✦ ${item ? item.name : "Purchase"} unlocked!`);
    } else if (r && r.state === "pending") {
      showToast("Purchase pending approval — it'll unlock automatically.");
    }
    return r || { state: "unknown" };
  },
  async restoreAll(interactive) {
    const p = this.plugin(); if (!p) return 0;
    try {
      const r = await p.restore();
      let granted = 0;
      for (const pid of (r && r.owned) || []) {
        const item = this.itemId(pid);
        if (item && this.grant(item)) granted++;
      }
      if (granted) { saveState(); renderShop(); }
      if (interactive) {
        showToast(granted ? `✦ Restored ${granted} purchase${granted !== 1 ? "s" : ""}!`
                          : "No purchases to restore on this Apple ID.");
      }
      return granted;
    } catch (e) {
      if (interactive) showToast("Couldn't reach the App Store — try again.");
      return 0;
    }
  }
};

async function startPause() {
  state.autoPaused = false;   // any manual press cancels a pending auto-resume
  if (progress() >= 1 && !state.running) {
    completeSession();
    return;
  }

  if (state.running) { pauseFocus(); return; }

  // About to START. On iPhone, if app blocking exists but isn't set up yet,
  // surface it front-and-center (mom was right — it was too buried) instead of
  // silently starting an unshielded session. Skipped entirely on the web build
  // (no plugin) and once the user has set it up or opted out.
  if (FocusBlocker.available() && !state.blockPromptDismissed) {
    let configured = false;
    try { configured = await FocusBlocker.isConfigured(); } catch (e) {}
    renderBlockPill();
    if (!configured) { showBlockingPrompt(); return; }
  }
  beginFocus();
}

// The actual "begin a running focus session" body — called directly, or by the
// blocking prompt's buttons once the user has chosen.
function beginFocus() {
  state.running = true;
  state.lastTick = Date.now();
  updateCup();
  refreshSessionChrome();     // hide/show the daily-goal pill as the session starts
  walkToCupAndMix();          // glide over to the cup, then mix
  startAmbience();            // soundscape on while focusing
  startMusic("focus");        // lo-fi while focusing
  FocusBlocker.start();       // shield distracting apps for the session (native only)
  FocusActivity.start();      // live countdown on the Lock Screen / Dynamic Island
  stopTicker();
  state.timerId = setInterval(tick, 250);
  saveState();                // persist running state + push "🟢 Focusing" status to the Squad
}

function pauseFocus() {
  state.running = false;
  state.lastTick = null;
  updateCup();
  refreshSessionChrome();
  stopTicker();
  stopAmbience();
  stopMusic();
  FocusBlocker.stop();        // lift the shield when paused
  FocusActivity.stop();       // clear the Lock Screen countdown
  walkToStation("idle");      // walk back to his spot
  saveState();                // bank progress whenever the user pauses
}

// ── App-blocking discoverability (start-focus prompt + status pill) ──────────
// Guard so the dialog's close event (ESC key, backdrop, any dismissal) starts
// the session unshielded EXACTLY ONCE, without double-firing when a button
// already handled the choice. Without this, dismissing the prompt via ESC would
// close it and silently never start the focus session.
let blockPromptResolved = false;

function showBlockingPrompt() {
  playSfx("open");
  const dlg = els.blockPrompt;
  if (dlg && typeof dlg.showModal === "function") {
    blockPromptResolved = false;
    if (!dlg.open) dlg.showModal();
  } else {
    beginFocus();   // very old WebView with no <dialog> — don't dead-end, just start
  }
}

// Choose apps from the prompt: authorize, show Apple's picker, then start focused.
// Every await is guarded — if the picker is cancelled/swiped-away/rejected, we
// still begin the session (unshielded) rather than hanging forever.
async function blockPromptChoose() {
  blockPromptResolved = true;
  if (els.blockPrompt && els.blockPrompt.open) els.blockPrompt.close();
  try {
    await FocusBlocker.requestAuthorization();
    await FocusBlocker.pickApps();     // Apple's system app picker
    await FocusBlocker.refreshStatus();
  } catch (e) { /* cancelled or unavailable — start unshielded */ }
  renderBlockPill();
  beginFocus();
}

function blockPromptSkip(forever) {
  blockPromptResolved = true;
  if (els.blockPrompt && els.blockPrompt.open) els.blockPrompt.close();
  if (forever) { state.blockPromptDismissed = true; saveState(); }
  beginFocus();
}

// Any dismissal that DIDN'T go through a button (ESC key, etc.) still starts the
// session — dismissing the "block?" prompt means "just start", never "do nothing".
function onBlockPromptClose() {
  if (blockPromptResolved) return;
  blockPromptResolved = true;
  beginFocus();
}

// Small always-visible shield pill under Start (native only) so blocking reads
// as a real feature, not something buried in Settings.
function renderBlockPill() {
  const pill = els.blockPill;
  if (!pill) return;
  if (!FocusBlocker.available()) { pill.classList.add("hidden"); return; }
  pill.classList.remove("hidden");
  const on = FocusBlocker._configured === true;
  pill.classList.toggle("is-on", on);
  if (els.blockPillLabel) els.blockPillLabel.textContent = on ? "App blocking: On" : "App blocking: Off";
}

function resetSession() {
  closePlinko();
  closePong();
  stopGame();
  stopAmbience();
  stopMusic();
  FocusBlocker.stop();
  FocusActivity.stop();
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
  els.shopScene.classList.remove("maker-up");
  clearTimeout(walkTimer); setWalk(0);
  currentMakerState = ""; setMakerState("idle");
  saveState();   // persist the cleared drink so it doesn't resume on reload
  updatePhaseUI();
  updateCup();
}

function completeSession() {
  // Idempotency guard: once banked, elapsed is 0 and we're not running, so a
  // second call (e.g. reload mid-reward-dialog then re-press) can't double-bank.
  if (state.elapsed <= 0 && !state.running) return;
  // Capture whether a real app-shield was up THIS session before we lift it below.
  // On the web build blocking is impossible, so treat web as "full" (never penalized).
  // wasActive() covers the live session; state.shieldWasUp covers a session
  // that completed while the app was killed (relaunch wiped the in-memory flag
  // but the persisted one survived). Read BEFORE the stop() below clears both.
  const wasBlocked = FocusBlocker.available()
    ? (FocusBlocker.wasActive() || state.shieldWasUp === true)
    : true;
  stopTicker();
  stopAmbience();
  stopMusic();
  FocusBlocker.stop();    // session done — apps free again
  FocusActivity.stop();   // clear the Lock Screen countdown
  state.running = false;
  // Reset elapsed to 0 NOW (before saveState) so the finished drink is fully
  // banked and a reload can't resurrect it at 100% and re-award it.
  state.elapsed = 0;
  state.lastTick = null;
  clearTimeout(walkTimer); setWalk(0);   // step back to his station to finish up
  currentMakerState = ""; setMakerState("idle");

  const minutes = Math.round(modeDuration() / 60);
  state.lastSessionMinutes = minutes;   // gates break games on the iPhone build
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

  // Pearls are floor(totalMinutes/15). Scale by whether apps were blocked: full when a
  // shield was up (or on web, where blocking isn't possible), half when a native user
  // chose NOT to block — a nudge to actually use the blocker. Any completed session
  // earns at least 1 pearl (so a short Custom cup never shows a deflating "+0").
  const oldTotal = totalMinutes();
  const fullPearls = Math.floor((oldTotal + minutes) / 15) - Math.floor(oldTotal / 15);
  const pearlsEarned = Math.max(1, Math.ceil(fullPearls * (wasBlocked ? 1 : REWARD_UNBLOCKED_FRACTION)));
  // Reconcile against the minutes-derived balance (currentPearls): bank a top-up
  // (the min-1 guarantee) as bonus pearls, or withhold the unblocked shortfall as a
  // persistent penalty that currentPearls() subtracts.
  const pearlDelta = pearlsEarned - fullPearls;
  if (pearlDelta > 0) state.bonusPearls += pearlDelta;
  else if (pearlDelta < 0) state.blockPenalty += -pearlDelta;

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
    name: drink.name,       // for the shareable card
    minutes,                // for the shareable card
    pearls: pearlsEarned,
    partner
  };

  state.collection.unshift(drink);
  state.rewards.unshift(reward);
  saveState();
  renderAll();
  // Daily Quests: credit this completed focus session
  bumpQuest("focusMin", minutes);
  bumpQuest("sessions", 1);
  bumpQuest("drinks", 1);
  if (now.getHours() < 12) bumpQuest("earlyFocus", 1);
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

// ── Shareable "I finished a drink" card ──────────────────────────────────────
// The single most important growth lever: turn a finished focus session into a
// cute image the user WANTS to post. Rendered on a canvas (no deps), shared via
// the native share sheet on mobile, downloaded as a PNG on desktop.
let lastReward = null;

function canvasRoundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

async function buildShareCard(reward) {
  const W = 1080, H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  const bark = "#3d2117", cream = "#fffaf3", muted = "#9a7c68", caramel = "#d99e5c";
  const drinkColor = (BASES[state.base] && BASES[state.base].color) || caramel;

  // Warm cozy backdrop
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#fceee0"); g.addColorStop(1, "#f3d9bf");
  c.fillStyle = g; c.fillRect(0, 0, W, H);

  // Soft floating pearls in the corners for texture
  c.fillStyle = "rgba(61,33,23,0.05)";
  [[120,180,60],[980,260,90],[940,1120,70],[110,1180,50],[860,700,40]]
    .forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); });

  // Main card
  const pad = 64, cardY = 132, cardW = W - pad * 2, cardH = H - 264;
  c.save();
  c.shadowColor = "rgba(61,33,23,0.18)"; c.shadowBlur = 40; c.shadowOffsetY = 18;
  canvasRoundRect(c, pad, cardY, cardW, cardH, 60);
  c.fillStyle = cream; c.fill();
  c.restore();
  canvasRoundRect(c, pad, cardY, cardW, cardH, 60);
  c.lineWidth = 5; c.strokeStyle = "#ecdecb"; c.stroke();

  c.textAlign = "center";

  // Eyebrow
  c.fillStyle = caramel;
  c.font = "800 34px system-ui, -apple-system, Segoe UI, sans-serif";
  c.fillText("FOCUS COMPLETE", W / 2, cardY + 96);

  // Character (current skin, else base) — grounded, generous size
  try {
    const charSrc = (state.skin && SKIN_IMAGES[state.skin]) ? SKIN_IMAGES[state.skin] : "assets/Mr. Tapioca.png";
    const im = await loadImage(charSrc);
    const cs = 470;
    c.drawImage(im, W / 2 - cs / 2, cardY + 120, cs, cs);
  } catch (e) { /* image optional — card still reads well without it */ }

  // Headline: the time focused (the flex)
  c.fillStyle = bark;
  c.font = "900 104px system-ui, -apple-system, Segoe UI, sans-serif";
  c.fillText(shareTimePhrase(reward.minutes), W / 2, cardY + 730);

  c.fillStyle = muted;
  c.font = "600 40px system-ui, -apple-system, Segoe UI, sans-serif";
  c.fillText("of focus, one boba at a time", W / 2, cardY + 792);

  // Drink name chip
  const chipText = reward.name || "Boba drink";
  c.font = "800 38px system-ui, -apple-system, Segoe UI, sans-serif";
  const tw = Math.min(c.measureText(chipText).width, cardW - 200);
  const chipW = tw + 96, chipH = 84, chipX = W / 2 - chipW / 2, chipY = cardY + 838;
  canvasRoundRect(c, chipX, chipY, chipW, chipH, 42);
  c.fillStyle = "#fbeede"; c.fill();
  c.lineWidth = 4; c.strokeStyle = drinkColor; c.stroke();
  c.beginPath(); c.arc(chipX + 44, chipY + chipH / 2, 15, 0, 7); c.fillStyle = drinkColor; c.fill();
  c.fillStyle = bark;
  c.save(); canvasRoundRect(c, chipX + 70, chipY, chipW - 90, chipH, 0); c.clip();
  c.textAlign = "left";
  c.fillText(chipText, chipX + 74, chipY + 55);
  c.restore();
  c.textAlign = "center";

  // Streak + total stats row
  const streak = state.streak || 0;
  const totalDrinks = (state.collection && state.collection.length) || 0;
  c.fillStyle = bark;
  c.font = "900 56px system-ui, -apple-system, Segoe UI, sans-serif";
  c.fillText(`🔥 ${streak}`, W / 2 - 150, cardY + 1030);
  c.fillText(`🧋 ${totalDrinks}`, W / 2 + 150, cardY + 1030);
  c.fillStyle = muted;
  c.font = "600 30px system-ui, -apple-system, Segoe UI, sans-serif";
  c.fillText("day streak", W / 2 - 150, cardY + 1076);
  c.fillText("drinks brewed", W / 2 + 150, cardY + 1076);

  // Brand footer
  c.fillStyle = bark;
  c.font = "900 46px system-ui, -apple-system, Segoe UI, sans-serif";
  c.fillText("Mr. Tapioca 🧋", W / 2, H - 96);
  c.fillStyle = muted;
  c.font = "600 30px system-ui, -apple-system, Segoe UI, sans-serif";
  c.fillText("the focus timer that brews boba", W / 2, H - 52);

  return new Promise((resolve) => cv.toBlob(resolve, "image/png"));
}

function shareTimePhrase(mins) {
  if (!mins || mins < 1) return "Focused";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h} hour${h !== 1 ? "s" : ""}`;
}

async function shareDrink(reward) {
  const btn = document.getElementById("shareRewardBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Making your card…"; }
  try {
    const blob = await buildShareCard(reward);
    if (!blob) throw new Error("no blob");
    const file = new File([blob], "mr-tapioca-focus.png", { type: "image/png" });
    const text = `${shareTimePhrase(reward.minutes)} of focus with Mr. Tapioca 🧋`;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Mr. Tapioca", text });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "mr-tapioca-focus.png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast("Saved your card — post it anywhere 🧋");
    }
  } catch (e) {
    if (!(e && e.name === "AbortError")) showToast("Couldn't make the card — try again.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Share my drink 🧋"; }
  }
}

function showReward(reward) {
  // A session finishing MID-TOUR would open this dialog in the top layer above
  // the coach overlay, leaving the tour spotlighting hidden controls behind it.
  // The reward moment wins; the tour can be replayed from Settings.
  if (tourOn) endFeatureTour(false);
  lastReward = reward;
  els.rewardTitle.textContent  = `${reward.size} complete! 🎉`;
  els.rewardCopy.textContent   = reward.copy;
  els.rewardPearls.textContent = `+${reward.pearls} pearl${reward.pearls !== 1 ? "s" : ""}`;
  els.rewardDrink.style.setProperty("--drink-color", BASES[state.base].color);
  els.partnerReward.textContent = reward.partner;
  // Highlight the perk as a real reward only when there is one
  els.partnerReward.classList.toggle("has-perk", reward.partner.startsWith("🌟"));

  if (typeof els.rewardDialog.showModal === "function") {
    els.rewardDialog.showModal();
  } else {
    // Very old WebView without <dialog>.showModal — don't dead-end the app:
    // toast the reward and run the close handler directly.
    showToast(`${reward.size} complete! +${reward.pearls} pearl${reward.pearls !== 1 ? "s" : ""} 🎉`);
    onRewardDialogClose();
  }
}

function onRewardDialogClose() {
  // elapsed was already reset + saved in completeSession(); just continue the flow.
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
  // Clear any existing break timers first so a fast double-tap can't leave two
  // intervals running (which made the break clock tick ~2x speed).
  clearInterval(state.breakTimerId); state.breakTimerId = null;
  clearTimeout(state.breakMakerCycleId); state.breakMakerCycleId = null;
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
  const delta = Math.max(0, (now - state.breakLastTick) / 1000);   // clock-back safe
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
  els.shopScene.classList.remove("maker-up");
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
  els.shopScene.classList.remove("maker-up");
  clearTimeout(walkTimer); setWalk(0);
  currentMakerState = ""; setMakerState("idle");
  updatePhaseUI();
  renderAll();
}

function adjustBreakDuration(delta) {
  const min = 5 * 60;
  const max = 20 * 60;
  state.breakDuration = Math.min(max, Math.max(min, state.breakDuration + delta));
  saveState();   // remember the preferred break length across sessions
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

  refreshSessionChrome();
  updateBreakDisplay();
}

// Declutter: while a focus session is actively running OR during a break, hide
// non-essential chrome (the floating daily-goal pill, which otherwise collides
// with the speech bubble on short phones). Everything returns when idle/paused.
function refreshSessionChrome() {
  const on = state.running || state.phase === "break";
  els.shopScene.classList.toggle("is-session", on);
  // The daily-goal pill lives on .scene-wrap (sibling of .scene), so mark that too.
  if (els.shopScene.parentElement) els.shopScene.parentElement.classList.toggle("is-session", on);
}

function scheduleMakerBreakCycle() {
  // Break = rest. He simply naps in the bed and breathes (via @keyframes maker-sleep).
  // No pacing/walking on break: with no real walk-cycle frames wired up, walking only
  // ever rendered as a stiff side-to-side "waddle" of the standing portrait, and
  // wandering off the bed made the scene feel busy. Calm and asleep reads far better.
  clearTimeout(state.breakMakerCycleId);
  state.breakMakerCycleId = null;
  els.shopScene.classList.remove("maker-up");
  setWalk(0);
  setMakerState("sleeping");
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
  if (els.timerCard) els.timerCard.classList.toggle("custom-adjust", mode === "custom");
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

let lastSheetTrigger = null;   // element to return focus to when a sheet closes

function openSheet(id) {
  clearInterval(squadPollId); squadPollId = null;   // stop squad polling when switching sheets
  lastSheetTrigger = document.activeElement;
  document.querySelectorAll(".sheet").forEach(s => s.classList.add("hidden"));
  const sheet = document.getElementById(id);
  sheet.classList.remove("hidden");
  els.sheetBackdrop.classList.remove("hidden");
  // a11y: move focus into the sheet (first control, else the sheet itself)
  const f = sheet.querySelector("button:not([disabled]), [href], input, select, textarea");
  try { (f || sheet).focus({ preventScroll: true }); } catch (e) { (f || sheet).focus(); }
}

function closeSheets() {
  document.querySelectorAll(".sheet").forEach(s => s.classList.add("hidden"));
  els.sheetBackdrop.classList.add("hidden");
  clearInterval(squadPollId); squadPollId = null;   // stop live-status polling
  // Stop any audio PREVIEW the Settings sliders started (it otherwise lingers a
  // few seconds after the sheet is gone). Leave real session/break audio alone.
  clearTimeout(musicPreviewTimer);
  clearTimeout(ambPreviewTimer);
  if (!state.running && state.phase !== "break" && state.phase !== "break-offer") {
    stopMusic(true);
    stopAmbience(true);
  }
  // a11y: restore focus to whatever opened the sheet
  if (lastSheetTrigger && typeof lastSheetTrigger.focus === "function") {
    try { lastSheetTrigger.focus({ preventScroll: true }); } catch (e) { lastSheetTrigger.focus(); }
  }
  lastSheetTrigger = null;
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
    bankCatchScore();   // early exit (quit / break ended) keeps pearls earned so far
    cancelAnimationFrame(game.animId);
    game.active = false;
    for (const p of game.pearls) p.el.remove();
    game.pearls = [];
    renderAll();
  }
  // Always hide the overlay, even if the game already ended and is showing its
  // result screen — otherwise it stays painted over the focus UI after a break.
  els.gameResult.style.display = "none";
  els.pearlGame.style.display = "none";
}

function spawnPearl() {
  // Decide type: ice (dodge) > golden (bonus) > normal.
  let kind = "normal";
  const r = Math.random();
  if (r < ICE_CHANCE) kind = "ice";
  else if (r < ICE_CHANCE + BOMB_CHANCE) kind = "bomb";
  else if (r < ICE_CHANCE + BOMB_CHANCE + GOLDEN_CHANCE) kind = "golden";

  const size = kind === "ice" ? ICE_SIZE : (kind === "bomb" ? BOMB_SIZE : PEARL_SIZE);
  const x = Math.random() * (els.gameArea.offsetWidth - size);
  const el = document.createElement("div");
  el.className = "falling-pearl falling-" + kind;
  if (kind === "bomb") el.textContent = "💣";
  el.style.width = size + "px";
  el.style.height = size + "px";
  el.style.left = x + "px";
  el.style.top = (-size) + "px";
  els.gameArea.appendChild(el);
  game.pearls.push({ el, x, y: -size, size, kind });
}

function gameLoop(ts) {
  if (!game.active) return;
  if (game.lastTime === null) game.lastTime = ts;
  const dt = Math.min((ts - game.lastTime) / 1000, 0.1);
  game.lastTime = ts;
  game.elapsed += dt;

  // Difficulty ramps up: pearls fall faster and spawn more often over time.
  // Faster base + steeper ramp keeps a good run honest (~10-18 catches, not 30+).
  const fallSpeed = CATCH_FALL_BASE + game.elapsed * CATCH_FALL_RAMP;  // 300 → ~750 px/s
  const spawnInterval = Math.max(CATCH_SPAWN_MIN, CATCH_SPAWN_BASE - game.elapsed * CATCH_SPAWN_RAMP);

  const areaW = els.gameArea.offsetWidth;
  const areaH = els.gameArea.offsetHeight;
  // Catch line at the cup's RIM (its open mouth), not its base.
  const cupRimY = areaH - GAME_CUP_H - 10 + CUP_LIP_Y;
  // Honest hitbox: trim the rim so a pearl must fall INTO the mouth.
  const catchL = game.cupX + CUP_CATCH_INSET;
  const catchR = game.cupX + GAME_CUP_W - CUP_CATCH_INSET;

  if (game.keysLeft)  game.cupX = Math.max(0, game.cupX - game.cupSpeed * dt);
  if (game.keysRight) game.cupX = Math.min(areaW - GAME_CUP_W, game.cupX + game.cupSpeed * dt);
  els.gameCup.style.left = Math.round(game.cupX) + "px";

  const caught = [];
  const missed = [];
  const cupFloorY = cupRimY + GAME_CUP_H;   // below the cup = unrecoverable miss
  for (const p of game.pearls) {
    const prevBottom = p.y + p.size;
    p.y += fallSpeed * dt;
    p.el.style.top = Math.round(p.y) + "px";
    const bottom = p.y + p.size;
    const cx = p.x + p.size / 2;
    // Crossed the rim line this frame (robust to big dt during frame stutter)
    // and still above the cup floor → it lands IN the mouth if aligned.
    if (prevBottom < cupRimY + 6 && bottom >= cupRimY && bottom <= cupFloorY) {
      if (cx >= catchL && cx <= catchR) { caught.push(p); continue; }
    }
    if (p.y > areaH) missed.push(p);
  }

  for (const p of missed) p.el.remove();
  if (caught.length || missed.length) {
    game.pearls = game.pearls.filter(p => !caught.includes(p) && !missed.includes(p));
  }

  // Resolve catches: pearls score, golden score more, ice penalises.
  let gained = 0, gotGold = false, gotIce = false, gotPearl = false, gotBomb = false;
  for (const p of caught) {
    if (p.kind === "ice") {
      gotIce = true;
      game.combo = 0;                 // ice breaks the streak
      pearlBurst(p, "ice");
    } else if (p.kind === "bomb") {
      gotBomb = true;
      game.combo = 0;                 // bombs HURT: lose points + break the streak
      game.score = Math.max(0, game.score - BOMB_PENALTY);
      pearlBurst(p, "bomb");
    } else {
      const val = p.kind === "golden" ? GOLDEN_VALUE : 1;
      gained += val;
      // Burn the daily play (and pay the quest) on the FIRST pearl actually
      // caught, not on opening the game — matches Plinko/Pong. A phone call or
      // misclick at the start shouldn't forfeit the whole day's bonus.
      if (game.caught === 0) { markGamePlayed("catch"); bumpQuest("gamesPlayed", 1); }
      game.caught += 1;
      game.combo += 1;
      game.bestCombo = Math.max(game.bestCombo, game.combo);
      if (p.kind === "golden") gotGold = true; else gotPearl = true;
      pearlBurst(p, p.kind);
    }
    p.el.remove();
  }
  // A missed normal/golden resets the combo (skill pressure); missing ice/bombs is GOOD (you dodged).
  for (const p of missed) { if (p.kind === "normal" || p.kind === "golden") game.combo = 0; }

  if (gained > 0) {
    game.score += gained;
    bumpCup();
    if (gotGold) { playSfx("coin"); haptic(14); } else { playSfx("blip"); haptic(6); }
    flashCombo();
  }
  if (gotIce)  { playSfx("drop"); flashMiss(); haptic([8, 30, 8]); }
  if (gotBomb) { playSfx("buzz"); flashMiss(); haptic([14, 45, 14, 45]); }
  if (gained > 0 || gotBomb) els.gameScore.textContent = "⬡ " + game.score;

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
  if (!gamesUnlockedForBreak()) { showToast("Break games unlock after a " + GAMES_MIN_SESSION_MIN + " minute focus 🔒"); return; }
  if (gameDoneToday("catch")) return;
  // (daily play + quest credit are earned on the first caught pearl, not here)
  game.active = true;
  game.score = 0;
  game.banked = 0;   // pearls already credited this run (incremental banking)
  game.caught = 0;
  game.combo = 0;
  game.bestCombo = 0;
  game.timeLeft = CATCH_DURATION;
  game.elapsed = 0;
  game.lastTime = null;
  game.spawnTimer = 0;
  game.pearls = [];
  game.keysLeft = false;
  game.keysRight = false;
  game.cupBumpUntil = 0;
  els.gameScore.textContent = "⬡ 0";
  els.gameTimer.textContent = "0:" + String(CATCH_DURATION).padStart(2, "0");
  els.gameResult.style.display = "none";
  els.pearlGame.style.display = "flex";
  // Show the overlay BEFORE measuring, or offsetWidth is 0 (display:none) and the
  // cup spawns off-screen at left:-36px until the first touch.
  game.cupX = (els.gameArea.offsetWidth - GAME_CUP_W) / 2;
  els.gameCup.style.left = Math.round(game.cupX) + "px";
  game.animId = requestAnimationFrame(gameLoop);
}

// Bank the score earned SO FAR this run (capped), crediting only the delta not
// already banked. Called after every catch AND on any early exit, so quitting or
// a break timer expiring mid-game never discards pearls the player already earned
// (matches how Plinko/Pong bank each drop/throw). Idempotent within a run.
function bankCatchScore() {
  const earned = Math.min(game.score, CATCH_CAP);
  const delta = earned - (game.banked || 0);
  if (delta > 0) {
    state.bonusPearls += delta;
    state.gamePearls += delta;
    game.banked = earned;
    saveState();
  }
  return earned;
}

function endPearlGame() {
  cancelAnimationFrame(game.animId);
  game.active = false;
  for (const p of game.pearls) p.el.remove();
  game.pearls = [];
  // Reward is the capped daily bonus, scaled by SCORE (golden pearls help you
  // hit the cap with fewer catches — that's the skill payoff). Already banked
  // incrementally during play; this settles any final remainder.
  const earned = bankCatchScore();
  renderAll();
  if (earned > 0) { checkBadges(true); pearlsWonFx(earned); }   // "Break Champ"
  // Daily Quests: credit pearls caught + best combo this run
  bumpQuest("catchPearls", game.caught);
  bumpQuest("catchCombo", game.bestCombo);
  const capNote = game.score > CATCH_CAP ? ` (daily max +${CATCH_CAP})` : "";
  const grade = game.bestCombo >= 8 ? "Boba master! 🏆"
              : game.bestCombo >= 5 ? "Smooth catching! ✨"
              : game.caught >= 1    ? "Nice run!" : "Maybe next time!";
  els.gameResultEyebrow.textContent = grade;
  els.gameResultText.textContent =
    "You caught " + game.caught + " pearl" + (game.caught !== 1 ? "s" : "") +
    " (best streak ×" + game.bestCombo + "). +" + earned + " to your stash" + capNote + ".";
  els.gameResult.style.display = "flex";
}

// ── Catch feel/juice helpers ──────────────────────────────────────────────
// Squash-pop the cup when it catches something.
function bumpCup() {
  els.gameCup.classList.remove("cup-bump");
  void els.gameCup.offsetWidth;            // restart the CSS animation
  els.gameCup.classList.add("cup-bump");
}
// A little burst at the catch point: "+1" / "+3" / "ice!" floater + splash dots.
function pearlBurst(p, kind) {
  const area = els.gameArea;
  const x = p.x + p.size / 2;
  const y = p.y;
  const tag = document.createElement("div");
  tag.className = "catch-float catch-float-" + kind;
  tag.textContent = kind === "ice" ? "brr!" : kind === "bomb" ? "💥" : (kind === "golden" ? "+3" : "+1");
  tag.style.left = x + "px";
  tag.style.top  = y + "px";
  area.appendChild(tag);
  setTimeout(() => tag.remove(), 650);
}
// Flash the live combo counter when a streak is building.
function flashCombo() {
  if (game.combo < 2) { els.gameCombo.classList.remove("show"); return; }
  els.gameCombo.textContent = "×" + game.combo + " combo!";
  els.gameCombo.classList.remove("show");
  void els.gameCombo.offsetWidth;
  els.gameCombo.classList.add("show");
}
// Brief red vignette when ice is caught.
function flashMiss() {
  els.gameArea.classList.remove("area-flash");
  void els.gameArea.offsetWidth;
  els.gameArea.classList.add("area-flash");
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
  const topPad = 20;
  const settleGap = 8;                                   // breathing room above the slots
  const pegAreaH = H - topPad - slotH - settleGap;
  const rowSpacing = pegAreaH / PLINKO_ROWS;
  const slotW = W / 7;
  const pegR = 5;
  const lastPegY = topPad + (PLINKO_ROWS - 1) * rowSpacing + rowSpacing / 2;
  return { W, H, slotH, topPad, pegAreaH, rowSpacing, slotW, pegR, lastPegY };
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

  const nowT = performance.now();
  for (let r = 0; r < PLINKO_ROWS; r++) {
    for (let j = 0; j <= r + 1; j++) {
      const px = geo.W / 2 + (j - (r + 1) / 2) * slotW;
      const py = topPad + r * rowSpacing + rowSpacing / 2;
      const flashedAt = plinkoPegFlash.get(px + "," + py);
      const glow = flashedAt ? Math.max(0, 1 - (nowT - flashedAt) / 220) : 0;   // 220ms fade
      if (glow > 0) {
        ctx.beginPath();
        ctx.arc(px, py, pegR + 5 * glow, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,224,120,${0.5 * glow})`;   // warm honey halo
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(px, py, pegR, 0, Math.PI * 2);
      ctx.fillStyle = glow > 0 ? "#7a5a3a" : "#3c2a2f";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px - 1.5, py - 1.5, 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fill();
    }
  }
  // Resting pearl waiting at the chute so the board never looks empty (not mid-drop).
  if (!plinko.dropping) drawPlinkoPearl(geo.W / 2, geo.topPad - 12);
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
// On the iPhone build, break games unlock only after a REAL focus session —
// a 5-minute Taste reaching Plinko made pearls too farmable. The web demo
// keeps games always available. Locked buttons stay VISIBLE (with the rule)
// so short-session users learn the games exist and have a reason to go longer.
const GAMES_MIN_SESSION_MIN = 30;

function gamesUnlockedForBreak() {
  if (state.devMode) return true;
  if (!FocusBlocker.available()) return true;   // web demo: unchanged
  return (state.lastSessionMinutes || 0) >= GAMES_MIN_SESSION_MIN;
}

function renderBreakGameButtons() {
  updateCatchBtnState();
  updatePlinkoBtnState();
  updatePongBtnState();
  const note = document.getElementById("gamesLockNote");
  if (note) note.classList.toggle("hidden", gamesUnlockedForBreak());
}

function updateCatchBtnState() {
  const locked = !gamesUnlockedForBreak();
  const done = gameDoneToday("catch");
  els.playGameBtn.disabled = done || locked;
  els.playGameBtn.textContent = locked ? "Catch the Pearls 🔒"
    : done ? "Catch the Pearls ✓ back tomorrow" : "Catch the Pearls 🎮";
}
function updatePlinkoBtnState() {
  const locked = !gamesUnlockedForBreak();
  const done = gameDoneToday("plinko");
  els.playPlinkoBtn.disabled = done || locked;
  els.playPlinkoBtn.textContent = locked ? "Boba Plinko 🔒"
    : done ? "Boba Plinko ✓ back tomorrow" : "Boba Plinko 🎟️";
}
function updatePongBtnState() {
  const locked = !gamesUnlockedForBreak();
  const done = gameDoneToday("pong");
  els.playPongBtn.disabled = done || locked;
  els.playPongBtn.textContent = locked ? "Cup Pong 🔒"
    : done ? "Cup Pong ✓ back tomorrow" : "Cup Pong 🥤";
}

function openPlinko() {
  if (plinko.dropping) return;
  if (!gamesUnlockedForBreak()) { showToast("Break games unlock after a " + GAMES_MIN_SESSION_MIN + " minute focus 🔒"); return; }
  if (gameDoneToday("plinko")) return;
  plinko.playsLeft = PLINKO_MAX_PLAYS;   // fresh session for today
  // NOTE: the daily play is marked on the FIRST drop (see dropPearl), not here,
  // so opening + quitting without dropping doesn't burn the day.
  if (plinko.animId) { cancelAnimationFrame(plinko.animId); plinko.animId = null; }
  plinkoPegFlash.clear();
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
const PLINKO_REST = 0.45;    // bounciness off pegs/walls (was .55 — less edge bounce-back)

// Live peg-hit feedback during a drop: struck pegs glow briefly + a throttled tick.
const plinkoPegFlash = new Map();   // "x,y" -> timestamp
let _lastPlinkoTickAt = 0;
function onPlinkoPegHit(peg) {
  plinkoPegFlash.set(peg.x + "," + peg.y, performance.now());
  const now = performance.now();
  if (now - _lastPlinkoTickAt > 45) {   // a cluster of hits = one pleasant tick, not a buzz
    _lastPlinkoTickAt = now;
    playSfx("tick");
    haptic(4);
  }
}

// Pick the slot this drop lands in, from the designed cozy bell curve.
function plinkoChooseSlot() {
  const total = SLOT_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total, acc = 0;
  for (let i = 0; i < SLOT_WEIGHTS.length; i++) { acc += SLOT_WEIGHTS[i]; if (r < acc) return i; }
  return SLOT_WEIGHTS.length - 1;
}

// Advance the pearl one physics tick toward targetX (the chosen slot centre). It still
// bounces off pegs for the look, but a spring that firms up as it descends — plus a hard
// funnel below the last peg row — commits it to the designed slot. Returns true once it
// drops into the slots. Mutates p = {x,y,vx,vy}.
function plinkoStep(p, pegs, geo, h, targetX) {
  p.vy += PLINKO_GRAV * h;
  // Homing: weak high up (looks natural), firm low (commit to the slot).
  const span = geo.H - geo.slotH - geo.topPad;
  const prog = Math.min(1, Math.max(0, (p.y - geo.topPad) / span));
  const k = 7 + 34 * prog * prog;
  p.vx += (targetX - p.x) * k * h;
  if (p.y > geo.lastPegY) { p.vx += (targetX - p.x) * 60 * h; p.vx *= 0.86; }   // funnel
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
        p.vx += (Math.random() * 2 - 1) * 28;   // a little chaos so it isn't on rails
        onPlinkoPegHit(peg);
      }
      if (Math.abs(p.vx) + Math.abs(p.vy) < 30) p.vx += (Math.random() < 0.5 ? -1 : 1) * 60;
    }
  }
  return p.y + PLINKO_R >= geo.H - geo.slotH;
}

function resolvePlinko(geo, x) {
  plinko.dropping = false;
  plinko.animId = null;
  let slot = Math.floor(x / geo.slotW);
  slot = Math.max(0, Math.min(SLOT_REWARDS.length - 1, slot));
  const reward = SLOT_REWARDS[slot];
  drawPlinkoBoard(slot);
  drawPlinkoPearl((slot + 0.5) * geo.slotW, geo.H - geo.slotH / 2);
  plinkoSlotPop(geo, slot, reward);   // kawaii burst over the winning slot
  state.bonusPearls += reward;
  state.gamePearls += reward;
  saveState();
  renderAll();
  checkBadges(true);   // "Break Champ"
  pearlsWonFx(reward, false);   // pulse the chip (result overlay shows the amount)
  // Layered land sound: thunk first, reward chime scaled to value.
  playSfx("drop");
  setTimeout(() => playSfx(reward >= 5 ? "success" : "coin"), 90);
  haptic(reward >= 5 ? [12, 40, 25] : 8);
  setTimeout(() => showPlinkoResult(reward), 650);   // let the pop breathe
}

// A small kawaii burst over the winning slot — honey for a jackpot, blush/mint otherwise.
function plinkoSlotPop(geo, slot, reward) {
  if (prefersReducedMotion()) return;
  const cx = (slot + 0.5) * geo.slotW;
  const cy = geo.H - geo.slotH - 6;
  const n = reward >= 5 ? 10 : (reward >= 3 ? 6 : 3);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() * 2 - 1) * 1.0;
    const sp = 120 + Math.random() * 140;
    parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1 });
  }
  const colors = reward >= 5 ? ["#f0bb4f", "#ffe048"] : ["#ef8aa0", "#d9f3ea"];
  const ctx = els.plinkoCanvas.getContext("2d");
  let t = performance.now();
  function tick(now) {
    if (plinko.dropping) return;   // a new drop started; bail
    const h = Math.min((now - t) / 1000, 0.032); t = now;
    drawPlinkoBoard(slot);
    drawPlinkoPearl(cx, geo.H - geo.slotH / 2);
    let alive = false;
    parts.forEach((p, i) => {
      p.vy += 600 * h; p.x += p.vx * h; p.y += p.vy * h; p.life -= h * 1.6;
      if (p.life > 0) {
        alive = true;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = colors[i % colors.length]; ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
    if (alive) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function dropPearl() {
  if (plinko.dropping || plinko.playsLeft <= 0) return;
  plinko.dropping = true;
  if (plinko.playsLeft === PLINKO_MAX_PLAYS) { markGamePlayed("plinko"); bumpQuest("gamesPlayed", 1); }   // burn the day on first real drop
  plinko.playsLeft--;
  els.plinkoDropBtn.disabled = true;
  els.plinkoResult.style.display = "none";
  updatePlinkoHUD();
  updatePlinkoBtnState();
  playSfx("drop");
  haptic(6);

  const geo = getPlinkoGeo();
  const pegs = plinkoPegs(geo);
  const targetSlot = plinkoChooseSlot();
  // jitter the aim point inside the slot so peg rows don't resonate at some widths
  const targetX = (targetSlot + 0.5) * geo.slotW + (Math.random() * 2 - 1) * geo.slotW * 0.18;
  plinko.targetSlot = targetSlot;
  const p = {
    x: geo.W / 2 + (Math.random() * 2 - 1) * 6,
    y: geo.topPad - 12,
    vx: (Math.random() * 2 - 1) * 15,
    vy: 0
  };

  // Reduced motion: simulate to the result without animating.
  if (prefersReducedMotion()) {
    let guard = 0;
    while (!plinkoStep(p, pegs, geo, 0.016, targetX) && guard++ < 600) {}
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
    const sub = 3, h = dt / sub;
    for (let s = 0; s < sub; s++) { if (plinkoStep(p, pegs, geo, h, targetX)) { landed = true; break; } }
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
  if (els.plinkoGame.style.display === "none") return;   // user quit before the drop resolved
  const eyebrows = { 5: "Jackpot! 🧋", 3: "Ooh, nice drop!", 1: "Sweet little sip 🤎" };
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
      case "tick":    tone(ctx, { freq: 660, freq2: 520, type: "triangle", dur: 0.035, peak: 0.045 }); break;
      case "swish":   tone(ctx, { freq: 1200, freq2: 1700, type: "sine", dur: 0.10, peak: 0.07 });
                      tone(ctx, { freq: 760,  freq2: 540,  type: "sine", t0: 0.04, dur: 0.16, peak: 0.10 });
                      tone(ctx, { freq: 320,  freq2: 200,  type: "sine", t0: 0.09, dur: 0.18, peak: 0.08 }); break;
      case "rimRattle": tone(ctx, { freq: 240, type: "triangle", dur: 0.04, peak: 0.08 });
                        tone(ctx, { freq: 200, type: "triangle", t0: 0.05, dur: 0.05, peak: 0.06 }); break;
      case "buzz":    tone(ctx, { freq: 180, freq2: 80, type: "sawtooth", dur: 0.20, peak: 0.13 }); break;
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
  // Dev mode mints unlimited pearls/unlocks, so the row is hidden from normal
  // users (TestFlight included — Squad leaderboards must stay honest). Unlock:
  // tap the "Settings" title 7 times. Anyone already in dev mode keeps the row.
  const row = document.getElementById("devRow");
  if (row) row.classList.toggle("hidden",
    !(state.devMode || localStorage.getItem("bobaFocusDevUnlock")));
}


// ── Boba map (Leaflet + free OpenStreetMap tiles, lazy-loaded) ────────────────

const LEAFLET_CSS = "assets/vendor/leaflet/leaflet.css";
const LEAFLET_JS  = "assets/vendor/leaflet/leaflet.js";
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
    // A transient load failure (first visit while offline, before the SW has
    // precached) must not brick the map for the whole session: forget this
    // attempt so the next open injects a fresh <script>.
    s.onerror = () => {
      leafletPromise = null;
      s.remove(); link.remove();
      reject(new Error("leaflet failed to load"));
    };
    document.head.appendChild(s);
  });
  return leafletPromise;
}

function setMapStatus(msg, retryFn) {
  const el = document.getElementById("mapStatus");
  if (!el) return;
  if (!msg) { el.classList.add("hidden"); return; }
  el.textContent = msg;
  if (retryFn) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "map-retry";
    btn.textContent = "Try again";
    btn.addEventListener("click", () => { playSfx("tap"); retryFn(); });
    el.appendChild(btn);
  }
  el.classList.remove("hidden");
}

let mapBuilding = false;   // guard: fast open/close/open must not double-build
let lastFix = null;        // { lat, lng, real } — the fix the map is centered on

function openMap() {
  openSheet("mapSheet");
  bumpQuest("mapOpen", 1);   // Daily Quest: peek at the boba map
  if (mapObj) {
    setTimeout(() => mapObj.invalidateSize(), 250);
    relocateMap();           // moved cities? allowed location since? catch up
    return;
  }
  if (mapBuilding) return;
  mapBuilding = true;
  setMapStatus("Loading the map…");
  ensureLeaflet()
    .then(locateAndBuild)
    .catch(() => {
      mapBuilding = false;
      setMapStatus("Couldn't load the map — check your connection.", openMap);
    });
}

function locateAndBuild() {
  const fallback = [37.7749, -122.4194];   // a real area to demo with if location is off
  if (!navigator.geolocation) { buildMap(fallback[0], fallback[1], false, "unsupported"); return; }
  setMapStatus("Finding boba near you…");
  navigator.geolocation.getCurrentPosition(
    (pos) => buildMap(pos.coords.latitude, pos.coords.longitude, true),
    // Denied is a settings problem; anything else (timeout, no fix indoors)
    // deserves a retry button instead of silently stranding the demo city.
    (err) => buildMap(fallback[0], fallback[1], false, err && err.code === 1 ? "denied" : "flaky"),
    { timeout: 12000, maximumAge: 300000 }
  );
}

// Re-check the user's position on later map opens (and via "Try again"):
// recenter + refetch shops when they've actually moved, or when the map is
// still sitting on the demo city because the first fix failed.
function relocateMap() {
  if (!navigator.geolocation || !mapObj) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const la = pos.coords.latitude, lo = pos.coords.longitude;
      const moved = !lastFix || !lastFix.real ||
        haversine(lastFix.lat, lastFix.lng, la, lo) > 1500;   // >1.5 km = actually moved
      if (!moved) return;
      lastFix = { lat: la, lng: lo, real: true };
      mapObj.setView([la, lo], 15);
      if (meMarker) {
        meMarker.setLatLng([la, lo]);
        meMarker.setPopupContent('<div class="map-pop-name">You are here</div>');   // drop the stale "Example area" copy
      }
      setMapStatus("");
      loadNearbyShops(la, lo);
    },
    () => {
      if (lastFix && !lastFix.real) {
        setMapStatus("Still can't get your location — check Location Services for Mr. Tapioca.", relocateMap);
      }
    },
    { timeout: 12000, maximumAge: 120000 }
  );
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
//
// Hardened after real-world failures: the public Overpass servers regularly
// time out or 504 under load, AND a timed-out query still returns HTTP 200
// with empty elements + a "remark" — which used to render as "no boba nearby"
// even in boba-dense cities. So we: (1) try several mirror servers in order,
// (2) treat a runtime/timeout remark as a failure, not an empty result,
// (3) scope the name search to food/drink places so the query is fast enough
// to not time out, (4) match cuisine as a list (OSM uses "bubble_tea;taiwanese")
// plus well-known chains that don't have "boba" in their name,
// (5) cache results for 24h per ~1km cell so reopening the map is instant.
// Ordered by observed reliability for our query shape (live-tested Jul 2026):
// kumi handled the heavy clauses, mail.ru times out most, so it goes last.
const OVERPASS_SERVERS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
];
// Chain list verified against live OSM data (NYC/Chinatown sweep, Jul 2026).
// "coco" must stay qualified — bare it matches Cocoron / The Cocoa Exchange /
// coconut anything. Overpass regex has no \b, so keep patterns specific.
const BOBA_NAME_RE = "boba|bubble ?tea|milk ?tea|tapioca|gong ?cha|kung ?fu ?tea|" +
  "share ?tea|cha ?time|happy ?lemon|tiger ?sugar|ding ?tea|vivi|yi ?fang|tpumps|" +
  "7 ?leaves|omomo|coco (fresh|tea)|coco都可|quickly|teaspoon|tastea|" +
  "the alley|xing ?fu ?tang|machi ?machi|moge ?tee|truedan|sunright|mr\\.? ?wish|" +
  "presotea|onezo|tp ?tea|wushiland|meet ?fresh|ten ?ren|lollicup|" +
  "tapioca ?express|hey ?tea|nayuki|chicha ?san ?chen|milksha|macao ?imperial|" +
  "tealive|koi ?th[eé]|i.?milky|mixue|chun ?yang|bambu|debutea|wanpo|teazzi";

function overpassQuery(lat, lng, radius) {
  // cuisine=bubble_tea is the gold-standard tag. shop=beverages/tea alone is
  // NOT boba (beer markets, loose-leaf tea shops) — those need a boba-ish name.
  // One global [bbox:] instead of four around:-scans: hits the spatial index
  // once, far cheaper on busy public mirrors (fewer timeouts).
  const dLat = radius / 111320;
  const dLng = radius / (111320 * Math.cos(lat * Math.PI / 180));
  const box = `${lat - dLat},${lng - dLng},${lat + dLat},${lng + dLng}`;
  return `[out:json][timeout:25][bbox:${box}];(` +
    `nwr["cuisine"~"bubble_tea"];` +
    `nwr["shop"="bubble_tea"];` +
    `nwr["shop"~"beverages|tea"]["name"~"${BOBA_NAME_RE}",i];` +
    `nwr["amenity"~"cafe|fast_food|restaurant|ice_cream|juice_bar"]["name"~"${BOBA_NAME_RE}",i];` +
    `);out center 120;`;
}

// Hand-verified boba spots that OpenStreetMap is missing (checked against the
// 2026 Ithaca student guides / Yelp / the shops' own sites). OSM's small-town
// coverage is thin — this guarantees the launch market is complete no matter
// what the live query returns, and it's the seed of the future partner list.
// Add new cities as { name, lat, lng } — merge + dedupe below handles overlap
// if mappers later add these shops to OSM.
const CURATED_SHOPS = [
  { name: "Taichi Bubble Tea",  lat: 42.43013, lng: -76.50853 },   // 740 S Meadow St, Ithaca
  { name: "Panda Tea Lounge",   lat: 42.44192, lng: -76.48724 },   // 407 Eddy St, Collegetown
];

function curatedNear(lat, lng, radius) {
  return CURATED_SHOPS
    .filter(s => haversine(lat, lng, s.lat, s.lng) <= radius)
    .map(s => ({ name: s.name, lat: s.lat, lng: s.lng }));
}

// Merge curated spots into a result list, skipping any the live data already
// has (same-ish name, or anything within ~120 m — the shop just got mapped).
function mergeCurated(shops, lat, lng, radius) {
  const out = shops.slice();
  for (const c of curatedNear(lat, lng, radius)) {
    // Dense blocks (Collegetown!) have distinct shops <120m apart, so bare
    // proximity must be TIGHT; same-name matching gets a looser radius.
    const dup = out.some(s => {
      const d = haversine(s.lat, s.lng, c.lat, c.lng);
      const sameName = s.name.toLowerCase().includes(c.name.toLowerCase().slice(0, 9));
      return d < 40 || (sameName && d < 250);
    });
    if (!dup) out.push(c);
  }
  return out;
}

function fetchRealBobaShops(lat, lng, radius = 6000) {
  // 24h cache keyed by ~1km cell — makes reopening instant and rides out API
  // flakiness. v2: query cleanup (beer/leaf-tea pollution) — old cells ignored.
  const cacheKey = "bobaShops2:" + lat.toFixed(2) + "," + lng.toFixed(2);
  try {
    const hit = JSON.parse(localStorage.getItem(cacheKey));
    if (hit && Date.now() - hit.t < 86400000 && Array.isArray(hit.shops) && hit.shops.length) {
      return Promise.resolve(hit.shops);
    }
  } catch (e) {}

  const body = "data=" + encodeURIComponent(overpassQuery(lat, lng, radius));
  // A mirror that times out mid-stream returns HTTP 200 + a "remark" + only the
  // elements it got to. That's a PARTIAL list, not the neighborhood's truth —
  // keep it as a last resort but try the next mirror for a complete answer.
  let bestPartial = null;
  const tryServer = (i) => {
    if (i >= OVERPASS_SERVERS.length) {
      if (bestPartial) return Promise.resolve(bestPartial);
      return Promise.reject(new Error("all overpass mirrors failed"));
    }
    const ctrl = ("AbortController" in window) ? new AbortController() : null;
    const kill = ctrl ? setTimeout(() => ctrl.abort(), 18000) : null;
    return fetch(OVERPASS_SERVERS[i], {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(r => { if (!r.ok) throw new Error("overpass " + r.status); return r.json(); })
      .then(data => {
        if (data.remark && /error|timed? ?out/i.test(data.remark)) {
          const els = data.elements || [];
          if (els.length && (!bestPartial || els.length > (bestPartial.elements || []).length)) {
            data._partial = true;
            bestPartial = data;
          }
          throw new Error("overpass remark: " + data.remark);
        }
        return data;
      })
      .catch(err => { if (kill) clearTimeout(kill); throw err; })
      .then(data => { if (kill) clearTimeout(kill); return data; })
      .catch(() => tryServer(i + 1));
  };

  return tryServer(0).then(data => {
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
    // Hand-verified spots OSM doesn't know about yet (launch-market guarantee)
    const shopsAll = mergeCurated(shops, lat, lng, radius);
    shops.length = 0; Array.prototype.push.apply(shops, shopsAll);
    shops.sort((a, b) => haversine(lat, lng, a.lat, a.lng) - haversine(lat, lng, b.lat, b.lng));
    // Cache only COMPLETE answers — a partial must not poison this cell for 24h.
    if (shops.length && !data._partial) {
      try {
        // Prune while we're here: v1 cells (old polluted query) and expired v2
        // cells would otherwise pile up in localStorage forever.
        for (let k = localStorage.length - 1; k >= 0; k--) {
          const key = localStorage.key(k);
          if (!key) continue;
          if (key.startsWith("bobaShops:")) { localStorage.removeItem(key); continue; }
          if (key.startsWith("bobaShops2:") && key !== cacheKey) {
            const v = JSON.parse(localStorage.getItem(key) || "null");
            if (!v || Date.now() - v.t > 86400000) localStorage.removeItem(key);
          }
        }
        localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), shops: shops.slice(0, 80) }));
      } catch (e) {}
    }
    shops.partial = !!data._partial;   // let the UI say "partial — try again"
    return shops;
  });
}

let meMarker = null;
function buildMap(lat, lng, real, why) {
  mapBuilding = false;
  lastFix = { lat, lng, real };
  setMapStatus("");
  mapObj = L.map("map", { zoomControl: true }).setView([lat, lng], 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  }).addTo(mapObj);

  meMarker = L.marker([lat, lng], { icon: bobaPin("📍", "me") })
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
  // Every no-location path gets a "Try again" that re-runs geolocation —
  // nobody should be stranded staring at the demo city.
  if (!real) {
    setMapStatus(
      why === "denied"
        ? "Location is off for Mr. Tapioca — allow it in Settings, then try again."
        : "Couldn't get your location — give it another try.",
      relocateMap);
    renderShopList([]);
    return;
  }
  loadNearbyShops(lat, lng);
}

// Fetch + render the real nearby shops. Separate from buildMap so the
// "Try again" button can re-run just this part without rebuilding the map.
let shopMarkers = [];
let shopsLoading = false;   // guard: retry-spam must not stack duplicate pins
function loadNearbyShops(lat, lng) {
  if (shopsLoading) return;
  shopsLoading = true;
  setMapStatus("Finding real boba spots near you…");
  shopMarkers.forEach(m => { try { mapObj.removeLayer(m); } catch (e) {} });
  shopMarkers = [];
  fetchRealBobaShops(lat, lng)
    .then(shops => {
      shopsLoading = false;
      if (!shops.length) {
        setMapStatus("No boba spots listed within ~6 km. OpenStreetMap may not have your local shops mapped yet.",
          () => loadNearbyShops(lat, lng));
        renderShopList([]);
        return;
      }
      if (shops.partial) {
        setMapStatus("The map service was slow — this list may be incomplete.",
          () => loadNearbyShops(lat, lng));
      } else {
        setMapStatus("");
      }
      placeShopMarkers(shops, lat, lng);
    })
    .catch(() => {
      shopsLoading = false;
      // Live search down (mirrors overloaded / offline)? The hand-verified
      // curated spots still work — never show an empty map in a covered city.
      const fallback = mergeCurated([], lat, lng, 6000);
      if (fallback.length) {
        setMapStatus("Live search is busy — showing verified boba spots nearby.",
          () => loadNearbyShops(lat, lng));
        placeShopMarkers(fallback, lat, lng);
      } else {
        setMapStatus("The free map service is busy right now — give it a minute.",
          () => loadNearbyShops(lat, lng));
      }
    });
}

// Drop pins + fill the list for a set of shops (shared by live + fallback paths)
function placeShopMarkers(shops, lat, lng) {
  const items = shops.slice(0, 60).map(shop => {
    const dist = haversine(lat, lng, shop.lat, shop.lng);
    const marker = L.marker([shop.lat, shop.lng], { icon: bobaPin("🧋", "") })
      .addTo(mapObj)
      .bindPopup(
        `<div class="map-pop-name">${escapeHtml(shop.name)}</div>` +
        `<div class="map-pop-meta">${formatDistance(dist)} away · real boba shop</div>`
      );
    shopMarkers.push(marker);
    return { shop, dist, marker };
  });
  renderShopList(items);
}

// Scannable list of the nearby real shops under the map; tapping one pans the map
// to it and opens its popup.
function renderShopList(items) {
  const el = els.mapShopList;
  if (!el) return;
  if (!items || !items.length) { el.innerHTML = ""; el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  el.innerHTML =
    `<div class="map-list-head">${items.length} boba spot${items.length !== 1 ? "s" : ""} nearby</div>` +
    items.map((it, i) =>
      `<button type="button" class="map-shop-item" data-i="${i}">` +
        `<span class="map-shop-emoji">🧋</span>` +
        `<span class="map-shop-text">` +
          `<span class="map-shop-name">${escapeHtml(it.shop.name)}</span>` +
          `<span class="map-shop-dist">${formatDistance(it.dist)} away</span>` +
        `</span>` +
        `<span class="map-shop-go" aria-hidden="true">›</span>` +
      `</button>`
    ).join("");
  el.querySelectorAll(".map-shop-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const it = items[+btn.dataset.i];
      if (!it) return;
      playSfx("tap");
      mapObj.setView([it.shop.lat, it.shop.lng], 17, { animate: true });
      it.marker.openPopup();
      const mapEl = document.querySelector("#map");
      if (mapEl) mapEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  });
}

// ── Study Squad (friends leaderboard via shareable codes — no backend) ────────
// Friends are exchanged peer-to-peer: you share a code that encodes a snapshot of
// your stats; a friend pastes it to add you (and vice-versa). Stats refresh when
// they re-share. ("Live" friends would need accounts + a server — a later step.)
function squadB64Encode(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/=+$/, "");
}
function squadB64Decode(str) {
  return JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, "+").replace(/_/g, "/")))));
}
// ── DAILY QUESTS ─────────────────────────────────────────────────────────────
// Three cozy challenges that refresh each local day (one focus, one make, one
// play). Progress is tracked off existing events via bumpQuest(track, amount);
// rewards auto-grant on completion (no claim step). Fully on-device — no backend.
const QUEST_POOL = {
  focus: [
    { key: "focus25",  title: "Focus for 25 minutes",      target: 25, reward: 3, track: "focusMin",   unit: "m" },
    { key: "focus45",  title: "Focus for 45 minutes",      target: 45, reward: 5, track: "focusMin",   unit: "m" },
    { key: "sessions2",title: "Finish 2 focus sessions",   target: 2,  reward: 4, track: "sessions" },
    { key: "earlyBird",title: "Focus before noon",         target: 1,  reward: 3, track: "earlyFocus" },
  ],
  make: [
    { key: "drink1",   title: "Complete a boba",           target: 1,  reward: 3, track: "drinks" },
    { key: "drink2",   title: "Complete 2 bobas",          target: 2,  reward: 5, track: "drinks" },
  ],
  play: [
    { key: "catch10",  title: "Catch 10 pearls",           target: 10, reward: 3, track: "catchPearls" },
    { key: "combo5",   title: "Hit a 5× combo in Catch",   target: 5,  reward: 3, track: "catchCombo", mode: "max" },
    { key: "pong2",    title: "Sink 2 cups in Cup Pong",   target: 2,  reward: 3, track: "pongMakes" },
    { key: "playGame", title: "Play a break mini-game",    target: 1,  reward: 2, track: "gamesPlayed" },
    { key: "map1",     title: "Peek at the boba map",      target: 1,  reward: 2, track: "mapOpen" },
  ],
};
const ALL_QUESTS = [...QUEST_POOL.focus, ...QUEST_POOL.make, ...QUEST_POOL.play];
function questDef(key) { return ALL_QUESTS.find((q) => q.key === key); }
function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Make sure state.quests holds a valid set for TODAY; regenerate at midnight.
function ensureTodayQuests() {
  const today = localDateKey(new Date());
  const q = state.quests;
  // Validate shape too — a structurally-broken entry (missing prog/done) would
  // otherwise produce NaN progress and a quest that can never complete.
  const valid = q && q.day === today && Array.isArray(q.active) && q.active.length === 3
    && q.active.every((a) => questDef(a.key) && Number.isFinite(a.prog) && typeof a.done === "boolean");
  if (valid) return;
  state.quests = {
    day: today,
    active: [pickOne(QUEST_POOL.focus), pickOne(QUEST_POOL.make), pickOne(QUEST_POOL.play)]
              .map((def) => ({ key: def.key, prog: 0, done: false })),
  };
  saveState();
}

// Advance any active quest tracking `track`. amount is added (or maxed for combo).
function bumpQuest(track, amount = 1) {
  if (!amount && amount !== 0) return;
  ensureTodayQuests();
  let completedAny = false;
  for (const a of state.quests.active) {
    const def = questDef(a.key);
    if (!def || def.track !== track || a.done) continue;
    if (def.mode === "max") a.prog = Math.max(a.prog, amount);
    else a.prog = Math.min(def.target, a.prog + amount);
    if (a.prog >= def.target) {
      a.prog = def.target;
      a.done = true;
      completedAny = true;
      onQuestComplete(def);
    }
  }
  saveState();
  if (completedAny) { renderAll(); }     // refresh pearl chip + quest panel
  else { renderQuests(); updateQuestBadge(); }
}

function onQuestComplete(def) {
  state.bonusPearls += def.reward;
  playSfx("success"); haptic([12, 40, 18]);
  pearlsWonFx(def.reward, false);        // pop the pearl chip (no toast)
  showToast(`🎯 Quest done: ${def.title}! +${def.reward} pearls`);
}

function questsRemaining() {
  if (!state.quests || state.quests.day !== localDateKey(new Date())) return 3;
  return state.quests.active.filter((a) => !a.done).length;
}

// Little count badge on the nav Quests pill.
function updateQuestBadge() {
  const badge = document.querySelector("#questBadge");
  if (!badge) return;
  const n = questsRemaining();
  badge.textContent = String(n);
  badge.classList.toggle("hidden", n === 0);
}

function renderQuests() {
  const list = document.querySelector("#questsList");
  if (!list) return;
  ensureTodayQuests();
  const cards = state.quests.active.map((a) => {
    const def = questDef(a.key);
    if (!def) return "";   // defensive: skip a quest whose key no longer exists
    const pct = Math.min(100, Math.round((a.prog / def.target) * 100));
    const sub = a.done ? "Done!" : `${a.prog} / ${def.target}${def.unit || ""}`;
    return `<div class="quest-card${a.done ? " done" : ""}">` +
      `<span class="quest-info">` +
        `<span class="quest-title">${escapeHtml(def.title)}</span>` +
        `<span class="quest-track"><span class="quest-fill" style="width:${pct}%"></span></span>` +
        `<span class="quest-sub">${sub}</span>` +
      `</span>` +
      `<span class="quest-reward${a.done ? " claimed" : ""}">+${def.reward}</span>` +
    `</div>`;
  }).join("");
  list.innerHTML = cards;
}

function openQuests() {
  ensureTodayQuests();
  renderQuests();
  updateQuestBadge();
  openSheet("questsSheet");
}

function myDisplayName() { return (state.displayName && state.displayName.trim()) || "You"; }
// Stable per-user id shared in offline squad codes so friends are identified by
// identity, not display name — otherwise two default-named ("You") users can't
// add each other, and same-named friends overwrite each other.
function mySquadId() {
  if (!state.squadId) { state.squadId = "s" + Math.random().toString(36).slice(2, 10); saveState(); }
  return state.squadId;
}
function mySquadStats() {
  const st = computeStats();
  // No live-status field: activity presence is deliberately NOT broadcast
  // (privacy); squad-cloud falls back to a neutral "idle" for its RPC param.
  return { name: myDisplayName(), mins: st.totalMin, drinks: state.collection.length, streak: st.current, skin: state.skin || "" };
}
function squadCloudLive() { return !!(window.SquadCloud && SquadCloud.enabled && SquadCloud.ready); }
function encodeMyCode() {
  // Live backend: share the short server friend-code. Offline: a base64 snapshot.
  if (squadCloudLive() && SquadCloud.myCode()) return SquadCloud.myCode();
  const me = mySquadStats();
  return squadB64Encode({ i: mySquadId(), n: me.name.slice(0, 24), m: me.mins, d: me.drinks, s: me.streak, k: me.skin, t: Date.now() });
}
function parseSquadCode(raw) {
  if (!raw) return null;
  let str = String(raw).trim();
  const m = str.match(/sq=([A-Za-z0-9+/_=-]+)/);   // accept a full share link too
  if (m) str = m[1];
  str = str.replace(/\s+/g, "");
  try {
    const o = squadB64Decode(str);
    if (!o || typeof o.n !== "string") return null;
    return {
      sid: (typeof o.i === "string" ? o.i : ""),
      name: (String(o.n).slice(0, 24) || "Friend"),
      mins: Math.max(0, Number(o.m) || 0),
      drinks: Math.max(0, Number(o.d) || 0),
      streak: Math.max(0, Number(o.s) || 0),
      skin: typeof o.k === "string" ? o.k : "",
      ts: Number(o.t) || Date.now()
    };
  } catch (e) { return null; }
}
function addFriendByCode(raw) {
  // Live backend: a friend code is 6 chars (A-Z/2-9). Route to the server.
  if (squadCloudLive()) {
    const m = String(raw || "").trim().toUpperCase().match(/[A-Z2-9]{6}/);
    if (!m) { showToast("Enter your friend's 6-character code."); return false; }
    SquadCloud.follow(m[0]).then((ok) => { playSfx(ok ? "success" : "tap"); showToast(ok ? "Added to your squad! 🧋" : "No one found with that code."); });
    return true;
  }
  const f = parseSquadCode(raw);
  if (!f) { showToast("Hmm, that code didn't work — copy the whole thing."); return false; }
  const isSelf = f.sid ? (f.sid === mySquadId())
                       : (f.name.toLowerCase() === myDisplayName().toLowerCase());
  if (isSelf) { showToast("That's your own code 🧋"); return false; }
  const existing = f.sid
    ? state.friends.find((x) => x.sid && x.sid === f.sid)
    : state.friends.find((x) => !x.sid && x.name.toLowerCase() === f.name.toLowerCase());
  if (existing) { Object.assign(existing, f); showToast(`Updated ${f.name}'s stats ✨`); }
  else { state.friends.push({ id: uuid(), ...f }); playSfx("success"); haptic(12); showToast(`Added ${f.name} to your squad! 🧋`); }
  saveState();
  renderSquad();
  return true;
}
function removeFriend(id) {
  state.friends = state.friends.filter((f) => f.id !== id);
  saveState();
  renderSquad();
}
// skin comes from the cloud (any follower can set any string) — own-property
// check keeps "constructor"/"toString" style values from hitting the prototype.
function squadAvatar(skin) {
  return (skin && Object.prototype.hasOwnProperty.call(SKIN_IMAGES, skin) &&
          typeof SKIN_IMAGES[skin] === "string")
    ? SKIN_IMAGES[skin] : "assets/Mr. Tapioca.png";
}
function squadRelative(ts) {
  const t = typeof ts === "number" ? ts : Date.parse(ts);
  if (!t) return "recently";
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 7) return days + " days ago";
  const w = Math.floor(days / 7); return w === 1 ? "1 week ago" : w + " weeks ago";
}
function renderSquad() {
  const me = mySquadStats();
  const av = document.querySelector("#squadMeAvatar"); if (av) av.src = squadAvatar(me.skin);
  const nm = document.querySelector("#squadMeName"); if (nm) nm.textContent = me.name;
  const ms = document.querySelector("#squadMeStats");
  if (ms) ms.textContent = `${formatFocusTotal(me.mins)} focused · ${me.streak}🔥`;
  const board = document.querySelector("#squadBoard"); if (!board) return;
  const live = squadCloudLive();
  let rows;
  if (live) {
    // Server returns self + everyone I follow (already RLS-scoped).
    rows = SquadCloud.friends.map((f) => ({ id: f.id, name: f.name, mins: f.mins, drinks: f.drinks, streak: f.streak, skin: f.skin, ts: f.ts, me: !!f.me }));
    if (!rows.some((r) => r.me)) rows.unshift({ id: "me", name: me.name, mins: me.mins, drinks: me.drinks, streak: me.streak, skin: me.skin, ts: Date.now(), me: true });
  } else {
    rows = [{ id: "me", name: me.name, mins: me.mins, drinks: me.drinks, streak: me.streak, skin: me.skin, me: true }]
      .concat(state.friends.map((f) => ({ ...f, me: false })));
  }
  rows.sort((a, b) => b.mins - a.mins);
  board.innerHTML = rows.map((r, i) => {
    const rank = `<span class="squad-rank-num">${i + 1}</span>`;
    return `<div class="squad-row${r.me ? " me" : ""}">` +
      `<span class="squad-rank">${rank}</span>` +
      `<img class="squad-row-avatar" src="${squadAvatar(r.skin)}" alt="">` +
      `<span class="squad-row-info">` +
        `<span class="squad-row-name">${escapeHtml(r.name)}${r.me ? ' <span class="squad-you">YOU</span>' : ""}</span>` +
        `<span class="squad-row-sub">${formatFocusTotal(r.mins)}</span>` +
      `</span>` +
      `<span class="squad-row-stats">${r.streak}🔥</span>` +
      (r.me ? "" : `<button class="squad-remove" data-id="${r.id}" aria-label="Remove ${escapeHtml(r.name)}">✕</button>`) +
      `</div>`;
  }).join("");
  board.querySelectorAll(".squad-remove").forEach((b) => b.addEventListener("click", () => {
    if (live) SquadCloud.unfollow(b.dataset.id); else removeFriend(b.dataset.id);
  }));
}
function shareSquadCode() {
  const code = encodeMyCode();
  playSfx("open");
  const text = `Add me on Mr. Tapioca! Paste my Study Squad code in the app (Squad, then Add):\n\n${code}`;
  if (navigator.share) {
    navigator.share({ title: "Mr. Tapioca Study Squad", text }).catch(() => {});
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(() => showToast("Code copied, send it to a friend!"), () => showToast("Couldn't copy. Long-press to select."));
  } else {
    showToast("Sharing isn't available here.");
  }
}
const RENAME_PEARL_COST = 20;
function editSquadName() {
  const current = (state.displayName || "").trim();

  // No name yet (e.g. skipped onboarding) → the first set is FREE.
  if (!current) {
    const name = window.prompt("Pick your boba shop name:", "");
    if (name === null) return;
    const n = name.trim().slice(0, 24);
    if (!n) return;
    state.displayName = n;
    saveState(); renderSquad(); updateStats();
    playSfx("success"); haptic(10);
    showToast(`Nice to meet you, ${n}! 🧋`);
    return;
  }

  const renames = state.renames || 0;

  // First change → costs 500 pearls.
  if (renames === 0) {
    if (currentPearls() < RENAME_PEARL_COST) {
      showToast(`A name change costs ${RENAME_PEARL_COST} pearls. Keep focusing to earn them!`);
      playSfx("tap"); return;
    }
    if (!confirm(`Change your name for ${RENAME_PEARL_COST} pearls?\n\nHeads up: any change after this one becomes a small in-app purchase.`)) return;
    const name = window.prompt("Your new name:", current);
    if (name === null) return;
    const n = name.trim().slice(0, 24);
    if (!n || n === current) return;
    state.spent += RENAME_PEARL_COST;
    state.displayName = n;
    state.renames = 1;
    saveState(); renderSquad(); updateStats();
    playSfx("coin"); haptic(14);
    showToast(`Renamed to ${n} (−${RENAME_PEARL_COST} pearls)`);
    return;
  }

  // Second change onward → real money (in-app purchase; placeholder until IAP is wired).
  playSfx("tap");
  showToast("Extra name changes are a small in-app purchase, coming soon.");
}

// Settings "Your name" row: reflect the current name + what the next change costs.
function renderNameRow() {
  const cur = (state.displayName || "").trim();
  const label = document.querySelector("#changeNameLabel");
  if (label) label.textContent = cur ? "Change Name" : "Set Your Name";
  const val = document.querySelector("#yourNameValue");
  if (val) val.textContent = cur || "not set";
  // Right-aligned cost tag: pearl price for the first change, free before a
  // name exists, blank once further changes become an in-app purchase.
  const cost = document.querySelector("#renameCostTag");
  if (cost) cost.textContent = !cur ? "free" : ((state.renames || 0) === 0 ? String(RENAME_PEARL_COST) : "");
}
let squadPollId = null;
function openFriends() {
  openSheet("friendsSheet");
  renderSquad();
  if (window.SquadCloud && SquadCloud.enabled) {
    SquadCloud.fetchFriends();   // refresh live stats now…
    // …then keep refreshing while the sheet is open so friends' current statuses
    // (🟢 Focusing / 🌸 break / Online) update live without reopening. Cleared in closeSheets.
    clearInterval(squadPollId);
    squadPollId = setInterval(() => {
      if (window.SquadCloud && SquadCloud.ready) SquadCloud.fetchFriends();
    }, 12000);
  }
}

// ── First-run onboarding ──────────────────────────────────────────────────────

const ONBOARD_STEPS = [
  {
    img: "assets/Mr. Tapioca.png",
    title: "Say Hello to Mr. Tapioca!",
    body: "Your favorite study buddy. He brews boba while you focus."
  },
  {
    emoji: "🎮",
    title: "Work Hard, Play Hard!",
    body: "Break games live here: Catch the Pearls, Boba Plinko, and Cup Pong. Finish a real focus session to unlock them on your break and win bonus pearls."
  },
  {
    img: "assets/Cup.png",
    title: "Focus Fills your Cup!",
    body: "Set the timer, start focusing, and watch the cup fill. Earn yourself a boba drink with each study sesh."
  },
  {
    img: "assets/Tapioca Currency.png",
    title: "Earn Pearls as You Go!",
    body: "Every 15 minutes = 1 pearl earned. Spend them on character skins and backgrounds in the shop."
  },
  {
    emoji: "🏆",
    title: "Share with Friends!",
    body: "Show off your focus stats with invited users on a group leaderboard."
  },
  {
    emoji: "🗺️",
    title: "Real Rewards Await!",
    body: "Mr. Tapioca wants to work at real shops. Stay tuned to unlock discounts at boba shops near you. Check out the in-app map to locate shops to visit."
  },
  {
    name: true,
    img: "assets/Mr. Tapioca.png",
    title: "Now that we're friends ...",
    body: "What should I call you?"
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

  // Name-creation step: reveal the text input + focus it.
  const isName = !!step.name;
  if (els.onboardNameInput) {
    els.onboardNameInput.classList.toggle("hidden", !isName);
    if (isName) {
      els.onboardNameInput.value = state.displayName || "";
      setTimeout(() => { try { els.onboardNameInput.focus(); } catch (e) {} }, 220);
    }
  }

  els.onboardDots.innerHTML = ONBOARD_STEPS
    .map((_, i) => `<span class="${i === onboardStep ? "on" : ""}"></span>`)
    .join("");

  els.onboardBack.classList.toggle("hidden", onboardStep === 0);
  els.onboardNext.textContent = isName ? "That's me! 🧋"
    : (onboardStep === ONBOARD_STEPS.length - 1 ? "Let's go! 🧋" : "Next");
}

function onboardAdvance() {
  // If we're leaving the name step, save the chosen name (free — this is the
  // initial set; later changes cost pearls, then real money — see editSquadName).
  const step = ONBOARD_STEPS[onboardStep];
  if (step && step.name && els.onboardNameInput) {
    const n = (els.onboardNameInput.value || "").trim().slice(0, 24);
    if (n) {
      state.displayName = n;
      saveState();
      if (window.SquadCloud && SquadCloud.ready) SquadCloud.pushProfile();
    }
  }
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

function finishOnboarding(skipped) {
  els.onboarding.classList.add("hidden");
  state.onboarded = true;
  localStorage.setItem("bobaFocusOnboarded", "true");
  playSfx("success");
  haptic(10);
  // First-run only: after the story intro, walk through what every button does.
  // Someone who hit "Skip" opted OUT of hand-holding — forcing the 10-step tour
  // on them anyway is the opposite of what Skip promised. (Replayable in Settings.)
  if (skipped === true) { localStorage.setItem("bobaFocusTourDone", "skipped"); return; }
  if (!localStorage.getItem("bobaFocusTourDone")) setTimeout(startFeatureTour, 700);
}

// ── Feature tour: spotlight coach marks over the real UI ─────────────────────
// Dims the app and highlights one control at a time with a short explanation.
// Auto-runs once after onboarding; replayable from Settings → Feature tour.
const TOUR_STEPS = [
  { sel: null, title: "Welcome to your boba shop! 🧋",
    text: "Quick tour of what everything does? Takes 30 seconds. You can replay it anytime from Settings." },
  { sel: [".size-picker"], title: "Pick your session",
    text: "Custom brews any length from 15 minutes to 4 hours. Goal matches the focus goal you set in Settings. Finish the timer to earn your boba." },
  { sel: ["#startPauseBtn"], title: "Start focusing",
    text: "Mr. Tapioca starts mixing your boba while you work. The cup fills as you focus." },
  { sel: [".pearl-chip"], title: "Tapioca pearls",
    text: "Your currency. Every 15 focused minutes earns a pearl. On iPhone, blocking your distracting apps earns the full amount." },
  { sel: ["#questsBtn"], title: "Daily quests",
    text: "Three small goals a day for bonus pearls. Clear all three for an extra bonus." },
  { sel: ["#shopBtn"], title: "The Shop",
    text: "Spend pearls on character skins and shop backgrounds. A couple of fancy ones are premium." },
  { sel: ["#mapBtn"], title: "Boba map",
    text: "Real bubble-tea shops near you. Finished drinks will earn real perks at partner shops." },
  { sel: ["#friendsBtn"], title: "Study Squad",
    text: "Add friends and climb a shared leaderboard together. Focusing is cozier with company." },
  { sel: ["#settingsBtn"], title: "Settings ⭐",
    text: "Pick apps to BLOCK during focus (the whole point!), plus sounds, goals, and progress. Tap the drink name anytime to customize your boba." },
];
let tourStep = 0;
let tourOn = false;

function startFeatureTour() {
  // The tour spotlights focus-screen controls; during a break / break-offer
  // those are display:none and the spotlight would pulse over nothing. Defer
  // instead of pointing at the void.
  if (state.phase !== "focus" || els.shopScene.classList.contains("is-on-break")) {
    showToast("Finish your break first, then the tour can point at everything 🧋");
    return;
  }
  closeSheets();
  const dlg = document.querySelector("#rewardDialog");
  if (dlg && dlg.open) dlg.close();
  tourOn = true;
  tourStep = 0;
  document.querySelector("#coachTour").classList.remove("hidden");
  renderTourStep();
  playSfx("open");
  // Keyboard must not reach the app underneath (Tab+Enter could start a
  // session under the overlay). Trap focus on the tour's two buttons.
  document.addEventListener("keydown", tourKeyTrap, true);
  try { document.querySelector("#coachNext").focus({ preventScroll: true }); } catch (e) {}
}

function endFeatureTour(done) {
  tourOn = false;
  document.querySelector("#coachTour").classList.add("hidden");
  document.removeEventListener("keydown", tourKeyTrap, true);
  localStorage.setItem("bobaFocusTourDone", "1");
  playSfx(done ? "success" : "tap");
  if (done) haptic(10);
}

function tourKeyTrap(e) {
  if (!tourOn) return;
  if (e.key === "Escape") { e.preventDefault(); endFeatureTour(false); return; }
  const next = document.querySelector("#coachNext");
  const skip = document.querySelector("#coachSkip");
  if (e.key === "Tab") {
    e.preventDefault();
    (document.activeElement === next ? skip : next).focus();
    return;
  }
  // Any other key: keep it inside the tour (block space/enter on app controls)
  if (document.activeElement !== next && document.activeElement !== skip &&
      (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    next.focus();
  }
}

function renderTourStep() {
  const s = TOUR_STEPS[tourStep];
  const overlay = document.querySelector("#coachTour");
  const hole = document.querySelector("#coachHole");
  const tip = document.querySelector("#coachTip");
  const oRect = overlay.getBoundingClientRect();

  let target = null;
  if (s.sel) for (const q of s.sel) { target = document.querySelector(q); if (target) break; }

  // The hole's giant box-shadow does the dimming. With no target (welcome card)
  // we shrink it to a point mid-screen so the shadow still dims everything.
  const pad = 8;
  if (target) {
    const r = target.getBoundingClientRect();
    hole.style.left = (r.left - oRect.left - pad) + "px";
    hole.style.top = (r.top - oRect.top - pad) + "px";
    hole.style.width = (r.width + pad * 2) + "px";
    hole.style.height = (r.height + pad * 2) + "px";
    hole.classList.add("lit");
  } else {
    hole.style.left = "50%";
    hole.style.top = "40%";
    hole.style.width = "0px";
    hole.style.height = "0px";
    hole.classList.remove("lit");
  }

  document.querySelector("#coachTitle").textContent = s.title;
  document.querySelector("#coachText").textContent = s.text;
  document.querySelector("#coachDots").innerHTML =
    TOUR_STEPS.map((_, i) => `<span class="coach-dot${i === tourStep ? " on" : ""}"></span>`).join("");
  document.querySelector("#coachNext").textContent =
    tourStep >= TOUR_STEPS.length - 1 ? "Done 🧋" : "Next";

  // Place the card above or below the spotlight, clamped inside the overlay.
  requestAnimationFrame(() => {
    const th = tip.offsetHeight, tw = tip.offsetWidth;
    let top;
    if (!target) {
      top = (oRect.height - th) / 2;
    } else {
      const r = target.getBoundingClientRect();
      const holeTop = r.top - oRect.top, holeBot = holeTop + r.height;
      top = (holeTop > oRect.height / 2) ? holeTop - th - 20 : holeBot + 20;
      top = Math.max(12, Math.min(top, oRect.height - th - 12));
    }
    tip.style.top = top + "px";
    tip.style.left = Math.max(12, (oRect.width - tw) / 2) + "px";
  });
}

document.querySelector("#coachNext").addEventListener("click", () => {
  if (tourStep >= TOUR_STEPS.length - 1) { endFeatureTour(true); return; }
  tourStep++;
  renderTourStep();
  playSfx("select");
});
document.querySelector("#coachSkip").addEventListener("click", () => endFeatureTour(false));
window.addEventListener("resize", () => { if (tourOn) renderTourStep(); });

// ── Cup Pong: flick a pearl into the cup (GamePigeon-style, projectile arc) ───
function pongDims() {
  const W = els.pongCanvas.offsetWidth, H = els.pongCanvas.offsetHeight;
  return {
    W, H,
    startX: W / 2, startY: H - 38,        // where the pearl waits
    mouthY: H * 0.34,                     // height of the cup rim (shorter throw)
    mouthHalf: 54,                        // half the cup-mouth width (more forgiving makes)
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
  // First throw of the session: park the cup dead-centre & still for one beat so
  // the player learns the mechanic on a gimme (no reward change).
  pong.cupSettle = 0;
  if (pong.throwsLeft === PONG_MAX_PLAYS) { pong.cupX = d.W / 2; pong.cupSettle = 0.9; }
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
  if (!gamesUnlockedForBreak()) { showToast("Break games unlock after a " + GAMES_MIN_SESSION_MIN + " minute focus 🔒"); return; }
  if (gameDoneToday("pong")) return;
  pong.throwsLeft = PONG_MAX_PLAYS;    // fresh session for today
  pong.score = 0;
  // Daily play is marked on the FIRST throw (see pongNextThrow), not on open.
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
  if (pong.throwsLeft === PONG_MAX_PLAYS) { markGamePlayed("pong"); bumpQuest("gamesPlayed", 1); }   // burn the day on first real throw
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
  let cupSpeed = prefersReducedMotion() ? 0 : 44;   // calmer drift (easier to time)
  if (pong.cupSettle > 0) { pong.cupSettle -= dt; cupSpeed = 0; }   // first-throw grace
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
      if (p.x < PONG_R) { p.x = PONG_R; p.vx = Math.abs(p.vx) * 0.45; }
      if (p.x > d.W - PONG_R) { p.x = d.W - PONG_R; p.vx = -Math.abs(p.vx) * 0.45; }
      // at the moment it falls through the rim height, decide make / rim-bounce
      if (p.vy > 0 && prevY <= d.mouthY && p.y >= d.mouthY) {
        const f = (d.mouthY - prevY) / (p.y - prevY || 1);
        const crossX = prevX + (p.x - prevX) * f;
        const dx = Math.abs(crossX - pong.cupX);
        if (dx < d.mouthHalf - PONG_R) {
          result = "make";
        } else if (dx < d.mouthHalf + PONG_R * 0.6 && !p.bounced) {
          // clipped the rim — bounce off it. Narrow band so a clean make is never
          // stolen by a rim hit (make wins ties).
          p.bounced = true;
          p.y = d.mouthY - PONG_R;
          p.vy = -Math.abs(p.vy) * 0.5;
          p.vx += (crossX < pong.cupX ? -1 : 1) * 150;
          playSfx("rimRattle");
        }
      }
      if (!result && (p.y > d.H + 40 || p.x < -40 || p.x > d.W + 40)) result = "miss";
    }
    if (result === "make") {
      pong.splash = { x: pong.cupX, y: d.mouthY, r: 0 };   // ring effect at the cup
      p.x = pong.cupX; p.y = d.mouthY + 24; p.vx = 0; p.vy = 0;   // pearl sinks in
      pong.score++;
      state.bonusPearls += PONG_REWARD;
      state.gamePearls += PONG_REWARD;
      saveState();
      updatePongHUD();
      playSfx("swish");
      haptic(18);
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

  // ── cup body (rounded, glossy boba cup with an OPEN top for tossing) ──
  const cupBodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(cx - topHalf, topY);
    ctx.lineTo(cx - botHalf, botY - 9);
    ctx.quadraticCurveTo(cx - botHalf, botY, cx - botHalf + 9, botY);   // rounded base
    ctx.lineTo(cx + botHalf - 9, botY);
    ctx.quadraticCurveTo(cx + botHalf, botY, cx + botHalf, botY - 9);
    ctx.lineTo(cx + topHalf, topY);
    ctx.closePath();
  };
  const bodyGrad = ctx.createLinearGradient(cx - topHalf, 0, cx + topHalf, 0);
  bodyGrad.addColorStop(0,   "rgba(255,255,255,0.92)");
  bodyGrad.addColorStop(0.5, "rgba(255,255,255,0.60)");
  bodyGrad.addColorStop(1,   "rgba(255,255,255,0.82)");
  cupBodyPath(); ctx.fillStyle = bodyGrad; ctx.fill();

  // drink fill (current tea-base colour) in the lower part, clipped to the body
  const fillTop = topY + d.cupH * 0.40;
  ctx.save(); cupBodyPath(); ctx.clip();
  ctx.fillStyle = BASES[state.base].color; ctx.globalAlpha = 0.95;
  ctx.fillRect(cx - topHalf, fillTop, topHalf * 2, d.cupH);
  ctx.globalAlpha = 0.28; ctx.fillStyle = "#fff";          // drink surface sheen
  ctx.fillRect(cx - topHalf, fillTop, topHalf * 2, 3);
  ctx.globalAlpha = 1; ctx.fillStyle = "#2a1d22";          // boba pearls clustered at the base
  const pearls = [[-16,0],[-6,2],[5,0],[15,2],[-11,-8],[1,-7],[11,-8]];
  for (const [ox, oy] of pearls) { ctx.beginPath(); ctx.arc(cx + ox, botY - 9 + oy, 4.4, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  for (const [ox, oy] of pearls) { ctx.beginPath(); ctx.arc(cx + ox - 1.3, botY - 10.3 + oy, 1.2, 0, Math.PI * 2); ctx.fill(); }
  // glossy vertical highlight
  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(cx - topHalf * 0.6, topY + 12); ctx.lineTo(cx - botHalf * 0.55, botY - 14); ctx.stroke();
  ctx.restore();

  // body outline
  cupBodyPath();
  ctx.strokeStyle = "rgba(45,36,40,0.9)"; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.stroke();

  // ── open mouth: inner-shadow ellipse (you can see "into" it) + rim lip + gloss ──
  ctx.fillStyle = "rgba(45,36,40,0.16)";
  ctx.beginPath(); ctx.ellipse(cx, topY, topHalf - 2, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(45,36,40,0.9)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(cx, topY, topHalf, 7, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(cx, topY + 1, topHalf - 5, 5, 0, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();

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
  if (els.pongGame.style.display === "none") return;   // user quit before the final throw resolved
  pong.active = false;
  if (pong.animId) { cancelAnimationFrame(pong.animId); pong.animId = null; }
  const s = pong.score;
  if (s > 0) bumpQuest("pongMakes", s);   // Daily Quest: sink cups in Cup Pong
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
  els.goalMinus.addEventListener("click", () => { playSfx("select"); haptic(4); adjustDailyGoal(-GOAL_STEP); });
  els.goalPlus.addEventListener("click",  () => { playSfx("select"); haptic(4); adjustDailyGoal(GOAL_STEP); });

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

  // Restore purchases (App Review requires an explicit control; native only)
  const restoreRow = document.getElementById("restoreRow");
  const restoreBtn = document.getElementById("restorePurchasesBtn");
  if (restoreRow && IAP.available()) restoreRow.classList.remove("hidden");
  if (restoreBtn) restoreBtn.addEventListener("click", async () => {
    playSfx("tap");
    restoreBtn.disabled = true;
    await IAP.restoreAll(true);
    restoreBtn.disabled = false;
  });

  // Secret handshake: 7 quick taps on the Settings title reveal the dev row.
  (function () {
    const h = document.querySelector("#settingsSheet h2");
    if (!h) return;
    let taps = 0, timer = null;
    h.addEventListener("click", () => {
      taps++;
      clearTimeout(timer);
      timer = setTimeout(() => { taps = 0; }, 1500);
      if (taps >= 7) {
        taps = 0;
        localStorage.setItem("bobaFocusDevUnlock", "1");
        renderDevToggle();
        els.makerSpeech.textContent = "Dev switch unlocked 🛠";
        playSfx("success");
      }
    });
  })();

  // ── Bottom bar sheets ────────────────────────────────────────────────────
  els.shopBtn.addEventListener("click",       () => { playSfx("open"); openSheet("shopSheet"); });
  els.settingsBtn.addEventListener("click",   () => { playSfx("open"); renderNameRow(); openSheet("settingsSheet"); });
  els.mapBtn.addEventListener("click",        () => { playSfx("open"); openMap(); });
  if (els.friendsBtn) els.friendsBtn.addEventListener("click", () => { playSfx("open"); openFriends(); });
  if (els.questsBtn) els.questsBtn.addEventListener("click", () => { playSfx("open"); openQuests(); });

  // ── Study Squad controls ──────────────────────────────────────────────────
  if (els.friendsClose) els.friendsClose.addEventListener("click", closeSheets);
  if (els.questsClose) els.questsClose.addEventListener("click", closeSheets);
  const squadShareBtn = document.querySelector("#squadShareBtn");
  if (squadShareBtn) squadShareBtn.addEventListener("click", shareSquadCode);
  if (els.changeNameBtn) els.changeNameBtn.addEventListener("click", () => { editSquadName(); renderNameRow(); });
  const squadAddBtn = document.querySelector("#squadAddBtn");
  const squadInput = document.querySelector("#squadCodeInput");
  if (squadAddBtn && squadInput) {
    const doAdd = () => { if (addFriendByCode(squadInput.value)) squadInput.value = ""; };
    squadAddBtn.addEventListener("click", doAdd);
    squadInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doAdd(); });
  }
  const deleteAccountBtn = document.querySelector("#deleteAccountBtn");
  if (deleteAccountBtn) deleteAccountBtn.addEventListener("click", () => {
    if (!squadCloudLive() && !(window.SquadCloud && SquadCloud.enabled)) return;
    if (!window.confirm("Delete your cloud account? This removes your profile, friends and stats from the server. Your on-device progress stays on this phone.")) return;
    SquadCloud.deleteAccount().then(() => { showToast("Cloud account deleted."); renderSquad(); });
  });

  // Shortcuts: tap the drink name (now in the timer card) to Customize,
  // tap the pearl chip for the Shop.
  const customizeBtn = document.querySelector("#customizeDrinkBtn");
  if (customizeBtn) customizeBtn.addEventListener("click", () => { playSfx("open"); openSheet("customizeSheet"); });
  const hudPearlEl = document.querySelector(".top-hud .pearl-chip");
  if (hudPearlEl) {
    hudPearlEl.style.cursor = "pointer";
    hudPearlEl.setAttribute("role", "button");
    hudPearlEl.setAttribute("aria-label", "Open shop");
    hudPearlEl.addEventListener("click", () => { playSfx("open"); openSheet("shopSheet"); });
  }
  // Streak chip → the Your Progress section; name chip → the Change Name row.
  // The 60ms delay lets the freshly-opened sheet lay out before scrolling.
  const hudStreakEl = document.querySelector(".top-hud .streak-chip");
  if (hudStreakEl) {
    hudStreakEl.style.cursor = "pointer";
    hudStreakEl.setAttribute("role", "button");
    hudStreakEl.setAttribute("aria-label", "See your progress");
    hudStreakEl.addEventListener("click", () => {
      playSfx("open"); renderNameRow(); openSheet("settingsSheet");
      const target = document.querySelector(".settings-section-title");
      if (target) setTimeout(() => target.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
    });
  }
  const hudNameEl = document.querySelector("#hudName");
  if (hudNameEl) {
    hudNameEl.style.cursor = "pointer";
    hudNameEl.setAttribute("role", "button");
    hudNameEl.setAttribute("aria-label", "Change your name");
    hudNameEl.addEventListener("click", () => {
      playSfx("open"); renderNameRow(); openSheet("settingsSheet");
      const body = document.querySelector("#settingsSheet .sheet-body");
      if (body) setTimeout(() => { body.scrollTop = 0; }, 60);
    });
  }
  els.shopClose.addEventListener("click",     closeSheets);
  els.customizeClose.addEventListener("click",closeSheets);
  els.settingsClose.addEventListener("click", closeSheets);
  els.mapClose.addEventListener("click",      closeSheets);
  els.sheetBackdrop.addEventListener("click", closeSheets);

  // ── Onboarding ────────────────────────────────────────────────────────────
  els.onboardNext.addEventListener("click", onboardAdvance);
  els.onboardBack.addEventListener("click", onboardGoBack);
  els.onboardSkip.addEventListener("click", () => finishOnboarding(true));
  els.replayIntroBtn.addEventListener("click", () => {
    // In dev mode, do a TRUE fresh first-run (blank name + reset economy) for testing.
    // For normal users it just replays the slides (name stays; no free-rename loophole).
    if (state.devMode) { state.displayName = ""; state.renames = 0; state.onboarded = false; saveState(); }
    closeSheets(); showOnboarding();
  });
  const featureTourBtn = document.querySelector("#featureTourBtn");
  if (featureTourBtn) featureTourBtn.addEventListener("click", () => {
    playSfx("tap");
    setTimeout(startFeatureTour, 200);   // let the sheet close first so targets are visible
  });

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
  els.chooseAppsBtn.addEventListener("click", async () => {
    playSfx("tap");
    await FocusBlocker.requestAuthorization();
    await FocusBlocker.pickApps();
    await FocusBlocker.refreshStatus();
    renderBlockPill();
  });

  // Start-focus blocking prompt buttons
  if (els.blockChooseBtn) els.blockChooseBtn.addEventListener("click", () => { playSfx("tap"); blockPromptChoose(); });
  if (els.blockSkipBtn)   els.blockSkipBtn.addEventListener("click",   () => { playSfx("tap"); blockPromptSkip(false); });
  if (els.blockNeverBtn)  els.blockNeverBtn.addEventListener("click",  () => { playSfx("tap"); blockPromptSkip(true); });
  if (els.blockPrompt)    els.blockPrompt.addEventListener("close", onBlockPromptClose);

  // The always-visible shield pill opens the same choose-apps flow
  if (els.blockPill) els.blockPill.addEventListener("click", async () => {
    playSfx("tap");
    await FocusBlocker.requestAuthorization();
    await FocusBlocker.pickApps();
    await FocusBlocker.refreshStatus();
    renderBlockPill();
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

  // ── Tap Mr. Tapioca for a little personality line ────────────────────────
  els.makerWrap.addEventListener("click", showMakerLine);

  // ── Share the finished-drink card ────────────────────────────────────────
  const shareBtn = document.getElementById("shareRewardBtn");
  if (shareBtn) shareBtn.addEventListener("click", () => {
    playSfx("tap");
    if (lastReward) shareDrink(lastReward);
  });

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

  // ── On-screen press-and-hold arrows for Catch ─────────────────────────────
  // (Replaces drag-the-cup, which made it trivial to teleport the cup onto every
  // pearl. Now you hold ‹ / › and the cup glides at a fixed speed — real control.)
  function holdArrow(btn, dir) {
    if (!btn) return;
    const press = (e) => { e.preventDefault(); if (dir === "L") game.keysLeft = true; else game.keysRight = true; };
    const release = () => { game.keysLeft = game.keysLeft && dir !== "L"; game.keysRight = game.keysRight && dir !== "R"; };
    btn.addEventListener("pointerdown", press);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointerleave", release);
    btn.addEventListener("pointercancel", release);
  }
  holdArrow(document.querySelector("#catchLeft"), "L");
  holdArrow(document.querySelector("#catchRight"), "R");

  // ── Keyboard controls (pearl game) ───────────────────────────────────────
  // Only hijack the arrow keys while the Catch game is actually running; otherwise
  // preventDefault would break range-slider (volume) adjustment and a11y nav.
  document.addEventListener("keydown", e => {
    if (!game.active || els.pearlGame.style.display === "none") return;
    if (e.key === "ArrowLeft")  { e.preventDefault(); game.keysLeft = true; }
    if (e.key === "ArrowRight") { e.preventDefault(); game.keysRight = true; }
  });
  document.addEventListener("keyup", e => {
    if (e.key === "ArrowLeft")  game.keysLeft = false;
    if (e.key === "ArrowRight") game.keysRight = false;
  });

  // ── Sheet a11y: Escape to close + Tab focus trap for the custom .sheet modals.
  // (Only acts when a .sheet is open; the native <dialog> reward/premium modals
  // manage their own focus and are unaffected.)
  document.addEventListener("keydown", e => {
    const sheet = document.querySelector(".sheet:not(.hidden)");
    if (!sheet) return;
    if (e.key === "Escape") { e.preventDefault(); closeSheets(); return; }
    if (e.key === "Tab") {
      const f = [...sheet.querySelectorAll('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter(el => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // ── Prime the AudioContext on the FIRST user gesture (iOS autoplay policy) so
  //    the first tap chime / SFX isn't swallowed on a cold start. Self-removes. ──
  const primeEvents = ["pointerdown", "touchstart", "keydown", "click"];
  function primeAudioOnce() {
    try { audio(); } catch (e) { /* ignore */ }
    primeEvents.forEach(ev => document.removeEventListener(ev, primeAudioOnce, true));
  }
  primeEvents.forEach(ev => document.addEventListener(ev, primeAudioOnce, true));

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
        // Backgrounding (pagehide) tore down the audio graph and iOS suspends the
        // AudioContext, so a still-running session returns SILENT. Bring the focus
        // soundscape back (both start fns are idempotent-guarded, and only act if
        // still running + in focus after the catch-up tick).
        if (state.running && state.phase === "focus") { startMusic("focus"); startAmbience(); }
      }
      reconcileStreakFreezes();   // returning after a missed day → auto-protect the streak
      renderStats();
    }
  });
  // ── Cross-tab sync: when ANOTHER tab/PWA window saves, refresh this idle
  // tab's snapshot so its next save can't clobber the other tab's progress
  // (banked drinks, pearls, live elapsed). The actively-running tab keeps
  // authority and ignores the beacon.
  window.addEventListener("storage", (e) => {
    if (e.key !== "bobaFocusSaveStamp" || !e.newValue) return;
    if (String(e.newValue).endsWith(":" + TAB_ID)) return;   // our own write echoed back
    if (state.running || state.phase !== "focus") return;    // we're the live/busy tab
    clearTimeout(stateSyncTimer);
    stateSyncTimer = setTimeout(() => {
      if (state.running || state.phase !== "focus") return;
      loadState({ liveSync: true });
      renderAll();
      updateCup();
    }, 350);
  });

  // Last-chance save + audio cleanup if the tab/app is actually closed
  window.addEventListener("pagehide", () => {
    if (state.phase === "focus") saveState();
    stopMusic(true);
    stopAmbience(true);
  });
}

loadState();
saveState();   // self-heal: rewrite any value readJSON had to repair from corrupt data
wireEvents();

// Live Study Squad backend (only if config.js has Supabase keys; otherwise no-op).
if (window.SquadCloud && SquadCloud.enabled) {
  const delRow = document.querySelector("#deleteAccountRow");
  if (delRow) delRow.classList.remove("hidden");   // account deletion is reachable when cloud is on
  SquadCloud.init();
}

// Reflect persisted prefs in the UI before first paint
document.querySelectorAll(".size-btn").forEach(b => {
  b.classList.toggle("active", b.dataset.mode === state.mode);
});
if (els.timerCard) els.timerCard.classList.toggle("custom-adjust", state.mode === "custom");
renderVolumeControls();
renderDevToggle();
renderAmbiencePicker();

reconcileStreakFreezes();   // spend freezes to bridge any missed days before first paint
renderAll();
setMakerState("idle");
SpriteEngine.load();  // non-blocking: upgrades to frame animation once sheets decode
scheduleFidget();     // start the occasional idle look-around
checkBadges(false);   // baseline already-earned badges silently (no toast spam on load)

// A focus session that was running when the app was killed is reconstructed paused
// with its time credited (see loadState). If it actually finished while away, bank
// it now so the drink + reward aren't lost.
if (pendingResume && state.phase === "focus" && progress() >= 1) {
  completeSession();
}

// First-time visitors get the welcome tour
if (!state.onboarded) showOnboarding();

// Tour interrupted mid-run (iOS killed the app during the 700ms delay or a
// step)? Auto-resume exactly ONCE on a later launch — the tour is the only
// thing that points at app-blocking, so a new user must not silently miss it.
if (state.onboarded && !localStorage.getItem("bobaFocusTourDone") &&
    !localStorage.getItem("bobaFocusTourOffered")) {
  localStorage.setItem("bobaFocusTourOffered", "1");
  setTimeout(startFeatureTour, 900);
}

// Real IAP boot-up (native only; both no-op on web): localized prices for the
// shop, then silently re-grant anything this Apple ID already owns.
if (IAP.available()) {
  IAP.init();
  IAP.restoreAll(false);
}

// Safety: if no session is running, no app shield should be up and no
// lock-screen countdown should be live. Heals the stuck-shield and stale
// Live Activity cases where iOS killed the app mid-session and the block /
// countdown outlived it. No-ops on web and when nothing is active.
if (!state.running) { FocusBlocker.stop(); FocusActivity.stop(); }

// On iPhone, learn whether blocking is already set up so the shield pill shows
// the right state and the start-focus prompt only fires when needed.
if (FocusBlocker.available()) { FocusBlocker.refreshStatus().then(renderBlockPill); }
renderBlockPill();

// If opened from a friend's shared Squad link (…#sq=CODE), add them, then clean
// the URL so a refresh doesn't re-add.
(function () {
  const m = location.hash && location.hash.match(/sq=([A-Za-z0-9+/_=-]+)/);
  if (m) {
    // Ask first — a link click must not silently mutate the Squad (a crafted
    // link could overwrite a friend's stats or burn cloud follow-rate slots).
    if (confirm("Add this friend to your Study Squad?")) addFriendByCode(m[1]);
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { location.hash = ""; }
  }
})();

// ── PWA: register the service worker so the app installs + works offline ──────
// ONLY on the web. Inside the native (Capacitor) app the SW is pure downside: it
// caches app.js and can keep serving a stale copy across rebuilds, silently
// breaking native-plugin wiring. So in the native app we skip it AND tear down
// anything a previous build registered + clear its caches.
if ("serviceWorker" in navigator) {
  const inNativeApp = !!(window.Capacitor &&
    (typeof window.Capacitor.isNativePlatform === "function"
      ? window.Capacitor.isNativePlatform()
      : window.Capacitor.Plugins));
  if (inNativeApp) {
    navigator.serviceWorker.getRegistrations()
      .then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    if (window.caches) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
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
// Inside the native (Capacitor) app the "Add to Home Screen" hint is meaningless —
// the app is already installed — so never show the install banner there.
function isNativeApp() {
  return !!(window.Capacitor &&
    (typeof window.Capacitor.isNativePlatform === "function"
      ? window.Capacitor.isNativePlatform()
      : window.Capacitor.Plugins));
}

function showInstallBanner(kind) {
  if (!els.installBanner) return;
  if (isNativeApp() || isStandalone() || installDismissed() || !state.onboarded) return;   // don't stack on the welcome tour
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
