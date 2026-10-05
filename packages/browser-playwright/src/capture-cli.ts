// Captures pages and prints one JSON object: { [url]: capture } or { [url]: { error } }.
//   node capture-cli.ts '{"urls":["https://…"],"timeoutMs":25000,"userAgent":"…"}'
// Runs inside a Vercel Sandbox (see browser-vercel-sandbox), next to an installed playwright-core.
import { chromium } from 'playwright-core';
import { type Capture, capturePage } from './capture.ts';

const { urls, timeoutMs, userAgent } = JSON.parse(process.argv[2] ?? '{}') as {
  urls: string[];
  timeoutMs: number;
  userAgent: string;
};
const browser = await chromium.launch({ headless: true });
const out: Record<string, Capture | { error: string }> = {};
try {
  await Promise.all(
    urls.map(async (url) => {
      try {
        out[url] = await capturePage(browser, url, { timeoutMs, userAgent });
      } catch (error) {
        out[url] = {
          error: error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error),
        };
      }
    }),
  );
} finally {
  await browser.close();
}
process.stdout.write(JSON.stringify(out));
