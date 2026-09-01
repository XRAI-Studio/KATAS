# Kata Viewer — Motion Quality Layer — Design

**Date:** 2026-09-01
**Status:** Approved by user ("motion first, then look")

## Context

The kata viewer plays five Isshin Ryu katas on a procedural avatar (`kata-viewer/js/avatar.js`) from
hand-authored keyframes of named poses (`poses.js`, `data/*.json`) through a pure time→pose sampler
(`player.js`). The user wants higher animation quality **while staying true to the movements**.

The user chose *motion first, then look*: improve how the figure moves before replacing the mesh with a
skinned GLB (that is a later, separate plan; the design decision that it will be built **to the existing
17-joint skeleton** means nothing in this plan is throwaway).

What limits fidelity today is the interpolator, not the mesh:

- `samplePose` applies the *same* smoothstep between every keyframe pair, so the figure decelerates to a
  dead stop at every keyframe. There is no difference between a technique landing with **kime** and a
  transitional position. The source docs specify exactly this: Seisan step 4 *"1 beat, sharp stop"*,
  step 13 *"snap backfist, quick retreat"*, performance notes *"clear pauses on key techniques"*.
- Euler-angle lerp wobbles on multi-axis poses (`blockMid`, `backfist`, `haito`).
- *"Look before turning"* is a named key theme in the docs but only a few steps author a head turn.
- Open-hand techniques (shuto, nukite, haito, shote) render as the same fist sphere as punches.
- Feet float/sink between stances because `root.y` per stance is hand-tuned and lerped independently
  of leg geometry.

Hard constraints carried forward from the approved spec: static site, no build step, vendored three r169,
**`player.js` stays free of Three.js and the DOM** (Node tests import it directly; `'three'` only resolves
via the browser import map). Kata JSON stays backward compatible (new fields optional). `samplePose`
stays a pure function of time so scrub/pause/reverse remain exact.

## Design

### Data model additions (all optional, defaults derived)

Per keyframe (`data/*.json`):
- `"ease": "kime" | "soft" | "pass"` — arrival style. Default derived (see below).
- `"hold": <beats>` — hold after a kime arrival. Default `KIME_HOLD_BEATS = 0.3`, capped at 50% of the gap
  to the next keyframe.

Per step:
- `"look": "left" | "right" | "none"` — override for auto look-ahead before a facing change.

Per pose (`poses.js`, authoring metadata, mirrored with the pose):
- `hands: { L?: 'open'|'fist', R?: 'open'|'fist' }` on arm poses that are open-hand.
- `airborne: true` on `jumpKick` (root offset is deliberate; skip ground clamp).
- `kime: true` on techniques (punch*, uppercut, backfist, hammerfist, nukite, haito, shuto*, shote,
  elbow*, block*, xBlock*, openHandBlock, archerBlock, reinforcedBlock, double*, kicks, kneeLift,
  legLift, stomp, dumpFinish). Not on chamber, guard*, grabPull, armsDown, handsStacked, dumpLoad.
- `pass: true` on `crossoverL/R` stances.

Exported as `POSE_META[name]` alongside `POSES`.

### Ease derivation (`buildTimeline`, pure)

For each keyframe, if `ease` is not authored:
1. `pass` if its stance has `pass` meta.
2. `kime` if any arms/legs pose with `kime` meta is present that was **not** present in the previous
   keyframe **of the assembled timeline** (across step boundaries — a technique arriving with the step
   is the commonest kime in these katas: Seisan step 1 t=0 `blockMidL` after step 0's `ready`,
   Naihanchi step 4 t=0 `haitoR` after `guardBoth`; but Seisan step 5 t=0 inherits `blockDoubleHigh`
   from step 4 → no new technique → soft).
3. otherwise `soft`.

Holds are a **second pass** over the finished `kfs` array, after the `TRANSITION_FRACTION` adjustment
(a step's last keyframe's hold depends on the *next* step's first keyframe time, which only exists once
the walk logic has run — doing it inline yields non-monotonic times and breaks the binary search).
A `kime` keyframe at time T becomes `(T, pose)` and `(T + hold, pose)`; the constant segment is the
hold. `hold` is capped at 50% of the gap to the next keyframe, so it eats into the walk gap, never into
the technique itself. The kata's final keyframe gets no hold (sampling already clamps to the last pose).
Duration never changes.

### Segment curves (`samplePose`)

Each internal keyframe knows whether it is a **stop** (`kime`, `soft`, hold end) or **moving** (`pass`).
The curve for the segment A→B is chosen from (A stop/moving, B kind):

| from A | into B = kime | into B = soft | into B = pass |
|---|---|---|---|
| stop | `KIME` (accelerate, peak ~2/3, non-zero end slope = abrupt stop) | smoothstep | ease-in (`u²`) |
| moving | `KIME` | ease-out (`1-(1-u)²`) | linear |

All curves are monotonic with f(0)=0, f(1)=1 — no overshoot, so "sample lies strictly between keyframe
values" remains a property. `KIME(u) = u²(2−u)` initially; constants live at the top of `player.js` for
tuning during visual review. The same curve drives joints, root, embusen, and hand blend for the segment.

### Quaternion interpolation

New pure module `kata-viewer/js/quat.js`: `eulerXYZToQuat`, `slerp`, `quatToEulerXYZ` (debug),
plus the small vec3 helpers needed by `rig.js`. Joint Eulers are converted **once** in `buildTimeline`;
`samplePose` slerps and returns `joints[name] = {x,y,z,w}`. `avatar.setPose` accepts either form
(`w !== undefined` → `quaternion.set`, else `rotation.set`). Authoring format (`poses.js`,
`composePose`, `mirrorPose`) stays Euler.

### One sampler for performer and attacker

`player.js` exports `sampleClip(kfs, t)` — the keyframe-list sampler `samplePose` is built on. `bunkai.js`
converts its `ATTACKS` tables into the same internal keyframe format at init (poses resolved, ease
derived by the same rule, times in u-space) and drops its duplicated lerp. Attacker punches then snap
with kime too.

### Look-ahead before turns

In the same second pass, at each step boundary where `|Δfacing| > 20°`: unless the previous step's last
keyframe already authors `head`, or `step.look === "none"`, set `head.y = ±LOOK_YAW (0.85)` toward the
turn direction **on that keyframe's hold-end frame** (body constant through the hold, head turns during
it — no third keyframe, no duplicate-time ambiguity). If the last keyframe is not kime (no hold), insert
one hold-end frame for the look using the same 50%-of-gap cap. +y = look left = toward +X; turn
direction = sign of shortest-path Δfacing; exactly 180° → use `step.look`, default left. The next step's
first keyframe already has `head.y = 0`, so the head un-yaws while the body turns during the walk —
eyes stay on target, body catches up. Add `"look"` to Seisan steps 12/15/18 (docs say "look over R/L
shoulder").

### Hand states

`composePose` merges `hands`; `buildTimeline` records per keyframe `hands: {L: 0|1, R: 0|1}` (1 = open);
`samplePose` blends with the segment curve and returns `hands`. `avatar.js` gives each wrist two meshes —
fist sphere and an open knife-hand (flat box + thumb) — and cross-scales them by the blend. Later the GLB
character maps the same scalar to a finger-curl bone or morph.

### Ground clamp (feet on the floor)

New pure module `kata-viewer/js/rig.js` exporting the skeleton offsets/limb lengths now hard-coded in
`avatar.js` (`HIPS_Y`, `THIGH`, `SHIN`, hip/knee/ankle offsets, foot sole offset) and `footSoleY(pose)`:
forward kinematics of both legs in pose-root space returning the lower sole height. `avatar.js` builds
its geometry from `rig.js` so the two can't drift. In the shared `sampleClip` path (so the bunkai
attacker is clamped too — attacks have no airborne poses), after blending: unless the frame is airborne
(either endpoint airborne → blend the correction to 0), shift `root.y` so the lower sole sits at y=0.
Removes floating/sinking through every stance transition and drop.

### Stretch (separate task, only if phases 1–3 look right): foot lock during steps

Detect the swing foot per transition segment (larger FK displacement), keep the other foot's world
contact fixed via two-bone analytic leg IK, add a low suri-ashi lift arc (≤ 0.03 m) to the swing foot.
Pure math in `player.js` using `rig.js`/`quat.js`. Explicitly optional; do not start it until the user
has seen phases 1–3.

## Follow-on (separate spec)

Phase "look": a skinned GLB karateka built **to the existing 17-joint skeleton** (same bone names and
joint positions from `rig.js`, rest pose = arms at sides) so the pose library and all kata data stay
untouched; `avatar.js` drives bone quaternions instead of group rotations. Asset source (Blender script,
Higgsfield `generate_3d` + Blender auto-weights, or a purchased rigged character) to be decided then.
Motion capture stays out of scope (see the 2026-07-02 spec's YAGNI list).
