import * as THREE from 'three';

// ---------- the reflections in the paint ----------
// A small dark room of emissive panels, matching the showroom around each car: the laylight
// in the ceiling (a broad soft highlight along the paint), two dim walls of warm wash, a lit
// pool on the floor. Prefiltered once with PMREM and shared by every car.
export function buildShowroomEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x050404);

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(14, 4.8, 12),
    new THREE.MeshBasicMaterial({ color: 0x0b0908, side: THREE.BackSide })
  );
  box.position.y = 2.4;
  env.add(box);

  const panel = (w, h, color, strength, pos, rotX = 0, rotY = 0) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), side: THREE.DoubleSide })
    );
    m.position.copy(pos);
    m.rotation.set(rotX, rotY, 0);
    env.add(m);
    return m;
  };

  // the laylight over the car: one broad soft highlight along the paint
  panel(3.0, 6.0, 0xfff3e4, 3.2, new THREE.Vector3(0, 4.78, 0), Math.PI / 2);
  // washed walls, brightest near the top
  for (const side of [-1, 1]) {
    panel(11, 1.6, 0xffdcc0, 1.1, new THREE.Vector3(side * 6.95, 3.8, 0), 0, (side * Math.PI) / 2);
    panel(11, 2.2, 0xffd2b0, 0.35, new THREE.Vector3(side * 6.95, 2.0, 0), 0, (side * Math.PI) / 2);
  }
  for (const side of [-1, 1]) {
    panel(4.2, 1.4, 0xffdcc0, 0.9, new THREE.Vector3(-4.4, 3.8, side * 5.95), 0, side > 0 ? Math.PI : 0);
    panel(4.2, 1.4, 0xffdcc0, 0.9, new THREE.Vector3(4.4, 3.8, side * 5.95), 0, side > 0 ? Math.PI : 0);
  }
  // floor pool under the strips, and the warm line at the foot of the walls
  panel(3.6, 7.0, 0xfff0e0, 0.55, new THREE.Vector3(0, 0.01, 0), -Math.PI / 2);
  for (const side of [-1, 1]) panel(0.06, 12, 0xffd0a8, 3.0, new THREE.Vector3(side * 6.9, 0.03, 0), -Math.PI / 2);
  // A soft pale floor, brightest under the car, like the card a photographer lays under one, so the
  // sills, wheels and lower bumper no longer fall into shadow (Sam's pick of three, "Low bounce",
  // 5 Nov; the others are in Teach/c2-v3/demo/under/code). It is only in the reflections: the room
  // itself is unchanged.
  panel(12, 10, 0xfff0e0, 0.16, new THREE.Vector3(0, 0.012, 0), -Math.PI / 2);
  const card = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 64),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff3e6).multiplyScalar(0.3), side: THREE.DoubleSide })
  );
  card.rotation.x = -Math.PI / 2;
  card.position.y = 0.016;
  env.add(card);
  // PMREM looks out from the origin, which was the studio's floor: every reflection pointing down met
  // the floor edge-on and came back black. Drawn 0.45 m lower, the studio is seen from sill height.
  for (const o of env.children) o.position.y -= 0.45;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0, 0.1, 40);
  pmrem.dispose();
  env.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
  return rt.texture;
}

// ---------- baked contact shadow ----------
// Look up at the car from the floor with an orthographic camera, draw every surface in black
// with an alpha that fades with height, keep the lowest one, then blur. The result is a soft
// shadow the exact shape of that car and its tyres. Static cars, so it's done once.
const SHADOW_VERT = /* glsl */ `
  varying float vHeight;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vHeight = wp.y;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const SHADOW_FRAG = /* glsl */ `
  uniform float uMaxHeight;
  varying float vHeight;
  void main() {
    float t = clamp(vHeight / uMaxHeight, 0.0, 1.0);
    float a = pow(1.0 - t, 2.2);
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  }
`;
const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    float a = texture2D(tInput, vUv).a * 0.2270270270;
    vec2 o1 = uDir * 1.3846153846;
    vec2 o2 = uDir * 3.2307692308;
    a += texture2D(tInput, vUv + o1).a * 0.3162162162;
    a += texture2D(tInput, vUv - o1).a * 0.3162162162;
    a += texture2D(tInput, vUv + o2).a * 0.0702702703;
    a += texture2D(tInput, vUv - o2).a * 0.0702702703;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  }
`;

export function bakeContactShadow(renderer, carRoot, { size = 512, margin = 0.7, height = 0.9 } = {}) {
  carRoot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(carRoot);
  const halfX = (box.max.x - box.min.x) / 2 + margin;
  const halfZ = (box.max.z - box.min.z) / 2 + margin;
  const cx = (box.max.x + box.min.x) / 2;
  const cz = (box.max.z + box.min.z) / 2;

  const cam = new THREE.OrthographicCamera(-halfX, halfX, halfZ, -halfZ, 0, height);
  cam.position.set(cx, 0, cz);
  cam.up.set(0, 0, -1);
  cam.lookAt(cx, 1, cz);
  cam.updateMatrixWorld();

  const rtA = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
  const rtB = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false });
  const shadowMat = new THREE.ShaderMaterial({
    uniforms: { uMaxHeight: { value: height } },
    vertexShader: SHADOW_VERT,
    fragmentShader: SHADOW_FRAG,
    side: THREE.DoubleSide,
    transparent: false,
  });

  const scene = new THREE.Scene();
  const parent = carRoot.parent;
  const savedMatrix = carRoot.matrix.clone();
  scene.add(carRoot);
  scene.overrideMaterial = shadowMat;

  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(rtA);
  renderer.clear();
  renderer.render(scene, cam);

  scene.overrideMaterial = null;
  scene.remove(carRoot);
  if (parent) parent.add(carRoot);
  carRoot.matrix.copy(savedMatrix);

  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tInput: { value: null }, uDir: { value: new THREE.Vector2() } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: BLUR_FRAG,
    depthTest: false,
    depthWrite: false,
    transparent: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat);
  quad.frustumCulled = false;
  const qs = new THREE.Scene();
  qs.add(quad);
  const qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const spreads = [1, 2, 3.5, 5];
  for (const s of spreads) {
    blurMat.uniforms.tInput.value = rtA.texture;
    blurMat.uniforms.uDir.value.set(s / size, 0);
    renderer.setRenderTarget(rtB);
    renderer.render(qs, qc);
    blurMat.uniforms.tInput.value = rtB.texture;
    blurMat.uniforms.uDir.value.set(0, s / size);
    renderer.setRenderTarget(rtA);
    renderer.render(qs, qc);
  }
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  rtB.dispose();
  blurMat.dispose();
  shadowMat.dispose();
  quad.geometry.dispose();

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(halfX * 2, halfZ * 2),
    new THREE.MeshBasicMaterial({
      map: rtA.texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.94,
      color: 0x000000,
    })
  );
  // the texture was drawn looking up, so the plane is flipped to match from above
  plane.rotation.x = -Math.PI / 2;
  plane.scale.x = -1;
  plane.position.set(cx, 0.004, cz);
  plane.renderOrder = 2;
  plane.name = 'contact-shadow';
  return plane;
}

// ---------- final pass: tone mapping, vignette, grain ----------
export function makeFinalMaterial() {
  return new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: {
      tDiffuse: { value: null },
      toneMappingExposure: { value: 1.0 },
      uTime: { value: 0 },
      uVignette: { value: 0.12 },
      uGrain: { value: 0.035 },
      uFade: { value: 1.0 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      #include <tonemapping_pars_fragment>
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uVignette;
      uniform float uGrain;
      uniform float uFade;
      varying vec2 vUv;
      float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        c.rgb *= toneMappingExposure;
        c.rgb = AgXToneMapping(c.rgb);
        c = sRGBTransferOETF(c);
        vec2 q = vUv - 0.5;
        float v = 1.0 - uVignette * smoothstep(0.15, 0.85, dot(q, q) * 2.2);
        c.rgb *= v;
        float g = rnd(vUv * 1024.0 + fract(uTime) * 61.0) - 0.5;
        c.rgb += g * uGrain;
        c.rgb *= uFade;
        gl_FragColor = vec4(c.rgb, 1.0);
      }
    `,
  });
}
