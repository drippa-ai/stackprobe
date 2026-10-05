// Records every surface in fixtures/ground-truth.csv once, from the live sites:
//   pnpm record-ground-truth            records surfaces that have no recording yet
//   pnpm record-ground-truth --force    records them all again
//   pnpm record-ground-truth <filter>   only recordings whose name contains <filter>
// Records browser loads too when Chromium is installed
// (pnpm --filter @drippa/stackprobe-browser-playwright install-chromium).
// Also records a full scan (discovery included) of the homepage of every company with an app
// in the ground truth, into fixtures/domains/. Never run in CI. Then run `pnpm accuracy`.
import { existsSync } from 'node:fs';
import { playwrightIfInstalled } from '../../browser-playwright/src/index.ts';
import { NodeNet } from '../src/node/net.ts';
import { scan } from '../src/scan.ts';
import {
  DOMAINS_DIR,
  RECORDINGS_DIR,
  RecordingBrowser,
  RecordingNet,
  saveBrowserRecording,
  saveRecording,
} from '../test/fixtures.ts';
import { discoveryDomains, loadGroundTruth } from '../test/ground-truth.ts';

const args = process.argv.slice(2);
const force = args.includes('--force');
const filter = args.find((arg) => !arg.startsWith('--'));
const CONCURRENCY = 4;

const rows = loadGroundTruth().filter(
  (row) =>
    (!filter || row.recording.includes(filter)) &&
    (force || !existsSync(new URL(`${row.recording}/net.json`, RECORDINGS_DIR))),
);
const chromium = await playwrightIfInstalled();
console.log(
  `recording ${rows.length} surface(s)${chromium ? ', with the browser' : ' (no Chromium: no browser loads)'}`,
);

const queue = [...rows];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      // A scan of just this surface (rules only), so the recording holds exactly what the
      // accuracy report's replay asks for: the network, scripts for the bundle layer, and the
      // browser loads when Chromium is installed.
      const net = new RecordingNet(new NodeNet(), row.surfaceUrl);
      const browser = chromium ? new RecordingBrowser(chromium) : undefined;
      const report = await scan(row.surfaceUrl, {
        net,
        discover: false,
        ...(browser ? { browser } : {}),
      });
      saveRecording(row.recording, net.recording, RECORDINGS_DIR);
      if (browser && Object.keys(browser.recording).length) {
        saveBrowserRecording(row.recording, browser.recording);
      }
      const layers = report.layersRun.map((run) =>
        run.error ? `${run.layer} ${run.status} (${run.error.code})` : `${run.layer} ${run.status}`,
      );
      console.log(`${row.recording}: ${layers.join(', ')}`);
    }
  }),
);

const domains = discoveryDomains(loadGroundTruth()).filter(
  (domain) =>
    (!filter || domain.includes(filter)) &&
    (force || !existsSync(new URL(`${domain}/net.json`, DOMAINS_DIR))),
);
console.log(`recording ${domains.length} homepage scan(s)`);
const domainQueue = [...domains];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let domain = domainQueue.shift(); domain; domain = domainQueue.shift()) {
      const url = `https://${domain}/`;
      const net = new RecordingNet(new NodeNet(), url);
      const report = await scan(url, { net });
      saveRecording(domain, net.recording, DOMAINS_DIR);
      console.log(`${domain}: ${report.surfaces.map((s) => s.url).join(' ')}`);
    }
  }),
);
await chromium?.close();
