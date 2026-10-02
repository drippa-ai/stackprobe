import { describe, expect, test } from 'vitest';
import { type Layer, LayerError, type SurfaceTarget } from './layer.ts';
import type { Net } from './net.ts';
import { runLayer, runLayers } from './runner.ts';

const surface: SurfaceTarget = {
  id: 's1',
  url: 'https://example.com/',
  host: 'example.com',
  kind: 'unclassified',
};

const net: Net = {
  http: () => Promise.reject(new Error('no network in tests')),
  dns: () => Promise.reject(new Error('no network in tests')),
  tls: () => Promise.reject(new Error('no network in tests')),
};

function layer(run: Layer['run'], overrides: Partial<Layer> = {}): Layer {
  return { id: 'http', timeoutMs: 1000, appliesTo: () => true, run, ...overrides };
}

const header = { layer: 'http', kind: 'header', key: 'server', value: 'Vercel' } as const;

describe('runLayer', () => {
  test('collects signals from a layer that succeeds', async () => {
    const seen: unknown[] = [];
    const result = await runLayer(
      layer(async (_, ctx) => ctx.emit(header)),
      surface,
      { net, onSignal: (s) => seen.push(s) },
    );
    expect(result.run).toMatchObject({ layer: 'http', surfaceId: 's1', status: 'ok' });
    expect(result.run.error).toBeUndefined();
    expect(result.signals).toEqual([header]);
    expect(seen).toEqual([header]);
  });

  test('skips a layer that does not apply to the surface', async () => {
    let ran = false;
    const result = await runLayer(
      layer(
        async () => {
          ran = true;
        },
        { appliesTo: () => false },
      ),
      surface,
      { net },
    );
    expect(result.run).toMatchObject({ status: 'skipped', durationMs: 0 });
    expect(ran).toBe(false);
  });

  test('reports the code of a LayerError and keeps earlier signals', async () => {
    const result = await runLayer(
      layer(async (_, ctx) => {
        ctx.emit(header);
        throw new LayerError('DNS_NXDOMAIN', 'no such domain');
      }),
      surface,
      { net },
    );
    expect(result.run).toMatchObject({
      status: 'failed',
      error: { code: 'DNS_NXDOMAIN', message: 'no such domain' },
    });
    expect(result.signals).toEqual([header]);
  });

  test('reports unexpected errors as INTERNAL', async () => {
    const result = await runLayer(
      layer(async () => {
        throw new TypeError('boom');
      }),
      surface,
      { net },
    );
    expect(result.run).toMatchObject({
      status: 'failed',
      error: { code: 'INTERNAL', message: 'boom' },
    });
  });

  test('times out a layer that ignores its abort signal, keeping partial signals', async () => {
    const result = await runLayer(
      layer(
        (_, ctx) => {
          ctx.emit(header);
          setTimeout(() => ctx.emit({ ...header, value: 'late' }), 100);
          return new Promise(() => {});
        },
        { timeoutMs: 20 },
      ),
      surface,
      { net },
    );
    expect(result.run).toMatchObject({ status: 'timeout', error: { code: 'TIMEOUT' } });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(result.signals).toEqual([header]);
  });

  test('stops when the scan budget runs out', async () => {
    const scan = new AbortController();
    const pending = runLayer(
      layer(() => new Promise(() => {})),
      surface,
      { net, signal: scan.signal },
    );
    scan.abort();
    expect((await pending).run.status).toBe('timeout');
  });
});

describe('runLayers', () => {
  test('runs every layer and returns one result each', async () => {
    const results = await runLayers(
      [
        layer(async (_, ctx) => ctx.emit(header)),
        layer(
          async () => {
            throw new LayerError('TLS_HANDSHAKE', 'bad cert');
          },
          { id: 'tls' },
        ),
      ],
      surface,
      { net },
    );
    expect(results.map((r) => [r.run.layer, r.run.status])).toEqual([
      ['http', 'ok'],
      ['tls', 'failed'],
    ]);
  });
});
