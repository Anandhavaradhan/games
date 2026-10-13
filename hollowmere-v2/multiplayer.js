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
/* a guest's name is temporary like the rest of a guest: kept for this tab only */
try { localStorage.removeItem(NAME_KEY); } catch (e) {}
export function savedName() { try { return sessionStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } }
/* a signed-in player's name is their account username and cannot be changed here */
export function saveName(n) { if (me && me.account) return; try { sessionStorage.setItem(NAME_KEY, n); } catch (e) {} if (me) me.name = n; }
const cleanName = n => String(n || '').replace(/[<>&"']/g, '').trim().slice(0, 24);

/* ---- usernames (Firestore, read over its plain web API so this file needs no extra SDK) ----
   Every account has one unique username (see cloud.js / firestore.rules). In co-op a signed-in
   player always plays under it, so the name on the team leaderboard is their real one. */
export const unameKey = n => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const FS = 'https://firestore.googleapis.com/v1/projects/' + (firebaseConfig && firebaseConfig.projectId) + '/databases/(default)/documents/';
async function fsGet(path, token) {
  const r = await fetch(FS + path, token ? { headers: { Authorization: 'Bearer ' + token } } : {});
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('firestore ' + r.status);
  return r.json();
}
const fsStr = (doc, f) => doc && doc.fields && doc.fields[f] && doc.fields[f].stringValue;
/* is this name a registered player's username? (a failed lookup counts as "no") */
export async function nameTaken(name) {
  const k = unameKey(name);
  if (!k) return false;
  try { return !!(await fsGet('usernames/' + k)); } catch (e) { return false; }
}
/* the signed-in account's username, but only if the database confirms they own it; else '' */
async function accountName(user) {
  if (!user || user.isAnonymous) return '';
  try {
    const token = await user.getIdToken();
    const nm = fsStr(await fsGet('players/' + user.uid, token), 'name');
    if (!nm) return '';
    const claim = await fsGet('usernames/' + unameKey(nm));
    return (fsStr(claim, 'uid') === user.uid && fsStr(claim, 'name') === nm) ? nm : '';
  } catch (e) { return ''; }
}
/* is this room member a registered player (they own this username)? Guests never are. */
export async function isRegistered(uid, name) {
  try {
    const claim = await fsGet('usernames/' + unameKey(name));
    return fsStr(claim, 'uid') === uid && fsStr(claim, 'name') === name;
  } catch (e) { return false; }
}
/* a guest may not take a registered username, or a name someone in the room already has */
async function checkGuestName(players) {
  const k = unameKey(me.name);
  if (!me.account) {
    if (k.length < 2) throw new Error('Choose a name with at least 2 letters or numbers.');
    if (await nameTaken(me.name)) throw new Error('"' + me.name + '" belongs to a registered player. Sign in to use it, or choose another name.');
  }
  for (const [uid, p] of Object.entries(players || {}))
    if (uid !== me.uid && p && unameKey(p.name) === k)
      throw new Error('Someone in this room already has the name "' + me.name + '". Choose another.');
}

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
  /* signed-in players keep their account. Everyone else is a GUEST: a temporary anonymous id that
     lasts only while this tab is open (it survives the move from the lobby to the night, and
     nothing longer). Guests never get a record of their own. */
  if (!auth.currentUser) {
    try { await A.setPersistence(auth, A.browserSessionPersistence); } catch (e) {}
    await A.signInAnonymously(auth);
  }
  const u = auth.currentUser;
  const acct = await accountName(u);
  const guess = savedName() || ('Ghost ' + (1000 + Math.floor(Math.random() * 9000)));
  /* account: the real username, locked.  guest: any name, but never someone else's. */
  me = { uid: u.uid, name: acct || cleanName(guess) || 'Ghost', account: !!acct, signedIn: !u.isAnonymous };
  D.onValue(D.ref(db, '.info/serverTimeOffset'), s => { offset = Number(s.val()) || 0; });
  return me;
}

const R = p => D.ref(db, p);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

/* ---------------------------------------------------------- lobby */
export async function createRoom() {
  await checkGuestName({});
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
    await checkGuestName(players);
    if (Object.keys(players).length >= MAX_PLAYERS) throw new Error('That room is full (' + MAX_PLAYERS + ' players).');
    await addPlayer(code);
  }
  return code;
}

export function watchRoom(code, cb) {
  return D.onValue(R('rooms/' + code), s => cb(s.val()));
}
export function rename(code, name) {
  if (me.account) name = me.name;
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

/* host only: freeze the player list and decide how big (and how hard) the night is */
export const DIFFICULTIES = ['easy', 'normal', 'hard', 'nightmare'];
export async function startRoom(code, diff) {
  const room = (await D.get(R('rooms/' + code))).val();
  if (!room || !room.meta || room.meta.host !== me.uid) throw new Error('Only the host can begin the night.');
  const order = Object.entries(room.players || {}).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0) || (a[0] < b[0] ? -1 : 1)).map(e => e[0]);
  const n = order.length;
  const config = { seed: 1 + Math.floor(Math.random() * 2147483646), n, floors: floorsFor(n), monsters: n, order };
  if (DIFFICULTIES.indexOf(diff) >= 0 && diff !== 'normal') config.diff = diff;
  try { await D.update(R('rooms/' + code + '/meta'), { status: 'started', config }); }
  catch (e) {
    /* database.rules.json may not know about difficulty yet: start at Normal rather than not at all */
    if (!config.diff) throw e;
    delete config.diff;
    await D.update(R('rooms/' + code + '/meta'), { status: 'started', config });
  }
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

/* every soul was taken at once: start the shared night over. A new `go` restarts the clock
   for everyone (players who reload pick it up from meta), and the taken embers are cleared.
   Both writes are best-effort — the game also sends the reset as an event. Returns the new go. */
export function resetNight(code, delayMs) {
  const go = srvNow() + delayMs;
  D.update(R('rooms/' + code + '/meta'), { go }).catch(e => console.warn('reset (meta):', e));
  D.remove(R('live/' + code + '/embers')).catch(e => console.warn('reset (embers):', e));
  return go;
}

export const publishState =(code, o) => D.set(R('live/' + code + '/state/' + me.uid), o);
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

/* =========================================================
   FRIENDS & SPECTATING (Realtime Database side)
     presence/{uid}   { n, st: 'title'|'night', mp, d, nf, t }   who is online and what they are doing
     friendsOf/{uid}  { friendUid: true, ... }                    a mirror of this player's friend list
                                                                   (the list itself lives in Firestore)
     watch/{uid}/s    a live snapshot of this player's night, ~4 times a second
     watch/{uid}/ep   where this night's embers are
   database.rules.json lets only the player's FRIENDS read presence/{uid} and watch/{uid}
   (it checks friendsOf/{uid}/{reader}). Only signed-in players with a username take part.
   ========================================================= */
export async function initSocial() { await init(); return me; }
export const authUidNow = () => (auth && auth.currentUser) ? auth.currentUser.uid : null;

export function setFriendsMirror(uid, uids) {
  const map = {};
  uids.forEach(u => { map[u] = true; });
  return D.set(R('friendsOf/' + uid), uids.length ? map : null);
}
let presenceArmed = '';
export function setPresence(uid, o) {
  const r = R('presence/' + uid);
  if (presenceArmed !== uid) { presenceArmed = uid; D.onDisconnect(r).remove(); D.onDisconnect(R('watch/' + uid)).remove(); }
  return D.set(r, Object.assign({}, o, { t: D.serverTimestamp() }));
}
export const clearPresence = uid => Promise.all([D.remove(R('presence/' + uid)), D.remove(R('watch/' + uid))]).catch(() => {});
export const publishWatch = (uid, o) => D.set(R('watch/' + uid + '/s'), o);
export const publishWatchEmbers = (uid, ep) => D.set(R('watch/' + uid + '/ep'), ep);
export const clearWatch = uid => D.remove(R('watch/' + uid)).catch(() => {});

/* cb(value|null). Returns an unsubscribe function. A refused read (not friends) reports null. */
export function onPresence(uid, cb) { return D.onValue(R('presence/' + uid), s => cb(s.val()), () => cb(null)); }
export function onWatch(uid, cbS, cbE) {
  const u1 = D.onValue(R('watch/' + uid + '/s'), s => cbS(s.val()), () => cbS(null));
  const u2 = D.onValue(R('watch/' + uid + '/ep'), s => cbE(s.val()), () => cbE(null));
  return () => { u1(); u2(); };
}

/* =========================================================
   VOICE CHAT signalling — co-op only.
   The voices themselves go straight between players' browsers (WebRTC); the database only carries
   the short "how do I reach you" messages needed to connect:
     live/{code}/rtc/{toUid}/{pushId}  { from, sid, t: 'offer'|'answer'|'ice', d }
   The receiver deletes each message once it has read it.
   ========================================================= */
export function sendRtc(code, to, msg) {
  return D.push(R('live/' + code + '/rtc/' + to), Object.assign({}, msg, { from: me.uid })).catch(() => {});
}
export function onRtc(code, cb) {
  const ref = R('live/' + code + '/rtc/' + me.uid);
  return D.onChildAdded(ref, s => { const v = s.val(); D.remove(s.ref).catch(() => {}); if (v && v.from) cb(v); });
}
/* old messages left from an earlier visit to this room */
export const clearRtc = code => D.remove(R('live/' + code + '/rtc/' + me.uid)).catch(() => {});
