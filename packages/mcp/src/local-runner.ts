import {
  type Browser,
  type Decider,
  type Net,
  type ScanRecord,
  type Store,
  scan,
} from '@drippa/stackprobe-core';

// Runs a created scan in this process, discovery included, and stores everything it finds. The
// hosted app runs the same pieces as workflow steps instead.
export async function runScanLocally(
  store: Store,
  net: Net,
  record: ScanRecord,
  extras: { decider?: Decider | undefined; browser?: Browser | undefined } = {},
): Promise<void> {
  const report = await scan(record.url, {
    net,
    now: () => new Date(record.createdAt),
    onLayerResult: (result) => store.saveLayerResult(record.id, result),
    ...(extras.decider ? { decider: extras.decider } : {}),
    ...(extras.browser ? { browser: extras.browser } : {}),
  });
  await store.finishScan(record.id, report);
}
