'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const hudLevel = document.getElementById('hud-level');
const hudAttempts = document.getElementById('hud-attempts');
const hint = document.getElementById('hint');
const menuEl = document.getElementById('menu');
const winEl = document.getElementById('win');
const levelGrid = document.getElementById('level-grid');
const winTitle = document.getElementById('win-title');
const winStars = document.getElementById('win-stars');
const winStats = document.getElementById('win-stats');
const btnNext = document.getElementById('btn-next');
const btnReplay = document.getElementById('btn-replay');
const btnMenu = document.getElementById('btn-menu');
const btnPlay = document.getElementById('btn-play');
const btnMute = document.getElementById('btn-mute');

let audioCtx = null;
let muted = false;
function ac() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function tone(freq, dur, type, vol, slideTo) {
  if (muted) return;
  try {
    const a = ac();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.12, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(g);
    g.connect(a.destination);
    o.start();
    o.stop(a.currentTime + dur);
  } catch (e) {}
}
function noiseBurst(dur, vol) {
  if (muted) return;
  try {
    const a = ac();
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource();
    src.buffer = buf;
    const g = a.createGain();
    g.gain.setValueAtTime(vol || 0.2, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    src.connect(g);
    g.connect(a.destination);
    src.start();
  } catch (e) {}
}
function winSound() {
  tone(440, 0.12, 'triangle', 0.14);
  setTimeout(() => tone(554, 0.12, 'triangle', 0.14), 110);
  setTimeout(() => tone(659, 0.12, 'triangle', 0.14), 220);
  setTimeout(() => tone(880, 0.35, 'triangle', 0.16), 330);
}

const stars = [];
for (let i = 0; i < 150; i++) {
  stars.push({
    x: Math.random() * W,
    y: Math.random() * H,
    r: 0.4 + Math.random() * 1.4,
    ph: Math.random() * Math.PI * 2,
    sp: 0.5 + Math.random() * 1.5,
  });
}
const nebulas = [];
for (let i = 0; i < 4; i++) {
  nebulas.push({
    x: Math.random() * W,
    y: Math.random() * H,
    r: 180 + Math.random() * 220,
    hue: 200 + Math.floor(Math.random() * 140),
  });
}

const game = {
  state: 'menu',
  levelIdx: 0,
  level: null,
  attempts: 0,
  t: 0,
  probe: { x: 0, y: 0, vx: 0, vy: 0 },
  trail: [],
  particles: [],
  shake: 0,
  aim: null,
  prediction: [],
  predictionHit: null,
  deadTimer: 0,
  deadReason: '',
  won: false,
};

function loadProgress() {
  try {
    const raw = localStorage.getItem('gravitydrift_progress');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { unlocked: 1, stars: {} };
}
function saveProgress() {
  try {
    localStorage.setItem('gravitydrift_progress', JSON.stringify(progress));
  } catch (e) {}
}
let progress = loadProgress();

function starCount(attempts, par) {
  if (attempts <= par) return 3;
  if (attempts <= par + 2) return 2;
  return 1;
}
function starString(n) {
  return '★★★'.slice(0, n) + '☆☆☆'.slice(0, 3 - n);
}

function startLevel(i) {
  game.levelIdx = i;
  game.level = LEVELS[i];
  game.attempts = 0;
  game.t = 0;
  game.trail = [];
  game.particles = [];
  game.prediction = [];
  game.predictionHit = null;
  game.aim = null;
  game.won = false;
  resetProbe();
  menuEl.classList.add('hidden');
  winEl.classList.add('hidden');
  updateHud();
  game.state = 'ready';
}

function resetProbe() {
  game.probe.x = game.level.start.x;
  game.probe.y = game.level.start.y;
  game.probe.vx = 0;
  game.probe.vy = 0;
  game.trail = [];
  game.prediction = [];
  game.predictionHit = null;
}

function updateHud() {
  if (!game.level) return;
  hudLevel.textContent = `Level ${game.levelIdx + 1} — ${game.level.name}`;
  hudAttempts.textContent = `Attempts ${game.attempts} · Par ${game.level.par} · Best ${starString(progress.stars[game.levelIdx] || 0)}`;
}

function showMenu() {
  game.state = 'menu';
  buildLevelGrid();
  menuEl.classList.remove('hidden');
  winEl.classList.add('hidden');
}

function buildLevelGrid() {
  levelGrid.innerHTML = '';
  for (let i = 0; i < LEVELS.length; i++) {
    const b = document.createElement('button');
    b.className = 'level-btn' + (i < progress.unlocked ? '' : ' locked');
    b.textContent = i < progress.unlocked ? (i + 1) + ' ' + starString(progress.stars[i] || 0) : '🔒';
    b.disabled = i >= progress.unlocked;
    b.addEventListener('click', () => startLevel(i));
    levelGrid.appendChild(b);
  }
  btnPlay.textContent = progress.unlocked > 1
    ? `Continue — Level ${Math.min(progress.unlocked, LEVELS.length)}`
    : 'Play';
}

function showWin() {
  const s = starCount(game.attempts, game.level.par);
  if (s > (progress.stars[game.levelIdx] || 0)) progress.stars[game.levelIdx] = s;
  progress.unlocked = Math.max(progress.unlocked, Math.min(game.levelIdx + 2, LEVELS.length));
  saveProgress();
  winTitle.textContent = game.levelIdx === LEVELS.length - 1 ? 'All Levels Clear!' : 'Wormhole Reached!';
  winStars.textContent = starString(s);
  winStats.textContent = `Attempts: ${game.attempts} · Par: ${game.level.par}`;
  btnNext.textContent = game.levelIdx === LEVELS.length - 1 ? 'Play Again' : 'Next Level →';
  winEl.classList.remove('hidden');
}

function launch() {
  game.attempts++;
  game.state = 'flying';
  game.trail = [];
  updateHud();
  tone(200, 0.3, 'sawtooth', 0.08, 90);
  for (let i = 0; i < 10; i++) {
    const a = Math.atan2(-game.probe.vy, -game.probe.vx) + (Math.random() - 0.5) * 1.2;
    const sp = 40 + Math.random() * 80;
    game.particles.push({
      x: game.probe.x, y: game.probe.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.5, max: 0.5, hue: 30,
    });
  }
}

function crash(reason) {
  game.state = 'dead';
  game.deadTimer = 0.9;
  game.deadReason = reason;
  game.shake = 12;
  noiseBurst(0.35, 0.22);
  tone(120, 0.4, 'square', 0.1, 40);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 30 + Math.random() * 160;
    game.particles.push({
      x: game.probe.x, y: game.probe.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.4 + Math.random() * 0.5, max: 0.9, hue: 20 + Math.random() * 25,
    });
  }
}

function winLevel() {
  game.state = 'won';
  game.won = true;
  winSound();
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 200;
    game.particles.push({
      x: game.level.goal.x, y: game.level.goal.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.5 + Math.random() * 0.6, max: 1.1, hue: 170 + Math.random() * 60,
    });
  }
  setTimeout(showWin, 700);
}

function canvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * W,
    y: ((e.clientY - rect.top) / rect.height) * H,
  };
}

canvas.addEventListener('pointerdown', (e) => {
  if (game.state !== 'ready') return;
  try { ac().resume(); } catch (err) {}
  const p = canvasPos(e);
  game.aim = { sx: game.probe.x, sy: game.probe.y, cx: p.x, cy: p.y };
  game.state = 'aiming';
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (game.state !== 'aiming' || !game.aim) return;
  const p = canvasPos(e);
  game.aim.cx = p.x;
  game.aim.cy = p.y;
  updatePrediction();
});

canvas.addEventListener('pointerup', () => {
  if (game.state !== 'aiming' || !game.aim) return;
  const v = aimVelocity();
  game.aim = null;
  if (Math.hypot(v.vx, v.vy) > 50) {
    game.probe.vx = v.vx;
    game.probe.vy = v.vy;
    launch();
  } else {
    game.state = 'ready';
    game.prediction = [];
    game.predictionHit = null;
  }
});

function aimVelocity() {
  const dx = game.aim.sx - game.aim.cx;
  const dy = game.aim.sy - game.aim.cy;
  const len = Math.hypot(dx, dy);
  const power = Math.min(len * 2.4, MAX_SPEED);
  if (len < 1) return { vx: 0, vy: 0 };
  return { vx: (dx / len) * power, vy: (dy / len) * power };
}

function updatePrediction() {
  const v = aimVelocity();
  const s = { x: game.probe.x, y: game.probe.y, vx: v.vx, vy: v.vy };
  const pts = [];
  game.predictionHit = null;
  let t = game.t;
  for (let i = 0; i < 360; i++) {
    stepSim(s, t, game.level.bodies, DT);
    t += DT;
    if (i % 3 === 0) pts.push({ x: s.x, y: s.y });
    const hit = collisionAt(s.x, s.y, t, game.level.bodies);
    if (hit !== -1) {
      game.predictionHit = { x: s.x, y: s.y };
      break;
    }
    if (outOfBounds(s.x, s.y)) break;
    if (reachedGoal(s.x, s.y, game.level.goal)) break;
  }
  game.prediction = pts;
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    if (game.state === 'flying' || game.state === 'ready' || game.state === 'aiming') {
      game.aim = null;
      resetProbe();
      game.state = 'ready';
    }
  } else if (e.key === 'm' || e.key === 'M') {
    toggleMute();
  } else if (e.key === 'Escape') {
    showMenu();
  } else if ((e.key === 'n' || e.key === 'N') && game.state === 'won' && !winEl.classList.contains('hidden')) {
    btnNext.click();
  }
});

function toggleMute() {
  muted = !muted;
  btnMute.textContent = muted ? '🔇' : '🔊';
}

btnMute.addEventListener('click', toggleMute);
btnPlay.addEventListener('click', () => startLevel(Math.min(progress.unlocked - 1, LEVELS.length - 1)));
btnNext.addEventListener('click', () => {
  const next = game.levelIdx === LEVELS.length - 1 ? 0 : game.levelIdx + 1;
  startLevel(next);
});
btnReplay.addEventListener('click', () => startLevel(game.levelIdx));
btnMenu.addEventListener('click', showMenu);

function update(dt) {
  game.t += dt;
  game.shake *= Math.pow(0.02, dt);

  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.life -= dt;
    if (p.life <= 0) game.particles.splice(i, 1);
  }

  if (game.state === 'flying') {
    const sub = 2;
    const h = dt / sub;
    for (let k = 0; k < sub; k++) {
      stepSim(game.probe, game.t, game.level.bodies, h);
      game.t += h;
      const hit = collisionAt(game.probe.x, game.probe.y, game.t, game.level.bodies);
      if (hit !== -1) {
        crash('Probe destroyed');
        break;
      }
      if (reachedGoal(game.probe.x, game.probe.y, game.level.goal)) {
        winLevel();
        break;
      }
      if (outOfBounds(game.probe.x, game.probe.y)) {
        crash('Lost in space');
        break;
      }
    }
    game.trail.push({ x: game.probe.x, y: game.probe.y });
    if (game.trail.length > 150) game.trail.shift();
  } else if (game.state === 'dead') {
    game.deadTimer -= dt;
    if (game.deadTimer <= 0) {
      resetProbe();
      game.state = 'ready';
    }
  }

  if (game.state === 'ready') {
    hint.textContent = 'Drag from anywhere and release to launch · R to reset · M to mute';
  } else if (game.state === 'aiming') {
    hint.textContent = 'Release to launch — the dotted line is your predicted path';
  } else if (game.state === 'flying') {
    hint.textContent = 'R to abort and retry';
  } else if (game.state === 'dead') {
    hint.textContent = game.deadReason;
  } else {
    hint.textContent = '';
  }
}

function render() {
  ctx.save();
  if (game.shake > 0.3) {
    ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
  }

  ctx.fillStyle = '#05060f';
  ctx.fillRect(-20, -20, W + 40, H + 40);

  for (const n of nebulas) {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, `hsla(${n.hue}, 70%, 40%, 0.06)`);
    g.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
  }

  for (const s of stars) {
    const tw = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(game.t * s.sp + s.ph));
    ctx.fillStyle = `rgba(220, 228, 255, ${tw})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (game.state !== 'menu' && game.level) {
    for (const b of game.level.bodies) drawBody(b);
    drawWormhole();
    drawTrail();
    if (game.state === 'aiming') drawAim();
    if (!game.won) drawProbe();
  }

  for (const p of game.particles) {
    ctx.fillStyle = `hsla(${p.hue}, 95%, 60%, ${p.life / p.max})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawBody(b) {
  const p = bodyPos(b, game.t, game.level.bodies);
  if (b.kind === 'repulsor') {
    const pulse = 1 + 0.12 * Math.sin(game.t * 5);
    ctx.save();
    ctx.shadowBlur = 25;
    ctx.shadowColor = 'hsl(0, 90%, 55%)';
    ctx.fillStyle = 'hsl(0, 80%, 30%)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, b.r * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    for (let k = 0; k < 3; k++) {
      const frac = ((game.t * 0.6 + k / 3) % 1);
      ctx.strokeStyle = `hsla(0, 90%, 60%, ${0.5 * (1 - frac)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, b.r + frac * 70, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'hsl(0, 95%, 70%)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, b.r * 0.4 * pulse, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.save();
  ctx.shadowBlur = 30;
  ctx.shadowColor = `hsl(${b.hue}, 80%, 55%)`;
  const g = ctx.createRadialGradient(p.x - b.r * 0.35, p.y - b.r * 0.35, b.r * 0.1, p.x, p.y, b.r);
  g.addColorStop(0, `hsl(${b.hue}, 75%, 68%)`);
  g.addColorStop(0.7, `hsl(${b.hue}, 65%, 42%)`);
  g.addColorStop(1, `hsl(${b.hue}, 70%, 18%)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, b.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWormhole() {
  const g = game.level.goal;
  const pulse = 1 + 0.08 * Math.sin(game.t * 3);
  ctx.save();
  ctx.shadowBlur = 30;
  ctx.shadowColor = 'hsl(185, 95%, 60%)';
  for (let k = 0; k < 5; k++) {
    const rot = game.t * (k % 2 === 0 ? 1.6 : -1.6) + (k * Math.PI) / 5;
    ctx.strokeStyle = `hsla(${180 + k * 18}, 95%, ${60 + k * 5}%, ${0.85 - k * 0.13})`;
    ctx.lineWidth = 3 - k * 0.4;
    ctx.beginPath();
    ctx.arc(g.x, g.y, (GOAL_R - k * 3.4) * pulse, rot, rot + Math.PI * 1.25);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(10, 20, 30, 0.9)';
  ctx.beginPath();
  ctx.arc(g.x, g.y, GOAL_R * 0.55 * pulse, 0, Math.PI * 2);
  ctx.fill();
}

function drawTrail() {
  const n = game.trail.length;
  for (let i = 1; i < n; i++) {
    ctx.strokeStyle = `hsla(190, 90%, 70%, ${(i / n) * 0.55})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(game.trail[i - 1].x, game.trail[i - 1].y);
    ctx.lineTo(game.trail[i].x, game.trail[i].y);
    ctx.stroke();
  }
}

function drawPrediction() {
  const n = game.prediction.length;
  for (let i = 0; i < n; i++) {
    const p = game.prediction[i];
    ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * (1 - i / n)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  if (game.predictionHit) {
    ctx.strokeStyle = 'rgba(255, 90, 60, 0.9)';
    ctx.lineWidth = 2;
    const h = game.predictionHit;
    ctx.beginPath();
    ctx.moveTo(h.x - 6, h.y - 6);
    ctx.lineTo(h.x + 6, h.y + 6);
    ctx.moveTo(h.x + 6, h.y - 6);
    ctx.lineTo(h.x - 6, h.y + 6);
    ctx.stroke();
  }
}

function drawAim() {
  drawPrediction();
  const v = aimVelocity();
  const ex = game.probe.x + v.vx * 0.22;
  const ey = game.probe.y + v.vy * 0.22;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(game.probe.x, game.probe.y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  const a = Math.atan2(v.vy, v.vx);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.moveTo(ex + Math.cos(a) * 12, ey + Math.sin(a) * 12);
  ctx.lineTo(ex + Math.cos(a + 2.5) * 9, ey + Math.sin(a + 2.5) * 9);
  ctx.lineTo(ex + Math.cos(a - 2.5) * 9, ey + Math.sin(a - 2.5) * 9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.beginPath();
  ctx.moveTo(game.aim.sx, game.aim.sy);
  ctx.lineTo(game.aim.cx, game.aim.cy);
  ctx.setLineDash([4, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawProbe() {
  const p = game.probe;
  const ready = game.state === 'ready';
  if (ready) {
    const pr = 14 + 4 * Math.sin(game.t * 4);
    ctx.strokeStyle = 'rgba(120, 220, 255, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.save();
  ctx.shadowBlur = 14;
  ctx.shadowColor = 'hsl(190, 95%, 70%)';
  ctx.fillStyle = '#e8fbff';
  ctx.beginPath();
  ctx.arc(p.x, p.y, PROBE_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (game.state !== 'menu') update(dt);
  else game.t += dt;
  render();
  requestAnimationFrame(frame);
}

buildLevelGrid();
updateHud();
requestAnimationFrame(frame);
