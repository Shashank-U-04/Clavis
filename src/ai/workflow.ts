/**
 * The assistant workflow on the client:
 *
 *   ask the model (hosted or Clavis Local) → dry-run its operations with the deterministic pipeline →
 *   (if validation rejects them, ask once more with the exact rejection) →
 *   person reviews and applies → re-validate → report what actually changed.
 *
 * The model never applies anything itself and never decides whether a change worked: the
 * outcome reported to the user (and handed back to the model for explanations) is computed
 * here from the validated model.
 */

import { issuesFor, preview, store, commitPreview, type PreviewResult, type DispatchResult } from "../model/store";
import { designSummary } from "../model/summary";
import { diffIssues } from "../model/issues";
import { isDestructive, OperationSchema } from "../model/operations";
import type { Issue } from "../model/types";
import type { AssistantMode, AssistantRequest, AssistantResponse, Explanation, Proposal } from "./contract";

export type Transport = (req: AssistantRequest, signal?: AbortSignal) => Promise<AssistantResponse>;

/** POST /api/assistant. Network and HTTP failures come back as structured errors, never throws. */
export const httpTransport: Transport = async (req, signal) => {
  let res: Response;
  try {
    res = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal: signal ?? AbortSignal.timeout(180_000),
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? { code: "provider_timeout", message: "The request was cancelled or timed out.", retryable: true }
        : { code: "provider_unavailable", message: "Could not reach the Clavis assistant server.", retryable: true },
    };
  }
  try {
    return (await res.json()) as AssistantResponse;
  } catch {
    return {
      ok: false,
      error: { code: "provider_unavailable", message: `The assistant server returned HTTP ${res.status} without a readable body.`, retryable: true },
    };
  }
};

export interface ProposalCheck {
  proposal: Proposal;
  preview: PreviewResult | null;
  /** number of model calls made (2 when the first proposal was rejected and revised) */
  attempts: number;
  /** why the first proposal was rejected by validation, when a revision was requested */
  firstRejection?: string;
  destructiveCount: number;
  latencyMs: number;
  model: string;
}

export type ProposeResult = { ok: true; check: ProposalCheck } | { ok: false; code: string; message: string; retryable: boolean };

function context(extra: Partial<AssistantRequest["context"]> = {}): AssistantRequest["context"] {
  const { model, revision, editor } = store.getState();
  const selectedId = editor.selectedWallId ?? editor.selectedItemId ?? editor.selectedRoomId ?? editor.selectedOpeningId;
  return { design: designSummary(model, revision, issuesFor(model)) as unknown as Record<string, unknown>, selectedId, ...extra };
}

function rejectionText(p: PreviewResult, proposal: Proposal): string {
  const i = p.error?.index ?? -1;
  const op = i >= 0 ? JSON.stringify(proposal.operations[i]).slice(0, 400) : "";
  return `Operation ${i >= 0 ? `#${i + 1}` : ""} was rejected: ${p.error?.message ?? "unknown"}${op ? ` — ${op}` : ""}. No operation was applied.`;
}

const countDestructive = (ops: unknown[]) =>
  ops.filter((o) => {
    const r = OperationSchema.safeParse(o);
    return r.success && isDestructive(r.data, store.getState().model);
  }).length;

/**
 * Ask for a proposal and dry-run it. When validation rejects the proposal, the model gets ONE
 * more attempt with the exact rejection reason; the UI shows that this happened.
 */
export async function propose(
  mode: Exclude<AssistantMode, "explain">,
  instruction: string,
  opts: { transport?: Transport; history?: AssistantRequest["history"]; focusIssueIds?: string[]; signal?: AbortSignal } = {},
): Promise<ProposeResult> {
  const transport = opts.transport ?? httpTransport;
  let rejection: string | undefined;
  let firstRejection: string | undefined;
  let latencyMs = 0;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await transport(
      { mode, instruction, history: opts.history, context: context({ focusIssueIds: opts.focusIssueIds, rejection }) },
      opts.signal,
    );
    if (!res.ok) return { ok: false, ...res.error };
    if (res.mode === "explain") return { ok: false, code: "malformed_output", message: "Unexpected response type.", retryable: true };
    latencyMs += res.meta.latencyMs;

    const proposal = res.proposal;
    if (proposal.operations.length === 0) {
      return { ok: true, check: { proposal, preview: null, attempts: attempt, firstRejection, destructiveCount: 0, latencyMs, model: res.meta.model } };
    }
    const p = preview(proposal.operations);
    if (p.ok || attempt === 2) {
      return {
        ok: true,
        check: { proposal, preview: p, attempts: attempt, firstRejection, destructiveCount: countDestructive(proposal.operations), latencyMs, model: res.meta.model },
      };
    }
    rejection = rejectionText(p, proposal);
    firstRejection = rejection;
  }
  // unreachable: the loop always returns on attempt 2
  return { ok: false, code: "malformed_output", message: "No proposal.", retryable: true };
}

export interface AppliedOutcome {
  result: DispatchResult;
  before: Issue[];
  after: Issue[];
  resolved: Issue[];
  remaining: Issue[];
  introduced: Issue[];
  /** for repairs: which of the targeted issues are really gone, measured after applying */
  focusResolved: string[];
  focusRemaining: string[];
}

/** Apply a reviewed proposal and measure what actually changed. */
export function applyChecked(check: ProposalCheck, focusIssueIds: string[] = []): AppliedOutcome | { error: string } {
  if (!check.preview) return { error: "There is nothing to apply." };
  const before = issuesFor(store.getState().model);
  const result = commitPreview(check.preview);
  if (!result.ok) return { error: result.summary };
  const after = issuesFor(store.getState().model);
  const d = diffIssues(before, after);
  const afterIds = new Set(after.map((i) => i.id));
  return {
    result,
    before,
    after,
    ...d,
    focusResolved: focusIssueIds.filter((id) => !afterIds.has(id)),
    focusRemaining: focusIssueIds.filter((id) => afterIds.has(id)),
  };
}

/** Ask the model to explain the current design, grounded in the measured outcome of the last change. */
export async function explain(
  instruction: string,
  outcome: AppliedOutcome | null,
  opts: { transport?: Transport; signal?: AbortSignal } = {},
): Promise<{ ok: true; explanation: Explanation; unverified: string[]; latencyMs: number; model: string } | { ok: false; code: string; message: string; retryable: boolean }> {
  const transport = opts.transport ?? httpTransport;
  const res = await transport(
    {
      mode: "explain",
      instruction,
      context: context(
        outcome
          ? {
              outcome: {
                revision: outcome.result.revision,
                applied: outcome.result.ok,
                summary: outcome.result.summary.slice(0, 4000),
                resolvedIssueIds: outcome.resolved.map((i) => i.id),
                remainingIssueIds: outcome.remaining.map((i) => i.id),
                introducedIssueIds: outcome.introduced.map((i) => i.id),
              },
            }
          : {},
      ),
    },
    opts.signal,
  );
  if (!res.ok) return { ok: false, ...res.error };
  if (res.mode !== "explain") return { ok: false, code: "malformed_output", message: "Unexpected response type.", retryable: true };
  // Evidence must point at something that exists; anything else is flagged, not hidden.
  const { model } = store.getState();
  const known = new Set<string>([
    ...issuesFor(model).map((i) => i.id),
    ...(outcome ? [...outcome.resolved, ...outcome.introduced].map((i) => i.id) : []),
    ...[...model.walls, ...model.openings, ...model.rooms, ...model.items].map((e) => e.id),
  ]);
  const unverified = [...new Set(res.explanation.points.flatMap((p) => p.evidence).filter((e) => !known.has(e)))];
  return { ok: true, explanation: res.explanation, unverified, latencyMs: res.meta.latencyMs, model: res.meta.model };
}
