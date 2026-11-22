/**
 * A signed-in person's daily allowance of hosted-model requests, counted in the database so
 * it holds across browsers and cannot be reset from the browser. When accounts are on
 * (`requireAccount`), a request without a signed-in session is turned away; without accounts
 * (local development, tests) everyone passes, with the per-client rate limit still applying.
 *
 * One request is taken before the model is asked. If the model never did any work (busy,
 * unreachable, the request was refused), it is given back; a model that answered badly still
 * spent the tokens, so that counts.
 */

import type { AssistantErrorCode } from "../src/ai/contract";

export interface AllowanceDeps {
  /** the signed-in person, or null for a guest */
  userId(): Promise<string | null>;
  /** take one; what is left after it, -1 when none was left, null when the count is unavailable */
  consume(userId: string, cap: number): Promise<number | null>;
  refund(userId: string): Promise<void>;
  log?(entry: Record<string, unknown>): void;
  /** turn away requests from people who are not signed in */
  requireAccount?: boolean;
}

/** failures that still used the model's tokens */
const SPENT: ReadonlySet<string> = new Set<AssistantErrorCode>(["malformed_output", "truncated_output"]);

const reply = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export async function withAllowance(request: Request, cap: number, deps: AllowanceDeps, handle: (r: Request) => Promise<Response>): Promise<Response> {
  if (request.method !== "POST") return handle(request);

  let user: string | null = null;
  try {
    user = await deps.userId();
  } catch {
    user = null;
  }
  if (!user) {
    if (!deps.requireAccount) return handle(request);
    return reply({ ok: false, error: { code: "sign_in_required", message: "Sign in to use the assistant.", retryable: false } }, 401);
  }

  let left: number | null = null;
  try {
    left = await deps.consume(user, cap);
  } catch {
    left = null;
  }
  if (left === -1) {
    return reply(
      {
        ok: false,
        error: {
          code: "daily_cap",
          message: `You've used today's ${cap} hosted-model requests. Clavis Local still answers everything it knows, and your allowance renews at midnight UTC.`,
          retryable: false,
        },
      },
      429,
    );
  }
  // the count is unavailable (database down): let the request through rather than block everyone
  if (left === null) deps.log?.({ event: "allowance", ok: false, reason: "count unavailable" });

  const res = await handle(request);
  let body: { ok?: boolean; error?: { code?: string }; meta?: Record<string, unknown> } | null = null;
  try {
    body = await res.clone().json();
  } catch {
    return res;
  }
  if (!body) return res;

  if (body.ok) {
    return left === null ? res : reply({ ...body, meta: { ...body.meta, accountLeft: left } }, res.status);
  }
  if (left !== null && !SPENT.has(String(body.error?.code))) {
    try {
      await deps.refund(user);
    } catch {
      /* the person loses one request; nothing worse */
    }
  }
  return res;
}
