// Cold-start vapour: on a wet night the exhausts breathe white, lit red by the tail lights.
// Camera-facing puffs on an InstancedMesh, simulated on the CPU (a few hundred at most).
import * as THREE from 'three';

const N = 360;

export class Vapour {
  constructor(tips, puffTex) {
    this.tips = tips;
    this.p = Array.from({ length: N }, () => ({ alive: false, t: 0, life: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), s0: 0.1, s1: 1, rot: 0 }));
    this.acc = 0;
    this.cursor = 0;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    this.offset = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.data = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage); // size, alpha, rotation, redness
    geo.setAttribute('aOffset', this.offset);
    geo.setAttribute('aData', this.data);
    geo.instanceCount = N;
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { tPuff: { value: puffTex }, uTail: { value: 0 }, uAmb: { value: new THREE.Color().setRGB(0.2, 0.17, 0.13) } },
      vertexShader: /* glsl */ `
        attribute vec3 aOffset; attribute vec4 aData;
        varying vec2 vUv; varying float vA; varying float vRed;
        void main() {
          vUv = uv; vA = aData.y; vRed = aData.w;
          float c = cos(aData.z), s = sin(aData.z);
          vec2 q = mat2(c, -s, s, c) * position.xy * aData.x;
          vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
          mv.xy += q;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tPuff; uniform float uTail; uniform vec3 uAmb;
        varying vec2 vUv; varying float vA; varying float vRed;
        void main() {
          float a = texture2D(tPuff, vUv).a * vA;
          if (a < 0.002) discard;
          vec3 col = uAmb + vec3(0.7, 0.045, 0.03) * vRed * uTail;
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  update(dt, time, rate, tail) {
    this.material.uniforms.uTail.value = tail;
    if (rate > 0.001) {
      // a breath that follows the idle: slightly pulsed emission
      this.acc += dt * rate * (120 + 30 * Math.sin(time * 7.0));
      while (this.acc > 1) {
        this.acc -= 1;
        const p = this.p[this.cursor];
        this.cursor = (this.cursor + 1) % N;
        const tip = this.tips[Math.floor(Math.random() * this.tips.length)];
        p.alive = true;
        p.t = 0;
        p.life = 1.8 + Math.random() * 1.0;
        p.pos.copy(tip).add(new THREE.Vector3((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.04, -0.04));
        p.vel.set((Math.random() - 0.5) * 0.16, 0.06 + Math.random() * 0.12, -1.0 - Math.random() * 0.5);
        p.s0 = 0.04 + Math.random() * 0.04;
        p.s1 = 0.35 + Math.random() * 0.4;
        p.rot = Math.random() * Math.PI * 2;
      }
    }
    const O = this.offset.array, D = this.data.array;
    for (let i = 0; i < N; i++) {
      const p = this.p[i];
      if (p.alive) {
        p.t += dt;
        if (p.t > p.life) p.alive = false;
      }
      if (!p.alive) { D[i * 4 + 1] = 0; continue; }
      const k = p.t / p.life;
      // the jet slows quickly, then the vapour drifts up and back on the night air
      const drag = Math.exp(-p.t * 2.2);
      p.pos.x += p.vel.x * dt * drag + Math.sin(time * 0.7 + i) * 0.02 * dt;
      p.pos.y += (p.vel.y * drag + 0.1) * dt;
      p.pos.z += p.vel.z * dt * drag - 0.05 * dt;
      O[i * 3] = p.pos.x; O[i * 3 + 1] = p.pos.y; O[i * 3 + 2] = p.pos.z;
      const size = p.s0 + (p.s1 - p.s0) * (1 - Math.pow(1 - k, 2.2));
      const alpha = Math.min(1, k * 14) * Math.pow(1 - k, 1.6) * 0.62;
      // red where it is still close to the tail lights
      const red = Math.exp(-Math.max(0, -p.pos.z - 2.1) * 0.9) * Math.exp(-Math.max(0, p.pos.y - 0.7) * 1.0);
      D[i * 4] = size; D[i * 4 + 1] = alpha; D[i * 4 + 2] = p.rot + p.t * 0.25; D[i * 4 + 3] = red;
    }
    this.offset.needsUpdate = true;
    this.data.needsUpdate = true;
  }

  clear() { this.p.forEach((p) => { p.alive = false; }); this.acc = 0; }
}
