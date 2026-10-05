// Loads one page in Chromium and records what its JavaScript does. Standalone on purpose: it
// imports only Node and playwright-core, so the same file runs locally and inside a sandbox.
import { BlockList, isIP } from 'node:net';
import type { Browser as Chromium } from 'playwright-core';

// The shape of core's BrowserCapture, repeated here so this file needs nothing else.
export interface Capture {
  url: string;
  status: number | null;
  requests: { url: string; method: string; type: string; headers: Record<string, string> }[];
  websockets: string[];
  cookies: string[];
  globals: string[];
}

// Heavy and never needed to tell a stack apart.
const BLOCKED_TYPES = new Set(['image', 'media', 'font']);
// After the page loads, how long to wait for its JavaScript to settle (lazy SDK calls).
const SETTLE_MS = 5_000;

// Same ranges as core's isPrivateAddress (a test keeps them in step).
export const PRIVATE_V4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
export const PRIVATE_V6: [string, number][] = [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];
const PRIVATE = new BlockList();
for (const [address, prefix] of PRIVATE_V4) PRIVATE.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of PRIVATE_V6) PRIVATE.addSubnet(address, prefix, 'ipv6');

// Never let a scanned page make us fetch a private address. Hostnames pass; IP literals and
// localhost are checked.
export function isPrivateTarget(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return true;
  }
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(host)?.[1] ?? host;
  const family = isIP(mapped);
  return family !== 0 && PRIVATE.check(mapped, family === 4 ? 'ipv4' : 'ipv6');
}

export interface CapturePageOptions {
  timeoutMs: number;
  userAgent: string;
  signal?: AbortSignal;
}

// Loads a page like one visitor: no logging in, no forms, no images, an honest user agent.
export async function capturePage(
  browser: Chromium,
  url: string,
  { timeoutMs, userAgent, signal }: CapturePageOptions,
): Promise<Capture> {
  const context = await browser.newContext({
    userAgent,
    serviceWorkers: 'block',
    viewport: { width: 1280, height: 800 },
  });
  const close = () => void context.close().catch(() => {});
  signal?.addEventListener('abort', close, { once: true });
  const capture: Capture = {
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
    signal?.removeEventListener('abort', close);
    await context.close().catch(() => {});
  }
}
