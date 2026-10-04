import { describe, expect, test } from 'vitest';
import type { Layer } from './layer.ts';
import type { Net } from './net.ts';
import { Report } from './report.ts';
import { buildReport, layersForSurfaces, reportStatus, scan } from './scan.ts';
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
      // An unclassified homepage gets the deep layers; with no scripts, bundle has nothing to read.
      ['bundle', 'skipped'],
    ]);
    expect(reportStatus(report)).toBe('partial');
  });
});

describe('scan with discovery', () => {
  // The homepage links to its app on a subdomain and to a login page on the same host.
  const linksAndHeaders: Layer = {
    id: 'http',
    timeoutMs: 1000,
    appliesTo: () => true,
    async run(surface, ctx) {
      ctx.emit({ layer: 'http', kind: 'header', key: 'x-vercel-id', value: surface.url });
      if (surface.id === 'root') {
        for (const [value, key] of [
          ['https://app.acme.test/', 'Dashboard'],
          ['https://acme.test/login', 'Log in'],
        ] as const) {
          ctx.emit({ layer: 'http', kind: 'anchor', key, value, source: surface.url });
        }
      }
    },
  };
  const ranOn: string[] = [];
  const perHost: Layer = {
    id: 'dns',
    timeoutMs: 1000,
    appliesTo: () => true,
    async run(surface) {
      ranOn.push(surface.id);
    },
  };

  test('scans the surfaces it finds, with per-host layers once per host', async () => {
    const saved: string[] = [];
    const report = await scan('acme.test', {
      net,
      layers: [linksAndHeaders, perHost],
      onLayerResult: (result) => {
        saved.push(`${result.run.surfaceId} ${result.run.layer}`);
      },
    });
    expect(Report.parse(report)).toEqual(report);
    expect(report.surfaces.map(({ url, foundBy }) => ({ url, foundBy }))).toEqual([
      { url: 'https://acme.test/', foundBy: undefined },
      { url: 'https://app.acme.test/', foundBy: { kind: 'link', text: 'Dashboard' } },
      { url: 'https://acme.test/login', foundBy: { kind: 'link', text: 'Log in' } },
    ]);
    expect(report.surfaces.every((s) => s.detections[0]?.tech === 'vercel')).toBe(true);
    expect(ranOn.sort()).toEqual(['app-acme-test', 'root']);
    expect(saved.sort()).toEqual([
      'acme-test-login bundle',
      'acme-test-login http',
      'app-acme-test bundle',
      'app-acme-test dns',
      'app-acme-test http',
      'root bundle',
      'root dns',
      'root http',
    ]);
  });

  test('discover: false scans only the page asked for', async () => {
    const report = await scan('acme.test', { net, layers: [linksAndHeaders], discover: false });
    expect(report.surfaces).toHaveLength(1);
  });

  test('layersForSurfaces runs DNS and TLS once per host', () => {
    const plan = layersForSurfaces(
      [surfaceTarget('https://acme.test/login', 'a'), surfaceTarget('https://b.acme.test/', 'b')],
      [linksAndHeaders, perHost],
      ['acme.test'],
    );
    expect(plan.get('a')?.map((l) => l.id)).toEqual(['http']);
    expect(plan.get('b')?.map((l) => l.id)).toEqual(['http', 'dns']);
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
