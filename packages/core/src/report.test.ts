import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { Report, reportJsonSchema } from './report.ts';

const schemaPath = new URL('../../../schema/report.v1.json', import.meta.url);

test('the committed JSON Schema matches the zod schema', () => {
  const committed = JSON.parse(readFileSync(schemaPath, 'utf8'));
  // Run `pnpm schema` to regenerate after changing report.ts.
  expect(committed).toEqual(reportJsonSchema());
});

test('accepts a well-formed report', () => {
  const report = {
    schemaVersion: '1',
    domain: 'example.com',
    scannedAt: '2026-10-02T12:00:00Z',
    fingerprintsVersion: '0.0.0',
    surfaces: [
      {
        id: 's1',
        url: 'https://example.com/',
        kind: 'unclassified',
        kindConfidence: null,
        detections: [
          {
            tech: 'vercel',
            category: 'hosting',
            version: null,
            confidence: 0.95,
            evidence: [
              {
                type: 'observed',
                layer: 'http',
                ruleId: 'vercel/header-x-vercel-id',
                detail: 'x-vercel-id response header',
                weight: 0.95,
              },
            ],
          },
        ],
      },
    ],
    layersRun: [{ layer: 'http', surfaceId: 's1', status: 'ok', durationMs: 120 }],
  };
  expect(Report.parse(report)).toEqual(report);
});

test('rejects a detection without evidence', () => {
  const result = Report.safeParse({
    schemaVersion: '1',
    domain: 'example.com',
    scannedAt: '2026-10-02T12:00:00Z',
    fingerprintsVersion: '0.0.0',
    surfaces: [
      {
        id: 's1',
        url: 'https://example.com/',
        kind: 'unclassified',
        kindConfidence: null,
        detections: [
          { tech: 'vercel', category: 'hosting', version: null, confidence: 0.9, evidence: [] },
        ],
      },
    ],
    layersRun: [],
  });
  expect(result.success).toBe(false);
});
