import {
  buildReport,
  bundleLayer,
  type Classification,
  classifySurfaces,
  DEFAULT_LAYERS,
  deepTargets,
  discoverSurfaces,
  firstPartyScripts,
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
import { getDecider, getNet, getStore } from '../lib/services.ts';

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

export interface DeepPlan {
  surface: SurfaceTarget;
  scripts: string[];
}

// Which surfaces get the deep layers (the product app, an unclassified homepage), and the
// page's own scripts for each.
export async function planDeepStep(
  surfaces: SurfaceResults[],
  classifications: Record<string, Classification>,
): Promise<DeepPlan[]> {
  'use step';
  return deepTargets(surfaces, classifications).map((surface) => {
    const own = surfaces.find((s) => s.target.id === surface.id);
    const signals = own?.results.flatMap((result) => result.signals) ?? [];
    return { surface, scripts: firstPartyScripts(signals, surface.url) };
  });
}

// Reads one surface's own scripts for the services and SDKs they mention, and saves the result.
export async function runBundleStep(
  scanId: string,
  surface: SurfaceTarget,
  scripts: string[],
): Promise<LayerResult> {
  'use step';
  const result = await runLayer(bundleLayer(scripts), surface, { net: getNet() });
  try {
    await getStore().saveLayerResult(scanId, result);
  } catch (error) {
    throw noRetryIfFinished(error);
  }
  return result;
}

// Decides what kind each surface is: rules first, a decision model when one is configured.
export async function classifyStep(
  surfaces: SurfaceResults[],
): Promise<Record<string, Classification>> {
  'use step';
  const decider = getDecider();
  return classifySurfaces(surfaces, decider ? { decider } : {});
}

// Builds the report from every surface's results and marks the scan done or partial.
export async function finishScanStep(
  scanId: string,
  scannedAt: string,
  surfaces: SurfaceResults[],
  classifications: Record<string, Classification> = {},
): Promise<ScanStatus> {
  'use step';
  const [root] = surfaces;
  if (!root) throw new FatalError('A scan needs at least one surface');
  const report = buildReport({
    domain: root.target.host,
    scannedAt: new Date(scannedAt),
    surfaces,
    classifications,
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
