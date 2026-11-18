/**
 * The hosted assistant. The same runtime-agnostic handler as before, now as a Next.js route
 * handler: GET reports whether a model is configured, POST asks it for a proposal.
 * Keys come from server-side environment variables and never reach the browser.
 */

import { handleAssistantRequest, type AssistantEnv } from "../../../../server/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const env = (): AssistantEnv => ({
  MODEL_PROVIDER: process.env.MODEL_PROVIDER,
  MODEL_API_KEY: process.env.MODEL_API_KEY,
  MODEL_ID: process.env.MODEL_ID,
  MODEL_BASE_URL: process.env.MODEL_BASE_URL,
  MODEL_EXPLAIN_ID: process.env.MODEL_EXPLAIN_ID,
  MODEL_FALLBACK_IDS: process.env.MODEL_FALLBACK_IDS,
  META_API_BASE_URL: process.env.META_API_BASE_URL,
  META_MODEL_ID: process.env.META_MODEL_ID,
});

export const GET = (request: Request) => handleAssistantRequest(request, env());
export const POST = (request: Request) => handleAssistantRequest(request, env());
