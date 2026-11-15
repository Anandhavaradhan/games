'use strict';

const W = 960;
const H = 600;
const PROBE_R = 6;
const GOAL_R = 22;
const MAX_SPEED = 650;
const BOUNDS = 90;
const DT = 1 / 60;

const LEVELS = [
  {
    name: 'First Light',
    par: 1,
    start: { x: 120, y: 300 },
    goal: { x: 840, y: 300 },
    bodies: [
      { kind: 'planet', x: 480, y: 470, r: 55, m: 1.2e6, hue: 210 },
    ],
  },
  {
    name: 'Around the Horn',
    par: 1,
    start: { x: 120, y: 470 },
    goal: { x: 840, y: 470 },
    bodies: [
      { kind: 'planet', x: 480, y: 270, r: 70, m: 2.6e6, hue: 20 },
    ],
  },
  {
    name: 'Slingshot',
    par: 2,
    start: { x: 120, y: 300 },
    goal: { x: 820, y: 110 },
    bodies: [
      { kind: 'planet', x: 480, y: 370, r: 75, m: 3.2e6, hue: 280 },
    ],
  },
  {
    name: 'The Needle',
    par: 2,
    start: { x: 100, y: 300 },
    goal: { x: 860, y: 300 },
    bodies: [
      { kind: 'planet', x: 390, y: 185, r: 55, m: 2.2e6, hue: 160 },
      { kind: 'planet', x: 570, y: 415, r: 55, m: 2.2e6, hue: 160 },
    ],
  },
  {
    name: 'Clockwork',
    par: 2,
    start: { x: 120, y: 300 },
    goal: { x: 840, y: 300 },
    bodies: [
      { kind: 'planet', x: 480, y: 300, r: 58, m: 2.4e6, hue: 45 },
      { kind: 'moon', parent: 0, orbit: 150, speed: 1.4, phase: 0, r: 20, m: 5e5, hue: 40 },
    ],
  },
  {
    name: 'Push Back',
    par: 2,
    start: { x: 120, y: 380 },
    goal: { x: 840, y: 150 },
    bodies: [
      { kind: 'repulsor', x: 480, y: 430, r: 38, m: -2.2e6, hue: 0 },
    ],
  },
  {
    name: 'Binary',
    par: 3,
    start: { x: 90, y: 140 },
    goal: { x: 880, y: 460 },
    bodies: [
      { kind: 'planet', x: 330, y: 330, r: 52, m: 2.0e6, hue: 200 },
      { kind: 'planet', x: 640, y: 270, r: 52, m: 2.0e6, hue: 330 },
    ],
  },
  {
    name: 'Moonshot',
    par: 3,
    start: { x: 100, y: 500 },
    goal: { x: 850, y: 120 },
    bodies: [
      { kind: 'planet', x: 620, y: 320, r: 62, m: 3.0e6, hue: 120 },
      { kind: 'moon', parent: 0, orbit: 155, speed: -1.6, phase: 2, r: 20, m: 5e5, hue: 40 },
      { kind: 'planet', x: 280, y: 160, r: 38, m: 1.1e6, hue: 300 },
    ],
  },
  {
    name: 'Minefield',
    par: 3,
    start: { x: 80, y: 300 },
    goal: { x: 880, y: 300 },
    bodies: [
      { kind: 'planet', x: 300, y: 140, r: 34, m: 1.3e6, hue: 25 },
      { kind: 'planet', x: 300, y: 460, r: 34, m: 1.3e6, hue: 25 },
      { kind: 'planet', x: 620, y: 140, r: 34, m: 1.3e6, hue: 25 },
      { kind: 'planet', x: 620, y: 460, r: 34, m: 1.3e6, hue: 25 },
      { kind: 'planet', x: 460, y: 300, r: 42, m: 1.6e6, hue: 25 },
    ],
  },
  {
    name: 'Grand Tour',
    par: 4,
    start: { x: 100, y: 110 },
    goal: { x: 860, y: 520 },
    bodies: [
      { kind: 'planet', x: 300, y: 430, r: 58, m: 2.8e6, hue: 15 },
      { kind: 'planet', x: 660, y: 180, r: 58, m: 2.8e6, hue: 190 },
      { kind: 'repulsor', x: 490, y: 300, r: 32, m: -1.6e6, hue: 0 },
    ],
  },
];

function bodyPos(b, t, bodies) {
  if (b.kind === 'moon') {
    const p = bodyPos(bodies[b.parent], t, bodies);
    const a = b.phase + t * b.speed;
    return { x: p.x + Math.cos(a) * b.orbit, y: p.y + Math.sin(a) * b.orbit };
  }
  return { x: b.x, y: b.y };
}

function accel(px, py, t, bodies) {
  let ax = 0;
  let ay = 0;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    const p = bodyPos(b, t, bodies);
    const dx = p.x - px;
    const dy = p.y - py;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const dc = Math.max(d, b.r);
    const a = b.m / (dc * dc);
    ax += (a * dx) / d;
    ay += (a * dy) / d;
  }
  return { ax, ay };
}

function stepSim(s, t, bodies, dt) {
  const { ax, ay } = accel(s.x, s.y, t, bodies);
  s.vx += ax * dt;
  s.vy += ay * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
}

function collisionAt(px, py, t, bodies) {
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    const p = bodyPos(b, t, bodies);
    const dx = px - p.x;
    const dy = py - p.y;
    if (dx * dx + dy * dy < (b.r + PROBE_R) * (b.r + PROBE_R)) return i;
  }
  return -1;
}

function outOfBounds(px, py) {
  return px < -BOUNDS || px > W + BOUNDS || py < -BOUNDS || py > H + BOUNDS;
}

function reachedGoal(px, py, goal) {
  const dx = px - goal.x;
  const dy = py - goal.y;
  return dx * dx + dy * dy < GOAL_R * GOAL_R;
}

if (typeof module !== 'undefined') {
  module.exports = {
    W, H, PROBE_R, GOAL_R, MAX_SPEED, BOUNDS, DT, LEVELS,
    bodyPos, accel, stepSim, collisionAt, outOfBounds, reachedGoal,
  };
}
