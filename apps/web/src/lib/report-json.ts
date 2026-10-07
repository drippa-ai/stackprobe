import type { Report, ScanRecord, ScanStatus } from '@drippa/stackprobe-core';

// The JSON twin of a report page, /s/<domain>.json: the domain's newest scan, as data. The same
// fields the MCP get_scan tool returns, plus the scan's address and times. `report` alone
// matches schema/report.v1.json; it's null while the scan runs.
export interface ReportJson {
  scanId: string;
  domain: string;
  url: string;
  status: ScanStatus;
  createdAt: string;
  finishedAt: string | null;
  // The report page for people.
  page: string;
  report: Report | null;
}

export interface NotScannedJson {
  error: 'not_scanned';
  domain: string;
  message: string;
  page: string;
}

export interface JsonResponse {
  status: number;
  body: ReportJson | NotScannedJson;
  headers: Record<string, string>;
}

// Finished scans never change, but a new scan can replace them as the newest; running ones
// change every few seconds.
const CACHE = {
  finished: 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
  running: 'public, max-age=0, s-maxage=2',
  missing: 'public, max-age=0, s-maxage=5',
};

export function reportJson(domain: string, scan: ScanRecord | null, origin: string): JsonResponse {
  const page = `${origin}/s/${encodeURIComponent(domain)}`;
  // Reading is free and public: any site or agent may fetch it.
  const headers = { 'access-control-allow-origin': '*' };
  if (!scan) {
    return {
      status: 404,
      headers: { ...headers, 'cache-control': CACHE.missing },
      body: {
        error: 'not_scanned',
        domain,
        message: `${domain} hasn't been scanned yet. Open the page to scan it.`,
        page,
      },
    };
  }
  return {
    status: 200,
    headers: {
      ...headers,
      'cache-control': scan.status === 'running' ? CACHE.running : CACHE.finished,
    },
    body: {
      scanId: scan.id,
      domain: scan.domain,
      url: scan.url,
      status: scan.status,
      createdAt: scan.createdAt,
      finishedAt: scan.finishedAt,
      page,
      report: scan.report,
    },
  };
}
