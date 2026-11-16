// One rig per car: the model with its own lamp meshes switched by the film, headlight beams in the
// mist, tail glow on the wet ground, exhaust vapour, a contact shadow and a sprung body that can rock.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { bakeContactShadow, bakePuff, bakeDisc } from '../world/bake.js';
import { Vapour } from './Vapour.js';

const draco = new DRACOLoader().setDecoderPath((import.meta.env.BASE_URL + 'draco/gltf/'));
const loader = new GLTFLoader().setDRACOLoader(draco);
const shadowTex = bakeContactShadow();
const glowTex = bakeDisc(64, 0);

const WHITE = new THREE.Color(0xfff1dc);
const RED = new THREE.Color(0xff1a10);
const AMBER = new THREE.Color(0xff8a14);

// What each part of each model is, from its material and mesh names. z is the part's centre with
// the nose at -Z, which is how the shared fleet code reads these models.
function roleOf(id, mesh, mat, c) {
  const m = mesh.toLowerCase();
  const t = mat.toLowerCase();
  const front = c.z < 0;
  if (id === 'redspider') {
    if (t === 'body_color') return 'body';
    if (t === 'glass_gray') return 'glass';
    if (t === 'projector_glass') return 'lens';
    if (t === 'turn_signal_led') return front ? 'drl' : 'rear';
    if (t === 'taillight_glass' || m.includes('lights_red')) return 'rear';
    if (m === 'leds') return front ? 'drl' : 'rear';
    if (m === 'lights') return front ? 'housing' : 'rearHousing';
    if (t === 'tires' || m === 'tire') return 'tire';
    if (m.startsWith('rim')) return 'wheel';
    if (m === 'brake' || m === 'brakes') return 'caliper';
    if (m === 'centre' || m === 'nuts') return 'chrome';
    if (t === 'metal_chrome') return 'chrome';
    if (t === 'leather' || t === 'leather_red') return 'leather';
    if (t === 'carbon_fiber' || t === 'plastic_gray' || t === 'interior_dark' || t === 'carpet') return 'dark';
    if (t === 'metal_gray') return 'metal';
    if (t === 'interior_light') return 'dark';
    return 'keep';
  }
  if (id === 'silvercoupe') {
    if (t === 'paint') return 'body';
    if (t === 'coat') return 'hide';
    if (t === 'window' || t === 'glass') return 'glass';
    if (t === 'lights') return front ? 'drl' : 'rear';
    if (m.startsWith('cylinder.000_3') || m.startsWith('cylinder.001_3')) return 'caliper';
    if (t === 'rubber') return 'tire';
    if (m.startsWith('cylinder')) return 'wheel';
    if (t === 'silver' || t === 'tex_shiny') return 'chrome';
    if (t === 'plastic' || t === 'full_black') return 'dark';
    return 'keep';
  }
  if (id === 'greenv12') {
    if (t === 'mt_shadow_plane' || m.includes('shadow_plane') || m.startsWith('obj_rim_t0b') || m.startsWith('mesh_rim_t0b')) return 'hide';
    // the cabin uses a texture atlas with white regions that glow under the flood: black leather instead
    if (/seat|interior|steering|headliner|mirrormiddle|misc_cage/.test(m) && !/caliper/.test(m)) return 'leather';
    if (t === 'mt_body') return 'body';
    if (t === 'mt_windscreens') return 'glass';
    if (t === 'mt_light_emissive') return front ? 'drl' : 'rear';
    if (t === 'mt_turnlights') return front ? 'amber' : 'rear';
    if (t.startsWith('mt_reflector')) return front ? 'housing' : 'rear';
    if (t === 'mt_glass_translucent') return m.includes('tail') ? 'rearLens' : (c.z < -1.5 && Math.abs(c.x) > 0.4 && c.y < 0.85 ? 'lens' : 'glass');
    if (t === 'mt_tyres') return 'tire';
    if (t === 'mt_alloywheels') return 'wheel';
    if (t === 'mt_brakecaliper') return 'caliper';
    if (t === 'mt_mirror') return 'dark';
    if (t === 'mt_chrome') return 'chrome';
    if (t === 'mt_abs_black_mat' || t === 'mt_abs_black_gloss' || t === 'mt_metal_black_glossy' || t === 'mt_interior_black') return 'dark';
    return 'keep';
  }
  if (id === 'whitetrack') {
    if (t.includes('caliper')) return 'caliper';
    if (t.includes('brake')) return 'metal';
    if (t === 'trackcarpaintmain' || t === 'trackcarpaint') return m.includes('wheel') ? 'wheel' : 'body';
    if (t.includes('trackcar_glass')) return c.z < -1.5 && c.y < 0.7 && Math.abs(c.x) > 0.45 ? 'lens' : 'glass';
    if (t.includes('headlight')) return 'drl';
    if (t.startsWith('signal')) return 'amber';
    if (t === 'a_red' || t.includes('taillight')) return 'rear';
    if (t === 'a_carbon' || t === 'blacktrackcar' || t === 'trackcar_raceparts' || t === 'a_grille' || t === 'skidplate') return 'dark';
    if (t === 'trackcar_chrome' || t.includes('chrome')) return 'chrome';
    return 'keep';
  }
  if (id === 'bluehyper') {
    if (t.includes('clipper')) return 'caliper';
    if (t.includes('brake_disk')) return 'metal';
    if (t.includes('tyre') || t.includes('side_wall')) return 'tire';
    if (t.includes('rim') || t.includes('steel')) return 'wheel';
    if (t === 'bluebody') return 'body';
    if (t === 'blackbody') return 'carbon';
    if (t === 'glassinlight') return front ? 'lens' : 'rearLens';
    if (t.includes('glass')) return 'glass';
    if (t === 'light' || t === 'frontlightblosm') return front ? 'drl' : 'rear';
    if (t === 'yellowlight') return 'amber';
    if (t.includes('redlight')) return 'rear';
    if (t === 'plane.017__0' || m.startsWith('plane.017') || m.startsWith('plane.018')) return 'keep';
    return 'keep';
  }
  return 'keep';
}

// Small glossy parts (lenses, chrome, rims) catch the floodlights as tiny hot points, and bloom turns
// those into squares. Cap what they reflect, below the bloom threshold, but leave their own emission.
// V5: a soft knee instead of a hard clamp. Below 60% of the cap nothing changes; above it the light rolls
// off toward the cap, so a broad highlight keeps its gradient instead of going flat at the ceiling.
function capSpecular(mat, max) {
  const prev = mat.onBeforeCompile;
  const knee = (max * 0.6).toFixed(3), room = (max * 0.4).toFixed(3);
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `{ vec3 o = max(outgoingLight - totalEmissiveRadiance, vec3(0.0)); vec3 over = max(o - vec3(${knee}), vec3(0.0)); o = min(o, vec3(${knee})) + ${room} * (1.0 - exp(-over / ${room})); outgoingLight = o + totalEmissiveRadiance; }\n#include <opaque_fragment>`);
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => `${key}cap${max}`;
}

// Water beads on the clearcoat: it was washed at nine and it rained after. Cells of about 1.4 cm in car
// space, projected on the plane the surface faces, each a small dome that tilts the clearcoat normal.
// More beads on the upper surfaces, fewer on the sides, and they fade out where a cell is under a pixel.
function addBeads(mat, uniforms) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uCarInv = uniforms.uCarInv;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uCarInv;\nvarying vec3 vBeadP;\nvarying vec3 vBeadN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBeadP = (uCarInv * modelMatrix * vec4(transformed, 1.0)).xyz;\nvBeadN = normalize(mat3(uCarInv) * mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBeadP;\nvarying vec3 vBeadN;')
      .replace('#include <clearcoat_normal_fragment_maps>', `#include <clearcoat_normal_fragment_maps>
      #ifdef USE_CLEARCOAT
      {
        vec3 bn = normalize(vBeadN);
        vec3 an = abs(bn);
        vec3 bp = vBeadP * 115.0;
        int axis = an.y > max(an.x, an.z) ? 1 : (an.x > an.z ? 0 : 2);
        vec2 q = axis == 1 ? bp.xz : (axis == 0 ? bp.zy : bp.xy);
        vec2 cell = floor(q), fr = fract(q);
        float best = 9.0; vec2 bo = vec2(0.0); float br = 1.0;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 g = vec2(float(i), float(j));
          vec2 h = cell + g;
          vec3 rn = fract(sin(vec3(dot(h, vec2(127.1, 311.7)), dot(h, vec2(269.5, 183.3)), dot(h, vec2(419.2, 371.9)))) * 43758.5453);
          vec2 o = g + rn.xy - fr;
          float rad = (0.12 + 0.3 * rn.z) * step(0.28, rn.z + 0.2 * bn.y);
          float d = length(o) - rad;
          if (d < best) { best = d; bo = o; br = max(rad, 0.001); }
        }
        float up = smoothstep(0.5, 0.85, bn.y);
        float inside = 1.0 - smoothstep(-0.02, 0.0, best);
        float fade = 1.0 - smoothstep(0.3, 0.7, length(fwidth(q)));
        vec2 t2 = -bo / br;
        vec3 t3 = axis == 1 ? vec3(t2.x, 0.0, t2.y) : (axis == 0 ? vec3(0.0, t2.y, t2.x) : vec3(t2.x, t2.y, 0.0));
        clearcoatNormal = normalize(clearcoatNormal + mat3(viewMatrix) * t3 * 0.35 * inside * fade * up);
      }
      #endif`);
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.customProgramCacheKey = () => `${key}beads`;
}

// Emissive parts light from the centre of the car outward: a car-space |x| threshold.
function addSweep(mat, uniforms) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCarInv = uniforms.uCarInv;
    sh.uniforms.uSweepX = uniforms.uSweepX;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uCarInv;\nvarying float vCarX;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCarX = (uCarInv * modelMatrix * vec4(transformed, 1.0)).x;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSweepX;\nvarying float vCarX;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= smoothstep(uSweepX + 0.015, uSweepX - 0.015, abs(vCarX));');
  };
  mat.customProgramCacheKey = () => 'sweep';
}

// From C2 V3 (src/c2-v3/C2V3CarLoader.js), unchanged. Some models ship with their front wheels steered (the Hypercar's and the Silver's are turned
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

// A Swiss plate for a car kept in Geneva (the Silver's file came with a Munich one): white, the Swiss
// shield, GE and the number, the canton's shield. Drawn the size of the file's own plate texture.
function swissPlate() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f1ec'; g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = '#151515'; g.lineWidth = 10; g.strokeRect(12, 12, 1000, 232);
  const shield = (x, fill, draw) => {
    g.save(); g.translate(x, 128);
    g.beginPath(); g.moveTo(-34, -52); g.lineTo(34, -52); g.lineTo(34, 8); g.quadraticCurveTo(34, 46, 0, 60); g.quadraticCurveTo(-34, 46, -34, 8); g.closePath();
    g.fillStyle = fill; g.fill(); draw(); g.restore();
  };
  shield(92, '#d52b1e', () => { g.fillStyle = '#fff'; g.fillRect(-7, -32, 14, 56); g.fillRect(-26, -11, 52, 14); });
  shield(932, '#d52b1e', () => { g.fillStyle = '#f2c230'; g.beginPath(); g.moveTo(-34, -52); g.lineTo(0, -52); g.lineTo(0, 60); g.quadraticCurveTo(-34, 46, -34, 8); g.closePath(); g.fill(); });
  g.fillStyle = '#151515';
  g.font = '500 condensed 168px "Archivo", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('GE 104711', 512, 136);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = true; // this file's plate UVs run the other way up from its other glTF textures (checked on the car)
  t.anisotropy = 8;
  return t;
}

export async function loadCar(spec, envMap) {
  const gltf = await loader.loadAsync(spec.url);
  const model = gltf.scene;

  // normalise: nose to -Z, length to spec.length, wheels on y = 0, centred
  const hide = [];
  model.traverse((o) => {
    if (o.isMesh && (/shadow_plane/i.test(o.name) || /^(Obj|Mesh)_Rim_T0B_/.test(o.name))) hide.push(o);
  });
  hide.forEach((o) => o.parent.remove(o));
  model.rotation.set(0, spec.rotY, 0);
  model.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(spec.length / Math.max(size.x, size.z));
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const ctr = box.getCenter(new THREE.Vector3());
  model.position.x -= ctr.x;
  model.position.z -= ctr.z;
  model.position.y -= box.min.y;
  model.updateMatrixWorld(true);
  if (spec.straighten) straightenFrontWheels(model);
  if (spec.id === 'silvercoupe') {
    const plate = swissPlate();
    model.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m?.name === 'license') { m.map = plate; m.needsUpdate = true; } });
  }
  box = new THREE.Box3().setFromObject(model);
  const dims = box.getSize(new THREE.Vector3());

  const uniforms = { uCarInv: { value: new THREE.Matrix4() }, uSweepX: { value: 0 } };
  const P = spec.paint;
  const mats = {
    body: new THREE.MeshPhysicalMaterial({ color: P.color, metalness: P.metalness, roughness: P.roughness, specularIntensity: P.specularIntensity ?? 1, clearcoat: 1, clearcoatRoughness: P.clearcoatRoughness ?? 0.05, envMap, envMapIntensity: 1.35 }),
    carbon: new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, envMap, envMapIntensity: 1 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x07080a, metalness: 0.0, roughness: 0.04, transparent: true, opacity: 0.55, envMap, envMapIntensity: 0.9, depthWrite: false }),
    tire: new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.86, metalness: 0, envMap, envMapIntensity: 0.4 }),
    wheel: new THREE.MeshPhysicalMaterial({ color: spec.rim, metalness: 0.9, roughness: 0.28, clearcoat: 0.6, envMap, envMapIntensity: 1.2 }),
    caliper: new THREE.MeshStandardMaterial({ color: spec.caliper, metalness: 0.2, roughness: 0.4, envMap }),
    metal: new THREE.MeshStandardMaterial({ color: 0x55595e, metalness: 0.85, roughness: 0.35, envMap }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xc8cbd0, metalness: 1, roughness: 0.12, envMap, envMapIntensity: 1.4 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0d0e10, metalness: 0.2, roughness: 0.55, envMap, envMapIntensity: 0.7 }),
    leather: new THREE.MeshStandardMaterial({ color: spec.leather, metalness: 0, roughness: 0.62, envMap, envMapIntensity: 0.6 }),
    housing: new THREE.MeshStandardMaterial({ color: 0x1c1e21, metalness: 0.8, roughness: 0.32, envMap, envMapIntensity: 1.1, emissive: new THREE.Color(0xfff0d8), emissiveIntensity: 0 }),
    rearHousing: new THREE.MeshStandardMaterial({ color: 0x1a0606, metalness: 0.7, roughness: 0.2, envMap }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.6, envMap, envMapIntensity: 0.9, depthWrite: false, emissive: WHITE, emissiveIntensity: 0 }),
    rearLens: new THREE.MeshPhysicalMaterial({ color: 0x2a0303, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.7, envMap, envMapIntensity: 1.4, emissive: RED, emissiveIntensity: 0 }),
    drl: new THREE.MeshStandardMaterial({ color: 0x1b1d20, metalness: 0.4, roughness: 0.25, envMap, emissive: WHITE, emissiveIntensity: 0 }),
    rear: new THREE.MeshStandardMaterial({ color: 0x1c0404, metalness: 0.2, roughness: 0.2, envMap, emissive: RED, emissiveIntensity: 0 }),
    amber: new THREE.MeshStandardMaterial({ color: 0x1d1105, metalness: 0.2, roughness: 0.25, envMap, emissive: AMBER, emissiveIntensity: 0 }),
  };
  addSweep(mats.drl, uniforms);
  addSweep(mats.lens, uniforms);
  for (const k of ['lens', 'drl', 'housing', 'rearHousing', 'rear', 'rearLens', 'amber', 'chrome', 'wheel', 'glass', 'metal']) capSpecular(mats[k], 1.3);
  addBeads(mats.body, uniforms);
  capSpecular(mats.body, 1.5);
  capSpecular(mats.carbon, 1.6);

  const found = { drl: new THREE.Box3(), rear: new THREE.Box3(), amber: new THREE.Box3() };
  const counts = {};
  const tmpBox = new THREE.Box3();
  const c = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isMesh) return;
    tmpBox.setFromObject(o);
    tmpBox.getCenter(c);
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const roles = list.map((mm) => roleOf(spec.id, o.name || '', mm?.name || '', c));
    const next = roles.map((r, i) => {
      counts[r] = (counts[r] || 0) + 1;
      if (r === 'keep') {
        const k = list[i];
        if (k && k.isMeshStandardMaterial) {
          k.envMap = envMap; k.envMapIntensity = 0.8; if (k.emissive) k.emissiveIntensity = 0;
          // V5: the parts the roles leave alone can ship as perfect mirrors (the Hypercar's wheel centres): under
          // the polish's softbox they lit up as white points. A little roughness and the same soft cap as the rest.
          if (!k.userData.capped) { k.userData.capped = true; k.roughness = Math.max(k.roughness ?? 0, 0.1); capSpecular(k, 1.2); }
        }
        // unlit parts (gauge faces, screens, dome lights) would glow as white squares in a dark cabin
        if (k && k.isMeshBasicMaterial) return mats.dark;
        if (/gauge|display|screen|intscreen|interior_light/i.test(`${o.name} ${k?.name || ''}`)) return mats.dark;
        return k;
      }
      if (r === 'hide') return null;
      if (r === 'drl' || r === 'lens') found.drl.union(tmpBox);
      if (r === 'rear' || r === 'rearLens') found.rear.union(tmpBox);
      if (r === 'amber') found.amber.union(tmpBox);
      return mats[r];
    });
    if (next.every((m) => m === null)) { o.visible = false; return; }
    o.material = Array.isArray(o.material) ? next.map((m) => m || mats.dark) : next[0];
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.material === mats.glass || o.material === mats.lens) o.castShadow = false;
  });

  // Rig: flip so the nose faces +Z, a sprung group to rock.
  const root = new THREE.Group();
  root.name = `car-${spec.id}`;
  const sprung = new THREE.Group();
  const flip = new THREE.Group();
  flip.rotation.y = Math.PI;
  flip.add(model);
  sprung.add(flip);
  root.add(sprung);

  // Lamp positions in rig space (nose +Z): flip x and z of the nose -Z boxes.
  const toRig = (v) => new THREE.Vector3(-v.x, v.y, -v.z);
  const halfL = dims.z / 2, halfW = dims.x / 2;
  let lampL, lampR, lampY, lampZ;
  if (!found.drl.isEmpty()) {
    const b = found.drl;
    lampY = THREE.MathUtils.clamp((b.min.y + b.max.y) / 2, 0.45, 0.85);
    lampZ = -b.min.z - 0.05;
    const w = Math.max(Math.abs(b.min.x), Math.abs(b.max.x));
    lampL = -w * 0.78; lampR = w * 0.78;
  } else {
    lampY = 0.62; lampZ = halfL - 0.25; lampL = -halfW * 0.7; lampR = halfW * 0.7;
  }
  const sweepMax = Math.max(halfW, 0.5);

  // Headlights: two spots on the wet ground, and two soft beams in the mist.
  const spots = [lampL, lampR].map((x) => {
    const s = new THREE.SpotLight(0xfff2de, 0, 40, THREE.MathUtils.degToRad(24), 0.55, 1.6);
    s.position.set(x, lampY, lampZ + 0.15);
    s.target.position.set(x * 1.6, 0, lampZ + 14);
    sprung.add(s, s.target);
    return s;
  });
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uK: { value: 0 } },
    vertexShader: 'varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vH = uv.y; vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform float uK; varying float vH; varying vec3 vN; varying vec3 vV; void main(){ float e = clamp(abs(dot(vN, vV)) / max(length(vN) * length(vV), 1e-4), 0.0, 1.0); e *= e; float a = pow(clamp(vH, 0.0, 1.0), 2.5); vec3 c = vec3(0.085,0.08,0.072) * e * a * uK; gl_FragColor = vec4(c == c ? c : vec3(0.0), 1.0); }',
  });
  const beams = [lampL, lampR].map((x) => {
    const len = 11;
    const g = new THREE.ConeGeometry(Math.tan(THREE.MathUtils.degToRad(15)) * len, len, 28, 1, true);
    g.translate(0, -len / 2, 0);
    const m = new THREE.Mesh(g, beamMat);
    m.position.set(x, lampY, lampZ + 0.1);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(x * 0.04, -0.085, 1).normalize());
    m.renderOrder = 5;
    sprung.add(m);
    return m;
  });
  // Round amber glows where a model has no indicator lens of its own.
  const amberMat = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0xff8a14).multiplyScalar(0), blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const hasAmber = !found.amber.isEmpty() || spec.id === 'redspider';
  const ambers = [];
  for (const x of [-halfW * 0.86, halfW * 0.86]) {
    for (const z of [lampZ - 0.05, -halfL + 0.2]) {
      const s = new THREE.Sprite(amberMat);
      s.position.set(x, lampY + (z < 0 ? 0.1 : 0.0), z);
      s.scale.setScalar(0.05);
      sprung.add(s);
      ambers.push(s);
    }
  }
  // Tail glow on the ground behind.
  const tail = new THREE.PointLight(0xff1a10, 0, 6, 1.8);
  tail.position.set(0, 0.6, -halfL - 0.3);
  sprung.add(tail);

  // Contact shadow.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(dims.x * 1.45, dims.z * 1.25).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: shadowTex, color: 0x000000, transparent: true, opacity: 0.92, depthWrite: false })
  );
  shadow.position.y = 0.006;
  shadow.renderOrder = 1;
  root.add(shadow);

  // Exhaust vapour from each tip.
  const tips = spec.exhausts.map(([x, y]) => new THREE.Vector3(x, y, -halfL + 0.05));
  const vapour = new Vapour(tips, bakePuff());
  root.add(vapour.mesh);

  const state = { indicator: 0, drl: 0, head: 0, tail: 0, roll: 0, pitch: 0, vapour: 0, drlSag: 1, beam: 1 };

  // the lights that cost a pass per pixel: only the car on the stand carries them, the casting ring doesn't
  const costly = [...spots.flatMap((s) => [s, s.target]), tail];
  let lit = true;

  const rig = {
    spec, root, sprung, dims, counts, vapour,
    lamp: { left: lampL, right: lampR, y: lampY, z: lampZ },
    set(next) { Object.assign(state, next); },
    lights(on) {
      if (on === lit) return;
      lit = on;
      for (const o of costly) { if (on) sprung.add(o); else sprung.remove(o); }
    },
    // the reflections it sees: the apron from stand 7 in the film, its own spot in the casting ring
    setEnv(tex, k = 1) {
      if (tex === rig.env && k === rig.envK) return;
      rig.env = tex;
      rig.envK = k;
      model.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of [].concat(o.material)) {
          if (!m || !('envMap' in m) || !m.envMap) continue;
          m.userData.envBase ??= m.envMapIntensity;
          m.envMap = tex;
          m.envMapIntensity = m.userData.envBase * k * (rig.envScaleK ?? 1);
        }
      });
    },
    envK: 1,
    env: envMap,
    // V5's opening: everything the paint and glass reflect, dimmed together (1 is as set by setEnv)
    envScale(k) {
      if (k === rig.envScaleK) return;
      rig.envScaleK = k;
      if (!rig.envMats) {
        rig.envMats = [];
        model.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m && 'envMap' in m && m.envMap && !rig.envMats.includes(m)) rig.envMats.push(m); });
      }
      for (const m of rig.envMats) { m.userData.envBase ??= m.envMapIntensity; m.envMapIntensity = m.userData.envBase * rig.envK * k; }
    },
    envScaleK: 1,
    update(dt, time) {
      sprung.updateWorldMatrix(true, false);
      uniforms.uCarInv.value.copy(sprung.matrixWorld).invert();
      // inside to outside in four bands
      const band = Math.floor(THREE.MathUtils.clamp(state.drl, 0, 1) * 4.0 + 0.0001) / 4;
      uniforms.uSweepX.value = 0.12 + band * sweepMax;
      const d = Math.min(1, state.drl * 4) > 0 ? 1 : 0;
      mats.drl.emissiveIntensity = d * 9 * (spec.drlGain ?? 1) * (state.drlSag ?? 1);
      mats.lens.emissiveIntensity = state.head * 5.5 * (spec.lensGain ?? 1);
      mats.housing.emissiveIntensity = state.head * 0.9;
      mats.rear.emissiveIntensity = state.tail * 7;
      mats.rearLens.emissiveIntensity = state.tail * 2.5;
      mats.amber.emissiveIntensity = state.indicator * 14;
      amberMat.color.setRGB(1, 0.54, 0.08).multiplyScalar(state.indicator * 30);
      spots.forEach((s) => { s.intensity = state.head * 420; });
      beamMat.uniforms.uK.value = state.head * 0.6 * state.beam;
      tail.intensity = state.tail * 3.2;
      sprung.rotation.z = THREE.MathUtils.degToRad(state.roll);
      sprung.rotation.x = THREE.MathUtils.degToRad(state.pitch);
      vapour.update(dt, time, state.vapour, state.tail);
      void beams;
    },
  };
  return rig;
}
