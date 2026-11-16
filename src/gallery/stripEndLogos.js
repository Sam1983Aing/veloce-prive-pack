// stripEndLogos(geometry): cuts the makers' logos out of a car's chrome mesh, for the Red Spider from the three.js
// examples, whose horse on the tail, lettering on the engine lid and horse on the nose are small separate islands
// of its one "chrome" mesh (Higgsfield's brief: no third-party logos in the video, 15 Nov 2026).
// An island goes when it sits on the car's centreline at either end and is either flat (a badge in relief) or
// tiny (a letter). Trims, tail-light rings and the exhaust stay. No imports, so the 013 recording server can
// inline it too (edit/tools/vite-013-renamed.config.mjs). Returns how many islands were cut.
export function stripEndLogos(geo) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const idx = geo.index ? Array.from(geo.index.array) : Array.from({ length: n }, (_, i) => i);
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    if (seen.has(k)) join(i, seen.get(k)); else seen.set(k, i);
  }
  for (let t = 0; t < idx.length; t += 3) { join(idx[t], idx[t + 1]); join(idx[t + 1], idx[t + 2]); }
  const box = new Map();
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const r = find(i), v = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    let b = box.get(r);
    if (!b) box.set(r, (b = { lo: [...v], hi: [...v] }));
    for (let k = 0; k < 3; k++) {
      b.lo[k] = Math.min(b.lo[k], v[k]); b.hi[k] = Math.max(b.hi[k], v[k]);
      lo[k] = Math.min(lo[k], v[k]); hi[k] = Math.max(hi[k], v[k]);
    }
  }
  const size = [0, 1, 2].map((k) => hi[k] - lo[k]);
  const mid = [0, 1, 2].map((k) => (hi[k] + lo[k]) / 2);
  // the file's own axes can be Z-up: the car's length is its longest side, its width the middle one
  const order = [0, 1, 2].sort((a, b) => size[b] - size[a]);
  const len = order[0], wid = order[1];
  const L = size[len], W = size[wid];
  const cut = new Set();
  for (const [r, b] of box) {
    const s = [0, 1, 2].map((k) => b.hi[k] - b.lo[k]);
    const c = [0, 1, 2].map((k) => (b.hi[k] + b.lo[k]) / 2);
    const big = Math.max(...s), small = Math.min(...s);
    const off = Math.abs(c[wid] - mid[wid]);
    const atEnd = Math.abs(c[len] - mid[len]) > 0.4 * L;
    const flat = big < 0.05 * L && small < 0.35 * big && off < 0.03 * W;
    const tiny = big < 0.01 * L && off < 0.07 * W; // the letters run a little either side of the centre
    if (atEnd && (flat || tiny)) cut.add(r);
  }
  if (!cut.size) return 0;
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) if (!cut.has(find(idx[t]))) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  geo.setIndex(keep);
  return cut.size;
}
