import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Longer timeout for MongoDB Memory Server startup
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/index.ts'],
    },
  },
});
