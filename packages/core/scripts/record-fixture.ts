// Records one real scan of a site as a test fixture:
//   pnpm record-fixture <name> <url>
// Writes fixtures/sites/<name>/net.json and prints what was detected, to help write
// expected.json by hand. Never run in CI.
import { detect } from '../src/detect.ts';
import { builtinFingerprints } from '../src/fingerprints/index.ts';
import { DEFAULT_LAYERS } from '../src/layers/index.ts';
import { NodeNet } from '../src/node/net.ts';
import { runLayers } from '../src/runner.ts';
import { surfaceTarget } from '../src/surface.ts';
import { RecordingNet, saveRecording } from '../test/fixtures.ts';

const [name, input] = process.argv.slice(2);
if (!name || !input || !/^[a-z0-9-]+$/.test(name)) {
  console.error(
    'usage: pnpm record-fixture <name> <url>   (name: lower-case letters, digits, dashes)',
  );
  process.exit(1);
}

const surface = surfaceTarget(input);
const net = new RecordingNet(new NodeNet(), surface.url);
const results = await runLayers(DEFAULT_LAYERS, surface, { net });
saveRecording(name, net.recording);

for (const { run } of results) {
  console.log(
    `${run.layer}: ${run.status}${run.error ? ` (${run.error.code}: ${run.error.message})` : ''}`,
  );
}
const detections = detect(
  results.flatMap((r) => r.signals),
  builtinFingerprints(),
);
console.log(detections.length ? '\ndetected:' : '\nnothing detected');
for (const d of detections) {
  console.log(`  ${d.tech} ${d.confidence}`);
  for (const e of d.evidence) console.log(`    ${e.weight} ${e.detail}`);
}
console.log(`\nwrote fixtures/sites/${name}/net.json; now write expected.json by hand`);
