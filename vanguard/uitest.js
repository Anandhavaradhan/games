'use strict';
// Browser-simulation smoke test: runs the real game.js UI code in Node with DOM stubs.

const fs = require('fs');
const vm = require('vm');

function makeClassList(el) {
  const set = new Set();
  return {
    add: c => set.add(c),
    remove: c => set.delete(c),
    toggle: (c, force) => { if (force === undefined) { set.has(c) ? set.delete(c) : set.add(c); } else if (force) set.add(c); else set.delete(c); },
    contains: c => set.has(c),
  };
}
function makeEl(id) {
  const listeners = {};
  const el = {
    id: id || '(anon)',
    children: [],
    dataset: {},
    style: {},
    disabled: false,
    innerHTML: '',
    textContent: '',
    className: '',
    classList: null,
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    appendChild: c => { el.children.push(c); return c; },
    click: () => { (listeners.click || []).forEach(f => f({ target: el, clientX: 0, clientY: 0, preventDefault(){} })); },
    dispatch: (ev, evt) => { (listeners[ev] || []).forEach(f => f(evt || { target: el, clientX: 0, clientY: 0 })); },
    _listeners: listeners,
  };
  el.classList = makeClassList(el);
  return el;
}

const ids = ['game','topbar','unitbar','mission-name','objective','btn-undo','btn-end','btn-mute','btn-full','btn-pause',
  'screen-title','screen-select','screen-brief','screen-victory','screen-defeat','screen-pause','screen-complete',
  'btn-start','btn-continue','mission-list','btn-select-back','brief-name','brief-text','brief-objective','brief-intel',
  'btn-deploy','btn-brief-back','victory-sub','upgrade-list','defeat-reason','btn-retry','btn-defeat-menu',
  'btn-resume','btn-restart','btn-abort','btn-complete-menu'];
const elements = {};
for (const id of ids) elements[id] = makeEl(id);

const ctxStub = new Proxy({}, {
  get: (t, p) => {
    if (p === 'canvas') return canvasEl;
    if (!(p in t)) t[p] = typeof p === 'string' ? (() => {}) : undefined;
    return t[p];
  },
  set: (t, p, v) => { t[p] = v; return true; },
});
const canvasEl = elements.game;
canvasEl.getContext = () => ctxStub;
canvasEl.width = 0; canvasEl.height = 0;

const windowListeners = {};
const sandbox = {
  console,
  setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 5)),
  clearTimeout,
  Math, JSON, Set, Map, Object, Array, Number, String, Boolean, Promise,
  document: {
    getElementById: id => { if (!elements[id]) throw new Error('Missing element #' + id); return elements[id]; },
    createElement: () => makeEl(),
    fullscreenElement: null,
    documentElement: { requestFullscreen: () => Promise.resolve() },
  },
  localStorage: { _s: {}, getItem(k){ return this._s[k] || null; }, setItem(k,v){ this._s[k]=String(v); }, removeItem(k){ delete this._s[k]; } },
  requestAnimationFrame: fn => { sandbox._raf = fn; return 1; },
};
sandbox.window = {
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
  addEventListener: (ev, fn) => { (windowListeners[ev] = windowListeners[ev] || []).push(fn); },
  AudioContext: undefined, webkitAudioContext: undefined,
};
sandbox.global = sandbox;
vm.createContext(sandbox);

for (const f of ['levels.js','engine.js','ai.js','game.js']) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: f });
}
console.log('All four scripts loaded without throwing.');

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function frames(n) { for (let i = 0; i < n; i++) { if (sandbox._raf) { const fn = sandbox._raf; sandbox._raf = null; fn(); } await sleep(1); } }

const E = elements;
let failures = 0;
function check(cond, msg) { if (!cond) { failures++; console.log('  FAIL:', msg); } }

(async () => {
  await frames(5);
  // Title -> select
  E['btn-start'].click();
  check(E['screen-select'].classList.contains('hidden') === false, 'select screen shown after Start');
  check(E['mission-list'].children.length === 10, '10 mission buttons built');

  // Open mission 1 brief
  E['mission-list'].children[0].click();
  check(E['screen-brief'].classList.contains('hidden') === false, 'brief shown');
  check(E['brief-intel'].innerHTML.includes('Grunt'), 'intel lists grunt');

  // Deploy
  E['btn-deploy'].onclick();
  check(E['screen-brief'].classList.contains('hidden') === true, 'brief hidden in battle');
  check(E['topbar'].classList.contains('hidden') === false, 'topbar visible in battle');

  const G = vm.runInContext('({state: app.state, GRID_W, GRID_H, moveRange, attackTargets, tileCenter, layout, unitAt})', sandbox);
  let state = () => vm.runInContext('app.state', sandbox);

  // Select vanguard via keyboard '1'
  windowListeners.keydown.forEach(f => f({ key: '1' }));
  check(vm.runInContext('app.selected && app.selected.type', sandbox) === 'vanguard', 'vanguard selected via key 1');

  // Move vanguard: pick a reachable tile, compute pixel coords, dispatch pointerdown
  const sel0raw = vm.runInContext('({x: app.selected.x, y: app.selected.y})', sandbox);
  const mr = G.moveRange(state(), vm.runInContext('app.selected', sandbox)).filter(r => r.x !== vm.runInContext('app.selected.x', sandbox) || r.y !== vm.runInContext('app.selected.y', sandbox));
  check(mr.length > 0, 'vanguard has move options');
  const dest = mr[0];
  const px = vm.runInContext(`layout.ox + ${dest.x} * layout.ts + layout.ts/2`, sandbox);
  const py = vm.runInContext(`layout.oy + ${dest.y} * layout.ts + layout.ts/2`, sandbox);
  canvasEl.dispatch('pointerdown', { clientX: px, clientY: py, target: canvasEl });
  const sel1 = vm.runInContext('app.selected', sandbox);
  check(sel1 && sel1.x === dest.x && sel1.y === dest.y, `vanguard moved to ${dest.x},${dest.y} (got ${sel1 && sel1.x},${sel1 && sel1.y})`);

  // Undo the move via button (undo everything pushed by the move)
  const stackDepth = vm.runInContext('app.undoStack.length', sandbox);
  for (let i = 0; i < stackDepth; i++) E['btn-undo'].click();
  const sel2 = vm.runInContext('app.selected', sandbox);
  check(sel2 && sel2.x === sel0raw.x && sel2.y === sel0raw.y, `undo restored position (want ${sel0raw.x},${sel0raw.y} got ${sel2 && sel2.x},${sel2 && sel2.y})`);
  check(vm.runInContext('app.undoStack.length', sandbox) === 0, 'undo stack emptied');

  // Attack flow if a target exists, else re-move and end turn
  const v = state().units.find(u => u.type === 'vanguard');
  const atk = G.attackTargets(state(), v, v.x, v.y);
  if (atk.length) {
    const t = atk[0];
    const ax = vm.runInContext(`layout.ox + ${t.x} * layout.ts + layout.ts/2`, sandbox);
    const ay = vm.runInContext(`layout.oy + ${t.y} * layout.ts + layout.ts/2`, sandbox);
    canvasEl.dispatch('pointerdown', { clientX: ax, clientY: ay, target: canvasEl });
    check(vm.runInContext('app.selected.acted', sandbox) === true, 'attack marked acted');
    await frames(10);
  }

  // Pause / resume
  windowListeners.keydown.forEach(f => f({ key: 'Escape' }));
  check(E['screen-pause'].classList.contains('hidden') === false, 'pause shown');
  E['btn-resume'].click();
  check(E['screen-pause'].classList.contains('hidden') === true, 'resume hides pause');

  // End turn & wait out enemy animation
  E['btn-end'].click();
  check(vm.runInContext('app.animating', sandbox) === true, 'animating during enemy phase');
  await frames(80);
  check(vm.runInContext('app.animating', sandbox) === false, 'animation finished');
  check(state().turn === 2, `turn advanced to 2 (got ${state().turn})`);
  check(state().units.filter(u => u.side === 'player').every(u => !u.acted && !u.moved), 'player flags reset after enemy phase');

  // Play a whole mission through the UI: each turn, move someone, attack if possible, end turn
  let guard = 0;
  while (state().status === 'playing' && guard++ < 40) {
    for (const type of ['vanguard','ranger','warden']) {
      const u = state().units.find(x => x.type === type && x.hp > 0);
      if (!u) continue;
      windowListeners.keydown.forEach(f => f({ key: String(['vanguard','ranger','warden'].indexOf(type)+1) }));
      const cur = vm.runInContext('app.selected', sandbox);
      if (!cur || cur.id !== u.id) continue;
      const targets = G.attackTargets(state(), u, u.x, u.y);
      if (targets.length && !u.acted) {
        const t = targets[0];
        const ax = vm.runInContext(`layout.ox + ${t.x} * layout.ts + layout.ts/2`, sandbox);
        const ay = vm.runInContext(`layout.oy + ${t.y} * layout.ts + layout.ts/2`, sandbox);
        canvasEl.dispatch('pointerdown', { clientX: ax, clientY: ay, target: canvasEl });
        await frames(6);
        continue;
      }
      if (!u.moved && !u.acted) {
        const opts = G.moveRange(state(), u).filter(r => r.x !== u.x || r.y !== u.y);
        if (opts.length) {
          const t = opts[Math.floor(Math.random()*opts.length)];
          const mx = vm.runInContext(`layout.ox + ${t.x} * layout.ts + layout.ts/2`, sandbox);
          const my = vm.runInContext(`layout.oy + ${t.y} * layout.ts + layout.ts/2`, sandbox);
          canvasEl.dispatch('pointerdown', { clientX: mx, clientY: my, target: canvasEl });
        }
      }
    }
    if (state().status !== 'playing') break;
    E['btn-end'].click();
    await frames(120);
  }
  console.log(`Mission 1 UI playthrough -> status=${state().status} turn=${state().turn} (${guard} turns)`);
  check(state().status !== 'playing', 'mission reached an end state via UI');

  if (state().status === 'won') {
    await frames(10);
    check(E['screen-victory'].classList.contains('hidden') === false, 'victory screen shown');
    check(E['upgrade-list'].children.length === 3, '3 upgrade choices offered');
    E['upgrade-list'].children[0].click();
    check(E['screen-brief'].classList.contains('hidden') === false, 'upgrade leads to next brief');
  } else if (state().status === 'lost') {
    await frames(10);
    check(E['screen-defeat'].classList.contains('hidden') === false, 'defeat screen shown');
    E['btn-retry'].click();
    check(vm.runInContext('app.state.status', sandbox) === 'playing', 'retry restarts mission');
  }

  // Defeat flow: deploy next mission, pass turns without acting until it is lost
  E['btn-deploy'].onclick();
  check(vm.runInContext('app.state.status', sandbox) === 'playing', 'mission 2 deployed');
  let dguard = 0;
  while (vm.runInContext('app.state.status', sandbox) === 'playing' && dguard++ < 30) {
    E['btn-end'].click();
    await frames(150);
  }
  console.log(`Passive playthrough -> status=${vm.runInContext('app.state.status', sandbox)} turn=${vm.runInContext('app.state.turn', sandbox)} (${dguard} turns)`);
  check(vm.runInContext('app.state.status', sandbox) === 'lost', 'passive play loses mission 2');
  await frames(10);
  check(E['screen-defeat'].classList.contains('hidden') === false, 'defeat screen shown after loss');
  check(E['defeat-reason'].textContent.length > 10, 'defeat reason populated');
  E['btn-retry'].click();
  check(vm.runInContext('app.state.status', sandbox) === 'playing', 'retry restarts after defeat');
  check(vm.runInContext('app.state.turn', sandbox) === 1, 'retry resets to turn 1');
  E['btn-abort'].click();
  check(E['screen-select'].classList.contains('hidden') === false, 'abort returns to mission select');

  // Mute + fullscreen toggles
  windowListeners.keydown.forEach(f => f({ key: 'm' }));
  windowListeners.keydown.forEach(f => f({ key: 'f' }));

  await frames(30);
  console.log(failures === 0 ? '\nUI SMOKE TEST: ALL CHECKS PASSED' : `\nUI SMOKE TEST: ${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(2); });
