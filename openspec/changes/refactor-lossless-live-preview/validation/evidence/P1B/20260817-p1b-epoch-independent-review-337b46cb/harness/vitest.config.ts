import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: [
      'openspec/changes/refactor-lossless-live-preview/validation/evidence/P1B/20260817-p1b-epoch-independent-review-337b46cb/harness/*.test.ts',
    ],
  },
});
