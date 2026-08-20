let chosenMin = 25;
let uiTimer = null;

function send(msg) { return new Promise(res => chrome.runtime.sendMessage(msg, res)); }

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60), r = s % 60;
  return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
}

function showRunning(endsAt) {
  document.getElementById("idle").style.display = "none";
  document.getElementById("running").style.display = "block";
  const tick = () => {
    const left = endsAt - Date.now();
    document.getElementById("timer").textContent = fmt(left);
    if (left <= 0) { clearInterval(uiTimer); render(); }
  };
  tick();
  clearInterval(uiTimer);
  uiTimer = setInterval(tick, 1000);
}

function showIdle() {
  clearInterval(uiTimer);
  document.getElementById("running").style.display = "none";
  document.getElementById("idle").style.display = "block";
}

async function render() {
  const s = await send({ type: "state" });
  document.getElementById("sitesArea").value = (s.sites || []).join("\n");
  document.getElementById("siteCount").textContent = (s.sites || []).length + " sites";
  if (s.active && s.endsAt && s.endsAt > Date.now()) showRunning(s.endsAt);
  else showIdle();
}

document.getElementById("durs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-min]"); if (!b) return;
  chosenMin = parseInt(b.dataset.min, 10);
  document.querySelectorAll("#durs button").forEach(x => x.classList.toggle("sel", x === b));
});

document.getElementById("startBtn").addEventListener("click", async () => {
  await send({ type: "start", minutes: chosenMin });
  render();
});

document.getElementById("stopBtn").addEventListener("click", async () => {
  await send({ type: "stop" });
  render();
});

document.getElementById("editLink").addEventListener("click", () => {
  const box = document.getElementById("sitesBox");
  box.style.display = box.style.display === "block" ? "none" : "block";
});

document.getElementById("saveSites").addEventListener("click", async () => {
  const sites = document.getElementById("sitesArea").value
    .split("\n").map(s => s.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean);
  await send({ type: "setSites", sites });
  document.getElementById("sitesBox").style.display = "none";
  render();
});

render();
