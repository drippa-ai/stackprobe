import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, test } from 'vitest';
import { describeStore } from '../../core/test/store-contract.ts';
import { migrate } from './migrate.ts';
import type { Sql } from './sql.ts';
import { PostgresStore } from './store.ts';

// A real Postgres engine running inside Node: no Docker, no live database.
function fromPGlite(db: Pick<PGlite, 'query' | 'exec' | 'transaction'>): Sql {
  return {
    query: async <T>(text: string, params: unknown[] = []) =>
      (await db.query<T>(text, params)).rows,
    exec: async (text) => {
      await db.exec(text);
    },
    transaction: (fn) =>
      'transaction' in db && db.transaction
        ? db.transaction((tx) => fn(fromPGlite(tx as unknown as PGlite)))
        : fn(fromPGlite(db)),
  };
}

async function freshDatabase(): Promise<Sql> {
  const sql = fromPGlite(new PGlite());
  await migrate(sql);
  return sql;
}

// The first PGlite in a process compiles its WebAssembly, which can take seconds on a busy
// machine. Do it here, with its own time limit, so no test pays for it.
beforeAll(async () => {
  await (await PGlite.create()).close();
}, 60_000);

describeStore('PostgresStore', async () => new PostgresStore(await freshDatabase()));

describe('migrate', () => {
  test('applies each migration once', async () => {
    const sql = fromPGlite(new PGlite());
    expect(await migrate(sql)).toEqual(['0001_scans.sql', '0002_unwrap_json_strings.sql']);
    expect(await migrate(sql)).toEqual([]);
  });

  test('locks every table behind row level security', async () => {
    const sql = await freshDatabase();
    const tables = await sql.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'stackprobe' and c.relkind = 'r' order by c.relname`,
    );
    expect(tables).toEqual([
      { relname: 'detections', relrowsecurity: true },
      { relname: 'layer_results', relrowsecurity: true },
      { relname: 'migrations', relrowsecurity: true },
      { relname: 'scans', relrowsecurity: true },
    ]);
  });
});

test('finishing a scan records its detections for cross-scan queries', async () => {
  const sql = await freshDatabase();
  const store = new PostgresStore(sql);
  const scan = await store.createScan({ domain: 'acme.test', url: 'https://acme.test/' });
  await store.saveLayerResult(scan.id, {
    run: { layer: 'http', surfaceId: 'root', status: 'ok', durationMs: 3.7 },
    signals: [{ layer: 'http', kind: 'header', key: 'server', value: 'Vercel' }],
  });
  await store.finishScan(scan.id, {
    schemaVersion: '1',
    domain: 'acme.test',
    scannedAt: '2026-10-02T12:00:00.000Z',
    fingerprintsVersion: 'abc',
    surfaces: [
      {
        id: 'root',
        url: 'https://acme.test/',
        kind: 'unclassified',
        kindConfidence: null,
        detections: [
          {
            tech: 'vercel',
            category: 'hosting',
            version: null,
            confidence: 0.9,
            evidence: [
              {
                type: 'observed',
                layer: 'http',
                ruleId: 'vercel/header-server',
                detail: 'x',
                weight: 0.9,
              },
            ],
          },
        ],
      },
    ],
    layersRun: [{ layer: 'http', surfaceId: 'root', status: 'ok', durationMs: 3.7 }],
  });

  expect(
    await sql.query(
      'select tech, category, confidence from stackprobe.detections where scan_id = $1',
      [scan.id],
    ),
  ).toEqual([{ tech: 'vercel', category: 'hosting', confidence: 0.9 }]);
  expect(
    await sql.query('select layer, status, duration_ms, signals from stackprobe.layer_results'),
  ).toEqual([
    {
      layer: 'http',
      status: 'ok',
      duration_ms: 4,
      signals: [{ layer: 'http', kind: 'header', key: 'server', value: 'Vercel' }],
    },
  ]);
});

test('ids that are not UUIDs are simply not found', async () => {
  const store = new PostgresStore(await freshDatabase());
  expect(await store.getScan('not-a-uuid')).toBeNull();
  await expect(store.finishScan('not-a-uuid', {} as never)).rejects.toThrow(/No scan/);
});

test('0002 unwraps JSON that an earlier version stored as a string', async () => {
  const sql = await freshDatabase();
  const [scan] = await sql.query<{ id: string }>(
    `insert into stackprobe.scans (domain, url, status, report)
     values ('acme.test', 'https://acme.test/', 'done', to_jsonb('{"domain":"acme.test"}'::text))
     returning id`,
  );
  await sql.query(
    `insert into stackprobe.layer_results
       (scan_id, surface_id, layer, status, duration_ms, error, signals)
     values ($1, 'root', 'http', 'failed', 1, to_jsonb('{"code":"TIMEOUT"}'::text),
             to_jsonb('[]'::text))`,
    [scan?.id],
  );

  const repair = readFileSync(
    new URL('../migrations/0002_unwrap_json_strings.sql', import.meta.url),
  );
  await sql.exec(repair.toString());
  await sql.exec(repair.toString());

  expect(await sql.query('select report from stackprobe.scans')).toEqual([
    { report: { domain: 'acme.test' } },
  ]);
  expect(await sql.query('select error, signals from stackprobe.layer_results')).toEqual([
    { error: { code: 'TIMEOUT' }, signals: [] },
  ]);
});
