import type { Detection, LayerRun, Report, ScanRecord } from '@drippa/stackprobe-core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import { NotScanned, ReportView, Running } from './report-sections.tsx';

// Refreshing needs Next's router; rendering the running state doesn't.
vi.mock('./auto-refresh.tsx', () => ({ AutoRefresh: () => null }));

const det = (tech: string, confidence: number, version: string | null = null): Detection => ({
  tech,
  category: tech === 'clerk' ? 'auth' : 'hosting',
  version,
  confidence,
  evidence: [
    { type: 'observed', layer: 'http', ruleId: `${tech}/a`, detail: `${tech} header`, weight: 0.9 },
    {
      type: 'observed',
      layer: 'browser',
      ruleId: `${tech}/b`,
      detail: `${tech} request`,
      weight: 0.8,
    },
  ],
});

const report: Report = {
  schemaVersion: '1',
  domain: 'acme.test',
  scannedAt: '2026-10-05T11:30:00.000Z',
  fingerprintsVersion: 'abc123',
  surfaces: [
    {
      id: 'root',
      url: 'https://acme.test/',
      kind: 'marketing',
      kindConfidence: 0.9,
      detections: [det('framer', 0.95)],
    },
    {
      id: 'app',
      url: 'https://app.acme.test/login',
      kind: 'app',
      kindConfidence: 0.97,
      foundBy: { kind: 'link', text: 'Log in' },
      detections: [det('clerk', 0.99, '5'), det('vercel', 0.95)],
    },
  ],
  layersRun: [
    { layer: 'http', surfaceId: 'root', status: 'ok', durationMs: 1 },
    { layer: 'browser', surfaceId: 'app', status: 'ok', durationMs: 1 },
  ],
};

const scan: ScanRecord = {
  id: 'scan-1',
  domain: 'acme.test',
  url: 'https://acme.test/',
  status: 'done',
  createdAt: '2026-10-05T11:30:00.000Z',
  finishedAt: '2026-10-05T11:30:26.000Z',
  report,
};

const render = (selected?: string) =>
  renderToStaticMarkup(<ReportView scan={scan} report={report} selected={selected} />);

describe('ReportView', () => {
  test('opens with the domain, the product stack and the scan facts', () => {
    const html = render();
    expect(html).toContain('<h1 class="domain">acme.test</h1>');
    expect(html).toContain(
      '<p class="verdict">Product runs on <strong>Clerk 5</strong> and <strong>Vercel</strong>.</p>',
    );
    expect(html).toContain('26 s');
  });

  test('tabs are links, product first, the current one marked, each with its host', () => {
    const tabs = [
      ...render().matchAll(
        /<a href="\?surface=([^"]+)"( aria-current="page")?><span class="tab-kind">([^<]+)<\/span><span class="tab-host">([^<]+)</g,
      ),
    ];
    expect(tabs.map((t) => [t[1], Boolean(t[2]), t[3], t[4]])).toEqual([
      ['app', true, 'Product app', 'app.acme.test'],
      ['root', false, 'Marketing site', 'acme.test'],
    ]);
    const marketing = [
      ...render('root').matchAll(/aria-current="page"><span class="tab-kind">([^<]+)</g),
    ].map((m) => m[1]);
    expect(marketing).toEqual(['Marketing site']);
  });

  test('confidence under 60% draws a grey bar, from 60% a signal one', () => {
    const low = { ...report.surfaces[1], detections: [det('clerk', 0.52), det('vercel', 0.6)] };
    const html = renderToStaticMarkup(
      <ReportView
        scan={scan}
        report={{ ...report, surfaces: [report.surfaces[0], low] as Report['surfaces'] }}
        selected="app"
      />,
    );
    expect(html).toContain('<span class="fill low" style="width:52%">');
    expect(html).toContain('<span class="fill" style="width:60%">');
  });

  test('a partial scan says which checks failed', () => {
    const partial: Report = {
      ...report,
      layersRun: [
        ...report.layersRun,
        { layer: 'dns', surfaceId: 'app', status: 'failed', durationMs: 1 },
      ],
    };
    const html = renderToStaticMarkup(
      <ReportView scan={{ ...scan, status: 'partial' }} report={partial} selected={undefined} />,
    );
    expect(html).toContain('Partial');
    expect(html).toContain('DNS on app.acme.test');
  });

  test('each technology is a row whose evidence opens in place', () => {
    const html = render();
    expect(html.match(/<details>/g)).toHaveLength(2);
    expect(html).toContain('<span class="fill" style="width:99%">');
    expect(html).toContain('clerk header');
    expect(html).toContain('via the &quot;Log in&quot; link');
    expect(html).not.toContain('framer header');
  });

  test('says which checks ran and offers the JSON twin, copy and scan again', () => {
    const html = render();
    expect(html).toContain('Checks that ran: HTTP and a real browser.');
    expect(html).toContain('Fingerprints <span class="mono">abc123</span>');
    expect(html).toContain(
      '<a class="json-link" href="/s/acme.test.json" type="application/json">acme.test.json</a>',
    );
    expect(html).toContain('Copy link');
    expect(html).toContain('Scan again');
  });
});

test('not scanned yet', () => {
  expect(renderToStaticMarkup(<NotScanned domain="new.test" />)).toContain('Not scanned yet.');
});

test('still scanning: what it is doing now and each check', () => {
  const runs: LayerRun[] = [
    { layer: 'http', surfaceId: 'root', status: 'ok', durationMs: 1200 },
    { layer: 'dns', surfaceId: 'root', status: 'ok', durationMs: 300 },
    { layer: 'tls', surfaceId: 'root', status: 'failed', durationMs: 900 },
  ];
  const running = renderToStaticMarkup(
    <Running scan={{ ...scan, status: 'running', report: null, finishedAt: null }} runs={runs} />,
  );
  expect(running).toContain('role="status"');
  expect(running).toContain('Running');
  expect(running).toContain('Finding the product app and loading it in a real browser.');
  expect(running).toContain('Read headers and pages on 1 surface');
  expect(running).toContain(' · 1 failed');
  expect(running.match(/class="progress-step (\w+)"/g)).toEqual([
    'class="progress-step done"',
    'class="progress-step done"',
    'class="progress-step done"',
    'class="progress-step now"',
    'class="progress-step waiting"',
  ]);
  expect(running).toContain('Scanning <span class="mono">https://acme.test/</span>');
});
