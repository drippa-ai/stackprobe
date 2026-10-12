import { createServer, type ScanStarter } from '@drippa/stackprobe-mcp';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { invalidKey, keyFromHeader } from './keys-api.ts';
import { type ScansApiDeps, startKeyedScan } from './scans-api.ts';

// The remote MCP server at /mcp: the same four tools as the local stdio server (packages/mcp),
// with scans run as hosted workflow runs under the caller's API key and its limits.
// Stateless: each HTTP request gets its own server and transport, answered as plain JSON.

// How long scan_domain waits for a new scan before handing back the running one.
export const SCAN_WAIT_MS = 25_000;
const POLL_MS = 1_000;

export interface McpDeps extends Omit<ScansApiDeps, 'origin'> {
  waitMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export async function handleMcp(request: Request, deps: McpDeps): Promise<Response> {
  const clock = deps.now ? { now: deps.now } : {};
  const record = await keyFromHeader(request.headers.get('authorization'), {
    store: deps.access,
    ...clock,
  });
  if (!record) {
    const { status, body, headers } = invalidKey();
    return Response.json(body, { status, headers });
  }
  await deps.access.recordUsage({
    subject: `key:${record.id}`,
    endpoint: `${request.method} /mcp`,
    newScan: false,
  });

  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const startScan: ScanStarter = async (domain, { force }) => {
    const started = await startKeyedScan(
      record,
      domain,
      { force, endpoint: 'mcp scan_domain' },
      deps,
    );
    // Give a new or running scan a little time, so most calls come back with the report.
    let scan = started.scan;
    for (let waited = 0; scan.status === 'running' && waited < (deps.waitMs ?? SCAN_WAIT_MS); ) {
      await sleep(POLL_MS);
      waited += POLL_MS;
      scan = (await deps.store.getScan(scan.id)) ?? scan;
    }
    return { scan, reused: started.reused };
  };

  const server = createServer({ store: deps.store, startScan });
  // No session id generator: stateless, as every request may land on a different function.
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
