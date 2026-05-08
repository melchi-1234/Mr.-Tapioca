const MODES = {
  tasting: { label: "Tasting Cup", duration: 30, reward: "Sample Sip" },
  small: { label: "Small Drink", duration: 3 * 60 * 60, reward: "Small Boba Run" },
  large: { label: "Large Drink", duration: 6 * 60 * 60, reward: "Large Boba Run" }
};

const BASES = {
  classic: { label: "Classic Milk Tea", color: "#c98555" },
  taro: { label: "Taro Milk Tea", color: "#b58bdc" },
  matcha: { label: "Matcha Milk Tea", color: "#76a86a" },
  strawberry: { label: "Strawberry Milk Tea", color: "#f07c93" }
};

const TOPPINGS = {
  pearls: "Tapioca Pearls",
  jelly: "Lychee Jelly",
  pudding: "Egg Pudding",
  foam: "Cheese Foam"
};

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
  rewards: []
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
  streakCount: document.querySelector("#streakCount")
};

function loadState() {
  state.collection = JSON.parse(localStorage.getItem("bobaFocusCollection") || "[]");
  state.rewards = JSON.parse(localStorage.getItem("bobaFocusRewards") || "[]");
}

function saveState() {
  localStorage.setItem("bobaFocusCollection", JSON.stringify(state.collection));
  localStorage.setItem("bobaFocusRewards", JSON.stringify(state.rewards));
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
  return state.collection.length * 6 + Math.floor(totalMinutes() / 25);
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
  els.totalTime.textContent = `${minutes} min`;
  els.pearlCount.textContent = String(currentPearls());
  els.completedCount.textContent = `${state.collection.length} ${state.collection.length === 1 ? "drink" : "drinks"}`;

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

function renderAll() {
  updateCup();
  updateUnlocks();
  updateStats();
  renderShelf();
  renderRewards();
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
  stopTicker();
  state.running = false;
  state.elapsed = 0;
  state.lastTick = null;
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
  state.elapsed = 0;
  updateCup();
}

function showReward(reward) {
  els.rewardTitle.textContent = reward.title;
  els.rewardCopy.textContent = reward.copy;
  els.partnerReward.textContent = reward.partner;

  if (typeof els.rewardDialog.showModal === "function") {
    els.rewardDialog.showModal();
  }
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
    treatsPanel: "Treats"
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
}

loadState();
wireEvents();
renderAll();
