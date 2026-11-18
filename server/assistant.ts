/**
 * Server-side model adapter for the Clavis assistant (Groq, Meta, or any OpenAI-compatible
 * chat-completions provider — see providers.ts).
 *
 * Runtime-agnostic: it takes a web-standard Request and returns a Response; the Next.js route
 * handler (src/app/api/assistant) wraps it with the per-account allowance. The API
 * key never leaves the server.
 *
 * Every provider is called the same way:
 *   POST {base}/chat/completions, Authorization: Bearer <key>,
 *   response_format: { type: "json_schema", json_schema: { name, schema[, strict] } }.
 * GET /api/assistant reports whether a provider is configured (never the key).
 *
 * Every response from the model is parsed and checked against the contract before it is
 * returned; operations inside it are re-validated by the client's deterministic pipeline.
 */

import {
  AssistantRequestSchema,
  ExplanationSchema,
  normaliseExplanation,
  MAX_REQUEST_BYTES,
  ProposalEnvelopeSchema,
  compactResponseJsonSchema,
  responseJsonSchema,
  type AssistantErrorCode,
  type AssistantMeta,
  type AssistantRequest,
  type AssistantResponse,
} from "../src/ai/contract";
import { systemPrompt, userContent } from "../src/ai/prompts";
import { assistantStatus, modelChain, resolveProvider, type ProviderConfig, type ProviderEnv } from "./providers";

export type AssistantEnv = ProviderEnv;

export interface AssistantDeps {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  log: (entry: Record<string, unknown>) => void;
  /** per-attempt timeout */
  timeoutMs: number;
}

/** the longest provider-requested wait the server will sit through before one retry */
export const MAX_RETRY_WAIT_MS = 30_000;

const defaultDeps: AssistantDeps = {
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  // Operational metadata only — never the instruction, the design or the model's output.
  log: (entry) => console.log(JSON.stringify({ svc: "clavis-assistant", ...entry })),
  timeoutMs: 120_000,
};

// ---------------------------------------------------------------------------
// Best-effort per-client rate limit (per server instance; a hosting-level limit is the real one)
// ---------------------------------------------------------------------------

const WINDOW_MS = 5 * 60_000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

export function rateLimited(client: string, now: number): boolean {
  const recent = (hits.get(client) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(client, recent);
    return true;
  }
  recent.push(now);
  hits.set(client, recent);
  if (hits.size > 5000) hits.clear(); // bound memory
  return false;
}

export function resetRateLimits() {
  hits.clear();
}

// ---------------------------------------------------------------------------

const json = (body: AssistantResponse, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const failure = (code: AssistantErrorCode, message: string, status: number, retryable = false) =>
  json({ ok: false, error: { code, message, retryable } }, status);

class ProviderError extends Error {
  constructor(
    readonly code: AssistantErrorCode,
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    /** how long the provider asked us to wait (429 retry-after), when it said */
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

interface ChatCompletion {
  model?: string;
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: AssistantMeta["usage"];
}

function buildBody(req: AssistantRequest, cfg: ProviderConfig, model: string) {
  const name = req.mode === "explain" ? "clavis_explanation" : "clavis_proposal";
  return {
    model,
    messages: [
      { role: "system", content: systemPrompt(req.mode, { compact: cfg.compactPrompt }) },
      ...(req.history ?? []).map((t) => ({ role: t.role, content: t.text })),
      { role: "user", content: userContent(req) },
    ],
    response_format: {
      type: "json_schema",
      // Meta's API takes no `strict` flag; others are told explicitly whether decoding is strict
      json_schema: cfg.name === "meta" ? { name, schema: responseJsonSchema(req.mode) } : { name, schema: (cfg.compactPrompt ? compactResponseJsonSchema : responseJsonSchema)(req.mode), strict: cfg.strictSchema },
    },
    ...(cfg.reasoningEffort ? { reasoning_effort: req.mode === "explain" ? "low" : "medium" } : {}),
    max_completion_tokens: cfg.maxCompletionTokens,
  };
}

/** Groq's x-ratelimit-remaining-requests counts the model's requests left today (RPD). */
function remainingToday(res: Response): number | undefined {
  const raw = res.headers.get("x-ratelimit-remaining-requests");
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** One call to the provider, mapped to typed errors. */
async function callProvider(
  env: AssistantEnv,
  cfg: ProviderConfig,
  body: unknown,
  deps: AssistantDeps,
): Promise<{ completion: ChatCompletion; remainingToday?: number }> {
  const base = cfg.baseUrl;
  const who = cfg.label;
  let res: Response;
  try {
    res = await deps.fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.MODEL_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(deps.timeoutMs),
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw timeout
      ? new ProviderError("provider_timeout", `${who} did not answer in time.`, 504, true)
      : new ProviderError("provider_unavailable", `Could not reach ${who}.`, 502, true);
  }
  if (res.ok) {
    try {
      return { completion: (await res.json()) as ChatCompletion, remainingToday: remainingToday(res) };
    } catch {
      throw new ProviderError("malformed_output", `${who} returned an unreadable response.`, 502, true);
    }
  }
  // Provider error bodies describe the request, not secrets; keep a short excerpt for diagnosis.
  let detail = (await res.text().catch(() => "")).slice(0, 2000);
  if (env.MODEL_API_KEY) detail = detail.split(env.MODEL_API_KEY).join("[redacted]");
  detail = detail.slice(0, 300);
  if (res.status === 401 || res.status === 403)
    throw new ProviderError("provider_auth", `The server's ${who} key was rejected. Check MODEL_API_KEY.`, 502, false);
  if (res.status === 429) {
    const after = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(after) && after > 0 ? Math.ceil(after * 1000) : undefined;
    const hint = wait ? ` Try again in about ${Math.ceil(wait / 1000)} s.` : " Try again shortly.";
    throw new ProviderError("provider_rate_limited", `The ${who} rate limit was reached.${hint}`, 503, true, wait);
  }
  if (res.status >= 500)
    throw new ProviderError("provider_unavailable", `${who} is unavailable (HTTP ${res.status}).`, 502, true);
  // Groq answers 400 json_validate_failed when the model's own output broke the schema: the
  // request was fine and a second sample usually passes, so it is a model failure, not ours.
  if (res.status === 400 && detail.includes("json_validate_failed"))
    throw new ProviderError("malformed_output", `${who} produced an answer that was not valid JSON.`, 502, true);
  throw new ProviderError("provider_rejected", `${who} rejected the request (HTTP ${res.status}). ${detail}`.trim(), 502, false);
}

export async function handleAssistantRequest(
  request: Request,
  env: AssistantEnv,
  overrides: Partial<AssistantDeps> = {},
): Promise<Response> {
  const deps = { ...defaultDeps, ...overrides };
  const started = deps.now();

  if (request.method === "GET") {
    return new Response(JSON.stringify(assistantStatus(env)), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  if (request.method !== "POST") return failure("bad_request", "Use GET or POST.", 405);
  if (!(request.headers.get("content-type") ?? "").includes("application/json"))
    return failure("bad_request", "Send JSON.", 415);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_REQUEST_BYTES) return failure("too_large", "The request is too large.", 413);

  const client = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(client, started)) return failure("rate_limited", "Too many assistant requests. Wait a few minutes.", 429, true);

  const text = await request.text();
  if (text.length > MAX_REQUEST_BYTES) return failure("too_large", "The request is too large.", 413);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return failure("bad_request", "The request body is not valid JSON.", 400);
  }
  const parsed = AssistantRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return failure("bad_request", `Invalid request at ${i.path.join(".") || "body"}: ${i.message}`, 400);
  }
  const req = parsed.data;

  const provider = resolveProvider(env);
  if (!provider.ok) return failure("not_configured", provider.message, 503);
  const cfg = provider.config;
  if (!env.MODEL_API_KEY) {
    return failure("not_configured", `No hosted model is configured on this server (MODEL_API_KEY is missing for ${cfg.label}).`, 503);
  }

  const chain = modelChain(cfg, req.mode);
  let step = 0;
  let model = chain[0];
  let attempts = 0;
  let completion: ChatCompletion | undefined;
  let left: number | undefined;
  let lastError: ProviderError | undefined;

  // One retry for transient failures, and a hand-over to the next model in the chain when one
  // is rate-limited (each has its own limit on Groq). Never retry auth or request errors.
  const maxAttempts = 2 + (chain.length - 1);
  while (attempts < maxAttempts) {
    attempts++;
    try {
      ({ completion, remainingToday: left } = await callProvider(env, cfg, buildBody(req, cfg, model), deps));
      break;
    } catch (err) {
      lastError = err instanceof ProviderError ? err : new ProviderError("provider_unavailable", "Unexpected provider failure.", 502, true);
      if (!lastError.retryable || attempts >= maxAttempts) break;
      if (lastError.code === "provider_rate_limited" && step + 1 < chain.length) {
        model = chain[++step];
        continue;
      }
      if (attempts - step >= 2) break; // this model already had its retry
      // honour a short retry-after (free tiers refill per minute); give up on long waits
      if (lastError.retryAfterMs !== undefined && lastError.retryAfterMs > MAX_RETRY_WAIT_MS) break;
      await deps.sleep(lastError.retryAfterMs ?? 1500);
    }
  }

  const latencyMs = deps.now() - started;
  if (!completion) {
    const e = lastError!;
    deps.log({ event: "assistant", mode: req.mode, ok: false, code: e.code, attempts, latencyMs });
    return failure(e.code, e.message, e.status, e.retryable);
  }

  const choice = completion.choices?.[0];
  const meta: AssistantMeta = { model: completion.model ?? model, latencyMs, attempts, usage: completion.usage, ...(left !== undefined ? { remainingToday: left } : {}) };
  const logMeta = { mode: req.mode, attempts, latencyMs, model: meta.model, finish: choice?.finish_reason, usage: completion.usage };

  if (choice?.finish_reason === "length") {
    deps.log({ event: "assistant", ok: false, code: "truncated_output", ...logMeta });
    return failure("truncated_output", "The model's answer was cut off before it finished. Try a smaller request.", 502, true);
  }
  let output: unknown;
  try {
    output = JSON.parse(choice?.message?.content ?? "");
  } catch {
    deps.log({ event: "assistant", ok: false, code: "malformed_output", ...logMeta });
    return failure("malformed_output", "The model returned text that is not valid JSON.", 502, true);
  }

  if (req.mode === "explain") {
    const ex = ExplanationSchema.safeParse(cfg.strictSchema ? output : normaliseExplanation(output));
    if (!ex.success) {
      const where = ex.error.issues[0]?.path.join(".") || "the top level";
      deps.log({ event: "assistant", ok: false, code: "malformed_output", at: where, ...logMeta });
      return failure("malformed_output", `The model's explanation did not match the expected structure (at ${where}).`, 502, true);
    }
    deps.log({ event: "assistant", ok: true, ...logMeta });
    return json({ ok: true, mode: "explain", explanation: ex.data, meta }, 200);
  }

  const pr = ProposalEnvelopeSchema.safeParse(output);
  if (!pr.success) {
    deps.log({ event: "assistant", ok: false, code: "malformed_output", ...logMeta });
    return failure("malformed_output", "The model's proposal did not match the expected structure.", 502, true);
  }
  deps.log({ event: "assistant", ok: true, operations: pr.data.operations.length, ...logMeta });
  return json({ ok: true, mode: req.mode, proposal: pr.data, meta }, 200);
}
