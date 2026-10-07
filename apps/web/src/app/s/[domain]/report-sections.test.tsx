import type { Detection, Report, ScanRecord } from '@drippa/stackprobe-core';
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
    expect(html).toContain('<h1>acme.test</h1>');
    expect(html).toContain('Product runs on Clerk 5 and Vercel.');
    expect(html).toContain('26 s');
  });

  test('tabs are links, product first, the current one marked', () => {
    const tabs = [
      ...render().matchAll(/<a href="\?surface=([^"]+)"( aria-current="page")?>([^<]+)<\/a>/g),
    ];
    expect(tabs.map((t) => [t[1], Boolean(t[2]), t[3]])).toEqual([
      ['app', true, 'Product app'],
      ['root', false, 'Marketing site'],
    ]);
    const marketing = [...render('root').matchAll(/aria-current="page">([^<]+)</g)].map(
      (m) => m[1],
    );
    expect(marketing).toEqual(['Marketing site']);
  });

  test('each technology is a row whose evidence opens in place', () => {
    const html = render();
    expect(html.match(/<details>/g)).toHaveLength(2);
    expect(html).toContain('width:99%');
    expect(html).toContain('clerk header');
    expect(html).toContain('via the &quot;Log in&quot; link');
    expect(html).not.toContain('framer header');
  });

  test('says which checks ran and offers copy and scan again', () => {
    const html = render();
    expect(html).toContain('Checks that ran: HTTP and a real browser.');
    expect(html).toContain('Copy link');
    expect(html).toContain('Scan again');
  });
});

test('not scanned yet, and still scanning', () => {
  expect(renderToStaticMarkup(<NotScanned domain="new.test" />)).toContain('Not scanned yet.');
  const running = renderToStaticMarkup(
    <Running scan={{ ...scan, status: 'running', report: null, finishedAt: null }} />,
  );
  expect(running).toContain('role="status"');
  expect(running).toContain('Scanning https://acme.test/');
});
