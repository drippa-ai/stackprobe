import {
  createApiKey,
  MemoryAccessStore,
  MemoryStore,
  type ScanRecord,
} from '@drippa/stackprobe-core';
import { runScanLocally } from '@drippa/stackprobe-mcp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, test } from 'vitest';
import { loadFixture, ReplayNet } from '../../../../packages/core/test/fixtures.ts';
import { handleMcp } from './mcp.ts';

const { recording } = loadFixture('vercel');
const clients: Client[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
});

// An MCP client whose HTTP requests go straight to handleMcp. Scans "run as workflows" by
// replaying a recorded site in-process, or (running: true) never finish.
async function connect({ running = false, withKey = true } = {}) {
  const store = new MemoryStore();
  const access = new MemoryAccessStore();
  const { key, record } = await createApiKey('ip-hash', { store: access });
  const started: ScanRecord[] = [];
  const deps = {
    store,
    access,
    waitMs: running ? 2 : 25_000,
    sleep: async () => {},
    start: async (scan: ScanRecord) => {
      started.push(scan);
      if (!running) await runScanLocally(store, new ReplayNet(recording), scan);
    },
  };
  const client = new Client({ name: 'test', version: '0' });
  const transport = new StreamableHTTPClientTransport(new URL('https://stackprobe.test/mcp'), {
    fetch: (url, init) => handleMcp(new Request(url, init), deps),
    ...(withKey ? { requestInit: { headers: { authorization: `Bearer ${key}` } } } : {}),
  });
  // The SDK's own transport, typed without exactOptionalPropertyTypes in mind.
  await client.connect(transport as unknown as Transport);
  clients.push(client);
  return { client, store, access, started, subject: `key:${record.id}` as const };
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const text = result.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
  return { ...result, text };
}

describe('remote MCP at /mcp', () => {
  test('lists the same four tools as the local server', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'diff_scans',
      'explain_detection',
      'get_scan',
      'scan_domain',
    ]);
  });

  test('scan_domain runs a hosted scan under the key, and get_scan reads it', async () => {
    const { client, started, access, subject } = await connect();
    const scanned = await call(client, 'scan_domain', { domain: recording.url });
    expect(scanned.isError).toBeFalsy();
    expect(scanned.structuredContent).toMatchObject({ status: 'done', reused: false });
    expect(scanned.text).toContain('vercel');
    expect(started).toHaveLength(1);
    expect(await access.countNewScans(subject, '2000-01-01T00:00:00.000Z')).toBe(1);

    const again = await call(client, 'scan_domain', { domain: recording.url });
    expect(again.structuredContent).toMatchObject({ reused: true });
    expect(started).toHaveLength(1);

    const got = await call(client, 'get_scan', {
      scan_id: (scanned.structuredContent as { scanId: string }).scanId,
    });
    expect(got.structuredContent).toMatchObject({ status: 'done' });
  });

  test('explain_detection and diff_scans work on hosted scans', async () => {
    const { client } = await connect();
    await call(client, 'scan_domain', { domain: recording.url });
    const explained = await call(client, 'explain_detection', {
      domain: recording.url,
      tech: 'vercel',
    });
    expect(explained.isError).toBeFalsy();
    expect(explained.text).toMatch(/vercel/i);
    await call(client, 'scan_domain', { domain: recording.url, force: true });
    const diff = await call(client, 'diff_scans', { domain: recording.url });
    expect(diff.isError).toBeFalsy();
  });

  test('a scan still running after the wait comes back running, pointing to get_scan', async () => {
    const { client } = await connect({ running: true });
    const scanned = await call(client, 'scan_domain', { domain: 'acme.test' });
    expect(scanned.structuredContent).toMatchObject({ status: 'running', report: null });
    expect(scanned.text).toContain('Call get_scan again in a few seconds.');
  });

  test('the same limits as the HTTP API: the 11th new scan in a day is refused', async () => {
    const { client } = await connect({ running: true });
    for (let i = 0; i < 10; i++) {
      expect((await call(client, 'scan_domain', { domain: `site${i}.test` })).isError).toBeFalsy();
    }
    const refused = await call(client, 'scan_domain', { domain: 'one-more.test' });
    expect(refused.isError).toBe(true);
    expect(refused.text).toMatch(/^Daily limit of 10 new scans reached/);
  });

  test('without a key: refused before any MCP traffic, saying how to get one', async () => {
    await expect(connect({ withKey: false })).rejects.toThrow(/invalid_key.*POST \/api\/keys/);
  });
});
