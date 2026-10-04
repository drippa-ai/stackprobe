import { DEFAULT_LAYERS, MemoryStore, Report } from '@drippa/stackprobe-core';
import { beforeEach, expect, test, vi } from 'vitest';
import { loadFixture, ReplayNet } from '../../../../packages/core/test/fixtures.ts';

const services = vi.hoisted(() => ({
  store: undefined as unknown as MemoryStore,
  net: undefined as unknown as ReplayNet,
}));

vi.mock('../lib/services.ts', () => ({
  getStore: () => services.store,
  getNet: () => services.net,
}));

const { SCAN_LAYERS, scanWorkflow } = await import('./scan.ts');
const { finishScanStep, runLayerStep } = await import('./scan-steps.ts');

const { recording, expected } = loadFixture('vercel');

beforeEach(() => {
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

  const saved = await store.getScan(scan.id);
  const report = Report.parse(saved?.report);
  expect(report.scannedAt).toBe(scan.createdAt);
  expect(report.surfaces[0]?.kind).toBe('unclassified');
  const found = new Map(report.surfaces[0]?.detections.map((d) => [d.tech, d.confidence]));
  for (const { tech, minConfidence } of expected.present) {
    expect(found.get(tech), tech).toBeGreaterThanOrEqual(minConfidence);
  }
  expect(
    store
      .layerResultsFor(scan.id)
      .map((r) => r.run.layer)
      .sort(),
  ).toEqual([...SCAN_LAYERS].sort());
});

test('runs every layer core runs', () => {
  expect([...SCAN_LAYERS].sort()).toEqual(DEFAULT_LAYERS.map((layer) => layer.id).sort());
});

test('finishing twice returns the first result instead of failing the retry', async () => {
  const { store } = services;
  const scan = await store.createScan({ domain: 'vercel.com', url: recording.url });
  const results = [await runLayerStep(scan.id, recording.url, 'http')];
  const first = await finishScanStep(scan.id, recording.url, scan.createdAt, results);
  expect(await finishScanStep(scan.id, recording.url, scan.createdAt, results)).toBe(first);
});

test('does not retry saving into a scan that already finished', async () => {
  const { store } = services;
  const scan = await store.createScan({ domain: 'vercel.com', url: recording.url });
  await finishScanStep(scan.id, recording.url, scan.createdAt, []);
  await expect(runLayerStep(scan.id, recording.url, 'http')).rejects.toMatchObject({
    name: 'FatalError',
  });
});
