import { describe, it, expect } from "vitest";
import { parseDocument, serializeDocument, toDocument, SCHEMA_VERSION } from "../src/model/document";
import { AUTOSAVE_KEY, BACKUP_KEY, restoreFromStorage, saveToStorage, type StorageLike } from "../src/model/persistence";
import { applyBatch } from "../src/model/operations";
import { emptyModel } from "../src/model/types";
import { checkModel } from "../src/model/issues";
import { COMPACT_TWO_BEDROOM } from "../src/model/templates";

const design = () => {
  let n = 0;
  return applyBatch(emptyModel(), COMPACT_TWO_BEDROOM, (p) => `${p}_${n++}`).model;
};

const memory = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

describe("design documents", () => {
  it("round-trips geometry exactly, and validation is unchanged after reload", () => {
    const m = design();
    const parsed = parseDocument(serializeDocument(toDocument(m, [])));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.doc.model).toEqual(m);
    expect(parsed.doc.units).toBe("m");
    expect(checkModel(parsed.doc.model)).toEqual(checkModel(m));
  });

  it("rejects non-JSON, foreign files and malformed models with a reason", () => {
    expect(parseDocument("{not json").ok).toBe(false);
    expect(parseDocument(JSON.stringify({ hello: 1 }))).toMatchObject({ ok: false, code: "wrong_format" });
    const doc = toDocument(design(), []) as unknown as { model: { walls: { ax: unknown }[] } };
    doc.model.walls[0].ax = "0; DROP TABLE";
    expect(parseDocument(JSON.stringify(doc))).toMatchObject({ ok: false, code: "invalid" });
  });

  it("explains unsupported schema versions", () => {
    const doc = { ...toDocument(design(), []), schemaVersion: SCHEMA_VERSION + 1 };
    const r = parseDocument(JSON.stringify(doc));
    expect(r).toMatchObject({ ok: false, code: "unsupported_version" });
    if (!r.ok) expect(r.message).toMatch(/newer/);
  });

  it("rejects duplicate entity ids", () => {
    const m = design();
    m.items[1].id = m.items[0].id;
    expect(parseDocument(JSON.stringify(toDocument(m, [])))).toMatchObject({ ok: false, code: "duplicate_ids" });
  });

  it("only accepts embedded raster images for the tracing underlay", () => {
    const m = design();
    const svg = "data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+";
    m.underlay = { dataUrl: svg, opacity: 0.5, x: 0, y: 0, w: 5, h: 5 };
    expect(parseDocument(JSON.stringify(toDocument(m, []))).ok).toBe(false);
    m.underlay.dataUrl = "https://example.com/plan.png";
    expect(parseDocument(JSON.stringify(toDocument(m, []))).ok).toBe(false);
    m.underlay.dataUrl = "data:image/png;base64,iVBORw0KGgo=";
    expect(parseDocument(JSON.stringify(toDocument(m, []))).ok).toBe(true);
  });

  it("loads a structurally valid but geometrically broken model so the issue can be shown", () => {
    const m = design();
    m.openings[0].wallId = "wall_does_not_exist";
    const r = parseDocument(JSON.stringify(toDocument(m, [])));
    expect(r.ok).toBe(true);
    if (r.ok) expect(checkModel(r.doc.model).some((i) => i.code === "opening_orphan")).toBe(true);
  });
});

describe("browser autosave", () => {
  it("saves and restores", () => {
    const s = memory();
    const m = design();
    expect(saveToStorage(s, m, []).ok).toBe(true);
    const r = restoreFromStorage(s);
    expect(r.kind).toBe("restored");
    if (r.kind === "restored") expect(r.doc.model).toEqual(m);
  });

  it("reports unavailable storage and quota errors instead of failing silently", () => {
    expect(saveToStorage(null, design(), []).ok).toBe(false);
    const full: StorageLike = {
      getItem: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    const r = saveToStorage(full, design(), []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/full/);
  });

  it("keeps an unreadable autosave under a backup key instead of discarding it", () => {
    const s = memory();
    s.setItem(AUTOSAVE_KEY, "{corrupt");
    const r = restoreFromStorage(s);
    expect(r.kind).toBe("unreadable");
    expect(s.data.get(BACKUP_KEY)).toBe("{corrupt");
    expect(s.data.has(AUTOSAVE_KEY)).toBe(false);
  });
});
