// Portal kit for the kata viewer (class standard rule 3). The page loads
// https://class.travelschooling.com/kit/v1/ts-kit.js before main.js; this module wraps
// TSKit.init for the viewer and provides a no-op mock on localhost so `npm run dev`
// works without a portal session. Pure helpers are exported for tests/kit.test.mjs.

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

/** Fire-and-forget award; the portal caps XP per event and per day, so a lost call costs nothing. */
export function award(kit, event, detail) {
  Promise.resolve()
    .then(() => kit.award(event, detail))
    .catch((err) => console.warn(`[kit] award ${event} failed:`, err && err.message ? err.message : err));
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
