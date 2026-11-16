/**
 * The guide for building a plan by hand: rooms, doors, windows, furniture, then the check.
 * Each step ticks itself off from the design and the validator's findings, and offers the
 * tool for the job. Furnishing runs Clavis Local's own room recipes on a scratch copy, so a
 * piece is only placed where the validator accepts it.
 */

import { useState } from "react";
import {
  dispatch,
  issuesFor,
  logActivity,
  store,
  useAppStore,
} from "../model/store";
import { Trial } from "../ai/local/trial";
import { furnishRoom } from "../ai/local/furnish";
import type { PlanModel } from "../model/types";
import { pickTool } from "./ToolStrip";
import { featureActions, openLibrary, setUi } from "./uiStore";

const inRoom = (m: PlanModel, roomId: string) => {
  const r = m.rooms.find((x) => x.id === roomId);
  return (
    !!r &&
    m.items.some(
      (i) => i.x > r.x && i.x < r.x + r.w && i.y > r.y && i.y < r.y + r.h,
    )
  );
};

/** Furnish every room that has nothing in it yet. One undo step. */
export function furnishEmptyRooms(): string {
  const m = store.getState().model;
  const trial = new Trial(m);
  const rooms = m.rooms.filter((r) => !inRoom(m, r.id));
  let placed = 0;
  for (const r of rooms) placed += furnishRoom(trial, r.id)?.placed.length ?? 0;
  if (!trial.ops.length) {
    const why = rooms.length
      ? "Nothing fitted without a problem; add doors first, or make the rooms a little bigger."
      : "Every room already has furniture.";
    logActivity("human", "furnish_rooms", why, false);
    return why;
  }
  const r = dispatch(trial.ops);
  const summary = r.ok
    ? `Furnished ${rooms.length} room${rooms.length === 1 ? "" : "s"} with ${placed} piece${placed === 1 ? "" : "s"}, each checked by the validator.`
    : r.summary;
  logActivity("human", "furnish_rooms", summary, r.ok);
  return summary;
}

interface Step {
  title: string;
  done: boolean;
  status: string;
  how: string;
  actions: [string, () => void][];
}

function steps(m: PlanModel): Step[] {
  const issues = issuesFor(m);
  const count = (code: string) => issues.filter((i) => i.code === code).length;
  const doors = m.openings.filter((o) => o.kind === "door").length;
  const windows = m.openings.filter((o) => o.kind === "window").length;
  const problems = issues.filter((i) => i.severity !== "info").length;
  const noDoor = count("room_no_door");
  const noWindow = count("room_no_window");
  return [
    {
      title: "Rooms",
      done: m.rooms.length > 0,
      status: m.rooms.length
        ? `${m.rooms.length} room${m.rooms.length === 1 ? "" : "s"}`
        : "none yet",
      how: "Place ready-made rooms side by side; they bring their walls and share them. Or drag one out with the Room tool.",
      actions: [["Open Rooms", () => openLibrary("rooms", false)]],
    },
    {
      title: "Doors",
      done: m.rooms.length > 0 && doors > 0 && noDoor === 0,
      status: noDoor
        ? `${noDoor} room${noDoor === 1 ? "" : "s"} without a door`
        : `${doors} door${doors === 1 ? "" : "s"}`,
      how: "With the Door tool, click a wall between two rooms. Every room needs a way in; put the front door on an outside wall.",
      actions: [["Door tool", () => pickTool("door")]],
    },
    {
      title: "Windows",
      done: m.rooms.length > 0 && windows > 0 && noWindow === 0,
      status: noWindow
        ? `${noWindow} room${noWindow === 1 ? "" : "s"} without a window`
        : `${windows} window${windows === 1 ? "" : "s"}`,
      how: "With the Window tool, click outside walls. Bedrooms need one big enough to climb out of.",
      actions: [["Window tool", () => pickTool("window")]],
    },
    {
      title: "Furniture",
      done: m.items.length > 0,
      status: m.items.length
        ? `${m.items.length} piece${m.items.length === 1 ? "" : "s"}`
        : "none yet",
      how: "Furnish every empty room in one go, or pick pieces yourself.",
      actions: [
        ["Furnish rooms", () => void furnishEmptyRooms()],
        ["Furniture", () => openLibrary("furniture", false)],
      ],
    },
    {
      title: "Check",
      done: m.rooms.length > 0 && problems === 0,
      status: problems
        ? `${problems} to look at`
        : m.rooms.length
          ? "no problems"
          : "—",
      how: "Review lists every problem and highlights it on the plan. Fix all repairs most of them, as a preview first.",
      actions: [["Open Review", () => setUi({ rightTab: "review" })]],
    },
  ];
}

export function BuildGuide() {
  const model = useAppStore((s) => s.model);
  const walking = useAppStore((s) => s.editor.camera === "walk");
  const list = steps(model);
  const current = list.findIndex((s) => !s.done);
  const done = list.filter((s) => s.done).length;
  const [folded, setFolded] = useState(false);
  return (
    <aside
      className={`guide ${folded ? "folded" : ""}`}
      aria-label="Build guide"
    >
      <div className="guide-head">
        <button
          className="guide-fold"
          onClick={() => setFolded(!folded)}
          aria-expanded={!folded}
          title={folded ? "Show the steps" : "Fold the guide to one line"}
        >
          <span className="eyebrow">
            Build it yourself · {done}/{list.length}
          </span>
          {folded && (
            <span className="guide-next">
              {current === -1 ? "All done" : `Next: ${list[current].title}`}
            </span>
          )}
          <span className="caret">{folded ? "▸" : "▾"}</span>
        </button>
        <button
          className="icon-btn"
          onClick={() => setUi({ guide: false })}
          aria-label="Close the guide"
          title="Close the guide"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
      {!folded && (
        <ol>
          {list.map((s, i) => (
            <li
              key={s.title}
              className={`${s.done ? "done" : ""} ${i === current ? "now" : ""}`}
            >
              <span className="guide-mark" aria-hidden="true">
                {s.done ? "✓" : i + 1}
              </span>
              <div>
                <p className="guide-title">
                  {s.title} <small>{s.status}</small>
                </p>
                {i === current && (
                  <>
                    <p className="guide-how">{s.how}</p>
                    <div className="guide-actions">
                      {s.actions.map(([label, run], n) => (
                        <button
                          key={label}
                          className={n === 0 ? "primary small" : "small"}
                          onClick={run}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {!folded && current === -1 && (
        <div className="guide-done">
          <p>The plan is complete and passes every check.</p>
          {!walking && (
            <button
              className="primary small"
              onClick={() => featureActions.toggle("walk")}
            >
              Walk through it →
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
