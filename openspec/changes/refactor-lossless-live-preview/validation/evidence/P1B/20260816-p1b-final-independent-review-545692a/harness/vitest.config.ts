import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'openspec/changes/refactor-lossless-live-preview/validation/evidence/P1B/20260816-p1b-final-independent-review-545692a/harness/**/*.test.ts',
    ],
  },
});
