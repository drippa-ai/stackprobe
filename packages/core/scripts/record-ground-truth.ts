// Records every surface in fixtures/ground-truth.csv once, from the live sites:
//   pnpm record-ground-truth            records surfaces that have no recording yet
//   pnpm record-ground-truth --force    records them all again
//   pnpm record-ground-truth <filter>   only recordings whose name contains <filter>
// Also records a full scan (discovery included) of the homepage of every company with an app
// in the ground truth, into fixtures/domains/. Never run in CI. Then run `pnpm accuracy`.
import { existsSync } from 'node:fs';
import { DEFAULT_LAYERS } from '../src/layers/index.ts';
import { NodeNet } from '../src/node/net.ts';
import { runLayers } from '../src/runner.ts';
import { scan } from '../src/scan.ts';
import { surfaceTarget } from '../src/surface.ts';
import { DOMAINS_DIR, RECORDINGS_DIR, RecordingNet, saveRecording } from '../test/fixtures.ts';
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
console.log(`recording ${rows.length} surface(s)`);

const queue = [...rows];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      const net = new RecordingNet(new NodeNet(), row.surfaceUrl);
      const results = await runLayers(DEFAULT_LAYERS, surfaceTarget(row.surfaceUrl), { net });
      saveRecording(row.recording, net.recording, RECORDINGS_DIR);
      const layers = results.map(({ run }) =>
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
