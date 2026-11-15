'use strict';

if (typeof module !== 'undefined' && typeof MISSIONS === 'undefined') {
  global.MISSIONS = require('./levels.js').MISSIONS;
}

const GRID_W = 14;
const GRID_H = 9;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const BASE = {
  vanguard: { name: 'Vanguard', side: 'player', hp: 4, move: 3, dmg: 2, kind: 'melee', color: '#ff9f43', icon: 'V' },
  ranger: { name: 'Ranger', side: 'player', hp: 3, move: 4, dmg: 2, kind: 'ranged', range: 4, color: '#4cd137', icon: 'R' },
  warden: { name: 'Warden', side: 'player', hp: 3, move: 3, dmg: 1, kind: 'support', color: '#4aa3ff', icon: 'W' },
  grunt: { name: 'Grunt', side: 'enemy', hp: 2, move: 2, dmg: 1, kind: 'melee', color: '#e05656', icon: 'g' },
  lancer: { name: 'Lancer', side: 'enemy', hp: 2, move: 3, dmg: 2, kind: 'melee', color: '#ff6b81', icon: 'l' },
  archer: { name: 'Archer', side: 'enemy', hp: 1, move: 2, dmg: 1, kind: 'ranged', range: 3, color: '#f78fb3', icon: 'a' },
  brute: { name: 'Brute', side: 'enemy', hp: 4, move: 2, dmg: 3, kind: 'melee', massive: true, color: '#c56cf0', icon: 'B' },
  bomber: { name: 'Bomber', side: 'enemy', hp: 1, move: 3, dmg: 2, kind: 'bomb', color: '#ffb142', icon: 'o' },
  hive: { name: 'Hive', side: 'enemy', hp: 2, move: 0, dmg: 0, kind: 'hive', color: '#7d5fff', icon: 'H' },
  boss: { name: 'Warlord', side: 'enemy', hp: 8, move: 2, dmg: 3, kind: 'melee', massive: true, color: '#ff3f34', icon: 'X' },
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rng(state) {
  state.rngCount++;
  return mulberry32((state.seed + state.rngCount * 0x9E3779B1) | 0)();
}

function makeUnit(type, id, x, y, mods) {
  const b = BASE[type];
  const md = (mods && mods[type]) || {};
  const maxHp = b.hp + (md.hp || 0);
  return {
    id, type, side: b.side, x, y,
    hp: maxHp, maxHp,
    move: b.move + (md.move || 0),
    range: (b.range || 0) + (md.range || 0),
    dmg: b.dmg || 0,
    kind: b.kind, massive: !!b.massive,
    shield: 0, telegraph: null, moved: false,
  };
}

function createMission(idx, mods) {
  const m = MISSIONS[idx];
  mods = mods || {};
  const tiles = [];
  const buildings = [];
  const spawns = [];
  const units = [];
  let id = 1;
  let pi = 0;
  const playerOrder = ['vanguard', 'ranger', 'warden'];
  for (let y = 0; y < GRID_H; y++) {
    const row = [];
    for (let x = 0; x < GRID_W; x++) {
      const c = m.map[y][x];
      row.push(c === '#' ? 1 : 0);
      if (c === 'B') buildings.push({ id: id++, x, y, hp: m.buildingHp, maxHp: m.buildingHp, shield: 0 });
      if (c === 'S') spawns.push({ x, y });
      if (c === 'P') units.push(makeUnit(playerOrder[pi++], id++, x, y, mods));
      if (c === 'H') units.push(makeUnit('hive', id++, x, y, mods));
      if (c === 'X') units.push(makeUnit('boss', id++, x, y, mods));
    }
    tiles.push(row);
  }
  const initial = m.waves[1] || [];
  const free = spawns.slice();
  for (const t of initial) {
    const i = Math.floor(rngOf(idx) * free.length);
    const s = free.splice(i, 1)[0];
    units.push(makeUnit(t, id++, s.x, s.y, mods));
  }
  return {
    idx, mission: m, objective: m.objective, mods,
    tiles, buildings, spawns, units, markers: [],
    turn: 1, phase: 'player', status: 'playing', lostReason: '',
    seed: 1000 + idx * 7919, rngCount: 0, playerCount: 3,
  };
}

function rngOf(idx) {
  return mulberry32(500 + idx * 104729);
}

function inB(state, x, y) {
  return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
}
function unitAt(state, x, y) {
  return state.units.find(u => u.hp > 0 && u.x === x && u.y === y) || null;
}
function buildingAt(state, x, y) {
  return state.buildings.find(b => b.hp > 0 && b.x === x && b.y === y) || null;
}
function markerAt(state, x, y) {
  return state.markers.find(mk => mk.x === x && mk.y === y) || null;
}
function blockedMove(state, x, y) {
  if (!inB(state, x, y)) return true;
  if (state.tiles[y][x] === 1) return true;
  if (buildingAt(state, x, y)) return true;
  if (unitAt(state, x, y)) return true;
  return false;
}
function manhattan(ax, ay, bx, by) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function moveRange(state, unit) {
  const start = { x: unit.x, y: unit.y, d: 0 };
  const seen = { [unit.y * GRID_W + unit.x]: true };
  const out = [start];
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    if (cur.d >= unit.move) continue;
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      const key = ny * GRID_W + nx;
      if (seen[key] || blockedMove(state, nx, ny)) continue;
      seen[key] = true;
      const nxt = { x: nx, y: ny, d: cur.d + 1 };
      out.push(nxt);
      queue.push(nxt);
    }
  }
  return out;
}

function attackTargets(state, unit, fx, fy) {
  const out = [];
  if (unit.kind === 'melee' || unit.kind === 'support') {
    for (const [dx, dy] of DIRS) {
      const t = unitAt(state, fx + dx, fy + dy);
      if (t && t.side === 'enemy') out.push({ x: fx + dx, y: fy + dy });
    }
    return out;
  }
  if (unit.kind === 'ranged') {
    for (const [dx, dy] of DIRS) {
      for (let i = 1; i <= unit.range; i++) {
        const x = fx + dx * i, y = fy + dy * i;
        if (!inB(state, x, y)) break;
        if (state.tiles[y][x] === 1) break;
        if (buildingAt(state, x, y)) break;
        const t = unitAt(state, x, y);
        if (t) {
          if (t.side === 'enemy') out.push({ x, y });
          break;
        }
      }
    }
    return out;
  }
  return out;
}

function damageUnit(state, u, dmg, events) {
  if (u.hp <= 0) return;
  if (u.shield > 0) {
    u.shield = 0;
    events.push({ type: 'shieldblock', x: u.x, y: u.y });
    return;
  }
  u.hp -= dmg;
  events.push({ type: 'hit', x: u.x, y: u.y, dmg, side: u.side });
  if (u.hp <= 0) events.push({ type: 'die', x: u.x, y: u.y, side: u.side, type: u.type });
}

function damageBuilding(state, b, dmg, events) {
  if (b.hp <= 0) return;
  if (b.shield > 0) {
    b.shield = 0;
    events.push({ type: 'shieldblock', x: b.x, y: b.y });
    return;
  }
  b.hp -= dmg;
  events.push({ type: 'hit', x: b.x, y: b.y, dmg, side: 'building' });
  if (b.hp <= 0) events.push({ type: 'building_down', x: b.x, y: b.y });
}

function removeUnit(state, u) {
  const i = state.units.indexOf(u);
  if (i !== -1) state.units.splice(i, 1);
}

function pushUnit(state, u, dx, dy, events) {
  if (u.hp <= 0 || u.massive || (!dx && !dy)) return;
  const nx = u.x + dx, ny = u.y + dy;
  if (blockedMove(state, nx, ny)) {
    damageUnit(state, u, 1, events);
    events.push({ type: 'bump', x: u.x, y: u.y });
    if (u.hp <= 0) removeUnit(state, u);
  } else {
    events.push({ type: 'push', fx: u.x, fy: u.y, tx: nx, ty: ny });
    u.x = nx;
    u.y = ny;
  }
}

function pullUnit(state, u, dx, dy, events) {
  if (u.hp <= 0 || u.massive || (!dx && !dy)) return;
  pushUnit(state, u, -dx, -dy, events);
}

function doAttack(state, unit, tx, ty, events) {
  if (unit.acted || unit.hp <= 0) return false;
  const victim = unitAt(state, tx, ty);
  if (!victim || victim.side !== 'enemy') return false;
  if (!attackTargets(state, unit, unit.x, unit.y).some(t => t.x === tx && t.y === ty)) return false;
  unit.acted = true;
  events.push({ type: 'attack', fx: unit.x, fy: unit.y, tx, ty, dmg: unit.dmg });
  damageUnit(state, victim, unit.dmg, events);
  if (victim.hp <= 0) {
    removeUnit(state, victim, events);
  } else {
    const dx = Math.sign(tx - unit.x), dy = Math.sign(ty - unit.y);
    if (unit.type === 'vanguard') pushUnit(state, victim, dx, dy, events);
    if (unit.type === 'warden') pullUnit(state, victim, dx, dy, events);
  }
  checkEnd(state, events);
  return true;
}

function shieldTargets(state, unit) {
  const out = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (manhattan(unit.x, unit.y, x, y) > 3 || (x === unit.x && y === unit.y)) continue;
      const b = buildingAt(state, x, y);
      if (b && b.shield === 0) { out.push({ x, y }); continue; }
      const u = unitAt(state, x, y);
      if (u && u.side === 'player' && u.shield === 0) out.push({ x, y });
    }
  }
  return out;
}

function doShield(state, unit, tx, ty, events) {
  if (unit.acted || unit.hp <= 0) return false;
  if (!shieldTargets(state, unit).some(t => t.x === tx && t.y === ty)) return false;
  unit.acted = true;
  const b = buildingAt(state, tx, ty);
  if (b) {
    b.shield = 1;
    if (state.mods.shieldRepair) b.hp = Math.min(b.maxHp, b.hp + 1);
    events.push({ type: 'shield', x: tx, y: ty });
  } else {
    const u = unitAt(state, tx, ty);
    u.shield = 1;
    events.push({ type: 'shield', x: tx, y: ty });
  }
  return true;
}

function moveUnit(state, unit, x, y) {
  if (unit.moved || unit.acted || unit.hp <= 0) return false;
  if (!moveRange(state, unit).some(r => r.x === x && r.y === y)) return false;
  unit.x = x;
  unit.y = y;
  unit.moved = true;
  return true;
}

function doRepair(state, unit, events) {
  if (unit.acted || unit.hp <= 0 || unit.hp >= unit.maxHp) return false;
  unit.acted = true;
  unit.hp = Math.min(unit.maxHp, unit.hp + 1);
  events.push({ type: 'repair', x: unit.x, y: unit.y });
  return true;
}

function chooseTarget(state, e) {
  let best = null;
  for (const b of state.buildings) {
    if (b.hp <= 0) continue;
    const d = manhattan(e.x, e.y, b.x, b.y);
    if (!best || d < best.d) best = { x: b.x, y: b.y, d, isBuilding: true };
  }
  if (best) return best;
  for (const u of state.units) {
    if (u.side !== 'player' || u.hp <= 0) continue;
    const d = manhattan(e.x, e.y, u.x, u.y);
    if (!best || d < best.d) best = { x: u.x, y: u.y, d, isBuilding: false };
  }
  return best;
}

function findShot(state, e) {
  let best = null;
  DIRS.forEach(([dx, dy], di) => {
    for (let i = 1; i <= e.range; i++) {
      const x = e.x + dx * i, y = e.y + dy * i;
      if (!inB(state, x, y)) break;
      if (state.tiles[y][x] === 1) break;
      const b = buildingAt(state, x, y);
      const t = unitAt(state, x, y);
      if (t && t.side === 'enemy') break;
      if (b || (t && t.side === 'player')) {
        const cand = { dx, dy, d: i, di, building: !!b };
        if (!best || (cand.building && !best.building) || (cand.building === best.building && cand.d < best.d) || (cand.building === best.building && cand.d === best.d && cand.di < best.di)) best = cand;
        break;
      }
    }
  });
  return best;
}

function planEnemy(state, e, events) {
  const target = chooseTarget(state, e);
  if (!target) return;
  if (e.kind === 'ranged') {
    const shot = findShot(state, e);
    if (shot) {
      e.telegraph = { kind: 'shot', dx: shot.dx, dy: shot.dy, dmg: e.dmg };
      events.push({ type: 'telegraph', x: e.x, y: e.y });
      return;
    }
  }
  if (e.move > 0) {
    const reach = moveRange(state, e);
    let best = null;
    for (const r of reach) {
      const d = manhattan(r.x, r.y, target.x, target.y);
      const key = (d === 1 ? 0 : 10000) + d * 100 + r.d;
      if (!best || key < best.key) best = { key, x: r.x, y: r.y };
    }
    if (best && (best.x !== e.x || best.y !== e.y)) {
      events.push({ type: 'move', fx: e.x, fy: e.y, tx: best.x, ty: best.y });
      e.x = best.x;
      e.y = best.y;
    }
  }
  const d = manhattan(e.x, e.y, target.x, target.y);
  if (e.kind === 'melee' && d === 1) {
    e.telegraph = { kind: 'melee', dx: Math.sign(target.x - e.x), dy: Math.sign(target.y - e.y), dmg: e.dmg };
    events.push({ type: 'telegraph', x: e.x, y: e.y });
  } else if (e.kind === 'bomb' && d === 1) {
    e.telegraph = { kind: 'bomb', dmg: e.dmg };
    events.push({ type: 'telegraph', x: e.x, y: e.y });
  } else if (e.kind === 'ranged') {
    const shot = findShot(state, e);
    if (shot) {
      e.telegraph = { kind: 'shot', dx: shot.dx, dy: shot.dy, dmg: e.dmg };
      events.push({ type: 'telegraph', x: e.x, y: e.y });
    }
  }
}

function resolveTelegraph(state, e, events) {
  const tg = e.telegraph;
  e.telegraph = null;
  if (tg.kind === 'bomb') {
    events.push({ type: 'explode', x: e.x, y: e.y });
    for (const [dx, dy] of DIRS) {
      const x = e.x + dx, y = e.y + dy;
      if (!inB(state, x, y)) continue;
      const b = buildingAt(state, x, y);
      if (b) damageBuilding(state, b, tg.dmg, events);
      const t = unitAt(state, x, y);
      if (t && t !== e) damageUnit(state, t, tg.dmg, events);
    }
    removeUnit(state, e);
    checkEnd(state, events);
    return;
  }
  if (tg.kind === 'melee') {
    const tx = e.x + tg.dx, ty = e.y + tg.dy;
    events.push({ type: 'attack', fx: e.x, fy: e.y, tx, ty, dmg: tg.dmg });
    const b = buildingAt(state, tx, ty);
    if (b) damageBuilding(state, b, tg.dmg, events);
    const t = unitAt(state, tx, ty);
    if (t && t.side === 'player') damageUnit(state, t, tg.dmg, events);
  } else {
    events.push({ type: 'shot', fx: e.x, fy: e.y, dx: tg.dx, dy: tg.dy, dmg: tg.dmg });
    for (let i = 1; i <= 8; i++) {
      const x = e.x + tg.dx * i, y = e.y + tg.dy * i;
      if (!inB(state, x, y)) break;
      if (state.tiles[y][x] === 1) break;
      const b = buildingAt(state, x, y);
      if (b) { damageBuilding(state, b, tg.dmg, events); break; }
      const t = unitAt(state, x, y);
      if (t) { damageUnit(state, t, tg.dmg, events); break; }
    }
  }
  checkEnd(state, events);
}

function hiveSpawn(state, h, events) {
  if (state.turn % 2 === 0) return;
  const free = [];
  for (const [dx, dy] of DIRS) {
    const x = h.x + dx, y = h.y + dy;
    if (!inB(state, x, y) || state.tiles[y][x] === 1) continue;
    if (unitAt(state, x, y) || buildingAt(state, x, y) || markerAt(state, x, y)) continue;
    free.push({ x, y });
  }
  if (!free.length) return;
  const s = free[Math.floor(rng(state) * free.length)];
  state.markers.push({ x: s.x, y: s.y, type: 'grunt', ready: false });
  events.push({ type: 'mark', x: s.x, y: s.y, type: 'grunt' });
}

function placeMarker(state, type, events) {
  const free = state.spawns.filter(s => !unitAt(state, s.x, s.y) && !buildingAt(state, s.x, s.y) && !markerAt(state, s.x, s.y));
  if (!free.length) return;
  const s = free[Math.floor(rng(state) * free.length)];
  state.markers.push({ x: s.x, y: s.y, type, ready: false });
  events.push({ type: 'mark', x: s.x, y: s.y, type });
}

function checkEnd(state, events) {
  if (state.status !== 'playing') return;
  const players = state.units.filter(u => u.side === 'player' && u.hp > 0);
  if (players.length < state.playerCount) {
    state.status = 'lost';
    state.lostReason = 'A squad member was lost.';
    events.push({ type: 'defeat' });
    return;
  }
  if (state.buildings.length > 0 && state.buildings.every(b => b.hp <= 0)) {
    state.status = 'lost';
    state.lostReason = 'All structures destroyed.';
    events.push({ type: 'defeat' });
    return;
  }
  const enemies = state.units.filter(u => u.side === 'enemy' && u.hp > 0);
  if (state.objective.type === 'boss') {
    if (!enemies.some(u => u.type === 'boss')) {
      state.status = 'won';
      events.push({ type: 'victory' });
    }
  } else if (state.objective.type === 'survive') {
    if (state.turn > state.objective.turns) {
      state.status = 'won';
      events.push({ type: 'victory' });
    }
  } else if (state.objective.type === 'exterminate') {
    const pending = Object.keys(state.mission.waves).some(k => Number(k) >= state.turn);
    if (enemies.length === 0 && state.markers.length === 0 && !pending) {
      state.status = 'won';
      events.push({ type: 'victory' });
    }
  }
}

function endTurn(state) {
  if (state.phase !== 'player' || state.status !== 'playing') return [];
  state.phase = 'enemy';
  const events = [];
  const sorted = () => state.units.filter(u => u.side === 'enemy' && u.hp > 0).sort((a, b) => (a.y - b.y) || (a.x - b.x));
  for (const e of sorted()) {
    if (e.telegraph) resolveTelegraph(state, e, events);
  }
  for (const e of sorted()) {
    if (e.kind !== 'hive') planEnemy(state, e, events);
  }
  for (const h of sorted()) {
    if (h.type === 'hive' && h.hp > 0) hiveSpawn(state, h, events);
  }
  const ready = state.markers.filter(mk => mk.ready);
  for (const mk of ready) {
    if (!unitAt(state, mk.x, mk.y) && !buildingAt(state, mk.x, mk.y)) {
      state.markers.splice(state.markers.indexOf(mk), 1);
      state.units.push(makeUnit(mk.type, state.units.reduce((m, u) => Math.max(m, u.id), 0) + 1, mk.x, mk.y, state.mods));
      events.push({ type: 'emerge', x: mk.x, y: mk.y, type: mk.type });
    } else {
      mk.ready = false;
    }
  }
  for (const mk of state.markers) mk.ready = true;
  const wave = state.mission.waves[state.turn];
  if (wave) {
    for (const t of wave) placeMarker(state, t, events);
  }
  state.turn++;
  for (const u of state.units) {
    if (u.side === 'player') {
      u.shield = 0;
      u.acted = false;
      u.moved = false;
    }
  }
  checkEnd(state, events);
  if (state.status === 'playing') state.phase = 'player';
  return events;
}

if (typeof module !== 'undefined') {
  module.exports = {
    GRID_W, GRID_H, DIRS, BASE,
    createMission, moveRange, attackTargets, doAttack, shieldTargets, doShield,
    endTurn, checkEnd, unitAt, buildingAt, manhattan, inB, markerAt, doRepair, moveUnit,
  };
}
