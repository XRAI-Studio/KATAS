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

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/**
 * A kit that records awards on window.__kitAwards and saves on window.__kitSaves instead of
 * calling the portal. It keeps one stored state in memory, so load and save round-trip, and
 * drops a save whose rev is lower than the stored one, as `save_progress` does.
 * `win.__kitLoadGate` (e2e): a promise every load waits for, to hold the first load open.
 */
export function mockKit(win) {
  const awards = (win.__kitAwards = win.__kitAwards || []);
  const saves = (win.__kitSaves = win.__kitSaves || []);
  let stored = null;
  const revOf = (state) => (state && typeof state.rev === 'number' ? state.rev : 0);
  return {
    mock: true,
    user: { id: 'dev', displayName: 'Dev Learner', role: 'student' },
    totals: { xp: 0, gems: 0, level: 1, streak: 0 },
    launcherUrl: 'https://class.travelschooling.com',
    load: async () => {
      if (win.__kitLoadGate) await win.__kitLoadGate;
      return stored ? clone(stored) : {};
    },
    save: async (state, summary = {}) => {
      saves.push(clone({ state, summary }));
      if (!stored || revOf(state) >= revOf(stored)) stored = clone(state);
    },
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

// ---- tile summary: which katas this learner practised and completed ----

const uniqueKnown = (list, ids) => {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const id of list) if (typeof id === 'string' && ids.includes(id) && !out.includes(id)) out.push(id);
  return out;
};

/** Sanitises a stored `{ viewed, completed }` to unique ids from `ids`; anything else is empty. */
export function kataProgress(state, ids) {
  const s = state && typeof state === 'object' ? state : {};
  return { viewed: uniqueKnown(s.viewed, ids), completed: uniqueKnown(s.completed, ids) };
}

/** The union of two progress records, list by list. */
export function mergeKataProgress(a, b) {
  const union = (x, y) => [...new Set([...(x || []), ...(y || [])])];
  return { viewed: union(a.viewed, b.viewed), completed: union(a.completed, b.completed) };
}

/**
 * The save revision: completions dominate (at most 5 katas can be viewed), so the SQL's
 * keep-the-higher-rev rule can never replace a state with more completions by one with
 * fewer, whichever device or replay writes last.
 */
export function kataRev(progress) {
  return 100 * progress.completed.length + progress.viewed.length;
}

/** The launcher headline: completions once there are any, otherwise katas practised. */
export function kataSummary(progress, total) {
  const c = progress.completed.length;
  const v = progress.viewed.length;
  const headline = c > 0 ? `${c} of ${total} katas completed` : `${v} ${v === 1 ? 'kata' : 'katas'} practised`;
  return { headline, percent: total > 0 ? Math.round((100 * c) / total) : 0 };
}

/**
 * One serialized publisher (never calls `publish` while an earlier call is unsettled, so
 * the kit's debounce never strands a promise): `request(snapshot)` keeps the newest
 * snapshot and starts a run if none is going; a run publishes, then repeats only if a
 * newer snapshot arrived meanwhile. Only the run is tracked (see flushAwards); it never
 * rejects. `request` resolves when a run that included the snapshot has finished.
 */
export function createPublisher(publish, { track = trackPending } = {}) {
  let latest;
  let waiting = false;
  let running = null;
  function run() {
    const p = (async () => {
      try {
        while (waiting) {
          const snapshot = latest;
          waiting = false;
          latest = undefined;
          try {
            await publish(snapshot);
          } catch (err) {
            console.warn('[kit] save failed:', err && err.message ? err.message : err);
          }
        }
      } finally {
        running = null; // same turn as the loop's last check: a later request starts a new run
      }
    })();
    return p;
  }
  return {
    request(snapshot) {
      latest = snapshot;
      waiting = true;
      if (!running) running = track(run());
      return running;
    },
    busy: () => running !== null,
  };
}

/** True for the kit's strict-read rejection: the stored progress could not be read. */
export function isProgressUnavailable(err) {
  return Boolean(err && err.code === 'progress-unavailable');
}

/** Saves per publish run before giving up until the next one (see kataProgressSync). */
export const VERIFY_ATTEMPTS = 3;

/** Delays between publish retries after a failed read; the last one repeats. */
export const RETRY_DELAYS_MS = [5000, 10000, 20000, 30000];

/**
 * One retry timer: `arm()` schedules `fire` after the next delay of RETRY_DELAYS_MS unless a
 * timer is already pending (so repeated failures never stack or restart it); the window
 * `online` event fires at once while armed. `clear()` cancels the timer and resets the
 * backoff. The pending timer is not tracked work: leaving never waits for it.
 */
export function createRetryScheduler(fire, { win = globalThis, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (t) => clearTimeout(t) } = {}) {
  let timer = null;
  let attempt = 0;
  win.addEventListener?.('online', () => {
    if (timer === null) return;
    clearTimer(timer);
    timer = null;
    fire();
  });
  return {
    arm() {
      if (timer !== null) return;
      const delay = RETRY_DELAYS_MS[Math.min(attempt++, RETRY_DELAYS_MS.length - 1)];
      timer = setTimer(() => { timer = null; fire(); }, delay);
    },
    clear() {
      if (timer !== null) clearTimer(timer);
      timer = null;
      attempt = 0;
    },
    armed: () => timer !== null,
  };
}

/**
 * The learner's kata progress for the launcher tile. `record(kind, id)` adds a viewed or
 * completed kata; `start()` is the first `kit.load()` and merge, then one publish if
 * anything was recorded meanwhile (runs start only after it). Every publish is
 * read-merge-write (set sizes are no safe revision for sets): load the stored state,
 * union it in, save with the completion-dominant rev. Refused under an account switch,
 * like `award`.
 *
 * Every read is `kit.load({ strict: true })` (STRICT-001): when the read fails the kit
 * rejects with `progress-unavailable` instead of answering with its cache or `{}`, and
 * nothing is saved. A union built without the server's copy can carry the same rev as a
 * disjoint stored state (server viewed=[A], this device viewed=[B], both rev 1) and the SQL
 * accepts equal revs, so A would be lost. Ids recorded meanwhile stay here; one retry timer
 * (RETRY_DELAYS_MS, and the window `online` event) re-requests a publish until a read
 * succeeds, armed by both a failed start() read and a run whose read fails (STRICT-005),
 * and cleared by a run that completes. An older kit ignores `{ strict: true }` (the
 * previous behavior). `win`, `setTimer` and `clearTimer` are injectable for tests.
 */
export function kataProgressSync(kit, {
  ids,
  cookie = () => document.cookie,
  onMismatch = () => {},
  track = trackPending,
  win = globalThis,
  setTimer,
  clearTimer,
} = {}) {
  let progress = { viewed: [], completed: [] };
  let loaded = false;
  let recorded = false;
  const read = async () => kataProgress(await kit.load({ strict: true }), ids);
  const guard = () => {
    if (sameAccount(kit, cookie())) return true;
    onMismatch();
    return false;
  };
  const holds = (stored, mine) =>
    mine.viewed.every((id) => stored.viewed.includes(id)) && mine.completed.every((id) => stored.completed.includes(id));
  async function publishOnce() {
    if (!guard()) return;
    let stored = await read(); // read before merging: events may land during the load
    // Save, then read back: another device that read the same state and saved last (equal
    // rev) may have replaced this save; merge its state and save the union again, at most
    // VERIFY_ATTEMPTS times (Codex KATAS-001). A failed save normally leaves the kit's cache
    // dirty (which load() returns, so it counts as held) and the kit replays it later. A
    // save that fails on both the network and the cache is lost, and so are ids recorded
    // while reads fail if the learner leaves before a retry's read succeeds: best effort,
    // the learner views or completes that kata again (KSO-006). XP is unaffected (awards
    // use the kit's award queue, not save).
    for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt++) {
      progress = mergeKataProgress(progress, stored);
      if (!guard()) return;
      const snapshot = progress;
      await kit.save({ rev: kataRev(snapshot), viewed: snapshot.viewed, completed: snapshot.completed }, kataSummary(snapshot, ids.length));
      stored = await read();
      if (holds(stored, snapshot)) return;
    }
  }
  const publisher = createPublisher(async () => {
    try {
      await publishOnce();
    } catch (err) {
      // A failed read throws before any save (or at the read-back after one): retry later.
      // createPublisher's catch logs it.
      if (isProgressUnavailable(err)) retry.arm();
      throw err;
    }
    retry.clear();
  }, { track });
  const retry = createRetryScheduler(() => publisher.request(), { win, setTimer, clearTimer });
  return {
    async start() {
      let ok = false;
      try {
        const stored = await read(); // ids may be recorded while this read is out
        progress = mergeKataProgress(progress, stored);
        ok = true;
      } catch (err) {
        // Not ready: publish nothing built without the stored state. What this page
        // recorded stays here; the retry publishes it once a read succeeds (a later
        // record requests a run, whose failed read arms the retry).
        console.warn('[kit] progress read failed:', err && err.message ? err.message : err);
      }
      loaded = true;
      if (!recorded) return;
      if (ok) await publisher.request();
      else retry.arm();
    },
    record(kind, id) {
      if (!ids.includes(id)) return;
      const list = kind === 'completed' ? 'completed' : 'viewed';
      if (progress[list].includes(id)) return; // nothing new to publish
      progress = { ...progress, [list]: [...progress[list], id] };
      recorded = true;
      if (loaded) publisher.request();
    },
    progress: () => progress,
  };
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
