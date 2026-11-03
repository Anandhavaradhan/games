/* =========================================================
   HOLLOWMERE — keeping the sign-in when the browser blocks site storage
   Some phones / browsers refuse this site any storage at all ("Access is denied for this document").
   Then the sign-in can only live in the page's memory, and it is lost the moment the lobby hands
   over to the night (a page change) — the player arrives as a stranger: "You are not part of this night".

   As a LAST resort (only when localStorage AND sessionStorage are both refused) the sign-in is kept in
   the tab's own name slot (window.name), which survives page changes inside the same tab.
   It is wiped again whenever the page is left by any way OTHER than the game's own buttons and links
   (which call keepTabCarry() first), so it never lingers for another site opened in the same tab.
   ========================================================= */
const PREFIX = 'hm1:';
let keepUntil = 0;

function canStore(name) {
  try { const s = window[name]; const k = '__hm_t'; s.setItem(k, '1'); s.removeItem(k); return true; }
  catch (e) { return false; }
}
export const storageBlocked = () => !canStore('localStorage') && !canStore('sessionStorage');

function readAll() {
  try { const n = String(window.name || ''); return n.indexOf(PREFIX) === 0 ? (JSON.parse(n.slice(PREFIX.length)) || {}) : {}; }
  catch (e) { return {}; }
}
function writeAll(d) {
  try { window.name = Object.keys(d).length ? PREFIX + JSON.stringify(d) : ''; } catch (e) {}
}

/* a Firebase Auth persistence (same shape as the SDK's own) backed by window.name */
export class TabNamePersistence {
  constructor() { this.type = 'LOCAL'; }
  async _isAvailable() { return true; }
  async _set(key, value) { const d = readAll(); d[key] = value; writeAll(d); }
  async _get(key) { const d = readAll(); return d[key] === undefined ? null : d[key]; }
  async _remove(key) { const d = readAll(); delete d[key]; writeAll(d); }
  _addListener() {}
  _removeListener() {}
}
TabNamePersistence.type = 'LOCAL';

/* the game's own page changes call this first, so the sign-in comes along */
export function keepTabCarry() { keepUntil = Date.now() + 5000; }
if (typeof window !== 'undefined') {
  window.hmKeepTab = keepTabCarry;
  /* a tap on any link to this site's own pages counts too */
  document.addEventListener('click', e => {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a && a.origin === location.origin) keepTabCarry();
  }, true);
  addEventListener('pagehide', () => {
    if (Date.now() > keepUntil && String(window.name || '').indexOf(PREFIX) === 0) { try { window.name = ''; } catch (e) {} }
  });
}
