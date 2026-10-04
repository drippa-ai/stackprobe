import { beforeEach, describe, expect, test } from 'vitest';
import type { Report } from './report.ts';
import { FRESH_FOR_MS, requestScan, STALE_AFTER_MS } from './request-scan.ts';
import { MemoryStore, type ScanRecord } from './store.ts';

let clock: Date;
let store: MemoryStore;
let started: ScanRecord[];

const deps = () => ({
  store,
  now: () => clock,
  start: async (scan: ScanRecord) => {
    started.push(scan);
  },
});

const later = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

function emptyReport(domain: string): Report {
  return {
    schemaVersion: '1',
    domain,
    scannedAt: clock.toISOString(),
    fingerprintsVersion: 'test',
    surfaces: [],
    layersRun: [],
  };
}

beforeEach(() => {
  clock = new Date('2026-10-04T12:00:00Z');
  store = new MemoryStore({ now: () => clock });
  started = [];
});

describe('requestScan', () => {
  test('starts a scan of a new domain', async () => {
    const scan = await requestScan('https://Acme.test/login', deps());
    expect(scan).toMatchObject({ domain: 'acme.test', url: 'https://acme.test/login' });
    expect(started.map((s) => s.id)).toEqual([scan.id]);
  });

  test('returns the running scan instead of starting another', async () => {
    const first = await requestScan('acme.test', deps());
    later(10_000);
    const second = await requestScan('acme.test', deps());
    expect(second.id).toBe(first.id);
    expect(started).toHaveLength(1);
  });

  test('replaces a running scan that never finished', async () => {
    const first = await requestScan('acme.test', deps());
    later(STALE_AFTER_MS);
    const second = await requestScan('acme.test', deps());
    expect(second.id).not.toBe(first.id);
    expect(started).toHaveLength(2);
  });

  test('returns a finished scan younger than a day', async () => {
    const first = await requestScan('acme.test', deps());
    await store.finishScan(first.id, emptyReport('acme.test'));
    later(FRESH_FOR_MS - 1);
    expect((await requestScan('acme.test', deps())).id).toBe(first.id);
    expect(started).toHaveLength(1);
  });

  test('scans again once the last scan is a day old, or when forced', async () => {
    const first = await requestScan('acme.test', deps());
    await store.finishScan(first.id, emptyReport('acme.test'));

    const forced = await requestScan('acme.test', deps(), { force: true });
    expect(forced.id).not.toBe(first.id);
    await store.finishScan(forced.id, emptyReport('acme.test'));

    later(FRESH_FOR_MS);
    const stale = await requestScan('acme.test', deps());
    expect(stale.id).not.toBe(forced.id);
    expect(started).toHaveLength(3);
  });

  test('rejects input that is not a domain or URL', async () => {
    await expect(requestScan('not a domain', deps())).rejects.toThrow(TypeError);
    await expect(requestScan('localhost', deps())).resolves.toBeDefined();
    expect(started).toHaveLength(1);
  });
});
