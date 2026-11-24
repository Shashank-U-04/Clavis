/**
 * Makes the garden's model files small enough to load quickly, in place:
 *
 *   - pictures: the scanned plants' and the trees' textures at 512 px (they are seen from a few
 *     metres away at most); leaf pictures as palette PNGs, keeping their transparency;
 *   - the grown trees' geometry (format 2): normals as bytes and indices as 16-bit numbers,
 *     instead of 32-bit floats and integers. Positions and texture coordinates stay exact.
 *
 * Safe to run again: what is already small is left as it is. `npm run plants` runs it after
 * growing the trees; on its own: `npm run models:compact`.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve("public/models/plants");
const SIZE = 512;
let saved = 0;

const kb = (n: number) => `${Math.round(n / 1024)} KB`;

/** Shrink one picture to SIZE px on its longer side (never larger), into `to`. */
async function picture(from: string, to: string) {
  const before = fs.statSync(from).size;
  const img = sharp(fs.readFileSync(from));
  const meta = await img.metadata();
  const big = Math.max(meta.width ?? 0, meta.height ?? 0) > SIZE;
  const resized = big ? img.resize({ width: SIZE, height: SIZE, fit: "inside" }) : img;
  const out = from.endsWith(".png") ? await resized.png({ palette: true, quality: 90, effort: 10 }).toBuffer() : await resized.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  if (from === to && out.length >= before) return;
  fs.writeFileSync(to, out);
  if (from !== to) fs.rmSync(from);
  saved += before - out.length;
  console.log(`  ${path.relative(ROOT, to)}: ${kb(before)} -> ${kb(out.length)}`);
}

// ------------------------------------------------------------------ scanned plants (glTF)
for (const name of fs.readdirSync(path.join(ROOT, "scans"))) {
  const dir = path.join(ROOT, "scans", name);
  const file = path.join(dir, `${name}.gltf`);
  const gltf = JSON.parse(fs.readFileSync(file, "utf8")) as { images?: { uri: string }[] };
  for (const image of gltf.images ?? []) {
    if (!image.uri.includes("_1k.")) continue;
    const next = image.uri.replace("_1k.", `_${SIZE}.`);
    await picture(path.join(dir, image.uri), path.join(dir, next));
    image.uri = next;
  }
  fs.writeFileSync(file, JSON.stringify(gltf));
}

// ---------------------------------------------------------- the trees' bark and leaves
for (const f of fs.readdirSync(ROOT)) if (/^(bark_|leaf_).*\.(jpg|png)$/.test(f)) await picture(path.join(ROOT, f), path.join(ROOT, f));

// ------------------------------------------------------------- the trees' geometry
interface Part {
  vertices: number;
  indices: number;
  offsets: { position: number; normal: number; uv: number; index: number };
}
interface PlantFile {
  name: string;
  format?: number;
  branches: Part;
  foliage: Part;
}

const manifestFile = path.join(ROOT, "plants.json");
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as PlantFile[];
for (const p of manifest) {
  if (p.format === 2) continue;
  const binFile = path.join(ROOT, `${p.name}.bin`);
  const src = fs.readFileSync(binFile);
  const buf = src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength);
  const chunks: Buffer[] = [];
  let at = 0;
  const put = (bytes: Uint8Array) => {
    const start = at;
    chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    at += bytes.byteLength;
    // every block starts on a 4-byte boundary, as typed arrays over one buffer need
    const pad = (4 - (at % 4)) % 4;
    if (pad) chunks.push(Buffer.alloc(pad)), (at += pad);
    return start;
  };
  const pack = (part: Part): Part => {
    const position = new Float32Array(buf, part.offsets.position, part.vertices * 3);
    const normal = new Float32Array(buf, part.offsets.normal, part.vertices * 3);
    const uv = new Float32Array(buf, part.offsets.uv, part.vertices * 2);
    const index = new Uint32Array(buf, part.offsets.index, part.indices);
    if (part.vertices > 65535) throw new Error(`${p.name}: too many vertices for 16-bit indices`);
    const offsets = {
      position: put(new Uint8Array(position.buffer.slice(position.byteOffset, position.byteOffset + position.byteLength))),
      normal: put(new Uint8Array(Int8Array.from(normal, (v) => Math.max(-127, Math.min(127, Math.round(v * 127)))).buffer)),
      uv: put(new Uint8Array(uv.buffer.slice(uv.byteOffset, uv.byteOffset + uv.byteLength))),
      index: put(new Uint8Array(Uint16Array.from(index).buffer)),
    };
    return { ...part, offsets };
  };
  const branches = pack(p.branches);
  const foliage = pack(p.foliage);
  const out = Buffer.concat(chunks);
  fs.writeFileSync(binFile, out);
  saved += src.length - out.length;
  console.log(`  ${p.name}.bin: ${kb(src.length)} -> ${kb(out.length)}`);
  Object.assign(p, { format: 2, branches, foliage });
}
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 1));

console.log(`saved ${kb(saved)}`);
