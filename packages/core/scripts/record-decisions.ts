// Asks the live decision model (Jev, via TYPESAFE_API_KEY) about every ground-truth surface the
// rules can't settle, and saves the answers to fixtures/decisions.json for replay:
//   pnpm record-decisions
// Costs a few cents. Never run in CI. Then run `pnpm accuracy`.
import { existsSync } from 'node:fs';
import { TypeSafeDecider } from '../../decider-typesafe/src/index.ts';
import { scan } from '../src/scan.ts';
import { RecordingDecider, saveDecisions } from '../test/decisions.ts';
import { DOMAINS_DIR, loadRecording, RECORDINGS_DIR, ReplayNet } from '../test/fixtures.ts';
import { discoveryDomains, loadGroundTruth } from '../test/ground-truth.ts';

const apiKey = process.env.TYPESAFE_API_KEY;
if (!apiKey) {
  console.error('TYPESAFE_API_KEY is not set. Add it to .env.local at the repo root.');
  process.exit(1);
}
const decider = new RecordingDecider(new TypeSafeDecider({ apiKey }));
const rows = loadGroundTruth();

for (const row of rows) {
  if (!existsSync(new URL(`${row.recording}/net.json`, RECORDINGS_DIR))) continue;
  const recording = loadRecording(row.recording);
  await scan(row.surfaceUrl, { net: new ReplayNet(recording), discover: false, decider });
}
for (const domain of discoveryDomains(rows)) {
  if (!existsSync(new URL(`${domain}/net.json`, DOMAINS_DIR))) continue;
  const recording = loadRecording(domain, DOMAINS_DIR);
  await scan(recording.url, { net: new ReplayNet(recording), decider });
}
// Only what today's surfaces ask, so stale answers don't pile up.
saveDecisions(decider.recorded);
console.log(`recorded ${Object.keys(decider.recorded).length} decisions`);
