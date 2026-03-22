/* ================================================================
   game.js  —  Brain Blast! v2
   Core game logic: state, puzzle flow, scoring, timer, UI.

   Depends on (load before this file):
     puzzles.js  →  PUZZLES, CATS, CAT_BG
     monkey.js   →  setMonkey(), showSpeech(), monkeyState()
     effects.js  →  spawnConfetti(), spawnXPBurst(),
                    playCorrectSound(), playWrongSound()
================================================================ */

/* ── CONFIGURATION ─────────────────────────────────────────── */
const CONFIG = {
  baseXP:           10,   // XP for a correct answer
  streakBonusXP:     2,   // extra XP per streak length
  speedBonusDivisor: 20,  // timeLeft ÷ this = speed bonus XP

  mediumThreshold:  20,   // total correct to unlock Medium
  hardThreshold:    45,   // total correct to unlock Hard

  timerSteps:      100,   // countdown 100 → 0
  timerStepMs:     200,   // ms per step  (100×200 = 20 s total)
  eatTrigger:       40,   // steps before monkey eats banana
  dizzyTrigger:     70,   // steps before monkey goes dizzy

  nextPuzzleDelay: 2000,  // ms after answer → next puzzle
  timeoutDelay:    2200,  // ms after timeout → next puzzle

  storageKey: "bb_v2",
};

/* ── ALL 15 CATEGORY TYPES ─────────────────────────────────── */
const PUZZLE_TYPES = [
  "math","logic","pattern","story","visual",
  "memory","speed","comparison","sequence","word",
  "animals","colors","shapes","trick","emotional"
];

/* ── GAME STATE ─────────────────────────────────────────────── */
let xp = 0, streak = 0, playerName = "";
let current = null, timeLeft = CONFIG.timerSteps, timerInterval = null;

// Per-category stats
let stats = {};
PUZZLE_TYPES.forEach(t => { stats[t] = { c:0, w:0 }; });

// Anti-repeat pool tracking
let usedIdx = {};
PUZZLE_TYPES.forEach(t => { usedIdx[t] = { easy:[], medium:[], hard:[] }; });

// Load saved stats
try {
  const saved = localStorage.getItem(CONFIG.storageKey);
  if (saved) {
    const parsed = JSON.parse(saved);
    // merge safely — keep new categories if save is old
    PUZZLE_TYPES.forEach(t => { if (parsed[t]) stats[t] = parsed[t]; });
  }
} catch(e) {}

/* ── LEVEL SYSTEM ───────────────────────────────────────────── */
function totalCorrect() {
  return Object.values(stats).reduce((s,v) => s + v.c, 0);
}

function getLevel() {
  const c = totalCorrect();
  if (c >= CONFIG.hardThreshold)   return { lbl:"🏆 Champion", diff:"hard"   };
  if (c >= CONFIG.mediumThreshold) return { lbl:"🚀 Explorer",  diff:"medium" };
  return                                   { lbl:"⭐ Starter",   diff:"easy"   };
}

/* ── PUZZLE SELECTION (no-repeat pool) ─────────────────────── */
function pickPuzzle(type) {
  const diff = getLevel().diff;
  const pool = PUZZLES[type][diff];
  const used = usedIdx[type][diff];

  let available = pool.map((_,i) => i).filter(i => !used.includes(i));
  if (!available.length) {
    usedIdx[type][diff] = [];
    available = pool.map((_,i) => i);
  }
  const idx = available[Math.floor(Math.random() * available.length)];
  usedIdx[type][diff].push(idx);
  return { ...pool[idx], concept: type };
}

function randomType() {
  return PUZZLE_TYPES[Math.floor(Math.random() * PUZZLE_TYPES.length)];
}

/* ── TIMER ──────────────────────────────────────────────────── */
function startTimer() {
  clearInterval(timerInterval);
  timeLeft = CONFIG.timerSteps;
  renderTimerBar();
  let elapsed = 0;

  timerInterval = setInterval(() => {
    elapsed++;
    timeLeft = Math.max(0, CONFIG.timerSteps - elapsed);
    renderTimerBar();

    if (elapsed === CONFIG.eatTrigger && monkeyState() === "idle") {
      setMonkey("eating");
      showSpeech("Snack time! 🍌", "#905010", 3000);
    }
    if (elapsed === CONFIG.dizzyTrigger && monkeyState() === "eating") {
      setMonkey("dizzy");
      showSpeech("Take your time! 😵", "#602090", 3000);
    }
    if (timeLeft === 0) { clearInterval(timerInterval); onTimeout(); }
  }, CONFIG.timerStepMs);
}

function renderTimerBar() {
  const b = document.getElementById("timer-bar");
  if (b) b.style.width = timeLeft + "%";
}

function onTimeout() {
  document.querySelectorAll(".opt").forEach(b => {
    b.disabled = true;
    if (b.textContent.trim() === current.a) b.classList.add("correct");
  });
  document.getElementById("feedback").innerHTML =
    `<span style="color:#c02000">⏰ Time's up! Answer: <b>${current.a}</b></span>`;
  document.getElementById("announcer").textContent =
    "Time's up! The answer was " + current.a;

  streak = 0;
  stats[current.concept].w++;
  setMonkey("sad", 1800);
  showSpeech("Oops! Next one! 💪", "#c02000", 2000);
  saveStats(); updateUI();
  setTimeout(showPuzzle, CONFIG.timeoutDelay);
}

/* ── PUZZLE RENDER ──────────────────────────────────────────── */
function showPuzzle() {
  clearInterval(timerInterval);
  const type = randomType();
  current = pickPuzzle(type);
  const cat = CATS[type];

  // Background theme shift per category
  document.body.style.background = CAT_BG[type];
  document.getElementById("lvl-txt").textContent = getLevel().lbl;
  setMonkey("idle");

  const opts = [...current.o].sort(() => Math.random() - 0.5);
  // Use 2-column grid for 4 options, 3-col for 3
  const gridClass = opts.length > 3 ? "" : "c3";

  document.getElementById("game").innerHTML = `
    <div class="cat-badge"
         style="color:${cat.color};background:${cat.bg};border-color:${cat.color}55">
      ${cat.icon} ${cat.label}
    </div>
    <div class="puzzle-card ${type}">
      <div class="puzzle-q">${current.q}</div>
      <div class="opts ${gridClass}">
        ${opts.map(o =>
          `<button class="opt"
                   onclick="checkAnswer(this,'${o.replace(/'/g,"\\'")}','${type}')">
             ${o}
           </button>`
        ).join("")}
      </div>
      <div id="feedback"></div>
    </div>`;

  startTimer();
}

/* ── ANSWER CHECKING ────────────────────────────────────────── */
function checkAnswer(btn, ans, type) {
  clearInterval(timerInterval);
  const correct = ans === current.a;
  document.querySelectorAll(".opt").forEach(b => (b.disabled = true));
  const fb  = document.getElementById("feedback");
  const ann = document.getElementById("announcer");

  if (correct) {
    btn.classList.add("correct");
    const speedBonus = Math.floor(timeLeft / CONFIG.speedBonusDivisor);
    const gained     = CONFIG.baseXP + streak * CONFIG.streakBonusXP + speedBonus;
    xp += gained; streak++; stats[type].c++;

    const msgs = ["🎉 Amazing!","⭐ Brilliant!","🚀 Superstar!","🏆 Perfect!","💥 Incredible!","🌈 Awesome!"];
    const msg  = msgs[Math.floor(Math.random() * msgs.length)];
    fb.innerHTML  = `<span style="color:#1a7030;font-weight:800">${msg} +${gained} XP</span>`;
    ann.textContent = "Correct! " + msg;

    setMonkey("happy", 1700);
    // ── Gemini-style single-call reaction ──
    triggerMonkeyReaction(true, 1700);
    spawnConfetti(btn);
    spawnXPBurst(btn, `+${gained} XP`);
    popChip("xp-chip"); popChip("str-chip");
    playCorrectSound();
  } else {
    btn.classList.add("wrong");
    document.querySelectorAll(".opt").forEach(b => {
      if (b.textContent.trim() === current.a) b.classList.add("correct");
    });
    streak = 0; stats[type].w++;

    const sadMsgs = ["Almost! 💪","Not quite! 🤔","Keep going! 🌈","You got this! 😄"];
    const sad = sadMsgs[Math.floor(Math.random() * sadMsgs.length)];
    fb.innerHTML  = `<span style="color:#c02000;font-weight:800">${sad} Answer: <b>${current.a}</b></span>`;
    ann.textContent = "Not quite. The answer was " + current.a;

    // ── Gemini-style single-call reaction ──
    triggerMonkeyReaction(false, 1800);
    playWrongSound();
  }

  saveStats(); updateUI();
  setTimeout(showPuzzle, CONFIG.nextPuzzleDelay);
}

/* ── UI UPDATES ─────────────────────────────────────────────── */
function updateUI() {
  document.getElementById("xp-val").textContent  = xp;
  document.getElementById("str-val").textContent = streak;
  document.getElementById("lvl-txt").textContent  = getLevel().lbl;
  renderReport();
}

function renderReport() {
  // Progress bar gradient per category
  const barG = {
    math:"linear-gradient(90deg,#FFD93D,#ff9f43)",
    logic:"linear-gradient(90deg,#b97dff,#5b7fff)",
    pattern:"linear-gradient(90deg,#4da6ff,#00c6ff)",
    story:"linear-gradient(90deg,#5ecb6e,#78d6f7)",
    visual:"linear-gradient(90deg,#ff9966,#ff5e62)",
    memory:"linear-gradient(90deg,#cc66ff,#8844cc)",
    speed:"linear-gradient(90deg,#FFD93D,#ff6b6b)",
    comparison:"linear-gradient(90deg,#00ccaa,#0088cc)",
    sequence:"linear-gradient(90deg,#66cc44,#44aa22)",
    word:"linear-gradient(90deg,#2ecc8a,#00e5aa)",
    animals:"linear-gradient(90deg,#ff9966,#cc6600)",
    colors:"linear-gradient(90deg,#ff6699,#cc0044)",
    shapes:"linear-gradient(90deg,#4466ff,#0022cc)",
    trick:"linear-gradient(90deg,#aa44ff,#6600cc)",
    emotional:"linear-gradient(90deg,#FF6B6B,#ff9f43)",
  };

  document.getElementById("report").innerHTML =
    PUZZLE_TYPES.map(key => {
      const cat  = CATS[key];
      const val  = stats[key];
      const done = val.c + val.w;
      const pct  = done ? Math.round((val.c / done) * 100) : 0;
      return `
        <div class="srow">
          <div class="sico">${cat.icon}</div>
          <div class="slbl">${cat.label}</div>
          <div class="sbar-wrap">
            <div class="sbar" style="width:${pct}%;background:${barG[key]}"></div>
          </div>
          <div class="snums">✅${val.c} ❌${val.w}</div>
        </div>`;
    }).join("");
}

function popChip(id) {
  const el = document.getElementById(id);
  el.classList.remove("pop");
  void el.offsetWidth;
  el.classList.add("pop");
}

function saveStats() {
  try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(stats)); }
  catch(e) {}
}

/* ── START GAME ─────────────────────────────────────────────── */
function startGame() {
  const ni = document.getElementById("name-input");
  playerName = ni.value.trim() || "Friend";

  document.getElementById("welcome-screen").style.display = "none";
  document.getElementById("topbar").style.display         = "flex";
  document.getElementById("app").style.display            = "block";
  document.getElementById("pname").textContent            = `Hi, ${playerName}! 👋`;

  renderReport();
  showPuzzle();
  setTimeout(() => showSpeech(`Hi ${playerName}! Let's go! 🚀`, "#1a7030", 2500), 900);
}

document.getElementById("name-input")
  .addEventListener("keydown", e => { if (e.key === "Enter") startGame(); });
