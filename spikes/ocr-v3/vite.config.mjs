import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    outDir: resolve(process.cwd(), 'public/ocr-v3-vendor'),
    emptyOutDir: true,
    target: 'safari16.4',
    lib: {
      entry: resolve(process.cwd(), 'spikes/ocr-v3/vendor-entry.js'),
      formats: ['es'],
      fileName: () => 'paddleocr.js',
    },
  },
  worker: { format: 'es' },
});
