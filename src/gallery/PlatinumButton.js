// The Watch trailer button (Sam, 14 Nov): his ThreeUI component, Shader Buttons study 09
// "Brushed gold", re-made in platinum silver for the way in. A real 3D capsule slab (pillowed
// face, elliptical bevel, short wall) in brushed metal, lit by a small studio baked to PMREM:
// dark room, a flagged front softbox, a hot strip, a ceiling bank, a key on the right, cool
// strips and a rim from behind. The face is brushed along its length (anisotropic GGX plus fine
// hairlines), the bevel is polished. The studio turns in the shader, so moving over the button
// glides the light across the metal, glints spark where the studio says the bevel is brightest,
// a press sinks it and the click flicks the light. The real <button> sits on top with its label
// glued to the slab, so the keyboard, screen readers and the click all stay plain HTML.
//
// Changed from the gold: the metal and the label colours, the studio re-toned neutral and cool,
// one theme (the trailer is always night), no confetti, and its own pointer and render loop
// instead of the study page's harness. It stops and frees its GPU context once the trailer plays.
//
// Note for the free package: this is adapted from Sam's ThreeUI Pro component, so check its
// licence before it goes out with the code.

import * as THREE from 'three';

const T = THREE;
const D2R = Math.PI / 180;
// the board, in design units: the CSS draws it at --pt-s of this size
const W = 760;
const H = 380;
// the slab: half width, half height, bevel width and depth, pillow, wall
const HW = 244;
const HH = 68;
const BX = 22;
const BZ = 17;
const PIL = 7;
const SIDE = 10;

// platinum: a pale, faintly warm grey for the brushed face, the polished bevel a shade deeper
const FACE = '#dcdad5';
const BEVEL = '#c3c0ba';
const EXPOSURE = 0.94;

// The studio. Softboxes in direction space: [azimuth°, elevation°, half-az°, half-el°, edge°,
// intensity, r, g, b, top boost]. Azimuth 0 faces the viewer (+z), +90 is +x. The same list
// drives the PMREM room shader and the JS glint finder.
const KIT = {
  room: [0.006, 0.006, 0.007, 0.02, 0.02, 0.022, 0.09, 0.09, 0.095],
  boxes: [
    [0, 21, 38, 29, 5, 0.95, 1, 0.99, 0.97, 0.55], // big front softbox, what the face sees
    [-17, 21, 3.5, 32, 2.5, -0.72, 1, 1, 1], // two flags cut soft dark bands into it
    [21, 21, 3, 32, 2.5, -0.72, 1, 1, 1],
    [-4, 20, 2.2, 36, 1.4, 2.6, 1, 1, 0.98], // hot strip
    [0, 76, 180, 15, 6, 1.5, 0.96, 0.98, 1], // ceiling bank, a little cool: the top bevel
    [74, 16, 15, 22, 5, 2.4, 1, 0.9, 0.76], // key on the right, a touch warm so it reads platinum, not steel
    [-84, 12, 4, 34, 2, 1.7, 0.86, 0.93, 1], // cool strip, left
    [0, -31, 62, 5, 4, 0.35, 1, 0.96, 0.9], // low bounce: the bottom lip
    [180, -18, 80, 9, 6, 2.2, 0.9, 0.95, 1], // cool rim from behind and below
    [0, -62, 180, 26, 10, 0.12, 0.92, 0.92, 0.95], // faint floor so the underside isn't dead black
    [180, 30, 34, 10, 5, 0.7, 1, 0.98, 0.95], // back strip: the top edge
  ],
};

const sstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
const rnd = (a, b) => a + Math.random() * (b - a);

function glslKit(k) {
  const r = k.room.map((v) => v.toFixed(3));
  let s = `vec3 col=mix(vec3(${r[0]},${r[1]},${r[2]}),vec3(${r[3]},${r[4]},${r[5]}),smoothstep(-25.,12.,el))+vec3(${r[6]},${r[7]},${r[8]})*smoothstep(38.,90.,el);\n`;
  for (const b of k.boxes)
    s += `col+=box(az,el,vec4(${b
      .slice(0, 4)
      .map((v) => v.toFixed(2))
      .join(',')}),${b[4].toFixed(2)})*(1.+${(b[9] || 0).toFixed(2)}*clamp((el-(${b[1].toFixed(1)}))/${b[3].toFixed(1)},-1.,1.))*vec3(${(b[5] * b[6]).toFixed(3)},${(b[5] * b[7]).toFixed(3)},${(b[5] * b[8]).toFixed(3)});\n`;
  return s;
}
function boxJS(az, el, b) {
  const da = Math.abs((((az - b[0]) % 360) + 540) % 360 - 180);
  return (1 - sstep(b[2] - b[4], b[2] + b[4], da)) * (1 - sstep(b[3] - b[4], b[3] + b[4], Math.abs(el - b[1])));
}
function envJS(kit, x, y, z) {
  const az = Math.atan2(x, z) / D2R;
  const el = Math.asin(Math.max(-1, Math.min(1, y))) / D2R;
  let v = 0;
  for (const b of kit.boxes)
    v += boxJS(az, el, b) * (1 + (b[9] || 0) * Math.max(-1, Math.min(1, (el - b[1]) / b[3]))) * b[5] * (0.3 * b[6] + 0.6 * b[7] + 0.1 * b[8]);
  return Math.max(v, 0);
}

// Stadium outline swept through a profile: pillowed face, elliptical bevel, short wall.
function slabGeometry() {
  const a = HW - HH;
  const R = HH;
  const nArc = 64;
  const nLine = 32;
  const O = [];
  for (let i = 0; i < nArc; i++) {
    const t = -Math.PI / 2 + (Math.PI * i) / nArc;
    O.push([a + R * Math.cos(t), R * Math.sin(t), Math.cos(t), Math.sin(t)]);
  }
  for (let i = 0; i < nLine; i++) O.push([a - (2 * a * i) / nLine, R, 0, 1]);
  for (let i = 0; i < nArc; i++) {
    const t = Math.PI / 2 + (Math.PI * i) / nArc;
    O.push([-a + R * Math.cos(t), R * Math.sin(t), Math.cos(t), Math.sin(t)]);
  }
  for (let i = 0; i < nLine; i++) O.push([-a + (2 * a * i) / nLine, -R, 0, -1]);
  const N = O.length;
  let inset = BX;
  let phi0 = 0;
  for (let k = 0; k < 6; k++) {
    const sl = (2 * PIL) / (R - inset);
    phi0 = Math.atan((sl * BX) / BZ);
    inset = BX * (1 - Math.sin(phi0));
  }
  const span = R - inset;
  const zc = -BZ * Math.cos(phi0);
  const prof = [];
  const J = 16;
  const K = 18;
  for (let j = 0; j <= J; j++) {
    const u = 1 - j / J;
    const d = inset + span * u;
    const z = PIL * (1 - (1 - u) * (1 - u));
    const sl = (2 * PIL * (1 - u)) / span;
    const l = Math.hypot(sl, 1);
    prof.push([d, z, sl / l, 1 / l, 0]);
  }
  for (let k = 1; k <= K; k++) {
    const e = k / K;
    const ph = phi0 + (Math.PI / 2 - phi0) * (1 - Math.pow(1 - e, 1.35));
    const nr = Math.sin(ph) / BX;
    const nz = Math.cos(ph) / BZ;
    const l = Math.hypot(nr, nz);
    prof.push([BX * (1 - Math.sin(ph)), zc + BZ * Math.cos(ph), nr / l, nz / l, (ph - phi0) / (Math.PI / 2 - phi0)]);
  }
  prof.push([0, zc - SIDE, 1, 0, 1]);
  const M = prof.length;
  const pos = new Float32Array(M * N * 3);
  const nor = new Float32Array(M * N * 3);
  const tan = new Float32Array(M * N * 4);
  const zone = new Float32Array(M * N);
  for (let k = 0; k < M; k++) {
    const [d, z, nr, nz, zn] = prof[k];
    for (let i = 0; i < N; i++) {
      const [x, y, nx, ny] = O[i];
      const v = k * N + i;
      pos[v * 3] = x - nx * d;
      pos[v * 3 + 1] = y - ny * d;
      pos[v * 3 + 2] = z - PIL;
      const Nx = nx * nr;
      const Ny = ny * nr;
      const Nz = nz;
      nor[v * 3] = Nx;
      nor[v * 3 + 1] = Ny;
      nor[v * 3 + 2] = Nz;
      let tx;
      let ty;
      let tz;
      if (zn === 0) {
        tx = -Nx * Ny;
        ty = 1 - Ny * Ny;
        tz = -Nz * Ny;
        const l = Math.hypot(tx, ty, tz) || 1;
        tx /= l;
        ty /= l;
        tz /= l;
      } else {
        tx = -ny;
        ty = nx;
        tz = 0;
      }
      tan[v * 4] = tx;
      tan[v * 4 + 1] = ty;
      tan[v * 4 + 2] = tz;
      tan[v * 4 + 3] = 1;
      zone[v] = zn;
    }
  }
  const idx = [];
  for (let k = 0; k < M - 1; k++)
    for (let i = 0; i < N; i++) {
      const a0 = k * N + i;
      const b0 = k * N + ((i + 1) % N);
      const c0 = (k + 1) * N + ((i + 1) % N);
      const d0 = (k + 1) * N + i;
      idx.push(a0, d0, c0, a0, c0, b0);
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.BufferAttribute(nor, 3));
  g.setAttribute('tangent', new T.BufferAttribute(tan, 4));
  g.setAttribute('aZone', new T.BufferAttribute(zone, 1));
  g.setIndex(idx);
  // glint candidates: points along the upper and side bevel
  const cand = [];
  for (const kk of [J + 4, J + 7, J + 10])
    for (let i = 0; i < N; i += 2) {
      const v = kk * N + i;
      cand.push({
        p: new T.Vector3(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]),
        n: new T.Vector3(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]),
        b: 0,
      });
    }
  return { g, cand };
}

const NOOP = { start() {}, stop() {}, flick() {}, dispose() {} };

export function makePlatinumButton({ board, button, reduceMotion }) {
  const canvas = board?.querySelector('.pt-fx');
  const face = button?.querySelector('.pt-face');
  if (!canvas || !face) return NOOP;
  const motion = !reduceMotion;

  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    // no WebGL: the button keeps a flat CSS platinum (style.css, .is-flat)
    board.classList.add('is-flat');
    return NOOP;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;

  // a camera whose z=0 plane maps 1:1 to design units
  const FOV = 26;
  const cam = new T.PerspectiveCamera(FOV, W / H, 1, 20000);
  cam.position.z = H / 2 / Math.tan((FOV * Math.PI) / 360);
  const CZ = cam.position.z;
  const scene = new T.Scene();

  // ── studio, baked once ──
  const pmrem = new T.PMREMGenerator(renderer);
  function bakeEnv() {
    const es = new T.Scene();
    const m = new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec3 vD;
float box(float az,float el,vec4 b,float e){float da=abs(mod(az-b.x+540.,360.)-180.);return (1.-smoothstep(b.z-e,b.z+e,da))*(1.-smoothstep(b.w-e,b.w+e,abs(el-b.y)));}
void main(){vec3 d=normalize(vD);float az=degrees(atan(d.x,d.z)),el=degrees(asin(clamp(d.y,-1.,1.)));
${glslKit(KIT)}gl_FragColor=vec4(max(col,0.),1.);}`,
    });
    const sphere = new T.SphereGeometry(50, 96, 48);
    es.add(new T.Mesh(sphere, m));
    const rt = pmrem.fromScene(es, 0.012, 0.1, 200);
    m.dispose();
    sphere.dispose();
    return rt;
  }
  let envRT = bakeEnv();

  // ── shared uniforms and shader patches ──
  const U = {
    envRot: { value: new T.Matrix3() },
    face: { value: new T.Color(FACE) },
    bevel: { value: new T.Color(BEVEL) },
    dim: { value: 1 },
    bevelRough: { value: 0.12 },
    bevelAniso: { value: 0.2 },
    brush: { value: 1 },
  };
  // the studio turns in the shader (three r170 already multiplies by envMapRotation)
  const ENV_PARS = T.ShaderChunk.envmap_physical_pars_fragment
    .replace('envMapRotation * worldNormal', 'envMapRotation * uEnvRot * worldNormal')
    .replace('envMapRotation * reflectVec', 'envMapRotation * uEnvRot * reflectVec');

  const slabGeo = slabGeometry();
  const slabMat = new T.MeshPhysicalMaterial({ color: 0xffffff, metalness: 1, roughness: 0.17, anisotropy: 0.35, envMapIntensity: 1 });
  slabMat.envMap = envRT.texture;
  slabMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uEnvRot: U.envRot,
      uFace: U.face,
      uBevel: U.bevel,
      uDim: U.dim,
      uBevelRough: U.bevelRough,
      uBevelAniso: U.bevelAniso,
      uBrush: U.brush,
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aZone;varying float vZone;varying vec2 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZone=aZone;vObj=position.xy;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform mat3 uEnvRot;
uniform vec3 uFace,uBevel;uniform float uDim,uBevelRough,uBevelAniso,uBrush;varying float vZone;varying vec2 vObj;
float ptH(float n){return fract(sin(n*12.9898)*43758.5453);}
float ptN(float x){float i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(ptH(i),ptH(i+1.),f)*2.-1.;}
// hairlines along x: 1D noise across y whose phase wanders slowly along x; octaves finer than
// about 2 px fade out, so it never shimmers
float ptBrush(vec2 p){
 float fw=max(fwidth(p.y),1e-4),v=0.,ws=0.,f=1.1,a=1.;
 for(int i=0;i<4;i++){
  float fi=float(i);
  float x=p.y*f+ptN(p.x*.004*f+fi*7.3)*1.5+fi*13.7;
  float n=ptN(x);n*=abs(n)*1.6;
  float w=a*(1.-smoothstep(.2,.45,f*fw));
  v+=w*n*(.55+.45*ptN(p.x*.021+fi*3.1+floor(x)*1.7));ws+=a;f*=.5;a*=.8;
 }
 return v/ws;
}`
      )
      .replace('#include <envmap_physical_pars_fragment>', ENV_PARS)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float ptB=smoothstep(.0,.3,vZone);
float ptBr=ptBrush(vObj)*(1.-ptB)*uBrush;
float ptY=clamp(vObj.y/${HH}.,-1.,1.);
float ptAO=mix(.76,1.04,smoothstep(-1.,.8,ptY));
diffuseColor.rgb=mix(uFace*ptAO,uBevel,ptB)*(1.+ptBr*.18)*uDim;`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor=clamp(mix(roughness,uBevelRough,ptB)+ptBr*.012,.05,1.);`
      )
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\nnormal=normalize(normal+tbn[0]*ptBr*.03);`)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directSpecular*=mix(.2,1.,ptB);')
      .replace(
        '#include <lights_physical_fragment>',
        T.ShaderChunk.lights_physical_fragment.replace('material.alphaT =', 'material.anisotropy*=mix(1.,uBevelAniso,ptB);\n\tmaterial.alphaT =')
      );
  };
  slabMat.customProgramCacheKey = () => 'platinum-slab';
  const slab = new T.Mesh(slabGeo.g, slabMat);
  scene.add(slab);

  // a key light that follows the pointer: a soft glow on the brushed face, full on the bevel
  const key = new T.PointLight(0xf4f6ff, 1.1, 0, 0);
  key.position.set(-150, 140, 320);
  scene.add(key);

  // ── contact shadow and a faint cool bounce, on a plane behind the slab ──
  const SZ = -60;
  const sk = (CZ - SZ) / CZ;
  const shU = { uLift: { value: 0 }, uPress: { value: 0 }, uBoard: { value: new T.Vector2(W, H) } };
  const shadowGeo = new T.PlaneGeometry(W, H);
  const shadowMat = new T.ShaderMaterial({
    uniforms: shU,
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    vertexShader: `varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vP;uniform float uLift,uPress;uniform vec2 uBoard;
float sdPill(vec2 p,vec2 hb){float r=hb.y;p.x=abs(p.x)-(hb.x-r);return (p.x>0.?length(p):abs(p.y))-r;}
float soft(float d,float s){return 1.-smoothstep(-s,s*1.4,d);}
void main(){
 vec2 p=vP;
 float fade=smoothstep(0.,40.,min(uBoard.x*.5-abs(p.x),uBoard.y*.5-abs(p.y)));
 float lift=uLift*(1.-uPress);
 float c1=soft(sdPill(p-vec2(0.,-7.-2.*lift+3.*uPress),vec2(${HW}.-7.,${HH}.-5.)),7.+3.*lift-2.*uPress);
 float c2=soft(sdPill(p-vec2(0.,-22.-8.*lift+8.*uPress),vec2(${HW}.-26.,${HH}.-18.)),30.+10.*lift-8.*uPress);
 float a=1.-(1.-c1*.5*fade)*(1.-c2*.55*fade);
 float gl=soft(sdPill(p-vec2(0.,-30.),vec2(${HW}.-10.,${HH}.-20.)),44.)*fade*(.045+.045*uLift);
 gl_FragColor=vec4(vec3(.62,.66,.72)*gl,a);
}`,
  });
  const shadow = new T.Mesh(shadowGeo, shadowMat);
  shadow.position.z = SZ;
  shadow.scale.set(sk, sk, 1);
  shadow.renderOrder = -5;
  scene.add(shadow);

  // ── glints: small four-point stars on the brightest bevel highlights ──
  const glintGeo = new T.PlaneGeometry(1, 1);
  const glints = [];
  for (let i = 0; i < 3; i++) {
    const gu = { uI: { value: 0 }, uRot: { value: 0 } };
    const gm = new T.ShaderMaterial({
      uniforms: gu,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      premultipliedAlpha: true,
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 vUv;uniform float uI,uRot;
void main(){
 vec2 q=vUv*2.-1.;float c=cos(uRot),s=sin(uRot);q=mat2(c,-s,s,c)*q;
 vec2 fw=fwidth(q);float w0=.05,w=max(w0,max(fw.x,fw.y)*.9);
 float rx=exp(-q.y*q.y/(w*w))*pow(max(1.-abs(q.x),0.),2.6);
 float ry=exp(-q.x*q.x/(w*w))*pow(max(1.-abs(q.y),0.),2.6);
 float r2=dot(q,q),core=exp(-r2/.010),halo=exp(-r2/.07)*.28;
 float e=(rx+ry)*(w0/w)+core+halo;
 float a=clamp(e*uI,0.,1.);
 vec3 col=mix(vec3(.84,.9,1.),vec3(1.),clamp(core*1.4+.35*(rx+ry),0.,1.));
 gl_FragColor=vec4(col*a,a*.8);
}`,
    });
    const m = new T.Mesh(glintGeo, gm);
    m.renderOrder = 20;
    m.visible = false;
    scene.add(m);
    glints.push({ m, u: gu, t0: -9, dur: 1, c: null, size: 30, rot: 0, next: 0.4 + i * 1.1 });
  }
  const GLINT_SCALE = 1.3;

  // ── the pointer, hover and press, on this button alone ──
  const st = { x: W / 2, y: H / 2, inside: false, hover: false, hs: 0, press: false, ps: 0 };
  let dirty = true;
  const smooth = (cur, target, rate, dt) => (!motion || !dt ? target : cur + (target - cur) * (1 - Math.exp(-rate * dt)));
  function toDesign(e) {
    const r = board.getBoundingClientRect();
    if (!r.width) return;
    st.x = ((e.clientX - r.left) / r.width) * W;
    st.y = ((e.clientY - r.top) / r.height) * H;
  }
  const on = [];
  const listen = (el, ev, fn, opt) => {
    el.addEventListener(ev, fn, opt);
    on.push([el, ev, fn, opt]);
  };
  const keyboardFocus = () => document.activeElement === button && button.matches(':focus-visible');
  listen(window, 'pointermove', (e) => {
    toDesign(e);
    st.inside = true;
    dirty = true;
  }, { passive: true });
  listen(document.documentElement, 'pointerleave', () => {
    st.inside = false;
    st.press = false;
    dirty = true;
  });
  listen(button, 'pointerenter', (e) => {
    toDesign(e);
    st.inside = true;
    st.hover = true;
    dirty = true;
  });
  listen(button, 'pointerleave', () => {
    st.hover = keyboardFocus();
    st.press = false;
    dirty = true;
  });
  listen(button, 'focus', () => {
    if (keyboardFocus()) {
      st.hover = true;
      dirty = true;
    }
  });
  listen(button, 'blur', () => {
    st.hover = false;
    st.press = false;
    dirty = true;
  });
  listen(button, 'pointerdown', (e) => {
    if (button.disabled) return;
    toDesign(e);
    st.press = true;
    dirty = true;
    try {
      button.setPointerCapture(e.pointerId);
    } catch {}
  });
  const release = () => {
    st.press = false;
    dirty = true;
  };
  listen(button, 'pointerup', release);
  listen(button, 'pointercancel', release);
  listen(button, 'lostpointercapture', release);
  listen(button, 'keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && !button.disabled) {
      const r = button.getBoundingClientRect();
      const br = board.getBoundingClientRect();
      if (br.width) {
        st.x = ((r.left + r.width / 2 - br.left) / br.width) * W;
        st.y = ((r.top + r.height / 2 - br.top) / br.height) * H;
      }
      st.press = true;
      dirty = true;
    }
  });
  listen(button, 'keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') release();
  });
  listen(window, 'resize', () => (dirty = true));

  // the click: the metal catches the light, a quick studio flick and a burst of glints
  let clickT = -99;
  let time = 0;
  function flick() {
    clickT = time;
    for (const g of glints) g.next = time + Math.random() * 0.12;
    dirty = true;
  }

  // ── one frame ──
  const sp = { z: 0, v: 0 };
  const env = { yaw: 0, pitch: 0 };
  const kp = { x: -150, y: 140 };
  const tilt = { x: 0, y: 0 };
  const rotM = new T.Matrix4();
  const eul = new T.Euler();
  const tmpN = new T.Vector3();
  const tmpP = new T.Vector3();
  const tmpR = new T.Vector3();
  const camP = new T.Vector3(0, 0, CZ);
  let lastFace = '';

  function findGlint() {
    // how bright the studio is as reflected at each candidate, with the slab as it is now
    for (const c of slabGeo.cand) {
      tmpN.copy(c.n).applyQuaternion(slab.quaternion);
      tmpP.copy(c.p).applyMatrix4(slab.matrixWorld);
      c.wx = tmpP.x;
      c.wy = tmpP.y;
      const V = tmpP.sub(camP).normalize();
      const d = V.dot(tmpN);
      tmpR.copy(V).addScaledVector(tmpN, -2 * d).applyMatrix3(U.envRot.value);
      c.b = envJS(KIT, tmpR.x, tmpR.y, tmpR.z);
    }
    return slabGeo.cand;
  }

  function fit() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round((r.width || W * 0.4) * dpr));
    const h = Math.max(2, Math.round((r.height || H * 0.4) * dpr));
    if (canvas.width !== w || canvas.height !== h) renderer.setSize(w, h, false);
  }

  function frame(t, dt) {
    st.hs = smooth(st.hs, st.hover ? 1 : 0, 9, dt);
    st.ps = smooth(st.ps, st.press ? 1 : 0, 22, dt);
    fit();
    const mo = motion && dt > 0;
    const px = st.x - W / 2;
    const py = H / 2 - st.y;
    const hov = st.hs;
    const ins = st.inside ? 1 : 0;
    // press spring, with a little overshoot on release
    const pt = st.press ? 1 : 0;
    if (mo) {
      const k = 520;
      const c = 26;
      sp.v += ((pt - sp.z) * k - sp.v * c) * dt;
      sp.z += sp.v * dt;
    } else {
      sp.z = pt;
      sp.v = 0;
    }
    const pr = sp.z;
    // studio yaw: a slow drift, plus parallax toward the pointer while hovering
    const hx = Math.max(-1, Math.min(1, px / HW));
    const hy = Math.max(-1, Math.min(1, py / (HH * 1.6)));
    const yawT = motion ? (5 * Math.sin(t * 0.31) + 3 * Math.sin(t * 0.17 + 1)) * (1 - 0.5 * hov) + hov * ins * (-hx * 18 + 4 * Math.sin(t * 0.8)) : hov * ins * (-hx * 18);
    const pitT = hov * ins * (hy * 7);
    env.yaw = smooth(env.yaw, yawT, 3.2, dt);
    env.pitch = smooth(env.pitch, pitT, 3.2, dt);
    const ca = (t - clickT) / 0.14;
    const fl = motion && ca > 0 && ca < 12 ? -18 * ca * Math.exp(1 - ca) : 0;
    eul.set(env.pitch * D2R, (env.yaw + fl) * D2R, 0, 'YXZ');
    rotM.makeRotationFromEuler(eul);
    U.envRot.value.setFromMatrix4(rotM);
    // tilt toward the pointer (tiny), sink on press, lift on hover
    tilt.x = smooth(tilt.x, -hy * 2.2 * hov * ins, 6, dt);
    tilt.y = smooth(tilt.y, hx * 3.2 * hov * ins, 6, dt);
    const lift = hov * (1 - pr);
    slab.position.z = 4 * lift - 12 * pr;
    const sc = 1 - 0.014 * pr;
    slab.scale.set(sc, sc, 1);
    slab.rotation.set(tilt.x * D2R, tilt.y * D2R, 0);
    slab.updateMatrixWorld();
    U.dim.value = 1 - 0.2 * pr;
    renderer.toneMappingExposure = EXPOSURE * (1 + 0.05 * hov * (1 - pr));
    // the key light follows the pointer
    const kx = hov * ins ? px * 1.25 : -150;
    const ky = hov * ins ? py * 1.1 + 60 : 140;
    kp.x = smooth(kp.x, kx, 5, dt);
    kp.y = smooth(kp.y, ky, 5, dt);
    key.position.set(kp.x, kp.y, 320);
    key.intensity = 0.5 * (1 + 0.4 * hov) * (1 - 0.35 * pr);
    shU.uLift.value = hov;
    shU.uPress.value = pr;
    // keep the HTML label glued to the slab's face
    const zf = slab.position.z;
    const tr = `perspective(${CZ.toFixed(1)}px) translateZ(${zf.toFixed(2)}px) rotateX(${(-tilt.x).toFixed(3)}deg) rotateY(${tilt.y.toFixed(3)}deg) scale(${sc.toFixed(4)})`;
    if (tr !== lastFace) {
      face.style.transform = tr;
      lastFace = tr;
    }
    // glints
    const cands = findGlint();
    const near = hov * ins;
    if (motion) {
      for (const g of glints) {
        if (g.c && t - g.t0 >= g.dur) g.c = null;
        if (!g.c) {
          g.m.visible = false;
          // spawn on a bright bevel point, well apart from the others; on hover they gather by the pointer
          if (t >= g.next && glints.filter((o) => o.c).length < (near > 0.5 || t - clickT < 0.6 ? 3 : 2)) {
            let best = null;
            let bs = 0;
            for (const c of cands) {
              if (c.b < 1.1 || !glints.every((o) => !o.c || Math.hypot(o.c.wx - c.wx, o.c.wy - c.wy) > 150)) continue;
              const s = c.b * (near > 0.5 ? 0.2 + Math.exp(-Math.pow((c.wx - px) / 110, 2)) : 1) * (0.5 + Math.random());
              if (s > bs) {
                bs = s;
                best = c;
              }
            }
            if (best) {
              g.c = best;
              g.t0 = t;
              g.dur = rnd(0.75, 1.15);
              g.size = rnd(26, 36);
              g.rot = rnd(-0.1, 0.1);
            }
            g.next = t + (near > 0.5 ? rnd(0.25, 0.7) : rnd(1.1, 2.6));
          }
          if (!g.c) continue;
        }
        const life = (t - g.t0) / g.dur;
        const e = Math.sin(Math.PI * Math.min(1, life));
        const ii = e * e * Math.min(1, g.c.b / 2.2);
        tmpP.copy(g.c.p).applyMatrix4(slab.matrixWorld);
        g.m.position.set(tmpP.x, tmpP.y, tmpP.z + 2);
        const sz = g.size * (0.55 + 0.45 * e) * GLINT_SCALE;
        g.m.scale.set(sz, sz, 1);
        g.u.uI.value = ii * 1.2;
        g.u.uRot.value = g.rot + life * 0.25;
        g.m.visible = ii > 0.01;
      }
    } else {
      // still: two fixed glints on the brightest points
      const sorted = cands.slice().sort((a, b) => b.b - a.b);
      const picks = [];
      for (const c of sorted) {
        if (picks.length >= 2) break;
        if (picks.every((o) => o.p.distanceTo(c.p) > 160)) picks.push(c);
      }
      glints.forEach((g, i) => {
        const c = picks[i];
        g.m.visible = !!c;
        if (!c) return;
        tmpP.copy(c.p).applyMatrix4(slab.matrixWorld);
        g.m.position.set(tmpP.x, tmpP.y, tmpP.z + 2);
        const sz = (i ? 24 : 32) * GLINT_SCALE;
        g.m.scale.set(sz, sz, 1);
        g.u.uI.value = i ? 0.7 : 1;
        g.u.uRot.value = 0;
      });
    }
    renderer.render(scene, cam);
    if (Math.abs(sp.v) > 0.001 || Math.abs(sp.z - pt) > 0.001) dirty = true;
  }

  // ── the loop: its own clock, only while the button is on screen ──
  let raf = 0;
  let running = false;
  let last = 0;
  let lost = false;
  let disposed = false;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(Math.max((now - last) / 1000, 0), 0.05) : 0;
    last = now;
    const step = motion ? dt : 0;
    time += step;
    if (lost || (!motion && !dirty)) return;
    dirty = false;
    frame(time, step);
  }
  listen(canvas, 'webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
  });
  listen(canvas, 'webglcontextrestored', () => {
    envRT = bakeEnv();
    slabMat.envMap = envRT.texture;
    lost = false;
    dirty = true;
  });

  // first paint, so the button is there the moment it fades in
  frame(0, 0);

  return {
    start() {
      if (running || disposed) return;
      running = true;
      last = 0;
      dirty = true;
      raf = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    flick,
    // once the trailer plays the button is gone for good: free the GPU for the film and the hall
    dispose() {
      if (disposed) return;
      disposed = true;
      running = false;
      cancelAnimationFrame(raf);
      for (const [el, ev, fn, opt] of on) el.removeEventListener(ev, fn, opt);
      slabGeo.g.dispose();
      slabMat.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      glintGeo.dispose();
      for (const g of glints) g.m.material.dispose();
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
