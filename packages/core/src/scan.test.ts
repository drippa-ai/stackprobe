import { describe, expect, test } from 'vitest';
import type { Layer } from './layer.ts';
import type { Net } from './net.ts';
import { Report } from './report.ts';
import { buildReport, reportStatus, scan } from './scan.ts';
import { surfaceTarget } from './surface.ts';

const net: Net = {
  http: () => Promise.reject(new Error('unused')),
  dns: () => Promise.reject(new Error('unused')),
  tls: () => Promise.reject(new Error('unused')),
};

const vercelHeaders: Layer = {
  id: 'http',
  timeoutMs: 1000,
  appliesTo: () => true,
  async run(_, ctx) {
    ctx.emit({ layer: 'http', kind: 'header', key: 'x-vercel-id', value: 'fra1::abc' });
  },
};

const brokenDns: Layer = {
  id: 'dns',
  timeoutMs: 1000,
  appliesTo: () => true,
  async run() {
    throw new Error('resolver exploded');
  },
};

describe('scan', () => {
  test('produces a valid report for one surface', async () => {
    const report = await scan('Acme.test', {
      net,
      layers: [vercelHeaders, brokenDns],
      now: () => new Date('2026-10-02T12:00:00Z'),
    });
    expect(Report.parse(report)).toEqual(report);
    expect(report).toMatchObject({
      domain: 'acme.test',
      scannedAt: '2026-10-02T12:00:00.000Z',
      surfaces: [{ id: 'root', url: 'https://acme.test/', kind: 'unclassified' }],
    });
    expect(report.surfaces[0]?.detections.map((d) => d.tech)).toEqual(['vercel']);
    expect(report.layersRun.map((r) => [r.layer, r.status])).toEqual([
      ['http', 'ok'],
      ['dns', 'failed'],
    ]);
    expect(reportStatus(report)).toBe('partial');
  });
});

describe('reportStatus', () => {
  test('is done when every layer succeeded or was skipped', () => {
    const report = buildReport({
      domain: 'acme.test',
      scannedAt: new Date(),
      surfaces: [
        {
          target: surfaceTarget('acme.test'),
          results: [
            { run: { layer: 'http', surfaceId: 'root', status: 'ok', durationMs: 1 }, signals: [] },
            {
              run: { layer: 'tls', surfaceId: 'root', status: 'skipped', durationMs: 0 },
              signals: [],
            },
          ],
        },
      ],
    });
    expect(reportStatus(report)).toBe('done');
    expect(report.surfaces[0]?.detections).toEqual([]);
  });
});
