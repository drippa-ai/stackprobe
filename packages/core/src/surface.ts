import type { SurfaceTarget } from './layer.ts';

// Turns what a user typed ("example.com", "https://app.example.com/login") into a surface.
// Until surface discovery exists, a scanned URL is never claimed to be the product app.
export function surfaceTarget(input: string, id = 'root'): SurfaceTarget {
  const trimmed = input.trim();
  const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') {
    throw new TypeError(`Not a domain or URL: ${input}`);
  }
  url.hash = '';
  return { id, url: url.href, host: url.hostname, kind: 'unclassified' };
}
