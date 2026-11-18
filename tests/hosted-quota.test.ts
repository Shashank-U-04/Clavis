import { describe, it, expect } from "vitest";
import { HOSTED_DAILY_CAP, dayOf, hostedQuota } from "../src/ai/hostedQuota";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};

describe("hosted allowance", () => {
  it("counts down within a day and starts again the next", () => {
    const s = memory();
    const mon = new Date(2026, 10, 23, 23, 50);
    const tue = new Date(2026, 10, 24, 0, 5);
    hostedQuota.record(mon, s);
    hostedQuota.record(mon, s);
    expect(hostedQuota.remaining(mon, s)).toBe(HOSTED_DAILY_CAP - 2);
    expect(hostedQuota.remaining(tue, s)).toBe(HOSTED_DAILY_CAP);
    expect(dayOf(tue)).toBe("2026-11-24");
  });

  it("refunds never go below zero use, and junk or missing storage means a full allowance", () => {
    const s = memory();
    const now = new Date(2026, 10, 18);
    hostedQuota.refund(now, s);
    expect(hostedQuota.remaining(now, s)).toBe(HOSTED_DAILY_CAP);
    s.setItem("clavis:hosted-usage", "{not json");
    expect(hostedQuota.remaining(now, s)).toBe(HOSTED_DAILY_CAP);
    expect(hostedQuota.remaining(now, null)).toBe(HOSTED_DAILY_CAP);
    for (let i = 0; i < HOSTED_DAILY_CAP + 3; i++) hostedQuota.record(now, s);
    expect(hostedQuota.remaining(now, s)).toBe(0);
  });
});
