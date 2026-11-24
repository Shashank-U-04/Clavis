/**
 * Clavis's MCP server: the Model Context Protocol over plain HTTP ("streamable HTTP", without
 * the optional event stream). Each POST carries one JSON-RPC message or a batch of them; every
 * request is answered in the response body as JSON, and notifications get 202. The server
 * keeps no session: the bearer token on each request says whose plans it works on.
 *
 * The runtime-free part lives here, so the tests drive it without a network or a database;
 * src/app/api/mcp/route.ts wires in the token check and the person's plans.
 */

import { callTool, toolList, type ToolContext } from "./tools";

export const SERVER_NAME = "clavis";
export const SERVER_VERSION = "1.0.0";
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export const INSTRUCTIONS = [
  "Clavis designs homes in metres. Every plan belongs to the person whose token this is.",
  "Start with list_plans or create_plan. Read a plan with get_plan before editing it: use its exact ids.",
  "Edit with apply_operations (describe_operations lists them); check the result with check_plan.",
  "Ask the person before removing anything. Every saved edit keeps the previous state as a version in Clavis.",
].join(" ");

type Id = string | number;
interface RpcRequest {
  jsonrpc: "2.0";
  id?: Id | null;
  method: string;
  params?: Record<string, unknown>;
}
export type RpcResponse = { jsonrpc: "2.0"; id: Id | null; result: unknown } | { jsonrpc: "2.0"; id: Id | null; error: { code: number; message: string; data?: unknown } };

export const RPC = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 } as const;

const err = (id: Id | null, code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });
const res = (id: Id, result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result });

const isRequest = (m: unknown): m is RpcRequest =>
  !!m && typeof m === "object" && (m as RpcRequest).jsonrpc === "2.0" && typeof (m as RpcRequest).method === "string";
const hasId = (m: RpcRequest): m is RpcRequest & { id: Id } => typeof m.id === "string" || typeof m.id === "number";

/** Agree on a protocol version: the client's, when we speak it; else our newest. */
export function negotiate(asked: unknown): string {
  return typeof asked === "string" && (PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : PROTOCOL_VERSIONS[0];
}

async function handleOne(msg: unknown, ctx: ToolContext): Promise<RpcResponse | null> {
  if (!isRequest(msg)) {
    // a response from the client (we never ask it anything) or garbage
    const looksLikeResponse = !!msg && typeof msg === "object" && "id" in msg && ("result" in msg || "error" in msg);
    return looksLikeResponse ? null : err(null, RPC.invalidRequest, "Not a JSON-RPC 2.0 request.");
  }
  // notifications (initialized, cancelled…) need no answer
  if (!hasId(msg)) return null;
  const p = msg.params ?? {};

  switch (msg.method) {
    case "initialize":
      return res(msg.id, {
        protocolVersion: negotiate(p.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, title: "Clavis", version: SERVER_VERSION },
        instructions: INSTRUCTIONS,
      });
    case "ping":
      return res(msg.id, {});
    case "tools/list":
      return res(msg.id, { tools: toolList(ctx.access) });
    case "tools/call": {
      if (typeof p.name !== "string") return err(msg.id, RPC.invalidParams, "tools/call needs a tool name.");
      const out = await callTool(p.name, p.arguments, ctx);
      if (!out.found) return err(msg.id, RPC.invalidParams, `Unknown tool: ${p.name}`);
      return res(msg.id, out.result);
    }
    // nothing to offer here, but say so politely rather than erroring
    case "resources/list":
      return res(msg.id, { resources: [] });
    case "resources/templates/list":
      return res(msg.id, { resourceTemplates: [] });
    case "prompts/list":
      return res(msg.id, { prompts: [] });
    default:
      return err(msg.id, RPC.methodNotFound, `Method not found: ${msg.method}`);
  }
}

/**
 * Answer a POST body. Returns null when there is nothing to send back (only notifications
 * or responses), which the route turns into 202.
 */
export async function handleRpc(body: unknown, ctx: ToolContext): Promise<RpcResponse | RpcResponse[] | null> {
  if (Array.isArray(body)) {
    if (body.length === 0) return err(null, RPC.invalidRequest, "Empty batch.");
    const out = (await Promise.all(body.map((m) => handleOne(m, ctx)))).filter((r): r is RpcResponse => r !== null);
    return out.length ? out : null;
  }
  return handleOne(body, ctx);
}

/** What any POST needs before a token is even looked at: is the body JSON-RPC at all? */
export function parseBody(text: string): { ok: true; body: unknown } | { ok: false; response: RpcResponse } {
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: err(null, RPC.parse, "The body is not valid JSON.") };
  }
}
