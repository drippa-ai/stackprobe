import { expect, test } from 'vitest';
import { isPrivateTarget } from './index.ts';

test.each([
  ['https://app.acme.test/', false],
  ['https://93.184.215.14/x', false],
  ['http://localhost:3000/', true],
  ['http://api.localhost/', true],
  ['http://127.0.0.1/', true],
  ['http://10.0.0.5/', true],
  ['http://[::1]/', true],
  ['http://169.254.169.254/latest/meta-data', true],
  ['not a url', true],
])('%s is private: %s', (url, expected) => {
  expect(isPrivateTarget(url)).toBe(expected);
});
