import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { describeStore } from '../../core/test/store-contract.ts';
import { SqliteStore } from './store.ts';

describeStore('SqliteStore', async () => new SqliteStore(':memory:'));

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test('keeps scans in the file between openings, and creates its folder', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stackprobe-'));
  dirs.push(dir);
  const path = join(dir, 'nested', 'scans.db');

  const first = new SqliteStore(path);
  const scan = await first.createScan({ domain: 'acme.test', url: 'https://acme.test/' });
  first.close();

  const second = new SqliteStore(path);
  expect(await second.getScan(scan.id)).toEqual(scan);
  second.close();
});

test('records detections for cross-scan queries', async () => {
  const store = new SqliteStore(':memory:');
  const scan = await store.createScan({ domain: 'acme.test', url: 'https://acme.test/' });
  await store.finishScan(scan.id, {
    schemaVersion: '1',
    domain: 'acme.test',
    scannedAt: '2026-10-04T12:00:00.000Z',
    fingerprintsVersion: 'abc',
    surfaces: [
      {
        id: 'root',
        url: 'https://acme.test/',
        kind: 'unclassified',
        kindConfidence: null,
        detections: [
          {
            tech: 'supabase',
            category: 'backend',
            version: null,
            confidence: 0.8,
            evidence: [{ type: 'observed', layer: 'http', ruleId: 'x', detail: 'x', weight: 0.8 }],
          },
        ],
      },
    ],
    layersRun: [],
  });
  // Reach into the database the way a "which apps use Supabase?" query would.
  const db = (store as unknown as { db: import('node:sqlite').DatabaseSync }).db;
  expect(db.prepare('select tech, confidence from detections').all()).toEqual([
    { tech: 'supabase', confidence: 0.8 },
  ]);
  store.close();
});
