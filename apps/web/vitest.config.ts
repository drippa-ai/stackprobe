import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    setupFiles: ['../../packages/core/test/no-network.ts'],
  },
});
