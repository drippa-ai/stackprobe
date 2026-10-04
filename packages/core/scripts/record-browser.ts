// Records, in a local headless Chromium, the browser loads a scan of each ground-truth surface
// would make (its app surfaces, or an unclassified homepage), into recordings/<name>/browser.json:
//   pnpm record-browser            surfaces without a browser recording yet
//   pnpm record-browser --force    all of them again
//   pnpm record-browser <filter>   only recordings whose name contains <filter>
// Needs Chromium: pnpm --filter @drippa/stackprobe-browser-playwright install-chromium
// Never run in CI. Then run `pnpm accuracy`.
import { existsSync } from 'node:fs';
import { PlaywrightBrowser } from '../../browser-playwright/src/index.ts';
import { scan } from '../src/scan.ts';
import {
  loadRecording,
  RECORDINGS_DIR,
  RecordingBrowser,
  ReplayNet,
  saveBrowserRecording,
} from '../test/fixtures.ts';
import { loadGroundTruth } from '../test/ground-truth.ts';

const args = process.argv.slice(2);
const force = args.includes('--force');
const filter = args.find((arg) => !arg.startsWith('--'));
const CONCURRENCY = 3;

const rows = loadGroundTruth().filter(
  (row) =>
    (!filter || row.recording.includes(filter)) &&
    existsSync(new URL(`${row.recording}/net.json`, RECORDINGS_DIR)) &&
    (force || !existsSync(new URL(`${row.recording}/browser.json`, RECORDINGS_DIR))),
);
console.log(`checking ${rows.length} surface(s)`);
const chromium = new PlaywrightBrowser();
const queue = [...rows];
try {
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        const browser = new RecordingBrowser(chromium);
        const recording = loadRecording(row.recording);
        const report = await scan(row.surfaceUrl, {
          discover: false,
          net: new ReplayNet(recording),
          browser,
        });
        const loads = Object.keys(browser.recording);
        if (loads.length === 0) {
          console.log(`${row.recording}: no browser load (${report.surfaces[0]?.kind})`);
          continue;
        }
        saveBrowserRecording(row.recording, browser.recording);
        const run = report.layersRun.find((r) => r.layer === 'browser');
        const found = report.surfaces[0]?.detections
          .filter((d) => d.evidence.some((e) => e.layer === 'browser'))
          .map((d) => d.tech);
        console.log(
          `${row.recording}: ${run?.status} ${run?.error?.message ?? ''} browser saw ${found?.join(' ') || 'nothing'}`,
        );
      }
    }),
  );
} finally {
  await chromium.close();
}
