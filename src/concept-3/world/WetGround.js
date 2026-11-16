// Wet asphalt in two layers. A dark lit base (the sodium pools, the headlight spill) and a
// Reflector skin 2 mm above it, added on top: the mirrored scene, wobbled by the aggregate,
// smeared downward by roughness (wet asphalt stretches lights into streaks), weighted by fresnel
// and by the wet map, and faded by the same fog as the scene.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { bakeWetMap, bakeAsphalt, bakeMarkings } from './bake.js';

const WET_SPAN = 160;

const ReflectShader = {
  name: 'WetReflection',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    tWet: { value: null },
    tNormal: { value: null },
    uFogDensity: { value: 0.0065 },
    uStrength: { value: 1.0 },
    uRip: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -99, 0)) },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tWet;
    uniform sampler2D tNormal;
    uniform float uFogDensity;
    uniform float uStrength;
    uniform vec4 uRip[6];
    uniform float uTime;
    varying vec4 vUv;
    varying vec3 vWorld;
    void main() {
      vec2 wuv = vWorld.xz / ${WET_SPAN.toFixed(1)} + 0.5;
      float inside = step(0.0, wuv.x) * step(wuv.x, 1.0) * step(0.0, wuv.y) * step(wuv.y, 1.0);
      float wet = mix(0.22, texture2D(tWet, clamp(wuv, 0.0, 1.0)).r, inside);
      vec3 n = texture2D(tNormal, vWorld.xz * 0.42).xyz * 2.0 - 1.0;
      vec3 n2 = texture2D(tNormal, vWorld.xz * 0.09 + 0.37).xyz * 2.0 - 1.0;
      float rough = mix(0.5, 0.02, wet);
      vec2 uv = vUv.xy / vUv.w;
      uv += (n.xy * 0.004 + n2.xy * 0.004) * (0.25 + rough * 1.2);
      // rings from the pointer, travelling out and fading
      vec2 rip = vec2(0.0);
      for (int i = 0; i < 6; i++) {
        vec4 r = uRip[i];
        float age = uTime - r.z;
        if (age < 0.0 || age > 2.6) continue;
        vec2 dv = vWorld.xz - r.xy;
        float d = length(dv) + 1e-4;
        // rings sized for the distance they are seen from, so they read at 20 m
        float front = age * 2.4;
        float w = exp(-pow((d - front) * 1.3, 2.0)) * exp(-age * 1.2) * r.w;
        rip += (dv / d) * sin((d - front) * 6.5) * w;
      }
      uv += rip * 0.022 * (0.4 + 0.6 * wet);
      // a downward smear that grows with roughness: the streaks of lights on wet asphalt
      vec3 acc = vec3(0.0);
      float wsum = 0.0;
      for (int i = -6; i <= 6; i++) {
        float t = float(i) / 6.0;
        float w = exp(-t * t * 2.2);
        float rb = max(rough, 0.05);
        vec2 o = vec2(t * rb * 0.012, (t - 0.25) * rb * 0.085);
        acc += texture2D(tDiffuse, uv + o).rgb * w;
        wsum += w;
      }
      vec3 refl = min(acc / wsum, vec3(2.2));
      vec3 V = normalize(cameraPosition - vWorld);
      float cosT = clamp(V.y, 0.0, 1.0);
      float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
      float k = fres * mix(0.06, 1.0, wet * wet) * uStrength;
      float d = length(cameraPosition - vWorld);
      float fog = exp(-uFogDensity * uFogDensity * d * d);
      gl_FragColor = vec4(refl * k * fog, 1.0);
    }`,
};

export function buildWetGround(scene, { reflectScale = 0.4 } = {}) {
  const wet = bakeWetMap(512);
  const asphalt = bakeAsphalt(512);
  const marks = bakeMarkings(2048);

  // Base: dark asphalt, roughness from the wet map (wet is glossier and darker). Its own specular is
  // turned well down: the floodlights reach the eye through the reflection skin, not as a broad glare.
  const baseGeo = new THREE.PlaneGeometry(900, 900, 1, 1);
  baseGeo.rotateX(-Math.PI / 2);
  const base = new THREE.MeshPhysicalMaterial({
    specularIntensity: 0.18,
    color: new THREE.Color().setRGB(0.015, 0.0155, 0.017),
    map: asphalt.albedo,
    normalMap: asphalt.normal,
    normalScale: new THREE.Vector2(0.18, 0.18),
    roughness: 0.82,
    metalness: 0.0,
    envMapIntensity: 0.25,
  });
  base.onBeforeCompile = (sh) => {
    sh.uniforms.tWet = { value: wet };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldG;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldG = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tWet;\nvarying vec3 vWorldG;\nfloat wetAt(){ vec2 u = vWorldG.xz / 160.0 + 0.5; float ins = step(0.0,u.x)*step(u.x,1.0)*step(0.0,u.y)*step(u.y,1.0); return mix(0.22, texture2D(tWet, clamp(u,0.0,1.0)).r, ins); }')
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat gWet = wetAt();\nfloat gPatch = texture2D(tWet, clamp(vWorldG.xz / 160.0 + 0.5, 0.0, 1.0)).g;\ndiffuseColor.rgb *= mix(1.0, 0.32, gWet) * mix(0.6, 1.25, gPatch);')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(roughness, 0.42, gWet);')
      // standing water fills the aggregate, so wet patches lose most of the grain
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, nonPerturbedNormal, gWet * 0.85));');
  };
  // the albedo and normal tile every 2.4 m
  asphalt.albedo.repeat.set(900 / 2.4, 900 / 2.4);
  asphalt.normal.repeat.set(900 / 2.4, 900 / 2.4);
  const baseMesh = new THREE.Mesh(baseGeo, base);
  baseMesh.receiveShadow = true;
  baseMesh.name = 'asphalt';
  scene.add(baseMesh);

  // Paint, on its own plane just above the asphalt.
  const markGeo = new THREE.PlaneGeometry(40, 40);
  markGeo.rotateX(-Math.PI / 2);
  const markMat = new THREE.MeshStandardMaterial({
    map: marks,
    transparent: true,
    roughness: 0.6,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    color: new THREE.Color(0.55, 0.55, 0.55),
  });
  const markMesh = new THREE.Mesh(markGeo, markMat);
  markMesh.position.y = 0.002;
  markMesh.receiveShadow = true;
  scene.add(markMesh);

  // The reflection skin.
  const w = Math.round(window.innerWidth * Math.min(window.devicePixelRatio, 1.75) * reflectScale);
  const h = Math.round(window.innerHeight * Math.min(window.devicePixelRatio, 1.75) * reflectScale);
  const skinGeo = new THREE.PlaneGeometry(900, 900);
  const skin = new Reflector(skinGeo, {
    textureWidth: w,
    textureHeight: h,
    clipBias: 0.002,
    multisample: 2,
    shader: ReflectShader,
  });
  skin.rotateX(-Math.PI / 2);
  skin.position.y = 0.004;
  skin.material.uniforms.tWet.value = wet;
  skin.material.uniforms.tNormal.value = asphalt.normal;
  skin.material.transparent = true;
  skin.material.blending = THREE.AdditiveBlending;
  skin.material.depthWrite = false;
  skin.renderOrder = 2;
  skin.name = 'wet-skin';
  scene.add(skin);
  let ripCursor = 0;

  return {
    base: baseMesh,
    marks: markMesh,
    skin,
    wet,
    setFog(d) { skin.material.uniforms.uFogDensity.value = d; },
    ripple(x, z, k) {
      const r = skin.material.uniforms.uRip.value;
      ripCursor = (ripCursor + 1) % r.length;
      r[ripCursor].set(x, z, skin.material.uniforms.uTime.value, k);
    },
    tick(t) { skin.material.uniforms.uTime.value = t; },
    setStrength(s) { skin.material.uniforms.uStrength.value = s; },
    resize(width, height, pr) {
      const dpr = pr || Math.min(window.devicePixelRatio, 1.75);
      skin.getRenderTarget().setSize(Math.round(width * dpr * reflectScale), Math.round(height * dpr * reflectScale));
    },
  };
}
