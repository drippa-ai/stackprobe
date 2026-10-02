import { expect, test } from 'vitest';
import { surfaceTarget } from './surface.ts';

test.each([
  ['example.com', 'https://example.com/', 'example.com'],
  ['  Example.com  ', 'https://example.com/', 'example.com'],
  ['http://app.example.com/login#top', 'http://app.example.com/login', 'app.example.com'],
  ['https://example.com/path?q=1', 'https://example.com/path?q=1', 'example.com'],
])('%s', (input, url, host) => {
  expect(surfaceTarget(input)).toEqual({ id: 'root', url, host, kind: 'unclassified' });
});

test.each(['', 'not a domain', 'intranet'])('rejects %j', (input) => {
  expect(() => surfaceTarget(input)).toThrow();
});
