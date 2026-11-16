// Baked textures for the apron: value noise, the wet map, asphalt grain, paint markings, the terminal glass.
import * as THREE from 'three';

const hash = (x, y, s = 0) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
};
const smooth = (t) => t * t * (3 - 2 * t);
export function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
export function fbm(x, y, oct = 5, s = 0) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += amp * vnoise(x * f, y * f, s + i * 13); f *= 2.03; amp *= 0.5; }
  return v;
}
export const rand = (i, s = 0) => hash(i * 0.731, s * 1.37 + 0.5, 9.1);

// Wetness over a 160 m square around the car: 1 = standing water, 0 = damp asphalt.
// Puddles gather along a shallow fall line and in tyre-worn lanes, so they aren't random blobs.
export function bakeWetMap(size = 512) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const wx = (u - 0.5) * 160, wz = (v - 0.5) * 160;
      let n = fbm(u * 9.0, v * 9.0, 5, 1);
      n += 0.22 * (fbm(u * 38.0, v * 38.0, 3, 2) - 0.5);
      // a shallow drainage dip running across the stand
      n += 0.18 * Math.exp(-Math.pow((wz - wx * 0.18 - 6) / 7, 2));
      // keep the patch right under the car dry-ish so the car sits on texture, not glass
      n -= 0.12 * Math.exp(-(wx * wx + wz * wz) / 18);
      const puddle = THREE.MathUtils.smoothstep(n, 0.56, 0.62);
      const damp = THREE.MathUtils.smoothstep(n, 0.3, 0.56) * 0.35;
      const w = Math.min(1, puddle + damp);
      // G: patchwork of the surface (repairs, tyre lanes, oil), used to vary the albedo
      let pt = 0.5 + 0.35 * (fbm(u * 3.0 + 7, v * 3.0, 3, 4) - 0.5) * 2;
      const lane = Math.abs(wx + 4.6) < 1.6 ? 0.25 : 0; // the aircraft lead-in lane, polished darker
      const slab = (Math.floor(wx / 7.5) + Math.floor(wz / 7.5)) % 2 === 0 ? 0.06 : -0.06;
      pt = THREE.MathUtils.clamp(pt - lane + slab + 0.15 * (vnoise(u * 60, v * 60, 7) - 0.5), 0, 1);
      const i = (y * size + x) * 4;
      data[i] = data[i + 2] = Math.round(w * 255);
      data[i + 1] = Math.round(pt * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Asphalt aggregate: a tiling normal map plus a matching albedo variation.
export function bakeAsphalt(size = 512) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      // tileable by sampling noise on a torus-like wrap
      const a = vnoise(u * 64, v * 64, 3) * 0.55 + vnoise(u * 160, v * 160, 4) * 0.35 + vnoise(u * 13, v * 13, 5) * 0.1;
      const stone = Math.pow(vnoise(u * 96 + 3.1, v * 96 + 7.7, 6), 6) * 1.4;
      h[y * size + x] = a + stone;
    }
  }
  const nrm = new Uint8Array(size * size * 4);
  const alb = new Uint8Array(size * size * 4);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.2;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      nrm[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
      nrm[i + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
      nrm[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      nrm[i + 3] = 255;
      const g = THREE.MathUtils.clamp(0.8 + (at(x, y) - 0.6) * 0.3, 0.6, 1.0);
      alb[i] = alb[i + 1] = alb[i + 2] = Math.round(g * 255);
      alb[i + 3] = 255;
    }
  }
  const mk = (d, srgb) => {
    const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { normal: mk(nrm, false), albedo: mk(alb, true) };
}

// Ground paint for stand 7: the worn lead-in line, the stop bar, the stand box and the big stencilled 7.
// One canvas covering 40 m x 40 m around the car. Alpha carries wear.
export function bakeMarkings(px = 2048) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const m = px / 40; // pixels per metre, origin at canvas centre
  const X = (x) => px / 2 + x * m;
  const Z = (z) => px / 2 + z * m;
  g.clearRect(0, 0, px, px);
  const yellow = 'rgb(156,138,74)';
  const white = 'rgb(206,204,196)';

  g.strokeStyle = yellow;
  g.lineCap = 'butt';
  // lead-in line for the aircraft, 4 m to the left of the car, curving in from the taxiway
  g.lineWidth = 0.15 * m;
  g.beginPath();
  g.moveTo(X(-4.6), Z(20));
  g.bezierCurveTo(X(-4.6), Z(8), X(-4.6), Z(2), X(-4.6), Z(-14));
  g.stroke();
  // stop bar across the lead-in line
  g.lineWidth = 0.3 * m;
  g.beginPath(); g.moveTo(X(-5.8), Z(-14)); g.lineTo(X(-3.4), Z(-14)); g.stroke();
  // stand safety box around the car, white, broken
  g.strokeStyle = white;
  g.lineWidth = 0.12 * m;
  g.setLineDash([1.6 * m, 0.8 * m]);
  g.strokeRect(X(-2.2), Z(-3.6), 4.4 * m, 7.4 * m);
  g.setLineDash([]);
  // the stand number, painted long so it reads from a low eye
  g.save();
  g.translate(X(3.6), Z(1.4));
  g.scale(1, 1.9);
  g.fillStyle = yellow;
  g.font = `500 ${3.0 * m}px "Archivo", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('7', 0, 0);
  g.restore();

  // wear: knock out paint with noise so it looks old and rolled over
  const img = g.getImageData(0, 0, px, px);
  const d = img.data;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const i = (y * px + x) * 4;
      if (d[i + 3] === 0) continue;
      const w = fbm(x / 70, y / 70, 4, 8) * 0.7 + vnoise(x / 6, y / 6, 9) * 0.3;
      const keep = THREE.MathUtils.smoothstep(w, 0.3, 0.5);
      d[i + 3] = Math.round(d[i + 3] * keep * 0.85);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// The terminal's glass front, 100 m x 9 m. Downstairs a continuous lounge, brightest at the lobby,
// with columns, furniture and a few people. Upstairs offices, mostly dark, a few still lit.
export function bakeTerminalGlass(w = 4096, h = 384) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  const mPx = w / 100; // pixels per metre
  const ground = { y0: h * 0.5, fh: h * 0.46 };
  const upper = { y0: h * 0.06, fh: h * 0.36 };
  // downstairs: light falls off from the lobby (x 40..58 m) toward both ends, with slow variation
  for (let x = 0; x < w; x += 2) {
    const m = x / mPx;
    const lobby = Math.exp(-Math.pow((m - 49) / 14, 2));
    const vary = 0.55 + 0.45 * fbm(m / 9, 0.3, 3, 31);
    const k = Math.min(1, 0.16 + 0.95 * lobby) * vary;
    const grad = g.createLinearGradient(0, ground.y0, 0, ground.y0 + ground.fh);
    const warm = lobby > 0.4 ? '255,190,120' : '255,160,80';
    grad.addColorStop(0, `rgba(${warm},${k * 0.95})`);
    grad.addColorStop(0.5, `rgba(${warm},${k * 0.55})`);
    grad.addColorStop(1, `rgba(${warm},${k * 0.75})`);
    g.fillStyle = grad;
    g.fillRect(x, ground.y0, 2, ground.fh);
  }
  // ceiling lights downstairs: a row of small points
  for (let m = 1; m < 100; m += 1.5) {
    const lobby = Math.exp(-Math.pow((m - 49) / 14, 2));
    g.fillStyle = `rgba(255,232,196,${0.35 + 0.65 * lobby})`;
    g.fillRect(m * mPx - 3, ground.y0 + 4, 6, 5);
  }
  // furniture and people, dark against the light
  for (let i = 0; i < 70; i++) {
    const m = 4 + rand(i, 41) * 92;
    const lobby = Math.exp(-Math.pow((m - 49) / 16, 2));
    if (rand(i, 42) > 0.25 + lobby) continue;
    g.fillStyle = 'rgba(10,6,3,0.75)';
    const x = m * mPx;
    if (rand(i, 43) > 0.55) {
      const tall = ground.fh * (0.42 + rand(i, 44) * 0.08);
      g.fillRect(x, ground.y0 + ground.fh - tall, mPx * 0.42, tall);
      g.beginPath(); g.arc(x + mPx * 0.21, ground.y0 + ground.fh - tall - mPx * 0.2, mPx * 0.19, 0, Math.PI * 2); g.fill();
    } else {
      g.fillRect(x, ground.y0 + ground.fh * 0.74, mPx * (1.2 + rand(i, 45) * 1.6), ground.fh * 0.26);
    }
  }
  // upstairs offices: blocks of 3 to 6 m, most dark
  for (let m = 0; m < 100;) {
    const len = 3 + Math.floor(rand(m, 51) * 4) * 1.5;
    const lit = rand(m, 52);
    if (lit > 0.62) {
      const k = 0.35 + rand(m, 53) * 0.5;
      const cool = rand(m, 54) > 0.7;
      const grad = g.createLinearGradient(0, upper.y0, 0, upper.y0 + upper.fh);
      const col = cool ? '235,215,180' : '255,170,92';
      grad.addColorStop(0, `rgba(${col},${k})`);
      grad.addColorStop(1, `rgba(${col},${k * 0.45})`);
      g.fillStyle = grad;
      g.fillRect(m * mPx, upper.y0, len * mPx, upper.fh);
      // blinds half down on some
      if (rand(m, 55) > 0.5) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(m * mPx, upper.y0, len * mPx, upper.fh * (0.25 + rand(m, 56) * 0.35)); }
    } else if (lit > 0.45) {
      g.fillStyle = 'rgba(255,150,70,0.05)';
      g.fillRect(m * mPx, upper.y0, len * mPx, upper.fh);
    }
    m += len;
  }
  // structure: slab edge, columns every 9 m, thin mullions every 1.5 m
  g.fillStyle = '#000';
  g.fillRect(0, ground.y0 - h * 0.05, w, h * 0.06);
  for (let m = 0; m <= 100; m += 9) g.fillRect(m * mPx - 7, 0, 14, h);
  g.fillStyle = 'rgba(0,0,0,0.8)';
  for (let m = 0; m <= 100; m += 1.5) g.fillRect(m * mPx - 1.5, 0, 3, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// A soft rounded-rectangle shadow for under a car.
export function bakeContactShadow(px = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const img = g.createImageData(px, px);
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const u = (x / px - 0.5) * 2, v = (y / px - 0.5) * 2;
      const qx = Math.max(Math.abs(u) - 0.55, 0), qy = Math.max(Math.abs(v) - 0.72, 0);
      const d = Math.hypot(qx, qy);
      const a = Math.pow(THREE.MathUtils.clamp(1 - d / 0.42, 0, 1), 2.2);
      const i = (y * px + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// A soft round sprite with a faint bright rim, used for bokeh lights and glows.
export function bakeDisc(px = 128, rim = 0.25) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const img = g.createImageData(px, px);
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const r = Math.hypot(x / px - 0.5, y / px - 0.5) * 2;
      const body = THREE.MathUtils.clamp((1 - r) / 0.08, 0, 1);
      const ring = Math.exp(-Math.pow((r - 0.9) / 0.06, 2)) * rim;
      const a = Math.min(1, body * (0.75 + 0.25 * (1 - r)) + ring);
      const i = (y * px + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

// Soft puff for exhaust vapour.
export function bakePuff(px = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const img = g.createImageData(px, px);
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const u = x / px - 0.5, v = y / px - 0.5;
      const r = Math.hypot(u, v) * 2;
      const n = fbm(x / 22, y / 22, 4, 21);
      const a = Math.pow(THREE.MathUtils.clamp(1 - r, 0, 1), 1.6) * THREE.MathUtils.smoothstep(n, 0.25, 0.75);
      const i = (y * px + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}
