# Kata review notes — what to change, and where each kind of change lands

Use this file to tell Claude what is wrong in the viewer and what it should be. One bullet per
change, each with a link to the moment. Claude reads this file at the start of the next session.

## Timing notes — read this first

Movement timing is the current focus, on **Seisan** only. Two companion files:

- **[timing-guide.md](timing-guide.md)** — what to say for each kind of timing change, and what
  each knob does. Read it once; it explains the beat clock, the 25% travel window at the start of
  every step, why holds make the *next* move faster, and how to ask for a movement that is missing.
- **[seisan-timing.md](seisan-timing.md)** — every keyframe in Seisan with its exact time, pose
  names, ease and hold, generated from the engine. Scrub to a moment, find the row, cite it.
  Regenerate with `node tools/timing-map.mjs seisan > docs/seisan-timing.md`.

Its **Warnings** section already lists real problems: five keyframes that never render (steps 9,
10, 11, 14, 17) and nine holds cut short. Confirm or correct those and they get fixed first.

## Citing a moment

1. `.\serve.ps1` → http://localhost:8420, pick the kata, scrub or pause on the moment.
2. Click **Copy link** in the bottom bar. The link carries the kata, exact time, camera preset and
   bunkai state, e.g. `http://localhost:8420/?kata=seisan&t=16.60&cam=side`.
3. Paste it into a bullet below with *what it should be* (not only what is wrong).

If the **Copy link** button or the `t = … s` readout is missing, hard-refresh once (**Ctrl+F5**) —
the browser may still be holding the previous version of the viewer's files.

The HUD also shows the step ("7 / 23 — …") and `t = 16.6 s` if you would rather type them.
Links keep working on the deployed site — only the host changes.

## Kinds of change — say which one; it tells Claude where the fix goes

| Kind | Example note | Where it lands | Scope |
|---|---|---|---|
| **Pose** — how a named technique or stance looks | "vertical-fist punch: elbow stays slightly bent, thumb up" | `kata-viewer/js/poses.js` | every use of that pose, all five katas |
| **Keyframe** — one moment in one step | "step 7: the low shuto comes *after* the grab, not with it" | that step's `keyframes` in `kata-viewer/data/<kata>.json` | that step only |
| **Timing** — pace, holds, flow | "too slow", "hold the punch longer", "don't stop here, flow through" | `beats`, keyframe `t`, `ease` (`kime` / `soft` / `pass`), `hold` (beats) — **see [timing-guide.md](timing-guide.md)** | that step |
| **Look / head** | "look over the left shoulder here", "no head turn here" | `look` (`left` / `right` / `none`) on the step being entered, or a `head` override | that step |
| **Hands** | "this block is open-hand in our dojo" | hand metadata in `poses.js` | every use of that pose |
| **Footwork / stepping mechanics** — Phase 4 | "the stepping foot slides in a crescent through the support foot", "heel stays down", "pivot on the ball of the front foot" | Phase 4 design: foot lock + leg IK in `player.js` | a global rule, or a rule per stance transition |
| **Embusen** — where a step lands / faces | "step 9 lands further to the left" | `embusen` on the step | that step |
| **Bunkai** | "attacker grabs the lapel from the front here" | `bunkai` on the step; attack clips in `bunkai.js` | that step |
| **Missing technique / stance** | "there is no kake-uke pose" | new entry in `poses.js`, then used from data | — |

A **global rule** (Phase 4 mechanics, chamber height, fist orientation, stance depth) only needs
saying once, under "Global rules" — no need to cite every moment it affects.

## Phase 4 as currently planned — correct this before it is built

For each stance transition: the foot that travels farther is the **swing foot**; the other foot's
contact point stays fixed on the floor (two-bone leg IK) instead of sliding; the swing foot moves in
a straight line with a low suri-ashi lift (≤ 3 cm); turns > ~100° become two half-steps (one foot,
then the other). Tell Claude where Isshin Ryu — or your dojo — differs: crescent vs. straight step,
heel-first vs. ball-first, which foot pivots on turns, how deep the weight drops during the step.

## Notes

<!-- one bullet per change: link — kind — what it should be -->

### Seisan
-

### Seiunchin
-

### Naihanchi
-

### Wansu
-

### Chinto
-

### Global rules (apply everywhere)
-
