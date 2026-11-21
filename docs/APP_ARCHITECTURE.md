# Clavis — App Architecture

How the signed-in (and guest) side of Clavis is laid out: the routes, the four page shells,
the navigation, the workflow from the website to the studio and back, and the data behind it.
It extends the route plan in [FULLSTACK_PLAN.md](FULLSTACK_PLAN.md).

## The problem it solves

Until now every call to action on the website dropped the visitor straight into the studio.
There was no home to come back to, no way to see what you made last week, no template
gallery, no history and no profile. The studio was the whole product.

The app now has a **home base**. The website leads there, the studio is entered from there
with a clear purpose (continue, new, template, import), and the studio always leads back.

## Workflow

```
 Website (/)
   │  Start designing                       Describe a home (hero brief box)
   ▼                                              │
 Home (/dashboard) ◀────────────────┐             │
   │ Continue  │ Recent │ New        │             │
   │           │        ▼            │             │
   │           │    New plan (/new)  │             │
   │           │     1 How to start: Describe · Template · Blank · Import
   │           │     2 Details: name, brief or template, then Create
   │           ▼        │            │             │
   │     Plan (/plans/[id])          │             │
   │       drawing · facts · versions · history    │
   ▼                    ▼            │             ▼
 Studio (/studio/try?project=…) ──── brand mark / Plans ──▶ back to Home
   autosave · Save version · checkpoints every 15 min of editing
```

- **Continue** reopens the last plan you had open.
- **New** always goes through `/new`, so every plan starts with a name and a known source.
- **Templates** can be started from the gallery or from step 2 of `/new`.
- A brief typed into the website's hero still goes straight to the studio. Typing a brief is
  a clear intent, so it opens a new plan and runs the assistant.

## Routes

| Route | Shell | Page |
|---|---|---|
| `/` and the marketing pages | Site | The website. Its CTAs go to `/dashboard` or `/new`, not to the studio. |
| `/login`, `/signup`, … | Auth | Unchanged. |
| `/dashboard` | App | **Home**: continue, quick start, recent plans, recent activity, profile summary. |
| `/plans` | App | **All plans**: search, sort, star, filter by source, grid or list, rename, duplicate, export, delete. |
| `/plans/[id]` | App | **One plan**: the drawing, its facts and rooms, its versions (restore or open as a copy), its history. |
| `/new` | App | **New plan**: a two-step start, either describing a home, picking a template, a blank sheet or importing a file. |
| `/templates` | App | **Templates**: the gallery, with filters by bedrooms. Every card shows the real plan and its numbers. |
| `/history` | App | **History**: every event across all plans, grouped by day, filterable. |
| `/profile` | App | **Profile**: name, initials and colour, what you design for, your numbers, storage used. |
| `/settings` | App | Assistant, studio layout, data export and clearing (existing). |
| `/studio/try` | Studio | The workspace. It takes `?project=`, `?template=`, `?new=` and `?brief=`. |

`/studio/[projectId]` replaces `?project=` once cloud projects exist. The query form stays as
a redirect for old links.

## The four shells

1. **Site** (`(marketing)/layout.tsx`): the ruled header and the footer.
2. **Auth** (`(auth)/layout.tsx`): a single centred sheet.
3. **App** (`(app)/layout.tsx`, which renders `AppShell`):
   - a **sidebar** on wide screens: the mark, **New plan**, then *Home · Plans · Templates · History*,
     then *Profile · Settings*, and at the foot where your work is saved plus *Sign in*;
   - a **top bar**: the sheet title (breadcrumb), plan search, and **Continue in studio**;
   - below `lg` the sidebar becomes a **drawer** opened from the top bar.
4. **Studio** (`studio/try`): full-screen and dark. Its header's mark leads back to Home, and the
   New menu links to `/new` and `/templates`.

## Navigation

| Where | Items |
|---|---|
| Site header | Features ▾ · How it works · Docs · About · Your plans · Sign in · **Start designing** |
| App sidebar | **New plan** · Home · Plans · Templates · History · Profile · Settings |
| App top bar | ☰ (mobile) · sheet title · search plans · **Continue in studio** |
| Studio header | ◧ Clavis → Home · plan name · save state · New ▾ · Open · Export ▾ · Undo/Redo · layout · assistant |

Every app page has a sheet number in its title block, in the drawing-set convention the site
uses: A Home, B Plans, C New, D Templates, E History, F Profile, G Settings.

## Data

One interface, `Workspace` (`src/lib/workspace`), sits in front of all of it. Today it stores
everything in the browser. With accounts, a Supabase implementation replaces it, and the pages
do not change.

| Concept | In the browser now | In Supabase later |
|---|---|---|
| Plan document | `clavis:project:<id>`: the versioned `clavis.design` JSON | `projects.document` (jsonb) |
| Plan index | `clavis:projects`: name, rooms, area, created, updated, opened, starred, source | `projects` columns |
| Current plan | `clavis:current` | per-device, in the browser |
| Versions | `clavis:versions:<id>`: up to 20 named plus 10 automatic checkpoints | `project_versions` |
| Activity | `clavis:activity`: the newest 300 events | `activity` (user_id, project_id, kind, at, detail) |
| Profile | `clavis:profile` | `profiles` |
| Templates | code: `src/lib/catalogue.ts` | the same; templates are part of the app |

**Plan sources**: `blank`, `describe`, `template:<slug>`, `import`, `duplicate`, `restore`.
They are shown on cards and can be filtered.

**Activity kinds**: `created`, `opened`, `edited` (consecutive edits within 30 minutes fold
into one event with a change count), `renamed`, `duplicated`, `imported`, `version_saved`,
`restored`, `starred`, `deleted`, `exported`.

**Versions** are snapshots of the document, minus the tracing image, which can run to
megabytes. The studio's *Save version* names one. While you edit, an automatic checkpoint is
taken at most every 15 minutes (the first one 15 minutes after the plan was made). Restoring first checkpoints the current state, so a restore
can always be undone.

Storage problems (blocked, full, unreadable) come back as messages, never exceptions. This is
the same rule the plan library already follows.

## Templates

Floor areas are measured from the built designs:

| Template | Made by | Floor area |
|---|---|---|
| Sunset Loft (showcase) | hand | 111 m² |
| Compact two-bedroom | hand | 69 m² |
| Studio apartment | Clavis Local, from “studio apartment, 38 m2” | 44 m² |
| One-bedroom flat | Clavis Local, from “one bedroom flat with an open kitchen, 52 m2” | 47 m² |
| Family house with a study | Clavis Local, from “3 bedroom house with 2 bathrooms and a study, 120 m2” | 125 m² |
| Four-bedroom home | Clavis Local, from “4 bedroom home with separate kitchen and laundry, 150 m2” | 161 m² |
| Five-bedroom villa | Clavis Local, from “5 bedroom villa 250 sqm” | 232 m² |

Each one is tested to build with no validator errors or warnings, and to have the bedroom count
its description promises.

Templates laid out by the rule-based engine are labelled as such. None of them is the output
of a language model. The gallery is rendered on the server at build time, so its drawings and
numbers cost the visitor nothing.

## Code layout

```
src/
  app/(app)/
    layout.tsx               the app shell
    dashboard/  plans/  plans/[id]/  new/  templates/  history/  profile/  settings/
  components/app/
    AppShell.tsx         the sidebar, the drawer and the top bar
    destinations.ts      the app's destinations and sheet letters
    Home.tsx  PlansBrowser.tsx  PlanDetail.tsx  NewPlanFlow.tsx
    TemplateGallery.tsx  HistoryTimeline.tsx  ProfileForm.tsx
    PlanCard.tsx         card, thumbnail and action menu   EventRow.tsx   one line of history
    templateData.ts      template cards, built on the server   ui.tsx   shared pieces
  lib/workspace/
    types.ts       Plan, Version, ActivityEvent, Profile
    browser.ts     the browser-storage implementation (pure functions over StorageLike)
    useWorkspace.ts  a hook that re-reads on every change, in this tab or another
  lib/
    catalogue.ts      the template list (cheap to import anywhere)
    buildTemplate.ts  builds a template into a design (pulls in Clavis Local)
  model/
    library.ts     plan documents and the index (now with created/opened/starred/source)
  studio/
    projects.ts    logs created/opened/edited/… and takes checkpoints
```

## Next

1. Accounts: `Workspace` gets a Supabase implementation, local plans move into the account on
   first sign-in, and the sidebar footer shows the avatar menu.
2. `/studio/[projectId]` and `/share/[token]`.
3. Thumbnails rendered once and kept in Storage, not re-drawn on every visit.
