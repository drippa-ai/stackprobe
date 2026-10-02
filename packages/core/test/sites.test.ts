import { readdirSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { detect } from '../src/detect.ts';
import { builtinFingerprints } from '../src/fingerprints/index.ts';
import { DEFAULT_LAYERS } from '../src/layers/index.ts';
import { runLayers } from '../src/runner.ts';
import { surfaceTarget } from '../src/surface.ts';
import { FIXTURES_DIR, loadFixture, ReplayNet } from './fixtures.ts';

const sites = readdirSync(FIXTURES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

// Replays every recorded site through the full scan and checks it against expected.json.
describe.each(sites)('%s', (name) => {
  const { recording, expected } = loadFixture(name);

  test('scans as expected', async () => {
    const net = new ReplayNet(recording);
    const results = await runLayers(DEFAULT_LAYERS, surfaceTarget(recording.url), { net });
    expect(net.misses, 'calls missing from the recording').toEqual([]);
    expect(results.map((r) => r.run.error)).not.toContainEqual(
      expect.objectContaining({ code: 'INTERNAL' }),
    );

    const detections = detect(
      results.flatMap((r) => r.signals),
      builtinFingerprints(),
    );
    const found = new Map(detections.map((d) => [d.tech, d.confidence]));
    for (const { tech, minConfidence } of expected.present) {
      expect(found.get(tech), `${tech} confidence`).toBeGreaterThanOrEqual(minConfidence);
    }
    for (const tech of expected.absent) {
      expect(found.has(tech), `${tech} should not be detected`).toBe(false);
    }
  });
});
