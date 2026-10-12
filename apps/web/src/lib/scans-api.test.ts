import {
  createApiKey,
  hashKey,
  MemoryAccessStore,
  MemoryStore,
  type Report,
  type ScanRecord,
} from '@drippa/stackprobe-core';
import { describe, expect, test } from 'vitest';
import { createScanResponse, getScanResponse } from './scans-api.ts';

const origin = 'https://stackprobe.tech';

async function setup() {
  const now = () => new Date('2026-10-12T19:00:00.000Z');
  const store = new MemoryStore({ now });
  const access = new MemoryAccessStore({ now });
  const started: ScanRecord[] = [];
  const deps = {
    store,
    access,
    origin,
    now,
    start: async (scan: ScanRecord) => {
      started.push(scan);
    },
  };
  const { key, record } = await createApiKey('ip-hash', { store: access, now });
  return {
    deps,
    store,
    access,
    started,
    auth: `Bearer ${key}`,
    subject: `key:${record.id}` as const,
  };
}

const report = (domain: string): Report => ({
  schemaVersion: '1',
  domain,
  scannedAt: '2026-10-12T19:00:00.000Z',
  fingerprintsVersion: 'test',
  surfaces: [],
  layersRun: [],
});

const post = (domain: string, extra = {}) => JSON.stringify({ domain, ...extra });

describe('POST /api/scans', () => {
  test('starts a scan: 202, the scan, and where to poll', async () => {
    const { deps, started, access, auth, subject } = await setup();
    const { status, body, headers } = await createScanResponse(
      auth,
      post('https://Acme.test/pricing'),
      deps,
    );
    expect(status).toBe(202);
    expect(body).toMatchObject({
      domain: 'acme.test',
      status: 'running',
      report: null,
      reused: false,
      page: 'https://stackprobe.tech/s/acme.test',
      poll: `https://stackprobe.tech/api/scans/${body.scanId}`,
    });
    expect(headers['retry-after']).toBe('3');
    expect(headers['cache-control']).toBe('no-store');
    expect(started).toHaveLength(1);
    expect(await access.countNewScans(subject, '2000-01-01T00:00:00.000Z')).toBe(1);
  });

  test('a fresh finished scan is returned, not redone, and spends nothing', async () => {
    const { deps, store, access, auth, subject, started } = await setup();
    const first = await createScanResponse(auth, post('acme.test'), deps);
    await store.finishScan(String(first.body.scanId), report('acme.test'));
    const again = await createScanResponse(auth, post('acme.test'), deps);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ scanId: first.body.scanId, status: 'done', reused: true });
    expect(again.body.report).toEqual(report('acme.test'));
    expect(started).toHaveLength(1);
    expect(await access.countNewScans(subject, '2000-01-01T00:00:00.000Z')).toBe(1);
    // force: a new scan, which spends.
    const forced = await createScanResponse(auth, post('acme.test', { force: true }), deps);
    expect(forced).toMatchObject({ status: 202, body: { reused: false } });
    expect(await access.countNewScans(subject, '2000-01-01T00:00:00.000Z')).toBe(2);
  });

  test('every request is logged against the key, new scan or not', async () => {
    const { deps, access, auth } = await setup();
    await createScanResponse(auth, post('acme.test'), deps);
    await createScanResponse(auth, post('acme.test'), deps);
    expect(await access.pruneUsage('2100-01-01T00:00:00.000Z')).toBe(2);
  });

  test('after 10 new scans in a day: 429 with when it resets', async () => {
    const { deps, auth } = await setup();
    for (let i = 0; i < 10; i++) {
      expect((await createScanResponse(auth, post(`site${i}.test`), deps)).status).toBe(202);
    }
    const { status, body, headers } = await createScanResponse(auth, post('one-more.test'), deps);
    expect(status).toBe(429);
    expect(body).toMatchObject({ error: 'rate_limited', resetAt: '2026-10-13T00:00:00.000Z' });
    expect(headers['retry-after']).toBe('18000');
    // Scans that exist are still free to fetch.
    expect((await createScanResponse(auth, post('site0.test'), deps)).status).toBe(202);
  });

  test('400 for a body that is not JSON, has no domain, or names no domain', async () => {
    const { deps, auth, started } = await setup();
    expect(await createScanResponse(auth, '{nope', deps)).toMatchObject({
      status: 400,
      body: { error: 'invalid_json' },
    });
    expect(await createScanResponse(auth, '{}', deps)).toMatchObject({
      status: 400,
      body: { error: 'invalid_domain' },
    });
    expect(await createScanResponse(auth, post('not a domain'), deps)).toMatchObject({
      status: 400,
      body: { error: 'invalid_domain', message: '"not a domain" isn\'t a domain or URL.' },
    });
    expect(started).toHaveLength(0);
  });

  test('401 for a missing, malformed, unknown or revoked key', async () => {
    const { deps, access, auth } = await setup();
    for (const header of [null, 'sp_x', 'Bearer sp_unknown']) {
      expect((await createScanResponse(header, post('acme.test'), deps)).status).toBe(401);
    }
    const record = await access.findKey(await hashKey(auth.slice('Bearer '.length)));
    await access.revokeKey(record?.id ?? '');
    expect((await createScanResponse(auth, post('acme.test'), deps)).status).toBe(401);
  });
});

describe('GET /api/scans/:id', () => {
  test('poll until done: 202 while running, then 200 with the report', async () => {
    const { deps, store, auth } = await setup();
    const started = await createScanResponse(auth, post('acme.test'), deps);
    const id = String(started.body.scanId);
    const running = await getScanResponse(id, deps);
    expect(running).toMatchObject({ status: 202, body: { status: 'running', report: null } });
    expect(running.headers['cache-control']).toBe('public, max-age=0, s-maxage=2');
    expect(running.body).not.toHaveProperty('reused');
    await store.finishScan(id, report('acme.test'));
    const done = await getScanResponse(id, deps);
    expect(done).toMatchObject({
      status: 200,
      body: { status: 'done', report: report('acme.test') },
    });
  });

  test('404 for an unknown id', async () => {
    const { deps } = await setup();
    expect(await getScanResponse('nope', deps)).toMatchObject({
      status: 404,
      body: { error: 'not_found' },
    });
  });
});
