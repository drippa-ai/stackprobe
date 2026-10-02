import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { generate, outputPath } from '../../scripts/build-fingerprints.ts';
import { detect } from '../detect.ts';
import type { Signal } from '../layer.ts';
import { builtinFingerprints } from './index.ts';

const ref = 'abcdefghijklmnopqrst';

function techs(signals: Signal[]) {
  return detect(signals, builtinFingerprints()).map((d) => d.tech);
}

test('the generated file matches fingerprints/*.yaml', () => {
  // Run `pnpm fingerprints` after editing a fingerprint.
  expect(readFileSync(outputPath, 'utf8')).toBe(generate());
});

describe('vercel', () => {
  test.each<[string, Signal]>([
    [
      'x-vercel-id header',
      { layer: 'http', kind: 'header', key: 'x-vercel-id', value: 'fra1::iad1::abc-123' },
    ],
    ['server header', { layer: 'http', kind: 'header', key: 'server', value: 'Vercel' }],
    [
      'analytics script',
      { layer: 'http', kind: 'script-src', value: '/_vercel/insights/script.js' },
    ],
    ['CNAME', { layer: 'dns', kind: 'cname', value: 'cname.vercel-dns.com' }],
    [
      'project CNAME',
      { layer: 'dns', kind: 'cname', value: 'd1d4fc829fe7bc7c.vercel-dns-017.com.' },
    ],
    ['anycast A record', { layer: 'dns', kind: 'a', value: '76.76.21.21' }],
    ['newer Vercel network', { layer: 'dns', kind: 'a', value: '155.121.0.3' }],
  ])('detects %s', (_, signal) => {
    expect(techs([signal])).toEqual(['vercel']);
  });

  test.each<[string, Signal]>([
    ['look-alike CNAME', { layer: 'dns', kind: 'cname', value: 'vercel-dns.com.evil.net' }],
    ['other server', { layer: 'http', kind: 'header', key: 'server', value: 'Vercel-like' }],
    ['nearby IP', { layer: 'dns', kind: 'a', value: '76.76.22.21' }],
  ])('ignores %s', (_, signal) => {
    expect(techs([signal])).toEqual([]);
  });

  test('nameservers alone are a weak signal', () => {
    const [vercel] = detect(
      [{ layer: 'dns', kind: 'ns', value: 'ns1.vercel-dns.com' }],
      builtinFingerprints(),
    );
    expect(vercel?.confidence).toBe(0.4);
  });
});

describe('supabase', () => {
  test.each<[string, Signal]>([
    [
      'REST request',
      {
        layer: 'browser',
        kind: 'request-url',
        value: `https://${ref}.supabase.co/rest/v1/todos?select=*`,
      },
    ],
    [
      'auth request',
      { layer: 'browser', kind: 'request-url', value: `https://${ref}.supabase.co/auth/v1/token` },
    ],
    [
      'realtime',
      {
        layer: 'browser',
        kind: 'websocket-url',
        value: `wss://${ref}.supabase.co/realtime/v1/websocket`,
      },
    ],
    ['auth cookie', { layer: 'browser', kind: 'cookie-name', value: `sb-${ref}-auth-token` }],
    ['preconnect', { layer: 'http', kind: 'link-href', value: `https://${ref}.supabase.co` }],
  ])('detects %s', (_, signal) => {
    expect(techs([signal])).toEqual(['supabase']);
  });

  test('reads the supabase-js version', () => {
    const [supabase] = detect(
      [
        {
          layer: 'browser',
          kind: 'request-header',
          key: 'X-Client-Info',
          value: 'supabase-js-web/2.45.4',
        },
      ],
      builtinFingerprints(),
    );
    expect(supabase).toMatchObject({ tech: 'supabase', version: '2.45.4' });
  });

  test.each<[string, Signal]>([
    [
      'the Supabase website',
      { layer: 'browser', kind: 'request-url', value: 'https://supabase.com/rest/v1/x' },
    ],
    [
      'a look-alike host',
      {
        layer: 'browser',
        kind: 'request-url',
        value: `https://${ref}.supabase.co.evil.net/rest/v1/`,
      },
    ],
  ])('ignores %s', (_, signal) => {
    expect(techs([signal])).toEqual([]);
  });
});

describe('nextjs', () => {
  test.each<[string, Signal]>([
    [
      'x-powered-by header',
      { layer: 'http', kind: 'header', key: 'x-powered-by', value: 'Next.js' },
    ],
    [
      'x-powered-by after another value',
      { layer: 'http', kind: 'header', key: 'x-powered-by', value: 'Express, Next.js' },
    ],
    [
      'App Router vary header',
      {
        layer: 'http',
        kind: 'header',
        key: 'vary',
        value: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch',
      },
    ],
    [
      'static script',
      { layer: 'http', kind: 'script-src', value: '/_next/static/chunks/main-app.js' },
    ],
    ['Pages Router global', { layer: 'browser', kind: 'window-global', value: '__NEXT_DATA__' }],
    ['App Router global', { layer: 'browser', kind: 'window-global', value: '__next_f' }],
  ])('detects %s', (_, signal) => {
    expect(techs([signal])).toEqual(['nextjs']);
  });

  test('ignores other frameworks', () => {
    expect(
      techs([{ layer: 'http', kind: 'header', key: 'x-powered-by', value: 'Express' }]),
    ).toEqual([]);
  });
});

test('a typical Next.js app on Vercel using Supabase', () => {
  const detections = detect(
    [
      { layer: 'http', kind: 'header', key: 'server', value: 'Vercel' },
      { layer: 'http', kind: 'header', key: 'x-vercel-id', value: 'fra1::abc' },
      { layer: 'http', kind: 'script-src', value: '/_next/static/chunks/main.js' },
      { layer: 'dns', kind: 'a', value: '76.76.21.21' },
      { layer: 'browser', kind: 'request-url', value: `https://${ref}.supabase.co/auth/v1/user` },
    ],
    builtinFingerprints(),
  );
  expect(detections.map((d) => [d.tech, d.confidence])).toEqual([
    ['vercel', 0.99],
    ['supabase', 0.95],
    ['nextjs', 0.9],
  ]);
});
