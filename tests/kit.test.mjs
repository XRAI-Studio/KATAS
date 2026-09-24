import test from 'node:test';
import assert from 'node:assert/strict';
import { furthestStepTracker, initKit, isDevHost, mockKit, GAME } from '../public/js/kit.js';

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
