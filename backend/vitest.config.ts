import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests share one MongoDB; parallel suites would race on
    // collection drops. Each file gets an isolated database name instead.
    pool: 'forks',
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
