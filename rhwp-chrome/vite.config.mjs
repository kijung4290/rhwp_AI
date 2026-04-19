import { defineConfig } from 'vite';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(__dirname, '..', 'rhwp-studio'),
  publicDir: false,
  resolve: {
    alias: {
      '@': resolve(__dirname, '..', 'rhwp-studio', 'src'),
      '@wasm': resolve(__dirname, '..', 'pkg'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        viewer: resolve(__dirname, '..', 'rhwp-studio', 'index.html'),
      },
    },
    assetsInlineLimit: 0,
  },
  server: {
    host: '0.0.0.0',
    port: 7701,
    fs: {
      allow: ['..'],
    },
  },
});
