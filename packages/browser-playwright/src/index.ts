import { isIP } from 'node:net';
import type { Browser, BrowserCapture, CaptureOptions } from '@drippa/stackprobe-core';
import { isPrivateAddress, USER_AGENT } from '@drippa/stackprobe-core/node';
import { type Browser as Chromium, chromium, type LaunchOptions } from 'playwright-core';

// Heavy and never needed to tell a stack apart.
const BLOCKED_TYPES = new Set(['image', 'media', 'font']);
// After the page loads, how long to wait for its JavaScript to settle (lazy SDK calls).
const SETTLE_MS = 5_000;

export interface PlaywrightBrowserOptions {
  launch?: LaunchOptions;
}

// Loads pages in a local headless Chromium, like one visitor: no logging in, no forms, no
// images, an honest user agent. Install Chromium once: pnpm --filter
// @drippa/stackprobe-browser-playwright install-chromium
export class PlaywrightBrowser implements Browser {
  private chromium: Promise<Chromium> | undefined;
  private readonly options: PlaywrightBrowserOptions;

  constructor(options: PlaywrightBrowserOptions = {}) {
    this.options = options;
  }

  async capture(url: string, { signal, timeoutMs }: CaptureOptions): Promise<BrowserCapture> {
    this.chromium ??= chromium.launch({ headless: true, ...this.options.launch });
    const browser = await this.chromium;
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      serviceWorkers: 'block',
      viewport: { width: 1280, height: 800 },
    });
    const close = () => void context.close().catch(() => {});
    signal.addEventListener('abort', close, { once: true });
    const capture: BrowserCapture = {
      url,
      status: null,
      requests: [],
      websockets: [],
      cookies: [],
      globals: [],
    };
    try {
      await context.route('**/*', (route) => {
        const request = route.request();
        if (BLOCKED_TYPES.has(request.resourceType()) || isPrivateTarget(request.url())) {
          return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.on('request', (request) => {
        capture.requests.push({
          url: request.url(),
          method: request.method(),
          type: request.resourceType(),
          headers: request.headers(),
        });
      });
      page.on('websocket', (socket) => capture.websockets.push(socket.url()));

      const baseline = await page.evaluate(() => Object.keys(globalThis));
      const started = Date.now();
      const response = await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
      capture.status = response?.status() ?? null;
      const left = Math.max(0, timeoutMs - (Date.now() - started) - 1_000);
      await page
        .waitForLoadState('networkidle', { timeout: Math.min(SETTLE_MS, left) })
        .catch(() => {});
      capture.url = page.url();
      const known = new Set(baseline);
      // Globals the page's own scripts defined: not on a blank page, and not a built-in API
      // (some only exist on secure pages, so a blank page doesn't list them).
      const added = await page.evaluate(() =>
        Object.keys(globalThis).filter((key) => {
          // Built-ins are getters (cookieStore, onclick…); scripts define plain values.
          const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
          if (!descriptor || !('value' in descriptor)) return false;
          const { value } = descriptor;
          if (typeof value !== 'function') return true;
          return !/\{\s*\[native code\]\s*\}/.test(Function.prototype.toString.call(value));
        }),
      );
      capture.globals = added.filter((key) => !known.has(key));
      capture.cookies = (await context.cookies()).map((cookie) => cookie.name);
      return capture;
    } finally {
      signal.removeEventListener('abort', close);
      await context.close().catch(() => {});
    }
  }

  async close(): Promise<void> {
    const browser = await this.chromium?.catch(() => undefined);
    this.chromium = undefined;
    await browser?.close();
  }
}

// Same guard as the network layer: never let a scanned page make us fetch a private address.
export function isPrivateTarget(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return true;
  }
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  // Hostnames pass; only IP literals are checked here (isPrivateAddress calls a name private).
  return isIP(host) !== 0 && isPrivateAddress(host);
}

// A browser when Chromium is installed, or none: scans then simply skip the browser layer.
export async function playwrightIfInstalled(): Promise<PlaywrightBrowser | undefined> {
  try {
    const { existsSync } = await import('node:fs');
    return existsSync(chromium.executablePath()) ? new PlaywrightBrowser() : undefined;
  } catch {
    return undefined;
  }
}
