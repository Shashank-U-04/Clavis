/** Workspace shell: header · tools and catalog · plan | 3D · assistant / review / inspect / project · activity. */

import { useEffect } from "react";
import { actions, issuesFor, store, useAppStore, type CameraMode } from "../model/store";
import { analyzeModel } from "../model/analysis";
import { Editor } from "../editor/Editor";
import { Scene3D } from "../three/Scene3D";
import { Header } from "./Header";
import { LeftRail } from "./LeftRail";
import { ActivityFeed } from "./ActivityFeed";
import { Welcome } from "./Welcome";
import { AssistantPanel } from "./panels/AssistantPanel";
import { ReviewPanel, routePoints } from "./panels/ReviewPanel";
import { InspectorPanel } from "./panels/InspectorPanel";
import { ProjectPanel } from "./panels/ProjectPanel";
import { setUi, ui, useUi, type RightTab } from "./uiStore";
import { useSession } from "../ai/session";

const TABS: { id: RightTab; label: string }[] = [
  { id: "assistant", label: "Assistant" },
  { id: "review", label: "Review" },
  { id: "inspect", label: "Inspect" },
  { id: "project", label: "Project" },
];

const CAMERAS: { mode: CameraMode; label: string; tip?: string }[] = [
  { mode: "orbit", label: "Orbit" },
  { mode: "top", label: "Top" },
  { mode: "walk", label: "Walk", tip: "Walk through at eye height (WASD)" },
];

function CameraBar() {
  const current = useAppStore((s) => s.editor.camera);
  return (
    <div className="cam-bar" role="group" aria-label="3D camera">
      {CAMERAS.map((c) => (
        <button key={c.mode} className={current === c.mode ? "active" : ""} title={c.tip} onClick={() => actions.setCamera(c.mode)}>
          {c.label}
        </button>
      ))}
    </div>
  );
}

function useGlobalKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const st = store.getState();
      if (st.editor.camera === "walk" && ui.getState().layout !== "plan") return; // WASD belongs to the walker
      if (st.editor.selectedItemId && (e.key === "r" || e.key === "R")) return;
      const modes: Record<string, "select" | "wall" | "room" | "door" | "window"> = { v: "select", w: "wall", m: "room", d: "door", n: "window" };
      const m = modes[e.key.toLowerCase()];
      if (m) actions.setDrawMode(m);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** Keep derived view state honest when the design changes underneath it. */
function useDerivedSync() {
  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.model !== prev.model) {
          const r = ui.getState().route;
          if (r) {
            const pts = routePoints(s.model, analyzeModel(s.model), r.roomId);
            setUi({ route: pts.length > 1 ? { roomId: r.roomId, points: pts } : null });
          }
          if (s.model.walls.length + s.model.rooms.length > 0 && ui.getState().welcome) setUi({ welcome: false });
        }
        // selecting something on the plan opens the inspector when the project tab is in the way
        const sel = (e: typeof s.editor) => e.selectedItemId ?? e.selectedOpeningId ?? e.selectedWallId ?? e.selectedRoomId;
        if (sel(s.editor) && sel(s.editor) !== sel(prev.editor) && ui.getState().rightTab === "project") setUi({ rightTab: "inspect" });
      }),
    [],
  );
}

export function App() {
  const layout = useUi((s) => s.layout);
  const tab = useUi((s) => s.rightTab);
  const welcome = useUi((s) => s.welcome);
  const feedOpen = useUi((s) => s.feedOpen);
  const model = useAppStore((s) => s.model);
  const restoreError = useAppStore((s) => s.restoreError);
  const drawing = useAppStore((s) => s.editor.drawMode !== "select");
  const busy = useSession((s) => s.busy);
  const empty = model.walls.length + model.rooms.length + model.items.length === 0;
  const issueCount = issuesFor(model).filter((i) => i.severity !== "info").length;
  useGlobalKeys();
  useDerivedSync();

  // the 3D view's camera modes need view = "3d"; keep that in sync with the layout
  useEffect(() => actions.setView(layout === "plan" ? "2d" : "3d"), [layout]);

  return (
    <div className={`app layout-${layout}`}>
      <Header />
      {restoreError && (
        <div className="banner err" role="alert">
          {restoreError}
          <button className="link" onClick={() => actions.setRestoreError(null)}>
            Dismiss
          </button>
        </div>
      )}
      <div className="work">
        <LeftRail />
        <main className="stage">
          <section className="pane plan-pane" aria-label="Plan">
            <Editor />
            {empty && welcome && !drawing && <Welcome />}
          </section>
          <section className="pane scene-pane" aria-label="3D view">
            <Scene3D />
            <CameraBar />
          </section>
        </main>
        <aside className="side">
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setUi({ rightTab: t.id })}>
                {t.label}
                {t.id === "review" && issueCount > 0 && <span className="badge">{issueCount}</span>}
                {t.id === "assistant" && busy && <span className="badge busy">…</span>}
              </button>
            ))}
          </nav>
          <div className="tab-body">
            {tab === "assistant" && <AssistantPanel />}
            {tab === "review" && <ReviewPanel />}
            {tab === "inspect" && <InspectorPanel />}
            {tab === "project" && <ProjectPanel />}
          </div>
        </aside>
      </div>
      <footer className={`feed ${feedOpen ? "open" : ""}`}>
        <button className="feed-toggle" onClick={() => setUi({ feedOpen: !feedOpen })}>
          {feedOpen ? "▾" : "▸"} Activity
        </button>
        {feedOpen && <ActivityFeed />}
      </footer>
    </div>
  );
}
