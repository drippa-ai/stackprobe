import {
  buildReport,
  DEFAULT_LAYERS,
  discoverSurfaces,
  type LayerId,
  type LayerResult,
  layersForSurfaces,
  runLayer,
  ScanFinishedError,
  ScanNotFoundError,
  type ScanStatus,
  type SurfaceResults,
  type SurfaceTarget,
  surfaceTarget,
} from '@drippa/stackprobe-core';
import { FatalError } from 'workflow';
import { getNet, getStore } from '../lib/services.ts';

// The surface the user asked for. A step because workflow code can't load core.
export async function rootSurfaceStep(url: string): Promise<SurfaceTarget> {
  'use step';
  return surfaceTarget(url);
}

// Runs one layer on one surface and saves its raw result, so the scan keeps what it found
// even if a later step fails. runLayer never throws; only saving can, and then the step retries.
export async function runLayerStep(
  scanId: string,
  surface: SurfaceTarget,
  layerId: LayerId,
): Promise<LayerResult> {
  'use step';
  const layer = DEFAULT_LAYERS.find((candidate) => candidate.id === layerId);
  if (!layer) throw new FatalError(`Unknown layer ${layerId}`);
  const result = await runLayer(layer, surface, { net: getNet() });
  try {
    await getStore().saveLayerResult(scanId, result);
  } catch (error) {
    throw noRetryIfFinished(error);
  }
  return result;
}

export interface PlannedSurface {
  surface: SurfaceTarget;
  layers: LayerId[];
}

// Finds the other surfaces the scanned page leads to, and which layers each one needs.
export async function discoverStep(
  root: SurfaceTarget,
  rootResults: LayerResult[],
): Promise<PlannedSurface[]> {
  'use step';
  const found = await discoverSurfaces(
    root,
    rootResults.flatMap((result) => result.signals),
    { net: getNet() },
  );
  const plan = layersForSurfaces(found, DEFAULT_LAYERS, [root.host]);
  return found.map((surface) => ({
    surface,
    layers: (plan.get(surface.id) ?? []).map((layer) => layer.id),
  }));
}

// Builds the report from every surface's results and marks the scan done or partial.
export async function finishScanStep(
  scanId: string,
  scannedAt: string,
  surfaces: SurfaceResults[],
): Promise<ScanStatus> {
  'use step';
  const [root] = surfaces;
  if (!root) throw new FatalError('A scan needs at least one surface');
  const report = buildReport({
    domain: root.target.host,
    scannedAt: new Date(scannedAt),
    surfaces,
  });
  const store = getStore();
  try {
    return (await store.finishScan(scanId, report)).status;
  } catch (error) {
    // A retry after the first attempt already finished the scan: nothing left to do.
    if (error instanceof ScanFinishedError) {
      const scan = await store.getScan(scanId);
      if (scan) return scan.status;
    }
    throw noRetryIfFinished(error);
  }
}

function noRetryIfFinished(error: unknown): unknown {
  if (error instanceof ScanFinishedError || error instanceof ScanNotFoundError) {
    return new FatalError(error.message);
  }
  return error;
}
