/**
 * The single source of truth for the open design.
 *
 * Every change to the design — a drag in the plan, an inspector field, an assistant proposal —
 * goes through `dispatch`, which runs the operation pipeline (operations.ts) as one atomic
 * batch, bumps the revision and records undo history. View state (selection, tools, camera)
 * lives beside the design but is never part of its history.
 *
 * A vanilla zustand store, so non-React code (the 3D scene, the assistant workflow, tests)
 * reads and writes it directly.
 */

import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { ActivityEntry, ActorSource, Issue, Note, PlanModel, Underlay } from "./types";
import { emptyModel } from "./types";
import { checkModel, diffIssues } from "./issues";
import { applyBatch, type DesignOperation, type StepResult } from "./operations";
import { roomBlockOps } from "./blocks";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type CameraMode = "orbit" | "top" | "walk";
export type ViewMode = "2d" | "3d";
/** "block" places a ready-made room (placingKind is its block id); "place" places furniture. */
export type DrawMode = "select" | "wall" | "room" | "block" | "place" | "door" | "window";

export interface EditorState {
  view: ViewMode;
  camera: CameraMode;
  selectedWallId: string | null;
  selectedItemId: string | null;
  selectedRoomId: string | null;
  selectedOpeningId: string | null;
  drawMode: DrawMode;
  /** catalog kind being placed while drawMode is "place" */
  placingKind: string | null;
  /** first click of a wall being drawn */
  pendingWallStart: { x: number; y: number } | null;
  /** entities to emphasise in both views (the refs of a finding, the result of a change) */
  highlightIds: string[];
}

export type SaveStatus =
  | { state: "idle" }
  | { state: "saved"; at: number; where: "browser" | "file" | "cloud" }
  | { state: "error"; message: string };

export interface AppState {
  model: PlanModel;
  /** +1 on every change to the design, including undo and redo */
  revision: number;
  notes: Note[];
  activity: ActivityEntry[];
  editor: EditorState;
  undoStack: PlanModel[];
  redoStack: PlanModel[];
  lastChangeAt: number;
  save: SaveStatus;
  /** a stored design that could not be opened, reported rather than silently dropped */
  restoreError: string | null;
}

/** The outcome of one action, in the shape the UI shows. */
export interface ActionResult {
  ok: boolean;
  summary: string;
  [key: string]: unknown;
}

export interface DispatchResult {
  ok: boolean;
  revision: number;
  changedEntityIds: string[];
  /** alias → id for entities created with `as` */
  created: Record<string, string>;
  steps: StepResult[];
  /** findings for the resulting design (or the unchanged one when the batch failed) */
  issues: Issue[];
  error?: { code: string; message: string; index?: number };
  summary: string;
}

export interface PreviewResult {
  ok: boolean;
  /** the revision this dry run was computed against */
  baseRevision: number;
  model: PlanModel;
  steps: StepResult[];
  changedEntityIds: string[];
  error?: { code: string; message: string; index?: number };
  issuesBefore: Issue[];
  issuesAfter: Issue[];
  diff: ReturnType<typeof diffIssues>;
}

const noSelection = { selectedWallId: null, selectedItemId: null, selectedRoomId: null, selectedOpeningId: null };

const startEditor = (): EditorState => ({
  view: "2d",
  camera: "orbit",
  ...noSelection,
  drawMode: "select",
  placingKind: null,
  pendingWallStart: null,
  highlightIds: [],
});

export const store = createStore<AppState>(() => ({
  model: emptyModel(),
  revision: 0,
  notes: [],
  activity: [],
  editor: startEditor(),
  undoStack: [],
  redoStack: [],
  lastChangeAt: Date.now(),
  save: { state: "idle" },
  restoreError: null,
}));

export const useAppStore = <T>(selector: (s: AppState) => T): T => useStore(store, selector);
let counter = 0;
/** Unique, sortable-enough ids: prefix + time + a counter. */
export const uid = (prefix: string): string => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36).padStart(2, "0")}`;

// ---------------------------------------------------------------------------
// Validation, cached per design (designs are immutable values)
// ---------------------------------------------------------------------------

const findingsCache = new WeakMap<PlanModel, Issue[]>();
export function issuesFor(model: PlanModel): Issue[] {
  let found = findingsCache.get(model);
  if (!found) findingsCache.set(model, (found = checkModel(model)));
  return found;
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

const ACTIVITY_LIMIT = 200;

export function logActivity(source: ActorSource, tool: string, summary: string, ok = true) {
  const entry: ActivityEntry = { id: uid("act"), at: Date.now(), source, tool, summary, ok };
  store.setState((s) => ({ activity: [...s.activity, entry].slice(-ACTIVITY_LIMIT) }));
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

const HISTORY_LIMIT = 100;
const pushBounded = (stack: PlanModel[], m: PlanModel) => [...stack, m].slice(-HISTORY_LIMIT);

/** While a drag is in progress this holds the design from before it began. */
let dragOrigin: PlanModel | null = null;

/** Replace the design. `remember` puts the previous design on the undo stack. */
function setModel(model: PlanModel, remember: boolean) {
  store.setState((s) => ({
    model,
    revision: s.revision + 1,
    lastChangeAt: Date.now(),
    ...(remember ? { undoStack: pushBounded(s.undoStack, s.model), redoStack: [] } : {}),
  }));
}

/** Start a continuous edit (a drag). Everything until endGesture() is one undo step. */
export function beginGesture() {
  dragOrigin = store.getState().model;
}

export function endGesture() {
  const origin = dragOrigin;
  dragOrigin = null;
  if (origin && store.getState().model !== origin) {
    store.setState((s) => ({ undoStack: pushBounded(s.undoStack, origin), redoStack: [] }));
  }
}

/** Drop selections whose entity no longer exists (after undo, redo or loading). */
function forgetMissingSelection() {
  const { model, editor } = store.getState();
  const exists = (list: { id: string }[], id: string | null) => id === null || list.some((e) => e.id === id);
  const fine =
    exists(model.walls, editor.selectedWallId) &&
    exists(model.items, editor.selectedItemId) &&
    exists(model.rooms, editor.selectedRoomId) &&
    exists(model.openings, editor.selectedOpeningId);
  if (!fine) store.setState((s) => ({ editor: { ...s.editor, ...noSelection } }));
}

function travel(from: "undoStack" | "redoStack"): ActionResult {
  const s = store.getState();
  const stack = s[from];
  if (stack.length === 0) return { ok: false, summary: from === "undoStack" ? "Nothing to undo." : "Nothing to redo." };
  const target = stack[stack.length - 1];
  const to = from === "undoStack" ? "redoStack" : "undoStack";
  store.setState({
    [from]: stack.slice(0, -1),
    [to]: [...s[to], s.model],
    model: target,
    revision: s.revision + 1,
    lastChangeAt: Date.now(),
  } as Partial<AppState>);
  forgetMissingSelection();
  return { ok: true, summary: from === "undoStack" ? "Undone." : "Redone." };
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

const errorOf = (o: { error?: { code: string; message: string }; failedIndex?: number }) =>
  o.error ? { code: o.error.code, message: o.error.message, index: o.failedIndex } : undefined;

/** Validate and apply operations atomically: all of them, or none. */
export function dispatch(ops: DesignOperation[] | unknown[]): DispatchResult {
  const { model: before, revision } = store.getState();
  const out = applyBatch(before, ops, uid);
  if (!out.ok) {
    return { ok: false, revision, changedEntityIds: [], created: {}, steps: out.steps, issues: issuesFor(before), error: errorOf(out), summary: out.error?.message ?? "Rejected." };
  }
  setModel(out.model, dragOrigin === null);
  return {
    ok: true,
    revision: store.getState().revision,
    changedEntityIds: out.changed,
    created: out.created,
    steps: out.steps,
    issues: issuesFor(out.model),
    summary: out.steps.map((s) => s.summary).join(" "),
  };
}

/** Dry run: what these operations would do to the current design. Changes nothing. */
export function preview(ops: unknown[]): PreviewResult {
  const { model, revision } = store.getState();
  const out = applyBatch(model, ops, uid);
  const issuesBefore = issuesFor(model);
  const issuesAfter = out.ok ? issuesFor(out.model) : issuesBefore;
  return {
    ok: out.ok,
    baseRevision: revision,
    model: out.model,
    steps: out.steps,
    changedEntityIds: out.changed,
    error: errorOf(out),
    issuesBefore,
    issuesAfter,
    diff: diffIssues(issuesBefore, issuesAfter),
  };
}

/** Apply a previewed result, provided nothing changed since it was computed. */
export function commitPreview(p: PreviewResult): DispatchResult {
  const s = store.getState();
  const refuse = (message: string): DispatchResult => ({
    ok: false,
    revision: s.revision,
    changedEntityIds: [],
    created: {},
    steps: p.steps,
    issues: issuesFor(s.model),
    error: { code: "stale_preview", message },
    summary: message,
  });
  if (!p.ok) return refuse("This proposal failed validation and cannot be applied.");
  if (s.revision !== p.baseRevision) return refuse("The design changed after this proposal was checked. Review it again before applying.");
  setModel(p.model, true);
  return {
    ok: true,
    revision: store.getState().revision,
    changedEntityIds: p.changedEntityIds,
    created: {},
    steps: p.steps,
    issues: issuesFor(p.model),
    summary: p.steps.map((x) => x.summary).join(" "),
  };
}

/** One operation, reported the way the editor and inspector show results. */
function apply(op: DesignOperation): ActionResult {
  const r = dispatch([op]);
  const last = r.steps.at(-1);
  const notes = last?.notes?.length ? ` ${last.notes.join(" ")}` : "";
  return { ok: r.ok, summary: r.ok ? `${last?.summary ?? ""}${notes}` : r.summary, id: last?.created, revision: r.revision, changedEntityIds: r.changedEntityIds };
}

const editor = (patch: Partial<EditorState>) => store.setState((s) => ({ editor: { ...s.editor, ...patch } }));
type Finish = "oak" | "tile" | "carpet" | "concrete";

// ---------------------------------------------------------------------------
// Actions used by the editor, inspector, 3D view and project controller
// ---------------------------------------------------------------------------

export const actions = {
  // walls
  addWall: (ax: number, ay: number, bx: number, by: number, thickness = 0.15, height = 2.7, precise = false) =>
    apply({ op: "add_wall", ax, ay, bx, by, thickness, height, ...(precise && { precise: true }) }),
  editWall: (id: string, patch: { ax?: number; ay?: number; bx?: number; by?: number; thickness?: number; height?: number }) => apply({ op: "update_wall", id, ...patch }),
  removeWall: (id: string) => apply({ op: "remove_wall", id }),

  // doors and windows
  addOpening: (kind: "door" | "window", wallId: string, t: number, width?: number, sill?: number, height?: number, swing?: { hinge?: "a" | "b"; side?: "left" | "right" }) =>
    apply({ op: "add_opening", kind, wallId, t, width, sill: kind === "window" ? sill : undefined, height, ...swing }),
  editOpening: (id: string, patch: { t?: number; offset?: number; width?: number; height?: number; sill?: number }) => apply({ op: "update_opening", id, ...patch }),
  setDoorSwing: (id: string, hinge?: "a" | "b", side?: "left" | "right") => apply({ op: "update_opening", id, hinge, side }),
  removeOpening: (id: string) => apply({ op: "remove_opening", id }),

  // rooms
  addRoom: (x: number, y: number, w: number, h: number, label: string, floor: Finish = "oak") => apply({ op: "add_room", x, y, w, h, label, floor }),
  /** A room with walls round it, sharing walls already on its sides; one undo step. */
  addRoomBlock(x: number, y: number, w: number, h: number, label: string, floor: Finish = "oak"): ActionResult {
    const r = dispatch(roomBlockOps(store.getState().model, { x, y, w, h }, label, floor));
    const walls = r.steps.filter((s) => s.created?.startsWith("wall")).length;
    const id = r.steps.find((s) => s.created?.startsWith("room"))?.created;
    const summary = r.ok ? `Added ${label} (${w} × ${h} m) with ${walls === 0 ? "no new walls" : `${walls} new wall${walls === 1 ? "" : "s"}`}.` : r.summary;
    if (r.ok && id) editor({ selectedRoomId: id, selectedItemId: null, selectedWallId: null, selectedOpeningId: null });
    return { ok: r.ok, summary, id, revision: r.revision, changedEntityIds: r.changedEntityIds };
  },
  updateRoom: (id: string, patch: { x?: number; y?: number; w?: number; h?: number; label?: string; floor?: Finish }) => apply({ op: "update_room", id, ...patch }),
  removeRoom: (id: string) => apply({ op: "remove_room", id }),

  // furniture
  placeItem: (kind: string, x: number, y: number, rotation = 0) => apply({ op: "place_item", kind, x, y, rotation }),
  moveItem: (id: string, x?: number, y?: number, rotation?: number) => apply({ op: "move_item", id, x, y, rotation }),
  resizeItem: (id: string, size: { w?: number; d?: number; h?: number; reset?: boolean }) => apply({ op: "resize_item", id, ...size }),
  removeItem: (id: string) => apply({ op: "remove_item", id }),

  // the design as a whole
  setPlanName: (name: string) => apply({ op: "rename_plan", name }),
  /** Replace the design (new, open, template). Undoable. */
  loadModel(model: PlanModel, notes: Note[] = []) {
    setModel(model, true);
    store.setState((s) => ({ notes, editor: { ...s.editor, ...noSelection, highlightIds: [] } }));
  },
  /** The tracing image is reference material, not design history. */
  setUnderlay(underlay: Underlay | null) {
    store.setState((s) => ({ model: { ...s.model, underlay }, revision: s.revision + 1, lastChangeAt: Date.now() }));
  },
  leaveNote(text: string): ActionResult {
    const note: Note = { id: uid("note"), author: "human", text: text.slice(0, 4000), at: Date.now() };
    store.setState((s) => ({ notes: [...s.notes, note] }));
    return { ok: true, summary: "Note added.", id: note.id };
  },

  undo: () => travel("undoStack"),
  redo: () => travel("redoStack"),

  // view
  setView: (view: ViewMode) => editor({ view }),
  setCamera(mode: CameraMode): ActionResult {
    editor({ view: "3d", camera: mode });
    return { ok: true, summary: `Camera: ${mode}.` };
  },
  setDrawMode: (drawMode: DrawMode, placingKind: string | null = null) => editor({ drawMode, placingKind, pendingWallStart: null }),
  setPendingWallStart: (pendingWallStart: { x: number; y: number } | null) => editor({ pendingWallStart }),
  setHighlight: (highlightIds: string[]) => editor({ highlightIds }),

  // selection: one entity at a time
  selectWall: (id: string | null) => editor({ ...noSelection, selectedWallId: id }),
  selectItem: (id: string | null) => editor({ ...noSelection, selectedItemId: id }),
  selectRoom: (id: string | null) => editor({ ...noSelection, selectedRoomId: id }),
  selectOpening: (id: string | null) => editor({ ...noSelection, selectedOpeningId: id }),
  /** Select whatever kind of entity an id belongs to (null clears the selection). */
  selectEntity(id: string | null) {
    const m = store.getState().model;
    if (!id) return editor({ ...noSelection });
    if (m.walls.some((e) => e.id === id)) return actions.selectWall(id);
    if (m.items.some((e) => e.id === id)) return actions.selectItem(id);
    if (m.rooms.some((e) => e.id === id)) return actions.selectRoom(id);
    if (m.openings.some((e) => e.id === id)) return actions.selectOpening(id);
  },

  // persistence status
  setSaveStatus: (save: SaveStatus) => store.setState({ save }),
  setRestoreError: (restoreError: string | null) => store.setState({ restoreError }),
};

export { checkModel };
