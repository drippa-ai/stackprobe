import {
  type LayerResult,
  type Report,
  reportStatus,
  ScanFinishedError,
  ScanNotFoundError,
  type ScanRecord,
  type ScanStatus,
  type Store,
} from '@drippa/stackprobe-core';
import type { Sql } from './sql.ts';

interface ScanRow {
  id: string;
  domain: string;
  url: string;
  status: ScanStatus;
  created_at: Date | string;
  finished_at: Date | string | null;
  report: Report | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCAN_COLUMNS = 'id, domain, url, status, created_at, finished_at, report';
// JSON goes in as text and is cast with $n::text::jsonb. With a bare $n::jsonb, postgres.js
// JSON-encodes the already encoded text again, and the column ends up holding a JSON string.

// Stores scans in Postgres, in the `stackprobe` schema created by migrate().
export class PostgresStore implements Store {
  private readonly sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  async createScan(input: { domain: string; url: string }): Promise<ScanRecord> {
    const [row] = await this.sql.query<ScanRow>(
      `insert into stackprobe.scans (domain, url) values ($1, $2) returning ${SCAN_COLUMNS}`,
      [input.domain.toLowerCase(), input.url],
    );
    return toRecord(row as ScanRow);
  }

  async saveLayerResult(scanId: string, result: LayerResult): Promise<void> {
    const { run, signals } = result;
    const saved = UUID.test(scanId)
      ? await this.sql.query(
          `insert into stackprobe.layer_results
             (scan_id, surface_id, layer, status, duration_ms, error, signals)
           select $1, $2, $3, $4, $5, $6::text::jsonb, $7::text::jsonb
           where exists (select 1 from stackprobe.scans where id = $1 and status = 'running')
           on conflict (scan_id, surface_id, layer) do update set
             status = excluded.status,
             duration_ms = excluded.duration_ms,
             error = excluded.error,
             signals = excluded.signals
           returning scan_id`,
          [
            scanId,
            run.surfaceId,
            run.layer,
            run.status,
            Math.round(run.durationMs),
            run.error ? JSON.stringify(run.error) : null,
            JSON.stringify(signals),
          ],
        )
      : [];
    if (saved.length === 0) await this.throwNotRunning(scanId);
  }

  async finishScan(scanId: string, report: Report): Promise<ScanRecord> {
    if (!UUID.test(scanId)) throw new ScanNotFoundError(scanId);
    const row = await this.sql.transaction(async (tx) => {
      const [updated] = await tx.query<ScanRow>(
        `update stackprobe.scans
         set status = $2, finished_at = now(), fingerprints_version = $3, report = $4::text::jsonb
         where id = $1 and status = 'running'
         returning ${SCAN_COLUMNS}`,
        [scanId, reportStatus(report), report.fingerprintsVersion, JSON.stringify(report)],
      );
      if (!updated) return null;
      for (const surface of report.surfaces) {
        for (const detection of surface.detections) {
          await tx.query(
            `insert into stackprobe.detections
               (scan_id, surface_url, tech, category, version, confidence)
             values ($1, $2, $3, $4, $5, $6)`,
            [
              scanId,
              surface.url,
              detection.tech,
              detection.category,
              detection.version,
              detection.confidence,
            ],
          );
        }
      }
      return updated;
    });
    if (!row) return this.throwNotRunning(scanId);
    return toRecord(row);
  }

  async getScan(scanId: string): Promise<ScanRecord | null> {
    if (!UUID.test(scanId)) return null;
    const [row] = await this.sql.query<ScanRow>(
      `select ${SCAN_COLUMNS} from stackprobe.scans where id = $1`,
      [scanId],
    );
    return row ? toRecord(row) : null;
  }

  async latestScan(domain: string): Promise<ScanRecord | null> {
    const [row] = await this.sql.query<ScanRow>(
      `select ${SCAN_COLUMNS} from stackprobe.scans
       where domain = $1 order by created_at desc limit 1`,
      [domain.toLowerCase()],
    );
    return row ? toRecord(row) : null;
  }

  private async throwNotRunning(scanId: string): Promise<never> {
    const existing = await this.getScan(scanId);
    throw existing ? new ScanFinishedError(scanId) : new ScanNotFoundError(scanId);
  }
}

function toRecord(row: ScanRow): ScanRecord {
  return {
    id: row.id,
    domain: row.domain,
    url: row.url,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    report: row.report,
  };
}
