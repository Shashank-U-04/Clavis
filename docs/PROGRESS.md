# Clavis — Progress

Last updated: 2026-11-24.

## Current state

- Live at https://clavisstudio.vercel.app: Next.js 16 (App Router), React 19, TypeScript,
  Tailwind 4, three.js, on Vercel with Supabase (accounts, plans, versions, history, the
  hosted assistant's allowance). Every merge to `main` deploys.
- `npm run typecheck`, `npm test` (350+ unit tests), `npm run e2e` (browser smoke test) and
  `npm run build` pass on CI for every pull request. `npm run check:live` checks the live site
  (health, sign-in gate, judges' plans, two-browser sync).
- Hosted model: Groq (`openai/gpt-oss-120b`, with `openai/gpt-oss-20b` as the fallback when
  rate-limited). Clavis Local answers first in Auto mode.

## Features

- **Four ways to see a home**: the 2D plan (layout builder), the 3D model, Walk (a 1.75 m
  figure in third or first person, with doors to open and stairs to climb) and Chat.
- **Design from a sentence** (Clavis Local) or from four templates; furnished, validated
  layouts; structural edits (add or remove rooms, resize, open the kitchen).
- **Floors and stairs**: several storeys, stairs that join them for routes, checks and Walk.
- **Library**: 60+ pieces including stairs, railings, glazing, pools, terraces, trees and
  luxury interiors; type measurements before or after placing.
- **Checks**: geometry, openings and door swings, furniture clearances, routes between rooms
  and floors, daylight, escape windows, minimum sizes, walkability.
- **Accounts**: Google sign-in (plus a judges' demo account); plans sync across devices with
  versions and history; a PDF design report.
- **AI agents over MCP**: `/api/mcp` with per-account tokens (read only or read + edit) from
  the MCP button in the app, the studio and Settings. Agents use the same checked operations;
  every change keeps the previous version.
- **Site**: landing with Linden Heights rising in 3D, feature pages, docs, legal, light and
  dark themes, sitemap, robots, a share image, and Clavis 404 and error pages.

## Next

Read-only share links; walkability inside Clavis Local's furnishing; walking on phones and
tablets; sliding glass doors and per-floor plan export in the studio; smaller plant and
character files. See [FULLSTACK_PLAN.md](FULLSTACK_PLAN.md).
