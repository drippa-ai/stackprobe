import { describe, expect, test } from 'vitest';
import type { AccessStore } from '../src/access.ts';

// The behaviour every AccessStore must have. Each implementation runs this suite. Times come
// from the store's own clock, so bounds here are far in the past or future.
export function describeAccessStore(name: string, makeStore: () => Promise<AccessStore>) {
  const past = '2000-01-01T00:00:00.000Z';
  const future = '2100-01-01T00:00:00.000Z';
  const key = (hash: string, ipHash = 'ip-a') => ({
    hash,
    prefix: `sp_${hash.slice(0, 7)}`,
    ipHash,
    scansPerDay: 10,
  });

  describe(`${name} (AccessStore)`, () => {
    test('creates a key and finds it by its hash, without the hash or IP', async () => {
      const store = await makeStore();
      const created = await store.createKey(key('hash-1'));
      expect(created).toEqual({
        id: expect.any(String),
        prefix: 'sp_hash-1',
        scansPerDay: 10,
        createdAt: expect.any(String),
        revokedAt: null,
      });
      expect(await store.findKey('hash-1')).toEqual(created);
      expect(await store.findKey('no-such-hash')).toBeNull();
    });

    test('revoking marks the key, and revoking twice keeps the first time', async () => {
      const store = await makeStore();
      const created = await store.createKey(key('hash-2'));
      await store.revokeKey(created.id);
      const revoked = await store.findKey('hash-2');
      expect(revoked?.revokedAt).toEqual(expect.any(String));
      await store.revokeKey(created.id);
      expect((await store.findKey('hash-2'))?.revokedAt).toBe(revoked?.revokedAt);
    });

    test('counts keys created from one IP since a time', async () => {
      const store = await makeStore();
      await store.createKey(key('hash-3', 'ip-b'));
      await store.createKey(key('hash-4', 'ip-b'));
      await store.createKey(key('hash-5', 'ip-c'));
      expect(await store.countKeysCreated('ip-b', past)).toBe(2);
      expect(await store.countKeysCreated('ip-b', future)).toBe(0);
      expect(await store.countKeysCreated('ip-z', past)).toBe(0);
    });

    test('counts only new scans, per subject and since a time', async () => {
      const store = await makeStore();
      await store.recordUsage({ subject: 'key:1', endpoint: 'POST /api/scans', newScan: true });
      await store.recordUsage({ subject: 'key:1', endpoint: 'POST /api/scans', newScan: false });
      await store.recordUsage({ subject: 'key:1', endpoint: 'POST /api/scans', newScan: true });
      await store.recordUsage({ subject: 'visitor:x', endpoint: 'scan form', newScan: true });
      expect(await store.countNewScans('key:1', past)).toBe(2);
      expect(await store.countNewScans('visitor:x', past)).toBe(1);
      expect(await store.countNewScans('key:1', future)).toBe(0);
    });

    test('prunes usage older than a time', async () => {
      const store = await makeStore();
      await store.recordUsage({ subject: 'key:2', endpoint: 'x', newScan: true });
      expect(await store.pruneUsage(past)).toBe(0);
      expect(await store.countNewScans('key:2', past)).toBe(1);
      expect(await store.pruneUsage(future)).toBe(1);
      expect(await store.countNewScans('key:2', past)).toBe(0);
    });
  });
}
