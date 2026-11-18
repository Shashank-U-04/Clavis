/**
 * The assistant conversation: turns, the provider in use, and the actions the panel calls.
 *
 * Providers:
 *   auto   — Clavis Local first; requests it does not understand go to the hosted model
 *            when the server has one configured (default)
 *   local  — Clavis Local only: the in-browser design engine (no key, no network)
 *   server — the hosted model behind POST /api/assistant only (needs MODEL_API_KEY on the server)
 *
 * Both go through the same workflow: propose → dry-run → person applies → measured outcome.
 */

import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { applyChecked, explain, httpTransport, propose, type AppliedOutcome, type ProposalCheck, type Transport } from "./workflow";
import { localTransport } from "./local/transport";
import { HOSTED_DAILY_CAP, NOT_COUNTED, hostedQuota } from "./hostedQuota";
import { readAccount } from "../model/account";
import { baseStorage } from "../model/persistence";
import type { Explanation } from "./contract";
import { actions, logActivity, store } from "../model/store";

export type Provider = "auto" | "local" | "server";

/** What GET /api/assistant says about the server (never the key). */
export interface HostedStatus {
  configured: boolean;
  label: string | null;
  model: string | null;
  problem?: string;
}

export interface Turn {
  id: string;
  role: "user" | "assistant";
  at: number;
  text: string;
  mode?: "design" | "repair";
  focusIssueIds?: string[];
  check?: ProposalCheck;
  state?: "thinking" | "proposed" | "applied" | "discarded" | "answered" | "error";
  outcome?: AppliedOutcome;
  applyError?: string;
  explanation?: { value: Explanation; unverified: string[] } | null;
  error?: { code: string; message: string; retryable: boolean };
  /** what was asked, so a failed turn can be retried */
  request?: { text: string; mode: "design" | "repair"; focusIssueIds?: string[] };
}

interface SessionState {
  turns: Turn[];
  provider: Provider;
  busy: boolean;
  /** the proposal currently previewed on the plan */
  previewTurnId: string | null;
  /** null until the server has been asked */
  hosted: HostedStatus | null;
  /** hosted requests this browser may still make today (guests) */
  browserLeft: number;
  /** a signed-in person's hosted requests left today, from the server; null until first asked */
  accountLeft: number | null;
  /** requests the hosted model has left today for everyone, from the last answer (Groq) */
  sharedLeft: number | null;
}

const PROVIDER_KEY = "clavis:provider";
const savedProvider = (): Provider => {
  try {
    const v = localStorage.getItem(PROVIDER_KEY);
    return v === "server" || v === "local" ? v : "auto";
  } catch {
    return "auto";
  }
};

export const session = createStore<SessionState>(() => ({
  turns: [],
  provider: typeof window === "undefined" ? "auto" : savedProvider(),
  busy: false,
  previewTurnId: null,
  hosted: null,
  browserLeft: typeof window === "undefined" ? HOSTED_DAILY_CAP : hostedQuota.remaining(),
  accountLeft: null,
  sharedLeft: null,
}));

export const useSession = <T>(sel: (s: SessionState) => T): T => useStore(session, sel);

let n = 0;
const tid = () => `turn_${Date.now().toString(36)}_${(n++).toString(36)}`;
/**
 * The hosted model, within this browser's daily allowance. A request that never reached the
 * model (busy, unreachable) is not counted.
 */
const hostedTransport: Transport = async (req, signal) => {
  // a signed-in person's allowance is counted on the server; a guest's in this browser
  const signedIn = !!readAccount(baseStorage());
  if (!signedIn && hostedQuota.remaining() <= 0) {
    session.setState({ browserLeft: 0 });
    return {
      ok: false,
      error: {
        code: "daily_cap",
        message: `This browser has used today's ${HOSTED_DAILY_CAP} hosted-model requests. Clavis Local still answers everything it knows, and the allowance resets at midnight. Signed in, you get more.`,
        retryable: false,
      },
    };
  }
  if (!signedIn) hostedQuota.record();
  const res = await httpTransport(req, signal);
  if (!signedIn && !res.ok && NOT_COUNTED.has(res.error.code)) hostedQuota.refund();
  session.setState((st) => ({
    browserLeft: hostedQuota.remaining(),
    accountLeft: !signedIn ? st.accountLeft : res.ok && res.meta.accountLeft !== undefined ? res.meta.accountLeft : !res.ok && res.error.code === "daily_cap" ? 0 : st.accountLeft,
    ...(res.ok && res.meta.remainingToday !== undefined ? { sharedLeft: res.meta.remainingToday } : {}),
  }));
  return res;
};

const transportFor = (p: Provider): Transport => (p === "server" ? hostedTransport : localTransport);
const hostedReady = () => !!session.getState().hosted?.configured;

function patch(id: string, p: Partial<Turn>) {
  session.setState((s) => ({ turns: s.turns.map((t) => (t.id === id ? { ...t, ...p } : t)) }));
}

let controller: AbortController | null = null;

export const assistant = {
  /** Ask the server whether a hosted model is configured. Failure just means "no". */
  async checkHosted(fetcher: typeof fetch = fetch) {
    try {
      const res = await fetcher("/api/assistant", { method: "GET", signal: AbortSignal.timeout(8000) });
      const body = (await res.json()) as HostedStatus;
      session.setState({ hosted: { configured: !!body.configured, label: body.label ?? null, model: body.model ?? null, problem: body.problem } });
    } catch {
      session.setState({ hosted: { configured: false, label: null, model: null } });
    }
  },

  setProvider(provider: Provider) {
    session.setState({ provider });
    try {
      localStorage.setItem(PROVIDER_KEY, provider);
    } catch {
      /* per-viewer convenience only */
    }
  },

  async ask(text: string, opts: { mode?: "design" | "repair"; focusIssueIds?: string[] } = {}) {
    const trimmed = text.trim();
    if (!trimmed || session.getState().busy) return;
    const mode = opts.mode ?? "design";
    const user: Turn = { id: tid(), role: "user", at: Date.now(), text: trimmed };
    const reply: Turn = {
      id: tid(),
      role: "assistant",
      at: Date.now(),
      text: "",
      state: "thinking",
      mode,
      focusIssueIds: opts.focusIssueIds,
      request: { text: trimmed, mode, focusIssueIds: opts.focusIssueIds },
    };
    session.setState((s) => ({ turns: [...s.turns, user, reply], busy: true }));
    controller = new AbortController();
    const history = session
      .getState()
      .turns.filter((t) => t.text && t.state !== "thinking")
      .slice(-6)
      .map((t) => ({ role: t.role, text: t.text.slice(0, 2000) }));
    const { provider } = session.getState();
    const opts2 = { history, focusIssueIds: opts.focusIssueIds, signal: controller.signal };
    let r = await propose(mode, trimmed, { ...opts2, transport: transportFor(provider === "server" ? "server" : "local") });
    // Auto: hand over to the hosted model only when Clavis Local says it does not understand
    if (provider === "auto" && hostedReady() && r.ok && r.check.proposal.intent === "unsupported" && !controller.signal.aborted) {
      // Local could not help, so the hosted answer is the one that matters: if it fails (a busy
      // free tier, a timeout), say so plainly rather than showing Local's "did not understand"
      r = await propose(mode, trimmed, { ...opts2, transport: hostedTransport });
    }
    controller = null;
    if (!r.ok) {
      patch(reply.id, { state: "error", error: { code: r.code, message: r.message, retryable: r.retryable } });
    } else {
      const hasOps = !!r.check.preview && r.check.proposal.operations.length > 0;
      patch(reply.id, { state: hasOps ? "proposed" : "answered", check: r.check, text: r.check.proposal.reply });
      if (hasOps) session.setState({ previewTurnId: reply.id });
    }
    session.setState({ busy: false });
  },

  /** Ask a failed turn's question again (the failed turn stays in the conversation). */
  async retry(id: string) {
    const turn = session.getState().turns.find((t) => t.id === id);
    if (!turn?.request) return;
    await assistant.ask(turn.request.text, { mode: turn.request.mode, focusIssueIds: turn.request.focusIssueIds });
  },

  cancel() {
    controller?.abort();
  },

  async apply(id: string) {
    const turn = session.getState().turns.find((t) => t.id === id);
    if (!turn?.check) return;
    const out = applyChecked(turn.check, turn.focusIssueIds ?? []);
    if ("error" in out) {
      patch(id, { applyError: out.error });
      return;
    }
    session.setState({ previewTurnId: null });
    patch(id, { state: "applied", outcome: out, applyError: undefined });
    const problem = (i: { severity: string }) => i.severity !== "info";
    const fixed = out.resolved.filter(problem).length ? ` · ${out.resolved.filter(problem).length} finding(s) resolved` : "";
    const added = out.introduced.filter(problem).length ? ` · ${out.introduced.filter(problem).length} new finding(s)` : "";
    logActivity("assistant", turn.check.model, `Applied ${turn.check.proposal.operations.length} operation(s) at revision ${out.result.revision}${fixed}${added}.`);
    // point at small changes; a whole new layout needs no highlighting
    const touched = out.result.changedEntityIds.filter((cid) => exists(cid));
    actions.setHighlight(touched.length <= 12 ? touched : []);
    // the local engine explains for free; the hosted model is asked only on request
    if (turn.check.model === "clavis-local") await assistant.explain(id);
  },

  discard(id: string) {
    patch(id, { state: "discarded" });
    if (session.getState().previewTurnId === id) session.setState({ previewTurnId: null });
  },

  togglePreview(id: string) {
    session.setState((s) => ({ previewTurnId: s.previewTurnId === id ? null : id }));
  },

  async explain(id: string) {
    const turn = session.getState().turns.find((t) => t.id === id);
    if (!turn) return;
    patch(id, { explanation: null });
    const local = turn.check?.model === "clavis-local" || !hostedReady();
    const r = await explain("Explain what changed and what still needs attention.", turn.outcome ?? null, { transport: local ? localTransport : hostedTransport });
    if (r.ok) patch(id, { explanation: { value: r.explanation, unverified: r.unverified } });
    else patch(id, { explanation: undefined, applyError: `Explanation failed: ${r.message}` });
  },

  clear() {
    session.setState({ turns: [], previewTurnId: null });
  },
};

function exists(id: string): boolean {
  const m = store.getState().model;
  return [m.walls, m.openings, m.rooms, m.items].some((list) => list.some((e) => e.id === id));
}
