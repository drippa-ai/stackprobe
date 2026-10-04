import { describe, expect, test } from 'vitest';
import { diffReports } from './diff.ts';
import type { Detection, LayerRun, Report } from './report.ts';

function detection(tech: string, confidence: number, version: string | null = null): Detection {
  return {
    tech,
    category: 'hosting',
    version,
    confidence,
    evidence: [{ type: 'observed', layer: 'http', ruleId: `${tech}/x`, detail: 'x', weight: 0.5 }],
  };
}

function report(
  detections: Record<string, Detection[]>,
  options: { fingerprintsVersion?: string; layersRun?: LayerRun[]; scannedAt?: string } = {},
): Report {
  return {
    schemaVersion: '1',
    domain: 'acme.test',
    scannedAt: options.scannedAt ?? '2026-10-01T00:00:00.000Z',
    fingerprintsVersion: options.fingerprintsVersion ?? 'v1',
    surfaces: Object.entries(detections).map(([url, list], i) => ({
      id: `s${i}`,
      url,
      kind: 'unclassified',
      kindConfidence: null,
      detections: list,
    })),
    layersRun: options.layersRun ?? [
      { layer: 'http', surfaceId: 's0', status: 'ok', durationMs: 1 },
    ],
  };
}

const ROOT = 'https://acme.test/';

describe('diffReports', () => {
  test('two identical scans have no changes', () => {
    const scan = report({ [ROOT]: [detection('vercel', 0.9)] });
    expect(diffReports(scan, scan)).toMatchObject({
      fingerprintsChanged: false,
      incomplete: false,
      surfaces: [],
    });
  });

  test('finds added, removed and changed detections', () => {
    const before = report({
      [ROOT]: [detection('netlify', 0.9), detection('nextjs', 0.6, '14'), detection('react', 0.8)],
    });
    const after = report(
      {
        [ROOT]: [
          detection('vercel', 0.95),
          detection('nextjs', 0.62, '15'),
          detection('react', 0.82),
        ],
      },
      { scannedAt: '2026-10-04T00:00:00.000Z' },
    );
    const diff = diffReports(before, after);
    expect(diff.from.scannedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(diff.to.scannedAt).toBe('2026-10-04T00:00:00.000Z');
    expect(diff.surfaces).toHaveLength(1);
    const [surface] = diff.surfaces;
    expect(surface?.added.map((d) => d.tech)).toEqual(['vercel']);
    expect(surface?.removed.map((d) => d.tech)).toEqual(['netlify']);
    // react moved by 0.02 only: noise. nextjs changed version.
    expect(surface?.changed).toEqual([
      {
        tech: 'nextjs',
        category: 'hosting',
        from: { confidence: 0.6, version: '14' },
        to: { confidence: 0.62, version: '15' },
      },
    ]);
  });

  test('reports a confidence change at or above the threshold', () => {
    const diff = diffReports(
      report({ [ROOT]: [detection('vercel', 0.6)] }),
      report({ [ROOT]: [detection('vercel', 0.65)] }),
    );
    expect(diff.surfaces[0]?.changed.map((c) => c.tech)).toEqual(['vercel']);
  });

  test('a surface only in one scan counts as all added or all removed', () => {
    const diff = diffReports(
      report({ [ROOT]: [], 'https://old.acme.test/': [detection('heroku', 0.8)] }),
      report({ [ROOT]: [], 'https://app.acme.test/': [detection('supabase', 0.9)] }),
    );
    expect(diff.surfaces).toEqual([
      {
        url: 'https://old.acme.test/',
        added: [],
        removed: [detection('heroku', 0.8)],
        changed: [],
      },
      {
        url: 'https://app.acme.test/',
        added: [detection('supabase', 0.9)],
        removed: [],
        changed: [],
      },
    ]);
  });

  test('flags changed fingerprints and failed layers', () => {
    const failed: LayerRun = { layer: 'dns', surfaceId: 's0', status: 'timeout', durationMs: 9 };
    const diff = diffReports(
      report({ [ROOT]: [] }, { layersRun: [failed] }),
      report({ [ROOT]: [] }, { fingerprintsVersion: 'v2' }),
    );
    expect(diff).toMatchObject({ fingerprintsChanged: true, incomplete: true });
  });
});
