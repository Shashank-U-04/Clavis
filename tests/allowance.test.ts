import { describe, it, expect } from "vitest";
import { withAllowance, type AllowanceDeps } from "../server/allowance";

const post = () => new Request("http://localhost/api/assistant", { method: "POST", body: "{}" });
const ok = () => new Response(JSON.stringify({ ok: true, mode: "design", proposal: {}, meta: { model: "m", latencyMs: 1, attempts: 1 } }), { status: 200 });
const fail = (code: string, status = 503) => new Response(JSON.stringify({ ok: false, error: { code, message: "x", retryable: true } }), { status });

function deps(user: string | null, start = 0, cap = 3) {
  let used = start;
  const refunds: string[] = [];
  const d: AllowanceDeps = {
    userId: async () => user,
    consume: async (_u, c) => (used < c ? c - ++used : -1),
    refund: async (u) => void (refunds.push(u), (used = Math.max(0, used - 1))),
  };
  return { d, refunds, used: () => used, cap };
}

describe("a signed-in person's daily allowance", () => {
  it("guests pass straight through, uncounted", async () => {
    const t = deps(null);
    const res = await withAllowance(post(), 3, t.d, async () => ok());
    expect(res.status).toBe(200);
    expect((await res.json()).meta.accountLeft).toBeUndefined();
    expect(t.used()).toBe(0);
  });

  it("counts each answer and says how many are left, then refuses once it is used up", async () => {
    const t = deps("u1", 1, 3);
    const first = await (await withAllowance(post(), 3, t.d, async () => ok())).json();
    expect(first.meta.accountLeft).toBe(1);
    await withAllowance(post(), 3, t.d, async () => ok());
    let asked = false;
    const res = await withAllowance(post(), 3, t.d, async () => ((asked = true), ok()));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatchObject({ code: "daily_cap", retryable: false });
    expect(asked).toBe(false); // the model is not even asked
  });

  it("gives the request back when the model did no work, but not when it answered badly", async () => {
    const t = deps("u1");
    await withAllowance(post(), 3, t.d, async () => fail("provider_rate_limited"));
    expect(t.used()).toBe(0);
    expect(t.refunds).toEqual(["u1"]);
    await withAllowance(post(), 3, t.d, async () => fail("malformed_output", 502));
    expect(t.used()).toBe(1);
  });

  it("lets requests through when the count is unavailable, rather than blocking everyone", async () => {
    const d: AllowanceDeps = { userId: async () => "u1", consume: async () => null, refund: async () => {} };
    const res = await withAllowance(post(), 3, d, async () => ok());
    expect(res.status).toBe(200);
  });
});
