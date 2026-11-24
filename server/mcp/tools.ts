/**
 * The tools Clavis offers an outside AI agent over MCP. They go through the same pipeline as
 * the studio's own assistant: every change is a list of validated design operations, applied
 * all or nothing, and the result is measured by the same checks. Nothing here guesses at
 * geometry; the agent reads exact ids and metres from `get_plan` and writes operations.
 *
 * Tokens are "read" (look only) or "edit". Edits that remove work (walls, rooms, furniture, a
 * floor, or replacing a whole layout) also need `allow_removals: true`, which an agent should
 * only set after asking the person. Every edit keeps the plan's previous state as a version.
 */

import { z } from "zod";
import { CATALOG, CATEGORIES } from "@/model/catalog";
import { applyBatch, isDestructive, OperationSchema } from "@/model/operations";
import { checkModel, diffIssues, summarizeIssues } from "@/model/issues";
import { designSummary } from "@/model/summary";
import { GROUND, levelsOf } from "@/model/levels";
import { emptyModel, type Issue, type PlanModel } from "@/model/types";
import type { ProjectMeta } from "@/model/library";
import { operationReference } from "@/ai/prompts";
import { localProposal } from "@/ai/local/engine";
import { TEMPLATES, findTemplate } from "@/lib/catalogue";
import { buildTemplate } from "@/lib/buildTemplate";
import type { TokenAccess } from "./tokens";
import type { PlanStore } from "./store";

export interface ToolContext {
  store: PlanStore;
  access: TokenAccess;
  /** the site's address, for links into the studio */
  origin: string;
}

export interface ToolResult {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface Tool<S extends z.ZodObject> {
  name: string;
  title: string;
  description: string;
  input: S;
  /** changes the person's plans */
  writes: boolean;
  /** may remove work (MCP's destructive hint) */
  destructive?: boolean;
  run(args: z.infer<S>, ctx: ToolContext): Promise<ToolResult>;
}

const tool = <S extends z.ZodObject>(t: Tool<S>) => t;

const ok = (text: string, data?: Record<string, unknown>): ToolResult => ({
  content: [{ type: "text", text: data ? `${text}\n\n${JSON.stringify(data, null, 2)}` : text }],
  ...(data && { structuredContent: data }),
});
const fail = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });

const studioLink = (ctx: ToolContext, id: string) => `${ctx.origin}/studio/try?project=${encodeURIComponent(id)}`;
const planLine = (p: ProjectMeta) => ({ id: p.id, name: p.name, rooms: p.rooms, area_m2: p.area, updated: new Date(p.updatedAt).toISOString(), ...(p.starred && { starred: true }) });

const validation = (issues: Issue[]) => ({
  counts: summarizeIssues(issues),
  issues: issues.map(({ id, severity, code, message, refs }) => ({ id, severity, code, message, refs })),
});

const counter = () => {
  let n = 0;
  const stamp = Date.now().toString(36);
  return (prefix: string) => `${prefix}_${stamp}${(n++).toString(36)}m`;
};

const PlanId = z.string().min(1).max(64).describe("The plan's id, from list_plans.");

async function loadOrFail(ctx: ToolContext, id: string) {
  const got = await ctx.store.load(id);
  return got ?? null;
}

// ----------------------------------------------------------------------------------- tools

const listPlans = tool({
  name: "list_plans",
  title: "List plans",
  description: "The signed-in person's Clavis plans, newest first: id, name, number of rooms, clear floor area and when each was last changed.",
  input: z.object({}),
  writes: false,
  async run(_args, ctx) {
    const plans = (await ctx.store.list()).map(planLine);
    return ok(plans.length ? `${plans.length} plan${plans.length === 1 ? "" : "s"}.` : "No plans yet. Make one with create_plan.", { plans });
  },
});

const getPlan = tool({
  name: "get_plan",
  title: "Read a plan",
  description:
    "One plan in full: floors, rooms (clear floor rectangles in metres), walls, doors and windows, furniture with its room, and every check result. Use the exact ids from here in apply_operations.",
  input: z.object({ plan_id: PlanId }),
  writes: false,
  async run({ plan_id }, ctx) {
    const got = await loadOrFail(ctx, plan_id);
    if (!got) return fail(`No plan with id "${plan_id}". Call list_plans for the ids.`);
    const m = got.doc.model;
    const summary = designSummary(m, 0, checkModel(m));
    const { revision: _r, ...rest } = summary;
    return ok(`“${m.name}”. Open it in the studio: ${studioLink(ctx, plan_id)}`, {
      id: plan_id,
      studio: studioLink(ctx, plan_id),
      floors: levelsOf(m).map((l) => ({ id: l.id, name: l.name, elevation_m: l.elevation, height_m: l.height })),
      ...rest,
    });
  },
});

const checkPlan = tool({
  name: "check_plan",
  title: "Check a plan",
  description:
    "Run Clavis's checks on a plan: room sizes and proportions, doors and windows, clearances around furniture, routes between rooms and floors, and rooms a person cannot walk through.",
  input: z.object({ plan_id: PlanId }),
  writes: false,
  async run({ plan_id }, ctx) {
    const got = await loadOrFail(ctx, plan_id);
    if (!got) return fail(`No plan with id "${plan_id}".`);
    const v = validation(checkModel(got.doc.model));
    const { error, warning, info } = v.counts;
    const stuck = v.issues.filter((i) => i.code === "room_not_walkable").length;
    return ok(`${error} error${error === 1 ? "" : "s"}, ${warning} warning${warning === 1 ? "" : "s"}, ${info} note${info === 1 ? "" : "s"}; ${stuck ? `${stuck} room(s) cannot be walked through` : "every room can be walked through"}.`, v);
  },
});

const describeOperations = tool({
  name: "describe_operations",
  title: "Design operations",
  description: "The design operations apply_operations accepts, with every field. Read this before your first edit.",
  input: z.object({}),
  writes: false,
  async run() {
    return ok(
      [
        "Coordinates are metres; x grows east, y grows south. A room is the clear floor rectangle inside its walls; add_room does not draw walls, add_wall does.",
        "Operations apply in order, all or nothing. Refer to something made earlier in the same list by giving it `as: \"name\"` and using \"$name\" as its id.",
        "build_layout lays out a whole plan (rooms, walls, doors) from a room list in one step; then add windows with add_opening and furniture with place_item_in_room.",
        "Furniture kinds are in list_catalog.",
        "",
        operationReference(),
      ].join("\n"),
    );
  },
});

const listCatalog = tool({
  name: "list_catalog",
  title: "Furniture library",
  description: "The furniture and building pieces Clavis knows, with their footprint (w × d) and height in metres. Use `kind` in add_item.",
  input: z.object({ category: z.enum(CATEGORIES).optional().describe("Only this group.") }),
  writes: false,
  async run({ category }) {
    const items = CATALOG.filter((c) => !category || c.category === category).map((c) => ({ kind: c.kind, label: c.label, category: c.category, w: c.w, d: c.d, h: c.h }));
    return ok(`${items.length} pieces.`, { items });
  },
});

const listTemplates = tool({
  name: "list_templates",
  title: "Templates",
  description: "The ready-made plans create_plan can start from.",
  input: z.object({}),
  writes: false,
  async run() {
    return ok(`${TEMPLATES.length} templates.`, { templates: TEMPLATES.map((t) => ({ slug: t.slug, name: t.name, about: t.blurb })) });
  },
});

const createPlan = tool({
  name: "create_plan",
  title: "Create a plan",
  description:
    "Make a new plan in the person's account: from a template (slug from list_templates), from a short brief that Clavis lays out and furnishes (for example \"3 bedrooms, 2 bathrooms, open kitchen, about 110 m2\"), or empty. It appears in their Clavis plans.",
  input: z.object({
    name: z.string().trim().min(1).max(80).optional().describe("The plan's name."),
    template: z.string().max(64).optional().describe("A template slug."),
    brief: z.string().trim().min(3).max(300).optional().describe("A one-line description of the home."),
  }),
  writes: true,
  async run({ name, template, brief }, ctx) {
    if (template && brief) return fail("Give a template or a brief, not both.");
    let model: PlanModel;
    let source: "blank" | "describe" | `template:${string}` = "blank";
    let detail = "Empty, by an agent";
    if (template) {
      const t = findTemplate(template);
      if (!t) return fail(`No template "${template}". Templates: ${TEMPLATES.map((x) => x.slug).join(", ")}.`);
      model = buildTemplate(t.slug);
      source = `template:${t.slug}`;
      detail = `From ${t.name}, by an agent`;
    } else if (brief) {
      const draft = localProposal({ mode: "design", instruction: brief, context: { design: {} } }, emptyModel());
      const out = applyBatch(emptyModel(), draft.operations, counter());
      if (!out.ok || out.model.rooms.length === 0) return fail(`Clavis could not lay out that brief (${draft.reply}). Name the rooms and a size, for example "2 bedrooms, 1 bathroom, open kitchen, 80 m2".`);
      model = out.model;
      source = "describe";
      detail = `From “${brief.slice(0, 80)}”, by an agent`;
    } else model = emptyModel();
    model = { ...model, name: name ?? (brief ? "Described home" : model.name || "Untitled plan") };
    const meta = await ctx.store.create(model, [], source, detail);
    const v = validation(checkModel(model));
    return ok(`Created “${meta.name}” (${meta.rooms} rooms, ${meta.area} m²). Studio: ${studioLink(ctx, meta.id)}`, { plan: planLine(meta), studio: studioLink(ctx, meta.id), validation: v.counts });
  },
});

const applyOperations = tool({
  name: "apply_operations",
  title: "Edit a plan",
  description:
    "Change a plan with design operations (see describe_operations). They apply in order, all or nothing; nothing is saved if one fails. The plan's previous state is kept as a version, so the person can restore it. Removing walls, rooms, furniture or a floor needs allow_removals: true; ask the person first. Use dry_run to see the result and checks without saving.",
  input: z.object({
    plan_id: PlanId,
    operations: z.array(z.record(z.string(), z.unknown())).min(1).max(200).describe('Design operations, each an object with an "op" field.'),
    floor: z.string().max(64).optional().describe("The floor id new walls, rooms and furniture go on (from get_plan). Default: the ground floor."),
    allow_removals: z.boolean().optional().describe("Allow operations that remove work. Only after the person agreed."),
    dry_run: z.boolean().optional().describe("Apply and check, but do not save."),
    note: z.string().max(120).optional().describe("A short line for the plan's history, such as what was asked."),
  }),
  writes: true,
  destructive: true,
  async run({ plan_id, operations, floor, allow_removals, dry_run, note }, ctx) {
    const got = await loadOrFail(ctx, plan_id);
    if (!got) return fail(`No plan with id "${plan_id}".`);
    const before = got.doc.model;
    if (floor && floor !== GROUND && !levelsOf(before).some((l) => l.id === floor)) return fail(`No floor "${floor}" in this plan. Floors: ${levelsOf(before).map((l) => l.id).join(", ")}.`);

    const removing = operations.flatMap((raw, i) => {
      const p = OperationSchema.safeParse(raw);
      return p.success && isDestructive(p.data, before) ? [`${i}: ${p.data.op}`] : [];
    });
    if (removing.length && !allow_removals) return fail(`These operations remove work: ${removing.join(", ")}. Ask the person, then send again with allow_removals: true.`);

    const out = applyBatch(before, operations, counter(), { level: floor });
    if (!out.ok) {
      const at = out.failedIndex !== undefined && out.failedIndex >= 0 ? `Operation ${out.failedIndex} (${out.steps.at(-1)?.op}) failed` : "The batch was refused";
      return fail(`${at}: ${out.error?.message ?? "unknown error"}. Nothing was changed.`);
    }

    const was = checkModel(before);
    const now = checkModel(out.model);
    const diff = diffIssues(was, now);
    const result = {
      steps: out.steps.map((s) => ({ op: s.op, summary: s.summary, ...(s.created && { created: s.created }), ...(s.notes?.length && { notes: s.notes }) })),
      created: out.created,
      validation: {
        before: summarizeIssues(was),
        after: summarizeIssues(now),
        resolved: diff.resolved.map((i) => i.message),
        introduced: diff.introduced.map((i) => ({ id: i.id, severity: i.severity, code: i.code, message: i.message })),
      },
    };
    if (dry_run) return ok(`Dry run: ${out.steps.length} operation(s) would apply. Nothing was saved.`, result);

    const meta = await ctx.store.update(got.meta, got.doc, out.model, got.doc.notes ?? [], note?.trim() ? `${note.trim()} (by an agent)` : `${out.steps.length} change${out.steps.length === 1 ? "" : "s"} by an agent`);
    return ok(`Saved ${out.steps.length} change(s) to “${meta.name}”. The previous state is kept in the plan's versions. Studio: ${studioLink(ctx, meta.id)}`, { plan: planLine(meta), ...result });
  },
});

// ------------------------------------------------------------------------------- registry

export const TOOLS = [listPlans, getPlan, checkPlan, describeOperations, listCatalog, listTemplates, createPlan, applyOperations] as const;

type AnyTool = (typeof TOOLS)[number];

const schemaCache = new Map<string, Record<string, unknown>>();
function inputSchema(t: AnyTool): Record<string, unknown> {
  let s = schemaCache.get(t.name);
  if (!s) {
    const { $schema: _s, ...rest } = z.toJSONSchema(t.input, { io: "input" }) as Record<string, unknown>;
    schemaCache.set(t.name, (s = rest));
  }
  return s;
}

/** The tools this token may use, as `tools/list` describes them. */
export function toolList(access: TokenAccess) {
  return TOOLS.filter((t) => access === "edit" || !t.writes).map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: inputSchema(t),
    annotations: { title: t.title, readOnlyHint: !t.writes, destructiveHint: !!t.destructive, idempotentHint: !t.writes, openWorldHint: false },
  }));
}

export type CallOutcome = { found: false } | { found: true; result: ToolResult };

export async function callTool(name: string, args: unknown, ctx: ToolContext): Promise<CallOutcome> {
  const t = TOOLS.find((x) => x.name === name) as Tool<z.ZodObject> | undefined;
  if (!t) return { found: false };
  if (t.writes && ctx.access !== "edit") return { found: true, result: fail("This token can only read. Make an edit token in Clavis (Settings → MCP) to change plans.") };
  const parsed = t.input.safeParse(args ?? {});
  if (!parsed.success) {
    const why = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    return { found: true, result: fail(`Invalid input: ${why}`) };
  }
  try {
    return { found: true, result: await t.run(parsed.data, ctx) };
  } catch (err) {
    return { found: true, result: fail(`Clavis could not finish that: ${err instanceof Error ? err.message : String(err)}`) };
  }
}
