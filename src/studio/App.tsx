/**
 * Workspace shell: one bar across the top; below it the tool strip, the furniture drawer when
 * it is open, then whichever of plan, 3D and the side panel (chat · review · details ·
 * project) are switched on, and the activity log at the foot.
 *
 * Hidden views stay mounted, so the 3D scene and the conversation keep their state.
 */

import { useEffect, useRef, useState } from "react";
import { actions, issuesFor, store, useAppStore } from "../model/store";
import { analyzeModel } from "../model/analysis";
import { Editor } from "../editor/Editor";
import { Scene3D } from "../three/Scene3D";
import { Header, viewKey } from "./Header";
import { Library, ToolStrip } from "./ToolStrip";
import { ActivityFeed } from "./ActivityFeed";
import { Welcome } from "./Welcome";
import { BuildGuide } from "./BuildGuide";
import { AssistantPanel } from "./panels/AssistantPanel";
import { ReviewPanel, routePoints } from "./panels/ReviewPanel";
import { InspectorPanel } from "./panels/InspectorPanel";
import { ProjectPanel } from "./panels/ProjectPanel";
import { featureActions, setUi, ui, useResolvedTheme, useUi, type RightTab } from "./uiStore";
import { useSession } from "../ai/session";

const TABS: { id: RightTab; label: string }[] = [
  { id: "assistant", label: "Chat" },
  { id: "review", label: "Review" },
  { id: "inspect", label: "Details" },
  { id: "project", label: "Project" },
];

/** The 3D model's cameras, and the way into the walk. */
function CameraBar() {
  const current = useAppStore((s) => s.editor.camera);
  if (current === "walk") return null;
  return (
    <div className="cam-bar" role="group" aria-label="3D model camera">
      <button className={current === "orbit" ? "active" : ""} onClick={() => actions.setCamera("orbit")} title="Circle the home and zoom in">
        Orbit
      </button>
      <button className={current === "top" ? "active" : ""} onClick={() => actions.setCamera("top")} title="Straight down, north up">
        Top
      </button>
      <button className="walk-in" onClick={() => featureActions.toggle("walk")} title="Step in at the front door, at eye height (3)">
        Walk in →
      </button>
    </div>
  );
}

/** While walking: how to move, full screen for a closer look, and the way out. */
function WalkHud({ pane }: { pane: React.RefObject<HTMLElement | null> }) {
  const walking = useAppStore((s) => s.editor.camera === "walk");
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === pane.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, [pane]);
  useEffect(() => {
    if (!walking) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !document.fullscreenElement && featureActions.exitWalk();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [walking]);
  if (!walking) return null;
  const toggleFull = () => (document.fullscreenElement ? void document.exitFullscreen() : void pane.current?.requestFullscreen?.());
  return (
    <div className="walk-hud" role="group" aria-label="Walk">
      <div className="walk-text">
        <span className="walk-title">Walking · eye height 1.60 m</span>
        <span className="walk-keys">
          <kbd>W A S D</kbd> move · <kbd>drag</kbd> look · <kbd>click</kbd> a door
        </span>
      </div>
      <button onClick={toggleFull}>{full ? "Exit full screen" : "Full screen"}</button>
      <button className="primary" onClick={() => (document.fullscreenElement && void document.exitFullscreen(), featureActions.exitWalk())} title="Back to the 3D model (Esc)">
        Exit walk
      </button>
    </div>
  );
}

/** A small caption in the corner of a view, so it is always clear which one you are in. */
const PaneLabel = ({ children }: { children: string }) => (
  <span className="pane-label" aria-hidden="true">
    {children}
  </span>
);

function useGlobalKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const st = store.getState();
      const views = ui.getState().views;
      if (st.editor.camera === "walk" && views.scene) {
        if (/^[wasd]$/i.test(e.key)) return; // WASD belongs to the walker
      }
      // while drawing a wall, digits are its length (see Editor), not the view keys
      if (st.editor.drawMode === "wall" && st.editor.pendingWallStart && /^[0-9.]$/.test(e.key)) return;
      if (viewKey(e.key)) return;
      if (st.editor.selectedItemId && (e.key === "r" || e.key === "R")) return;
      const modes: Record<string, "select" | "wall" | "room" | "door" | "window"> = { v: "select", w: "wall", m: "room", d: "door", n: "window" };
      const m = modes[e.key.toLowerCase()];
      if (m) {
        if (m !== "select" && !views.plan) setUi({ views: { ...views, plan: true } });
        actions.setDrawMode(m);
      }
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
        // selecting something opens its details when the project tab is in the way
        const sel = (e: typeof s.editor) => e.selectedItemId ?? e.selectedOpeningId ?? e.selectedWallId ?? e.selectedRoomId;
        if (sel(s.editor) && sel(s.editor) !== sel(prev.editor) && ui.getState().rightTab === "project" && ui.getState().views.side) setUi({ rightTab: "inspect" });
      }),
    [],
  );
}

export function App() {
  const views = useUi((s) => s.views);
  const theme = useResolvedTheme();
  const scenePane = useRef<HTMLElement>(null);
  const library = useUi((s) => s.library);
  const guide = useUi((s) => s.guide);
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

  // the 3D camera modes need view = "3d" while the 3D view is on screen
  useEffect(() => actions.setView(views.scene ? "3d" : "2d"), [views.scene]);

  const stage = views.plan || views.scene;
  const cls = [
    "app",
    views.plan ? "" : "no-plan",
    views.scene ? "" : "no-scene",
    views.side ? "" : "no-side",
    stage ? "" : "chat-only",
    library && stage ? "lib-open" : "",
  ].join(" ");

  return (
    <div className={cls}>
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
        <ToolStrip />
        {library && stage && <Library />}
        <main className="stage" aria-hidden={!stage || undefined}>
          <section className="pane plan-pane" aria-label="Plan" aria-hidden={!views.plan || undefined}>
            <Editor />
            <PaneLabel>Plan</PaneLabel>
            {guide && !(empty && welcome && !drawing) && <BuildGuide />}
          </section>
          <section ref={scenePane} className="pane scene-pane" aria-label="3D view" aria-hidden={!views.scene || undefined}>
            <Scene3D theme={theme} />
            <CameraBar />
            <WalkHud pane={scenePane} />
          </section>
          {empty && welcome && !drawing && <Welcome />}
        </main>
        <aside className="side" aria-hidden={!views.side || undefined}>
          <nav className="tabs" role="tablist" aria-label="Panel">
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
        <button className="feed-toggle" onClick={() => setUi({ feedOpen: !feedOpen })} aria-expanded={feedOpen}>
          {feedOpen ? "▾" : "▸"} Activity
        </button>
        {feedOpen && <ActivityFeed />}
      </footer>
    </div>
  );
}
