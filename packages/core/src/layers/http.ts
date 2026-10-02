import { Parser } from 'htmlparser2';
import { type Layer, LayerError, type Signal } from '../layer.ts';
import type { HttpResponse } from '../net.ts';

const MAX_REDIRECTS = 5;

// Layer 1: fetches the surface like a browser's first request would and reports its headers,
// cookie names and the tags in its HTML that reveal a stack.
export const httpLayer: Layer = {
  id: 'http',
  timeoutMs: 10_000,
  appliesTo: () => true,
  async run(surface, ctx) {
    let url = surface.url;
    for (let redirects = 0; ; redirects++) {
      const response = await ctx.net.http(
        { url, method: 'GET', headers: { accept: 'text/html,*/*;q=0.8' } },
        ctx.signal,
      );
      const location = headerValue(response, 'location');
      if (response.status >= 300 && response.status < 400 && location) {
        if (redirects === MAX_REDIRECTS) {
          throw new LayerError(
            'HTTP_STATUS',
            `More than ${MAX_REDIRECTS} redirects from ${surface.url}`,
          );
        }
        url = nextUrl(location, url);
        continue;
      }
      for (const signal of responseSignals(response)) ctx.emit(signal);
      return;
    }
  },
};

// Error pages are reported too: a 404 from a framework says as much as a 200.
export function responseSignals(response: HttpResponse): Signal[] {
  const signals: Signal[] = [];
  const source = response.url;
  for (const [name, value] of response.headers) {
    if (name === 'set-cookie') {
      const cookieName = value.split('=', 1)[0]?.trim();
      if (cookieName)
        signals.push({ layer: 'http', kind: 'cookie-name', value: cookieName, source });
    } else {
      signals.push({ layer: 'http', kind: 'header', key: name, value, source });
    }
  }
  if (isHtml(response)) {
    readTags(response.body, (tag, attributes) => {
      const signal = tagSignal(tag, attributes);
      if (signal) signals.push({ ...signal, source });
    });
  }
  return signals;
}

// Keeps only the tags this layer reads, so recorded fixtures hold no page content.
export function distillHtml(html: string): string {
  const lines: string[] = [];
  readTags(html, (tag, attributes) => {
    const attrs = Object.entries(attributes)
      .map(
        ([name, value]) => ` ${name}="${value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`,
      )
      .join('');
    lines.push(tag === 'script' ? `<script${attrs}></script>` : `<${tag}${attrs}>`);
  });
  return lines.join('\n');
}

export function isHtml(response: HttpResponse): boolean {
  return /\bhtml\b/i.test(headerValue(response, 'content-type') ?? '');
}

type Attributes = Record<string, string>;

function readTags(html: string, onTag: (tag: string, attributes: Attributes) => void): void {
  const parser = new Parser(
    {
      onopentag(tag, attributes) {
        if (
          tag === 'meta' ||
          (tag === 'script' && attributes.src) ||
          (tag === 'link' && attributes.href)
        ) {
          onTag(tag, attributes);
        }
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
}

function tagSignal(tag: string, attributes: Attributes): Omit<Signal, 'source'> | null {
  if (tag === 'script' && attributes.src) {
    return { layer: 'http', kind: 'script-src', value: attributes.src };
  }
  if (tag === 'link' && attributes.href) {
    const rel = attributes.rel?.toLowerCase();
    return {
      layer: 'http',
      kind: 'link-href',
      value: attributes.href,
      ...(rel ? { key: rel } : {}),
    };
  }
  const name = attributes.name ?? attributes.property ?? attributes['http-equiv'];
  if (tag === 'meta' && name) {
    return {
      layer: 'http',
      kind: 'meta',
      key: name.toLowerCase(),
      value: attributes.content ?? '',
    };
  }
  return null;
}

function headerValue(response: HttpResponse, name: string): string | undefined {
  return response.headers.find(([key]) => key === name)?.[1];
}

function nextUrl(location: string, base: string): string {
  let next: URL;
  try {
    next = new URL(location, base);
  } catch {
    throw new LayerError('HTTP_STATUS', `Invalid redirect to ${location}`);
  }
  if (next.protocol !== 'https:' && next.protocol !== 'http:') {
    throw new LayerError('HTTP_STATUS', `Redirect to unsupported URL ${next.href}`);
  }
  return next.href;
}
