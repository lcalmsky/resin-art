import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        ocean: resolve(import.meta.dirname, 'examples/ocean-slab/index.html'),
        rose: resolve(import.meta.dirname, 'examples/rose-cube/index.html'),
        seashore: resolve(import.meta.dirname, 'examples/seashore/index.html'),
        coaster: resolve(import.meta.dirname, 'examples/flower-coaster/index.html'),
      },
    },
  },
});
