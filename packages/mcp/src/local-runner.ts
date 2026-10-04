import {
  buildReport,
  DEFAULT_LAYERS,
  type Net,
  runLayers,
  SCAN_BUDGET_MS,
  type ScanRecord,
  type Store,
  surfaceTarget,
} from '@drippa/stackprobe-core';

// Runs a created scan in this process and stores everything it finds. The hosted app does the
// same steps as a workflow instead.
export async function runScanLocally(store: Store, net: Net, scan: ScanRecord): Promise<void> {
  const target = surfaceTarget(scan.url);
  const results = await runLayers(DEFAULT_LAYERS, target, {
    net,
    signal: AbortSignal.timeout(SCAN_BUDGET_MS),
  });
  for (const result of results) await store.saveLayerResult(scan.id, result);
  const report = buildReport({
    domain: target.host,
    scannedAt: new Date(scan.createdAt),
    surfaces: [{ target, results }],
  });
  await store.finishScan(scan.id, report);
}
