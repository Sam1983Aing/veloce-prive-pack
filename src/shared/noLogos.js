// Every model the concept pages load passes through here first: the red spider's chrome mesh has its
// tail and nose emblems cut out (the same code the gallery page uses, ../gallery/stripEndLogos.js).
// The other cars' badges are already taken out of the .glb files in public/concepts/models.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { stripEndLogos } from '../gallery/stripEndLogos.js';

const parse = GLTFLoader.prototype.parse;
GLTFLoader.prototype.parse = function (data, path, onLoad, onError) {
  return parse.call(this, data, path, (gltf) => {
    gltf.scene.traverse((o) => {
      if (o.isMesh && o.name === 'chrome' && o.geometry) stripEndLogos(o.geometry);
    });
    onLoad(gltf);
  }, onError);
};
