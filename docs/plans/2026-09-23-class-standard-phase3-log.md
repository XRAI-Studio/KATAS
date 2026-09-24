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
