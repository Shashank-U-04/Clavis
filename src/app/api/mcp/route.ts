/**
 * The MCP endpoint outside AI agents connect to: POST JSON-RPC with
 * `Authorization: Bearer clv_…` (a token made in Settings → MCP). See server/mcp/.
 *
 * GET would open a server-to-client event stream; Clavis never sends unprompted messages, so
 * it answers 405 as the protocol allows. No cookies are read, so any origin may call it.
 */

import { handleRpc, parseBody } from "../../../../server/mcp/protocol";
import { verifyToken } from "../../../../server/mcp/tokens";
import { accountStore, metadataVault } from "../../../../server/mcp/supabase";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, accept, mcp-protocol-version, mcp-session-id",
  "access-control-expose-headers": "www-authenticate",
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS, ...extra } });

const MAX_BODY = 1_000_000;

export async function POST(request: Request) {
  const admin = supabaseAdmin();
  if (!admin) return json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Accounts are not switched on for this Clavis, so there are no plans to work on." } }, 503);

  const auth = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1] ?? "";
  const vault = metadataVault(admin);
  const caller = token ? await verifyToken(vault, token).catch(() => null) : null;
  if (!caller) {
    return json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "A valid Clavis token is required. Make one in Clavis: Settings → MCP." } },
      401,
      { "www-authenticate": 'Bearer realm="clavis", error="invalid_token"' },
    );
  }

  const text = await request.text();
  if (text.length > MAX_BODY) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "The request is too large." } }, 413);
  const parsed = parseBody(text);
  if (!parsed.ok) return json(parsed.response, 400);

  const origin = new URL(request.url).origin;
  const out = await handleRpc(parsed.body, { store: accountStore(admin, caller.userId), access: caller.access, origin });
  if (out === null) return new Response(null, { status: 202, headers: CORS });
  console.log(JSON.stringify({ svc: "clavis-mcp", token: caller.tokenId, calls: Array.isArray(parsed.body) ? parsed.body.length : 1 }));
  return json(out);
}

const noStream = () => new Response("Clavis's MCP server answers POST requests only.", { status: 405, headers: { allow: "POST, OPTIONS", ...CORS } });
export const GET = noStream;
export const DELETE = noStream;
export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
