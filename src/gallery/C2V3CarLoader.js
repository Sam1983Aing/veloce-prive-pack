import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { stripEndLogos } from './stripEndLogos.js';

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
      st = { sumX: 0, sumY: 0, sumZ: 0, count: 0, tris: [] };
      islandStats.set(root, st);
    }
    const cx = (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2)) / 3;
    const cy = (posAttr.getY(i0) + posAttr.getY(i1) + posAttr.getY(i2)) / 3;
    const cz = (posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2)) / 3;
    st.sumX += cx;
    st.sumY += cy;
    st.sumZ += cz;
    st.count += 1;
    st.tris.push(i0, i1, i2);
  }

  const bucketedTris = new Map();
  for (const st of islandStats.values()) {
    const cx = st.sumX / st.count;
    const cy = st.sumY / st.count;
    const cz = st.sumZ / st.count;
    const bucketKey = classifyCentroidFn(cx, cy, cz, st.count);
    if (!bucketedTris.has(bucketKey)) {
      bucketedTris.set(bucketKey, []);
    }
    const arr = bucketedTris.get(bucketKey);
    for (let i = 0; i < st.tris.length; i++) {
      arr.push(st.tris[i]);
    }
  }

  const results = new Map();
  for (const [bucketKey, triIndices] of bucketedTris.entries()) {
    const remap = new Map();
    const newPositions = [];
    const newNormals = [];
    const newUvs = [];
    const newIndices = [];

    for (let i = 0; i < triIndices.length; i++) {
      const oldIdx = triIndices[i];
      let mapped = remap.get(oldIdx);
      if (mapped === undefined) {
        mapped = newPositions.length / 3;
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
    subGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (newNormals.length > 0) {
      subGeo.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
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

function classifyRedspiderBodyIsland(cx, cy, cz) {
  if (cz > -0.75 && cz < -0.15 && Math.abs(cx) > 0.86 && cy > 0.74) {
    return cx < 0 ? 'body_mirror_l' : 'body_mirror_r';
  }
  if (cz < -1.68) return 'body_front_bumper';
  if (cz < -0.72 && Math.abs(cx) < 0.56) return 'body_hood';
  if (cz < -0.58 && Math.abs(cx) >= 0.45) {
    return cx < 0 ? 'body_fender_fl' : 'body_fender_fr';
  }
  if (cz >= -0.75 && cz <= 0.65 && Math.abs(cx) < 0.56 && cy > 0.82) {
    return 'body_roof';
  }
  if (cz >= -0.62 && cz <= 0.68 && Math.abs(cx) >= 0.45) {
    return cx < 0 ? 'body_door_l' : 'body_door_r';
  }
  if (cz > 0.62 && cz <= 1.82 && Math.abs(cx) < 0.58 && cy > 0.68) {
    return 'body_engine_cover';
  }
  if (cz > 0.68 && cz <= 1.88 && Math.abs(cx) >= 0.48) {
    return cx < 0 ? 'body_quarter_rl' : 'body_quarter_rr';
  }
  if (cz > 1.45) return 'body_rear_bumper';
  if (cz < -0.6) return 'body_hood';
  if (cz > 0.65) return 'body_engine_cover';
  return cx < 0 ? 'body_door_l' : 'body_door_r';
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
  if (m.includes('seat') || m.includes('leather')) {
    return { category: 'leather', isWheel: false };
  }
  return { category: 'interior', isWheel: false };
}

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

export class C2V3CarLoader {
  constructor() {
    this.cache = new Map();

    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath((import.meta.env.BASE_URL + 'draco/gltf/'));

    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    // the optimised models in public/models-c2v3 are packed with Meshopt (the Red Spider stays Draco)
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);

  }

  // Remember each material's own reflection strength, so a room's light level can scale it.
  _recordBaseEnv(root) {
    root.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (m.userData.baseEnv === undefined) m.userData.baseEnv = m.envMapIntensity ?? 1;
      }
    });
  }

  setLightLevel(entry, level) {
    entry.root.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (m.userData.baseEnv !== undefined) m.envMapIntensity = m.userData.baseEnv * level;
      }
    });
  }

  async loadCar(carMeta, envMap = null) {
    if (this.cache.has(carMeta.id)) {
      const entry = this.cache.get(carMeta.id);
      if (envMap) this.applyEnvMap(entry.root, envMap);
      return entry;
    }

    const gltf = await new Promise((resolve, reject) => {
      this.gltfLoader.load(
        carMeta.glbUrl,
        (data) => resolve(data),
        undefined,
        (err) => reject(err)
      );
    });

    // the Red Spider's horse and lettering are islands of its chrome mesh: cut out before the bundle reads it
    if (carMeta.id === 'redspider') {
      const chrome = gltf.scene.getObjectByName('chrome');
      if (chrome?.geometry) stripEndLogos(chrome.geometry);
    }

    const entry =
      carMeta.id === 'redspider'
        ? this._buildRedspiderBundle(gltf.scene, carMeta, envMap)
        : this._buildNativeCarBundle(gltf.scene, carMeta, envMap);

    this._removeBadges(entry.root);
    this._recordBaseEnv(entry.root);
    this.cache.set(carMeta.id, entry);
    return entry;
  }

  // The makers' badges off (Higgsfield's brief: no third-party logos in the video, 15 Nov 2026): hood and
  // tail badges, lettering, steering-wheel emblems and the Silver's crest are hidden; the Red Spider's
  // shields too. Wheel centre caps that carry a logo in their texture turn plain dark metal, so the
  // wheels keep their caps. The real-badge page is kept in versions/v8-real-names.
  _removeBadges(root) {
    const BADGE_MATS = /^(logo|bull_logo|logo\.004|logo_alpha\.002|steeringbadge|intbadges|team_shield)$/i;
    const plainCap = new THREE.MeshPhysicalMaterial({ name: 'Plain_Cap', color: 0x1b1b1d, metalness: 0.7, roughness: 0.3, clearcoat: 0.6 });
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      // the Silver's "SILVER / Coupe" lettering on the tail is its own strip (boot.003, tex_shiny)
      const silvercoupeLettering = /^boot\.?003/.test(obj.name || '') && mats.some((m) => m?.name === 'tex_shiny');
      if (silvercoupeLettering || /logo|badge|emblem/i.test(obj.name || '') || mats.some((m) => BADGE_MATS.test(m?.name || ''))) {
        obj.visible = false;
        return;
      }
      // the Red Spider's centre caps, and the V12's: a small disc in each rim that takes its picture
      // from the texture the tyres share (Mesh_Rim_*_1, material Mt_Tyres)
      const v12Cap = /^Mesh_Rim_/.test(obj.name || '') && mats.some((m) => m?.name === 'Mt_Tyres');
      if (v12Cap || mats.some((m) => m?.name === 'Wheel_Cap')) {
        plainCap.envMap = mats[0]?.envMap || null;
        obj.material = plainCap;
        return;
      }
      // and its brake calipers, lettered in the same texture: plain pale grey
      if (/^Mesh_Caliper_/.test(obj.name || '') && mats.some((m) => m?.name === 'Mt_V12Atlas')) {
        obj.material = new THREE.MeshPhysicalMaterial({ name: 'Plain_Caliper', color: 0xc9c9c9, metalness: 0.2, roughness: 0.4, clearcoat: 0.5, envMap: mats[0]?.envMap || null });
      }
    });
  }

  applyEnvMap(carRoot, envMap) {
    carRoot.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if ('envMap' in m) {
          m.envMap = envMap;
          m.needsUpdate = true;
        }
      }
    });
  }

  _buildRedspiderBundle(sceneRoot, carMeta, envMap) {
    sceneRoot.updateMatrixWorld(true);

    const rotMatrix = new THREE.Matrix4().makeRotationY(carMeta.rotY || 0);
    const rawBox = new THREE.Box3();
    const tempVec = new THREE.Vector3();

    sceneRoot.traverse((node) => {
      if (!node.isMesh || !node.geometry) return;
      const pos = node.geometry.attributes.position;
      if (!pos) return;
      const combinedMat = new THREE.Matrix4().multiplyMatrices(rotMatrix, node.matrixWorld);
      const step = Math.max(1, Math.floor(pos.count / 600));
      for (let i = 0; i < pos.count; i += step) {
        tempVec.fromBufferAttribute(pos, i).applyMatrix4(combinedMat);
        rawBox.expandByPoint(tempVec);
      }
    });

    const rawSize = rawBox.getSize(new THREE.Vector3());
    const rawLengthZ = Math.max(0.1, rawSize.z);
    const scaleFactor = (carMeta.targetLength || 4.534) / rawLengthZ;

    const scaleMatrix = new THREE.Matrix4().makeScale(scaleFactor, scaleFactor, scaleFactor);
    const orientScaleMat = new THREE.Matrix4().multiplyMatrices(scaleMatrix, rotMatrix);

    const scaledBox = new THREE.Box3();
    sceneRoot.traverse((node) => {
      if (!node.isMesh || !node.geometry) return;
      const pos = node.geometry.attributes.position;
      if (!pos) return;
      const mMat = new THREE.Matrix4().multiplyMatrices(orientScaleMat, node.matrixWorld);
      const step = Math.max(1, Math.floor(pos.count / 800));
      for (let i = 0; i < pos.count; i += step) {
        tempVec.fromBufferAttribute(pos, i).applyMatrix4(mMat);
        scaledBox.expandByPoint(tempVec);
      }
    });

    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
    const translateMat = new THREE.Matrix4().makeTranslation(
      -scaledCenter.x,
      -scaledBox.min.y + (carMeta.rideHeightOffset || 0),
      -scaledCenter.z
    );
    const masterNormalizeMatrix = new THREE.Matrix4().multiplyMatrices(
      translateMat,
      orientScaleMat
    );

    function getNormalizedGeometry(meshNode) {
      const geo = meshNode.geometry.clone();
      const fullMat = new THREE.Matrix4().multiplyMatrices(
        masterNormalizeMatrix,
        meshNode.matrixWorld
      );
      geo.applyMatrix4(fullMat);
      return geo;
    }

    const chromeNode = sceneRoot.getObjectByName('chrome');
    const chromeWorldGeo = chromeNode ? getNormalizedGeometry(chromeNode) : null;
    const teamShieldTex = createRedspiderTeamShieldTexture(chromeWorldGeo);
    const wheelCenterCapTex = createRedspiderWheelCapTexture(chromeWorldGeo);
    const raceTireBumpTex = getSharedRaceTireBumpTexture();

    const carRoot = new THREE.Group();
    carRoot.name = `C2_Car_${carMeta.id}`;

    function createGalleryMaterial(origMat, category) {
      const texProps = {};
      if (origMat) {
        if (origMat.map) texProps.map = origMat.map;
        if (origMat.normalMap) texProps.normalMap = origMat.normalMap;
        if (origMat.aoMap) {
          texProps.aoMap = origMat.aoMap;
          texProps.aoMapIntensity = 1.0;
        }
        if (origMat.roughnessMap) texProps.roughnessMap = origMat.roughnessMap;
        if (origMat.metalnessMap) texProps.metalnessMap = origMat.metalnessMap;
      }

      if (category === 'body') {
        const bodyTexProps = {};
        if (origMat && origMat.normalMap) bodyTexProps.normalMap = origMat.normalMap;
        return new THREE.MeshPhysicalMaterial({
          name: 'Redspider_Racing_red_Gallery',
          color: new THREE.Color(0x740004),
          metalness: 0.24,
          roughness: 0.30,
          specularIntensity: 0.08,
          clearcoat: 1.0,
          clearcoatRoughness: 0.03,
          envMap: envMap || null,
          envMapIntensity: 0.68,
          ...bodyTexProps,
        });
      }
      if (category === 'glass') {
        return new THREE.MeshPhysicalMaterial({
          name: 'Gallery_Automotive_Glass',
          color: new THREE.Color(0x101419),
          metalness: 0.08,
          roughness: 0.04,
          transmission: 0.0,
          transparent: true,
          opacity: 0.42,
          clearcoat: 1.0,
          clearcoatRoughness: 0.02,
          envMap: envMap || null,
          envMapIntensity: 1.4,
        });
      }
      if (category === 'carbon') {
        return new THREE.MeshPhysicalMaterial({
          name: 'Gallery_Carbon_Fiber',
          color: new THREE.Color(0x16181b),
          metalness: 0.36,
          roughness: 0.28,
          clearcoat: 0.65,
          clearcoatRoughness: 0.12,
          envMap: envMap || null,
          envMapIntensity: 0.8,
          ...texProps,
        });
      }
      if (category === 'wheel' || category === 'chrome') {
        return new THREE.MeshPhysicalMaterial({
          name: 'Gallery_Forged_Alloy',
          color:
            category === 'chrome'
              ? new THREE.Color(0xe6ebf0)
              : new THREE.Color(0xadb5bf),
          metalness: 0.88,
          roughness: category === 'chrome' ? 0.09 : 0.17,
          clearcoat: 0.7,
          envMap: envMap || null,
          envMapIntensity: 1.25,
          ...texProps,
        });
      }
      if (category === 'brake') {
        return new THREE.MeshPhysicalMaterial({
          name: 'Gallery_Carbon_Ceramic_Rotor',
          color: new THREE.Color(0x32363c),
          metalness: 0.78,
          roughness: 0.32,
          clearcoat: 0.35,
          envMap: envMap || null,
          envMapIntensity: 0.85,
          ...texProps,
        });
      }
      if (category === 'tire') {
        return new THREE.MeshStandardMaterial({
          name: 'Gallery_Tyre_Tire',
          color: new THREE.Color(0x111214),
          bumpMap: texProps.normalMap ? null : raceTireBumpTex,
          bumpScale: 0.008,
          metalness: 0.05,
          roughness: 0.76,
          envMap: envMap || null,
          envMapIntensity: 0.32,
          ...texProps,
        });
      }
      if (category === 'light_front') {
        return new THREE.MeshPhysicalMaterial({
          name: 'Gallery_Headlight_Optics',
          color: new THREE.Color(0xe6ebf0),
          roughness: 0.08,
          metalness: 0.2,
          clearcoat: 0.95,
          envMap: envMap || null,
          envMapIntensity: 1.2,
          ...texProps,
        });
      }
      if (category === 'light_rear') {
        return new THREE.MeshPhysicalMaterial({
          name: 'Gallery_Taillight_Optics',
          color: new THREE.Color(0x980b14),
          roughness: 0.12,
          clearcoat: 0.95,
          envMap: envMap || null,
          envMapIntensity: 1.0,
          ...texProps,
        });
      }
      if (category === 'team_shield' && teamShieldTex) {
        return new THREE.MeshPhysicalMaterial({
          name: 'Team_Shield',
          color: new THREE.Color(0xffffff),
          map: teamShieldTex,
          metalness: 0.2,
          roughness: 0.18,
          clearcoat: 0.9,
          envMap: envMap || null,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
      }
      if (category === 'wheel_cap' && wheelCenterCapTex) {
        return new THREE.MeshPhysicalMaterial({
          name: 'Wheel_Cap',
          color: new THREE.Color(0xffffff),
          map: wheelCenterCapTex,
          metalness: 0.45,
          roughness: 0.18,
          clearcoat: 0.85,
          envMap: envMap || null,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        });
      }
      if (category === 'engine') {
        return new THREE.MeshPhysicalMaterial({
          name: 'Engine_Intake_Alloy',
          color: new THREE.Color(0x464b52),
          metalness: 0.78,
          roughness: 0.28,
          clearcoat: 0.3,
          envMap: envMap || null,
          ...texProps,
        });
      }
      if (category === 'leather') {
        return new THREE.MeshStandardMaterial({
          name: 'Redspider_Tan_Tan_Leather',
          color: new THREE.Color(0x884f26),
          metalness: 0.04,
          roughness: 0.62,
          envMap: envMap || null,
          envMapIntensity: 0.42,
        });
      }
      return new THREE.MeshStandardMaterial({
        name: 'Cockpit_Charcoal_Trim',
        color: new THREE.Color(0x141518),
        metalness: 0.1,
        roughness: 0.78,
        envMap: envMap || null,
        envMapIntensity: 0.35,
        ...texProps,
      });
    }

    function registerPart({ id, category, worldGeo, origMat, customAxlePivot = null }) {
      worldGeo.computeBoundingBox();
      const bbox = worldGeo.boundingBox;
      const centroid = bbox.getCenter(new THREE.Vector3());
      const pivot = customAxlePivot ? customAxlePivot.clone() : centroid.clone();

      const localGeo = worldGeo.clone();
      localGeo.translate(-pivot.x, -pivot.y, -pivot.z);
      localGeo.computeBoundingBox();

      if (category === 'team_shield') {
        applyCustomPlanarUVs(
          localGeo,
          id.includes('nose') ? 'nose' : 'side',
          centroid.x > 0
        );
      } else if (category === 'wheel_cap') {
        applyCustomPlanarUVs(localGeo, 'side', centroid.x > 0);
      }

      const mat = createGalleryMaterial(origMat, category);
      const mesh = new THREE.Mesh(localGeo, mat);
      mesh.castShadow = category !== 'glass';
      mesh.receiveShadow = true;

      const partGroup = new THREE.Group();
      partGroup.name = id;
      partGroup.position.copy(pivot);
      partGroup.add(mesh);
      carRoot.add(partGroup);
    }

    const handledNodes = new Set();
    const wheelNodes = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];
    for (const wName of wheelNodes) {
      const wNode = sceneRoot.getObjectByName(wName);
      if (!wNode) continue;
      handledNodes.add(wNode);

      let axleY = 0.34;
      let axleZ = wName.includes('_f') ? -1.34 : 1.32;
      const tireChild = wNode.children.find((c) => c.name.toLowerCase().includes('tire'));
      if (tireChild && tireChild.isMesh) {
        const tGeo = getNormalizedGeometry(tireChild);
        tGeo.computeBoundingBox();
        const tc = tGeo.boundingBox.getCenter(new THREE.Vector3());
        axleY = tc.y;
        axleZ = tc.z;
      }

      wNode.traverse((child) => {
        if (!child.isMesh) return;
        handledNodes.add(child);
        const worldGeo = getNormalizedGeometry(child);
        worldGeo.computeBoundingBox();
        const cc = worldGeo.boundingBox.getCenter(new THREE.Vector3());
        const coaxialPivot = new THREE.Vector3(cc.x, axleY, axleZ);
        const role = classifyRedspiderMesh(`${wName}_${child.name}`);
        registerPart({
          id: `${wName}_${child.name}`,
          category: role.category,
          worldGeo,
          origMat: child.material,
          customAxlePivot: coaxialPivot,
        });
      });
    }

    sceneRoot.traverse((child) => {
      if (!child.isMesh || !child.geometry || handledNodes.has(child)) return;

      const mName = child.name || 'mesh';
      const worldGeo = getNormalizedGeometry(child);
      worldGeo.computeBoundingBox();

      if (mName === 'body') {
        const subMap = splitGeometryByConnectedIslands(worldGeo, classifyRedspiderBodyIsland);
        for (const [partKey, subGeo] of subMap.entries()) {
          registerPart({
            id: partKey,
            category: 'body',
            worldGeo: subGeo,
            origMat: child.material,
          });
        }
        return;
      }

      if (mName === 'yellow_trim') {
        const subMap = splitGeometryByConnectedIslands(worldGeo, (cx, cy, cz) => {
          if (cz < -1.5) return 'badge_nose';
          if (Math.abs(cx) > 0.7) return cx < 0 ? 'badge_fender_l' : 'badge_fender_r';
          return 'cockpit_tachometer';
        });
        for (const [partKey, subGeo] of subMap.entries()) {
          registerPart({
            id: partKey,
            category: partKey.startsWith('badge_') ? 'team_shield' : 'interior',
            worldGeo: subGeo,
            origMat: child.material,
          });
        }
        return;
      }

      // Separate actual cockpit seats/tonneau leather from exterior black grilles, wheel liners, and windshield frame
      if (mName === 'interior' || mName === 'leather') {
        const subMap = splitGeometryByConnectedIslands(worldGeo, (cx, cy, cz) => {
          const isCabinSeatOrTrim =
            cz >= -0.36 &&
            cz <= 0.56 &&
            Math.abs(cx) <= 0.62 &&
            cy >= 0.24 &&
            cy <= 0.86;
          return isCabinSeatOrTrim ? 'cabin_tan_leather' : 'exterior_charcoal_trim';
        });
        for (const [partKey, subGeo] of subMap.entries()) {
          registerPart({
            id: `${mName}_${partKey}`,
            category: partKey === 'cabin_tan_leather' ? 'leather' : 'interior',
            worldGeo: subGeo,
            origMat: child.material,
          });
        }
        return;
      }

      const role = classifyRedspiderMesh(mName);
      registerPart({
        id: `redspider_${mName}`,
        category: role.category,
        worldGeo,
        origMat: child.material,
      });
    });

    return {
      id: carMeta.id,
      spec: carMeta,
      root: carRoot,
    };
  }

  _buildNativeCarBundle(sceneRoot, carMeta, envMap) {
    const toRemove = [];
    sceneRoot.traverse((obj) => {
      if (!obj.isMesh) return;
      const n = obj.name || '';
      if (n === 'Obj_Shadow_Plane' || n.startsWith('Obj_Rim_T0B_')) {
        obj.visible = false;
        toRemove.push(obj);
      }
    });
    toRemove.forEach((obj) => {
      if (obj.parent) obj.parent.remove(obj);
    });

    sceneRoot.rotation.set(0, carMeta.rotY || 0, 0);
    sceneRoot.position.set(0, 0, 0);
    sceneRoot.scale.setScalar(1);
    sceneRoot.updateMatrixWorld(true);

    const rawBox = new THREE.Box3().setFromObject(sceneRoot);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(rawSize.x, rawSize.y, rawSize.z, 0.001);
    const scale = (carMeta.targetLength || 4.6) / maxDim;

    sceneRoot.scale.setScalar(scale);
    sceneRoot.updateMatrixWorld(true);

    const normBox = new THREE.Box3().setFromObject(sceneRoot);
    const normCenter = normBox.getCenter(new THREE.Vector3());
    sceneRoot.position.x -= normCenter.x;
    sceneRoot.position.y -= normBox.min.y - (carMeta.rideHeightOffset || 0);
    sceneRoot.position.z -= normCenter.z;
    sceneRoot.updateMatrixWorld(true);
    if (carMeta.straightenFrontWheels) straightenFrontWheels(sceneRoot);

    const carRoot = new THREE.Group();
    carRoot.name = `C2_Car_${carMeta.id}`;
    carRoot.add(sceneRoot);

    const isBodyPaintMaterial = (matName) => {
      const m = (matName || '').toLowerCase();
      if (carMeta.id === 'greenv12') return m === 'mt_body' || m === 'mt_mirrorcover';
      if (carMeta.id === 'whitetrack') return m === 'trackcarpaintmain' || m === 'trackcarpaint';
      if (carMeta.id === 'silvercoupe') return m === 'paint';
      if (carMeta.id === 'bluehyper') return m === 'bluebody';
      if (carMeta.id === 'yellowwedge') return m === 'paint';
      return m.includes('paint') || m.includes('body');
    };

    sceneRoot.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;

      const matArray = Array.isArray(obj.material) ? obj.material : [obj.material];
      let isGlassMesh = false;

      matArray.forEach((mat) => {
        if (!mat) return;

        if ('envMap' in mat) {
          mat.envMap = envMap || null;
        }

        if (mat.transmission && mat.transmission > 0) {
          mat.transmission = 0;
          mat.transparent = true;
          mat.opacity = Math.min(mat.opacity || 0.42, 0.42);
          isGlassMesh = true;
        }
        const mLow = (mat.name || '').toLowerCase();
        if (mLow.includes('glass') || mLow.includes('window') || mLow.includes('windshield')) {
          isGlassMesh = true;
        }
        // the Hypercar's tail light ships at ten times full red, which tone mapping turns pink:
        // a deeper red at a fraction of the strength stays red and still blooms
        if (mat.name === 'RedLightBlosm') {
          mat.emissive.setRGB(1, 0.01, 0.004);
          mat.emissiveIntensity = 0.7;
          mat.color.setRGB(0.35, 0, 0);
        }

        mat.needsUpdate = true;
      });

      // Car paint: a clearcoated physical material, whatever the file shipped with.
      const paintIdx = matArray.findIndex((m) => m && isBodyPaintMaterial(m.name));
      if (paintIdx >= 0) {
        const src = matArray[paintIdx];
        const paint = new THREE.MeshPhysicalMaterial({
          name: src.name,
          color: new THREE.Color(carMeta.paintHex),
          metalness: carMeta.paintMetalness ?? 0.55,
          roughness: carMeta.paintRoughness ?? 0.22,
          clearcoat: 1.0,
          clearcoatRoughness: 0.04,
          normalMap: src.normalMap || null,
          envMap: envMap || null,
          envMapIntensity: 1.0,
        });
        if (Array.isArray(obj.material)) obj.material[paintIdx] = paint;
        else obj.material = paint;
      }

      obj.castShadow = !isGlassMesh;
      obj.receiveShadow = true;

      // number plates off: the Silver's German plate and the vendor's text on the Blue's
      const plate = matArray.some((m) => (m?.name || '').toLowerCase() === 'license') || (obj.name || '').startsWith('Text_');
      if (plate) obj.visible = false;
    });

    return {
      id: carMeta.id,
      spec: carMeta,
      root: carRoot,
    };
  }
}
