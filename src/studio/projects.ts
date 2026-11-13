/**
 * The open project: which library slot it saves to, debounced autosave, and the
 * new / open / import / duplicate actions the header and project panel call.
 *
 * It also keeps the workspace's records: a plan's first save logs where it came from, later
 * saves fold into one "edited" event, opening is logged, and while a plan is edited an
 * automatic checkpoint is taken at most every CHECKPOINT_MS.
 */

import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { actions, logActivity, store } from "../model/store";
import { browserStorage, readDesignFile, restoreFromStorage } from "../model/persistence";
import {
  CURRENT_KEY,
  currentProjectId,
  deleteProject,
  listProjects,
  loadProject,
  migrateLegacyAutosave,
  newProjectId,
  saveProject,
  type PlanSource,
  type ProjectMeta,
} from "../model/library";
import { checkpoint, logEvent, markOpened, recordEdit, saveVersion, sourceText } from "../lib/workspace/browser";
import { emptyModel, type Note, type PlanModel } from "../model/types";
import { session } from "../ai/session";
import { setUi } from "./uiStore";

interface ProjectsState {
  currentId: string;
  list: ProjectMeta[];
}

export const projects = createStore<ProjectsState>(() => ({ currentId: newProjectId(), list: [] }));
export const useProjects = <T>(sel: (s: ProjectsState) => T): T => useStore(projects, sel);

const storage = () => browserStorage();
const refresh = () => projects.setState({ list: listProjects(storage()) });

/** How the plan being edited began, until its first save records it. */
let pending: { source: PlanSource; detail: string } | null = null;

export function saveNow(): void {
  const { model, notes } = store.getState();
  // an empty, untitled plan is not worth a library slot
  if (model.walls.length + model.rooms.length + model.items.length === 0 && model.name === emptyModel().name) return;
  const s = storage();
  const id = projects.getState().currentId;
  const now = Date.now();
  const first = pending;
  const r = saveProject(s, id, model, notes, now, first ? { createdAt: now, openedAt: now, source: first.source } : {});
  actions.setSaveStatus(r.ok ? { state: "saved", at: now, where: "browser" } : { state: "error", message: r.message });
  if (r.ok) {
    if (first) {
      pending = null;
      logEvent(s, { at: now, kind: first.source === "import" ? "imported" : first.source === "duplicate" ? "duplicated" : "created", planId: id, planName: model.name, detail: first.detail });
    } else {
      recordEdit(s, id, model.name, now);
      checkpoint(s, id, model, notes, now);
    }
  }
  refresh();
}

let timer: ReturnType<typeof setTimeout> | null = null;
/** The design as last loaded or saved; autosave runs only when the design moves on from it. */
let seen: PlanModel | null = null;

/** After loading a design: it is what is saved, so nothing is waiting to autosave. */
function settle() {
  seen = store.getState().model;
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Restore the last open project (or migrate the old autosave) and start autosaving. */
export function startProjects(): void {
  const s = storage();
  migrateLegacyAutosave(s);
  const legacy = restoreFromStorage(s); // reports an unreadable pre-library autosave, if any
  if (legacy.kind === "unreadable") actions.setRestoreError(legacy.message);
  const id = currentProjectId(s);
  if (id) {
    const r = loadProject(s, id);
    if (r.ok) {
      projects.setState({ currentId: id });
      // restoring is not an edit: replace the state without an undo entry
      store.setState((st) => ({ model: r.value.model, notes: r.value.notes ?? [], revision: st.revision + 1, undoStack: [], redoStack: [] }));
      setUi({ welcome: false });
      actions.setSaveStatus({ state: "saved", at: r.value.savedAt ? Date.parse(r.value.savedAt) || Date.now() : Date.now(), where: "browser" });
      markOpened(s, id);
    } else actions.setRestoreError(r.message);
  }
  refresh();
  seen = store.getState().model;
  store.subscribe((st) => {
    if (st.model === seen) return;
    seen = st.model;
    if (timer) clearTimeout(timer);
    timer = setTimeout(saveNow, 600);
  });
  window.addEventListener("beforeunload", () => {
    if (timer) saveNow();
  });
}

function begin(model: PlanModel, notes: Note[] = [], why: string, source: PlanSource, detail = `From ${sourceText(source)}`) {
  if (timer) {
    clearTimeout(timer);
    saveNow();
  }
  pending = { source, detail };
  projects.setState({ currentId: newProjectId() });
  actions.loadModel(model, notes);
  session.setState({ previewTurnId: null });
  setUi({ welcome: false, route: null });
  logActivity("human", "new_project", why);
  settle(); // loading it is not an edit
  saveNow();
}

export const projectActions = {
  newBlank(source: PlanSource = "blank") {
    begin(emptyModel(), [], "Started a blank project.", source);
    setUi({ welcome: true });
  },
  newFrom(model: PlanModel, why: string, source: PlanSource) {
    begin(model, [], why, source);
  },
  open(id: string) {
    if (id === projects.getState().currentId) return;
    if (timer) {
      clearTimeout(timer);
      saveNow();
    }
    const r = loadProject(storage(), id);
    if (!r.ok) return actions.setRestoreError(r.message);
    projects.setState({ currentId: id });
    actions.loadModel(r.value.model, r.value.notes ?? []);
    setUi({ welcome: false, route: null });
    logActivity("human", "open_project", `Opened "${r.value.model.name}".`);
    settle(); // opening it is not an edit
    try {
      storage()?.setItem(CURRENT_KEY, id);
    } catch {
      /* it simply won't reopen next time */
    }
    actions.setSaveStatus({ state: "saved", at: r.value.savedAt ? Date.parse(r.value.savedAt) || Date.now() : Date.now(), where: "browser" });
    markOpened(storage(), id);
    refresh();
  },
  async importFile(file: File) {
    const r = await readDesignFile(file);
    if (!r.ok) {
      actions.setRestoreError(`Could not open ${file.name}: ${r.message}`);
      return;
    }
    begin(r.doc.model, r.doc.notes ?? [], `Imported ${file.name}.`, "import", `From ${file.name}`);
  },
  duplicate() {
    const { model, notes } = store.getState();
    begin({ ...model, name: `${model.name} (copy)` }, notes, `Duplicated "${model.name}".`, "duplicate", `Copied from “${model.name}”`);
  },
  /** Save the design as it is now as a named version of this plan. */
  saveVersion(label: string) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    saveNow();
    const { model, notes } = store.getState();
    const r = saveVersion(storage(), projects.getState().currentId, model, notes, { label });
    if (r.ok) logActivity("human", "save_version", `Saved the version “${r.value.label}”.`);
    else actions.setRestoreError(r.message);
    return r.ok;
  },
  remove(id: string) {
    deleteProject(storage(), id);
    if (id === projects.getState().currentId) projects.setState({ currentId: newProjectId() });
    refresh();
  },
};
