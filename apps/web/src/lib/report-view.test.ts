import type { Detection, Report } from '@drippa/stackprobe-core';
import { describe, expect, test } from 'vitest';
import { layersThatRan, scanDuration, surfaceTabs, techLabel, verdict } from './report-view.ts';

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
