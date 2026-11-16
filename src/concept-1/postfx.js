import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Concept 1 V5 post: a soft bloom on the hottest highlights, AgX, then a light vignette and fine grain in
// sRGB so the background stays exactly --ink (#0A0A09). Adapted from V2.
export function createPostFX(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const pixelRatio = renderer.getPixelRatio();

  const renderTarget = new THREE.WebGLRenderTarget(
    size.x * pixelRatio,
    size.y * pixelRatio,
    {
      type: THREE.HalfFloatType,
      samples: 4,
    }
  );

  const composer = new EffectComposer(renderer, renderTarget);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // V5: on all the time, as on C2 V3 (0.3, radius 0.5, threshold 2.6), so only the hottest highlights
  // on the clear coat and the chrome glow a little, the way a lens takes them. The lamps raise it.
  // Radius 0.2, not C2's 0.5: in this darker room a wide bloom round the ceiling tubes greyed the black.
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.0, 0.2, 2.6);
  bloomPass.enabled = false;
  composer.addPass(bloomPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // After OutputPass, in sRGB, so the grain does not lift --ink into grey
  const filmPass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uVignette: { value: 0.22 },
      uGrain: { value: 0.03 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uVignette;
      uniform float uGrain;
      varying vec2 vUv;

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      void main() {
        vec3 ink = vec3(10.0 / 255.0, 10.0 / 255.0, 9.0 / 255.0);
        vec3 rawCol = texture2D(tDiffuse, vUv).rgb;

        vec2 d = vUv - 0.5;
        float vig = 1.0 - dot(d, d) * uVignette;
        vec3 vigCol = rawCol * vig;

        float contentMask = smoothstep(0.02, 0.08, dot(rawCol, vec3(0.299, 0.587, 0.114)));
        vec3 col = ink + vigCol * (1.0 - ink);

        float noise = (hash12(gl_FragCoord.xy + fract(uTime * 17.3) * 100.0) - 0.5) * uGrain;
        col += noise * contentMask;

        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }
    `,
  });
  composer.addPass(filmPass);

  return {
    composer,
    bloomPass,
    filmPass,
    resize(width, height) {
      composer.setSize(width, height);
    },
    update(elapsedTime, bloomStrength = 0.0, threshold = 2.6) {
      filmPass.uniforms.uTime.value = elapsedTime;
      bloomPass.threshold = threshold;
      if (bloomStrength > 0.005) {
        bloomPass.enabled = true;
        bloomPass.strength = bloomStrength;
      } else {
        bloomPass.enabled = false;
        bloomPass.strength = 0.0;
      }
    },
  };
}
