import { describe, it, expect, beforeEach } from "vitest";
import { applyChecked, explain, propose, type Transport } from "../src/ai/workflow";
import { dispatch, issuesFor, store } from "../src/model/store";
import { emptyModel } from "../src/model/types";
import { COMPACT_TWO_BEDROOM } from "../src/model/templates";
import type { AssistantRequest, AssistantResponse } from "../src/ai/contract";

const meta = { model: "muse-spark-1.3", latencyMs: 5, attempts: 1 };
const proposalOf = (operations: unknown[], extra: Record<string, unknown> = {}): AssistantResponse => ({
  ok: true,
  mode: "design",
  proposal: { intent: "edit_design", reply: "ok", operations, clarifying_questions: [], rationale: "r", expected_checks: [], ...extra },
  meta,
});

/** A scripted model: returns the queued responses in order and records every request. */
function scripted(responses: AssistantResponse[]) {
  const requests: AssistantRequest[] = [];
  const transport: Transport = async (req) => {
    requests.push(req);
    return responses.shift() ?? { ok: false, error: { code: "provider_unavailable", message: "empty", retryable: true } };
  };
  return { requests, transport };
}

beforeEach(() => {
  store.setState({ model: emptyModel(), revision: 0, undoStack: [], redoStack: [], notes: [] });
  dispatch(COMPACT_TWO_BEDROOM);
});

/** Put the bedroom-1 wardrobe in front of the bedroom-1 door: a deliberate, real conflict. */
function introduceDoorConflict() {
  const { model } = store.getState();
  const bed1 = model.rooms.find((r) => r.label === "Bedroom 1")!;
  const wardrobe = model.items.find((i) => i.kind === "wardrobe" && i.x > bed1.x && i.x < bed1.x + bed1.w)!;
  const door = model.openings.find((o) => {
    const w = model.walls.find((x) => x.id === o.wallId)!;
    return o.kind === "door" && w.ax === 6 && w.bx === 6;
  })!;
  const wall = model.walls.find((w) => w.id === door.wallId)!;
  const y = wall.ay + door.t * (wall.by - wall.ay);
  const r = dispatch([{ op: "move_item", id: wardrobe.id, x: 6.4, y, rotation: 90 }]);
  expect(r.ok).toBe(true);
  const issue = issuesFor(store.getState().model).find((i) => i.code === "item_blocks_door" && i.refs.includes(wardrobe.id))!;
  expect(issue).toBeTruthy();
  return { wardrobe, issue };
}

describe("propose", () => {
  it("sends app-computed context and dry-runs the proposal without applying it", async () => {
    const before = store.getState().model;
    const item = before.items[0];
    const s = scripted([proposalOf([{ op: "move_item", id: item.id, rotation: 90 }])]);
    const r = await propose("design", "rotate the counter", { transport: s.transport });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.check.preview?.ok).toBe(true);
    expect(store.getState().model).toBe(before); // nothing applied yet
    const design = s.requests[0].context.design as { revision: number; rooms: unknown[] };
    expect(design.revision).toBe(store.getState().revision);
    expect(design.rooms).toHaveLength(5);
  });

  it("feeds a validation rejection back once and reports that a revision happened", async () => {
    const item = store.getState().model.items[0];
    const s = scripted([
      proposalOf([{ op: "move_item", id: "item_that_does_not_exist", x: 1 }]),
      proposalOf([{ op: "move_item", id: item.id, x: item.x }]),
    ]);
    const r = await propose("design", "move it", { transport: s.transport });
    if (!r.ok) throw new Error(r.message);
    expect(r.check.attempts).toBe(2);
    expect(r.check.firstRejection).toMatch(/does not exist/);
    expect(s.requests[1].context.rejection).toMatch(/does not exist/);
    expect(r.check.preview?.ok).toBe(true);
  });

  it("stops after the second rejected proposal and shows it as rejected", async () => {
    const s = scripted([
      proposalOf([{ op: "remove_wall", id: "nope" }]),
      proposalOf([{ op: "remove_wall", id: "still_nope" }]),
    ]);
    const r = await propose("design", "x", { transport: s.transport });
    if (!r.ok) throw new Error(r.message);
    expect(r.check.preview?.ok).toBe(false);
    expect(s.requests).toHaveLength(2);
  });

  it("counts destructive operations for confirmation", async () => {
    const id = store.getState().model.items[0].id;
    const s = scripted([proposalOf([{ op: "remove_item", id }])]);
    const r = await propose("design", "remove it", { transport: s.transport });
    if (!r.ok) throw new Error(r.message);
    expect(r.check.destructiveCount).toBe(1);
  });

  it("passes provider errors through unchanged", async () => {
    const s = scripted([{ ok: false, error: { code: "provider_rate_limited", message: "slow", retryable: true } }]);
    const r = await propose("design", "x", { transport: s.transport });
    expect(r).toMatchObject({ ok: false, code: "provider_rate_limited", retryable: true });
  });
});

describe("repair loop", () => {
  it("reports a repair as successful only when re-validation shows the issue is gone", async () => {
    const { wardrobe, issue } = introduceDoorConflict();
    const s = scripted([proposalOf([{ op: "move_item", id: wardrobe.id, x: 6.35, y: 1.0, rotation: 90 }])]);
    const r = await propose("repair", "fix it", { transport: s.transport, focusIssueIds: [issue.id] });
    if (!r.ok) throw new Error(r.message);
    expect(s.requests[0].context.focusIssueIds).toEqual([issue.id]);
    const out = applyChecked(r.check, [issue.id]);
    if ("error" in out) throw new Error(out.error);
    expect(out.focusResolved).toEqual([issue.id]);
    expect(out.focusRemaining).toEqual([]);
  });

  it("does not report success when the model's 'fix' leaves the issue in place", async () => {
    const { wardrobe, issue } = introduceDoorConflict();
    // the model claims it fixed the problem but only rotates the wardrobe in place
    const s = scripted([proposalOf([{ op: "move_item", id: wardrobe.id, rotation: 270 }], { rationale: "This fixes the blocked door." })]);
    const r = await propose("repair", "fix it", { transport: s.transport, focusIssueIds: [issue.id] });
    if (!r.ok) throw new Error(r.message);
    const out = applyChecked(r.check, [issue.id]);
    if ("error" in out) throw new Error(out.error);
    expect(out.focusResolved).toEqual([]);
    expect(out.focusRemaining).toEqual([issue.id]);
  });
});

describe("explain", () => {
  it("flags evidence that does not exist in the model instead of trusting it", async () => {
    const room = store.getState().model.rooms[0].id;
    const s = scripted([
      {
        ok: true,
        mode: "explain",
        explanation: { headline: "h", summary: "s", points: [{ text: "t", evidence: [room, "issue_invented_by_model"] }], caveats: [] },
        meta,
      },
    ]);
    const r = await explain("explain", null, { transport: s.transport });
    if (!r.ok) throw new Error(r.message);
    expect(r.unverified).toEqual(["issue_invented_by_model"]);
  });
});
