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
  brownsugar: { label: "Brown Sugar Milk Tea", color: "#8b4513", price: 10 },
  taro:       { label: "Taro Milk Tea",         color: "#b58bdc", price: 10 },
  matcha:     { label: "Matcha Latte",          color: "#76a86a", price: 10 },
  strawberry: { label: "Strawberry Milk Tea",   color: "#f07c93", price: 10 },
  earlgrey:   { label: "Earl Grey Tea",         color: "#b08d63", price: 10 },
  thai:       { label: "Thai Tea",              color: "#e08a3c", price: 10 },
  ube:        { label: "Ube Milk Tea",          color: "#6b3d9a", price: 10 },
  lavender:   { label: "Lavender Tea",          color: "#c4b5e8", price: 10 },
  honeydew:   { label: "Honeydew Milk Tea",     color: "#b6d67e", price: 10 }
};

// Toppings: pearls are free (the signature); others are one-time pearl unlocks.
// color = the Customize sheet's preview-tile swatch (mirrors the shop cards).
const TOPPINGS = {
  pearls:  { label: "Tapioca Pearls", price: 0,  color: "#4a2a20" },
  jelly:   { label: "Lychee Jelly",   price: 10, color: "#f3e2a8" },
  pudding: { label: "Egg Pudding",    price: 10, color: "#f2c96b" },
  foam:    { label: "Cheese Foam",    price: 10, color: "#fff6e8" },
  coconut: { label: "Coconut Jelly",  price: 10, color: "#f4f1ea" }
};

const DEFAULTS = {
  base: "classic", topping: "pearls", sticker: "Focus",
  skin: "", shopTheme: "cozy"
};

// The shop sells character skins + backgrounds only. Tea base & toppings are
// free personalization in the Customize sheet (not purchasable); cup stickers
// were cut. (Earlier those lived here as paid items and became orphaned.)
// Boost tiles have no painted art, so they show a line icon from the same family.
const FREEZE_ICON = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.6v18.8M4.3 7.1l15.4 9.8M19.7 7.1 4.3 16.9"/><path d="M12 6.2 9.9 4.3M12 6.2l2.1-1.9M12 17.8l-2.1 1.9M12 17.8l2.1 1.9"/><path d="m6.6 8.5-2.8.3M6.6 8.5 5.7 5.8M17.4 15.5l2.8-.3M17.4 15.5l.9 2.7"/><path d="m6.6 15.5-2.8-.3M6.6 15.5l-.9 2.7M17.4 8.5l2.8.3M17.4 8.5l.9-2.7"/></svg>';
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
  { id: "boost-freeze",    name: "Brain Freeze",         desc: "Saves your most recent focus streak", category: "Boosts", type: "consumable", consumableKey: "freezes", price: 10, icon: FREEZE_ICON },
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
  gamePlays: {},         // { plinko|pong: {d:"YYYY-MM-DD", left:N} } unused plays bank
  devMode: false,
  running: false,
  elapsed: 0,
  lastTick: null,
  timerId: null,
  collection: [],
  rewards: [],
  // One entry per perk actually handed over a counter: {at, shop, perk}. Perks
  // earned are derived from total focus time, so this ledger is the only thing
  // that has to be remembered, and its length is what stops a double-spend.
  perkRedemptions: [],
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
  dailyGoal: 60,         // minutes; modeDuration() reads this for the Goal Cup, so it
                         // must have a sane default before loadState runs
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
  winVideo:             document.querySelector(".win-video"),
  liquid:               document.querySelector("#liquid"),
  liqSurface:           document.querySelector("#liqSurface"),
  foamBand:             document.querySelector("#foamBand"),
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
  collectionSheet:      document.querySelector("#collectionSheet"),
  collectionClose:      document.querySelector("#collectionClose"),
  collDrinks:           document.querySelector("#collDrinks"),
  collTreats:           document.querySelector("#collTreats"),
  collBadges:           document.querySelector("#collBadges"),
  shelfChip:            document.querySelector("#shelfChip"),
  shelfCount:           document.querySelector("#shelfCount"),
  askDialog:            document.querySelector("#askDialog"),
  askEyebrow:           document.querySelector("#askEyebrow"),
  askTitle:             document.querySelector("#askTitle"),
  askCopy:              document.querySelector("#askCopy"),
  askInput:             document.querySelector("#askInput"),
  askConfirmBtn:        document.querySelector("#askConfirmBtn"),
  askCancelBtn:         document.querySelector("#askCancelBtn"),
  premiumTitle:         document.querySelector("#premiumTitle"),
  premiumCopy:          document.querySelector("#premiumCopy"),
  saveRewardBtn:        document.querySelector("#saveRewardBtn"),
  chooseAppsBtn:        document.querySelector("#chooseAppsBtn"),
  repickAppsBtn:        document.querySelector("#repickAppsBtn"),
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
  redeemDialog:         document.querySelector("#redeemDialog"),
  redeemShop:           document.querySelector("#redeemShop"),
  redeemAddress:        document.querySelector("#redeemAddress"),
  redeemPerk:           document.querySelector("#redeemPerk"),
  redeemCode:           document.querySelector("#redeemCode"),
  redeemStamp:          document.querySelector("#redeemStamp"),
  redeemNote:           document.querySelector("#redeemNote"),
  redeemConfirmBtn:     document.querySelector("#redeemConfirmBtn"),
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
  notifyRow:            document.querySelector("#notifyRow"),
  notifyNote:           document.querySelector("#notifyNote"),
  notifyDoneToggle:     document.querySelector("#notifyDoneToggle"),
  notifyDailyToggle:    document.querySelector("#notifyDailyToggle"),
  notifyTimeLine:       document.querySelector("#notifyTimeLine"),
  notifyTime:           document.querySelector("#notifyTime"),
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

// Per-skin pose sets, keyed by skin value → { idle, mixing, sleeping, shocked }.
// Any missing state falls back to the skin's single portrait above, so a skin
// that isn't listed here behaves exactly as it always has.
//
// This map used to be empty. The first attempt at per-skin poses generated each
// pose on its own and came back off-model (the astronaut's helmet was a
// different helmet), so the art was parked unused in assets/poses/ rather than
// wired up. The current pipeline fixes the cause rather than the symptom:
//
//   1. All four poses come from ONE render, so they cannot disagree about
//      colour, scale or line weight.
//   2. That render is conditioned on the skin's own file as an image reference.
//      The character is never described in words — describing it is what
//      produced the wrong helmet.
//   3. tools/check-poses.py refuses the sheet unless the skin's identifying
//      colours survived and the four cells share a baseline. The old art fails
//      that check today, which is how the thresholds were calibrated.
//
// Motion still comes from the CSS keyframes keyed off data-state, so these are
// four still portraits, not frames. See the design doc under docs/superpowers/.
const SKIN_POSES = {};
["grad-cap", "flower", "scarf", "shades", "strawberry", "astro-blue", "dragon",
 "cat-hoodie", "royal", "ninja", "angel", "devil", "wizard"].forEach((skin) => {
  const idle = "assets/poses/" + skin + "-idle.png";
  SKIN_POSES[skin] = {
    idle:     idle,
    mixing:   "assets/poses/" + skin + "-mixing.png",
    sleeping: "assets/poses/" + skin + "-sleeping.png",
    shocked:  "assets/poses/" + skin + "-shocked.png",
    // walking and drinking reuse the idle DRAWING on purpose. maker-walk and
    // maker-drink already supply their motion, so the picture must not change:
    // any state with no entry here falls back to SKIN_IMAGES, the old
    // separately-drawn portrait, and he visibly flickered into a different
    // drawing for the length of the walk to the cup. The ninja was the tell —
    // his old portrait holds the shuriken out, 488px wide against the pose
    // set's 430px.
    walking:  idle,
    drinking: idle
  };
});

// The no-skin default character, same four poses from the same one render.
// The CSS keyframes keyed off data-state supply all the motion.
// These replace the old portraits, which were drawn separately and so never
// lined up: Mr. Tapioca.png sat at bottom=428, Mixing.png at 437 and
// Sleeping.png at 402, which made him drop 9px and shrink 57px the moment a
// session started. The new set is sliced from one sheet with a shared baseline.
const MAKER_STATIC = {
  idle:     "assets/poses/base-idle.png",
  mixing:   "assets/poses/base-mixing.png",
  sleeping: "assets/poses/base-sleeping.png",
  shocked:  "assets/poses/base-shocked.png",
  // Same reasoning as SKIN_POSES above: reuse the idle drawing rather than let
  // these fall through to assets/Mr. Tapioca.png, which is a different drawing.
  walking:  "assets/poses/base-idle.png",
  drinking: "assets/poses/base-idle.png"
};

let currentMakerState = "";

function setMakerState(stateName) {
  if (stateName === currentMakerState) return;
  currentMakerState = stateName;

  const img = els.focusMakerCharacter;
  img.dataset.state = stateName;
  els.shopScene.classList.toggle("is-napping", stateName === "sleeping");

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
// img, so the two animations compose instead of one replacing the other.
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
    state.perkRedemptions = readJSON("bobaFocusPerkRedemptions", []);
    if (!Array.isArray(state.perkRedemptions)) state.perkRedemptions = [];
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
    state.gamePlays = readJSON("bobaFocusGamePlays", {});
    if (!state.gamePlays || typeof state.gamePlays !== "object") state.gamePlays = {};
    state.customDuration = readJSON("bobaFocusCustomDuration", 30 * 60);
    state.soundOn     = readJSON("bobaFocusSoundOn", true);
    state.devMode     = readJSON("bobaFocusDevMode", false);
    // Resume an in-progress drink across app closes
    state.mode        = localStorage.getItem("bobaFocusMode") || "custom";
    // Guard stale/removed mode keys (same treatment base/topping get above).
    // Also migrates pre-redesign modes (tasting/small/large) to custom.
    if (!MODES[state.mode]) state.mode = "custom";
    // dailyGoal MUST load before the clamp below: modeDuration() reads it for
    // the Goal Cup, and an unset value made it fall back to 30 min, silently
    // truncating every longer Goal Cup to 30 minutes on each launch.
    state.dailyGoal   = readJSON("bobaFocusDailyGoal", 60);
    if (!(typeof state.dailyGoal === "number" && isFinite(state.dailyGoal) && state.dailyGoal >= 1)) state.dailyGoal = 60;
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
    // (dailyGoal is loaded earlier, before the elapsed clamp that depends on it)
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
  localStorage.setItem("bobaFocusPerkRedemptions", JSON.stringify(state.perkRedemptions || []));
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
  localStorage.setItem("bobaFocusGamePlays",    JSON.stringify(state.gamePlays));
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

// Same duration, but as a plain noun phrase that survives mid-sentence.
// minuteLabel reads fine after "at" ("Next perk at 90 focused minutes") and
// badly everywhere else ("Finish a 90 focused minutes drink").
function durationLabel(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} hr${h > 1 ? "s" : ""}`;
  return `${h} hr ${m} min`;
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

// ── Product analytics call sites (analytics.js) ──────────────────────────────
// Two one-line wrappers so every call site below is a single guarded statement
// that cannot throw into the app. analytics.js is feature-flagged OFF in
// config.js, so with the flag down these are function calls that return
// immediately: no queue, no network, no storage write.
//
// The rule for what may be passed: never a name, never an email, never a
// coordinate, and never the identity of a blocked app. A COUNT of selected apps
// is fine; which apps they are is Apple's private data and stays that way.
function trk(name, props) {
  try { if (window.MrTAnalytics) MrTAnalytics.track(name, props); } catch (e) {}
}
function trkOnce(name, props) {
  try { if (window.MrTAnalytics) MrTAnalytics.trackOnce(name, props); } catch (e) {}
}

function currentPearls() {
  // floor: blockPenalty can hold halves now (an unblocked 15-min cup withholds
  // 0.5), so the visible balance must round down rather than show a fraction.
  return Math.floor(Math.floor(totalMinutes() / 15) + state.bonusPearls - state.spent - state.blockPenalty);
}

// The ONE door every non-focus pearl comes through (games, quests, the min-1
// session top-up). Focus pearls are derived from minutes in currentPearls()
// above and never pass through here.
//
// Why it exists: dev mode removes every limit at once. It drops a session to 5
// seconds, makes gameDoneToday() return false so all three games replay without
// end, and skips the 30-minute gate. With the awards still live that combination
// printed ~720 pearls an hour against an honest 4, so seven taps on the Settings
// heading bought all 840 pearls of cosmetics in about seventy minutes, and each
// 5-second "drink" also fired a row into the anonymous drink counter.
// CLAUDE.md's economy rule is "never introduce a way to farm or double-credit
// pearls", and this was one, shipped.
//
// Dev mode still does everything it is FOR: every flow, dialog, game and reward
// screen is reachable in seconds. The wallet just does not move while you do it.
function awardPearls(n) {
  if (!isFinite(n) || n <= 0) return 0;
  if (state.devMode) return 0;
  state.bonusPearls += n;
  return n;
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
  // Maker state is driven by the walk choreography (startPause/reset/break),
  // not here — updateCup runs every tick and would override the walk.
  els.shopScene.dataset.theme = state.shopTheme;
  renderWindowLoop(state.shopTheme);
  els.shopScene.classList.toggle("is-focusing", state.running);
  // Drop the size picker for the WHOLE session, paused included. Keying this off
  // state.running alone made the picker (and with it the shop floor, which now
  // follows the stack down) pop back every time the session was paused and
  // vanish again on resume. "Underway" is the same test the Reset link uses.
  const underway = state.running || state.elapsed > 0;
  if (els.focusControls) els.focusControls.classList.toggle("session-on", underway);
  // The scene lowers its floor to match the shorter stack, so the counter keeps
  // its usual distance above the timer instead of leaving a blank band.
  els.shopScene.classList.toggle("is-brewing", underway);
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

  // Zero data is what EVERY new user sees, and it used to render as seven 4px
  // min-height stubs pinned to the bottom edge under ~90px of void: a card that
  // is ~95% empty and reads as broken rather than as "nothing yet". Say so.
  const weekTotal = days.reduce((t, d) => t + d.mins, 0);
  if (weekTotal === 0) {
    els.weekChart.classList.add("is-empty");
    els.weekChart.innerHTML =
      // Deliberately NOT "No focus yet this week": renderInsights() prints
      // exactly that sentence in the box directly below this card, and the two
      // sat back to back. This one describes the CARD, that one gives the nudge.
      `<div class="week-empty">
         <p class="week-empty-title">Your week will chart here</p>
         <p class="week-empty-copy">Each day you focus becomes a bar.</p>
       </div>`;
    return;
  }
  els.weekChart.classList.remove("is-empty");

  // A goal line gives the bars something to be measured against, so a sparse
  // week reads as a chart rather than as a few floating stubs.
  const goalPct = Math.min(100, Math.round((state.dailyGoal / max) * 100));

  els.weekChart.innerHTML = `<span class="week-goal-line" style="bottom:calc(${goalPct}% * 0.72 + 22px)" aria-hidden="true"></span>` + days.map(d => {
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
/* ── In-world confirm / prompt / alert ─────────────────────────────────────
   window.confirm and friends render as stock OS boxes, and as UIAlertController
   on the Capacitor build, which breaks the world harder than anything else in
   the app. These three return Promises and drive #askDialog instead.

   Every caller must await them, so call sites became async. They fall back to
   the native calls if <dialog>.showModal is missing (very old WebViews), which
   is the same defensive pattern showReward() already uses. */
function askDialogOpen({ eyebrow, title, copy, confirmLabel, cancelLabel, danger, input, inputValue, inputPlaceholder }) {
  const dlg = els.askDialog;
  if (!dlg || typeof dlg.showModal !== "function") return null;   // caller falls back

  els.askEyebrow.textContent = eyebrow || "Just checking";
  els.askTitle.textContent   = title || "Are you sure?";
  els.askCopy.textContent    = copy || "";
  els.askCopy.classList.toggle("hidden", !copy);
  dlg.querySelector(".ask-card").classList.toggle("is-danger", !!danger);

  // Never write textContent on a button that carries an inline SVG icon; these
  // two are plain-text buttons, so a plain label is safe here.
  els.askConfirmBtn.textContent = confirmLabel || "Yes";
  els.askCancelBtn.textContent  = cancelLabel  || "Cancel";

  els.askInput.classList.toggle("hidden", !input);
  if (input) {
    els.askInput.value = inputValue || "";
    els.askInput.placeholder = inputPlaceholder || "";
  }

  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      els.askConfirmBtn.removeEventListener("click", onYes);
      els.askCancelBtn.removeEventListener("click", onNo);
      dlg.removeEventListener("cancel", onCancel);
      dlg.removeEventListener("close", onCancel);
      if (dlg.open) dlg.close();
      resolve(value);
    };
    const onYes    = () => finish(input ? els.askInput.value.trim() : true);
    const onNo     = () => finish(input ? null : false);
    const onCancel = () => finish(input ? null : false);
    els.askConfirmBtn.addEventListener("click", onYes);
    els.askCancelBtn.addEventListener("click", onNo);
    dlg.addEventListener("cancel", onCancel);
    dlg.addEventListener("close", onCancel);
    dlg.showModal();
    if (input) setTimeout(() => els.askInput.focus(), 30);
  });
}

function askConfirm(copy, opts = {}) {
  const p = askDialogOpen({ copy, input: false, ...opts });
  return p === null ? Promise.resolve(window.confirm(copy)) : p;
}

function askPrompt(copy, defaultValue = "", opts = {}) {
  const p = askDialogOpen({ copy, input: true, inputValue: defaultValue, confirmLabel: "Save", ...opts });
  return p === null ? Promise.resolve(window.prompt(copy, defaultValue)) : p;
}

function askAlert(copy, opts = {}) {
  const p = askDialogOpen({ copy, input: false, confirmLabel: "Got it", cancelLabel: "", ...opts });
  if (p === null) { window.alert(copy); return Promise.resolve(); }
  els.askCancelBtn.classList.add("hidden");
  return p.then(() => { els.askCancelBtn.classList.remove("hidden"); });
}

/* ── Your Shelf: the collection layer finally gets a screen ────────────────
   state.collection, state.rewards and state.badges have all been written since
   the app shipped and never rendered anywhere. Badges appeared as a 2-second
   toast and were gone; the reward dialog's own button says "Saved to my Treat
   Jar" for a jar that did not exist; the marketing rail promises "Finished
   drinks fill your shelf" and there was no shelf. */
function renderCollection() {
  const drinks  = state.collection || [];
  const rewards = state.rewards || [];
  const owned   = new Set(state.badges || []);

  // ── Drinks ──────────────────────────────────────────────────────────────
  if (!drinks.length) {
    els.collDrinks.innerHTML = emptyState(
      "No drinks yet",
      "Finish a focus session and the drink lands here, with the day you earned it."
    );
  } else {
    els.collDrinks.innerHTML =
      // minuteLabel() already renders "N focused minutes", so no "of focus" suffix.
      `<p class="coll-count">${drinks.length} drink${drinks.length === 1 ? "" : "s"}` +
      ` · ${minuteLabel(drinks.reduce((t, d) => t + (d.minutes || 0), 0))}</p>` +
      `<div class="coll-grid">` +
      drinks.map(d => `
        <div class="coll-drink">
          <div class="coll-cup" style="--drink-color:${d.color || "#d9a86c"}">
            <span class="coll-cup-liquid"></span>
            <span class="coll-cup-lid"></span>
          </div>
          <p class="coll-drink-name">${escapeHTML(d.name || "Boba")}</p>
          <p class="coll-drink-meta">${escapeHTML(d.size || "")}</p>
          <p class="coll-drink-date">${prettyDate(d.dateKey)}</p>
        </div>`).join("") +
      `</div>`;
  }

  // ── Treats ──────────────────────────────────────────────────────────────
  if (!rewards.length) {
    els.collTreats.innerHTML = emptyState(
      "The jar is empty",
      "Every finished drink earns a treat to redeem in the real world. Go get one."
    );
  } else {
    els.collTreats.innerHTML = rewards.map(r => `
      <div class="coll-treat">
        <div class="coll-treat-main">
          <p class="coll-treat-title">${escapeHTML(r.name || r.size || "Treat")}</p>
          <p class="coll-treat-copy">${escapeHTML(r.copy || "")}</p>
        </div>
        <span class="coll-treat-pearls">${ICON.pearl}${r.pearls || 0}</span>
      </div>`).join("");
  }

  // ── Badges ──────────────────────────────────────────────────────────────
  els.collBadges.innerHTML =
    `<p class="coll-count">${owned.size} of ${BADGES.length} earned</p>` +
    `<div class="coll-badges">` +
    BADGES.map(b => {
      const got = owned.has(b.id);
      return `<div class="coll-badge${got ? " is-earned" : ""}">
        <span class="coll-badge-ico" aria-hidden="true">${got ? b.icon : "?"}</span>
        <p class="coll-badge-name">${escapeHTML(b.name)}</p>
        <p class="coll-badge-desc">${escapeHTML(b.desc)}</p>
      </div>`;
    }).join("") +
    `</div>`;

  if (els.shelfCount) els.shelfCount.textContent = drinks.length;
}

function emptyState(title, copy) {
  return `<div class="coll-empty">
    <img class="coll-empty-art" src="assets/poses/base-sleeping.png" alt="" aria-hidden="true">
    <p class="coll-empty-title">${escapeHTML(title)}</p>
    <p class="coll-empty-copy">${escapeHTML(copy)}</p>
  </div>`;
}

/* dateKey is a local YYYY-MM-DD string (see localDateKey). Parse the parts by
   hand: new Date("2026-08-06") is parsed as UTC and shifts a day in negative
   offsets, which would mis-date every drink for anyone west of Greenwich. */
function prettyDate(key) {
  if (!key || typeof key !== "string") return "";
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function escapeHTML(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function showCollectionTab(tab) {
  document.querySelectorAll(".coll-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  els.collDrinks.classList.toggle("hidden", tab !== "drinks");
  els.collTreats.classList.toggle("hidden", tab !== "treats");
  els.collBadges.classList.toggle("hidden", tab !== "badges");
}

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
  if (state.owned.includes(itemId)) return true;
  // Dev mode is a testing convenience, NOT a bypass for paid content. The
  // 7-tap unlock is a well-known iOS convention and therefore guessable, and
  // premium items are real $1.99 purchases. Test those with a StoreKit sandbox
  // account (TestFlight purchases are free) instead of minting them here.
  if (!state.devMode) return false;
  const item = SHOP_ITEMS.find((i) => i.id === itemId);
  if (!(item && item.premium)) return true;
  // On the web there is no store, so dev mode may still preview premium art
  // (that's how skin QC is done). Where real money exists, it may not.
  return !(typeof IAP !== "undefined" && IAP.available());
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

// What the maker should be doing right now, given the phase. Anything that
// re-renders him must ask THIS rather than assume "idle" — during a break he is
// asleep in bed, and forcing idle there put an awake portrait under the duvet
// and started the idle hop, so equipping a skin mid-break woke him up and made
// him bounce under the covers.
function makerRestState() {
  if (state.running && state.phase === "focus") return "mixing";
  if (state.phase === "break" || state.phase === "break-offer") return "sleeping";
  return "idle";
}

// Re-apply the maker image for the current resting/working state. Needed after
// a skin change because updateCup no longer drives maker state every tick.
function refreshMaker() {
  currentMakerState = "";
  setMakerState(makerRestState());
}

// History hygiene: wipe earned progress so test/dev sessions don't skew stats
// forever. Keeps settings (sound, music, dev mode, daily goal, onboarding).
async function clearProgress() {
  playSfx("tap");
  if (state.running || state.elapsed > 0) {
    await askAlert("Finish or reset your current drink before clearing progress.", { title: "Not just yet", eyebrow: "Progress" });
    return;
  }
  if (!(await askConfirm("This permanently deletes your drink shelf, treats, pearls, badges and shop purchases. Settings are kept.",
        { title: "Clear all progress?", eyebrow: "Careful", confirmLabel: "Clear everything", danger: true }))) return;
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
  state.gamePlays = {};
  state.renames = 0;          // pearls wiped → reset the name-change economy too
  renderCustomizeOptions();   // reflect the reset in the Customize sheet
  saveState();
  refreshMaker();
  renderAll();
  showToast("Progress cleared. Fresh start!");
  playSfx("select");
}

// silent=true is the just-paid path: keep the shop open and let the "✦ unlocked!"
// receipt stay on screen. Closing the sheet and firing a badge toast on top of a
// $1.99 confirmation left the customer with no readable proof of purchase.
function equipItem(itemId, silent) {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return;
  state[item.type] = item.value;
  if (item.type === "skin") {
    saveState();
    if (!silent) closeSheets();  // step back so the user can see Mr. Tapioca change
    refreshMaker(); // swap his image to the new skin immediately
  } else if (item.type === "shopTheme") {
    saveState();
    if (!silent) closeSheets();  // step back so the user can see the new backdrop
  }
  renderAll();
  playSfx("success");
  haptic(8);
  pulseMaker("pop", 420);   // happy hop on equip
  checkBadges(!silent);   // "Stylish" / "Decorator" (still recorded when silent)
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
      : `<button class="shop-buy-btn" data-buy-consumable="${item.id}" ${canBuy ? "" : "disabled"}>${ICON.pearl}${item.price}</button>`;
    return `
      <article class="shop-card">
        <div class="shop-preview" style="background:#eaf4f3"><div class="shop-boost-preview">${item.icon || FREEZE_ICON}</div></div>
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
    } else if (item.premium && !owned) {
      action = IAP.available()
        ? `<button class="shop-preview-btn" data-iap="${item.id}">✦ ${IAP.prices[item.id] || "$1.99"}</button>`
        : `<button class="shop-preview-btn" data-premium="${item.id}">✦ $1.99</button>`;
    } else if (owned) {
      action = `<button class="shop-equip-btn" data-equip="${item.id}">Equip</button>`;
    } else {
      // The free currency was the only price with no unit on it, while paid items
      // got "✦ $1.99". A bare "40" does not read as pearls.
      action = `<button class="shop-buy-btn" data-buy="${item.id}" ${canBuy ? "" : "disabled"}>${ICON.pearl}${item.price}</button>`;
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
    const preview   = `<div class="shop-theme-preview" style="background:${item.color}${bg ? ` url('${bg}') center 28%/cover no-repeat` : ""}"></div>`;

    let action = "";
    if (equipped) {
      action = isDefault
        ? `<span class="shop-equipped-badge">Default</span>`
        : `<span class="shop-equipped-badge">${item.premium ? "✦ " : ""}Equipped</span>
           <button class="shop-unequip-btn" data-unequip="${item.type}">Remove</button>`;
    } else if (item.premium && !owned) {
      action = IAP.available()
        ? `<button class="shop-preview-btn" data-iap="${item.id}">✦ ${IAP.prices[item.id] || "$1.99"}</button>`
        : `<button class="shop-preview-btn" data-premium="${item.id}">✦ $1.99</button>`;
    } else if (owned) {
      action = `<button class="shop-equip-btn" data-equip="${item.id}">Equip</button>`;
    } else {
      // The free currency was the only price with no unit on it, while paid items
      // got "✦ $1.99". A bare "40" does not read as pearls.
      action = `<button class="shop-buy-btn" data-buy="${item.id}" ${canBuy ? "" : "disabled"}>${ICON.pearl}${item.price}</button>`;
    }

    // A 768x1344 illustration cannot sell itself through a 48px centre crop: a
    // buyer saw a sliver of window and nothing else. Backgrounds get a wide
    // banner instead, cropped to the TOP of the art where the window, lights
    // and shelves actually live (the bottom third is floor that the app covers
    // with its own floor band anyway).
    return `
      <article class="shop-card shop-card-wide">
        <div class="shop-banner">${preview}${item.premium ? '<span class="shop-premium-flag">✦</span>' : ""}</div>
        <div class="shop-wide-row">
          <div><strong>${item.name}</strong><small>${item.desc}</small></div>
          <div class="shop-card-action">${action}</div>
        </div>
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
  // Keeps the HUD shelf count live; the sheet body itself re-renders on open.
  if (els.shelfCount) els.shelfCount.textContent = (state.collection || []).length;
}

let lastPersist = 0;
let lastShieldAssert = 0;
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

  // Re-assert the native shield every 5 minutes. iOS can silently stop
  // honoring a third-party shield mid-session (seen live when the user tapped
  // "Ignore Limit" on their OWN Screen Time limit for the same app). start()
  // re-applies the same saved picks, so this is a cheap no-op when healthy.
  if (now - lastShieldAssert > 300000
      && (FocusBlocker.wasActive() || state.shieldWasUp === true)) {
    lastShieldAssert = now;
    // Await the flag read before start() re-arms the watchdog (which clears it),
    // otherwise the two bridge calls race and the warning can be lost.
    (async () => { await FocusBlocker.checkDefeated(); FocusBlocker.start(); })();
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
  // opts.fresh=true opens Apple's picker EMPTY instead of pre-checked with the
  // saved selection. Recovery path: iOS app-tokens die silently when a blocked
  // app is reinstalled (or after some iOS updates), and re-confirming the old
  // selection re-saves the same dead tokens.
  async pickApps(opts) {
    const p = this.plugin();
    if (!p) { showToast("App blocking runs in the installed iPhone app 🧋"); return; }
    try { await p.pickApps(opts && opts.fresh ? { fresh: true } : {}); } catch (e) {}
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
    this._want = false; this._active = false; this._defeatedWarned = false;
    if (state.shieldWasUp) { state.shieldWasUp = false; saveState(); }
    const p = this.plugin(); if (!p) return; try { await p.stopBlocking(); } catch (e) {}
  },
  wasActive() { return this._active; },   // was a real shield up during this focus session?

  // Honest-failure detection: the native watchdog flags "defeated" when a
  // supposedly-blocked app accrues a minute of real usage mid-session (iOS
  // lets an app through for the rest of the day after the user taps Ignore
  // Limit on their own Screen Time limit for it; device-level, can't be
  // vetoed). Warn once per session instead of silently pretending.
  _defeatedWarned: false,
  async checkDefeated() {
    const p = this.plugin(); if (!p) return false;
    try {
      const r = await p.status();
      const defeated = !!(r && r.defeated);
      if (defeated && !this._defeatedWarned && state.running) {
        this._defeatedWarned = true;
        showToast("Heads up: iOS is letting a blocked app through today (Ignore Limit). Blocking comes back after midnight.");
      }
      return defeated;
    } catch (e) { return false; }
  },

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
// The App Store "write a review" composer for our listing (the short /app/id
// form localizes to the visitor's own country store).
const APP_STORE_REVIEW_URL = "https://apps.apple.com/app/id6786023560?action=write-review";

const IAP = {
  PREFIX: "com.melchior.mrtapioca.",
  prices: {},          // itemId -> localized display price ("$1.99", "€1,99"…)
  plugin() {
    const cap = window.Capacitor;
    return (cap && cap.Plugins && cap.Plugins.IAP) || null;
  },
  available() { return !!this.plugin(); },
  // Open the write-review page: via the App Store app on iPhone (native
  // method, build 7+), or a new tab on the web demo / older builds.
  openReviewPage() {
    const p = this.plugin();
    if (p && typeof p.openReviewPage === "function") {
      p.openReviewPage({ url: APP_STORE_REVIEW_URL }).catch(() => {});
    } else {
      window.open(APP_STORE_REVIEW_URL, "_blank", "noopener");
    }
  },
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
      // equipItem() saves + re-renders, and matches the pearl path (buyItem):
      // what you just paid for should be on your character immediately. silent
      // keeps the shop open so the purchase receipt below is actually readable.
      if (this.grant(itemId)) { equipItem(itemId, true); }
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
      // A missing/absent list means the call didn't really answer (offline, a
      // signed-out Apple ID). Treat that as "no information" and change nothing
      // — reconciling against it would strip items the customer actually owns.
      const list = r && Array.isArray(r.owned) ? r.owned : null;
      if (!list) {
        if (interactive) showToast("Couldn't reach the App Store — try again.");
        return 0;
      }
      const entitled = new Set(list.map((pid) => this.itemId(pid)).filter(Boolean));
      let granted = 0;
      for (const item of entitled) if (this.grant(item)) granted++;
      // Drop premium items Apple no longer entitles (refunded, revoked, or a
      // different Apple ID). Pearl-bought items are never touched.
      const premiumIds = new Set(this.premiumItems().map((i) => i.id));
      const before = state.owned.length;
      state.owned = state.owned.filter((id) => !premiumIds.has(id) || entitled.has(id));
      const revoked = before - state.owned.length;
      // Un-equip anything that just stopped being ours.
      if (revoked) {
        for (const key of ["skin", "shopTheme"]) {
          const cur = SHOP_ITEMS.find((i) => i.type === key && i.value === state[key]);
          if (cur && cur.premium && !state.owned.includes(cur.id)) state[key] = "";
        }
      }
      if (granted || revoked) { saveState(); renderAll(); }
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
  saveState();                // persist running state + push the Squad profile update
  // Open the SERVER-side reward session (reward-v2.js). No-op with the flag down,
  // which is its state today, and it never throws into the timer: a focus session
  // must start whether or not a network call does. Deliberately fired AFTER the
  // timer is already running, because the merchant reward is the optional half
  // and the drink is the part the user pressed the button for.
  if (window.RewardV2 && RewardV2.enabled) {
    Promise.resolve(RewardV2.startSession(Math.round(modeDuration() / 60)))
      .catch(() => {});
  }
  const plannedMin = Math.round(modeDuration() / 60);
  // Schedule "your drink is ready" for when this session will actually end.
  // Nothing can RUN at the end of a backgrounded timer, so it is scheduled now
  // and cancelled on pause, reset, or an in-app finish. No-op unless the user
  // turned it on and granted permission.
  if (window.MrTNotify) {
    const endsAt = Date.now() + (modeDuration() - state.elapsed) * 1000;
    Promise.resolve(MrTNotify.scheduleSessionDone(endsAt, currentDrinkName())).catch(() => {});
  }
  trkOnce("first_focus_started", { planned_minutes: plannedMin });
  trk("session_started", {
    planned_minutes: plannedMin,
    mode: state.mode,
    native_blocking_enabled: !!(FocusBlocker.available() && FocusBlocker.wasActive())
  });
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
  // The session is no longer going to end when it said it would, so the pending
  // "your drink is ready" would be a lie. beginFocus reschedules on resume.
  if (window.MrTNotify) Promise.resolve(MrTNotify.cancelSessionDone()).catch(() => {});
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
// ── Animated window loops ────────────────────────────────────────────────────
// Themes whose window has a real generated video behind the glass. Anything not
// listed here keeps the CSS layers, which is why .win-fx has a fallback at all.
// Winter and library are deliberately NOT here: both went through repeated Kling
// generations that kept drifting into photographic bokeh instead of the flat
// kawaii style, so their window motion is CSS-only (reusing the same fx-snow /
// fx-dust assets .theme-fx already ships for them) — see styles.css. Sunset's
// video passed verification clean and gets the real loop, same as galaxy.
const WINDOW_LOOPS = { galaxy: "assets/win-galaxy.mp4", sunset: "assets/win-sunset.mp4" };
let winLoopTheme = null;

function renderWindowLoop(theme) {
  // updateCup() runs every tick, so this MUST no-op on an unchanged theme:
  // re-assigning src restarts the clip, and the window would visibly stutter
  // back to frame one once a second for the whole session.
  if (theme === winLoopTheme) return;
  winLoopTheme = theme;
  const v = els.winVideo;
  const fx = document.querySelector(".win-fx");
  if (!v || !fx) return;

  const src = WINDOW_LOOPS[theme];
  if (!src) {
    v.pause();
    v.removeAttribute("src");
    v.load();                       // actually releases the decoder
    v.classList.add("hidden");
    fx.classList.remove("has-video");
    return;
  }
  v.muted = true;                  // belt and braces: iOS only autoplays muted
  v.src = src;
  // <video preload="none"> only defers the IMPLICIT load a `.src` change queues —
  // it does NOT start fetching on its own, so readyState sits at 0 forever and
  // `canplay` below never fires. `.load()` is a script-requested load, which the
  // browser honours immediately regardless of `preload`. Without this line the
  // window never gets past the CSS spin on its own: confirmed live, setting
  // `.src` alone produced zero network activity for the mp4 even after several
  // seconds, and adding `.load()` right after it made the fetch start at once.
  // This is the actual root cause of "loads with the CSS swirl, only the real
  // galaxy video after tapping a button" — a click's own play() (the gesture
  // fallback below) forces a load too, which is why any tap "fixed" it before.
  v.load();

  // Hand over on the `playing` EVENT, never on the play() promise. Setting src
  // starts a load, and calling play() in the same tick gets aborted by it — the
  // promise then resolves while the clip sits on frame one, so gating on the
  // promise showed a frozen video and hid the CSS spin behind it. `playing` only
  // fires when frames are actually being presented.
  const reveal = () => { v.classList.remove("hidden"); fx.classList.add("has-video"); };
  v.addEventListener("playing", reveal, { once: true });

  const tryPlay = () => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
  if (v.readyState >= 2) tryPlay();
  else v.addEventListener("canplay", tryPlay, { once: true });

  // If autoplay is refused outright, the CSS spin just stays and the video never
  // appears. Retry once on the first real tap so it can still take over.
  const onGesture = () => { if (v.paused) tryPlay(); };
  document.addEventListener("pointerdown", onGesture, { once: true, passive: true });
}

function renderBlockPill() {
  const pill = els.blockPill;
  if (!pill) return;
  // .has-pill drives whether .session-row occupies any height at all. Without
  // it the row still cost its 7px stack gap on every non-iOS device, for a
  // control those devices never show. Toggled here rather than with :has() so
  // the layout does not depend on selector support.
  const controls = document.querySelector(".focus-controls");
  // The re-pick recovery button only means anything where the native plugin
  // exists, so its visibility rides the same check as the pill.
  if (els.repickAppsBtn) els.repickAppsBtn.classList.toggle("hidden", !FocusBlocker.available());
  if (!FocusBlocker.available()) {
    pill.classList.add("hidden");
    if (controls) controls.classList.remove("has-pill");
    return;
  }
  pill.classList.remove("hidden");
  if (controls) controls.classList.add("has-pill");
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
  // Close the server-side reward session (reward-v2.js). No-op with the flag
  // down. Fired here rather than after the reward dialog so the server's clock
  // stops when the SESSION did, not when the user got round to tapping Save.
  // Safe to lose: reward-v2.js queues a completion it could not deliver, and the
  // server caps credit at least(planned, its own elapsed), so a late arrival can
  // never bank more than the session asked for.
  if (window.RewardV2 && RewardV2.enabled) {
    Promise.resolve(RewardV2.completeSession()).catch(() => {});
  }
  // Finished with the app open, so the user is already looking at the reward
  // dialog. Firing the notification too would be talking to someone in the room.
  if (window.MrTNotify) Promise.resolve(MrTNotify.cancelSessionDone()).catch(() => {});
  trkOnce("first_focus_completed", { actual_minutes: Math.round(state.elapsed / 60) });
  trk("session_completed", {
    planned_minutes: Math.round(modeDuration() / 60),
    actual_minutes: Math.round(state.elapsed / 60),
    native_blocking_enabled: wasBlocked && FocusBlocker.available()
  });
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

  // Anonymous counter ping (metrics.js). Fire-and-forget AFTER the drink is
  // banked locally; a lost or failed ping must never cost anyone their drink.
  //
  // Skipped in dev mode. A 5-second dev session rounds to 0 minutes, which
  // metrics.js floors up to 1, so testing the completion flow was posting a
  // fake drink roughly every five seconds. The counter is the honest answer to
  // "how many drinks has this app brewed", and it is quoted to people.
  if (!state.devMode) {
    try { MrTMetrics.drinkFinished(size, minutes); } catch (e) {}
  }

  // Pearls are floor(totalMinutes/15). Scale by whether apps were blocked: full when a
  // shield was up (or on web, where blocking isn't possible), half when a native user
  // chose NOT to block — a nudge to actually use the blocker. Any completed session
  // earns at least 1 pearl (so a short Custom cup never shows a deflating "+0").
  const oldTotal = totalMinutes();
  const fullPearls = Math.floor((oldTotal + minutes) / 15) - Math.floor(oldTotal / 15);
  // Withhold the unblocked share EXACTLY. Rounding it UP per session meant a
  // 15-min cup (fullPearls = 1) paid ceil(0.5) = 1, so back-to-back short cups
  // earned the full blocked rate and the penalty never bit. Fractions accumulate
  // in blockPenalty and currentPearls() floors the running total.
  // fullPearls === 0 keeps the "a finished drink always pays something" rule.
  const share = wasBlocked ? 1 : REWARD_UNBLOCKED_FRACTION;
  const awardedExact = fullPearls > 0 ? fullPearls * share : 1;
  const pearlsEarned = Math.max(1, Math.round(awardedExact));
  // Reconcile against the minutes-derived balance (currentPearls): bank a top-up
  // (the min-1 guarantee) as bonus pearls, or withhold the unblocked shortfall as a
  // persistent penalty that currentPearls() subtracts.
  const pearlDelta = awardedExact - fullPearls;
  if (pearlDelta > 0) awardPearls(pearlDelta);
  else if (pearlDelta < 0) state.blockPenalty += -pearlDelta;

  // Did this drink push today across the daily goal?
  const goalWasUnmet = todayMinutes() < state.dailyGoal;

  // Bigger drinks (more study time) map to bigger real-world partner perks.
  // Under 90 minutes there is no perk yet, and the old copy ("Save this treat
  // for later") sat in a grey dashed box, which is the visual language of an
  // empty drop zone or a locked coupon. That shipped in the single most
  // celebratory moment in the app, on the default 30-minute cup. Say what the
  // next tier actually is instead, so the slot is a goal rather than a hole.
  // This used to name a discount ("20% off at a partner boba shop") that no
  // shop had ever agreed to. What a finished drink is worth in the real world
  // is set by whichever shop the student walks into, so the reward unlocks the
  // perk and the Boba Map says what each partner actually gives.
  // Perks are cumulative, so the question is whether THIS drink pushed the running
  // total across another whole bar. Note the drink is not in state.collection yet
  // (it gets unshifted below), so its minutes have to be added by hand or the card
  // is always one drink behind what the map is about to show.
  const perkBar = perkMinMinutes();
  const totalBefore = totalMinutes();
  const totalAfter  = totalBefore + minutes;
  let partner, partnerNext = false;
  if (perkBar > 0 && Math.floor(totalAfter / perkBar) > Math.floor(totalBefore / perkBar)) {
    partner = "🌟 Partner perk unlocked. Check the Boba Map";
  } else {
    // Show what is LEFT, not the size of the bar. "40 min to go" is a reason to
    // start another cup; "next perk at 4 hrs" reads like a wall.
    const left = perkBar > 0 ? perkBar - (totalAfter % perkBar) : 0;
    partner = `${durationLabel(left)} of focus until your next partner perk`;
    partnerNext = true;
  }

  const reward = {
    id: uuid(),
    title: "You deserve to go get one in-person!",
    copy: `${size} earned from ${minuteLabel(minutes)}.`,
    size,
    name: drink.name,       // for the shareable card
    minutes,                // for the shareable card
    pearls: pearlsEarned,
    partner,
    partnerNext
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
    trk("daily_goal_completed", { minutes: todayMinutes(), goal: state.dailyGoal });
    setTimeout(() => { showToast("🎯 Daily goal reached — nice!"); playSfx("success"); }, delay);
  }
}

// The one first-party install link the app hands out. /get already reads ?src=
// and passes it through as Apple's campaign token (get/index.html), so this is
// real attribution rather than a decorative query string, and it is the only way
// to tell a share that produced an install from one that did not.
//
// It also fixes a plainer problem: every share the app made was UNCLICKABLE.
// navigator.share was called with a title and text and no `url` at all, so the
// prettiest card in the world landed in a chat with no way to get the app.
const INSTALL_LINK = "https://mrtapioca.me/get";
function installLink(src) {
  return INSTALL_LINK + "?src=" + encodeURIComponent(src);
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

// ── Shareable "I earned real boba" card ──────────────────────────────────────
// The moment worth posting. A finished drink is a nice picture; four hours of
// focus that turned into an actual discount at an actual shop is a story, and it
// is the only thing this app does that nothing else does.
//
// WHAT IS DELIBERATELY NOT ON IT:
//   * The redemption CODE. Never. A code on a public post is a reward anybody can
//     spend, and the whole redemption design exists to stop exactly that.
//   * Any location. Not the user's, not a map, not an address. The shop NAME only
//     appears when the card is made from a completed redemption, where the user
//     has just stood in that shop themselves.
//   * Any study history. One number, the focus time that bought this reward.
//     Not a session log, not a streak, not a daily breakdown.
async function buildRewardCard(opts) {
  const W = 1080, H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const c = cv.getContext("2d");
  const bark = "#3d2117", cream = "#fffaf3", muted = "#9a7c68", caramel = "#d99e5c";
  const mint = "#7fc2ae";

  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#fdf1e2"); g.addColorStop(1, "#f2d6b8");
  c.fillStyle = g; c.fillRect(0, 0, W, H);

  c.fillStyle = "rgba(61,33,23,0.05)";
  [[120,180,60],[980,260,90],[940,1120,70],[110,1180,50],[860,700,40]]
    .forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); });

  const pad = 64, cardY = 132, cardW = W - pad * 2, cardH = H - 264;
  c.save();
  c.shadowColor = "rgba(61,33,23,0.18)"; c.shadowBlur = 40; c.shadowOffsetY = 18;
  canvasRoundRect(c, pad, cardY, cardW, cardH, 60);
  c.fillStyle = cream; c.fill();
  c.restore();
  canvasRoundRect(c, pad, cardY, cardW, cardH, 60);
  c.lineWidth = 5; c.strokeStyle = "#ecdecb"; c.stroke();

  c.textAlign = "center";
  c.fillStyle = caramel;
  c.font = "800 34px system-ui, -apple-system, Segoe UI, sans-serif";
  c.fillText(opts.redeemed ? "REWARD REDEEMED" : "REAL BOBA EARNED", W / 2, cardY + 96);

  try {
    const charSrc = (state.skin && SKIN_IMAGES[state.skin]) ? SKIN_IMAGES[state.skin] : "assets/Mr. Tapioca.png";
    const im = await loadImage(charSrc);
    const cs = 420;
    c.drawImage(im, W / 2 - cs / 2, cardY + 128, cs, cs);
  } catch (e) { /* a missing skin must not cost the user their card */ }

  // The headline number: the focus that bought it.
  c.fillStyle = bark;
  c.font = "900 88px system-ui, -apple-system, Segoe UI, sans-serif";
  c.fillText(durationLabel(opts.minutes || 0), W / 2, cardY + 640);
  c.fillStyle = muted;
  c.font = "600 34px system-ui, -apple-system, Segoe UI, sans-serif";
  c.fillText("of focus", W / 2, cardY + 690);

  // The perk, in a coupon-shaped chip so it reads as a thing you can hold.
  const chipW = cardW - 140, chipH = 150, chipX = W / 2 - chipW / 2, chipY = cardY + 740;
  canvasRoundRect(c, chipX, chipY, chipW, chipH, 34);
  c.fillStyle = "rgba(127,194,174,0.16)"; c.fill();
  c.setLineDash([14, 10]); c.lineWidth = 4; c.strokeStyle = mint; c.stroke();
  c.setLineDash([]);

  c.fillStyle = bark;
  if (opts.shopName) {
    c.font = "900 46px system-ui, -apple-system, Segoe UI, sans-serif";
    c.fillText(opts.shopName, W / 2, chipY + 60);
    c.fillStyle = muted;
    c.font = "700 36px system-ui, -apple-system, Segoe UI, sans-serif";
    c.fillText(opts.offerText || "", W / 2, chipY + 110);
  } else {
    // No shop is named when the reward is EARNED rather than spent: a passport
    // reward is not tied to a shop yet, and naming one would be inventing a deal.
    c.font = "900 42px system-ui, -apple-system, Segoe UI, sans-serif";
    c.fillText("A real perk at a partner", W / 2, chipY + 62);
    c.fillStyle = muted;
    c.font = "700 34px system-ui, -apple-system, Segoe UI, sans-serif";
    c.fillText("boba shop", W / 2, chipY + 108);
  }

  c.fillStyle = bark;
  c.font = "900 46px system-ui, -apple-system, Segoe UI, sans-serif";
  c.fillText("Mr. Tapioca 🧋", W / 2, H - 96);
  c.fillStyle = muted;
  c.font = "600 30px system-ui, -apple-system, Segoe UI, sans-serif";
  c.fillText("mrtapioca.me", W / 2, H - 52);

  return await new Promise((res) => cv.toBlob(res, "image/png"));
}

// Share it. Same plumbing as shareDrink: native share sheet where there is one,
// a download plus the link on the clipboard where there is not.
async function shareRewardEarned(opts) {
  try {
    const blob = await buildRewardCard(opts || {});
    if (!blob) throw new Error("no blob");
    const file = new File([blob], "mr-tapioca-reward.png", { type: "image/png" });
    const text = opts && opts.shopName
      ? `Studied ${durationLabel(opts.minutes || 0)} and got ${(opts.offerText || "a perk").toLowerCase()} at ${opts.shopName} 🧋`
      : `${durationLabel((opts && opts.minutes) || 0)} of focus just earned me real boba 🧋`;
    const url = installLink("reward_share");
    trk("reward_card_shared", { redeemed: !!(opts && opts.redeemed) });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Mr. Tapioca", text, url });
    } else {
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u; a.download = "mr-tapioca-reward.png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 5000);
      try { await navigator.clipboard.writeText(url); } catch (e) {}
      showToast("Saved your card. The link is on your clipboard 🧋");
    }
  } catch (e) {
    if (!(e && e.name === "AbortError")) showToast("Couldn't make the card — try again.");
  }
}

async function shareDrink(reward) {
  const btn = document.getElementById("shareRewardBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Making your card…"; }
  try {
    const blob = await buildShareCard(reward);
    if (!blob) throw new Error("no blob");
    const file = new File([blob], "mr-tapioca-focus.png", { type: "image/png" });
    const text = `${shareTimePhrase(reward.minutes)} of focus with Mr. Tapioca 🧋`;
    const url = installLink("focus_share");
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Mr. Tapioca", text, url });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "mr-tapioca-focus.png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      // Desktop has no share sheet, so the link has to travel with the file or it
      // is lost. The card is saved; the toast carries the URL to paste with it.
      try { await navigator.clipboard.writeText(installLink("focus_share")); } catch (e) {}
      showToast("Saved your card. The link is on your clipboard 🧋");
    }
  } catch (e) {
    if (!(e && e.name === "AbortError")) showToast("Couldn't make the card — try again.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Share my drink"; }
  }
}

// ── App Store rating ask ─────────────────────────────────────────────────
// Ask right after a finished drink (the happy moment), iPhone only. Gates keep
// it from ever nagging: a finished drink, a real session, and a long cooldown.
// iOS additionally rate-limits the sheet to ~3 shows a year and may silently
// show nothing, so this is fire-and-forget with no UI of our own.
//
// LOOSENED 2026-08-09. The old gates (3 drinks AND a 25 minute session) were
// tuned to protect a large userbase from nagging, but they were doing real
// damage at this stage: CUSTOM_MIN is 15 minutes, so every user who runs short
// sessions was excluded permanently, and requiring 3 finished drinks meant
// almost nobody ever reached the ask. The reference teardown (current.kev,
// 1000 reviews on 10k downloads) argues the opposite: ask at the first moment
// real value lands, while the user is inside the app looking at what they
// earned. One finished drink IS that moment here. 15 minutes is the shortest
// session the app allows, so this now includes every genuine session and still
// excludes a dev-mode taste. Cooldown is unchanged.
const REVIEW_ASK_MIN_DRINKS = 1;
const REVIEW_ASK_MIN_MINUTES = 15;
const REVIEW_ASK_COOLDOWN_DAYS = 45;

function maybeRequestReview() {
  const p = IAP.plugin();
  if (!p || typeof p.requestReview !== "function") return;   // web, or builds before 7
  const mins = lastReward ? (lastReward.minutes || 0) : 0;
  if (mins < REVIEW_ASK_MIN_MINUTES) return;
  if ((state.collection || []).length < REVIEW_ASK_MIN_DRINKS) return;
  const last = Number(localStorage.getItem("bobaFocusReviewAsk") || 0);
  if (Date.now() - last < REVIEW_ASK_COOLDOWN_DAYS * 24 * 60 * 60 * 1000) return;
  localStorage.setItem("bobaFocusReviewAsk", String(Date.now()));
  p.requestReview().catch(() => {});
}

function showReward(reward) {
  // A session finishing MID-TOUR would open this dialog in the top layer above
  // the coach overlay, leaving the tour spotlighting hidden controls behind it.
  // The reward moment wins; the tour can be replayed from Settings.
  if (tourOn) endFeatureTour(false);
  lastReward = reward;
  els.rewardTitle.textContent  = `${reward.size} complete!`;
  els.rewardCopy.textContent   = reward.copy;
  els.rewardPearls.textContent = `+${reward.pearls} pearl${reward.pearls !== 1 ? "s" : ""}`;
  els.rewardDrink.style.setProperty("--drink-color", BASES[state.base].color);
  els.partnerReward.textContent = reward.partner;
  // Three states, not two: an earned perk reads as a coupon, a not-yet perk
  // reads as a quiet next-goal line, and neither reads as an empty slot.
  const earned = reward.partner.startsWith("🌟");
  els.partnerReward.classList.toggle("has-perk", earned);
  els.partnerReward.classList.toggle("is-next", !earned);

  // One button, two cards. When this drink just crossed a partner threshold the
  // shareable moment is the REWARD, not the drink, so the button offers that
  // instead. No second button: the dialog is the most celebratory screen in the
  // app and it does not need a row of choices on it.
  const shareBtn = document.getElementById("shareRewardBtn");
  if (shareBtn) shareBtn.textContent = earned ? "Share my reward" : "Share my drink";

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
  maybeRequestReview();   // iPhone only: the system rating sheet at the happy moment
}

function startBreakOffer() {
  state.phase = "break-offer";
  els.shopScene.classList.add("is-on-break");
  // The bed appears the moment this class lands, so settle him into it now.
  // Without this he sat bolt upright under the duvet, wide awake and hopping,
  // until Start Break was tapped.
  currentMakerState = ""; setMakerState("sleeping");
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

async function setMode(mode) {
  if (mode === state.mode) return;
  // Guard against wiping a drink that's partway filled
  if (state.elapsed > 0 && progress() < 1) {
    const ok = await askConfirm("Your current drink's progress will be lost.",
      { title: "Switch drinks?", eyebrow: "Heads up", confirmLabel: "Switch" });
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

async function adjustCustomDuration(delta) {
  // Don't silently wipe an in-progress custom drink (mirrors setMode's guard)
  if (state.mode === "custom" && state.elapsed > 0 && progress() < 1) {
    if (!(await askConfirm("Your current drink's progress will be lost.",
        { title: "Change cup size?", eyebrow: "Heads up", confirmLabel: "Change it" }))) return;
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

// Scroll a sheet's OWN body to one of its sections.
//
// Never use scrollIntoView() for this. It walks up and scrolls EVERY scroll
// container between the target and the document, and .scene-wrap is one of them:
// it is overflow:hidden, but the sheets sit inside it translated 110% down while
// closed, which gives it ~690px of scrollable overflow. So a scrollIntoView fired
// during a sheet's 320ms open animation scrolled .scene-wrap itself, dragging the
// entire app off the top of the phone frame. There is no scrollbar there and
// nothing resets it, so the app stayed broken until a reload. That was the
// streak-chip bug: tapping the flame emptied the screen.
//
// Setting .sheet-body's scrollTop directly touches exactly one scroller.
// Jump, don't glide: a smooth scroll started while the sheet is still sliding
// up gets interrupted and lands short (it stopped 748px early in testing). The
// sheet is off-screen at this point anyway, so setting the position outright
// means it slides in already showing the right section, with nothing to watch.
function scrollSheetTo(sheetSel, targetSel) {
  const body = document.querySelector(sheetSel + " .sheet-body");
  const target = body && body.querySelector(targetSel);
  if (!body || !target) return;
  // Both rects carry the sheet's in-flight open transform, so the delta between
  // them is correct even mid-animation. Only the transform is animated, so the
  // body's height and scrollHeight are already final.
  const top = body.scrollTop + (target.getBoundingClientRect().top - body.getBoundingClientRect().top);
  body.scrollTop = Math.max(0, top - 8);
}

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
// BASES/TOPPINGS source of truth, rendered as literal shop cards (same
// classes = same fonts/colors): color-swatch preview tile, name, and a
// Default badge / Equipped badge / dark price pill on the right.
function customizeCard(attr, key, label, color, locked, price, isDefault, isActive) {
  const tag = isDefault ? `<span class="shop-equipped-badge">Default</span>`
    : isActive ? `<span class="shop-equipped-badge">Equipped</span>`
    : locked ? `<span class="shop-buy-btn as-price">${ICON.pearl}${price}</span>` : "";
  return `<button class="shop-card option-row${isActive ? " active" : ""}${locked ? " locked" : ""}" ${attr}="${key}" aria-label="${label}${locked ? `, ${price} pearls to unlock` : ""}">
    <!-- Was a flat colour square, so every tea base and topping was sold as a
         swatch: Classic Milk Tea was an orange square, Taro a purple one. This
         is the app's core personalisation surface and each option costs pearls,
         so people were buying a colour chip. Reuses the same tinted mini cup the
         shelf uses, which is what the option actually produces. -->
    <div class="shop-preview"><div class="coll-cup" style="--drink-color:${color}"><span class="coll-cup-liquid"></span><span class="coll-cup-lid"></span></div></div>
    <div><strong>${label}</strong></div>
    <div class="shop-card-action">${tag}</div>
  </button>`;
}
function renderCustomizeOptions() {
  if (els.baseGrid) {
    els.baseGrid.innerHTML = Object.entries(BASES).map(([key, b]) =>
      customizeCard("data-base", key, b.label, b.color, !isBaseUnlocked(key), b.price, key === "classic", state.base === key)
    ).join("");
  }
  if (els.toppingRow) {
    els.toppingRow.innerHTML = Object.entries(TOPPINGS).map(([key, t]) =>
      customizeCard("data-topping", key, t.label, t.color, !isToppingUnlocked(key), t.price, key === "pearls", state.topping === key)
    ).join("");
  }
}

// Buy a locked customization with pearls. Returns true if it's now usable.
async function tryUnlock(kind, key, label, price) {
  if (currentPearls() < price) {
    playSfx("tap"); haptic(8);
    showToast(`Need ${price - currentPearls()} more pearls for ${label} 🧋`);
    return false;
  }
  if (!(await askConfirm(`This will spend ${price} of your ${currentPearls()} pearls.`,
        { title: `Unlock ${label}?`, eyebrow: "Shop", confirmLabel: `Unlock for ${price}` }))) return false;
  (kind === "base" ? state.unlockedBases : state.unlockedToppings).push(key);
  state.spent += price;
  playSfx("coin"); haptic(10);
  showToast(`Unlocked ${label}! 🎉`);
  return true;
}

async function setBase(base) {
  if (!isBaseUnlocked(base) && !(await tryUnlock("base", base, BASES[base].label, BASES[base].price))) return;
  state.base = base;
  saveState();
  renderCustomizeOptions();   // refresh active + lock states
  renderAll();
  els.makerSpeech.textContent = "Fresh tea base selected.";
}

async function setChoice(type, value) {
  if (type === "topping" && !isToppingUnlocked(value) &&
      !(await tryUnlock("topping", value, TOPPINGS[value].label, TOPPINGS[value].price))) return;
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
  if (gained > 0 || gotBomb) els.gameScore.innerHTML = ICON.pearl + game.score;

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
  els.gameScore.innerHTML = ICON.pearl + "0";
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
    state.gamePearls += awardPearls(delta);
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

  // Catch bins, drawn as little cups rather than flat pastel rectangles: a
  // tapered body, a darker rim, and an outline in the app's own bark colour so
  // they belong to the same illustration as the cabinet behind them.
  const BASE_COLORS = ["#f0bb4f", "#ef8aa0", "#a8e4d0", "#c9bbec", "#a8e4d0", "#ef8aa0", "#f0bb4f"];
  const HIT_COLORS  = ["#ffe048", "#ff6688", "#55e8c0", "#c4b5e8", "#55e8c0", "#ff6688", "#ffe048"];

  for (let i = 0; i < 7; i++) {
    const x = i * slotW;
    const isHit = i === highlightSlot;
    const cx = x + slotW / 2;
    const top = slotY + 5;
    const bot = H - 4;
    const halfTop = slotW / 2 - 3;
    const halfBot = halfTop - 4;                 // taper = cup silhouette

    ctx.beginPath();
    ctx.moveTo(cx - halfTop, top);
    ctx.lineTo(cx + halfTop, top);
    ctx.lineTo(cx + halfBot, bot);
    ctx.quadraticCurveTo(cx, bot + 3, cx - halfBot, bot);
    ctx.closePath();
    ctx.fillStyle = isHit ? HIT_COLORS[i] : BASE_COLORS[i];
    ctx.fill();
    ctx.strokeStyle = "rgba(60,32,24,0.55)";
    ctx.lineWidth = isHit ? 2.4 : 1.6;
    ctx.stroke();

    // rim highlight along the mouth of the cup
    ctx.beginPath();
    ctx.moveTo(cx - halfTop + 2, top + 2.5);
    ctx.lineTo(cx + halfTop - 2, top + 2.5);
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#3c2018";
    ctx.font = "950 11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`+${SLOT_REWARDS[i]}`, cx, (top + bot) / 2 + 1);
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
      // Pegs are tapioca pearls, not flat dots: a radial gradient gives them
      // roundness and a contact shadow sits them on the board.
      ctx.beginPath();
      ctx.ellipse(px, py + pegR - 1, pegR * 0.9, pegR * 0.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(60,32,24,0.16)";
      ctx.fill();
      const pg = ctx.createRadialGradient(px - pegR * 0.35, py - pegR * 0.4, pegR * 0.15, px, py, pegR);
      pg.addColorStop(0, glow > 0 ? "rgba(255,236,190,0.95)" : "rgba(255,255,255,0.7)");
      pg.addColorStop(0.45, glow > 0 ? "#9a7248" : "#5b3d46");
      pg.addColorStop(1, glow > 0 ? "#6b4a28" : "#1f1218");
      ctx.beginPath();
      ctx.arc(px, py, pegR, 0, Math.PI * 2);
      ctx.fillStyle = pg;
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
// Each game grants one batch of plays per calendar day (dev mode bypasses).
// The first real drop/throw consumes the day, but UNUSED plays are banked in
// state.gamePlays, so closing the sheet or an app reload mid-game resumes the
// remainder later the same day instead of forfeiting it. Catch has no discrete
// plays (one timed run) and keeps the plain once-per-day rule.
const GAME_MAX_PLAYS = { plinko: PLINKO_MAX_PLAYS, pong: PONG_MAX_PLAYS };
function gameDoneToday(key) {
  if (state.devMode) return false;
  if (state.gameDays[key] !== localDateKey(new Date())) return false;
  return !GAME_MAX_PLAYS[key] || bankedPlays(key) <= 0;
}
// Plays left today for a banked game. A burned day with no bank record means
// the batch predates banking (or the record was lost): treat it as spent so
// nobody gets a second daily batch out of the migration.
function bankedPlays(key) {
  const max = GAME_MAX_PLAYS[key];
  const rec = state.gamePlays[key];
  const today = localDateKey(new Date());
  if (rec && rec.d === today && Number.isFinite(rec.left)) {
    return Math.max(0, Math.min(max, rec.left));
  }
  return state.gameDays[key] === today ? 0 : max;
}
// Stamp the bank with the day the batch was burned (not "now") so a game left
// open across midnight drains yesterday's record instead of blocking today's.
function bankPlays(key, left) {
  const d = state.gameDays[key] || localDateKey(new Date());
  state.gamePlays[key] = { d, left: Math.max(0, left) };
  saveState();
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
  // The gate is NOT a native-only rule. It used to be (`if
  // (!FocusBlocker.available()) return true;`), and that hole was the single
  // biggest exploit in the economy: on web, one 15-minute cup paid 1 pearl and
  // unlocked up to 33 more from the games the same day. 33x leverage on the
  // shortest legal session, on the build anyone can open in a browser. Measured
  // by tools/economy-sim.mjs, where the game-maximizer profile out-earned a
  // student doing three hours a day.
  //
  // The rule that already existed on iPhone is simply applied everywhere now.
  // Nothing about the games changed: same three games, same caps, same payouts.
  // You just have to have actually studied for half an hour first.
  return (state.lastSessionMinutes || 0) >= GAMES_MIN_SESSION_MIN;
}

function renderBreakGameButtons() {
  updateCatchBtnState();
  updatePlinkoBtnState();
  updatePongBtnState();
  // The "Games unlock after a 30 minute session" line was removed: it cost a
  // whole row on a screen the owner wanted tighter. The lock now lives ON the
  // tile (dimmed art + a lock badge), driven by the buttons' disabled state.
}

// The three launch buttons carry an inline SVG icon in the markup. Writing
// `textContent` here used to wipe it on every render and leave an emoji in its
// place, so the icons only survived until the first repaint. Rebuild icon+label
// together instead. `label` is always app-authored, never user input.
function setGameBtn(btn, iconKey, label) {
  if (!btn) return;
  btn.innerHTML = '<span class="g-emoji">' + ICON[iconKey] + '</span>' +
                  '<span class="g-label">' + label + '</span>';
}
function updateCatchBtnState() {
  const locked = !gamesUnlockedForBreak();
  const done = gameDoneToday("catch");
  els.playGameBtn.disabled = done || locked;
  setGameBtn(els.playGameBtn,
    locked ? "lock" : done ? "check" : "games",
    // Short labels: the tile is ~106px wide, so the full names wrapped to two
    // lines and made every tile 17px taller. The art carries the identity now.
    locked ? "Catch" : done ? "Tomorrow" : "Catch");
}
function updatePlinkoBtnState() {
  const locked = !gamesUnlockedForBreak();
  const done = gameDoneToday("plinko");
  const left = state.devMode ? PLINKO_MAX_PLAYS : bankedPlays("plinko");
  els.playPlinkoBtn.disabled = done || locked;
  setGameBtn(els.playPlinkoBtn,
    locked ? "lock" : done ? "check" : "plinko",
    locked ? "Plinko" : done ? "Tomorrow"
      : left < PLINKO_MAX_PLAYS ? `Plinko · ${left}` : "Plinko");
}
function updatePongBtnState() {
  const locked = !gamesUnlockedForBreak();
  const done = gameDoneToday("pong");
  const left = state.devMode ? PONG_MAX_PLAYS : bankedPlays("pong");
  els.playPongBtn.disabled = done || locked;
  setGameBtn(els.playPongBtn,
    locked ? "lock" : done ? "check" : "cup",
    locked ? "Pong" : done ? "Tomorrow"
      : left < PONG_MAX_PLAYS ? `Pong · ${left}` : "Pong");
}

function openPlinko() {
  if (plinko.dropping) return;
  if (!gamesUnlockedForBreak()) { showToast("Break games unlock after a " + GAMES_MIN_SESSION_MIN + " minute focus 🔒"); return; }
  if (gameDoneToday("plinko")) return;
  // Fresh day = full batch; a same-day reopen resumes the banked remainder.
  plinko.playsLeft = state.devMode ? PLINKO_MAX_PLAYS : bankedPlays("plinko");
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
  state.gamePearls += awardPearls(reward);
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
  if (!state.devMode) {
    // Burn the day on the first real drop of the day; a resumed batch skips
    // this so the quest can't double-count. Dev mode leaves both alone.
    if (state.gameDays.plinko !== localDateKey(new Date())) { markGamePlayed("plinko"); bumpQuest("gamesPlayed", 1); }
  }
  plinko.playsLeft--;
  if (!state.devMode) bankPlays("plinko", plinko.playsLeft);
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

// ── Inline SVG icon set ──────────────────────────────────────────────────────
// Replaces the last emoji doing structural work (onboarding steps, map pins,
// game launch buttons). Vector, so they inherit currentColor, keep one stroke
// weight, and render identically on every OS — none of which emoji can do.
// Deliberately SVG rather than generated PNGs: these are UI chrome, so they
// need to scale and re-colour, and they cost bytes we would otherwise precache.
const ICON = {
  games:  '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="11" rx="4.5"/><path d="M7 11v3M5.5 12.5h3M15.5 12h.01M18 14h.01"/></svg>',
  trophy: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 5.5H4.5A2.5 2.5 0 0 0 7 9M17 5.5h2.5A2.5 2.5 0 0 1 17 9M12 14v3M8.5 20h7l-.7-3h-5.6l-.7 3Z"/></svg>',
  map:    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 4-6 2.5v13L9 17l6 2.5 6-2.5V4l-6 2.5L9 4Z"/><path d="M9 4v13M15 6.5v13"/></svg>',
  shield: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5l7.5 3.2v5.9c0 4.6-3.1 8.3-7.5 10.2-4.4-1.9-7.5-5.6-7.5-10.2V5.7L12 2.5Z"/><path d="M9 12.2l2.1 2.1L15.2 10"/></svg>',
  pin:    '<svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5a6.5 6.5 0 0 0-6.5 6.5c0 4.6 5.6 11.3 6.1 11.9a.6.6 0 0 0 .9 0c.4-.6 6-7.3 6-11.9A6.5 6.5 0 0 0 12 2.5Zm0 9a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"/></svg>',
  boba:   '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M6.5 7h11l-1 12.5a1.6 1.6 0 0 1-1.6 1.5H9.1a1.6 1.6 0 0 1-1.6-1.5L6.5 7Z"/><path d="M5.6 7h12.8M14 3.2 12.6 7" stroke-linecap="round"/><circle cx="10" cy="17" r="1.3" fill="currentColor" stroke="none"/><circle cx="13.6" cy="17.6" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="14.6" r="1.3" fill="currentColor" stroke="none"/></svg>',
  cup:    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 7h12l-1 12.4a1.6 1.6 0 0 1-1.6 1.6H8.6A1.6 1.6 0 0 1 7 19.4L6 7Z"/><path d="M5 7h14" stroke-linecap="round"/></svg>',
  plinko: '<svg class="ico" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="4.5" r="1.6"/><circle cx="7.5" cy="9.5" r="1.6"/><circle cx="16.5" cy="9.5" r="1.6"/><circle cx="5" cy="14.5" r="1.6"/><circle cx="12" cy="14.5" r="1.6"/><circle cx="19" cy="14.5" r="1.6"/><path d="M4 19h16v2H4z"/></svg>',
  lock:   '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10" width="15" height="10.5" rx="3"/><path d="M8.2 10V7.4a3.8 3.8 0 0 1 7.6 0V10"/></svg>',
  check:  '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.6l4.6 4.6L19.5 6.8"/></svg>',
  ticket: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5A2 2 0 0 1 5.5 6.5h13a2 2 0 0 1 2 2v1.3a2.2 2.2 0 0 0 0 4.4v1.3a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-1.3a2.2 2.2 0 0 0 0-4.4V8.5Z"/><path d="M13 7v2.2M13 14.8V17"/></svg>',
  target: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="3.6"/></svg>',
  star:   '<svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="m12 3.2 2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8L12 3.2Z"/></svg>',
  pearl:  '<svg class="ico" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="7.6"/><ellipse cx="9.6" cy="9.2" rx="2.1" ry="1.5" fill="rgba(255,255,255,.5)" transform="rotate(-28 9.6 9.2)"/></svg>',
  flame:  '<svg class="ico ico-flame" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 2.2c.6 3.1-.7 4.6-2 6-1.4 1.5-2.9 3-2.9 5.6a5.4 5.4 0 0 0 10.8 0c0-2.3-1-4-2.1-5.4-.5.9-1.2 1.5-2 1.7.7-2.9-.2-5.6-1.8-7.9Z"/></svg>'
};

function bobaPin(emoji, cls) {
  return L.divIcon({
    className: "",
    html: `<div class="boba-pin ${cls}"><span>${emoji}</span></div>`,
    iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -32]
  });
}

// ── PERKS ARE EARNED CUMULATIVELY ────────────────────────────────────────────
// A perk is NOT attached to one long drink. It is bought with total focus time
// across as many sittings as it takes.
//
// The single-session version was incoherent with the rest of the app: the daily
// goal defaults to an hour, so demanding three unbroken hours asked for a session
// nobody actually runs, and it punished exactly the student the app is built for
// (someone who studies in ordinary chunks). Melchi caught that. Four hours
// cumulative is the bar he set.
//
// The accounting is deliberately the simplest thing that cannot be gamed or
// double-spent: how many whole bars of focus you have banked, minus how many you
// have already handed over a counter.
function perksEarnedTotal() {
  const bar = perkMinMinutes();
  return bar > 0 ? Math.floor(totalMinutes() / bar) : 0;
}

function perksRedeemedTotal() {
  return Array.isArray(state.perkRedemptions) ? state.perkRedemptions.length : 0;
}

function earnedPerkCount() {
  return Math.max(0, perksEarnedTotal() - perksRedeemedTotal());
}

// ── ONE QUESTION, TWO POSSIBLE ANSWERERS ─────────────────────────────────────
// Every reward surface (the map banner, the counter card, the drink-complete
// line) asks these two functions and never the underlying ledger, so the choice
// of authority lives in one place instead of being spread across the UI.
//
// Flag DOWN: the v1 local arithmetic below, byte for byte unchanged.
// Flag UP:   the server, and the local numbers are not consulted at all. That is
//            the whole point. v1's count is derived from localStorage the user
//            can edit, so mixing the two would just reintroduce the hole.
function rewardsInHand() {
  if (window.RewardV2 && RewardV2.enabled && RewardV2.ready) return RewardV2.available().length;
  return earnedPerkCount();
}

// { bar, done, left } in minutes, whoever is answering.
function rewardProgressNow() {
  if (window.RewardV2 && RewardV2.enabled && RewardV2.ready) {
    const p = RewardV2.progress();
    if (p) return { bar: p.bar, done: p.done, left: p.left };
  }
  return perkProgress();
}

// True when the server is the authority right now. The UI needs to know, because
// the two modes show DIFFERENT things at the counter: v1 shows a ticking clock
// that proves nothing, v2 shows a short server-issued code that the shop can
// actually verify.
function rewardServerMode() {
  return !!(window.RewardV2 && RewardV2.enabled && RewardV2.ready);
}

// Focus minutes banked toward the NEXT perk, and what is still owed. Drives the
// progress line on the drink-complete card, which is a far better thing to show
// than a flat "not yet".
function perkProgress() {
  const bar = perkMinMinutes();
  const done = bar > 0 ? totalMinutes() % bar : 0;
  return { bar, done, left: Math.max(0, bar - done) };
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

// Hand-verified boba spots that OpenStreetMap is missing, for the three places
// our people actually are: Ithaca (Cornell), Honolulu/Kaimuki, and Medford/
// Somerville (Tufts). Checked Aug 2026 against the live Overpass results, the
// shops' own sites, 2026 Yelp/Honolulu Magazine listings, and in-person visits.
// OSM's coverage is uneven — thin in Ithaca, strong around Boston, patchy on
// O'ahu — so this guarantees each home market is complete no matter what the
// live query returns, and it doubles as the seed of the partner list.
// Every entry below is a shop the live query does NOT return. Add new cities as
// { name, lat, lng } — merge + dedupe handles overlap if mappers later add them.
// Coordinates are geocoded from street addresses and spot-checked; a shop that
// only resolved to its building sits at the building, which is close enough for
// a 120 m dedupe and for walking there.
const CURATED_SHOPS = [
  // --- ITHACA, NY (Cornell) ---
  { name: "Taichi Bubble Tea",  lat: 42.43013, lng: -76.50853 },   // 740 S Meadow St, Ithaca
  { name: "Taichi Bubble Tea",  lat: 42.43940, lng: -76.49602 },   // 215 E State St Ste 200, Ithaca Commons — Taichi's SECOND Ithaca store, opened 2026. Same name on purpose: it matches OSM so the dedupe can merge it, and the two stores are 1.5 km apart so they never collapse into each other. Flyer up here (Melchi, in person, Aug 10 2026)
  { name: "U Tea",              lat: 42.44153, lng: -76.48486 },   // 205 Dryden Rd, Collegetown
  { name: "Kung Fu Tea",        lat: 42.44150, lng: -76.48597 },   // 143 Dryden Rd, Collegetown
  { name: "Dream Tea & Poké",   lat: 42.44064, lng: -76.49722 },   // 130 E Seneca St, downtown
  { name: "Cha Chic (Ninja Chicken)", lat: 42.44206, lng: -76.48359 },   // 114 Dryden Rd, Collegetown — bottles/straws say CHA CHIC, outdoor signs still show Ninja Chicken (Melchi, in person, Aug 8 2026)
  { name: "Lilo's & E-Life Market", lat: 42.44190, lng: -76.48762 },   // 410 Eddy St, Collegetown — big boba selection (Melchi, in person)
  { name: "Saigon Kitchen",     lat: 42.43944, lng: -76.50753 },   // 526 W State St, West End — Vietnamese, serves boba
  { name: "Sushi Osaka",        lat: 42.43943, lng: -76.49840 },   // 113 E State St, Ithaca Commons — serves boba
  // Panda Tea Lounge (407 Eddy St) removed Aug 2026: permanently closed,
  // storefront is now Sweet N' Salty (same LLC, different concept).

  // --- HONOLULU / KAIMUKI, HI ---
  // OSM already carries ~28 O'ahu boba spots (Cowcow's, Teapresso, Sharetea,
  // Chaya, Taste Tea's neighbours...). These are the ones it does NOT have.
  { name: "Taste Tea",          lat: 21.28688, lng: -157.80766 },  // 3221 Waialae Ave, Kaimuki Shopping Center
  { name: "Boba House",         lat: 21.29718, lng: -157.83565 },  // 1610 S King St, Mo'ili'ili (near UH Manoa)
  { name: "Shaka Shaka Tea Express", lat: 21.29181, lng: -157.82133 },  // 2600 S King St, Puck's Alley
  { name: "Summer Café Hawai'i", lat: 21.28431, lng: -157.81334 }, // 909 Kapahulu Ave #4, Kapahulu
  { name: "Sun Tea Mix",        lat: 21.29912, lng: -157.86132 },  // 400 Keawe St #107, Kaka'ako
  { name: "It's Tea",           lat: 21.29502, lng: -157.85102 },  // 435 Kamake'e St #102, Kaka'ako
  { name: "Momo Tea",           lat: 21.29640, lng: -157.85627 },  // 320 Ward Ave #116, Kaka'ako
  { name: "Wave Tea",           lat: 21.29630, lng: -157.85066 },  // 1067 Kapiolani Blvd, Ala Moana
  { name: "Drincup Cafe",       lat: 21.29485, lng: -157.84715 },  // 1221 Kapiolani Blvd Ste 112A (formerly Cheese Tea)
  { name: "Cloud Nine Cafe",    lat: 21.29485, lng: -157.84715 },  // 1221 Kapiolani Blvd Ste 111 — confirmed current Aug 2026 (their own site + Yelp/Grubhub); the 2919 Kapiolani listing is the older location
  { name: "Thang's French Coffee & Bubble Tea", lat: 21.32180, lng: -157.87583 },  // 1286 Kalani St Ste B108, Kalihi
  { name: "Heeretea Hawai'i",   lat: 21.33162, lng: -157.87622 },  // 1810 N King St, Kalihi

  // --- MEDFORD / SOMERVILLE, MA (Tufts) ---
  // OSM is strong here already (22 shops incl. Davis Sq, Harvard Ave, Malden).
  // These three are the gaps.
  { name: "Cuddle Cup Cafe & Tea", lat: 42.42361, lng: -71.09066 },  // 454 B Salem St, Medford — took over King Boba Tea's space (closed Feb 2026)
  { name: "HoneyHoney Dessert Cafe", lat: 42.42725, lng: -71.06709 },  // 480 Main St Unit 1, Malden — on OSM but untagged for boba, so the live query misses it
  { name: "Wantea",             lat: 42.38944, lng: -71.12026 },   // 1925 Massachusetts Ave #B, North Cambridge (Porter Sq)
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
      // Anchor the name test at the START of both names. An unanchored
      // includes() let a SHORT name vanish inside a longer neighbour:
      // "kung fu tea".includes("u tea") is true, so U Tea (92 m away) was
      // silently deduped against Kung Fu Tea. Both directions, because OSM
      // often carries a suffix ("U Tea Collegetown") and our list often
      // carries a parenthetical ("Cha Chic (Ninja Chicken)").
      const a = s.name.toLowerCase(), b = c.name.toLowerCase();
      const sameName = a.startsWith(b.slice(0, 9)) || b.startsWith(a.slice(0, 9));
      return d < 40 || (sameName && d < 250);
    });
    if (!dup) out.push(c);
  }
  return out;
}

// ── REAL PARTNER SHOPS ───────────────────────────────────────────────────────
// Shops that have actually agreed, in writing, to honour a reward in person.
// The deal is negotiated shop by shop, so `perk` is whatever THAT shop offered
// and nothing here is a shared default: one gives a percentage off, the next
// might give a free topping or a whole drink. Never invent a number. A shop
// goes in only after it says yes, and comes straight back out the day it wants
// to stop (the app promises them exactly that).
//   perk       what the student actually gets, in the words shown at a counter
//   minMinutes focus time in ONE drink that unlocks it
//   since      the day they agreed
const PARTNER_SHOPS = [
  {
    id: "u-tea-collegetown",
    name: "U Tea",
    address: "205 Dryden Rd, Collegetown",
    lat: 42.44153, lng: -76.48486,
    perk: "10% off your drink",
    // Four hours of focus, ADDED UP across as many sittings as it takes. Not a
    // single session: the app's own daily goal is an hour, so a one-sitting bar
    // asked for a session nobody runs. Four hours of real study is still a real
    // afternoon, so nobody installs the app and walks in with a reward.
    minMinutes: 240,
    since: "2026-08-09"      // Kongchi Lui, by email. The first partner shop.
  }
];

// ── THE LIVE PARTNER LIST COMES OVER THE NETWORK ─────────────────────────────
// The array above is only the OFFLINE FLOOR, baked into the bundle so a fresh
// install with no signal still knows about U Tea. The list the app actually
// uses is fetched from partners.json on mrtapioca.me.
//
// Why: signing a shop is data, not code. If partners lived only in the bundle,
// every new shop would need an Xcode archive and an App Review queue, so a shop
// that said yes on Monday would not appear on anyone's iPhone until Thursday.
// It also breaks the promise the pitch makes to every shop, that they come off
// the app the day they ask. Now adding or pulling a shop is one edit to
// partners.json plus a push, live everywhere on the next map open.
//
// It is fetched cross-origin from the native build, and sw.js is told to leave
// this one URL alone on web (the worker is cache-first for everything else,
// with ignoreSearch, so it would otherwise pin the first copy forever).
const PARTNERS_URL = "https://mrtapioca.me/partners.json";
const PARTNERS_CACHE_KEY = "bobaPartners1";

let livePartners = PARTNER_SHOPS.slice();

// A partner list is the one piece of remote data that can cost a real business
// real money, so a malformed entry is DROPPED, never guessed at. The minMinutes
// floor matters most: a zero would hand every user an instantly redeemable perk,
// which is the exact thing the 3 hour bar exists to prevent.
function validPartner(p) {
  return !!p && typeof p.name === "string" && p.name.trim().length > 0
    && typeof p.perk === "string" && p.perk.trim().length > 0
    && typeof p.lat === "number" && isFinite(p.lat) && Math.abs(p.lat) <= 90
    && typeof p.lng === "number" && isFinite(p.lng) && Math.abs(p.lng) <= 180
    && typeof p.minMinutes === "number" && isFinite(p.minMinutes)
    && p.minMinutes >= 15 && p.minMinutes <= 1440;
}

// Never rejects: a partner refresh failing must not take the map down with it.
function loadPartners() {
  // Seed from the last good copy first, so an offline open still stars shops.
  try {
    const c = JSON.parse(localStorage.getItem(PARTNERS_CACHE_KEY));
    if (c && Array.isArray(c.shops)) livePartners = c.shops.filter(validPartner);
  } catch (e) {}

  return fetch(PARTNERS_URL + "?t=" + Date.now(), { cache: "no-store" })
    .then(r => r.ok ? r.json() : Promise.reject(new Error("http " + r.status)))
    .then(data => {
      const shops = Array.isArray(data) ? data : (data && data.shops);
      if (!Array.isArray(shops)) throw new Error("shape");
      const ok = shops.filter(validPartner);
      // An EMPTY list is legitimate (every shop paused, or the last one asked to
      // come off). A non-empty list that yields zero valid entries is corruption,
      // so keep whatever we already had rather than silently unstarring a shop.
      if (shops.length > 0 && ok.length === 0) throw new Error("all invalid");
      livePartners = ok;
      localStorage.setItem(PARTNERS_CACHE_KEY, JSON.stringify({ t: Date.now(), shops: ok }));
    })
    .catch(() => {});   // cached or bundled list stands
}

// The lowest bar any live partner sets. Under this, no shop can honour anything,
// so the reward dialog must not imply a perk is sitting there. Derived, not
// hardcoded: sign a shop that rewards a shorter drink and every screen follows.
function perkMinMinutes() {
  return livePartners.length
    ? Math.min(...livePartners.map(p => p.minMinutes))
    : 180;
}

// Attach partner status to whichever record for that shop actually reached the
// list. U Tea is in CURATED_SHOPS *and* in OSM, so this annotates the existing
// entry instead of adding another — otherwise a partner shows up twice with a
// star on only one of the two pins.
function partnerFor(shop) {
  return livePartners.find(p => {
    const d = haversine(shop.lat, shop.lng, p.lat, p.lng);
    // Proximity ALONE is only trustworthy at point-blank range. Collegetown has
    // distinct shops 92 m apart: a 150 m radius handed U Tea's star to Kung Fu
    // Tea down the block, which is exactly the trap mergeCurated documents.
    // Starring the wrong shop is the worst failure this feature has, because a
    // student walks in and asks a business for a discount it never agreed to.
    if (d <= 40) return true;
    // Past that, the name has to agree too. A geocode can be a building or two
    // out, so the name match gets a wider radius, never an unbounded one: a
    // "U Tea" in another state is a different shop with no deal.
    const a = shop.name.trim().toLowerCase(), b = p.name.trim().toLowerCase();
    const sameName = a.startsWith(b.slice(0, 9)) || b.startsWith(a.slice(0, 9));
    return sameName && d <= 400;
  }) || null;
}

// Stamp partner data onto a shop list, and make sure a partner in range is on
// the map even if neither OSM nor the curated list happens to carry it.
function withPartners(shops, lat, lng, radius) {
  const out = shops.map(s => {
    const p = partnerFor(s);
    return p ? Object.assign({}, s, { partner: p }) : s;
  });
  for (const p of livePartners) {
    if (haversine(lat, lng, p.lat, p.lng) > radius) continue;
    if (out.some(s => s.partner && s.partner.id === p.id)) continue;
    out.push({ name: p.name, lat: p.lat, lng: p.lng, partner: p });
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
  // prefix: "Leaflet" keeps the library credit but drops its default prefix,
  // which ships a blue underlined link and a flag emoji — neither of which
  // belongs in a cozy boba sheet. The OpenStreetMap attribution below is a
  // LICENCE requirement and stays exactly as it is.
  mapObj = L.map("map", { zoomControl: true, attributionControl: true }).setView([lat, lng], 15);
  if (mapObj.attributionControl) mapObj.attributionControl.setPrefix("Leaflet");
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  }).addTo(mapObj);

  meMarker = L.marker([lat, lng], { icon: bobaPin(ICON.pin, "me") })
    .addTo(mapObj)
    .bindPopup(real
      ? `<div class="map-pop-name">You are here</div>`
      : `<div class="map-pop-name">Example area</div><div class="map-pop-meta">Allow location to see real shops near you</div>`);

  // Provisional banner: no shops are loaded yet, so it can only speak to what
  // the student is holding. placeShopMarkers calls this again with the real
  // partners once the query lands.
  renderPerkBanner([]);

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
  // Refresh the partner list alongside the shop query, not before it: the two
  // are independent and the partner file is tiny, so this costs no wall clock.
  // loadPartners never rejects, so a failure here still leaves the catch below
  // meaning exactly what it did (the Overpass query died).
  Promise.all([loadPartners(), fetchRealBobaShops(lat, lng)])
    .then(([, shops]) => {
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
      // Nearest first, same as the live path. Without this the fallback list
      // came out in CURATED_SHOPS array order, so a Kalihi shop could sit above
      // one two blocks away. Overpass mirrors time out often enough that this
      // is a path users really see.
      fallback.sort((a, b) => haversine(lat, lng, a.lat, a.lng) - haversine(lat, lng, b.lat, b.lng));
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
  // Partner status is stamped here, not at either call site, so the live path
  // and the Overpass-is-down fallback can never disagree about who is starred.
  const all = withPartners(shops, lat, lng, 6000)
    .map(shop => ({ shop, dist: haversine(lat, lng, shop.lat, shop.lng) }));

  // Partners float to the top of the list. They are the only shops where the
  // app can promise anything, so burying one behind four closer non-partners
  // hides the whole point of the map. Distance still orders within each group,
  // and the 60-shop cap is applied after, so a partner is never cut.
  all.sort((a, b) => (b.shop.partner ? 1 : 0) - (a.shop.partner ? 1 : 0) || a.dist - b.dist);

  const items = all.slice(0, 60).map(({ shop, dist }) => {
    const p = shop.partner;
    const marker = L.marker([shop.lat, shop.lng], { icon: bobaPin(p ? ICON.star : ICON.boba, p ? "partner" : "") })
      .addTo(mapObj)
      .bindPopup(
        `<div class="map-pop-name">${escapeHtml(shop.name)}</div>` +
        `<div class="map-pop-meta">${formatDistance(dist)} away · ${p ? "partner shop" : "real boba shop"}</div>` +
        (p ? `<div class="map-pop-perk">${escapeHtml(p.perk)}</div>` : "")
      );
    shopMarkers.push(marker);
    return { shop, dist, marker };
  });
  renderPerkBanner(items.filter(it => it.shop.partner).map(it => it.shop.partner));
  renderShopList(items);
}

// The banner is the honest status line for the whole partner feature: how many
// perks are in hand, and whether anywhere nearby can actually honour one.
function renderPerkBanner(nearbyPartners) {
  const el = els.mapPerkBanner;
  if (!el) return;
  const earned = rewardsInHand();
  const near = (nearbyPartners || []).length;
  let msg = "";
  if (earned > 0 && near > 0) {
    msg = near === 1
      ? `🌟 ${earned} reward${earned !== 1 ? "s" : ""} ready. ${nearbyPartners[0].name} gives ${nearbyPartners[0].perk.toLowerCase()}.`
      : `🌟 ${earned} reward${earned !== 1 ? "s" : ""} ready at ${near} partner shops near you.`;
  } else if (earned > 0) {
    // Earned, but no partner in range. Say so plainly rather than implying a
    // reward is waiting somewhere down the street.
    msg = `🌟 ${earned} reward${earned !== 1 ? "s" : ""} saved. No partner shop near you yet.`;
  } else if (near > 0) {
    // Cumulative, so speak to how far off they actually are rather than quoting
    // the full bar at someone who is most of the way there.
    msg = `${nearbyPartners[0].name} is a partner shop. ${durationLabel(rewardProgressNow().left)} more focus to earn ${nearbyPartners[0].perk.toLowerCase()}.`;
  }
  el.textContent = msg;
  el.classList.toggle("hidden", !msg);
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
    items.map((it, i) => {
      const p = it.shop.partner;
      // A partner row carries a second control, so it is a wrapper with two
      // sibling buttons. Nesting the redeem button inside the row button would
      // be invalid HTML and the inner tap would fire both.
      return `<div class="map-shop-row${p ? " is-partner" : ""}">` +
        `<button type="button" class="map-shop-item" data-i="${i}">` +
          `<span class="map-shop-emoji">${p ? ICON.star : ICON.boba}</span>` +
          `<span class="map-shop-text">` +
            `<span class="map-shop-name">${escapeHtml(it.shop.name)}</span>` +
            `<span class="map-shop-dist">${formatDistance(it.dist)} away</span>` +
            (p ? `<span class="map-shop-perk">${escapeHtml(p.perk)}</span>` : "") +
          `</span>` +
          `<span class="map-shop-go" aria-hidden="true">›</span>` +
        `</button>` +
        (p ? `<button type="button" class="map-shop-redeem" data-p="${i}">Show at the counter</button>` : "") +
      `</div>`;
    }).join("");
  el.querySelectorAll(".map-shop-redeem").forEach((btn) => {
    btn.addEventListener("click", () => {
      const it = items[+btn.dataset.p];
      if (it && it.shop.partner) openRedeem(it.shop.partner);
    });
  });
  el.querySelectorAll(".map-shop-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const it = items[+btn.dataset.i];
      if (!it) return;
      playSfx("tap");
      mapObj.setView([it.shop.lat, it.shop.lng], 17, { animate: true });
      it.marker.openPopup();
      // Sheet-local scroll only. scrollIntoView would also scroll .scene-wrap
      // and shove the whole app out of the phone frame (see scrollSheetTo).
      const mapEl = document.querySelector("#map");
      const mapBody = document.querySelector("#mapSheet .sheet-body");
      if (mapEl && mapBody && mapEl.getBoundingClientRect().top < mapBody.getBoundingClientRect().top) {
        scrollSheetTo("#mapSheet", "#map");
      }
    });
  });
}

// ── REDEEMING A PERK AT THE COUNTER ──────────────────────────────────────────
// What a barista actually sees. It has to be readable across a counter in one
// second, and it has to be hard to fake with a screenshot, which is what the
// ticking timestamp is for (a still image freezes, this does not). There is no
// scanner and no account on the shop's side. That was the promise made to the
// shops: nothing to install, nothing to manage.
let redeemPartner = null;
let redeemClock = null;
let redeemCode = null;      // server-issued handoff code, server mode only

// Plain English for every refusal the server can return. A student reading
// "failed_offer_changed" at a counter learns nothing and cannot act; each of
// these says what actually happened and what to do about it.
function redeemFailCopy(reason) {
  switch (reason) {
    case "failed_already_redeemed": return "This reward has already been used.";
    case "failed_expired":          return "This reward has expired.";
    case "failed_code_expired":     return "That code timed out. Close this and open it again.";
    case "failed_wrong_partner":    return "This reward is for a different shop.";
    case "failed_partner_paused":   return "This shop is not offering the reward right now.";
    case "failed_offer_changed":    return "This shop has changed its offer. Open this again for the new one.";
    case "failed_outside_window":   return "This shop's reward is not available at this time of day.";
    case "failed_capped":           return "This shop has reached its limit for now.";
    case "offline":                 return "Could not reach the server. Try again with a signal.";
    default:                        return "Could not get a code. Try again in a moment.";
  }
}

function openRedeem(partner) {
  redeemPartner = partner;
  playSfx("tap");
  // partner_id only. The shop is not private (it is on a public map), but the
  // student's location is, so no coordinate is ever attached.
  trk("redemption_started", { partner_id: partner.id || null, offer_viewed: true });
  els.redeemShop.textContent   = partner.name;
  els.redeemAddress.textContent = partner.address || "";
  els.redeemPerk.textContent   = partner.perk;

  const have = rewardsInHand();
  const ready = have > 0;
  const prog = rewardProgressNow();
  els.redeemConfirmBtn.disabled = !ready;
  // Not-ready shows how much focus is LEFT, not the whole bar. Someone three and
  // a half hours in should see thirty minutes to go, not "focus for 4 hrs".
  els.redeemNote.textContent = ready
    ? `You have ${have} reward${have !== 1 ? "s" : ""} saved.`
    : `${durationLabel(prog.left)} of focus to go.`;
  els.redeemDialog.classList.toggle("not-ready", !ready);

  // Server mode: ask for a short code the shop can actually verify. Everything
  // that can refuse this reward is checked NOW, on the student's own screen,
  // rather than at the counter with a queue behind them.
  redeemCode = null;
  if (els.redeemCode) {
    els.redeemCode.textContent = "";
    els.redeemCode.classList.add("hidden");
  }
  if (rewardServerMode() && ready) {
    const held = RewardV2.rewardFor(partner.id);
    if (!held) {
      els.redeemNote.textContent = "No reward for this shop yet.";
      els.redeemConfirmBtn.disabled = true;
    } else {
      els.redeemNote.textContent = "Getting your code…";
      els.redeemConfirmBtn.disabled = true;
      Promise.resolve(RewardV2.openRedemption(held.id, partner.id)).then((res) => {
        // The sheet may have been closed, or reopened on a different shop, while
        // the request was in flight. Dropping a stale response matters here:
        // showing shop A's code under shop B's name is how a cashier hands over
        // something their shop never agreed to.
        if (!els.redeemDialog.open || redeemPartner !== partner) return;
        if (res && res.ok) {
          redeemCode = res.code;
          if (els.redeemCode) {
            els.redeemCode.textContent = res.code;
            els.redeemCode.classList.remove("hidden");
          }
          els.redeemNote.textContent = "Show this code to the cashier.";
          els.redeemConfirmBtn.disabled = false;
        } else {
          els.redeemNote.textContent = redeemFailCopy(res && res.reason);
          els.redeemDialog.classList.add("not-ready");
        }
      }).catch(() => {
        if (!els.redeemDialog.open || redeemPartner !== partner) return;
        els.redeemNote.textContent = redeemFailCopy("offline");
        els.redeemDialog.classList.add("not-ready");
      });
    }
  }

  // Tick every second while the card is open. Cleared on close so a backgrounded
  // sheet is not holding a timer forever.
  const tick = () => {
    els.redeemStamp.textContent = new Date().toLocaleString(undefined, {
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", second: "2-digit"
    });
  };
  tick();
  clearInterval(redeemClock);
  redeemClock = setInterval(tick, 1000);

  if (typeof els.redeemDialog.showModal === "function") els.redeemDialog.showModal();
  else showToast(`${partner.name}: ${partner.perk}`);
}

function closeRedeem() {
  clearInterval(redeemClock);
  redeemClock = null;
  redeemCode = null;
}

function confirmRedeem() {
  if (!redeemPartner) return;

  // Server mode: the ONE atomic spend. Normally the cashier does this from the
  // verification page on their own device, which is what makes it a merchant
  // action rather than a student self-declaration. This is the fallback for a
  // shop that would rather the student tap it, and it hits the identical RPC.
  if (rewardServerMode()) {
    if (!redeemCode) return;
    const btn = els.redeemConfirmBtn;
    if (btn) btn.disabled = true;
    const code = redeemCode;
    redeemCode = null;                 // a double tap cannot fire a second spend
    Promise.resolve(RewardV2.redeemByCode(code)).then((res) => {
      if (res && res.ok) {
        trk("redemption_completed", { partner_id: redeemPartner.id || null });
        playSfx("success");
        showToast(`Used at ${res.partner_name || redeemPartner.name}. Enjoy 🧋`);
        try { els.redeemDialog.close(); } catch (e) {}
        renderAll();
        // Offer the card for the moment that just happened. Naming the shop is
        // safe here and only here: the user has just stood in it. The code is
        // never on the card.
        askConfirm(
          "Post the reward you just picked up. The card carries no code and no location.",
          { eyebrow: "Nice one", title: "Share it?",
            confirmLabel: "Make my card", cancelLabel: "Not now" }
        ).then((yes) => {
          if (yes) shareRewardEarned({
            minutes: rewardProgressNow().bar,
            shopName: res.partner_name || redeemPartner.name,
            offerText: res.offer_text || redeemPartner.perk,
            redeemed: true,
          });
        }).catch(() => {});
      } else {
        trk("redemption_failed", { partner_id: redeemPartner.id || null,
                                   reason: (res && res.reason) || "unknown" });
        els.redeemNote.textContent = redeemFailCopy(res && res.reason);
        els.redeemDialog.classList.add("not-ready");
        if (els.redeemCode) els.redeemCode.classList.add("hidden");
      }
    }).catch(() => {
      els.redeemNote.textContent = redeemFailCopy("offline");
      if (btn) btn.disabled = false;
    });
    return;
  }

  // v1, unchanged: a local ledger entry. Live today.
  if (earnedPerkCount() <= 0) return;
  if (!Array.isArray(state.perkRedemptions)) state.perkRedemptions = [];
  state.perkRedemptions.push({
    at: Date.now(),
    shop: redeemPartner.name,
    perk: redeemPartner.perk
  });
  saveState();
  trk("redemption_completed", { partner_id: redeemPartner.id || null });
  playSfx("success");
  showToast(`Used at ${redeemPartner.name}. Enjoy 🧋`);
  try { els.redeemDialog.close(); } catch (e) {}
  renderAll();
  // The banner counts live perks, and one just stopped being live. Re-render
  // from the pins already on the map rather than re-running the whole query.
  if (mapObj) renderPerkBanner(livePartners.filter(p =>
    lastFix && haversine(lastFix.lat, lastFix.lng, p.lat, p.lng) <= 6000));
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
  awardPearls(def.reward);
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
  else {
    // People paste the WHOLE share message ("Add me on Mr. Tapioca! …<code>"),
    // and stripping whitespace alone left the prose in, so atob threw. Pull out
    // the longest base64-ish run instead.
    const runs = str.match(/[A-Za-z0-9+/_=-]{16,}/g);
    if (runs) str = runs.sort((a, b) => b.length - a.length)[0];
  }
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
// Pull a server friend code out of a pasted share message. It has to be a WHOLE
// token: an unanchored /[A-Z2-9]{6}/ matched "TAPIOC" inside "Mr. Tapioca" and
// never reached the real code. Scan from the end, where the code actually sits.
function extractServerCode(raw) {
  const toks = String(raw || "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  for (let i = toks.length - 1; i >= 0; i--) {
    if (/^[A-Z2-9]{6}$/.test(toks[i])) return toks[i];
  }
  return null;
}
function addFriendByCode(raw) {
  // A friend whose cloud sync wasn't up yet shares an offline base64 snapshot
  // instead of a 6-char code. Detect that FIRST, or the live branch chops the
  // blob into a bogus code and the add always fails.
  const snap = parseSquadCode(raw);
  // Live backend: a friend code is 6 chars (A-Z/2-9). Route to the server.
  // Note: the server path must win whenever the cloud is live, even for a
  // decodable offline snapshot. renderSquad() only draws SquadCloud.friends in
  // cloud mode, so an on-device friend added here would say "Added!" and then
  // never appear. Tell the truth instead.
  if (squadCloudLive()) {
    const code = extractServerCode(raw);
    if (!code) {
      showToast(snap ? "That's an offline code. Ask them for their 6-character code."
                     : "Enter your friend's 6-character code.");
      return false;
    }
    SquadCloud.follow(code).then((ok) => { playSfx(ok ? "success" : "tap"); showToast(ok ? "Added to your squad! 🧋" : "No one found with that code."); });
    return true;
  }
  const f = snap;
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
  if (ms) ms.innerHTML = `${formatFocusTotal(me.mins)} focused &middot; ${me.streak}` + ICON.flame;
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
      `<span class="squad-row-stats">${r.streak}${ICON.flame}</span>` +
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
  // The code AND a way to get the app. A friend code is useless to someone who
  // does not have the app yet, which is most people you would send one to.
  const text = `Add me on Mr. Tapioca! My Study Squad code is ${code}. ` +
    `Get the app, then open Squad and tap Add.`;
  const url = installLink("squad_invite");
  if (navigator.share) {
    navigator.share({ title: "Mr. Tapioca Study Squad", text, url }).catch(() => {});
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(() => showToast("Code copied, send it to a friend!"), () => showToast("Couldn't copy. Long-press to select."));
  } else {
    showToast("Sharing isn't available here.");
  }
}
const RENAME_PEARL_COST = 20;
async function editSquadName() {
  const current = (state.displayName || "").trim();

  // No name yet (e.g. skipped onboarding) → the first set is FREE.
  if (!current) {
    const name = await askPrompt("This is how you show up to your Study Squad.",
      "", { title: "Pick your shop name", eyebrow: "Study Squad", inputPlaceholder: "Boba HQ" });
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
    if (!(await askConfirm(`This costs ${RENAME_PEARL_COST} pearls. Any change after this one becomes a small in-app purchase.`,
          { title: "Change your name?", eyebrow: "Study Squad", confirmLabel: `Change for ${RENAME_PEARL_COST}` }))) return;
    const name = await askPrompt("Pick something your squad will recognise.",
      current, { title: "Your new name", eyebrow: "Study Squad" });
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
// Show the user's own 6-character server code so they can read it to a friend
// or type it in by hand. Hidden when the cloud isn't up (offline mode shares a
// long base64 snapshot instead, which is not readable).
function renderMyCode() {
  const row = document.getElementById("squadMyCodeRow");
  const val = document.getElementById("squadMyCode");
  if (!row || !val) return;
  const code = (squadCloudLive() && SquadCloud.myCode()) ? SquadCloud.myCode() : "";
  if (!code) { row.classList.add("hidden"); return; }
  row.classList.remove("hidden");
  val.textContent = code;
}

function openFriends() {
  openSheet("friendsSheet");
  renderSquad();
  renderMyCode();
  if (window.SquadCloud && SquadCloud.enabled) {
    SquadCloud.fetchFriends();   // refresh the leaderboard now…
    // …then keep refreshing while the sheet is open, so a friend who finishes a
    // drink while you are looking moves up without you reopening the sheet.
    //
    // This is TOTALS, not presence. There is no live status: mySquadStats() sends
    // no status field and squad-cloud.js therefore always pushes "idle", so
    // nothing anywhere knows who is focusing right now. Cleared in closeSheets.
    clearInterval(squadPollId);
    squadPollId = setInterval(() => {
      if (window.SquadCloud && SquadCloud.ready) SquadCloud.fetchFriends();
    }, 12000);
  }
}

// ── First-run onboarding ──────────────────────────────────────────────────────

// ── ONBOARDING ───────────────────────────────────────────────────────────────
// EVERY SLIDE BELOW IS THE AUTHORS' OWN COPY, WORD FOR WORD. Two people write
// this app, and the voice in these slides is a person's, not a spec's. Do not
// paraphrase, tighten or "improve" a line here. If a slide needs to change, that
// is a conversation, not a refactor.
//
// One slide was ADDED (`native: true`, the Screen Time explainer) because the
// deck had no slide for the single feature that most needs permission and the
// most explaining. It is marked so it is obvious which one is not theirs.
//
// One BODY was corrected rather than rewritten: the map slide used to say "Stay
// tuned to unlock discounts", written before any shop had signed. Two have now,
// so it told a new user the one real thing about this app was still
// hypothetical. Correcting a claim that has gone false is not a style edit. It
// is still open to being reworded in their voice.
//
// LENGTH. The old first run was SIXTEEN screens on web and seventeen on iPhone:
// these slides, then a nine-step feature tour auto-started 700ms later, then the
// blocking prompt. The tour is what was removed, not the writing. It is offered
// once and lives in Settings under Feature Tour.
const ONBOARD_STEPS_ALL = [
  {
    img: "assets/Mr. Tapioca.png",
    title: "Say Hello to Mr. Tapioca!",
    body: "Your favorite study buddy. He brews boba while you focus."
  },
  {
    emoji: ICON.shield,
    native: true,          // ADDED, not theirs. iPhone only: web cannot block anything.
    title: "He guards your phone",
    body: "On iPhone he can shield your distracting apps for the length of a session, so the thing you were going to reach for is not there. You pick which apps, and iOS keeps that list private. Nobody else sees it, including us."
  },
  {
    emoji: ICON.games,
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
    emoji: ICON.trophy,
    title: "Share with Friends!",
    body: "Show off your focus stats with invited users on a group leaderboard."
  },
  {
    emoji: ICON.map,
    // Body corrected, not rewritten. See the note above.
    title: "Real boba, not just points",
    body: "Focus time fills your drink. Where a shop has partnered with us, that same time earns a real perk you pick up in person. Open the Boba Map to see if there is one near you. Everything else works wherever you are."
  },
  {
    name: true,
    img: "assets/Mr. Tapioca.png",
    title: "Now that we're friends ...",
    body: "What should I call you?"
  }
];

// The slides this build actually shows. A `native: true` slide is dropped on web,
// where there is no blocker to explain and the screen would be a promise the
// build cannot keep. Everything that indexes the deck reads THIS, so the dots,
// the "Next"/"Let's go" switch and the finish check all stay in step.
function onboardDeck() {
  // NOT window.FocusBlocker: it is a top-level `const` (see ~line 1929), so it
  // never lands on window and that guard short-circuits to false on every build,
  // including a real iPhone. The rest of the file calls FocusBlocker.available()
  // directly and so does this.
  const nativeBuild = typeof FocusBlocker !== "undefined" &&
    typeof FocusBlocker.available === "function" && FocusBlocker.available();
  return ONBOARD_STEPS_ALL.filter((st) => !st.native || nativeBuild);
}

let onboardStep = 0;

function showOnboarding() {
  onboardStep = 0;
  renderOnboardStep();
  els.onboarding.classList.remove("hidden");
}

function renderOnboardStep() {
  const step = onboardDeck()[onboardStep];
  if (step.emoji) {
    els.onboardEmoji.innerHTML = step.emoji;   // SVG markup, not a glyph
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

  els.onboardDots.innerHTML = onboardDeck()
    .map((_, i) => `<span class="${i === onboardStep ? "on" : ""}"></span>`)
    .join("");

  els.onboardBack.classList.toggle("hidden", onboardStep === 0);
  els.onboardNext.textContent = isName ? "That's me! 🧋"
    : (onboardStep === onboardDeck().length - 1 ? "Let's go! 🧋" : "Next");
}

function onboardAdvance() {
  // If we're leaving the name step, save the chosen name (free — this is the
  // initial set; later changes cost pearls, then real money — see editSquadName).
  const step = onboardDeck()[onboardStep];
  if (step && step.name && els.onboardNameInput) {
    const n = (els.onboardNameInput.value || "").trim().slice(0, 24);
    if (n) {
      state.displayName = n;
      saveState();
      if (window.SquadCloud && SquadCloud.ready) SquadCloud.pushProfile();
    }
  }
  if (onboardStep >= onboardDeck().length - 1) {
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
  trkOnce("onboarding_completed", { skipped: !!skipped });
  localStorage.setItem("bobaFocusOnboarded", "true");
  playSfx("success");
  haptic(10);
  // First-run only: after the story intro, walk through what every button does.
  // Someone who hit "Skip" opted OUT of hand-holding — forcing the 10-step tour
  // on them anyway is the opposite of what Skip promised. (Replayable in Settings.)
  if (skipped === true) { localStorage.setItem("bobaFocusTourDone", "skipped"); return; }
  // The feature tour is NO LONGER auto-started here. It was nine more screens
  // landing 700ms after a new user finally reached the app, before they had
  // focused for a minute. It is offered once (see the boot block) and always
  // available under Settings > Feature Tour.
}

// ── Feature tour: spotlight coach marks over the real UI ─────────────────────
// Dims the app and highlights one control at a time with a short explanation.
// Auto-runs once after onboarding; replayable from Settings → Feature tour.
const TOUR_STEPS = [
  { sel: null, title: "Welcome to Mr. Tapioca's shop!",
    text: "Here's a quick tutorial of what everything does. You can replay it anytime from Settings." },
  { sel: [".size-picker"], title: "Set a Timer!",
    text: "Customize your session anywhere from 15 minutes to 4 hours OR complete the daily Focus Goal set for yourself in Settings." },
  { sel: ["#startPauseBtn"], title: "Start Focusing!",
    text: "Mr. Tapioca will brew your boba as the session progresses." },
  { sel: [".pearl-chip"], title: "Pearl Count",
    text: "Keep track of your hard earned pearls." },
  { sel: [".streak-chip"], title: "Streak Count",
    text: "Come back every day to keep it up." },
  { sel: ["#questsBtn"], title: "Daily Quests",
    text: "Complete new goals each day to earn bonus pearls!" },
  { sel: ["#shopBtn"], title: "The Shop",
    text: "Spend pearls or buy cool character skins, premium backgrounds, and special boosts!" },
  { sel: ["#mapBtn"], title: "Boba Map",
    text: "Locate boba shops near you!" },
  { sel: ["#friendsBtn"], title: "Study Squad",
    text: "Add friends and climb a shared leaderboard together. Focusing is cozier with good company!" },
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
  els.pongScore.innerHTML = ICON.pearl + pong.score;
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
  // Fresh day = full batch; a same-day reopen resumes the banked remainder.
  pong.throwsLeft = state.devMode ? PONG_MAX_PLAYS : bankedPlays("pong");
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
  if (!state.devMode) {
    // Burn the day on the first real throw of the day; a resumed batch skips
    // this so the quest can't double-count. Dev mode leaves both alone.
    if (state.gameDays.pong !== localDateKey(new Date())) { markGamePlayed("pong"); bumpQuest("gamesPlayed", 1); }
  }
  pong.throwsLeft = Math.max(0, pong.throwsLeft - 1);
  if (!state.devMode) bankPlays("pong", pong.throwsLeft);
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
      state.gamePearls += awardPearls(PONG_REWARD);
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

  // ── shadow cast on the wall BEHIND the cup, not a contact shadow under it ──
  // The cup is a floating target: its rim sits at mouthY (0.34 of the canvas)
  // while the table is down at startY + PONG_R + 4, roughly 280px lower. The old
  // tight ellipse sat 6px under the cup's base and read as a contact shadow, so
  // it promised a surface that is not there and the cup looked like it was
  // resting on nothing. Offset down and to the right, wider and softer, it reads
  // as the cup's shadow falling on the back wall, which is what actually happens.
  ctx.fillStyle = "rgba(45,36,40,0.09)";
  ctx.beginPath();
  ctx.ellipse(cx + 12, (topY + botY) / 2 + 16, botHalf + 14, d.cupH * 0.46, 0, 0, Math.PI * 2);
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
  els.resetBtn.addEventListener("click", async () => {
    playSfx("tap");
    // guard against erasing a partly-filled drink (mirrors the size-switch guard)
    if (state.elapsed > 0 && progress() < 1 &&
        !(await askConfirm("Your current progress will be lost.",
          { title: "Reset this drink?", eyebrow: "Careful", confirmLabel: "Reset", danger: true }))) return;
    resetSession();
  });

  // ── Mode / size picker ───────────────────────────────────────────────────
  document.querySelectorAll(".size-btn").forEach(btn => {
    btn.addEventListener("click", async () => { playSfx("select"); await setMode(btn.dataset.mode); });
  });
  els.customMinus.addEventListener("click", async () => { playSfx("select"); await adjustCustomDuration(-CUSTOM_STEP); });
  els.customPlus.addEventListener("click",  async () => { playSfx("select"); await adjustCustomDuration(CUSTOM_STEP); });

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

  // Rate the app: opens the App Store write-review page (any platform).
  const rateBtn = document.getElementById("rateAppBtn");
  if (rateBtn) rateBtn.addEventListener("click", () => {
    playSfx("tap");
    IAP.openReviewPage();
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
  const myCodeBtn = document.querySelector("#squadMyCode");
  if (myCodeBtn) myCodeBtn.addEventListener("click", () => {
    const code = myCodeBtn.textContent.trim();
    if (!code || code === "······") return;
    playSfx("tap");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(
        () => showToast("Code copied 🧋"),
        () => showToast("Couldn't copy. Read it out instead."));
    } else showToast("Your code is " + code);
  });
  if (els.changeNameBtn) els.changeNameBtn.addEventListener("click", async () => { await editSquadName(); renderNameRow(); });
  const squadAddBtn = document.querySelector("#squadAddBtn");
  const squadInput = document.querySelector("#squadCodeInput");
  if (squadAddBtn && squadInput) {
    const doAdd = () => { if (addFriendByCode(squadInput.value)) squadInput.value = ""; };
    squadAddBtn.addEventListener("click", doAdd);
    squadInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doAdd(); });
  }
  const deleteAccountBtn = document.querySelector("#deleteAccountBtn");
  if (deleteAccountBtn) deleteAccountBtn.addEventListener("click", async () => {
    if (!squadCloudLive() && !(window.SquadCloud && SquadCloud.enabled)) return;
    if (!(await askConfirm("This removes your profile, friends and stats from the server. Your on-device progress stays on this phone.",
          { title: "Delete your cloud account?", eyebrow: "Study Squad", confirmLabel: "Delete account", danger: true }))) return;
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
      scrollSheetTo("#settingsSheet", ".settings-section-title");
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
  // Belt and braces for the bug above: .scene-wrap is never meant to scroll, but
  // it IS a scroll container (overflow:hidden + the closed sheets' translate),
  // so anything that scrolls an ancestor — scrollIntoView, focus(), an IME, a
  // browser's own "keep the focused field visible" — can shove the whole app out
  // of frame with no scrollbar to get it back. Snap it home if it ever moves.
  const sceneWrapEl = document.querySelector(".scene-wrap");
  if (sceneWrapEl) sceneWrapEl.addEventListener("scroll", () => {
    if (sceneWrapEl.scrollTop || sceneWrapEl.scrollLeft) {
      sceneWrapEl.scrollTop = 0; sceneWrapEl.scrollLeft = 0;
    }
  }, { passive: true });

  els.shopClose.addEventListener("click",     closeSheets);
  els.customizeClose.addEventListener("click",closeSheets);
  els.settingsClose.addEventListener("click", closeSheets);
  els.mapClose.addEventListener("click",      closeSheets);
  els.sheetBackdrop.addEventListener("click", closeSheets);

  // ── Drag-to-dismiss on the grabber pill at the top of every sheet ─────────
  // Sheets live in index.html and are never re-created (open/close just toggles
  // .hidden), so binding once here is enough.
  document.querySelectorAll(".sheet-handle").forEach((handle) => {
    const sheet = handle.closest(".sheet");
    if (!sheet) return;
    let startY = 0, dy = 0, dragging = false;

    handle.addEventListener("pointerdown", (e) => {
      if (e.button) return;                    // primary pointer only
      dragging = true; startY = e.clientY; dy = 0;
      sheet.classList.add("dragging");
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - startY);    // downward only
      sheet.style.transform = `translateY(${dy}px)`;
      e.preventDefault();
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove("dragging");
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      sheet.style.transform = "";              // CSS animates out or snaps back
      // Guard on the sheet still being open: if it was closed by other code
      // mid-drag, offsetHeight is 0 and every threshold would "pass", closing
      // whatever the user opened next.
      if (!sheet.classList.contains("hidden") &&
          dy > Math.min(120, sheet.offsetHeight * 0.25)) {
        playSfx("tap"); haptic(8);
        closeSheets();
      }
    };
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
    // If capture is torn away (element re-render, iOS gesture takeover) neither
    // pointerup nor pointercancel fires, which would strand .dragging and the
    // inline transform.
    handle.addEventListener("lostpointercapture", endDrag);
  });

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

  // ── Your Shelf ────────────────────────────────────────────────────────────
  if (els.shelfChip) els.shelfChip.addEventListener("click", () => {
    playSfx("tap");
    renderCollection();
    showCollectionTab("drinks");
    openSheet("collectionSheet");
  });
  if (els.collectionClose) els.collectionClose.addEventListener("click", () => { playSfx("tap"); closeSheets(); });
  document.querySelectorAll(".coll-tab").forEach(btn => {
    btn.addEventListener("click", () => { playSfx("select"); showCollectionTab(btn.dataset.tab); });
  });

  // ── Customize sheet: tea base + topping (rendered from BASES/TOPPINGS) ────
  renderCustomizeOptions();
  els.baseGrid.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-base]");
    if (btn) await setBase(btn.dataset.base);
  });
  els.toppingRow.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-topping]");
    if (btn) await setChoice("topping", btn.dataset.topping);
  });

  // ── App blocking (native picker on iPhone; preview/hint on web) ───────────
  els.chooseAppsBtn.addEventListener("click", async () => {
    playSfx("tap");
    await FocusBlocker.requestAuthorization();
    await FocusBlocker.pickApps();
    await FocusBlocker.refreshStatus();
    renderBlockPill();
  });

  // Recovery: if blocking quietly stopped working (blocked app reinstalled,
  // iOS update, "Ignore Limit" tapped on a personal Screen Time limit), the
  // stored picks may be dead. Re-picking from scratch mints live ones.
  if (els.repickAppsBtn) els.repickAppsBtn.addEventListener("click", async () => {
    playSfx("tap");
    await FocusBlocker.requestAuthorization();
    await FocusBlocker.pickApps({ fresh: true });
    await FocusBlocker.refreshStatus();
    renderBlockPill();
    if (FocusBlocker._configured) showToast("Fresh picks saved. Blocking is back 🧋");
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

  // ── Redeem-at-the-counter dialog ─────────────────────────────────────────
  if (els.redeemDialog) els.redeemDialog.addEventListener("close", closeRedeem);
  if (els.redeemConfirmBtn) els.redeemConfirmBtn.addEventListener("click", confirmRedeem);

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
    if (!lastReward) return;
    // A drink that just crossed a partner threshold shares the REWARD card. The
    // star prefix is the same signal showReward() uses to style the line as a
    // coupon, so the two cannot disagree about which moment this is.
    if (typeof lastReward.partner === "string" && lastReward.partner.startsWith("🌟")) {
      shareRewardEarned({ minutes: lastReward.minutes });
    } else {
      shareDrink(lastReward);
    }
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
    // The window loop is decorative and nobody can see it while the app is away,
    // so it must not keep a decoder awake through a locked-screen session. The
    // TIMER deliberately keeps running (see below); only the video stops.
    if (els.winVideo && els.winVideo.getAttribute("src")) {
      if (document.visibilityState === "hidden") els.winVideo.pause();
      else { const p = els.winVideo.play(); if (p && p.catch) p.catch(() => {}); }
    }
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

// Server-backed merchant rewards (reward-v2.js). Flagged OFF in config.js, so this
// is currently a guard that never fires. Started AFTER SquadCloud.init() on purpose:
// both share one anonymous account, and letting Squad establish it first means
// RewardV2 restores that session rather than racing to create a second one.
// A failure here must never reach the app, hence the swallow.
if (window.RewardV2 && RewardV2.enabled) {
  Promise.resolve(RewardV2.init()).catch(() => {});
}

// ── Notification settings ────────────────────────────────────────────────────
// Permission is requested on the FIRST toggle the user turns on, never at boot
// and never on a bare Settings open. iOS gives one prompt per install, and
// spending it before the user has said what they want is how an app ends up
// permanently unable to tell someone their timer finished.
function renderNotifySettings() {
  if (!els.notifyRow) return;
  const has = !!(window.MrTNotify && MrTNotify.available());
  els.notifyRow.classList.toggle("hidden", !has);
  if (!has) return;

  const p = MrTNotify.prefs();
  const denied = MrTNotify.permission === "denied";

  els.notifyDoneToggle.classList.toggle("on", p.done && !denied);
  els.notifyDoneToggle.setAttribute("aria-checked", String(p.done && !denied));
  els.notifyDailyToggle.classList.toggle("on", p.daily && !denied);
  els.notifyDailyToggle.setAttribute("aria-checked", String(p.daily && !denied));
  els.notifyTimeLine.classList.toggle("hidden", !(p.daily && !denied));

  const hh = String(Math.floor(p.dailyMin / 60)).padStart(2, "0");
  const mm = String(p.dailyMin % 60).padStart(2, "0");
  els.notifyTime.value = hh + ":" + mm;

  // Denial is a dead end inside the app: the OS will not re-prompt, so saying
  // "allow notifications" again would send the user in a circle. Say where the
  // switch actually lives instead.
  els.notifyNote.textContent = denied
    ? "Notifications are turned off for Mr. Tapioca in your device settings. You can turn them back on there."
    : (MrTNotify.backend === "web"
      ? "Your browser can tell you when your drink is ready, as long as this tab stays open."
      : "Mr. Tapioca can tell you when your drink is ready, so you can put your phone down and forget about it.");
}

async function toggleNotifyPref(key) {
  if (!(window.MrTNotify && MrTNotify.available())) return;
  const p = MrTNotify.prefs();
  const turningOn = !p[key];

  if (turningOn && MrTNotify.permission !== "granted") {
    const res = await MrTNotify.requestPermission();
    if (res !== "granted") {
      // Do NOT store the preference. A pref that is on while permission is off
      // is a switch that lies about what the app is going to do.
      renderNotifySettings();
      showToast("Notifications are off in your device settings.");
      return;
    }
  }
  await MrTNotify.setPref(key, turningOn);
  playSfx("tap");
  renderNotifySettings();
}

function wireNotifySettings() {
  if (!els.notifyRow) return;
  els.notifyDoneToggle.addEventListener("click", () => toggleNotifyPref("done"));
  els.notifyDailyToggle.addEventListener("click", () => toggleNotifyPref("daily"));
  els.notifyTime.addEventListener("change", async () => {
    const parts = String(els.notifyTime.value || "").split(":");
    const mins = (parseInt(parts[0], 10) * 60) + parseInt(parts[1], 10);
    if (!isFinite(mins)) return;
    await MrTNotify.setPref("dailyMin", mins);
    renderNotifySettings();
  });
}

// Re-arm the daily reminder the user already asked for. Schedules nothing on a
// fresh install: a notification nobody opted into is spam by definition.
if (window.MrTNotify) {
  Promise.resolve(MrTNotify.init()).then(renderNotifySettings).catch(() => {});
  wireNotifySettings();
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
    askConfirm("Someone shared their Study Squad code with you.",
      { title: "Add this friend?", eyebrow: "Study Squad", confirmLabel: "Add them" })
      .then((yes) => { if (yes) addFriendByCode(m[1]); });
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
    // sw.js does skipWaiting + clients.claim and deletes the old versioned
    // cache on activate, so a new deploy can swap the cache out from under an
    // already-open page: its in-memory code and asset paths then mix with
    // newer assets (in the sprite-sheet era this showed up as the "three
    // stretched mascots" glitch). Reload ONCE the moment a new SW claims us
    // so everything comes from one cache version.
    // hadController guards the very first install, which also fires
    // controllerchange but needs no reload.
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController) location.reload();
      hadController = true;
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
