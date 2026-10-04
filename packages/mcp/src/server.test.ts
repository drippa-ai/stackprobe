import { type Report, Report as ReportSchema } from '@drippa/stackprobe-core';
import { SqliteStore } from '@drippa/stackprobe-store-sqlite';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { loadFixture, ReplayNet } from '../../core/test/fixtures.ts';
import { createServer } from './server.ts';

const { recording } = loadFixture('vercel');

let store: SqliteStore;
let client: Client;
let clock: Date;

beforeEach(async () => {
  clock = new Date('2026-10-04T12:00:00Z');
  store = new SqliteStore(':memory:', { now: () => clock });
  const server = createServer({ store, net: new ReplayNet(recording), now: () => clock });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
});

afterEach(async () => {
  await client.close();
  store.close();
});

async function call(name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const text = result.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
  return { ...result, text };
}

describe('stackprobe MCP server', () => {
  test('lists the four tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'diff_scans',
      'explain_detection',
      'get_scan',
      'scan_domain',
    ]);
  });

  test('scan_domain scans, stores and summarizes a site', async () => {
    const scan = await call('scan_domain', { domain: 'vercel.com' });
    expect(scan.isError).toBeFalsy();
    expect(scan.structuredContent).toMatchObject({
      domain: 'vercel.com',
      status: 'done',
      reused: false,
    });
    const report = ReportSchema.parse((scan.structuredContent as { report: Report }).report);
    expect(report.surfaces[0]?.detections.map((d) => d.tech)).toEqual(
      expect.arrayContaining(['vercel', 'nextjs']),
    );
    expect(scan.text).toContain('- vercel (hosting) 99%');
    // Product first: the login page leads, the homepage is not passed off as the product.
    expect(scan.text).toMatch(/^Surface https:\/\/vercel\.com\/login \(product app/m);
    expect(scan.text).toContain('Surface https://vercel.com/ (not sure what this is');
    expect(await store.listScans('vercel.com')).toHaveLength(1);
  });

  test('scan_domain reuses a fresh scan unless forced', async () => {
    const first = await call('scan_domain', { domain: 'vercel.com' });
    const again = await call('scan_domain', { domain: 'https://vercel.com' });
    expect(again.structuredContent).toMatchObject({
      scanId: (first.structuredContent as { scanId: string }).scanId,
      reused: true,
    });
    expect(again.text).toContain('force: true');

    clock = new Date(clock.getTime() + 1000);
    const forced = await call('scan_domain', { domain: 'vercel.com', force: true });
    expect(forced.structuredContent).toMatchObject({ reused: false });
    expect(await store.listScans('vercel.com')).toHaveLength(2);
  });

  test('scan_domain rejects input that is not a domain', async () => {
    const result = await call('scan_domain', { domain: 'not a domain' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Not a domain or URL');
  });

  test('get_scan finds scans by domain or id, and says when there is none', async () => {
    const scan = await call('scan_domain', { domain: 'vercel.com' });
    const scanId = (scan.structuredContent as { scanId: string }).scanId;
    expect((await call('get_scan', { domain: 'VERCEL.com' })).structuredContent).toMatchObject({
      scanId,
    });
    expect((await call('get_scan', { scan_id: scanId })).structuredContent).toMatchObject({
      scanId,
    });
    const missing = await call('get_scan', { domain: 'example.com' });
    expect(missing).toMatchObject({ isError: true });
    expect(missing.text).toContain('not been scanned yet');
  });

  test('explain_detection shows the evidence and how confidence works', async () => {
    await call('scan_domain', { domain: 'vercel.com' });
    const explained = await call('explain_detection', { domain: 'vercel.com', tech: 'Vercel' });
    expect(explained.isError).toBeFalsy();
    expect(explained.text).toContain('Confidence: 99%');
    expect(explained.text).toContain('Evidence:');
    expect(explained.structuredContent).toMatchObject({
      surfaceUrl: 'https://vercel.com/',
      detection: { tech: 'vercel' },
    });

    const absent = await call('explain_detection', { domain: 'vercel.com', tech: 'supabase' });
    expect(absent.isError).toBe(true);
    expect(absent.text).toContain('Detected: ');
  });

  test('diff_scans compares the two newest finished scans', async () => {
    const lonely = await call('diff_scans', { domain: 'vercel.com' });
    expect(lonely.isError).toBe(true);

    await call('scan_domain', { domain: 'vercel.com' });
    clock = new Date(clock.getTime() + 1000);
    await call('scan_domain', { domain: 'vercel.com', force: true });
    const same = await call('diff_scans', { domain: 'vercel.com' });
    expect(same.text).toContain('No changes.');

    // A later scan where the site moved off Next.js.
    clock = new Date(clock.getTime() + 1000);
    const latest = await store.latestScan('vercel.com');
    const report = structuredClone(latest?.report as Report);
    const surface = report.surfaces[0];
    if (surface) surface.detections = surface.detections.filter((d) => d.tech !== 'nextjs');
    const moved = await store.createScan({ domain: 'vercel.com', url: 'https://vercel.com/' });
    await store.finishScan(moved.id, report);

    const diff = await call('diff_scans', { domain: 'vercel.com' });
    expect(diff.text).toContain('- nextjs (framework)');
    expect(diff.structuredContent).toMatchObject({
      surfaces: [{ url: 'https://vercel.com/', removed: [{ tech: 'nextjs' }] }],
    });
  });
});
