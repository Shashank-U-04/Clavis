import { useMemo } from "react";
import { actions, issuesFor, useAppStore } from "../../model/store";
import { analyzeModel, HABITABILITY, type Analysis } from "../../model/analysis";
import type { Issue, PlanModel } from "../../model/types";
import { segPoint, type Pt } from "../../model/geometry";
import { assistant, useSession } from "../../ai/session";
import { setUi, useUi } from "../uiStore";

const SEV: Issue["severity"][] = ["error", "warning", "info"];
const SEV_LABEL = { error: "Errors", warning: "Warnings", info: "Notes" };

/** Door centres from just outside the entrance to the middle of the room. */
export function routePoints(m: PlanModel, a: Analysis, roomId: string): Pt[] {
  const r = a.rooms.find((x) => x.id === roomId);
  const room = m.rooms.find((x) => x.id === roomId);
  if (!r?.routeDoors || !room) return [];
  const pts: Pt[] = [];
  r.routeDoors.forEach((doorId, i) => {
    const o = m.openings.find((x) => x.id === doorId);
    const w = o && m.walls.find((x) => x.id === o.wallId);
    if (!o || !w) return;
    const c = segPoint({ x: w.ax, y: w.ay }, { x: w.bx, y: w.by }, o.t);
    if (i === 0) {
      // start a step outside the entrance door
      const len = Math.hypot(w.bx - w.ax, w.by - w.ay) || 1;
      const n = { x: -(w.by - w.ay) / len, y: (w.bx - w.ax) / len };
      const first = m.rooms.find((x) => x.id === r.route![0]);
      const inside = first ? { x: first.x + first.w / 2, y: first.y + first.h / 2 } : c;
      const sgn = (inside.x - c.x) * n.x + (inside.y - c.y) * n.y > 0 ? -1 : 1;
      pts.push({ x: c.x + n.x * 0.9 * sgn, y: c.y + n.y * 0.9 * sgn });
    }
    pts.push(c);
  });
  pts.push({ x: room.x + room.w / 2, y: room.y + room.h / 2 });
  return pts;
}

export function ReviewPanel() {
  const model = useAppStore((s) => s.model);
  const busy = useSession((s) => s.busy);
  const route = useUi((s) => s.route);
  const issues = issuesFor(model);
  const a = useMemo(() => analyzeModel(model), [model]);
  const label = new Map(model.rooms.map((r) => [r.id, r.label]));
  const problems = issues.filter((i) => i.severity !== "info");

  const focus = (i: Issue) => {
    actions.setHighlight(i.refs);
    const first = i.refs.find((id) => !model.rooms.some((r) => r.id === id)) ?? i.refs[0];
    if (first) actions.selectEntity(first);
  };
  const fix = (ids: string[], text: string) => {
    setUi({ rightTab: "assistant" });
    void assistant.ask(text, { mode: "repair", focusIssueIds: ids });
  };

  if (model.walls.length === 0 && model.rooms.length === 0) {
    return <div className="panel-pad muted">The review appears once the plan has rooms: findings, areas, daylight and the route to every room.</div>;
  }
  const e = a.metrics.envelope;

  return (
    <div className="review panel-pad">
      <div className="metrics">
        <div>
          <b>{a.metrics.carpetArea.toFixed(1)}</b>
          <span>m² clear floor</span>
        </div>
        <div>
          <b>{e ? `${e.w.toFixed(1)}×${e.h.toFixed(1)}` : "—"}</b>
          <span>m envelope</span>
        </div>
        <div>
          <b>{Math.round(a.metrics.efficiency * 100)}%</b>
          <span>efficiency</span>
        </div>
        <div>
          <b>{a.metrics.bedrooms}</b>
          <span>bedrooms</span>
        </div>
        <div>
          <b>{a.metrics.bathrooms}</b>
          <span>bathrooms</span>
        </div>
        <div>
          <b>{a.entrances.length}</b>
          <span>entrances</span>
        </div>
      </div>

      <div className="section-head">
        <h4>Findings</h4>
        {problems.length > 0 && (
          <button className="primary small" disabled={busy} onClick={() => fix(problems.map((i) => i.id), "Fix all issues")}>
            Fix all
          </button>
        )}
      </div>
      {problems.length === 0 && <div className="ok-line">✓ No errors or warnings. Walls connect, openings fit, nothing blocks a door or window, and every room can be reached.</div>}
      {SEV.map((sev) => {
        const list = issues.filter((i) => i.severity === sev);
        if (!list.length) return null;
        return (
          <div key={sev} className="sev-group">
            <div className={`sev-title ${sev}`}>
              {SEV_LABEL[sev]} · {list.length}
            </div>
            {list.map((i) => (
              <div key={i.id} className={`finding ${i.severity}`} onClick={() => focus(i)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && focus(i)}>
                <div>{i.message}</div>
                <div className="finding-foot">
                  <code>{i.code}</code>
                  {sev !== "info" && (
                    <button
                      className="link"
                      disabled={busy}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        fix([i.id], `Fix: ${i.message}`);
                      }}
                    >
                      Fix this
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <div className="section-head">
        <h4>Rooms</h4>
      </div>
      <table className="rooms">
        <thead>
          <tr>
            <th>Room</th>
            <th title="Clear floor inside the walls">m²</th>
            <th title={`Glazing ÷ floor; aim for ${HABITABILITY.minDaylightRatio * 100}%+ in habitable rooms`}>Light</th>
            <th title="Doors from the entrance — click to see the route">Route</th>
          </tr>
        </thead>
        <tbody>
          {a.rooms.map((r) => {
            const low = r.habitable && r.daylightRatio < HABITABILITY.minDaylightRatio;
            const on = route?.roomId === r.id;
            return (
              <tr key={r.id} className={on ? "on" : ""}>
                <td>
                  <button className="link" onClick={() => actions.selectRoom(r.id)}>
                    {r.label}
                  </button>
                </td>
                <td>{r.area.toFixed(1)}</td>
                <td className={low ? "bad" : ""}>{r.windows.length ? `${Math.round(r.daylightRatio * 100)}%` : r.habitable ? "none" : "—"}</td>
                <td>
                  {r.depth === null ? (
                    <span className="bad">unreachable</span>
                  ) : (
                    <button
                      className={`chip ${on ? "active" : ""}`}
                      title={r.route!.map((id) => label.get(id)).join(" → ")}
                      onClick={() => {
                        if (on) return setUi({ route: null });
                        setUi({ route: { roomId: r.id, points: routePoints(model, a, r.id) } });
                        actions.setHighlight([...r.route!, ...r.routeDoors!]);
                      }}
                    >
                      {r.depth} door{r.depth === 1 ? "" : "s"}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">
        Sizes, daylight ({HABITABILITY.minDaylightRatio * 100}% glazing) and escape-window checks are early-design rules of thumb, not a building-code review. Check local regulations with a professional.
      </p>
    </div>
  );
}
