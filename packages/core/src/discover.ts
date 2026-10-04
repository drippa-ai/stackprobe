import type { Signal, SurfaceTarget } from './layer.ts';
import type { Net } from './net.ts';
import type { SurfaceFoundBy } from './report.ts';

// At most this many surfaces besides the one scanned: one careful visitor, not a crawler.
export const MAX_DISCOVERED = 6;

// Subdomains that often hold the product, its API or docs. Checked with DNS only.
export const SUBDOMAIN_PREFIXES = [
  'app',
  'dashboard',
  'console',
  'portal',
  'api',
  'docs',
  'status',
];

// A name no real site uses: if it resolves, the domain answers every subdomain and DNS proves
// nothing. Fixed rather than random so recorded scans replay.
const WILDCARD_PROBE = 'stackprobe-wildcard-check';

// Lower ranks first: the product app matters most, docs and status pages least.
const LINK_TEXT: [RegExp, number][] = [
  [
    /\b(?:log ?in|sign ?in|dashboard|console|open (?:the )?app|go to (?:the )?app|launch app|my account)\b/i,
    0,
  ],
  [/\b(?:sign ?up|register|get started|start (?:for )?free|try (?:it )?(?:for )?free)\b/i, 1],
  [/\b(?:docs|documentation|api reference|developers?)\b/i, 3],
  [/\bstatus\b/i, 4],
];
const LINK_PATH: [RegExp, number][] = [
  [/^\/(?:login|log-in|signin|sign-in|auth|dashboard|console|app)(?:\/|$)/i, 0],
  [/^\/(?:signup|sign-up|register|get-started)(?:\/|$)/i, 1],
  [/^\/(?:docs?|developers?|api)(?:\/|$)/i, 3],
  [/^\/status(?:\/|$)/i, 4],
];
// Marketing pages whose links often say "Get started" or "Start free". Never the app.
const MARKETING_SECTIONS = new Set([
  'pricing',
  'plans',
  'blog',
  'customers',
  'case-studies',
  'use-case',
  'use-cases',
  'solutions',
  'about',
  'company',
  'careers',
  'contact',
  'legal',
  'privacy',
  'terms',
]);

const PREFIX_RANK: Record<string, number> = {
  app: 0,
  dashboard: 0,
  console: 0,
  portal: 0,
  api: 2,
  docs: 3,
  status: 4,
};

export interface DiscoverOptions {
  net: Net;
  signal?: AbortSignal;
  max?: number;
}

interface Candidate {
  url: URL;
  rank: number;
  foundBy: SurfaceFoundBy;
}

// Finds the domain's other surfaces from the links on the scanned page and from common
// subdomains. Pure apart from DNS lookups; returns them best first.
export async function discoverSurfaces(
  root: SurfaceTarget,
  rootSignals: Signal[],
  options: DiscoverOptions,
): Promise<SurfaceTarget[]> {
  const site = registrableDomain(root.host);
  const sameSite = (host: string) => host === site || host.endsWith(`.${site}`);
  const seen = new Set([key(new URL(root.url))]);
  for (const signal of rootSignals) {
    // Where the page actually ended up, after redirects.
    if (signal.layer === 'http' && signal.source) seen.add(key(new URL(signal.source)));
  }
  const candidates: Candidate[] = [];
  // One surface per subdomain, and per section of the main site: /docs/a and /docs/b are the
  // same docs, and app.acme.com/login and app.acme.com/signup the same app.
  const mainHosts = new Set([site, `www.${site}`]);
  const sections = new Set<string>();
  const add = (candidate: Candidate) => {
    const id = key(candidate.url);
    const { hostname, pathname } = candidate.url;
    const section = mainHosts.has(hostname)
      ? `${hostname}/${pathname.split('/')[1] ?? ''}`
      : hostname;
    if (seen.has(id) || sections.has(section)) return;
    seen.add(id);
    sections.add(section);
    candidates.push(candidate);
  };

  for (const signal of rootSignals) {
    if (signal.kind !== 'anchor') continue;
    let url: URL;
    try {
      url = new URL(signal.value);
    } catch {
      continue;
    }
    if (!sameSite(url.hostname) || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
      continue;
    }
    url.search = '';
    url.hash = '';
    if (MARKETING_SECTIONS.has(url.pathname.split('/')[1]?.toLowerCase() ?? '')) continue;
    const rank = linkRank(url, signal.key ?? '', site);
    if (rank === null) continue;
    add({ url, rank, foundBy: { kind: 'link', ...(signal.key ? { text: signal.key } : {}) } });
  }

  // Only when given a whole domain: a URL with a path, or a subdomain, is already a choice.
  const wholeDomain =
    new URL(root.url).pathname === '/' && (root.host === site || root.host === `www.${site}`);
  if (wholeDomain) {
    if (!(await resolves(`${WILDCARD_PROBE}.${site}`, options))) {
      const hosts = new Set(candidates.map((c) => c.url.hostname));
      const found = await Promise.all(
        SUBDOMAIN_PREFIXES.map(async (prefix) => {
          const host = `${prefix}.${site}`;
          return !hosts.has(host) && (await resolves(host, options)) ? prefix : null;
        }),
      );
      for (const prefix of found) {
        if (!prefix) continue;
        add({
          url: new URL(`https://${prefix}.${site}/`),
          rank: PREFIX_RANK[prefix] ?? 5,
          foundBy: { kind: 'subdomain' },
        });
      }
    }
  }

  return candidates
    .map((candidate, order) => ({ candidate, order }))
    .sort((a, b) => a.candidate.rank - b.candidate.rank || a.order - b.order)
    .slice(0, options.max ?? MAX_DISCOVERED)
    .map(({ candidate }) => ({
      id: surfaceId(candidate.url),
      url: candidate.url.href,
      host: candidate.url.hostname,
      kind: 'unclassified',
      foundBy: candidate.foundBy,
    }));
}

// "app.acme.com" -> "acme.com", "shop.acme.co.uk" -> "acme.co.uk". A heuristic without the
// public suffix list: two labels, or three when the last two are a common country suffix.
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  const countrySuffix = /^(?:co|com|org|net|ac|gov|edu)\.[a-z]{2}$/.test(
    labels.slice(-2).join('.'),
  );
  return labels.slice(-(countrySuffix ? 3 : 2)).join('.');
}

function linkRank(url: URL, text: string, site: string): number | null {
  const ranks = [
    ...LINK_TEXT.filter(([pattern]) => pattern.test(text)).map(([, rank]) => rank),
    ...LINK_PATH.filter(([pattern]) => pattern.test(url.pathname)).map(([, rank]) => rank),
  ];
  const prefix = url.hostname.endsWith(`.${site}`) ? url.hostname.slice(0, -site.length - 1) : '';
  if (prefix in PREFIX_RANK) ranks.push(PREFIX_RANK[prefix] ?? 5);
  return ranks.length ? Math.min(...ranks) : null;
}

async function resolves(host: string, options: DiscoverOptions): Promise<boolean> {
  const signal = options.signal ?? AbortSignal.timeout(5_000);
  const lookups = (['A', 'CNAME'] as const).map((type) =>
    options.net.dns(host, type, signal).then(
      (answer) => answer.records.length > 0,
      () => false,
    ),
  );
  return (await Promise.all(lookups)).some(Boolean);
}

function key(url: URL): string {
  return `${url.hostname}${url.pathname.replace(/\/+$/, '') || '/'}`.toLowerCase();
}

// "https://app.acme.com/login" -> "app-acme-com-login"
export function surfaceId(url: URL): string {
  return `${url.hostname}${url.pathname}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
