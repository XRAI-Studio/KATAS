# Isshin Ryu 3D Kata Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static-site 3D viewer where a gi-wearing avatar performs all five Isshin Ryu katas in an Okinawan dojo with scrub/step playback, 0.1x–5x speed, orbit camera, bunkai attacker toggle, TTS coach voice, and kiai effects; deployable to Hostinger by file copy.

**Architecture:** Vanilla Three.js (vendored, ES modules, no build step). Kata step tables from the repo's markdown files become JSON timelines of named keyframe poses; a pure time→pose sampler drives a procedurally built jointed avatar, so pause/scrub/reverse are exact. UI, TTS, and bunkai layer on top.

**Tech Stack:** Three.js 0.16x (vendored `three.module.js` + `OrbitControls.js`), vanilla JS/CSS/HTML, Web Speech API, Node 18+ only for unit tests (`node --test`) and data validation.

## Global Constraints

- Static files only — no server code, no build step, no CDN/external requests at runtime (Hostinger shared hosting).
- App root is `kata-viewer/` inside this repo; deploy = upload that folder's contents.
- Style name is **Isshin Ryu** everywhere (user goal's "Issun Ryu" was a typo).
- The five katas: Seisan, Seiunchin, Naihanchi, Wansu, Chinto.
- Speed range exactly 0.1–5.0, continuous slider.
- Unknown/ambiguous transitions must still play (best-guess pose) but be badged "unverified" in the UI and listed in `docs/transition-report.md`.
- All angles in radians internally; pose joint rotations are Euler XYZ.
- Node-testable logic (player, validation) must not import Three.js or touch the DOM.

---

### Task 1: Scaffold, vendored Three.js, local server smoke test

**Files:**
- Create: `kata-viewer/index.html`, `kata-viewer/css/app.css`, `kata-viewer/js/main.js`
- Create (vendored): `kata-viewer/lib/three/three.module.js`, `kata-viewer/lib/three/OrbitControls.js`
- Create: `serve.ps1` (repo root)

**Interfaces:**
- Produces: import map `"three"` → `./lib/three/three.module.js`; `main.js` is the single module entry; `<canvas id="scene">`; UI chrome divs with ids used by later tasks: `#controls`, `#kata-select`, `#btn-play`, `#btn-prev`, `#btn-next`, `#scrub`, `#speed`, `#speed-value`, `#step-label`, `#toggle-bunkai`, `#toggle-voice`, `#voice-select`, `#camera-presets`, `#bunkai-card`, `#kiai-flash`, `#error-banner`.

- [ ] **Step 1: Download Three.js locally** (one-time, not a runtime dependency)

```powershell
npm pack three@0.169.0 2>$null; tar -xf three-0.169.0.tgz
New-Item -ItemType Directory -Force kata-viewer/lib/three
Copy-Item package/build/three.module.js kata-viewer/lib/three/
Copy-Item package/examples/jsm/controls/OrbitControls.js kata-viewer/lib/three/
Remove-Item -Recurse -Force package, three-0.169.0.tgz
```

Then edit `kata-viewer/lib/three/OrbitControls.js`: change `from 'three'` import to `from './three.module.js'`.

- [ ] **Step 2: Write index.html** with import map, canvas, and the full control-bar skeleton (ids above), loading `js/main.js` as module. Write `css/app.css` with a dark UI bar docked at the bottom, and `#kiai-flash` as a fullscreen hidden overlay.

- [ ] **Step 3: Write minimal main.js** — renders a lit rotating cube via vendored Three to prove the pipeline:

```js
import * as THREE from 'three';
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
// scene, camera, cube, resize handler, animation loop
```

- [ ] **Step 4: Write serve.ps1** (`python -m http.server 8420 --directory kata-viewer` with npx fallback) and start it in the background.

- [ ] **Step 5: Verify** — fetch `http://localhost:8420/` returns 200 and the module files return 200 (`Invoke-WebRequest`). Browser check happens in Task 10.

- [ ] **Step 6: Commit** `feat: scaffold kata viewer with vendored three.js`

---

### Task 2: Transition & kiai research report

**Files:**
- Create: `docs/transition-report.md`

**Interfaces:**
- Produces: per-kata tables listing every step transition with status KNOWN / RESOLVED-BY-RESEARCH (with source URL) / STILL-UNKNOWN; a kiai-points section per kata; the resolved Wansu ending steps 17–end written out as a step table (same columns as the other kata files). Task 5 consumes this report when building JSON.

- [ ] **Step 1: Extract gaps.** Re-read all 5 kata .md files; list every step whose footwork, hand position, count, or ending is ambiguous or missing. Known seeds: Wansu file truncated at step 17 (ending missing entirely); kiai marked "dojo-specific" in Seisan/Wansu; Naihanchi kiai points absent; Naihanchi steps 3/10 "transition step only"; Chinto steps 13–14 jump/X-block "mechanics differ by instructor"; Chinto 31 "order can differ".

- [ ] **Step 2: Web-search each gap.** Queries like "Isshin Ryu Wansu kata steps", "Isshinryu Wansu ending", "Isshinryu Naihanchi kiai points", "Isshinryu Chinto jump kick X-block", "Isshinryu Seisan kiai". Prefer established Isshin Ryu references (isshinryu.com, AOKA, dojo syllabi, IWKA documents). Record source URLs.

- [ ] **Step 3: Write the report** with three sections per kata: (a) transitions resolved from the repo files, (b) resolved via research + sources, (c) STILL UNKNOWN (these get `transition.known:false` in JSON). Include the reconstructed Wansu 17–end steps and a "Kiai points" table (kata → step numbers → source/confidence).

- [ ] **Step 4: Commit** `docs: transition and kiai research report for all 5 katas`

---

### Task 3: Avatar builder and pose library

**Files:**
- Create: `kata-viewer/js/avatar.js`, `kata-viewer/js/poses.js`

**Interfaces:**
- Produces (avatar.js):
  - `createKarateka({ gi = 0xf5f0e6, belt = 0x222222, skin = 0xc9a179 } = {}) → { group, joints, setPose(pose) }`
  - `joints`: `{ hips, spine, chest, neck, head, shoulderL, elbowL, wristL, shoulderR, elbowR, wristR, hipL, kneeL, ankleL, hipR, kneeR, ankleR }` — each a `THREE.Group` pivot.
  - `setPose(pose)`: pose = `{ root: { x, y, z, ry }, joints: { <name>: { x, y, z } } }` (Euler radians; missing joints keep current rotation — callers pass fully-sampled poses).
- Produces (poses.js) — **pure data, no Three import**:
  - `BASE_POSE` (attention stance, arms down), `POSES` (map name → partial pose), `composePose(...partials) → pose` (later partials override per-joint; root fields merge).
  - Required pose names (stances): `ready`, `bow`, `seisanDachiL`, `seisanDachiR` (L/R = lead leg), `seiunchinDachi`, `naihanchiDachi`, `catL`, `catR`, `tStanceL`, `tStanceR`, `chintoL`, `chintoR`, `kneelR`, `feetTogether`, `crossoverL`, `crossoverR`.
  - Required pose names (arm/technique partials, `L`/`R` suffix = acting arm): `punchMid`, `punchHigh`, `uppercut`, `backfist`, `hammerfist`, `nukite`, `haito`, `shutoLow`, `shutoMid`, `shote`, `elbowStrike`, `elbowRising`, `blockLow`, `blockMid`, `blockHigh`, `blockDoubleHigh`, `blockDoubleLow`, `xBlockLow`, `archerBlock`, `reinforcedBlock`, `chamber`, `guardChest`, `handsStacked`, `grabPull`, `openHandBlock`.
  - Required leg partials: `frontKickR`, `frontKickL`, `kneeLiftR`, `kneeLiftL`, `jumpKickR`, `legLiftR`, `legLiftL` (sweep-avoid), `stompR`, `stompL`.

- [ ] **Step 1: Build the joint hierarchy** in `createKarateka` — nested Groups with meshes attached (capsule/box geometry: torso gi jacket, sleeves, pants legs, belt torus/box, head sphere, fist spheres). Pivots at anatomical joints; hips at y≈0.95, total height ≈1.7 world units. Attacker variant made by calling with `{ gi: 0x333340, belt: 0x7a1f1f }`.

- [ ] **Step 2: Write poses.js.** `BASE_POSE` zeros all joints. Each stance pose sets leg joint Eulers + root y-offset + optionally root ry; each technique partial sets only its arm (and head/chest where natural). Author by geometry reasoning (e.g. `seisanDachiL`: hipL forward flex ≈ -0.5, kneeL ≈ 0.45, hipR extend ≈ 0.25, root y -0.06).

- [ ] **Step 3: Visual harness.** Temporarily extend main.js: replace cube with a karateka and cycle through every pose name on click, name shown in `#step-label`. Screenshot-check silhouettes read correctly (punch looks like a punch, cat stance is back-weighted, naihanchi is wide/low).

- [ ] **Step 4: Commit** `feat: procedural karateka avatar and Isshin Ryu pose library`

---

### Task 4: Playback engine (pure, Node-tested)

**Files:**
- Create: `kata-viewer/js/player.js`
- Test: `tests/player.test.mjs`

**Interfaces:**
- Consumes: `composePose`/`POSES` shape from poses.js (imported for sampling — poses.js is DOM/Three-free so Node can import it).
- Produces:
  - `buildTimeline(kataJson, poseLib) → timeline` where `timeline = { duration, steps: [{ id, label, coachCall, kiai, start, end, unverified }], samples }`. Each JSON keyframe `{ t, stance, arms:[], legs:[], overrides, root }` resolves via `composePose` to an absolute pose at absolute time `stepStart + t*stepDuration`. Step duration = `step.beats * SECONDS_PER_BEAT` (1.0 s/beat at 1x; default beats 2).
  - `samplePose(timeline, t) → pose` — binary-search bracketing keyframes, per-joint smoothstep-eased lerp of Euler components and root (x,z,ry lerped shortest-angle for ry).
  - `stepAt(timeline, t) → step`
  - `class Player { constructor(timeline, { onStep, onKiai }); play(); pause(); toggle(); get playing; setSpeed(s /*0.1..5*/); seek(t); seekStep(idx); nextStep(); prevStep(); tick(dtSeconds) → t; get time; }` — `onStep(step)` fires when the current step index changes in either direction; `onKiai(step)` fires when playback crosses a kiai step boundary forward while playing (not while scrubbing).

- [ ] **Step 1: Write failing tests** in `tests/player.test.mjs` (`node --test`): timeline duration from beats; samplePose at keyframe times returns exact pose; midpoint is between; seek is pure (seek(t) twice gives identical pose); reverse scrub works; speed 0.1 and 5.0 advance time correctly; nextStep/prevStep land on step starts; onStep fires with correct ids both directions; ry interpolates 350°→10° through 0°, not backwards.

- [ ] **Step 2: Run** `node --test tests/` — expect FAIL (module not found).

- [ ] **Step 3: Implement player.js** per interface. No Three, no DOM.

- [ ] **Step 4: Run** `node --test tests/` — expect PASS.

- [ ] **Step 5: Commit** `feat: pure timeline playback engine with tests`

---

### Task 5: Kata data files (5 JSON) + validation

**Files:**
- Create: `kata-viewer/data/seisan.json`, `seiunchin.json`, `naihanchi.json`, `wansu.json`, `chinto.json`
- Create: `tools/validate-data.mjs`
- Test: `tests/data.test.mjs`

**Interfaces:**
- Consumes: pose names from poses.js; transition report from Task 2; step tables from the 5 repo .md files.
- Produces: JSON schema (consumed by buildTimeline and bunkai.js):

```json
{
  "name": "Seisan", "style": "Isshin Ryu", "displayName": "Seisan (十三)",
  "steps": [
    {
      "id": 1, "label": "Left middle block, right punch",
      "coachCall": "Step left. Middle block. Punch.",
      "beats": 2, "kiai": false,
      "embusen": { "x": 0, "z": -0.8, "facing": 0 },
      "keyframes": [
        { "t": 0.0, "stance": "seisanDachiL", "arms": ["chamberR", "blockMidL"] },
        { "t": 0.55, "stance": "seisanDachiL", "arms": ["blockMidL", "punchMidR"] },
        { "t": 1.0, "stance": "seisanDachiL", "arms": ["blockMidL", "chamberR"] }
      ],
      "bunkai": { "known": true, "attack": "steppingPunchR",
                  "attackerFrom": { "x": 0, "z": -2.2, "facing": 3.14159 },
                  "text": "Defend mid-level strike, counter to torso" },
      "transition": { "known": true, "source": "Seisan.md step 1" }
    }
  ]
}
```

`attack` values (bunkai.js implements these): `steppingPunchR`, `steppingPunchL`, `punchHighR`, `frontKickR`, `frontKickL`, `grabWristR`, `grabLapel`, `grabRear`, `chokeFront`, `sweepLow`, `none`.

- [ ] **Step 1: Write failing data tests** (`tests/data.test.mjs`): every file parses; every step has id, label, coachCall, ≥2 keyframes with t ascending in [0,1], embusen, transition.known boolean; every stance/arm/leg name exists in POSES; every attack name is in the allowed list; each kata has ≥1 kiai step; buildTimeline runs on each without throwing. `tools/validate-data.mjs` runs the same checks as a CLI and prints a per-kata summary.

- [ ] **Step 2: Run** — FAIL (files missing).

- [ ] **Step 3: Author the 5 JSON files** from the markdown tables + transition report. Every table row = one step (multi-technique rows get 3–5 keyframes). Embusen coordinates traced per kata shape (Seisan H-pattern, Naihanchi lateral line, Chinto diagonal, etc.). Kiai flags per the research report. Wansu 17–end from the report's reconstruction, `transition.known:false` where research didn't resolve. This is the largest single work item — do one kata at a time, running the validator after each.

- [ ] **Step 4: Run** `node --test tests/` and `node tools/validate-data.mjs` — PASS, summary shows 5 katas.

- [ ] **Step 5: Commit** `feat: kata timelines for all five katas`

---

### Task 6: Dojo scene, lighting, camera

**Files:**
- Create: `kata-viewer/js/scene.js`
- Modify: `kata-viewer/js/main.js`

**Interfaces:**
- Produces: `initScene(canvas) → { scene, camera, renderer, controls, setCameraPreset(name /* front|side|rear|overhead */), tick(dt) }`. Dojo built inside: 12×9 m room, plank floor (repeating box strips, two wood tones), kamiza back wall with hanging scroll mesh + red-circle Isshin Ryu banner plane, shoji side walls (white panels + dark lattice bars), wooden posts/beams, 2 hanging lantern meshes with warm point lights, ambient + directional key with shadows (`renderer.shadowMap.enabled = true`).

- [ ] **Step 1: Implement scene.js** (geometry groups: `buildFloor`, `buildWalls`, `buildKamiza`, `buildLanterns`). OrbitControls: damping on, target (0, 0.9, 0), min/max distance 1.5/12, maxPolarAngle ≈ 1.52 (can't go under floor). Presets set camera position + target with a short eased tween in `tick`.
- [ ] **Step 2: Wire into main.js** — replace harness scene; karateka standing in `ready` at origin.
- [ ] **Step 3: Verify** locally (server 200s; visual check deferred to Task 10) and **commit** `feat: okinawan dojo scene with orbit camera and presets`

---

### Task 7: UI control bar + app wiring

**Files:**
- Create: `kata-viewer/js/ui.js`
- Modify: `kata-viewer/js/main.js`, `kata-viewer/css/app.css`

**Interfaces:**
- Consumes: Player API (Task 4), timeline steps, `setCameraPreset`.
- Produces: `initUI({ katas, onKataChange, player }) →  { setTimeline(timeline), setStep(step), refresh(t) }`. Behavior: kata `<select>` (5 entries, loads JSON via `fetch('data/'+file)`, error → `#error-banner` names the file, other katas still selectable); play/pause button; prev/next step buttons; scrub `<input type=range>` mapped to timeline seconds with step tick marks and red kiai markers rendered as an absolutely-positioned marker strip; speed slider `min=0.1 max=5 step=0.05` with live `#speed-value` (e.g. "1.25x"); `#step-label` shows "12 / 32 — R hammerfist into palm" plus an "unverified" badge when `step.unverified`; keyboard: space = play/pause, ←/→ = prev/next step.

- [ ] **Step 1: Implement ui.js + main.js render loop**: `requestAnimationFrame` → `player.tick(dt)` → `samplePose` → `avatar.setPose` + apply step embusen to avatar root → `ui.refresh(t)` → `renderer.render`.
- [ ] **Step 2: Verify** all controls function (quick browser pass), speed extremes 0.1x/5x, scrub both directions while paused.
- [ ] **Step 3: Commit** `feat: playback UI with scrub, step markers, speed control`

---

### Task 8: Coach voice + kiai effects

**Files:**
- Create: `kata-viewer/js/coach.js`
- Modify: `kata-viewer/js/main.js`, `kata-viewer/js/ui.js`, `kata-viewer/css/app.css`

**Interfaces:**
- Produces: `createCoach() → { available, sayStep(step, speed), kiai(), setEnabled(b), get enabled, voices(), setVoice(name) }`. `sayStep`: cancels pending utterance, speaks `step.coachCall`, rate = `clamp(speed, 0.7, 2)`; silent when `speed > 3` or disabled. `kiai()`: speaks "Eeei!" rate 2 pitch 1.6 volume 1 (still fires ≤5x). Feature-detect `window.speechSynthesis`; if absent, `available=false` and UI disables the toggle with a tooltip.
- Kiai visuals in main.js: on `onKiai` → `#kiai-flash` overlay opacity pulse (CSS transition, 250 ms) + red "KIAI!" text burst above avatar (sprite or DOM overlay) + coach.kiai().

- [ ] **Step 1: Implement coach.js; wire onStep → sayStep, onKiai → effects; voice `<select>` populated from `voices()` (handle Chrome's async `voiceschanged`).**
- [ ] **Step 2: Verify** in browser: calls speak on step change at 1x, muted at 5x, kiai flash fires on kiai steps.
- [ ] **Step 3: Commit** `feat: TTS coach voice and kiai effects`

---

### Task 9: Bunkai attacker

**Files:**
- Create: `kata-viewer/js/bunkai.js`
- Modify: `kata-viewer/js/main.js`

**Interfaces:**
- Consumes: `createKarateka` (dark-gi variant), POSES, current step + local step progress `u ∈ [0,1]` from player.
- Produces: `initBunkai(scene) → { setEnabled(b), update(step, u) }`. `update`: if enabled and `step.bunkai.known` — position attacker at `attackerFrom` (kata-local coords, same transform as defender embusen), play a 3-keyframe canned attack for `step.bunkai.attack` (chamber → strike at u≈0.35 → recoil), timed so the strike lands as the defender's technique peaks; fade attacker opacity in/out over 0.3 u at step edges. If no bunkai: attacker hidden and `#bunkai-card` shows "No bunkai recorded for this movement." Card otherwise shows `step.bunkai.text`. Attack animations defined as pose-partial keyframes in a local `ATTACKS` map covering the allowed `attack` list from Task 5.

- [ ] **Step 1: Implement bunkai.js + main.js wiring (toggle `#toggle-bunkai`, card population).**
- [ ] **Step 2: Verify**: toggle on during Seisan step 1 shows attacker punching as defender blocks; scrubbing backwards keeps them synced (pure function of u).
- [ ] **Step 3: Commit** `feat: bunkai attacker avatar and application cards`

---

### Task 10: End-to-end browser verification, deploy docs, final report

**Files:**
- Create: `kata-viewer/DEPLOY.md`
- Modify: anything found broken.

- [ ] **Step 1: Full browser pass** (claude-in-chrome against `http://localhost:8420`): for each of the 5 katas — loads, plays start-to-finish at 1x, scrub forward/back, prev/next stepping, 0.1x and 5x, bunkai toggle, voice toggle + a kiai firing, all 4 camera presets, orbit/zoom. Fix and re-verify anything broken. Record a short GIF of one kata for the user.
- [ ] **Step 2: Write DEPLOY.md** — exact Hostinger steps: hPanel → File Manager (or FTP: host/user from hPanel), upload contents of `kata-viewer/` into `public_html/` (or a subfolder like `public_html/katas/`), no server config needed; note that everything is relative-pathed so subfolders work.
- [ ] **Step 3: Run all tests once more** (`node --test tests/`, `node tools/validate-data.mjs`) — PASS.
- [ ] **Step 4: Commit** `docs: deployment guide` and deliver final summary to user: how to run locally, the transition report highlights (what was found vs. still unknown), kiai points used, and the Hostinger upload steps.

## Self-Review

- Spec coverage: scrub/reverse (T4/T7), speed 0.1–5x (T4/T7), orbit+presets (T6), bunkai attacker+card (T9), TTS coach + voice picker (T8), kiai marker/flash/shout (T7/T8), dojo (T6), 5 katas + unknown-transition badges (T2/T5/T7), research report with still-unknown list (T2), local testing (T1/T10), Hostinger deploy (T10), error handling for bad JSON/no TTS/no WebGL (T7/T8; WebGL message added in T1 main.js try/catch). ✓
- No placeholders: each task states concrete content, code interfaces, and commands. ✓
- Type consistency: `createKarateka`, `setPose`, `composePose`, `buildTimeline`, `samplePose`, `Player`, `initScene`, `initUI`, `createCoach`, `initBunkai` used consistently across tasks. ✓
