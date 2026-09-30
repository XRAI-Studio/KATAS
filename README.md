# Isshin Ryu Katas

An Isshin Ryu kata viewer for Travel Schooling learners: step through Seisan, Seiunchin,
Naihanchi, Wansu and Chinto on an animated avatar with a scrubbable timeline, camera
presets, a bunkai attacker overlay and a browser coach voice. Game slug `katas`, hostname
`https://karate.travelschooling.com`.

The viewer itself is a plain static site (ES modules, vendored three.js, no bundler) in
`public/`. A minimal Next.js shell around it provides what the class standard requires
(`travelschooling-portal/docs/class-standard.md`): the page-level login gate
(`src/proxy.ts`), the security headers (`next.config.ts`), and one deploy path.

## Run it locally

```
npm install
npx playwright install chromium   # once, for npm run e2e
npm run dev                       # http://localhost:3000, mock kit, no portal session needed
npm run verify                    # typecheck, lint, data validation, Node tests, vitest
npm run e2e                       # production-mode gate check + development-mode viewer run
npm run build
```

On `localhost` the page gate lets everything through and `public/js/kit.js` returns a mock
kit that records awards on `window.__kitAwards` and saves on `window.__kitSaves` (keeping one
stored state in memory, so load and save round-trip); the e2e reads them. `window.__katasDev`
(dev hosts only) exposes the player for the e2e.

## Portal integration

`public/index.html` loads `https://class.travelschooling.com/kit/v1/ts-kit.js`;
`public/js/main.js` calls `initKit()` first. No user means the kit has already started the
redirect to the portal login ("Sending you to sign in…"); a missing kit script shows
"Could not reach the school portal" with a Try again button.

Awards (all fire-and-forget; the portal caps per event and per day):

| Event | When |
|---|---|
| `kata_view` | a kata is loaded (`{ kata }`) |
| `kata_step` | the learner reaches a step further than any reached before in this page session for that kata (`{ kata, step }`) |
| `kata_complete` | playback (not a seek) reaches the end of the kata (`{ kata }`) |

Launcher tile (`public/js/kit.js`, `kataProgressSync`): the viewer keeps
`{ viewed, completed }` kata ids with the portal through `kit.load()` / `kit.save()`, and
the tile shows `"<v> kata(s) practised"` until a kata is completed, then
`"<c> of 5 katas completed"`. Viewing (`kata_view`) or completing (`kata_complete`) a kata
adds it and publishes, only when the award was not refused. The rules:

- One serialized publisher: `kit.save()` is never called while an earlier call is
  unsettled (the real kit's debounce cancels the earlier timer without settling its
  promise). Only the publisher's run is tracked for Return to Home Room.
- Read-merge-write: every publish first loads the stored state and unions it in.
- Completion-dominant revision: `rev = 100 × completed + viewed`. The portal keeps the
  higher rev, so no write (including the kit's own start-up replay of an unsent snapshot)
  can replace a state with more completions by one with fewer.
- Start-up is one tracked operation: kit init, the first load, the merge and the first
  publish, so Return to Home Room waits for them within its 2 s bound. Katas viewed while
  the first load is out are merged in and published once it resolves.
- Account-guarded like awards: nothing is saved for a learner who is no longer signed in.

Accepted residual: the kit replays an unsent snapshot before any viewer code runs, and
that replay can replace a stored state of **equal** completion count but different katas
(device A, offline, completes Chinto; device B saves a Seisan completion; A reconnects).
The tile then reads "1 of 5" where the true union is 2, until the dropped kata is
completed again on any device. It needs a failed save followed by another device's save
before reconnecting, and it only ever undercounts: the headline never drops below the best
single device's count and never shows "practised" after a completion. XP is unaffected
(awards are separate). Closing it fully needs a server-side union RPC or a kit change.

Known gap: the portal seed also lists `quiz_correct`, `quiz_perfect` and `journal_entry`
for this class. The viewer has no quiz or journal yet (quiz content exists on the unmerged
`content/course-draft` branch, with no UI), so those events are never emitted.

## Deploy

- **A push to `master` deploys production.** There is no staging; `*.vercel.app` preview
  URLs sit behind Vercel's deployment protection and cannot sign a learner in.
- **Vercel project `katas`** (team `scottmacscott-8212s-projects`): Root Directory `.`,
  Production Branch `master`; `vercel.json` sets `framework: nextjs`.
- **Environment:** `NEXT_PUBLIC_SUPABASE_URL` is required (the page gate verifies the
  portal session against its JWKS; without it the site answers 500 rather than looping to
  the login). `NEXT_PUBLIC_TS_KIT` is never set on Vercel.
- **DNS:** one record in Hostinger's DNS Zone Editor, `A karate 76.76.21.21`, already in
  place. Never create the subdomain through hPanel's Websites screen and never enable
  Hostinger CDN. `npm run dns:check` in the portal repo verifies all seven hosts.
- **CI:** `.github/workflows/verify.yml` runs the same steps as the shared `class-verify`
  workflow on every push and pull request, inlined: this repository is public and the
  portal is private, and GitHub does not let a public repository call a private
  repository's reusable workflow. Keep the steps in step with `class-verify.yml`.

The old GitHub Pages site (`xrai-studio.github.io/KATAS`) no longer updates; disabling it
is a follow-up.

## Branches

`master` is production. `graphics` (a Blender-generated GLB avatar with a procedural
fallback, plus its own plan and review log) is pushed but unmerged; merging it is a
product decision separate from the class standard work.

## Tests and tools

- `node tools/validate-data.mjs` checks every kata JSON builds a timeline.
- `tests/*.test.mjs` run under `node --test` and import the viewer modules directly.
- `tests/*.test.ts` (the gate, session and headers) run under `vitest`.
- `docs/` holds the timing guide, transition report and review notes; none of it is
  served.
