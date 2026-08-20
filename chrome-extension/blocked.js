const params = new URLSearchParams(location.search);
const from = params.get("from") || "This site";
document.getElementById("site").textContent = from;

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60), r = s % 60;
  return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
}

async function tick() {
  const { active, endsAt } = await chrome.storage.local.get(["active", "endsAt"]);
  if (!active || !endsAt || endsAt <= Date.now()) {
    document.getElementById("timer").style.display = "none";
    document.querySelector(".sub").style.display = "none";
    document.getElementById("done").style.display = "block";
    return;
  }
  document.getElementById("timer").textContent = fmt(endsAt - Date.now());
}
tick();
setInterval(tick, 1000);
