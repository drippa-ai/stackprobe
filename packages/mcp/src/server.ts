import {
  diffReports,
  type Net,
  Report,
  requestScan,
  type ScanRecord,
  STACKPROBE_VERSION,
  type Store,
} from '@drippa/stackprobe-core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { formatDiff, formatExplanation, formatScan } from './format.ts';
import { runScanLocally } from './local-runner.ts';

export interface ServerOptions {
  store: Store;
  net: Net;
  now?: () => Date;
}

const scanOutput = {
  scanId: z.string(),
  domain: z.string(),
  status: z.enum(['running', 'done', 'partial']),
  report: Report.nullable(),
};

const which = {
  domain: z.string().optional().describe('Domain, like example.com. Uses its newest scan.'),
  scan_id: z.string().optional().describe('A scan id from scan_domain or get_scan.'),
};

// The stackprobe MCP server. Each tool is a thin wrapper around core.
export function createServer({ store, net, now }: ServerOptions): McpServer {
  const server = new McpServer({ name: 'stackprobe', version: STACKPROBE_VERSION });

  server.registerTool(
    'scan_domain',
    {
      title: 'Scan a domain',
      description:
        'Finds what a website is built on (hosting, framework, backend), with evidence and a ' +
        'confidence score for each finding. Takes a few seconds. A scan younger than 24 hours ' +
        'is returned instead of scanning again, unless force is true. Findings belong to the ' +
        'scanned URL; it is not yet known whether that is the product app or a marketing site.',
      inputSchema: {
        domain: z.string().describe('Domain or URL, like example.com or https://app.example.com'),
        force: z.boolean().optional().describe('Scan again even if a recent scan exists.'),
      },
      outputSchema: { ...scanOutput, reused: z.boolean() },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ domain, force }) => {
      let ran = false;
      let scan: ScanRecord;
      try {
        scan = await requestScan(
          domain,
          {
            store,
            ...(now ? { now } : {}),
            start: async (created) => {
              ran = true;
              await runScanLocally(store, net, created);
            },
          },
          { force: force ?? false },
        );
      } catch (error) {
        if (error instanceof TypeError) return fail(`Not a domain or URL: ${domain}`);
        throw error;
      }
      const latest = (await store.getScan(scan.id)) ?? scan;
      const reused = !ran;
      const note = reused ? 'Returned a recent scan. Pass force: true to scan again.\n\n' : '';
      return result(note + formatScan(latest), { ...toOutput(latest), reused });
    },
  );

  server.registerTool(
    'get_scan',
    {
      title: 'Get a scan',
      description:
        'Returns a stored scan report, by scan id or the newest scan of a domain. Does not ' +
        'scan; use scan_domain for that.',
      inputSchema: which,
      outputSchema: scanOutput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      const found = await findScan(store, args);
      if (typeof found === 'string') return fail(found);
      return result(formatScan(found), toOutput(found));
    },
  );

  server.registerTool(
    'explain_detection',
    {
      title: 'Explain a detection',
      description:
        'Explains why a scan thinks a site uses a technology: the evidence found and how the ' +
        'confidence score was reached.',
      inputSchema: {
        ...which,
        tech: z.string().describe('Technology id from a scan report, like vercel or nextjs.'),
      },
      outputSchema: {
        scanId: z.string(),
        surfaceUrl: z.string(),
        detection: Report.shape.surfaces.element.shape.detections.element,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ tech, ...args }) => {
      const found = await findScan(store, args);
      if (typeof found === 'string') return fail(found);
      if (!found.report) return fail(`Scan ${found.id} is still running.`);
      const wanted = tech.trim().toLowerCase();
      for (const surface of found.report.surfaces) {
        const detection = surface.detections.find((d) => d.tech.toLowerCase() === wanted);
        if (detection) {
          return result(formatExplanation(found, surface, detection), {
            scanId: found.id,
            surfaceUrl: surface.url,
            detection,
          });
        }
      }
      const detected = found.report.surfaces.flatMap((s) => s.detections.map((d) => d.tech));
      return fail(
        `${tech} was not detected in scan ${found.id}. Detected: ${detected.join(', ') || 'nothing'}.`,
      );
    },
  );

  server.registerTool(
    'diff_scans',
    {
      title: 'Compare two scans',
      description:
        "Shows what changed in a domain's stack between two scans: technologies added, " +
        'removed, or with a new version or confidence. By default compares the two newest ' +
        'finished scans of the domain; or pass from_scan_id and to_scan_id.',
      inputSchema: {
        domain: z.string().optional().describe('Domain, like example.com.'),
        from_scan_id: z.string().optional().describe('The older scan.'),
        to_scan_id: z.string().optional().describe('The newer scan.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ domain, from_scan_id, to_scan_id }) => {
      let pair: [ScanRecord, ScanRecord];
      if (from_scan_id && to_scan_id) {
        const [from, to] = await Promise.all([
          store.getScan(from_scan_id),
          store.getScan(to_scan_id),
        ]);
        if (!from || !to) return fail(`No scan with id ${from ? to_scan_id : from_scan_id}.`);
        pair = [from, to];
      } else if (domain) {
        const finished = (await store.listScans(host(domain))).filter((scan) => scan.report);
        const [to, from] = finished;
        if (!from || !to) {
          return fail(
            `${domain} needs two finished scans to compare; it has ${finished.length}. ` +
              'Run scan_domain with force: true to add one.',
          );
        }
        pair = [from, to];
      } else {
        return fail('Pass a domain, or both from_scan_id and to_scan_id.');
      }
      const [from, to] = pair;
      if (!from.report || !to.report) return fail('Both scans must be finished.');
      const diff = diffReports(from.report, to.report);
      return result(formatDiff(diff), { ...diff });
    },
  );

  return server;
}

async function findScan(
  store: Store,
  args: { domain?: string | undefined; scan_id?: string | undefined },
): Promise<ScanRecord | string> {
  if (args.scan_id) {
    return (await store.getScan(args.scan_id)) ?? `No scan with id ${args.scan_id}.`;
  }
  if (args.domain) {
    return (
      (await store.latestScan(host(args.domain))) ??
      `${args.domain} has not been scanned yet. Use scan_domain.`
    );
  }
  return 'Pass a domain or a scan_id.';
}

// Accepts "Example.com", "https://example.com/path" or "example.com".
function host(domain: string): string {
  const trimmed = domain.trim();
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return trimmed.toLowerCase();
  }
}

function toOutput(scan: ScanRecord) {
  return { scanId: scan.id, domain: scan.domain, status: scan.status, report: scan.report };
}

function result(text: string, structuredContent: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text }], structuredContent };
}

function fail(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}
