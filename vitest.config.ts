import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'frontend/src'),
      '@tower/shared': path.resolve(__dirname, 'packages/shared/index.ts'),
    },
  },
  test: {
    globals: true,
    environmentMatchGlobs: [
      ['frontend/**/*.test.{ts,tsx}', 'jsdom'],
      ['backend/**/*.test.ts', 'node'],
    ],
    include: [
      'backend/**/*.test.ts',
      'frontend/**/*.test.{ts,tsx}',
      'packages/**/*.test.ts',
      '__tests__/**/*.test.ts',
    ],
  },
});
