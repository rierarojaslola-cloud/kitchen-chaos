import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@kc/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
      '@kc/game-logic': fileURLToPath(new URL('./packages/game-logic/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 20000,
  },
});
