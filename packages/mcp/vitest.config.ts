import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    setupFiles: ['../core/test/no-network.ts'],
  },
});
