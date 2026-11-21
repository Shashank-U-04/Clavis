/**
 * The floors of the design, top floor first, at the foot of the plan: click one to edit it,
 * add a floor on top, rename one (double-click) or remove the one being edited (with a
 * confirmation, because everything on it goes too). A single-floor design shows just the
 * button to add a floor.
 */

import { useState } from "react";
import { actions, logActivity, useAppStore } from "../model/store";
import { GROUND, levelOf, levelsOf } from "../model/levels";

export function FloorSwitch() {
  const model = useAppStore((s) => s.model);
  const current = useAppStore((s) => s.editor.level);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const levels = levelsOf(model);
  const count = (id: string) => model.rooms.filter((r) => levelOf(r) === id).length;

  const add = () => {
    const r = actions.addLevel();
    logActivity("human", "add_level", r.summary, r.ok);
  };
  const remove = (id: string) => {
    const r = actions.removeLevel(id);
    logActivity("human", "remove_level", r.summary, r.ok);
    setConfirm(null);
  };

  return (
    <div className="floors" role="group" aria-label="Floors">
      {[...levels].reverse().map((l) =>
        renaming === l.id ? (
          <input
            key={l.id}
            className="floor-name"
            defaultValue={l.name}
            autoFocus
            maxLength={60}
            aria-label="Floor name"
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== l.name) {
                const r = actions.renameLevel(l.id, name);
                logActivity("human", "update_level", r.summary, r.ok);
              }
              setRenaming(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(null);
            }}
          />
        ) : (
          <button
            key={l.id}
            className={`floor ${l.id === current ? "on" : ""}`}
            aria-pressed={l.id === current}
            onClick={() => actions.setLevel(l.id)}
            onDoubleClick={() => setRenaming(l.id)}
            title={`${l.name} · ${l.elevation.toFixed(2)} m up · ${count(l.id)} room${count(l.id) === 1 ? "" : "s"}. Double-click to rename.`}
          >
            <span className="floor-n">{levels.indexOf(l) === 0 ? "G" : levels.indexOf(l)}</span>
            <span className="floor-label">{l.name}</span>
          </button>
        ),
      )}
      <div className="floor-actions">
        <button onClick={add} title="Add a floor on top and start drawing it">
          + Floor
        </button>
        {levels.length > 1 && current !== GROUND && current !== levels[0].id && (
          <button className="danger" onClick={() => setConfirm(current)} title="Remove this floor and everything on it">
            Remove
          </button>
        )}
      </div>
      {confirm && (
        <div className="floor-confirm" role="alertdialog" aria-label="Remove floor">
          <span>Remove {levels.find((l) => l.id === confirm)?.name} and everything on it?</span>
          <button className="danger" onClick={() => remove(confirm)}>
            Remove
          </button>
          <button onClick={() => setConfirm(null)}>Keep</button>
        </div>
      )}
    </div>
  );
}
