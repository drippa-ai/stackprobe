import {
  type AccessStore,
  assertAllowance,
  findApiKey,
  keySubject,
  LimitError,
  requestScan,
  type ScanRecord,
  type Store,
} from '@drippa/stackprobe-core';
import { type ApiResponse, invalidKey, limited } from './keys-api.ts';
import { reportJson } from './report-json.ts';

// The HTTP scan API, apart from Next's route handlers so it can be tested directly.
//   POST /api/scans      start a scan (or get the running / recent one); needs an API key
//   GET  /api/scans/:id  a scan's status, and its report once finished; free to read
// Bodies are the same shape as the report's JSON twin (/s/<domain>.json), plus `poll`.

export interface ScansApiDeps {
  store: Store;
  access: AccessStore;
  start(scan: ScanRecord): Promise<void>;
  origin: string;
  now?: () => Date;
}

const HEADERS = { 'access-control-allow-origin': '*' };

// What a browser must be allowed to send for the API to work from another site.
export const CORS_PREFLIGHT = {
  ...HEADERS,
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400',
};

export async function createScanResponse(
  authorization: string | null,
  body: string,
  deps: ScansApiDeps,
): Promise<ApiResponse> {
  const clock = deps.now ? { now: deps.now } : {};
  const access = { store: deps.access, ...clock };
  const key = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const record = key ? await findApiKey(key, access) : null;
  if (!record) return invalidKey();
  const subject = keySubject(record);

  let input: { domain?: unknown; force?: unknown };
  try {
    input = JSON.parse(body || '{}');
  } catch {
    return badRequest('invalid_json', 'Send a JSON body like {"domain": "example.com"}.');
  }
  if (typeof input?.domain !== 'string') {
    return badRequest('invalid_domain', 'Send a JSON body like {"domain": "example.com"}.');
  }

  // Exactly one usage row per request: spent as a new scan, or logged as a reuse.
  let spent = false;
  try {
    const scan = await requestScan(
      input.domain,
      {
        store: deps.store,
        start: deps.start,
        ...clock,
        allowance: {
          check: async () => {
            await assertAllowance(subject, record.scansPerDay, access);
          },
          spend: async () => {
            spent = true;
            await deps.access.recordUsage({ subject, endpoint: 'POST /api/scans', newScan: true });
          },
        },
      },
      { force: input.force === true },
    );
    if (!spent) {
      await deps.access.recordUsage({ subject, endpoint: 'POST /api/scans', newScan: false });
    }
    return scanResponse(scan, deps.origin, { reused: !spent, cache: false });
  } catch (error) {
    if (error instanceof TypeError) {
      return badRequest('invalid_domain', `"${input.domain}" isn't a domain or URL.`);
    }
    if (error instanceof LimitError) return limited(error, access);
    throw error;
  }
}

export async function getScanResponse(id: string, deps: ScansApiDeps): Promise<ApiResponse> {
  const scan = await deps.store.getScan(id);
  if (!scan) {
    return {
      status: 404,
      headers: { ...HEADERS, 'cache-control': 'no-store' },
      body: { error: 'not_found', message: `No scan with id ${id}.` },
    };
  }
  return scanResponse(scan, deps.origin, { cache: true });
}

function scanResponse(
  scan: ScanRecord,
  origin: string,
  { reused, cache }: { reused?: boolean; cache: boolean },
): ApiResponse {
  const twin = reportJson(scan.domain, scan, origin);
  const running = scan.status === 'running';
  return {
    status: running ? 202 : 200,
    headers: {
      ...HEADERS,
      // Starting a scan is never cached; reading one is, briefly while it runs.
      'cache-control': cache ? (twin.headers['cache-control'] ?? 'no-store') : 'no-store',
      ...(running ? { 'retry-after': '3' } : {}),
    },
    body: {
      ...twin.body,
      ...(reused === undefined ? {} : { reused }),
      poll: `${origin}/api/scans/${scan.id}`,
    },
  };
}

function badRequest(error: string, message: string): ApiResponse {
  return {
    status: 400,
    headers: { ...HEADERS, 'cache-control': 'no-store' },
    body: { error, message },
  };
}
