/**
 * Versioned design documents — the save/export format and its validation.
 *
 * Imported files and stored autosaves are untrusted: they are parsed against a strict schema
 * with bounded sizes, duplicate ids are rejected, and only raster data-URL images are accepted
 * for the tracing underlay (no SVG, no remote URLs). A file that passes the schema may still be
 * *geometrically* invalid (an opening on a missing wall, say); it loads, and the constraint
 * engine reports the problem instead of hiding it.
 */

import { z } from "zod";
import type { Note, PlanModel } from "./types";
import { FLOOR_FINISHES } from "./layout";

export const DOCUMENT_FORMAT = "clavis.design";
export const SCHEMA_VERSION = 1;
/** Upper bound for an imported/exported file. */
export const MAX_DOCUMENT_BYTES = 6 * 1024 * 1024;
/** Upper bound for the tracing image carried inside a document (as a data URL). */
export const MAX_UNDERLAY_CHARS = 4 * 1024 * 1024;

const id = z.string().min(1).max(80).regex(/^[A-Za-z0-9_:.-]+$/);
const n = z.number().finite();
const pos = z.number().finite().positive();

const level = id.optional();
const WallSchema = z.object({ id, ax: n, ay: n, bx: n, by: n, thickness: pos.max(2), height: pos.max(10), level }).strict();
const OpeningSchema = z
  .object({
    id,
    kind: z.enum(["door", "window"]),
    wallId: id,
    t: n,
    width: pos.max(10),
    sill: n.min(0).max(10),
    height: pos.max(10),
    hinge: z.enum(["a", "b"]).optional(),
    side: z.enum(["left", "right"]).optional(),
  })
  .strict();
const RoomSchema = z
  .object({ id, x: n, y: n, w: pos.max(500), h: pos.max(500), label: z.string().max(80), floor: z.enum(FLOOR_FINISHES), level })
  .strict();
const ItemSchema = z
  .object({ id, kind: z.string().min(1).max(80), x: n, y: n, rotation: n, w: pos.max(20).optional(), d: pos.max(20).optional(), h: pos.max(10).optional(), level })
  .strict();
const UnderlaySchema = z
  .object({
    dataUrl: z
      .string()
      .max(MAX_UNDERLAY_CHARS)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/, "the underlay must be an embedded PNG, JPEG or WebP image"),
    opacity: n.min(0).max(1),
    x: n,
    y: n,
    w: pos,
    h: pos,
    pw: pos.optional(),
    ph: pos.optional(),
  })
  .strict();

export const PlanModelSchema = z
  .object({
    name: z.string().max(80),
    walls: z.array(WallSchema).max(2000),
    openings: z.array(OpeningSchema).max(2000),
    rooms: z.array(RoomSchema).max(500),
    items: z.array(ItemSchema).max(2000),
    underlay: UnderlaySchema.nullable(),
    levels: z
      .array(z.object({ id, name: z.string().min(1).max(60), elevation: n.min(-10).max(200), height: pos.max(10) }).strict())
      .max(12)
      .optional(),
  })
  .strict();

const NoteSchema = z
  .object({ id, author: z.enum(["human", "agent"]), text: z.string().max(4000), at: n })
  .strict();

const DocumentSchema = z
  .object({
    format: z.literal(DOCUMENT_FORMAT),
    schemaVersion: z.literal(SCHEMA_VERSION),
    units: z.literal("m"),
    savedAt: z.string().max(40),
    app: z.object({ name: z.string().max(40), version: z.string().max(40) }).strict(),
    model: PlanModelSchema,
    notes: z.array(NoteSchema).max(500).optional(),
  })
  .strict();

export interface DesignDocument {
  format: typeof DOCUMENT_FORMAT;
  schemaVersion: typeof SCHEMA_VERSION;
  units: "m";
  savedAt: string;
  app: { name: string; version: string };
  model: PlanModel;
  notes?: Note[];
}

export type ParseResult =
  | { ok: true; doc: DesignDocument }
  | { ok: false; code: "not_json" | "too_large" | "wrong_format" | "unsupported_version" | "invalid" | "duplicate_ids"; message: string };

export function toDocument(model: PlanModel, notes: Note[], savedAt = new Date().toISOString()): DesignDocument {
  return {
    format: DOCUMENT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    units: "m",
    savedAt,
    app: { name: "Clavis", version: "0.1.0" },
    model: structuredClone(model),
    notes: notes.length ? structuredClone(notes) : undefined,
  };
}

export function serializeDocument(doc: DesignDocument): string {
  return JSON.stringify(doc, null, 2);
}

/** Parse untrusted text into a design document, or explain exactly why not. Never throws. */
export function parseDocument(text: string): ParseResult {
  if (text.length > MAX_DOCUMENT_BYTES) {
    return { ok: false, code: "too_large", message: `The file is larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, code: "not_json", message: "The file is not valid JSON." };
  }
  if (typeof raw !== "object" || raw === null || (raw as { format?: unknown }).format !== DOCUMENT_FORMAT) {
    return { ok: false, code: "wrong_format", message: "This is not a Clavis design file." };
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (version !== SCHEMA_VERSION) {
    const newer = typeof version === "number" && version > SCHEMA_VERSION;
    return {
      ok: false,
      code: "unsupported_version",
      message: newer
        ? `This file uses schema version ${version}, which is newer than this build of Clavis supports (${SCHEMA_VERSION}).`
        : `Unsupported schema version ${JSON.stringify(version)}; this build reads version ${SCHEMA_VERSION}.`,
    };
  }
  const parsed = DocumentSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      code: "invalid",
      message: `The file is malformed at ${first.path.join(".") || "the top level"}: ${first.message}.`,
    };
  }
  const m = parsed.data.model;
  const all = [...m.walls, ...m.openings, ...m.rooms, ...m.items].map((e) => e.id);
  const dup = all.find((v, i) => all.indexOf(v) !== i);
  if (dup) return { ok: false, code: "duplicate_ids", message: `Entity id "${dup}" is used more than once.` };
  return { ok: true, doc: parsed.data as DesignDocument };
}
