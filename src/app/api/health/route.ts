/**
 * A heartbeat: answers whether the site and its database are up. It runs one tiny query,
 * which also keeps a free Supabase project from pausing for inactivity (the keep-awake
 * workflow in .github/workflows calls it twice a week). Says nothing else about the system.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = supabaseAdmin();
  let database: "up" | "down" | "not configured" = "not configured";
  if (admin) {
    const { error } = await admin.from("profiles").select("id", { count: "exact", head: true }).limit(1);
    database = error ? "down" : "up";
  }
  const ok = database !== "down";
  return new Response(JSON.stringify({ ok, database }), {
    status: ok ? 200 : 503,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
