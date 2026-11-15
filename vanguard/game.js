'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const el = id => document.getElementById(id);
const topbar = el('topbar'), unitbar = el('unitbar');
const missionNameEl = el('mission-name'), objectiveEl = el('objective');
const btnUndo = el('btn-undo'), btnEnd = el('btn-end'), btnMute = el('btn-mute'), btnFull = el('btn-full'), btnPause = el('btn-pause');

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
    g.gain.setValueAtTime(vol || 0.1, a.currentTime);
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
    g.gain.setValueAtTime(vol || 0.15, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    src.connect(g);
    g.connect(a.destination);
    src.start();
  } catch (e) {}
}
const SFX = {
  select: () => tone(520, 0.06, 'square', 0.05),
  move: () => tone(300, 0.08, 'triangle', 0.07, 380),
  attack: () => { noiseBurst(0.12, 0.12); tone(160, 0.12, 'square', 0.09, 90); },
  shot: () => tone(700, 0.1, 'sawtooth', 0.07, 200),
  hit: () => tone(140, 0.14, 'square', 0.1, 70),
  die: () => { noiseBurst(0.4, 0.2); tone(90, 0.4, 'sawtooth', 0.12, 40); },
  shield: () => { tone(660, 0.12, 'sine', 0.1); tone(990, 0.18, 'sine', 0.08); },
  repair: () => { tone(440, 0.08, 'sine', 0.08); setTimeout(() => tone(560, 0.1, 'sine', 0.08), 90); },
  telegraph: () => tone(220, 0.09, 'square', 0.05, 180),
  emerge: () => tone(80, 0.3, 'sawtooth', 0.1, 60),
  bump: () => tone(120, 0.1, 'square', 0.1, 60),
  victory: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.13), i * 130)); },
  defeat: () => { [400, 320, 240, 160].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.1), i * 160)); },
  ui: () => tone(600, 0.05, 'sine', 0.05),
};

function loadProgress() {
  try {
    const raw = localStorage.getItem('vanguard_progress');
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.mods) return p;
    }
  } catch (e) {}
  return { unlocked: 1, mods: { vanguard: {}, ranger: {}, warden: {} }, taken: [], done: 0 };
}
function saveProgress() {
  try { localStorage.setItem('vanguard_progress', JSON.stringify(progress)); } catch (e) {}
}
let progress = loadProgress();

const UPGRADES = [
  { id: 'hp_vanguard', name: 'Reinforced Plating', desc: 'Vanguard +1 max HP', apply: m => { m.vanguard.hp = (m.vanguard.hp || 0) + 1; } },
  { id: 'hp_ranger', name: 'Ranger Armor Weave', desc: 'Ranger +1 max HP', apply: m => { m.ranger.hp = (m.ranger.hp || 0) + 1; } },
  { id: 'hp_warden', name: 'Warden Core Housing', desc: 'Warden +1 max HP', apply: m => { m.warden.hp = (m.warden.hp || 0) + 1; } },
  { id: 'move_vanguard', name: 'Overdrive Servos', desc: 'Vanguard +1 movement', apply: m => { m.vanguard.move = (m.vanguard.move || 0) + 1; } },
  { id: 'move_ranger', name: 'Ranger Thrusters', desc: 'Ranger +1 movement', apply: m => { m.ranger.move = (m.ranger.move || 0) + 1; } },
  { id: 'move_warden', name: 'Warden Actuators', desc: 'Warden +1 movement', apply: m => { m.warden.move = (m.warden.move || 0) + 1; } },
  { id: 'range_ranger', name: 'Long Barrel', desc: 'Ranger +1 attack range', apply: m => { m.ranger.range = (m.ranger.range || 0) + 1; } },
  { id: 'shield_repair', name: 'Nano Shield', desc: "Warden's shield also repairs structures +1 HP", unique: true, apply: m => { m.shieldRepair = true; } },
];

const ENEMY_INTEL = {
  grunt: 'Grunt — melee, 1 dmg. Weak alone, deadly in packs.',
  lancer: 'Lancer — melee, 2 dmg. Fast. Do not let it reach structures.',
  archer: 'Archer — ranged, 1 dmg, fires along rows/columns. Break line of sight.',
  brute: 'Brute — melee, 3 dmg. Too heavy to push. Focus it down.',
  bomber: 'Bomber — explodes for 2 dmg on all adjacent tiles, INCLUDING other Vek.',
  hive: 'Hive — spawns Grunts every other turn. Kill it to stop the flow.',
  boss: 'Warlord — 8 HP, 3 dmg, immune to pushes. The mission: kill it.',
};

const app = {
  screen: 'title',
  state: null,
  selected: null,
  undoStack: [],
  animating: false,
  fx: [],
  floats: [],
  shake: 0,
  time: 0,
  hover: null,
  banner: null,
};

let layout = { ts: 60, ox: 0, oy: 0 };
let stars = [];
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const mt = 70, mb = 130, ms = 20;
  const availW = window.innerWidth - ms * 2;
  const availH = window.innerHeight - mt - mb;
  const ts = Math.max(28, Math.floor(Math.min(availW / GRID_W, availH / GRID_H)));
  layout = {
    ts,
    ox: (window.innerWidth - ts * GRID_W) / 2,
    oy: mt + (availH - ts * GRID_H) / 2,
  };
  stars = [];
  for (let i = 0; i < 130; i++) {
    stars.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: 0.4 + Math.random() * 1.3,
      ph: Math.random() * Math.PI * 2,
      sp: 0.4 + Math.random() * 1.2,
    });
  }
}
window.addEventListener('resize', resize);
resize();

function tileCenter(x, y) {
  return {
    x: layout.ox + x * layout.ts + layout.ts / 2,
    y: layout.oy + y * layout.ts + layout.ts / 2,
  };
}
function posToTile(px, py) {
  const x = Math.floor((px - layout.ox) / layout.ts);
  const y = Math.floor((py - layout.oy) / layout.ts);
  if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return null;
  return { x, y };
}

function showScreen(name) {
  app.screen = name;
  for (const s of ['title', 'select', 'brief', 'victory', 'defeat', 'pause', 'complete']) {
    el('screen-' + s).classList.toggle('hidden', s !== name);
  }
  const inBattle = name === 'battle';
  topbar.classList.toggle('hidden', !inBattle);
  unitbar.classList.toggle('hidden', !inBattle);
  if (inBattle) updateHud();
}

function objectiveText(m) {
  if (m.objective.type === 'survive') return `Survive ${m.objective.turns} turns — protect all structures`;
  if (m.objective.type === 'exterminate') return 'Eliminate every Vek';
  return 'Destroy the Warlord';
}

function buildMissionList() {
  const list = el('mission-list');
  list.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const b = document.createElement('button');
    b.className = 'mission-btn';
    b.disabled = i >= progress.unlocked;
    const obj = m.objective.type === 'survive' ? `Survive ${m.objective.turns} turns` : m.objective.type === 'exterminate' ? 'Exterminate' : 'Boss kill';
    b.innerHTML = `<div class="m-num">MISSION ${String(i + 1).padStart(2, '0')}${i < progress.unlocked - 1 ? ' · CLEARED' : ''}</div>
      <div class="m-name">${m.name}</div><div class="m-obj">${obj}</div>`;
    b.addEventListener('click', () => { SFX.ui(); openBrief(i); });
    list.appendChild(b);
  });
}

function openBrief(i) {
  const m = MISSIONS[i];
  el('brief-name').textContent = `Mission ${i + 1} — ${m.name}`;
  el('brief-text').textContent = m.brief;
  el('brief-objective').textContent = objectiveText(m);
  const types = new Set();
  Object.values(m.waves).forEach(w => w.forEach(t => types.add(t)));
  if (m.map.some(r => r.includes('H'))) types.add('hive');
  if (m.map.some(r => r.includes('X'))) types.add('boss');
  el('brief-intel').innerHTML = '<b>Enemy intel:</b><br>' + [...types].map(t => ENEMY_INTEL[t] || t).join('<br>');
  el('btn-deploy').onclick = () => { SFX.ui(); startBattle(i); };
  showScreen('brief');
}

function startBattle(i) {
  app.state = createMission(i, JSON.parse(JSON.stringify(progress.mods)));
  app.selected = null;
  app.undoStack = [];
  app.animating = false;
  app.fx = [];
  app.floats = [];
  app.shake = 0;
  app.banner = { text: 'TURN 1 — YOUR MOVE', t0: app.time };
  showScreen('battle');
  buildUnitCards();
  updateHud();
}

function pushUndo() {
  app.undoStack.push(JSON.stringify(app.state, (k, v) => k === 'mission' ? undefined : v));
  if (app.undoStack.length > 60) app.undoStack.shift();
}
function undo() {
  if (app.animating || !app.undoStack.length) return;
  const snap = app.undoStack.pop();
  app.state = JSON.parse(snap);
  app.state.mission = MISSIONS[app.state.idx];
  app.selected = app.state.units.find(u => app.selected && u.id === app.selected.id) || null;
  SFX.ui();
  buildUnitCards();
  updateHud();
}

function buildUnitCards() {
  unitbar.innerHTML = '';
  for (const type of ['vanguard', 'ranger', 'warden']) {
    const u = app.state.units.find(x => x.type === type);
    const b = BASE[type];
    const card = document.createElement('div');
    card.className = 'unit-card' + (u ? '' : ' dead');
    if (u && app.selected && app.selected.id === u.id) card.classList.add('selected');
    if (u && u.acted) card.classList.add('done');
    if (!u) {
      card.innerHTML = `<div class="uc-head"><span class="uc-name">${b.name}</span><span class="uc-hp">KIA</span></div>`;
    } else {
      const pips = '◆'.repeat(u.hp) + '◇'.repeat(u.maxHp - u.hp);
      const mv = u.acted ? 'done' : (u.moved ? 'acted' : `move ${u.move}`);
      card.innerHTML = `
        <div class="uc-head"><span class="uc-name" style="color:${b.color}">${b.name}</span><span class="uc-hp">${pips}${u.shield ? ' 🛡' : ''}</span></div>
        <div class="uc-stats">${b.kind === 'ranged' ? `dmg ${u.dmg} · range ${u.range}` : b.kind === 'support' ? `dmg ${u.dmg} · pull · shield` : `dmg ${u.dmg} · push`} · <i>${mv}</i></div>
        <div class="uc-actions">
          <button data-act="repair" ${u.hp >= u.maxHp || u.acted ? 'disabled' : ''}>Repair +1</button>
          <button data-act="wait" ${u.acted ? 'disabled' : ''}>Hold</button>
        </div>`;
      card.addEventListener('click', (e) => {
        if (e.target.dataset.act === 'repair') {
          if (app.selected && app.selected.id === u.id && !u.acted && u.hp < u.maxHp) {
            pushUndo();
            doRepair(app.state, u, []);
            SFX.repair();
            addFloat(u.x, u.y, '+1', '#7dffb0');
            afterPlayerAction();
          }
          return;
        }
        if (e.target.dataset.act === 'wait') {
          if (app.selected && app.selected.id === u.id && !u.acted) {
            pushUndo();
            u.acted = true;
            SFX.ui();
            afterPlayerAction();
          }
          return;
        }
        if (u.hp > 0) {
          app.selected = (app.selected && app.selected.id === u.id) ? null : u;
          SFX.select();
          buildUnitCards();
        }
      });
    }
    unitbar.appendChild(card);
  }
}

function afterPlayerAction() {
  app.selected = app.state.units.find(u => app.selected && u.id === app.selected.id && u.hp > 0) || null;
  buildUnitCards();
  updateHud();
  if (app.state.status === 'won') {
    setTimeout(() => missionWon(), 500);
  }
}

function updateHud() {
  const s = app.state;
  missionNameEl.textContent = `Mission ${s.idx + 1} — ${s.mission.name}`;
  let obj;
  if (s.objective.type === 'survive') {
    const left = Math.max(0, s.objective.turns - s.turn + 1);
    obj = `Turn ${Math.min(s.turn, s.objective.turns)}/${s.objective.turns} — hold for ${left} more turn${left === 1 ? '' : 's'}`;
  } else {
    obj = `Turn ${s.turn} — ${s.objective.type === 'exterminate' ? `${s.units.filter(u => u.side === 'enemy').length} Vek remaining` : 'Destroy the Warlord'}`;
  }
  const bhp = s.buildings.filter(b => b.hp > 0).map(b => `◆${b.hp}${b.shield ? '🛡' : ''}`).join(' ');
  objectiveEl.textContent = obj + (bhp ? `  ·  Structures: ${bhp}` : '');
  btnUndo.disabled = !app.undoStack.length;
  btnEnd.disabled = app.animating;
}

function addFloat(x, y, text, color) {
  const c = tileCenter(x, y);
  app.floats.push({ x: c.x, y: c.y - layout.ts * 0.4, text, color, t0: app.time, dur: 0.9 });
}
function addFx(kind, x, y, extra) {
  app.fx.push(Object.assign({ kind, x, y, t0: app.time }, extra || {}));
}
function shake(n) { app.shake = Math.max(app.shake, n); }

function playEvents(events, done) {
  app.animating = true;
  updateHud();
  const STEP = 150;
  events.forEach((e, i) => {
    setTimeout(() => {
      playEventFx(e);
    }, i * STEP);
  });
  setTimeout(() => {
    app.animating = false;
    if (app.state.status === 'playing') {
      app.banner = { text: 'YOUR MOVE', t0: app.time };
      buildUnitCards();
      updateHud();
    }
    if (done) done();
  }, events.length * STEP + 250);
}

function playEventFx(e) {
  switch (e.type) {
    case 'attack':
      addFx('slash', e.fx, e.fy, { tx: e.tx, ty: e.ty });
      SFX.attack();
      break;
    case 'shot':
      addFx('beam', e.fx, e.fy, { dx: e.dx, dy: e.dy });
      SFX.shot();
      break;
    case 'hit':
      addFx('boom', e.x, e.y, { small: true });
      addFloat(e.x, e.y, '-' + e.dmg, e.side === 'player' ? '#ff6b81' : e.side === 'building' ? '#ffd75e' : '#ffffff');
      SFX.hit();
      if (e.side === 'building') shake(5);
      break;
    case 'shieldblock':
      addFloat(e.x, e.y, 'BLOCKED', '#4aa3ff');
      addFx('shieldpop', e.x, e.y);
      SFX.shield();
      break;
    case 'die':
      addFx('boom', e.x, e.y, {});
      SFX.die();
      shake(8);
      break;
    case 'building_down':
      addFx('boom', e.x, e.y, { big: true });
      addFloat(e.x, e.y, 'STRUCTURE LOST', '#ff3f34');
      shake(14);
      break;
    case 'explode':
      addFx('boom', e.x, e.y, { big: true });
      SFX.die();
      shake(12);
      break;
    case 'bump':
      addFloat(e.x, e.y, 'BUMP', '#ffb142');
      SFX.bump();
      break;
    case 'push':
      addFx('pushline', e.fx, e.fy, { tx: e.tx, ty: e.ty });
      break;
    case 'move':
      addFx('dash', e.fx, e.fy, { tx: e.tx, ty: e.ty });
      break;
    case 'telegraph':
      addFx('tgping', e.x, e.y);
      SFX.telegraph();
      break;
    case 'mark':
      addFx('markping', e.x, e.y);
      SFX.telegraph();
      break;
    case 'emerge':
      addFx('emerge', e.x, e.y);
      SFX.emerge();
      shake(4);
      break;
    case 'shield':
      addFx('shield', e.x, e.y);
      SFX.shield();
      break;
    case 'repair':
      addFx('repair', e.x, e.y);
      break;
    case 'victory':
      SFX.victory();
      break;
    case 'defeat':
      SFX.defeat();
      break;
  }
}

function endTurnClicked() {
  if (app.animating || app.state.status !== 'playing') return;
  app.selected = null;
  buildUnitCards();
  app.undoStack = [];
  app.banner = { text: 'ENEMY PHASE', t0: app.time };
  const events = endTurn(app.state);
  playEvents(events, () => {
    updateHud();
    if (app.state.status === 'won') missionWon();
    else if (app.state.status === 'lost') missionLost();
  });
}

function missionWon() {
  const s = app.state;
  progress.unlocked = Math.max(progress.unlocked, Math.min(s.idx + 2, MISSIONS.length));
  progress.done = Math.max(progress.done, s.idx + 1);
  saveProgress();
  if (s.idx === MISSIONS.length - 1) {
    showScreen('complete');
    return;
  }
  el('victory-sub').textContent = `"${s.mission.name}" cleared on turn ${s.turn}.`;
  buildUpgradeChoices();
  showScreen('victory');
}

function buildUpgradeChoices() {
  const list = el('upgrade-list');
  list.innerHTML = '';
  const pool = UPGRADES.filter(u => !(u.unique && progress.taken.includes(u.id)));
  const picks = [];
  while (picks.length < 3 && pool.length) {
    picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  for (const u of picks) {
    const b = document.createElement('button');
    b.className = 'upgrade-btn';
    b.innerHTML = `<div class="u-name">▲ ${u.name}</div><div class="u-desc">${u.desc}</div>`;
    b.addEventListener('click', () => {
      if (!u.instant) {
        u.apply(progress.mods);
        progress.taken.push(u.id);
      }
      saveProgress();
      SFX.shield();
      openBrief(app.state.idx + 1);
    });
    list.appendChild(b);
  }
}

function missionLost() {
  el('defeat-reason').textContent = app.state.lostReason + ' The Riftline cannot afford failures — regroup and try again.';
  showScreen('defeat');
}

canvas.addEventListener('pointerdown', (e) => {
  try { ac().resume(); } catch (err) {}
  if (app.screen !== 'battle' || app.animating || app.state.status !== 'playing') return;
  const tile = posToTile(e.clientX, e.clientY);
  if (!tile) return;
  const s = app.state;
  const clickedUnit = unitAt(s, tile.x, tile.y);

  if (app.selected) {
    const u = app.selected;
    if (clickedUnit && clickedUnit.side === 'player') {
      app.selected = clickedUnit;
      SFX.select();
      buildUnitCards();
      return;
    }
    if (!u.acted) {
      const targets = attackTargets(s, u, u.x, u.y);
      if (clickedUnit && clickedUnit.side === 'enemy' && targets.some(t => t.x === tile.x && t.y === tile.y)) {
        pushUndo();
        doAttack(s, u, tile.x, tile.y, []);
        playEvents([{ type: 'attack', fx: u.x, fy: u.y, tx: tile.x, ty: tile.ty || tile.y }], null);
        SFX.attack();
        afterPlayerAction();
        return;
      }
      if (u.type === 'warden') {
        const shields = shieldTargets(s, u);
        if (shields.some(t => t.x === tile.x && t.y === tile.y)) {
          pushUndo();
          doShield(s, u, tile.x, tile.y, []);
          SFX.shield();
          addFloat(tile.x, tile.y, 'SHIELD', '#4aa3ff');
          afterPlayerAction();
          return;
        }
      }
      if (!u.moved) {
        pushUndo();
        if (moveUnit(s, u, tile.x, tile.y)) {
          SFX.move();
          buildUnitCards();
          return;
        }
        app.undoStack.pop();
      }
    }
    app.selected = null;
    buildUnitCards();
    return;
  }

  if (clickedUnit && clickedUnit.side === 'player') {
    app.selected = clickedUnit;
    SFX.select();
    buildUnitCards();
  }
});

canvas.addEventListener('pointermove', (e) => {
  app.hover = posToTile(e.clientX, e.clientY);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') toggleMute();
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  if (app.screen !== 'battle') return;
  if (e.key === 'u' || e.key === 'U') undo();
  if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') endTurnClicked();
  if (e.key === 'Escape') showScreen('pause');
  if (e.key >= '1' && e.key <= '3') {
    const type = ['vanguard', 'ranger', 'warden'][Number(e.key) - 1];
    const u = app.state.units.find(x => x.type === type && x.hp > 0);
    if (u) { app.selected = u; SFX.select(); buildUnitCards(); }
  }
});

function toggleMute() {
  muted = !muted;
  btnMute.textContent = muted ? '🔇' : '🔊';
}
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}
btnMute.addEventListener('click', toggleMute);
btnFull.addEventListener('click', toggleFullscreen);
btnUndo.addEventListener('click', undo);
btnEnd.addEventListener('click', endTurnClicked);
btnPause.addEventListener('click', () => showScreen('pause'));
el('btn-start').addEventListener('click', () => {
  try { ac().resume(); } catch (e) {}
  SFX.ui();
  progress = loadProgress();
  buildMissionList();
  showScreen('select');
});
el('btn-continue').addEventListener('click', () => {
  SFX.ui();
  buildMissionList();
  showScreen('select');
});
el('btn-select-back').addEventListener('click', () => { SFX.ui(); refreshTitle(); showScreen('title'); });
el('btn-brief-back').addEventListener('click', () => { SFX.ui(); buildMissionList(); showScreen('select'); });
el('btn-retry').addEventListener('click', () => { SFX.ui(); startBattle(app.state.idx); });
el('btn-defeat-menu').addEventListener('click', () => { SFX.ui(); buildMissionList(); showScreen('select'); });
el('btn-resume').addEventListener('click', () => { SFX.ui(); showScreen('battle'); });
el('btn-restart').addEventListener('click', () => { SFX.ui(); startBattle(app.state.idx); });
el('btn-abort').addEventListener('click', () => { SFX.ui(); buildMissionList(); showScreen('select'); });
el('btn-complete-menu').addEventListener('click', () => { SFX.ui(); refreshTitle(); showScreen('title'); });

function refreshTitle() {
  progress = loadProgress();
  el('btn-continue').classList.toggle('hidden', progress.unlocked <= 1);
}

function render() {
  app.time += 1 / 60;
  const w = window.innerWidth, h = window.innerHeight;
  ctx.save();
  if (app.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * app.shake, (Math.random() - 0.5) * app.shake);
    app.shake *= 0.88;
  }

  ctx.fillStyle = '#04060c';
  ctx.fillRect(-30, -30, w + 60, h + 60);
  for (const s of stars) {
    const tw = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(app.time * s.sp + s.ph));
    ctx.fillStyle = `rgba(200,215,255,${tw})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (app.state && (app.screen === 'battle' || app.screen === 'pause' || app.screen === 'victory' || app.screen === 'defeat')) {
    renderBoard();
  }

  ctx.restore();
  requestAnimationFrame(render);
}

function renderBoard() {
  const s = app.state;
  const ts = layout.ts;

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const px = layout.ox + x * ts, py = layout.oy + y * ts;
      ctx.fillStyle = (x + y) % 2 === 0 ? '#0c1422' : '#0e1728';
      ctx.fillRect(px, py, ts, ts);
      ctx.strokeStyle = 'rgba(90,130,200,0.07)';
      ctx.strokeRect(px + 0.5, py + 0.5, ts - 1, ts - 1);
      if (s.tiles[y][x] === 1) {
        ctx.fillStyle = '#232c40';
        ctx.fillRect(px + 2, py + 2, ts - 4, ts - 4);
        ctx.fillStyle = '#2e3a55';
        ctx.fillRect(px + 2, py + 2, ts - 4, (ts - 4) * 0.3);
      }
      if (s.spawns.some(sp => sp.x === x && sp.y === y)) {
        ctx.strokeStyle = 'rgba(255,80,80,0.25)';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 4.5, py + 4.5, ts - 9, ts - 9);
      }
    }
  }

  for (const b of s.buildings) {
    if (b.hp <= 0) {
      const c = tileCenter(b.x, b.y);
      ctx.fillStyle = 'rgba(40,20,20,0.9)';
      ctx.fillRect(c.x - ts * 0.38, c.y - ts * 0.38, ts * 0.76, ts * 0.76);
      ctx.strokeStyle = 'rgba(255,80,80,0.4)';
      ctx.beginPath();
      ctx.moveTo(c.x - ts * 0.25, c.y - ts * 0.25);
      ctx.lineTo(c.x + ts * 0.25, c.y + ts * 0.25);
      ctx.moveTo(c.x + ts * 0.25, c.y - ts * 0.25);
      ctx.lineTo(c.x - ts * 0.25, c.y + ts * 0.25);
      ctx.stroke();
      continue;
    }
    const c = tileCenter(b.x, b.y);
    ctx.save();
    ctx.shadowBlur = 16;
    ctx.shadowColor = '#4aa3ff';
    ctx.fillStyle = '#16345c';
    ctx.fillRect(c.x - ts * 0.4, c.y - ts * 0.4, ts * 0.8, ts * 0.8);
    ctx.fillStyle = '#2a5da8';
    ctx.fillRect(c.x - ts * 0.4, c.y - ts * 0.4, ts * 0.8, ts * 0.22);
    ctx.restore();
    ctx.fillStyle = '#9fd8ff';
    ctx.font = `bold ${Math.floor(ts * 0.3)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⌂', c.x, c.y + ts * 0.08);
    drawPips(c.x, c.y + ts * 0.34, b.hp, b.maxHp, '#6fd6ff');
    if (b.shield) drawShieldRing(c.x, c.y, ts * 0.48);
  }

  const sel = app.selected;
  let moveTiles = [];
  let atkTiles = [];
  let shieldTiles = [];
  if (sel && sel.hp > 0 && !sel.acted && s.status === 'playing' && !app.animating) {
    if (!sel.moved) moveTiles = moveRange(s, sel).filter(r => r.x !== sel.x || r.y !== sel.y);
    atkTiles = attackTargets(s, sel, sel.x, sel.y);
    if (sel.type === 'warden') shieldTiles = shieldTargets(s, sel);
  }

  for (const r of moveTiles) {
    const px = layout.ox + r.x * ts, py = layout.oy + r.y * ts;
    ctx.fillStyle = 'rgba(80,160,255,0.16)';
    ctx.fillRect(px + 2, py + 2, ts - 4, ts - 4);
    ctx.strokeStyle = 'rgba(120,190,255,0.4)';
    ctx.strokeRect(px + 2.5, py + 2.5, ts - 5, ts - 5);
  }

  for (const e of s.units) {
    if (e.side !== 'enemy' || e.hp <= 0 || !e.telegraph) continue;
    const c = tileCenter(e.x, e.y);
    if (e.telegraph.kind === 'bomb') {
      for (const [dx, dy] of DIRS) {
        const px = layout.ox + (e.x + dx) * ts, py = layout.oy + (e.y + dy) * ts;
        ctx.fillStyle = `rgba(255,80,60,${0.14 + 0.08 * Math.sin(app.time * 6)})`;
        ctx.fillRect(px + 2, py + 2, ts - 4, ts - 4);
      }
      continue;
    }
    const aim = tileCenter(e.x + e.telegraph.dx, e.y + e.telegraph.dy);
    ctx.strokeStyle = `rgba(255,71,87,${0.5 + 0.25 * Math.sin(app.time * 6)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(aim.x, aim.y);
    ctx.stroke();
    const r = ts * 0.34;
    ctx.beginPath();
    ctx.arc(aim.x, aim.y, r, 0, Math.PI * 2);
    ctx.stroke();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.beginPath();
      ctx.moveTo(aim.x + dx * r, aim.y + dy * r);
      ctx.lineTo(aim.x + dx * r * 0.55, aim.y + dy * r * 0.55);
      ctx.stroke();
    }
  }

  for (const mk of s.markers) {
    const c = tileCenter(mk.x, mk.y);
    const pulse = 0.5 + 0.5 * Math.sin(app.time * 5);
    ctx.strokeStyle = `rgba(255,140,60,${0.4 + 0.4 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, ts * (0.22 + 0.1 * pulse), 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,140,60,${0.5 + 0.3 * pulse})`;
    ctx.font = `bold ${Math.floor(ts * 0.3)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↑', c.x, c.y);
  }

  for (const u of s.units) {
    if (u.hp <= 0) continue;
    drawUnit(u);
  }

  for (const t of atkTiles) {
    const c = tileCenter(t.x, t.y);
    ctx.strokeStyle = `rgba(255,71,87,${0.7 + 0.3 * Math.sin(app.time * 7)})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(c.x - ts * 0.42, c.y - ts * 0.42, ts * 0.84, ts * 0.84);
  }
  for (const t of shieldTiles) {
    const c = tileCenter(t.x, t.y);
    ctx.strokeStyle = `rgba(74,163,255,${0.7 + 0.3 * Math.sin(app.time * 7)})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(c.x - ts * 0.42, c.y - ts * 0.42, ts * 0.84, ts * 0.84);
    ctx.setLineDash([]);
  }

  renderFx();
  renderFloats();

  if (app.banner && app.time - app.banner.t0 < 1.4) {
    const age = app.time - app.banner.t0;
    const alpha = age < 1 ? 1 : 1 - (age - 1) / 0.4;
    ctx.fillStyle = `rgba(8,14,28,${0.55 * alpha})`;
    ctx.fillRect(0, h * 0.32, w, 64);
    ctx.fillStyle = `rgba(191,227,255,${alpha})`;
    ctx.font = 'bold 30px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '6px';
    ctx.fillText(app.banner.text, w / 2, h * 0.32 + 33);
    ctx.letterSpacing = '0px';
  } else {
    app.banner = null;
  }
}

function drawPips(cx, cy, hp, maxHp, color) {
  const pw = 7, gap = 2;
  const total = maxHp * pw + (maxHp - 1) * gap;
  let x = cx - total / 2;
  for (let i = 0; i < maxHp; i++) {
    ctx.fillStyle = i < hp ? color : 'rgba(255,255,255,0.15)';
    ctx.fillRect(x, cy, pw, 4);
    x += pw + gap;
  }
}

function drawShieldRing(cx, cy, r) {
  ctx.strokeStyle = `rgba(74,163,255,${0.6 + 0.3 * Math.sin(app.time * 4)})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawUnit(u) {
  const b = BASE[u.type];
  const c = tileCenter(u.x, u.y);
  const ts = layout.ts;
  const sel = app.selected && app.selected.id === u.id;
  const size = (u.type === 'boss' || u.type === 'hive' || u.type === 'brute') ? 0.44 : 0.36;
  const half = ts * size;

  ctx.save();
  if (u.acted && u.side === 'player') ctx.globalAlpha = 0.5;
  if (sel) {
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ffffff';
  } else {
    ctx.shadowBlur = 12;
    ctx.shadowColor = b.color;
  }
  ctx.fillStyle = u.side === 'player' ? '#13202f' : '#221019';
  roundRect(c.x - half, c.y - half, half * 2, half * 2, 6);
  ctx.fill();
  ctx.lineWidth = sel ? 3 : 2;
  ctx.strokeStyle = b.color;
  roundRect(c.x - half, c.y - half, half * 2, half * 2, 6);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = b.color;
  ctx.font = `bold ${Math.floor(ts * (u.type === 'boss' ? 0.4 : 0.32))}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(b.icon, c.x, c.y - ts * 0.02);

  drawPips(c.x, c.y + half + 5, u.hp, u.maxHp, u.side === 'player' ? '#7dffb0' : '#ff8a5c');
  if (u.shield) drawShieldRing(c.x, c.y, half + 6);
  if (u.telegraph) {
    ctx.strokeStyle = 'rgba(255,71,87,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, half + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function renderFx() {
  for (let i = app.fx.length - 1; i >= 0; i--) {
    const f = app.fx[i];
    const age = app.time - f.t0;
    const dur = f.kind === 'boom' ? (f.big ? 0.5 : 0.35) : 0.3;
    if (age > dur) { app.fx.splice(i, 1); continue; }
    const k = age / dur;
    const c = tileCenter(f.x, f.y);
    if (f.kind === 'boom') {
      const r = (f.big ? ts2() * 0.9 : ts2() * 0.5) * (0.4 + k);
      ctx.strokeStyle = `rgba(255,${f.big ? 120 : 180},80,${1 - k})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,200,90,${0.5 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.kind === 'slash' || f.kind === 'beam' || f.kind === 'pushline' || f.kind === 'dash') {
      const a = tileCenter(f.x, f.y);
      const b2 = tileCenter(f.tx, f.ty);
      ctx.strokeStyle = f.kind === 'beam' ? `rgba(255,120,180,${1 - k})` : `rgba(255,255,255,${0.7 * (1 - k)})`;
      ctx.lineWidth = f.kind === 'beam' ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b2.x, b2.y);
      ctx.stroke();
    } else if (f.kind === 'tgping' || f.kind === 'markping') {
      ctx.strokeStyle = `rgba(255,71,87,${1 - k})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, ts2() * (0.2 + k * 0.5), 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.kind === 'emerge') {
      ctx.strokeStyle = `rgba(255,140,60,${1 - k})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, ts2() * (0.1 + k * 0.7), 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.kind === 'shield' || f.kind === 'shieldpop') {
      ctx.strokeStyle = `rgba(74,163,255,${1 - k})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, ts2() * (0.3 + k * 0.35), 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.kind === 'repair') {
      ctx.fillStyle = `rgba(125,255,176,${1 - k})`;
      ctx.font = `bold ${Math.floor(ts2() * 0.4)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('+', c.x, c.y - k * ts2() * 0.5);
    }
  }
}
function ts2() { return layout.ts; }

function renderFloats() {
  for (let i = app.floats.length - 1; i >= 0; i--) {
    const f = app.floats[i];
    const age = app.time - f.t0;
    if (age > f.dur) { app.floats.splice(i, 1); continue; }
    const k = age / f.dur;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = f.color;
    ctx.font = `bold ${Math.max(13, Math.floor(layout.ts * 0.3))}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y - k * 26);
    ctx.globalAlpha = 1;
  }
}

refreshTitle();
requestAnimationFrame(render);
