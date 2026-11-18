/** Where to go after signing in: a path on this site only, never an absolute or protocol-relative URL. */
export const safeNext = (raw: string | null | undefined, fallback = "/dashboard"): string =>
  raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : fallback;
