import type { NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/proxy";

export function proxy(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  // everything except build assets, images and files with an extension (fonts, svg, json…)
  matcher: ["/((?!_next/static|_next/image|favicon\\.svg|.*\\.[a-zA-Z0-9]+$).*)"],
};
