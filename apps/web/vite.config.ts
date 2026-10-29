import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const serverPort = Number(process.env.SERVER_PORT ?? 3000);

export default defineConfig({
  root: r('./'),
  publicDir: r('./public'),
  resolve: {
    alias: {
      '@kc/shared': r('../../packages/shared/src/index.ts'),
      '@kc/game-logic': r('../../packages/game-logic/src/index.ts'),
    },
  },
  server: {
    host: true, // reachable from phones on the LAN
    port: 5173,
    proxy: {
      '/ws': { target: `ws://localhost:${serverPort}`, ws: true },
      '/api': { target: `http://localhost:${serverPort}` },
    },
  },
  preview: { host: true, port: 4173 },
  build: {
    outDir: r('./dist'),
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { host: r('./index.html'), controller: r('./controller.html') },
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
