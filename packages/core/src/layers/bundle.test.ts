import { describe, expect, test } from 'vitest';
import type { Signal } from '../layer.ts';
import type { Net } from '../net.ts';
import { runLayer } from '../runner.ts';
import { surfaceTarget } from '../surface.ts';
import { bundleLayer, distillScript, extractBundleStrings, firstPartyScripts } from './bundle.ts';

const chunk = `
  const url="https://abcdefghijklmnopqrst.supabase.co",key="eyJhbGciOiJIUzI1NiJ9.x.y";
  fetch(\`\${url}/rest/v1/projects?select=*\`);
  const info={"X-Client-Info":"supabase-js/2.45.0"};
  // see https://www.w3.org/TR/html52/ and https://example.com/docs
  new WebSocket('wss://realtime.acme.test:443/socket');
  import("./chunks/app-12ab.js"); const v = "react-dom/18.3.1";
`;

describe('extractBundleStrings', () => {
  test('finds origins and SDK versions, and nothing else', () => {
    expect(extractBundleStrings(chunk)).toEqual({
      urls: ['https://abcdefghijklmnopqrst.supabase.co', 'wss://realtime.acme.test:443'],
      sdks: ['react-dom/18.3.1', 'supabase-js/2.45.0'],
    });
  });

  test('distilling keeps exactly those strings and no code', () => {
    const distilled = distillScript(chunk);
    expect(extractBundleStrings(distilled)).toEqual(extractBundleStrings(chunk));
    expect(distilled).not.toContain('eyJ');
    expect(distilled).not.toContain('fetch');
  });
});

test('firstPartyScripts keeps the site own scripts only', () => {
  const src = (value: string): Signal => ({
    layer: 'http',
    kind: 'script-src',
    value,
    source: 'https://app.acme.test/login',
  });
  expect(
    firstPartyScripts(
      [
        src('/_next/static/chunks/main.js'),
        src('https://cdn.acme.test/app.js'),
        src('https://www.googletagmanager.com/gtag/js'),
        src('/_next/static/chunks/main.js'),
        src('data:text/javascript,alert(1)'),
      ],
      'https://app.acme.test/login',
    ),
  ).toEqual(['https://app.acme.test/_next/static/chunks/main.js', 'https://cdn.acme.test/app.js']);
});

describe('bundleLayer', () => {
  const net = (bodies: Record<string, string | number>): Net => ({
    http: async (req) => {
      const body = bodies[req.url];
      if (body === undefined) throw new Error('no such script');
      return typeof body === 'number'
        ? { url: req.url, status: body, headers: [], body: '' }
        : { url: req.url, status: 200, headers: [['content-type', 'text/javascript']], body };
    },
    dns: () => Promise.reject(new Error('unused')),
    tls: () => Promise.reject(new Error('unused')),
  });

  test('reports what each readable script mentions', async () => {
    const layer = bundleLayer(['https://app.acme.test/a.js', 'https://app.acme.test/gone.js']);
    const result = await runLayer(layer, surfaceTarget('app.acme.test'), {
      net: net({ 'https://app.acme.test/a.js': chunk, 'https://app.acme.test/gone.js': 404 }),
    });
    expect(result.run.status).toBe('ok');
    expect(result.signals.map(({ kind, value }) => `${kind} ${value}`)).toEqual([
      'bundle-url https://abcdefghijklmnopqrst.supabase.co',
      'bundle-url wss://realtime.acme.test:443',
      'bundle-sdk react-dom/18.3.1',
      'bundle-sdk supabase-js/2.45.0',
    ]);
  });

  test('fails when no script could be read, and is skipped when there are none', async () => {
    const failed = await runLayer(
      bundleLayer(['https://app.acme.test/x.js']),
      surfaceTarget('app.acme.test'),
      {
        net: net({}),
      },
    );
    expect(failed.run).toMatchObject({ status: 'failed', error: { code: 'HTTP_STATUS' } });
    const skipped = await runLayer(bundleLayer([]), surfaceTarget('app.acme.test'), {
      net: net({}),
    });
    expect(skipped.run.status).toBe('skipped');
  });
});
