# Clavis

**Describe a home. Clavis lays it out in metres, checks it, and lets you walk through it.**

Type “a three-bedroom house with two bathrooms and a study, 120 m²”. Clavis proposes a plan
with walls, doors, windows and furniture. A deterministic validator checks the proposal
before you see it, it is previewed on the plan, and nothing changes until you press
**Apply**. Then you can edit it by hand or in words, review daylight and circulation, and
walk through it in 3D from the front door.

The design studio runs in your browser at `/studio/try`. You need no account and no API key:
projects are saved in the browser as you work. Around it is a website: a landing page,
feature pages, how it works, docs, a projects dashboard, settings and sign-in pages (accounts
switch on once Supabase is configured).

## What it does

- **Design from a sentence.** Bedrooms, bathrooms, en-suite, open or separate kitchen,
  dining, study, utility and a target area become a two-band plan. Bedrooms sit along one
  side, living spaces along the other, and a hall joins them. Every room is reachable by
  construction.
- **Furnish rooms automatically.** Each room type has a recipe: bed with nightstands, a
  sofa facing a TV, a table set with chairs, and so on. A piece is kept only if the validator
  finds no collision, blocked door or window, or protrusion.
- **Edit in words or by hand.** Add, move or remove furniture, add doors and windows,
  add or remove bedrooms, bathrooms or a study, make rooms bigger or smaller, open or
  separate the kitchen,
  change floors and rename rooms.
- **Build it yourself.** Ready-made rooms (bedroom, kitchen, bathroom, hall and more) arrive
  with their walls, snap flush to their neighbours and share walls with them; then doors,
  windows and one-click furnishing, with a guide that ticks off each step. Or draw walls,
  rooms, doors and windows directly, with a 5 cm snap.
- **Describe it with buttons.** Bedrooms, bathrooms, kitchen and size as counters and
  switches, read back exactly as Clavis Local will lay them out, or typed in your own words.
- **Validate everything.** The constraint engine checks:
  - walls: short, loose, crossing or overlapping;
  - openings: orphaned, overflowing or overlapping;
  - rooms: overlapping, without a door, without a window, unreachable from the entrance or
    undersized;
  - bedrooms: no escape window;
  - glazing: low daylight ratio;
  - furniture: through walls, overlapping, blocking a door or window, or outside any room.

  Findings have stable ids.
- **Repair by search.** “Fix all issues” tries candidate moves and additions on a copy of the
  design. It keeps an edit only if it clears its finding without creating another, and it
  reports what needs a human decision.
- **Review.** See clear floor area, envelope, efficiency, room counts, daylight per room,
  and the route from the entrance to any room drawn on the plan.
- **2D plan, 3D model, walk and chat.** Four buttons in the studio's bar show them in any
  mix, side by side or one at a time. The 3D model updates in place as you edit (orbit or
  top view); Walk steps in at the front door at eye height, with collision, doors that
  open and a full-screen option.
- **Projects.** A library of projects in this browser with autosave. Files can be
  exported as `.json`, a printable `.svg` plan drawing, a 3D `.png` snapshot or a 3D `.obj`.

## The assistant

| Mode | What it does | Needs |
|---|---|---|
| **Auto** (default) | Clavis Local answers first. Anything it does not understand goes to the hosted model, if the server has one. | Nothing (a key adds the fallback) |
| **Clavis Local** | A rule-based design engine in the browser (`src/ai/local/`). It understands a bounded set of requests and says so when it does not. | Nothing |
| **Hosted model** | A language model behind `POST /api/assistant` (`server/providers.ts`): Groq by default, the Meta Model API, or any OpenAI-compatible server such as Ollama. | `MODEL_API_KEY` on the server, never in the browser |

To turn on the hosted model with Groq, which has a free developer tier:

1. Go to console.groq.com → **API Keys** → **Create API Key**.
2. Create `.env.local` in the project folder with `MODEL_API_KEY=<your key>`. The file is
   git-ignored.
3. Restart `npm run dev`. The Project tab then shows “Hosted model available: Groq”.

See [.env.example](.env.example) for the other providers.

Both return the same proposal format and go through the same workflow:
propose → dry-run by the validator → preview → you apply → the outcome is measured.
The assistant never applies anything itself and never decides whether a fix worked.

## AI agents (MCP)

Clavis is also an MCP server, so an AI agent you already use can design in it. In the app,
open **MCP** (top right, also in the studio and in Settings), make a token, and paste the
config it shows into the agent's MCP settings:

```json
{
  "mcpServers": {
    "clavis": {
      "type": "http",
      "url": "https://<your Clavis>/api/mcp",
      "headers": { "Authorization": "Bearer clv_…" }
    }
  }
}
```

`POST /api/mcp` speaks JSON-RPC over streamable HTTP (`server/mcp/`). Tools: `list_plans`,
`get_plan`, `check_plan`, `create_plan` (template, one-line brief or empty),
`apply_operations` (the studio's validated operations, all or nothing, with `dry_run`),
`describe_operations`, `list_catalog`, `list_templates`.

- Tokens are per account, read only or read + edit, up to five, revocable. Only a SHA-256
  hash is stored (in the account's app metadata, which only the server writes).
- Removing work needs `allow_removals: true`; agents are told to ask first.
- Every saved edit keeps the plan's previous state as a version and adds a history line; the
  browser's sync brings the change into the app and studio.

## Run it

```bash
npm ci
npm run dev        # http://localhost:5199
```

| Command | What it checks |
|---|---|
| `npm run typecheck` | TypeScript, strict |
| `npm test` | 170 unit tests: geometry, constraint engine, analysis, operations, layout builder, local engine, library, export, workflow, server adapter, landing figures |
| `npm run e2e` | Browser smoke test of the whole workflow (needs Chromium or Chrome) |
| `npm run build` | Next.js production build in `.next/` |

## How it is built

| Area | Where |
|---|---|
| Domain model, operation pipeline, undo/redo, revisions | `src/model/operations.ts`, `src/model/store.ts` |
| Constraint engine | `src/model/issues.ts` |
| Circulation, habitability, area metrics | `src/model/analysis.ts` |
| Layout builder (room program → walls and openings) | `src/model/layout.ts` |
| Clavis Local: brief parser, band solver, furnishing, repair, intents | `src/ai/local/` |
| Assistant workflow and contract | `src/ai/workflow.ts`, `src/ai/contract.ts`, `src/ai/session.ts` |
| 2D plan editor | `src/editor/Editor.tsx` |
| 3D view | `src/three/` |
| Studio workspace UI | `src/studio/` |
| Project library and autosave | `src/model/library.ts`, `src/studio/projects.ts` |
| Website pages (landing, features, docs, legal) | `src/app/(marketing)/`, `src/components/site/` |
| Dashboard and settings | `src/app/(app)/`, `src/components/app/` |
| Sign-in pages and auth helpers | `src/app/(auth)/`, `src/components/auth/`, `src/lib/auth/` |
| Landing-page isometric figure | `src/components/figures/` |
| Hosted-model route | `src/app/api/assistant/route.ts`, `server/` |

Units are metres throughout. The plan's x axis points east and y points south.

## Limits

Clavis is a concept-design tool. It handles single storeys with rectangular rooms; structural
edits regenerate the layout (you review it first) rather than moving individual walls. Its sizes,
daylight targets and escape-window checks are early-design rules of thumb, not a
building-code review. Furniture sizes are nominal. Nothing it produces is a construction
document.

## License

MIT. See [LICENSE](LICENSE).
