import { readdirSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { Report } from '../src/report.ts';
import { scan } from '../src/scan.ts';
import { FIXTURES_DIR, loadFixture, ReplayNet } from './fixtures.ts';

const sites = readdirSync(FIXTURES_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

// Replays every recorded site through the full scan and checks it against expected.json.
describe.each(sites)('%s', (name) => {
  const { recording, expected } = loadFixture(name);

  test('scans as expected', async () => {
    const net = new ReplayNet(recording);
    const report = await scan(recording.url, { net });
    expect(net.misses, 'calls missing from the recording').toEqual([]);
    expect(Report.parse(report)).toEqual(report);
    expect(report.layersRun.map((run) => run.error)).not.toContainEqual(
      expect.objectContaining({ code: 'INTERNAL' }),
    );

    const found = new Map(report.surfaces[0]?.detections.map((d) => [d.tech, d.confidence]));
    for (const { tech, minConfidence } of expected.present) {
      expect(found.get(tech), `${tech} confidence`).toBeGreaterThanOrEqual(minConfidence);
    }
    for (const tech of expected.absent) {
      expect(found.has(tech), `${tech} should not be detected`).toBe(false);
    }
  });
});
