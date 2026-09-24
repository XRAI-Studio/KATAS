# KATAS: rules for agents

A Travel Schooling class (game slug `katas`, hostname `karate.travelschooling.com`). It
conforms to the class standard in `travelschooling-portal/docs/class-standard.md`. Work
orders and review logs live under `docs/plans/`.

Rules:
- The viewer in `public/` is plain ES modules served as-is; the Next.js shell (`src/`) only
  adds the login gate, the headers and the deploy path. Do not bundle or transpile the
  viewer.
- `src/proxy.ts`, `src/lib/session.ts` and `src/lib/session-cookie.ts` are byte-identical
  to Factors' (the canonical copies); change them there first, then copy.
- Kit hooks live only in `public/js/kit.js`, the `initKit()` start of `main.js`, the three
  `award` calls and the `Player` `onComplete` option. Award only events present in the
  portal seed's `xp_events` for `katas`.
- `NEXT_PUBLIC_TS_KIT` is never set on Vercel; `NEXT_PUBLIC_SUPABASE_URL` must be.
- `master` is production. `graphics` is an unmerged product branch; do not merge it as
  part of platform work.
- Kata data changes must keep `node tools/validate-data.mjs` green.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
