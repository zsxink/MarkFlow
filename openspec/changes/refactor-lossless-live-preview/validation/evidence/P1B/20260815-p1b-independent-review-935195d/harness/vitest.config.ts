import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'openspec/changes/refactor-lossless-live-preview/validation/evidence/P1B/20260815-p1b-independent-review-935195d/harness/**/*.test.ts',
    ],
  },
});
