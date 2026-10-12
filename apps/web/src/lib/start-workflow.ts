import type { ScanRecord } from '@drippa/stackprobe-core';
import { start } from 'workflow/api';
import { scanWorkflow } from '../workflows/scan.ts';

// Runs a new scan in the background. Shared by the website's forms and the HTTP API.
export async function startScanWorkflow(scan: ScanRecord): Promise<void> {
  await start(scanWorkflow, [scan.id, scan.url, scan.createdAt]);
}
