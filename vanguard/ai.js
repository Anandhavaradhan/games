'use strict';

if (typeof module !== 'undefined' && typeof moveRange === 'undefined') {
  Object.assign(global, require('./engine.js'));
}

function threatenedAt(state, x, y, threats) {
  for (const t of threats) {
    const tg = t.telegraph;
    if (tg.kind === 'bomb') {
      if (Math.abs(t.x - x) + Math.abs(t.y - y) === 1) return true;
    } else {
      if (t.x + tg.dx === x && t.y + tg.dy === y) return true;
    }
  }
  return false;
}

function lethalFor(state, unit, threats) {
  return threats.filter(t => {
    const tg = t.telegraph;
    if (unit.shield > 0) return false;
    if (tg.kind === 'bomb') return Math.abs(t.x - unit.x) + Math.abs(t.y - unit.y) === 1 && tg.dmg >= unit.hp;
    return t.x + tg.dx === unit.x && t.y + tg.dy === unit.y && tg.dmg >= unit.hp;
  });
}

function incomingDmg(state, unit, x, y) {
  let max = 0;
  for (const e of state.units) {
    if (e.side !== 'enemy' || e.hp <= 0) continue;
    const d = Math.abs(e.x - x) + Math.abs(e.y - y);
    let can = false;
    if (e.kind === 'ranged') can = ((e.x === x || e.y === y) && d <= e.move + e.range);
    else can = d <= e.move + 1;
    if (can && e.dmg > max) max = e.dmg;
  }
  return max;
}

function playPlayerTurn(state) {
  for (const type of ['ranger', 'vanguard', 'warden']) {
    const unit = state.units.find(u => u.side === 'player' && u.type === type && u.hp > 0);
    if (unit) actWithUnit(state, unit);
  }
}

function actWithUnit(state, unit) {
  const threats = state.units.filter(u => u.side === 'enemy' && u.telegraph);
  let reach = moveRange(state, unit);
  const lethal = lethalFor(state, unit, threats);
  if (lethal.length) {
    const safe = reach.filter(r => !threatenedAt(state, r.x, r.y, lethal));
    if (safe.length) reach = safe;
  }
  let best = null;
  const consider = (score, move, act) => {
    if (!best || score > best.score) best = { score, move, act };
  };

  for (const r of reach) {
    const ox = unit.x, oy = unit.y;
    unit.x = r.x;
    unit.y = r.y;
    let pen = 0;
    if (unit.shield === 0 && lethal.length && threatenedAt(state, r.x, r.y, lethal)) pen -= 500;
    if (unit.shield === 0 && incomingDmg(state, unit, r.x, r.y) >= unit.hp) pen -= 80;

    const targets = attackTargets(state, unit, r.x, r.y);
    for (const t of targets) {
      const victim = unitAt(state, t.x, t.y);
      const kill = victim.hp <= unit.dmg && victim.shield === 0;
      const tg = victim.telegraph;
      let s = pen;
      let prio = 0;
      if (victim.type === 'boss') prio = 110;
      if (victim.type === 'hive') prio = 90;
      if (tg) {
        let aimsBuilding = false;
        if (tg.kind === 'bomb') {
          aimsBuilding = DIRS.some(([dx, dy]) => !!buildingAt(state, t.x + dx, t.y + dy));
        } else {
          aimsBuilding = !!buildingAt(state, t.x + tg.dx, t.y + tg.dy);
        }
        s += kill ? (aimsBuilding ? 150 : 120) : (aimsBuilding ? 35 : 30);
      } else {
        s += kill ? 70 : 10;
      }
      s += prio;
      consider(s, r, { type: 'attack', x: t.x, y: t.y });
    }

    if (unit.type === 'warden') {
      for (const s of shieldTargets(state, unit)) {
        const b = buildingAt(state, s.x, s.y);
        const v = unitAt(state, s.x, s.y);
        const threatened = threats.some(t => {
          const tg = t.telegraph;
          if (tg.kind === 'bomb') return Math.abs(t.x - s.x) + Math.abs(t.y - s.y) === 1;
          return t.x + tg.dx === s.x && t.y + tg.dy === s.y;
        });
        if (threatened && ((b && b.shield === 0) || (v && v.side === 'player' && v.shield === 0))) {
          consider(100 + pen, r, { type: 'shield', x: s.x, y: s.y });
        }
      }
    }

    if (unit.type === 'vanguard') {
      for (const th of threats) {
        if (th.telegraph.kind === 'bomb') continue;
        for (const r2 of reach) {
          if (Math.abs(r2.x - th.x) + Math.abs(r2.y - th.y) !== 1) continue;
          const dx = th.x - r2.x, dy = th.y - r2.y;
          const nx = th.x + dx, ny = th.y + dy;
          const keepX = unit.x, keepY = unit.y;
          unit.x = r2.x;
          unit.y = r2.y;
          let s = 0;
          if (unit.shield === 0 && lethal.length && threatenedAt(state, r2.x, r2.y, lethal)) s -= 500;
          if (unit.shield === 0 && incomingDmg(state, unit, r2.x, r2.y) >= unit.hp) s -= 80;
          if (!inB(state, nx, ny) || state.tiles[ny][nx] === 1 || buildingAt(state, nx, ny) || unitAt(state, nx, ny)) {
            s += th.hp <= 1 ? 110 : 12;
          } else {
            const tg = th.telegraph;
            const ax = nx + tg.dx, ay = ny + tg.dy;
            const foe = inB(state, ax, ay) ? unitAt(state, ax, ay) : null;
            if (foe && foe.side === 'enemy') s += 130;
            else if (!inB(state, ax, ay) || state.tiles[ay][ax] === 1) s += 80;
            else if (buildingAt(state, ax, ay) || (foe && foe.side === 'player')) s -= 50;
            else s += 75;
          }
          unit.x = keepX;
          unit.y = keepY;
          consider(s, r2, { type: 'attack', x: th.x, y: th.y });
        }
      }
    }

    if (unit.hp < unit.maxHp && pen > -500) {
      consider(45 + pen, r, { type: 'repair' });
    }

    unit.x = ox;
    unit.y = oy;
  }

  if (best && best.score > 0) {
    unit.x = best.move.x;
    unit.y = best.move.y;
    if (best.act.type === 'attack') doAttack(state, unit, best.act.x, best.act.y, []);
    else if (best.act.type === 'shield') doShield(state, unit, best.act.x, best.act.y, []);
    else doRepair(state, unit, []);
    return;
  }

  const foes = state.units.filter(u => u.side === 'enemy' && u.hp > 0);
  if (foes.length) {
    let pick = null;
    let bestKey = Infinity;
    for (const r of reach) {
      let d = Infinity;
      for (const f of foes) {
        const dd = Math.abs(f.x - r.x) + Math.abs(f.y - r.y);
        if (dd < d) d = dd;
      }
      let key;
      if (unit.type === 'warden') {
        key = (d < 2 ? 1000 + d : d);
      } else {
        key = d;
      }
      if (unit.shield === 0 && lethal.length && threatenedAt(state, r.x, r.y, lethal)) key += 10000;
      if (unit.shield === 0 && incomingDmg(state, unit, r.x, r.y) >= unit.hp) key += 1000;
      if (key < bestKey) { bestKey = key; pick = r; }
    }
    if (pick) {
      unit.x = pick.x;
      unit.y = pick.y;
    }
  }
}

if (typeof module !== 'undefined') module.exports = { playPlayerTurn };
