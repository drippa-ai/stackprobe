import { describe, expect, test } from 'vitest';
import type { Report } from '../src/report.ts';
import type { LayerResult } from '../src/runner.ts';
import type { Store } from '../src/store.ts';

// The behaviour every Store must have. Each implementation runs this suite.
export function describeStore(name: string, makeStore: () => Promise<Store>) {
  const result = (layer: 'http' | 'dns', status: 'ok' | 'failed' = 'ok'): LayerResult => ({
    run: { layer, surfaceId: 'root', status, durationMs: 12 },
    signals: [
      { layer, kind: 'header', key: 'server', value: 'Vercel', source: 'https://acme.test/' },
    ],
  });

  const report = (status: 'ok' | 'failed' = 'ok'): Report => ({
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
                detail: 'header server: Vercel',
                weight: 0.9,
              },
            ],
          },
        ],
      },
    ],
    layersRun: [result('http').run, result('dns', status).run],
  });

  describe(`${name} (Store)`, () => {
    test('creates a running scan', async () => {
      const store = await makeStore();
      const scan = await store.createScan({ domain: 'Acme.test', url: 'https://acme.test/' });
      expect(scan).toMatchObject({
        domain: 'acme.test',
        url: 'https://acme.test/',
        status: 'running',
        finishedAt: null,
        report: null,
      });
      expect(await store.getScan(scan.id)).toEqual(scan);
    });

    test('finishes a scan with its report', async () => {
      const store = await makeStore();
      const scan = await store.createScan({ domain: 'acme.test', url: 'https://acme.test/' });
      await store.saveLayerResult(scan.id, result('http'));
      const finished = await store.finishScan(scan.id, report());
      expect(finished).toMatchObject({ id: scan.id, status: 'done', report: report() });
      expect(finished.finishedAt).not.toBeNull();
      expect(await store.getScan(scan.id)).toEqual(finished);
    });

    test('marks a scan with a failed layer as partial', async () => {
      const store = await makeStore();
      const scan = await store.createScan({ domain: 'acme.test', url: 'https://acme.test/' });
      expect((await store.finishScan(scan.id, report('failed'))).status).toBe('partial');
    });

    test('saving the same layer result twice keeps one copy', async () => {
      const store = await makeStore();
      const scan = await store.createScan({ domain: 'acme.test', url: 'https://acme.test/' });
      await store.saveLayerResult(scan.id, result('http'));
      await expect(store.saveLayerResult(scan.id, result('http'))).resolves.toBeUndefined();
    });

    test('a finished scan cannot change', async () => {
      const store = await makeStore();
      const scan = await store.createScan({ domain: 'acme.test', url: 'https://acme.test/' });
      await store.finishScan(scan.id, report());
      await expect(store.finishScan(scan.id, report())).rejects.toThrow(/already finished/);
      await expect(store.saveLayerResult(scan.id, result('dns'))).rejects.toThrow(
        /already finished/,
      );
    });

    test('rejects unknown scans', async () => {
      const store = await makeStore();
      const id = '00000000-0000-4000-8000-000000000000';
      expect(await store.getScan(id)).toBeNull();
      await expect(store.finishScan(id, report())).rejects.toThrow(/No scan/);
    });

    test('finds the newest scan of a domain', async () => {
      const store = await makeStore();
      expect(await store.latestScan('acme.test')).toBeNull();
      const first = await store.createScan({ domain: 'acme.test', url: 'https://acme.test/' });
      await store.finishScan(first.id, report());
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await store.createScan({ domain: 'acme.test', url: 'https://acme.test/' });
      await store.createScan({ domain: 'other.test', url: 'https://other.test/' });
      expect((await store.latestScan('ACME.test'))?.id).toBe(second.id);
    });

    test('lists the scans of a domain, newest first', async () => {
      const store = await makeStore();
      expect(await store.listScans('acme.test')).toEqual([]);
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        ids.push((await store.createScan({ domain: 'acme.test', url: 'https://acme.test/' })).id);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await store.createScan({ domain: 'other.test', url: 'https://other.test/' });
      expect((await store.listScans('ACME.test')).map((scan) => scan.id)).toEqual(ids.reverse());
      expect((await store.listScans('acme.test', { limit: 2 })).map((scan) => scan.id)).toEqual(
        ids.slice(0, 2),
      );
    });
  });
}
