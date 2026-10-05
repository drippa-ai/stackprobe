import { describe, expect, test } from 'vitest';
import {
  classifyByRules,
  classifySurfaces,
  type Decider,
  detectionsWithFolded,
  ruleVotes,
  surfaceState,
  surfacesByRole,
} from './classify.ts';
import type { Signal, SurfaceTarget } from './layer.ts';
import type { Detection, Report } from './report.ts';
import type { LayerResult } from './runner.ts';
import { surfaceTarget } from './surface.ts';

const target = (url: string, foundBy?: SurfaceTarget['foundBy']): SurfaceTarget => ({
  ...surfaceTarget(url, 'x'),
  ...(foundBy ? { foundBy } : {}),
});
const header = (key: string, value: string): Signal => ({
  layer: 'http',
  kind: 'header',
  key,
  value,
});
const built = (tech: string): Detection => ({
  tech,
  category: 'site-builder',
  version: null,
  confidence: 0.95,
  evidence: [{ type: 'observed', layer: 'http', ruleId: 'x', detail: 'x', weight: 0.95 }],
});
const kindOf = (t: SurfaceTarget, signals: Signal[] = [], detections: Detection[] = []) =>
  classifyByRules(ruleVotes(t, signals, detections));

describe('rules', () => {
  test.each([
    ['https://app.acme.test/', 'app'],
    ['https://dashboard.acme.test/', 'app'],
    ['https://acme.test/login', 'app'],
    ['https://acme.test/sign-in/', 'app'],
    ['https://docs.acme.test/', 'docs'],
    ['https://acme.test/docs/start', 'docs'],
    ['https://status.acme.test/', 'status'],
    ['https://api.acme.test/', 'api'],
  ])('%s is %s', (url, kind) => {
    expect(kindOf(target(url)).kind).toBe(kind);
  });

  test('a Log in link points to the app, a Get started link less strongly', () => {
    const login = kindOf(target('https://acme.test/x', { kind: 'link', text: 'Log in' }));
    const start = kindOf(target('https://acme.test/x', { kind: 'link', text: 'Get started' }));
    expect(login).toMatchObject({ kind: 'app', confidence: 0.8 });
    expect(start).toMatchObject({ kind: 'app', confidence: 0.6 });
  });

  test('clues for the same kind add up', () => {
    const both = kindOf(target('https://app.acme.test/login', { kind: 'link', text: 'Sign in' }));
    expect(both.kind).toBe('app');
    expect(both.confidence).toBeGreaterThan(0.95);
    expect(both.reasons).toEqual(['/login page', 'app. subdomain', '"Sign in" link']);
  });

  test('a page built with Framer or Webflow is marketing', () => {
    expect(kindOf(target('https://acme.test/'), [], [built('framer')])).toMatchObject({
      kind: 'marketing',
    });
  });

  test('a rival kind lowers confidence', () => {
    // A Framer page reached through a "Log in" link: not settled either way.
    const mixed = kindOf(
      target('https://acme.test/x', { kind: 'link', text: 'Log in' }),
      [],
      [built('framer')],
    );
    expect(mixed.kind).toBe('marketing');
    expect(mixed.confidence).toBeLessThan(0.6);
  });

  test('a homepage alone is only a weak hint of marketing', () => {
    expect(kindOf(target('https://acme.test/'))).toMatchObject({
      kind: 'marketing',
      confidence: 0.5,
    });
    expect(kindOf(target('https://www.acme.test/'))).toMatchObject({ kind: 'marketing' });
  });

  test('JSON answers and Clerk middleware are clues too', () => {
    expect(
      kindOf(target('https://x.acme.test/'), [header('content-type', 'application/json')]).kind,
    ).toBe('api');
    expect(
      kindOf(target('https://acme.test/x'), [header('x-clerk-auth-status', 'signed-out')]).kind,
    ).toBe('app');
  });

  test('no clues, no kind', () => {
    expect(kindOf(target('https://acme.test/about-us'))).toMatchObject({
      kind: 'unclassified',
      confidence: null,
    });
  });
});

describe('classifySurfaces', () => {
  const surface = (url: string, signals: Signal[] = []) => ({
    target: target(url),
    results: [
      { run: { layer: 'http', surfaceId: 'x', status: 'ok', durationMs: 1 }, signals },
    ] as LayerResult[],
  });

  function decider(choice: 'app' | 'marketing'): Decider & { asked: unknown[] } {
    const asked: unknown[] = [];
    return {
      asked,
      async choose(question) {
        asked.push(question.state);
        const probabilities = Object.fromEntries(
          Object.keys(question.options).map((k) => [k, k === choice ? 0.9 : 0.1 / 6]),
        ) as never;
        return { choice: choice as never, probabilities, confidence: 0.8 };
      },
    };
  }

  test('an error page stays unclassified, whatever its address says', async () => {
    const kinds = await classifySurfaces([
      {
        ...surface('https://console.acme.test/', [
          { layer: 'http', kind: 'http-status', value: '403' },
        ]),
        target: { ...target('https://console.acme.test/'), id: 'c' },
      },
    ]);
    expect(kinds.c).toMatchObject({ kind: 'unclassified', reasons: ['page answers 403'] });
  });

  test('rules alone leave unsure surfaces unclassified', async () => {
    const kinds = await classifySurfaces([
      {
        ...surface('https://app.acme.test/'),
        target: { ...target('https://app.acme.test/'), id: 'a' },
      },
      { ...surface('https://acme.test/'), target: { ...target('https://acme.test/'), id: 'b' } },
    ]);
    expect(kinds.a).toMatchObject({ kind: 'app', decidedBy: 'rules' });
    expect(kinds.b).toMatchObject({ kind: 'unclassified', confidence: null, decidedBy: 'none' });
  });

  test('an unsure or failing decider leaves the surface unclassified', async () => {
    const unsure: Decider = {
      async choose(question) {
        const keys = Object.keys(question.options);
        const probabilities = Object.fromEntries(keys.map((k) => [k, k === 'app' ? 0.7 : 0.05]));
        return { choice: 'app' as never, probabilities: probabilities as never, confidence: 0.5 };
      },
    };
    const failing: Decider = {
      async choose() {
        throw new Error('402 out of credit');
      },
    };
    for (const decider of [unsure, failing]) {
      const kinds = await classifySurfaces(
        [
          {
            ...surface('https://acme.test/'),
            target: { ...target('https://acme.test/'), id: 'b' },
          },
        ],
        { decider },
      );
      expect(kinds.b).toMatchObject({ kind: 'unclassified', confidence: null, decidedBy: 'none' });
    }
  });

  test('a decider settles only what rules cannot', async () => {
    const model = decider('app');
    const kinds = await classifySurfaces(
      [
        {
          ...surface('https://app.acme.test/'),
          target: { ...target('https://app.acme.test/'), id: 'a' },
        },
        { ...surface('https://acme.test/'), target: { ...target('https://acme.test/'), id: 'b' } },
      ],
      { decider: model },
    );
    expect(model.asked).toHaveLength(1);
    expect(kinds.a).toMatchObject({ kind: 'app', decidedBy: 'rules' });
    expect(kinds.b).toMatchObject({ kind: 'app', confidence: 0.9, decidedBy: 'decider' });
  });
});

test('surfaceState shares public facts only', () => {
  const signals: Signal[] = [
    { layer: 'http', kind: 'meta', key: 'og:title', value: 'Acme' },
    { layer: 'http', kind: 'cookie-name', value: 'session' },
    { layer: 'http', kind: 'header', key: 'set-cookie', value: 'session=secret' },
    { layer: 'http', kind: 'anchor', key: 'Pricing', value: 'https://acme.test/pricing' },
  ];
  const state = surfaceState(target('https://acme.test/'), signals, [built('framer')]);
  expect(state).toEqual({
    url: 'https://acme.test/',
    reachedBy: 'it is the address that was asked for',
    title: 'Acme',
    description: null,
    contentType: null,
    linkTexts: ['Pricing'],
    technologies: ['framer (site-builder)'],
  });
  expect(JSON.stringify(state)).not.toContain('secret');
});

test('surfacesByRole puts the product first', () => {
  const surface = (
    id: string,
    kind: Report['surfaces'][number]['kind'],
    kindConfidence: number | null,
  ) => ({
    id,
    url: `https://${id}.acme.test/`,
    kind,
    kindConfidence,
    detections: [],
  });
  const report: Report = {
    schemaVersion: '1',
    domain: 'acme.test',
    scannedAt: '2026-10-04T12:00:00.000Z',
    fingerprintsVersion: 'x',
    surfaces: [
      surface('home', 'marketing', 0.9),
      surface('docs', 'docs', 0.85),
      surface('signup', 'app', 0.6),
      surface('app', 'app', 0.96),
    ],
    layersRun: [],
  };
  const roles = surfacesByRole(report);
  expect(roles.product.map((s) => s.id)).toEqual(['app', 'signup']);
  expect(roles.marketing.map((s) => s.id)).toEqual(['home']);
  expect(roles.other.map((s) => s.id)).toEqual(['docs']);
});

describe('folding', () => {
  const det = (tech: string, confidence: number): Detection => ({
    ...built(tech),
    category: 'x',
    confidence,
  });
  const surface = (
    id: string,
    url: string,
    kind: Report['surfaces'][number]['kind'],
    extra: Partial<Report['surfaces'][number]> = {},
  ): Report['surfaces'][number] => ({
    id,
    url,
    kind,
    kindConfidence: kind === 'unclassified' ? null : 0.8,
    detections: [],
    ...extra,
  });
  const report = (surfaces: Report['surfaces']): Report => ({
    schemaVersion: '1',
    domain: 'acme.test',
    scannedAt: '2026-10-05T12:00:00.000Z',
    fingerprintsVersion: 'x',
    surfaces,
    layersRun: [],
  });

  test('a sign-in link that redirects into the app is part of the app', () => {
    const roles = surfacesByRole(
      report([
        surface('root', 'https://acme.test/', 'marketing'),
        surface('signin', 'https://acme.test/signin', 'app', {
          redirectsTo: 'https://app.acme.test/login',
          kindConfidence: 0.98,
        }),
        surface('app', 'https://app.acme.test/signup', 'app', { kindConfidence: 0.97 }),
      ]),
    );
    expect(roles.product.map((s) => s.id)).toEqual(['app']);
    expect(roles.folded.app?.map((f) => [f.surface.id, f.reason])).toEqual([
      ['signin', 'redirect'],
    ]);
    expect(roles.marketing.map((s) => s.id)).toEqual(['root']);
  });

  test('app pages on one host are one app; apps on other hosts stay apart', () => {
    const roles = surfacesByRole(
      report([
        surface('login', 'https://acme.test/login', 'app', { kindConfidence: 0.96 }),
        surface('signup', 'https://www.acme.test/signup', 'app', { kindConfidence: 0.84 }),
        surface('portal', 'https://portal.acme.test/', 'app', { kindConfidence: 0.8 }),
      ]),
    );
    expect(roles.product.map((s) => s.id)).toEqual(['login', 'portal']);
    expect(roles.folded.login?.map((f) => [f.surface.id, f.reason])).toEqual([
      ['signup', 'same-app'],
    ]);
  });

  test('a redirect to a host the scan did not cover stays visible', () => {
    const roles = surfacesByRole(
      report([
        surface('signin', 'https://acme.test/signin', 'app', {
          redirectsTo: 'https://acme.eu.auth0.com/u/login',
        }),
      ]),
    );
    expect(roles.product.map((s) => s.id)).toEqual(['signin']);
  });

  test('folded findings are kept, the most certain of each', () => {
    const lead = surface('login', 'https://acme.test/login', 'app', {
      detections: [det('nextjs', 0.9), det('clerk', 0.6)],
    });
    const signup = surface('signup', 'https://acme.test/signup', 'app', {
      detections: [det('clerk', 0.95), det('supabase', 0.9)],
    });
    expect(
      detectionsWithFolded(lead, [{ surface: signup, reason: 'same-app' }]).map((d) => [
        d.tech,
        d.confidence,
      ]),
    ).toEqual([
      ['clerk', 0.95],
      ['nextjs', 0.9],
      ['supabase', 0.9],
    ]);
  });
});
