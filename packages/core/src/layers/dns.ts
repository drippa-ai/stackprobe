import { type Layer, LayerError } from '../layer.ts';
import type { DnsRecordType, Net } from '../net.ts';

const MAX_CNAME_HOPS = 5;

// Layer 2: where the surface's hostname points. CNAMEs and IP ranges often name the host
// directly (cname.vercel-dns.com, 76.76.21.21); nameservers say who runs the DNS.
export const dnsLayer: Layer = {
  id: 'dns',
  timeoutMs: 5_000,
  appliesTo: () => true,
  async run(surface, ctx) {
    const lookup = (name: string, type: DnsRecordType) => ctx.net.dns(name, type, ctx.signal);
    const host = surface.host;

    const [a, aaaa, cnames, ns] = await Promise.all([
      lookup(host, 'A'),
      lookup(host, 'AAAA'),
      cnameChain(ctx.net, host, ctx.signal),
      nameservers(ctx.net, host, ctx.signal),
    ]);
    if (a.records.length === 0 && aaaa.records.length === 0 && cnames.length === 0) {
      throw new LayerError('DNS_NXDOMAIN', `${host} has no addresses`);
    }
    for (const value of a.records) ctx.emit({ layer: 'dns', kind: 'a', value, source: host });
    for (const value of aaaa.records) ctx.emit({ layer: 'dns', kind: 'aaaa', value, source: host });
    for (const value of cnames) ctx.emit({ layer: 'dns', kind: 'cname', value, source: host });
    for (const value of ns) ctx.emit({ layer: 'dns', kind: 'ns', value, source: host });
  },
};

// Follows CNAME → CNAME → … so the final target is reported too.
async function cnameChain(net: Net, host: string, signal: AbortSignal): Promise<string[]> {
  const chain: string[] = [];
  let name = host;
  for (let hop = 0; hop < MAX_CNAME_HOPS; hop++) {
    const [target] = (await net.dns(name, 'CNAME', signal)).records;
    if (!target || chain.includes(target)) break;
    chain.push(target);
    name = target;
  }
  return chain;
}

// Nameservers live on the zone apex, so www.example.com asks example.com instead.
async function nameservers(net: Net, host: string, signal: AbortSignal): Promise<string[]> {
  let name = host;
  while (name.split('.').length >= 2) {
    const { records } = await net.dns(name, 'NS', signal);
    if (records.length > 0) return records;
    name = name.slice(name.indexOf('.') + 1);
  }
  return [];
}
