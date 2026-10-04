/* =========================================================
   HOLLOWMERE — CO-OP NETWORKING (Firebase Realtime Database)
   Used by lobby.html (make / join a room) and by index.html when it is
   opened as  index.html?room=CODE  (the night itself).

   Database layout (see database.rules.json):
     rooms/{code}/meta            { host, status: lobby|started|running, createdAt, config, go }
     rooms/{code}/players/{uid}   { name, joinedAt, ready }
     live/{code}/state/{uid}      this player's position / pose, ~10 times a second
     live/{code}/mon/{uid}        the monster this player owns, ~10 times a second
     live/{code}/embers/{index}   uid of whoever took that ember
     live/{code}/ev/{pushId}      short-lived events (powers that touch other players' monsters)

   Nobody is "the server": every player simulates their own monster and
   everyone sees the others' monsters as they are reported.
   ========================================================= */
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
export const MAX_PLAYERS = 8;
export const configured = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.databaseURL);

/* the manor grows with the party: the three fixed floors plus the attic, plus one more floor per player */
export const floorsFor = n => 3 + Math.max(1, Math.min(MAX_PLAYERS, n | 0));

let A = null, D = null, auth = null, db = null;
let offset = 0;
export let me = null;                       /* { uid, name } once init() has resolved */
export const srvNow = () => Date.now() + offset;

const NAME_KEY = 'hollowmere_mp_name';
export function savedName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } }
export function saveName(n) { try { localStorage.setItem(NAME_KEY, n); } catch (e) {} if (me) me.name = n; }
const cleanName = n => String(n || '').replace(/[<>&"']/g, '').trim().slice(0, 24);

export async function init() {
  if (!configured) throw new Error('NOT_CONFIGURED');
  if (db) return me;
  const [appMod, authMod, dbMod] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-database.js')]);
  A = authMod; D = dbMod;
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(firebaseConfig);
  auth = A.getAuth(app);
  db = D.getDatabase(app, firebaseConfig.databaseURL);
  if (auth.authStateReady) await auth.authStateReady();
  /* signed-in players keep their account; everyone else plays under an anonymous id that survives reloads */
  if (!auth.currentUser) await A.signInAnonymously(auth);
  const u = auth.currentUser;
  const guess = savedName() || u.displayName || ('Ghost ' + (1000 + Math.floor(Math.random() * 9000)));
  me = { uid: u.uid, name: cleanName(guess) || 'Ghost' };
  D.onValue(D.ref(db, '.info/serverTimeOffset'), s => { offset = Number(s.val()) || 0; });
  return me;
}

const R = p => D.ref(db, p);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

/* ---------------------------------------------------------- lobby */
export async function createRoom() {
  for (let i = 0; i < 6; i++) {
    const code = makeCode();
    const res = await D.runTransaction(R('rooms/' + code + '/meta'), cur =>
      cur === null ? { host: me.uid, status: 'lobby', createdAt: srvNow() } : undefined);
    if (res.committed) { await addPlayer(code); return code; }
  }
  throw new Error('Could not find a free room code. Try again.');
}

async function addPlayer(code) {
  const pr = R('rooms/' + code + '/players/' + me.uid);
  await D.set(pr, { name: me.name, joinedAt: srvNow(), ready: false });
  D.onDisconnect(pr).remove();            /* closing the lobby tab leaves the room */
}

export async function joinRoom(code) {
  code = normCode(code);
  if (code.length !== 5) throw new Error('A room code is five letters and numbers.');
  const snap = await D.get(R('rooms/' + code));
  const room = snap.val();
  if (!room || !room.meta) throw new Error('No room with that code.');
  const players = room.players || {};
  if (!players[me.uid]) {
    if (room.meta.status !== 'lobby') throw new Error('That night has already begun.');
    if (Object.keys(players).length >= MAX_PLAYERS) throw new Error('That room is full (' + MAX_PLAYERS + ' players).');
    await addPlayer(code);
  }
  return code;
}

export function watchRoom(code, cb) {
  return D.onValue(R('rooms/' + code), s => cb(s.val()));
}
export function rename(code, name) {
  name = cleanName(name) || me.name; saveName(name);
  return D.update(R('rooms/' + code + '/players/' + me.uid), { name });
}

export async function leaveRoom(code) {
  const room = (await D.get(R('rooms/' + code))).val();
  const pr = R('rooms/' + code + '/players/' + me.uid);
  D.onDisconnect(pr).cancel();
  await D.remove(pr);
  if (!room) return;
  const rest = Object.entries(room.players || {}).filter(([u]) => u !== me.uid).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
  if (room.meta && room.meta.host === me.uid) {
    if (rest.length && room.meta.status === 'lobby') await D.update(R('rooms/' + code + '/meta'), { host: rest[0][0] });
    else if (!rest.length) await D.remove(R('rooms/' + code));
  }
}

/* host only: freeze the player list and decide how big the night is */
export async function startRoom(code) {
  const room = (await D.get(R('rooms/' + code))).val();
  if (!room || !room.meta || room.meta.host !== me.uid) throw new Error('Only the host can begin the night.');
  const order = Object.entries(room.players || {}).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0) || (a[0] < b[0] ? -1 : 1)).map(e => e[0]);
  const n = order.length;
  const config = { seed: 1 + Math.floor(Math.random() * 2147483646), n, floors: floorsFor(n), monsters: n, order };
  await D.update(R('rooms/' + code + '/meta'), { status: 'started', config });
  return config;
}

/* called just before the page navigates to the game, so the move does not look like leaving */
export async function keepPresence(code) {
  try { await D.onDisconnect(R('rooms/' + code + '/players/' + me.uid)).cancel(); } catch (e) {}
}

/* ---------------------------------------------------------- the night */
export async function fetchRoom(code) { return (await D.get(R('rooms/' + code))).val(); }

export async function enterGame(code) {
  const room = await fetchRoom(code);
  if (!room || !room.meta || !room.meta.config) throw new Error('That night has not begun.');
  if (!(room.meta.config.order || []).includes(me.uid)) throw new Error('You are not part of this night.');
  await D.update(R('rooms/' + code + '/players/' + me.uid), { name: me.name, ready: false });
  D.onDisconnect(R('live/' + code + '/state/' + me.uid)).remove();
  D.onDisconnect(R('live/' + code + '/mon/' + me.uid)).remove();
  return room;
}
export const setReady = (code, v) => D.update(R('rooms/' + code + '/players/' + me.uid), { ready: !!v });
export const beginNight = (code, delayMs) =>
  D.update(R('rooms/' + code + '/meta'), { status: 'running', go: srvNow() + delayMs });

export const publishState = (code, o) => D.set(R('live/' + code + '/state/' + me.uid), o);
export const publishMon = (code, o) => D.set(R('live/' + code + '/mon/' + me.uid), o);
export const takeEmber = (code, i) => D.set(R('live/' + code + '/embers/' + i), me.uid).catch(() => {});

/* cb(key, value|null) — value null means the entry was removed */
function watchChildren(path, cb) {
  const r = R(path);
  const u1 = D.onChildAdded(r, s => cb(s.key, s.val()));
  const u2 = D.onChildChanged(r, s => cb(s.key, s.val()));
  const u3 = D.onChildRemoved(r, s => cb(s.key, null));
  return () => { u1(); u2(); u3(); };
}
export const watchStates = (code, cb) => watchChildren('live/' + code + '/state', cb);
export const watchMons = (code, cb) => watchChildren('live/' + code + '/mon', cb);
export const watchEmbers = (code, cb) => {
  const u = D.onChildAdded(R('live/' + code + '/embers'), s => cb(Number(s.key), s.val()));
  return u;
};

export function sendEvent(code, ev) {
  const r = D.push(R('live/' + code + '/ev'));
  D.set(r, Object.assign({}, ev, { from: me.uid, ts: srvNow() })).catch(() => {});
  setTimeout(() => { D.remove(r).catch(() => {}); }, 20000);
}
export function watchEvents(code, cb) {
  const since = srvNow() - 1500;
  return D.onChildAdded(R('live/' + code + '/ev'), s => {
    const v = s.val();
    if (!v || v.from === me.uid || (v.ts || 0) < since) return;
    cb(v);
  });
}

export async function leaveGame(code) {
  try {
    D.onDisconnect(R('live/' + code + '/state/' + me.uid)).cancel();
    D.onDisconnect(R('live/' + code + '/mon/' + me.uid)).cancel();
    await Promise.all([D.remove(R('live/' + code + '/state/' + me.uid)), D.remove(R('live/' + code + '/mon/' + me.uid))]);
  } catch (e) {}
}

export function friendlyError(e) {
  const c = (e && e.code) || '', m = (e && e.message) || '';
  if (m === 'NOT_CONFIGURED') return 'Co-op is not switched on yet: add the Realtime Database URL to firebase-config.js (see MULTIPLAYER.md).';
  if (c === 'auth/operation-not-allowed' || c === 'auth/admin-restricted-operation')
    return 'Turn on Anonymous sign-in in Firebase (Authentication → Sign-in method) so friends can join without an account.';
  if (c === 'auth/unauthorized-domain') return "This website isn't authorised yet. Add it in Firebase under Authentication → Settings → Authorised domains.";
  if (c === 'auth/network-request-failed' || c === 'unavailable') return 'No connection. Check your internet and try again.';
  if (/permission_denied/i.test(m) || /permission denied/i.test(m) || c === 'PERMISSION_DENIED')
    return 'The database refused that. Publish database.rules.json in the Firebase console (Realtime Database → Rules).';
  return m || 'Something went wrong.';
}
