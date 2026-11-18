# Clavis — Progress

Last updated: 2026-11-08.

## Current state

- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4. The studio is a client-only
  island at `/studio/try`; the hosted model is behind `POST /api/assistant`.
- `npm run typecheck`, `npm test` (170 unit tests), `npm run e2e` (9 browser steps) and
  `npm run build` all pass. `npm run test:live` checks the real hosted model (needs a key).
- Hosted model: Groq (`openai/gpt-oss-120b`, explanations on `openai/gpt-oss-20b`), verified
  live. The key lives in `.env.local` (git-ignored). The free tier allows 8,000 tokens a
  minute per model; a request is about 4,500 tokens, so allow ~30 s between hosted requests.

## Features

- **Design from a sentence** (Clavis Local): brief → two-band plan → furnished, validated
  layout.
- **Structural edits**: add or remove bedrooms, bathrooms, an en-suite, a study or a dining
  room; resize rooms; open or separate the kitchen.
- **Auto assistant mode**: Clavis Local first; anything it does not understand goes to the
  hosted model. A change that introduces findings can be handed straight to the
  deterministic repair (“Fix the N new findings”).
- **Constraint engine and review**: geometry, openings, furniture collisions, circulation from
  the entrance, daylight, escape windows, minimum sizes, area metrics.
- **Workspace**: plan and 3D side by side, Walk mode, inspector, project library with autosave,
  JSON / SVG / PNG / OBJ export, phone and tablet layouts.

## Website

- Landing page: a title block on the left and, on the right, the Sunset Loft building itself
  in a plan-oblique drawing (true-scale plan turned 30°): the plan is set out, walls rise,
  openings and furniture go in, and a scan band shades it. The build log's numbers are
  computed from the design at build time.
- Footer: a ruled index of links, a brief box that opens the studio, the mark drawn in depth
  and a construction-line CLAVIS wordmark that draws on when it comes into view.
- Feature pages (design by describing, the validator, plan/3D/walk, projects and export),
  how it works, docs, about, privacy and terms.
- Sign-in with Google (and a demo account for hackathon judges). Until Supabase is configured
  it reports that accounts are off. (Email sign-up, magic links and password resets were
  dropped on 2026-11-18.)
- Dashboard: projects in this browser as plan cards, with search, duplicate and delete, and
  links that open the studio on a project or start a new one (`?project=`, `?new=`, `?brief=`).
- Settings: assistant mode, studio layout, download or remove everything kept in the browser.

## Next

From [FULLSTACK_PLAN.md](FULLSTACK_PLAN.md): Supabase auth and cloud projects (once the
account exists), the hosted assistant with per-user limits, read-only sharing, deploying to
Vercel, and agent tools.
