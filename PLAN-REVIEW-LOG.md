# Plan Review Log: Kata avatar graphics upgrade
Phases 0-1 (recon + interrogation) complete — plan locked with the user. MAX_ROUNDS=5. Reviewer: codex-cli 0.144.1, gpt-5.6-sol/xhigh.

## Round 1 — Codex
The plan is not sound enough to implement. Stage A is mostly viable; Stage B has several contract and rigging defects likely to produce a misaligned or incorrectly posed GLB.

1. **`rig.js` is not a complete 17-joint source of truth.** It contains limb lengths and hip/foot data, while spine, chest, neck, head, and shoulder offsets remain hard-coded in [avatar.js:45](/C:/Users/thetr/SOURCE/repos/katas/kata-viewer/js/avatar.js:45); the generator proposed at [plan:83](/C:/Users/thetr/.claude/plans/i-want-to-upgrade-fluttering-penguin.md:83) therefore cannot reconstruct the procedural skeleton.
   Fix — Move every joint offset and parent relationship into `RIG`, make `avatar.js` consume them, and dump that complete schema.

2. **Blender and viewer coordinates are conflated.** The viewer uses Y-up/+Z-forward, while Blender uses Z-up/Y-forward and glTF exports Y-up; feeding rig coordinates directly to `bpy` will rotate or mirror the model. [Blender documents the differing axes explicitly.](https://docs.blender.org/UATEST/manual/en/4.5/files/import_export/obj.html)
   Fix — Specify and unit-test one explicit rig→Blender→glTF coordinate transform, including handedness, forward direction, scale, and bone roll.

3. **The GLB root/hips placement is undefined.** Current `setPose` puts the `body` wrapper at `HIPS_Y`, so exporting hips at world `HIPS_Y` and mounting the GLB under that wrapper would double the height.
   Fix — Define GLB hips at wrapper-local origin and keep `body` as the sole owner of `HIPS_Y`, root offsets, and root yaw.

4. **Directly overwriting imported bone quaternions breaks bind/rest transforms.** [avatar.js:119](/C:/Users/thetr/SOURCE/repos/katas/kata-viewer/js/avatar.js:119) works because procedural joint groups have identity rest rotations; Blender bones normally import with non-identity local rest orientation and roll.
   Fix — Cache every bone’s bind-local transform and compose the sampled pose delta with it using a tested axis conversion and multiplication order.

5. **The forearm-twist design misreads quaternion data and may apply 150% twist.** `sampleClip` returns quaternions, so `0.5 * wrist.y` is half a quaternion component, not half the authored radians; an ancestor helper plus a fully rotated wrist also compounds the rotation.
   Fix — Preserve or extract a semantic twist angle and either use a non-ancestor forearm deform helper or give an ancestor helper and wrist complementary rotations whose product equals the original wrist pose.

6. **“Finger bones or shape keys” is not an implementation decision.** With “no animations,” multiple finger-bone poses are not automatically recoverable from the GLB, and the two alternatives require entirely different runtime drivers.
   Fix — Choose named morph targets now—preferably fist as the basis plus `open`, `spear`, and `palm` targets—and assert their exported names.

7. **The new hand sampler contract is incomplete at endpoints and holds.** The plan stores shape names internally, but current `snapshot()` and the hold fast path return `pose.hands` directly at [player.js:211](/C:/Users/thetr/SOURCE/repos/katas/kata-viewer/js/player.js:211), which would leak strings instead of weight maps.
   Fix — Use one `handWeights(shape)` conversion for interpolated samples, snapshots, clamped endpoints, and holds, with tests for each path.

8. **`wrist.y` overrides are not safely additive.** `composePose` replaces an entire joint and defaults omitted axes to zero at [poses.js:38](/C:/Users/thetr/SOURCE/repos/katas/kata-viewer/js/poses.js:38), so adding `{wristR:{y:…}}` erases the existing `wrist.x` on `shote` and `openHandBlock`.
   Fix — Merge keyframe override axes onto the resolved joint in `resolveEntry`, or introduce a separate twist field, and test that `shote` retains its authored wrist flexion.

9. **The bunkai attacker will lose its dark appearance and fade.** Its materials are cloned and made transparent only during the initial procedural traversal at [bunkai.js:90](/C:/Users/thetr/SOURCE/repos/katas/kata-viewer/js/bunkai.js:90); a later baked white GLB ignores the color options and arrives after that traversal.
   Fix — Apply per-instance gi/belt/skin material overrides, cloning, and transparency after GLB readiness before swapping the attacker model.

10. **A successfully fetched but structurally invalid GLB can destroy the fallback.** Missing or duplicate bones are silently ignored by the present `setPose`, so hiding the procedural avatar immediately on `onLoad` can leave a partially frozen character.
    Fix — Validate all 17 unique joints, expected hierarchy, skinned meshes, materials, and morph targets before swapping; otherwise retain the fallback and surface the error.

11. **The stated test updates are insufficient and partly aimed at the wrong layer.** [data.test.mjs:52](/C:/Users/thetr/SOURCE/repos/katas/tests/data.test.mjs:52) assumes scalar hands, pose tests expect `nukite === 'open'`, and `validate-data.mjs` cannot validate hand metadata merely by inspecting kata JSON because that metadata lives in `POSES`.
    Fix — Update pose/player/data tests, validate every `POSES[*].hands` value in `resolveEntry` or a pose-library validator, and sample all katas asserting finite canonical weights summing to one per side.

12. **The core fist-orientation requirement has no horizontal acceptance case.** The plan deliberately authors no `wrist.y` values and visually checks only existing vertical fists, so neither Stage A nor B proves that ±π/2 is legible and mirrored correctly.
    Fix — Add synthetic left/right poses at `0`, `+π/2`, and `−π/2` and capture close-up acceptance images for both avatar implementations.

13. **Follow-camera state handling is underspecified.** There is no baseline/reset behavior for enabling follow, seeking, switching kata, applying a preset tween, or loading `?follow=1`; these transitions can produce large jumps or fighting transforms.
    Fix — Reset the tracked chest position on every discontinuity, cancel or rebase active tweens, apply following after the current pose, and test URL restoration plus scrub/preset interactions.

14. **The cited `updateMatrixWorld()` workaround is cargo-culted.** three.js issue #24772 concerned updating matrices before creating or cloning a skeleton; calling it once after `GLTFLoader` has already created the skeleton does not solve rest-relative quaternion driving. [Issue #24772](https://github.com/mrdoob/three.js/issues/24772)
    Fix — Remove this as a claimed pose fix and test the actual bind/rest composition; update matrices before any explicit clone or `Skeleton.pose()` operation.

15. **The generator workflow is neither one-command nor meaningfully verified.** The documented Blender command never runs `dump-rig.mjs`, and testing output generated directly from `RIG` against the same `RIG` is tautological.
    Fix — Add one wrapper command that regenerates rig JSON and the GLB, then post-export/re-import the GLB to verify hierarchy, morphs, dimensions, floor height, and a recorded rig-schema hash.

16. **Automatic weights are needless fragility for deterministic low-poly topology.** `ARMATURE_AUTO` adds headless context and bone-heat failure modes even though the script knows exactly which generated vertices belong to each limb.
    Fix — Assign deterministic vertex groups during mesh generation and reserve automatic weights only for an exploratory prototype.

The current baseline is healthy—65/65 tests and data validation pass—and the review left the worktree unchanged; those tests do not cover the planned GLB path.

VERDICT: REVISE
### Claude's response (round 1)
Accepted all 16 findings. Changes: RIG becomes the full skeleton schema (#1); explicit rig→Blender→glTF axis contract, verified by a GLB structural test (#2); hips at armature origin, `body` owns HIPS_Y (#3); rest-relative bone posing `A_parent⁻¹·q·A_i` as a tested pure helper (#4); swing-twist extraction + non-ancestor forearm helper (#5); morph targets open/spear/palm on a fist basis, names asserted (#6); single `handWeights()` on every sampler path incl. snapshot/hold (#7); per-axis override merge with a before/after audit of all five katas (#8 — accepted with audit because it changes override semantics); colour options kept per instance + `onReady` hook so bunkai re-applies clone/transparency (#9); validate GLB structure before swapping, keep fallback on failure (#10); test list corrected, hand vocabulary validated in `resolveEntry` (#11); `dev/hands.html` acceptance harness with 0/±π/2 on both sides (#12); follow-cam re-base rules on every discontinuity, suspended during tween/drag (#13); `updateMatrixWorld` kept but for caching rest orientations, #24772 claim dropped (#14); one wrapper `build-avatar.ps1` + GLB parse test replaces the tautological check (#15); deterministic vertex groups, no ARMATURE_AUTO (#16).
Rejected: none.

## Round 2 — Codex
The revision addresses most prior findings. Fully addressed: #1, #3, #5, #7–8, #10–12, #14, and #16. Partially addressed: #2, #4, #6, #9, #13, and #15.

Material issues remain:

1. **The authoritative sections still contradict the implementation steps.** The goal still says “auto-weighted,” D2 still leaves finger bones versus morph targets unresolved, D3 still says to copy `wrist.y`, and C7 still documents the incomplete direct Blender command, while later steps choose deterministic weights, morph targets, swing-twist decomposition, and a wrapper script.
   Fix — Update the Goal/Key Decisions table to match steps 11–13 exactly and make `tools/build-avatar.ps1` the sole documented build entry point.

2. **The GLB hand design does not preserve independent left/right shapes.** Three global morph targets on one character mesh would change both hands together, while the player contract allows `{L:'fist', R:'spear'}`.
   Fix — Require named `handL` and `handR` skinned meshes with separate `open/spear/palm` targets, or six side-qualified targets on one mesh, and validate/drive them per side.

3. **The proposed GLB translation assertion is mathematically wrong for Blender bones.** [Plan step 15](/C:/Users/thetr/.claude/plans/i-want-to-upgrade-fluttering-penguin.md:140) compares raw child-node translations with `RIG.JOINTS.offset`, but glTF child translations are expressed in the rotated parent-bone frame; a downward thigh commonly becomes positive local bone-Y rather than rig-space negative Y.
   Fix — Compose each node’s complete rest TRS into armature/world space and compare reconstructed joint positions with rig FK positions instead of comparing raw local translations.

4. **The Blender tail-axis instruction conflicts with the stated coordinate conversion.** After mapping rig `(X,Y,Z)` to Blender `(X,−Z,Y)`, rig-up becomes Blender +Z, yet step 11 says torso/head tails point +Y.
   Fix — Specify all heads/tails in rig space and pass them through the same conversion, explicitly making upward torso bones point Blender +Z before export.

5. **Rest-orientation caching can capture live character transforms.** The formula assumes `A_i` is armature-local rest orientation, but caching “world” orientations after the asynchronously loaded model is attached under a currently turned/moving `group/body` would include embusen and root rotations.
   Fix — Cache rest orientations on an isolated GLB root with identity ancestors before attachment, or transform them explicitly into armature-root space.

6. **Follow-camera rebasing still lacks runtime wiring.** Current `Player.seek()` has no seek callback, and suspending follow during dragging or a tween lets performer displacement accumulate, causing a catch-up jump when suspension ends.
   Fix — Add an explicit time-jump/rebase callback and rebase again on OrbitControls `end` and preset-tween completion, not merely when suspension begins.

7. **The acceptance harness may feed the wrong hand contract into `setPose`.** Authored poses contain hand-name strings, while the revised avatar expects per-shape weight maps.
   Fix — Require `dev/hands.html` to construct and sample clips through `buildClip`/`sampleClip`, or explicitly normalize authored strings inside `setPose`.

8. **GLB material recoloring has no stable role mapping.** “Re-apply colour options” is insufficient unless runtime code can distinguish gi, belt, and skin materials after export.
   Fix — Require and validate stable material names such as `gi`, `belt`, and `skin`, then clone and recolor those named slots before `onReady` fires.

9. **The schema hash is generated but not tied to the committed GLB.** A round-trip test of `RIG → rig.json` remains self-referential, and step 15 does not assert that the GLB was built from that hash.
   Fix — Embed the schema hash in GLB asset/node extras and make `glb.test.mjs` compare it with the current `RIG` hash.

10. **The raw minimum-vertex floor test assumes identity mesh transforms and ignores skinning.** A valid exporter may put positions in mesh-local coordinates or use a non-identity mesh node, making the raw accessor minimum unrelated to rendered floor height.
    Fix — Require identity/applied mesh transforms or compute rest-skinned world positions using node transforms, joints, weights, and inverse bind matrices before testing the sole height.

11. **There is still no test of the actual loader/runtime integration.** Parsing the GLB JSON chunk cannot detect broken `GLTFLoader` imports, asset URLs, per-side morph mapping, material handling, or fallback behavior.
    Fix — Add a browser smoke test that loads the real page once successfully and once with an injected bad asset URL, asserting GLB activation and procedural fallback respectively.

12. **The JSON immutability promise conflicts with the override migration.** The plan says kata JSON remains untouched but permits restating existing override axes in JSON if the semantic audit finds differences.
    Fix — Either make “no current JSON changes” an enforced migration condition or explicitly authorize and review any axis-restatement changes.

Fresh verification still reports 65/65 current tests passing, data validation passing, and no worktree changes; those are baseline checks and do not cover the planned implementation.

VERDICT: REVISE
### Claude's response (round 2)
Accepted all 12. Goal/D2/D3/C7 rewritten to match steps 11–13; `build-avatar.ps1` is the sole entry point (#1). Separate `handL`/`handR` meshes with per-side morph targets (#2). GLB test reconstructs joint rest positions via composed TRS chain vs rig FK, never raw local translations (#3). Heads/tails specified in rig space, one conversion (#4). Rest orientations cached on the isolated GLB root before attaching under `body` (#5). `Player.onSeek` + rebase on enable/seek/kata load/URL restore/OrbitControls `end`/tween completion (#6). Harness samples via `buildClip`/`sampleClip` (#7). Materials named `gi/belt/skin`, validated and recoloured by name before `onReady` (#8). Schema hash embedded in `asset.extras` and compared by the GLB test (#9). Mesh nodes must have identity TRS, asserted, so the accessor floor check is valid (#10). Browser smoke test done manually with Claude-in-Chrome and logged — rejected adding a browser test runner because the repo is intentionally zero-dependency (#11, partial). Override semantics left untouched; new additive `adjust` field instead, so kata JSON is byte-identical (#12).

## Round 3 — Codex
The previous twelve findings are now addressed at the design level. The revision is substantially stronger, but several new runtime risks remain.

1. **Follow rebasing observes the old pose.** `Player.seek()` invokes `onSeek` before `main.js` applies the newly sampled pose and embusen transform, so rebasing immediately inside that callback records the pre-seek chest and still causes a jump; `Player.play()` also resets end-of-kata time directly without emitting `onSeek`.
   Fix — Make `onSeek` set a pending-rebase flag, consume it after `applyTime()` has updated pose and embusen, and make replay-from-end use `seek(0)`.

2. **Separate skinned hand meshes can disappear because their bounds become stale.** three r169 computes a `SkinnedMesh` bounding sphere once and reuses it for culling ([three.module.js:32695](/C:/Users/thetr/SOURCE/repos/katas/kata-viewer/lib/three/three.module.js:32695), [three.module.js:13403](/C:/Users/thetr/SOURCE/repos/katas/kata-viewer/lib/three/three.module.js:13403)); a small rest-position hand sphere does not follow a punch or high block.
   Fix — Set `frustumCulled = false` on the low-poly skinned meshes, or explicitly recompute their bounding spheres after every pose.

3. **The returned `joints` contract is unstable across the asynchronous swap.** Follow code will retain the object returned by `createKarateka`; reassigning an internal `joints` variable to the GLB bone map would leave callers tracking the hidden procedural chest.
   Fix — Mutate a stable exported joint map in place or expose `getJoint(name)`/`getChestWorldPosition()`, and rebase follow after `onReady`.

4. **The structural test does not validate the actual skin.** Names, hierarchy, positions, and morph targets can all pass while vertices are unweighted, weights do not sum to one, joint indices are invalid, or `handL`/`handR` are ordinary meshes rather than the promised skinned meshes.
   Fix — Parse every skinned primitive’s `JOINTS_0`/`WEIGHTS_0`, assert valid indices and approximately unit weight per vertex, require inverse bind matrices, and require both hand meshes to reference the expected skin.

5. **The twist-helper rotation is still not bind-frame-defined.** “Rotate by half θ about its own axis” does not specify how that rotation composes with the helper’s non-identity rest quaternion, and mirrored/downward bone axes can reverse the sign.
   Fix — Derive the helper quaternion with the same rest-relative frame equation as rig bones and test world-space ±π/2 twist for both arms against a known reference.

6. **`asset.extras.rigSchemaHash` is not produced by ordinary Blender custom-property export.** Blender’s exporter initializes `asset.extras` to `None` and exposes it through a user-extension hook ([exporter.py:37](</C:/Program Files/Blender Foundation/Blender 4.5/4.5/scripts/addons_core/io_scene_gltf2/blender/exp/exporter.py:37)); the plan does not specify such a hook.
   Fix — Either implement `gather_asset_hook` explicitly or, more simply, put the hash in the named armature node’s custom properties with `export_extras=True` and validate that node extra.

7. **The `adjust` validation instruction assumes nonexistent override validation.** Current [validate-data.mjs:47](/C:/Users/thetr/SOURCE/repos/katas/tools/validate-data.mjs:47) does not validate override joint names, axes, or numeric values, so “same checks as overrides” is not actionable.
   Fix — Add explicit shared validation for both fields: known `JOINT_NAMES`, only `x/y/z`, finite numeric values, and object-shaped entries.

8. **Several stale statements now contradict the new `adjust` design.** The timing guide step still calls it a `wrist.y override`, risk R2 still describes a per-axis override semantic migration, and final verification still says to rename the GLB rather than use `?avatar=missing.glb`.
   Fix — Replace those remnants with `adjust.wrist*.y`, state that existing override semantics are unchanged, and use the documented missing-asset query parameter consistently.

Fresh baseline verification remains 65/65 tests passing with data validation passing, and the worktree remains unchanged; those tests predate the proposed implementation.

VERDICT: REVISE
### Claude's response (round 3)
Accepted all 8. Pending-rebase flag consumed after `applyTime()`; `play()` replays via `seek(0)` (#1). `frustumCulled=false` on skinned meshes (#2). `joints` no longer exposed; `getJoint`/`getChestWorldPosition` methods, rebase on `onReady` (#3). GLB test validates JOINTS_0/WEIGHTS_0, indices, unit weights, IBMs, hands reference the skin (#4). Helper posed via the same rest-relative equation from a rig-space axis-angle, tested at ±π/2 both arms (#5). Hash as armature-object custom property via `export_extras`, read from node extras/userData (#6). Shared validator for `overrides` and `adjust` (#7). Stale remnants fixed: timing-guide row, R2, verification uses `?avatar=missing.glb` (#8).
Rejected: none.

## Round 4 — Codex
All eight prior findings are now materially addressed:

- Follow rebasing occurs after pose/embusen application, including replay and avatar swaps.
- Joint access remains stable across the async GLB swap.
- Skinned-mesh culling is disabled.
- Skin indices, weights, inverse-bind matrices, and hand skins are validated.
- Forearm helpers use bind-frame-relative rotations with bilateral tests.
- The rig hash uses supported armature-node extras.
- `overrides` and `adjust` receive explicit validation.
- Stale documentation and verification instructions are corrected.

I found no new material blocker. The remaining implementation complexity—especially Blender export structure and rest-relative bone math—is matched by appropriate structural, mathematical, browser, and visual checks.

Fresh baseline verification: 65/65 tests pass, kata validation passes, and the worktree remains unchanged.

VERDICT: APPROVED
## Resolution
Converged: VERDICT: APPROVED in round 4 of 5. 36 findings raised over three REVISE rounds; 35 accepted in full, 1 accepted in part (browser smoke test done manually via Claude-in-Chrome rather than adding a test-runner dependency). PLAN.md and this log are copied into the repo on user sign-off.

## Post-build inspection — Stage A (fresh read-only Codex session, round 1 of 2)

1. **High — Kata keyframe `adjust` values are silently discarded.** [`buildTimeline()`](/C:/Users/thetr/SOURCE/repos/katas/kata-viewer/js/player.js:191) forwards `overrides` but not `kf.adjust`, so the documented fist-orientation field only works through `buildClip()` and never in actual kata JSON.  
   **Fix:** Pass `adjust: kf.adjust` to `resolveEntry()` and add a `buildTimeline()` regression test that preserves `shote`’s `wrist.x`.

2. **Medium — Follow-camera rebasing can permanently lose the performer after discontinuities.** [`rebaseFollow()`](/C:/Users/thetr/SOURCE/repos/katas/kata-viewer/js/scene.js:267) merely records the new chest position without moving the target or camera, while tweens/drags invalidate the previous baseline. After a seek, kata switch, or `?cam=hands&follow=1&t=<later>`, subsequent following preserves the stale camera-to-performer displacement instead of reacquiring the chest.  
   **Fix:** Rebase by translating both camera and target onto the post-pose chest anchor before storing it, with a separate initialization path if jump suppression is desired.

3. **Medium — The `palm`/shote mesh does not put the palm heel forward.** The palm slab in [`openHandBase()`](/C:/Users/thetr/SOURCE/repos/katas/kata-viewer/js/avatar.js:71) keeps its broad-face normal along mirrored ±X; [`HAND_BUILDERS.palm`](/C:/Users/thetr/SOURCE/repos/katas/kata-viewer/js/avatar.js:84) rotates only the fingers. Because shote’s `wrist.x` leaves that X normal unchanged, the palm remains side-facing rather than facing the strike direction.  
   **Fix:** Give the palm shape a mirrored wrist-space cock-back orientation that turns its palm normal toward local −Y, then verify both sides visually.

4. **Low — The required seek/rebase paths have no regression coverage.** Navigation tests in [`player.test.mjs`](/C:/Users/thetr/SOURCE/repos/katas/tests/player.test.mjs:276) never assert `onSeek`, and no test exercises follow enable, scrub, kata load, replay-from-end, drag end, preset completion, or URL restoration.  
   **Fix:** Add callback tests for all `Player` seek routes and a focused follow-state test covering URL, scrub, preset, and drag rebases.

5. **Low — The hand acceptance harness does not use the actual `hands` camera preset.** [`hands.html`](/C:/Users/thetr/SOURCE/repos/katas/kata-viewer/dev/hands.html:78) constructs bespoke per-cell cameras, so it can pass while [`CAMERA_PRESETS.hands`](/C:/Users/thetr/SOURCE/repos/katas/kata-viewer/js/scene.js:13) is incorrectly framed.  
   **Fix:** Share/export the preset framing configuration and have the harness derive its cameras from it.

6. **Low — `RIG.JOINTS` consumption and avatar orientation remain untested.** [`hands.test.mjs`](/C:/Users/thetr/SOURCE/repos/katas/tests/hands.test.mjs:108) verifies schema literals and foot FK, but nothing instantiates `createKarateka()` to check the 17-group hierarchy, parent offsets, +Z face/toe direction, mirrored hand frames, or rendered sole placement.  
   **Fix:** Add a browser smoke or testable avatar-structure helper asserting joint hierarchy, offsets, facing conventions, hand normals, and foot bounds.
### Claude's dispositions
1. **Accepted (High).** `buildTimeline` now forwards `kf.adjust`; test `adjust is honoured from kata JSON through buildTimeline`.
2. **Accepted.** `rebaseFollow` now snaps the orbit target onto the chest and moves the camera by the same delta when following, so a seek/kata switch re-acquires the performer instead of preserving a stale offset.
3. **Accepted (mesh-side).** `palm` shape is a quarter turn about the forearm + quarter bend about x, so the palm heel faces the strike with fingers up; verified in dev/hands.html cell 2.4.
4. **Accepted in part.** Added `onSeek` coverage for seek/seekStep/next/prev/replay-from-end. Follow-state (drag end, preset completion, URL restore) needs OrbitControls + DOM — not unit-tested; verified live in Chrome (rebase on load with `?cam=hands&follow=1&t=2.5`, next-step, no console errors).
5. **Rejected.** The harness deliberately puts one camera on each striking hand — its job is to prove hand geometry and wrist.y sign, not framing. The `hands` preset was checked live in the viewer (Seisan step 3 close-up screenshot).
6. **Accepted.** New `tests/avatar.test.mjs` instantiates `createKarateka` under Node (via `tests/three-resolver.mjs`, a resolve hook mapping the bare `three` specifier to the vendored module): 17 groups with schema parents/offsets, sole on the floor, nose +Z, left wrist +X, hand shape cross-scaling, chest world position. Test command is now `node --import ./tests/three-resolver.mjs --test tests/*.test.mjs` (deploy.yml updated).

## Post-build inspection — Stage B (fresh read-only Codex session, high effort, round 1 of 2)

Chrome smoke (recorded before inspection): `?kata=seisan&cam=hands&t=6&follow=1` → console `karateka: glb active` ×2 (performer + bunkai attacker), pose identical to the procedural mannequin (rest-relative posing verified live); `&bunkai=1` attacker skinned and recoloured; `?avatar=missing.glb` → `karateka: glb load failed (… 404 …); keeping the procedural avatar`, mannequin visible; `dev/hands.html` with GLB: cells 1.1–1.6 and 2.1–2.6 match Stage A semantics via morph targets (screenshots docs/images/stage-b-glb-hands.jpg, stage-b-naihanchi.jpg). Found and fixed before inspection: harness posed once before the GLB arrived → adoptGlb now re-applies the last pose; hair hemisphere generated from the wrong half.

1. **Medium — GLB validation can accept a disconnected or incorrectly parented skeleton.** [`validateGlb()`](/C:/Users/thetr/SOURCE/repos/katas/kata-viewer/js/avatar.js:283) checks names but not `isBone`, helper uniqueness/parents, or that both hands’ `skeleton.bones` are the validated joints; such an asset is swapped in and then will not pose correctly.  
   Fix: Validate bone types, all helper parents, one shared expected skeleton, and morph influence arrays before adoption.

2. **Medium — Adoption is not transactional, weakening the promised fallback.** [`adoptGlb()`](/C:/Users/thetr/SOURCE/repos/katas/kata-viewer/js/avatar.js:339) assigns `skinned`, attaches the root, and hides the procedural model before pose reapplication and readiness callbacks complete; an exception can leave the fallback hidden.  
   Fix: Stage adoption inside `try/catch` and only hide `proc` after setup and initial posing succeed, rolling back on failure.

3. **Medium — Morph normals are deliberately omitted despite large hand rotations.** [`build-avatar.py`](/C:/Users/thetr/SOURCE/repos/katas/tools/build-avatar.py:337) sets `export_morph_normal=False`, while the palm target rotates components by roughly 90°; its lighting will retain fist-basis normals and shade incorrectly.  
   Fix: Export morph normals and assert each hand target includes matching `NORMAL` data.

4. **Medium — The GLB test does not validate shape-key topology sufficiently.** [`glb.test.mjs`](/C:/Users/thetr/SOURCE/repos/katas/tests/glb.test.mjs:127) checks only target names and count, while [`build-avatar.py`](/C:/Users/thetr/SOURCE/repos/katas/tools/build-avatar.py:313) verifies only vertex count; reordered or missing target positions could scramble a hand while tests pass.  
   Fix: Assert every target has a `POSITION` accessor matching the basis count and preserve/assert a stable semantic vertex ordering in the generator.

5. **Medium — Inverse-bind matrices are counted but never checked.** [`glb.test.mjs`](/C:/Users/thetr/SOURCE/repos/katas/tests/glb.test.mjs:140) accepts arbitrary matrices as long as there is one per joint, so a bad exporter configuration could produce an exploding skin that still passes CI.  
   Fix: Multiply every joint’s rest-world matrix by its IBM and assert the expected identity mesh-space transform.

6. **Medium — Forearm-twist coverage does not meet the bilateral ±π/2 plan.** [`glb-pose.test.mjs`](/C:/Users/thetr/SOURCE/repos/katas/tests/glb-pose.test.mjs:102) tests one positive angle using the left wrist as a stand-in, and [`glb.test.mjs`](/C:/Users/thetr/SOURCE/repos/katas/tests/glb.test.mjs:91) checks only the left helper’s parent.  
   Fix: Parameterize both sides and both signs, and assert both exported helpers’ parents, rest frames, and quarter-turn world twists.

7. **Low — The locked Stage B surface treatment was not implemented.** [PLAN.md](/C:/Users/thetr/SOURCE/repos/katas/PLAN.md:55) requires a baked gi seam/belt texture, but the generator creates flat materials and explicitly disables texture coordinates in [`build-avatar.py`](/C:/Users/thetr/SOURCE/repos/katas/tools/build-avatar.py:339).  
   Fix: Add the promised UV/texture asset or explicitly amend the approved Stage B requirement.

8. **Low — The required rig-dump parity/hash-stability test is missing.** [PLAN.md](/C:/Users/thetr/SOURCE/repos/katas/PLAN.md:186) calls for `rig.json` equality and a stable hash, but [`rig.test.mjs`](/C:/Users/thetr/SOURCE/repos/katas/tests/rig.test.mjs:68) tests only runtime rig constants/FK.  
   Fix: Compare parsed `tools/rig.json` with `rigSchema()` and pin the expected `rigSchemaHash()`.

9. **Medium — There is no recorded Stage B browser integration smoke.** The structural tests never execute the actual loader URL, validation/swap, per-side morph mapping, recolouring, or failed-load fallback, and [the review log](/C:/Users/thetr/SOURCE/repos/katas/PLAN-REVIEW-LOG.md:189) ends with Stage A.  
   Fix: Record the required successful-load and `?avatar=missing.glb` Chrome runs, preferably adding a lightweight browser smoke to CI.

10. **Medium — The manual deployment instructions omit the new asset directory.** [`DEPLOY.md`](/C:/Users/thetr/SOURCE/repos/katas/kata-viewer/DEPLOY.md:17) enumerates `index.html`, `css`, `js`, `data`, and `lib`, but not `assets/`; following that checklist leaves Stage B permanently on the procedural fallback.  
    Fix: Add `assets/karateka.glb` to the upload checklist.

The GitHub Pages workflow itself uploads `kata-viewer/` wholesale, and its relative module/asset URLs appear subpath-safe; I found no separate Pages-specific path blocker.
### Claude's dispositions
1. **Accepted.** `validateGlb` now requires `isBone` on all 17 joints and 4 helpers, checks both helpers' parents (`forearmTwist*`→`elbow*`, `toes*`→`ankle*`), that every SkinnedMesh's skeleton contains the 17 joints, and that hands have morph influence arrays.
2. **Accepted.** Adoption is transactional: `adoptValidated` runs in try/catch; the mannequin is hidden only after the first pose succeeds; on throw the root is detached, `skinned` reset, mannequin restored, error logged.
3. **Accepted.** `export_morph_normal=True`; GLB rebuilt; test asserts every target has POSITION + NORMAL.
4. **Accepted.** Test asserts each target's POSITION/NORMAL count equals the basis count and that each target displaces vertices.
5. **Accepted.** Test multiplies each joint's rest world matrix by its IBM and asserts identity (mesh transforms are identity).
6. **Accepted.** `glb-pose.test.mjs` helper test parameterised over L/R × ±π/2; `glb.test.mjs` checks both helpers' parents.
7. **Accepted as a plan amendment, not implemented.** PLAN.md C2 amended: Stage B ships flat named materials; baked gi/belt texture deferred to a follow-up (asset work inside `build-avatar.py`, no contract impact).
8. **Accepted.** `rig.test.mjs`: `tools/rig.json` equals `rigSchema()`, carries its hash, and the hash is pinned (`34e8f9721d058927`).
9. **Accepted (manual).** Chrome runs recorded above. Adding a browser runner to CI rejected again — repo is deliberately zero-dependency.
10. **Accepted.** DEPLOY.md manual checklist lists `assets/`.
Result: 102/102 tests, `tools/build-avatar.ps1` green, GLB re-verified in Chrome after the stricter validation.
