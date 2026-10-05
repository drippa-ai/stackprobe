// Embeds the standalone capture code (browser-playwright/src/capture*.ts) as text, so the hosted
// app can upload it into a sandbox without reading files at runtime. Run: pnpm build-source
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../../browser-playwright/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, dir), 'utf8');
const playwrightVersion = (
  JSON.parse(read('package.json')) as { dependencies: Record<string, string> }
).dependencies['playwright-core']?.replace(/^[\^~]/, '');

export function generate(): string {
  return [
    '// Generated from browser-playwright/src/capture.ts and capture-cli.ts by `pnpm build-source`.',
    '// Do not edit.',
    `export const PLAYWRIGHT_VERSION = ${JSON.stringify(playwrightVersion)};`,
    `export const CAPTURE_TS = ${JSON.stringify(read('src/capture.ts'))};`,
    `export const CAPTURE_CLI_TS = ${JSON.stringify(read('src/capture-cli.ts'))};`,
    '',
  ].join('\n');
}

export const outputPath = new URL('../src/source.generated.ts', import.meta.url);

if (import.meta.url === `file://${process.argv[1]}`) writeFileSync(outputPath, generate());
