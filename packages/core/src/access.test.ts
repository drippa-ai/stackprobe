import { describe, expect, test } from 'vitest';
import { describeAccessStore } from '../test/access-contract.ts';
import {
  allowance,
  assertAllowance,
  createApiKey,
  dayWindow,
  findApiKey,
  hashIp,
  hashKey,
  KEY_SCANS_PER_DAY,
  KEYS_PER_IP_PER_DAY,
  keySubject,
  LimitError,
  MemoryAccessStore,
  visitorSubject,
} from './access.ts';

describeAccessStore('MemoryAccessStore', async () => new MemoryAccessStore());

// A clock the tests move by hand.
function clock(start: string) {
  let now = new Date(start);
  return {
    now: () => now,
    set: (iso: string) => {
      now = new Date(iso);
    },
  };
}

describe('API keys', () => {
  test('a new key is sp_ and 43 url-safe characters, stored only hashed', async () => {
    const store = new MemoryAccessStore();
    const { key, record } = await createApiKey('ip-1', { store });
    expect(key).toMatch(/^sp_[A-Za-z0-9_-]{43}$/);
    expect(record.prefix).toBe(key.slice(0, 10));
    expect(record.scansPerDay).toBe(KEY_SCANS_PER_DAY);
    expect(JSON.stringify(record)).not.toContain(key.slice(10));
    expect(await store.findKey(await hashKey(key))).toEqual(record);
  });

  test('a key is found by itself, and not once revoked', async () => {
    const store = new MemoryAccessStore();
    const { key, record } = await createApiKey('ip-1', { store });
    expect(await findApiKey(key, { store })).toEqual(record);
    expect(await findApiKey(`${key}x`, { store })).toBeNull();
    expect(await findApiKey('not-a-key', { store })).toBeNull();
    await store.revokeKey(record.id);
    expect(await findApiKey(key, { store })).toBeNull();
  });

  test(`at most ${KEYS_PER_IP_PER_DAY} keys a day from one IP; the next UTC day allows more`, async () => {
    const time = clock('2026-10-12T22:00:00.000Z');
    const store = new MemoryAccessStore({ now: time.now });
    const deps = { store, now: time.now };
    for (let i = 0; i < KEYS_PER_IP_PER_DAY; i++) await createApiKey('ip-1', deps);
    await expect(createApiKey('ip-1', deps)).rejects.toThrow(LimitError);
    await expect(createApiKey('ip-1', deps)).rejects.toMatchObject({
      resetAt: '2026-10-13T00:00:00.000Z',
    });
    await expect(createApiKey('ip-2', deps)).resolves.toBeDefined();
    time.set('2026-10-13T00:00:01.000Z');
    await expect(createApiKey('ip-1', deps)).resolves.toBeDefined();
  });

  test('making a key drops usage older than 30 days', async () => {
    const time = clock('2026-09-01T12:00:00.000Z');
    const store = new MemoryAccessStore({ now: time.now });
    await store.recordUsage({ subject: 'key:old', endpoint: 'x', newScan: true });
    time.set('2026-10-12T12:00:00.000Z');
    await store.recordUsage({ subject: 'key:new', endpoint: 'x', newScan: true });
    await createApiKey('ip-1', { store, now: time.now });
    expect(await store.countNewScans('key:old', '2000-01-01T00:00:00.000Z')).toBe(0);
    expect(await store.countNewScans('key:new', '2000-01-01T00:00:00.000Z')).toBe(1);
  });
});

describe('daily allowance', () => {
  test('counts new scans today, ignores reused ones, and resets at UTC midnight', async () => {
    const time = clock('2026-10-12T09:00:00.000Z');
    const store = new MemoryAccessStore({ now: time.now });
    const deps = { store, now: time.now };
    const subject = 'key:k1' as const;
    await store.recordUsage({ subject, endpoint: 'POST /api/scans', newScan: true });
    await store.recordUsage({ subject, endpoint: 'POST /api/scans', newScan: false });
    expect(await allowance(subject, 2, deps)).toEqual({
      limit: 2,
      used: 1,
      remaining: 1,
      resetAt: '2026-10-13T00:00:00.000Z',
    });
    await store.recordUsage({ subject, endpoint: 'POST /api/scans', newScan: true });
    await expect(assertAllowance(subject, 2, deps)).rejects.toThrow(
      'Daily limit of 2 new scans reached. Recent scans are still free to read. Resets at 2026-10-13T00:00:00.000Z.',
    );
    time.set('2026-10-13T00:00:00.000Z');
    await expect(assertAllowance(subject, 2, deps)).resolves.toMatchObject({ remaining: 2 });
  });

  test('dayWindow is the UTC day around a moment', () => {
    expect(dayWindow(new Date('2026-10-12T23:59:59.999Z'))).toEqual({
      start: '2026-10-12T00:00:00.000Z',
      resetAt: '2026-10-13T00:00:00.000Z',
    });
  });
});

describe('subjects', () => {
  test('a key spends as key:<id>', () => {
    expect(
      keySubject({ id: 'k1', prefix: 'sp_x', scansPerDay: 10, createdAt: '', revokedAt: null }),
    ).toBe('key:k1');
  });

  test('a visitor is a keyed hash of the IP: stable, secret-dependent, never the IP', async () => {
    const a = await visitorSubject('203.0.113.7', 'secret-1');
    expect(a).toMatch(/^visitor:[0-9a-f]{64}$/);
    expect(a).not.toContain('203.0.113.7');
    expect(await visitorSubject('203.0.113.7', 'secret-1')).toBe(a);
    expect(await visitorSubject('203.0.113.7', 'secret-2')).not.toBe(a);
    expect(await hashIp('203.0.113.8', 'secret-1')).not.toBe(a.slice('visitor:'.length));
  });
});
