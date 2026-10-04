import { describe, expect, test } from 'vitest';
import {
  type Browser,
  type BrowserCapture,
  captureSignals,
  ownCapture,
  sanitizeCapture,
} from './browser.ts';
import type { Classification } from './classify.ts';
import { detect } from './detect.ts';
import { builtinFingerprints } from './fingerprints/index.ts';
import type { Net } from './net.ts';
import { Report } from './report.ts';
import { deepTargets, scan } from './scan.ts';
import { surfaceTarget } from './surface.ts';

const project = 'abcdefghijklmnopqrst';
const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJlX2hlcmU';

const supabaseApp: BrowserCapture = {
  url: 'https://app.acme.test/login?next=%2F#top',
  status: 200,
  requests: [
    {
      url: `https://${project}.supabase.co/auth/v1/user?apikey=${jwt}`,
      method: 'get',
      type: 'fetch',
      headers: {
        'X-Client-Info': 'supabase-js-web/2.45.0',
        apikey: jwt,
        authorization: `Bearer ${jwt}`,
      },
    },
    {
      url: 'https://app.acme.test/_next/static/chunks/main.js',
      method: 'GET',
      type: 'script',
      headers: {},
    },
    { url: 'data:image/png;base64,AAAA', method: 'GET', type: 'image', headers: {} },
  ],
  websockets: [`wss://${project}.supabase.co/realtime/v1/websocket?apikey=${jwt}&vsn=1.0.0`],
  cookies: [`sb-${project}-auth-token=${jwt}`, '__client_uat'],
  globals: ['__next_f', 'not a name', 'Clerk'],
};

describe('sanitizeCapture', () => {
  test('drops query strings, keys, cookie values and unknown headers', () => {
    const clean = sanitizeCapture(supabaseApp);
    expect(clean.url).toBe('https://app.acme.test/login');
    expect(clean.requests).toEqual([
      {
        url: `https://${project}.supabase.co/auth/v1/user`,
        method: 'GET',
        type: 'fetch',
        headers: { 'x-client-info': 'supabase-js-web/2.45.0' },
      },
      {
        url: 'https://app.acme.test/_next/static/chunks/main.js',
        method: 'GET',
        type: 'script',
        headers: {},
      },
    ]);
    expect(clean.websockets).toEqual([`wss://${project}.supabase.co/realtime/v1/websocket`]);
    expect(clean.cookies).toEqual([`sb-${project}-auth-token`, '__client_uat']);
    expect(clean.globals).toEqual(['__next_f', 'Clerk']);
    expect(JSON.stringify(clean)).not.toContain(jwt);
  });
});

test('a capture of a Supabase app is detected as Supabase, with its version', () => {
  const detections = detect(captureSignals(sanitizeCapture(supabaseApp)), builtinFingerprints());
  const supabase = detections.find((d) => d.tech === 'supabase');
  expect(supabase?.confidence).toBe(0.95);
  expect(supabase?.version).toBe('2.45.0');
  expect(supabase?.evidence.every((e) => e.layer === 'browser')).toBe(true);
  expect(detections.map((d) => d.tech)).toEqual(expect.arrayContaining(['nextjs', 'clerk']));
});

describe('ownCapture', () => {
  const page = (url: string, type = 'document') => ({ url, method: 'GET', type, headers: {} });
  const left: BrowserCapture = {
    url: 'https://signin.acme.test/',
    status: 200,
    requests: [
      page('https://app.acme.test/'),
      page('https://app.acme.test/_next/static/app.js', 'script'),
      page('https://signin.acme.test/'),
      page('https://signin.acme.test/_next/static/signin.js', 'script'),
    ],
    websockets: ['wss://signin.acme.test/live'],
    cookies: ['signin_session'],
    globals: ['__next_f'],
  };

  test('keeps what happened before the page left for another host, and where it went', () => {
    expect(ownCapture(left, 'https://app.acme.test/')).toEqual({
      ...left,
      requests: [
        page('https://app.acme.test/'),
        page('https://app.acme.test/_next/static/app.js', 'script'),
        page('https://signin.acme.test/'),
      ],
      websockets: [],
      cookies: [],
      globals: [],
    });
  });

  test('a page that stays on its host, or only adds www, is kept whole', () => {
    expect(ownCapture(left, 'https://signin.acme.test/')).toBe(left);
    const www = { ...left, url: 'https://www.acme.test/' };
    expect(ownCapture(www, 'https://acme.test/')).toBe(www);
  });

  test('a redirect to an Auth0 login still shows Auth0, not the login page stack', () => {
    const auth0: BrowserCapture = {
      ...left,
      url: 'https://acme.eu.auth0.com/u/login',
      requests: [
        page('https://app.acme.test/'),
        page('https://acme.eu.auth0.com/authorize'),
        page('https://acme.eu.auth0.com/u/login'),
        page('https://cdn.auth0.com/ulp/react.js', 'script'),
      ],
    };
    const own = ownCapture(auth0, 'https://app.acme.test/');
    const techs = detect(captureSignals(own), builtinFingerprints()).map((d) => d.tech);
    expect(techs).toContain('auth0');
    expect(techs).not.toContain('nextjs');
    expect(own.requests.map((r) => r.url)).toEqual([
      'https://app.acme.test/',
      'https://acme.eu.auth0.com/authorize',
    ]);
  });
});

describe('deepTargets', () => {
  const s = (url: string, id: string) => ({ target: surfaceTarget(url, id) });
  const k = (kind: Classification['kind'], confidence: number | null): Classification => ({
    kind,
    confidence,
    reasons: [],
    decidedBy: 'rules',
  });

  test('picks the most certain apps, then an unclassified homepage', () => {
    const surfaces = [
      s('https://acme.test/', 'root'),
      s('https://acme.test/signup', 'signup'),
      s('https://app.acme.test/', 'app'),
      s('https://acme.test/login', 'login'),
      s('https://docs.acme.test/', 'docs'),
    ];
    const picked = deepTargets(surfaces, {
      root: k('unclassified', null),
      signup: k('app', 0.6),
      app: k('app', 0.96),
      login: k('app', 0.8),
      docs: k('docs', 0.85),
    });
    expect(picked.map((t) => t.id)).toEqual(['app', 'login', 'root']);
  });

  test('leaves a marketing homepage alone', () => {
    expect(deepTargets([s('https://acme.test/', 'root')], { root: k('marketing', 0.9) })).toEqual(
      [],
    );
  });
});

describe('scan with a browser', () => {
  const net: Net = {
    http: () => Promise.reject(new Error('offline')),
    dns: () => Promise.reject(new Error('offline')),
    tls: () => Promise.reject(new Error('offline')),
  };

  test('loads the app in the browser and reports what its JavaScript did', async () => {
    const loaded: string[] = [];
    const browser: Browser = {
      async capture(url) {
        loaded.push(url);
        return supabaseApp;
      },
    };
    const report = await scan('app.acme.test', { net, browser, discover: false });
    expect(Report.parse(report)).toEqual(report);
    expect(loaded).toEqual(['https://app.acme.test/']);
    expect(report.surfaces[0]?.kind).toBe('app');
    expect(report.surfaces[0]?.detections.map((d) => d.tech)).toContain('supabase');
    expect(report.layersRun.find((run) => run.layer === 'browser')).toMatchObject({
      status: 'ok',
      surfaceId: 'root',
    });
  });

  test('a browser that fails marks the scan partial, nothing more', async () => {
    const browser: Browser = {
      capture: () => Promise.reject(new Error('Chromium is not installed')),
    };
    const report = await scan('app.acme.test', { net, browser, discover: false });
    expect(report.layersRun.find((run) => run.layer === 'browser')).toMatchObject({
      status: 'failed',
      error: { message: 'Chromium is not installed' },
    });
  });
});
