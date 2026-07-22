import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Coverage instrumentation slows the property-based suites (numRuns up to
    // 200), which can drift past the default 5s per-test window on a loaded CI
    // runner and flake. Give every test headroom instead of sprinkling per-test
    // overrides. (The 70s full-game simulation keeps its own explicit timeout.)
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
});
