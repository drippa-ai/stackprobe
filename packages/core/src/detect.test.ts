import { describe, expect, test } from 'vitest';
import { detect } from './detect.ts';
import { compileFingerprints } from './fingerprint.ts';
import type { Signal } from './layer.ts';

const fingerprints = compileFingerprints([
  {
    id: 'vercel',
    name: 'Vercel',
    category: 'hosting',
    rules: [
      {
        id: 'x-vercel-id',
        layer: 'http',
        signal: 'header',
        key: 'x-vercel-id',
        match: { exists: true },
        weight: 0.95,
      },
      {
        id: 'server',
        layer: 'http',
        signal: 'header',
        key: 'server',
        match: { equals: 'Vercel' },
        weight: 0.9,
      },
      {
        id: 'cname',
        layer: 'dns',
        signal: 'cname',
        match: { suffix: '.vercel-dns.com' },
        weight: 0.9,
      },
    ],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    category: 'backend-as-a-service',
    rules: [
      {
        id: 'api-request',
        layer: 'browser',
        signal: 'request-url',
        match: { regex: '^https://[a-z0-9]{20}\\.supabase\\.co/(rest|auth)/v1/' },
        weight: 0.95,
        detail: 'Request to the Supabase API',
      },
      {
        id: 'client-info',
        layer: 'browser',
        signal: 'request-header',
        key: 'x-client-info',
        match: { regex: '^supabase-js(?:-web)?/(\\d+\\.\\d+\\.\\d+)' },
        weight: 0.9,
        version: '$1',
      },
      {
        id: 'cname',
        layer: 'dns',
        signal: 'cname',
        match: { suffix: '.supabase.co' },
        weight: 0.2,
      },
    ],
  },
]);

const header = (key: string, value: string): Signal => ({
  layer: 'http',
  kind: 'header',
  key,
  value,
});
const cname = (value: string): Signal => ({ layer: 'dns', kind: 'cname', value });
const request = (value: string): Signal => ({ layer: 'browser', kind: 'request-url', value });

describe('detect', () => {
  test('returns nothing when no rule matches', () => {
    expect(detect([header('server', 'nginx')], fingerprints)).toEqual([]);
  });

  test('takes the strongest rule within one layer', () => {
    const [vercel] = detect(
      [header('x-vercel-id', 'fra1::abc'), header('Server', 'Vercel')],
      fingerprints,
    );
    expect(vercel?.confidence).toBe(0.95);
    expect(vercel?.evidence.map((e) => e.ruleId)).toEqual(['vercel/x-vercel-id', 'vercel/server']);
  });

  test('combines layers and caps confidence below certainty', () => {
    const [vercel] = detect(
      [header('server', 'Vercel'), cname('cname.vercel-dns.com')],
      fingerprints,
    );
    // 1 - (0.1 × 0.1) = 0.99
    expect(vercel?.confidence).toBe(0.99);

    const [stronger] = detect(
      [header('x-vercel-id', 'x'), cname('cname.vercel-dns.com')],
      fingerprints,
    );
    // 1 - (0.05 × 0.1) = 0.995, capped
    expect(stronger?.confidence).toBe(0.99);
  });

  test('counts a rule that fires many times once, and says how often', () => {
    const url = 'https://abcdefghijklmnopqrst.supabase.co/rest/v1/items';
    const [supabase] = detect([request(url), request(url), request(url)], fingerprints);
    expect(supabase?.confidence).toBe(0.95);
    expect(supabase?.evidence).toEqual([
      {
        type: 'observed',
        layer: 'browser',
        ruleId: 'supabase/api-request',
        detail: `Request to the Supabase API (request-url: ${url}) (+2 more)`,
        weight: 0.95,
      },
    ]);
  });

  test('extracts a version from regex groups', () => {
    const [supabase] = detect(
      [
        {
          layer: 'browser',
          kind: 'request-header',
          key: 'X-Client-Info',
          value: 'supabase-js-web/2.45.1',
        },
      ],
      fingerprints,
    );
    expect(supabase?.version).toBe('2.45.1');
  });

  test('ignores signals from a different layer than the rule', () => {
    expect(
      detect([{ layer: 'browser', kind: 'header', key: 'server', value: 'Vercel' }], fingerprints),
    ).toEqual([]);
  });

  test('drops detections below the minimum confidence', () => {
    const signals = [cname('abc.supabase.co')];
    expect(detect(signals, fingerprints)).toEqual([]);
    expect(detect(signals, fingerprints, { minConfidence: 0.1 })[0]?.confidence).toBe(0.2);
  });

  test('sorts detections by confidence', () => {
    const detections = detect(
      [
        header('server', 'Vercel'),
        request('https://abcdefghijklmnopqrst.supabase.co/auth/v1/user'),
      ],
      fingerprints,
    );
    expect(detections.map((d) => [d.tech, d.confidence])).toEqual([
      ['supabase', 0.95],
      ['vercel', 0.9],
    ]);
  });
});
