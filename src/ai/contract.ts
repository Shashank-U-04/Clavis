/**
 * The contract between the Clavis client, the server-side assistant handler and the hosted model.
 *
 * Shared by both sides so the request the browser sends, the JSON schema the model is asked to
 * follow, and the validation applied to what comes back cannot drift apart. The model's output
 * is a PROPOSAL: operations in it are re-validated and dry-run by the deterministic pipeline
 * (model/operations.ts) before a person can apply them.
 */

import { z } from "zod";
import { OperationSchema } from "../model/operations";

export const ASSISTANT_MODES = ["design", "repair", "explain"] as const;
export type AssistantMode = (typeof ASSISTANT_MODES)[number];

export const INTENTS = ["generate_design", "edit_design", "query", "validate", "explain", "unsupported"] as const;

/** Upper bound for the whole request body the server accepts. */
export const MAX_REQUEST_BYTES = 256 * 1024;

const Turn = z
  .object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })
  .strict();

const Outcome = z
  .object({
    revision: z.number().int(),
    applied: z.boolean(),
    summary: z.string().max(4000),
    resolvedIssueIds: z.array(z.string().max(200)).max(200),
    remainingIssueIds: z.array(z.string().max(200)).max(200),
    introducedIssueIds: z.array(z.string().max(200)).max(200),
  })
  .strict();

export const AssistantRequestSchema = z
  .object({
    mode: z.enum(ASSISTANT_MODES),
    instruction: z.string().trim().min(1).max(2000),
    context: z
      .object({
        /** designSummary() output — computed by the app, never by the model */
        design: z.record(z.string(), z.unknown()),
        selectedId: z.string().max(80).nullable().optional(),
        focusIssueIds: z.array(z.string().max(200)).max(50).optional(),
        /** for repair retries: why the previous proposal was rejected by validation */
        rejection: z.string().max(2000).optional(),
        /** for explain: what actually happened, as measured by the app */
        outcome: Outcome.optional(),
      })
      .strict(),
    history: z.array(Turn).max(8).optional(),
  })
  .strict();

export type AssistantRequest = z.infer<typeof AssistantRequestSchema>;

// ---------------------------------------------------------------------------
// What the model must return
// ---------------------------------------------------------------------------

export const ProposalSchema = z
  .object({
    intent: z.enum(INTENTS).describe("what the user asked for"),
    reply: z.string().max(2000).describe("short direct answer to the user; for queries, the answer using only numbers from the design context"),
    operations: z
      .array(OperationSchema)
      .max(120)
      .describe("operations to propose, in order; empty for queries, clarifications and unsupported requests"),
    clarifying_questions: z.array(z.string().max(300)).max(3).describe("ask instead of guessing when the request is ambiguous or would delete work"),
    rationale: z.string().max(2000).describe("why these operations satisfy the request; dimensions are concept values, not code compliance"),
    expected_checks: z.array(z.string().max(120)).max(10).describe("validation checks the operations are meant to satisfy, e.g. 'no items_overlap'"),
  })
  .strict();

/**
 * The client re-validates operations one by one with the pipeline (with the full model in hand),
 * so the server only checks the envelope and leaves each operation as unknown.
 */
export const ProposalEnvelopeSchema = ProposalSchema.extend({
  operations: z.array(z.unknown()).max(120),
});

export type Proposal = z.infer<typeof ProposalEnvelopeSchema>;

export const ExplanationSchema = z
  .object({
    headline: z.string().max(200),
    summary: z.string().max(2000),
    points: z
      .array(
        z
          .object({
            text: z.string().max(500),
            evidence: z.array(z.string().max(200)).max(8).describe("issue ids or entity ids from the context that support this point"),
          })
          .strict(),
      )
      .max(8),
    caveats: z.array(z.string().max(300)).max(4),
  })
  .strict();

export type Explanation = z.infer<typeof ExplanationSchema>;

/**
 * Best-effort providers sometimes return an explanation that is right in substance but off
 * in shape: a long string, a missing caveats list, evidence as one string, extra keys. This
 * keeps only the expected fields, trims them to the limits and fills empty lists, so the
 * strict schema can then decide. It never invents content: a missing headline, summary or
 * point text still fails validation.
 */
export function normaliseExplanation(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : v);
  const strs = (v: unknown, max: number, n: number) =>
    (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).filter((x): x is string => typeof x === "string").slice(0, n).map((x) => x.slice(0, max));
  return {
    headline: str(o.headline, 200),
    summary: str(o.summary, 2000),
    points: (Array.isArray(o.points) ? o.points : []).slice(0, 8).map((p) =>
      typeof p === "string" ? { text: p.slice(0, 500), evidence: [] } : { text: str((p as Record<string, unknown>)?.text, 500), evidence: strs((p as Record<string, unknown>)?.evidence, 200, 8) },
    ),
    caveats: strs(o.caveats, 300, 4),
  };
}

// ---------------------------------------------------------------------------
// Server responses
// ---------------------------------------------------------------------------

export type AssistantErrorCode =
  | "bad_request"
  | "too_large"
  | "rate_limited"
  | "not_configured"
  | "provider_auth"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_rejected"
  | "malformed_output"
  | "truncated_output";

export interface AssistantMeta {
  model: string;
  latencyMs: number;
  attempts: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export type AssistantResponse =
  | { ok: true; mode: "design" | "repair"; proposal: Proposal; meta: AssistantMeta }
  | { ok: true; mode: "explain"; explanation: Explanation; meta: AssistantMeta }
  | { ok: false; error: { code: AssistantErrorCode; message: string; retryable: boolean } };

/**
 * The response schema without the per-operation detail: operations are plain objects. For
 * best-effort providers, where the operation reference travels in the prompt instead
 * (prompts.ts operationReference) at a fraction of the tokens.
 */
export function compactResponseJsonSchema(mode: AssistantMode): Record<string, unknown> {
  if (mode === "explain") return responseJsonSchema(mode);
  const schema = z.toJSONSchema(ProposalSchema.extend({ operations: z.array(z.object({ op: z.string() }).loose()).max(120) }), { io: "input" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

/** JSON Schema for response_format: zod output, adjusted to the strictest provider's schema rules (Meta). */
export function responseJsonSchema(mode: AssistantMode): Record<string, unknown> {
  const schema = z.toJSONSchema(mode === "explain" ? ExplanationSchema : ProposalSchema, { io: "input" }) as Record<string, unknown>;
  delete schema.$schema;
  // Meta's strict subset disallows oneOf; anyOf is accepted everywhere below the root.
  return JSON.parse(JSON.stringify(schema).replace(/"oneOf":/g, '"anyOf":'));
}
