import type { Layer, Signal } from './layer.ts';

// What one browser load of a page saw. Produced by a Browser implementation (local Playwright,
// a hosted sandbox) and cleaned by sanitizeCapture before anything reads or stores it.
export interface BrowserCapture {
  // Where the page ended up, after redirects.
  url: string;
  status: number | null;
  requests: { url: string; method: string; type: string; headers: Record<string, string> }[];
  websockets: string[];
  cookies: string[];
  // Names of globals the page added to `window`, e.g. __NEXT_DATA__, Clerk, firebase.
  globals: string[];
}

export interface CaptureOptions {
  signal: AbortSignal;
  timeoutMs: number;
}

// Loads a page like a visitor would, without logging in or submitting anything. Engines live
// outside core.
export interface Browser {
  capture(url: string, options: CaptureOptions): Promise<BrowserCapture>;
}

// A browser that can load several pages at once, e.g. in one sandbox.
export interface BatchBrowser extends Browser {
  captureMany(
    urls: string[],
    options: Pick<CaptureOptions, 'timeoutMs'>,
  ): Promise<Record<string, BrowserCapture | { error: string }>>;
}

// Loads every page, in one batch when the browser supports it. A page that fails gets its error.
export async function captureAll(
  browser: Browser,
  urls: string[],
  options: CaptureOptions,
): Promise<Record<string, BrowserCapture | { error: string }>> {
  if ('captureMany' in browser && typeof browser.captureMany === 'function') {
    try {
      return await (browser as BatchBrowser).captureMany(urls, options);
    } catch (error) {
      // The whole batch failed (e.g. the sandbox crashed): every page gets that error.
      const message = error instanceof Error ? error.message : String(error);
      return Object.fromEntries(urls.map((url) => [url, { error: message }]));
    }
  }
  const entries = await Promise.all(
    urls.map(async (url) => {
      try {
        return [url, await browser.capture(url, options)] as const;
      } catch (error) {
        return [url, { error: error instanceof Error ? error.message : String(error) }] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

// A browser that answers from captures made earlier, e.g. by captureAll.
export function capturedBrowser(
  captures: Record<string, BrowserCapture | { error: string }>,
): Browser {
  return {
    async capture(url) {
      const capture = captures[url];
      if (!capture) throw new Error(`No capture of ${url}`);
      if ('error' in capture) throw new Error(capture.error);
      return capture;
    },
  };
}

// Request headers worth keeping: they name an SDK and its version. Values are length-capped.
const HEADER_ALLOWLIST = new Set([
  'x-client-info',
  'x-supabase-api-version',
  'x-firebase-client',
  'x-firebase-gmpid',
  'x-clerk-api-version',
  'auth0-client',
  'x-stainless-lang',
]);
const MAX_HEADER_VALUE = 120;
const MAX_REQUESTS = 500;
const GLOBAL_NAME = /^[A-Za-z_$][\w$]{0,63}$/;

// Keeps what identifies a stack and drops what could identify a person or carry a key: query
// strings and fragments, header values outside the allowlist, cookie values.
export function sanitizeCapture(capture: BrowserCapture): BrowserCapture {
  const requests = capture.requests.slice(0, MAX_REQUESTS).flatMap((request) => {
    const url = withoutQuery(request.url);
    if (!url) return [];
    const headers = Object.fromEntries(
      Object.entries(request.headers)
        .map(([name, value]) => [name.toLowerCase(), value] as const)
        .filter(([name]) => HEADER_ALLOWLIST.has(name))
        .map(([name, value]) => [name, value.slice(0, MAX_HEADER_VALUE)]),
    );
    return [{ url, method: request.method.toUpperCase(), type: request.type, headers }];
  });
  return {
    url: withoutQuery(capture.url) ?? capture.url,
    status: capture.status,
    requests,
    websockets: unique(capture.websockets.flatMap((url) => withoutQuery(url) ?? [])),
    cookies: unique(capture.cookies.map((cookie) => cookie.split('=', 1)[0]?.trim() ?? '')),
    globals: unique(capture.globals.filter((name) => GLOBAL_NAME.test(name))),
  };
}

// The part of a capture that belongs to the surface. When the page leaves the surface's host
// (a hosted sign-in page, say), what the other page loads and defines is that page's stack, not
// this surface's: only requests made before leaving count, plus where it went.
export function ownCapture(capture: BrowserCapture, surfaceUrl: string): BrowserCapture {
  const host = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };
  const home = host(surfaceUrl);
  if (host(capture.url) === home) return capture;
  const left = capture.requests.findIndex(
    (request) => request.type === 'document' && host(request.url) !== home,
  );
  const before = left === -1 ? capture.requests : capture.requests.slice(0, left);
  const destination = capture.requests[left] ?? {
    url: capture.url,
    method: 'GET',
    type: 'document',
    headers: {},
  };
  return {
    ...capture,
    requests: [...before, { ...destination, headers: {} }],
    websockets: [],
    cookies: [],
    globals: [],
  };
}

export function captureSignals(capture: BrowserCapture): Signal[] {
  const source = capture.url;
  const signals: Signal[] = [];
  const seen = new Set<string>();
  const add = (signal: Signal) => {
    const key = `${signal.kind} ${signal.key ?? ''} ${signal.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    signals.push(signal);
  };
  for (const request of capture.requests) {
    add({ layer: 'browser', kind: 'request-url', value: request.url, source });
    for (const [key, value] of Object.entries(request.headers)) {
      add({ layer: 'browser', kind: 'request-header', key, value, source });
    }
  }
  for (const url of capture.websockets)
    add({ layer: 'browser', kind: 'websocket-url', value: url, source });
  for (const name of capture.cookies)
    add({ layer: 'browser', kind: 'cookie-name', value: name, source });
  for (const name of capture.globals)
    add({ layer: 'browser', kind: 'window-global', value: name, source });
  return signals;
}

// Layer 4: loads the surface in a real browser and reports the requests, connections, cookies
// and globals its JavaScript produces. Sees what plain HTTP can't, e.g. Supabase calls in an SPA.
export function browserLayer(browser: Browser, timeoutMs = 30_000): Layer {
  return {
    id: 'browser',
    timeoutMs,
    appliesTo: () => true,
    async run(surface, ctx) {
      const capture = ownCapture(
        sanitizeCapture(
          await browser.capture(surface.url, { signal: ctx.signal, timeoutMs: timeoutMs - 2_000 }),
        ),
        surface.url,
      );
      for (const signal of captureSignals(capture)) ctx.emit(signal);
    },
  };
}

function withoutQuery(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return null;
    url.search = '';
    url.hash = '';
    url.username = '';
    url.password = '';
    return url.href;
  } catch {
    return null;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
