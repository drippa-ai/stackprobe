// Writes fixtures/accuracy.md from the ground truth and its recordings: pnpm accuracy
import { writeFileSync } from 'node:fs';
import { ACCURACY_FILE, formatAccuracy, measureAccuracy } from '../test/accuracy.ts';
import { loadGroundTruth } from '../test/ground-truth.ts';

const markdown = formatAccuracy(await measureAccuracy(loadGroundTruth()));
writeFileSync(ACCURACY_FILE, markdown);
console.log(markdown);
