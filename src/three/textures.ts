/**
 * Surface textures drawn in code on small canvases, so the 3D view looks built rather than
 * flat-shaded without shipping any image files: plaster, oak planks, tiles, carpet, concrete,
 * stone paving and grass. Each is sized in metres (`tile`): geometry built with world-sized UVs
 * (see `worldUV`) repeats it at its real size, so a plank is a plank wide on any floor.
 *
 * Outside a browser (tests, the server) there is no canvas: every texture is null and the
 * materials fall back to their plain colours.
 */

import * as THREE from "three";

export interface Surface {
  map: THREE.CanvasTexture;
  /** how many metres one repeat of the texture covers */
  tile: number;
}

const canDraw = () => typeof document !== "undefined";

/** A deterministic pseudo-random sequence, so the textures look the same on every visit. */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(size: number, paint: (g: CanvasRenderingContext2D, size: number, rnd: () => number) => void, seed: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  paint(g, size, random(seed));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.shared = true;
  return t;
}

/** Fine speckle over a base colour: the grain of plaster, concrete or carpet. */
function speckle(g: CanvasRenderingContext2D, size: number, rnd: () => number, base: string, amount: number, dots: number, spread = 1) {
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < dots; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${amount * rnd()})`;
    const r = (0.6 + rnd() * 1.6) * spread;
    g.fillRect(rnd() * size, rnd() * size, r, r);
  }
}

const made = new Map<string, Surface | null>();
function once(key: string, make: () => Surface): Surface | null {
  if (!made.has(key)) made.set(key, canDraw() ? make() : null);
  return made.get(key)!;
}

export const plaster = () => once("plaster", () => ({ tile: 2, map: canvas(256, (g, s, r) => speckle(g, s, r, "#f2efe9", 0.05, 5000), 11) }));

export const concrete = () =>
  once("concrete", () => ({
    tile: 2.5,
    map: canvas(
      256,
      (g, s, r) => {
        speckle(g, s, r, "#b9b7b1", 0.09, 7000);
        // soft blotches, as cast concrete has
        for (let i = 0; i < 18; i++) {
          const x = r() * s;
          const y = r() * s;
          const grad = g.createRadialGradient(x, y, 0, x, y, 20 + r() * 50);
          grad.addColorStop(0, `rgba(90,88,84,${0.05 + r() * 0.05})`);
          grad.addColorStop(1, "rgba(90,88,84,0)");
          g.fillStyle = grad;
          g.fillRect(0, 0, s, s);
        }
      },
      12,
    ),
  }));

export const carpet = () => once("carpet", () => ({ tile: 1, map: canvas(128, (g, s, r) => speckle(g, s, r, "#9aa391", 0.12, 6000, 0.7), 13) }));

/** Oak boards 0.19 m wide, in staggered lengths, each a slightly different tone with grain. */
export const oak = () =>
  once("oak", () => ({
    tile: 2.28,
    map: canvas(
      512,
      (g, s, r) => {
        const rows = 12;
        const h = s / rows;
        for (let row = 0; row < rows; row++) {
          let x = -r() * s * 0.5;
          while (x < s) {
            const len = s * (0.35 + r() * 0.4);
            const tone = 150 + Math.round(r() * 40);
            g.fillStyle = `rgb(${tone + 46},${tone + 6},${tone - 46})`;
            g.fillRect(x, row * h, len, h);
            // grain: long faint streaks along the board
            for (let k = 0; k < 9; k++) {
              g.strokeStyle = `rgba(90,55,25,${0.05 + r() * 0.08})`;
              g.lineWidth = 0.6 + r();
              g.beginPath();
              const y = row * h + r() * h;
              g.moveTo(x, y);
              g.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 4, x + len * 0.7, y + (r() - 0.5) * 4, x + len, y + (r() - 0.5) * 3);
              g.stroke();
            }
            g.fillStyle = "rgba(60,38,20,0.55)";
            g.fillRect(x, row * h, 1.5, h); // board end
            x += len;
          }
          g.fillStyle = "rgba(60,38,20,0.45)";
          g.fillRect(0, row * h, s, 1.2); // board edge
        }
      },
      14,
    ),
  }));

/** 60 cm porcelain tiles with pale grout. */
export const tile = () =>
  once("tile", () => ({
    tile: 1.2,
    map: canvas(
      256,
      (g, s, r) => {
        speckle(g, s, r, "#dcdad4", 0.04, 2500);
        g.fillStyle = "#c4c1b9";
        for (const p of [0, s / 2]) {
          g.fillRect(p, 0, 2, s);
          g.fillRect(0, p, s, 2);
        }
      },
      15,
    ),
  }));

/** Large pale stone slabs for terraces and pool surrounds. */
export const paving = () =>
  once("paving", () => ({
    tile: 1.8,
    map: canvas(
      256,
      (g, s, r) => {
        speckle(g, s, r, "#dcd6ca", 0.07, 4000);
        g.fillStyle = "#bdb6a8";
        g.fillRect(0, 0, s, 2);
        g.fillRect(0, 0, 2, s / 2);
        g.fillRect(0, s / 2, s, 2);
        g.fillRect(s / 2, s / 2, 2, s / 2);
      },
      16,
    ),
  }));

/** Mown grass: blades of many greens over a darker base, with soft patches of lighter and darker turf. */
export const grass = () =>
  once("grass", () => ({
    tile: 6,
    map: canvas(
      512,
      (g, s, r) => {
        g.fillStyle = "#62804c";
        g.fillRect(0, 0, s, s);
        // broad, soft variation so the repeat does not show as a pattern
        for (let i = 0; i < 40; i++) {
          const x = r() * s;
          const y = r() * s;
          const rad = 40 + r() * 120;
          const light = r() < 0.5;
          for (const [dx, dy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) {
            const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
            grad.addColorStop(0, light ? "rgba(170,180,110,0.10)" : "rgba(40,60,30,0.10)");
            grad.addColorStop(1, "rgba(0,0,0,0)");
            g.fillStyle = grad;
            g.fillRect(0, 0, s, s);
          }
        }
        for (let i = 0; i < 26000; i++) {
          const x = r() * s;
          const y = r() * s;
          const l = 2 + r() * 4;
          const tone = r();
          g.strokeStyle = tone < 0.5 ? `rgba(66,92,46,${0.4 + r() * 0.4})` : tone < 0.85 ? `rgba(118,142,82,${0.35 + r() * 0.35})` : `rgba(156,166,104,0.45)`;
          g.lineWidth = 0.8;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + (r() - 0.5) * 1.5, y - l);
          g.stroke();
        }
      },
      17,
    ),
  }));

/**
 * Give a geometry UVs in metres divided by `tile`, projected along each face's axis, so a
 * texture repeats at its real size whatever the size of the box it is on.
 */
export function worldUV(geometry: THREE.BufferGeometry, tile: number): THREE.BufferGeometry {
  const pos = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  if (!pos || !normal || !uv) return geometry;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // a face across x shows z and y; across y (floors, tops) shows x and z; across z shows x and y
    if (nx > 0.5) uv.setXY(i, z / tile, y / tile);
    else if (ny > 0.5) uv.setXY(i, x / tile, z / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  uv.needsUpdate = true;
  return geometry;
}
