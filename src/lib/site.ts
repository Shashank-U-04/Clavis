/**
 * The site's public address and its public pages, for metadata, the sitemap and robots.txt.
 * The address is set explicitly (NEXT_PUBLIC_SITE_URL), else the production domain Vercel
 * provides, else local development.
 */

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:5199")
).replace(/\/+$/, "");

/** Pages anyone may open, with how much each matters for search (0..1). */
export const PUBLIC_PAGES: readonly { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/features", priority: 0.8 },
  { path: "/features/ai-design", priority: 0.7 },
  { path: "/features/validation", priority: 0.7 },
  { path: "/features/3d", priority: 0.7 },
  { path: "/features/projects", priority: 0.7 },
  { path: "/how-it-works", priority: 0.7 },
  { path: "/docs", priority: 0.6 },
  { path: "/about", priority: 0.5 },
  { path: "/privacy", priority: 0.3 },
  { path: "/terms", priority: 0.3 },
];

/** Everything behind sign-in, and the APIs: kept out of search. */
export const PRIVATE_PREFIXES = ["/api/", "/auth/", "/studio", "/new", "/dashboard", "/plans", "/templates", "/history", "/profile", "/settings", "/login", "/signup"];
