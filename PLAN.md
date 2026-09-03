# Plan: Kata avatar graphics upgrade (procedural pass → scripted skinned GLB)
_Locked via claudex-loop — by Claude + Saint Wiggy, 2026-09-03. Codex (gpt-5.6-sol) adversarial review:
APPROVED in round 4/5 after 36 findings (log in scratchpad `PLAN-REVIEW-LOG.md`, to be committed as
`PLAN-REVIEW-LOG.md` with this file as `PLAN.md` on sign-off)._

## Status (2026-09-03)
- **Stage A (steps 1–9): DONE** — commits `0f8eece`, `2470766`, `06a17b7` on `graphics`; Codex cross-inspected
  (see PLAN-REVIEW-LOG.md "Post-build inspection — Stage A"). User confirmed the default vertical fist
  (`wrist.y = 0`, harness cells 1.1 / 2.1) is the correct Isshin Ryu standard.
- **Stage B (steps 10–17): NEXT.** Already in place: `quat.js` `poseToBoneLocal` / `twistAboutY` /
  `quatFromAxisAngle` / `conjQuat` with `tests/glb-pose.test.mjs` (rest-relative posing proven against
  three's `Bone` hierarchy); Blender 4.5.3 headless verified (`"C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" -b -noaudio -P`, glTF add-on present).
  Remaining: `tools/dump-rig.mjs`, `tools/build-avatar.py`, `tools/build-avatar.ps1`, vendor GLTFLoader (+BufferGeometryUtils)
  from three r169 `examples/jsm`, GLB driver in `avatar.js` (validate → cache rest orientations on the isolated root →
  attach → `frustumCulled=false` → per-side morph targets → recolour `gi/belt/skin` → `onReady`), `tests/glb.test.mjs`,
  Chrome smoke (`?avatar=missing.glb` fallback), then a fresh read-only Codex inspection.
- Test command: `node --import ./tests/three-resolver.mjs --test tests/*.test.mjs` (resolve hook for the bare `three` specifier).
- Codex at xhigh can exceed 10 min on a big diff: run `codex exec` in the background and poll its `-o` file.

## Context

The kata viewer (`kata-viewer/`) plays five Isshin Ryu katas on a procedural three.js mannequin
(`js/avatar.js`) driven by a 17-joint pose library (`js/poses.js`) through a pure sampler (`js/player.js`).
Motion phases 1–3 are done and approved; the user has now put **graphics before movement fine-tuning**.

The teaching requirement that drives everything: **a viewer must be able to see whether a fist is
vertical or horizontal**, and the user must be able to fine-tune movements afterwards by editing numbers
in one place. Recon showed the current avatar cannot meet this: the fist is a sphere (`avatar.js:84`),
so orientation is invisible, and no pose authors forearm twist. The skeleton, however, already produces
a vertical (tate-ken) fist by default when the arm is raised with zero twist — the mesh hides it.

## Goal

Two stages, both consuming the existing 17-joint skeleton unchanged:

- **Stage A (procedural, first):** a much better three.js primitive avatar — knuckled fist and named hand
  shapes, visible wrist, tapered limbs, segmented feet, a face — so fist orientation and hand shape are
  legible immediately, plus a close-up camera preset and follow-cam. Not throwaway: its hand-shape and
  twist contracts become the GLB's spec, and it remains the load-failure fallback.
- **Stage B (skinned GLB, second):** a Blender-4.5-scripted humanoid mesh + armature built to `rig.js`
  dimensions and bone names (arms-down rest pose), with deterministic in-script vertex weights and
  per-hand morph targets, exported to `kata-viewer/assets/karateka.glb` by one wrapper
  (`tools/build-avatar.ps1`), loaded with a vendored r169 `GLTFLoader`. `poses.js` hand vocabulary
  changes; **kata JSON stays byte-for-byte untouched**.

## Key decisions (locked in interrogation)

| # | Decision | Choice |
|---|---|---|
| D1 | Asset strategy | **A then B.** Rejected C (pre-made Mixamo-style rig + retarget): T-pose→arms-down offset layer sits between the user's numbers and what they see, wrecking fine-tuning. |
| D2 | Hand representation | **Named hand shapes per side**, mesh-owned: `hands: {L, R}` ∈ `'fist' \| 'open' \| 'spear' \| 'palm'` (extensible) in `poses.js`; `player.js` blends **per-shape weights** (replaces the 0/1 scalar); the mesh shows one baked shape per name (procedural: one mesh per shape, cross-faded; GLB: **separate `handL`/`handR` skinned meshes, each with morph targets `open`/`spear`/`palm` on a fist basis**, driven per side). **No new joints in `JOINT_NAMES`.** |
| D3 | Fist orientation knob | **`wrist.y` in radians, 0 = vertical fist** (thumb up when punching forward — the rig's current default). ±π/2 = horizontal. `mirrorPose` already negates `y`, so L/R are correct for free. **No existing pose gets a value now**; fine-tuning adds them where the dojo differs. GLB: a deform-only, non-ancestor `forearmTwist` helper bone receives half the **swing-twist-extracted** twist angle of the sampled wrist quaternion. |
| D4 | Skeleton growth | None. Fingers, forearm twist, toes are mesh-side bones/meshes driven by the 17 sampled joints + hand-shape weights. |
| C1 | Colours | Performer as today. Attacker already contrasts (`bunkai.js:90`: dark gi, dark-red belt) — keep. |
| C2 | Surface | Flat colours in A; simple baked gi seam / belt texture in B. |
| C3 | Face | Eyes + brows (dark discs) in A; modelled in B. |
| C4 | Camera | New **`hands`** preset (close, front-high, target at chest) and a **follow** toggle that keeps the orbit target on the performer's chest during embusen travel. |
| C5 | Proportions | Realistic adult (rig.js lengths), limbs slightly thicker than now, hands ~19 cm. |
| C6 | Feet | Heel / ball / toe segments in A (Phase 4 footwork will need them). |
| C7 | GLB delivery | `kata-viewer/assets/karateka.glb` committed. **Sole build entry point: `tools/build-avatar.ps1`** (dump-rig → Blender 4.5 headless `build-avatar.py` → GLB structural test). |
| C8 | Fallback | `avatar.js` keeps the procedural karateka; used when the GLB fails to load or while it loads. |

## Approach

### Stage A — hand-shape contract + procedural avatar

1. **`poses.js`** — hand metadata becomes the four-value vocabulary `HAND_SHAPES = ['fist','open','spear','palm']`.
   Map existing sets: `OPEN_RIGHT`/`OPEN_BOTH` stay `'open'` except `nukite → 'spear'`, `shote → 'palm'`.
   `emptyPose()` default stays `'fist'`. `composePose`/`mirrorPose` unchanged (they copy strings).
   `tests/poses.test.mjs` updated (`nukiteR.hands.R === 'spear'`, `shoteR.hands.R === 'palm'`).
2. **`player.js`** — `resolveEntry` validates each hand name against `HAND_SHAPES` (throws on unknown —
   this is where pose-library hand metadata gets validated, not `validate-data.mjs`) and stores names.
   One pure `handWeights(shapeA, shapeB, u)` produces `{fist, open, spear, palm}` summing to 1; it is
   used in **every** return path — `snapshot()` (endpoints, holds, `a.pose === b.pose`) and the
   interpolated path — so no path leaks strings. Output contract: `sample.hands = {L: weights, R: weights}`.
   `bunkai.js` `sampleAttack` shares `sampleClip` and needs no change. Tests: weights sum to 1
   mid-segment; same-shape segment → weight 1, no cross-fade; endpoints and holds return weight maps;
   sample every kata timeline at 0.1 s and assert finite canonical weights per side (replaces the scalar
   assertion in `tests/data.test.mjs:52`).
3. **`player.js` additive tweaks** — existing keyframe `overrides` keep their whole-joint-replacement
   semantics **unchanged** (no migration, no JSON edits). A new optional keyframe field **`adjust`**
   (`{ "wristR": { "y": 1.57 } }`) merges **per axis** onto the resolved joint after `overrides`, so a
   fist-orientation tweak keeps `shote`'s authored `wrist.x`. `validate-data.mjs` gains one shared
   validator applied to **both** `overrides` and `adjust` (today it checks neither): object-shaped entries,
   keys ∈ `JOINT_NAMES`, axes ⊆ `{x,y,z}`, finite numbers. Test: `shote` + `adjust wristR.y` retains `x`;
   a timeline built from every kata is byte-identical before/after this change (regression).
4. **`rig.js` becomes the complete skeleton schema** — every joint's parent and rest offset moves here
   (`spine (0,0.12,0)`, `chest (0,0.14,0)`, `neck (0,0.30,0)`, `head (0,0.05,0)`, `shoulder (±0.24,0.24,0)`,
   plus the existing hip/knee/ankle/elbow/wrist chain) as `RIG.JOINTS = { name: { parent, offset } }`
   (x mirrored for R); `avatar.js` builds its Groups from it; `footSoleY` is re-expressed over the same
   table (value unchanged — regression test pins the current standing sole height). Add `HAND
   {len, w, thick}` and foot segments (heel/ball/toe) so mesh and GLB agree.
5. **`avatar.js`** — rebuild the karateka with the same joint Groups:
   - Fist: box body with a knuckle ridge (4 small boxes) on the dorsal side, thumb across the front — so
     top and side are distinguishable; oriented so `wrist.y = 0` reads as a vertical fist when punching.
   - Open / spear / palm: flat hand + finger blocks; spear = fingers together/straight, palm = fingers
     drawn back with heel forward.
   - `setPose` scales each shape mesh by its weight (keep the 0.01 floor).
   - Tapered limbs, visible wrist and ankle, elbow/knee caps; feet = heel + ball + toe blocks with the
     sole plane at `RIG.FOOT`; face = eyes + brows (+ existing nose/hair); belt knot + lapel wedge.
   - `createKarateka(opts)` returns `{ group, setPose, onReady(cb), getJoint(name),
     getChestWorldPosition(out) }` — the `joints` map is no longer exposed as a mutable object, so the
     Stage B swap cannot leave callers holding hidden procedural nodes (round-3 #3). Colour options are
     kept on the instance so Stage B can re-apply them (finding #9).
6. **`scene.js`** — `CAMERA_PRESETS.hands` (pos `[0.6, 1.5, 2.0]`, target `[0, 1.15, 0.6]`).
   Follow-cam: `setFollow(bool)`, `follow(chestWorldPos)`, `rebaseFollow(chestWorldPos)`; each tick moves
   `controls.target` **and** `camera.position` by the delta from the last tracked position, so orbit
   offset is preserved. Wiring: `Player` gains an `onSeek` callback (fired from `seek()`; `seekStep`,
   `nextStep`, `prevStep` go through it; `play()`'s replay-from-end uses `seek(0)` so it fires too).
   `main.js` sets a **pending-rebase flag** on: follow enable, `onSeek`, kata load, `?follow=1` restore,
   OrbitControls `end`, preset-tween completion, and avatar `onReady`; the flag is **consumed after
   `applyTime()` has applied the new pose and embusen** in the same frame, so the rebase observes the
   post-seek chest, never the stale one. The chest position comes from `karateka.getChestWorldPosition()`
   (a stable method — see step 5), not from a retained `joints` object. **`index.html`/`ui.js`** add
   `Hands` button + `Follow` checkbox; `?cam=hands`, `?follow=1` in copy-link.
7. **`kata-viewer/dev/hands.html`** — acceptance harness: builds tiny clips with `buildClip` and samples
   them with `sampleClip` (so `setPose` receives the real sampled contract — quaternions + weight maps,
   never authored strings) for `punchMidL/R` with `adjust wrist.y ∈ {0, +π/2, −π/2}` and for all four
   hand shapes, framed from the `hands` preset, with labels. This is the horizontal-fist acceptance case
   (finding #12); it drives the procedural avatar now and the GLB later. Screenshots go in the review log.
8. **Docs** — `docs/timing-guide.md`: rows for "fist orientation → keyframe `adjust: { wristR: { y } }`,
   radians, 0 vertical, merges onto the pose's other wrist axes (existing `overrides` unchanged: whole
   joint)" and "hand shape → `hands` metadata in poses.js"; `docs/review-notes.md` hands row updated.
9. Visual check via `.\serve.ps1` at the `hands` preset on Seisan steps 1–4, Seisan nukite, Naihanchi haito,
   and `dev/hands.html`.

### Stage B — Blender-scripted skinned GLB

10. **Coordinate contract** (finding #2): rig space is Y-up, +Z forward, left = +X. Blender is Z-up with the
    character facing −Y by convention; the glTF exporter (`export_yup=True`) maps Blender `(x,y,z)` →
    glTF `(x, z, −y)`. So the script places rig point `(X,Y,Z)` at Blender `(X, −Z, Y)`; after export the
    GLB is in rig space with no runtime transform. Verified by the GLB structural test in step 15.
11. **`tools/dump-rig.mjs`** writes `tools/rig.json` from `RIG` (offsets, parents, hand/foot dims, plus a
    schema hash). **`tools/build-avatar.py`** (bpy, Blender 4.5, `blender -b -noaudio -P`) reads it and:
    - builds an armature with **exactly the 17 rig bone names** at the rig joint positions, hips at the
      **armature-local origin** (finding #3 — `body` remains the sole owner of `HIPS_Y`/root offsets/yaw).
      **All bone heads and tails are specified in rig space** (tail = head + child offset, or +rig-Y for
      torso/head/hips, −rig-Y for the hanging arm/leg bones) and pass through the one conversion
      `(X,Y,Z) → (X,−Z,Y)`; so an upward torso bone points Blender +Z. Rest pose arms at sides;
    - adds deform-only helper bones that are **not ancestors** of any rig bone: `forearmTwistL/R`
      (child of `elbow*`, sibling of `wrist*`, weights on the distal forearm), `toesL/R`;
    - builds a low-poly humanoid from generated limb/torso sections and assigns **deterministic vertex
      groups during generation** (finding #16); `ARMATURE_AUTO` is not used;
    - **materials are named `gi`, `belt`, `skin`** (validated at load; recolour by name);
    - hands are **two separate meshes named `handL` / `handR`**, each modelled as a fist (basis) with
      shape keys `open`, `spear`, `palm` → per-side morph targets with `targetNames` (finding #6, round-2 #2);
    - all mesh objects have **identity transforms with vertex positions in armature space** (transforms
      applied before export) — asserted by the GLB test;
    - writes the `RIG` **schema hash as a custom property `rigSchemaHash` on the armature object**
      (exported with `export_extras=True` → the armature node's `extras`; Blender's exporter does not
      populate `asset.extras` without a hook — round-3 #6);
    - exports `kata-viewer/assets/karateka.glb` (skins, morph targets, no animations, Y-up).
    One wrapper, **`tools/build-avatar.ps1`**, runs dump-rig → Blender → the Node GLB test (finding #15).
12. **Vendor** `GLTFLoader.js` (+ `BufferGeometryUtils.js`) from three r169 `examples/jsm` into
    `kata-viewer/lib/three/`, path-fixed to the import map. No other deps.
13. **`avatar.js` GLB driver** — `createKarateka` returns the procedural mesh immediately, starts the GLB
    load, and on load **validates before swapping** (finding #10): all 17 bone names present once,
    parent relationships match `RIG.JOINTS`, ≥1 `SkinnedMesh`, meshes `handL`/`handR` each with morph
    targets `open/spear/palm`, materials `gi`/`belt`/`skin` present, armature node
    `userData.rigSchemaHash` equals the live `RIG` hash; on any failure keep the procedural avatar and
    `console.error`. On success (`console.info('karateka: glb active')`):
    - every skinned mesh gets `frustumCulled = false` (r169 computes a `SkinnedMesh` bounding sphere once
      at rest; a small hand sphere would be culled mid-punch — round-3 #2);
    - **Before attaching** the GLB scene to `body` (which may be turned/moved by embusen and root
      offsets at load time), call `gltf.scene.updateMatrixWorld(true)` on the isolated root and cache each
      bone's **armature-space rest orientation** `A_i` (round-2 #5; this is why the matrix update is
      needed — not the #24772 clone issue). Then attach under `body`.
    - Rest-relative posing (finding #4): rig joint frames are world-aligned at rest, GLB bone frames are
      not, so for a sampled joint quaternion `q_i` the bone's local quaternion is
      `A_parent⁻¹ · q_i · A_i` (derived: desired world orientation `W_i = Q_i·A_i` with `Q_i` the
      accumulated rig rotation; local = `W_parent⁻¹·W_i`). Implemented as a pure helper in `quat.js`
      (`poseToBoneLocal`) with a Node test against the vendored three (`Bone` hierarchy world matrices
      must equal rig FK for several poses, feet included → also proves the ground clamp still holds).
    - Forearm twist (finding #5): `quat.js` gains `twistAboutY(q)` (swing-twist decomposition, pure,
      tested) giving θ, the wrist's twist about the rig's forearm axis (rig-space −Y of the elbow frame).
      The helper is posed **through the same rest-relative equation as rig bones**: its rig-space
      rotation is `q_h = quatFromAxisAngle(rigY, 0.5·θ)` and its local bone quaternion is
      `A_elbow⁻¹ · q_h · A_helper` — so bone roll / downward axis / mirroring are handled by `A`, not by
      sign conventions (round-3 #5). Tested in `tests/glb-pose.test.mjs` for both arms at ±π/2: the
      helper's world twist equals ±π/4 about the forearm axis. `wrist*` receives its full pose as before;
      since the helper is not an ancestor, nothing compounds.
    - Hand shapes: per side, `hands.L` weights → `handL.morphTargetInfluences[open|spear|palm]` (fist =
      basis = 1 − others); likewise `handR`.
    - Materials `gi`/`belt`/`skin` are cloned per instance and recoloured from the instance's colour
      options before `onReady(cb)` fires; `bunkai.js` re-does its transparency pass in `onReady` (finding #9).
14. **`tests/rig.test.mjs`** — `dump-rig.mjs` output equals `RIG` and its schema hash is stable.
15. **`tests/glb.test.mjs`** — parses the committed GLB directly (12-byte header + JSON chunk + BIN;
    no loader, no DOM). Asserts: node names/hierarchy match `RIG.JOINTS`; **each joint's rest position,
    reconstructed by composing the full node TRS chain from the armature root, equals rig FK rest position
    within 1e-4** (raw local translations are in rotated bone frames and are *not* compared — round-2 #3;
    this is what proves the coordinate contract); hips at origin; `handL`/`handR` present with
    `targetNames` `open/spear/palm`; materials named `gi/belt/skin`; **every mesh node has identity TRS**
    (so accessor positions are armature-space and the floor check is valid — round-2 #10); the lowest
    `POSITION` vertex across skinned meshes is within 5 mm of `−RIG.HIPS_Y`; armature node
    `extras.rigSchemaHash` equals the current `RIG` hash (round-2 #9); file < 2 MB. **Skin validity**
    (round-3 #4): every skinned primitive has `JOINTS_0`/`WEIGHTS_0`, each joint index < skin joint
    count, per-vertex weights sum to 1 ± 1e-3 with no all-zero vertex, `inverseBindMatrices` present with
    one matrix per joint; `handL`/`handR` are skinned primitives referencing the character skin.
16. **Browser smoke (manual, Claude-in-Chrome, recorded in the review log)** — load the viewer once
    normally (assert via console that the GLB activated: `avatar.js` logs `karateka: glb active`) and once
    with the asset path broken (`?avatar=missing.glb` dev param) asserting the procedural fallback and the
    logged error. No test-runner dependency is added (repo stays zero-deps) — round-2 #11.
17. **Deploy** — `deploy.yml` already publishes `kata-viewer/` wholesale; the new tests join the gate;
    confirm the `.glb` is served (Pages: `model/gltf-binary`).

## Assumptions (confirmed ledger)

1. 17-joint skeleton (`rig.js`/`poses.js`) is the source of truth; graphics consume it. — spec 2026-09-01 "Follow-on"; memory 2026-09-03.
2. `poses.js`/kata JSON untouched except hand-shape vocabulary (D2) and optional future `wrist.y`. — `avatar.setPose` accepts every joint.
3. `player.js`, `rig.js`, `poses.js`, `quat.js` stay Three-free. — `tests/*.test.mjs`.
4. Static site, no build step, three r169 vendored; GLTFLoader must be vendored. — `index.html` import map, `deploy.yml`.
5. Hand state is sampled by `player.js` and rendered by the mesh — now as shape weights. — `player.js:241`.
6. Ground clamp depends on `RIG.FOOT` and limb lengths; new meshes must place soles per `rig.js`. — `rig.js:20-41`.
7. Existing camera presets are 5 m away; a close preset is needed for fist judgement. — `scene.js:8`.
8. Blender 4.5 present at `C:\Program Files\Blender Foundation\Blender 4.5`; headless run **not yet smoke-tested** (risk R1).
9. Bunkai attacker uses `createKarateka` → gets the upgrade automatically. — `bunkai.js:1,90`.
10. No three.js/graphics skill packs on either bench; no Toolchain section. Higgsfield `generate_3d` unused (option C rejected).
11. Codex reviewer: codex-cli 0.144.1, model `gpt-5.6-sol`.
12. Movement fine-tuning out of scope; plan must not make it harder.
13. Bone world matrices are not computed on GLB load; `updateMatrixWorld()` is needed before caching rest orientations. — three.js #24772 (context), step 13.
14. Blender 4.5 headless: `-noaudio` for clean exit; vertex groups are assigned in-script (no `ARMATURE_AUTO`). — Blender API docs; Codex round 1 #16.
16. Blender→glTF axis mapping `(x,y,z) → (x, z, −y)` with `export_yup=True`. — Blender glTF exporter docs; verified by `tests/glb.test.mjs`.
15. Pre-made rigged karate assets are Mixamo/Rigify T/A-pose rigs → retarget project, confirms rejecting C.

## Risks / open questions

- **R1** Deterministic vertex groups on a generated low-poly mesh can crease at armpit/groin/elbow.
  Mitigation: blend weights across the two adjacent bones for the ring of vertices at each joint.
- **R2** `player.js` hand contract change ripples to `bunkai.js` (shares `sampleClip`) and three tests —
  bounded, covered in step 2. `overrides` semantics are unchanged; `adjust` is purely additive (step 3).
- **R5** Rest-relative posing formula (step 13) is the single most bug-prone line; it is unit-tested against
  three's own `Bone`/`updateMatrixWorld` before the GLB exists, using a synthetic bone hierarchy with
  non-identity rest rotations.
- **R3** Follow-cam fights OrbitControls damping; move camera and target by the same delta per tick and
  disable follow while the user is dragging (`controls` `start`/`end` events).
- **R4** GLB size for Pages: target < 2 MB (low-poly, no textures beyond a 512² atlas).

## Out of scope

- Movement/timing fine-tuning, Phase 4 footwork IK (later plans).
- Mocap, pre-made rigs, retargeting (D1).
- Finger-level authored joints (D2/D4).
- Environment/dojo changes beyond the camera preset.

## Verification

- `node --test tests/*.test.mjs` and `node tools/validate-data.mjs` pass (deploy gate).
- `.\serve.ps1` → `http://localhost:8420/?kata=seisan&cam=hands&t=2.5`: vertical fist visible on the
  mid punch; `?kata=seisan&cam=hands` scrub to nukite shows a spear hand; Naihanchi haito shows open
  hand; `?follow=1` on Chinto keeps the performer framed through the embusen.
- Stage B: `karateka: glb active` logged; standing sole at floor; no candy-wrap at wrists; hands stay
  visible through punches and high blocks; `?avatar=missing.glb` shows the procedural fallback with the
  logged error; `dev/hands.html` shows ±π/2 fists correctly on both sides with the GLB.
- Post-build cross-inspection by a fresh read-only Codex session (claudex-loop default, `inspect=on`).
