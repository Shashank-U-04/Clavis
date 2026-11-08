import { useState } from "react";
import { actions, logActivity, useAppStore } from "../../model/store";
import { projectActions, useProjects } from "../../app/projects";
import { assistant, useSession } from "../../ai/session";
import { tracingFromFile, TRACING_TYPES } from "../tracing";

export function ProjectPanel() {
  const list = useProjects((s) => s.list);
  const currentId = useProjects((s) => s.currentId);
  const provider = useSession((s) => s.provider);
  const hosted = useSession((s) => s.hosted);
  const underlay = useAppStore((s) => s.model.underlay);
  const notes = useAppStore((s) => s.notes);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div className="panel-pad project">
      <section>
        <div className="section-head">
          <h4>Projects in this browser</h4>
          <button className="small" onClick={() => projectActions.duplicate()}>Duplicate</button>
        </div>
        {list.length === 0 && <p className="muted small">Designs save here automatically as you work.</p>}
        <ul className="projects">
          {list.map((p) => (
            <li key={p.id} className={p.id === currentId ? "on" : ""}>
              <button className="link" onClick={() => projectActions.open(p.id)} disabled={p.id === currentId}>
                {p.name}
              </button>
              <small>
                {p.rooms} rooms · {p.area} m² · {new Date(p.updatedAt).toLocaleDateString()}
              </small>
              {confirmDelete === p.id ? (
                <span className="confirm-inline">
                  <button className="danger small" onClick={() => (projectActions.remove(p.id), setConfirmDelete(null))}>
                    Delete
                  </button>
                  <button className="small" onClick={() => setConfirmDelete(null)}>Keep</button>
                </span>
              ) : (
                <button className="icon" title="Delete from this browser" onClick={() => setConfirmDelete(p.id)}>
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>Assistant</h4>
        <p className="small">
          {hosted === null
            ? "Checking the server…"
            : hosted.configured
              ? `Hosted model available: ${hosted.label} · ${hosted.model}`
              : `No hosted model on this server${hosted.problem ? ` (${hosted.problem})` : ""}. Clavis Local still does everything below.`}
        </p>
        <div className="radio">
          <label>
            <input type="radio" checked={provider === "auto"} onChange={() => assistant.setProvider("auto")} />
            <span>
              <b>Auto</b> (recommended) · Clavis Local answers first. Anything it does not understand goes to the hosted model, if there is one.
            </span>
          </label>
          <label>
            <input type="radio" checked={provider === "local"} onChange={() => assistant.setProvider("local")} />
            <span>
              <b>Clavis Local</b> · built in, no API key, works offline. Rule-based: it understands a fixed set of requests.
            </span>
          </label>
          <label>
            <input type="radio" checked={provider === "server"} onChange={() => assistant.setProvider("server")} />
            <span>
              <b>Hosted model</b> · free-form requests via <code>/api/assistant</code>. Needs <code>MODEL_API_KEY</code> set on the server, never in the browser.
            </span>
          </label>
        </div>
      </section>

      <section>
        <h4>Tracing image</h4>
        <input type="file" accept={TRACING_TYPES.join(",")}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const r = await tracingFromFile(file);
            setErr(r.ok ? null : r.message);
            if (r.ok) {
              actions.setUnderlay(r.underlay);
              logActivity("human", "set_underlay", "Tracing image added, shown 10 m wide. Set its real width below, then trace over it.");
            }
          }} />
        {err && <p className="bad small">{err}</p>}
        {underlay && (
          <div className="fields">
            <label className="num wide">
              <span>Opacity</span>
              <input type="range" min={0.1} max={1} step={0.05} value={underlay.opacity} onChange={(e) => actions.setUnderlay({ ...underlay, opacity: Number(e.target.value) })} />
            </label>
            <label className="num">
              <span>Real width</span>
              <input
                type="number"
                step={0.1}
                min={1}
                defaultValue={underlay.w.toFixed(2)}
                onBlur={(e) => {
                  const w = Number(e.target.value);
                  if (w > 0.5 && w < 200) actions.setUnderlay({ ...underlay, w, h: (underlay.h / underlay.w) * w });
                }}
              />
              <em>m</em>
            </label>
            <button onClick={() => actions.setUnderlay(null)}>Remove image</button>
          </div>
        )}
      </section>


      <section>
        <h4>Notes</h4>
        <div className="note-compose">
          <textarea rows={2} value={note} placeholder="A note on this design" onChange={(e) => setNote(e.target.value)} />
          <button
            disabled={!note.trim()}
            onClick={() => {
              actions.leaveNote(note.trim());
              setNote("");
            }}
          >
            Add
          </button>
        </div>
        {[...notes].reverse().map((n) => (
          <div key={n.id} className={`note ${n.author}`}>
            <b>{n.author === "human" ? "You" : "Note"}</b> {n.text}
          </div>
        ))}
      </section>

      <section className="about">
        <h4>About</h4>
        <p className="small">
          Clavis turns a plain-language brief into a home you can check and walk through. Designs stay in this browser unless you export them.
        </p>
        <p className="muted small">Concept-design tool. Its numbers are early-design guidance, not construction documents or code approval.</p>
      </section>
    </div>
  );
}
