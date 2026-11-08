# Clavis — Full-stack Plan

Status: **approved 2026-11-08** (Vercel + Supabase). The user sets up the Supabase and Vercel
accounts after implementation, so the code reads them from environment variables and shows
“not configured” until they exist. Guest mode: yes. Sign-in: email + password, magic link and GitHub
(Google later).

## Why change the hosting suggestion

Cloudflare Pages was suggested while Clavis was a static Vite app with one server function.
Cloudflare handles that cheaply and well. A full-stack **Next.js** app is a different shape:
server rendering, route handlers, middleware and auth cookies. Next.js runs best on
**Vercel**, the company that makes it: zero configuration, preview deployments for every
pull request, and no adapter layer. Running Next.js on Cloudflare needs an adapter
(OpenNext), which adds friction.

## Stack

| Layer | Choice | Version (stable on 2026-11-08) | Why |
|---|---|---|---|
| Framework | **Next.js** (App Router) | 16.4.5 | Full-stack React: pages, server actions, route handlers and middleware in one app. Includes recent security fixes. |
| Language | **TypeScript** (strict) | 5.x | Already used throughout Clavis. |
| UI | **React** | 19.x | Required by Next 16. |
| Styling | **Tailwind CSS** | 4.x | Utility-first; design tokens live in CSS; dark mode built in. |
| Components | **shadcn/ui** (Radix primitives) + **lucide-react** icons | — | Accessible dialogs, menus, tabs and forms whose source lives in the repo. |
| Forms | **react-hook-form** + **zod** | zod 4.x | Zod already validates every Clavis operation. |
| Client state | **zustand** | 5.x | The existing store keeps working unchanged. |
| 3D | **three.js** | 0.18x | The existing renderer, loaded only on the studio page. |
| Database | **Supabase Postgres** | — | Relational data with RLS. Designs are stored as JSONB documents. SQL migrations are versioned in git. |
| Auth | **Supabase Auth** via `@supabase/ssr` | ssr 0.12.x | Email and password, magic link, GitHub sign-in (Google later). Cookie sessions work with server components and middleware. |
| File storage | **Supabase Storage** | — | Project thumbnails and tracing images (now base64 inside the document). |
| AI | Existing provider layer (Groq default) in a Next **route handler** | — | `server/assistant.ts` already takes a web Request and returns a Response, so it moves over almost unchanged. |
| Tests | **Vitest** (unit) + **@playwright/test** (e2e) | 1.65 | The 164 existing tests move over. E2E moves to Playwright's proper test runner. |
| Quality | ESLint (next config) + Prettier | — | |
| Hosting | **Vercel** (Hobby, free) | — | Preview deployment per PR; the env vars hold the secrets. |
| CI | GitHub Actions | — | Typecheck, lint, unit and e2e on every push; Vercel deploys. |

### Supabase or Firebase: Supabase

- Clavis data is relational: users → projects → versions → shares. That is Postgres's home
  ground. Firestore is a document store and would need denormalising.
- **Row Level Security** enforces “only the owner can read or write this project” inside the
  database, not just in the app code.
- Schema and policies are plain SQL migrations in git, so they are reviewable and repeatable.
- It is open source and could be self-hosted later. The free plan needs no credit card.
  Free projects pause after about a week of inactivity, which is fine for a side project.
- Firebase's free Spark plan restricts Cloud Functions, so server logic would push towards
  the paid Blaze plan, which needs a card.

### Supabase Auth or Auth.js / Clerk: Supabase Auth

It lives in the same database as the projects, so RLS policies can use `auth.uid()`
directly. It is free at this scale, and it needs no extra vendor.

## Information architecture (routes)

Public, server-rendered with SEO metadata and Open Graph images:

| Route | Page |
|---|---|
| `/` | **Landing**: hero (describe a home → plan and 3D), how it works in three steps, feature highlights, live demo embed, call to action |
| `/features` | Overview of every feature, with sections and anchors |
| `/features/ai-design` | Describe → layout, Auto mode (Clavis Local + Groq), structural edits |
| `/features/validation` | Constraint engine, review, routes, daylight, one-click repair |
| `/features/3d` | Split plan and 3D, Walk mode, exports |
| `/features/projects` | Cloud projects, versions, sharing, import/export |
| `/how-it-works` | Propose → validate → preview → apply → measure, with diagrams |
| `/docs` | Help: getting started, editor shortcuts, assistant examples, limits |
| `/about` | The story behind Clavis |
| `/privacy`, `/terms` | Legal basics |
| `/login`, `/signup`, `/forgot-password`, `/reset-password` | **Auth pages** |
| `/auth/callback` | OAuth, magic-link and email-confirmation return (route handler) |
| `/share/[token]` | Read-only shared design (plan, 3D and review) |

Signed in, protected by middleware:

| Route | Page |
|---|---|
| `/dashboard` | Project grid: thumbnails, search, new (blank / describe / template), duplicate, delete |
| `/studio/[projectId]` | The current Clavis workspace, client-only, with cloud autosave |
| `/studio/new` | Creates a project and redirects |
| `/settings` | Profile, assistant (Auto / Local / Hosted), usage, theme, delete account |

Guest mode (proposed): `/studio/try` works without an account using browser storage,
exactly as Clavis does today. Saving prompts sign-in, and local projects can be imported
into the account on first sign-in.

Navigation: a top navbar (Features ▾, How it works, Docs, About, Sign in / avatar menu) and a
footer on public pages. Signed-in pages get an app bar: logo, Dashboard, the current project
name, Settings, avatar.

## Data model (Supabase migrations)

```sql
profiles          (id uuid pk → auth.users, display_name, avatar_url, assistant_mode, created_at)
projects          (id uuid pk, owner_id → profiles, name, document jsonb, schema_version int,
                   revision int, thumbnail_path text, created_at, updated_at)
project_versions  (id, project_id → projects, label, document jsonb, created_at)   -- named snapshots
shares            (token text pk, project_id → projects, created_at, revoked_at)   -- read-only links
assistant_usage   (user_id, day date, requests int, tokens int, pk(user_id, day))  -- per-user daily cap
```

- RLS on every table: the owner can read and write their own projects. `shares` exposes one
  project read-only through a security-definer function.
- `document` is the existing versioned `clavis.design` JSON, so the same parser and
  migrations apply.
- Autosave uses an optimistic `revision` check, so a second open tab cannot silently
  overwrite newer work.
- The per-user daily cap on assistant requests protects the shared Groq free quota. Serverless
  instances share no memory, so the current in-memory rate limit cannot do this.

## Code structure

```
src/
  app/
    (marketing)/          landing, features, how-it-works, docs, about, legal — server components
    (auth)/               login, signup, forgot/reset password
    (app)/                dashboard, studio/[id], settings — behind middleware
    share/[token]/        read-only viewer
    api/assistant/route.ts    the existing provider layer
    auth/callback/route.ts
  components/
    ui/                   shadcn/ui primitives
    marketing/            hero, feature cards, navbar, footer
    studio/               current workspace UI (header, rail, panels), ported to Tailwind
  lib/
    clavis/               framework-free domain, moved as-is: model/, ai/local/, export/, three/
    supabase/             server and browser clients, middleware helper, typed queries
  middleware.ts
supabase/migrations/      SQL schema + RLS policies
tests/                    vitest (domain) + e2e (playwright)
```

The domain code (`model/`, `ai/local/`, the 3D builders) stays framework-free and moves
unchanged, with its 164 tests. Only the shell around it changes.

## Phases (each phase is several small commits, and each ends green on CI)

1. **Scaffold.** Next.js 16, TypeScript, Tailwind 4, shadcn/ui, ESLint and Vitest in this repo.
   Move the domain into `src/lib/clavis`. All unit tests pass. Remove Vite.
2. **Marketing site.** Navbar, footer, landing, features (4 pages), how it works, docs, about,
   legal. SEO metadata, sitemap, OG images. Responsive and accessible.
3. **Studio port.** `/studio/try` (guest, browser storage), the current workspace restyled
   with Tailwind. The e2e suite moves to Playwright Test and passes.
4. **Supabase and auth.** Migrations, RLS, auth pages, OAuth (GitHub first), middleware,
   profile.
5. **Cloud projects.** Dashboard, create, open and autosave with revision checks, versions,
   thumbnails to Storage, import of local projects.
6. **Assistant on the server.** Route handler, signed-in-only hosted model, per-user daily
   cap, settings page.
7. **Sharing and polish.** Read-only share links, loading and error states, empty states,
   Lighthouse, accessibility pass.
8. **Deploy.** Supabase production project + Vercel. Secrets go in Vercel env vars. Preview
   deploys per PR. Optional custom domain.

## Needed from the user (at the right phase, not now)

- **Phase 4:** a free Supabase account and project (no card). I will say exactly which
  values go in `.env.local`: the project URL and anon key are safe in the browser; the
  service-role key stays server-only and is never pasted in chat.
- **Phase 4, optional:** a GitHub OAuth app for “Sign in with GitHub”. Google sign-in needs
  a Google Cloud OAuth client and can come later.
- **Phase 8:** a free Vercel account (sign in with GitHub, no card). The Hobby plan is for
  non-commercial use; going commercial later means Vercel Pro or another host.
