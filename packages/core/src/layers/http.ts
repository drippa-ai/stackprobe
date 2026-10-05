import { Parser } from 'htmlparser2';
import { type Layer, LayerError, type Signal } from '../layer.ts';
import type { HttpResponse } from '../net.ts';

const MAX_REDIRECTS = 5;
// Pages with huge menus would bloat recordings; the links that matter come early anyway.
const MAX_ANCHORS = 300;
const MAX_ANCHOR_TEXT = 100;

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
  const source = response.url;
  const signals: Signal[] = [
    { layer: 'http', kind: 'http-status', value: String(response.status), source },
  ];
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
      const signal = tagSignal(tag, attributes, response.url);
      if (signal) signals.push({ ...signal, source });
    });
  }
  return signals;
}

// Keeps only the tags this layer reads (and the text of links), so recorded fixtures hold no
// other page content.
export function distillHtml(html: string): string {
  const lines: string[] = [];
  readTags(html, (tag, attributes) => {
    const attrs = Object.entries(attributes)
      .map(
        ([name, value]) => ` ${name}="${value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`,
      )
      .join('');
    if (tag === 'a') {
      lines.push(
        `<a href="${escapeHtml(attributes.href ?? '', true)}">${escapeHtml(attributes.text ?? '')}</a>`,
      );
    } else {
      lines.push(tag === 'script' ? `<script${attrs}></script>` : `<${tag}${attrs}>`);
    }
  });
  return lines.join('\n');
}

export function isHtml(response: HttpResponse): boolean {
  return /\bhtml\b/i.test(headerValue(response, 'content-type') ?? '');
}

type Attributes = Record<string, string>;

function escapeHtml(value: string, attribute = false): string {
  const text = value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return attribute ? text.replaceAll('"', '&quot;') : text;
}

// Calls onTag for meta, script and link tags, and for links (`a`) with their text as `text`.
function readTags(html: string, onTag: (tag: string, attributes: Attributes) => void): void {
  let anchor: { href: string; text: string } | null = null;
  const anchors = new Set<string>();
  const parser = new Parser(
    {
      onopentag(tag, attributes) {
        if (
          tag === 'meta' ||
          (tag === 'script' && attributes.src) ||
          (tag === 'link' && attributes.href)
        ) {
          onTag(tag, attributes);
        } else if (tag === 'a' && attributes.href && !anchor) {
          anchor = { href: attributes.href, text: '' };
        }
      },
      ontext(text) {
        if (anchor) anchor.text += text;
      },
      onclosetag(tag) {
        if (tag !== 'a' || !anchor) return;
        const text = anchor.text.replace(/\s+/g, ' ').trim().slice(0, MAX_ANCHOR_TEXT);
        const key = `${anchor.href} ${text}`;
        if (!anchors.has(key) && anchors.size < MAX_ANCHORS) {
          anchors.add(key);
          onTag('a', { href: anchor.href, text });
        }
        anchor = null;
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
}

function tagSignal(
  tag: string,
  attributes: Attributes,
  base: string,
): Omit<Signal, 'source'> | null {
  if (tag === 'a' && attributes.href) {
    const href = absoluteLink(attributes.href, base);
    if (!href) return null;
    return {
      layer: 'http',
      kind: 'anchor',
      value: href,
      ...(attributes.text ? { key: attributes.text } : {}),
    };
  }
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

// Web links only, made absolute. Skips mailto:, javascript:, in-page anchors and the like.
function absoluteLink(href: string, base: string): string | null {
  if (href.startsWith('#')) return null;
  try {
    const url = new URL(href, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
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
