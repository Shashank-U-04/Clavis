/**
 * Where GitHub sign-in, magic links and email confirmations return to. Accounts are connected
 * in the next phase; until then this sends people to the sign-in page with an explanation.
 */

import { NextResponse } from "next/server";
import { authConfigured } from "@/lib/auth/config";

export function GET(request: Request) {
  const url = new URL(request.url);
  const next = authConfigured() ? "/dashboard" : "/login?accounts=off";
  return NextResponse.redirect(new URL(next, url.origin));
}
