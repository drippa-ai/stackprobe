// Bundles fingerprints/*.yaml into src/fingerprints/builtin.generated.ts, so core can ship
// its fingerprints without reading files at runtime. Run with `pnpm fingerprints`.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
import { compileFingerprints } from '../src/fingerprint.ts';

export function generate(): string {
  const dir = new URL('../fingerprints/', import.meta.url);
  const definitions = readdirSync(dir)
    .filter((file) => file.endsWith('.yaml'))
    .sort()
    .map((file) => parse(readFileSync(new URL(file, dir), 'utf8')) as unknown);

  compileFingerprints(definitions);

  const json = JSON.stringify(definitions, null, 2);
  const version = createHash('sha256').update(json).digest('hex').slice(0, 12);
  return [
    '// Generated from fingerprints/*.yaml by `pnpm fingerprints`. Do not edit.',
    `export const FINGERPRINTS_VERSION = '${version}';`,
    `export const FINGERPRINT_DEFINITIONS: unknown[] = ${json};`,
    '',
  ].join('\n');
}

export const outputPath = new URL('../src/fingerprints/builtin.generated.ts', import.meta.url);

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(outputPath, generate());
  console.log(`wrote ${outputPath.pathname}`);
}
