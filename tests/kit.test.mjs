import test from 'node:test';
import assert from 'node:assert/strict';
import { award, flushAwards, furthestStepTracker, homeRoomHandler, HOME_ROOM_URL, initKit, isDevHost, mockKit, pendingAwardCount, sameAccount, sessionUserId, GAME } from '../public/js/kit.js';

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
  const onClick = homeRoomHandler({
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
  const onClick = homeRoomHandler({
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
  const onClick = homeRoomHandler({ flush: async () => true, assign: (url) => assigned.push(url), win });
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
