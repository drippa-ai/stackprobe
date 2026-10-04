import type { Report } from './report.ts';
import type { LayerResult } from './runner.ts';
import { reportStatus } from './scan.ts';

export type ScanStatus = 'running' | 'done' | 'partial';

export interface ScanRecord {
  id: string;
  domain: string;
  url: string;
  status: ScanStatus;
  createdAt: string;
  finishedAt: string | null;
  report: Report | null;
}

// Where scans are kept. Scans are never updated after they finish, only added, so history and
// diffs are queries over old scans. Implementations: MemoryStore here, Postgres in its own package.
export interface Store {
  createScan(input: { domain: string; url: string }): Promise<ScanRecord>;
  // Raw layer output, kept so new fingerprints can be run on old scans. Saving the same
  // (scan, surface, layer) again replaces it, so a retried workflow step never duplicates.
  saveLayerResult(scanId: string, result: LayerResult): Promise<void>;
  // Stores the report and marks the scan done or partial. A finished scan cannot change.
  finishScan(scanId: string, report: Report): Promise<ScanRecord>;
  getScan(scanId: string): Promise<ScanRecord | null>;
  // The newest scan of a domain, running or finished.
  latestScan(domain: string): Promise<ScanRecord | null>;
  // A domain's scans, newest first, running or finished. For history and diffs.
  listScans(domain: string, options?: { limit?: number }): Promise<ScanRecord[]>;
}

export const DEFAULT_LIST_LIMIT = 20;

export class ScanNotFoundError extends Error {
  constructor(scanId: string) {
    super(`No scan with id ${scanId}`);
    this.name = 'ScanNotFoundError';
  }
}

export class ScanFinishedError extends Error {
  constructor(scanId: string) {
    super(`Scan ${scanId} has already finished`);
    this.name = 'ScanFinishedError';
  }
}

// Keeps everything in memory. For tests and one-off local scans.
export class MemoryStore implements Store {
  private readonly scans = new Map<string, ScanRecord>();
  private readonly layerResults = new Map<string, LayerResult>();
  private readonly now: () => Date;

  constructor(options: { now?: () => Date } = {}) {
    this.now = options.now ?? (() => new Date());
  }

  async createScan(input: { domain: string; url: string }): Promise<ScanRecord> {
    const record: ScanRecord = {
      id: crypto.randomUUID(),
      domain: input.domain.toLowerCase(),
      url: input.url,
      status: 'running',
      createdAt: this.now().toISOString(),
      finishedAt: null,
      report: null,
    };
    this.scans.set(record.id, record);
    return structuredClone(record);
  }

  async saveLayerResult(scanId: string, result: LayerResult): Promise<void> {
    this.running(scanId);
    const key = `${scanId} ${result.run.surfaceId} ${result.run.layer}`;
    this.layerResults.set(key, structuredClone(result));
  }

  async finishScan(scanId: string, report: Report): Promise<ScanRecord> {
    const record = this.running(scanId);
    record.status = reportStatus(report);
    record.finishedAt = this.now().toISOString();
    record.report = structuredClone(report);
    return structuredClone(record);
  }

  async getScan(scanId: string): Promise<ScanRecord | null> {
    const record = this.scans.get(scanId);
    return record ? structuredClone(record) : null;
  }

  async latestScan(domain: string): Promise<ScanRecord | null> {
    return (await this.listScans(domain, { limit: 1 }))[0] ?? null;
  }

  async listScans(domain: string, options: { limit?: number } = {}): Promise<ScanRecord[]> {
    // Map order is insertion order, so reversing breaks createdAt ties newest first.
    return [...this.scans.values()]
      .filter((record) => record.domain === domain.toLowerCase())
      .reverse()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, options.limit ?? DEFAULT_LIST_LIMIT)
      .map((record) => structuredClone(record));
  }

  // Raw layer results saved for a scan, for tests.
  layerResultsFor(scanId: string): LayerResult[] {
    return [...this.layerResults.entries()]
      .filter(([key]) => key.startsWith(`${scanId} `))
      .map(([, result]) => structuredClone(result));
  }

  private running(scanId: string): ScanRecord {
    const record = this.scans.get(scanId);
    if (!record) throw new ScanNotFoundError(scanId);
    if (record.status !== 'running') throw new ScanFinishedError(scanId);
    return record;
  }
}
