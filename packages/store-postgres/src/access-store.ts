import type { AccessStore, ApiKeyRecord, Subject, UsageEvent } from '@drippa/stackprobe-core';
import type { Sql } from './sql.ts';

interface KeyRow {
  id: string;
  prefix: string;
  scans_per_day: number;
  created_at: Date | string;
  revoked_at: Date | string | null;
}

const KEY_COLUMNS = 'id, prefix, scans_per_day, created_at, revoked_at';

// Keeps API keys and usage in Postgres, in the tables of migration 0003.
export class PostgresAccessStore implements AccessStore {
  private readonly sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  async createKey(input: {
    hash: string;
    prefix: string;
    ipHash: string;
    scansPerDay: number;
  }): Promise<ApiKeyRecord> {
    const [row] = await this.sql.query<KeyRow>(
      `insert into stackprobe.api_keys (hash, prefix, ip_hash, scans_per_day)
       values ($1, $2, $3, $4) returning ${KEY_COLUMNS}`,
      [input.hash, input.prefix, input.ipHash, input.scansPerDay],
    );
    return toKey(row as KeyRow);
  }

  async findKey(hash: string): Promise<ApiKeyRecord | null> {
    const [row] = await this.sql.query<KeyRow>(
      `select ${KEY_COLUMNS} from stackprobe.api_keys where hash = $1`,
      [hash],
    );
    return row ? toKey(row) : null;
  }

  async revokeKey(id: string): Promise<void> {
    await this.sql.query(
      'update stackprobe.api_keys set revoked_at = now() where id = $1 and revoked_at is null',
      [id],
    );
  }

  async countKeysCreated(ipHash: string, since: string): Promise<number> {
    const [row] = await this.sql.query<{ count: string | number }>(
      'select count(*) as count from stackprobe.api_keys where ip_hash = $1 and created_at >= $2',
      [ipHash, since],
    );
    return Number(row?.count ?? 0);
  }

  async recordUsage(event: UsageEvent): Promise<void> {
    await this.sql.query(
      'insert into stackprobe.usage (subject, endpoint, new_scan) values ($1, $2, $3)',
      [event.subject, event.endpoint, event.newScan],
    );
  }

  async countNewScans(subject: Subject, since: string): Promise<number> {
    const [row] = await this.sql.query<{ count: string | number }>(
      `select count(*) as count from stackprobe.usage
       where subject = $1 and new_scan and at >= $2`,
      [subject, since],
    );
    return Number(row?.count ?? 0);
  }

  async pruneUsage(before: string): Promise<number> {
    const rows = await this.sql.query<{ id: string }>(
      'delete from stackprobe.usage where at < $1 returning id',
      [before],
    );
    return rows.length;
  }
}

function toKey(row: KeyRow): ApiKeyRecord {
  return {
    id: row.id,
    prefix: row.prefix,
    scansPerDay: row.scans_per_day,
    createdAt: new Date(row.created_at).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
  };
}
