# Timing guide — how to say what should change

You describe the kata the way you would in the dojo. This file is the translation layer: what
you say, which knob it turns, and what it will and will not do. Companion file:
[`seisan-timing.md`](seisan-timing.md) — every keyframe in Seisan with its exact time.

---

## 1. The one-minute version

A timing note needs three things:

> **step 21, the reverse punch at t = 75.2 — hold it a half beat longer, and don't rush the
> pull that sets it up.**

1. **The step number** — from the HUD (`22 / 23` means step id 21; the map's **step** column is
   the id, the HUD counts from 1).
2. **The technique name** — so the note survives after times shift.
3. **What it should be**, in dojo language. Not which field to edit — that's my job.

A `?t=` link from **Copy link** is welcome as well, but the step + technique is what makes the
note durable. **Times move.** Adding a beat anywhere shifts every later time in the kata.

---

## 2. The clock

- **1 beat = 1 second** at 1.00× (`SECONDS_PER_BEAT` in `player.js`).
- Each step declares `beats`. Steps run back to back with no gaps: step 21 starts at 72.00 s
  because steps 0–20 add up to 72 beats.
- Seisan is 23 steps / 81 beats / 81 seconds.
- **The speed slider does not change any of these numbers.** A note made at 0.25× still cites the
  same `t`. Slow it down as far as you like when reviewing.

---

## 3. The four knobs

| You say | Knob | What it actually does |
|---|---|---|
| "this whole step is too fast / too slow" | step **`beats`** | Stretches or squeezes the step and everything in it. **Shifts every later step.** |
| "the punch lands too early / too late *within* the move" | keyframe **`t`** (0 → 1, a fraction of the step) | Slides one moment inside the step. Nothing else moves. |
| "snap it" / "let it settle" / "flow through, no stop" | keyframe **`ease`**: `kime` / `soft` / `pass` | The shape of the approach into that frame. See §5. |
| "hold it longer" / "don't freeze there" | keyframe **`hold`** (in beats) | How long the frame is frozen before the next move starts. **Comes out of the gap — see §6.** |

Two more that are timing-adjacent:

| You say | Knob |
|---|---|
| "look before you turn" / "no head turn here" | step **`look`**: `left` / `right` / `none` |
| "the kiai is on the wrong technique" | see §8 — currently an engine limitation |

---

## 4. Anatomy of a step — where the time actually goes

Take step 6 (`15.00–19.00`, 4 beats), from the map:

```
15.00  ── step begins; still holding the previous step's finish
16.00  keyframe 0   seisanDachiR + shoteL + chamberR      <- "travel from 15.00"
16.40  keyframe 1   seisanDachiR + shoteL + haitoR
17.80  keyframe 2   seisanDachiR + shutoLowL + haitoR
19.00  keyframe 3   seisanDachiR + shutoLowL + grabPullR
```

**The first quarter of every step is travel.** Keyframe 0 is written `t: 0`, but a step's `t: 0`
lands on the same instant the previous step ended, so the engine pushes it to **25% into the
step** (1.0 s here). That quarter is the stepping, the turn, the weight change — the body moving
from the last step's finish into this step's opening position.

This matters for your notes:

- "the block comes too late" — is the *block* late inside the step, or is the *step into it*
  too slow? First case → keyframe `t`. Second case → more `beats`, so the travel quarter is
  physically longer.
- "he arrives and then waits" — the opening frame lands at 25% and the next technique is
  authored late; pull the next keyframe's `t` down.
- "the stepping is rushed but the technique is fine" — this one needs more beats *and* the
  later keyframe `t` values raised to compensate, otherwise the technique stretches too.
  Just say it that way; I'll do the arithmetic.

---

## 5. Ease — how a movement arrives

`ease` is about the *approach into* a keyframe, not the pose itself.

| `ease` | Feel | Curve |
|---|---|---|
| `kime` | Accelerates, still moving fast on arrival, stops dead. A technique that lands. | peak speed ~2/3 through |
| `soft` | Eases in and out. A settle, a chamber, a guard. | smoothstep |
| `pass` | Never stops. Constant speed through the frame and straight on. A crossover, a transitional position. | linear |

**Most of this is automatic.** The map's `(auto)` marks mean the JSON says nothing:

- A frame that introduces a **technique** the previous frame did not have → `kime`. Every punch,
  block, kick, strike and shuto pose is flagged as a technique in `poses.js`.
- A pose flagged **pass-through** (currently just `crossoverL`) → `pass`.
- Everything else → `soft`.

So say things like:

- *"the second punch shouldn't snap, it's a set-up for the throw"* → `ease: soft` on that frame.
- *"don't stop in the cat stance, keep moving into the kick"* → `ease: pass`.
- *"the chamber should snap back, not drift"* → `ease: kime` on the chamber frame.

Watch for this one: the **retract to chamber** at the end of steps 1, 2 and 3 is `soft (auto)`,
because a chamber is not a technique. If the retract should snap in our dojo, that is a
**global rule**, not 20 notes — say it once and I set it everywhere.

---

## 6. Holds — the counter-intuitive one

A hold freezes the frame, then the next move starts. Two things to know:

**A hold takes its time out of the gap; it does not add time to the step.**
Holding the punch longer makes the movement *after* it faster, because the next keyframe is
still at the same clock time. If you want a longer hold *and* an unhurried next movement, that
is a hold change **plus** a beats change. Say "hold longer and don't speed up what follows" and
I will do both.

**A hold can never exceed half the gap to the next keyframe.** Ask for 0.3 s in a 0.4 s gap and
you get 0.2 s. The map flags every one of these under **Warnings** — Seisan currently has nine.
If a hold you asked for doesn't look longer, that's why, and the fix is more room (beats or a
later next-`t`), not a bigger hold number.

Defaults: every `kime` frame holds **0.3 beats**. `hold: 0` removes the hold entirely — that is
the knob for *"don't pause here, flow straight through."* The last keyframe of the kata holds
until the end regardless.

---

## 7. Look — the head

Before a step that changes facing by more than 20°, the head turns toward the turn during the
previous step's hold. That is why step 4's double high block (`t = 12.00`) is marked `look left`
— it is looking into the 180° pivot that follows.

- *"he should look over his shoulder before this turn"* → `look` on the step **being entered**.
- *"no head turn here, the eyes stay on the opponent"* → `look: "none"`.
- An explicitly authored head angle on a keyframe always wins over the automatic look. Steps 12,
  15 and 18 do this (`overrides: head` in the map).

---

## 8. Two known limits — worth knowing before you write notes

**The kiai fires at the start of its step, not on the technique.** Step 21 is the kiai step; the
step begins at 72.00 s but the punch lands at **75.20 s**, so the flash and shout come 3.2
seconds early. Moving the kiai onto a specific keyframe is a small engine change — say the word
and I'll do it rather than you working around it.

**Five keyframes in Seisan are never seen.** Steps 9, 10, 11, 14 and 17 each open with a frame
whose *next* keyframe is authored at `t` ≤ 0.25, so it collapses into the travel window and the
opening pose renders for zero time. In step 9 the mid-block at 28.25 s is skipped entirely and
the body goes straight from the previous step into the punch. Every one is listed in the map's
**Warnings**. These are almost certainly wrong and want fixing — tell me whether the swallowed
position should be visible (raise the next `t` / add a beat) or was never meant to be there
(delete it).

---

## 9. Adding a movement that isn't there

Two different cases:

**The technique exists in the library but is missing from this moment.** Say where and when:
*"between the haito and the low shuto in step 6 there should be a grab with the left hand."*
That is a new keyframe in that step's `keyframes`, and it needs room — either a `t` in the
existing gap, or another beat.

**The technique doesn't exist at all.** Say what it looks like — which hand, what height, open
or closed, where it finishes: *"kake-uke: open hand, hooking block at chest height, palm down,
elbow bent about 90°."* That becomes a new pose in `poses.js` and is then usable in every kata.
Left/right versions are generated automatically; author it once.

The current library is in `kata-viewer/js/poses.js` — stances, arm techniques (mirrored to
L/R), two-arm poses, and leg techniques.

---

## 10. Worked examples

Real notes, and what each one turns into:

> **step 1, the punch at 4.65 — too quick after the block, and the chamber back is lazy.**
> → keyframe 1 `t` 0.55 → 0.65; `ease: "kime"` on keyframe 2 so the retract snaps.

> **step 5, the 180° pivot — the turn itself is fine but he sits in the double low shuto too
> briefly before stepping off.**
> → `hold: 0.6` on step 5 keyframe 1, and +1 beat on step 5 so the hold has room (see §6).

> **steps 12/15/18, the step back to cat — no pause at the end, it should flow into the
> backfist.**
> → `ease: "pass"` on the last keyframe of each, `hold: 0`.

> **step 21, the kick then the pull-and-punch — the kick lands at 73.0 and the punch at 75.2;
> that's a two-second gap. It should be kick, pull, punch, all inside one breath.**
> → keyframe `t` values 0.5/0.8 → 0.35/0.55, and drop the step from 4 beats to 3.

> **global: every mid-level punch should snap harder and hold a touch longer.**
> → `KIME_HOLD_BEATS` and the `kime` curve in `player.js`, once, for all five katas.

---

## 11. Keeping the map honest

`docs/seisan-timing.md` is generated from the real engine, so it can't drift from what you see:

```
node tools/timing-map.mjs seisan > docs/seisan-timing.md
```

I regenerate it after every batch of changes. **Times will move** — that is why the step number
and technique name in your note matter more than the `t` value.
