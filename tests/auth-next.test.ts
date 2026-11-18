import { describe, it, expect } from "vitest";
import { safeNext } from "../src/lib/auth/next";

describe("after sign-in", () => {
  it("goes only to paths on this site", () => {
    expect(safeNext("/plans/abc?x=1")).toBe("/plans/abc?x=1");
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext(String.raw`/\evil.example`)).toBe("/dashboard");
    expect(safeNext("javascript:alert(1)")).toBe("/dashboard");
  });
});
