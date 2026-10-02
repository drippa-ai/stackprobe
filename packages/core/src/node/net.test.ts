import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { isPrivateAddress, NodeNet, USER_AGENT } from './net.ts';

const signal = new AbortController().signal;

describe('isPrivateAddress', () => {
  test.each([
    ['127.0.0.1', true],
    ['10.1.2.3', true],
    ['172.16.0.1', true],
    ['172.32.0.1', false],
    ['192.168.1.1', true],
    ['169.254.169.254', true],
    ['100.64.0.1', true],
    ['0.0.0.0', true],
    ['::1', true],
    ['::', true],
    ['fd00::1', true],
    ['fe80::1', true],
    ['::ffff:127.0.0.1', true],
    ['::ffff:76.76.21.21', false],
    ['76.76.21.21', false],
    ['2606:4700::1111', false],
    ['not an ip', true],
  ])('%s → %s', (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected);
  });
});

describe('NodeNet refuses private addresses', () => {
  const net = new NodeNet();

  test.each([
    'http://127.0.0.1/',
    'http://[::1]:8080/',
    'http://169.254.169.254/latest/meta-data/',
    'http://localhost/',
  ])('%s', async (url) => {
    await expect(net.http({ url, method: 'GET' }, signal)).rejects.toMatchObject({
      code: 'BLOCKED_PRIVATE_ADDRESS',
    });
  });

  test('other schemes', async () => {
    await expect(
      net.http({ url: 'file:///etc/passwd', method: 'GET' }, signal),
    ).rejects.toMatchObject({
      code: 'HTTP_STATUS',
    });
  });
});

describe('NodeNet against a local server', () => {
  let server: Server;
  let base: string;
  const net = new NodeNet({ allowPrivateAddresses: true });

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === '/gzip') {
        res.writeHead(200, { 'content-encoding': 'gzip', 'content-type': 'text/html' });
        res.end(gzipSync('<p>compressed</p>'));
      } else if (req.url === '/huge') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('x'.repeat(3_000_000));
      } else if (req.url === '/redirect') {
        res.writeHead(302, { location: '/gzip' });
        res.end();
      } else {
        res.setHeader('set-cookie', ['a=1', 'b=2']);
        res.writeHead(200, { 'x-user-agent': req.headers['user-agent'] ?? '' });
        res.end('ok');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  test('sends an honest user agent and keeps repeated headers', async () => {
    const res = await net.http({ url: `${base}/`, method: 'GET' }, signal);
    expect(res.status).toBe(200);
    expect(res.headers).toContainEqual(['x-user-agent', USER_AGENT]);
    expect(res.headers.filter(([name]) => name === 'set-cookie')).toEqual([
      ['set-cookie', 'a=1'],
      ['set-cookie', 'b=2'],
    ]);
  });

  test('decompresses bodies', async () => {
    const res = await net.http({ url: `${base}/gzip`, method: 'GET' }, signal);
    expect(res.body).toBe('<p>compressed</p>');
  });

  test('does not follow redirects itself', async () => {
    const res = await net.http({ url: `${base}/redirect`, method: 'GET' }, signal);
    expect(res.status).toBe(302);
    expect(res.headers).toContainEqual(['location', '/gzip']);
  });

  test('stops reading very large bodies', async () => {
    const res = await net.http({ url: `${base}/huge`, method: 'GET' }, signal);
    expect(res.body.length).toBeGreaterThanOrEqual(2_000_000);
    expect(res.body.length).toBeLessThan(3_000_000);
  });

  test('reports a refused connection', async () => {
    await expect(
      net.http({ url: 'http://127.0.0.1:1/', method: 'GET' }, signal),
    ).rejects.toMatchObject({
      code: 'CONNECT_FAILED',
    });
  });

  test('stops when aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      net.http({ url: `${base}/`, method: 'GET' }, controller.signal),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
