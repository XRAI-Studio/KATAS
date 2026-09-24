# Class standard, Phase 3 (Katas) — review log

Work order: `docs/plans/2026-09-23-class-standard-phase3.md`, on `master` (`1aae109`).
Roles: host and coordinator Claude Code (Fable 5.1); plan reviewer Codex (CLI default
`gpt-6-astra` / `high`); builder Claude; inspector a fresh Codex session. Limits: MAX_ROUNDS 5,
MAX_FIX_ROUNDS 2, MAX_INSPECTION_ROUNDS 2, inspect on. Authorization: the user's 2026-09-23
approval of the seven-host plan and the instruction "continue" after Phase 2; commits to
`master` (which deploys) and the Vercel environment variable are covered. This log lives
under `docs/plans/` so it does not collide with the `PLAN-REVIEW-LOG.md` that exists on the
unmerged `graphics` branch.

## Review round 1 — Codex (REVISE)

Runner result: `scratchpad/claudex-runs/claudex-sl891nw6/result.json`, session
`01a0d160-b744-7e80-8c0c-0e1557f0df50`, plan SHA256
`063a346a3cd543ea91d74b23b3e4204d119a6c07902e9cdc5dc01f2554b30ade`, CLI `codex-cli 0.153.4`,
requested model: CLI default (`gpt-6-astra` / `high`). Usage: 305,275 input tokens (247,296
cached), 3,315 output. Elapsed 145 s. Three findings, all accepted: **KATAS-P3-001 (high)**
`app/` at the root with the proxy under `src/` would leave the gate undiscovered → shell
under `src/app/` beside `src/proxy.ts`, plus an HTTP integration check; **KATAS-P3-002
(medium)** anonymous 404 checks contradict the canonical matcher → anonymous non-asset
paths expect the 307, 404s are signed-in checks and are proved locally through the dev
bypass; **KATAS-P3-003 (medium)** no `e2e` → `scripts/e2e.ts` in two parts (production-mode
gate check with the `Host` header; development-mode viewer and award check with the mock
kit). Dispositions `scratchpad/phase3-katas-feedback-r2.md`; round 2 resumes the session.

## Review round 2 — Codex (REVISE, one new finding)

Runner result: `scratchpad/claudex-runs/claudex-fxkadral/result.json`, resumed session
`01a0d160-b744-7e80-8c0c-0e1557f0df50`, plan SHA256
`12392d7ef581332d512f8352fde9ff47c319dbb7bbeb3f38aea266c2413b4969`. Usage: 435,841 input
tokens (408,064 cached), 2,032 output. Elapsed 88 s. KATAS-P3-001..003 resolved. New,
accepted: **KATAS-P3-004 (medium)** the production-mode e2e expected `next=` to carry the
public HTTPS origin although Next builds `nextUrl` from its own listening address → the
check binds to localhost, asserts the encoded local origin, path and query with redirects
disabled, and supplies a dummy `NEXT_PUBLIC_SUPABASE_URL`. Dispositions
`scratchpad/phase3-katas-feedback-r3.md`; round 3 resumes the session.

## Review round 3 — Codex (APPROVED)

Runner result: `scratchpad/claudex-runs/claudex-x2b4a7o2/result.json`, resumed session
`01a0d160-b744-7e80-8c0c-0e1557f0df50`, plan SHA256
`a84fd2ac568d349c74def154666ed6ded8e5dfa2e6435c3e08ad0bb74d60a6dd`. Usage: 215,875 input
tokens (199,296 cached), 799 output. Elapsed 36 s. "The revised acceptance criteria resolve
KATAS-P3-001 through KATAS-P3-004. No material unresolved defects found." Rounds used: 3
of 5. Pre-build commit: `83bcae6` (the work order commit on `master`; the viewer itself is
at `1aae109`). Builder Claude.

## Build (Claude, this session) — pre-build commit `83bcae6`

Layout: `git mv kata-viewer public`; `tests/*.mjs` and `tools/*.mjs` repointed to
`../public/...`; `kata-viewer/DEPLOY.md`, `.github/workflows/deploy.yml` and `serve.ps1`
deleted. Shell: `package.json` (versions taken from Factors), `tsconfig.json`,
`vitest.config.ts`, `eslint.config.mjs` (ignores `public/**`, `tests/**/*.mjs`, `tools/**`),
`next.config.ts` (headers + `/` → `/index.html` rewrite), `vercel.json` (`framework:
nextjs`), `.gitignore`, `src/app/layout.tsx`, `src/app/not-found.tsx`, `src/proxy.ts`,
`src/lib/session.ts`, `src/lib/session-cookie.ts` and the three vitest suites copied from
Factors verbatim, `.github/workflows/verify.yml` (branch `master`). Kit: `public/js/kit.js`
(`initKit` with the localhost mock recording on `window.__kitAwards`, `award`,
`furthestStepTracker`), `public/index.html` loads the kit script, `public/js/main.js` starts
the kit first and wraps the viewer in `boot(kit)` (a mechanical wrap, no logic change)
with the three awards, `public/js/player.js` gains `onComplete`. Tests: `tests/kit.test.mjs`
(5), two `onComplete` cases in `tests/player.test.mjs`. `scripts/e2e.ts` in the two parts
of criterion 5b. `README.md`, `AGENTS.md`, `macscott.json`. Vercel: repo linked to project
`katas`, `NEXT_PUBLIC_SUPABASE_URL` set for Production before the push.

One deviation found by the e2e and fixed before commit: loading a kata seeks to step 0,
which the first tracker counted as a new furthest step; the baseline is now 0 (step 0 is
the starting position) so the first `kata_step` is for step 1. The kit test encodes it.

Proofs: `npm run verify` → typecheck and lint clean, data validator ok, 72 Node tests,
24 vitest tests; `npm run build` clean with `ƒ Proxy (Middleware)`; `npm run e2e` PASS
(production-mode gate: `/` and `/docs/review-notes.md?x=1` → 307 with the local origin
encoded, assets 200 with headers; development mode: viewer boot, `kata_view` ×2,
`kata_step` for 1 and 2 only, `kata_complete` once, repository paths 404).

## Inspection 1 — Codex (REVISE)

Runner result: `scratchpad/claudex-runs/claudex-f3co28eq/result.json`, fresh session
`01a0d171-e701-7743-b2a3-3aa0e0306001`, base `83bcae6`, inspected tree = `a94db3c`, CLI
`codex-cli 0.153.4`, requested model: CLI default (`gpt-6-astra` / `high`). Usage:
2,067,151 input tokens (1,824,384 cached), 4,916 output. Elapsed 203 s. Three findings,
all accepted (fix round 1 of 2):

- **KATAS-P3-005 (medium)** scrubbing to the maximum while playing seeks to the end with
  playback still on, and the next `tick` fired `onComplete`. *Fixed:* completion fires only
  when playback crosses the end from strictly before it; a seek that landed on the end just
  stops. New player test: play, tick, seek(duration), tick → no completion, still stops.
- **KATAS-P3-006 (medium)** the kit captures one learner's token at init, so after an
  account switch in another tab an open viewer credited the previous learner (Word Power
  guards this). *Fixed:* `kit.js` gains `sessionUserId` (the kit's cookie reader) and
  `sameAccount`; `award` refuses and reports a mismatch; `main.js` routes every award
  through a guard that reloads through the gate on mismatch and also checks on
  `visibilitychange`/`focus`. The mock kit always matches. Tests: cookie parsing (plain,
  chunked, base64-prefixed, malformed), `sameAccount`, and `award` refusing after a switch
  or sign-out.
- **KATAS-P3-007 (low)** `tools/timing-map.mjs` and two docs still cited
  `http://localhost:8420` (the deleted `serve.ps1`). *Fixed:* `KATAS_ORIGIN` with
  `http://localhost:3000` as the default; docs updated.

### CI on `a94db3c`: failure, and a documented exception to rule 4.2

`verify` run 35951318274 failed before any job started ("workflow file issue"). Cause:
`XRAI-Studio/KATAS` is **public** and `travelschooling-portal` is **private**; GitHub does
not allow a public repository to call a private repository's reusable workflow (Factors
and Word Power are private, which is why their callers worked). Fix: the same four steps
(checkout, setup-node 24 with npm cache, `npm ci`, `npm run verify`) are inlined in
`.github/workflows/verify.yml` with a comment naming the reason and the file to keep in
step with. Recorded as a deviation from criterion 6 and rule 4.2 for public class
repositories; Word Forge (also public) will need the same. Alternative for the user:
make the repository private, after which the caller form works again.

### Fix round 1 proofs

`npm run verify` → typecheck and lint clean, data validator ok, 76 Node tests (was 72),
24 vitest tests; `npm run e2e` PASS (both parts). Sent for inspection 2 (the last of the
two authorized).

## Inspection 2 — Codex (REVISE, one low finding)

Runner result: `scratchpad/claudex-runs/claudex-16bg01fx/result.json`, fresh session
`01a0d17a-28fa-75d1-b1fd-bf1f69c8132a`, base `83bcae6`, inspected tree = the fix-round-1
commit, CLI `codex-cli 0.153.4`, requested model: CLI default (`gpt-6-astra` / `high`).
Usage: 2,347,775 input tokens (1,957,760 cached), 3,929 output. Elapsed 283 s. "No
additional material defects found in the shell, session gate, or award integration."
KATAS-P3-005..007 not reopened. One finding:

- **KATAS-P3-008 (low)** in `scripts/e2e.ts` the browser launched outside the dev
  server's `try/finally`, so a Chromium launch failure (or a `browser.close()` rejection)
  could leave `next dev` running. *Fixed (fix round 2 of 2):* the launch moved inside the
  `try`, the browser reference is optional, and the cleanup is nested so `stopServer`
  always runs.

Inspection budget (2) spent; host decision, following the precedent in the other repos:
one extra fresh inspection of this small change rather than leaving it unreviewed. Any
finding it raises is reported to the user, not fixed.

### CI and live evidence

- `verify` (inlined steps): run 35951978923 on `bfdea2c` **success**; run 35952417934 on
  `93c0681` **success** (criterion 6, with the public-repository exception).
- Live, without a cookie: `/` → 307 to
  `https://class.travelschooling.com/login?next=https%3A%2F%2Fkarate.travelschooling.com%2F`
  with the four headers; `/js/main.js`, `/data/seisan.json`, `/css/app.css`,
  `/lib/three/three.module.js` → 200; `/docs/review-notes.md`, `/tools/validate-data.mjs`,
  `/tests/player.test.mjs`, `/kata-viewer/index.html` → 307 to the login with the path in
  `next=` (criteria 2, 3). Vercel built the Next shell from `vercel.json`'s framework
  setting on the first push (45 s to live); `/js/kit.js` on the live host carries the
  account guard after the fix push.
- Signed-in live check (criterion 9): **awaiting user verification**; the host's browser
  has no portal session (reset by the portal migration) and the host does not enter
  credentials. To perform: sign in at the portal, open `https://karate.travelschooling.com/`,
  pick a kata (a `kata_view` award), press next twice (`kata_step`), and confirm in the
  portal launcher that the KATAS tile updates.

## Inspection 3 — Codex (APPROVED) — host-authorized extra, final for Phase 3

Runner result: `scratchpad/claudex-runs/claudex-glv8c2us/result.json` (a first attempt,
`claudex-tqhz7021`, was killed by the host machine for memory pressure before answering),
fresh session `01a0d182-822b-72c0-ba1c-d9b4eaf8df85`, base `83bcae6`, inspected tree =
`93c0681`. Usage: 1,817,282 input tokens (1,467,264 cached), 3,222 output. Elapsed 258 s.
"No material unresolved defects found in the inspected implementation. The e2e cleanup
now handles Chromium launch failures and browser-close rejections."

**Round accounting, Katas Phase 3:** plan review 3 rounds (approved at
`a84fd2ac568d349c74def154666ed6ded8e5dfa2e6435c3e08ad0bb74d60a6dd`), fix rounds 2 of 2,
inspections 3 (2 authorized plus one host-authorized extra). Closed: KATAS-P3-001..008.
Deviations recorded: step-0 baseline for `kata_step`; inlined CI steps (public repository).
Open: the signed-in live check (user); disabling the stale GitHub Pages site (user).
