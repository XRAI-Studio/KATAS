import test from 'node:test';
import assert from 'node:assert/strict';
import { award, furthestStepTracker, initKit, isDevHost, mockKit, sameAccount, sessionUserId, GAME } from '../public/js/kit.js';

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
