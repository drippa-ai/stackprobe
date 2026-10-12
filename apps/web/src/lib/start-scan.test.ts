import { MemoryAccessStore, MemoryStore, type ScanRecord } from '@drippa/stackprobe-core';
import { describe, expect, test } from 'vitest';
import { limitMessage, startScan } from './start-scan.ts';

function setup({ bot = false, at = '2026-10-12T19:00:00.000Z' } = {}) {
  const now = () => new Date(at);
  const store = new MemoryStore({ now });
  const access = new MemoryAccessStore({ now });
  const started: ScanRecord[] = [];
  const deps = (ip = '203.0.113.7') => ({
    store,
    access,
    botCheck: { isBot: async () => bot },
    ip,
    ipHashSecret: 'test-secret',
    start: async (scan: ScanRecord) => {
      started.push(scan);
    },
    now,
  });
  return { store, started, deps };
}

describe('startScan', () => {
  test('a visitor can start 3 new scans a day; the 4th explains the limit and starts nothing', async () => {
    const { deps, started } = setup();
    for (const domain of ['a.test', 'b.test', 'c.test']) {
      expect(await startScan(domain, { force: false }, deps())).toEqual({ domain });
    }
    expect(await startScan('d.test', { force: false }, deps())).toEqual({
      error: limitMessage('2026-10-13T00:00:00.000Z', () => new Date('2026-10-12T19:00:00.000Z')),
    });
    expect(started.map((s) => s.domain)).toEqual(['a.test', 'b.test', 'c.test']);
  });

  test('opening a scan that already exists is free, even at the limit', async () => {
    const { deps } = setup();
    for (const domain of ['a.test', 'b.test', 'c.test']) {
      await startScan(domain, { force: false }, deps());
    }
    expect(await startScan('a.test', { force: false }, deps())).toEqual({ domain: 'a.test' });
  });

  test('"Scan again" on a finished scan starts a new one, so it counts', async () => {
    const { deps, store, started } = setup();
    await startScan('a.test', { force: false }, deps());
    await startScan('b.test', { force: false }, deps());
    const first = started.find((scan) => scan.domain === 'b.test');
    await store.finishScan(first?.id ?? '', {
      schemaVersion: '1',
      domain: 'b.test',
      scannedAt: '2026-10-12T19:00:00.000Z',
      fingerprintsVersion: 'test',
      surfaces: [],
      layersRun: [],
    });
    expect(await startScan('b.test', { force: true }, deps())).toEqual({ domain: 'b.test' });
    expect(await startScan('c.test', { force: false }, deps())).toHaveProperty('error');
  });

  test('"Scan again" while the scan still runs returns it, and spends nothing', async () => {
    const { deps } = setup();
    await startScan('a.test', { force: false }, deps());
    await startScan('a.test', { force: true }, deps());
    await startScan('b.test', { force: false }, deps());
    expect(await startScan('c.test', { force: false }, deps())).toEqual({ domain: 'c.test' });
  });

  test('each visitor has their own allowance', async () => {
    const { deps } = setup();
    for (const domain of ['a.test', 'b.test', 'c.test']) {
      await startScan(domain, { force: false }, deps('203.0.113.7'));
    }
    expect(await startScan('d.test', { force: false }, deps('198.51.100.2'))).toEqual({
      domain: 'd.test',
    });
  });

  test('a bot is turned away before anything is created or spent', async () => {
    const { deps, store, started } = setup({ bot: true });
    expect(await startScan('a.test', { force: false }, deps())).toEqual({
      error: "We couldn't confirm this is a browser. Reload the page and try again.",
    });
    expect(await store.latestScan('a.test')).toBeNull();
    expect(started).toEqual([]);
  });

  test('input that is not a domain is explained, and spends nothing', async () => {
    const { deps } = setup();
    expect(await startScan('not a domain', { force: false }, deps())).toEqual({
      error: 'Enter a domain or URL, like example.com.',
    });
    for (const domain of ['a.test', 'b.test', 'c.test']) {
      expect(await startScan(domain, { force: false }, deps())).toEqual({ domain });
    }
  });
});

test('limitMessage says when more scans are possible', () => {
  const at = (iso: string) => () => new Date(iso);
  expect(limitMessage('2026-10-13T00:00:00.000Z', at('2026-10-12T19:00:00.000Z'))).toBe(
    "You've started 3 new scans today, the daily limit without a key. Scans that already exist are still free to open. You can start more at midnight UTC, in 5 hours.",
  );
  expect(limitMessage('2026-10-13T00:00:00.000Z', at('2026-10-12T23:30:00.000Z'))).toContain(
    'in about an hour.',
  );
});
