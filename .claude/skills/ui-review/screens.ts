// Screenshots of web app pages in light and dark, at phone and desktop width, plus reduced motion.
// Also fails on sideways page scroll. Run from the repo root against a running app:
//   node .claude/skills/ui-review/screens.ts http://localhost:3000 / /s/vercel.com /s/never-scanned.test
// Screenshots land in .ui-review/ (gitignored). Needs Chromium: `pnpm --filter
// @drippa/stackprobe-browser-playwright install-chromium`.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
// playwright-core is a dependency of browser-playwright, not of the repo root.
const require = createRequire(resolve(root, 'packages/browser-playwright/package.json'));
const { chromium } = require('playwright-core') as typeof import('playwright-core');

const [base = 'http://localhost:3000', ...paths] = process.argv.slice(2);
const routes = paths.length > 0 ? paths : ['/'];
const out = resolve(root, '.ui-review');
mkdirSync(out, { recursive: true });

const widths = { phone: 390, desktop: 1280 };
const schemes = ['light', 'dark'] as const;
const problems: string[] = [];

const browser = await chromium.launch();
try {
  for (const [device, width] of Object.entries(widths)) {
    for (const colorScheme of schemes) {
      for (const reducedMotion of ['no-preference', 'reduce'] as const) {
        // Reduced motion only needs one width and scheme.
        if (reducedMotion === 'reduce' && (device !== 'desktop' || colorScheme !== 'light'))
          continue;
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          colorScheme,
          reducedMotion,
          deviceScaleFactor: 2,
        });
        const page = await context.newPage();
        for (const route of routes) {
          await page.goto(new URL(route, base).toString(), { waitUntil: 'networkidle' });
          const name = `${route.replace(/[^a-z0-9.]+/gi, '_').replace(/^_|_$/g, '') || 'home'}`;
          const variant = `${device}-${colorScheme}${reducedMotion === 'reduce' ? '-reduced' : ''}`;
          const file = resolve(out, `${name}.${variant}.png`);
          await page.screenshot({ path: file, fullPage: true });
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          if (overflow > 0)
            problems.push(`${route} (${variant}): page scrolls sideways by ${overflow}px`);
          console.log(file);
        }
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
