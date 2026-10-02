import { type Layer, LayerError, type Signal, type SurfaceTarget } from './layer.ts';
import type { Net } from './net.ts';
import type { LayerRun } from './report.ts';

export interface RunOptions {
  net: Net;
  // The scan's overall budget. Each layer also gets its own timeout.
  signal?: AbortSignal;
  onSignal?: (signal: Signal) => void;
}

export interface LayerResult {
  run: LayerRun;
  // Kept even when the layer fails or times out: partial beats failed.
  signals: Signal[];
}

// Runs one layer on one surface. Never throws; failures are reported in `run`.
// The hosted runner calls this once per workflow step.
export async function runLayer(
  layer: Layer,
  surface: SurfaceTarget,
  options: RunOptions,
): Promise<LayerResult> {
  const signals: Signal[] = [];
  const base = { layer: layer.id, surfaceId: surface.id };

  if (!layer.appliesTo(surface)) {
    return { run: { ...base, status: 'skipped', durationMs: 0 }, signals };
  }

  const timeout = AbortSignal.timeout(layer.timeoutMs);
  const abort = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let settled = false;
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);

  const emit = (signal: Signal) => {
    if (settled) return;
    signals.push(signal);
    options.onSignal?.(signal);
  };

  // A layer that ignores its abort signal must not hold up the scan.
  let onAbort = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(abort.reason);
    if (abort.aborted) onAbort();
    abort.addEventListener('abort', onAbort, { once: true });
  });
  aborted.catch(() => {});

  try {
    await Promise.race([layer.run(surface, { net: options.net, signal: abort, emit }), aborted]);
    return { run: { ...base, status: 'ok', durationMs: elapsed() }, signals };
  } catch (error) {
    if (abort.aborted) {
      const message = `${layer.id} layer stopped after ${elapsed()} ms`;
      return {
        run: {
          ...base,
          status: 'timeout',
          durationMs: elapsed(),
          error: { code: 'TIMEOUT', message },
        },
        signals,
      };
    }
    const code = error instanceof LayerError ? error.code : 'INTERNAL';
    const message = error instanceof Error ? error.message : String(error);
    return {
      run: { ...base, status: 'failed', durationMs: elapsed(), error: { code, message } },
      signals,
    };
  } finally {
    settled = true;
    abort.removeEventListener('abort', onAbort);
  }
}

export function runLayers(
  layers: Layer[],
  surface: SurfaceTarget,
  options: RunOptions,
): Promise<LayerResult[]> {
  return Promise.all(layers.map((layer) => runLayer(layer, surface, options)));
}
