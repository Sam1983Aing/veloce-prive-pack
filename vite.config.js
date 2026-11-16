import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// One Vite project for the whole pack: the home page, the three landing pages and the room films sheet.
// `base` is the GitHub Pages address of the repo. Rename the repo and you change it here.
export default defineConfig({
  base: '/veloce-prive-pack/',
  resolve: { dedupe: ['three'] },
  optimizeDeps: {
    include: ['three', 'gsap', 'lenis'],
    // the concept pages add a step to GLTFLoader (src/shared/noLogos.js), so it is served as one plain module
    exclude: ['three/addons/loaders/GLTFLoader.js', 'three/examples/jsm/loaders/GLTFLoader.js'],
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        home: resolve(__dirname, 'index.html'),
        gallery: resolve(__dirname, 'gallery/index.html'),
        concept1: resolve(__dirname, 'concept-1/index.html'),
        concept3: resolve(__dirname, 'concept-3/index.html'),
        films: resolve(__dirname, 'room-films/index.html'),
      },
    },
  },
});
