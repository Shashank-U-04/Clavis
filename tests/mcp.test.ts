import { describe, it, expect } from "vitest";
import { createToken, listTokens, parseToken, revokeToken, verifyToken, MAX_TOKENS, type StoredToken, type TokenVault } from "../server/mcp/tokens";
import { handleRpc, negotiate, parseBody, PROTOCOL_VERSIONS, type RpcResponse } from "../server/mcp/protocol";
import { remoteStore } from "../server/mcp/store";
import { toolList, type ToolContext } from "../server/mcp/tools";
import { syncWorkspace } from "../src/lib/account/sync";
import { listProjects, loadProject, saveProject } from "../src/model/library";
import { listEvents, listVersions } from "../src/lib/workspace/browser";
import { templateModel } from "../src/model/templates";
import { MCP_TOOLS } from "../src/components/mcp/tools";
import { memoryCloud } from "./helpers/memoryCloud";
import { memoryStorage } from "./helpers/memoryStorage";

const USER = "0b9a4f1e-7c2d-4e3a-9f10-1234567890ab";

function memoryVault(): TokenVault & { data: Map<string, StoredToken[]> } {
  const data = new Map<string, StoredToken[]>([[USER, []]]);
  return {
    data,
    read: async (id) => (data.has(id) ? structuredClone(data.get(id)!) : null),
    write: async (id, t) => void data.set(id, structuredClone(t)),
  };
}

describe("MCP tokens", () => {
  it("makes a token that verifies, keeps only its hash, and stops working once revoked", async () => {
    const vault = memoryVault();
    const made = await createToken(vault, USER, "My agent", "edit", 1000);
    if (!made.ok) throw new Error(made.message);
    expect(made.token.startsWith(`clv_${USER}_`)).toBe(true);
    expect(JSON.stringify(vault.data.get(USER))).not.toContain(made.token.split("_").at(-1));

    expect(await verifyToken(vault, made.token, 2000)).toEqual({ userId: USER, tokenId: made.info.id, access: "edit" });
    expect((await listTokens(vault, USER))[0]).toMatchObject({ name: "My agent", access: "edit", used: 2000 });
    expect((await listTokens(vault, USER))[0]).not.toHaveProperty("hash");

    expect(await revokeToken(vault, USER, made.info.id)).toBe(true);
    expect(await verifyToken(vault, made.token)).toBeNull();
  });

  it("refuses look-alikes and other people's ids", async () => {
    const vault = memoryVault();
    const made = await createToken(vault, USER, "", "read");
    if (!made.ok) throw new Error(made.message);
    expect(made.info.name).toBe("Agent");
    const secret = made.token.split("_").at(-1)!;
    expect(await verifyToken(vault, `clv_${USER}_${secret.slice(0, -1)}x`)).toBeNull();
    expect(await verifyToken(vault, `clv_1b9a4f1e-7c2d-4e3a-9f10-1234567890ab_${secret}`)).toBeNull();
    expect(parseToken("Bearer nonsense")).toBeNull();
    expect(parseToken(`clv_not-a-uuid_${secret}`)).toBeNull();
  });

  it(`allows at most ${MAX_TOKENS} tokens`, async () => {
    const vault = memoryVault();
    for (let i = 0; i < MAX_TOKENS; i++) expect((await createToken(vault, USER, `t${i}`, "read")).ok).toBe(true);
    expect((await createToken(vault, USER, "one more", "read")).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------- protocol

function setup(access: "read" | "edit" = "edit") {
  const cloud = memoryCloud();
  const ctx: ToolContext = { store: remoteStore(cloud.remote, () => 50_000), access, origin: "https://clavis.example" };
  let n = 0;
  const call = async (method: string, params?: Record<string, unknown>) => (await handleRpc({ jsonrpc: "2.0", id: ++n, method, params }, ctx)) as RpcResponse & { result?: any; error?: any };
  const tool = async (name: string, args: Record<string, unknown> = {}) => (await call("tools/call", { name, arguments: args })).result as { isError?: boolean; content: { text: string }[]; structuredContent?: any };
  return { cloud, ctx, call, tool };
}

describe("MCP protocol", () => {
  it("initializes with the client's protocol version when it is one we speak", async () => {
    const { call } = setup();
    const r = await call("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(r.result.protocolVersion).toBe("2025-03-26");
    expect(r.result.serverInfo.name).toBe("clavis");
    expect(r.result.capabilities.tools).toBeDefined();
    expect(negotiate("1999-01-01")).toBe(PROTOCOL_VERSIONS[0]);
  });

  it("answers ping, ignores notifications, reports unknown methods and bad JSON", async () => {
    const { call, ctx } = setup();
    expect((await call("ping")).result).toEqual({});
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx)).toBeNull();
    expect((await call("sampling/createMessage")).error.code).toBe(-32601);
    expect((await handleRpc({ hello: 1 }, ctx)) as RpcResponse).toMatchObject({ error: { code: -32600 } });
    const bad = parseBody("{nope");
    expect(bad.ok).toBe(false);
  });

  it("handles a batch, answering only the requests", async () => {
    const { ctx } = setup();
    const out = (await handleRpc(
      [
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: "a", method: "ping" },
        { jsonrpc: "2.0", id: "b", method: "tools/list" },
      ],
      ctx,
    )) as RpcResponse[];
    expect(out.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("lists every tool with a JSON schema; a read token sees only the read tools", async () => {
    const all = toolList("edit");
    expect(all.map((t) => t.name)).toEqual(["list_plans", "get_plan", "check_plan", "describe_operations", "list_catalog", "list_templates", "create_plan", "apply_operations"]);
    for (const t of all) expect(t.inputSchema.type).toBe("object");
    expect(toolList("read").every((t) => t.annotations.readOnlyHint)).toBe(true);
    expect(toolList("read").map((t) => t.name)).not.toContain("apply_operations");
    // what the app and docs list is what the server offers
    expect(MCP_TOOLS.map(([k]) => k).sort()).toEqual(all.map((t) => t.name).sort());
  });
});

// ------------------------------------------------------------------------------- tools

describe("MCP tools", () => {
  it("creates a plan from a template, reads it and checks it", async () => {
    const { tool, cloud } = setup();
    const made = await tool("create_plan", { template: "compact-two-bedroom", name: "Agent's flat" });
    expect(made.isError).toBeFalsy();
    const id = made.structuredContent.plan.id as string;
    expect(cloud.plans.get(id)?.meta.name).toBe("Agent's flat");
    expect(made.structuredContent.studio).toBe(`https://clavis.example/studio/try?project=${id}`);

    const list = await tool("list_plans");
    expect(list.structuredContent.plans.map((p: { id: string }) => p.id)).toEqual([id]);

    const got = await tool("get_plan", { plan_id: id });
    expect(got.structuredContent.rooms.length).toBeGreaterThan(3);
    expect(got.structuredContent.floors[0].id).toBe("ground");
    expect(got.structuredContent.validation.counts).toBeDefined();

    const checked = await tool("check_plan", { plan_id: id });
    expect(checked.structuredContent.counts).toBeDefined();
    expect(checked.structuredContent.not_walkable).toEqual([]);
  });

  it("lays out a plan from a brief", async () => {
    const { tool } = setup();
    const made = await tool("create_plan", { brief: "2 bedrooms, 1 bathroom, open kitchen, about 80 m2" });
    expect(made.isError).toBeFalsy();
    expect(made.structuredContent.plan.rooms).toBeGreaterThanOrEqual(4);
  });

  it("edits a plan, keeps the old state as a version, and the browser's sync brings the edit in", async () => {
    const { tool, cloud } = setup();
    // a plan made in the browser and synced up
    const browser = memoryStorage();
    saveProject(browser, "p1", { ...templateModel(), name: "Home" }, [], 1000);
    await syncWorkspace(browser, cloud.remote);

    const got = await tool("get_plan", { plan_id: "p1" });
    const bedroom = got.structuredContent.rooms.find((r: { label: string }) => /bed/i.test(r.label));
    const before = got.structuredContent.totals.items as number;

    const dry = await tool("apply_operations", { plan_id: "p1", dry_run: true, operations: [{ op: "place_item_in_room", kind: "plant", roomId: bedroom.id, against: "north", along: 0.1 }] });
    expect(dry.isError).toBeFalsy();
    expect(cloud.versions.size).toBe(0);

    const edit = await tool("apply_operations", { plan_id: "p1", note: "Add a plant", operations: [{ op: "place_item_in_room", kind: "plant", roomId: bedroom.id, against: "north", along: 0.1 }] });
    expect(edit.isError).toBeFalsy();
    expect(cloud.versions.size).toBe(1);

    await syncWorkspace(browser, cloud.remote);
    const doc = loadProject(browser, "p1");
    expect(doc.ok && doc.value.model.items.length).toBe(before + 1);
    expect(listVersions(browser, "p1")[0].label).toBe("Before an agent's change");
    expect(listEvents(browser)[0]).toMatchObject({ kind: "edited", planId: "p1", detail: "Add a plant (by an agent)" });
    expect(listProjects(browser)[0].updatedAt).toBe(50_000);
  });

  it("asks before removing work, and saves nothing when an operation fails", async () => {
    const { tool, cloud } = setup();
    const made = await tool("create_plan", { template: "compact-two-bedroom" });
    const id = made.structuredContent.plan.id as string;
    const got = await tool("get_plan", { plan_id: id });
    const wall = got.structuredContent.walls[0].id;

    const ask = await tool("apply_operations", { plan_id: id, operations: [{ op: "remove_wall", id: wall }] });
    expect(ask.isError).toBe(true);
    expect(ask.content[0].text).toContain("allow_removals");

    const broken = await tool("apply_operations", { plan_id: id, operations: [{ op: "rename_plan", name: "New" }, { op: "move_item", id: "nope", x: 1 }] });
    expect(broken.isError).toBe(true);
    expect(broken.content[0].text).toContain("Operation 1");
    expect(cloud.plans.get(id)?.meta.name).not.toBe("New");

    const removed = await tool("apply_operations", { plan_id: id, allow_removals: true, operations: [{ op: "remove_wall", id: wall }] });
    expect(removed.isError).toBeFalsy();
  });

  it("refuses edits with a read token and unknown plans or tools", async () => {
    const { tool, call } = setup("read");
    const r = await tool("create_plan", { template: "compact-two-bedroom" });
    expect(r.isError).toBe(true);
    expect((await tool("get_plan", { plan_id: "missing" })).isError).toBe(true);
    expect((await tool("get_plan", {})).content[0].text).toContain("plan_id");
    expect((await call("tools/call", { name: "nope" })).error.code).toBe(-32602);
  });
});
