import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

let sharedTireBumpTex = null;
function getSharedRaceTireBumpTexture() {
  if (sharedTireBumpTex) return sharedTireBumpTex;
  const width = 512;
  const height = 256;
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bCtx = bumpCanvas.getContext('2d');

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, width, height);

  const grooveRows = [0.33, 0.44, 0.56, 0.67];
  grooveRows.forEach((vNorm) => {
    const gy = vNorm * height;
    const gHalf = 5;
    const bGrad = bCtx.createLinearGradient(0, gy - gHalf, 0, gy + gHalf);
    bGrad.addColorStop(0.0, '#808080');
    bGrad.addColorStop(0.5, '#202020');
    bGrad.addColorStop(1.0, '#808080');
    bCtx.fillStyle = bGrad;
    bCtx.fillRect(0, gy - gHalf, width, gHalf * 2);
  });

  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.wrapS = THREE.RepeatWrapping;
  bumpTex.wrapT = THREE.ClampToEdgeWrapping;
  bumpTex.repeat.set(8, 1);
  bumpTex.needsUpdate = true;
  sharedTireBumpTex = bumpTex;
  return bumpTex;
}

function splitGeometryByConnectedIslands(worldGeometry, classifyCentroidFn) {
  const posAttr = worldGeometry.attributes.position;
  const normAttr = worldGeometry.attributes.normal;
  const uvAttr = worldGeometry.attributes.uv;
  const indexAttr = worldGeometry.index;

  const vertexCount = posAttr.count;
  const triCount = indexAttr ? indexAttr.count / 3 : vertexCount / 3;

  const spatialMap = new Map();
  const canonicalVertex = new Int32Array(vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const qx = Math.round(posAttr.getX(i) * 2500);
    const qy = Math.round(posAttr.getY(i) * 2500);
    const qz = Math.round(posAttr.getZ(i) * 2500);
    const key = `${qx},${qy},${qz}`;
    let cid = spatialMap.get(key);
    if (cid === undefined) {
      cid = i;
      spatialMap.set(key, cid);
    }
    canonicalVertex[i] = cid;
  }

  const parent = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) parent[i] = i;

  function find(x) {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    let curr = x;
    while (curr !== root) {
      const nxt = parent[curr];
      parent[curr] = root;
      curr = nxt;
    }
    return root;
  }

  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  for (let t = 0; t < triCount; t++) {
    const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
    const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;
    union(canonicalVertex[i0], canonicalVertex[i1]);
    union(canonicalVertex[i0], canonicalVertex[i2]);
  }

  const islandStats = new Map();
  for (let t = 0; t < triCount; t++) {
    const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
    const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;
    const root = find(canonicalVertex[i0]);

    let st = islandStats.get(root);
    if (!st) {
      st = { sumX: 0, sumY: 0, sumZ: 0, count: 0 };
      islandStats.set(root, st);
    }
    st.sumX += posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2);
    st.sumY += posAttr.getY(i0) + posAttr.getY(i1) + posAttr.getY(i2);
    st.sumZ += posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2);
    st.count += 3;
  }

  const islandBucket = new Map();
  for (const [root, st] of islandStats.entries()) {
    const cx = st.sumX / st.count;
    const cy = st.sumY / st.count;
    const cz = st.sumZ / st.count;
    islandBucket.set(root, classifyCentroidFn(cx, cy, cz, st.count));
  }

  const bucketTris = new Map();
  for (let t = 0; t < triCount; t++) {
    const i0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
    const i1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;
    const root = find(canonicalVertex[i0]);
    const bucketKey = islandBucket.get(root);

    let list = bucketTris.get(bucketKey);
    if (!list) {
      list = [];
      bucketTris.set(bucketKey, list);
    }
    list.push(i0, i1, i2);
  }

  const results = new Map();
  for (const [bucketKey, triIndices] of bucketTris.entries()) {
    const remap = new Map();
    const newPositions = [];
    const newNormals = [];
    const newUvs = [];
    const newIndices = [];
    let nextIdx = 0;

    for (let k = 0; k < triIndices.length; k++) {
      const oldIdx = triIndices[k];
      let mapped = remap.get(oldIdx);
      if (mapped === undefined) {
        mapped = nextIdx++;
        remap.set(oldIdx, mapped);
        newPositions.push(
          posAttr.getX(oldIdx),
          posAttr.getY(oldIdx),
          posAttr.getZ(oldIdx)
        );
        if (normAttr) {
          newNormals.push(
            normAttr.getX(oldIdx),
            normAttr.getY(oldIdx),
            normAttr.getZ(oldIdx)
          );
        }
        if (uvAttr) {
          newUvs.push(uvAttr.getX(oldIdx), uvAttr.getY(oldIdx));
        }
      }
      newIndices.push(mapped);
    }

    const subGeo = new THREE.BufferGeometry();
    subGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(newPositions, 3)
    );
    if (newNormals.length > 0) {
      subGeo.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(newNormals, 3)
      );
    } else {
      subGeo.computeVertexNormals();
    }
    if (newUvs.length > 0) {
      subGeo.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
    }
    subGeo.setIndex(newIndices);
    results.set(bucketKey, subGeo);
  }

  return results;
}


function drawRealCavallinoFromChromeGeo(ctx, chromeWorldGeo, cx, cy, targetHeight = 290) {
  if (!chromeWorldGeo) return;
  const pos = chromeWorldGeo.attributes.position;
  const idx = chromeWorldGeo.index;
  if (!pos || !idx) return;

  const centerX = 0.00156;
  const centerY = 0.84001;
  const scale = targetHeight / 0.09871;

  ctx.save();
  ctx.fillStyle = '#07080a';
  ctx.strokeStyle = '#07080a';
  ctx.lineWidth = 0.9;
  ctx.beginPath();

  const triCount = idx.count / 3;
  for (let t = 0; t < triCount; t++) {
    const i0 = idx.getX(t * 3);
    const x0 = pos.getX(i0);
    const y0 = pos.getY(i0);
    const z0 = pos.getZ(i0);

    if (Math.abs(x0) < 0.05 && y0 > 0.78 && y0 < 0.90 && z0 > 2.15 && z0 < 2.22) {
      const i1 = idx.getX(t * 3 + 1);
      const i2 = idx.getX(t * 3 + 2);
      const px0 = cx + (x0 - centerX) * scale;
      const py0 = cy - (y0 - centerY) * scale;
      const px1 = cx + (pos.getX(i1) - centerX) * scale;
      const py1 = cy - (pos.getY(i1) - centerY) * scale;
      const px2 = cx + (pos.getX(i2) - centerX) * scale;
      const py2 = cy - (pos.getY(i2) - centerY) * scale;
      ctx.moveTo(px0, py0);
      ctx.lineTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.closePath();
    }
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function createRedspiderTeamShieldTexture(chromeWorldGeo) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');

  const bgGrad = ctx.createRadialGradient(256, 300, 30, 256, 320, 360);
  bgGrad.addColorStop(0, '#ffe01b');
  bgGrad.addColorStop(0.7, '#f5be00');
  bgGrad.addColorStop(1, '#d99e00');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 512, 640);

  ctx.fillStyle = '#009246';
  ctx.fillRect(24, 18, 464, 24);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(24, 42, 464, 24);
  ctx.fillStyle = '#ce2b37';
  ctx.fillRect(24, 66, 464, 24);

  ctx.strokeStyle = '#0a0c10';
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 18, 464, 72);

  drawRealCavallinoFromChromeGeo(ctx, chromeWorldGeo, 256, 336, 365);

  ctx.fillStyle = '#07080a';
  ctx.font = '700 68px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('S', 112, 456);
  ctx.fillText('F', 400, 456);

  ctx.strokeStyle = '#0a0c10';
  ctx.lineWidth = 10;
  ctx.strokeRect(18, 14, 476, 612);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createRedspiderWheelCapTexture(chromeWorldGeo) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const cx = 256;
  const cy = 256;

  ctx.fillStyle = '#b4c0ce';
  ctx.fillRect(0, 0, 512, 512);

  ctx.beginPath();
  ctx.arc(cx, cy, 176, 0, Math.PI * 2);
  ctx.fillStyle = '#222832';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, 168, 0, Math.PI * 2);
  ctx.fillStyle = '#dce6f2';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, 156, 0, Math.PI * 2);
  const yellowGrad = ctx.createRadialGradient(cx - 20, cy - 20, 12, cx, cy, 156);
  yellowGrad.addColorStop(0, '#ffe42b');
  yellowGrad.addColorStop(0.75, '#f5bc00');
  yellowGrad.addColorStop(1, '#c99200');
  ctx.fillStyle = yellowGrad;
  ctx.fill();

  drawRealCavallinoFromChromeGeo(ctx, chromeWorldGeo, cx, cy - 4, 210);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function applyCustomPlanarUVs(localGeo, mode, isRightSide = false) {
  localGeo.computeBoundingBox();
  const b = localGeo.boundingBox;
  const pos = localGeo.attributes.position;
  const uvs = new Float32Array(pos.count * 2);

  const spanX = Math.max(0.0001, b.max.x - b.min.x);
  const spanY = Math.max(0.0001, b.max.y - b.min.y);
  const spanZ = Math.max(0.0001, b.max.z - b.min.z);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (mode === 'nose') {
      uvs[i * 2] = (x - b.min.x) / spanX;
      uvs[i * 2 + 1] = 1.0 - (z - b.min.z) / spanZ;
    } else {
      const uRaw = (z - b.min.z) / spanZ;
      uvs[i * 2] = isRightSide ? 1.0 - uRaw : uRaw;
      uvs[i * 2 + 1] = (y - b.min.y) / spanY;
    }
  }
  localGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}


function classifyRedspiderMesh(meshName) {
  const m = (meshName || '').toLowerCase();
  if (m.includes('wheel_')) {
    if (m.includes('brake')) return { category: 'brake', isWheel: false, isAxlePart: true };
    if (m.includes('tire')) return { category: 'tire', isWheel: true, isAxlePart: true };
    if (m.includes('centre')) return { category: 'wheel_cap', isWheel: true, isAxlePart: true };
    return { category: 'wheel', isWheel: true, isAxlePart: true };
  }
  if (m.startsWith('body')) return { category: 'body', isWheel: false };
  if (m.startsWith('glass') || m === 'glass') return { category: 'glass', isWheel: false };
  if (m.startsWith('badge_')) return { category: 'team_shield', isWheel: false };
  if (m === 'lights' || m === 'leds') return { category: 'light_front', isWheel: false };
  if (
    m === 'brakes' ||
    m.includes('lights_red') ||
    m.includes('taillight') ||
    m.includes('rear_fog')
  ) {
    return { category: 'light_rear', isWheel: false };
  }
  if (
    m.includes('carbon') ||
    m.includes('grill') ||
    m.includes('splitter') ||
    m.includes('diffuser')
  ) {
    return { category: 'carbon', isWheel: false };
  }
  if (m === 'metal') return { category: 'engine', isWheel: false };
  if (m === 'chrome') return { category: 'chrome', isWheel: false };
  return { category: 'interior', isWheel: false };
}


// Every material a car owns keeps its own environment strength, so its bay's light level can scale it.
// The area lights have no shadows, so the tubes of one bay would also light its neighbours. Each car
// gets one uniform that scales the direct light it receives: an unlit bay shows a dark car with long
// faint highlights, not a car lit by the bay next door.
function trackMaterial(mat, list, bayLight) {
  if (!mat || list.includes(mat)) return;
  mat.userData.baseEnv = mat.envMapIntensity ?? 1;
  // V5: the studio is a warm room now, and glass at full strength showed it as a milky tan sheet
  // over the cabin. Glass takes less of it, so the screens stay dark and the cabin reads through.
  if (/glass|window|windshield|windscreen/i.test(mat.name || '') || (mat.transparent && (mat.opacity ?? 1) < 0.9)) mat.userData.baseEnv *= 0.4;
  const before = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    if (before) before.call(mat, shader, r);
    shader.uniforms.uBayLight = bayLight;
    shader.fragmentShader = 'uniform float uBayLight;\n' + shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      '#include <lights_fragment_end>\n  reflectedLight.directDiffuse *= uBayLight;\n  reflectedLight.directSpecular *= uBayLight;'
    );
  };
  mat.customProgramCacheKey = () => 'c1v3-bay';
  mat.needsUpdate = true;
  list.push(mat);
}

// The lamp red. AgX pulls a saturated red towards orange, so it leans a hair to blue.
const TAIL_RED = new THREE.Color().setRGB(1, 0, 0.025);

// Split a geometry by triangle, using the triangle's centre. The Red Spider's "lights" mesh also
// holds the windscreen surround and some bumper trim, which must not glow with the headlamps.
function splitByTriangle(geo, classify) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const count = idx ? idx.count : pos.count;
  const buckets = new Map();
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let t = 0; t < count; t += 3) {
    const ids = [0, 1, 2].map((k) => (idx ? idx.getX(t + k) : t + k));
    c.set(0, 0, 0);
    for (const i of ids) c.add(v.fromBufferAttribute(pos, i));
    c.divideScalar(3);
    const key = classify(c.x, c.y, c.z);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(...ids);
  }
  const out = new Map();
  for (const [key, list] of buckets) {
    const g = geo.clone();
    g.setIndex(list);
    out.set(key, g);
  }
  return out;
}

// Wheels that should spin: grouped by corner, each corner re-parented to a pivot on its own axle.
const WHEEL_RE = /(^|[_\-.])wheel(?!house|brake)|rim_t0a|tyre_|wheelhub|discrotor|rim_l|tire_l|brake_disk|wheel1paint/i;
const NOT_WHEEL_RE = /caliper|clipper|seat|steering|wheelhouse|wheelbrake/i;

function buildWheelPivots(carRoot, sprung) {
  const meshes = [];
  sprung.traverse((o) => {
    if (!o.isMesh) return;
    let n = o, hit = false, veto = false;
    while (n && n !== sprung) {
      if (NOT_WHEEL_RE.test(n.name || '')) veto = true;
      if (WHEEL_RE.test(n.name || '')) hit = true;
      n = n.parent;
    }
    if (hit && !veto) meshes.push(o);
  });
  if (meshes.length < 4) return [];
  carRoot.updateMatrixWorld(true);
  const corners = new Map();
  const box = new THREE.Box3();
  const c = new THREE.Vector3();
  for (const m of meshes) {
    box.setFromObject(m).getCenter(c);
    carRoot.worldToLocal(c);
    const key = `${c.x < 0 ? 'L' : 'R'}${c.z < 0 ? 'F' : 'B'}`;
    if (!corners.has(key)) corners.set(key, { meshes: [], box: new THREE.Box3() });
    const k = corners.get(key);
    k.meshes.push(m);
    const b = new THREE.Box3().setFromObject(m);
    k.box.union(b);
  }
  if (corners.size !== 4) return [];
  const pivots = [];
  for (const { meshes: list, box: b } of corners.values()) {
    const centre = b.getCenter(new THREE.Vector3());
    carRoot.worldToLocal(centre);
    const pivot = new THREE.Group();
    pivot.position.copy(centre);
    carRoot.add(pivot);
    pivot.updateMatrixWorld(true);
    for (const m of list) pivot.attach(m);
    pivots.push(pivot);
  }
  return pivots;
}

function measure(carRoot) {
  carRoot.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(carRoot);
  const s = b.getSize(new THREE.Vector3());
  return { length: s.z, width: s.x, height: s.y, minZ: b.min.z, maxZ: b.max.z };
}

// Where the tail lamps are, in car space: the centre of the lamp geometry on each side, taken from
// the vertices of every mesh that uses a tail-lamp material, near the back of the car.
function tailSpots(carRoot, rearLights) {
  carRoot.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(carRoot.matrixWorld).invert();
  const pts = [];
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  carRoot.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!mats.some((mt) => rearLights.includes(mt))) return;
    const pos = o.geometry.attributes.position;
    m.multiplyMatrices(inv, o.matrixWorld);
    const step = Math.max(1, Math.floor(pos.count / 1500));
    for (let i = 0; i < pos.count; i += step) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(m).clone());
  });
  if (!pts.length) {
    // The lamps are painted into a texture on some models: put the glow where tail lamps sit.
    const b = new THREE.Box3().setFromObject(carRoot);
    const lo = carRoot.worldToLocal(b.min.clone());
    const hi = carRoot.worldToLocal(b.max.clone());
    const z = Math.max(lo.z, hi.z) - 0.08;
    const half = Math.abs(hi.x - lo.x) / 2;
    return [new THREE.Vector3(-half * 0.72, 0.72, z), new THREE.Vector3(half * 0.72, 0.72, z)];
  }
  const back = Math.max(...pts.map((p) => p.z));
  const out = [];
  for (const side of [-1, 1]) {
    const near = pts.filter((p) => Math.sign(p.x) === side && Math.abs(p.x) > 0.25 && p.z > back - 0.45);
    if (!near.length) continue;
    const c = near.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(near.length);
    // the glow sits on the lamp, a little inside the outermost lens and just behind its face
    c.x *= 0.86;
    c.z = Math.max(...near.map((p) => p.z)) - 0.02;
    out.push(c);
  }
  return out;
}

function makeApi({ meta, carRoot, sprung, materials, rearLights, frontLights, wheelPivots, spinFn, bayLight }) {
  const dims = measure(carRoot);
  const tails = tailSpots(carRoot, rearLights);
  let level = -1;
  return {
    id: meta.id,
    meta,
    root: carRoot,
    sprung,
    dims,
    tails,
    materials,
    setLevel(l, direct = l * l) {
      bayLight.value = direct;
      if (Math.abs(l - level) < 0.002) return;
      level = l;
      const k = 0.008 + 0.992 * l * l;
      // dark-bodied cars (the Track Car, the Hypercar) get a little more of the studio in their paint
      const boost = meta.envBoost || 1;
      for (const m of materials) m.envMapIntensity = m.userData.baseEnv * k * boost;
    },
    setLights(tail, head = 0.1) {
      for (const m of rearLights) m.emissiveIntensity = tail;
      for (const m of frontLights) m.emissiveIntensity = head;
    },
    spinWheels(angle) {
      if (spinFn) spinFn(angle);
      for (const p of wheelPivots) p.rotation.x = angle;
    },
  };
}

// From C2 V3 (C2V3CarLoader.js), unchanged.
// Some models ship with their front wheels steered (the Hypercar's and the Silver's are turned
// about 20 degrees), which reads as a car parked mid-manoeuvre. Measure each wheel's axle from its
// tyre (a tyre is thinnest along its axle) and turn any wheel that isn't square to the car back,
// with its rim, disc and caliper, round the tyre's own centre. Car space here: y up, length along z.
// Some files keep a wheel to a mesh (the Hypercar), some both wheels of an axle in one (the Silver):
// those are split down the middle and each side turned on its own.
function straightenFrontWheels(sceneRoot) {
  const WHEEL_PART = /tyre|tire|side_?wall|rim|logo|steel|brake|disk|disc|clipper|caliper/i;
  const TYRE = /tyre|tire|rubber/i;
  const meshes = [];
  sceneRoot.traverse((o) => {
    if (!o.isMesh) return;
    const names = [].concat(o.material).map((m) => m?.name || '').join(' ');
    const box = new THREE.Box3().setFromObject(o);
    meshes.push({ o, names, centre: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) });
  });
  const v = new THREE.Vector3();

  // the axle angle of a tyre's vertices (on one side of x = split, if given)
  const axleOf = (o, side = 0, split = 0) => {
    const pos = o.geometry.attributes.position;
    let n = 0, sx = 0, sz = 0, sxx = 0, szz = 0, sxz = 0;
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld);
      if (side && Math.sign(v.x - split) !== side) continue;
      n++;
      sx += v.x; sz += v.z; sxx += v.x * v.x; szz += v.z * v.z; sxz += v.x * v.z;
    }
    const [mx, mz] = [sx / n, sz / n];
    const [a, c, b] = [sxx / n - mx * mx, szz / n - mz * mz, sxz / n - mx * mz];
    let axle = 0.5 * Math.atan2(2 * b, a - c) + Math.PI / 2;
    axle = Math.atan2(Math.sin(axle), Math.cos(axle));
    if (axle > Math.PI / 2) axle -= Math.PI;
    if (axle <= -Math.PI / 2) axle += Math.PI;
    return { axle, x: mx, z: mz };
  };
  const turnAbout = (x, z, angle) =>
    new THREE.Matrix4()
      .makeTranslation(x, 0, z)
      .multiply(new THREE.Matrix4().makeRotationY(angle))
      .multiply(new THREE.Matrix4().makeTranslation(-x, 0, -z));
  const square = (axle) => Math.abs(axle) < THREE.MathUtils.degToRad(2);

  for (const t of meshes.filter((m) => TYRE.test(m.names))) {
    if (t.size.x < 0.8) {
      // one wheel to a mesh
      const { axle, x, z } = axleOf(t.o);
      if (square(axle)) continue;
      const turn = turnAbout(x, z, axle);
      for (const p of meshes) {
        if (!WHEEL_PART.test(p.names) || p.size.x > 0.8 || Math.hypot(p.centre.x - x, p.centre.z - z) > 0.5) continue;
        p.o.geometry.applyMatrix4(p.o.matrixWorld.clone().invert().multiply(turn).multiply(p.o.matrixWorld));
      }
      continue;
    }
    // both wheels of an axle in one mesh: every part at this axle's wheel height, split by side
    const axleParts = meshes.filter((p) => Math.abs(p.centre.z - t.centre.z) < 0.2 && p.size.z < 0.95 && p.centre.y < 0.6 && p.size.y < 0.8);
    for (const side of [-1, 1]) {
      const { axle, x, z } = axleOf(t.o, side, t.centre.x);
      if (square(axle)) continue;
      const turn = turnAbout(x, z, axle);
      for (const p of axleParts) {
        const toCar = p.o.matrixWorld;
        const local = toCar.clone().invert().multiply(turn).multiply(toCar);
        const normalLocal = new THREE.Matrix3().getNormalMatrix(local);
        const pos = p.o.geometry.attributes.position;
        const nor = p.o.geometry.attributes.normal;
        for (let k = 0; k < pos.count; k++) {
          v.fromBufferAttribute(pos, k).applyMatrix4(toCar);
          if (Math.sign(v.x - t.centre.x) !== side) continue;
          v.fromBufferAttribute(pos, k).applyMatrix4(local);
          pos.setXYZ(k, v.x, v.y, v.z);
          if (nor) {
            v.fromBufferAttribute(nor, k).applyMatrix3(normalLocal).normalize();
            nor.setXYZ(k, v.x, v.y, v.z);
          }
        }
        pos.needsUpdate = true;
        if (nor) nor.needsUpdate = true;
        p.o.geometry.computeBoundingBox();
        p.o.geometry.computeBoundingSphere();
      }
    }
  }
}

export class CarLoader {
  constructor() {
    this.cache = new Map();
    this.pending = new Map();
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath((import.meta.env.BASE_URL + 'draco/gltf/'));
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
  }

  has(id) {
    return this.cache.has(id);
  }

  get(id) {
    return this.cache.get(id);
  }

  load(meta) {
    if (this.cache.has(meta.id)) return Promise.resolve(this.cache.get(meta.id));
    if (this.pending.has(meta.id)) return this.pending.get(meta.id);
    const p = new Promise((resolve, reject) => {
      this.gltfLoader.load(meta.glbUrl, resolve, undefined, reject);
    }).then((gltf) => {
      const bundle = meta.id === 'redspider' ? this._redspider(gltf.scene, meta) : this._native(gltf.scene, meta);
      this.cache.set(meta.id, bundle);
      this.pending.delete(meta.id);
      return bundle;
    });
    this.pending.set(meta.id, p);
    return p;
  }

  _redspider(sceneRoot, carMeta) {
    sceneRoot.updateMatrixWorld(true);
    const rotMatrix = new THREE.Matrix4().makeRotationY(carMeta.rotY || 0);
    const tempVec = new THREE.Vector3();

    const boxOf = (matrix, density) => {
      const box = new THREE.Box3();
      sceneRoot.traverse((node) => {
        if (!node.isMesh || !node.geometry) return;
        const pos = node.geometry.attributes.position;
        if (!pos) return;
        const m = new THREE.Matrix4().multiplyMatrices(matrix, node.matrixWorld);
        const step = Math.max(1, Math.floor(pos.count / density));
        for (let i = 0; i < pos.count; i += step) box.expandByPoint(tempVec.fromBufferAttribute(pos, i).applyMatrix4(m));
      });
      return box;
    };

    const rawSize = boxOf(rotMatrix, 600).getSize(new THREE.Vector3());
    const scaleFactor = (carMeta.targetLength || 4.534) / Math.max(0.1, rawSize.z);
    const orientScaleMat = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().makeScale(scaleFactor, scaleFactor, scaleFactor), rotMatrix);
    const scaledBox = boxOf(orientScaleMat, 800);
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
    const normalize = new THREE.Matrix4().multiplyMatrices(
      new THREE.Matrix4().makeTranslation(-scaledCenter.x, -scaledBox.min.y + (carMeta.rideHeightOffset || 0), -scaledCenter.z),
      orientScaleMat
    );
    const normalized = (meshNode) => {
      const geo = meshNode.geometry.clone();
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(normalize, meshNode.matrixWorld));
      return geo;
    };

    const chromeNode = sceneRoot.getObjectByName('chrome');
    const chromeWorldGeo = chromeNode ? normalized(chromeNode) : null;
    const shieldTex = createRedspiderTeamShieldTexture(chromeWorldGeo);
    const capTex = createRedspiderWheelCapTexture(chromeWorldGeo);
    const tireBump = getSharedRaceTireBumpTexture();

    const carRoot = new THREE.Group();
    carRoot.name = `C1V4_${carMeta.id}`;
    const sprung = new THREE.Group();
    carRoot.add(sprung);
    const unsprung = new THREE.Group();
    carRoot.add(unsprung);

    const materials = [];
    const rearLights = [];
    const frontLights = [];
    const spinning = [];
    const bayLight = { value: 0 };
    const p = carMeta.paint;

    const material = (origMat, category) => {
      const tex = {};
      if (origMat) {
        if (origMat.map) tex.map = origMat.map;
        if (origMat.normalMap) tex.normalMap = origMat.normalMap;
        if (origMat.roughnessMap) tex.roughnessMap = origMat.roughnessMap;
        if (origMat.metalnessMap) tex.metalnessMap = origMat.metalnessMap;
      }
      let mat;
      if (category === 'body') {
        mat = new THREE.MeshPhysicalMaterial({
          color: carMeta.paintBodyHex != null ? new THREE.Color(carMeta.paintBodyHex) : new THREE.Color(carMeta.paintHex).multiplyScalar(0.82),
          metalness: p.metalness, roughness: p.roughness, specularIntensity: p.specularIntensity,
          clearcoat: 1, clearcoatRoughness: p.clearcoatRoughness, envMapIntensity: 0.8,
          ...(origMat && origMat.normalMap ? { normalMap: origMat.normalMap } : {}),
        });
      } else if (category === 'glass') {
        mat = new THREE.MeshPhysicalMaterial({
          color: 0x090b0f, metalness: 0.12, roughness: 0.06, transparent: true, opacity: 0.46,
          clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.25,
        });
      } else if (category === 'carbon') {
        mat = new THREE.MeshPhysicalMaterial({ color: 0x141619, metalness: 0.38, roughness: 0.28, clearcoat: 0.65, clearcoatRoughness: 0.12, ...tex });
      } else if (category === 'wheel' || category === 'chrome') {
        mat = new THREE.MeshPhysicalMaterial({
          color: category === 'chrome' ? 0xe6eaef : 0xb8c0ca, metalness: 0.86,
          roughness: category === 'chrome' ? 0.1 : 0.2, clearcoat: 0.65, envMapIntensity: 1.2, ...tex,
        });
      } else if (category === 'brake') {
        mat = new THREE.MeshPhysicalMaterial({ color: 0x3a3e44, metalness: 0.78, roughness: 0.32, clearcoat: 0.35, ...tex });
      } else if (category === 'tire') {
        mat = new THREE.MeshStandardMaterial({
          color: 0x0b0b0c, bumpMap: tex.normalMap ? null : tireBump, bumpScale: 0.012, metalness: 0, roughness: 0.9, ...tex,
        });
      } else if (category === 'light_front') {
        mat = new THREE.MeshPhysicalMaterial({ color: 0xf2efe9, emissive: 0xfff6e5, emissiveIntensity: 0.1, roughness: 0.1, clearcoat: 0.95, ...tex });
        frontLights.push(mat);
      } else if (category === 'light_rear') {
        mat = new THREE.MeshPhysicalMaterial({ color: 0x2a0204, emissive: TAIL_RED, emissiveIntensity: 0.25, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.2, ...tex });
        rearLights.push(mat);
      } else if (category === 'team_shield') {
        mat = new THREE.MeshPhysicalMaterial({
          color: 0xffffff, map: shieldTex, metalness: 0.22, roughness: 0.18, clearcoat: 0.9,
          polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
        });
      } else if (category === 'wheel_cap') {
        mat = new THREE.MeshPhysicalMaterial({
          color: 0xffffff, map: capTex, metalness: 0.5, roughness: 0.18, clearcoat: 0.85,
          polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
        });
      } else if (category === 'engine') {
        mat = new THREE.MeshPhysicalMaterial({ color: 0x464b52, metalness: 0.78, roughness: 0.28, clearcoat: 0.3, ...tex });
      } else {
        // The cabin: tan leather where the model has seats and carpet, satin black for the rest.
        const name = (origMat && origMat.name) || '';
        // The Spider's seats and carpet are modelled in grey. Rental 458s are usually trimmed in tan
        // (Tan), which also reads warmer in the dark room.
        const tan = /^(leather|interior_light|carpet)$/i.test(name);
        const own = tan ? new THREE.Color(0x4a2c18) : origMat && origMat.color ? origMat.color.clone() : new THREE.Color(0x111214);
        // everything else in the cabin and the trim is satin black: the model's mid greys read as primer
        if (!tan) own.setHex(0x0e0e0f);
        mat = new THREE.MeshPhysicalMaterial({ color: own, metalness: 0.02, roughness: tan ? 0.55 : 0.7, sheen: tan ? 0.35 : 0.15, sheenRoughness: 0.6, sheenColor: own.clone().multiplyScalar(1.6), ...tex });
      }
      trackMaterial(mat, materials, bayLight);
      return mat;
    };

    const addPart = ({ id, category, worldGeo, origMat, spin = false, axle = false, pivot = null }) => {
      worldGeo.computeBoundingBox();
      const centre = worldGeo.boundingBox.getCenter(new THREE.Vector3());
      const at = pivot ? pivot.clone() : centre;
      const geo = worldGeo.clone();
      geo.translate(-at.x, -at.y, -at.z);
      if (category === 'team_shield') applyCustomPlanarUVs(geo, id.includes('nose') ? 'nose' : 'side', centre.x > 0);
      else if (category === 'wheel_cap') applyCustomPlanarUVs(geo, 'side', centre.x > 0);
      const mesh = new THREE.Mesh(geo, material(origMat, category));
      const group = new THREE.Group();
      group.name = id;
      group.position.copy(at);
      group.add(mesh);
      (spin || axle ? unsprung : sprung).add(group);
      if (spin) spinning.push(group);
    };

    const handled = new Set();
    for (const wName of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) {
      const wNode = sceneRoot.getObjectByName(wName);
      if (!wNode) continue;
      handled.add(wNode);
      let axleY = 0.34;
      let axleZ = wName.includes('_f') ? -1.34 : 1.32;
      const tire = wNode.children.find((c) => c.name.toLowerCase().includes('tire'));
      if (tire && tire.isMesh) {
        const g = normalized(tire);
        g.computeBoundingBox();
        const tc = g.boundingBox.getCenter(new THREE.Vector3());
        axleY = tc.y;
        axleZ = tc.z;
      }
      wNode.traverse((child) => {
        if (!child.isMesh) return;
        handled.add(child);
        const worldGeo = normalized(child);
        worldGeo.computeBoundingBox();
        const cc = worldGeo.boundingBox.getCenter(new THREE.Vector3());
        const role = classifyRedspiderMesh(`${wName}_${child.name}`);
        addPart({
          id: `${wName}_${child.name}`, category: role.category, worldGeo, origMat: child.material,
          spin: role.isWheel, axle: true, pivot: new THREE.Vector3(cc.x, axleY, axleZ),
        });
      });
    }

    sceneRoot.traverse((child) => {
      if (!child.isMesh || !child.geometry || handled.has(child)) return;
      const name = child.name || 'mesh';
      const worldGeo = normalized(child);
      if (name === 'yellow_trim') {
        const parts = splitGeometryByConnectedIslands(worldGeo, (cx, cy, cz) => {
          if (cz < -1.5) return 'badge_nose';
          if (Math.abs(cx) > 0.7) return cx < 0 ? 'badge_fender_l' : 'badge_fender_r';
          return 'cockpit_tachometer';
        });
        for (const [key, geo] of parts.entries()) {
          addPart({ id: key, category: key.startsWith('badge_') ? 'team_shield' : 'interior', worldGeo: geo, origMat: child.material });
        }
        return;
      }
      if (name === 'lights') {
        const parts = splitByTriangle(worldGeo, (x, y, z) => {
          const ax = Math.abs(x);
          if (z < -1.44 && z > -2.1 && y > 0.48 && y < 0.78 && ax > 0.5 && ax < 0.88) return 'light_front';
          if (z > 1.66 && y > 0.5 && y < 0.9 && ax > 0.44 && ax < 0.9) return 'light_rear';
          return 'carbon';
        });
        for (const [key, geo] of parts.entries()) addPart({ id: `redspider_lights_${key}`, category: key, worldGeo: geo, origMat: child.material });
        return;
      }
      const role = name === 'body' ? { category: 'body' } : classifyRedspiderMesh(name);
      addPart({ id: `redspider_${name}`, category: role.category, worldGeo, origMat: child.material, spin: role.isWheel, axle: role.isAxlePart });
    });

    return makeApi({
      meta: carMeta, carRoot, sprung, materials, rearLights, frontLights, wheelPivots: [], bayLight,
      spinFn: (a) => { for (const g of spinning) g.rotation.x = a; },
    });
  }

  _native(sceneRoot, carMeta) {
    const drop = [];
    sceneRoot.traverse((o) => {
      if (o.isMesh && (o.name === 'Obj_Shadow_Plane' || o.name.startsWith('Obj_Rim_T0B_'))) drop.push(o);
    });
    drop.forEach((o) => o.parent && o.parent.remove(o));

    sceneRoot.rotation.set(0, carMeta.rotY || 0, 0);
    sceneRoot.updateMatrixWorld(true);
    const rawSize = new THREE.Box3().setFromObject(sceneRoot).getSize(new THREE.Vector3());
    const scale = (carMeta.targetLength || 4.6) / Math.max(rawSize.x, rawSize.y, rawSize.z, 0.001);
    sceneRoot.scale.setScalar(scale);
    sceneRoot.updateMatrixWorld(true);
    const nb = new THREE.Box3().setFromObject(sceneRoot);
    const nc = nb.getCenter(new THREE.Vector3());
    sceneRoot.position.set(-nc.x, -nb.min.y + (carMeta.rideHeightOffset || 0), -nc.z);
    sceneRoot.updateMatrixWorld(true);
    if (carMeta.straightenFrontWheels) straightenFrontWheels(sceneRoot);

    const carRoot = new THREE.Group();
    carRoot.name = `C1V4_${carMeta.id}`;
    const sprung = new THREE.Group();
    sprung.add(sceneRoot);
    carRoot.add(sprung);

    const materials = [];
    const rearLights = [];
    const frontLights = [];
    const bayLight = { value: 0 };
    const p = carMeta.paint;

    const isPaint = (name) => {
      const m = (name || '').toLowerCase();
      if (carMeta.id === 'greenv12') return m === 'mt_body' || m === 'mt_mirrorcover';
      if (carMeta.id === 'whitetrack') return m === 'trackcarpaintmain' || m === 'trackcarpaint';
      if (carMeta.id === 'silvercoupe') return m === 'paint';
      if (carMeta.id === 'bluehyper') return m === 'bluebody';
      return m.includes('paint') || m.includes('body');
    };

    // One clear-coated paint per car, so every model gets the same car paint whatever its file had.
    let paint = null;
    const paintFor = (orig) => {
      if (!paint) {
        paint = new THREE.MeshPhysicalMaterial({
          name: 'paint',
          color: carMeta.paintHex,
          metalness: p.metalness,
          roughness: p.roughness,
          specularIntensity: p.specularIntensity,
          clearcoat: 1,
          clearcoatRoughness: p.clearcoatRoughness,
          envMapIntensity: 0.85,
          normalMap: orig.normalMap || null,
          side: orig.side,
        });
      }
      return paint;
    };

    // V5 round 2: the Track Car's carbon, race parts and skid plate ship as perfect mirrors (metalness 1,
    // roughness 0), so they rendered as chrome. Carbon is a dark weave under clear coat: satin below, gloss on top.
    const CARBON = /^(a_carbon|trackcar_raceparts|skidplate|scintilla_main|dot1)$/i;
    let carbon = null;
    const carbonFor = () => carbon || (carbon = new THREE.MeshPhysicalMaterial({
      name: 'carbon', color: 0x121315, metalness: 0.25, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.9,
    }));
    const swap = (m) => (!m ? m : isPaint(m.name) ? paintFor(m) : carMeta.id === 'whitetrack' && CARBON.test(m.name || '') ? carbonFor() : m);
    sceneRoot.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      const centre = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
      if (Array.isArray(obj.material)) obj.material = obj.material.map(swap);
      else if (obj.material) obj.material = swap(obj.material);
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      // No number plates: a German plate on a car kept in Geneva reads as a borrowed photo. Checked per
      // mesh, because both plates share one material and the material loop below sees it only once.
      if (mats.some((m) => m && /licen[sc]e|plate/i.test(m.name || '') && !/platform/i.test(m.name || ''))) obj.visible = false;
      mats.forEach((mat) => {
        if (!mat || materials.includes(mat)) return;
        if (mat.transmission && mat.transmission > 0) {
          mat.transmission = 0;
          mat.transparent = true;
          mat.opacity = Math.min(mat.opacity || 0.48, 0.48);
        }
        const ml = (mat.name || '').toLowerCase();
        const nl = (obj.name || '').toLowerCase();
        if (ml.includes('taillight') || ml.includes('redlight') || ml.includes('glass_red') || ml.includes('light_glow_back') ||
            ml === 'a_red' || ml === 'mt_reflector_tl' || ml === 'mt_reflector_bl' || nl.includes('taillight') ||
            nl.includes('tail_light') || (ml === 'lights' && centre.z > 0)) {
          mat.emissive = TAIL_RED.clone();
          mat.emissiveIntensity = 0.25;
          rearLights.push(mat);
        } else if (ml.includes('headlight') || ml.includes('frontlight') || ml.includes('emission') || nl.includes('headlight')) {
          if (!mat.emissive || mat.emissive.getHex() === 0) mat.emissive = new THREE.Color(0xfff6e5);
          mat.emissiveIntensity = 0.1;
          frontLights.push(mat);
        }
        // Tyres: near-black rubber, not grey plastic.
        if (/tyre|tire|side wall|sidewall/i.test(mat.name || '') && mat.color) {
          mat.color.setHex(0x0b0b0c);
          mat.roughness = 0.9;
          mat.metalness = 0;
        }
        trackMaterial(mat, materials, bayLight);
      });
    });

    const wheelPivots = buildWheelPivots(carRoot, sprung);
    return makeApi({ meta: carMeta, carRoot, sprung, materials, rearLights, frontLights, wheelPivots, bayLight });
  }
}
