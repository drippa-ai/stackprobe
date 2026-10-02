import { expect, test } from 'vitest';
import { describeStore } from '../test/store-contract.ts';
import type { LayerResult } from './runner.ts';
import { MemoryStore } from './store.ts';

describeStore('MemoryStore', async () => new MemoryStore());

test('MemoryStore keeps one copy of a re-saved layer result', async () => {
  const store = new MemoryStore();
  const scan = await store.createScan({ domain: 'acme.test', url: 'https://acme.test/' });
  const result: LayerResult = {
    run: { layer: 'http', surfaceId: 'root', status: 'ok', durationMs: 1 },
    signals: [],
  };
  await store.saveLayerResult(scan.id, result);
  await store.saveLayerResult(scan.id, result);
  expect(store.layerResultsFor(scan.id)).toHaveLength(1);
});
