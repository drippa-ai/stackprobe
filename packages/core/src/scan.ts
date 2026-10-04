import { detect } from './detect.ts';
import { discoverSurfaces } from './discover.ts';
import type { CompiledFingerprint } from './fingerprint.ts';
import { builtinFingerprints, FINGERPRINTS_VERSION } from './fingerprints/index.ts';
import type { Layer, Signal, SurfaceTarget } from './layer.ts';
import { DEFAULT_LAYERS } from './layers/index.ts';
import type { Net } from './net.ts';
import type { Report } from './report.ts';
import { type LayerResult, runLayers } from './runner.ts';
import { surfaceTarget } from './surface.ts';

// A scan stops after this long; layers still running are reported as timed out.
export const SCAN_BUDGET_MS = 90_000;

export interface SurfaceResults {
  target: SurfaceTarget;
  results: LayerResult[];
}

export interface BuildReportInput {
  domain: string;
  scannedAt: Date;
  surfaces: SurfaceResults[];
  fingerprints?: CompiledFingerprint[];
  fingerprintsVersion?: string;
}

// Turns raw layer results into the report. Pure, so a runner can collect results however it
// likes (in-process, one workflow step per layer) and build the report at the end.
export function buildReport(input: BuildReportInput): Report {
  const fingerprints = input.fingerprints ?? builtinFingerprints();
  return {
    schemaVersion: '1',
    domain: input.domain,
    scannedAt: input.scannedAt.toISOString(),
    fingerprintsVersion: input.fingerprintsVersion ?? FINGERPRINTS_VERSION,
    surfaces: input.surfaces.map(({ target, results }) => ({
      id: target.id,
      url: target.url,
      kind: target.kind,
      kindConfidence: null,
      ...(target.foundBy ? { foundBy: target.foundBy } : {}),
      detections: detect(
        results.flatMap((result) => result.signals),
        fingerprints,
      ),
    })),
    layersRun: input.surfaces.flatMap(({ results }) => results.map((result) => result.run)),
  };
}

// 'partial' when any layer failed or timed out: the report is still useful, just incomplete.
export function reportStatus(report: Report): 'done' | 'partial' {
  const incomplete = report.layersRun.some(
    (run) => run.status === 'failed' || run.status === 'timeout',
  );
  return incomplete ? 'partial' : 'done';
}

export interface ScanOptions {
  net: Net;
  layers?: Layer[];
  signal?: AbortSignal;
  now?: () => Date;
  onSignal?: (signal: Signal) => void;
  // Called with each layer's raw result as soon as it is in, e.g. to store it.
  onLayerResult?: (result: LayerResult) => void | Promise<void>;
  // Look for the domain's other surfaces (links, common subdomains). On by default.
  discover?: boolean;
}

// The layers to run on each surface: everything on the first surface of each host, and only the
// per-page layer (HTTP) on further paths of a host already covered, since DNS and TLS are per host.
export function layersForSurfaces(
  surfaces: SurfaceTarget[],
  layers: Layer[] = DEFAULT_LAYERS,
  coveredHosts: Iterable<string> = [],
): Map<string, Layer[]> {
  const covered = new Set(coveredHosts);
  const plan = new Map<string, Layer[]>();
  for (const surface of surfaces) {
    plan.set(
      surface.id,
      covered.has(surface.host) ? layers.filter((layer) => layer.id === 'http') : layers,
    );
    covered.add(surface.host);
  }
  return plan;
}

// Scans one domain or URL in-process: the page asked for, then the other surfaces it leads to.
// The hosted runner uses the same pieces (runLayer per step, discoverSurfaces, buildReport).
export async function scan(input: string, options: ScanOptions): Promise<Report> {
  const target = surfaceTarget(input);
  const scannedAt = options.now?.() ?? new Date();
  const layers = options.layers ?? DEFAULT_LAYERS;
  const runOptions = {
    net: options.net,
    signal: options.signal ?? AbortSignal.timeout(SCAN_BUDGET_MS),
    ...(options.onSignal ? { onSignal: options.onSignal } : {}),
  };
  const run = async (surface: SurfaceTarget, surfaceLayers: Layer[]) => {
    const results = await runLayers(surfaceLayers, surface, runOptions);
    for (const result of results) await options.onLayerResult?.(result);
    return { target: surface, results };
  };

  const root = await run(target, layers);
  const found =
    options.discover === false
      ? []
      : await discoverSurfaces(
          target,
          root.results.flatMap((result) => result.signals),
          runOptions,
        );
  const plan = layersForSurfaces(found, layers, [target.host]);
  const others = await Promise.all(
    found.map((surface) => run(surface, plan.get(surface.id) ?? [])),
  );
  return buildReport({ domain: target.host, scannedAt, surfaces: [root, ...others] });
}
