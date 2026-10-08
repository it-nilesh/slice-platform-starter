import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so unit tests run without the federation plugin.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
