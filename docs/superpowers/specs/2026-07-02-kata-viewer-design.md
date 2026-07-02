# Isshin Ryu 3D Kata Viewer — Design

**Date:** 2026-07-02
**Status:** Approved by user (Approach A)

## Purpose

A browser-based 3D viewer that plays all five Isshin Ryu empty-hand katas documented in this
repo (Seisan, Seiunchin, Naihanchi, Wansu, Chinto) performed by a 3D karate avatar in a
traditional Okinawan dojo. Users can play/pause, scrub forwards and backwards through every
movement, orbit/zoom the camera to see all sides, toggle a bunkai attacker, hear a coach voice
call each movement, and see/hear kiai points. Tested locally, then deployed to Hostinger shared
hosting as a static site.

Note: the user's goal said "Issun Ryu"; the source kata files all say **Isshin Ryu**, which
matches this kata set (Seisan, Seiunchin, Naihanchi, Wansu, Chinto). Isshin Ryu is used
throughout.

## Decisions made with the user

| Decision | Choice |
|---|---|
| Avatar style | Stylized low-poly gi figure built in code (white gi + belt), full joint control |
| Bunkai display | Second attacker avatar (dark gi) performing the attack, synced to timeline |
| Coach voice | Web Speech API (browser TTS), on/off toggle, voice picker |
| Kiai | Timeline markers + "KIAI!" visual burst + audible shout |
| Architecture | **Approach A**: vanilla Three.js ES-modules, no build step, pure static files |

## Architecture

Pure client-side static site. No server code, no build step. Deploy = copy folder to
Hostinger `public_html`.

```
kata-viewer/
  index.html              app shell + UI chrome
  css/app.css             UI styling
  js/
    main.js               bootstrap, wiring
    scene.js              Three.js scene, dojo environment, lighting, camera + OrbitControls
    avatar.js              procedural karateka builder (joint hierarchy, gi mesh), pose applier
    poses.js               named pose library: stances, blocks, punches, kicks, guards
    player.js              timeline engine: interpolation, play/pause/scrub/step, speed 0.1x–5x
    coach.js               Web Speech API movement calls + kiai shout
    bunkai.js              attacker avatar behaviour + bunkai text cards
    ui.js                  control bar, kata selector, sliders, toggles, timeline markers
  data/
    seisan.json  seiunchin.json  naihanchi.json  wansu.json  chinto.json
  lib/three/               vendored three.module.js + OrbitControls (no CDN dependency)
```

Three.js is vendored locally so the site works on Hostinger with no external dependencies.

## Components

### Kata data (JSON timelines)

Each kata file's step table is converted to JSON. Schema per kata:

```json
{
  "name": "Seisan", "style": "Isshin Ryu",
  "facingStart": "front",
  "steps": [
    {
      "id": 1,
      "label": "Left middle block, right punch",
      "coachCall": "Step left. Middle block. Punch.",
      "kiai": false,
      "embusen": { "x": 0, "z": -1, "facing": 0 },
      "stance": "seisan",
      "keyframes": [ { "t": 0.0, "pose": "...", "overrides": {} } ],
      "bunkai": { "known": true, "attack": "stepping-punch", "text": "Defend mid-level strike, counter to torso" },
      "transition": { "known": true, "source": "Seisan.md step 1", "notes": "" }
    }
  ]
}
```

- `keyframes` reference named poses from the pose library with optional per-joint overrides.
- `transition.known: false` flags movements whose footwork/mechanics are ambiguous or missing;
  these are visibly badged in the app and listed in the research report.
- `bunkai.known: false` means no attacker animation for that step; the toggle shows nothing there.

### Avatar (avatar.js + poses.js)

Procedural humanoid: hips → spine → chest → neck → head; chest → L/R shoulder → elbow → wrist
(fist/open-hand meshes); hips → L/R hip → knee → ankle → foot. White gi (loose box/cylinder
geometry), colored belt, dark variant for the attacker. A pose = a map of joint rotations +
root position/rotation. Pose library encodes Isshin Ryu vocabulary: seisan-dachi,
seiunchin-dachi, naihanchi-dachi, cat stance, T-stance, Chinto stance; vertical-fist punch,
uppercut, backfist, hammerfist, nukite, haito, shuto, elbow strikes; low/middle/high/X blocks;
front kick, knee lift, jump kick; plus ready/rei positions.

### Playback engine (player.js)

- Master clock in "kata time"; each step occupies a time span from its keyframes.
- Interpolates joint quaternions and root transforms between keyframes (smoothstep easing).
- Pure function of time → pose, so scrubbing backwards/forwards and pausing are exact, not simulated.
- Controls: play/pause, prev/next step, scrub slider with step tick marks and red kiai markers,
  speed slider 0.1x–5.0x (continuous), current step name display.

### Scene (scene.js)

Okinawan dojo: plank wood floor, kamiza wall with scroll + Isshin Ryu Megami-style banner,
shoji screen walls, wooden beams/posts, hanging lanterns, warm key light + ambient.
OrbitControls (rotate/pan/zoom, damped), preset camera buttons: Front / Side / Rear / Overhead.

### Coach voice (coach.js)

- `speechSynthesis` utterance per step at step start, short calls (fit within step duration).
- Voice picker (available system voices), rate loosely follows playback speed (clamped),
  auto-muted above ~3x speed where speech can't keep up.
- Kiai: spoken "Eiii!" at high rate/pitch + screen flash + brief scale-pulse on avatar.
- Feature-detected; app fully functional if TTS is unavailable.

### Bunkai (bunkai.js)

Toggle "Show bunkai". For steps with `bunkai.known`, a dark-gi attacker appears at the
appropriate position/angle and performs the attacking motion (stepping punch, grab, front kick,
sweep, choke...) timed so the defender's technique answers it. A text card shows the
application description. Steps without known bunkai: attacker fades out, card says
"No bunkai recorded for this movement."

## Research task: unknown transitions & kiai points

Before/while building the data files, produce `docs/transition-report.md`:

1. Extract every movement transition from the 5 markdown files; mark each KNOWN / AMBIGUOUS / MISSING.
   Known gaps already identified:
   - **Wansu steps 17–end are missing** (file truncated mid-step-17).
   - Kiai points are marked "dojo-specific" in Seisan and Wansu; Naihanchi and Chinto notes
     are partial; Seiunchin has one kiai at step 19.
   - Several "transition step only" / "per dojo" entries (e.g., Naihanchi 3, 10, 15).
2. Web-search each unknown (Isshin Ryu kata descriptions, established lineage references).
3. Report per kata: resolved items with sources, and items **still unknown** (also badged in-app).
4. Standard kiai points to research/confirm: Seisan (~final punch step 21), Seiunchin (step 19),
   Naihanchi (commonly 2 kiai points), Wansu (dump + final strikes), Chinto (step 30 kick area).

## Error handling

- Malformed/missing kata JSON → error banner naming the file; other katas still load.
- TTS unavailable → coach controls disabled with tooltip, app otherwise unaffected.
- WebGL unavailable → friendly message with browser guidance.
- Unknown transitions render as best-guess interpolation with an "unverified" badge rather than breaking playback.

## Testing

- Local static server (`python -m http.server` or `npx serve`) on Windows; verified in Chrome
  via browser automation: each kata loads, plays end-to-end, scrubs both directions, speed
  extremes (0.1x, 5x) behave, bunkai toggle works, kiai markers fire, camera orbits.
- Data validation script (Node or browser console) checking every step has keyframes, embusen,
  coach call, and transition status.
- Manual acceptance by user before Hostinger upload; a short `DEPLOY.md` documents the FTP/file-manager upload.

## Out of scope (YAGNI)

- Motion capture, physics/ragdoll, weapons katas, multi-user features, mobile-specific UI
  (desktop-first; basic touch works via OrbitControls), user accounts, server-side anything.
