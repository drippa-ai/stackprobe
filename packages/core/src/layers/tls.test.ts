import { describe, expect, test } from 'vitest';
import { LayerError } from '../layer.ts';
import type { DnsRecordType, Net, TlsInfo } from '../net.ts';
import { runLayer } from '../runner.ts';
import { surfaceTarget } from '../surface.ts';
import { originQuery, tlsLayer } from './tls.ts';

const cert: TlsInfo = {
  host: 'acme.test',
  ip: '104.16.1.1',
  issuer: 'C=US, O=Google Trust Services, CN=WE1',
  subjectAltNames: ['acme.test'],
  validFrom: 'Sep  1 00:00:00 2026 GMT',
  validTo: 'Dec  1 00:00:00 2026 GMT',
};

function netWith(
  txt: Record<string, string[]>,
  info: TlsInfo = cert,
): Net & { tlsCalls: string[] } {
  const tlsCalls: string[] = [];
  return {
    tlsCalls,
    http: () => Promise.reject(new Error('unused')),
    async tls(host, port) {
      tlsCalls.push(`${host}:${port}`);
      return info;
    },
    async dns(name: string, type: DnsRecordType) {
      const records = txt[name];
      if (type !== 'TXT' || !records) throw new LayerError('DNS_NXDOMAIN', name);
      return { name, type, records };
    },
  };
}

describe('tlsLayer', () => {
  test('reports the issuer and the ASN', async () => {
    const net = netWith({
      '1.1.16.104.origin.asn.cymru.com': ['13335 | 104.16.0.0/13 | US | arin | 2010-07-14'],
      'AS13335.asn.cymru.com': [
        '13335 | US | arin | 2010-07-14 | CLOUDFLARENET - Cloudflare, Inc., US',
      ],
    });
    const result = await runLayer(tlsLayer, surfaceTarget('acme.test'), { net });
    expect(result.run.status).toBe('ok');
    expect(net.tlsCalls).toEqual(['acme.test:443']);
    expect(result.signals.map((s) => `${s.kind} ${s.value}`)).toEqual([
      'cert-issuer C=US, O=Google Trust Services, CN=WE1',
      'asn AS13335 CLOUDFLARENET - Cloudflare, Inc., US',
    ]);
  });

  test('still reports the certificate when the ASN lookup fails', async () => {
    const result = await runLayer(tlsLayer, surfaceTarget('acme.test'), { net: netWith({}) });
    expect(result.run.status).toBe('ok');
    expect(result.signals.map((s) => s.kind)).toEqual(['cert-issuer']);
  });

  test('uses the port from the URL', async () => {
    const net = netWith({});
    await runLayer(tlsLayer, surfaceTarget('https://acme.test:8443/'), { net });
    expect(net.tlsCalls).toEqual(['acme.test:8443']);
  });

  test('skips plain http surfaces', async () => {
    const result = await runLayer(tlsLayer, surfaceTarget('http://acme.test/'), {
      net: netWith({}),
    });
    expect(result.run.status).toBe('skipped');
  });
});

describe('originQuery', () => {
  test.each([
    ['104.16.1.1', '1.1.16.104.origin.asn.cymru.com'],
    [
      '2606:4700::1111',
      '1.1.1.1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.7.4.6.0.6.2.origin6.asn.cymru.com',
    ],
    ['not-an-ip', null],
  ])('%s', (ip, expected) => {
    expect(originQuery(ip)).toBe(expected);
  });
});
