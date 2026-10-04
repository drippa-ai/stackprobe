import type { LayerId, ScanStatus } from '@drippa/stackprobe-core';
import { finishScanStep, runLayerStep } from './scan-steps.ts';

// The layers a hosted scan runs, one workflow step each. Kept in step with core's
// DEFAULT_LAYERS by a test: workflow code can't load core itself.
export const SCAN_LAYERS: LayerId[] = ['http', 'dns', 'tls'];

// One scan of one URL. Every layer runs as its own step, in parallel, with its own retries.
export async function scanWorkflow(
  scanId: string,
  url: string,
  scannedAt: string,
): Promise<ScanStatus> {
  'use workflow';
  const results = await Promise.all(SCAN_LAYERS.map((layer) => runLayerStep(scanId, url, layer)));
  return finishScanStep(scanId, url, scannedAt, results);
}
