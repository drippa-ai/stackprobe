import { describe, expect, test } from 'vitest';
import { compileFingerprints, FingerprintError, type Matcher } from './fingerprint.ts';

function withMatch(match: Matcher, extra: object = {}) {
  return {
    id: 'acme',
    name: 'Acme',
    category: 'hosting',
    rules: [
      { id: 'r', layer: 'http', signal: 'header', key: 'server', match, weight: 0.9, ...extra },
    ],
  };
}

function compiledTest(match: Matcher) {
  const [fingerprint] = compileFingerprints([withMatch(match)]);
  const rule = fingerprint?.rules[0];
  if (!rule) throw new Error('expected one rule');
  return (value: string) => Boolean(rule.test(value));
}

describe('matchers', () => {
  test.each<[Matcher, string, boolean]>([
    [{ exists: true }, 'anything', true],
    [{ equals: 'Vercel' }, 'vercel', true],
    [{ equals: 'Vercel' }, 'Vercel Edge', false],
    [{ prefix: 'supabase-js' }, 'Supabase-JS/2.45.0', true],
    [{ suffix: '.vercel-dns.com' }, 'cname.vercel-dns.com', true],
    [{ suffix: '.vercel-dns.com' }, 'vercel-dns.com.evil.net', false],
    [{ contains: '/_next/static/' }, 'https://x.com/_next/static/chunks/a.js', true],
    [
      { regex: '^https://[a-z0-9]{20}\\.supabase\\.co/' },
      'https://abcdefghijklmnopqrst.supabase.co/',
      true,
    ],
    [{ regex: '^https://[a-z0-9]{20}\\.supabase\\.co/' }, 'https://supabase.co.evil.net/', false],
    [{ cidr: ['76.76.21.0/24'] }, '76.76.21.21', true],
    [{ cidr: ['76.76.21.0/24'] }, '76.76.22.1', false],
    [{ cidr: ['76.76.21.0/24'] }, 'not-an-ip', false],
    [{ cidr: ['128.0.0.0/1'] }, '200.1.1.1', true],
    [{ cidr: ['0.0.0.0/0'] }, '8.8.8.8', true],
  ])('%j on %s → %s', (match, value, expected) => {
    expect(compiledTest(match)(value)).toBe(expected);
  });
});

describe('compileFingerprints', () => {
  test('lists every problem at once', () => {
    const bad = [
      withMatch({ regex: '([unclosed' }),
      withMatch({ equals: 'x' }, { version: '$1' }),
      { id: 'Bad Id', name: 'x', category: 'x', rules: [] },
    ];
    try {
      compileFingerprints(bad);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(FingerprintError);
      const { problems } = error as FingerprintError;
      expect(problems).toEqual(
        expect.arrayContaining([
          expect.stringContaining('regex does not compile'),
          expect.stringContaining('version needs a regex matcher'),
          expect.stringContaining('duplicate fingerprint id'),
          expect.stringMatching(/^Bad Id: id:/),
          expect.stringMatching(/^Bad Id: rules:/),
        ]),
      );
    }
  });

  test('rejects unknown fields so typos do not silently disable a rule', () => {
    expect(() => compileFingerprints([withMatch({ equals: 'x' }, { wieght: 0.5 })])).toThrow(
      FingerprintError,
    );
  });

  test('rejects a matcher with two conditions', () => {
    expect(() =>
      compileFingerprints([withMatch({ equals: 'x', prefix: 'y' } as unknown as Matcher)]),
    ).toThrow(FingerprintError);
  });

  test('rejects duplicate rule ids within a fingerprint', () => {
    const fingerprint = withMatch({ exists: true });
    fingerprint.rules.push(...withMatch({ equals: 'x' }).rules);
    expect(() => compileFingerprints([fingerprint])).toThrow(/duplicate rule id/);
  });
});
