import { describe, expect, test } from 'vitest';
import { discoverSurfaces, registrableDomain } from './discover.ts';
import type { Signal } from './layer.ts';
import type { DnsRecordType, Net } from './net.ts';
import { surfaceTarget } from './surface.ts';

// Answers DNS for the names given; everything else does not exist.
function dnsNet(existing: Record<string, string>): Net & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    http: () => Promise.reject(new Error('unused')),
    tls: () => Promise.reject(new Error('unused')),
    dns: async (name: string, type: DnsRecordType) => {
      asked.push(`${type} ${name}`);
      const record = existing[name];
      return { name, type, records: record && type === 'A' ? [record] : [] };
    },
  };
}

const anchor = (value: string, key?: string): Signal => ({
  layer: 'http',
  kind: 'anchor',
  value,
  ...(key ? { key } : {}),
  source: 'https://acme.test/',
});

const urls = (surfaces: { url: string }[]) => surfaces.map((s) => s.url);

describe('discoverSurfaces', () => {
  test('follows links that lead to the app, sign-up, docs and status, best first', async () => {
    const found = await discoverSurfaces(
      surfaceTarget('acme.test'),
      [
        anchor('https://acme.test/pricing', 'Pricing'),
        anchor('https://docs.acme.test/intro?ref=nav#top', 'Docs'),
        anchor('https://acme.test/blog/launch', 'Read the launch post'),
        anchor('https://acme.test/sign-up', 'Get started'),
        anchor('https://app.acme.test/login', 'Log in'),
        anchor('https://status.acme.test/', 'Status'),
        anchor('https://other.test/login', 'Log in'),
      ],
      { net: dnsNet({}) },
    );
    expect(found.map(({ url, foundBy }) => ({ url, foundBy }))).toEqual([
      { url: 'https://app.acme.test/login', foundBy: { kind: 'link', text: 'Log in' } },
      { url: 'https://acme.test/sign-up', foundBy: { kind: 'link', text: 'Get started' } },
      { url: 'https://docs.acme.test/intro', foundBy: { kind: 'link', text: 'Docs' } },
      { url: 'https://status.acme.test/', foundBy: { kind: 'link', text: 'Status' } },
    ]);
    expect(found[0]).toMatchObject({ id: 'app-acme-test-login', host: 'app.acme.test' });
  });

  test('counts each subdomain once, and skips marketing pages', async () => {
    const found = await discoverSurfaces(
      surfaceTarget('acme.test'),
      [
        anchor('https://acme.test/pricing', 'Get started'),
        anchor('https://acme.test/use-cases/sales', 'Start free'),
        anchor('https://app.acme.test/login', 'Log in'),
        anchor('https://app.acme.test/signup', 'Sign up'),
        anchor('https://docs.acme.test/intro', 'Docs'),
        anchor('https://docs.acme.test/guides/start', 'Documentation'),
      ],
      { net: dnsNet({}) },
    );
    expect(urls(found)).toEqual(['https://app.acme.test/login', 'https://docs.acme.test/intro']);
  });

  test('counts each section once and skips the page itself', async () => {
    const found = await discoverSurfaces(
      surfaceTarget('acme.test'),
      [
        anchor('https://acme.test/', 'Log in'),
        anchor('https://acme.test/docs/start', 'Docs'),
        anchor('https://acme.test/docs/api', 'API reference'),
      ],
      { net: dnsNet({}) },
    );
    expect(urls(found)).toEqual(['https://acme.test/docs/start']);
  });

  test('checks common subdomains with DNS when given a whole domain', async () => {
    const net = dnsNet({ 'app.acme.test': '192.0.2.1', 'docs.acme.test': '192.0.2.2' });
    const found = await discoverSurfaces(surfaceTarget('www.acme.test'), [], { net });
    expect(found.map(({ url, foundBy }) => ({ url, foundBy }))).toEqual([
      { url: 'https://app.acme.test/', foundBy: { kind: 'subdomain' } },
      { url: 'https://docs.acme.test/', foundBy: { kind: 'subdomain' } },
    ]);
  });

  test('trusts no subdomain when the domain answers for every name', async () => {
    const net = dnsNet({
      'stackprobe-wildcard-check.acme.test': '192.0.2.9',
      'app.acme.test': '192.0.2.9',
    });
    expect(await discoverSurfaces(surfaceTarget('acme.test'), [], { net })).toEqual([]);
    expect(net.asked.filter((q) => q.includes('app.acme.test'))).toEqual([]);
  });

  test('does not guess subdomains for a subdomain or a page with a path', async () => {
    for (const input of ['app.acme.test', 'https://acme.test/login']) {
      const net = dnsNet({ 'app.acme.test': '192.0.2.1' });
      expect(await discoverSurfaces(surfaceTarget(input), [], { net })).toEqual([]);
      expect(net.asked).toEqual([]);
    }
  });

  test('a link to a subdomain is not checked again with DNS', async () => {
    const net = dnsNet({ 'app.acme.test': '192.0.2.1' });
    const found = await discoverSurfaces(
      surfaceTarget('acme.test'),
      [anchor('https://app.acme.test/sign-in', 'Sign in')],
      { net },
    );
    expect(urls(found)).toEqual(['https://app.acme.test/sign-in']);
  });

  test('stops at the limit', async () => {
    const links = ['login', 'dashboard', 'console', 'signup', 'register', 'docs', 'status'].map(
      (path) => anchor(`https://acme.test/${path}`),
    );
    const found = await discoverSurfaces(surfaceTarget('acme.test'), links, {
      net: dnsNet({}),
      max: 3,
    });
    expect(urls(found)).toEqual([
      'https://acme.test/login',
      'https://acme.test/dashboard',
      'https://acme.test/console',
    ]);
  });
});

test('registrableDomain', () => {
  expect(registrableDomain('app.acme.com')).toBe('acme.com');
  expect(registrableDomain('acme.com')).toBe('acme.com');
  expect(registrableDomain('shop.acme.co.uk')).toBe('acme.co.uk');
  expect(registrableDomain('www.acme.com.au')).toBe('acme.com.au');
});
