import * as THREE from 'three';

// The polished stone floor's reflection: the scene rendered from a camera mirrored in y = 0,
// at half resolution, then blurred twice. The floor shader mixes the sharp and blurred images
// by the stone's roughness and by Fresnel. Same maths as three's Reflector, but the texture is
// shared with a material that also takes the painted light.

const BLUR_SHADER = {
  uniforms: {
    tInput: { value: null },
    uDir: { value: new THREE.Vector2(1, 0) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tInput;
    uniform vec2 uDir;
    varying vec2 vUv;
    void main() {
      // 9-tap gaussian folded into 5 linear fetches
      vec3 c = texture2D(tInput, vUv).rgb * 0.2270270270;
      vec2 o1 = uDir * 1.3846153846;
      vec2 o2 = uDir * 3.2307692308;
      c += texture2D(tInput, vUv + o1).rgb * 0.3162162162;
      c += texture2D(tInput, vUv - o1).rgb * 0.3162162162;
      c += texture2D(tInput, vUv + o2).rgb * 0.0702702703;
      c += texture2D(tInput, vUv - o2).rgb * 0.0702702703;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

export class C2V3Mirror {
  constructor(renderer, uniforms) {
    this.renderer = renderer;
    this.uniforms = uniforms;
    const opts = { type: THREE.HalfFloatType, depthBuffer: true };
    this.rt = new THREE.WebGLRenderTarget(16, 16, { ...opts, samples: 4 });
    this.blurA = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: false });
    this.blurB = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: false });
    this.virtualCamera = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this.hidden = [];

    this.blurMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(BLUR_SHADER.uniforms),
      vertexShader: BLUR_SHADER.vertexShader,
      fragmentShader: BLUR_SHADER.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blurMat);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    uniforms.uMirror.value = this.rt.texture;
    uniforms.uMirrorBlur.value = this.blurB.texture;
    uniforms.uMirrorMatrix.value = this.textureMatrix;

    this._normal = new THREE.Vector3(0, 1, 0);
    this._planePoint = new THREE.Vector3(0, 0, 0);
    this._camPos = new THREE.Vector3();
    this._rot = new THREE.Matrix4();
    this._look = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._view = new THREE.Vector3();
    this._plane = new THREE.Plane();
    this._clip = new THREE.Vector4();
    this._q = new THREE.Vector4();
  }

  // three quarters of the screen's resolution: at half, the car's edges in the floor were drawn
  // twice their size and came out stepped (Sam, 5 Nov: "not pixelated")
  setSize(width, height) {
    const w = Math.max(16, Math.round(width * 0.75));
    const h = Math.max(16, Math.round(height * 0.75));
    this.rt.setSize(w, h);
    this.blurA.setSize(Math.round(w / 3), Math.round(h / 3));
    this.blurB.setSize(Math.round(w / 3), Math.round(h / 3));
  }

  // objects that sit on the floor and must not appear in their own reflection
  hide(...objects) {
    this.hidden.push(...objects);
  }

  update(scene, camera) {
    const renderer = this.renderer;
    const n = this._normal;
    this._camPos.setFromMatrixPosition(camera.matrixWorld);
    this._view.subVectors(this._planePoint, this._camPos);
    if (this._view.dot(n) > 0) return;
    this._view.reflect(n).negate().add(this._planePoint);

    this._rot.extractRotation(camera.matrixWorld);
    this._look.set(0, 0, -1).applyMatrix4(this._rot).add(this._camPos);
    this._target.subVectors(this._planePoint, this._look).reflect(n).negate().add(this._planePoint);

    const vc = this.virtualCamera;
    vc.position.copy(this._view);
    vc.up.set(0, 1, 0).applyMatrix4(this._rot).reflect(n);
    vc.lookAt(this._target);
    vc.far = camera.far;
    vc.near = camera.near;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(vc.projectionMatrix);
    this.textureMatrix.multiply(vc.matrixWorldInverse);

    // oblique near plane, so nothing below the floor leaks into the reflection
    this._plane.setFromNormalAndCoplanarPoint(n, this._planePoint);
    this._plane.applyMatrix4(vc.matrixWorldInverse);
    const clip = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = vc.projectionMatrix;
    const q = this._q;
    q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    pm.elements[2] = clip.x;
    pm.elements[6] = clip.y;
    pm.elements[10] = clip.z + 1.0 - 0.003;
    pm.elements[14] = clip.w;

    const hiddenState = this.hidden.map((o) => o.visible);
    this.hidden.forEach((o) => (o.visible = false));
    this.onBefore?.();
    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.shadowMap.autoUpdate = prevShadow;
    this.onAfter?.();
    this.hidden.forEach((o, i) => (o.visible = hiddenState[i]));

    // two blur passes, horizontal then vertical, twice
    const bm = this.blurMat.uniforms;
    const w = this.blurA.width;
    const h = this.blurA.height;
    let src = this.rt.texture;
    for (let pass = 0; pass < 2; pass++) {
      const spread = pass === 0 ? 1.0 : 2.2;
      bm.tInput.value = src;
      bm.uDir.value.set(spread / w, 0);
      renderer.setRenderTarget(this.blurA);
      renderer.render(this.quadScene, this.quadCam);
      bm.tInput.value = this.blurA.texture;
      bm.uDir.value.set(0, spread / h);
      renderer.setRenderTarget(this.blurB);
      renderer.render(this.quadScene, this.quadCam);
      src = this.blurB.texture;
    }
    renderer.setRenderTarget(prevTarget);
  }
}
