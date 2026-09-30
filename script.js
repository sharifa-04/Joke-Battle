/* =====================================================
   JOKE BATTLE - vanilla JavaScript, beginner friendly
   ===================================================== */

/* ---------- 1. DOM ELEMENTS ---------- */
const $ = (id) => document.getElementById(id);
const screens = document.querySelectorAll(".screen");
const hud = $("hud");
const startBtn = $("startBtn"), luckyBtn = $("luckyBtn"), retryBtn = $("retryBtn");
const revealBtn = $("revealBtn"), nextBtn = $("nextBtn"), rematchBtn = $("rematchBtn");
const choiceButtons = document.querySelectorAll(".choice");

/* ---------- 2. STATE ---------- */
const JOKE_URL = "https://v2.jokeapi.dev/joke/Any?safe-mode&lang=en";
const RATING_POINTS = { 1: 10, 2: 25, 3: 50, 4: 80, 5: 100 };
const OPPONENTS = [
  "Your opponent is... the internet.", "Your opponent is... questionable humor.",
  "Your opponent is... one very bad joke.", "Your opponent is... dad-level comedy.",
  "Your opponent is... a suspiciously confident comedian.", "Your opponent is... your own sense of humor."
];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let stats = { bestScore: 0, totalRated: 0, ratingSum: 0, bestCombo: 0, currentStreak: 0, challengesCompleted: 0, battlesPlayed: 0 };
let daily = { date: "", target: 300, progress: 0, done: false };

let game = {
  mode: "battle",      // "battle" or "lucky"
  battleNumber: 0, target: 500, score: 0, round: 0,
  rated: 0, ratingSum: 0, combo: 0, bestCombo: 0,
  luckyScore: 0, joke: null, lastPoints: 0, busy: false, token: 0
};

/* ---------- 3. API FUNCTIONS ---------- */
// Only accept short, simple, family-friendly jokes
function isGoodJoke(data) {
  if (!data || data.error) return false;
  if (data.category === "Programming" || data.category === "Dark") return false;
  if (data.type === "single") return typeof data.joke === "string" && data.joke.length <= 180;
  if (data.type === "twopart") {
    return typeof data.setup === "string" && typeof data.delivery === "string" &&
      data.setup.length + data.delivery.length <= 200;
  }
  return false; // unexpected format
}

// Turn API data into { setup, punchline } (punchline is null for single jokes)
function normalizeJoke(data) {
  if (data.type === "single") return { setup: data.joke, punchline: null };
  return { setup: data.setup, punchline: data.delivery };
}

// Fetch jokes until we find a good one (max 6 tries)
async function fetchJoke() {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(JOKE_URL);
    if (!response.ok) throw new Error("The joke server answered with status " + response.status + ".");
    const data = await response.json();
    if (data.error && data.message) throw new Error("The joke server had a problem.");
    if (isGoodJoke(data)) return normalizeJoke(data);
  }
  throw new Error("We couldn't find a good joke this time.");
}

/* ---------- 4. GAME / BATTLE LOGIC ---------- */
function startBattle() {
  game.mode = "battle";
  game.battleNumber = stats.battlesPlayed + 1;
  game.target = (Math.floor(Math.random() * 7) + 4) * 50; // 200 - 500
  game.score = 0; game.round = 0; game.rated = 0; game.ratingSum = 0; game.combo = 0; game.bestCombo = 0;
  stats.battlesPlayed++; saveStats();
  $("introNum").textContent = "BATTLE #" + pad(game.battleNumber);
  $("introOpp").textContent = OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)];
  $("introTarget").textContent = game.target;
  updateHud();
  showScreen("intro");
  runCountdown(++game.token);
}

// GET READY... 3, 2, 1, FIGHT! then the first joke loads
function runCountdown(token) {
  const el = $("countNum");
  const steps = reducedMotion ? ["FIGHT!"] : ["GET READY...", "3", "2", "1", "FIGHT!"];
  let i = 0;
  function next() {
    if (token !== game.token) return; // user left meanwhile
    if (i >= steps.length) { loadRound(); return; }
    el.textContent = steps[i];
    el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick");
    el.classList.toggle("fight", steps[i] === "FIGHT!");
    const wait = reducedMotion ? 700 : i === 0 ? 1000 : steps[i] === "FIGHT!" ? 600 : 450;
    i++;
    setTimeout(next, wait);
  }
  next();
}

function startLucky() {
  game.mode = "lucky"; game.round = 0; game.luckyScore = 0; game.combo = 0;
  loadRound();
}

async function loadRound() {
  if (game.busy) return;
  game.busy = true; setBusy(true);
  game.round++;
  $("loadRound").textContent = game.mode === "battle" ? "ROUND " + pad(game.round) : "LUCKY JOKE";
  $("loadLine").textContent = game.mode === "lucky" ? "No target. No pressure. Just one joke." : "Prepare yourself...";
  showScreen("loading");
  const token = ++game.token;
  try {
    const joke = await fetchJoke();
    if (token !== game.token) return; // user left meanwhile
    game.joke = joke;
    showJoke();
  } catch (error) {
    if (token !== game.token) return;
    $("errorDetail").textContent = error.message.includes("fetch") ? "Check your internet connection and try again." : error.message;
    showScreen("error");
  } finally {
    game.busy = false; setBusy(false);
  }
}

function goHome() {
  game.token++; game.busy = false; setBusy(false);
  renderHome(); showScreen("home");
}

/* ---------- 5. RATING LOGIC ---------- */
function handleRating(rating) {
  choiceButtons.forEach((b) => (b.disabled = true));
  document.querySelector('.choice[data-rating="' + rating + '"]').classList.add("picked");
  const points = calculatePoints(rating);
  game.lastPoints = points;
  setTimeout(() => {
    $("meterBox").hidden = false;
    animateBar($("meterBar"), points);
    animateNumber($("meterNum"), 0, points, 1000, "", "%");
    setTimeout(() => finishRating(rating, points), reducedMotion ? 300 : 1600);
  }, reducedMotion ? 0 : 500);
}

function finishRating(rating, points) {
  const before = game.mode === "battle" ? game.score : game.luckyScore;
  // combo
  let comboText = "";
  const hadCombo = game.combo > 0;
  if (rating >= 4) {
    game.combo++;
    flashCombo("bump");
    if (game.combo % 3 === 0) launchConfetti(14);
    comboText = "🔥 " + game.combo + " JOKE COMBO" + (game.combo > 1 ? " - You're on fire!" : " - Keep it going!");
  } else {
    game.combo = 0;
    if (hadCombo) { flashCombo("broke"); comboText = "Combo broken. Start a new one!"; }
  }
  if (game.combo > game.bestCombo) game.bestCombo = game.combo;
  // scores
  if (game.mode === "battle") {
    game.score += points; game.rated++; game.ratingSum += rating;
  } else {
    game.luckyScore += points;
  }
  updateStats(rating, points);
  updateDaily(points);
  renderResult(points, before, comboText);
}

/* ---------- 6. SCORE CALCULATIONS ---------- */
function calculatePoints(rating) {
  const jitter = Math.floor(Math.random() * 17) - 8; // -8 to +8
  return Math.max(1, Math.min(100, RATING_POINTS[rating] + jitter));
}

function getMessage(points) {
  if (points <= 20) return "Yeah... let's pretend that never happened.";
  if (points <= 40) return "Technically, that was a joke.";
  if (points <= 60) return "Not terrible.";
  if (points <= 80) return "Okay, that was decent.";
  if (points <= 95) return "Now we're talking.";
  return "ABSOLUTE COMEDY.";
}

function getDailyTarget(dateKey) {
  let hash = 0;
  for (const ch of dateKey) hash = (hash * 31 + ch.charCodeAt(0)) % 100000;
  return 150 + (hash % 8) * 50; // 150 - 500, same date = same target
}

function pad(n) { return String(n).padStart(2, "0"); }

/* ---------- 7. LOCAL STORAGE ---------- */
function readJSON(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? { ...fallback, ...JSON.parse(raw) } : fallback; }
  catch (e) { return fallback; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage may be blocked */ }
}
function loadStats() {
  stats = readJSON("jokeBattleStats", stats);
  daily = readJSON("jokeBattleDaily", daily);
  const today = todayKey();
  if (daily.date !== today) daily = { date: today, target: getDailyTarget(today), progress: 0, done: false };
  saveStats();
  applyTheme(readTheme());
}
function saveStats() { writeJSON("jokeBattleStats", stats); writeJSON("jokeBattleDaily", daily); }
function updateStats(rating, points) {
  stats.totalRated++; stats.ratingSum += rating;
  stats.currentStreak = game.combo;
  if (game.combo > stats.bestCombo) stats.bestCombo = game.combo;
  saveStats();
}
function updateDaily(points) {
  if (daily.date !== todayKey()) { const t = todayKey(); daily = { date: t, target: getDailyTarget(t), progress: 0, done: false }; }
  daily.progress += points;
  if (!daily.done && daily.progress >= daily.target) { daily.done = true; stats.challengesCompleted++; }
  saveStats();
}
function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
function readTheme() { try { return localStorage.getItem("jokeBattleTheme") || "dark"; } catch (e) { return "dark"; } }

/* ---------- 8. UI RENDERING ---------- */
function showScreen(id) {
  screens.forEach((s) => (s.hidden = s.id !== id));
  document.body.dataset.mode = ["home", "stats"].includes(id) ? "battle" : game.mode;
  hud.hidden = !(game.mode === "battle" && ["loading", "joke", "result"].includes(id));
  window.scrollTo(0, 0);
}

function setBusy(isBusy) {
  [startBtn, luckyBtn, retryBtn].forEach((b) => (b.disabled = isBusy));
}

function updateHud() {
  const percent = Math.min(100, Math.round((game.score / game.target) * 100));
  $("hudBattle").textContent = "#" + pad(game.battleNumber);
  $("hudTarget").textContent = game.target;
  $("hudCombo").textContent = "🔥 " + game.combo;
  const shown = Number($("hudScoreNum").dataset.v || 0);
  animateNumber($("hudScoreNum"), shown, game.score, 900, "", "");
  $("hudScoreNum").dataset.v = game.score;
  $("hudBar").style.width = percent + "%";
  $("hudBarWrap").setAttribute("aria-valuenow", percent);
  hud.classList.toggle("close", percent >= 80 && percent < 100); // almost there glow
}

// Restart a small CSS animation on the combo box ("bump" or "broke")
function flashCombo(className) {
  const cell = $("hudComboCell");
  cell.classList.remove("bump", "broke"); void cell.offsetWidth; cell.classList.add(className);
}

function showJoke() {
  $("jokeRound").textContent = game.mode === "battle" ? "ROUND " + pad(game.round) : "LUCKY JOKE";
  $("jokeSetup").textContent = game.joke.setup;      // textContent = safe
  $("jokePunch").textContent = game.joke.punchline || "";
  $("jokePunch").hidden = true;
  document.querySelector(".joke-card").classList.remove("revealed");
  $("meterBox").hidden = true;
  $("meterBar").style.width = "0%";
  choiceButtons.forEach((b) => { b.disabled = false; b.classList.remove("picked"); });
  updateHud();
  if (game.joke.punchline) {
    revealBtn.hidden = false; $("rateBox").hidden = true;
    showScreen("joke"); revealBtn.focus();
  } else {
    revealBtn.hidden = true; $("rateBox").hidden = false;
    showScreen("joke");
  }
}

function revealPunchline() {
  $("jokePunch").hidden = false;
  document.querySelector(".joke-card").classList.add("revealed");
  revealBtn.hidden = true;
  $("rateBox").hidden = false;
  $("rateTitle").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
}

function renderResult(points, before, comboText) {
  const inBattle = game.mode === "battle";
  const total = inBattle ? game.score : game.luckyScore;
  $("resMsg").textContent = getMessage(points);
  animateNumber($("resPoints"), 0, points, 900, "+", "");
  animateNumber($("resTotal"), before, total, 900, "", "");
  $("resTotalLabel").textContent = inBattle ? "Your current score" : "Lucky score";
  $("resBest").textContent = Math.max(stats.bestScore, inBattle ? total : 0);
  $("resCombo").hidden = comboText === "";
  $("resCombo").textContent = comboText;
  if (inBattle) { updateHud(); nextBtn.textContent = game.score >= game.target ? "🏆 See results" : "Continue"; }
  else nextBtn.textContent = "🎲 TRY ANOTHER";
  showScreen("result");
  nextBtn.focus();
  if (points >= 96) launchConfetti(25);
}

function handleNext() {
  if (game.mode === "battle" && game.score >= game.target) showWon();
  else loadRound();
}

function showWon() {
  const previousBest = stats.bestScore;
  const isNewBest = game.score > previousBest && previousBest > 0;
  if (game.score > stats.bestScore) stats.bestScore = game.score;
  saveStats();
  animateNumber($("wScore"), 0, game.score, 1200, "", "");
  $("won").classList.toggle("pb-win", isNewBest);
  $("wRated").textContent = game.rated;
  $("wAvg").textContent = (game.ratingSum / game.rated).toFixed(1) + " / 5";
  $("wCombo").textContent = game.bestCombo;
  $("pbBanner").hidden = !isNewBest;
  hud.hidden = true;
  showScreen("won");
  launchConfetti(isNewBest ? 70 : 30);
}

function renderHome() {
  $("hBest").textContent = stats.bestScore;
  $("hRated").textContent = stats.totalRated;
  $("hStreak").textContent = stats.currentStreak;
  $("dailyText").textContent = "Can you reach " + daily.target + " Laugh Points today?";
  const shown = Math.min(daily.progress, daily.target);
  const percent = Math.round((shown / daily.target) * 100);
  $("dailyProg").textContent = shown + " / " + daily.target;
  $("dailyBar").style.width = percent + "%";
  $("dailyBarWrap").setAttribute("aria-valuenow", percent);
  $("dailyDone").hidden = !daily.done;
}

function renderStats() {
  $("sRated").textContent = stats.totalRated;
  $("sBest").textContent = stats.bestScore;
  $("sAvg").textContent = stats.totalRated ? (stats.ratingSum / stats.totalRated).toFixed(1) + " / 5" : "-";
  $("sCombo").textContent = stats.bestCombo;
  $("sChall").textContent = stats.challengesCompleted;
}

function animateBar(bar, percent) { requestAnimationFrame(() => (bar.style.width = percent + "%")); }

// Count a number up from -> to
function animateNumber(el, from, to, duration, prefix, suffix) {
  if (reducedMotion) { el.textContent = prefix + to + suffix; return; }
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = prefix + Math.round(from + (to - from) * t) + suffix;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function launchConfetti(count) {
  if (reducedMotion) return;
  const box = $("confetti");
  const colors = ["#ffb020", "#3ee0c1", "#ffd66b", "#ff6b5a"];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("i");
    piece.className = "piece";
    piece.style.left = Math.random() * 100 + "%";
    piece.style.background = colors[i % colors.length];
    piece.style.animationDuration = 2 + Math.random() * 2 + "s";
    piece.style.animationDelay = Math.random() * 0.6 + "s";
    box.appendChild(piece);
    setTimeout(() => piece.remove(), 5000);
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  $("themeBtn").textContent = theme === "dark" ? "🌙" : "☀️";
  $("themeBtn").setAttribute("aria-label", "Switch to " + (theme === "dark" ? "light" : "dark") + " theme");
}

/* ---------- 9. EVENT LISTENERS ---------- */
startBtn.addEventListener("click", startBattle);
luckyBtn.addEventListener("click", startLucky);
retryBtn.addEventListener("click", loadRound);
revealBtn.addEventListener("click", revealPunchline);
nextBtn.addEventListener("click", handleNext);
rematchBtn.addEventListener("click", startBattle);
choiceButtons.forEach((b) => b.addEventListener("click", () => handleRating(Number(b.dataset.rating))));
document.querySelectorAll("[data-go]").forEach((b) =>
  b.addEventListener("click", () => {
    if (b.dataset.go === "stats") { game.token++; renderStats(); showScreen("stats"); }
    else goHome();
  })
);
$("themeBtn").addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("jokeBattleTheme", next); } catch (e) { /* ignore */ }
});

/* ---------- 10. INITIALIZATION ---------- */
loadStats();
renderHome();
showScreen("home");
