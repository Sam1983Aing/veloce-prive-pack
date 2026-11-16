import * as THREE from 'three';
import { makeGalleryMaterial } from './C2V3Light.js';

// Lettering applied to the wall, the way exhibition titles are cut in vinyl: drawn once into a
// canvas, mapped onto a plane a few millimetres off the plaster, lit by the same painted light
// as the wall around it and reflected in the floor. In the dark it disappears with the wall.
//
// With `engrave`, the letters are cut into the plaster instead (the house's name over the hall's
// doorway): a V-cut whose faces are worked out from each pixel's distance to the letter's edge,
// lit from the washers above, so the faces looking up catch the light and the ones looking down
// fall into shade. The plaster runs on through the letters, in the wall's own colour.

const PX_PER_M = 420;

export async function loadLetteringFonts() {
  await Promise.all([
    document.fonts.load('400 120px "Libre Caslon Display"'),
    document.fonts.load('500 60px "Libre Franklin"'),
    document.fonts.load('400 60px "Libre Franklin"'),
    document.fonts.load('600 60px "Libre Franklin"'),
  ]);
}

// lines: [{ text, font: 'caslon' | 'franklin', size (m), weight, gap (m above), tracking (em) }]
// align: 'left' | 'center'
export function makeLettering(lines, { align = 'left', maxWidth = 5, color = 0xece6db, dot = false, engrave = null } = {}) {
  const fontFor = (l) =>
    l.font === 'caslon'
      ? `400 ${Math.round(l.size * PX_PER_M)}px "Libre Caslon Display"`
      : `${l.weight ?? 500} ${Math.round(l.size * PX_PER_M)}px "Libre Franklin"`;

  const measure = document.createElement('canvas').getContext('2d');
  let width = 0;
  let height = 0;
  const laid = lines.map((l) => {
    measure.font = fontFor(l);
    if ('letterSpacing' in measure) measure.letterSpacing = `${(l.tracking ?? 0) * l.size * PX_PER_M}px`;
    const w = measure.measureText(l.text).width;
    width = Math.max(width, w);
    const lineH = l.size * PX_PER_M * (l.font === 'caslon' ? 0.92 : 1.2);
    const top = height + (l.gap ?? 0) * PX_PER_M;
    height = top + lineH;
    return { ...l, top, lineH, w };
  });
  const pad = Math.round(0.08 * PX_PER_M);
  const cw = Math.min(4096, Math.ceil(width + pad * 2 + (dot ? 0.4 * PX_PER_M : 0)));
  const ch = Math.min(4096, Math.ceil(height + pad * 2));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  for (const l of laid) {
    ctx.font = fontFor(l);
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(l.tracking ?? 0) * l.size * PX_PER_M}px`;
    const x = align === 'center' ? (cw - l.w) / 2 : pad;
    const baseline = pad + l.top + l.lineH * (l.font === 'caslon' ? 0.8 : 0.82);
    ctx.fillText(l.text, x, baseline);
  }

  if (engrave) cutLetters(canvas, engrave);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = engrave ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;

  const mat = makeGalleryMaterial(engrave ? 'engraved' : 'lettering', {
    color: engrave ? engrave.color : color,
    pattern: engrave?.pattern,
    map: tex,
    transparent: true,
    alphaTest: 0.02,
    polygonOffset: true,
    depthWrite: false,
    roughness: engrave ? 0.9 : 0.6,
    lightBoost: engrave ? 1.0 : 1.5,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cw / PX_PER_M, ch / PX_PER_M), mat);
  mesh.renderOrder = 1;
  mesh.userData.size = { w: cw / PX_PER_M, h: ch / PX_PER_M, pad: pad / PX_PER_M };
  mesh.userData.canvas = canvas;
  mesh.userData.texture = tex;
  mesh.userData.laid = laid;
  mesh.userData.pad = pad;
  return mesh;
}

// ---------- the V-cut ----------

// Squared distance transform (Felzenszwalb and Huttenlocher) along one row or column.
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

// Redraws the white letters in `canvas` as the light and shade of a V-cut, stored at half scale
// (0.5 = the plaster's own light) with the letters' own soft edge as alpha.
//   slope  how steep the cut's faces are (1.4 is about 55 degrees)
//   light  where the light comes from, in wall terms: x right, y up, z out of the wall
//   fill   ambient light that reaches the faces turned away from it
//   tone   how much of the room's light gets into the groove at all: below 1 the letters read
//          darker than the wall from across the hall, where the two faces blur into one
//   deep   how much darker the bottom of a wide cut is
function cutLetters(canvas, { slope = 1.5, light = [-0.6, 0.75, 0.28], fill = 0.3, tone = 0.7, deep = 0.25 } = {}) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const N = w * h;

  // distance from every pixel inside a letter to the nearest pixel outside it
  const big = 1e12;
  const dist = new Float64Array(N);
  for (let i = 0; i < N; i++) dist[i] = px[i * 4 + 3] > 127 ? big : 0;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = dist[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) dist[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = dist[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) dist[y * w + x] = Math.sqrt(d[x]);
  }
  // a light blur rounds the ridge down the middle of each stroke, as a chisel leaves it
  const soft = new Float32Array(N);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -1; k <= 1; k++) sum += dist[y * w + Math.min(w - 1, Math.max(0, x + k))];
      soft[y * w + x] = sum / 3;
    }
  }
  const depth = new Float32Array(N);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -1; k <= 1; k++) sum += soft[Math.min(h - 1, Math.max(0, y + k)) * w + x];
      depth[y * w + x] = sum / 3;
    }
  }

  const ll = Math.hypot(...light);
  const L = light.map((c) => c / ll);
  const flat = L[2];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = px[i * 4 + 3];
      if (a === 0) continue;
      // the slope of the cut points down towards the middle of the stroke
      const gx = (depth[y * w + Math.min(w - 1, x + 1)] - depth[y * w + Math.max(0, x - 1)]) / 2;
      const gy = (depth[Math.max(0, y - 1) * w + x] - depth[Math.min(h - 1, y + 1) * w + x]) / 2;
      const gl = Math.max(1, Math.hypot(gx, gy));
      const nx = (slope * gx) / gl;
      const ny = (slope * gy) / gl;
      const nl = Math.hypot(nx, ny, 1);
      const lit = Math.max(0, (nx * L[0] + ny * L[1] + L[2]) / nl) / flat;
      // the bottom of a wide cut sees less of the room
      const ao = tone * (1 - deep * Math.min(1, dist[i] / 12));
      const shade = (fill + (1 - fill) * lit) * ao;
      const c = Math.round(Math.min(1, shade * 0.5) * 255);
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = c;
    }
  }
  ctx.putImageData(img, 0, 0);
}
