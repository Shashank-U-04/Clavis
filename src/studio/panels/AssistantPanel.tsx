import { useEffect, useRef, useState } from "react";
import { assistant, useSession, type Turn } from "../../ai/session";
import { EXAMPLES, LOCAL_MODEL } from "../../ai/local/engine";
import { actions, issuesFor, useAppStore } from "../../model/store";
import type { Issue } from "../../model/types";
import { summarizeIssues } from "../../model/issues";
import { setUi } from "../uiStore";

const counts = (issues: Issue[]) => {
  const c = summarizeIssues(issues);
  return `${c.error} error${c.error === 1 ? "" : "s"}, ${c.warning} warning${c.warning === 1 ? "" : "s"}`;
};

function IssueList({ title, issues, tone }: { title: string; issues: Issue[]; tone: "bad" | "good" }) {
  if (issues.length === 0) return null;
  return (
    <div className={`diff-list ${tone}`}>
      <div className="diff-title">{title}</div>
      {issues.slice(0, 6).map((i) => (
        <div key={i.id} className={`diff-row ${i.severity}`}>
          {i.message}
        </div>
      ))}
      {issues.length > 6 && <div className="muted small">…and {issues.length - 6} more</div>}
    </div>
  );
}

function ProposalCard({ turn }: { turn: Turn }) {
  const check = turn.check!;
  const p = check.preview;
  const previewing = useSession((s) => s.previewTurnId === turn.id);
  const revision = useAppStore((s) => s.revision);
  const [confirm, setConfirm] = useState(false);
  const [showOps, setShowOps] = useState(false);
  const stale = !!p && revision !== p.baseRevision && turn.state === "proposed";
  const needsConfirm = check.destructiveCount > 0;
  const dangerous = p?.diff.introduced.filter((i) => i.severity !== "info") ?? [];
  const canApply = !!p?.ok && !stale && (!needsConfirm || confirm);

  return (
    <div className="card proposal">
      <div className="reply">{turn.text}</div>
      {check.proposal.clarifying_questions.length > 0 && (
        <ul className="questions">
          {check.proposal.clarifying_questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      )}
      {p && (
        <>
          <div className={`check-line ${p.ok ? "ok" : "bad"}`}>
            {p.ok ? (
              <>
                ✓ Checked by the validator: {check.proposal.operations.length} operation{check.proposal.operations.length === 1 ? "" : "s"} · before {counts(p.issuesBefore)} → after {counts(p.issuesAfter)}
              </>
            ) : (
              <>✗ Rejected by the validator — nothing can be applied: {p.error?.message}</>
            )}
          </div>
          {check.firstRejection && (
            <div className="muted small">The first proposal was rejected ({check.firstRejection.slice(0, 160)}), so the assistant revised it once.</div>
          )}
          <IssueList title="Would introduce" issues={dangerous} tone="bad" />
          <IssueList title="Would resolve" issues={p.diff.resolved.filter((i) => i.severity !== "info")} tone="good" />
          <button className="link" onClick={() => setShowOps(!showOps)}>
            {showOps ? "Hide" : "Show"} the {p.steps.length} step{p.steps.length === 1 ? "" : "s"}
          </button>
          {showOps && (
            <ol className="steps">
              {p.steps.map((s) => (
                <li key={s.index} className={s.ok ? "" : "bad"}>
                  <code>{s.op}</code> {s.summary}
                </li>
              ))}
            </ol>
          )}
          {check.proposal.rationale && <details className="rationale"><summary>Why</summary>{check.proposal.rationale}</details>}
          {turn.state === "proposed" && (
            <>
              {needsConfirm && (
                <label className="confirm">
                  <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
                  This removes or replaces existing work ({check.destructiveCount} operation{check.destructiveCount === 1 ? "" : "s"}). Apply anyway. You can undo it afterwards.
                </label>
              )}
              {stale && <div className="warn-line">The design changed after this was checked. Ask again to get a fresh proposal.</div>}
              <div className="card-actions">
                <button onClick={() => assistant.togglePreview(turn.id)} disabled={!p.ok}>
                  {previewing ? "Hide preview" : "Preview on plan"}
                </button>
                <button onClick={() => assistant.discard(turn.id)}>Discard</button>
                <button className="primary" disabled={!canApply} onClick={() => void assistant.apply(turn.id)} data-testid="apply-proposal">
                  Apply
                </button>
              </div>
            </>
          )}
        </>
      )}
      {turn.applyError && <div className="warn-line">{turn.applyError}</div>}
      {turn.state === "discarded" && <div className="muted small">Discarded — nothing was changed.</div>}
      {turn.state === "applied" && turn.outcome && <Outcome turn={turn} />}
      <EngineMeta check={check} />
    </div>
  );
}

/** Which engine answered: Clavis Local in the browser, or the hosted model on the server. */
function EngineMeta({ check }: { check: { model: string; latencyMs: number; attempts: number } }) {
  const hostedLabel = useSession((s) => s.hosted?.label);
  const local = check.model === LOCAL_MODEL;
  return (
    <div className="meta">
      <span
        className={`engine ${local ? "local" : "hosted"}`}
        title={local ? "Answered in your browser by Clavis Local. Nothing left this device." : `Answered on the server by ${hostedLabel ?? "the hosted model"} (${check.model}).`}
        data-testid="answered-by"
      >
        {local ? "Clavis Local" : `${hostedLabel ?? "Hosted"} · ${check.model}`}
      </span>
      {" · "}
      {check.latencyMs} ms{check.attempts > 1 ? ` · ${check.attempts} attempts` : ""}
    </div>
  );
}

function Outcome({ turn }: { turn: Turn }) {
  const o = turn.outcome!;
  const e = turn.explanation;
  return (
    <div className="outcome">
      <div className="check-line ok">
        Applied at revision {o.result.revision}. Measured after applying: {counts(o.after)}
        {o.resolved.some((i) => i.severity !== "info") ? ` · ${o.resolved.filter((i) => i.severity !== "info").length} resolved` : ""}
        {o.introduced.some((i) => i.severity !== "info") ? ` · ${o.introduced.filter((i) => i.severity !== "info").length} new` : ""}.
      </div>
      {turn.focusIssueIds && turn.focusIssueIds.length > 0 && (
        <div className={`check-line ${o.focusRemaining.length ? "bad" : "ok"}`}>
          {o.focusRemaining.length ? `${o.focusRemaining.length} of the targeted findings remain.` : "Every targeted finding is gone."}
        </div>
      )}
      <IssueList title="New findings" issues={o.introduced.filter((i) => i.severity !== "info")} tone="bad" />
      {o.introduced.some((i) => i.severity !== "info") && <FixNew ids={o.introduced.filter((i) => i.severity !== "info").map((i) => i.id)} />}
      {e === null && <div className="muted small">Explaining…</div>}
      {e && (
        <div className="explain">
          <strong>{e.value.headline}</strong>
          <p>{e.value.summary}</p>
          <ul>
            {e.value.points.map((pt, i) => (
              <li key={i}>
                {pt.text}{" "}
                {pt.evidence.map((ev) => (
                  <button
                    key={ev}
                    className={`chip ${e.unverified.includes(ev) ? "unverified" : ""}`}
                    title={e.unverified.includes(ev) ? "Not found in the design — treat as unverified" : "Highlight on the plan"}
                    onClick={() => actions.setHighlight(ev.includes(":") ? ev.split(":")[1].split("#")[0].split("+") : [ev])}
                  >
                    {ev.length > 28 ? `${ev.slice(0, 26)}…` : ev}
                  </button>
                ))}
              </li>
            ))}
          </ul>
          {e.value.caveats.map((c) => (
            <div key={c} className="muted small">
              {c}
            </div>
          ))}
        </div>
      )}
      {e === undefined && (
        <button className="link" onClick={() => void assistant.explain(turn.id)}>
          Explain what changed
        </button>
      )}
    </div>
  );
}

/**
 * A change that introduced findings (typically a free-form edit from the hosted model, which
 * is good at intent and loose with geometry) can be tidied by the deterministic repair search.
 */
function FixNew({ ids }: { ids: string[] }) {
  const busy = useSession((s) => s.busy);
  const model = useAppStore((s) => s.model);
  const live = new Set(issuesFor(model).map((i) => i.id));
  const open = ids.filter((id) => live.has(id));
  if (open.length === 0) return null;
  return (
    <div className="card-actions">
      <button className="primary" disabled={busy} onClick={() => void assistant.ask(`Fix the ${open.length} new finding(s)`, { mode: "repair", focusIssueIds: open })}>
        Fix the {open.length} new finding{open.length === 1 ? "" : "s"}
      </button>
    </div>
  );
}

function ErrorCard({ turn }: { turn: Turn }) {
  const err = turn.error!;
  const provider = useSession((s) => s.provider);
  const busy = useSession((s) => s.busy);
  const title =
    err.code === "not_configured"
      ? "The hosted model is not set up"
      : err.code === "provider_rate_limited" || err.code === "rate_limited"
        ? "The hosted model is busy"
        : "The assistant could not answer";
  return (
    <div className="card error">
      <strong>{title}</strong>
      <p>{err.message}</p>
      {provider === "auto" && <p className="small">Clavis Local did not recognise this request, so it went to the hosted model.</p>}
      {err.retryable && turn.request && (
        <div className="card-actions">
          <button disabled={busy} onClick={() => void assistant.retry(turn.id)}>
            Try again
          </button>
        </div>
      )}
      {provider === "server" && (
        <p className="small">
          Clavis Local runs in your browser and needs no API key.{" "}
          <button className="link" onClick={() => assistant.setProvider("auto")}>
            Switch to Clavis Local
          </button>
        </p>
      )}
    </div>
  );
}

export function AssistantPanel() {
  const turns = useSession((s) => s.turns);
  const busy = useSession((s) => s.busy);
  const provider = useSession((s) => s.provider);
  const empty = useAppStore((s) => s.model.walls.length === 0 && s.model.rooms.length === 0);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, turns[turns.length - 1]?.state]);

  const send = (t = text) => {
    if (!t.trim() || busy) return;
    void assistant.ask(t);
    setText("");
  };

  const suggestions = empty
    ? ["Design a two-bedroom flat with an open kitchen", "A three-bedroom house with two bathrooms and a study, 120 m²", "Studio apartment, 40 m²"]
    : EXAMPLES.slice(1);

  return (
    <div className="assistant">
      <div className="turns" ref={listRef} aria-live="polite">
        {turns.length === 0 && (
          <div className="intro">
            <h3>Design by describing</h3>
            <p>
              Ask for a home, a change, or a check. Every proposal is dry-run by the validator before you see it, nothing is applied until you press Apply, and the result is measured afterwards.
            </p>
            <p className="muted small">
              {provider === "local"
                ? "Answering: Clavis Local, a rule-based engine in your browser. No API key and nothing leaves this device."
                : provider === "server"
                  ? "Answering: the hosted model configured on the server."
                  : "Answering: Clavis Local first (in your browser). Requests it does not understand go to the hosted model when the server has one."}
            </p>
          </div>
        )}
        {turns.map((t) =>
          t.role === "user" ? (
            <div key={t.id} className="bubble user">
              {t.text}
            </div>
          ) : t.state === "thinking" ? (
            <div key={t.id} className="card thinking">
              <span className="dots" /> Working out a proposal and checking it…
              <button className="link" onClick={() => assistant.cancel()}>
                Cancel
              </button>
            </div>
          ) : t.state === "error" ? (
            <ErrorCard key={t.id} turn={t} />
          ) : t.state === "answered" ? (
            <div key={t.id} className="card answer">
              <div className="reply">{t.text}</div>
              {t.check && t.check.proposal.clarifying_questions.length > 0 && (
                <ul className="questions">
                  {t.check.proposal.clarifying_questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              )}
              {t.check && <EngineMeta check={t.check} />}
            </div>
          ) : (
            <ProposalCard key={t.id} turn={t} />
          ),
        )}
      </div>
      <div className="suggest">
        {suggestions.map((s) => (
          <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          id="assistant-input"
          value={text}
          rows={2}
          maxLength={2000}
          placeholder={empty ? "Describe the home you want…" : "Ask for a change or a check…"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="primary" type="submit" disabled={busy || !text.trim()}>
          Send
        </button>
      </form>
      {turns.length > 0 && (
        <div className="assistant-foot">
          <button className="link" onClick={() => assistant.clear()}>
            Clear conversation
          </button>
          <button className="link" onClick={() => setUi({ rightTab: "review" })}>
            Open the review
          </button>
        </div>
      )}
    </div>
  );
}
