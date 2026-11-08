/**
 * LIVE provider check — calls the real hosted model. Skipped unless run as `npm run test:live`
 * (or with LIVE=1), so CI and `npm test` never spend tokens or need a key. It pauses between
 * calls to stay inside a free tier's per-minute token budget (LIVE_PAUSE_MS, default 35 s).
 *
 * Reads MODEL_PROVIDER / MODEL_API_KEY / MODEL_ID / MODEL_BASE_URL from .env.local through
 * Vite's loader, exactly as the dev server does. Never prints the key.
 */

import { describe, it, expect } from "vitest";
import { loadEnv } from "vite";
import { handleAssistantRequest } from "../../server/assistant";
import { applyBatch } from "../../src/model/operations";
import { checkModel } from "../../src/model/issues";
import { designSummary } from "../../src/model/summary";
import { emptyModel, type PlanModel } from "../../src/model/types";
import { COMPACT_TWO_BEDROOM } from "../../src/model/templates";

const proc = (globalThis as unknown as { process: { env: Record<string, string | undefined>; cwd(): string } }).process;
const live = proc.env.LIVE === "1" || proc.env.npm_lifecycle_event === "test:live";
const env = loadEnv("development", proc.cwd(), "");
const providerEnv = { MODEL_PROVIDER: env.MODEL_PROVIDER, MODEL_API_KEY: env.MODEL_API_KEY, MODEL_ID: env.MODEL_ID, MODEL_BASE_URL: env.MODEL_BASE_URL, MODEL_EXPLAIN_ID: env.MODEL_EXPLAIN_ID };
/** stay inside a free tier's per-minute token budget between calls */
const pause = () => new Promise((r) => setTimeout(r, Number(proc.env.LIVE_PAUSE_MS ?? 35_000)));

let n = 0;
const ids = (p: string) => `${p}_l${n++}`;
const template = (): PlanModel => applyBatch(emptyModel(), COMPACT_TWO_BEDROOM, ids).model;

async function ask(mode: "design" | "repair" | "explain", instruction: string, model: PlanModel) {
  const req = new Request("http://localhost/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode, instruction, context: { design: designSummary(model, 1, checkModel(model)) } }),
  });
  const started = Date.now();
  const res = await handleAssistantRequest(req, providerEnv, { log: () => {} });
  const body = await res.json();
  console.log(`[live] ${mode} "${instruction}" → HTTP ${res.status} in ${Date.now() - started} ms`, body.ok ? `model=${body.meta.model} tokens=${body.meta.usage?.total_tokens}` : JSON.stringify(body.error));
  return { status: res.status, body };
}

describe.skipIf(!live)("live hosted model", () => {
  it("is configured", async () => {
    const res = await handleAssistantRequest(new Request("http://localhost/api/assistant"), providerEnv);
    const status = await res.json();
    console.log("[live] status", status);
    expect(status.configured).toBe(true);
  });

  it("answers a question without operations", async () => {
    const { body } = await ask("design", "How many bedrooms does this design have, and what is the total clear floor area?", template());
    expect(body.ok).toBe(true);
    console.log("[live] reply:", body.proposal.reply);
    expect(body.proposal.operations).toHaveLength(0);
  }, 200_000);

  it("proposes an edit that the pipeline accepts", async () => {
    await pause();
    const m = template();
    const { body } = await ask("design", "Put a plant in the corner of the living room and an armchair next to the sofa.", m);
    expect(body.ok).toBe(true);
    console.log("[live] ops:", JSON.stringify(body.proposal.operations));
    const out = applyBatch(m, body.proposal.operations, ids);
    console.log("[live] pipeline:", out.ok ? "accepted" : `rejected at #${out.failedIndex}: ${out.error?.message}`);
    expect(out.ok).toBe(true);
    const introduced = checkModel(out.model).filter((i) => i.severity !== "info" && !checkModel(m).some((x) => x.id === i.id));
    console.log("[live] new findings:", introduced.map((i) => i.code));
  }, 200_000);

  it("generates a whole layout the pipeline accepts", async () => {
    await pause();
    const { body } = await ask("design", "Design a compact one-bedroom flat with an open kitchen and a bathroom.", emptyModel());
    expect(body.ok).toBe(true);
    const out = applyBatch(emptyModel(), body.proposal.operations, ids);
    console.log("[live] layout:", out.ok ? `${out.model.rooms.length} rooms, ${out.model.items.length} items` : `rejected at #${out.failedIndex}: ${out.error?.message}`);
    if (out.ok) console.log("[live] findings:", checkModel(out.model).filter((i) => i.severity !== "info").map((i) => i.code));
    expect(out.ok).toBe(true);
  }, 240_000);

  it("explains a design", async () => {
    const { body } = await ask("explain", "Explain this design briefly.", template());
    expect(body.ok).toBe(true);
    console.log("[live] explanation:", body.explanation.headline);
  }, 200_000);
});
