/**
 * Which hosted model answers /api/assistant. Every supported provider speaks the OpenAI-style
 * chat-completions API; they differ in base URL, default model and how strictly they enforce
 * a JSON schema. All configuration comes from server-side environment variables:
 *
 *   MODEL_PROVIDER   groq (default) | meta | openai-compatible
 *   MODEL_API_KEY    the provider's key — server-side only, never sent to the browser
 *   MODEL_ID         optional model override
 *   MODEL_BASE_URL   optional base URL override (required for openai-compatible)
 *
 * The older META_API_BASE_URL / META_MODEL_ID variables still work and imply provider "meta".
 */

export interface ProviderEnv {
  MODEL_PROVIDER?: string;
  MODEL_API_KEY?: string;
  MODEL_ID?: string;
  MODEL_BASE_URL?: string;
  /** optional model for explanations (cheap, and on Groq a separate rate-limit pool) */
  MODEL_EXPLAIN_ID?: string;
  /** legacy (session 1) */
  META_API_BASE_URL?: string;
  META_MODEL_ID?: string;
}

export type ProviderName = "groq" | "meta" | "openai-compatible";

export interface ProviderConfig {
  name: ProviderName;
  /** human label used in messages, e.g. "Groq" */
  label: string;
  baseUrl: string;
  model: string;
  /** model used for explanations; defaults to `model` */
  explainModel: string;
  /** strict JSON-schema decoding; off where the provider requires every field to be required */
  strictSchema: boolean;
  /** whether the model accepts `reasoning_effort` */
  reasoningEffort: boolean;
  /**
   * send a slim response schema plus a short operation reference in the prompt instead of the
   * full per-operation schema (~4k tokens) — for best-effort providers and small token budgets
   */
  compactPrompt: boolean;
  maxCompletionTokens: number;
}

const PRESETS: Record<ProviderName, Omit<ProviderConfig, "name">> = {
  // https://console.groq.com/docs/structured-outputs — gpt-oss supports json_schema; strict mode
  // needs every property listed as required, which the operation schema does not satisfy, so
  // best-effort mode is used and the app re-validates everything it gets back.
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
    // each Groq model has its own per-minute token budget; explanations are short and simple
    explainModel: "openai/gpt-oss-20b",
    strictSchema: false,
    compactPrompt: true,
    reasoningEffort: true,
    // the free tier allows 8,000 tokens a minute across input and output
    maxCompletionTokens: 6_000,
  },
  meta: {
    label: "Meta Model API",
    baseUrl: "https://api.meta.ai/v1",
    model: "muse-spark-1.3",
    explainModel: "",
    strictSchema: true,
    compactPrompt: false,
    reasoningEffort: true,
    maxCompletionTokens: 16_000,
  },
  "openai-compatible": {
    label: "the model provider",
    baseUrl: "",
    model: "",
    explainModel: "",
    strictSchema: false,
    compactPrompt: true,
    reasoningEffort: false,
    maxCompletionTokens: 8_000,
  },
};

export type ResolvedProvider = { ok: true; config: ProviderConfig } | { ok: false; message: string };

export function resolveProvider(env: ProviderEnv): ResolvedProvider {
  const legacyMeta = !env.MODEL_PROVIDER && !!(env.META_API_BASE_URL || env.META_MODEL_ID);
  const raw = (env.MODEL_PROVIDER || (legacyMeta ? "meta" : "groq")).trim().toLowerCase();
  if (!(raw in PRESETS)) return { ok: false, message: `Unknown MODEL_PROVIDER "${raw}". Use groq, meta or openai-compatible.` };
  const name = raw as ProviderName;
  const preset = PRESETS[name];
  const baseUrl = (env.MODEL_BASE_URL || (name === "meta" ? env.META_API_BASE_URL : "") || preset.baseUrl).replace(/\/+$/, "");
  const model = env.MODEL_ID || (name === "meta" ? env.META_MODEL_ID : "") || preset.model;
  if (!baseUrl) return { ok: false, message: "MODEL_BASE_URL is required when MODEL_PROVIDER is openai-compatible." };
  if (!model) return { ok: false, message: "MODEL_ID is required when MODEL_PROVIDER is openai-compatible." };
  // an explicit MODEL_ID applies to explanations too unless MODEL_EXPLAIN_ID says otherwise
  const explainModel = env.MODEL_EXPLAIN_ID || (env.MODEL_ID ? model : preset.explainModel) || model;
  return { ok: true, config: { name, ...preset, baseUrl, model, explainModel } };
}

/** What the browser may know about the server's assistant: never the key. */
export interface AssistantStatus {
  configured: boolean;
  provider: ProviderName | null;
  label: string | null;
  model: string | null;
  problem?: string;
}

export function assistantStatus(env: ProviderEnv): AssistantStatus {
  const r = resolveProvider(env);
  if (!r.ok) return { configured: false, provider: null, label: null, model: null, problem: r.message };
  return { configured: !!env.MODEL_API_KEY, provider: r.config.name, label: r.config.label, model: r.config.model };
}
