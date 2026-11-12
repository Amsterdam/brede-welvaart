import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const sharedTypesSrc = fileURLToPath(new URL('../shared/types/src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@shared\/types$/, replacement: `${sharedTypesSrc}/index.ts` },
      { find: /^@shared\/types\/(.*)$/, replacement: `${sharedTypesSrc}/$1` },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    setupFiles: ['./src/__tests__/setup.ts'],
    // Test files share one MongoDB database and wipe it in beforeEach.
    fileParallelism: false,
  },
});
