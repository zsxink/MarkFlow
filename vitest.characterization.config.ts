import { defineConfig } from 'vitest/config';

// Dedicated config for the P0 baseline characterization suite.
// The PM tail-newline-loss test EXPECTS to fail at the baseline — it is kept
// out of the default green suite (vitest.config.ts includes only src/**/*.test.ts)
// and runs only via `npm run test:characterization`.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/byte-contract/*.test.ts'],
  },
});
