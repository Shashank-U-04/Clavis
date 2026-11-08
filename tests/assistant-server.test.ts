import { describe, it, expect, beforeEach } from "vitest";
import { handleAssistantRequest, resetRateLimits, type AssistantDeps } from "../server/assistant";
import { designSummary } from "../src/model/summary";
import { emptyModel } from "../src/model/types";

const KEY = "LLM_123_test-secret-value";
const env = { MODEL_API_KEY: KEY, MODEL_PROVIDER: "meta" };
const groq = { MODEL_API_KEY: KEY };

const body = (over: Record<string, unknown> = {}) => ({
  mode: "design",
  instruction: "Design a compact two-bedroom home. SECRET-USER-TEXT",
  context: { design: designSummary(emptyModel(), 0, []) },
  ...over,
});

const post = (b: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof b === "string" ? b : JSON.stringify(b),
  });

const completion = (content: unknown, finish = "stop") =>
  new Response(
    JSON.stringify({
      model: "muse-spark-1.3",
      choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) }, finish_reason: finish }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const proposal = {
  intent: "generate_design",
  reply: "Here is a layout.",
  operations: [{ op: "add_wall", ax: 0, ay: 0, bx: 4, by: 0 }],
  clarifying_questions: [],
  rationale: "Simple.",
  expected_checks: [],
};

function harness(responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const logs: Record<string, unknown>[] = [];
  const deps: Partial<AssistantDeps> = {
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (!next) throw new Error("no more responses");
      if (next instanceof Error) throw next;
      return next;
    }) as typeof fetch,
    sleep: async () => {},
    log: (e) => logs.push(e),
  };
  return { calls, logs, deps };
}

beforeEach(() => resetRateLimits());

describe("assistant handler — success", () => {
  it("calls the Meta chat completions endpoint with a JSON schema and returns the validated proposal", async () => {
    const h = harness([completion(proposal)]);
    const res = await handleAssistantRequest(post(body()), env, h.deps);
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.ok).toBe(true);
    expect(out.proposal.operations).toHaveLength(1);
    expect(out.meta).toMatchObject({ model: "muse-spark-1.3", attempts: 1 });

    expect(h.calls[0].url).toBe("https://api.meta.ai/v1/chat/completions");
    const headers = h.calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${KEY}`);
    const sent = JSON.parse(String(h.calls[0].init.body));
    expect(sent.model).toBe("muse-spark-1.3");
    expect(sent.response_format.type).toBe("json_schema");
    expect(JSON.stringify(sent.response_format)).not.toContain('"oneOf"');
    // unsupported parameters per the Chat Completions docs must not be sent
    for (const k of ["stop", "logit_bias", "n", "logprobs", "frequency_penalty", "presence_penalty"]) expect(sent).not.toHaveProperty(k);
  });

  it("returns explanations in explain mode", async () => {
    const h = harness([completion({ headline: "OK", summary: "s", points: [{ text: "t", evidence: ["room_1"] }], caveats: [] })]);
    const res = await handleAssistantRequest(post(body({ mode: "explain" })), env, h.deps);
    const out = await res.json();
    expect(out).toMatchObject({ ok: true, mode: "explain", explanation: { headline: "OK" } });
  });

  it("honours META_MODEL_ID and META_API_BASE_URL overrides", async () => {
    const h = harness([completion(proposal)]);
    await handleAssistantRequest(post(body()), { ...env, META_MODEL_ID: "muse-spark-1.2", META_API_BASE_URL: "https://example.test/v1/" }, h.deps);
    expect(h.calls[0].url).toBe("https://example.test/v1/chat/completions");
    expect(JSON.parse(String(h.calls[0].init.body)).model).toBe("muse-spark-1.2");
  });
});

describe("assistant handler — providers", () => {
  it("defaults to Groq with gpt-oss, best-effort JSON schema and reasoning effort", async () => {
    const h = harness([completion(proposal)]);
    const res = await handleAssistantRequest(post(body()), groq, h.deps);
    expect(res.status).toBe(200);
    expect(h.calls[0].url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const sent = JSON.parse(String(h.calls[0].init.body));
    expect(sent.model).toBe("openai/gpt-oss-120b");
    expect(sent.response_format.json_schema.strict).toBe(false);
    expect(sent.reasoning_effort).toBe("medium");
  });

  it("sends Groq a compact prompt: slim schema plus an operation reference", async () => {
    const h = harness([completion(proposal), completion({ headline: "OK", summary: "s", points: [], caveats: [] })]);
    await handleAssistantRequest(post(body()), groq, h.deps);
    const sent = JSON.parse(String(h.calls[0].init.body));
    expect(JSON.stringify(sent.response_format).length).toBeLessThan(2500);
    expect(sent.messages[0].content).toContain("- build_layout {");
    expect(sent.messages[0].content).toContain("Kind = a furniture catalog kind");
    // explanations go to the smaller model, which has its own rate-limit pool on Groq
    await handleAssistantRequest(post(body({ mode: "explain" })), groq, h.deps);
    expect(JSON.parse(String(h.calls[1].init.body)).model).toBe("openai/gpt-oss-20b");
    // Meta keeps the full schema
    const m = harness([completion(proposal)]);
    await handleAssistantRequest(post(body()), env, m.deps);
    expect(JSON.stringify(JSON.parse(String(m.calls[0].init.body)).response_format).length).toBeGreaterThan(8000);
  });

  it("waits as long as a 429 retry-after asks (up to 30 s) and retries once", async () => {
    const limited = (after: string) => new Response("{}", { status: 429, headers: { "retry-after": after } });
    const waits: number[] = [];
    const h = harness([limited("4.2"), completion(proposal)]);
    const res = await handleAssistantRequest(post(body()), groq, { ...h.deps, sleep: async (ms) => void waits.push(ms) });
    expect(res.status).toBe(200);
    expect(waits).toEqual([4200]);
    const long = harness([limited("90")]);
    const out = await (await handleAssistantRequest(post(body()), groq, long.deps)).json();
    expect(long.calls).toHaveLength(1);
    expect(out.error).toMatchObject({ code: "provider_rate_limited", retryable: true });
    expect(out.error.message).toMatch(/about 90 s/);
  });

  it("tidies an off-shape explanation from a best-effort provider, but never invents one", async () => {
    const sloppy = { headline: "H".repeat(300), summary: "S", points: ["plain text point", { text: "t", evidence: "room_1", extra: 1 }], note: "extra key" };
    const ok = await (await handleAssistantRequest(post(body({ mode: "explain" })), groq, harness([completion(sloppy)]).deps)).json();
    expect(ok.ok).toBe(true);
    expect(ok.explanation.headline).toHaveLength(200);
    expect(ok.explanation.points[1]).toEqual({ text: "t", evidence: ["room_1"] });
    expect(ok.explanation.caveats).toEqual([]);
    const empty = await (await handleAssistantRequest(post(body({ mode: "explain" })), groq, harness([completion({ points: [] })]).deps)).json();
    expect(empty.error.code).toBe("malformed_output");
    expect(empty.error.message).toMatch(/at headline/);
  });

  it("supports any OpenAI-compatible endpoint and requires its base URL and model", async () => {
    const h = harness([completion(proposal)]);
    const custom = { MODEL_API_KEY: KEY, MODEL_PROVIDER: "openai-compatible", MODEL_BASE_URL: "http://127.0.0.1:11434/v1/", MODEL_ID: "llama3.1" };
    await handleAssistantRequest(post(body()), custom, h.deps);
    expect(h.calls[0].url).toBe("http://127.0.0.1:11434/v1/chat/completions");
    expect(JSON.parse(String(h.calls[0].init.body))).not.toHaveProperty("reasoning_effort");
    const bad = await handleAssistantRequest(post(body()), { MODEL_API_KEY: KEY, MODEL_PROVIDER: "openai-compatible" }, harness([]).deps);
    expect(bad.status).toBe(503);
    const unknown = await (await handleAssistantRequest(post(body()), { MODEL_API_KEY: KEY, MODEL_PROVIDER: "nope" }, harness([]).deps)).json();
    expect(unknown.error.code).toBe("not_configured");
  });

  it("GET reports the configuration without ever revealing the key", async () => {
    const on = await (await handleAssistantRequest(new Request("http://x/api/assistant"), groq, harness([]).deps)).text();
    expect(JSON.parse(on)).toEqual({ configured: true, provider: "groq", label: "Groq", model: "openai/gpt-oss-120b" });
    expect(on).not.toContain(KEY);
    const off = await (await handleAssistantRequest(new Request("http://x/api/assistant"), {}, harness([]).deps)).json();
    expect(off.configured).toBe(false);
  });
});

describe("assistant handler — request validation", () => {
  it("rejects non-POST, non-JSON, malformed and oversized requests before calling the provider", async () => {
    const h = harness([]);
    expect((await handleAssistantRequest(new Request("http://x/api/assistant", { method: "PUT" }), env, h.deps)).status).toBe(405);
    expect((await handleAssistantRequest(post("x", { "content-type": "text/plain" }), env, h.deps)).status).toBe(415);
    expect((await handleAssistantRequest(post("{nope"), env, h.deps)).status).toBe(400);
    expect((await handleAssistantRequest(post(body({ mode: "execute" })), env, h.deps)).status).toBe(400);
    expect((await handleAssistantRequest(post(body({ instruction: "x".repeat(3000) })), env, h.deps)).status).toBe(400);
    expect((await handleAssistantRequest(post(body({ context: { design: {}, padding: "x".repeat(300_000) } })), env, h.deps)).status).toBe(413);
    expect(h.calls).toHaveLength(0);
  });

  it("explains a missing key without calling the provider", async () => {
    const h = harness([]);
    const res = await handleAssistantRequest(post(body()), {}, h.deps);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("not_configured");
    expect(h.calls).toHaveLength(0);
  });

  it("rate-limits a single client", async () => {
    const h = harness(Array.from({ length: 40 }, () => completion(proposal)));
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await handleAssistantRequest(post(body(), { "cf-connecting-ip": "1.2.3.4" }), env, h.deps)).status;
    expect(last).toBe(429);
  });
});

describe("assistant handler — provider failures", () => {
  it("maps 401 to provider_auth without retrying or leaking the key", async () => {
    const h = harness([new Response(`bad key ${KEY}`, { status: 401 })]);
    const res = await handleAssistantRequest(post(body()), env, h.deps);
    const text = await res.text();
    expect(JSON.parse(text).error.code).toBe("provider_auth");
    expect(text).not.toContain(KEY);
    expect(h.calls).toHaveLength(1);
  });

  it("redacts the key if a provider error body echoes it", async () => {
    const h = harness([new Response(`invalid parameter near ${KEY}`, { status: 400 })]);
    const text = await (await handleAssistantRequest(post(body()), env, h.deps)).text();
    expect(JSON.parse(text).error.code).toBe("provider_rejected");
    expect(text).not.toContain(KEY);
    expect(text).toContain("[redacted]");
  });

  it("retries once on 429 and succeeds", async () => {
    const h = harness([new Response("slow down", { status: 429 }), completion(proposal)]);
    const out = await (await handleAssistantRequest(post(body()), env, h.deps)).json();
    expect(out.ok).toBe(true);
    expect(out.meta.attempts).toBe(2);
  });

  it("gives up after two transient failures with a retryable error", async () => {
    const h = harness([new Response("", { status: 503 }), new Response("", { status: 503 })]);
    const out = await (await handleAssistantRequest(post(body()), env, h.deps)).json();
    expect(out.error).toMatchObject({ code: "provider_unavailable", retryable: true });
  });

  it("reports timeouts", async () => {
    const t = new Error("timed out");
    t.name = "TimeoutError";
    const h = harness([t, t]);
    const out = await (await handleAssistantRequest(post(body()), env, h.deps)).json();
    expect(out.error.code).toBe("provider_timeout");
  });

  it("rejects non-JSON, off-schema and truncated model output", async () => {
    for (const [resp, code] of [
      [completion("Sure! Here's your house: ..."), "malformed_output"],
      [completion({ intent: "generate_design" }), "malformed_output"],
      [completion(proposal, "length"), "truncated_output"],
    ] as const) {
      const h = harness([resp]);
      const out = await (await handleAssistantRequest(post(body()), env, h.deps)).json();
      expect(out.ok).toBe(false);
      expect(out.error.code).toBe(code);
    }
  });

  it("logs metadata only — never the user's instruction or the model output", async () => {
    const h = harness([completion(proposal)]);
    await handleAssistantRequest(post(body()), env, h.deps);
    const logged = JSON.stringify(h.logs);
    expect(logged).not.toContain("SECRET-USER-TEXT");
    expect(logged).not.toContain("Here is a layout");
    expect(logged).not.toContain(KEY);
    expect(h.logs[0]).toMatchObject({ ok: true, mode: "design" });
  });
});
