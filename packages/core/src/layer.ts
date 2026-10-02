import type { Net } from './net.ts';
import type { LayerErrorCode, LayerId, SurfaceKind } from './report.ts';

export type SignalKind =
  | 'header'
  | 'cookie-name'
  | 'meta'
  | 'script-src'
  | 'link-href'
  | 'a'
  | 'aaaa'
  | 'cname'
  | 'ns'
  | 'mx'
  | 'txt'
  | 'cert-issuer'
  | 'asn'
  | 'request-url'
  | 'request-header'
  | 'websocket-url'
  | 'window-global';

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
