/* =========================================================
   HOLLOWMERE — ACCOUNTS & PROGRESS (Firebase Auth + Firestore)
   The game loads this file on its own; if it is missing, the
   config is empty, or Firebase can't be reached, the game simply
   stays in guest mode.
   ========================================================= */
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';
/* Some phones / browsers block this site's storage ("Access is denied for this document").
   Firebase normally keeps the sign-in in storage and crashes with auth/internal-error when it
   can't, so we only hand it the kinds of storage that actually work here, and fall back to
   keeping the sign-in in memory (it then lasts until the page is closed or reloaded). */
export function storageOk(name) {
  try { const s = window[name]; const k = '__hm_t'; s.setItem(k, '1'); s.removeItem(k); return true; }
  catch (e) { return false; }
}
function idbOk() { try { return !!window.indexedDB; } catch (e) { return false; } }
function makeAuth(A, app) {
  const p = [];
  if (idbOk() && storageOk('localStorage')) p.push(A.indexedDBLocalPersistence);
  if (storageOk('localStorage')) p.push(A.browserLocalPersistence);
  if (storageOk('sessionStorage')) p.push(A.browserSessionPersistence);
  p.push(A.inMemoryPersistence);
  try { return A.initializeAuth(app, { persistence: p, popupRedirectResolver: A.browserPopupRedirectResolver }); }
  catch (e) { return A.getAuth(app); }   /* already set up by the other module on this page */
}
const STORAGE_MSG = 'Your browser is blocking this site from saving data, so sign-in can\u2019t work. ' +
  'Allow cookies and site data for anandhavaradhan.github.io (Chrome: tap the icon left of the address \u2192 ' +
  'Cookies and site data / Site settings \u2192 Allow), turn off Incognito or "block all cookies", ' +
  'or open the game in Chrome itself instead of inside another app. Then reload.';
function storageBlocked(e) {
  const m = (e && e.message) || '';
  return /localStorage|sessionStorage|indexedDB|Access is denied/i.test(m) || (!storageOk('localStorage') && !storageOk('sessionStorage') && (e && e.code) === 'auth/internal-error');
}

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
  auth = makeAuth(A, app);
  db = F.getFirestore(app);
  A.onAuthStateChanged(auth, u => onUser(toUser(u)));
  return true;
}

/* accounts stay signed in on this device. (Co-op guests are signed in for the tab only — see
   multiplayer.js — so a real sign-in switches this back to "remember me" first.) */
const keepSignedIn = async () => {
  if (!storageOk('localStorage')) return;   /* blocked: stay with what works (memory / tab) */
  try { await A.setPersistence(auth, A.browserLocalPersistence); } catch (e) {}
};
export async function signInGoogle() {
  await keepSignedIn();
  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try { await A.signInWithPopup(auth, provider); }
  catch (e) {
    if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment'))
      return A.signInWithRedirect(auth, provider);
    throw e;
  }
}
export async function signInEmail(email, password) { await keepSignedIn(); return A.signInWithEmailAndPassword(auth, email, password); }
export async function signUpEmail(name, email, password) {
  await keepSignedIn();
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

/* ---------- USERNAMES: usernames/{key} { uid, name, at } ----------
   One per account, unique across all accounts. The key is the name lower-cased with only
   letters and digits kept, so "KP", "kp" and "K.P" are the same name. firestore.rules only
   let a key be created once, which is what makes a name unique. */
export const usernameKey = n => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const USERNAME_RE = /^[A-Za-z0-9 _.-]{2,24}$/;
/* '' if the name is acceptable, otherwise what is wrong with it */
export function usernameProblem(n) {
  n = String(n || '');
  if (!USERNAME_RE.test(n)) return 'Use 2\u201324 letters, numbers, spaces, dots, dashes or underscores.';
  if (usernameKey(n).length < 2) return 'Use at least 2 letters or numbers.';
  return '';
}
/* the best valid username that can be made from any text (never guaranteed to be free) */
export function cleanUsername(n) {
  return String(n || '').replace(/[^A-Za-z0-9 _.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24).trim();
}
/* { uid, name } of whoever holds this username, or null if it is free */
export async function usernameOwner(name) {
  const key = usernameKey(name);
  if (!key) return null;
  const snap = await F.getDoc(F.doc(db, 'usernames', key));
  return snap.exists() ? snap.data() : null;
}
/* claim `name` for uid. oldName (only if it is this uid's own claim) is released in the same write. */
export function claimUsername(uid, name, oldName) {
  const key = usernameKey(name), oldKey = usernameKey(oldName);
  const b = F.writeBatch(db);
  b.set(F.doc(db, 'usernames', key), { uid, name, at: F.serverTimestamp() });
  if (oldKey && oldKey !== key) b.delete(F.doc(db, 'usernames', oldKey));
  return b.commit();
}
/* a co-op entry's name ("A+B") after one of its players changed username. members (newer entries) lists
   the players' accounts in the same order as the names; older entries only have the names, so the old
   name is looked for (also cut short, as long team names are). null = this player is not in it. */
function teamRenamed(name,members,uid,oldName,newName){
  const k=n=>String(n||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const segs=String(name||'').split('+');
  let i=Array.isArray(members)&&members.length===segs.length?members.indexOf(uid):-1;
  if(i<0&&oldName){const ok=k(oldName);
    i=segs.findIndex(sg=>k(sg)===ok);
    if(i<0)i=segs.findIndex(sg=>k(sg).length>=3&&ok.indexOf(k(sg))===0&&String(name).length>=36);}
  if(i<0||segs[i]===newName)return null;
  segs[i]=newName;
  let t=segs.join('+');
  if(t.length>40){const each=Math.max(3,Math.floor((40-(segs.length-1))/segs.length));t=segs.map(n=>n.slice(0,each)).join('+').slice(0,40);}
  return t;
}
/* after a username change, the player's escapes carry the new name: their own solo ones, and every
   co-op entry that lists them as a member (older co-op entries can only be fixed from admin.html) */
export async function renameEscapes(uid, name, oldName) {
  const snap = await F.getDocs(F.query(F.collection(db, 'escapes'), F.where('uid', '==', uid), F.where('team', '==', false)));
  const todo = snap.docs.filter(d => d.data().name !== name).map(d => [d.ref, name]);
  try {
    const ts = await F.getDocs(F.query(F.collection(db, 'escapes'), F.where('members', 'array-contains', uid)));
    ts.docs.forEach(d => { const v = d.data(), t = teamRenamed(v.name, v.members, uid, oldName, name); if (t && t !== v.name) todo.push([d.ref, t]); });
  } catch (e) { console.warn('Team entries not renamed:', e); }
  for (let i = 0; i < todo.length; i += 400) {
    const b = F.writeBatch(db);
    todo.slice(i, i + 400).forEach(([ref, n]) => b.update(ref, { name: n }));
    await b.commit();
  }
}

/* ---------- ESCAPES: escapes/{id}, one public document for EVERY escape ----------
   { uid, name, time (seconds, 0.1 s), legend, deaths, embers, team, at }
   Solo escapes get a random id. A co-op night uses a fixed id (mp_ROOM_GO) so the
   team appears once: the first teammate out creates it, the rules refuse the rest. */
export const DIFFS = ['easy', 'normal', 'hard', 'nightmare'];
/* entries posted before difficulty levels existed were all played at Normal */
export const diffOf = r => (r && DIFFS.indexOf(r.diff) >= 0) ? r.diff : 'normal';
export const authUid = () => (auth && auth.currentUser) ? auth.currentUser.uid : null;
function escapeDoc(uid, e) {
  return Object.assign({
    uid,
    name: String(e.name || 'Ghost').slice(0, 40),
    time: Math.round(e.time * 10) / 10,
    legend: String(e.legend || '').slice(0, 40),
    deaths: Math.max(0, Math.floor(e.deaths || 0)),
    embers: Math.max(0, Math.min(40, Math.floor(e.embers || 0))),
    team: !!e.team,
    diff: DIFFS.indexOf(e.diff) >= 0 ? e.diff : 'normal',
    at: F.serverTimestamp()
  }, (e.team && Array.isArray(e.members) && e.members.length) ? { members: e.members.slice(0, 8).map(String) } : {});
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
/* one difficulty's board (fastest first). Filtered here rather than in the query, so old entries
   with no difficulty count as Normal and no extra Firestore index is needed. */
export async function loadEscapes(n, diff) {
  const snap = await F.getDocs(F.query(F.collection(db, 'escapes'), F.orderBy('time'), F.limit(Math.max(2000, n))));
  const ms = v => (v && typeof v.toMillis === 'function') ? v.toMillis() : 0;
  return snap.docs.map(d => Object.assign({ id: d.id }, d.data()))
    .filter(r => !diff || diffOf(r) === diff)
    .sort((a, b) => a.time - b.time || ms(a.at) - ms(b.at)).slice(0, n);
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

/* ---------- FRIENDS ----------
   friendReqs/{toUid}_{fromUid}  { from, fromName, to, toName, at }   a request waiting for an answer
   friends/{uid}/list/{friendUid} { name, since }                     each side keeps its own list
   Accepting writes BOTH lists and removes the request in one batch; firestore.rules only allow a
   list entry when a matching request exists. Either friend can end the friendship. */
const reqId = (to, from) => to + '_' + from;
export function sendFriendRequest(me, myName, to, toName) {
  return F.setDoc(F.doc(db, 'friendReqs', reqId(to, me)), { from: me, fromName: myName, to, toName, at: F.serverTimestamp() });
}
export function cancelFriendRequest(to, from) { return F.deleteDoc(F.doc(db, 'friendReqs', reqId(to, from))); }
/* answer a request sent TO me */
export function answerFriendRequest(me, myName, req, accept) {
  const b = F.writeBatch(db);
  if (accept) {
    b.set(F.doc(db, 'friends', me, 'list', req.from), { name: req.fromName, since: F.serverTimestamp() });
    b.set(F.doc(db, 'friends', req.from, 'list', me), { name: myName, since: F.serverTimestamp() });
  }
  b.delete(F.doc(db, 'friendReqs', reqId(me, req.from)));
  return b.commit();
}
export function removeFriend(me, fid) {
  const b = F.writeBatch(db);
  b.delete(F.doc(db, 'friends', me, 'list', fid));
  b.delete(F.doc(db, 'friends', fid, 'list', me));
  return b.commit();
}
/* after a username change: my name in each friend's list */
export async function renameInFriends(me, name, fids) {
  for (const f of fids) { try { await F.updateDoc(F.doc(db, 'friends', f, 'list', me), { name }); } catch (e) {} }
}
/* live lists; each callback gets an array. Returns an unsubscribe function. */
export function watchFriends(me, cbFriends, cbIn, cbOut) {
  const u1 = F.onSnapshot(F.collection(db, 'friends', me, 'list'),
    s => cbFriends(s.docs.map(d => Object.assign({ uid: d.id }, d.data()))), e => console.warn('Friends read failed:', e));
  const u2 = F.onSnapshot(F.query(F.collection(db, 'friendReqs'), F.where('to', '==', me)),
    s => cbIn(s.docs.map(d => d.data())), e => console.warn('Requests read failed:', e));
  const u3 = F.onSnapshot(F.query(F.collection(db, 'friendReqs'), F.where('from', '==', me)),
    s => cbOut(s.docs.map(d => d.data())), e => console.warn('Requests read failed:', e));
  return () => { u1(); u2(); u3(); };
}

/* ---------- GUEST ACCOUNTS: guestStats/total { seconds, active, escapes, at } ----------
   Guests are temporary and never get a record of their own, but everything they play is added to
   this one running total, which only an admin can read. firestore.rules limit each write to
   +120 s and +1 escape. */
export function addGuestStats(seconds, active, escapes) {
  return F.setDoc(F.doc(db, 'guestStats', 'total'), {
    seconds: F.increment(Math.max(0, Math.floor(seconds))),
    active: F.increment(Math.max(0, Math.floor(active))),
    escapes: F.increment(Math.max(0, Math.floor(escapes))),
    at: F.serverTimestamp()
  }, { merge: true });
}

/* true when this account is listed in admins/{uid} (only the account itself can read that) */
export async function isAdmin(uid) {
  try { return (await F.getDoc(F.doc(db, 'admins', uid))).exists(); } catch (e) { return false; }
}

export function friendlyError(e) {
  const c = (e && e.code) || '';
  if (storageBlocked(e)) return STORAGE_MSG;
  const map = {
    'auth/invalid-credential': "That email and password don't match an account.",
    'auth/wrong-password': "That email and password don't match an account.",
    'auth/user-not-found': "That email and password don't match an account.",
    'auth/invalid-login-credentials': "That email and password don't match an account.",
    /* one Hollowmere account per email: a Gmail address that signed in with Google cannot get a second one */
    'auth/email-already-in-use': 'That email already has a Hollowmere account. Sign in instead \u2014 if it is a Google account, use "Continue with Google".',
    'auth/account-exists-with-different-credential': 'That email already has a Hollowmere account with a different sign-in. Use the way you signed in before.',
    'auth/weak-password': 'Use a password of at least 6 characters.',
    'auth/invalid-email': "That email address isn't valid.",
    'auth/missing-password': 'Enter your password.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/unauthorized-domain': "This website isn't authorised yet. In Firebase, add it under Authentication → Settings → Authorised domains.",
    'auth/operation-not-allowed': "This sign-in method is switched off. Enable it in Firebase under Authentication → Sign-in method.",
    'permission-denied': 'The database refused the save. Publish firestore.rules in the Firebase console.',
    'already-exists': 'That username is already taken. Try another.',
    'unavailable': 'No connection to the database. Progress is kept on this device and will sync later.'
  };
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return '';
  return map[c] || (e && e.message) || 'Something went wrong.';
}
