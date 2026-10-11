/* =========================================================
   HOLLOWMERE — ACCOUNTS & PROGRESS (Firebase Auth + Firestore)
   The game loads this file on its own; if it is missing, the
   config is empty, or Firebase can't be reached, the game simply
   stays in guest mode.
   ========================================================= */
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
export const configured = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

let auth = null, db = null, A = null, F = null;

function toUser(u) {
  if (!u) return null;
  const provider = (u.providerData && u.providerData[0] && u.providerData[0].providerId) || 'password';
  const name = (u.displayName || (u.email ? u.email.split('@')[0] : 'Ghost')).slice(0, 40);
  return { uid: u.uid, name, email: u.email || '', provider, anon: !!u.isAnonymous };
}

/* onUser(user|null) fires on load (restored session) and on every sign-in / sign-out */
export async function init(onUser) {
  if (!configured) return false;
  const [appMod, authMod, fsMod] = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-firestore.js')
  ]);
  A = authMod; F = fsMod;
  const app = appMod.initializeApp(firebaseConfig);
  auth = A.getAuth(app);
  db = F.getFirestore(app);
  A.onAuthStateChanged(auth, u => onUser(toUser(u)));
  return true;
}

export async function signInGoogle() {
  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try { await A.signInWithPopup(auth, provider); }
  catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment'))
      return A.signInWithRedirect(auth, provider);
    throw e;
  }
}
export function signInEmail(email, password) { return A.signInWithEmailAndPassword(auth, email, password); }
export async function signUpEmail(name, email, password) {
  const cred = await A.createUserWithEmailAndPassword(auth, email, password);
  if (name) await A.updateProfile(cred.user, { displayName: name.slice(0, 40) });
  return toUser(cred.user);
}
export function resetPassword(email) { return A.sendPasswordResetEmail(auth, email); }
export function signOut() { return A.signOut(auth); }

export async function loadPlayer(uid) {
  const snap = await F.getDoc(F.doc(db, 'players', uid));
  return snap.exists() ? snap.data() : null;
}

/* merge-writes the whole progress record; `live` is what the admin page shows as "in the house now" */
export function savePlayer(uid, data, opts) {
  const d = Object.assign({}, data, { lastSeen: F.serverTimestamp() });
  if (d.live) d.live = Object.assign({}, d.live, { updatedAt: F.serverTimestamp() });
  if (opts && opts.create) d.createdAt = F.serverTimestamp();
  return F.setDoc(F.doc(db, 'players', uid), d, { merge: true });
}

/* one document per run (every death and every escape) */
export function logRun(uid, run) {
  return F.addDoc(F.collection(db, 'players', uid, 'runs'), Object.assign({}, run, { at: F.serverTimestamp() }));
}

/* ---------- LEADERBOARD: leaderboard/{uid}, one public entry per signed-in player ----------
   firestore.rules only accept a time at least as fast as the one already stored. */
export function submitBest(uid, entry) {
  return F.setDoc(F.doc(db, 'leaderboard', uid), {
    name: String(entry.name || 'Ghost').slice(0, 40),
    bestTime: entry.bestTime,
    legend: String(entry.legend || '').slice(0, 40),
    deaths: Math.max(0, Math.floor(entry.deaths || 0)),
    embers: Math.max(0, Math.min(8, Math.floor(entry.embers || 0))),
    at: F.serverTimestamp()
  });
}
export async function loadEntry(uid) {
  const snap = await F.getDoc(F.doc(db, 'leaderboard', uid));
  return snap.exists() ? snap.data() : null;
}
/* fastest first; equal times go to whoever set theirs first */
export async function loadLeaderboard(n) {
  const snap = await F.getDocs(F.query(F.collection(db, 'leaderboard'), F.orderBy('bestTime'), F.limit(n)));
  const ms = v => (v && typeof v.toMillis === 'function') ? v.toMillis() : 0;
  return snap.docs.map(d => Object.assign({ uid: d.id }, d.data()))
    .sort((a, b) => a.bestTime - b.bestTime || ms(a.at) - ms(b.at));
}
/* 1 + how many entries are strictly faster (a cheap count query, not a full read) */
export async function rankOf(time) {
  const snap = await F.getCountFromServer(F.query(F.collection(db, 'leaderboard'), F.where('bestTime', '<', time)));
  return snap.data().count + 1;
}
/* the run-log entry for an escape with this exact night time, if there is one */
export async function findEscape(uid, nightTime) {
  const snap = await F.getDocs(F.query(F.collection(db, 'players', uid, 'runs'), F.where('nightTime', '==', nightTime), F.limit(5)));
  return snap.docs.map(d => d.data()).find(r => r.result === 'escape') || null;
}

/* ---------- ESCAPES: escapes/{id}, one public document for EVERY escape ----------
   { uid, name, time (seconds, 0.1 s), legend, deaths, embers, team, at }
   Solo escapes get a random id. A co-op night uses a fixed id (mp_ROOM_GO) so the
   team appears once: the first teammate out creates it, the rules refuse the rest. */
export const authUid = () => (auth && auth.currentUser) ? auth.currentUser.uid : null;
function escapeDoc(uid, e) {
  return {
    uid,
    name: String(e.name || 'Ghost').slice(0, 40),
    time: Math.round(e.time * 10) / 10,
    legend: String(e.legend || '').slice(0, 40),
    deaths: Math.max(0, Math.floor(e.deaths || 0)),
    embers: Math.max(0, Math.min(40, Math.floor(e.embers || 0))),
    team: !!e.team,
    at: F.serverTimestamp()
  };
}
export async function addEscape(uid, e, id) {
  if (id) { await F.setDoc(F.doc(db, 'escapes', id), escapeDoc(uid, e)); return id; }
  const r = await F.addDoc(F.collection(db, 'escapes'), escapeDoc(uid, e));
  return r.id;
}
export async function loadEscape(id) {
  const snap = await F.getDoc(F.doc(db, 'escapes', id));
  return snap.exists() ? snap.data() : null;
}
export async function loadEscapes(n) {
  const snap = await F.getDocs(F.query(F.collection(db, 'escapes'), F.orderBy('time'), F.limit(n)));
  const ms = v => (v && typeof v.toMillis === 'function') ? v.toMillis() : 0;
  return snap.docs.map(d => Object.assign({ id: d.id }, d.data()))
    .sort((a, b) => a.time - b.time || ms(a.at) - ms(b.at));
}
export async function escapeRank(time) {
  const snap = await F.getCountFromServer(F.query(F.collection(db, 'escapes'), F.where('time', '<', time)));
  return snap.data().count + 1;
}

/* ---------- MOST TIME PLAYED: playtime/{uid} { name, seconds, at } ----------
   Only ACTIVE seconds (the game decides what counts). firestore.rules refuse any
   update that adds more seconds than real time has passed since the last one,
   so the total can never grow faster than the clock on the wall. */
export async function loadPlaytime(uid) {
  const snap = await F.getDoc(F.doc(db, 'playtime', uid));
  return snap.exists() ? snap.data() : null;
}
export function savePlaytime(uid, name, seconds) {
  return F.setDoc(F.doc(db, 'playtime', uid), {
    name: String(name || 'Ghost').slice(0, 40),
    seconds: Math.max(0, Math.floor(seconds)),
    at: F.serverTimestamp()
  });
}
export async function loadPlaytimeBoard(n) {
  const snap = await F.getDocs(F.query(F.collection(db, 'playtime'), F.orderBy('seconds', 'desc'), F.limit(n)));
  return snap.docs.map(d => Object.assign({ uid: d.id }, d.data()));
}
export async function playtimeRank(seconds) {
  const snap = await F.getCountFromServer(F.query(F.collection(db, 'playtime'), F.where('seconds', '>', seconds)));
  return snap.data().count + 1;
}

export function friendlyError(e) {
  const c = (e && e.code) || '';
  const map = {
    'auth/invalid-credential': "That email and password don't match an account.",
    'auth/wrong-password': "That email and password don't match an account.",
    'auth/user-not-found': "That email and password don't match an account.",
    'auth/invalid-login-credentials': "That email and password don't match an account.",
    'auth/email-already-in-use': 'An account already uses that email. Sign in instead.',
    'auth/weak-password': 'Use a password of at least 6 characters.',
    'auth/invalid-email': "That email address isn't valid.",
    'auth/missing-password': 'Enter your password.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/unauthorized-domain': "This website isn't authorised yet. In Firebase, add it under Authentication → Settings → Authorised domains.",
    'auth/operation-not-allowed': "This sign-in method is switched off. Enable it in Firebase under Authentication → Sign-in method.",
    'permission-denied': 'The database refused the save. Publish firestore.rules in the Firebase console.',
    'unavailable': 'No connection to the database. Progress is kept on this device and will sync later.'
  };
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return '';
  return map[c] || (e && e.message) || 'Something went wrong.';
}
