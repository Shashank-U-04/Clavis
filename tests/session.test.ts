import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { assistant, session } from "../src/ai/session";
import { dispatch, store } from "../src/model/store";
import { emptyModel } from "../src/model/types";
import { COMPACT_TWO_BEDROOM } from "../src/model/templates";
import { HOSTED_DAILY_CAP } from "../src/ai/hostedQuota";

/** an in-memory localStorage, so the daily allowance can be exercised in node */
function stubStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) });
  return data;
}

const hostedReply = {
  ok: true,
  mode: "design",
  proposal: { intent: "query", reply: "From the hosted model.", operations: [], clarifying_questions: [], rationale: "", expected_checks: [] },
  meta: { model: "openai/gpt-oss-120b", latencyMs: 5, attempts: 1, remainingToday: 640 },
};

/** fetch stub: GET → status; POST → the hosted reply. Records POSTs. */
function stubFetch(configured: boolean) {
  const posts: unknown[] = [];
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init || init.method === "GET") {
      return new Response(JSON.stringify({ configured, provider: "groq", label: "Groq", model: "openai/gpt-oss-120b" }));
    }
    posts.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify(hostedReply));
  });
  vi.stubGlobal("fetch", fn);
  return posts;
}

const lastReply = () => session.getState().turns.at(-1)!;

beforeEach(() => {
  store.setState({ model: emptyModel(), revision: 0, undoStack: [], redoStack: [], notes: [] });
  dispatch(COMPACT_TWO_BEDROOM);
  session.setState({ turns: [], busy: false, previewTurnId: null, hosted: null, provider: "auto" });
});
afterEach(() => vi.unstubAllGlobals());

describe("assistant providers", () => {
  it("reads the server status", async () => {
    stubFetch(true);
    await assistant.checkHosted();
    expect(session.getState().hosted).toMatchObject({ configured: true, label: "Groq" });
  });

  it("auto: Clavis Local answers what it understands, without calling the server", async () => {
    const posts = stubFetch(true);
    await assistant.checkHosted();
    await assistant.ask("how many bedrooms?");
    expect(lastReply().check?.model).toBe("clavis-local");
    expect(lastReply().text).toBe("2 bedroom(s).");
    expect(posts).toHaveLength(0);
  });

  it("auto: hands over to the hosted model only when Local does not understand", async () => {
    const posts = stubFetch(true);
    await assistant.checkHosted();
    await assistant.ask("make the kitchen feel more Scandinavian");
    expect(posts).toHaveLength(1);
    expect(lastReply().check?.model).toBe("openai/gpt-oss-120b");
    expect(lastReply().text).toBe("From the hosted model.");
  });

  it("auto: a busy hosted model is reported (with a retry), not hidden behind Local's reply", async () => {
    let busy = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (!init || init.method === "GET") return new Response(JSON.stringify({ configured: true, label: "Groq", model: "m" }));
        if (busy) {
          return new Response(JSON.stringify({ ok: false, error: { code: "provider_rate_limited", message: "The Groq rate limit was reached. Try again in about 40 s.", retryable: true } }), { status: 503 });
        }
        return new Response(JSON.stringify(hostedReply));
      }),
    );
    await assistant.checkHosted();
    await assistant.ask("make the kitchen feel more Scandinavian");
    const failed = lastReply();
    expect(failed.state).toBe("error");
    expect(failed.error).toMatchObject({ code: "provider_rate_limited", retryable: true });
    busy = false;
    await assistant.retry(failed.id);
    expect(lastReply().text).toBe("From the hosted model.");
    expect(session.getState().turns.filter((t) => t.role === "user")).toHaveLength(2);
  });

  it("auto without a hosted model keeps Local's honest 'not understood' answer", async () => {
    const posts = stubFetch(false);
    await assistant.checkHosted();
    await assistant.ask("make the kitchen feel more Scandinavian");
    expect(posts).toHaveLength(0);
    expect(lastReply().check?.proposal.intent).toBe("unsupported");
  });

  it("hosted requests come out of a daily allowance per browser; Local never does", async () => {
    stubStorage();
    const posts = stubFetch(true);
    await assistant.checkHosted();
    for (let i = 0; i < HOSTED_DAILY_CAP; i++) await assistant.ask("make the kitchen feel more Scandinavian");
    expect(posts).toHaveLength(HOSTED_DAILY_CAP);
    expect(session.getState()).toMatchObject({ browserLeft: 0, sharedLeft: 640 });

    await assistant.ask("make the kitchen feel more Scandinavian");
    expect(posts).toHaveLength(HOSTED_DAILY_CAP);
    expect(lastReply().error).toMatchObject({ code: "daily_cap", retryable: false });

    await assistant.ask("how many bedrooms?");
    expect(lastReply().check?.model).toBe("clavis-local");
  });

  it("a request the busy model never answered is not counted", async () => {
    stubStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        !init || init.method === "GET"
          ? new Response(JSON.stringify({ configured: true, label: "Groq", model: "m" }))
          : new Response(JSON.stringify({ ok: false, error: { code: "provider_rate_limited", message: "busy", retryable: true } }), { status: 503 }),
      ),
    );
    await assistant.checkHosted();
    await assistant.ask("make the kitchen feel more Scandinavian");
    expect(session.getState().browserLeft).toBe(HOSTED_DAILY_CAP);
  });

  it("an unreachable server counts as not configured", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    await assistant.checkHosted();
    expect(session.getState().hosted?.configured).toBe(false);
  });
});
