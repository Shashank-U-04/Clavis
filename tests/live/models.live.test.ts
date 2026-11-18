/**
 * LIVE model comparison: the same requests to each Groq model, scored by Clavis's own pipeline
 * (does every operation apply, and how many problems does the result have). Skipped unless run
 * with LIVE=1; spends real tokens. Fallbacks are off so each answer comes from the model named.
 *
 *   NODE_ENV=development LIVE=1 npx vitest run tests/live/models.live.test.ts --reporter=verbose
 *
 * (NODE_ENV=development: Next's env loader skips .env.local under NODE_ENV=test.)
 */

import { describe, it } from "vitest";
import nextEnv from "@next/env";
import { handleAssistantRequest } from "../../server/assistant";
import { applyBatch } from "../../src/model/operations";
import { checkModel } from "../../src/model/issues";
import { designSummary } from "../../src/model/summary";
import { emptyModel, type PlanModel } from "../../src/model/types";
import { COMPACT_TWO_BEDROOM } from "../../src/model/templates";

const proc = (globalThis as unknown as { process: { env: Record<string, string | undefined>; cwd(): string } }).process;
nextEnv.loadEnvConfig(proc.cwd());
const env = proc.env;
const live = env.LIVE === "1";
const MODELS = (env.LIVE_MODELS ?? "openai/gpt-oss-120b,openai/gpt-oss-20b").split(",");
const RUNS = Number(env.LIVE_RUNS ?? 2);
const pause = () => new Promise((r) => setTimeout(r, Number(env.LIVE_PAUSE_MS ?? 20_000)));

let n = 0;
const ids = (p: string) => `${p}_m${n++}`;
const template = (): PlanModel => applyBatch(emptyModel(), COMPACT_TWO_BEDROOM, ids).model;
const problems = (m: PlanModel) => checkModel(m).filter((i) => i.severity !== "info");

const CASES: { name: string; instruction: string; start: () => PlanModel; expectOps: boolean }[] = [
  { name: "question", instruction: "How many bedrooms does this design have, and what is the total clear floor area?", start: template, expectOps: false },
  { name: "edit", instruction: "Put a plant in the corner of the living room and an armchair next to the sofa.", start: template, expectOps: true },
  { name: "1-bed layout", instruction: "Design a compact one-bedroom flat with an open kitchen and a bathroom.", start: emptyModel, expectOps: true },
  { name: "3-bed layout", instruction: "A three-bedroom family house with two bathrooms, a study and an open kitchen-dining room, about 120 m².", start: emptyModel, expectOps: true },
];

describe.skipIf(!live)("live model comparison", () => {
  it("scores each model on the same requests", async () => {
    const rows: string[] = [];
    for (let run = 0; run < RUNS; run++) {
      for (const c of CASES) {
        for (const model of MODELS) {
          const start = c.start();
          const req = new Request("http://localhost/api/assistant", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ mode: "design", instruction: c.instruction, context: { design: designSummary(start, 1, checkModel(start)) } }),
          });
          const t0 = Date.now();
          const res = await handleAssistantRequest(
            req,
            { MODEL_PROVIDER: "groq", MODEL_API_KEY: env.MODEL_API_KEY, MODEL_ID: model, MODEL_FALLBACK_IDS: "" },
            { log: () => {} },
          );
          const body = await res.json();
          const ms = Date.now() - t0;
          let verdict: string;
          if (!body.ok) verdict = `FAIL ${body.error.code}`;
          else {
            const ops = body.proposal.operations;
            const out = ops.length ? applyBatch(start, ops, ids) : { ok: true as const, model: start, failedIndex: -1 };
            if (!c.expectOps) verdict = ops.length ? `unexpected ${ops.length} ops` : `ok answer: ${String(body.proposal.reply).slice(0, 70)}`;
            else if (!out.ok) verdict = `REJECTED at op ${out.failedIndex}/${ops.length}`;
            else if (c.expectOps && ops.length === 0) verdict = "no operations";
            else {
              const before = new Set(problems(start).map((i) => i.id));
              const added = problems(out.model).filter((i) => !before.has(i.id));
              verdict = `ok ${ops.length} ops, ${out.model.rooms.length} rooms, +${added.length} problems${added.length ? ` (${[...new Set(added.map((i) => i.code))].join(",")})` : ""}`;
            }
          }
          const tokens = body.ok ? body.meta.usage?.total_tokens : "-";
          const row = `run${run + 1} | ${c.name.padEnd(12)} | ${model.padEnd(20)} | ${String(ms).padStart(6)} ms | ${String(tokens).padStart(6)} tok | ${verdict}`;
          console.log(row);
          rows.push(row);
          await pause();
        }
      }
    }
    console.log("\n" + rows.join("\n"));
  }, 3_600_000);
});
