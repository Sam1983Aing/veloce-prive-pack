// Bloom only on lights, then the film look: a little chromatic aberration at the edges, grain,
// vignette, and a dim control the page uses behind its text. Tone mapping happens in the film pass,
// not in an OutputPass, which this Vite setup would load as a second copy of three.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const FilmShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.045 },
    uVignette: { value: 0.25 },
    uCA: { value: 0.0005 },
    uDim: { value: 1 },
    uAspect: { value: 1.6 },
    uBlack: { value: 0.035 },
    uToe: { value: 1.32 },
    uSat: { value: 1.12 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVignette, uCA, uDim, uAspect, uBlack, uToe, uSat;
    varying vec2 vUv;
    float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0));
      vec2 off = c * uCA * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float v = smoothstep(1.1, 0.25, length(c * vec2(1.0, 0.85)) * 1.25);
      col *= mix(1.0 - uVignette, 1.0, v);
      // tone mapping and the sRGB transfer here (this pass renders to the screen), then grain in display space
      #ifdef TONE_MAPPING
      col = toneMapping(col);
      #endif
      col = linearToOutputTexel(vec4(col, 1.0)).rgb;
      // a print grade: AgX lifts the darks, a night film needs them down
      col = max(col - uBlack, 0.0) / (1.0 - uBlack);
      col = pow(col, vec3(uToe));
      float l0 = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(mix(vec3(l0), col, uSat), 0.0);
      // grain that sits mostly in the shadows and mids, like film
      float g = h(gl_FragCoord.xy + floor(fract(uTime * 0.37) * 4096.0)) - 0.5;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col += g * uGrain * (0.35 + 0.65 * (1.0 - lum));
      col *= uDim;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function createPost(renderer, scene, camera, { samples = 2 } = {}) {
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(size.x, size.y);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.45, 1.6);
  // the glow is soft anyway: run its blur chain at 80% of the frame
  const bloomSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => bloomSize(Math.round(w * 0.8), Math.round(h * 0.8));
  bloom.setSize(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio());
  composer.addPass(bloom);
  const film = new ShaderPass(FilmShader);
  composer.addPass(film);
  return {
    composer,
    bloom,
    film,
    render(time, dim = 1) {
      film.uniforms.uTime.value = time;
      film.uniforms.uDim.value = dim;
      composer.render();
    },
    resize(w, h) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      film.uniforms.uAspect.value = w / h;
    },
  };
}
