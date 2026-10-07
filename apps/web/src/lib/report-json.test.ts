import { Report, type ScanRecord, scan } from '@drippa/stackprobe-core';
import { describe, expect, test } from 'vitest';
import { DOMAINS_DIR, loadRecording, ReplayNet } from '../../../../packages/core/test/fixtures.ts';
import { reportJson } from './report-json.ts';

const origin = 'https://stackprobe.tech';

// A real report: the recorded drippa.ai scan, replayed without the network.
async function fixtureScan(): Promise<ScanRecord> {
  const recording = loadRecording('drippa.ai', DOMAINS_DIR);
  const report = await scan(recording.url, {
    net: new ReplayNet(recording),
    now: () => new Date(recording.recordedAt),
  });
  return {
    id: 'scan-1',
    domain: 'drippa.ai',
    url: recording.url,
    status: 'done',
    createdAt: '2026-10-07T12:00:00.000Z',
    finishedAt: '2026-10-07T12:00:28.000Z',
    report,
  };
}

describe('reportJson', () => {
  test('a finished scan: its report, valid against schema/report.v1.json, and the scan around it', async () => {
    const record = await fixtureScan();
    const { status, body, headers } = reportJson('drippa.ai', record, origin);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      scanId: 'scan-1',
      domain: 'drippa.ai',
      status: 'done',
      createdAt: '2026-10-07T12:00:00.000Z',
      finishedAt: '2026-10-07T12:00:28.000Z',
      page: 'https://stackprobe.tech/s/drippa.ai',
    });
    // The committed JSON Schema is generated from this zod schema, and core's tests keep the two
    // equal, so parsing with it is validating against the file.
    const report = 'report' in body ? body.report : null;
    expect(Report.parse(JSON.parse(JSON.stringify(report)))).toEqual(record.report);
    expect(headers['cache-control']).toMatch(/s-maxage=300/);
    expect(headers['access-control-allow-origin']).toBe('*');
  });

  test('a running scan: its status, no report yet, cached only for seconds', () => {
    const running: ScanRecord = {
      id: 'scan-2',
      domain: 'acme.test',
      url: 'https://acme.test/',
      status: 'running',
      createdAt: '2026-10-07T12:00:00.000Z',
      finishedAt: null,
      report: null,
    };
    const { status, body, headers } = reportJson('acme.test', running, origin);
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: 'running', report: null, finishedAt: null });
    expect(headers['cache-control']).toBe('public, max-age=0, s-maxage=2');
  });

  test('an unknown domain: 404, with where to scan it', () => {
    const { status, body } = reportJson('new.test', null, origin);
    expect(status).toBe(404);
    expect(body).toEqual({
      error: 'not_scanned',
      domain: 'new.test',
      message: "new.test hasn't been scanned yet. Open the page to scan it.",
      page: 'https://stackprobe.tech/s/new.test',
    });
  });
});
