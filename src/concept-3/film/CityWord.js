// The city each car is kept in, set in Archivo Expanded capitals inside the scene: a lit plane standing behind
// the car, so the car crosses in front of the word and the wet ground reflects it.
import * as THREE from 'three';

export class CityWord {
  constructor(scene) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 2048;
    this.canvas.height = 512;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    // the letters write depth (the gaps between them don't), so distant lights behind a word stay behind it
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, alphaTest: 0.35, depthWrite: true, color: new THREE.Color(0, 0, 0), fog: true });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.25), this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
    this.word = '';
  }

  set(word) {
    if (word === this.word) return;
    this.word = word;
    const g = this.canvas.getContext('2d');
    g.clearRect(0, 0, 2048, 512);
    g.fillStyle = '#EEE9E0';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    // capitals at full width, like the badge on a boot lid; the size fits the word to the canvas
    const text = word.toUpperCase();
    // the width goes in the font string: setting ctx.font resets ctx.fontStretch to normal
    let px = 340;
    for (;;) {
      g.font = `400 expanded ${px}px "Archivo", sans-serif`;
      if ('letterSpacing' in g) g.letterSpacing = `${Math.round(px * 0.08)}px`;
      if (g.measureText(text).width <= 1900 || px <= 120) break;
      px -= 10;
    }
    g.fillText(text, 1024 + Math.round(px * 0.04), 400);
    this.tex.needsUpdate = true;
  }

  // Stand the word behind the car, square to the camera, its baseline just above the ground.
  place(camera, { distance = 11, width = 17, lift = 0.15, brightness = 0.5 } = {}) {
    const dir = new THREE.Vector3(0, 0, 0).sub(camera.position).setY(0).normalize();
    const c = dir.clone().multiplyScalar(distance);
    const h = width * 0.25;
    this.mesh.scale.set(width, width, 1);
    // the canvas baseline sits at 400/512 of the height
    this.mesh.position.set(c.x, lift + h * (400 / 512 - 0.5), c.z);
    this.mesh.lookAt(camera.position.x, this.mesh.position.y, camera.position.z);
    this.mat.color.setScalar(brightness);
  }

  // Stand the word at a fixed spot in the world, square to a given point.
  placeAt(x, z, baseline, width, face, brightness = 0.7) {
    const h = width * 0.25;
    this.mesh.scale.set(width, width, 1);
    this.mesh.position.set(x, baseline + h * (400 / 512 - 0.5), z);
    this.mesh.lookAt(face.x, this.mesh.position.y, face.z);
    this.mat.color.setScalar(brightness);
  }

  show(v) { this.mesh.visible = v; }

  // how much of the word is there, 0 to 1
  fade(k) { this.mat.opacity = k; this.mesh.visible = k > 0.01; }
}
