const MODES = {
  tasting: { label: "Tasting Cup", duration: 30, reward: "Sample Sip" },
  small: { label: "Small Drink", duration: 3 * 60 * 60, reward: "Small Boba Run" },
  large: { label: "Large Drink", duration: 6 * 60 * 60, reward: "Large Boba Run" }
};

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

const SHOP_CATEGORIES = ["Tea Base", "Topping", "Cup Sticker", "Mr. T Skin", "Apron", "Shop Theme"];

const DEFAULTS = {
  base: "classic", topping: "pearls", sticker: "Focus",
  palStyle: "classic", apron: "mint", shopTheme: "cozy"
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

  { id: "style-strawberry", name: "Strawberry",          desc: "Pink and sweet",                      category: "Mr. T Skin",  type: "palStyle",  value: "strawberry", price: 30, color: "#d96d86" },
  { id: "style-barista",    name: "Barista",             desc: "Dark roast, mysterious",              category: "Mr. T Skin",  type: "palStyle",  value: "barista",    price: 55, color: "#4a2010" },
  { id: "style-starry",     name: "Starry Night",        desc: "Galaxy sparkles, dreamy",             category: "Mr. T Skin",  type: "palStyle",  value: "starry",     price: 75, color: "#2d294f" },
  { id: "style-royal",      name: "Royal",               desc: "Crown, purple, main character energy",category: "Mr. T Skin",  type: "palStyle",  value: "royal",      price: 95, color: "#46285c" },

  { id: "apron-berry",     name: "Berry Apron",          desc: "Rosy pink",                           category: "Apron",       type: "apron",     value: "berry",      price: 25, color: "#e97991" },
  { id: "apron-lavender",  name: "Lavender Apron",       desc: "Matches the break mode colors",       category: "Apron",       type: "apron",     value: "lavender",   price: 30, color: "#c4a8e0" },
  { id: "apron-gold",      name: "Gold Apron",           desc: "Shiny, bougie",                       category: "Apron",       type: "apron",     value: "gold",       price: 35, color: "#e2ad46" },
  { id: "apron-black",     name: "Black Apron",          desc: "Chef mode, sophisticated",            category: "Apron",       type: "apron",     value: "black",      price: 50, color: "#2d2428" },

  { id: "theme-night",     name: "Night Market",         desc: "Dark, warm lights, cozy late-night",  category: "Shop Theme",  type: "shopTheme", value: "night",      price: 65, color: "#36476b" },
  { id: "theme-sakura",    name: "Sakura",               desc: "Cherry blossoms, soft pink, spring",  category: "Shop Theme",  type: "shopTheme", value: "sakura",     price: 65, color: "#ffdfe8" },
  { id: "theme-autumn",    name: "Autumn Harvest",       desc: "Pumpkin spice, warm oranges, fall",   category: "Shop Theme",  type: "shopTheme", value: "autumn",     price: 75, color: "#c4873a" },
  { id: "theme-rainy",     name: "Rainy Day Café",       desc: "Cool grey-blue, lo-fi, window rain",  category: "Shop Theme",  type: "shopTheme", value: "rainy",      price: 80, color: "#7a9ab8" },
];

const UNLOCKS = [
  { minutes: 25, label: "Tapioca pearls" },
  { minutes: 50, label: "Lychee jelly" },
  { minutes: 90, label: "Egg pudding" },
  { minutes: 180, label: "Brown sugar syrup" },
  { minutes: 360, label: "Cheese foam" }
];

const state = {
  mode: "tasting",
  base: "classic",
  topping: "pearls",
  sticker: "Focus",
  apron: "mint",
  palStyle: "classic",
  shopTheme: "cozy",
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
  breakMakerCycleId: null
};

const els = {
  shopScene: document.querySelector("#shopScene"),
  focusCup: document.querySelector("#focusCup"),
  liquid: document.querySelector("#liquid"),
  focusSticker: document.querySelector("#focusSticker"),
  focusMakerCharacter: document.querySelector("#focusMakerCharacter"),
  makerSpeech: document.querySelector("#makerSpeech"),
  progressBar: document.querySelector("#progressBar"),
  timerText: document.querySelector("#timerText"),
  startPauseBtn: document.querySelector("#startPauseBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  sessionLabel: document.querySelector("#sessionLabel"),
  progressLabel: document.querySelector("#progressLabel"),
  focusState: document.querySelector("#focusState"),
  nextUnlock: document.querySelector("#nextUnlock"),
  drinkName: document.querySelector("#drinkName"),
  drawerTitle: document.querySelector("#drawerTitle"),
  shelfGrid: document.querySelector("#shelfGrid"),
  totalTime: document.querySelector("#totalTime"),
  pearlCount: document.querySelector("#pearlCount"),
  completedCount: document.querySelector("#completedCount"),
  rewardList: document.querySelector("#rewardList"),
  rewardDialog: document.querySelector("#rewardDialog"),
  rewardTitle: document.querySelector("#rewardTitle"),
  rewardCopy: document.querySelector("#rewardCopy"),
  partnerReward: document.querySelector("#partnerReward"),
  premiumDialog: document.querySelector("#premiumDialog"),
  premiumTitle: document.querySelector("#premiumTitle"),
  premiumCopy: document.querySelector("#premiumCopy"),
  saveRewardBtn: document.querySelector("#saveRewardBtn"),
  previewRestrictionBtn: document.querySelector("#previewRestrictionBtn"),
  restrictionPreview: document.querySelector("#restrictionPreview"),
  streakCount: document.querySelector("#streakCount"),
  timerStrip: document.querySelector("#timerStrip"),
  breakStrip: document.querySelector("#breakStrip"),
  breakOffer: document.querySelector("#breakOffer"),
  breakRunningPanel: document.querySelector("#breakRunningPanel"),
  breakDurationDisplay: document.querySelector("#breakDurationDisplay"),
  breakTimerText: document.querySelector("#breakTimerText"),
  breakProgressBar: document.querySelector("#breakProgressBar"),
  breakProgressLabel: document.querySelector("#breakProgressLabel"),
  startBreakBtn: document.querySelector("#startBreakBtn"),
  skipBreakBtn: document.querySelector("#skipBreakBtn"),
  skipBreakRunningBtn: document.querySelector("#skipBreakRunningBtn"),
  breakMinus: document.querySelector("#breakMinus"),
  breakPlus: document.querySelector("#breakPlus"),
  shopPearlCount: document.querySelector("#shopPearlCount"),
  shopGrid: document.querySelector("#shopGrid")
};

function loadState() {
  state.collection = JSON.parse(localStorage.getItem("bobaFocusCollection") || "[]");
  state.rewards   = JSON.parse(localStorage.getItem("bobaFocusRewards")    || "[]");
  state.owned     = JSON.parse(localStorage.getItem("bobaFocusOwned")      || "[]");
  state.spent     = JSON.parse(localStorage.getItem("bobaFocusSpent")      || "0");
}

function saveState() {
  localStorage.setItem("bobaFocusCollection", JSON.stringify(state.collection));
  localStorage.setItem("bobaFocusRewards",    JSON.stringify(state.rewards));
  localStorage.setItem("bobaFocusOwned",      JSON.stringify(state.owned));
  localStorage.setItem("bobaFocusSpent",      JSON.stringify(state.spent));
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

function totalMinutes() {
  return state.collection.reduce((sum, drink) => sum + drink.minutes, 0);
}

function minuteLabel(minutes) {
  return `${minutes} focused ${minutes === 1 ? "minute" : "minutes"}`;
}

function currentMode() {
  return MODES[state.mode];
}

function currentDrinkName() {
  return `${BASES[state.base].label} + ${TOPPINGS[state.topping]}`;
}

function progress() {
  return Math.min(1, state.elapsed / currentMode().duration);
}

function currentPearls() {
  return state.collection.length * 6 + Math.floor(totalMinutes() / 25) - state.spent;
}

function speechForState() {
  if (state.running) {
    return "Mixing your focus drink. Keep going.";
  }

  if (state.elapsed > 0) {
    return "Paused at the counter. Your drink is waiting.";
  }

  if (state.collection.length > 0) {
    return "Welcome back. The shelf is filling up.";
  }

  return "Mr. Tapioca is ready to make your focus drink.";
}

function updateCup() {
  const pct = Math.round(progress() * 100);
  els.liquid.style.setProperty("--fill", `${pct}%`);
  els.liquid.style.setProperty("--drink-color", BASES[state.base].color);
  els.progressBar.style.width = `${pct}%`;
  els.focusCup.dataset.topping = state.topping;
  els.focusSticker.textContent = state.sticker;
  els.focusMakerCharacter.dataset.apron = state.apron;
  els.focusMakerCharacter.dataset.style = state.palStyle;
  els.focusMakerCharacter.dataset.state = state.running ? "mixing" : "idle";
  els.shopScene.dataset.theme = state.shopTheme;
  els.shopScene.classList.toggle("is-focusing", state.running);
  els.makerSpeech.textContent = speechForState();
  els.timerText.textContent = formatTime(currentMode().duration - state.elapsed);
  els.sessionLabel.textContent = currentMode().label;
  els.progressLabel.textContent = `${pct}%`;
  els.focusState.textContent = state.running ? "Focusing" : pct === 100 ? "Ready to seal" : "Ready";
  els.startPauseBtn.textContent = state.running ? "Pause" : pct === 100 ? "Seal" : "Start";
  els.drinkName.textContent = currentDrinkName();
}

function updateUnlocks() {
  const minutes = totalMinutes();
  const next = UNLOCKS.find((unlock) => minutes < unlock.minutes);

  if (!next) {
    els.nextUnlock.textContent = "All starter toppings unlocked";
    return;
  }

  els.nextUnlock.textContent = `${next.label} at ${next.minutes} focused minutes`;
}

function updateStats() {
  const minutes = totalMinutes();
  const pearls = currentPearls();
  els.totalTime.textContent = `${minutes} min`;
  els.pearlCount.textContent = String(pearls);
  els.completedCount.textContent = `${state.collection.length} ${state.collection.length === 1 ? "drink" : "drinks"}`;
  els.shopPearlCount.textContent = `${pearls} pearls`;

  const days = new Set(state.collection.map((drink) => drink.dateKey));
  els.streakCount.textContent = String(days.size);
}

function renderShelf() {
  if (state.collection.length === 0) {
    els.shelfGrid.innerHTML = `<div class="empty-state">Your finished drinks will appear here.</div>`;
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
    els.rewardList.innerHTML = `<div class="empty-state">Saved treat cards will appear here.</div>`;
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
  return state.owned.includes(itemId);
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

function equipItem(itemId) {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return;
  state[item.type] = item.value;
  renderAll();
  els.makerSpeech.textContent = "Ooh, nice pick.";
}

function unequipItem(type) {
  state[type] = DEFAULTS[type];
  renderAll();
}

function renderShop() {
  const pearls = currentPearls();
  els.shopPearlCount.textContent = `${pearls} pearls`;

  els.shopGrid.innerHTML = SHOP_CATEGORIES.map(cat => {
    const cards = SHOP_ITEMS.filter(i => i.category === cat).map(item => {
      const owned    = isOwned(item.id);
      const equipped = isEquipped(item);
      const canBuy   = pearls >= item.price;

      const previewInner = item.type === "sticker"
        ? `<span class="shop-sticker-preview">${item.value}</span>`
        : "";

      let action = "";
      if (equipped) {
        action = `
          <span class="shop-equipped-badge">Equipped</span>
          <button class="shop-unequip-btn" data-unequip="${item.type}">Remove</button>`;
      } else if (owned) {
        action = `<button class="shop-equip-btn" data-equip="${item.id}">Equip</button>`;
      } else {
        action = `<button class="shop-buy-btn" data-buy="${item.id}" ${canBuy ? "" : "disabled"}>⬡ ${item.price}</button>`;
      }

      return `
        <article class="shop-card">
          <div class="shop-preview" style="background:${item.color || "#f5f0ff"}">${previewInner}</div>
          <div>
            <strong>${item.name}</strong>
            <small>${item.desc}</small>
          </div>
          <div class="shop-card-action">${action}</div>
        </article>`;
    }).join("");

    return `<h4 class="shop-category-head">${cat}</h4>${cards}`;
  }).join("");

  els.shopGrid.querySelectorAll("[data-buy]").forEach(btn => {
    btn.addEventListener("click", () => buyItem(btn.dataset.buy));
  });
  els.shopGrid.querySelectorAll("[data-equip]").forEach(btn => {
    btn.addEventListener("click", () => equipItem(btn.dataset.equip));
  });
  els.shopGrid.querySelectorAll("[data-unequip]").forEach(btn => {
    btn.addEventListener("click", () => unequipItem(btn.dataset.unequip));
  });
}

function renderAll() {
  updateCup();
  updateUnlocks();
  updateStats();
  renderShelf();
  renderRewards();
  renderShop();
}

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
  state.elapsed = Math.min(currentMode().duration, state.elapsed + delta);
  updateCup();

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
    stopTicker();
    state.timerId = setInterval(tick, 250);
  } else {
    stopTicker();
  }
}

function resetSession() {
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
  els.shopScene.classList.remove("is-on-break");
  els.focusMakerCharacter.dataset.state = "idle";
  updatePhaseUI();
  updateCup();
}

function completeSession() {
  stopTicker();
  state.running = false;
  state.elapsed = currentMode().duration;
  state.lastTick = null;

  const mode = currentMode();
  const minutes = Math.round(mode.duration / 60);
  const now = new Date();
  const drink = {
    id: crypto.randomUUID(),
    name: currentDrinkName(),
    size: mode.label,
    color: BASES[state.base].color,
    minutes,
    sticker: state.sticker,
    dateKey: now.toISOString().slice(0, 10)
  };

  const reward = {
    id: crypto.randomUUID(),
    title: "You deserve to go get one in-person!",
    copy: `${mode.reward} earned from ${minuteLabel(minutes)}.`,
    partner: minutes >= 180 ? "Local Boba Partner - 5% Study Sip Pass" : "Save this treat for later"
  };

  state.collection.unshift(drink);
  state.rewards.unshift(reward);
  saveState();
  renderAll();
  showReward(reward);
}

function showReward(reward) {
  els.rewardTitle.textContent = reward.title;
  els.rewardCopy.textContent = reward.copy;
  els.partnerReward.textContent = reward.partner;

  if (typeof els.rewardDialog.showModal === "function") {
    els.rewardDialog.showModal();
  }
}

function onRewardDialogClose() {
  state.elapsed = 0;
  updateCup();
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
  clearInterval(state.breakTimerId);
  state.breakTimerId = null;
  clearTimeout(state.breakMakerCycleId);
  state.breakMakerCycleId = null;
  state.breakElapsed = 0;
  state.phase = "focus";
  els.shopScene.classList.remove("is-on-break");
  els.focusMakerCharacter.dataset.state = "idle";
  updatePhaseUI();
  renderAll();
  els.makerSpeech.textContent = "Break over. Ready for another round?";
}

function skipBreak() {
  clearInterval(state.breakTimerId);
  state.breakTimerId = null;
  clearTimeout(state.breakMakerCycleId);
  state.breakMakerCycleId = null;
  state.breakElapsed = 0;
  state.phase = "focus";
  els.shopScene.classList.remove("is-on-break");
  els.focusMakerCharacter.dataset.state = "idle";
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

  els.timerStrip.classList.toggle("hidden", !isFocus);
  els.breakStrip.classList.toggle("hidden", isFocus);
  els.breakOffer.classList.toggle("hidden", !isOffer);
  els.breakRunningPanel.classList.toggle("hidden", !isBreak);

  updateBreakDisplay();
}

function scheduleMakerBreakCycle() {
  const makerStates = ["drinking", "sleeping"];
  let idx = 0;

  function cycle() {
    els.focusMakerCharacter.dataset.state = makerStates[idx % makerStates.length];
    idx++;
    state.breakMakerCycleId = setTimeout(cycle, 8000);
  }

  cycle();
}

function setMode(mode) {
  state.mode = mode;
  resetSession();
  document.querySelectorAll(".mode").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
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
  els.makerSpeech.textContent = type === "apron" ? "New apron on. Ready behind the counter." : "Got it. I will make that drink next.";
}

function showPremiumPreview(title, price) {
  els.premiumTitle.textContent = `${title} preview`;
  els.premiumCopy.textContent = `Later, this could unlock as a ${price} premium cosmetic. On iPhone, this would use Apple's in-app purchase system.`;

  if (typeof els.premiumDialog.showModal === "function") {
    els.premiumDialog.showModal();
  }
}

function setPalStyle(style, button) {
  state.palStyle = style;
  document.querySelectorAll("[data-pal-style]").forEach((item) => {
    item.classList.toggle("active", item.dataset.palStyle === style);
  });
  renderAll();
  els.makerSpeech.textContent = style === "classic" ? "Classic tapioca shine." : "Mr. Tapioca is trying on a new look.";

  if (button.dataset.premiumPrice) {
    showPremiumPreview(button.textContent.trim(), button.dataset.premiumPrice);
  }
}

function setShopTheme(theme, button) {
  state.shopTheme = theme;
  document.querySelectorAll("[data-shop-theme]").forEach((item) => {
    item.classList.toggle("active", item.dataset.shopTheme === theme);
  });
  renderAll();
  els.makerSpeech.textContent = theme === "cozy" ? "Back to the cozy shop." : "The shop got a glow-up.";

  if (button.dataset.premiumPrice) {
    showPremiumPreview(button.textContent.trim(), button.dataset.premiumPrice);
  }
}

function switchArea(areaId) {
  const titles = {
    counterPanel: "Counter",
    ingredientsPanel: "Mix",
    shelfPanel: "Shelf",
    treatsPanel: "Treats",
    shopPanel: "Shop"
  };

  document.querySelectorAll(".area-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === areaId);
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.area === areaId);
  });

  els.drawerTitle.textContent = titles[areaId] || "Counter";
}

function wireEvents() {
  els.startPauseBtn.addEventListener("click", startPause);
  els.resetBtn.addEventListener("click", resetSession);
  els.previewRestrictionBtn.addEventListener("click", () => {
    els.restrictionPreview.classList.toggle("hidden");
  });

  document.querySelectorAll(".mode").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  document.querySelectorAll(".swatch").forEach((button) => {
    button.addEventListener("click", () => setBase(button.dataset.base));
  });

  document.querySelectorAll("[data-topping]").forEach((button) => {
    button.addEventListener("click", () => setChoice("topping", button.dataset.topping));
  });

  document.querySelectorAll("[data-sticker]").forEach((button) => {
    button.addEventListener("click", () => setChoice("sticker", button.dataset.sticker));
  });

  document.querySelectorAll("[data-apron]").forEach((button) => {
    button.addEventListener("click", () => setChoice("apron", button.dataset.apron));
  });

  document.querySelectorAll("[data-pal-style]").forEach((button) => {
    button.addEventListener("click", () => setPalStyle(button.dataset.palStyle, button));
  });

  document.querySelectorAll("[data-shop-theme]").forEach((button) => {
    button.addEventListener("click", () => setShopTheme(button.dataset.shopTheme, button));
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchArea(tab.dataset.area));
  });

  els.saveRewardBtn.addEventListener("click", () => {
    switchArea("treatsPanel");
  });

  els.rewardDialog.addEventListener("close", onRewardDialogClose);
  els.startBreakBtn.addEventListener("click", startBreak);
  els.skipBreakBtn.addEventListener("click", skipBreak);
  els.skipBreakRunningBtn.addEventListener("click", skipBreak);
  els.breakMinus.addEventListener("click", () => adjustBreakDuration(-300));
  els.breakPlus.addEventListener("click", () => adjustBreakDuration(300));
}

loadState();
wireEvents();
renderAll();
