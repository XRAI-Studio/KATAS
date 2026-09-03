# Isshin Ryu Kata Transition & Kiai Research Report

**Date:** 2026-07-02
**Purpose:** Every movement transition in the five kata files was audited. Gaps and ambiguities
were researched via web sources. This report lists what was resolved (with sources) and what is
**still unknown**. Items still unknown are badged "unverified" in the 3D viewer.

**Primary sources used:**
- isshinryukarate.net kata pages (Seisan, Seiunchin, Naihanchi, Wansu, Chinto) — numbering style
  closely matches this repo's notes and was treated as the reference lineage.
- web.mit.edu/~dcltdw/Isshinryu (MIT Isshinryu Club) — cross-check, esp. Wansu ending.
- isshin-concentration.blogspot.com — Wansu dump analysis.

---

## Seisan

| Item | Status | Notes / Source |
|---|---|---|
| Steps 1–22 transitions | KNOWN | Fully specified in `Seisan.md`. |
| Kiai point | RESOLVED | Step 21 (pull with left, right punch, KIAI) — confirmed by isshinryukarate.net Seisan page; matches `Seisan.md` step 21. Single kiai. |
| Step 14/17 "Chinto stance then Seiunchin" compound transitions | KNOWN (complex) | Described in file; played as 3 keyframes. |
| Final heel-scoop throw (step 22) mechanics | RESOLVED | "Grab kick under heel with left hand and shote across foot with right, throw (twist)" — isshinryukarate.net. |

**Still unknown:** none.

## Seiunchin

| Item | Status | Notes / Source |
|---|---|---|
| Steps 1–20 transitions | KNOWN | Fully specified in `Seiunchin.md`. |
| Kiai point | RESOLVED | Step 19 (push-down block + right backfist, KIAI) — confirmed by isshinryukarate.net Seiunchin page, matching `Seiunchin.md`. |
| Kiai variant | NOTED | Some lineages place two kiai on the uppercuts (steps 12 and 15) instead (general search results). Viewer uses step 19 per this dojo's notes. |
| Step 11 pivot "225° CCW" exact foot pivot | KNOWN | In file; played as look → pivot on right foot. |

**Still unknown:** none.

## Naihanchi

| Item | Status | Notes / Source |
|---|---|---|
| Step 3 & 10 "transition step only" crossovers | RESOLVED | isshinryukarate.net Naihanchi page: step 3 = left foot front-crossover to the right, right foot rear-crossover to the right; step 10 mirrors (right front-crossover left, left rear-crossover left). Hands stay in guard. |
| Kiai point | RESOLVED | Step 14, on the final left straight punch (right closed guard at solar plexus) — isshinryukarate.net. `Naihanchi.md` called this "often treated as final strike". Single kiai. |
| Step 15 close | RESOLVED | Return to musubi-dachi bringing left foot to right, then bow. |

**Still unknown:** none.

## Wansu

| Item | Status | Notes / Source |
|---|---|---|
| Steps 0–16 transitions | KNOWN | Specified in `wansu.md`. |
| **Steps 17–end: FILE TRUNCATED** | RESOLVED (reconstructed) | `wansu.md` ends mid-step-17. Ending reconstructed from isshinryukarate.net + MIT Isshinryu Club, which agree on substance: side blade kicks L/R with catch → slow open-hand guard + right elbow smash to temple → two front kicks from neko-ashi (facing rear) → double shuto to throat with KIAI → slow guard, close to musubi, bow. |
| Reconstructed 17 | RESOLVED | Left side blade kick with catch, land. |
| Reconstructed 18 | RESOLVED | Right side blade kick with catch, land. |
| Reconstructed 19 | RESOLVED | Step forward Seisan, open-hand guard deploys slowly, right elbow smash to temple. |
| Reconstructed 20 | RESOLVED | Shuffle to left-forward open neko-ashi facing original rear, straight (front) kick. |
| Reconstructed 21 | RESOLVED | Swap to right-forward open neko-ashi, straight kick. |
| Reconstructed 22 | RESOLVED | Land right-forward Seisan, double shuto to throat both sides, **KIAI**. |
| Reconstructed 23 | RESOLVED | Step left forward, slow open-hand guard; left foot to right foot, return to ready, bow. |
| Footwork linking step 16 → 17 (which foot steps first, exact facing) | **STILL UNKNOWN** | The two sources sequence the middle differently (MIT inserts musubi-pause punch combos before the kicks; isshinryukarate.net folds them earlier). The viewer uses a direct step-out and badges 17–18 unverified. |
| Kiai points | RESOLVED | Two: the dump (step 12; "drive attacker down with right hand and Kiai" — isshinryukarate.net) and the double shuto to throat (reconstructed step 22 — MIT). Matches `wansu.md` note "kiai usually on dump and final strong strikes". |
| Dump mechanics | RESOLVED | Kata garuma: grab high (throat) with left, hook low with right, lift and dump during 180° CCW pivot into Seiunchin-dachi — isshin-concentration.blogspot.com, isshinryukarate.net. |

**Still unknown:** exact footwork/facing entering the reconstructed ending (steps 17–18 badged unverified).

## Chinto

| Item | Status | Notes / Source |
|---|---|---|
| Steps 0–12, 15–30 transitions | KNOWN | Specified in `Chinto.md`. |
| Step 13 jump/X-block mechanics | RESOLVED | Jump kick is nidan-geri (double jump front kick) landing in Seisan-dachi left foot forward with right-over-left low knuckle X-block — isshinryukarate.net Chinto page. `Chinto.md` said "mechanics differ by instructor"; this is the reference version used. |
| Step 14 second X-block turn direction | PARTIALLY RESOLVED | Reference shows the repeated low X-block after turning; exact degree of turn varies by lineage. Badged unverified. |
| Kiai points | RESOLVED | Two: on the kick sequence near the end (maps to `Chinto.md` step 30, "often a big kiai moment" — confirmed) and on the kneeling punch to the fallen opponent (final phase of step 31) — isshinryukarate.net. |
| Step 31 multi-phase finish exact order | **STILL UNKNOWN** | `Chinto.md` itself says "exact order can differ slightly by line"; sources abbreviate this sequence. Viewer plays the order as written in `Chinto.md` and badges it unverified. |

**Still unknown:** step 14 turn amount; step 31 internal ordering.

---

## Kiai summary used by the viewer

| Kata | Kiai steps (this repo's numbering) | Confidence |
|---|---|---|
| Seisan | 21 (final right punch) | High (file + source agree) |
| Seiunchin | 19 (right backfist) | High (file + source agree; uppercut variant noted) |
| Naihanchi | 14 (final left punch) | High (source; file implied) |
| Wansu | 12 (dump) and 22 (double shuto, reconstructed) | High / Medium |
| Chinto | 30 (kiai kick) and 31 (kneeling punch) | High / Medium |

## Bottom line

- **Resolved by research:** Wansu's entire missing ending (7 steps), Naihanchi crossover
  transitions and kiai, all five katas' kiai points, Chinto jump/X-block mechanics, Wansu dump
  mechanics, Seisan heel-scoop throw.
- **Still unknown after research (3 items):** Wansu step 16→17 linking footwork, Chinto step 14
  turn amount, Chinto step 31 internal ordering. These play with best-guess motion and are
  badged "unverified" in the app.
