import {
  buildReport,
  DEFAULT_LAYERS,
  type LayerId,
  type LayerResult,
  runLayer,
  ScanFinishedError,
  ScanNotFoundError,
  type ScanStatus,
  surfaceTarget,
} from '@drippa/stackprobe-core';
import { FatalError } from 'workflow';
import { getNet, getStore } from '../lib/services.ts';

// Runs one layer on the scanned URL and saves its raw result, so the scan keeps what it found
// even if a later step fails. runLayer never throws; only saving can, and then the step retries.
export async function runLayerStep(
  scanId: string,
  url: string,
  layerId: LayerId,
): Promise<LayerResult> {
  'use step';
  const layer = DEFAULT_LAYERS.find((candidate) => candidate.id === layerId);
  if (!layer) throw new FatalError(`Unknown layer ${layerId}`);
  const result = await runLayer(layer, surfaceTarget(url), { net: getNet() });
  try {
    await getStore().saveLayerResult(scanId, result);
  } catch (error) {
    throw noRetryIfFinished(error);
  }
  return result;
}

// Builds the report from every layer's result and marks the scan done or partial.
export async function finishScanStep(
  scanId: string,
  url: string,
  scannedAt: string,
  results: LayerResult[],
): Promise<ScanStatus> {
  'use step';
  const target = surfaceTarget(url);
  const report = buildReport({
    domain: target.host,
    scannedAt: new Date(scannedAt),
    surfaces: [{ target, results }],
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
