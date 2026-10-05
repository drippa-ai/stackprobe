import {
  type Browser,
  DEFAULT_LAYERS,
  MemoryStore,
  Report,
  scan as scanInProcess,
  surfaceTarget,
} from '@drippa/stackprobe-core';
import { beforeEach, expect, test, vi } from 'vitest';
import { loadFixture, ReplayNet } from '../../../../packages/core/test/fixtures.ts';

const services = vi.hoisted(() => ({
  store: undefined as unknown as MemoryStore,
  net: undefined as unknown as ReplayNet,
  browser: undefined as Browser | undefined,
}));

vi.mock('../lib/services.ts', () => ({
  getStore: () => services.store,
  getNet: () => services.net,
  getDecider: () => undefined,
  getBrowser: async () => services.browser,
}));

const { SCAN_LAYERS, scanWorkflow } = await import('./scan.ts');
const { finishScanStep, runLayerStep } = await import('./scan-steps.ts');

const { recording, expected } = loadFixture('vercel');

beforeEach(() => {
  services.browser = undefined;
  services.store = new MemoryStore();
  services.net = new ReplayNet(recording);
});

// Without the workflow compiler, 'use workflow' and 'use step' are no-ops, so the workflow
// runs here as plain functions against a recorded site.
test('scans a recorded site end to end', async () => {
  const { store, net } = services;
  const scan = await store.createScan({ domain: 'vercel.com', url: recording.url });

  expect(await scanWorkflow(scan.id, recording.url, scan.createdAt)).toBe('done');
  expect(net.misses).toEqual([]);

  const stored = await store.getScan(scan.id);
  const report = Report.parse(stored?.report);
  expect(report.scannedAt).toBe(scan.createdAt);
  expect(report.surfaces[0]?.kind).toBe('unclassified');
  const found = new Map(report.surfaces[0]?.detections.map((d) => [d.tech, d.confidence]));
  for (const { tech, minConfidence } of expected.present) {
    expect(found.get(tech), tech).toBeGreaterThanOrEqual(minConfidence);
  }

  // The same surfaces and findings as an in-process scan of the same recording.
  const local = await scanInProcess(recording.url, { net: new ReplayNet(recording) });
  const summary = (r: typeof report) =>
    r.surfaces.map((s) => ({
      url: s.url,
      foundBy: s.foundBy,
      techs: s.detections.map((d) => d.tech),
    }));
  expect(summary(report)).toEqual(summary(local));
  expect(report.surfaces.length).toBeGreaterThan(1);
  const saved = store.layerResultsFor(scan.id).map((r) => `${r.run.surfaceId} ${r.run.layer}`);
  expect(saved.sort()).toEqual(local.layersRun.map((r) => `${r.surfaceId} ${r.layer}`).sort());
});

test('runs every layer core runs', () => {
  expect([...SCAN_LAYERS].sort()).toEqual(DEFAULT_LAYERS.map((layer) => layer.id).sort());
});

test('finishing twice returns the first result instead of failing the retry', async () => {
  const { store } = services;
  const scan = await store.createScan({ domain: 'vercel.com', url: recording.url });
  const target = surfaceTarget(recording.url);
  const surfaces = [{ target, results: [await runLayerStep(scan.id, target, 'http')] }];
  const first = await finishScanStep(scan.id, scan.createdAt, surfaces);
  expect(await finishScanStep(scan.id, scan.createdAt, surfaces)).toBe(first);
});

test('does not retry saving into a scan that already finished', async () => {
  const { store } = services;
  const scan = await store.createScan({ domain: 'vercel.com', url: recording.url });
  const target = surfaceTarget(recording.url);
  await finishScanStep(scan.id, scan.createdAt, [{ target, results: [] }]);
  await expect(runLayerStep(scan.id, target, 'http')).rejects.toMatchObject({
    name: 'FatalError',
  });
});

// Every page "calls" a Supabase project in this fake browser, so its findings are easy to spot.
const fakeBrowser: Browser = {
  async capture(url) {
    return {
      url,
      status: 200,
      requests: [
        {
          url: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1/user',
          method: 'GET',
          type: 'fetch',
          headers: {},
        },
      ],
      websockets: [],
      cookies: [],
      globals: [],
    };
  },
};

test('with a browser, the workflow finds what an in-process scan finds', async () => {
  const { store, net } = services;
  services.browser = fakeBrowser;
  const scan = await store.createScan({ domain: 'vercel.com', url: recording.url });
  await scanWorkflow(scan.id, recording.url, scan.createdAt);
  const report = Report.parse((await store.getScan(scan.id))?.report);
  const local = await scanInProcess(recording.url, {
    net: new ReplayNet(recording),
    browser: fakeBrowser,
  });
  const summary = (r: typeof report) =>
    r.surfaces.map((s) => ({ url: s.url, techs: s.detections.map((d) => d.tech).sort() }));
  expect(summary(report)).toEqual(summary(local));
  expect(report.surfaces.some((s) => s.detections.some((d) => d.tech === 'supabase'))).toBe(true);
  expect(net.misses).toEqual([]);
});
