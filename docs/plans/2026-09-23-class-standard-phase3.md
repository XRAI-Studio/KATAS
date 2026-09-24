# Class standard, Phase 3 (Katas): Next.js shell, page gate, kit awards, shared CI

Part of the seven-host rollout approved 2026-09-23 (master plan:
`C:\Users\thetr\.claude\plans\lets-take-a-step-vast-wall.md`; the standard:
`travelschooling-portal/docs/class-standard.md`; the Factors and Word Power Phase 2 work
orders are the reference implementations, both live). This work order covers only the
`katas` repository, on `master`. The `graphics` branch (GLB avatar, pushed as a backup) is
a product decision and is not merged here. Game slug `katas`; hostname
`karate.travelschooling.com`; Vercel project `katas`. Log: `docs/plans/2026-09-23-class-standard-phase3-log.md`.

## Goal

Put the kata viewer on the class standard without touching the viewer's code beyond the
kit hooks: a Next.js shell that serves the existing static viewer from `public/`, the
page-level login gate, the security headers, the shared CI workflow, the kit with the three
awards the viewer can already emit (`kata_view`, `kata_step`, `kata_complete`), and one
deploy path. Today the Vercel project serves the raw repository root (docs, tests and
tools are public, `/` is a 404, the viewer lives at `/kata-viewer/`).

## Acceptance criteria (observable)

1. Repository layout: `public/` holds what `kata-viewer/` holds today (`index.html`,
   `css/`, `js/`, `data/`, `lib/`, `dev/`), moved with `git mv` so history follows;
   `kata-viewer/` no longer exists; `tests/*.test.mjs`, `tools/validate-data.mjs` and
   `tools/timing-map.mjs` import from `../public/js/...` and read data from `public/data`;
   `node tools/validate-data.mjs` and `node --test tests/*.test.mjs` pass unchanged in
   behaviour.
2. Next.js shell at the repo root (`package.json` name `katas`, Next 16.3.x, TypeScript,
   no Tailwind, ESLint with `public/**` ignored as the portal ignores its kit): a root
   `app/layout.tsx` and `app/not-found.tsx` (the shell has no page of its own);
   `next.config.ts` with the four security headers on `/(.*)` (rule 2.4) and a rewrite
   `/` → `/index.html`; `vercel.json` `{ "framework": "nextjs" }` so the Vercel project's
   "Other" preset is overridden without a dashboard change. Live: `/` serves the viewer
   (title `Isshin Ryu Kata Viewer`), `/index.html`, `/js/main.js`, `/data/seisan.json`
   and `/lib/three/three.module.js` answer 200, and `/docs/review-notes.md`,
   `/tools/validate-data.mjs`, `/tests/player.test.mjs` answer 404.
3. `src/proxy.ts`, `src/lib/session.ts`, `src/lib/session-cookie.ts` and their tests are
   byte-identical copies of Factors' at `main` (`jose`, `vitest` added); `tests/proxy.test.ts`,
   `tests/session.test.ts`, `tests/next-config.test.ts` run under `vitest`. Live:
   `curl -sI https://karate.travelschooling.com/` without a cookie → 307 to
   `https://class.travelschooling.com/login?next=https%3A%2F%2Fkarate.travelschooling.com%2F`
   with the four headers; `/js/main.js` without a cookie → 200 (assets are not gated).
4. Kit (rule 3): `public/index.html` loads
   `https://class.travelschooling.com/kit/v1/ts-kit.js` before the module script; a new
   `public/js/kit.js` exports `initKit()` (on `localhost`/`127.0.0.1`: a no-op mock kit
   with `user: { id: "dev" }` so `npm run dev` works without a portal session; otherwise
   `TSKit.init({ game: "katas" })`) and `furthestStepTracker()` (pure: reports whether a
   step index is a new furthest for a kata, per page session). `main.js` awaits
   `initKit()` first; when `kit.user` is null it shows "Sending you to sign in…" in the
   existing `#error-banner` and stops (the kit has started the redirect); when
   `window.TSKit` is missing on the live host it shows "Could not reach the school portal"
   with a "Try again" button that reloads (rule 3.4). Awards, all fire-and-forget with a
   `catch` that logs: `kit.award("kata_view", { kata })` in `loadKata` (kata = file name
   without `.json`); `kit.award("kata_step", { kata, step })` from the existing `onStep`
   when the tracker reports a new furthest step; `kit.award("kata_complete", { kata })`
   from a new `Player` option `onComplete`, fired once per play-through when `tick` moves
   the time to `duration` while playing (a `seek` to the end does not fire it). No other
   viewer behaviour changes. `quiz_*` and `journal_entry` stay in the seed but are not
   emitted; the README records the gap.
5. Tests: `tests/player.test.mjs` gains cases for `onComplete` (fires once when playback
   reaches the end; not on `seek(duration)`; fires again on the next play-through);
   `tests/kit.test.mjs` covers `furthestStepTracker` (first step, higher step, lower or
   equal step, second kata independent). `npm test` runs the data validator, the Node
   tests and `vitest run`; `npm run verify` = typecheck, lint, test.
6. `.github/workflows/verify.yml` calls
   `XRAI-Studio/travelschooling-portal/.github/workflows/class-verify.yml@main` on push and
   pull request to `master`; the first run is green. `.github/workflows/deploy.yml`
   (GitHub Pages), `kata-viewer/DEPLOY.md` (Hostinger FTP) and `serve.ps1` are deleted;
   `npm run dev` replaces the local server.
7. `README.md` (new; `master` has none) with the class description, local dev, a "Deploy"
   section per the standard (Vercel project `katas`, Production Branch `master`, one
   `A karate 76.76.21.21` record already in place, `NEXT_PUBLIC_SUPABASE_URL` required,
   `vercel.json` carries the framework), the award mapping and the known gap, and a note
   that the `graphics` branch is unmerged. `AGENTS.md` (new) with the project rules
   (canonical `kit.ts` does not apply: this shell has no `src/lib/kit.ts`; the gate and
   session files are the canonical copies). `macscott.json` `liveUrl` →
   `https://karate.travelschooling.com`, `embeddable: false`.
8. Vercel: `NEXT_PUBLIC_SUPABASE_URL` set for Production before the push; Production
   Branch `master` (evidenced by the `karate.travelschooling.com` alias pointing at a
   deployment of `master`, and the later `graphics` push producing only a preview);
   Root Directory `.`. The GitHub Pages site at `xrai-studio.github.io/KATAS` stops
   updating when `deploy.yml` is deleted; disabling it is a follow-up for the user.
9. Live, signed in as a learner: `https://karate.travelschooling.com/` loads the viewer,
   selecting a kata produces `POST rpc/award` 200 for `kata_view`, and stepping forward
   produces `kata_step` awards; signed out, the curl redirect in criterion 3.

## Approach

`npx create-next-app@latest . --ts --no-tailwind --eslint --app --no-src-dir --import-alias "@/*"`
would fight the existing files; instead add the few files by hand, modelled on Factors:
`package.json` (scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `verify`),
`tsconfig.json` (Factors', paths `@/*` → `./src/*`), `eslint.config.mjs` (Factors' with
`public/**` in `globalIgnores`), `next.config.ts`, `vitest.config.ts` (include
`tests/**/*.test.ts`), `.gitignore`, `next-env.d.ts` generated by the first build.
`src/proxy.ts` is the same file as Factors (the shell has no API, `api/` exclusion is
harmless). Kit hooks in `main.js` are the only game-code edits; `player.js` gains the
`onComplete` option (one `if` in `tick`).

Local run: `npm run dev` on `localhost` → the gate bypasses, `initKit()` returns the mock,
the viewer runs without a portal session.

## Non-goals
Merging `graphics`; quiz and journal features; any change to poses, data or rendering;
Horizon; disabling GitHub Pages (user follow-up).

## Confirmed assumptions
- `master` is `1aae109`; tests run with `node --test` and import the viewer modules by
  relative path (no `three` resolver hook on `master`; `quat`/`rig` tests import the
  vendored `three.module.js` directly).
- `public/` in Next serves files at the root path; a rewrite in the plain array form is
  applied after the filesystem check, so `/` (no page) → `/index.html` (a public file).
  Verified against `node_modules/next/dist/docs` (`public-folder.md`, `rewrites.md`).
- Vercel project `katas`: Root Directory `.`, Framework Preset "Other", Node 24; a
  `vercel.json` `framework` setting overrides the preset.
- The rescope hop and the shared-domain cookie fix (portal Phase 2) are live, so the
  gate's login bounce works for existing sessions after one sign-in.

## Risks
- The viewer's `importmap` and relative fetches assume the page is at the site root;
  serving from `/` (not `/kata-viewer/`) is what they were written for, and the old
  `/kata-viewer/...` URLs become 404 (the showcase and any bookmarks pointing there
  update with `macscott.json`).
- If the first Vercel build with `vercel.json` `framework` does not switch the preset,
  the fallback is the dashboard setting; the first deploy proves it.

## Verification
- `npm run verify` → exit 0; `npm run build` clean with `ƒ Proxy (Middleware)`.
- `gh run list --workflow=verify.yml -L1` → success.
- `curl -sI https://karate.travelschooling.com/` → 307 + four headers; `/js/main.js` 200;
  `/docs/review-notes.md` 404.
- Chrome as a learner: viewer loads at `/`, `kata_view` and `kata_step` awards 200.
