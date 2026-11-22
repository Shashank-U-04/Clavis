import { describe, it, expect, vi, beforeAll } from "vitest";
import { NextRequest } from "next/server";

// accounts switched on for this file (the values only need to look configured: a visitor with no
// session cookie never reaches the network)
let proxy: (r: NextRequest) => Promise<Response>;
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_test");
  vi.resetModules();
  ({ proxy } = await import("../src/proxy"));
});

const visit = (path: string) => proxy(new NextRequest(new URL(path, "https://clavis.test")));

describe("the studio and the app need an account", () => {
  it.each(["/studio/try?template=linden-heights", "/new", "/dashboard", "/plans/abc", "/templates", "/settings"])("signed out, %s sends you to sign in and back", async (path) => {
    const res = await visit(path);
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("next")).toBe(path);
  });

  it.each(["/", "/features", "/features/3d", "/how-it-works", "/docs", "/about", "/privacy", "/login"])("signed out, %s is open", async (path) => {
    const res = await visit(path);
    expect(res.headers.get("location")).toBeNull();
  });

  it("a path that only starts like a private one is not caught", async () => {
    expect((await visit("/newsroom")).headers.get("location")).toBeNull();
  });
});
