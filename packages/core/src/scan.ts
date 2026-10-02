import { detect } from './detect.ts';
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
}

// Scans one domain or URL in-process. The hosted runner uses the same pieces
// (runLayer per step, then buildReport) instead.
export async function scan(input: string, options: ScanOptions): Promise<Report> {
  const target = surfaceTarget(input);
  const scannedAt = options.now?.() ?? new Date();
  const results = await runLayers(options.layers ?? DEFAULT_LAYERS, target, {
    net: options.net,
    signal: options.signal ?? AbortSignal.timeout(SCAN_BUDGET_MS),
    ...(options.onSignal ? { onSignal: options.onSignal } : {}),
  });
  return buildReport({ domain: target.host, scannedAt, surfaces: [{ target, results }] });
}
