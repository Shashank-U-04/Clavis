/**
 * Turning an uploaded picture of a plan into a tracing underlay.
 *
 * The image is checked (type and size), scaled down so its longer side is at most
 * `MAX_SIDE` pixels and stored as JPEG, so it fits in browser storage beside the design.
 */

import type { Underlay } from "../model/types";

export const TRACING_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const TRACING_MAX_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 1600;
/** shown this wide at first; the person then sets the real width */
const START_WIDTH_M = 10;

export type TracingResult = { ok: true; underlay: Underlay } | { ok: false; message: string };

export async function tracingFromFile(file: File): Promise<TracingResult> {
  if (!TRACING_TYPES.includes(file.type)) return { ok: false, message: "Use a PNG, JPEG or WebP image." };
  if (file.size > TRACING_MAX_BYTES) return { ok: false, message: "The image is larger than 10 MB." };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, message: "That file could not be read as an image." };
  }
  const k = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const pw = Math.max(1, Math.round(bitmap.width * k));
  const ph = Math.max(1, Math.round(bitmap.height * k));
  const canvas = document.createElement("canvas");
  canvas.width = pw;
  canvas.height = ph;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, pw, ph);
  bitmap.close();
  return {
    ok: true,
    underlay: { dataUrl: canvas.toDataURL("image/jpeg", 0.82), opacity: 0.5, x: 0, y: 0, w: START_WIDTH_M, h: (START_WIDTH_M * ph) / pw, pw, ph },
  };
}
