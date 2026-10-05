import { registrableDomain } from '../discover.ts';
import { type Layer, LayerError, type Signal } from '../layer.ts';

// One careful visitor: a page's own scripts only, and not all of them.
export const MAX_SCRIPTS = 30;
const MAX_SCRIPT_BYTES = 3_000_000;
const MAX_STRINGS = 300;

// Origins written in the code: where the app sends its data, e.g. a Supabase project URL.
const ORIGIN =
  /\b(?:https?|wss?):\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?::\d{2,5})?(?=[/"'`?\\\s,;)]|$)/gi;
// SDK names with their version, as SDKs stamp into their own requests: supabase-js/2.45.0.
const SDK_VERSION =
  /(?<![\w/.-])((?:@[a-z0-9-]+\/)?[a-z][a-z0-9-]{1,40})\/(\d+\.\d+\.\d+(?:-[a-z0-9.]+)?)(?![\w.])/gi;

// The strings in a script that can reveal a stack. Tech-agnostic: fingerprints decide what they
// mean. Hosts that only point at standards or examples are dropped.
export function extractBundleStrings(source: string): { urls: string[]; sdks: string[] } {
  const urls = new Set<string>();
  for (const match of source.matchAll(ORIGIN)) {
    const origin = match[0].toLowerCase();
    if (!NOISE_HOSTS.test(new URL(origin.replace(/^wss?:/, 'https:')).hostname)) urls.add(origin);
    if (urls.size >= MAX_STRINGS) break;
  }
  const sdks = new Set<string>();
  for (const match of source.matchAll(SDK_VERSION)) {
    sdks.add(`${match[1]?.toLowerCase()}/${match[2]}`);
    if (sdks.size >= MAX_STRINGS) break;
  }
  return { urls: [...urls].sort(), sdks: [...sdks].sort() };
}

const NOISE_HOSTS =
  /(?:^|\.)(?:w3\.org|example\.(?:com|org|net)|localhost|schema\.org|reactjs\.org|react\.dev|github\.com|mozilla\.org|nextjs\.org|npmjs\.com|unpkg\.com|jsdelivr\.net)$/;

// Keeps only the strings the layer reads, so recorded fixtures hold no source code. Reading the
// result again gives the same strings.
export function distillScript(source: string): string {
  const { urls, sdks } = extractBundleStrings(source);
  return [...urls.map((url) => `"${url}/"`), ...sdks.map((sdk) => `"${sdk}"`)].join('\n');
}

export function isScript(url: string, contentType: string | undefined): boolean {
  return /\b(?:java|ecma)script\b/i.test(contentType ?? '') || /\.m?js(?:$|\?)/i.test(url);
}

// The page's own scripts, from its <script src> tags: same site only, since third-party tags
// (analytics, chat widgets) mention plenty of other services' addresses.
export function firstPartyScripts(signals: Signal[], pageUrl: string): string[] {
  const site = registrableDomain(new URL(pageUrl).hostname);
  const scripts = new Set<string>();
  for (const signal of signals) {
    if (signal.layer !== 'http' || signal.kind !== 'script-src') continue;
    let url: URL;
    try {
      url = new URL(signal.value, signal.source ?? pageUrl);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    if (registrableDomain(url.hostname) !== site) continue;
    scripts.add(url.href);
  }
  return [...scripts].slice(0, MAX_SCRIPTS);
}

// Layer 5: reads the page's own JavaScript for the services it talks to and the SDKs it bundles.
// Finds what a logged-out page never calls, like the Supabase project behind a login form.
export function bundleLayer(scripts: string[]): Layer {
  return {
    id: 'bundle',
    timeoutMs: 20_000,
    appliesTo: () => scripts.length > 0,
    async run(_surface, ctx) {
      let read = 0;
      await Promise.all(
        scripts.map(async (url) => {
          const response = await ctx.net
            .http({ url, method: 'GET', headers: { accept: '*/*' } }, ctx.signal)
            .catch(() => null);
          if (!response || response.status >= 400 || response.body.length > MAX_SCRIPT_BYTES) {
            return;
          }
          read++;
          const { urls, sdks } = extractBundleStrings(response.body);
          for (const value of urls)
            ctx.emit({ layer: 'bundle', kind: 'bundle-url', value, source: url });
          for (const value of sdks)
            ctx.emit({ layer: 'bundle', kind: 'bundle-sdk', value, source: url });
        }),
      );
      if (read === 0)
        throw new LayerError('HTTP_STATUS', `None of ${scripts.length} scripts could be read`);
    },
  };
}
