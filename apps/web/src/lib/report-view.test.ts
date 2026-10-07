import type { Detection, LayerRun, Report } from '@drippa/stackprobe-core';
import { describe, expect, test } from 'vitest';
import {
  failedChecks,
  layersThatRan,
  scanDuration,
  scanProgress,
  surfaceTabs,
  techLabel,
  verdict,
} from './report-view.ts';

const det = (tech: string, confidence: number, version: string | null = null): Detection => ({
  tech,
  category: 'x',
  version,
  confidence,
  evidence: [
    { type: 'observed', layer: 'http', ruleId: `${tech}/x`, detail: 'x', weight: confidence },
  ],
});

type S = Report['surfaces'][number];
const surface = (id: string, url: string, kind: S['kind'], extra: Partial<S> = {}): S => ({
  id,
  url,
  kind,
  kindConfidence: kind === 'unclassified' ? null : 0.9,
  detections: [],
  ...extra,
});
const report = (surfaces: S[], layersRun: Report['layersRun'] = []): Report => ({
  schemaVersion: '1',
  domain: 'acme.test',
  scannedAt: '2026-10-05T12:00:00.000Z',
  fingerprintsVersion: 'x',
  surfaces,
  layersRun,
});

describe('verdict', () => {
  test('names the product stack, most certain first, with versions', () => {
    const r = report([
      surface('root', 'https://acme.test/', 'marketing', { detections: [det('framer', 0.95)] }),
      surface('app', 'https://app.acme.test/', 'app', {
        detections: [det('vercel', 0.95), det('clerk', 0.99, '5'), det('nextjs', 0.97)],
      }),
    ]);
    expect(verdict(r)).toBe('Product runs on Clerk 5, Next.js and Vercel.');
  });

  test('never passes the marketing site off as the product', () => {
    const r = report([
      surface('root', 'https://acme.test/', 'marketing', { detections: [det('framer', 0.95)] }),
    ]);
    expect(verdict(r)).toBe('No product app found. Showing the marketing site only.');
    expect(verdict(report([surface('root', 'https://acme.test/', 'unclassified')]))).toBe(
      "Couldn't tell which surface is the product app.",
    );
  });

  test('a single technology reads naturally', () => {
    const r = report([
      surface('app', 'https://app.acme.test/', 'app', { detections: [det('nextjs', 0.9)] }),
    ]);
    expect(verdict(r)).toBe('Product runs on Next.js.');
  });
});

test('tabs come product first, and share a label only with the host added', () => {
  const tabs = surfaceTabs(
    report([
      surface('root', 'https://acme.test/', 'marketing'),
      surface('docs', 'https://docs.acme.test/', 'docs'),
      surface('app', 'https://app.acme.test/', 'app'),
      surface('portal', 'https://portal.acme.test/', 'app', { kindConfidence: 0.7 }),
    ]),
  );
  expect(tabs.map((t) => t.label)).toEqual([
    'Product app · app.acme.test',
    'Product app · portal.acme.test',
    'Marketing site',
    'Docs',
  ]);
});

test('layersThatRan lists the layers that ran somewhere, in order', () => {
  const run = (layer: Report['layersRun'][number]['layer'], status: 'ok' | 'failed' = 'ok') => ({
    layer,
    surfaceId: 'x',
    status,
    durationMs: 1,
  });
  expect(
    layersThatRan(report([], [run('browser'), run('http'), run('dns', 'failed'), run('bundle')])),
  ).toBe("HTTP, the page's own scripts and a real browser");
});

test('techLabel and scanDuration', () => {
  expect(techLabel(det('clerk', 0.9, '5'))).toBe('Clerk 5');
  expect(techLabel(det('unknown-tech', 0.9))).toBe('unknown-tech');
  expect(scanDuration('2026-10-05T11:30:17Z', '2026-10-05T11:30:43Z')).toBe('26 s');
  expect(scanDuration('2026-10-05T11:30:00Z', null)).toBeNull();
});

describe('scanProgress', () => {
  const run = (
    layer: LayerRun['layer'],
    surfaceId: string,
    ms: number,
    status: LayerRun['status'] = 'ok',
  ): LayerRun => ({
    layer,
    surfaceId,
    status,
    durationMs: ms,
  });

  test('before anything is saved, it is reading headers and the rest waits', () => {
    const { now, steps } = scanProgress([]);
    expect(now).toBe('Reading headers, DNS and certificates.');
    expect(steps.map((s) => s.state)).toEqual(['now', 'waiting', 'waiting', 'waiting', 'waiting']);
  });

  test('finished checks say how much they covered, failures and the slowest time', () => {
    const { now, steps } = scanProgress([
      run('http', 'root', 1200),
      run('http', 'app', 800, 'failed'),
      run('dns', 'root', 400),
      run('tls', 'root', 600),
    ]);
    expect(now).toBe('Finding the product app and loading it in a real browser.');
    expect(steps[0]).toEqual({
      layer: 'http',
      state: 'done',
      text: 'Read headers and pages on 2 surfaces',
      failed: 1,
      took: '1.2 s',
    });
    expect(steps[2]?.text).toBe('Read certificates for 1 host');
    expect(steps.slice(3).map((s) => s.state)).toEqual(['now', 'waiting']);
  });

  test('with every check saved, it is writing the report', () => {
    const all = (['http', 'dns', 'tls', 'browser', 'bundle'] as const).map((l) =>
      run(l, 'root', 10),
    );
    expect(scanProgress(all).now).toBe('Writing the report.');
  });
});

test('failedChecks names the failed checks per host', () => {
  const report = {
    surfaces: [{ id: 'app', url: 'https://app.acme.test/login' }],
    layersRun: [
      { layer: 'browser', surfaceId: 'app', status: 'failed', durationMs: 1 },
      { layer: 'dns', surfaceId: 'app', status: 'timeout', durationMs: 1 },
      { layer: 'http', surfaceId: 'app', status: 'ok', durationMs: 1 },
      { layer: 'bundle', surfaceId: 'app', status: 'skipped', durationMs: 0 },
    ],
  } as unknown as Report;
  expect(failedChecks(report)).toEqual(['DNS and a real browser on app.acme.test']);
});
