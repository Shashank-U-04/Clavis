/**
 * The open project: which library slot it saves to, debounced autosave, and the
 * new / open / import / duplicate actions the header and project panel call.
 */

import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { actions, logActivity, store } from "../model/store";
import { browserStorage, readDesignFile, restoreFromStorage } from "../model/persistence";
import {
  currentProjectId,
  deleteProject,
  listProjects,
  loadProject,
  migrateLegacyAutosave,
  newProjectId,
  saveProject,
  type ProjectMeta,
} from "../model/library";
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

export function saveNow(): void {
  const { model, notes } = store.getState();
  // an empty, untitled plan is not worth a library slot
  if (model.walls.length + model.rooms.length + model.items.length === 0 && model.name === emptyModel().name) return;
  const r = saveProject(storage(), projects.getState().currentId, model, notes);
  actions.setSaveStatus(r.ok ? { state: "saved", at: Date.now(), where: "browser" } : { state: "error", message: r.message });
  refresh();
}

let timer: ReturnType<typeof setTimeout> | null = null;

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
    } else actions.setRestoreError(r.message);
  }
  refresh();
  let last = store.getState().model;
  store.subscribe((st) => {
    if (st.model === last) return;
    last = st.model;
    if (timer) clearTimeout(timer);
    timer = setTimeout(saveNow, 600);
  });
  window.addEventListener("beforeunload", () => {
    if (timer) saveNow();
  });
}

function begin(model: PlanModel, notes: Note[] = [], why: string) {
  if (timer) {
    clearTimeout(timer);
    saveNow();
  }
  projects.setState({ currentId: newProjectId() });
  actions.loadModel(model, notes);
  session.setState({ previewTurnId: null });
  setUi({ welcome: false, route: null });
  logActivity("human", "new_project", why);
  saveNow();
}

export const projectActions = {
  newBlank() {
    begin(emptyModel(), [], "Started a blank project.");
    setUi({ welcome: true });
  },
  newFrom(model: PlanModel, why: string) {
    begin(model, [], why);
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
    saveNow();
  },
  async importFile(file: File) {
    const r = await readDesignFile(file);
    if (!r.ok) {
      actions.setRestoreError(`Could not open ${file.name}: ${r.message}`);
      return;
    }
    begin(r.doc.model, r.doc.notes ?? [], `Imported ${file.name}.`);
  },
  duplicate() {
    const { model, notes } = store.getState();
    begin({ ...model, name: `${model.name} (copy)` }, notes, `Duplicated "${model.name}".`);
  },
  remove(id: string) {
    deleteProject(storage(), id);
    if (id === projects.getState().currentId) projects.setState({ currentId: newProjectId() });
    refresh();
  },
};
