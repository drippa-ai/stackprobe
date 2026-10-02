import { expect, test } from 'vitest';
import { VERSION } from './index.ts';

test('exports a version', () => {
  expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
});
