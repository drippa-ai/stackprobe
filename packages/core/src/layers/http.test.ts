import { describe, expect, test } from 'vitest';
import { LayerError } from '../layer.ts';
import type { HttpRequest, HttpResponse, Net } from '../net.ts';
import { runLayer } from '../runner.ts';
import { surfaceTarget } from '../surface.ts';
import { distillHtml, httpLayer, responseSignals } from './http.ts';

function page(url: string, headers: [string, string][], body = ''): HttpResponse {
  return { url, status: 200, headers, body };
}

function redirect(url: string, location: string, status = 301): HttpResponse {
  return { url, status, headers: [['location', location]], body: '' };
}

function netFrom(responses: Record<string, HttpResponse>): Net & { requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    async http(req: HttpRequest) {
      requested.push(req.url);
      const response = responses[req.url];
      if (!response) throw new LayerError('CONNECT_FAILED', `no route to ${req.url}`);
      return response;
    },
    dns: () => Promise.reject(new Error('unused')),
    tls: () => Promise.reject(new Error('unused')),
  };
}

const html = `<!doctype html><html><head>
  <meta charset="utf-8">
  <meta name="Generator" content="Framer 1a2b">
  <meta property="og:title" content="Acme &amp; Co">
  <link rel="preconnect" href="https://abcdefghijklmnopqrst.supabase.co">
  <link rel="stylesheet" href="/_next/static/css/app.css">
  <script src="/_next/static/chunks/main.js" async></script>
  <script>window.secret = "inline content is not read"</script>
</head><body><h1>Welcome</h1><a href="/login">Log in</a></body></html>`;

describe('responseSignals', () => {
  test('reports headers, cookie names and the tags that reveal a stack', () => {
    const signals = responseSignals(
      page(
        'https://acme.test/',
        [
          ['server', 'Vercel'],
          ['set-cookie', 'sb-abc-auth-token=secret; Path=/'],
          ['content-type', 'text/html; charset=utf-8'],
        ],
        html,
      ),
    );
    expect(signals.map(({ source, ...s }) => s)).toEqual([
      { layer: 'http', kind: 'header', key: 'server', value: 'Vercel' },
      { layer: 'http', kind: 'cookie-name', value: 'sb-abc-auth-token' },
      { layer: 'http', kind: 'header', key: 'content-type', value: 'text/html; charset=utf-8' },
      { layer: 'http', kind: 'meta', key: 'generator', value: 'Framer 1a2b' },
      { layer: 'http', kind: 'meta', key: 'og:title', value: 'Acme & Co' },
      {
        layer: 'http',
        kind: 'link-href',
        key: 'preconnect',
        value: 'https://abcdefghijklmnopqrst.supabase.co',
      },
      { layer: 'http', kind: 'link-href', key: 'stylesheet', value: '/_next/static/css/app.css' },
      { layer: 'http', kind: 'script-src', value: '/_next/static/chunks/main.js' },
    ]);
    expect(signals.every((s) => s.source === 'https://acme.test/')).toBe(true);
  });

  test('does not parse bodies that are not HTML', () => {
    const signals = responseSignals(
      page('https://acme.test/', [['content-type', 'application/json']], '<script src="/x.js">'),
    );
    expect(signals.map((s) => s.kind)).toEqual(['header']);
  });
});

describe('distillHtml', () => {
  test('keeps the tags the layer reads and drops all page content', () => {
    const distilled = distillHtml(html);
    expect(distilled).not.toContain('Welcome');
    expect(distilled).not.toContain('inline content');
    expect(distilled).toContain('<script src="/_next/static/chunks/main.js" async=""></script>');
    expect(distilled).toContain('<meta property="og:title" content="Acme &amp; Co">');
  });

  test('yields the same signals as the original page', () => {
    const headers: [string, string][] = [['content-type', 'text/html']];
    expect(responseSignals(page('https://a.test/', headers, distillHtml(html)))).toEqual(
      responseSignals(page('https://a.test/', headers, html)),
    );
  });
});

describe('httpLayer', () => {
  const surface = surfaceTarget('acme.test');

  test('follows redirects and reports only the final response', async () => {
    const net = netFrom({
      'https://acme.test/': redirect('https://acme.test/', 'https://www.acme.test/'),
      'https://www.acme.test/': redirect('https://www.acme.test/', '/en', 308),
      'https://www.acme.test/en': page('https://www.acme.test/en', [['server', 'Vercel']]),
    });
    const result = await runLayer(httpLayer, surface, { net });
    expect(result.run.status).toBe('ok');
    expect(net.requested).toEqual([
      'https://acme.test/',
      'https://www.acme.test/',
      'https://www.acme.test/en',
    ]);
    expect(result.signals).toEqual([
      {
        layer: 'http',
        kind: 'header',
        key: 'server',
        value: 'Vercel',
        source: 'https://www.acme.test/en',
      },
    ]);
  });

  test('gives up after too many redirects', async () => {
    const net = netFrom({ 'https://acme.test/': redirect('https://acme.test/', '/') });
    const result = await runLayer(httpLayer, surface, { net });
    expect(result.run.error).toMatchObject({
      code: 'HTTP_STATUS',
      message: expect.stringContaining('redirects'),
    });
  });

  test('refuses redirects to other schemes', async () => {
    const net = netFrom({
      'https://acme.test/': redirect('https://acme.test/', 'file:///etc/passwd'),
    });
    const result = await runLayer(httpLayer, surface, { net });
    expect(result.run.error?.code).toBe('HTTP_STATUS');
  });

  test('passes on network errors with their code', async () => {
    const result = await runLayer(httpLayer, surface, { net: netFrom({}) });
    expect(result.run).toMatchObject({ status: 'failed', error: { code: 'CONNECT_FAILED' } });
  });
});
