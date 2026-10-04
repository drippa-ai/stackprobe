import type { Report } from '@drippa/stackprobe-core';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { connectPostgres } from './index.ts';
import { migrate } from './migrate.ts';
import { fromPostgresJs } from './sql.ts';
import type { PostgresStore } from './store.ts';

// The production client (postgres.js) over a real wire connection, to an in-process database.
// postgres.js encodes parameters by the type the server reports, which PGlite's own client doesn't.
let db: PGlite;
let server: PGLiteSocketServer;
let store: PostgresStore;
let close: () => Promise<void>;

beforeAll(async () => {
  db = await PGlite.create();
  server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0 });
  await server.start();
  const url = `postgres://postgres@${server.getServerConn()}/postgres`;
  const migrator = postgres(url, { max: 1 });
  await migrate(fromPostgresJs(migrator));
  await migrator.end();
  // The same connection settings production uses.
  ({ store, close } = connectPostgres(url));
});

afterAll(async () => {
  await close();
  await server.stop();
  await db.close();
});

test('stores reports and layer results as JSON objects, not JSON strings', async () => {
  const scan = await store.createScan({ domain: 'acme.test', url: 'https://acme.test/' });
  await store.saveLayerResult(scan.id, {
    run: {
      layer: 'http',
      surfaceId: 'root',
      status: 'failed',
      durationMs: 5,
      error: { code: 'CONNECT_FAILED', message: 'refused' },
    },
    signals: [{ layer: 'http', kind: 'header', key: 'server', value: 'Vercel' }],
  });
  const report: Report = {
    schemaVersion: '1',
    domain: 'acme.test',
    scannedAt: '2026-10-04T12:00:00.000Z',
    fingerprintsVersion: 'test',
    surfaces: [],
    layersRun: [],
  };
  const finished = await store.finishScan(scan.id, report);

  expect(finished.report).toEqual(report);
  expect((await store.getScan(scan.id))?.report).toEqual(report);
  const types = await db.query(
    `select jsonb_typeof(s.report) as report, jsonb_typeof(l.signals) as signals,
            jsonb_typeof(l.error) as error
     from stackprobe.scans s join stackprobe.layer_results l on l.scan_id = s.id`,
  );
  expect(types.rows).toEqual([{ report: 'object', signals: 'array', error: 'object' }]);
});
