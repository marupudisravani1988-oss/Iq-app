/* ============================================================
   effects.js  –  Brain Blast!
   Visual & audio effects: confetti, XP burst, sounds.

   PUBLIC API (called by game.js)
   ──────────────────────────────
     spawnConfetti(targetElement)  – bursts coloured pieces
     spawnXPBurst(targetElement, text) – floating "+10 XP" label
     playBeep(frequency, volume, duration) – short tone via Web Audio
   ============================================================ */

/* ── Confetti colours ───────────────────────────────────────── */
const CONFETTI_COLOURS = [
  "#FFD93D", "#FF6B6B", "#5ecb6e",
  "#78d6f7", "#b97dff", "#FF9F43", "#ffffff"
];

/**
 * Spawn a burst of confetti pieces around a target element.
 * @param {HTMLElement} target
 */
function spawnConfetti(target) {
  const rect = target.getBoundingClientRect();
  const cx   = rect.left + rect.width  / 2;
  const cy   = rect.top  + rect.height / 2;

  for (let i = 0; i < 18; i++) {
    const el   = document.createElement("div");
    el.className = "confetti-piece";

    const size   = 8 + Math.random() * 10;
    const spread = (Math.random() - 0.5) * 120;
    const round  = Math.random() > 0.5 ? "50%" : "3px";
    const colour = CONFETTI_COLOURS[Math.floor(Math.random() * CONFETTI_COLOURS.length)];
    const dur    = 0.7 + Math.random() * 0.8;
    const delay  = Math.random() * 0.25;

    el.style.cssText = [
      `left:${cx + spread}px`,
      `top:${cy}px`,
      `width:${size}px`,
      `height:${size}px`,
      `background:${colour}`,
      `border-radius:${round}`,
      `animation-duration:${dur}s`,
      `animation-delay:${delay}s`,
    ].join(";");

    document.body.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
  }
}

/**
 * Float a text label (e.g. "+12 XP") up from a target element.
 * @param {HTMLElement} target
 * @param {string}      text
 */
function spawnXPBurst(target, text) {
  const rect = target.getBoundingClientRect();
  const el   = document.createElement("div");
  el.className   = "xp-burst";
  el.textContent = text;
  el.style.left  = `${rect.left + rect.width / 2 - 34}px`;
  el.style.top   = `${rect.top - 12}px`;

  document.body.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
}

/**
 * Play a short sine-wave beep via the Web Audio API.
 * Fails silently if the browser blocks audio.
 * @param {number} freq - Frequency in Hz  (e.g. 880)
 * @param {number} vol  - Volume 0–1       (e.g. 0.15)
 * @param {number} dur  - Duration in sec  (e.g. 0.2)
 */
function playBeep(freq, vol, dur) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = freq;
    osc.type = "sine";

    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);

    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch (e) {
    // Web Audio not available – silent fallback
  }
}

/**
 * Convenience: play the happy 3-note jingle.
 */
function playCorrectSound() {
  playBeep(880,  0.15, 0.18);
  setTimeout(() => playBeep(1100, 0.10, 0.18), 120);
  setTimeout(() => playBeep(1320, 0.10, 0.25), 240);
}

/**
 * Convenience: play the wrong-answer thud.
 */
function playWrongSound() {
  playBeep(220, 0.15, 0.4);
}
