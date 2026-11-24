import { describe, it, expect } from "vitest";
import sitemap from "../src/app/sitemap";
import robots from "../src/app/robots";
import { PRIVATE_PREFIXES, PUBLIC_PAGES, SITE_URL } from "../src/lib/site";
import { PRIVATE } from "../src/proxy";

describe("sitemap and robots", () => {
  it("lists every public page once, on the site's address", () => {
    const urls = sitemap().map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain(SITE_URL);
    expect(urls).toContain(`${SITE_URL}/docs`);
    expect(urls.length).toBe(PUBLIC_PAGES.length);
  });

  it("keeps everything behind sign-in out of the sitemap and out of search", () => {
    for (const p of PRIVATE) expect(PRIVATE_PREFIXES).toContain(p);
    for (const page of PUBLIC_PAGES) expect(PRIVATE.some((p) => page.path === p || page.path.startsWith(`${p}/`))).toBe(false);
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.disallow).toEqual(PRIVATE_PREFIXES);
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
