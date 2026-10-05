import { isPrivateAddress } from '@drippa/stackprobe-core/node';
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

// capture.ts carries its own copy of the private ranges so it can run alone in a sandbox.
test('agrees with core on what is private', () => {
  for (const address of [
    '8.8.8.8',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.20.0.1',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '1.1.1.1',
    '::1',
    'fd00::1',
    'fe80::1',
    '2606:4700::1',
    '::ffff:10.0.0.1',
  ]) {
    const url = address.includes(':') ? `http://[${address}]/` : `http://${address}/`;
    expect(isPrivateTarget(url), address).toBe(isPrivateAddress(address));
  }
});
