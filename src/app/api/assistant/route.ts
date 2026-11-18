/**
 * The hosted assistant. The same runtime-agnostic handler as before, now as a Next.js route
 * handler: GET reports whether a model is configured, POST asks it for a proposal.
 * Keys come from server-side environment variables and never reach the browser.
 *
 * Signed-in people have a daily allowance counted in the database (server/allowance.ts).
 */

import { handleAssistantRequest, type AssistantEnv } from "../../../../server/assistant";
import { withAllowance, type AllowanceDeps } from "../../../../server/allowance";
import { ACCOUNT_DAILY_CAP } from "@/ai/hostedQuota";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

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

const allowance: AllowanceDeps = {
  async userId() {
    const sb = await supabaseServer();
    if (!sb) return null;
    // verifies the session's token; a forged or expired cookie counts as a guest
    const { data } = await sb.auth.getClaims();
    return typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  },
  async consume(userId, cap) {
    const admin = supabaseAdmin();
    if (!admin) return null;
    const { data, error } = await admin.rpc("consume_assistant_request", { p_user: userId, p_cap: cap });
    return error || typeof data !== "number" ? null : data;
  },
  async refund(userId) {
    await supabaseAdmin()?.rpc("refund_assistant_request", { p_user: userId });
  },
  log: (entry) => console.log(JSON.stringify({ svc: "clavis-assistant", ...entry })),
};

const handle = (request: Request) => handleAssistantRequest(request, env());

export const GET = handle;
export const POST = (request: Request) => withAllowance(request, ACCOUNT_DAILY_CAP, allowance, handle);
