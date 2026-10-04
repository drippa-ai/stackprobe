import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { ACCURACY_FILE, formatAccuracy, measureAccuracy } from './accuracy.ts';
import { loadGroundTruth } from './ground-truth.ts';

// Keeps fixtures/accuracy.md current, so every change to fingerprints or layers shows its effect
// on accuracy in the diff.
test('fixtures/accuracy.md is up to date (run pnpm accuracy)', async () => {
  const markdown = formatAccuracy(await measureAccuracy(loadGroundTruth()));
  expect(readFileSync(ACCURACY_FILE, 'utf8')).toBe(markdown);
});
