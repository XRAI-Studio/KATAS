// Portal kit for the kata viewer (class standard rule 3). The page loads
// https://class.travelschooling.com/kit/v1/ts-kit.js before main.js; this module wraps
// TSKit.init for the viewer, provides a no-op mock on localhost so `npm run dev` works
// without a portal session, and guards every award against an account switch under an
// open tab (the real kit captures the learner's token once at init). Pure helpers are
// exported for tests/kit.test.mjs.

export const GAME = 'katas';
const DEV_HOSTS = new Set(['localhost', '127.0.0.1']);

export function isDevHost(hostname) {
  return DEV_HOSTS.has(hostname);
}

const EMPTY_AWARD = { awarded_xp: 0, xp: 0, gems: 0, level: 1, streak: 0, level_up: false, new_achievements: [] };

/** A kit that records awards on window.__kitAwards instead of calling the portal. */
export function mockKit(win) {
  const awards = (win.__kitAwards = win.__kitAwards || []);
  return {
    mock: true,
    user: { id: 'dev', displayName: 'Dev Learner', role: 'student' },
    totals: { xp: 0, gems: 0, level: 1, streak: 0 },
    launcherUrl: 'https://class.travelschooling.com',
    load: async () => ({}),
    save: async () => undefined,
    award: async (event, detail = {}) => {
      awards.push({ event, detail });
      return { ...EMPTY_AWARD };
    },
    unlock: async () => ({}),
    toast: () => undefined,
  };
}

/**
 * Resolves to { kind: 'ready', kit } | { kind: 'redirecting' } | { kind: 'unavailable' }.
 * 'redirecting': the real kit found no session and has already started navigating to
 * the portal login. 'unavailable': the kit script did not load.
 */
export async function initKit({ hostname = location.hostname, TSKit = globalThis.TSKit, win = globalThis } = {}) {
  if (isDevHost(hostname)) return { kind: 'ready', kit: mockKit(win) };
  if (!TSKit || typeof TSKit.init !== 'function') return { kind: 'unavailable' };
  const kit = await TSKit.init({ game: GAME });
  if (!kit || !kit.user) return { kind: 'redirecting' };
  return { kind: 'ready', kit };
}

// ---- session identity, read the way the kit reads it (no verification) ----

function b64urlDecode(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary');
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** The `sub` claim of the portal session cookie's access token, or null. */
export function sessionUserId(cookieHeader) {
  if (!cookieHeader) return null;
  const chunks = [];
  for (const part of cookieHeader.split(/;\s*/)) {
    const m = part.match(/^(sb-[^=]*-auth-token(?:\.(\d+))?)=(.*)$/);
    if (m) chunks.push({ idx: m[2] ? parseInt(m[2], 10) : 0, val: m[3] });
  }
  if (chunks.length === 0) return null;
  chunks.sort((a, b) => a.idx - b.idx);
  try {
    let raw = decodeURIComponent(chunks.map((c) => c.val).join(''));
    if (raw.startsWith('base64-')) raw = b64urlDecode(raw.slice(7));
    const token = JSON.parse(raw).access_token;
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const sub = JSON.parse(b64urlDecode(parts[1])).sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}

/** True when the browser's current session still belongs to the learner the kit started with. */
export function sameAccount(kit, cookieHeader) {
  if (kit.mock) return true;
  return sessionUserId(cookieHeader) === kit.user.id;
}

// Kit work still in flight (award calls, and the kit's start-up, which replays awards
// queued offline), so "Return to Home Room" can wait for it before leaving.
const pendingAwards = new Set();

/**
 * Tracks `promise` until it settles (fulfilled or rejected) so flushAwards waits for it.
 * Returns `promise` unchanged.
 */
export function trackPending(promise) {
  const settled = Promise.resolve(promise)
    .then(() => undefined, () => undefined)
    .finally(() => pendingAwards.delete(settled));
  pendingAwards.add(settled);
  return promise;
}

/**
 * Fire-and-forget award, refused when the signed-in account changed under this tab
 * (the kit would credit the previous learner). `onMismatch` lets the page reload through
 * the gate so the kit and the step tracker start fresh. The portal caps XP per event and
 * per day, so a lost call costs nothing. The call is tracked until it settles
 * (see flushAwards).
 */
export function award(kit, event, detail, { cookie = () => document.cookie, onMismatch = () => {} } = {}) {
  if (!sameAccount(kit, cookie())) {
    onMismatch();
    return false;
  }
  trackPending(Promise.resolve()
    .then(() => kit.award(event, detail))
    .catch((err) => console.warn(`[kit] award ${event} failed:`, err && err.message ? err.message : err)));
  return true;
}

/** Number of tracked calls (awards, kit start-up) not yet settled. */
export function pendingAwardCount() {
  return pendingAwards.size;
}

/**
 * Resolves true once no tracked kit work (awards, kit start-up) is in flight, or false
 * after `timeoutMs` if some still is (awards are best-effort; leaving must not hang).
 * Work started during the wait (the player may still be crossing steps) is waited for
 * too, under the same deadline.
 */
export function flushAwards(timeoutMs = 2000) {
  if (pendingAwards.size === 0) return Promise.resolve(true);
  let timer;
  let expired = false;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => { expired = true; resolve(false); }, timeoutMs);
  });
  const drain = async () => {
    while (pendingAwards.size > 0 && !expired) await Promise.all([...pendingAwards]);
    return !expired;
  };
  return Promise.race([drain(), timeout]).finally(() => clearTimeout(timer));
}

/** The Home Room: the portal's class launcher. */
export const HOME_ROOM_URL = 'https://class.travelschooling.com/';

/**
 * "Return to Home Room": `beforeLeave` (stop playback, so no new awards start), then wait
 * (bounded) for tracked kit work, then navigate to the portal launcher. Nothing in the
 * viewer is learner-authored work, so there is no leave prompt. Returns the click
 * handler. Presses during a departure are ignored. The departure ends, and the button
 * works again, when the page is restored from the back/forward cache or when the
 * document is still here `stayMs` after navigating (the navigation was cancelled, e.g.
 * the browser's Stop).
 *
 * `handler.whenStaying(fn)` runs `fn` now, or, during a departure, only if the learner
 * stays (so the viewer does not start booting on its way out).
 */
export function homeRoomHandler({
  flush = flushAwards,
  assign = (url) => window.location.assign(url),
  beforeLeave = () => {},
  win = globalThis,
  timeoutMs = 2000,
  stayMs = 3000,
  setTimer = (fn, ms) => setTimeout(fn, ms),
} = {}) {
  let leaving = false;
  let attempt = 0;
  let held = [];
  function stay() {
    leaving = false;
    attempt++; // a stale "still here" timer from an earlier departure does nothing
    const run = held;
    held = [];
    for (const fn of run) fn();
  }
  win.addEventListener?.('pageshow', (e) => { if (e.persisted && leaving) stay(); });
  const onClick = async () => {
    if (leaving) return;
    leaving = true;
    const mine = ++attempt;
    try { beforeLeave(); } catch { /* leaving matters more than pausing */ }
    await flush(timeoutMs);
    if (mine !== attempt) return;
    assign(HOME_ROOM_URL);
    setTimer(() => { if (mine === attempt) stay(); }, stayMs);
  };
  onClick.whenStaying = (fn) => { if (leaving) held.push(fn); else fn(); };
  onClick.isLeaving = () => leaving;
  return onClick;
}

/**
 * Tracks the furthest step reached per kata in this page session; only a new furthest
 * earns kata_step. Every kata starts at step 0 (loading it seeks there), so the baseline
 * is 0 and the first award is for step 1.
 */
export function furthestStepTracker() {
  const furthest = new Map();
  return {
    isNewFurthest(kata, stepIndex) {
      const prev = furthest.get(kata) ?? 0;
      if (stepIndex > prev) {
        furthest.set(kata, stepIndex);
        return true;
      }
      return false;
    },
  };
}
