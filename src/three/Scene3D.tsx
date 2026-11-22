/** The 3D pane: mounts a Viewer and keeps it in step with the store. */

import { useEffect, useRef, useState } from "react";
import { actions, logActivity, store, useAppStore } from "../model/store";
import { catalogByKind } from "../model/catalog";
import { downloadText, safeName } from "../export/planSvg";
import { onCommand } from "./events";
import { Viewer, type SceneTheme } from "./viewer";

const HINTS = {
  orbit: "Drag to orbit · scroll to zoom · click furniture to select, doors to open",
  top: "Seen from above, north up · drag to pan · click furniture to select",
  walk: "WASD to walk · drag to turn the camera · scroll in for first person · E or click opens a door",
};

export function Scene3D({ theme = "light" }: { theme?: SceneTheme }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const themeRef = useRef(theme);
  const [failed, setFailed] = useState<string | null>(null);
  const camera = useAppStore((s) => s.editor.camera);
  const placingKind = useAppStore((s) => (s.editor.drawMode === "place" ? s.editor.placingKind : null));
  const empty = useAppStore((s) => s.model.walls.length + s.model.items.length === 0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let viewer: Viewer;
    try {
      viewer = new Viewer(mount, {
        onPick: (id) => actions.selectItem(id),
        placing: () => store.getState().editor.drawMode === "place" && !!store.getState().editor.placingKind,
        onFloor: (x, y) => {
          const kind = store.getState().editor.placingKind;
          if (!kind) return;
          const r = actions.placeItem(kind, x, y, 0);
          logActivity("human", "place_item", r.summary, r.ok);
        },
      });
    } catch (err) {
      console.error("[clavis] WebGL unavailable", err);
      setFailed("The 3D view needs WebGL, which this browser could not start.");
      return;
    }

    const sync = () => {
      const { model, editor } = store.getState();
      viewer.setModel(model);
      const selected = [editor.selectedItemId, editor.selectedWallId, editor.selectedRoomId, editor.selectedOpeningId].filter((x): x is string => !!x);
      requestAnimationFrame(() => viewer.mark(selected, editor.highlightIds));
    };
    viewerRef.current = viewer;
    viewer.setTheme(themeRef.current);
    sync();
    viewer.setMode(store.getState().editor.camera);
    const unsubscribe = store.subscribe((s, prev) => {
      if (s.model !== prev.model || s.editor !== prev.editor) sync();
      if (s.editor.camera !== prev.editor.camera) viewer.setMode(s.editor.camera);
    });
    const name = () => safeName(store.getState().model.name);
    const stops = [
      onCommand("fit-3d", () => viewer.refit()),
      onCommand("doors", (p) => viewer.setDoors(p.state, p.id)),
      onCommand("export-png", () => {
        const a = document.createElement("a");
        a.href = viewer.snapshot();
        a.download = `${name()}.png`;
        a.click();
        logActivity("human", "export_png", "3D snapshot saved.");
      }),
      onCommand("export-obj", () => {
        downloadText(viewer.exportObj(), `${name()}.obj`, "text/plain");
        logActivity("human", "export_obj", "3D model exported as OBJ.");
      }),
    ];
    return () => {
      unsubscribe();
      for (const stop of stops) stop();
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    themeRef.current = theme;
    viewerRef.current?.setTheme(theme);
  }, [theme]);

  return (
    <div className="scene3d-wrap">
      <div ref={mountRef} className="scene3d" aria-label="3D view of the design">
        {failed}
      </div>
      {empty && !failed && <div className="scene-empty">The 3D view appears here as soon as the design has walls.</div>}
      {placingKind && (
        <div className="placing-hint">
          Click the floor to place <strong>{catalogByKind(placingKind)?.label ?? placingKind}</strong> · Esc cancels
        </div>
      )}
      {camera !== "walk" && <div className="camera-hint">{HINTS[camera]}</div>}
    </div>
  );
}
