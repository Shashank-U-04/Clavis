import { describe, it, expect, beforeEach } from "vitest";
import { layoutFor, looksLikeBrief, parseBrief } from "../src/ai/local/program";
import { localProposal, localRespond, mentionedKind, mentionedRooms } from "../src/ai/local/engine";
import { localTransport } from "../src/ai/local/transport";
import { applyChecked, propose } from "../src/ai/workflow";
import { applyBatch, isDestructive, OperationSchema } from "../src/model/operations";
import { checkModel } from "../src/model/issues";
import { analyzeModel } from "../src/model/analysis";
import { dispatch, issuesFor, store } from "../src/model/store";
import { emptyModel, type PlanModel } from "../src/model/types";
import { COMPACT_TWO_BEDROOM } from "../src/model/templates";
import type { AssistantRequest } from "../src/ai/contract";

const ids = () => {
  let n = 0;
  return (p: string) => `${p}_${n++}`;
};
const problems = (m: PlanModel) => checkModel(m).filter((i) => i.severity !== "info");
const req = (instruction: string, extra: Partial<AssistantRequest> = {}): AssistantRequest => ({
  mode: "design",
  instruction,
  context: { design: {} },
  ...extra,
});
const apply = (m: PlanModel, ops: unknown[]) => {
  const out = applyBatch(m, ops, ids());
  if (!out.ok) throw new Error(`${out.error?.message} @${out.failedIndex}`);
  return out.model;
};
const template = () => apply(emptyModel(), COMPACT_TWO_BEDROOM);

describe("brief parsing", () => {
  it("reads counts, area and options", () => {
    expect(parseBrief("a three-bedroom house with two bathrooms and a study, about 120 m²")).toMatchObject({
      bedrooms: 3, bathrooms: 2, study: true, targetArea: 120,
    });
    expect(parseBrief("2bhk 900 sq ft with separate kitchen")).toMatchObject({ bedrooms: 2, openKitchen: false, targetArea: 84 });
    expect(parseBrief("studio apartment")).toMatchObject({ bedrooms: 0, bathrooms: 1 });
    expect(parseBrief("4 bedroom home called Lake House").name).toBe("Lake House");
  });

  it("tells briefs from edits", () => {
    expect(looksLikeBrief("design a two bedroom flat")).toBe(true);
    expect(looksLikeBrief("3 bhk")).toBe(true);
    expect(looksLikeBrief("move the sofa")).toBe(false);
    expect(looksLikeBrief("how big is bedroom 2")).toBe(false);
  });
});

describe("generated homes", () => {
  const briefs = [
    "studio apartment",
    "one bedroom flat",
    "two bedroom home",
    "3 bedroom house with 2 bathrooms and a study, 120 m2",
    "4 bhk with separate kitchen and laundry",
    "5 bedroom villa 250 sqm",
    "2 bedroom 60 m2 unfurnished",
  ];
  for (const b of briefs) {
    it(`"${b}" builds, furnishes and validates with no errors or warnings`, () => {
      const p = localProposal(req(b), emptyModel());
      expect(p.intent).toBe("generate_design");
      const m = apply(emptyModel(), p.operations);
      expect(problems(m)).toEqual([]);
      const a = analyzeModel(m);
      expect(a.entrances.length).toBe(1);
      expect(a.rooms.every((r) => r.depth !== null)).toBe(true);
      if (/unfurnished/.test(b)) expect(m.items).toHaveLength(0);
      else expect(m.items.length).toBeGreaterThan(5);
    });
  }

  it("lands near the requested area", () => {
    for (const [brief, target] of [["2 bedroom 70 m2", 70], ["3 bedroom 110 m2", 110]] as const) {
      const area = layoutFor(parseBrief(brief)).plannedArea;
      expect(Math.abs(area - target) / target, brief).toBeLessThan(0.2);
    }
  });

  it("is deterministic", () => {
    const a = localProposal(req("three bedroom house"), emptyModel()).operations;
    const b = localProposal(req("three bedroom house"), emptyModel()).operations;
    expect(a).toEqual(b);
  });

  it("replacing an existing design is flagged destructive", () => {
    const m = template();
    const p = localProposal(req("design a studio"), m);
    const op = OperationSchema.parse(p.operations[0]);
    expect(isDestructive(op, m)).toBe(true);
  });
});

describe("references", () => {
  it("finds rooms by label, ordinal and type", () => {
    const m = template();
    expect(mentionedRooms("add a desk to bedroom 2", m)[0].label).toBe("Bedroom 2");
    expect(mentionedRooms("the second bedroom", m)[0].label).toBe("Bedroom 2");
    expect(mentionedRooms("main bedroom", m)[0].label).toBe("Bedroom 1");
    expect(mentionedRooms("the kitchen", m)[0].label).toBe("Living & Kitchen");
    expect(mentionedRooms("the bathroom", m)[0].label).toBe("Bathroom");
  });

  it("maps everyday words to catalog pieces", () => {
    expect(mentionedKind("a couch")?.kind).toBe("sofa");
    expect(mentionedKind("a tv")?.kind).toBe("tv_stand");
    expect(mentionedKind("a table", "living")?.kind).toBe("coffee_table");
    expect(mentionedKind("a sink", "kitchen")?.kind).toBe("kitchen_sink_unit");
    expect(mentionedKind("an oval dining table")?.kind).toBe("dining_table_oval");
  });
});

describe("edits", () => {
  it("adds a piece where nothing collides", () => {
    const m = template();
    const p = localProposal(req("put a plant in the living room"), m);
    expect(p.operations).toHaveLength(1);
    const next = apply(m, p.operations);
    expect(problems(next)).toEqual([]);
    expect(next.items.length).toBe(m.items.length + 1);
  });

  it("furnishes an empty room", () => {
    const m = apply(emptyModel(), [{ op: "build_layout", ...layoutFor(parseBrief("two bedroom")).spec }]);
    const p = localProposal(req("furnish bedroom 2"), m);
    const next = apply(m, p.operations);
    expect(next.items.length).toBeGreaterThanOrEqual(2);
    expect(problems(next)).toEqual([]);
  });

  it("removal is destructive and needs confirmation", () => {
    const m = template();
    const p = localProposal(req("remove the sofa"), m);
    expect(p.operations).toEqual([{ op: "remove_item", id: m.items.find((i) => i.kind === "sofa")!.id }]);
    expect(isDestructive(OperationSchema.parse(p.operations[0]), m)).toBe(true);
  });

  it("renames the design or a room", () => {
    const m = template();
    expect(localProposal(req("rename the design to Lake House"), m).operations).toEqual([{ op: "rename_plan", name: "Lake House" }]);
    const bed2 = m.rooms.find((r) => r.label === "Bedroom 2")!;
    expect(localProposal(req("rename bedroom 2 to Guest room"), m).operations).toEqual([{ op: "update_room", id: bed2.id, label: "Guest room" }]);
  });

  it("changes floors", () => {
    const m = template();
    const ops = localProposal(req("make the hall floor tile"), m).operations;
    expect(ops).toEqual([{ op: "update_room", id: m.rooms.find((r) => r.label === "Hall")!.id, floor: "tile" }]);
  });

  it("adds a window to a room on an exterior wall", () => {
    const m = template();
    const p = localProposal(req("add a window to bedroom 2"), m);
    expect(p.operations).toHaveLength(1);
    const next = apply(m, p.operations);
    const bed = analyzeModel(next).rooms.find((r) => r.label === "Bedroom 2")!;
    expect(bed.windows.length).toBe(2);
    expect(problems(next)).toEqual([]);
  });

  it("says when a structural change is out of reach", () => {
    expect(localProposal(req("add a second storey with stairs"), template()).intent).toBe("unsupported");
  });
});

describe("repairs", () => {
  it("moves furniture out of a doorway", () => {
    let m = template();
    const sofa = m.items.find((i) => i.kind === "sofa")!;
    const hallDoor = analyzeModel(m).rooms.find((r) => r.label === "Hall")!.doors[0];
    const door = m.openings.find((o) => o.id === hallDoor)!;
    const wall = m.walls.find((w) => w.id === door.wallId)!;
    const cx = wall.ax + door.t * (wall.bx - wall.ax);
    const cy = wall.ay + door.t * (wall.by - wall.ay);
    m = apply(m, [{ op: "move_item", id: sofa.id, x: cx, y: cy - 0.6, rotation: 0 }]);
    expect(problems(m).length).toBeGreaterThan(0);
    const p = localProposal(req("fix all issues"), m);
    expect(problems(apply(m, p.operations))).toEqual([]);
  });

  it("adds a door to a room that has none and a window to a dark bedroom", () => {
    const m = apply(emptyModel(), [
      {
        op: "build_layout",
        rooms: [
          { as: "hall", label: "Hall", x: 0, y: 0, w: 1.5, h: 4 },
          { as: "bed", label: "Bedroom", x: 1.5, y: 0, w: 3.5, h: 4 },
        ],
        doors: [{ from: "hall", to: "exterior", side: "west" }],
      },
    ]);
    const codes = problems(m).map((i) => i.code);
    expect(codes).toContain("room_no_door");
    expect(codes).toContain("room_no_window");
    const p = localProposal(req("fix", { mode: "repair" }), m);
    expect(problems(apply(m, p.operations))).toEqual([]);
  });

  it("reports what it cannot fix instead of guessing", () => {
    const m = apply(emptyModel(), [
      { op: "build_layout", rooms: [{ as: "b", label: "Bedroom", x: 0, y: 0, w: 2.2, h: 2.4 }], doors: [{ from: "b", to: "exterior", side: "south" }], windows: [{ room: "b", side: "north" }] },
    ]);
    const p = localProposal(req("fix all"), m);
    expect(p.reply).toMatch(/design decision/);
  });
});

describe("questions", () => {
  it("answers from measured numbers", () => {
    const m = template();
    const ask = (q: string) => localProposal(req(q), m);
    expect(ask("how big is bedroom 2?").reply).toMatch(/m² clear floor/);
    expect(ask("how many bedrooms?").reply).toBe("2 bedroom(s).");
    expect(ask("can every room be reached from the entrance?").reply).toMatch(/^Every room can be reached/);
    expect(ask("what is the total area?").reply).toMatch(/carpet\) area: \d+\.\d m²/);
    expect(ask("any issues?").reply).toMatch(/No errors or warnings/);
    for (const q of ["how big is bedroom 2?", "any issues?"]) expect(ask(q).operations).toEqual([]);
  });
});

describe("through the real workflow", () => {
  beforeEach(() => {
    store.setState({ model: emptyModel(), revision: 0, undoStack: [], redoStack: [], notes: [] });
  });

  it("propose → dry run → apply → measured outcome", async () => {
    const r = await propose("design", "design a two bedroom home with a study", { transport: localTransport });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.check.model).toBe("clavis-local");
    expect(r.check.preview?.ok).toBe(true);
    expect(r.check.attempts).toBe(1);
    const out = applyChecked(r.check);
    expect("error" in out).toBe(false);
    expect(issuesFor(store.getState().model).filter((i) => i.severity !== "info")).toEqual([]);
  });

  it("explains grounded in the app's numbers", () => {
    dispatch(COMPACT_TWO_BEDROOM);
    const res = localRespond({ mode: "explain", instruction: "what changed?", context: { design: {} } }, store.getState().model);
    expect(res.ok && res.mode === "explain" && res.explanation.summary).toMatch(/0 error\(s\) and 0 warning\(s\)/);
  });
});

describe("structural edits (regenerate from the read-back brief)", () => {
  const home = () => apply(emptyModel(), localProposal(req("three bedroom house with a study"), emptyModel()).operations);
  const rooms = (m: PlanModel) => m.rooms.map((r) => r.label);
  const areaOf = (m: PlanModel, label: string) => {
    const r = m.rooms.find((x) => x.label === label)!;
    return r.w * r.h;
  };

  it("adds a bedroom, keeps every other room and validates", () => {
    const m = home();
    const p = localProposal(req("add another bedroom"), m);
    expect(p.intent).toBe("generate_design");
    expect(isDestructive(OperationSchema.parse(p.operations[0]), m)).toBe(true);
    const next = apply(m, p.operations);
    expect(analyzeModel(next).metrics.bedrooms).toBe(4);
    for (const label of rooms(m)) expect(rooms(next)).toContain(label);
    expect(problems(next)).toEqual([]);
  });

  it("makes a room bigger and leaves the others about the same", () => {
    const m = home();
    const next = apply(m, localProposal(req("make bedroom 2 bigger"), m).operations);
    expect(areaOf(next, "Bedroom 2")).toBeGreaterThan(areaOf(m, "Bedroom 2") * 1.15);
    expect(Math.abs(areaOf(next, "Bedroom 3") - areaOf(m, "Bedroom 3")) / areaOf(m, "Bedroom 3")).toBeLessThan(0.25);
    expect(problems(next)).toEqual([]);
  });

  it("removes a named room and keeps custom names", () => {
    let m = home();
    const bed3 = m.rooms.find((r) => r.label === "Bedroom 3")!;
    m = apply(m, [{ op: "update_room", id: bed3.id, label: "Guest room" }]);
    const next = apply(m, localProposal(req("remove the study"), m).operations);
    expect(rooms(next)).not.toContain("Study");
    expect(rooms(next)).toContain("Guest room");
    expect(problems(next)).toEqual([]);
  });

  it("separates and reopens the kitchen", () => {
    const m = home();
    const closed = apply(m, localProposal(req("give it a separate kitchen"), m).operations);
    expect(rooms(closed)).toContain("Kitchen");
    const open = apply(closed, localProposal(req("make it an open plan kitchen"), closed).operations);
    expect(rooms(open)).not.toContain("Kitchen");
    expect(problems(open)).toEqual([]);
  });

  it("refuses edits that make no sense instead of guessing", () => {
    const m = home();
    expect(localProposal(req("remove the en-suite"), apply(emptyModel(), localProposal(req("one bedroom flat"), emptyModel()).operations)).reply).toMatch(/no en-suite/);
    expect(localProposal(req("add a study"), m).reply).toMatch(/already has a study/);
  });

  it("leaves furniture and opening requests alone", () => {
    const m = home();
    expect(localProposal(req("add a desk to bedroom 2"), m).intent).toBe("edit_design");
    const w = localProposal(req("add a window to the main bedroom"), m);
    expect(w.intent).toBe("edit_design");
    expect(w.operations.every((o) => (o as { op: string }).op === "add_opening")).toBe(true);
  });
});
