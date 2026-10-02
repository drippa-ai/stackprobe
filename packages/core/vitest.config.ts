import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    setupFiles: ['./test/no-network.ts'],
  },
});
