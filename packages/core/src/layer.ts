import type { Net } from './net.ts';
import type { LayerErrorCode, LayerId, SurfaceFoundBy, SurfaceKind } from './report.ts';

export const SIGNAL_KINDS = [
  'header',
  'cookie-name',
  'meta',
  'script-src',
  'link-href',
  // A link on the page: the absolute URL, with its text as the key. For finding other surfaces.
  'anchor',
  'a',
  'aaaa',
  'cname',
  'ns',
  'mx',
  'txt',
  'cert-issuer',
  'asn',
  'request-url',
  'request-header',
  'websocket-url',
  'window-global',
] as const;

export type SignalKind = (typeof SIGNAL_KINDS)[number];

// A raw observation. Layers emit signals; the fingerprint engine turns them into evidence.
export interface Signal {
  layer: LayerId;
  kind: SignalKind;
  key?: string;
  // Sensitive values (keys, tokens, cookie values) are redacted before a signal is emitted.
  value: string;
  source?: string;
}

export interface SurfaceTarget {
  id: string;
  url: string;
  host: string;
  kind: SurfaceKind;
  // How the scan came to this surface. Absent means it is what the user asked for.
  foundBy?: SurfaceFoundBy;
}

export interface LayerContext {
  net: Net;
  signal: AbortSignal;
  emit(signal: Signal): void;
}

export interface Layer {
  id: LayerId;
  timeoutMs: number;
  appliesTo(surface: SurfaceTarget): boolean;
  run(surface: SurfaceTarget, ctx: LayerContext): Promise<void>;
}

export class LayerError extends Error {
  readonly code: LayerErrorCode;

  constructor(code: LayerErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LayerError';
    this.code = code;
  }
}
