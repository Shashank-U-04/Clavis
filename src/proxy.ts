/**
 * Before every page: keep the sign-in fresh, and keep the studio and the app behind it.
 *
 * The site's pages (home, features, docs, about, legal) are open to everyone. The studio and
 * the app (new design, your projects, templates, history, profile, settings) need an account:
 * someone not signed in is sent to sign in and brought back to where they were going. Someone
 * already signed in who opens the sign-in page goes straight on.
 *
 * This is the quick check, from the session cookie; the server checks the session again for
 * anything that matters (the assistant, the database's row rules). With accounts switched off
 * (local development, tests), nothing is gated.
 */

import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/proxy";
import { authConfigured } from "@/lib/auth/config";
import { safeNext } from "@/lib/auth/next";

/** Paths that need an account (each with everything under it). */
export const PRIVATE = ["/studio", "/new", "/dashboard", "/plans", "/templates", "/history", "/profile", "/settings"];
const SIGN_IN = ["/login", "/signup"];

const under = (path: string, roots: readonly string[]) => roots.some((r) => path === r || path.startsWith(`${r}/`));

export async function proxy(request: NextRequest) {
  const { response, signedIn } = await refreshSession(request);
  if (!authConfigured()) return response;
  const { pathname, search } = request.nextUrl;

  if (!signedIn && under(pathname, PRIVATE)) {
    const to = new URL("/login", request.url);
    to.searchParams.set("next", pathname + search);
    return NextResponse.redirect(to);
  }
  if (signedIn && under(pathname, SIGN_IN)) {
    return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url));
  }
  return response;
}

export const config = {
  // everything except build assets, images and files with an extension (fonts, svg, json…)
  matcher: ["/((?!_next/static|_next/image|favicon\\.svg|.*\\.[a-zA-Z0-9]+$).*)"],
};
