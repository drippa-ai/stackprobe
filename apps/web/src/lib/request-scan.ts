import {
  SCAN_BUDGET_MS,
  type ScanRecord,
  type Store,
  surfaceTarget,
} from '@drippa/stackprobe-core';

// A finished scan younger than this is returned instead of scanning again.
export const FRESH_FOR_MS = 24 * 60 * 60 * 1000;
// A scan still running after this never finished (its workflow failed to start or died),
// so it no longer blocks a new scan of the domain.
export const STALE_AFTER_MS = 5 * SCAN_BUDGET_MS;

export interface RequestScanDeps {
  store: Store;
  // Starts the scan's workflow. Called once per new scan.
  start(scan: ScanRecord): Promise<void>;
  now?: () => Date;
}

// Returns the scan to show for what the user typed: the running one, a fresh one, or a new one.
// Throws TypeError when the input is not a domain or URL.
export async function requestScan(
  input: string,
  deps: RequestScanDeps,
  options: { force?: boolean } = {},
): Promise<ScanRecord> {
  const target = surfaceTarget(input);
  const now = (deps.now?.() ?? new Date()).getTime();
  const latest = await deps.store.latestScan(target.host);

  if (latest?.status === 'running') {
    if (now - Date.parse(latest.createdAt) < STALE_AFTER_MS) return latest;
  } else if (latest?.finishedAt && !options.force) {
    if (now - Date.parse(latest.finishedAt) < FRESH_FOR_MS) return latest;
  }

  const scan = await deps.store.createScan({ domain: target.host, url: target.url });
  await deps.start(scan);
  return scan;
}
