import type { LayerId, LayerResult, ScanStatus } from '@drippa/stackprobe-core';
import {
  browserStep,
  classifyStep,
  discoverStep,
  finishScanStep,
  planDeepStep,
  rootSurfaceStep,
  runBundleStep,
  runLayerStep,
} from './scan-steps.ts';

// The layers a hosted scan runs on the page asked for, one workflow step each. Kept in step with
// core's DEFAULT_LAYERS by a test: workflow code can't load core itself.
export const SCAN_LAYERS: LayerId[] = ['http', 'dns', 'tls'];

// One scan: the page asked for, then the surfaces it leads to. Every layer on every surface runs
// as its own step, in parallel, with its own retries.
export async function scanWorkflow(
  scanId: string,
  url: string,
  scannedAt: string,
): Promise<ScanStatus> {
  'use workflow';
  const root = await rootSurfaceStep(url);
  const rootResults = await Promise.all(
    SCAN_LAYERS.map((layer) => runLayerStep(scanId, root, layer)),
  );
  const planned = await discoverStep(root, rootResults);
  const others = await Promise.all(
    planned.map(async ({ surface, layers }) => ({
      target: surface,
      results: await Promise.all(layers.map((layer) => runLayerStep(scanId, surface, layer))),
    })),
  );
  const surfaces = [{ target: root, results: rootResults }, ...others];
  const classifications = await classifyStep(surfaces);
  // The deep layers where the product may be: a real browser (all pages in one go), then each
  // page's own scripts, including those the browser saw it load.
  const plans = await planDeepStep(surfaces, classifications);
  const browsed = await browserStep(scanId, plans);
  const bundled = await Promise.all(
    plans.map(async ({ surface, signals }) => ({
      id: surface.id,
      result: await runBundleStep(scanId, surface, [
        ...signals,
        ...(browsed[surface.id]?.signals ?? []),
      ]),
    })),
  );
  const withDeep = surfaces.map((s) => ({
    target: s.target,
    results: [
      ...s.results,
      ...(browsed[s.target.id] ? [browsed[s.target.id] as LayerResult] : []),
      ...bundled.filter((b) => b.id === s.target.id).map((b) => b.result),
    ],
  }));
  return finishScanStep(scanId, scannedAt, withDeep, classifications);
}
