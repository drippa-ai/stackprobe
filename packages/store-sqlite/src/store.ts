import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_LIST_LIMIT,
  type LayerResult,
  type LayerRun,
  type Report,
  reportStatus,
  ScanFinishedError,
  ScanNotFoundError,
  type ScanRecord,
  type ScanStatus,
  type Store,
} from '@drippa/stackprobe-core';
import { MIGRATIONS } from './schema.ts';

interface ScanRow {
  id: string;
  domain: string;
  url: string;
  status: ScanStatus;
  created_at: string;
  finished_at: string | null;
  report: string | null;
}

const SCAN_COLUMNS = 'id, domain, url, status, created_at, finished_at, report';

// Where local tools (MCP server, CLI) keep scans unless told otherwise.
export function defaultDatabasePath(): string {
  return join(homedir(), '.stackprobe', 'scans.db');
}

// Stores scans in a SQLite file, or in memory with ':memory:'. Opening applies the schema.
export class SqliteStore implements Store {
  private readonly db: DatabaseSync;
  private readonly now: () => Date;

  constructor(path: string = defaultDatabasePath(), options: { now?: () => Date } = {}) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('pragma foreign_keys = on; pragma journal_mode = wal;');
    this.migrate();
    this.now = options.now ?? (() => new Date());
  }

  close(): void {
    this.db.close();
  }

  async createScan(input: { domain: string; url: string }): Promise<ScanRecord> {
    const row = this.db
      .prepare(
        `insert into scans (id, domain, url, status, created_at)
         values (?, ?, ?, 'running', ?) returning ${SCAN_COLUMNS}`,
      )
      .get(crypto.randomUUID(), input.domain.toLowerCase(), input.url, this.timestamp());
    return toRecord(row as unknown as ScanRow);
  }

  async saveLayerResult(scanId: string, result: LayerResult): Promise<void> {
    this.running(scanId);
    const { run, signals } = result;
    this.db
      .prepare(
        `insert into layer_results (scan_id, surface_id, layer, status, duration_ms, error, signals)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict (scan_id, surface_id, layer) do update set
           status = excluded.status,
           duration_ms = excluded.duration_ms,
           error = excluded.error,
           signals = excluded.signals`,
      )
      .run(
        scanId,
        run.surfaceId,
        run.layer,
        run.status,
        Math.round(run.durationMs),
        run.error ? JSON.stringify(run.error) : null,
        JSON.stringify(signals),
      );
  }

  async finishScan(scanId: string, report: Report): Promise<ScanRecord> {
    this.running(scanId);
    return this.transaction(() => {
      const row = this.db
        .prepare(
          `update scans set status = ?, finished_at = ?, fingerprints_version = ?, report = ?
           where id = ? and status = 'running' returning ${SCAN_COLUMNS}`,
        )
        .get(
          reportStatus(report),
          this.timestamp(),
          report.fingerprintsVersion,
          JSON.stringify(report),
          scanId,
        ) as unknown as ScanRow;
      const insert = this.db.prepare(
        `insert into detections (scan_id, surface_url, tech, category, version, confidence)
         values (?, ?, ?, ?, ?, ?)`,
      );
      for (const surface of report.surfaces) {
        for (const d of surface.detections) {
          insert.run(scanId, surface.url, d.tech, d.category, d.version, d.confidence);
        }
      }
      return toRecord(row);
    });
  }

  async listLayerRuns(scanId: string): Promise<LayerRun[]> {
    const rows = this.db
      .prepare(
        `select surface_id, layer, status, duration_ms, error
         from layer_results where scan_id = ?`,
      )
      .all(scanId);
    return (rows as unknown as LayerRunRow[]).map(toRun);
  }

  async getScan(scanId: string): Promise<ScanRecord | null> {
    const row = this.db.prepare(`select ${SCAN_COLUMNS} from scans where id = ?`).get(scanId);
    return row ? toRecord(row as unknown as ScanRow) : null;
  }

  async latestScan(domain: string): Promise<ScanRecord | null> {
    return (await this.listScans(domain, { limit: 1 }))[0] ?? null;
  }

  async listScans(domain: string, options: { limit?: number } = {}): Promise<ScanRecord[]> {
    const rows = this.db
      .prepare(
        `select ${SCAN_COLUMNS} from scans where domain = ?
         order by created_at desc, rowid desc limit ?`,
      )
      .all(domain.toLowerCase(), options.limit ?? DEFAULT_LIST_LIMIT);
    return (rows as unknown as ScanRow[]).map(toRecord);
  }

  private running(scanId: string): void {
    const row = this.db.prepare('select status from scans where id = ?').get(scanId) as
      | { status: ScanStatus }
      | undefined;
    if (!row) throw new ScanNotFoundError(scanId);
    if (row.status !== 'running') throw new ScanFinishedError(scanId);
  }

  private migrate(): void {
    const { user_version: version } = this.db.prepare('pragma user_version').get() as {
      user_version: number;
    };
    MIGRATIONS.slice(version).forEach((sql, i) => {
      this.transaction(() => {
        this.db.exec(sql);
        this.db.exec(`pragma user_version = ${version + i + 1}`);
      });
    });
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec('begin');
    try {
      const result = fn();
      this.db.exec('commit');
      return result;
    } catch (error) {
      this.db.exec('rollback');
      throw error;
    }
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

interface LayerRunRow {
  surface_id: string;
  layer: LayerRun['layer'];
  status: LayerRun['status'];
  duration_ms: number;
  error: string | null;
}

function toRun(row: LayerRunRow): LayerRun {
  return {
    layer: row.layer,
    surfaceId: row.surface_id,
    status: row.status,
    durationMs: Number(row.duration_ms),
    ...(row.error ? { error: JSON.parse(row.error) as LayerRun['error'] } : {}),
  };
}

function toRecord(row: ScanRow): ScanRecord {
  return {
    id: row.id,
    domain: row.domain,
    url: row.url,
    status: row.status,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    report: row.report ? (JSON.parse(row.report) as Report) : null,
  };
}
