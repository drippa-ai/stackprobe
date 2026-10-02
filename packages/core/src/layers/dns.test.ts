import { describe, expect, test } from 'vitest';
import { LayerError } from '../layer.ts';
import type { DnsRecordType, Net } from '../net.ts';
import { runLayer } from '../runner.ts';
import { surfaceTarget } from '../surface.ts';
import { dnsLayer } from './dns.ts';

function netFrom(zone: Record<string, string[]>, missing: string[] = []): Net {
  return {
    http: () => Promise.reject(new Error('unused')),
    tls: () => Promise.reject(new Error('unused')),
    async dns(name: string, type: DnsRecordType) {
      if (missing.includes(name)) throw new LayerError('DNS_NXDOMAIN', `${name} not found`);
      return { name, type, records: zone[`${type} ${name}`] ?? [] };
    },
  };
}

describe('dnsLayer', () => {
  test('reports addresses, the whole CNAME chain and the apex nameservers', async () => {
    const net = netFrom({
      'CNAME www.acme.test': ['acme.edge.test'],
      'CNAME acme.edge.test': ['cname.vercel-dns.com'],
      'A www.acme.test': ['76.76.21.21'],
      'AAAA www.acme.test': ['2606:4700::1'],
      'NS acme.test': ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'],
    });
    const result = await runLayer(dnsLayer, surfaceTarget('www.acme.test'), { net });
    expect(result.run.status).toBe('ok');
    expect(result.signals.map((s) => `${s.kind} ${s.value}`)).toEqual([
      'a 76.76.21.21',
      'aaaa 2606:4700::1',
      'cname acme.edge.test',
      'cname cname.vercel-dns.com',
      'ns ns1.vercel-dns.com',
      'ns ns2.vercel-dns.com',
    ]);
  });

  test('stops on a CNAME loop', async () => {
    const net = netFrom({
      'CNAME a.acme.test': ['b.acme.test'],
      'CNAME b.acme.test': ['a.acme.test'],
    });
    const result = await runLayer(dnsLayer, surfaceTarget('a.acme.test'), { net });
    expect(result.signals.filter((s) => s.kind === 'cname').map((s) => s.value)).toEqual([
      'b.acme.test',
      'a.acme.test',
    ]);
  });

  test('fails for a domain that does not exist', async () => {
    const result = await runLayer(dnsLayer, surfaceTarget('nope.test'), {
      net: netFrom({}, ['nope.test']),
    });
    expect(result.run).toMatchObject({ status: 'failed', error: { code: 'DNS_NXDOMAIN' } });
  });

  test('fails for a name with no addresses at all', async () => {
    const result = await runLayer(dnsLayer, surfaceTarget('empty.test'), { net: netFrom({}) });
    expect(result.run.error?.code).toBe('DNS_NXDOMAIN');
  });
});
