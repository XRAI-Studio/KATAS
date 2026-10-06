import test from 'node:test';
import assert from 'node:assert/strict';
import { award, createPublisher, flushAwards, furthestStepTracker, homeRoomHandler, HOME_ROOM_URL, initKit, isDevHost, isProgressUnavailable, kataProgress, kataProgressSync, kataRev, kataSummary, mergeKataProgress, VERIFY_ATTEMPTS, mockKit, pendingAwardCount, sameAccount, sessionUserId, trackPending, GAME } from '../public/js/kit.js';

function jwt(sub) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'ES256' })}.${b64({ sub, approved: true })}.sig`;
}
function cookieFor(sub) {
  return 'sb-abc-auth-token=' + encodeURIComponent(JSON.stringify({ access_token: jwt(sub), token_type: 'bearer' }));
}

test('sessionUserId reads the subject out of the session cookie, chunked or base64-prefixed too', () => {
  assert.equal(sessionUserId(cookieFor('user-42')), 'user-42');
  const payload = Buffer.from(JSON.stringify({ access_token: jwt('user-7') })).toString('base64url');
  const b64 = 'base64-' + payload;
  const cut = Math.floor(b64.length / 2);
  assert.equal(sessionUserId(`other=1; sb-abc-auth-token.1=${b64.slice(cut)}; sb-abc-auth-token.0=${b64.slice(0, cut)}`), 'user-7');
  assert.equal(sessionUserId(null), null);
  assert.equal(sessionUserId('theme=dark'), null);
  assert.equal(sessionUserId('sb-abc-auth-token=not-json'), null);
});

test('sameAccount: the mock kit always matches; a real kit matches only its own subject', () => {
  assert.equal(sameAccount({ mock: true, user: { id: 'dev' } }, ''), true);
  const kit = { user: { id: 'user-1' } };
  assert.equal(sameAccount(kit, cookieFor('user-1')), true);
  assert.equal(sameAccount(kit, cookieFor('user-2')), false, 'another learner signed in under this tab');
  assert.equal(sameAccount(kit, ''), false, 'signed out under this tab');
});

test('award refuses to credit a kit whose learner is no longer the signed-in one, and reports it', async () => {
  const sent = [];
  const kit = { user: { id: 'user-1' }, award: async (e, d) => { sent.push([e, d]); return {}; } };
  let mismatches = 0;
  const opts = (cookie) => ({ cookie: () => cookie, onMismatch: () => { mismatches++; } });
  assert.equal(award(kit, 'kata_view', { kata: 'seisan' }, opts(cookieFor('user-1'))), true);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(sent, [['kata_view', { kata: 'seisan' }]]);
  assert.equal(award(kit, 'kata_step', { kata: 'seisan', step: 1 }, opts(cookieFor('user-2'))), false, 'account switched');
  assert.equal(award(kit, 'kata_step', { kata: 'seisan', step: 2 }, opts('')), false, 'signed out');
  await new Promise((r) => setImmediate(r));
  assert.equal(sent.length, 1, 'nothing sent after the switch');
  assert.equal(mismatches, 2);
});

test('furthestStepTracker: first step, higher step, lower or equal step, second kata independent', () => {
  const t = furthestStepTracker();
  assert.equal(t.isNewFurthest('seisan', 0), false, 'step 0 is the starting position, never an award');
  assert.equal(t.isNewFurthest('seisan', 1), true, 'first step reached');
  assert.equal(t.isNewFurthest('seisan', 3), true, 'higher step');
  assert.equal(t.isNewFurthest('seisan', 2), false, 'lower step');
  assert.equal(t.isNewFurthest('seisan', 3), false, 'equal step');
  assert.equal(t.isNewFurthest('seisan', 4), true, 'next furthest');
  assert.equal(t.isNewFurthest('chinto', 1), true, 'another kata starts fresh');
  assert.equal(t.isNewFurthest('chinto', 0), false);
});

test('isDevHost recognises localhost and 127.0.0.1 only', () => {
  assert.equal(isDevHost('localhost'), true);
  assert.equal(isDevHost('127.0.0.1'), true);
  assert.equal(isDevHost('karate.travelschooling.com'), false);
});

test('initKit returns the mock on a dev host without touching TSKit', async () => {
  let inited = false;
  const win = {};
  const r = await initKit({ hostname: 'localhost', TSKit: { init: async () => { inited = true; return {}; } }, win });
  assert.equal(r.kind, 'ready');
  assert.equal(inited, false);
  await r.kit.award('kata_view', { kata: 'seisan' });
  assert.deepEqual(win.__kitAwards, [{ event: 'kata_view', detail: { kata: 'seisan' } }]);
});

test('initKit on the live host: unavailable without TSKit, redirecting without a user, ready with one', async () => {
  assert.deepEqual(await initKit({ hostname: 'karate.travelschooling.com', TSKit: undefined }), { kind: 'unavailable' });
  let game = null;
  const noUser = { init: async (o) => { game = o.game; return { user: null }; } };
  assert.deepEqual(await initKit({ hostname: 'karate.travelschooling.com', TSKit: noUser }), { kind: 'redirecting' });
  assert.equal(game, GAME);
  const kit = { user: { id: 'u1' }, award: async () => ({}) };
  const r = await initKit({ hostname: 'karate.travelschooling.com', TSKit: { init: async () => kit } });
  assert.equal(r.kind, 'ready');
  assert.equal(r.kit, kit);
});

test('mockKit records awards on the given window object', async () => {
  const win = {};
  const kit = mockKit(win);
  await kit.award('kata_step', { kata: 'seisan', step: 2 });
  await kit.award('kata_complete', { kata: 'seisan' });
  assert.equal(win.__kitAwards.length, 2);
  assert.equal(kit.user.id, 'dev');
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((r) => setImmediate(r));
const mock = (awardFn) => ({ mock: true, user: { id: 'dev' }, award: awardFn });
const NO_COOKIE = { cookie: () => '' };
const NO_TIMER = () => {};

test('flushAwards resolves at once when no award is in flight', async () => {
  assert.equal(pendingAwardCount(), 0);
  const started = Date.now();
  assert.equal(await flushAwards(1000), true);
  assert.ok(Date.now() - started < 500);
});

test('awards in flight are tracked until they settle, rejected ones included; flushAwards waits for all', async () => {
  const first = deferred();
  const second = deferred();
  const calls = [first, second];
  const kit = mock(() => calls.shift().promise);
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(award(kit, 'kata_view', { kata: 'seisan' }, NO_COOKIE), true);
    assert.equal(award(kit, 'kata_step', { kata: 'seisan', step: 1 }, NO_COOKIE), true);
    assert.equal(pendingAwardCount(), 2);
    let flushed = null;
    const flush = flushAwards(5000).then((v) => { flushed = v; });
    first.resolve({});
    await tick();
    assert.equal(pendingAwardCount(), 1, 'the settled award left the set');
    assert.equal(flushed, null, 'still waiting for the second award');
    second.reject(new Error('network down'));
    await flush;
    assert.equal(flushed, true);
    assert.equal(pendingAwardCount(), 0, 'a failed award is removed too');
  } finally {
    console.warn = warn;
  }
});

test('flushAwards gives up after its timeout and reports false; the award stays tracked until it settles', async () => {
  const slow = deferred();
  award(mock(() => slow.promise), 'kata_complete', { kata: 'chinto' }, NO_COOKIE);
  await tick();
  assert.equal(pendingAwardCount(), 1);
  const started = Date.now();
  assert.equal(await flushAwards(40), false);
  assert.ok(Date.now() - started >= 30, 'waited for the timeout');
  assert.equal(pendingAwardCount(), 1);
  slow.resolve({});
  await tick();
  assert.equal(pendingAwardCount(), 0);
});

test('a refused award (account switched) is not tracked', () => {
  const kit = { user: { id: 'user-1' }, award: async () => ({}) };
  assert.equal(award(kit, 'kata_view', { kata: 'seisan' }, { cookie: () => cookieFor('user-2') }), false);
  assert.equal(pendingAwardCount(), 0);
});

test('homeRoomHandler flushes awards with a 2 s bound, then goes to the Home Room once', async () => {
  const order = [];
  const flushGate = deferred();
  const onClick = homeRoomHandler({ setTimer: NO_TIMER,
    flush: (ms) => { order.push(['flush', ms]); return flushGate.promise; },
    assign: (url) => order.push(['assign', url]),
  });
  const pressed = onClick();
  onClick(); // a second press while leaving is ignored
  await tick();
  assert.deepEqual(order, [['flush', 2000]], 'no navigation before the flush settles');
  flushGate.resolve(false); // even a timed-out flush leaves
  await pressed;
  assert.deepEqual(order, [['flush', 2000], ['assign', 'https://class.travelschooling.com/']]);
  assert.equal(HOME_ROOM_URL, 'https://class.travelschooling.com/');
});

test('flushAwards also waits for an award started while it is already waiting, under one deadline', async () => {
  const first = deferred();
  const later = deferred();
  award(mock(() => first.promise), 'kata_step', { kata: 'wansu', step: 1 }, NO_COOKIE);
  let flushed = null;
  const flush = flushAwards(5000).then((v) => { flushed = v; });
  await tick();
  // Playback crosses another step during the wait.
  award(mock(() => later.promise), 'kata_step', { kata: 'wansu', step: 2 }, NO_COOKIE);
  first.resolve({});
  await tick();
  await tick();
  assert.equal(flushed, null, 'the newer award is still in flight, so the flush keeps waiting');
  assert.equal(pendingAwardCount(), 1);
  later.resolve({});
  await flush;
  assert.equal(flushed, true);
  assert.equal(pendingAwardCount(), 0);

  // The deadline is shared: a chain of awards cannot stretch it.
  const a = deferred();
  const b = deferred();
  award(mock(() => a.promise), 'kata_step', { kata: 'wansu', step: 3 }, NO_COOKIE);
  const started = Date.now();
  const bounded = flushAwards(60);
  setTimeout(() => { award(mock(() => b.promise), 'kata_step', { kata: 'wansu', step: 4 }, NO_COOKIE); a.resolve({}); }, 30);
  assert.equal(await bounded, false);
  const waited = Date.now() - started;
  assert.ok(waited >= 50 && waited < 1000, `gave up at the one deadline (${waited} ms)`);
  b.resolve({});
  await tick();
  assert.equal(pendingAwardCount(), 0);
});

test('homeRoomHandler stops playback before flushing', async () => {
  const order = [];
  const onClick = homeRoomHandler({ setTimer: NO_TIMER,
    beforeLeave: () => order.push('pause'),
    flush: async () => { order.push('flush'); return true; },
    assign: () => order.push('assign'),
    win: {},
  });
  await onClick();
  assert.deepEqual(order, ['pause', 'flush', 'assign']);
});

test('homeRoomHandler works again after the page comes back from the back/forward cache', async () => {
  const win = new EventTarget();
  const pageshow = (persisted) => Object.assign(new Event('pageshow'), { persisted });
  const assigned = [];
  const onClick = homeRoomHandler({ setTimer: NO_TIMER, flush: async () => true, assign: (url) => assigned.push(url), win });
  await onClick();
  assert.equal(assigned.length, 1);
  await onClick();
  assert.equal(assigned.length, 1, 'still departing: a second press is ignored');
  win.dispatchEvent(pageshow(false));
  await onClick();
  assert.equal(assigned.length, 1, 'an ordinary pageshow (fresh load) does not reset the latch');
  win.dispatchEvent(pageshow(true)); // browser Back restored this page from the bfcache
  await onClick();
  assert.deepEqual(assigned, [HOME_ROOM_URL, HOME_ROOM_URL]);
});

/** A manual timer: `fire()` runs what was scheduled, as if its delay had passed. */
function manualTimer() {
  const due = [];
  return { setTimer: (fn, ms) => { due.push({ fn, ms }); }, due, fire: () => { for (const t of due.splice(0)) t.fn(); } };
}

test('leaving during a slow kit start-up waits for it (it replays queued awards) and never boots the viewer', async () => {
  const init = deferred();
  const initDone = trackPending(init.promise); // main.js: trackPending(initKit())
  const assigned = [];
  const timer = manualTimer();
  const onClick = homeRoomHandler({ flush: flushAwards, assign: (url) => assigned.push(url), win: {}, setTimer: timer.setTimer });
  const pressed = onClick();
  await tick();
  assert.deepEqual(assigned, [], 'the kit is still starting: no navigation yet');
  init.resolve({ kind: 'ready', kit: {} });
  const booted = [];
  onClick.whenStaying(() => booted.push('boot'));
  await initDone;
  await pressed;
  assert.deepEqual(assigned, [HOME_ROOM_URL], 'navigated once the start-up settled');
  assert.deepEqual(booted, [], 'no boot while leaving');
  assert.equal(pendingAwardCount(), 0);
});

test('a start-up slower than the deadline does not hold the learner past it', async () => {
  const init = deferred();
  trackPending(init.promise);
  const assigned = [];
  const started = Date.now();
  const onClick = homeRoomHandler({ assign: (url) => assigned.push(url), win: {}, setTimer: NO_TIMER, timeoutMs: 40 });
  await onClick();
  const waited = Date.now() - started;
  assert.deepEqual(assigned, [HOME_ROOM_URL]);
  assert.ok(waited >= 30 && waited < 1000, `left at the deadline (${waited} ms)`);
  init.reject(new Error('portal down')); // a failed start-up is tracked without an unhandled rejection
  await tick();
  assert.equal(pendingAwardCount(), 0);
});

test('a navigation that does not unload (browser Stop) ends the departure: the button works again and a held boot runs', async () => {
  const assigned = [];
  const timer = manualTimer();
  const onClick = homeRoomHandler({ flush: async () => true, assign: (url) => assigned.push(url), win: {}, setTimer: timer.setTimer });
  await onClick();
  assert.equal(assigned.length, 1);
  assert.equal(timer.due[0].ms, 3000, 'the document gets 3 s to unload');
  const booted = [];
  onClick.whenStaying(() => booted.push('boot'));
  await onClick();
  assert.equal(assigned.length, 1, 'a press while the navigation may still happen is ignored');
  assert.deepEqual(booted, []);
  timer.fire(); // still here: the navigation was cancelled
  assert.equal(onClick.isLeaving(), false);
  assert.deepEqual(booted, ['boot'], 'the viewer starts after all');
  await onClick();
  assert.equal(assigned.length, 2, 'the button works again');
  onClick.whenStaying(() => booted.push('now'));
  assert.deepEqual(booted, ['boot'], 'held again during the new departure');
});

test('a stale "still here" timer from an earlier departure does not end a newer one', async () => {
  const win = new EventTarget();
  const assigned = [];
  const timer = manualTimer();
  const onClick = homeRoomHandler({ flush: async () => true, assign: (url) => assigned.push(url), win, setTimer: timer.setTimer });
  await onClick();
  const stale = timer.due.splice(0);
  win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true })); // Back from bfcache
  await onClick();
  assert.equal(assigned.length, 2);
  for (const t of stale) t.fn(); // the first departure's timer fires late
  assert.equal(onClick.isLeaving(), true, 'the second departure is still active');
  await onClick();
  assert.equal(assigned.length, 2);
});

// ---- launcher tile progress (work order 2026-09-30-tile-summaries-and-copy) ----

const IDS = ['seisan', 'seiunchin', 'naihanchi', 'wansu', 'chinto'];

/**
 * The portal side of `save_progress` / `game_progress`: one row per learner and game; a save
 * whose rev is lower than the stored state's rev is dropped and answers false
 * (0007_progress_revision_guard.sql). `offline` makes every request fail; `readsFail` only
 * the progress reads, `savesFail` only the saves.
 */
function fakePortal() {
  return {
    row: null,
    offline: false,
    readsFail: false,
    savesFail: false,
    saveCalls: 0,
    async select() {
      if (this.offline || this.readsFail) throw new Error('network');
      return this.row ? [structuredClone(this.row)] : [];
    },
    async saveProgress({ p_state, p_summary, p_rev }) {
      this.saveCalls++;
      if (this.offline || this.savesFail) throw new Error('network');
      const stored = this.row && typeof this.row.state.rev === 'number' ? this.row.state.rev : 0;
      if (this.row && p_rev < stored) return false;
      this.row = { state: structuredClone(p_state), summary: structuredClone(p_summary) };
      return true;
    },
  };
}

/**
 * A port of ts-kit.js's load / save / flush and its start-up replay (public/kit/v1/ts-kit.js
 * lines 74-100 and 138), with a shorter debounce: save() replaces the pending snapshot and
 * cancels the earlier timer without settling the earlier call's promise; flush settles
 * (clean) when the server answered, dropped or not, and marks the cache dirty on failure;
 * load() prefers a dirty local cache, then the server, then the local cache. A failed read
 * answers with the local cache, else `{}`, unless `load({ strict: true })`, which rejects
 * with code "progress-unavailable" (portal plan 2026-10-06-kit-strict-load, section 1).
 */
function fakeKit(portal, storage = new Map(), { debounceMs = 5 } = {}) {
  const cacheKey = 'tskit:katas:u1';
  const ls = (val) => {
    if (val === undefined) return storage.has(cacheKey) ? structuredClone(storage.get(cacheKey)) : null;
    storage.set(cacheKey, structuredClone(val));
  };
  let saveTimer = null;
  let pending = null;
  const calls = { save: 0, load: 0 };
  function flush() {
    if (!pending) return Promise.resolve();
    const p = pending; pending = null;
    const rev = p.state && typeof p.state.rev === 'number' ? p.state.rev : 0;
    return portal.saveProgress({ p_state: p.state, p_summary: p.summary, p_rev: rev })
      .then(() => { ls({ state: p.state, summary: p.summary }); })
      .catch(() => { ls({ state: p.state, summary: p.summary, dirty: true }); });
  }
  const kit = {
    user: { id: 'u1' },
    calls,
    load(opts) {
      calls.load++;
      return portal.select().then((rows) => {
        const server = rows && rows[0]; const local = ls();
        if (local && local.dirty) return local.state;
        if (server) { ls({ state: server.state, summary: server.summary }); return server.state; }
        return local ? local.state : {};
      }).catch(() => {
        if (opts && opts.strict) throw Object.assign(new Error('progress unavailable'), { code: 'progress-unavailable' });
        const local = ls();
        return local ? local.state : {};
      });
    },
    save(state, summary) {
      calls.save++;
      pending = { state, summary: summary || {} };
      ls({ state, summary: summary || {}, dirty: true });
      if (saveTimer) clearTimeout(saveTimer);
      return new Promise((resolve) => { saveTimer = setTimeout(() => { flush().then(resolve, resolve); }, debounceMs); });
    },
    award: async () => ({}),
  };
  // TSKit.init: replay a dirty snapshot before any class code runs.
  kit.init = () => {
    const local = ls();
    if (local && local.dirty) pending = { state: local.state, summary: local.summary };
    return flush().then(() => kit);
  };
  return kit;
}

/** A private pending-work set, so these tests do not touch the module's own. */
const localTrack = () => {
  const set = new Set();
  const track = (p) => {
    const t = Promise.resolve(p).then(() => undefined, () => undefined).finally(() => set.delete(t));
    set.add(t);
    return p;
  };
  return { set, track };
};
const idle = async (set) => { while (set.size) await Promise.allSettled([...set]); };

test('kataProgress keeps unique known ids only; anything else is empty', () => {
  assert.deepEqual(kataProgress(null, IDS), { viewed: [], completed: [] });
  assert.deepEqual(kataProgress({ viewed: 'seisan' }, IDS), { viewed: [], completed: [] });
  assert.deepEqual(
    kataProgress({ rev: 3, viewed: ['seisan', 'seisan', 'kusanku', 7, 'chinto'], completed: ['wansu', null] }, IDS),
    { viewed: ['seisan', 'chinto'], completed: ['wansu'] },
  );
});

test('mergeKataProgress is the union of each list', () => {
  assert.deepEqual(
    mergeKataProgress({ viewed: ['seisan'], completed: ['seisan'] }, { viewed: ['chinto', 'seisan'], completed: [] }),
    { viewed: ['seisan', 'chinto'], completed: ['seisan'] },
  );
});

test('kataSummary: practised until a completion, then completions of the total', () => {
  assert.deepEqual(kataSummary({ viewed: [], completed: [] }, 5), { headline: '0 katas practised', percent: 0 });
  assert.deepEqual(kataSummary({ viewed: ['seisan'], completed: [] }, 5), { headline: '1 kata practised', percent: 0 });
  assert.deepEqual(kataSummary({ viewed: ['seisan', 'chinto'], completed: [] }, 5), { headline: '2 katas practised', percent: 0 });
  assert.deepEqual(kataSummary({ viewed: ['seisan'], completed: ['seisan'] }, 5), { headline: '1 of 5 katas completed', percent: 20 });
  assert.deepEqual(kataSummary({ viewed: IDS, completed: IDS.slice(0, 3) }, 5), { headline: '3 of 5 katas completed', percent: 60 });
});

test('kataRev: one completion outranks any number of practised-only katas', () => {
  assert.equal(kataRev({ viewed: ['seisan'], completed: ['seisan'] }), 101);
  assert.equal(kataRev({ viewed: ['seisan', 'chinto'], completed: [] }), 2);
  assert.ok(kataRev({ viewed: [], completed: ['seisan'] }) > kataRev({ viewed: IDS, completed: [] }));
});

test('createPublisher never calls kit.save while an earlier call is unsettled; rapid requests end with the newest snapshot saved', async () => {
  const portal = fakePortal();
  const kit = fakeKit(portal);
  const { set, track } = localTrack();
  let inFlight = 0;
  let maxInFlight = 0;
  const pub = createPublisher(async (n) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await kit.save({ rev: n, n }, { headline: `n=${n}` });
    } finally {
      inFlight--;
    }
  }, { track });
  const done = [];
  for (let n = 1; n <= 6; n++) {
    done.push(pub.request(n));
    assert.ok(set.size <= 1, 'only the run is tracked');
    await new Promise((r) => setTimeout(r, 1));
  }
  await Promise.all(done);
  await idle(set);
  assert.equal(maxInFlight, 1);
  assert.equal(portal.row.state.n, 6, 'the newest snapshot reached the server');
  assert.equal(portal.row.summary.headline, 'n=6');
  assert.equal(set.size, 0, 'nothing left pending');
  assert.equal(pub.busy(), false);
  assert.ok(kit.calls.save < 6, 'requests during a run were coalesced');
});

test('createPublisher: a failing publish still settles the run and clears the pending set', async () => {
  const { set, track } = localTrack();
  const warn = console.warn;
  console.warn = () => {};
  try {
    const pub = createPublisher(async () => { throw new Error('boom'); }, { track });
    await pub.request(1);
    await idle(set);
    assert.equal(set.size, 0);
    assert.equal(pub.busy(), false);
  } finally {
    console.warn = warn;
  }
});

/** One device's session: kit init (with its replay), the first load, the given events. */
async function session(portal, storage, events) {
  const kit = await fakeKit(portal, storage).init();
  kit.mock = true; // sameAccount without a cookie in node; the account guard has its own test
  const { set, track } = localTrack();
  const sync = kataProgressSync(kit, { ids: IDS, cookie: () => '', track });
  const started = sync.start();
  for (const [kind, id] of events) sync.record(kind, id);
  await started;
  await idle(set);
  return { kit, sync };
}

const A_SEISAN = [['viewed', 'seisan'], ['completed', 'seisan']];
const B_TWO = [['viewed', 'chinto'], ['viewed', 'wansu']];

test('A (completed Seisan, rev 101) then B (viewed two): the server keeps the completion and holds both', async () => {
  const portal = fakePortal();
  await session(portal, new Map(), A_SEISAN);
  assert.equal(portal.row.state.rev, 101);
  await session(portal, new Map(), B_TWO);
  assert.deepEqual(portal.row.state.completed, ['seisan']);
  assert.deepEqual([...portal.row.state.viewed].sort(), ['chinto', 'seisan', 'wansu']);
  assert.equal(portal.row.summary.headline, '1 of 5 katas completed');
});

test('B (viewed two, rev 2) then A (completed Seisan): the server holds both', async () => {
  const portal = fakePortal();
  await session(portal, new Map(), B_TWO);
  assert.equal(portal.row.state.rev, 2);
  assert.equal(portal.row.summary.headline, '2 katas practised');
  await session(portal, new Map(), A_SEISAN);
  assert.deepEqual(portal.row.state.completed, ['seisan']);
  assert.deepEqual([...portal.row.state.viewed].sort(), ['chinto', 'seisan', 'wansu']);
  assert.equal(portal.row.summary.headline, '1 of 5 katas completed');
});

test("another device's equal-rev save landing between this save and its read-back is merged and saved again (KATAS-001)", async () => {
  const portal = fakePortal();
  // Both devices had viewed Seisan and Chinto and read that state; B completes Chinto.
  portal.row = { state: { rev: 2, viewed: ['seisan', 'chinto'], completed: [] }, summary: {} };
  const kit = await fakeKit(portal, new Map()).init();
  kit.mock = true;
  const { set, track } = localTrack();
  const sync = kataProgressSync(kit, { ids: IDS, cookie: () => '', track });
  await sync.start();
  // A's save lands, then B's equal-rev save (made from the same rev-2 read) replaces it
  // before A reads back.
  const save = portal.saveProgress.bind(portal);
  let raced = false;
  portal.saveProgress = async (args) => {
    const r = await save(args);
    if (!raced) {
      raced = true;
      await save({ p_state: { rev: 102, viewed: ['seisan', 'chinto'], completed: ['chinto'] }, p_summary: { headline: '1 of 5 katas completed' }, p_rev: 102 });
    }
    return r;
  };
  sync.record('completed', 'seisan');
  await idle(set);
  assert.deepEqual([...portal.row.state.completed].sort(), ['chinto', 'seisan']);
  assert.equal(portal.row.state.rev, 202);
  assert.equal(portal.row.summary.headline, '2 of 5 katas completed');
});

test('the read-back retry is bounded: a server that keeps replacing the save gets at most VERIFY_ATTEMPTS saves per run', async () => {
  const portal = fakePortal();
  const kit = await fakeKit(portal, new Map()).init();
  kit.mock = true;
  const { set, track } = localTrack();
  const sync = kataProgressSync(kit, { ids: IDS, cookie: () => '', track });
  await sync.start();
  const save = portal.saveProgress.bind(portal);
  portal.saveProgress = async (args) => {
    await save(args);
    portal.row = { state: { rev: 999, viewed: [], completed: [] }, summary: {} }; // always replaced
    return true;
  };
  const before = portal.saveCalls;
  sync.record('viewed', 'seisan');
  await idle(set);
  assert.equal(portal.saveCalls - before, VERIFY_ATTEMPTS);
});

test('equal set sizes on two devices (one viewed each) end with both on the server', async () => {
  const portal = fakePortal();
  await session(portal, new Map(), [['viewed', 'seisan']]);
  await session(portal, new Map(), [['viewed', 'chinto']]);
  assert.deepEqual([...portal.row.state.viewed].sort(), ['chinto', 'seisan']);
  assert.equal(portal.row.summary.headline, '2 katas practised');
});

test("B's offline dirty snapshot, replayed by the kit at start-up, cannot replace A's saved completion", async () => {
  const portal = fakePortal();
  const deviceB = new Map();
  // B reads (strict reads succeed) but its save fails: its kit cache stays dirty (rev 2).
  // (A save is never built after a failed read; see the strict-read tests below.)
  portal.savesFail = true;
  await session(portal, deviceB, B_TWO);
  assert.equal(deviceB.get('tskit:katas:u1').dirty, true);
  portal.savesFail = false;
  await session(portal, new Map(), A_SEISAN); // A saves rev 101
  // B reconnects: TSKit.init replays the dirty rev-2 snapshot before any class code runs.
  const kit = await fakeKit(portal, deviceB).init();
  assert.deepEqual(portal.row.state.completed, ['seisan'], 'the replay was dropped (2 < 101)');
  assert.equal(portal.row.summary.headline, '1 of 5 katas completed');
  // B's class code then loads, merges and, on its next event, publishes the union.
  kit.mock = true;
  const { set, track } = localTrack();
  const sync = kataProgressSync(kit, { ids: IDS, cookie: () => '', track });
  await sync.start();
  assert.deepEqual(sync.progress().completed, ['seisan']);
  sync.record('viewed', 'naihanchi');
  await idle(set);
  assert.deepEqual(portal.row.state.completed, ['seisan']);
  assert.deepEqual([...portal.row.state.viewed].sort(), ['naihanchi', 'seisan']);
  assert.equal(portal.row.summary.headline, '1 of 5 katas completed');
});

test('kataProgressSync: events before the first load are merged in, then published once', async () => {
  const portal = fakePortal();
  portal.row = { state: { rev: 1, viewed: ['wansu'], completed: [] }, summary: {} };
  const kit = await fakeKit(portal).init();
  kit.mock = true;
  let release;
  const gate = new Promise((r) => { release = r; });
  const load = kit.load.bind(kit);
  kit.load = (opts) => gate.then(() => load(opts));
  const { set, track } = localTrack();
  const sync = kataProgressSync(kit, { ids: IDS, cookie: () => '', track });
  const started = track(sync.start()); // main.js tracks the whole start-up
  sync.record('viewed', 'seisan');
  sync.record('viewed', 'chinto');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(portal.saveCalls, 0, 'no run before the first load resolved');
  assert.equal(set.size, 1, 'the start-up is pending work');
  release();
  await started;
  await idle(set);
  assert.equal(portal.saveCalls, 1, 'one publish');
  assert.deepEqual([...portal.row.state.viewed].sort(), ['chinto', 'seisan', 'wansu']);
  assert.equal(portal.row.summary.headline, '3 katas practised');
});

test('kataProgressSync: nothing recorded, nothing saved; a repeat or unknown kata is not republished', async () => {
  const portal = fakePortal();
  const kit = await fakeKit(portal).init();
  kit.mock = true;
  const { set, track } = localTrack();
  const sync = kataProgressSync(kit, { ids: IDS, cookie: () => '', track });
  await sync.start();
  assert.equal(portal.saveCalls, 0);
  sync.record('viewed', 'seisan');
  await idle(set);
  sync.record('viewed', 'seisan');
  sync.record('viewed', 'kusanku'); // not a kata of this class
  await idle(set);
  assert.equal(portal.saveCalls, 1);
});

test('kataProgressSync refuses to save for a learner who is no longer signed in, and reports it', async () => {
  const portal = fakePortal();
  const kit = await fakeKit(portal).init();
  const { set, track } = localTrack();
  let mismatches = 0;
  let cookie = cookieFor('u1');
  const sync = kataProgressSync(kit, { ids: IDS, cookie: () => cookie, onMismatch: () => { mismatches++; }, track });
  await sync.start();
  sync.record('viewed', 'seisan');
  await idle(set);
  assert.equal(portal.row.summary.headline, '1 kata practised');
  cookie = cookieFor('u2');
  sync.record('viewed', 'chinto');
  await idle(set);
  assert.equal(mismatches, 1);
  assert.equal(portal.row.summary.headline, '1 kata practised', 'nothing saved for the previous learner');
});

// ---- strict reads (portal plan 2026-10-06-kit-strict-load, STRICT-001 / STRICT-005) ----

/** Retry timers under test control: `fire()` runs every pending timer, as if its delay passed. */
function retryTimers() {
  const due = new Map();
  const scheduled = [];
  let next = 1;
  return {
    setTimer: (fn, ms) => { const id = next++; due.set(id, fn); scheduled.push(ms); return id; },
    clearTimer: (id) => { due.delete(id); },
    scheduled,
    pending: () => due.size,
    fire: () => { const run = [...due.values()]; due.clear(); for (const fn of run) fn(); },
  };
}

/** A window with only addEventListener, and `dispatch(type)` to raise an event. */
function fakeWin() {
  const listeners = {};
  return {
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    dispatch: (type) => { for (const fn of listeners[type] || []) fn(); },
  };
}

/** A sync on a fresh device with injected retry timers and window; console.warn silenced. */
async function strictSync(portal) {
  const kit = await fakeKit(portal, new Map()).init();
  kit.mock = true;
  const { set, track } = localTrack();
  const timers = retryTimers();
  const win = fakeWin();
  const sync = kataProgressSync(kit, { ids: IDS, cookie: () => '', track, win, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
  return { kit, set, timers, win, sync };
}
async function quietly(fn) {
  const warn = console.warn;
  console.warn = () => {};
  try { await fn(); } finally { console.warn = warn; }
}

test('isProgressUnavailable recognises only the strict-read rejection', () => {
  assert.equal(isProgressUnavailable(Object.assign(new Error('progress unavailable'), { code: 'progress-unavailable' })), true);
  assert.equal(isProgressUnavailable(new Error('network')), false);
  assert.equal(isProgressUnavailable(null), false);
  assert.equal(isProgressUnavailable(undefined), false);
});

test('every progress read is strict', async () => {
  const portal = fakePortal();
  const { kit, set, sync } = await strictSync(portal);
  const seen = [];
  const load = kit.load.bind(kit);
  kit.load = (opts) => { seen.push(opts); return load(opts); };
  await sync.start();
  sync.record('viewed', 'seisan');
  await idle(set);
  assert.equal(seen.length, 3, 'start, the read before merging, the read-back');
  for (const opts of seen) assert.deepEqual(opts, { strict: true });
});

test('disjoint equal revs: a device whose reads fail saves nothing, then publishes the union once reads recover (STRICT-001)', async () => {
  await quietly(async () => {
    const portal = fakePortal();
    portal.row = { state: { rev: 1, viewed: ['seisan'], completed: [] }, summary: { headline: '1 kata practised' } };
    const { set, timers, sync } = await strictSync(portal);
    portal.readsFail = true;
    await sync.start();
    assert.equal(timers.pending(), 0, 'nothing recorded yet: nothing to retry');
    sync.record('viewed', 'chinto'); // rev 1 too: saved now, it would replace Seisan
    await idle(set);
    assert.equal(portal.saveCalls, 0, 'no save after a failed read');
    assert.deepEqual(portal.row.state.viewed, ['seisan']);
    assert.equal(timers.pending(), 1, 'the failed run armed the retry');
    portal.readsFail = false;
    timers.fire();
    await idle(set);
    assert.equal(portal.saveCalls, 1);
    assert.equal(portal.row.state.rev, 2);
    assert.deepEqual([...portal.row.state.viewed].sort(), ['chinto', 'seisan']);
    assert.deepEqual(portal.row.state.completed, []);
    assert.equal(portal.row.summary.headline, '2 katas practised');
    assert.equal(timers.pending(), 0, 'cleared by the successful publish');
  });
});

test('a kata recorded while the first read is out, which then fails, is published by the timed retry alone (STRICT-005)', async () => {
  await quietly(async () => {
    const portal = fakePortal();
    portal.row = { state: { rev: 1, viewed: ['seisan'], completed: [] }, summary: {} };
    const { kit, set, timers, sync } = await strictSync(portal);
    let release;
    const gate = new Promise((r) => { release = r; });
    const load = kit.load.bind(kit);
    kit.load = (opts) => gate.then(() => load(opts));
    const started = sync.start();
    sync.record('viewed', 'chinto');
    portal.readsFail = true;
    release();
    await started;
    await idle(set);
    assert.equal(portal.saveCalls, 0, 'the failed first read published nothing');
    assert.deepEqual(sync.progress().viewed, ['chinto'], 'the recorded kata is kept');
    assert.deepEqual(timers.scheduled, [5000], 'the failed start-up read armed the retry');
    portal.readsFail = false; // no further record, no online event
    timers.fire();
    await idle(set);
    assert.equal(portal.saveCalls, 1);
    assert.deepEqual([...portal.row.state.viewed].sort(), ['chinto', 'seisan']);
    assert.equal(portal.row.state.rev, 2);
    assert.equal(timers.pending(), 0);
  });
});

test('the retry arms once per outage, backs off 5/10/20/30 s, fires at once on online, and clears on success', async () => {
  await quietly(async () => {
    const portal = fakePortal();
    const { set, timers, win, sync } = await strictSync(portal);
    portal.readsFail = true;
    await sync.start();
    sync.record('viewed', 'seisan');
    await idle(set);
    sync.record('viewed', 'chinto'); // a second failed run while the timer is pending
    await idle(set);
    assert.deepEqual(timers.scheduled, [5000], 'one timer, not restarted');
    assert.equal(timers.pending(), 1);
    timers.fire(); // still failing
    await idle(set);
    assert.deepEqual(timers.scheduled, [5000, 10000]);
    win.dispatch('online'); // still failing: retried at once, then re-armed
    await idle(set);
    assert.deepEqual(timers.scheduled, [5000, 10000, 20000]);
    assert.equal(timers.pending(), 1);
    timers.fire();
    await idle(set);
    timers.fire();
    await idle(set);
    assert.deepEqual(timers.scheduled, [5000, 10000, 20000, 30000, 30000], 'the last delay repeats');
    assert.equal(portal.saveCalls, 0);
    portal.readsFail = false;
    win.dispatch('online');
    await idle(set);
    assert.equal(portal.saveCalls, 1, 'online published at once');
    assert.equal(timers.pending(), 0, 'cleared on success');
    assert.deepEqual([...portal.row.state.viewed].sort(), ['chinto', 'seisan']);
    win.dispatch('online'); // not armed: nothing happens
    await idle(set);
    assert.equal(portal.saveCalls, 1);
    portal.readsFail = true; // a new outage starts the backoff again
    sync.record('viewed', 'wansu');
    await idle(set);
    assert.deepEqual(timers.scheduled.slice(5), [5000]);
  });
});

test('a failed read-back after a save arms the retry, which reads, merges and verifies again', async () => {
  await quietly(async () => {
    const portal = fakePortal();
    const { set, timers, sync } = await strictSync(portal);
    await sync.start();
    const save = portal.saveProgress.bind(portal);
    portal.saveProgress = async (args) => { const r = await save(args); portal.readsFail = true; return r; };
    sync.record('viewed', 'seisan');
    await idle(set);
    assert.equal(portal.saveCalls, 1);
    assert.equal(timers.pending(), 1);
    portal.saveProgress = save;
    portal.readsFail = false;
    timers.fire();
    await idle(set);
    assert.equal(timers.pending(), 0);
    assert.deepEqual(portal.row.state.viewed, ['seisan']);
  });
});

test('an older kit that ignores { strict: true } answers a failed read with {} and the sync publishes as before', async () => {
  const portal = fakePortal();
  const { kit, set, timers, sync } = await strictSync(portal);
  const load = kit.load.bind(kit);
  kit.load = () => load(); // drops the option
  portal.readsFail = true;
  await sync.start();
  sync.record('viewed', 'seisan');
  await idle(set);
  assert.equal(portal.saveCalls, 1, 'the previous behavior: published after a failed read');
  assert.equal(timers.pending(), 0, 'no rejection, so no retry');
});

test('mockKit: load and save round-trip in memory, saves are recorded, a lower rev is dropped', async () => {
  const win = {};
  const kit = mockKit(win);
  assert.deepEqual(await kit.load(), {});
  await kit.save({ rev: 101, viewed: ['seisan'], completed: ['seisan'] }, { headline: '1 of 5 katas completed' });
  await kit.save({ rev: 2, viewed: ['chinto', 'wansu'], completed: [] }, { headline: '2 katas practised' });
  assert.deepEqual(await kit.load(), { rev: 101, viewed: ['seisan'], completed: ['seisan'] });
  assert.deepEqual(win.__kitSaves.map((s) => s.summary.headline), ['1 of 5 katas completed', '2 katas practised']);
});
