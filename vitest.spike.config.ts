import { defineConfig } from 'vitest/config';

// Dedicated config for the P4A parser-spike harness (task 6.1).
//
// The spike MUST NOT run under the default `npm test` gate — this config is
// only referenced explicitly:
//   npx vitest run --config vitest.spike.config.ts
// The default vitest.config.ts includes only `src/**/*.test.ts`, and this
// config includes only `spike/**/*.test.ts`, so the two suites are disjoint.
// No coverage thresholds, node environment (no DOM needed — @codemirror/view
// is only imported for its parser wrapper and guards SSR).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['spike/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
