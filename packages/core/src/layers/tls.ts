import type { Layer } from '../layer.ts';
import type { Net } from '../net.ts';

// Layer 3: the certificate's issuer and the network (ASN) the server sits in, e.g.
// AS13335 Cloudflare or AS16509 Amazon.
export const tlsLayer: Layer = {
  id: 'tls',
  timeoutMs: 8_000,
  appliesTo: (surface) => surface.url.startsWith('https:'),
  async run(surface, ctx) {
    const port = Number(new URL(surface.url).port) || 443;
    const info = await ctx.net.tls(surface.host, port, ctx.signal);
    const source = `${surface.host}:${port}`;
    if (info.issuer) ctx.emit({ layer: 'tls', kind: 'cert-issuer', value: info.issuer, source });

    // ASN lookup is a nice-to-have: if it fails, the certificate still counts.
    const asn = await lookupAsn(ctx.net, info.ip, ctx.signal).catch(() => null);
    if (asn) ctx.emit({ layer: 'tls', kind: 'asn', value: asn, source: info.ip });
  },
};

// Team Cymru's IP-to-ASN service, over plain DNS: no API key, and replayable in tests.
// Returns e.g. "AS13335 CLOUDFLARENET - Cloudflare, Inc., US".
export async function lookupAsn(net: Net, ip: string, signal: AbortSignal): Promise<string | null> {
  const query = originQuery(ip);
  if (!query) return null;
  const [origin] = (await net.dns(query, 'TXT', signal)).records;
  const asn = origin?.split('|')[0]?.trim().split(/\s+/)[0];
  if (!asn || !/^\d+$/.test(asn)) return null;
  const [details] = (await net.dns(`AS${asn}.asn.cymru.com`, 'TXT', signal)).records;
  const name = details?.split('|').at(-1)?.trim();
  return name ? `AS${asn} ${name}` : `AS${asn}`;
}

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

export function originQuery(ip: string): string | null {
  if (IPV4.test(ip)) return `${ip.split('.').reverse().join('.')}.origin.asn.cymru.com`;
  if (IPV6.test(ip) && ip.includes(':'))
    return `${[...expandIpv6(ip)].reverse().join('.')}.origin6.asn.cymru.com`;
  return null;
}

// "2606:4700::1111" → "26064700000000000000000000001111"
function expandIpv6(ip: string): string {
  const [head = '', tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::')
    ? [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
    : left;
  return groups.map((group) => group.padStart(4, '0')).join('');
}
