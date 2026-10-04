import { type Browser, browserLayer } from './browser.ts';
import { type Classification, classifySurfaces, type Decider } from './classify.ts';
import { detect } from './detect.ts';
import { discoverSurfaces } from './discover.ts';
import type { CompiledFingerprint } from './fingerprint.ts';
import { builtinFingerprints, FINGERPRINTS_VERSION } from './fingerprints/index.ts';
import type { Layer, Signal, SurfaceTarget } from './layer.ts';
import { bundleLayer, firstPartyScripts } from './layers/bundle.ts';
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
  // From classifySurfaces, by surface id. Surfaces without one stay as their target says.
  classifications?: Record<string, Classification>;
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
      kind: input.classifications?.[target.id]?.kind ?? target.kind,
      kindConfidence: input.classifications?.[target.id]?.confidence ?? null,
      ...(input.classifications?.[target.id]?.reasons.length
        ? { kindReasons: input.classifications[target.id]?.reasons }
        : {}),
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
  // Settles what kind a surface is when the rules can't. Without one, rules only.
  decider?: Decider;
  // Loads the product app (and an unclassified homepage) in a real browser. Without one, the
  // browser layer is skipped.
  browser?: Browser;
}

// At most this many surfaces get the deep layers (scripts, browser) per scan.
export const MAX_DEEP_SURFACES = 3;

// The surfaces worth the deep layers: the product app first (at most 2, most certain first), then
// the homepage when it could not be classified, since a product may live right there.
export function deepTargets(
  surfaces: { target: SurfaceTarget }[],
  classifications: Record<string, Classification>,
): SurfaceTarget[] {
  const apps = surfaces
    .filter(({ target }) => classifications[target.id]?.kind === 'app')
    .sort(
      (a, b) =>
        (classifications[b.target.id]?.confidence ?? 0) -
        (classifications[a.target.id]?.confidence ?? 0),
    )
    .slice(0, 2)
    .map(({ target }) => target);
  const root = surfaces[0]?.target;
  const rootOpen = root && (classifications[root.id]?.kind ?? 'unclassified') === 'unclassified';
  return [...apps, ...(rootOpen ? [root] : [])].slice(0, MAX_DEEP_SURFACES);
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
  const surfaces = [root, ...others];
  const classifications = await classifySurfaces(
    surfaces,
    options.decider ? { decider: options.decider } : {},
  );
  // The deep layers, only where the product may be: its own scripts, and a real browser.
  await Promise.all(
    deepTargets(surfaces, classifications).map(async (surface) => {
      const own = surfaces.find((s) => s.target.id === surface.id);
      if (!own) return;
      const signals = own.results.flatMap((result) => result.signals);
      const deep = [
        bundleLayer(firstPartyScripts(signals, surface.url)),
        ...(options.browser ? [browserLayer(options.browser)] : []),
      ];
      const results = await runLayers(deep, surface, runOptions);
      for (const result of results) await options.onLayerResult?.(result);
      own.results.push(...results);
    }),
  );
  return buildReport({ domain: target.host, scannedAt, surfaces, classifications });
}
