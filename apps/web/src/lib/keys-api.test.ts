import { hashKey, KEYS_PER_IP_PER_DAY, MemoryAccessStore } from '@drippa/stackprobe-core';
import { describe, expect, test } from 'vitest';
import { clientIp, createKeyResponse, revokeKeyResponse } from './keys-api.ts';

const SECRET = 'test-secret';

function setup(at = '2026-10-12T22:00:00.000Z') {
  let now = new Date(at);
  const clock = () => now;
  const store = new MemoryAccessStore({ now: clock });
  return {
    store,
    deps: { store, now: clock },
    setTime: (iso: string) => {
      now = new Date(iso);
    },
  };
}

describe('POST /api/keys', () => {
  test('creates a key and returns it once, with its limits and how to use it', async () => {
    const { deps, store } = setup();
    const { status, body, headers } = await createKeyResponse('203.0.113.7', SECRET, deps);
    expect(status).toBe(201);
    expect(body).toMatchObject({
      key: expect.stringMatching(/^sp_/),
      prefix: (body.key as string).slice(0, 10),
      limits: { scansPerDay: 10 },
    });
    expect(headers['cache-control']).toBe('no-store');
    expect(await store.findKey(await hashKey(body.key as string))).not.toBeNull();
  });

  test(`a fourth key from one IP in a UTC day gets 429 with when to retry`, async () => {
    const { deps } = setup('2026-10-12T22:00:00.000Z');
    for (let i = 0; i < KEYS_PER_IP_PER_DAY; i++) {
      expect((await createKeyResponse('203.0.113.7', SECRET, deps)).status).toBe(201);
    }
    const { status, body, headers } = await createKeyResponse('203.0.113.7', SECRET, deps);
    expect(status).toBe(429);
    expect(body).toEqual({
      error: 'rate_limited',
      message:
        'At most 3 new keys a day from one address. Try again after 2026-10-13T00:00:00.000Z.',
      resetAt: '2026-10-13T00:00:00.000Z',
    });
    expect(headers['retry-after']).toBe('7200');
    expect((await createKeyResponse('203.0.113.8', SECRET, deps)).status).toBe(201);
  });
});

describe('DELETE /api/keys/current', () => {
  test('revokes the key it is called with, and the key stops working', async () => {
    const { deps } = setup();
    const created = await createKeyResponse('203.0.113.7', SECRET, deps);
    const key = created.body.key as string;
    const revoked = await revokeKeyResponse(`Bearer ${key}`, deps);
    expect(revoked).toMatchObject({ status: 200, body: { revoked: key.slice(0, 10) } });
    expect(JSON.stringify(revoked)).not.toContain(key);
    expect((await revokeKeyResponse(`Bearer ${key}`, deps)).status).toBe(401);
  });

  test('a missing, malformed or unknown key gets 401 and how to get one', async () => {
    const { deps } = setup();
    for (const header of [null, 'sp_nope', 'Bearer', 'Bearer sp_unknown', 'Basic abc']) {
      const { status, body, headers } = await revokeKeyResponse(header, deps);
      expect(status).toBe(401);
      expect(body.error).toBe('invalid_key');
      expect(headers['www-authenticate']).toBe('Bearer');
    }
  });

  test('each request made with a key is logged against it, without the key', async () => {
    const { deps, store } = setup();
    const created = await createKeyResponse('203.0.113.7', SECRET, deps);
    const record = await store.findKey(await hashKey(created.body.key as string));
    await revokeKeyResponse(`Bearer ${created.body.key}`, deps);
    // Logged, but not as a new scan: revoking spends nothing.
    expect(await store.countNewScans(`key:${record?.id}`, '2000-01-01T00:00:00.000Z')).toBe(0);
    expect(await store.pruneUsage('2100-01-01T00:00:00.000Z')).toBe(1);
  });
});

test('clientIp takes the first forwarded address, then x-real-ip', () => {
  expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
  expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
  expect(clientIp(new Headers())).toBe('unknown');
});
