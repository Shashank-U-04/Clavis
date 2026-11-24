/**
 * The signed-in person's MCP tokens, for the MCP panel in the app: list them (GET), make one
 * (POST {name, access}; the token itself is shown only in this response), revoke one
 * (DELETE ?id=). Runs as the person from their session cookie; tokens are written with the
 * service role into their account's app metadata.
 */

import { createToken, listTokens, revokeToken, type TokenAccess } from "../../../../../server/mcp/tokens";
import { metadataVault } from "../../../../../server/mcp/supabase";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

async function who(): Promise<string | null> {
  const sb = await supabaseServer();
  if (!sb) return null;
  const { data } = await sb.auth.getClaims();
  return typeof data?.claims?.sub === "string" ? data.claims.sub : null;
}

async function setup() {
  const admin = supabaseAdmin();
  if (!admin) return { error: json({ ok: false, message: "Accounts are not switched on here, so MCP tokens cannot be made." }, 503) } as const;
  const userId = await who();
  if (!userId) return { error: json({ ok: false, message: "Sign in to manage MCP tokens." }, 401) } as const;
  return { userId, vault: metadataVault(admin) } as const;
}

export async function GET() {
  const s = await setup();
  if ("error" in s) return s.error;
  try {
    return json({ ok: true, tokens: await listTokens(s.vault, s.userId) });
  } catch {
    return json({ ok: false, message: "Your tokens could not be read just now. Try again." }, 502);
  }
}

export async function POST(request: Request) {
  const s = await setup();
  if ("error" in s) return s.error;
  let body: { name?: unknown; access?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    /* defaults below */
  }
  const access: TokenAccess = body.access === "read" ? "read" : "edit";
  const name = typeof body.name === "string" ? body.name : "";
  try {
    const r = await createToken(s.vault, s.userId, name, access);
    return r.ok ? json({ ok: true, token: r.token, info: r.info }) : json({ ok: false, message: r.message }, 409);
  } catch {
    return json({ ok: false, message: "The token could not be made just now. Try again." }, 502);
  }
}

export async function DELETE(request: Request) {
  const s = await setup();
  if ("error" in s) return s.error;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  try {
    return (await revokeToken(s.vault, s.userId, id)) ? json({ ok: true }) : json({ ok: false, message: "No such token." }, 404);
  } catch {
    return json({ ok: false, message: "The token could not be revoked just now. Try again." }, 502);
  }
}
