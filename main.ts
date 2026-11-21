// SEVEN FRONTS, ONE DAY — news-image-20261120 v2
// A drawn front page summing up Friday 20 November 2026: a full-colour
// world map hero with seven illustrated region cameos, six map vignettes,
// and 36 date-checked briefs across seven regions.
// Pure Node 22 standard library. Deterministic: same bytes every run.

import * as fs from "node:fs";
import * as zlib from "node:zlib";

// ---------- deterministic PRNG (mulberry32) ----------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261120);

// ---------- colour helpers ----------
type RGB = [number, number, number];
function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerp(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
function multiLerp(stops: RGB[], t: number): RGB {
  const n = stops.length - 1;
  const x = Math.max(0, Math.min(1, t)) * n;
  const i = Math.min(n - 1, Math.floor(x));
  return lerp(stops[i], stops[i + 1], x - i);
}
function shade(c: RGB, f: number): RGB {
  return [
    Math.max(0, Math.min(255, Math.round(c[0] * f))),
    Math.max(0, Math.min(255, Math.round(c[1] * f))),
    Math.max(0, Math.min(255, Math.round(c[2] * f))),
  ];
}

// ---------- canvas ----------
const W = 1024;
const H = 1024;
class Canvas {
  w = W;
  h = H;
  buf = new Uint8Array(W * H * 3);
  clip: { cx: number; cy: number; r: number } | null = null;
  set(x: number, y: number, c: RGB, a = 1): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
    if (this.clip) {
      const dx = xi - this.clip.cx;
      const dy = yi - this.clip.cy;
      if (dx * dx + dy * dy > this.clip.r * this.clip.r) return;
    }
    const o = (yi * W + xi) * 3;
    if (a >= 1) {
      this.buf[o] = c[0]; this.buf[o + 1] = c[1]; this.buf[o + 2] = c[2];
    } else {
      this.buf[o] = Math.round(c[0] * a + this.buf[o] * (1 - a));
      this.buf[o + 1] = Math.round(c[1] * a + this.buf[o + 1] * (1 - a));
      this.buf[o + 2] = Math.round(c[2] * a + this.buf[o + 2] * (1 - a));
    }
  }
  fill(c: RGB): void {
    for (let i = 0; i < W * H; i++) {
      this.buf[i * 3] = c[0]; this.buf[i * 3 + 1] = c[1]; this.buf[i * 3 + 2] = c[2];
    }
  }
  rect(x: number, y: number, w: number, h: number, c: RGB, a = 1): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(W, Math.round(x + w));
    const y1 = Math.min(H, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) this.set(xx, yy, c, a);
    }
  }
  hline(x0: number, x1: number, y: number, c: RGB, a = 1): void {
    const yy = Math.round(y);
    for (let xx = Math.round(Math.min(x0, x1)); xx <= Math.round(Math.max(x0, x1)); xx++) {
      this.set(xx, yy, c, a);
    }
  }
  vline(x: number, y0: number, y1: number, c: RGB, a = 1): void {
    const xx = Math.round(x);
    for (let yy = Math.round(Math.min(y0, y1)); yy <= Math.round(Math.max(y0, y1)); yy++) {
      this.set(xx, yy, c, a);
    }
  }
  // DDA line with a square brush of thickness t
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1, a = 1): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    const r = Math.max(0, Math.floor(t / 2));
    for (let i = 0; i <= steps; i++) {
      const x = x0 + (dx * i) / steps;
      const y = y0 + (dy * i) / steps;
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) this.set(x + ox, y + oy, c, a);
      }
    }
  }
  // polyline through points
  polyline(pts: [number, number][], c: RGB, t = 1, a = 1): void {
    for (let i = 0; i + 1 < pts.length; i++) {
      this.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, t, a);
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
    const rr = Math.round(r);
    for (let yy = -rr; yy <= rr; yy++) {
      const dx = Math.floor(Math.sqrt(Math.max(0, rr * rr - yy * yy)));
      for (let xx = -dx; xx <= dx; xx++) this.set(cx + xx, cy + yy, c, a);
    }
  }
  ring(cx: number, cy: number, r: number, c: RGB, t = 1, a = 1): void {
    const steps = Math.max(24, Math.ceil(2 * Math.PI * r));
    const rr = Math.max(0, Math.floor(t / 2));
    for (let i = 0; i < steps; i++) {
      const an = (i / steps) * 2 * Math.PI;
      const x = cx + Math.cos(an) * r;
      const y = cy + Math.sin(an) * r;
      for (let oy = -rr; oy <= rr; oy++) {
        for (let ox = -rr; ox <= rr; ox++) this.set(x + ox, y + oy, c, a);
      }
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
    const ryI = Math.max(1, Math.round(ry));
    for (let yy = -ryI; yy <= ryI; yy++) {
      const f = Math.sqrt(Math.max(0, 1 - (yy * yy) / (ry * ry)));
      const dx = Math.floor(rx * f);
      for (let xx = -dx; xx <= dx; xx++) this.set(cx + xx, cy + yy, c, a);
    }
  }
  // scanline polygon fill; optional vertical gradient between cTop and cBot
  poly(pts: [number, number][], c: RGB, a = 1, cTop?: RGB, cBot?: RGB): void {
    if (pts.length < 3) return;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const p of pts) {
      yMin = Math.min(yMin, p[1]);
      yMax = Math.max(yMax, p[1]);
    }
    const y0 = Math.max(0, Math.ceil(yMin));
    const y1 = Math.min(H - 1, Math.floor(yMax));
    for (let y = y0; y <= y1; y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const p0 = pts[i];
        const p1 = pts[(i + 1) % pts.length];
        if ((p0[1] <= y && p1[1] > y) || (p1[1] <= y && p0[1] > y)) {
          const t = (y - p0[1]) / (p1[1] - p0[1]);
          xs.push(p0[0] + t * (p1[0] - p0[0]));
        }
      }
      xs.sort((m, n) => m - n);
      let col = c;
      if (cTop && cBot && yMax > yMin) col = lerp(cTop, cBot, (y - yMin) / (yMax - yMin));
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil(xs[k]));
        const xb = Math.min(W - 1, Math.floor(xs[k + 1]));
        for (let x = xa; x <= xb; x++) this.set(x, y, col, a);
      }
    }
  }
  // arc polyline (angles in radians)
  arc(cx: number, cy: number, r: number, a0: number, a1: number, c: RGB, t = 1, a = 1): void {
    const steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) * r));
    const pts: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const an = a0 + ((a1 - a0) * i) / steps;
      pts.push([cx + Math.cos(an) * r, cy + Math.sin(an) * r]);
    }
    this.polyline(pts, c, t, a);
  }
  // vertical gradient rectangle
  vgrad(x: number, y: number, w: number, h: number, top: RGB, bot: RGB, a = 1): void {
    const y0 = Math.max(0, Math.round(y));
    const y1 = Math.min(H, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      const t = h > 1 ? (yy - y) / h : 0;
      const col = lerp(top, bot, t);
      this.rect(x, yy, w, 1, col, a);
    }
  }
}

// ---------- PNG encode (filter heuristic + zlib level 9) ----------
function crc32(buf: Buffer): number {
  let table = (crc32 as unknown as { t?: Int32Array }).t;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    (crc32 as unknown as { t: Int32Array }).t = table;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
function encodePNG(cv: Canvas): Buffer {
  const w = cv.w;
  const h = cv.h;
  const raw = Buffer.alloc(h * (1 + w * 3));
  const prev = new Uint8Array(w * 3);
  for (let y = 0; y < h; y++) {
    const row = cv.buf.subarray(y * w * 3, (y + 1) * w * 3);
    const cands: Buffer[] = [];
    for (let f = 0; f < 5; f++) {
      const out = Buffer.alloc(w * 3);
      for (let x = 0; x < w * 3; x++) {
        const v = row[x];
        const left = x >= 3 ? row[x - 3] : 0;
        const up = prev[x];
        const upLeft = x >= 3 ? prev[x - 3] : 0;
        let pred = 0;
        if (f === 1) pred = left;
        else if (f === 2) pred = up;
        else if (f === 3) pred = Math.floor((left + up) / 2);
        else if (f === 4) pred = paeth(left, up, upLeft);
        out[x] = (v - pred) & 255;
      }
      cands.push(out);
    }
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      let s = 0;
      const b = cands[f];
      for (let i = 0; i < b.length; i++) {
        const v = b[i] > 127 ? b[i] - 256 : b[i];
        s += v < 0 ? -v : v;
      }
      if (s < bestScore) { bestScore = s; best = f; }
    }
    raw[y * (1 + w * 3)] = best;
    cands[best].copy(raw, y * (1 + w * 3) + 1);
    prev.set(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- palette ----------
const PAPER = hex("#f2ecdc");
const PAPER_DARK = hex("#e7dfc8");
const INK = hex("#1c1a17");
const INK_SOFT = hex("#4a4438");
const GOLD = hex("#c9a227");
const GOLD_DARK = hex("#8a6d1f");
const GOLD_LIGHT = hex("#e8c96a");
const NAVY = hex("#0a2540");
const RED = hex("#b3271e");
const TEAL = hex("#0f6f7a");

// ---------- 5x7 bitmap font (rows as 5-char strings, '#' = on) ----------
const FONT: Record<string, string[]> = {
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  '"': [".#.#.", ".#.#.", ".#.#.", ".....", ".....", ".....", "....."],
  "#": [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."],
  $: ["..#..", ".####", "#.#.#", ".###.", "..#.#", "####.", "..#.."],
  "%": ["##..#", "##.#.", "....#", "...#.", "..#..", ".#..#", "#..##"],
  "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".###."],
  "'": ["..#..", "..#..", ".#...", ".....", ".....", ".....", "....."],
  "(": ["...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."],
  ")": [".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."],
  "*": [".....", "..#..", "#.#.#", ".###.", "#.#.#", "..#..", "....."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  ",": [".....", ".....", ".....", ".....", ".##..", "..#..", ".#..."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["#####", "....#", "...#.", "....#", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "....#", "...#.", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  ";": [".....", ".##..", ".##..", ".....", ".##..", "..#..", ".#..."],
  "<": ["...#.", "..#..", ".#...", "#....", ".#...", "..#..", "...#."],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  ">": [".#...", "..#..", "...#.", "....#", "...#.", "..#..", ".#..."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "@": [".###.", "#...#", "#..##", "#.#.#", "#.##.#", "#....", ".###."],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["....#", "....#", "....#", "....#", "#...#", "#...#", ".###."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "[": [".###.", ".#...", ".#...", ".#...", ".#...", ".#...", ".###."],
  "\\": ["#....", "#....", ".#...", "..#..", "...#.", "....#", "....#"],
  "]": [".###.", "...#.", "...#.", "...#.", "...#.", "...#.", ".###."],
  "^": ["..#..", ".#.#.", "#...#", ".....", ".....", ".....", "....."],
  _: [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
  "`": ["..#..", "..#..", "...#.", ".....", ".....", ".....", "....."],
  a: [".....", ".....", ".####", "....#", ".####", "#...#", ".####"],
  b: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "####."],
  c: [".....", ".....", ".###.", "#....", "#....", "#....", ".###."],
  d: ["....#", "....#", ".####", "#...#", "#...#", "#...#", ".####"],
  e: [".....", ".....", ".###.", "#...#", "#####", "#....", ".###."],
  f: ["..##.", ".#...", "####.", ".#...", ".#...", ".#...", ".#..."],
  g: [".....", ".####", "#...#", "#...#", ".####", "....#", ".###."],
  h: ["#....", "#....", "####.", "#...#", "#...#", "#...#", "#...#"],
  i: ["..#..", ".....", ".##..", "..#..", "..#..", "..#..", ".###."],
  j: ["...#.", ".....", "..##.", "...#.", "...#.", "#..#.", ".##.."],
  k: ["#....", "#....", "#..#.", "#.#..", "##...", "#.#..", "#..#."],
  l: [".##..", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  m: [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#.#.#"],
  n: [".....", ".....", "####.", "#...#", "#...#", "#...#", "#...#"],
  o: [".....", ".....", ".###.", "#...#", "#...#", "#...#", ".###."],
  p: [".....", ".....", "####.", "#...#", "#...#", "####.", "#...."],
  q: [".....", ".....", ".####", "#...#", "#...#", ".####", "....#"],
  r: [".....", ".....", "#.##.", "##..#", "#....", "#....", "#...."],
  s: [".....", ".....", ".####", "#....", ".###.", "....#", "####."],
  t: [".#...", ".#...", "####.", ".#...", ".#...", ".#.#.", "..#.."],
  u: [".....", ".....", "#...#", "#...#", "#...#", "#..##", ".##.#"],
  v: [".....", ".....", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  w: [".....", ".....", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  x: [".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  y: [".....", ".....", "#...#", "#...#", ".####", "....#", ".###."],
  z: [".....", ".....", "#####", "...#.", "..#..", ".#...", "#####"],
  "{": ["...#.", "..#..", "..#..", ".#...", "..#..", "..#..", "...#."],
  "|": ["..#..", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  "}": [".#...", "..#..", "..#..", "...#.", "..#..", "..#..", ".#..."],
  "~": [".....", ".....", ".....", ".###.", "#.#.#", ".....", "....."],
  "·": [".....", ".....", ".....", ".##..", ".##..", ".....", "....."],
  "•": [".....", "..#..", ".###.", ".###.", ".###.", "..#..", "....."],
  "—": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "–": [".....", ".....", ".....", ".###.", ".....", ".....", "....."],
  "✓": [".....", ".....", "....#", "...#.", "#.#..", ".#...", "....."],
  "’": ["..#..", "..#..", ".#...", ".....", ".....", ".....", "....."],
  "‘": ["..#..", "..#..", ".#...", ".....", ".....", ".....", "....."],
  "“": [".#.#.", ".#.#.", ".#.#.", ".....", ".....", ".....", "....."],
  "”": [".#.#.", ".#.#.", ".#.#.", ".....", ".....", ".....", "....."],
  "×": [".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "....."],
  "°": [".###.", "#...#", "#...#", ".###.", ".....", ".....", "....."],
  "→": [".....", "..#..", "...#.", "#####", "...#.", "..#..", "....."],
};

// ---------- text ----------
function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}
function drawText(
  cv: Canvas,
  s: string,
  x: number,
  y: number,
  scale: number,
  c: RGB,
  a = 1,
  colorFn?: (px: number, py: number) => RGB,
): void {
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of s) {
    const g = FONT[ch] || FONT["?"];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === "#") {
          const px = cx + col * scale;
          const py = cy + r * scale;
          const col2 = colorFn ? colorFn(px, py) : c;
          cv.rect(px, py, scale, scale, col2, a);
        }
      }
    }
    cx += 6 * scale;
  }
}
function drawTextCentered(cv: Canvas, s: string, cx: number, y: number, scale: number, c: RGB, a = 1): void {
  drawText(cv, s, cx - textWidth(s, scale) / 2, y, scale, c, a);
}
function drawTextBold(cv: Canvas, s: string, x: number, y: number, scale: number, c: RGB, a = 1): void {
  // double-strike: 2px strokes stay legible when the poster is shown small
  drawText(cv, s, x, y, scale, c, a);
  drawText(cv, s, x + 1, y, scale, c, a);
}
function wrapText(s: string, maxChars: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur === "") cur = w;
    else if (cur.length + 1 + w.length <= maxChars) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ---------- world map (simplified lon/lat outlines, equirectangular) ----------
type LonLat = [number, number];
const MAP = { x: 24, y: 176, w: 976, h: 472 };
function project(lon: number, lat: number): [number, number] {
  return [
    MAP.x + ((lon + 180) / 360) * MAP.w,
    MAP.y + ((90 - lat) / 180) * MAP.h,
  ];
}
function llPoly(cv: Canvas, pts: LonLat[], cTop: RGB, cBot: RGB, a = 1): void {
  cv.poly(pts.map((p) => project(p[0], p[1])), hex("#000000"), a, cTop, cBot);
}
const LAND: LonLat[][] = [
  // North America
  [[-168, 66], [-165, 60], [-158, 58], [-152, 60], [-140, 60], [-135, 58], [-130, 54], [-125, 49], [-124, 42], [-120, 34], [-114, 29], [-110, 24], [-105, 20], [-97, 16], [-94, 17], [-90, 14], [-86, 12], [-83, 9], [-80, 8], [-79, 9], [-83, 10], [-87, 13], [-90, 14], [-81, 25], [-80, 32], [-76, 35], [-74, 40], [-70, 42], [-66, 45], [-60, 47], [-55, 47], [-60, 50], [-65, 50], [-68, 55], [-72, 58], [-78, 62], [-85, 66], [-92, 66], [-95, 69], [-110, 68], [-125, 70], [-140, 70], [-155, 71], [-165, 68], [-168, 66]],
  // Greenland
  [[-58, 64], [-52, 60], [-43, 60], [-40, 64], [-32, 68], [-22, 70], [-20, 74], [-25, 78], [-35, 80], [-50, 80], [-58, 76], [-62, 70], [-58, 64]],
  // South America
  [[-80, 9], [-77, 4], [-80, -3], [-81, -6], [-77, -12], [-72, -18], [-70, -23], [-70, -30], [-72, -37], [-73, -44], [-74, -50], [-70, -54], [-66, -55], [-68, -50], [-65, -45], [-62, -40], [-58, -35], [-52, -32], [-48, -28], [-41, -23], [-39, -17], [-35, -9], [-35, -6], [-40, -3], [-44, -2], [-50, 0], [-53, 4], [-58, 6], [-62, 9], [-68, 11], [-72, 12], [-76, 10], [-80, 9]],
  // Africa
  [[-17, 15], [-17, 21], [-15, 27], [-10, 31], [-6, 34], [0, 36], [10, 37], [11, 34], [19, 32], [25, 32], [30, 31], [32, 31], [34, 28], [37, 22], [39, 18], [41, 12], [43, 11], [48, 11], [51, 12], [46, 5], [41, -2], [40, -10], [36, -18], [33, -26], [28, -33], [20, -35], [17, -32], [15, -27], [13, -18], [12, -10], [13, -4], [9, 4], [4, 6], [-8, 5], [-13, 8], [-17, 12], [-17, 15]],
  // Eurasia
  [[-10, 36], [-9, 38], [-9, 43], [-2, 44], [-1, 46], [-4, 48], [-2, 49], [0, 50], [3, 53], [8, 57], [10, 59], [5, 60], [5, 62], [10, 64], [14, 67], [18, 69], [25, 71], [30, 70], [35, 68], [40, 68], [45, 68], [50, 69], [55, 68], [60, 69], [68, 73], [75, 73], [80, 73], [85, 75], [95, 76], [105, 77], [110, 74], [115, 73], [120, 73], [130, 72], [140, 72], [150, 70], [158, 69], [162, 66], [170, 67], [178, 65], [178, 62], [170, 60], [162, 58], [158, 52], [156, 50], [150, 59], [142, 54], [141, 50], [140, 45], [135, 43], [130, 42], [127, 40], [126, 38], [122, 39], [120, 35], [122, 31], [120, 28], [118, 25], [110, 21], [108, 18], [105, 10], [103, 8], [100, 7], [98, 10], [95, 15], [92, 21], [89, 22], [86, 20], [80, 15], [77, 8], [75, 12], [73, 17], [70, 20], [66, 25], [62, 25], [58, 25], [56, 26], [52, 28], [50, 29], [48, 30], [50, 26], [55, 26], [57, 25], [59, 22], [55, 17], [52, 15], [48, 14], [44, 13], [43, 12], [40, 15], [39, 20], [37, 24], [35, 28], [36, 36], [34, 36], [30, 36], [27, 37], [26, 38], [23, 36], [22, 37], [19, 40], [15, 44], [12, 45], [8, 44], [3, 43], [0, 40], [-2, 37], [-6, 36], [-9, 37], [-10, 36]],
  // United Kingdom
  [[-5, 50], [-3, 53], [-5, 56], [-3, 58], [-1, 57], [0, 53], [1, 51], [-5, 50]],
  // Japan
  [[130, 31], [132, 33], [135, 34], [137, 35], [139, 37], [140, 39], [141, 41], [143, 42], [145, 44], [142, 45], [140, 44], [139, 40], [137, 37], [135, 35], [132, 34], [130, 31]],
  // Sumatra
  [[95, 5], [100, 0], [104, -3], [106, -6], [100, -5], [96, 3], [95, 5]],
  // Borneo
  [[109, 1], [113, 4], [117, 6], [119, 1], [117, -3], [112, -3], [109, 0], [109, 1]],
  // Java
  [[105, -6], [110, -7], [114, -8], [114, -9], [108, -8], [105, -7], [105, -6]],
  // New Guinea
  [[131, -1], [136, -2], [141, -3], [146, -6], [150, -9], [147, -8], [142, -8], [137, -6], [132, -4], [131, -1]],
  // Philippines
  [[120, 18], [122, 18], [122, 14], [121, 13], [124, 11], [126, 7], [122, 7], [120, 10], [120, 14], [120, 18]],
  // Australia
  [[114, -22], [114, -30], [115, -34], [118, -35], [124, -33], [129, -32], [132, -32], [135, -35], [138, -35], [140, -38], [145, -38], [150, -37], [153, -32], [153, -27], [150, -23], [146, -19], [142, -15], [142, -11], [137, -12], [135, -15], [132, -12], [130, -13], [126, -14], [122, -17], [118, -20], [114, -22]],
  // New Zealand
  [[167, -45], [170, -42], [173, -40], [175, -38], [177, -38], [174, -41], [172, -43], [168, -46], [167, -45]],
  // Madagascar
  [[44, -16], [47, -15], [50, -16], [49, -20], [45, -25], [43, -22], [44, -16]],
  // Iceland
  [[-22, 64], [-18, 63], [-15, 64], [-18, 66], [-22, 66], [-24, 65], [-22, 64]],
  // Sri Lanka
  [[80, 9], [81, 7], [80, 6], [79, 8], [80, 9]],
  // Taiwan
  [[120, 23], [121, 25], [122, 25], [121, 22], [120, 23]],
];

function drawMap(cv: Canvas): void {
  const { x, y, w, h } = MAP;
  // ocean: 5-stop radial gradient navy -> teal, centred slightly west
  const stops = [hex("#0a2540"), hex("#0e3a5c"), hex("#11557a"), hex("#0f6f7a"), hex("#14919b")];
  const ocx = x + w * 0.42;
  const ocy = y + h * 0.52;
  const oR = Math.hypot(w, h) * 0.62;
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const d = Math.hypot(xx - ocx, yy - ocy) / oR;
      cv.set(xx, yy, multiLerp(stops, d));
    }
  }
  // graticule every 30 degrees, faint
  const grat = hex("#bfe3e8");
  for (let lon = -150; lon <= 150; lon += 30) {
    const [gx] = project(lon, 0);
    cv.vline(gx, y, y + h, grat, 0.07);
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const [, gy] = project(0, lat);
    cv.hline(x, x + w, gy, grat, 0.07);
  }
  // land: 3-tone gradient fill + rim light + shadow edge
  const landTop = hex("#c8b878");
  const landMid = hex("#a68f52");
  const landBot = hex("#7d6a38");
  for (const poly of LAND) {
    const pts = poly.map((p) => project(p[0], p[1]));
    cv.poly(pts, landMid, 1, landTop, landBot);
    // rim light: offset copy of the outline toward the sun (upper left)
    const outline: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) outline.push(pts[i]);
    cv.polyline(outline.concat([outline[0]]), hex("#e8d9a0"), 1, 0.55);
  }
  // soft shadow edge along the south-east coast: draw a darker offset outline
  for (const poly of LAND) {
    const pts = poly.map((p) => project(p[0] + 0.6, p[1] - 0.6));
    cv.polyline(pts.concat([pts[0]]), hex("#4a3f22"), 1, 0.35);
  }
  // night-side terminator: soft dark overlay on the eastern side
  const night = hex("#061224");
  for (let xx = x; xx < x + w; xx++) {
    const t = (xx - (x + w * 0.62)) / (w * 0.38);
    if (t <= 0) continue;
    const a = Math.min(0.42, t * t * 0.55);
    for (let yy = y; yy < y + h; yy++) cv.set(xx, yy, night, a * 0.85);
  }
  // terminator curve (gold-ish faint)
  const tpts: [number, number][] = [];
  for (let yy = y; yy <= y + h; yy += 8) {
    const f = (yy - y) / h;
    tpts.push([x + w * 0.62 + Math.sin(f * Math.PI) * w * 0.05, yy]);
  }
  cv.polyline(tpts, GOLD_LIGHT, 1, 0.25);
  // halftone dot screen: PRNG-seeded, 45k dots, 3 radii
  for (let i = 0; i < 26000; i++) {
    const dx = x + Math.floor(rng() * w);
    const dy = y + Math.floor(rng() * h);
    const r = 1 + Math.floor(rng() * 3);
    const light = rng() < 0.5;
    const col = light ? hex("#ffffff") : hex("#061224");
    const al = 0.05 + rng() * 0.07;
    if (r === 1) cv.set(dx, dy, col, al);
    else cv.circle(dx, dy, r - 1, col, al);
  }
  // map frame
  cv.rect(x - 2, y - 2, w + 4, 2, GOLD, 0.9);
  cv.rect(x - 2, y + h, w + 4, 2, GOLD, 0.9);
  cv.rect(x - 2, y - 2, 2, h + 4, GOLD, 0.9);
  cv.rect(x + w, y - 2, 2, h + 4, GOLD, 0.9);
  // map corner labels
  drawText(cv, "ATLANTIC", x + 150, y + h - 22, 1, hex("#cfe8ec"), 0.8);
  drawText(cv, "PACIFIC", x + 78, y + 132, 1, hex("#cfe8ec"), 0.8);
  drawText(cv, "INDIAN OCEAN", x + 640, y + h - 60, 1, hex("#cfe8ec"), 0.8);
}

// ---------- cameo chrome ----------
function leaderLine(cv: Canvas, cx: number, cy: number, r: number, px: number, py: number): void {
  // from cameo edge toward the map point, stopping just short of it
  const dx = px - cx;
  const dy = py - cy;
  const d = Math.hypot(dx, dy);
  if (d < r + 6) return;
  const sx = cx + (dx / d) * (r + 2);
  const sy = cy + (dy / d) * (r + 2);
  const ex = cx + (dx / d) * (d - 8);
  const ey = cy + (dy / d) * (d - 8);
  cv.line(sx, sy, ex, ey, GOLD, 2, 0.85);
  cv.circle(px, py, 4, GOLD, 0.95);
  cv.circle(px, py, 2, hex("#fff3c4"), 1);
}
function cameoChrome(cv: Canvas, cx: number, cy: number, r: number, num: number, label: string): void {
  cv.clip = null;
  // drop shadow
  cv.circle(cx + 4, cy + 5, r + 1, hex("#000000"), 0.28);
  // gold rim: outer dark, inner bright
  cv.ring(cx, cy, r, GOLD_DARK, 5, 1);
  cv.ring(cx, cy, r - 2, GOLD_LIGHT, 2, 1);
  // numbered badge, top-left
  const bx = cx - r * 0.72;
  const by = cy - r * 0.72;
  cv.circle(bx, by, 13, GOLD, 1);
  cv.ring(bx, by, 13, GOLD_DARK, 2, 1);
  drawTextCentered(cv, String(num), bx, by - 7, 2, hex("#231a00"));
  // tiny "✓ 20 NOV" tag at the bottom
  const tag = "✓ 20 NOV";
  const tw = textWidth(tag, 1) + 10;
  const tx = cx - tw / 2;
  const ty = cy + r - 16;
  cv.rect(tx, ty, tw, 12, hex("#0a2540"), 0.92);
  cv.rect(tx, ty, tw, 1, GOLD, 1);
  drawText(cv, tag, tx + 5, ty + 2, 1, GOLD_LIGHT);
  // label under the tag is drawn by the caller in the column area instead
  void label;
}

// ---------- cameo scenes (drawn inside the clip circle) ----------
function sceneKyiv(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.clip = { cx, cy, r: r - 3 };
  cv.vgrad(cx - r, cy - r, r * 2, r * 2, hex("#2b1e4a"), hex("#e0703a"));
  // stars
  for (let i = 0; i < 26; i++) {
    cv.set(cx - r + rng() * 2 * r, cy - r + rng() * r, hex("#ffffff"), 0.5 + rng() * 0.5);
  }
  // river band
  cv.rect(cx - r, cy + r * 0.25, r * 2, r * 0.75, hex("#274b6d"));
  cv.rect(cx - r, cy + r * 0.25, r * 2, 3, hex("#7fb3d5"), 0.8);
  // bridge: deck sagging over the river + arch + pillars
  const bx0 = cx - r * 0.95;
  const bx1 = cx + r * 0.95;
  const by = cy + r * 0.18;
  cv.arc(cx, cy + r * 1.35, r * 1.05, Math.PI * 1.18, Math.PI * 1.82, hex("#1c1a17"), 4);
  cv.line(bx0, by, cx - r * 0.28, by + 10, hex("#1c1a17"), 4);
  cv.line(cx - r * 0.28, by + 10, cx + r * 0.28, by + 10, hex("#1c1a17"), 4);
  cv.line(cx + r * 0.28, by + 10, bx1, by, hex("#1c1a17"), 4);
  for (const px of [-0.6, -0.2, 0.2, 0.6]) {
    cv.line(cx + px * r, by + 8, cx + px * r, cy + r * 0.55, hex("#1c1a17"), 3);
  }
  // city skyline behind the bridge
  const sky = hex("#241a33");
  const heights = [0.5, 0.75, 0.45, 0.9, 0.6, 0.8, 0.5];
  for (let i = 0; i < 7; i++) {
    const bw = (r * 2) / 7;
    const bh = r * heights[i];
    cv.rect(cx - r + i * bw, by - bh, bw - 2, bh, sky);
    for (let wy = 0; wy < 3; wy++) {
      for (let wx = 0; wx < 2; wx++) {
        if (rng() < 0.6) cv.rect(cx - r + i * bw + 3 + wx * 7, by - bh + 4 + wy * 8, 3, 3, hex("#ffd76a"), 0.9);
      }
    }
  }
  // 3 missile arcs with flame heads
  for (let m = 0; m < 3; m++) {
    const sx = cx - r * 0.8 + m * r * 0.55;
    const sy = cy - r * 0.15 - m * r * 0.12;
    const ex = cx + r * (0.35 - m * 0.5);
    const ey = cy + r * 0.1;
    const mx = (sx + ex) / 2;
    const my = Math.min(sy, ey) - r * 0.45;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const px = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * ex;
      const py = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * ey;
      pts.push([px, py]);
    }
    cv.polyline(pts, hex("#ffb347"), 2, 0.95);
    cv.circle(ex, ey, 4, hex("#ff5a1f"), 1);
    cv.circle(ex, ey, 8, hex("#ffb347"), 0.45);
  }
  // 12 drone glyphs
  for (let i = 0; i < 12; i++) {
    const dx = cx - r * 0.9 + rng() * r * 1.8;
    const dy = cy - r * 0.85 + rng() * r * 0.9;
    cv.line(dx - 3, dy - 3, dx + 3, dy + 3, hex("#e8e4d8"), 1, 0.95);
    cv.line(dx - 3, dy + 3, dx + 3, dy - 3, hex("#e8e4d8"), 1, 0.95);
    cv.circle(dx, dy, 1, hex("#ff5a1f"), 0.9);
  }
  // searchlights: two translucent beams from the ground
  for (const lx of [-0.55, 0.5]) {
    const gx = cx + lx * r;
    const gy = cy + r * 0.2;
    cv.poly([[gx, gy], [gx - 26, cy - r * 0.9], [gx + 6, cy - r * 0.9]], hex("#fff3c4"), 0.16);
  }
  // smoke: 9 stacked translucent ellipses
  for (let i = 0; i < 9; i++) {
    const sx = cx - r * 0.5 + i * r * 0.13 + (rng() - 0.5) * 10;
    const sy = cy - r * 0.05 - i * r * 0.07;
    cv.ellipse(sx, sy, 16 + rng() * 10, 8 + rng() * 5, hex("#8d8d94"), 0.28);
  }
  cv.clip = null;
}

function sceneHormuz(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.clip = { cx, cy, r: r - 3 };
  cv.vgrad(cx - r, cy - r, r * 2, r * 2, hex("#3a2a1a"), hex("#e07b2e"));
  // sea
  cv.rect(cx - r, cy + r * 0.1, r * 2, r, hex("#123a52"));
  for (let i = 0; i < 14; i++) {
    const wy = cy + r * 0.15 + rng() * r * 0.8;
    cv.hline(cx - r + rng() * r, cx - r + r * (1 + rng()), wy, hex("#7fb3d5"), 0.25 + rng() * 0.3);
  }
  // tanker hull + superstructure + funnel
  const hy = cy + r * 0.12;
  cv.poly([[cx - r * 0.85, hy], [cx + r * 0.85, hy], [cx + r * 0.7, hy + r * 0.28], [cx - r * 0.7, hy + r * 0.28]], hex("#5a1f16"));
  cv.rect(cx + r * 0.45, hy - r * 0.32, r * 0.3, r * 0.32, hex("#e8e4d8"));
  for (let i = 0; i < 3; i++) {
    cv.rect(cx + r * 0.48, hy - r * 0.28 + i * r * 0.09, r * 0.24, 3, hex("#274b6d"));
  }
  cv.rect(cx - r * 0.55, hy - r * 0.2, r * 0.14, r * 0.2, hex("#c9a227"));
  // flame plume from the midship
  const fx = cx - r * 0.1;
  const fy = hy - r * 0.1;
  cv.poly([[fx - 14, fy], [fx - 4, fy - r * 0.75], [fx + 8, fy - r * 0.5], [fx + 16, fy]], hex("#ff7a1f"), 0.95);
  cv.poly([[fx - 7, fy], [fx - 2, fy - r * 0.5], [fx + 6, fy - r * 0.32], [fx + 8, fy]], hex("#ffd76a"), 0.95);
  cv.circle(fx + 2, fy - r * 0.72, 5, hex("#ff5a1f"), 0.9);
  // smoke column
  for (let i = 0; i < 6; i++) {
    cv.ellipse(fx + 4 + i * 3, fy - r * 0.3 - i * r * 0.12, 12 + i * 3, 7 + i, hex("#3a3a40"), 0.35);
  }
  // fire reflection on the water
  for (let i = 0; i < 10; i++) {
    const rx = fx - 10 + rng() * 24;
    const ry = hy + r * 0.32 + rng() * r * 0.5;
    cv.hline(rx - 8, rx + 8, ry, hex("#ff9a3d"), 0.3 + rng() * 0.35);
  }
  cv.clip = null;
}

function sceneICJ(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.clip = { cx, cy, r: r - 3 };
  cv.vgrad(cx - r, cy - r, r * 2, r * 2, hex("#bcd8e8"), hex("#7fa8c4"));
  // Hague facade: pediment + columns + steps
  const fy = cy + r * 0.45;
  cv.rect(cx - r * 0.8, fy - r * 0.55, r * 1.6, r * 0.55, hex("#e8e0cc"));
  cv.poly([[cx - r * 0.85, fy - r * 0.55], [cx + r * 0.85, fy - r * 0.55], [cx, fy - r * 0.95]], hex("#c9b98f"));
  cv.circle(cx, fy - r * 0.72, 6, hex("#8a6d1f"));
  for (let i = 0; i < 5; i++) {
    const colx = cx - r * 0.62 + i * r * 0.31;
    cv.rect(colx - 4, fy - r * 0.52, 8, r * 0.5, hex("#f4efe0"));
    cv.rect(colx - 6, fy - r * 0.55, 12, 4, hex("#c9b98f"));
  }
  cv.rect(cx - r * 0.9, fy, r * 1.8, 6, hex("#b8ab84"));
  cv.rect(cx - r * 0.95, fy + 6, r * 1.9, 6, hex("#a89a72"));
  // gavel, angled, in front
  const gx = cx + r * 0.18;
  const gy = cy - r * 0.05;
  cv.line(gx - r * 0.35, gy + r * 0.45, gx + r * 0.3, gy - r * 0.28, hex("#6b4226"), 6);
  cv.rect(gx - r * 0.12, gy - r * 0.38, r * 0.5, r * 0.16, hex("#3a2a1a"));
  cv.rect(gx - r * 0.16, gy - r * 0.42, r * 0.58, 4, hex("#8a6d1f"));
  // scales of justice, small, left
  const sx = cx - r * 0.55;
  const sy = cy - r * 0.15;
  cv.vline(sx, sy - r * 0.3, sy + r * 0.25, hex("#8a6d1f"), 1);
  cv.hline(sx - r * 0.22, sx + r * 0.22, sy - r * 0.3, hex("#8a6d1f"), 1);
  cv.line(sx - r * 0.22, sy - r * 0.3, sx - r * 0.3, sy - r * 0.05, hex("#8a6d1f"), 1);
  cv.line(sx + r * 0.22, sy - r * 0.3, sx + r * 0.3, sy - r * 0.05, hex("#8a6d1f"), 1);
  cv.ellipse(sx - r * 0.3, sy - r * 0.02, 9, 4, hex("#c9a227"));
  cv.ellipse(sx + r * 0.3, sy - r * 0.02, 9, 4, hex("#c9a227"));
  cv.clip = null;
}

function sceneNvidia(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.clip = { cx, cy, r: r - 3 };
  cv.vgrad(cx - r, cy - r, r * 2, r * 2, hex("#0d1f14"), hex("#123524"));
  // chip die, centre-left
  const chx = cx - r * 0.42;
  const chy = cy - r * 0.15;
  const cs = r * 0.52;
  for (let i = 0; i < 8; i++) {
    cv.rect(chx - cs / 2 - 6, chy - cs / 2 + i * (cs / 7), 6, 3, hex("#7ee787"));
    cv.rect(chx + cs / 2, chy - cs / 2 + i * (cs / 7), 6, 3, hex("#7ee787"));
    cv.rect(chx - cs / 2 + i * (cs / 7), chy - cs / 2 - 6, 3, 6, hex("#7ee787"));
    cv.rect(chx - cs / 2 + i * (cs / 7), chy + cs / 2, 3, 6, hex("#7ee787"));
  }
  cv.rect(chx - cs / 2, chy - cs / 2, cs, cs, hex("#1e7d46"));
  cv.rect(chx - cs / 4, chy - cs / 4, cs / 2, cs / 2, hex("#2ea36b"));
  drawText(cv, "NV", chx - 8, chy - 7, 2, hex("#e8fff0"));
  // red candlestick cascade, right side
  const candles: [number, number, number][] = [
    [0.08, 0.55, 0.42], [0.26, 0.68, 0.5], [0.44, 0.78, 0.58], [0.62, 0.86, 0.66], [0.8, 0.94, 0.72],
  ];
  for (const [fx, top, bot] of candles) {
    const px = cx + fx * r - r * 0.1;
    const w = r * 0.13;
    cv.vline(px + w / 2, cy - top * r, cy - bot * r, hex("#ff6b5e"), 1);
    cv.rect(px, cy - bot * r, w, (bot - top) * r, hex("#d9261c"));
  }
  // trend arrow down
  cv.line(cx - r * 0.05, cy - r * 0.75, cx + r * 0.85, cy + r * 0.55, hex("#ff8a7a"), 2, 0.8);
  // "-14%" in red
  drawText(cv, "-14%", cx - r * 0.55, cy + r * 0.55, 3, hex("#ff6b5e"));
  cv.clip = null;
}

function sceneAkvan(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.clip = { cx, cy, r: r - 3 };
  cv.vgrad(cx - r, cy - r, r * 2, r * 2, hex("#274b6d"), hex("#9fc4d8"));
  // sea at the bottom
  cv.rect(cx - r, cy + r * 0.35, r * 2, r * 0.65, hex("#1d4d6b"));
  for (let i = 0; i < 10; i++) {
    const wy = cy + r * 0.4 + rng() * r * 0.55;
    cv.hline(cx - r + rng() * r * 0.5, cx - r + r * (0.6 + rng() * 0.9), wy, hex("#bcd8e8"), 0.3);
  }
  // coastline strip (Gopalpur)
  cv.poly([[cx - r, cy + r * 0.35], [cx + r, cy + r * 0.28], [cx + r, cy + r * 0.42], [cx - r, cy + r * 0.5]], hex("#c8b878"));
  // cyclone spiral: concentric arcs, tightening
  const ccx = cx;
  const ccy = cy - r * 0.08;
  for (let k = 0; k < 7; k++) {
    const rr = r * (0.16 + k * 0.11);
    const a0 = k * 0.9;
    const a1 = a0 + Math.PI * 1.5;
    cv.arc(ccx, ccy, rr, a0, a1, k % 2 ? hex("#ffffff") : hex("#dfe9f0"), 3, 0.85);
  }
  cv.circle(ccx, ccy, 7, hex("#0a2540"), 1);
  cv.circle(ccx, ccy, 3, hex("#ffffff"), 1);
  // wind barbs around the spiral
  for (let i = 0; i < 8; i++) {
    const an = (i / 8) * Math.PI * 2 + 0.4;
    const bx = ccx + Math.cos(an) * r * 0.82;
    const by = ccy + Math.sin(an) * r * 0.82;
    const tx = bx + Math.cos(an + 1.2) * 12;
    const ty = by + Math.sin(an + 1.2) * 12;
    cv.line(bx, by, tx, ty, hex("#ffffff"), 2, 0.9);
    cv.line(tx, ty, tx - Math.cos(an) * 6, ty - Math.sin(an) * 6, hex("#ffffff"), 1, 0.9);
  }
  // rain streaks
  for (let i = 0; i < 22; i++) {
    const rx = cx - r + rng() * 2 * r;
    const ry = cy - r * 0.7 + rng() * r * 1.1;
    cv.line(rx, ry, rx - 3, ry + 9, hex("#cfe8ec"), 1, 0.5);
  }
  cv.clip = null;
}

function sceneCOP31(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.clip = { cx, cy, r: r - 3 };
  cv.vgrad(cx - r, cy - r, r * 2, r * 2, hex("#f4d47c"), hex("#7fae7a"));
  // sun
  cv.circle(cx - r * 0.55, cy - r * 0.6, 14, hex("#fff3c4"), 0.9);
  // flame-and-leaf emblem, centre
  const ex = cx;
  const ey = cy - r * 0.18;
  // leaf
  cv.ellipse(ex - r * 0.08, ey + r * 0.12, r * 0.34, r * 0.16, hex("#1e7d46"));
  cv.line(ex - r * 0.4, ey + r * 0.12, ex + r * 0.24, ey + r * 0.12, hex("#0d4d24"), 2);
  // flame above the leaf
  cv.poly([[ex - 12, ey], [ex - 2, ey - r * 0.42], [ex + 6, ey - r * 0.2], [ex + 14, ey]], hex("#ff7a1f"), 0.95);
  cv.poly([[ex - 6, ey], [ex, ey - r * 0.22], [ex + 6, ey]], hex("#ffd76a"), 0.95);
  // protest band: figures with placards along the bottom
  const gy = cy + r * 0.55;
  cv.rect(cx - r, gy, r * 2, r * 0.45, hex("#2b3a2e"));
  for (let i = 0; i < 7; i++) {
    const fx = cx - r * 0.85 + i * r * 0.28;
    cv.circle(fx, gy + r * 0.08, 5, hex("#f4d7b0"));
    cv.rect(fx - 4, gy + r * 0.14, 8, r * 0.2, i % 2 ? hex("#e8c96a") : hex("#c9a227"));
    // placard on a stick
    cv.vline(fx + 6, gy - r * 0.08, gy + r * 0.12, hex("#e8e4d8"), 1);
    cv.rect(fx + 2, gy - r * 0.22, 14, 10, hex("#f4efe0"));
    cv.hline(fx + 4, fx + 14, gy - r * 0.17, hex("#1c1a17"), 1);
    cv.hline(fx + 4, fx + 12, gy - r * 0.13, hex("#1c1a17"), 1);
  }
  cv.clip = null;
}

function scenePeru(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.clip = { cx, cy, r: r - 3 };
  cv.vgrad(cx - r, cy - r, r * 2, r * 2, hex("#e8c98a"), hex("#b3541e"));
  // Andes: overlapping triangles with snow caps
  const peaks: [number, number, number][] = [
    [-0.95, 0.75, 0.55], [-0.55, 0.95, 0.75], [-0.1, 0.7, 0.5], [0.35, 0.9, 0.7], [0.75, 0.6, 0.45],
  ];
  for (const [px, pw, ph] of peaks) {
    const bx = cx + px * r;
    const bw = pw * r;
    const bh = ph * r;
    const by = cy + r * 0.42;
    cv.poly([[bx - bw, by], [bx, by - bh], [bx + bw, by]], hex("#5a4632"));
    cv.poly([[bx - bw * 0.22, by - bh * 0.78], [bx, by - bh], [bx + bw * 0.22, by - bh * 0.78]], hex("#f4f4f4"));
  }
  // quake waveform across the middle
  const wpts: [number, number][] = [];
  const wy = cy - r * 0.12;
  for (let i = 0; i <= 24; i++) {
    const px = cx - r + (i / 24) * 2 * r;
    const amp = Math.sin(i * 1.7) * r * 0.28 * (i > 8 && i < 17 ? 1 : 0.35);
    wpts.push([px, wy + amp]);
  }
  cv.polyline(wpts, hex("#ff3b2f"), 3, 0.95);
  // rugby ball, lower right
  const rx = cx + r * 0.35;
  const ry = cy + r * 0.55;
  cv.ellipse(rx, ry, 26, 15, hex("#7a4a21"));
  cv.ellipse(rx, ry, 26, 15, hex("#a06a35"), 0.4);
  cv.line(rx - 12, ry - 8, rx + 12, ry + 8, hex("#f4efe0"), 2);
  cv.line(rx - 12, ry + 8, rx + 12, ry - 8, hex("#f4efe0"), 2);
  cv.clip = null;
}

// ---------- map vignettes (60px circles) ----------
function vignetteChrome(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.clip = null;
  cv.circle(cx + 2, cy + 2, r + 1, hex("#000000"), 0.25);
  cv.ring(cx, cy, r, GOLD, 3, 1);
  cv.ring(cx, cy, r - 2, GOLD_LIGHT, 1, 1);
}
function vigKerch(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.clip = { cx, cy, r: r - 2 };
  cv.vgrad(cx - r, cy - r, r * 2, r * 2, hex("#274b6d"), hex("#7fa8c4"));
  cv.rect(cx - r, cy + r * 0.2, r * 2, r, hex("#1d4d6b"));
  cv.line(cx - r, cy, cx - r * 0.12, cy, hex("#e8e4d8"), 4);
  cv.line(cx + r * 0.12, cy, cx + r, cy, hex("#e8e4d8"), 4);
  cv.line(cx - r * 0.12, cy, cx - r * 0.12, cy + r * 0.35, hex("#e8e4d8"), 3);
  cv.line(cx + r * 0.12, cy, cx + r * 0.12, cy + r * 0.35, hex("#e8e4d8"), 3);
  cv.circle(cx, cy - 4, 4, hex("#ff5a1f"));
  cv.circle(cx, cy - 4, 8, hex("#ffb347"), 0.4);
  cv.clip = null;
}
function vigLublin(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.clip = { cx, cy, r: r - 2 };
  cv.vgrad(cx - r, cy - r, r * 2, r * 2, hex("#3a3a40"), hex("#8d8d94"));
  // missile fin + body, diagonal
  cv.line(cx - r * 0.5, cy + r * 0.5, cx + r * 0.5, cy - r * 0.5, hex("#c9c9c9"), 7);
  cv.poly([[cx + r * 0.5, cy - r * 0.5], [cx + r * 0.75, cy - r * 0.2], [cx + r * 0.3, cy - r * 0.28]], hex("#8d8d94"));
  cv.poly([[cx - r * 0.5, cy + r * 0.5], [cx - r * 0.2, cy + r * 0.75], [cx - r * 0.28, cy + r * 0.3]], hex("#8d8d94"));
  cv.circle(cx + r * 0.62, cy - r * 0.62, 4, hex("#ff5a1f"));
  cv.clip = null;
}
function vigShenzhen(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.clip = { cx, cy, r: r - 2 };
  cv.vgrad(cx - r, cy - r, r * 2, r * 2, hex("#bcd8e8"), hex("#e8c96a"));
  // three podiums with three figures
  const cols = [hex("#b3271e"), hex("#c9a227"), hex("#274b6d")];
  for (let i = 0; i < 3; i++) {
    const px = cx - r * 0.6 + i * r * 0.6;
    const ph = r * (0.55 - Math.abs(i - 1) * 0.18);
    cv.rect(px - 11, cy + r * 0.55 - ph, 22, ph, cols[i]);
    cv.circle(px, cy + r * 0.55 - ph - 14, 6, hex("#f4d7b0"));
    cv.rect(px - 5, cy + r * 0.55 - ph - 8, 10, 9, hex("#1c1a17"));
  }
  cv.clip = null;
}
function vigTSMC(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.clip = { cx, cy, r: r - 2 };
  cv.vgrad(cx - r, cy - r, r * 2, r * 2, hex("#0d1f14"), hex("#123524"));
  cv.circle(cx, cy, r * 0.72, hex("#9aa8b8"));
  cv.circle(cx, cy, r * 0.72, hex("#c9d4de"), 0.35);
  for (let i = -2; i <= 2; i++) {
    cv.vline(cx + i * r * 0.24, cy - r * 0.65, cy + r * 0.65, hex("#5a6a7a"), 0.5);
    cv.hline(cx - r * 0.65, cx + r * 0.65, cy + i * r * 0.24, hex("#5a6a7a"), 0.5);
  }
  cv.circle(cx, cy, 5, hex("#1e7d46"));
  cv.clip = null;
}
function vigCapsule(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.clip = { cx, cy, r: r - 2 };
  cv.vgrad(cx - r, cy - r, r * 2, r * 2, hex("#f4efe0"), hex("#c9b98f"));
  // capsule, diagonal
  cv.line(cx - r * 0.55, cy + r * 0.55, cx + r * 0.55, cy - r * 0.55, hex("#e8e4d8"), 13);
  cv.line(cx - r * 0.55, cy + r * 0.55, cx, cy, hex("#b3271e"), 13);
  cv.ring(cx - r * 0.55, cy + r * 0.55, 7, hex("#b3271e"), 2);
  cv.ring(cx + r * 0.55, cy - r * 0.55, 7, hex("#e8e4d8"), 2);
  cv.clip = null;
}
function vigBC(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.clip = { cx, cy, r: r - 2 };
  cv.vgrad(cx - r, cy - r, r * 2, r * 2, hex("#bcd8e8"), hex("#7fa8c4"));
  // legislature dome
  cv.rect(cx - r * 0.7, cy + r * 0.1, r * 1.4, r * 0.5, hex("#e8e0cc"));
  cv.ellipse(cx, cy + r * 0.1, r * 0.35, r * 0.3, hex("#274b6d"));
  cv.vline(cx, cy - r * 0.35, cy - r * 0.15, hex("#c9a227"), 2);
  cv.circle(cx, cy - r * 0.35, 3, hex("#c9a227"));
  for (let i = 0; i < 4; i++) {
    cv.rect(cx - r * 0.55 + i * r * 0.3, cy + r * 0.18, 5, r * 0.4, hex("#8a7a52"));
  }
  cv.clip = null;
}

// ---------- gold rosette seal ----------
function rosette(cv: Canvas, cx: number, cy: number, r: number): void {
  // starburst edge
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * Math.PI * 2;
    const a1 = ((i + 0.5) / 24) * Math.PI * 2;
    cv.poly([
      [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r],
      [cx + Math.cos(a1) * (r + 7), cy + Math.sin(a1) * (r + 7)],
      [cx + Math.cos(a0 + Math.PI / 12) * r, cy + Math.sin(a0 + Math.PI / 12) * r],
    ], GOLD);
  }
  cv.circle(cx, cy, r, GOLD);
  cv.ring(cx, cy, r - 3, GOLD_DARK, 2);
  cv.circle(cx, cy, r - 7, hex("#f7e9b0"));
  drawTextCentered(cv, "DATE", cx, cy - 16, 1, GOLD_DARK);
  drawTextCentered(cv, "CHECKED", cx, cy - 8, 1, GOLD_DARK);
  drawTextCentered(cv, "20.11.26", cx, cy + 2, 1, INK);
  drawTextCentered(cv, "36/36", cx, cy + 10, 1, INK);
}

// ---------- 22px glyphs that open every brief ----------
const G = {
  ink: hex("#1c1a17"),
  red: hex("#b3271e"),
  gold: hex("#8a6d1f"),
  navy: hex("#274b6d"),
  green: hex("#1e7d46"),
  teal: hex("#0f6f7a"),
};
function glyph(cv: Canvas, kind: string, x: number, y: number): void {
  // 22x22 box origin (x, y)
  const c = G;
  switch (kind) {
    case "burst": // explosion / barrage
      cv.circle(x + 11, y + 11, 4, c.red);
      for (let i = 0; i < 8; i++) {
        const an = (i / 8) * Math.PI * 2;
        cv.line(x + 11, y + 11, x + 11 + Math.cos(an) * 10, y + 11 + Math.sin(an) * 10, c.red, 2);
      }
      break;
    case "bridge":
      cv.line(x + 1, y + 14, x + 21, y + 14, c.ink, 2);
      cv.arc(x + 11, y + 22, 9, Math.PI * 1.15, Math.PI * 1.85, c.ink, 2);
      cv.line(x + 4, y + 14, x + 4, y + 20, c.ink, 1);
      cv.line(x + 18, y + 14, x + 18, y + 20, c.ink, 1);
      break;
    case "missile":
      cv.line(x + 4, y + 18, x + 18, y + 4, c.ink, 3);
      cv.poly([[x + 18, y + 4], [x + 21, y + 8], [x + 15, y + 9]], c.red);
      cv.poly([[x + 4, y + 18], [x + 2, y + 21], [x + 8, y + 19]], c.ink);
      break;
    case "flag":
      cv.line(x + 5, y + 3, x + 5, y + 20, c.ink, 2);
      cv.poly([[x + 5, y + 3], [x + 19, y + 6], [x + 5, y + 10]], c.green);
      break;
    case "rail":
      cv.line(x + 1, y + 11, x + 9, y + 11, c.ink, 2);
      cv.line(x + 13, y + 11, x + 21, y + 11, c.ink, 2);
      cv.line(x + 11, y + 7, x + 11, y + 15, c.red, 2);
      cv.line(x + 5, y + 7, x + 5, y + 15, c.ink, 1);
      cv.line(x + 17, y + 7, x + 17, y + 15, c.ink, 1);
      break;
    case "shield":
      cv.poly([[x + 11, y + 2], [x + 19, y + 5], [x + 19, y + 12], [x + 11, y + 20], [x + 3, y + 12], [x + 3, y + 5]], c.navy);
      drawText(cv, "✓", x + 7, y + 8, 1, hex("#ffffff"));
      break;
    case "check":
      cv.poly([[x + 3, y + 11], [x + 9, y + 17], [x + 19, y + 5]], c.green);
      break;
    case "fence":
      cv.vline(x + 4, y + 3, y + 20, c.ink, 2);
      cv.vline(x + 11, y + 3, y + 20, c.ink, 2);
      cv.vline(x + 18, y + 3, y + 20, c.ink, 2);
      cv.hline(x + 1, x + 21, y + 7, c.ink, 2);
      cv.hline(x + 1, x + 21, y + 15, c.ink, 2);
      break;
    case "bolt":
      cv.poly([[x + 13, y + 2], [x + 5, y + 12], [x + 10, y + 12], [x + 8, y + 20], [x + 17, y + 9], [x + 12, y + 9]], c.gold);
      break;
    case "gavel":
      cv.line(x + 5, y + 17, x + 17, y + 5, c.ink, 3);
      cv.rect(x + 13, y + 2, 7, 5, c.ink);
      cv.rect(x + 3, y + 18, 10, 3, c.gold);
      break;
    case "tower":
      cv.rect(x + 8, y + 3, 6, 17, c.navy);
      cv.rect(x + 6, y + 1, 10, 3, c.navy);
      for (let i = 0; i < 4; i++) cv.rect(x + 9, y + 5 + i * 4, 4, 2, hex("#ffffff"));
      break;
    case "ship":
      cv.poly([[x + 3, y + 13], [x + 19, y + 13], [x + 16, y + 18], [x + 6, y + 18]], c.navy);
      cv.rect(x + 13, y + 7, 5, 6, c.ink);
      cv.poly([[x + 7, y + 13], [x + 9, y + 4], [x + 12, y + 13]], c.red);
      break;
    case "senate":
      cv.rect(x + 3, y + 10, 16, 10, c.navy);
      cv.poly([[x + 2, y + 10], [x + 20, y + 10], [x + 11, y + 4]], c.navy);
      cv.vline(x + 7, y + 12, y + 18, hex("#ffffff"), 1);
      cv.vline(x + 11, y + 12, y + 18, hex("#ffffff"), 1);
      cv.vline(x + 15, y + 12, y + 18, hex("#ffffff"), 1);
      break;
    case "clock":
      cv.ring(x + 11, y + 11, 8, c.ink, 2);
      cv.line(x + 11, y + 11, x + 11, y + 5, c.ink, 2);
      cv.line(x + 11, y + 11, x + 16, y + 13, c.ink, 2);
      break;
    case "chartdown":
      cv.line(x + 3, y + 4, x + 8, y + 9, c.red, 2);
      cv.line(x + 8, y + 9, x + 13, y + 7, c.red, 2);
      cv.line(x + 13, y + 7, x + 19, y + 17, c.red, 2);
      cv.poly([[x + 19, y + 17], [x + 19, y + 12], [x + 14, y + 17]], c.red);
      cv.hline(x + 2, x + 20, y + 20, c.ink, 1);
      break;
    case "chip":
      cv.rect(x + 6, y + 6, 10, 10, c.green);
      cv.rect(x + 9, y + 9, 4, 4, hex("#e8fff0"));
      for (let i = 0; i < 3; i++) {
        cv.hline(x + 2, x + 6, y + 8 + i * 4, c.green, 1);
        cv.hline(x + 16, x + 20, y + 8 + i * 4, c.green, 1);
        cv.vline(x + 8 + i * 4, y + 2, y + 6, c.green, 1);
        cv.vline(x + 8 + i * 4, y + 16, y + 20, c.green, 1);
      }
      break;
    case "coin":
      cv.circle(x + 11, y + 11, 8, c.gold);
      cv.ring(x + 11, y + 11, 8, hex("#5a4308"), 1);
      drawText(cv, "B", x + 8, y + 7, 1, hex("#5a4308"));
      break;
    case "summit":
      cv.line(x + 5, y + 4, x + 5, y + 20, c.ink, 1);
      cv.line(x + 11, y + 2, x + 11, y + 20, c.ink, 1);
      cv.line(x + 17, y + 4, x + 17, y + 20, c.ink, 1);
      cv.poly([[x + 5, y + 4], [x + 10, y + 6], [x + 5, y + 8]], c.red);
      cv.poly([[x + 11, y + 2], [x + 16, y + 4], [x + 11, y + 6]], c.navy);
      cv.poly([[x + 17, y + 4], [x + 21, y + 6], [x + 17, y + 8]], c.green);
      break;
    case "eye":
      cv.ellipse(x + 11, y + 11, 9, 5, c.navy);
      cv.circle(x + 11, y + 11, 3, hex("#ffffff"));
      cv.circle(x + 11, y + 11, 1, c.ink);
      break;
    case "factory":
      cv.poly([[x + 3, y + 20], [x + 3, y + 10], [x + 8, y + 13], [x + 12, y + 9], [x + 19, y + 9], [x + 19, y + 20]], c.navy);
      cv.rect(x + 5, y + 3, 3, 8, c.ink);
      cv.circle(x + 6, y + 3, 2, hex("#8d8d94"), 0.7);
      break;
    case "pill":
      cv.line(x + 6, y + 16, x + 16, y + 6, c.red, 6);
      cv.line(x + 6, y + 16, x + 11, y + 11, hex("#e8e4d8"), 6);
      break;
    case "vote":
      cv.rect(x + 4, y + 10, 14, 9, c.navy);
      cv.rect(x + 7, y + 7, 8, 3, c.navy);
      cv.poly([[x + 8, y + 13], [x + 10, y + 16], [x + 15, y + 10]], hex("#ffffff"));
      break;
    case "alert":
      cv.poly([[x + 11, y + 2], [x + 20, y + 19], [x + 2, y + 19]], c.gold);
      drawText(cv, "!", x + 10, y + 9, 1, c.ink);
      break;
    case "storm":
      cv.arc(x + 11, y + 11, 9, 0, Math.PI * 1.4, c.teal, 2);
      cv.arc(x + 11, y + 11, 6, Math.PI * 0.6, Math.PI * 2.1, c.teal, 2);
      cv.arc(x + 11, y + 11, 3, Math.PI * 1.2, Math.PI * 2.8, c.teal, 2);
      break;
    case "mic":
      cv.ellipse(x + 11, y + 8, 4, 6, c.ink);
      cv.arc(x + 11, y + 10, 6, Math.PI * 0.15, Math.PI * 0.85, c.ink, 1);
      cv.vline(x + 11, y + 16, y + 20, c.ink, 1);
      cv.line(x + 3, y + 3, x + 19, y + 19, c.red, 2);
      break;
    case "bars":
      cv.rect(x + 3, y + 14, 4, 6, c.navy);
      cv.rect(x + 9, y + 10, 4, 10, c.navy);
      cv.rect(x + 15, y + 6, 4, 14, c.red);
      break;
    case "star":
      cv.poly([[x + 11, y + 2], [x + 13, y + 8], [x + 19, y + 8], [x + 14, y + 12], [x + 16, y + 18], [x + 11, y + 14], [x + 6, y + 18], [x + 8, y + 12], [x + 3, y + 8], [x + 9, y + 8]], c.gold);
      break;
    case "wave":
      cv.polyline([[x + 2, y + 11], [x + 6, y + 11], [x + 8, y + 5], [x + 10, y + 17], [x + 12, y + 7], [x + 14, y + 11], [x + 20, y + 11]], c.red, 2);
      break;
    case "leaf":
      cv.ellipse(x + 11, y + 12, 8, 5, c.green);
      cv.line(x + 4, y + 12, x + 18, y + 12, hex("#0d4d24"), 1);
      cv.poly([[x + 11, y + 12], [x + 13, y + 4], [x + 15, y + 12]], hex("#ff7a1f"));
      break;
    case "globe":
      cv.circle(x + 11, y + 11, 8, c.teal);
      cv.ellipse(x + 11, y + 11, 3, 8, hex("#ffffff"), 0.6);
      cv.hline(x + 3, x + 19, y + 11, hex("#ffffff"), 0.6);
      break;
    case "rugby":
      cv.ellipse(x + 11, y + 11, 9, 5, hex("#7a4a21"));
      cv.line(x + 6, y + 8, x + 16, y + 14, hex("#f4efe0"), 1);
      cv.line(x + 6, y + 14, x + 16, y + 8, hex("#f4efe0"), 1);
      break;
    case "arrows":
      cv.line(x + 3, y + 7, x + 19, y + 7, c.green, 2);
      cv.poly([[x + 19, y + 7], [x + 15, y + 4], [x + 15, y + 10]], c.green);
      cv.line(x + 19, y + 15, x + 3, y + 15, c.navy, 2);
      cv.poly([[x + 3, y + 15], [x + 7, y + 12], [x + 7, y + 18]], c.navy);
      break;
    default:
      cv.ring(x + 11, y + 11, 8, c.ink, 1);
      break;
  }
}

// ---------- the 36 briefs (fresh wording, every item dated 20 Nov 2026) ----------
interface Brief {
  n: number;
  head: string;
  body: string;
  glyph: string;
}
const BRIEFS: Brief[] = [
  { n: 1, head: "KYIV BARRAGE", body: "Night barrage: 400+ drones, 110+ missiles. Eight killed, 28 hurt.", glyph: "burst" },
  { n: 2, head: "BRIDGES HIT", body: "Three Dnipro crossings struck; traffic shut on the city's spans.", glyph: "bridge" },
  { n: 3, head: "POLAND MISSILES", body: "Two Russian cruise missiles fell in Lublin; no one hurt.", glyph: "missile" },
  { n: 4, head: "BEAR TRAP", body: "Ukraine retakes 14 settlements near Kharkiv, about 200 sq km.", glyph: "flag" },
  { n: 5, head: "KERCH RAIL BREAK", body: "Neptune strikes cut road and rail; one track runs again.", glyph: "rail" },
  { n: 6, head: "SECURITY PLEDGE", body: "Kyiv, Berlin, Paris, London agree binding post-war guarantees.", glyph: "shield" },
  { n: 7, head: "HUNGARY ENDS VETO", body: "Budapest clears the way for Ukraine's EU accession talks.", glyph: "check" },
  { n: 8, head: "ESTONIA CLOSES", body: "Tallinn shuts its Russian frontier for at least six months.", glyph: "fence" },
  { n: 9, head: "GRID EMERGENCY", body: "Nuclear plants cut output; emergency blackouts in 11 regions.", glyph: "bolt" },
  { n: 10, head: "GENOCIDE RULING", body: "World court: Myanmar guilty of genocide against the Rohingya.", glyph: "gavel" },
  { n: 11, head: "PIF TOWER HIT", body: "Houthi missile scars Riyadh's tallest tower; no injuries.", glyph: "tower" },
  { n: 12, head: "TANKER ABLAZE", body: "Oil tanker burns in Hormuz as US blockade bites; IEA warns.", glyph: "ship" },
  { n: 13, head: "SENATE BLOCKS WAR", body: "US Senate votes 51-48 against an Iran war-powers measure.", glyph: "senate" },
  { n: 14, head: "TRUMP WAITS", body: "No rush on Iran, Trump says: 'See what happens after Jan 1.'", glyph: "clock" },
  { n: 15, head: "STOCKS TUMBLE", body: "S&P -3.7%, Nasdaq -5.3%, Dow -1.9%: a seventh straight fall.", glyph: "chartdown" },
  { n: 16, head: "NVIDIA -14%", body: "Chip giant sheds 14% on SEC probe reports; $2.5T gone since peak.", glyph: "chip" },
  { n: 17, head: "ANTHROPIC SLIDES", body: "IPO day two: shares -9% to $89 after a record $81.3B listing.", glyph: "chartdown" },
  { n: 18, head: "BITCOIN SINKS", body: "Third straight down day; near $61,700, lowest since July.", glyph: "coin" },
  { n: 19, head: "SHENZHEN SUMMIT", body: "Trump, Xi and Putin meet three-way for the first time.", glyph: "summit" },
  { n: 20, head: "AI ARMS PACT", body: "US and China agree humans must oversee military AI.", glyph: "eye" },
  { n: 21, head: "AI ABROAD TAX", body: "Trump floats penalties for US firms building AI centres overseas.", glyph: "factory" },
  { n: 22, head: "DRUG SUPPLY ALERT", body: "US panel: China could choke America's medicine supply.", glyph: "pill" },
  { n: 23, head: "CANADA BUDGET", body: "Liberals' budget passes 162-151; BC turns Conservative.", glyph: "vote" },
  { n: 24, head: "CRYPTO FRAUD", body: "SEC charges 8 firms over fake platforms; $37M from 1,500 victims.", glyph: "alert" },
  { n: 25, head: "CYCLONE AKVAN", body: "Landfall near Gopalpur 08:30 IST; 300,000 evacuated to shelters.", glyph: "storm" },
  { n: 26, head: "REPORTER BARRED", body: "China bars a Bloomberg reporter from the Shenzhen summit.", glyph: "mic" },
  { n: 27, head: "CHIP SALES PAUSED", body: "TSMC and Samsung halt advanced chip sales bound for China.", glyph: "chip" },
  { n: 28, head: "JAPAN POLL", body: "93% of Japanese call ties with China poor, a poll finds.", glyph: "bars" },
  { n: 29, head: "GEMINI 4 NEON", body: "Google launches its Gemini 4 Neon model.", glyph: "star" },
  { n: 30, head: "NVIDIA-MICROSOFT", body: "Deeper AI pact: Vera Rubin NVL72 systems head to Azure.", glyph: "chip" },
  { n: 31, head: "PERU QUAKE", body: "Magnitude 6.7-6.9 tremor shakes central Peru's Junin region.", glyph: "wave" },
  { n: 32, head: "COP31 DEADLOCK", body: "Draft deal drops fossil fuels; activists protest past deadline.", glyph: "leaf" },
  { n: 33, head: "APEC STATEMENT", body: "Australia, Canada, NZ urge Russia to accept a ceasefire.", glyph: "globe" },
  { n: 34, head: "RUGBY WORLD CUP", body: "Australia beat NZ 34-10 for a fourth straight women's title.", glyph: "rugby" },
  { n: 35, head: "CHINA-AUSTRALIA", body: "Xi hails a 'comprehensive turnaround' in ties after talks.", glyph: "arrows" },
  { n: 36, head: "CANCER PILL HOPE", body: "Daraxonrasib pill: tumours shrank or vanished in 60.7% of patients.", glyph: "pill" },
];

// ---------- page furniture ----------
function drawMasthead(cv: Canvas): void {
  // gold gradient title
  const title = "THE WORLD LEDGER";
  const scale = 6;
  const tw = textWidth(title, scale);
  const x0 = (W - tw) / 2;
  drawText(cv, title, x0, 8, scale, GOLD_DARK, 1, (_px, py) => {
    const t = Math.max(0, Math.min(1, (py - 8) / (7 * scale)));
    return lerp(GOLD_LIGHT, GOLD_DARK, t);
  });
  // flanking rules with diamonds
  const ry = 30;
  cv.hline(24, x0 - 26, ry, GOLD, 1);
  cv.hline(x0 + tw + 26, W - 24, ry, GOLD, 1);
  cv.poly([[x0 - 20, ry], [x0 - 14, ry - 5], [x0 - 8, ry], [x0 - 14, ry + 5]], GOLD);
  cv.poly([[x0 + tw + 8, ry], [x0 + tw + 14, ry - 5], [x0 + tw + 20, ry], [x0 + tw + 14, ry + 5]], GOLD);
  // kicker under the masthead
  drawTextCentered(cv, "SEVEN FRONTS, ONE DAY", W / 2, 56, 2, INK_SOFT);
  cv.hline(24, W - 24, 74, INK, 0.8);
  cv.hline(24, W - 24, 76, GOLD, 0.6);
}

function drawBanner(cv: Canvas): void {
  // banner headline, one line, scale 3
  drawTextCentered(cv, "BRIDGES DOWN · MARKETS DOWN · A GENOCIDE RULING", W / 2, 84, 3, hex("#7a1f16"));
  // dateline bar
  cv.rect(24, 110, W - 48, 24, NAVY);
  cv.rect(24, 110, W - 48, 1, GOLD, 1);
  cv.rect(24, 133, W - 48, 1, GOLD, 1);
  drawTextCentered(
    cv,
    "FRIDAY 20 NOVEMBER 2026 — 36 STORIES · 7 REGIONS · EVERY ITEM DATE-CHECKED",
    W / 2, 116, 2, hex("#f4efe0"),
  );
  // seven-fronts strip
  const fronts = ["EUROPE", "MIDDLE EAST", "N. AMERICA", "ASIA", "LATIN AMERICA", "AFRICA", "OCEANIA"];
  const fw = W - 48;
  const cell = fw / fronts.length;
  for (let i = 0; i < fronts.length; i++) {
    const cx = 24 + cell * (i + 0.5);
    drawTextCentered(cv, fronts[i], cx, 146, 1, i === 0 ? hex("#7a1f16") : INK_SOFT);
    if (i > 0) cv.vline(24 + cell * i, 142, 162, GOLD, 0.7);
  }
  cv.hline(24, W - 24, 166, GOLD, 0.8);
}

function drawColumns(cv: Canvas): void {
  const colW = 238;
  const gap = 8;
  const headers = ["EUROPE", "MIDDLE EAST · N. AMERICA", "N. AMERICA · ASIA", "ASIA · WORLD"];
  const top = 652;
  const briefH = 34;
  for (let c = 0; c < 4; c++) {
    const x0 = 24 + c * (colW + gap);
    // column header
    drawTextBold(cv, headers[c], x0, top, 1, GOLD_DARK);
    cv.hline(x0, x0 + colW, top + 10, GOLD, 0.8);
    if (c > 0) cv.vline(x0 - 4, top, top + 9 * briefH + 12, hex("#c9bfa5"), 0.8);
    for (let r = 0; r < 9; r++) {
      const b = BRIEFS[c * 9 + r];
      const by = top + 14 + r * briefH;
      // citation number
      drawText(cv, String(b.n).padStart(2, "0"), x0, by + 3, 1, GOLD_DARK);
      // drawn glyph in a small tinted box
      cv.rect(x0 + 14, by, 22, 22, hex("#efe8d2"));
      cv.rect(x0 + 14, by, 22, 1, GOLD, 0.9);
      cv.rect(x0 + 14, by + 21, 22, 1, GOLD, 0.9);
      glyph(cv, b.glyph, x0 + 14, by);
      // headline + two body lines
      const tx = x0 + 40;
      drawText(cv, b.head, tx, by, 2, INK);
      const lines = wrapText(b.body, 34).slice(0, 2);
      for (let li = 0; li < lines.length; li++) {
        drawTextBold(cv, lines[li], tx, by + 16 + li * 8, 1, INK_SOFT);
      }
      // hairline separating this brief from the next row
      if (r < 8) cv.hline(x0, x0 + colW, by + 32, hex("#d8cdb2"), 0.5);
    }
  }
}

function drawFooter(cv: Canvas): void {
  const y0 = 970;
  cv.rect(24, y0, W - 48, 1, GOLD, 0.9);
  // market ticker: five sparklines with real closing figures
  const tickers: { name: string; val: string; pts: number[]; down: boolean }[] = [
    { name: "S&P 500", val: "6,910  -3.70%", pts: [0.1, 0.22, 0.3, 0.42, 0.55, 0.68, 0.82, 0.95], down: true },
    { name: "NASDAQ", val: "22,618  -5.28%", pts: [0.08, 0.18, 0.35, 0.5, 0.6, 0.75, 0.88, 0.97], down: true },
    { name: "DOW", val: "48,147  -1.93%", pts: [0.2, 0.3, 0.34, 0.44, 0.5, 0.58, 0.66, 0.74], down: true },
    { name: "NVIDIA", val: "$125.53  -14.01%", pts: [0.05, 0.3, 0.45, 0.6, 0.72, 0.85, 0.93, 0.99], down: true },
    { name: "BITCOIN", val: "$61,700  -3rd DAY", pts: [0.15, 0.3, 0.42, 0.5, 0.62, 0.7, 0.8, 0.9], down: true },
  ];
  const tw = (W - 48) / 5;
  for (let i = 0; i < tickers.length; i++) {
    const t = tickers[i];
    const x0 = 24 + i * tw;
    drawText(cv, t.name, x0 + 4, y0 + 8, 1, INK_SOFT);
    drawText(cv, t.val, x0 + 4 + textWidth(t.name, 1) + 10, y0 + 8, 1, RED);
    const sx0 = x0 + 4;
    const sx1 = x0 + tw - 8;
    const sy0 = y0 + 22;
    const sy1 = y0 + 34;
    // gridlines
    cv.hline(sx0, sx1, sy0, hex("#c9bfa5"), 0.6);
    cv.hline(sx0, sx1, sy1, hex("#c9bfa5"), 0.6);
    const pts: [number, number][] = t.pts.map((p, k) => [
      sx0 + (k / (t.pts.length - 1)) * (sx1 - sx0),
      sy0 + p * (sy1 - sy0),
    ]);
    cv.polyline(pts, RED, 2, 0.95);
    const last = pts[pts.length - 1];
    cv.circle(last[0], last[1], 3, RED);
    if (i < 4) cv.vline(x0 + tw - 2, y0 + 6, y0 + 36, hex("#c9bfa5"), 0.7);
  }
  // source line
  drawTextCentered(
    cv,
    "SOURCES: REUTERS · AP · BLOOMBERG · IMD · ICJ · IEA · SEC FILINGS — ALL ITEMS DATED 20 NOVEMBER 2026",
    W / 2, y0 + 40, 1, INK_SOFT,
  );
}

// ---------- paper grain over the whole page ----------
function paperGrain(cv: Canvas): void {
  for (let i = 0; i < 10000; i++) {
    const x = Math.floor(rng() * W);
    const y = Math.floor(rng() * H);
    const light = rng() < 0.5;
    cv.set(x, y, light ? hex("#ffffff") : hex("#3a2f1c"), 0.03 + rng() * 0.04);
  }
}

// ---------- render ----------
function render(): Canvas {
  const cv = new Canvas();
  cv.fill(PAPER);
  // subtle paper edge vignette
  cv.rect(0, 0, W, 4, PAPER_DARK, 0.7);
  cv.rect(0, H - 4, W, 4, PAPER_DARK, 0.7);
  cv.rect(0, 0, 4, H, PAPER_DARK, 0.7);
  cv.rect(W - 4, 0, 4, H, PAPER_DARK, 0.7);
  drawMasthead(cv);
  drawBanner(cv);
  drawMap(cv);
  // seven cameos
  const cameos: { cx: number; cy: number; r: number; num: number; label: string; scene: (c: Canvas, x: number, y: number, r: number) => void; px: number; py: number }[] = [
    { cx: 480, cy: 320, r: 100, num: 1, label: "KYIV", scene: sceneKyiv, px: project(30, 50)[0], py: project(30, 50)[1] },
    { cx: 170, cy: 480, r: 80, num: 2, label: "NVIDIA", scene: sceneNvidia, px: project(-122, 37)[0], py: project(-122, 37)[1] },
    { cx: 490, cy: 505, r: 75, num: 3, label: "ICJ", scene: sceneICJ, px: project(4, 52)[0], py: project(4, 52)[1] },
    { cx: 740, cy: 290, r: 80, num: 4, label: "HORMUZ", scene: sceneHormuz, px: project(56, 26)[0], py: project(56, 26)[1] },
    { cx: 810, cy: 480, r: 80, num: 5, label: "AKVAN", scene: sceneAkvan, px: project(85, 19)[0], py: project(85, 19)[1] },
    { cx: 630, cy: 435, r: 75, num: 6, label: "COP31", scene: sceneCOP31, px: project(30, 36)[0], py: project(30, 36)[1] },
    { cx: 930, cy: 590, r: 70, num: 7, label: "PERU", scene: scenePeru, px: project(140, -25)[0], py: project(140, -25)[1] },
  ];
  for (const cm of cameos) {
    cm.scene(cv, cm.cx, cm.cy, cm.r);
    cameoChrome(cv, cm.cx, cm.cy, cm.r, cm.num, cm.label);
  }
  // leader lines after the chrome so they sit on top of the map
  for (const cm of cameos) leaderLine(cv, cm.cx, cm.cy, cm.r, cm.px, cm.py);
  // six vignettes pinned to the map
  const vigs: { cx: number; cy: number; r: number; scene: (c: Canvas, x: number, y: number, r: number) => void; px: number; py: number }[] = [
    { cx: 640, cy: 210, r: 30, scene: vigKerch, px: project(36, 45)[0], py: project(36, 45)[1] },
    { cx: 560, cy: 190, r: 30, scene: vigLublin, px: project(22, 51)[0], py: project(22, 51)[1] },
    { cx: 880, cy: 380, r: 30, scene: vigShenzhen, px: project(114, 22)[0], py: project(114, 22)[1] },
    { cx: 900, cy: 300, r: 30, scene: vigTSMC, px: project(121, 23)[0], py: project(121, 23)[1] },
    { cx: 370, cy: 200, r: 30, scene: vigCapsule, px: project(2, 41)[0], py: project(2, 41)[1] },
    { cx: 120, cy: 350, r: 30, scene: vigBC, px: project(-123, 48)[0], py: project(-123, 48)[1] },
  ];
  for (const v of vigs) {
    v.scene(cv, v.cx, v.cy, v.r);
    vignetteChrome(cv, v.cx, v.cy, v.r);
    leaderLine(cv, v.cx, v.cy, v.r, v.px, v.py);
  }
  // rosette seal, bottom-left of the map (open ocean)
  rosette(cv, 72, 612, 34);
  drawColumns(cv);
  drawFooter(cv);
  paperGrain(cv);
  return cv;
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "output";
  fs.mkdirSync(outDir, { recursive: true });
  const png = encodePNG(render());
  fs.writeFileSync(outDir + "/entry.png", png);
}

main();
